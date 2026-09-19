import { ApiError, NetworkError, TimeoutError } from "./errors";
import type {
  BeforeRequestContext,
  FetchLike,
  HttpHooks,
  HttpMethod,
  JsonObject,
  JsonValue,
  MultipartFile,
  MultipartInput,
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
    const maxAttempts = Math.max(1, retry?.maxAttempts ?? 1);
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const context = this.createBeforeRequestContext(url, options.path, method, options, attempt);
      await runHooks(this.hooks?.beforeRequest, context);

      const { signal, dispose, didTimeout } = withTimeout(options.signal, timeoutMs);
      const init = buildRequestInit(context, signal, options.multipart);

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

          if (
            await shouldRetry({
              retry,
              attempt,
              maxAttempts,
              method,
              url,
              status: response.status,
              error: apiError,
              response,
              responseBody,
            })
          ) {
            await sleep(retry, getRetryDelayMs(retry, attempt, response));
            continue;
          }

          throw apiError;
        }

        return responseBody as T;
      } catch (error) {
        const resolvedError = classifyError(error, url, didTimeout(), options.signal);

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
          await sleep(retry, getRetryDelayMs(retry, attempt));
          continue;
        }

        throw resolvedError;
      } finally {
        dispose();
      }
    }

    throw new NetworkError(`Unreachable retry state for ${url}`);
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
      body: options.multipart ?? options.body,
      attempt,
    };
  }
}

function withTimeout(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): { signal: AbortSignal | undefined; dispose: () => void; didTimeout: () => boolean } {
  if (!timeoutMs || timeoutMs <= 0) {
    return { signal: callerSignal, dispose: () => {}, didTimeout: () => false };
  }

  const controller = new AbortController();
  let timedOut = false;

  const handle = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onCallerAbort = () => controller.abort(callerSignal?.reason);

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(handle);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

function classifyError(
  error: unknown,
  url: string,
  timedOut: boolean,
  callerSignal: AbortSignal | undefined,
): unknown {
  if (timedOut) {
    return new TimeoutError(`Request timed out for ${url}`, { cause: error });
  }

  if (callerSignal?.aborted) {
    return error;
  }

  if (error instanceof TypeError) {
    return new NetworkError(`Request failed for ${url}`, { cause: error });
  }

  return error;
}

async function parseResponseBody(
  response: Response,
  contentType: string,
): Promise<JsonValue | JsonObject | null> {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  if (contentType.includes("application/json") || contentType.includes("+json")) {
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

function buildRequestInit(
  context: BeforeRequestContext,
  signal: AbortSignal | undefined,
  multipart?: MultipartInput,
): RequestInit {
  const init: RequestInit = {
    method: context.method,
    headers: context.headers,
    signal,
  };

  if (multipart !== undefined) {
    context.headers.delete("content-type");
    init.body = buildFormData(
      (context.body as MultipartInput | undefined) ?? multipart,
    );

    return init;
  }

  if (context.body !== undefined) {
    init.body = serializeBody(context.body, context.headers);
  }

  return init;
}

export function buildFormData(input: MultipartInput): FormData {
  const form = new FormData();

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        appendFormValue(form, `${key}[]`, item);
      }

      continue;
    }

    appendFormValue(form, key, value);
  }

  return form;
}

function appendFormValue(
  form: FormData,
  name: string,
  value: string | number | boolean | MultipartFile | Blob,
): void {
  if (value instanceof Blob) {
    form.append(name, value);
    return;
  }

  if (typeof value === "object" && value !== null && "content" in value) {
    const file = value;
    const blob =
      file.content instanceof Blob
        ? file.content
        : new Blob([toBlobPart(file.content)], {
            type: file.contentType ?? "application/octet-stream",
          });

    if (file.filename) {
      form.append(file.name ?? name, blob, file.filename);
    } else {
      form.append(file.name ?? name, blob);
    }

    return;
  }

  form.append(name, String(value));
}

function toBlobPart(content: string | ArrayBuffer | ArrayBufferView): BlobPart {
  if (typeof content === "string" || content instanceof ArrayBuffer) {
    return content;
  }

  return new Uint8Array(
    content.buffer as ArrayBuffer,
    content.byteOffset,
    content.byteLength,
  );
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

  for (const key of ["errorMessage", "detail", "message", "statusMessage", "ResponseDescription"]) {
    const value = objectBody[key];

    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return `Request failed with status ${status}`;
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
  response?: Response;
  responseBody?: unknown;
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
    const isTransport = input.error instanceof TimeoutError || input.error instanceof NetworkError;

    if (!isTransport || input.retry.retryOnNetworkError !== true) {
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
      response: input.response,
      responseBody: input.responseBody,
    });
  }

  return true;
}

function getRetryDelayMs(
  retry: RetryPolicy | undefined,
  attempt: number,
  response?: Response,
): number {
  if (!retry) {
    return 0;
  }

  const maxDelayMs = retry.maxDelayMs ?? 60_000;

  if (retry.respectRetryAfter !== false && response) {
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));

    if (retryAfter !== undefined) {
      return Math.min(retryAfter, maxDelayMs);
    }
  }

  const baseDelayMs = retry.baseDelayMs ?? 0;
  const multiplier = retry.backoffMultiplier ?? 2;
  const computed = baseDelayMs * Math.max(1, multiplier ** Math.max(0, attempt - 1));
  const jitter = retry.jitterMs ? Math.random() * retry.jitterMs : 0;

  return Math.min(computed + jitter, maxDelayMs);
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }

  const value = header.trim();

  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return undefined;
  }

  return Math.max(0, timestamp - Date.now());
}

async function sleep(retry: RetryPolicy | undefined, ms: number): Promise<void> {
  if (retry?.sleep) {
    await retry.sleep(ms);
    return;
  }

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
