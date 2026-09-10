import type {
  AccessTokenProvider,
  AmountNormalization,
  FetchLike,
  HttpHooks,
  HttpMethod,
  JsonObject,
  ProviderRequestOptions,
  RetryPolicy,
  TokenStore,
} from "../../core/types";
import type { EnvLike } from "../../core/config";
import type { KCB_BUNI_ENDPOINTS } from "./client";

export type KcbBuniEndpointName = keyof typeof KCB_BUNI_ENDPOINTS;

/** KCB publishes a UAT gateway; `production` needs an explicit `baseUrl`. */
export type KcbBuniEnvironment = "uat" | "sandbox" | "production";

/** A request body for an endpoint whose schema KCB publishes per integration. */
export type KcbBuniPayload = JsonObject;

interface KcbBuniBaseClientOptions {
  environment?: KcbBuniEnvironment;
  baseUrl?: string;
  /** Full token URL; defaults to `baseUrl` + `tokenPath`. */
  tokenUrl?: string;
  tokenPath?: string;
  /** Sent as the `apikey` header on every request, when the gateway requires one. */
  apiKey?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  tokenCacheSkewMs?: number;
  defaultHeaders?: HeadersInit;
  retry?: RetryPolicy | false;
  hooks?: HttpHooks;
  endpoints?: Partial<Record<KcbBuniEndpointName, string>>;
  /** Throw `BusinessError` on a non-zero `header.statusCode`. */
  throwOnBusinessError?: boolean;
  amountNormalization?: AmountNormalization;
  /** Run the published field rules before sending. Defaults to true. */
  validate?: boolean;
  tokenStore?: TokenStore;
  /** Defaults for the M-PESA Express headers KCB declares required. */
  mpesaExpress?: {
    routeCode?: string;
    operation?: string;
  };
}

interface KcbBuniCredentialAuthOptions {
  consumerKey: string;
  consumerSecret: string;
  tokenProvider?: never;
}

interface KcbBuniExternalTokenAuthOptions {
  tokenProvider: AccessTokenProvider;
  consumerKey?: never;
  consumerSecret?: never;
}

export type KcbBuniClientOptions = KcbBuniBaseClientOptions &
  (KcbBuniCredentialAuthOptions | KcbBuniExternalTokenAuthOptions);

export interface KcbBuniFromEnvOptions extends KcbBuniBaseClientOptions {
  prefix?: string;
  env?: EnvLike;
  tokenProvider?: AccessTokenProvider;
}

export interface KcbBuniRequestOptions extends ProviderRequestOptions {
  /** Extra headers merged in ahead of the SDK's own. */
  headers?: HeadersInit;
}

/** Buni answers with a gateway `header` and, where relevant, an inner `response`. */
export interface KcbBuniResponse extends JsonObject {
  header?: {
    messageID?: string;
    statusCode?: string;
    statusMessage?: string;
    statusDescription?: string;
    retrievalRefNumber?: string;
    merchantID?: string;
  };
  response?: JsonObject;
}

/** `MpesaExpressAPIService` `STKPushRequest`. */
export interface KcbBuniMpesaStkPushRequest extends JsonObject {
  phoneNumber: string;
  /** Decimal values are not permitted. */
  amount: string | number;
  invoiceNumber: string;
  /** When true, KCB substitutes its own values for `orgShortCode` and `orgPassKey`. */
  sharedShortCode: boolean;
  orgShortCode: string;
  orgPassKey: string;
  callbackUrl: string;
  transactionDescription: string;
}

export interface KcbBuniMpesaStkPushResponse extends KcbBuniResponse {
  response?: {
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
    ResponseCode?: string;
    ResponseDescription?: string;
    CustomerMessage?: string;
  };
}

/** `FundsTransferAPIService` `FundsTransferRequest`. */
export interface KcbBuniFundsTransferRequest extends JsonObject {
  companyCode: string;
  transactionType: string;
  debitAccountNumber: string;
  creditAccountNumber: string;
  debitAmount: string | number;
  paymentDetails: string;
  transactionReference: string;
  currency: string;
  beneficiaryDetails: string;
  beneficiaryBankCode?: string;
}

export interface KcbBuniFundsTransferResponse extends KcbBuniResponse {
  responsePayload?: JsonObject;
}

/** The signed till notification: a nested envelope with the payment under `requestPayload`. */
export interface KcbBuniTillNotification extends JsonObject {
  header: {
    messageID: string;
    originatorConversationID: string;
    channelCode?: string;
    timeStamp?: string;
  };
  requestPayload: {
    primaryData?: {
      businessKey?: string;
      businessKeyType?: string;
    };
    additionalData: {
      notificationData: {
        businessKey?: string;
        businessKeyType?: string;
        debitMSISDN?: string;
        transactionAmt: string;
        transactionDate?: string;
        transactionID: string;
        firstName?: string;
        middleName?: string;
        lastName?: string;
        currency: string;
        narration?: string;
        transactionType?: string;
        balance?: string;
      };
    };
  };
}

/** The signed account notification: a flat envelope. */
export interface KcbBuniAccountNotification extends JsonObject {
  transactionReference: string;
  requestId: string;
  channelCode: string;
  timestamp: string;
  transactionAmount: string;
  currency: string;
  customerReference: string;
  customerName: string;
  customerMobileNumber: string;
  balance: string;
  narration: string;
  creditAccountIdentifier: string;
  organizationShortCode: string;
  tillNumber: string;
}

/** The unsigned pre-payment validation request. */
export interface KcbBuniValidationRequest extends JsonObject {
  requestId: string;
  customerReference: string;
  organizationReference: string;
}

export type KcbBuniIpnKind = "till" | "account" | "validation";

export interface KcbBuniIpnAcknowledgement extends JsonObject {
  transactionID: string;
  statusCode: string;
  statusMessage: string;
}

export interface KcbBuniTillAcknowledgement extends JsonObject {
  header: {
    messageID: string;
    originatorConversationID: string;
    statusCode: string;
    statusMessage: string;
  };
  responsePayload: {
    transactionInfo: {
      transactionId: string;
    };
  };
}

export interface KcbBuniEtimsOptions extends KcbBuniRequestOptions {
  method?: HttpMethod;
}
