import { createPublicKey, publicEncrypt, constants as cryptoConstants } from "node:crypto";

import {
  businessStatusCode,
  businessStatusMessage,
  businessSucceeded,
} from "../../core/business-status";
import {
  getEnvBoolean,
  getEnvEnvironment,
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
import {
  ProviderClient,
  fillPath,
  resolveEndpoints,
  type ProviderClientConfig,
} from "../../core/provider-client";
import type { AccessTokenProvider, JsonObject } from "../../core/types";
import {
  formatTimestamp,
  normalizeAmount,
  normalizeKenyanPhoneNumbers,
  trimTrailingSlash,
} from "../../core/utils";
import type {
  MpesaAccountBalanceRequest,
  MpesaApiResponse,
  MpesaB2BExpressCheckoutRequest,
  MpesaB2BRequest,
  MpesaB2CRequest,
  MpesaB2CVersion,
  MpesaBillManagerRequest,
  MpesaC2BRegisterVersion,
  MpesaC2BSimulateRequest,
  MpesaClientOptions,
  MpesaEndpointName,
  MpesaFromEnvOptions,
  MpesaPullTransactionsRegisterRequest,
  MpesaPullTransactionsRequest,
  MpesaQrCodeRequest,
  MpesaQrCodeResponse,
  MpesaRatibaStandingOrderRequest,
  MpesaRegisterC2BUrlsRequest,
  MpesaRequestOptions,
  MpesaReversalRequest,
  MpesaStkPushRequest,
  MpesaStkPushResponse,
  MpesaStkQueryRequest,
  MpesaStkQueryResponse,
  MpesaTaxRemittanceRequest,
  MpesaTransactionStatusRequest,
} from "./types";

export const MPESA_BASE_URLS = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
} as const;

export const MPESA_ENDPOINTS = {
  oauthToken: "/oauth/v1/generate",
  stkPush: "/mpesa/stkpush/v1/processrequest",
  stkPushQuery: "/mpesa/stkpushquery/v1/query",
  c2bRegisterUrl: "/mpesa/c2b/{version}/registerurl",
  c2bSimulate: "/mpesa/c2b/v1/simulate",
  b2cPayment: "/mpesa/b2c/{version}/paymentrequest",
  b2bPayment: "/mpesa/b2b/v1/paymentrequest",
  b2bExpressCheckout: "/v1/ussdpush/get-msisdn",
  reversal: "/mpesa/reversal/v1/request",
  transactionStatus: "/mpesa/transactionstatus/v1/query",
  accountBalance: "/mpesa/accountbalance/v1/query",
  dynamicQr: "/mpesa/qrcode/v1/generate",
  taxRemittance: "/mpesa/b2b/v1/remittax",
  billManagerOptIn: "/v1/billmanager-invoice/optin",
  billManagerSingleInvoice: "/v1/billmanager-invoice/single-invoicing",
  billManagerBulkInvoicing: "/v1/billmanager-invoice/bulk-invoicing",
  billManagerReconciliation: "/v1/billmanager-invoice/reconciliation",
  billManagerCancelSingleInvoice: "/v1/billmanager-invoice/cancel-single-invoice",
  billManagerCancelBulkInvoice: "/v1/billmanager-invoice/cancel-bulk-invoice",
  billManagerUpdateOnboardingDetails: "/v1/billmanager-invoice/change-optin-details",
  billManagerUpdateSingleInvoice: "/v1/billmanager-invoice/change-invoice",
  billManagerUpdateBulkInvoice: "/v1/billmanager-invoice/change-invoices",
  ratibaStandingOrder: "/standingorder/v1/createStandingOrderExternal",
  pullTransactionsRegister: "/pulltransactions/v1/register",
  pullTransactions: "/pulltransactions/v1/query",
} as const;

export function buildMpesaTimestamp(date: Date = new Date(), timeZone = "Africa/Nairobi"): string {
  return formatTimestamp(date, timeZone);
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

export function buildMpesaSecurityCredential(input: {
  initiatorPassword: string;
  certificate: string;
}): string {
  if (!input.initiatorPassword) {
    throw new ConfigurationError("An initiator password is required to build a SecurityCredential.");
  }

  let key;

  try {
    key = createPublicKey(input.certificate);
  } catch (error) {
    throw new ConfigurationError(
      "The M-PESA certificate could not be read. Supply the PEM (or X.509 certificate) issued by the Daraja portal.",
      { cause: error },
    );
  }

  return publicEncrypt(
    { key, padding: cryptoConstants.RSA_PKCS1_PADDING },
    Buffer.from(input.initiatorPassword, "utf8"),
  ).toString("base64");
}

export class MpesaClient extends ProviderClient {
  static fromEnv(options: MpesaFromEnvOptions = {}): MpesaClient {
    const prefix = options.prefix ?? "MPESA_";
    const env = options.env;

    const base = {
      environment: getEnvEnvironment(`${prefix}ENVIRONMENT`, env),
      baseUrl: options.baseUrl ?? getOptionalEnv(`${prefix}BASE_URL`, env),
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
      b2cVersion:
        options.b2cVersion ?? (getOptionalEnv(`${prefix}B2C_VERSION`, env) as MpesaB2CVersion | undefined),
      tokenStore: options.tokenStore,
      tokenCacheKey: options.tokenCacheKey,
    };

    return new MpesaClient(
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
    return businessSucceeded("mpesa", response);
  }

  static statusCode(response: unknown): string | undefined {
    return businessStatusCode("mpesa", response);
  }

  static statusMessage(response: unknown): string | undefined {
    return businessStatusMessage("mpesa", response);
  }

  private readonly endpoints: Record<MpesaEndpointName, string>;
  private readonly b2cVersion: MpesaB2CVersion;

  constructor(options: MpesaClientOptions) {
    const baseUrl = options.baseUrl ?? MPESA_BASE_URLS[options.environment ?? "sandbox"];
    const endpoints = resolveEndpoints(MPESA_ENDPOINTS, options.endpoints);

    const config: ProviderClientConfig = {
      baseUrl,
      provider: "mpesa",
      tokens: resolveMpesaTokenProvider(options, baseUrl, endpoints.oauthToken),
      fetch: options.fetch,
      timeoutMs: options.timeoutMs,
      defaultHeaders: options.defaultHeaders,
      retry: options.retry,
      hooks: options.hooks,
      throwOnBusinessError: options.throwOnBusinessError,
      amountNormalization: options.amountNormalization,
    };

    super(config);

    this.endpoints = endpoints;
    this.b2cVersion = options.b2cVersion ?? "v1";
  }

  async stkPush(
    request: MpesaStkPushRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaStkPushResponse> {
    const payload = normalizeKenyanPhoneNumbers(request, ["PartyA", "PhoneNumber"]);

    return this.post("stkPush", payload, options, "M-PESA STK push");
  }

  async stkPushQuery(
    request: MpesaStkQueryRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaStkQueryResponse> {
    return this.post("stkPushQuery", request, options, "M-PESA STK push query", { amounts: false });
  }

  async registerC2BUrls(
    request: MpesaRegisterC2BUrlsRequest,
    version: MpesaC2BRegisterVersion = "v2",
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.send({
      path: fillPath(this.endpoints.c2bRegisterUrl, { version }),
      method: "POST",
      body: request,
      options,
      businessContext: "M-PESA C2B URL registration",
    });
  }

  async registerC2BUrlsV1(
    request: MpesaRegisterC2BUrlsRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.registerC2BUrls(request, "v1", options);
  }

  async c2bSimulate(
    request: MpesaC2BSimulateRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    const payload = normalizeKenyanPhoneNumbers(request, ["Msisdn"]);

    return this.post("c2bSimulate", payload, options, "M-PESA C2B simulate");
  }

  async b2cPayment(
    request: MpesaB2CRequest,
    options?: MpesaRequestOptions,
    version?: MpesaB2CVersion,
  ): Promise<MpesaApiResponse> {
    const payload = normalizeKenyanPhoneNumbers(request, ["PartyB"]);

    return this.send({
      path: fillPath(this.endpoints.b2cPayment, { version: version ?? this.b2cVersion }),
      method: "POST",
      body: normalizeAmount(payload, this.resolveAmountNormalization(options)),
      options,
      businessContext: "M-PESA B2C payment",
    });
  }

  async b2cPaymentV3(
    request: MpesaB2CRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.b2cPayment(request, options, "v3");
  }

  async b2bPayment(
    request: MpesaB2BRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post("b2bPayment", request, options, "M-PESA B2B payment");
  }

  async b2cAccountTopUp(
    request: Omit<MpesaB2BRequest, "CommandID"> & { CommandID?: MpesaB2BRequest["CommandID"] },
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post(
      "b2bPayment",
      { ...request, CommandID: request.CommandID ?? "BusinessPayToBulk" } as MpesaB2BRequest,
      options,
      "M-PESA B2C account top-up",
    );
  }

  async businessPayBill(
    request: Omit<MpesaB2BRequest, "CommandID"> & { CommandID?: MpesaB2BRequest["CommandID"] },
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post(
      "b2bPayment",
      { ...request, CommandID: request.CommandID ?? "BusinessPayBill" } as MpesaB2BRequest,
      options,
      "M-PESA business pay bill",
    );
  }

  async businessBuyGoods(
    request: Omit<MpesaB2BRequest, "CommandID"> & { CommandID?: MpesaB2BRequest["CommandID"] },
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post(
      "b2bPayment",
      { ...request, CommandID: request.CommandID ?? "BusinessBuyGoods" } as MpesaB2BRequest,
      options,
      "M-PESA business buy goods",
    );
  }

  async b2bExpressCheckout(
    request: MpesaB2BExpressCheckoutRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post("b2bExpressCheckout", request, options, "M-PESA B2B express checkout");
  }

  async taxRemittance(
    request: MpesaTaxRemittanceRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post("taxRemittance", request, options, "M-PESA tax remittance");
  }

  async reversal(
    request: MpesaReversalRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post("reversal", request, options, "M-PESA reversal");
  }

  async transactionStatus(
    request: MpesaTransactionStatusRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post("transactionStatus", request, options, "M-PESA transaction status", {
      amounts: false,
    });
  }

  async accountBalance(
    request: MpesaAccountBalanceRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post("accountBalance", request, options, "M-PESA account balance", {
      amounts: false,
    });
  }

  async generateQrCode(
    request: MpesaQrCodeRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaQrCodeResponse> {
    return this.post("dynamicQr", request, options, "M-PESA QR generation");
  }

  async billManagerOptIn(
    request: MpesaBillManagerRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post("billManagerOptIn", request, options, "M-PESA Bill Manager opt-in", {
      amounts: false,
    });
  }

  async billManagerSingleInvoice(
    request: MpesaBillManagerRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post("billManagerSingleInvoice", request, options, "M-PESA Bill Manager invoice");
  }

  async billManagerBulkInvoicing(
    request: MpesaBillManagerRequest[] | MpesaBillManagerRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.send({
      path: this.endpoints.billManagerBulkInvoicing,
      method: "POST",
      body: request,
      options,
      businessContext: "M-PESA Bill Manager bulk invoicing",
    });
  }

  async billManagerReconciliation(
    request: MpesaBillManagerRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post(
      "billManagerReconciliation",
      request,
      options,
      "M-PESA Bill Manager reconciliation",
    );
  }

  async billManagerCancelSingleInvoice(
    request: MpesaBillManagerRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post(
      "billManagerCancelSingleInvoice",
      request,
      options,
      "M-PESA Bill Manager cancel invoice",
      { amounts: false },
    );
  }

  async billManagerCancelBulkInvoice(
    request: MpesaBillManagerRequest[] | MpesaBillManagerRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.send({
      path: this.endpoints.billManagerCancelBulkInvoice,
      method: "POST",
      body: request,
      options,
      businessContext: "M-PESA Bill Manager cancel bulk invoice",
    });
  }

  async billManagerUpdateOnboardingDetails(
    request: MpesaBillManagerRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post(
      "billManagerUpdateOnboardingDetails",
      request,
      options,
      "M-PESA Bill Manager onboarding update",
      { amounts: false },
    );
  }

  async billManagerUpdateSingleInvoice(
    request: MpesaBillManagerRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post(
      "billManagerUpdateSingleInvoice",
      request,
      options,
      "M-PESA Bill Manager invoice update",
    );
  }

  async billManagerUpdateBulkInvoice(
    request: MpesaBillManagerRequest[] | MpesaBillManagerRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.send({
      path: this.endpoints.billManagerUpdateBulkInvoice,
      method: "POST",
      body: request,
      options,
      businessContext: "M-PESA Bill Manager bulk invoice update",
    });
  }

  async ratibaStandingOrder(
    request: MpesaRatibaStandingOrderRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    const payload = normalizeKenyanPhoneNumbers(request, ["PartyA"]);

    return this.post("ratibaStandingOrder", payload, options, "M-PESA Ratiba standing order");
  }

  async registerPullTransactions(
    request: MpesaPullTransactionsRegisterRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post(
      "pullTransactionsRegister",
      request,
      options,
      "M-PESA pull transactions registration",
      { amounts: false },
    );
  }

  async pullTransactions(
    request: MpesaPullTransactionsRequest,
    options?: MpesaRequestOptions,
  ): Promise<MpesaApiResponse> {
    return this.post("pullTransactions", request, options, "M-PESA pull transactions", {
      amounts: false,
    });
  }

  endpoint(name: MpesaEndpointName): string {
    return this.endpoints[name];
  }

  private async post<T extends MpesaApiResponse>(
    name: MpesaEndpointName,
    body: JsonObject | object,
    options: MpesaRequestOptions | undefined,
    businessContext: string,
    behavior: { amounts?: boolean } = {},
  ): Promise<T> {
    return this.send<T>({
      path: this.endpoints[name],
      method: "POST",
      body:
        behavior.amounts === false
          ? body
          : normalizeAmount(body, this.resolveAmountNormalization(options)),
      options,
      businessContext,
    });
  }
}

function resolveMpesaTokenProvider(
  options: MpesaClientOptions,
  baseUrl: string,
  tokenPath: string,
): AccessTokenProvider {
  if ("tokenProvider" in options && options.tokenProvider) {
    return options.tokenProvider;
  }

  if (!options.consumerKey || !options.consumerSecret) {
    throw new ConfigurationError(
      "MpesaClient requires either consumerKey and consumerSecret, or a tokenProvider.",
    );
  }

  const provider = new ClientCredentialsTokenProvider({
    tokenUrl: `${trimTrailingSlash(baseUrl)}${tokenPath}`,
    clientId: options.consumerKey,
    clientSecret: options.consumerSecret,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
    query: { grant_type: "client_credentials" },
    cacheSkewMs: options.tokenCacheSkewMs,
    mapResponse: defaultTokenMapper,
  });

  if (!options.tokenStore) {
    return provider;
  }

  return new CachedAccessTokenProvider({
    provider,
    store: options.tokenStore,
    cacheKey:
      options.tokenCacheKey ??
      `noriapay:mpesa:${options.environment ?? "sandbox"}:${options.consumerKey}`,
    cacheSkewSeconds: Math.round((options.tokenCacheSkewMs ?? 60_000) / 1000),
  });
}
