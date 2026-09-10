import type {
  AccessTokenProvider,
  AmountNormalization,
  FetchLike,
  HttpHooks,
  JsonObject,
  NoriapayEnvironment,
  ProviderRequestOptions,
  RetryPolicy,
  TokenStore,
} from "../../core/types";
import type { EnvLike } from "../../core/config";
import type { SASAPAY_ENDPOINTS, SASAPAY_WAAS_ENDPOINTS } from "./client";

export type SasaPayEndpointName = keyof typeof SASAPAY_ENDPOINTS;
export type SasaPayWaasEndpointName = keyof typeof SASAPAY_WAAS_ENDPOINTS;

/** A request body for an endpoint this package does not model field-by-field. */
export type SasaPayPayload = JsonObject;

/** Every SasaPay response carries `status` and `detail`; the rest varies by endpoint. */
export interface SasaPayResponse extends JsonObject {
  status?: boolean;
  detail?: string;
  statusCode?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
}

interface SasaPayBaseClientOptions {
  environment?: NoriapayEnvironment;
  baseUrl?: string;
  /** WaaS runs on its own host; defaults to the v2 host for `environment`. */
  waasBaseUrl?: string;
  tokenUrl?: string;
  waasTokenUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  tokenCacheSkewMs?: number;
  defaultHeaders?: HeadersInit;
  retry?: RetryPolicy | false;
  hooks?: HttpHooks;
  /** Override v1 endpoint paths, keyed by `SASAPAY_ENDPOINTS`. */
  endpoints?: Partial<Record<SasaPayEndpointName, string>>;
  /** Override WaaS endpoint paths, keyed by `SASAPAY_WAAS_ENDPOINTS`. */
  waasEndpoints?: Partial<Record<SasaPayWaasEndpointName, string>>;
  /** Throw `BusinessError` when SasaPay answers 200 with `status: false`. */
  throwOnBusinessError?: boolean;
  amountNormalization?: AmountNormalization;
  tokenStore?: TokenStore;
  /**
   * Filled into every v1 payment payload the caller leaves out — typically
   * `MerchantCode`, `Currency` and `CallBackURL`, which are the same on every call.
   */
  paymentDefaults?: Record<string, string | undefined>;
  /** The WaaS equivalent: `merchantCode`, `currencyCode`, `callbackUrl`. */
  waasPaymentDefaults?: Record<string, string | undefined>;
  /** WaaS credentials, when SasaPay issued a separate application for it. */
  waasClientId?: string;
  waasClientSecret?: string;
}

interface SasaPayCredentialAuthOptions {
  clientId: string;
  clientSecret: string;
  tokenProvider?: never;
}

interface SasaPayExternalTokenAuthOptions {
  tokenProvider: AccessTokenProvider;
  clientId?: never;
  clientSecret?: never;
}

export type SasaPayClientOptions = SasaPayBaseClientOptions &
  (SasaPayCredentialAuthOptions | SasaPayExternalTokenAuthOptions);

export interface SasaPayFromEnvOptions extends SasaPayBaseClientOptions {
  prefix?: string;
  env?: EnvLike;
  tokenProvider?: AccessTokenProvider;
}

export interface SasaPayRequestOptions extends ProviderRequestOptions {}


export interface SasaPayAuthResponse extends JsonObject {
  status?: boolean;
  detail?: string;
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface SasaPayRequestPaymentRequest extends JsonObject {
  MerchantCode: string;
  NetworkCode: string;
  Currency: string;
  Amount: string | number;
  PhoneNumber: string;
  AccountReference: string;
  TransactionDesc: string;
  CallBackURL: string;
}

export interface SasaPayRequestPaymentResponse extends JsonObject {
  status?: boolean;
  detail?: string;
  PaymentGateway?: string;
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  TransactionReference?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
}

export interface SasaPayProcessPaymentRequest extends JsonObject {
  MerchantCode: string;
  CheckoutRequestID: string;
  VerificationCode: string;
}

export interface SasaPayProcessPaymentResponse extends JsonObject {
  status?: boolean;
  detail?: string;
}

export interface SasaPayB2CRequest extends JsonObject {
  MerchantCode: string;
  Amount: string | number;
  Currency: string;
  MerchantTransactionReference: string;
  ReceiverNumber: string;
  Channel: string;
  Reason: string;
  CallBackURL: string;
}

export interface SasaPayB2CResponse extends JsonObject {
  status?: boolean;
  detail?: string;
  B2CRequestID?: string;
  ConversationID?: string;
  OriginatorConversationID?: string;
  ResponseCode?: string;
  TransactionCharges?: string;
  ResponseDescription?: string;
}

export interface SasaPayB2BRequest extends JsonObject {
  MerchantCode: string;
  MerchantTransactionReference: string;
  Currency: string;
  Amount: string | number;
  ReceiverMerchantCode: string;
  AccountReference: string;
  ReceiverAccountType: "PAYBILL" | "TILL";
  NetworkCode: string;
  Reason: string;
  CallBackURL: string;
}

export interface SasaPayB2BResponse extends JsonObject {
  status?: boolean;
  detail?: string;
  B2BRequestID?: string;
  ConversationID?: string;
  OriginatorConversationID?: string;
  TransactionCharges?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
}

export interface SasaPayC2BCallback extends JsonObject {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  PaymentRequestID: string;
  ResultCode: string;
  ResultDesc: string;
  SourceChannel: string;
  TransAmount: string;
  RequestedAmount: string;
  Paid: boolean;
  BillRefNumber: string;
  TransactionDate: string;
  CustomerMobile: string;
  TransactionCode: string;
  ThirdPartyTransID: string;
}

export interface SasaPayC2BIpn extends JsonObject {
  MerchantCode: string;
  BusinessShortCode: string;
  InvoiceNumber: string;
  PaymentMethod: string;
  TransID: string;
  ThirdPartyTransID: string;
  FullName: string;
  FirstName: string;
  MiddleName: string;
  LastName: string;
  TransactionType: string;
  MSISDN: string;
  OrgAccountBalance: string;
  TransAmount: string;
  TransTime: string;
  BillRefNumber: string;
}

export interface SasaPayTransferCallback extends JsonObject {
  MerchantCode: string;
  DestinationChannel: string;
  RecipientName: string;
  RecipientAccountNumber: string;
  ResultCode: string;
  ResultDesc: string;
  SourceChannel: string;
  SasaPayTransactionCode: string;
  CheckoutRequestID: string;
  SasaPayTransactionID: string;
  ThirdPartyTransactionCode: string;
  TransactionAmount: string;
  TransactionCharge?: string;
  TransactionCharges?: string;
  MerchantRequestID: string;
  MerchantTransactionReference: string;
  TransactionDate: string;
  MerchantAccountBalance: string;
  LinkedTransactionCode?: string;
}
