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
  resolveEndpoints,
  withDefaults,
  type ProviderClientConfig,
} from "../../core/provider-client";
import type {
  AccessTokenProvider,
  AmountNormalization,
  MultipartInput,
  NoriapayEnvironment,
  QueryParams,
  TokenStore,
} from "../../core/types";
import { normalizeAmount, normalizeKenyanPhoneNumbers, trimTrailingSlash } from "../../core/utils";
import type {
  SasaPayB2BRequest,
  SasaPayB2BResponse,
  SasaPayB2CRequest,
  SasaPayB2CResponse,
  SasaPayClientOptions,
  SasaPayEndpointName,
  SasaPayFromEnvOptions,
  SasaPayPayload,
  SasaPayProcessPaymentRequest,
  SasaPayProcessPaymentResponse,
  SasaPayRequestOptions,
  SasaPayRequestPaymentRequest,
  SasaPayRequestPaymentResponse,
  SasaPayResponse,
  SasaPayWaasEndpointName,
} from "./types";

export const SASAPAY_BASE_URLS = {
  sandbox: "https://sandbox.sasapay.app/api/v1",
  production: "https://api.sasapay.app/api/v1",
} as const;

export const SASAPAY_WAAS_BASE_URLS = {
  sandbox: "https://sandbox.sasapay.app/api/v2/waas",
  production: "https://api.sasapay.app/api/v2/waas",
} as const;

export const SASAPAY_BASE_URL = SASAPAY_BASE_URLS.sandbox;

export const SASAPAY_TOKEN_PATH = "/auth/token/";

export const SASAPAY_ENDPOINTS = {
  requestPayment: "/payments/request-payment/",
  processPayment: "/payments/process-payment/",
  b2cPayment: "/payments/b2c/",
  b2bPayment: "/payments/b2b/",
  cardPayment: "/payments/card-payments/",
  preApprovedPayment: "/payments/approved/",
  remittancePayment: "/remittances/remittance-payments/",
  accountValidation: "/accounts/account-validation/",
  internalFundMovement: "/transactions/fund-movement/",
  transactionStatus: "/transactions/status/",
  transactionStatusQuery: "/transactions/status-query/",
  requestPaymentStatus: "/payments/request-payment/status/",
  merchantBalance: "/payments/check-balance/",
  verifyTransaction: "/transactions/verify/",
  businessToBeneficiary: "/payments/b2c/beneficiary/",
  registerIpnUrl: "/payments/register-ipn-url/",
  lipaFare: "/payments/lipa-fare/",
  transactions: "/transactions/",
  channelCodes: "/payments/channel-codes/",
  utilityPayment: "/utilities/",
  utilityBillQuery: "/utilities/bill-query",
  bulkPayment: "/payments/bulk-payments/",
  bulkPaymentStatus: "/payments/bulk-payments/status/",
  dealerBusinessTypes: "/accounts/business-types/",
  dealerCountries: "/accounts/countries/",
  dealerSubCounties: "/accounts/sub-counties/",
  dealerIndustries: "/accounts/industries/",
  availableBillNumber: "/accounts/available-bill-number/",
  merchantOnboarding: "/accounts/merchant-onboarding/",
} as const;

export const SASAPAY_WAAS_ENDPOINTS = {
  personalOnboarding: "/personal-onboarding/",
  personalOnboardingConfirmation: "/personal-onboarding/confirmation/",
  personalKyc: "/personal-onboarding/kyc/",
  businessOnboarding: "/business-onboarding/",
  businessOnboardingConfirmation: "/business-onboarding/confirmation/",
  businessKyc: "/business-onboarding/kyc/",
  customers: "/customers/",
  customerDetails: "/customer-details/",
  customerDetailsUpdate: "/customer-details/update/",
  requestPayment: "/payments/request-payment/",
  processPayment: "/payments/process-payment/",
  merchantTransfers: "/payments/merchant-transfers/",
  sendMoney: "/payments/send-money/",
  payBills: "/payments/pay-bills/",
  createSubWallet: "/sub-wallets/",
  transactions: "/transactions/",
  transactionStatus: "/transactions/status/",
  verifyTransaction: "/transactions/verify/",
  merchantBalance: "/merchant-balances/",
  channelCodes: "/channel-codes/",
  countries: "/countries/",
  countrySubRegions: "/countries/sub-regions/",
  industries: "/industries/",
  subIndustries: "/sub-industries/",
  businessTypes: "/business-types/",
  products: "/products/",
  nearestAgents: "/nearest-agent/",
  utilityPayment: "/utilities/",
} as const;

export class SasaPayWaasClient extends ProviderClient {
  constructor(
    config: ProviderClientConfig,
    private readonly endpoints: Record<SasaPayWaasEndpointName, string>,
    private readonly paymentDefaults: Record<string, string | undefined>,
  ) {
    super(config);
  }

  endpoint(name: SasaPayWaasEndpointName): string {
    return this.endpoints[name];
  }

  async personalOnboarding(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("personalOnboarding", this.withDefaults(request, ["currencyCode"]), options);
  }

  async confirmPersonalOnboarding(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post(
      "personalOnboardingConfirmation",
      this.withDefaults(request, ["currencyCode", "callbackUrl"]),
      options,
    );
  }

  async personalKyc(
    request: SasaPayPayload,
    files?: MultipartInput,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.kyc("personalKyc", request, files, options);
  }

  async businessOnboarding(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("businessOnboarding", this.withDefaults(request, ["currencyCode"]), options);
  }

  async confirmBusinessOnboarding(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post(
      "businessOnboardingConfirmation",
      this.withDefaults(request, ["currencyCode", "callbackUrl"]),
      options,
    );
  }

  async businessKyc(
    request: SasaPayPayload,
    files?: MultipartInput,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.kyc("businessKyc", request, files, options);
  }

  async customers(query: QueryParams, options?: SasaPayRequestOptions): Promise<SasaPayResponse> {
    return this.get("customers", query, options);
  }

  async customerDetails(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("customerDetails", request, options);
  }

  async updateCustomerDetails(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("customerDetailsUpdate", request, options);
  }

  async createSubWallet(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("createSubWallet", request, options);
  }

  async requestPayment(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    const payload = normalizeKenyanPhoneNumbers(request, ["mobileNumber"]);

    return this.post("requestPayment", this.withDefaults(payload), options, true);
  }

  async processPayment(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("processPayment", request, options);
  }

  async merchantTransfer(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("merchantTransfers", this.withDefaults(request), options, true);
  }

  async sendMoney(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("sendMoney", this.withDefaults(request), options, true);
  }

  async payBill(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("payBills", this.withDefaults(request), options, true);
  }

  async utilityPayment(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("utilityPayment", request, options, true);
  }

  async transactions(
    query: QueryParams,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.get("transactions", query, options);
  }

  async transactionStatus(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("transactionStatus", request, options);
  }

  async verifyTransaction(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("verifyTransaction", request, options);
  }

  async merchantBalance(
    merchantCode: string | number,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.get("merchantBalance", { merchantCode: String(merchantCode) }, options);
  }

  async channelCodes(options?: SasaPayRequestOptions): Promise<SasaPayResponse> {
    return this.get("channelCodes", undefined, options);
  }

  async countries(options?: SasaPayRequestOptions): Promise<SasaPayResponse> {
    return this.get("countries", undefined, options);
  }

  async countrySubRegions(
    callingCode: string | number,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.get("countrySubRegions", { callingCode: String(callingCode) }, options);
  }

  async industries(options?: SasaPayRequestOptions): Promise<SasaPayResponse> {
    return this.get("industries", undefined, options);
  }

  async subIndustries(
    industryId: string | number,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.get("subIndustries", { industryId: String(industryId) }, options);
  }

  async businessTypes(options?: SasaPayRequestOptions): Promise<SasaPayResponse> {
    return this.get("businessTypes", undefined, options);
  }

  async products(options?: SasaPayRequestOptions): Promise<SasaPayResponse> {
    return this.get("products", undefined, options);
  }

  async nearestAgents(
    longitude: string | number,
    latitude: string | number,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.get(
      "nearestAgents",
      { Longitude: String(longitude), Latitude: String(latitude) },
      options,
    );
  }

  private withDefaults(payload: SasaPayPayload, except: string[] = []): SasaPayPayload {
    const defaults = { ...this.paymentDefaults };

    for (const key of except) {
      delete defaults[key];
    }

    return withDefaults(payload, defaults);
  }

  private async kyc(
    name: SasaPayWaasEndpointName,
    request: SasaPayPayload,
    files: MultipartInput | undefined,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    const payload = this.withDefaults(request, ["currencyCode", "callbackUrl"]);

    if (!files || Object.keys(files).length === 0) {
      return this.post(name, payload, options);
    }

    return this.send<SasaPayResponse>({
      path: this.endpoints[name],
      method: "POST",
      multipart: { ...(payload as MultipartInput), ...files },
      options,
      businessContext: `SasaPay WaaS POST ${this.endpoints[name]}`,
    });
  }

  private async post(
    name: SasaPayWaasEndpointName,
    body: SasaPayPayload,
    options?: SasaPayRequestOptions,
    amounts = false,
  ): Promise<SasaPayResponse> {
    return this.send<SasaPayResponse>({
      path: this.endpoints[name],
      method: "POST",
      body: amounts ? normalizeAmount(body, this.resolveAmountNormalization(options)) : body,
      options,
      businessContext: `SasaPay WaaS POST ${this.endpoints[name]}`,
    });
  }

  private async get(
    name: SasaPayWaasEndpointName,
    query?: QueryParams,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.send<SasaPayResponse>({
      path: this.endpoints[name],
      method: "GET",
      query,
      options,
      businessContext: `SasaPay WaaS GET ${this.endpoints[name]}`,
    });
  }
}

export class SasaPayClient extends ProviderClient {
  static fromEnv(options: SasaPayFromEnvOptions = {}): SasaPayClient {
    const prefix = options.prefix ?? "SASAPAY_";
    const env = options.env;

    const base = {
      environment: getEnvEnvironment(`${prefix}ENVIRONMENT`, env),
      baseUrl: options.baseUrl ?? getOptionalEnv(`${prefix}BASE_URL`, env),
      waasBaseUrl: options.waasBaseUrl ?? getOptionalEnv(`${prefix}WAAS_BASE_URL`, env),
      tokenUrl: options.tokenUrl ?? getOptionalEnv(`${prefix}TOKEN_URL`, env),
      waasTokenUrl: options.waasTokenUrl ?? getOptionalEnv(`${prefix}WAAS_TOKEN_URL`, env),
      waasClientId: options.waasClientId ?? getOptionalEnv(`${prefix}WAAS_CLIENT_ID`, env),
      waasClientSecret:
        options.waasClientSecret ?? getOptionalEnv(`${prefix}WAAS_CLIENT_SECRET`, env),
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
      waasEndpoints: options.waasEndpoints,
      throwOnBusinessError:
        options.throwOnBusinessError ?? getEnvBoolean(`${prefix}THROW_ON_BUSINESS_ERROR`, env),
      amountNormalization: options.amountNormalization,
      tokenStore: options.tokenStore,
      paymentDefaults: options.paymentDefaults ?? {
        MerchantCode: getOptionalEnv(`${prefix}MERCHANT_CODE`, env),
        Currency: getOptionalEnv(`${prefix}CURRENCY`, env),
        CallBackURL: getOptionalEnv(`${prefix}CALLBACK_URL`, env),
      },
      waasPaymentDefaults: options.waasPaymentDefaults ?? {
        merchantCode: getOptionalEnv(`${prefix}WAAS_MERCHANT_CODE`, env),
        currencyCode: getOptionalEnv(`${prefix}WAAS_CURRENCY_CODE`, env),
        callbackUrl: getOptionalEnv(`${prefix}WAAS_CALLBACK_URL`, env),
      },
    };

    return new SasaPayClient(
      options.tokenProvider
        ? { ...base, tokenProvider: options.tokenProvider }
        : {
            ...base,
            clientId: getRequiredEnv(`${prefix}CLIENT_ID`, env),
            clientSecret: getRequiredEnv(`${prefix}CLIENT_SECRET`, env),
          },
    );
  }

  static succeeded(response: unknown): boolean | undefined {
    return businessSucceeded("sasapay", response);
  }

  static statusCode(response: unknown): string | undefined {
    return businessStatusCode("sasapay", response);
  }

  static statusMessage(response: unknown): string | undefined {
    return businessStatusMessage("sasapay", response);
  }

  private readonly endpoints: Record<SasaPayEndpointName, string>;
  private readonly paymentDefaults: Record<string, string | undefined>;
  readonly waas: SasaPayWaasClient;

  constructor(options: SasaPayClientOptions) {
    const environment = options.environment ?? "sandbox";
    const baseUrl = options.baseUrl ?? resolveBaseUrl(environment, SASAPAY_BASE_URLS);

    super({
      baseUrl,
      provider: "sasapay",
      tokens: resolveSasaPayTokenProvider(options, baseUrl, "v1"),
      fetch: options.fetch,
      timeoutMs: options.timeoutMs,
      defaultHeaders: options.defaultHeaders,
      retry: options.retry,
      hooks: options.hooks,
      throwOnBusinessError: options.throwOnBusinessError,
      amountNormalization: options.amountNormalization,
    });

    this.endpoints = resolveEndpoints(SASAPAY_ENDPOINTS, options.endpoints);
    this.paymentDefaults = options.paymentDefaults ?? {};

    const waasBaseUrl = options.waasBaseUrl ?? resolveBaseUrl(environment, SASAPAY_WAAS_BASE_URLS);

    this.waas = new SasaPayWaasClient(
      {
        baseUrl: waasBaseUrl,
        provider: "sasapay",
        tokens: resolveSasaPayTokenProvider(options, waasBaseUrl, "waas"),
        fetch: options.fetch,
        timeoutMs: options.timeoutMs,
        defaultHeaders: options.defaultHeaders,
        retry: options.retry,
        hooks: options.hooks,
        throwOnBusinessError: options.throwOnBusinessError,
        amountNormalization: options.amountNormalization,
      },
      resolveEndpoints(SASAPAY_WAAS_ENDPOINTS, options.waasEndpoints),
      options.waasPaymentDefaults ?? {},
    );
  }

  endpoint(name: SasaPayEndpointName): string {
    return this.endpoints[name];
  }

  async requestPayment(
    request: SasaPayRequestPaymentRequest,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayRequestPaymentResponse> {
    const payload = normalizeKenyanPhoneNumbers(request, ["PhoneNumber"]);

    return this.post("requestPayment", this.withPaymentDefaults(payload), options, true);
  }

  async processPayment(
    request: SasaPayProcessPaymentRequest,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayProcessPaymentResponse> {
    return this.post("processPayment", request, options);
  }

  async cardPayment(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("cardPayment", this.withPaymentDefaults(request), options, true);
  }

  async preApprovedPayment(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("preApprovedPayment", this.withPaymentDefaults(request), options, true);
  }

  async lipaFare(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("lipaFare", this.withPaymentDefaults(request), options, true);
  }

  async b2cPayment(
    request: SasaPayB2CRequest,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayB2CResponse> {
    const payload = normalizeKenyanPhoneNumbers(request, ["ReceiverNumber"]);

    return this.post("b2cPayment", this.withPaymentDefaults(payload), options, true);
  }

  async b2bPayment(
    request: SasaPayB2BRequest,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayB2BResponse> {
    return this.post("b2bPayment", this.withPaymentDefaults(request), options, true);
  }

  async businessToBeneficiary(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("businessToBeneficiary", request, options, true);
  }

  async remittancePayment(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("remittancePayment", this.withPaymentDefaults(request), options, true);
  }

  async bulkPayment(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("bulkPayment", request, options);
  }

  async bulkPaymentStatus(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("bulkPaymentStatus", request, options);
  }

  async internalFundMovement(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("internalFundMovement", request, options, true);
  }

  async accountValidation(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("accountValidation", request, options);
  }

  async transactionStatus(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("transactionStatus", request, options);
  }

  async transactionStatusQuery(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("transactionStatusQuery", request, options);
  }

  async requestPaymentStatus(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("requestPaymentStatus", request, options);
  }

  async verifyTransaction(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("verifyTransaction", request, options);
  }

  async merchantBalance(
    merchantCode: string | number,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.get("merchantBalance", { MerchantCode: String(merchantCode) }, options);
  }

  async transactions(
    query: QueryParams,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.get("transactions", query, options);
  }

  async utilityPayment(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("utilityPayment", request, options, true);
  }

  async utilityBillQuery(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("utilityBillQuery", request, options);
  }

  async registerIpnUrl(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("registerIpnUrl", request, options);
  }

  async channelCodes(options?: SasaPayRequestOptions): Promise<SasaPayResponse> {
    return this.get("channelCodes", undefined, options);
  }

  async dealerBusinessTypes(options?: SasaPayRequestOptions): Promise<SasaPayResponse> {
    return this.get("dealerBusinessTypes", undefined, options);
  }

  async dealerCountries(options?: SasaPayRequestOptions): Promise<SasaPayResponse> {
    return this.get("dealerCountries", undefined, options);
  }

  async dealerSubCounties(
    countyId: string | number,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.get("dealerSubCounties", { county_id: String(countyId) }, options);
  }

  async dealerIndustries(options?: SasaPayRequestOptions): Promise<SasaPayResponse> {
    return this.get("dealerIndustries", undefined, options);
  }

  async availableBillNumber(
    query?: QueryParams,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.get("availableBillNumber", query, options);
  }

  async merchantOnboarding(
    request: SasaPayPayload,
    options?: SasaPayRequestOptions,
  ): Promise<SasaPayResponse> {
    return this.post("merchantOnboarding", request, options);
  }

  private withPaymentDefaults<T extends object>(payload: T): T {
    return withDefaults(payload, this.paymentDefaults);
  }

  private async post<T extends SasaPayResponse>(
    name: SasaPayEndpointName,
    body: object,
    options?: SasaPayRequestOptions,
    amounts = false,
  ): Promise<T> {
    return this.send<T>({
      path: this.endpoints[name],
      method: "POST",
      body: amounts ? normalizeAmount(body, this.resolveAmountNormalization(options)) : body,
      options,
      businessContext: `SasaPay POST ${this.endpoints[name]}`,
    });
  }

  private async get<T extends SasaPayResponse>(
    name: SasaPayEndpointName,
    query?: QueryParams,
    options?: SasaPayRequestOptions,
  ): Promise<T> {
    return this.send<T>({
      path: this.endpoints[name],
      method: "GET",
      query,
      options,
      businessContext: `SasaPay GET ${this.endpoints[name]}`,
    });
  }
}

function resolveBaseUrl(
  environment: NoriapayEnvironment,
  urls: Record<NoriapayEnvironment, string>,
): string {
  const url = urls[environment];

  if (!url) {
    throw new ConfigurationError(
      `Unknown SasaPay environment [${environment}]. Use sandbox or production, or set an explicit baseUrl.`,
    );
  }

  return url;
}

function resolveSasaPayTokenProvider(
  options: SasaPayClientOptions,
  baseUrl: string,
  scope: "v1" | "waas",
): AccessTokenProvider {
  if (options.tokenProvider) {
    return options.tokenProvider;
  }

  const clientId = scope === "waas" ? (options.waasClientId ?? options.clientId) : options.clientId;
  const clientSecret =
    scope === "waas" ? (options.waasClientSecret ?? options.clientSecret) : options.clientSecret;

  if (!clientId || !clientSecret) {
    throw new ConfigurationError(
      "SasaPayClient requires either clientId and clientSecret, or a tokenProvider.",
    );
  }

  const tokenUrl =
    (scope === "waas" ? options.waasTokenUrl : options.tokenUrl) ??
    `${trimTrailingSlash(baseUrl)}${SASAPAY_TOKEN_PATH}`;

  const provider = new ClientCredentialsTokenProvider({
    tokenUrl,
    clientId,
    clientSecret,
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
    store: options.tokenStore as TokenStore,
    cacheKey: `noriapay:sasapay:${scope}:${options.environment ?? "sandbox"}:${clientId}`,
    cacheSkewSeconds: Math.round((options.tokenCacheSkewMs ?? 60_000) / 1000),
  });
}

export type SasaPayAmountNormalization = AmountNormalization;
