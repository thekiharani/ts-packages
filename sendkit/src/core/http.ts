import { ApiError, NetworkError, TimeoutError } from "./errors";
import type {
  AfterResponseContext,
  BeforeRequestContext,
  ErrorContext,
  FetchLike,
  HttpHooks,
  HttpMethod,
  HttpRequestOptions,
  JsonObject,
  JsonValue,
  RetryPolicy,
} from "./types";
import { appendPath, appendQuery, buildErrorMessage, getFetch, toJsonObject, trimTrailingSlash } from "./utils";

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

  async request<T>(options: HttpRequestOptions): Promise<T> {
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
        const resolvedError =
          controller?.signal.aborted === true
            ? new TimeoutError(`Request timed out for ${url}`, { cause: error })
            : error instanceof ApiError || error instanceof TimeoutError || error instanceof NetworkError
              ? error
              : new NetworkError(`Network request failed for ${url}`, { cause: error });

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
    options: HttpRequestOptions,
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
  retry?: RetryPolicy;
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

  if (input.retry.retryMethods?.length && !input.retry.retryMethods.includes(input.method)) {
    return false;
  }

  if (typeof input.retry.shouldRetry === "function") {
    return Boolean(
      await input.retry.shouldRetry({
        attempt: input.attempt,
        maxAttempts: input.maxAttempts,
        method: input.method,
        url: input.url,
        status: input.status,
        error: input.error,
      }),
    );
  }

  if (
    input.status !== undefined &&
    input.retry.retryOnStatuses?.length &&
    input.retry.retryOnStatuses.includes(input.status)
  ) {
    return true;
  }

  return Boolean(input.error && input.retry.retryOnNetworkError);
}

function getRetryDelayMs(retry: RetryPolicy | undefined, attempt: number): number {
  const baseDelayMs = retry?.baseDelayMs ?? 0;

  if (!baseDelayMs) {
    return 0;
  }

  const multiplier = retry?.backoffMultiplier ?? 2;
  const maxDelayMs = retry?.maxDelayMs ?? Number.POSITIVE_INFINITY;
  return Math.min(baseDelayMs * multiplier ** Math.max(0, attempt - 1), maxDelayMs);
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runHooks<TContext>(
  hooks:
    | ((context: TContext) => void | Promise<void>)
    | Array<(context: TContext) => void | Promise<void>>
    | undefined,
  context: TContext,
): Promise<void> {
  if (!hooks) {
    return;
  }

  const normalized = Array.isArray(hooks) ? hooks : [hooks];

  for (const hook of normalized) {
    await hook(context);
  }
}
