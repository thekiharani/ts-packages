import { assertBusinessSuccess, type BusinessStatusProvider } from "./business-status";
import { ConfigurationError } from "./errors";
import { HttpClient } from "./http";
import type {
  AccessTokenProvider,
  AmountNormalization,
  FetchLike,
  HttpHooks,
  HttpMethod,
  MultipartInput,
  ProviderRequestOptions,
  QueryParams,
  RetryPolicy,
} from "./types";

export interface ProviderClientConfig {
  baseUrl: string;
  provider: BusinessStatusProvider;
  tokens: AccessTokenProvider;
  fetch?: FetchLike;
  timeoutMs?: number;
  defaultHeaders?: HeadersInit;
  retry?: RetryPolicy | false;
  hooks?: HttpHooks;
  /** Throw `BusinessError` when the provider reports failure in a 200 body. */
  throwOnBusinessError?: boolean;
  amountNormalization?: AmountNormalization;
  /** Run published field rules before sending. Defaults to true where rules exist. */
  validate?: boolean;
}

export interface SendInput {
  path: string;
  method?: HttpMethod;
  body?: unknown;
  query?: QueryParams;
  multipart?: MultipartInput;
  options?: ProviderRequestOptions;
  /** Label used in a `BusinessError` message. Omit to skip the business check. */
  businessContext?: string;
}

/**
 * Shared plumbing for every provider client: token resolution, auth headers,
 * business-status enforcement, and the raw `authorized*` escape hatches.
 *
 * The escape hatches matter as much as the generated methods. No SDK tracks a
 * payment API perfectly, and a caller who needs an endpoint this package has not
 * wrapped should reach for `authorizedPost()` rather than abandoning the client.
 */
export abstract class ProviderClient {
  protected readonly http: HttpClient;
  protected readonly tokens: AccessTokenProvider;
  protected readonly provider: BusinessStatusProvider;
  protected readonly throwOnBusinessError: boolean;
  protected readonly amountNormalization: AmountNormalization;
  protected readonly validatePayloads: boolean;

  protected constructor(config: ProviderClientConfig) {
    this.http = new HttpClient({
      baseUrl: config.baseUrl,
      fetch: config.fetch,
      timeoutMs: config.timeoutMs,
      defaultHeaders: config.defaultHeaders,
      retry: config.retry,
      hooks: config.hooks,
    });

    this.tokens = config.tokens;
    this.provider = config.provider;
    this.throwOnBusinessError = config.throwOnBusinessError ?? false;
    this.amountNormalization = config.amountNormalization ?? "string";
    this.validatePayloads = config.validate ?? true;
  }

  /** Resolves an access token, honouring a per-request override. */
  async getAccessToken(forceRefresh = false): Promise<string> {
    return this.tokens.getAccessToken(forceRefresh);
  }

  /** Sends an authenticated POST to a path this package does not wrap. */
  async authorizedPost<T = unknown>(
    path: string,
    body?: unknown,
    options?: ProviderRequestOptions,
  ): Promise<T> {
    return this.send<T>({ path, method: "POST", body, options });
  }

  /** Sends an authenticated GET to a path this package does not wrap. */
  async authorizedGet<T = unknown>(
    path: string,
    query?: QueryParams,
    options?: ProviderRequestOptions,
  ): Promise<T> {
    return this.send<T>({ path, method: "GET", query, options });
  }

  async authorizedPut<T = unknown>(
    path: string,
    body?: unknown,
    options?: ProviderRequestOptions,
  ): Promise<T> {
    return this.send<T>({ path, method: "PUT", body, options });
  }

  async authorizedPatch<T = unknown>(
    path: string,
    body?: unknown,
    options?: ProviderRequestOptions,
  ): Promise<T> {
    return this.send<T>({ path, method: "PATCH", body, options });
  }

  async authorizedDelete<T = unknown>(
    path: string,
    body?: unknown,
    query?: QueryParams,
    options?: ProviderRequestOptions,
  ): Promise<T> {
    return this.send<T>({ path, method: "DELETE", body, query, options });
  }

  /** Sends an authenticated multipart POST to a path this package does not wrap. */
  async authorizedMultipartPost<T = unknown>(
    path: string,
    multipart: MultipartInput,
    options?: ProviderRequestOptions,
  ): Promise<T> {
    return this.send<T>({ path, method: "POST", multipart, options });
  }

  protected async send<T>(input: SendInput): Promise<T> {
    const options = input.options;
    const method = input.method ?? "POST";
    const token =
      options?.accessToken ?? (await this.tokens.getAccessToken(options?.forceTokenRefresh));

    const headers = new Headers(options?.headers);
    headers.set("authorization", `Bearer ${token}`);

    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }

    const response = await this.http.request<T>({
      path: input.path,
      method,
      headers,
      query: input.query,
      body: input.body,
      multipart: input.multipart,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
      retry: options?.retry,
    });

    if (options?.throwOnBusinessError ?? this.throwOnBusinessError) {
      assertBusinessSuccess(
        this.provider,
        response,
        input.businessContext ?? `${this.provider} ${method} ${input.path}`,
      );
    }

    return response;
  }

  protected resolveAmountNormalization(options?: ProviderRequestOptions): AmountNormalization {
    return options?.amountNormalization ?? this.amountNormalization;
  }

  protected shouldValidate(options?: ProviderRequestOptions): boolean {
    return options?.validate ?? this.validatePayloads;
  }
}

/** Merges caller-supplied endpoint overrides over a provider's defaults. */
export function resolveEndpoints<T extends Record<string, string>>(
  defaults: T,
  overrides?: Partial<Record<keyof T, string>>,
): T {
  if (!overrides) {
    return defaults;
  }

  const resolved = { ...defaults };

  for (const [name, path] of Object.entries(overrides)) {
    if (typeof path === "string" && path.trim() !== "") {
      resolved[name as keyof T] = path as T[keyof T];
    }
  }

  return resolved;
}

/**
 * Substitutes `{placeholder}` segments, URL-encoding each value.
 *
 * Names listed in `raw` are substituted verbatim. That is for the wildcard
 * resources — Buni's eTIMS and P2P gateways — whose placeholder stands in for a
 * whole path fragment, where encoding the separators would break the route.
 */
export function fillPath(
  template: string,
  replacements: Record<string, string | number>,
  options: { raw?: string[] } = {},
): string {
  let path = template;

  for (const [key, value] of Object.entries(replacements)) {
    const encoded = options.raw?.includes(key)
      ? String(value)
      : encodeURIComponent(String(value));

    path = path.replace(`{${key}}`, encoded);
  }

  const unresolved = /\{([^}]+)\}/.exec(path);

  if (unresolved) {
    throw new ConfigurationError(
      `Endpoint path [${template}] is missing a value for {${unresolved[1]}}.`,
    );
  }

  return path;
}

/** Fills keys the caller left out, without overwriting anything they supplied. */
export function withDefaults<T extends object>(
  payload: T,
  defaults: Record<string, string | number | undefined>,
): T {
  const entries = Object.entries(defaults).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    return payload;
  }

  const result = { ...payload } as Record<string, unknown>;

  for (const [key, value] of entries) {
    if (!(key in result) || result[key] === undefined) {
      result[key] = value;
    }
  }

  return result as T;
}
