import { ConfigurationError } from "../../core/errors";
import { HttpClient } from "../../core/http";
import { ClientCredentialsTokenProvider } from "../../core/oauth";
import { toAmountString } from "../../core/utils";
import type {
  SasaPayB2BRequest,
  SasaPayB2BResponse,
  SasaPayB2CRequest,
  SasaPayB2CResponse,
  SasaPayClientOptions,
  SasaPayProcessPaymentRequest,
  SasaPayProcessPaymentResponse,
  SasaPayRequestOptions,
  SasaPayRequestPaymentRequest,
  SasaPayRequestPaymentResponse,
} from "./types";

const SASAPAY_SANDBOX_BASE_URL = "https://sandbox.sasapay.app/api/v1";

export class SasaPayClient {
  private readonly http: HttpClient;
  private readonly tokens: { getAccessToken(forceRefresh?: boolean): Promise<string> };

  constructor(options: SasaPayClientOptions) {
    const baseUrl = resolveBaseUrl(options);

    this.http = new HttpClient({
      baseUrl,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs,
      defaultHeaders: options.defaultHeaders,
      retry: options.retry,
      hooks: options.hooks,
    });

    this.tokens = resolveSasaPayTokenProvider(options, baseUrl);
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    return this.tokens.getAccessToken(forceRefresh);
  }

  async requestPayment(
    request: SasaPayRequestPaymentRequest,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayRequestPaymentResponse> {
    return this.authorizedRequest("/payments/request-payment/", withAmount(request, ["Amount"]), options);
  }

  async processPayment(
    request: SasaPayProcessPaymentRequest,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayProcessPaymentResponse> {
    return this.authorizedRequest("/payments/process-payment/", request, options);
  }

  async b2cPayment(request: SasaPayB2CRequest, options?: SasaPayRequestOptions): Promise<SasaPayB2CResponse> {
    return this.authorizedRequest("/payments/b2c/", withAmount(request, ["Amount"]), options);
  }

  async b2bPayment(request: SasaPayB2BRequest, options?: SasaPayRequestOptions): Promise<SasaPayB2BResponse> {
    return this.authorizedRequest("/payments/b2b/", withAmount(request, ["Amount"]), options);
  }

  private async authorizedRequest<T extends Record<string, unknown>>(
    path: string,
    body: Record<string, unknown>,
    options?: SasaPayRequestOptions,
  ): Promise<T> {
    const token = options?.accessToken ?? (await this.tokens.getAccessToken(options?.forceTokenRefresh));
    const headers = new Headers(options?.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("accept", "application/json");

    return this.http.request<T>({
      path,
      method: "POST",
      headers,
      body,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
      retry: options?.retry,
    });
  }
}

function resolveBaseUrl(options: SasaPayClientOptions): string {
  if (options.baseUrl) {
    return options.baseUrl;
  }

  if ((options.environment ?? "sandbox") === "sandbox") {
    return SASAPAY_SANDBOX_BASE_URL;
  }

  throw new ConfigurationError(
    "SasaPay production baseUrl must be provided explicitly. The docs reviewed for April 3, 2026 clearly document the sandbox host but do not clearly state a production API host.",
  );
}

function resolveSasaPayTokenProvider(
  options: SasaPayClientOptions,
  baseUrl: string,
): { getAccessToken(forceRefresh?: boolean): Promise<string> } {
  if ("tokenProvider" in options && options.tokenProvider) {
    return options.tokenProvider;
  }

  if (!("clientId" in options) || !("clientSecret" in options) || !options.clientId || !options.clientSecret) {
    throw new ConfigurationError(
      "SasaPayClient requires either clientId and clientSecret, or a tokenProvider.",
    );
  }

  return new ClientCredentialsTokenProvider({
    tokenUrl: `${baseUrl}/auth/token/`,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
    query: { grant_type: "client_credentials" },
    cacheSkewMs: options.tokenCacheSkewMs,
    mapResponse: (payload) => ({
      accessToken: typeof payload["access_token"] === "string" ? payload["access_token"] : "",
      expiresIn: Number(payload["expires_in"] ?? 0),
      tokenType: typeof payload["token_type"] === "string" ? payload["token_type"] : undefined,
      scope: typeof payload["scope"] === "string" ? payload["scope"] : undefined,
      raw: payload,
    }),
  });
}

function withAmount<T extends object>(payload: T, amountFields: string[]): T {
  const normalized = { ...payload } as Record<string, unknown>;

  for (const field of amountFields) {
    const value = normalized[field];
    if (typeof value === "number" || typeof value === "string") {
      normalized[field] = toAmountString(value);
    }
  }

  return normalized as T;
}
