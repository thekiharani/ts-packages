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

export interface AccessTokenProvider {
  getAccessToken(forceRefresh?: boolean): Promise<string>;
}

export interface RetryDecisionContext {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly method: HttpMethod;
  readonly url: string;
  readonly status?: number;
  readonly error?: unknown;
}

export interface RetryPolicy {
  maxAttempts?: number;
  retryMethods?: HttpMethod[];
  retryOnStatuses?: number[];
  retryOnNetworkError?: boolean;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (context: RetryDecisionContext) => boolean | Promise<boolean>;
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
}

export interface RequestOptions {
  path: string;
  method?: HttpMethod;
  headers?: HeadersInit;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: RetryPolicy | false;
}
