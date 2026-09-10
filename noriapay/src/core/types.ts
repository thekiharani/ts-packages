export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | {
      [key: string]: JsonValue | undefined;
    };
export type JsonObject = {
  [key: string]: JsonValue | undefined;
};
export type FetchLike = typeof fetch;
export type NoriapayEnvironment = "sandbox" | "production";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * `"string"` serializes `Amount`/`amount` to a decimal string, which is what every
 * provider here documents. `"none"` sends the value exactly as supplied, for the
 * handful of endpoints that reject a quoted number.
 */
export type AmountNormalization = "string" | "none";

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface AccessTokenProvider {
  getAccessToken(forceRefresh?: boolean): Promise<string>;
}

/**
 * Somewhere to keep OAuth tokens that outlives the process — Redis, Memcached, a
 * database row. Without one, every worker and every serverless invocation
 * re-authenticates.
 */
export interface TokenStore {
  get(key: string): Promise<string | undefined> | string | undefined;
  set(key: string, value: string, ttlSeconds: number): Promise<void> | void;
  delete(key: string): Promise<void> | void;
}

export interface RetryDecisionContext {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly method: HttpMethod;
  readonly url: string;
  readonly status?: number;
  readonly error?: unknown;
  readonly response?: Response;
  readonly responseBody?: unknown;
}

export interface RetryPolicy {
  maxAttempts?: number;
  retryMethods?: HttpMethod[];
  retryOnStatuses?: number[];
  retryOnNetworkError?: boolean;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  /** Upper bound of the random delay added to each backoff, to de-synchronize retries. */
  jitterMs?: number;
  /** Honour a `Retry-After` header over the computed backoff. Defaults to true. */
  respectRetryAfter?: boolean;
  shouldRetry?: (context: RetryDecisionContext) => boolean | Promise<boolean>;
  /** Injectable sleep, so tests do not wait in real time. */
  sleep?: (ms: number) => Promise<void>;
}

export interface BeforeRequestContext {
  url: string;
  path: string;
  method: HttpMethod;
  headers: Headers;
  body: unknown;
  attempt: number;
}

export interface AfterResponseContext extends BeforeRequestContext {
  response: Response;
  responseBody: unknown;
}

export interface ErrorContext extends BeforeRequestContext {
  error: unknown;
  response?: Response;
  responseBody?: unknown;
}

export interface HttpHooks {
  beforeRequest?:
    | ((context: BeforeRequestContext) => void | Promise<void>)
    | Array<(context: BeforeRequestContext) => void | Promise<void>>;
  afterResponse?:
    | ((context: AfterResponseContext) => void | Promise<void>)
    | Array<(context: AfterResponseContext) => void | Promise<void>>;
  onError?:
    | ((context: ErrorContext) => void | Promise<void>)
    | Array<(context: ErrorContext) => void | Promise<void>>;
}

export interface ProviderRequestOptions {
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: RetryPolicy | false;
  accessToken?: string;
  forceTokenRefresh?: boolean;
  /** Overrides the client's amount handling for this call. */
  amountNormalization?: AmountNormalization;
  /** Overrides the client's payload validation for this call. */
  validate?: boolean;
  /** Overrides the client's business-error behavior for this call. */
  throwOnBusinessError?: boolean;
}

/** One part of a `multipart/form-data` body. */
export interface MultipartFile {
  /** Field name. Defaults to the map key when supplied through a record. */
  name?: string;
  filename?: string;
  contentType?: string;
  content: string | ArrayBuffer | ArrayBufferView | Blob;
}

export type MultipartInput = Record<
  string,
  | string
  | number
  | boolean
  | null
  | undefined
  | MultipartFile
  | Blob
  | Array<string | number | boolean | MultipartFile | Blob>
>;

export interface RequestOptions {
  path: string;
  method?: HttpMethod;
  headers?: HeadersInit;
  query?: QueryParams;
  body?: unknown;
  multipart?: MultipartInput;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: RetryPolicy | false;
}
