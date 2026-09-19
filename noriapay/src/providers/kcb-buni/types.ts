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

export type KcbBuniEnvironment = "uat" | "sandbox" | "production";

export type KcbBuniPayload = JsonObject;

interface KcbBuniBaseClientOptions {
  environment?: KcbBuniEnvironment;
  baseUrl?: string;
  tokenUrl?: string;
  tokenPath?: string;
  apiKey?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  tokenCacheSkewMs?: number;
  defaultHeaders?: HeadersInit;
  retry?: RetryPolicy | false;
  hooks?: HttpHooks;
  endpoints?: Partial<Record<KcbBuniEndpointName, string>>;
  throwOnBusinessError?: boolean;
  amountNormalization?: AmountNormalization;
  validate?: boolean;
  tokenStore?: TokenStore;
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
  headers?: HeadersInit;
}

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

export interface KcbBuniMpesaStkPushRequest extends JsonObject {
  phoneNumber: string;
  amount: string | number;
  invoiceNumber: string;
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
