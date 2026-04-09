import { ApiError, TimeoutError } from "./errors";
import type {
  AfterResponseContext,
  BeforeRequestContext,
  ErrorContext,
  FetchLike,
  HttpHooks,
  HttpMethod,
  JsonObject,
  JsonValue,
  RequestOptions,
  RetryPolicy,
} from "./types";
import { appendPath, appendQuery, getFetch, toJsonObject, trimTrailingSlash } from "./utils";

export interface HttpClientOptions {
  baseUrl: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  defaultHeaders?: HeadersInit;
  retry?: RetryPolicy | false;
  hooks?: HttpHooks;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs?: number;
  private readonly defaultHeaders?: HeadersInit;
  private readonly retry?: RetryPolicy | false;
  private readonly hooks?: HttpHooks;

  constructor(options: HttpClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.fetchImpl = getFetch(options.fetch);
    this.timeoutMs = options.timeoutMs;
    this.defaultHeaders = options.defaultHeaders;
    this.retry = options.retry;
    this.hooks = options.hooks;
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const url = appendQuery(appendPath(this.baseUrl, options.path), options.query);
    const method = options.method ?? "GET";
    const retry = resolveRetryPolicy(this.retry, options.retry);
    const maxAttempts = retry ? retry.maxAttempts ?? 1 : 1;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const context = this.createBeforeRequestContext(url, options.path, method, options, attempt);
      await runHooks(this.hooks?.beforeRequest, context);

      const init = buildRequestInit(context, options.signal);
      let timeoutHandle: NodeJS.Timeout | undefined;
      let controller: AbortController | undefined;

      if (!options.signal && timeoutMs) {
        controller = new AbortController();
        init.signal = controller.signal;
        timeoutHandle = setTimeout(() => controller?.abort(), timeoutMs);
      }

      try {
        const response = await this.fetchImpl(url, init);
        const contentType = response.headers.get("content-type") ?? "";
        const responseBody = await parseResponseBody(response, contentType);

        await runHooks(this.hooks?.afterResponse, {
          ...context,
          response,
          responseBody,
        });

        if (!response.ok) {
          const apiError = new ApiError(buildErrorMessage(response.status, responseBody), {
            status: response.status,
            responseBody,
          });

          await runHooks(this.hooks?.onError, {
            ...context,
            error: apiError,
            response,
            responseBody,
          });

          if (await shouldRetry({ retry, attempt, maxAttempts, method, url, status: response.status })) {
            await delay(getRetryDelayMs(retry, attempt));
            continue;
          }

          throw apiError;
        }

        return responseBody as T;
      } catch (error) {
        const isTimeout = controller?.signal.aborted === true;
        const resolvedError = isTimeout
          ? new TimeoutError(`Request timed out for ${url}`, { cause: error })
          : error;

        await runHooks(this.hooks?.onError, {
          ...context,
          error: resolvedError,
        });

        if (
          await shouldRetry({
            retry,
            attempt,
            maxAttempts,
            method,
            url,
            error: resolvedError,
          })
        ) {
          await delay(getRetryDelayMs(retry, attempt));
          continue;
        }

        throw resolvedError;
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      }
    }

    throw new Error("Unreachable retry state.");
  }

  private createBeforeRequestContext(
    url: string,
    path: string,
    method: HttpMethod,
    options: RequestOptions,
    attempt: number,
  ): BeforeRequestContext {
    const headers = new Headers(this.defaultHeaders);

    if (options.headers) {
      new Headers(options.headers).forEach((value, key) => {
        headers.set(key, value);
      });
    }

    return {
      url,
      path,
      method,
      headers,
      body: options.body,
      attempt,
    };
  }
}

async function parseResponseBody(response: Response, contentType: string): Promise<JsonValue | JsonObject | null> {
  if (response.status === 204) {
    return null;
  }

  if (contentType.includes("application/json")) {
    return (await response.json()) as JsonValue | JsonObject;
  }

  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as JsonValue | JsonObject;
  } catch {
    return text;
  }
}

function buildRequestInit(context: BeforeRequestContext, signal?: AbortSignal): RequestInit {
  const init: RequestInit = {
    method: context.method,
    headers: context.headers,
    signal,
  };

  if (context.body !== undefined) {
    init.body = serializeBody(context.body, context.headers);
  }

  return init;
}

function serializeBody(body: unknown, headers: Headers): BodyInit {
  if (typeof body === "string") {
    if (!headers.has("content-type")) {
      headers.set("content-type", "text/plain;charset=UTF-8");
    }

    return body;
  }

  if (body instanceof URLSearchParams || body instanceof FormData || body instanceof Blob) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return body;
  }

  if (ArrayBuffer.isView(body)) {
    return body as unknown as BodyInit;
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return JSON.stringify(body);
}

function buildErrorMessage(status: number, responseBody: unknown): string {
  const objectBody = toJsonObject(responseBody);

  return typeof objectBody["errorMessage"] === "string"
    ? objectBody["errorMessage"]
    : typeof objectBody["detail"] === "string"
      ? objectBody["detail"]
      : typeof objectBody["message"] === "string"
        ? objectBody["message"]
        : `Request failed with status ${status}`;
}

function resolveRetryPolicy(
  defaultRetry: RetryPolicy | false | undefined,
  requestRetry: RetryPolicy | false | undefined,
): RetryPolicy | undefined {
  if (requestRetry === false) {
    return undefined;
  }

  if (defaultRetry === false) {
    return requestRetry || undefined;
  }

  if (!defaultRetry) {
    return requestRetry || undefined;
  }

  if (!requestRetry) {
    return defaultRetry;
  }

  return {
    ...defaultRetry,
    ...requestRetry,
  };
}

async function shouldRetry(input: {
  retry: RetryPolicy | undefined;
  attempt: number;
  maxAttempts: number;
  method: HttpMethod;
  url: string;
  status?: number;
  error?: unknown;
}): Promise<boolean> {
  if (!input.retry || input.attempt >= input.maxAttempts) {
    return false;
  }

  const allowedMethods = input.retry.retryMethods ?? [];
  if (allowedMethods.length > 0 && !allowedMethods.includes(input.method)) {
    return false;
  }

  if (input.status !== undefined) {
    const statuses = input.retry.retryOnStatuses ?? [];
    if (!statuses.includes(input.status)) {
      return false;
    }
  } else if (input.error !== undefined) {
    if (input.error instanceof TimeoutError) {
      if (input.retry.retryOnNetworkError === false) {
        return false;
      }
    } else if (input.retry.retryOnNetworkError !== true) {
      return false;
    }
  }

  if (input.retry.shouldRetry) {
    return input.retry.shouldRetry({
      attempt: input.attempt,
      maxAttempts: input.maxAttempts,
      method: input.method,
      url: input.url,
      status: input.status,
      error: input.error,
    });
  }

  return true;
}

function getRetryDelayMs(retry: RetryPolicy | undefined, attempt: number): number {
  if (!retry) {
    return 0;
  }

  const baseDelayMs = retry?.baseDelayMs ?? 0;
  const maxDelayMs = retry?.maxDelayMs ?? Number.POSITIVE_INFINITY;
  const multiplier = retry?.backoffMultiplier ?? 2;
  const computed = baseDelayMs * Math.max(1, multiplier ** Math.max(0, attempt - 1));
  return Math.min(computed, maxDelayMs);
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runHooks<TContext>(
  hook:
    | ((context: TContext) => void | Promise<void>)
    | Array<(context: TContext) => void | Promise<void>>
    | undefined,
  context: TContext,
): Promise<void> {
  const hooks = Array.isArray(hook) ? hook : hook ? [hook] : [];

  for (const current of hooks) {
    await current(context);
  }
}
