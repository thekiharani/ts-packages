import {
  businessStatusCode,
  businessStatusMessage,
  businessSucceeded,
} from "../../core/business-status";
import {
  getEnvBoolean,
  getEnvSecondsAsMs,
  getOptionalEnv,
  getRequiredEnv,
} from "../../core/config";
import { ConfigurationError } from "../../core/errors";
import {
  CachedAccessTokenProvider,
  ClientCredentialsTokenProvider,
  defaultTokenMapper,
} from "../../core/oauth";
import { ProviderClient, fillPath, resolveEndpoints } from "../../core/provider-client";
import type { AccessTokenProvider, HttpMethod, QueryParams } from "../../core/types";
import { assertFields, type FieldRules } from "../../core/validation";
import { normalizeAmount, normalizeKenyanPhoneNumbers, trimTrailingSlash } from "../../core/utils";
import type {
  KcbBuniClientOptions,
  KcbBuniEndpointName,
  KcbBuniEnvironment,
  KcbBuniFromEnvOptions,
  KcbBuniFundsTransferRequest,
  KcbBuniFundsTransferResponse,
  KcbBuniMpesaStkPushRequest,
  KcbBuniMpesaStkPushResponse,
  KcbBuniPayload,
  KcbBuniRequestOptions,
  KcbBuniResponse,
} from "./types";

export const KCB_BUNI_BASE_URLS = {
  uat: "https://uat.buni.kcbgroup.com",
} as const;

export const KCB_BUNI_ENDPOINTS = {
  token: "/token",
  mpesaStkPush: "/mm/api/request/1.0.0/stkpush",
  fundsTransfer: "/fundstransfer/1.0.0/api/v1/transfer",
  queryCoreTransactionStatus: "/v1/core/t24/querytransaction/1.0.0/api/transactioninfo",
  queryTransactionDetails: "/kcb/transaction/query/1.0.0/api/v1/payment/query/{identifier}",
  vendingValidateRequest: "/kcb/vendingGateway/v1/1.0.0/api/validate-request",
  vendingVendorConfirmation: "/kcb/vendingGateway/v1/1.0.0/api/vendor-confirmation",
  vendingTransactionStatus: "/kcb/vendingGateway/v1/1.0.0/api/query/transaction-status",
  etims: "/kcb/ke/kra/etims/1.0.0/{path}",
  p2pTransferStatusInquiry: "/kcb/bi/ips/p2p/transfer/status/inquiry/1.0.0/{path}",
} as const;

export const KCB_BUNI_MPESA_STK_PUSH_RULES: FieldRules = {
  phoneNumber: {
    required: true,
    notEmpty: true,
    max: 12,
    pattern: /^254\d{9}$/,
    format: "2547XXXXXXXX",
  },
  amount: { required: true, max: 18, numeric: true },
  invoiceNumber: { required: true, notEmpty: true, max: 24 },
  sharedShortCode: { required: true, boolean: true },
  orgShortCode: { required: true, max: 12 },
  orgPassKey: { required: true },
  callbackUrl: { required: true, notEmpty: true },
  transactionDescription: { required: true, notEmpty: true, max: 13 },
};

export const KCB_BUNI_MPESA_STK_PUSH_HEADER_RULES: FieldRules = {
  routeCode: { required: true, notEmpty: true, max: 64 },
  operation: { required: true, notEmpty: true, max: 64 },
  messageId: { required: true, notEmpty: true, max: 32 },
};

export const KCB_BUNI_FUNDS_TRANSFER_RULES: FieldRules = {
  companyCode: { required: true, notEmpty: true, max: 15 },
  transactionType: { required: true, notEmpty: true, max: 2 },
  debitAccountNumber: { required: true, notEmpty: true, max: 10 },
  creditAccountNumber: { required: true, notEmpty: true, max: 10 },
  debitAmount: { required: true, numeric: true },
  paymentDetails: { required: true, notEmpty: true, max: 35 },
  transactionReference: { required: true, notEmpty: true, max: 12 },
  currency: { required: true, notEmpty: true, max: 3 },
  beneficiaryDetails: { required: true, notEmpty: true, max: 35 },
  beneficiaryBankCode: { max: 20 },
};

export class KcbBuniClient extends ProviderClient {
  static fromEnv(options: KcbBuniFromEnvOptions = {}): KcbBuniClient {
    const prefix = options.prefix ?? "KCB_BUNI_";
    const env = options.env;

    const base = {
      environment:
        options.environment ??
        ((getOptionalEnv(`${prefix}ENVIRONMENT`, env) ?? "uat") as KcbBuniEnvironment),
      baseUrl: options.baseUrl ?? getOptionalEnv(`${prefix}BASE_URL`, env),
      tokenUrl: options.tokenUrl ?? getOptionalEnv(`${prefix}TOKEN_URL`, env),
      tokenPath: options.tokenPath ?? getOptionalEnv(`${prefix}TOKEN_PATH`, env),
      apiKey: options.apiKey ?? getOptionalEnv(`${prefix}API_KEY`, env),
      fetch: options.fetch,
      timeoutMs: options.timeoutMs ?? getEnvSecondsAsMs(`${prefix}TIMEOUT_SECONDS`, env),
      tokenCacheSkewMs:
        options.tokenCacheSkewMs ??
        getEnvSecondsAsMs(`${prefix}TOKEN_CACHE_SKEW_SECONDS`, env) ??
        60_000,
      defaultHeaders: options.defaultHeaders,
      retry: options.retry,
      hooks: options.hooks,
      endpoints: options.endpoints,
      throwOnBusinessError:
        options.throwOnBusinessError ?? getEnvBoolean(`${prefix}THROW_ON_BUSINESS_ERROR`, env),
      amountNormalization: options.amountNormalization,
      validate: options.validate ?? getEnvBoolean(`${prefix}VALIDATE_PAYLOADS`, env),
      tokenStore: options.tokenStore,
      mpesaExpress: options.mpesaExpress ?? {
        routeCode: getOptionalEnv(`${prefix}MPESA_ROUTE_CODE`, env),
        operation: getOptionalEnv(`${prefix}MPESA_OPERATION`, env),
      },
    };

    return new KcbBuniClient(
      options.tokenProvider
        ? { ...base, tokenProvider: options.tokenProvider }
        : {
            ...base,
            consumerKey: getRequiredEnv(`${prefix}CONSUMER_KEY`, env),
            consumerSecret: getRequiredEnv(`${prefix}CONSUMER_SECRET`, env),
          },
    );
  }

  static succeeded(response: unknown): boolean | undefined {
    return businessSucceeded("kcb_buni", response);
  }

  static statusCode(response: unknown): string | undefined {
    return businessStatusCode("kcb_buni", response);
  }

  static statusMessage(response: unknown): string | undefined {
    return businessStatusMessage("kcb_buni", response);
  }

  private readonly endpoints: Record<KcbBuniEndpointName, string>;
  private readonly mpesaExpress: { routeCode?: string; operation?: string };

  constructor(options: KcbBuniClientOptions) {
    const baseUrl = resolveKcbBuniBaseUrl(options);
    const endpoints = resolveEndpoints(KCB_BUNI_ENDPOINTS, options.endpoints);

    super({
      baseUrl,
      provider: "kcb_buni",
      tokens: resolveKcbBuniTokenProvider(options, baseUrl, endpoints.token),
      fetch: options.fetch,
      timeoutMs: options.timeoutMs,
      defaultHeaders: mergeApiKeyHeader(options.defaultHeaders, options.apiKey),
      retry: options.retry,
      hooks: options.hooks,
      throwOnBusinessError: options.throwOnBusinessError,
      amountNormalization: options.amountNormalization,
      validate: options.validate,
    });

    this.endpoints = endpoints;
    this.mpesaExpress = options.mpesaExpress ?? {};
  }

  endpoint(name: KcbBuniEndpointName): string {
    return this.endpoints[name];
  }

  async mpesaStkPush(
    request: KcbBuniMpesaStkPushRequest,
    messageId: string,
    options?: KcbBuniRequestOptions,
    routeCode?: string,
  ): Promise<KcbBuniMpesaStkPushResponse> {
    const buniHeaders = {
      routeCode: routeCode ?? this.requiredMpesaRouteCode(),
      operation: this.mpesaExpress.operation ?? "STKPush",
      messageId,
    };

    let payload: KcbBuniMpesaStkPushRequest = normalizeKenyanPhoneNumbers(request, ["phoneNumber"]);
    payload = normalizeAmount(payload, this.resolveAmountNormalization(options));

    if (this.shouldValidate(options)) {
      assertFields(
        buniHeaders,
        KCB_BUNI_MPESA_STK_PUSH_HEADER_RULES,
        "KCB Buni M-PESA Express header",
      );
      assertFields(payload, KCB_BUNI_MPESA_STK_PUSH_RULES, "KCB Buni M-PESA Express");
    }

    const headers = new Headers(options?.headers);
    for (const [name, value] of Object.entries(buniHeaders)) {
      headers.set(name, value);
    }

    return this.send<KcbBuniMpesaStkPushResponse>({
      path: this.endpoints.mpesaStkPush,
      method: "POST",
      body: payload,
      options: { ...options, headers },
      businessContext: "KCB Buni M-PESA Express",
    });
  }

  async transferFunds(
    request: KcbBuniFundsTransferRequest,
    options?: KcbBuniRequestOptions,
  ): Promise<KcbBuniFundsTransferResponse> {
    if (this.shouldValidate(options)) {
      assertFields(request, KCB_BUNI_FUNDS_TRANSFER_RULES, "KCB Buni Funds Transfer");
    }

    return this.send<KcbBuniFundsTransferResponse>({
      path: this.endpoints.fundsTransfer,
      method: "POST",
      body: request,
      options,
      businessContext: "KCB Buni Funds Transfer",
    });
  }

  async queryCoreTransactionStatus(
    request: KcbBuniPayload,
    options?: KcbBuniRequestOptions,
  ): Promise<KcbBuniResponse> {
    return this.send({
      path: this.endpoints.queryCoreTransactionStatus,
      method: "POST",
      body: request,
      options,
      businessContext: "KCB Buni Core Transaction Status",
    });
  }

  async queryTransactionDetails(
    identifier: string | number,
    query?: QueryParams,
    options?: KcbBuniRequestOptions,
  ): Promise<KcbBuniResponse> {
    return this.send({
      path: fillPath(this.endpoints.queryTransactionDetails, { identifier }),
      method: "GET",
      query,
      options,
      businessContext: "KCB Buni Transaction Details",
    });
  }

  async vendingValidateRequest(
    request: KcbBuniPayload,
    options?: KcbBuniRequestOptions,
  ): Promise<KcbBuniResponse> {
    return this.send({
      path: this.endpoints.vendingValidateRequest,
      method: "POST",
      body: request,
      options,
      businessContext: "KCB Buni Vending Validate Request",
    });
  }

  async vendingVendorConfirmation(
    request: KcbBuniPayload,
    options?: KcbBuniRequestOptions,
  ): Promise<KcbBuniResponse> {
    return this.send({
      path: this.endpoints.vendingVendorConfirmation,
      method: "POST",
      body: request,
      options,
      businessContext: "KCB Buni Vending Vendor Confirmation",
    });
  }

  async vendingTransactionStatus(
    request: KcbBuniPayload,
    options?: KcbBuniRequestOptions,
  ): Promise<KcbBuniResponse> {
    return this.send({
      path: this.endpoints.vendingTransactionStatus,
      method: "POST",
      body: request,
      options,
      businessContext: "KCB Buni Vending Transaction Status",
    });
  }

  async etimsRequest(
    path: string,
    request?: KcbBuniPayload,
    method: HttpMethod = "POST",
    query?: QueryParams,
    options?: KcbBuniRequestOptions,
  ): Promise<KcbBuniResponse> {
    return this.send({
      path: fillPath(this.endpoints.etims, { path: path.replace(/^\/+/, "") }, { raw: ["path"] }),
      method,
      body: method === "GET" ? undefined : request,
      query,
      options,
      businessContext: "KCB Buni eTIMS",
    });
  }

  async p2pTransferStatusInquiry(
    request: KcbBuniPayload,
    path = "",
    options?: KcbBuniRequestOptions,
  ): Promise<KcbBuniResponse> {
    return this.send({
      path: fillPath(
        this.endpoints.p2pTransferStatusInquiry,
        { path: path.replace(/^\/+/, "") },
        { raw: ["path"] },
      ),
      method: "POST",
      body: request,
      options,
      businessContext: "KCB Buni P2P Transfer Status Inquiry",
    });
  }

  private requiredMpesaRouteCode(): string {
    const routeCode = this.mpesaExpress.routeCode?.trim();

    if (!routeCode) {
      throw new ConfigurationError(
        "KcbBuniClient M-PESA STK push requires a routeCode. Pass one to mpesaStkPush() or set mpesaExpress.routeCode.",
      );
    }

    return routeCode;
  }
}

function resolveKcbBuniBaseUrl(options: KcbBuniClientOptions): string {
  if (options.baseUrl && options.baseUrl.trim() !== "") {
    return options.baseUrl.trim();
  }

  const environment = options.environment ?? "uat";

  if (environment === "uat" || environment === "sandbox") {
    return KCB_BUNI_BASE_URLS.uat;
  }

  throw new ConfigurationError(
    "KcbBuniClient requires an explicit baseUrl outside UAT. KCB does not publish a production Buni host, so this client will not guess one — use the host KCB issued for your integration.",
  );
}

function mergeApiKeyHeader(headers: HeadersInit | undefined, apiKey?: string): HeadersInit | undefined {
  if (!apiKey) {
    return headers;
  }

  const merged = new Headers(headers);

  if (!merged.has("apikey")) {
    merged.set("apikey", apiKey);
  }

  return merged;
}

function resolveKcbBuniTokenProvider(
  options: KcbBuniClientOptions,
  baseUrl: string,
  tokenPath: string,
): AccessTokenProvider {
  if (options.tokenProvider) {
    return options.tokenProvider;
  }

  if (!options.consumerKey || !options.consumerSecret) {
    throw new ConfigurationError(
      "KcbBuniClient requires either consumerKey and consumerSecret, or a tokenProvider.",
    );
  }

  const resolvedPath = options.tokenPath ?? tokenPath;
  const tokenUrl =
    options.tokenUrl ??
    `${trimTrailingSlash(baseUrl)}/${resolvedPath.replace(/^\/+/, "")}`;

  const provider = new ClientCredentialsTokenProvider({
    tokenUrl,
    clientId: options.consumerKey,
    clientSecret: options.consumerSecret,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
    method: "POST",
    asForm: true,
    body: { grant_type: "client_credentials" },
    cacheSkewMs: options.tokenCacheSkewMs,
    mapResponse: defaultTokenMapper,
  });

  if (!options.tokenStore) {
    return provider;
  }

  return new CachedAccessTokenProvider({
    provider,
    store: options.tokenStore,
    cacheKey: `noriapay:kcb_buni:${options.environment ?? "uat"}:${options.consumerKey}`,
    cacheSkewSeconds: Math.round((options.tokenCacheSkewMs ?? 60_000) / 1000),
  });
}
