import { ConfigurationError } from "../../core/errors";
import { ClientCredentialsTokenProvider } from "../../core/oauth";
import { HttpClient } from "../../core/http";
import { getEnvEnvironment, getEnvNumber, getOptionalEnv, getRequiredEnv } from "../../core/config";
import { formatTimestamp, toAmountString } from "../../core/utils";
import type {
  MpesaRequestOptions,
  MpesaAccountBalanceRequest,
  MpesaApiResponse,
  MpesaB2BRequest,
  MpesaB2CRequest,
  MpesaC2BRegisterVersion,
  MpesaClientOptions,
  MpesaFromEnvOptions,
  MpesaQrCodeRequest,
  MpesaRegisterC2BUrlsRequest,
  MpesaReversalRequest,
  MpesaStkPushRequest,
  MpesaStkPushResponse,
  MpesaStkQueryRequest,
  MpesaTransactionStatusRequest,
} from "./types";

export const MPESA_BASE_URLS = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
} as const;

export function buildMpesaTimestamp(date: Date = new Date()): string {
  return formatTimestamp(date);
}

export function buildMpesaStkPassword(input: {
  businessShortCode: string;
  passkey: string;
  timestamp: string;
}): string {
  return Buffer.from(
    `${input.businessShortCode}${input.passkey}${input.timestamp}`,
    "utf8",
  ).toString("base64");
}

export class MpesaClient {
  static fromEnv(options: MpesaFromEnvOptions = {}): MpesaClient {
    const prefix = options.prefix ?? "MPESA_";
    const env = options.env;

    return new MpesaClient({
      environment: getEnvEnvironment(`${prefix}ENVIRONMENT`, env),
      baseUrl: options.baseUrl ?? getOptionalEnv(`${prefix}BASE_URL`, env),
      fetch: options.fetch,
      timeoutMs: options.timeoutMs ?? getEnvNumber(`${prefix}TIMEOUT_SECONDS`, env),
      tokenCacheSkewMs:
        options.tokenCacheSkewMs ?? (getEnvNumber(`${prefix}TOKEN_CACHE_SKEW_SECONDS`, env) ?? 60) * 1000,
      defaultHeaders: options.defaultHeaders,
      retry: options.retry,
      hooks: options.hooks,
      ...(options.tokenProvider
        ? {
            tokenProvider: options.tokenProvider,
          }
        : {
            consumerKey: getRequiredEnv(`${prefix}CONSUMER_KEY`, env),
            consumerSecret: getRequiredEnv(`${prefix}CONSUMER_SECRET`, env),
          }),
    });
  }

  private readonly http: HttpClient;
  private readonly tokens: { getAccessToken(forceRefresh?: boolean): Promise<string> };

  constructor(options: MpesaClientOptions) {
    const baseUrl = options.baseUrl ?? MPESA_BASE_URLS[options.environment ?? "sandbox"];

    this.http = new HttpClient({
      baseUrl,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs,
      defaultHeaders: options.defaultHeaders,
      retry: options.retry,
      hooks: options.hooks,
    });

    this.tokens = resolveMpesaTokenProvider(options, baseUrl);
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    return this.tokens.getAccessToken(forceRefresh);
  }

  async stkPush(request: MpesaStkPushRequest, options?: MpesaRequestOptions): Promise<MpesaStkPushResponse> {
    return this.authorizedRequest("/mpesa/stkpush/v1/processrequest", withAmount(request, ["Amount"]), options);
  }

  async stkPushQuery(request: MpesaStkQueryRequest, options?: MpesaRequestOptions): Promise<MpesaApiResponse> {
    return this.authorizedRequest("/mpesa/stkpushquery/v1/query", request, options);
  }

  async registerC2BUrls(
    request: MpesaRegisterC2BUrlsRequest,
    version: MpesaC2BRegisterVersion = "v2",
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.authorizedRequest(`/mpesa/c2b/${version}/registerurl`, request, options);
  }

  async b2cPayment(request: MpesaB2CRequest, options?: MpesaRequestOptions): Promise<MpesaApiResponse> {
    return this.authorizedRequest("/mpesa/b2c/v1/paymentrequest", withAmount(request, ["Amount"]), options);
  }

  async b2bPayment(request: MpesaB2BRequest, options?: MpesaRequestOptions): Promise<MpesaApiResponse> {
    return this.authorizedRequest("/mpesa/b2b/v1/paymentrequest", withAmount(request, ["Amount"]), options);
  }

  async reversal(request: MpesaReversalRequest, options?: MpesaRequestOptions): Promise<MpesaApiResponse> {
    return this.authorizedRequest("/mpesa/reversal/v1/request", withAmount(request, ["Amount"]), options);
  }

  async transactionStatus(
    request: MpesaTransactionStatusRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.authorizedRequest("/mpesa/transactionstatus/v1/query", request, options);
  }

  async accountBalance(
    request: MpesaAccountBalanceRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.authorizedRequest("/mpesa/accountbalance/v1/query", request, options);
  }

  async generateQrCode(request: MpesaQrCodeRequest, options?: MpesaRequestOptions): Promise<MpesaApiResponse> {
    return this.authorizedRequest("/mpesa/qrcode/v1/generate", withAmount(request, ["Amount"]), options);
  }

  private async authorizedRequest<T extends MpesaApiResponse>(
    path: string,
    body: Record<string, unknown>,
    options?: MpesaRequestOptions,
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

function resolveMpesaTokenProvider(
  options: MpesaClientOptions,
  baseUrl: string,
): { getAccessToken(forceRefresh?: boolean): Promise<string> } {
  if ("tokenProvider" in options && options.tokenProvider) {
    return options.tokenProvider;
  }

  if (!("consumerKey" in options) || !("consumerSecret" in options) || !options.consumerKey || !options.consumerSecret) {
    throw new ConfigurationError(
      "MpesaClient requires either consumerKey and consumerSecret, or a tokenProvider.",
    );
  }

  return new ClientCredentialsTokenProvider({
    tokenUrl: `${baseUrl}/oauth/v1/generate`,
    clientId: options.consumerKey,
    clientSecret: options.consumerSecret,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
    query: { grant_type: "client_credentials" },
    cacheSkewMs: options.tokenCacheSkewMs,
    mapResponse: (payload) => ({
      accessToken: typeof payload["access_token"] === "string" ? payload["access_token"] : "",
      expiresIn: Number(payload["expires_in"] ?? 0),
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
