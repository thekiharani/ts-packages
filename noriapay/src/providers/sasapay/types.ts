import type {
  AccessTokenProvider,
  FetchLike,
  HttpHooks,
  JsonObject,
  NoriapayEnvironment,
  ProviderRequestOptions,
  RetryPolicy,
} from "../../core/types";

interface SasaPayBaseClientOptions {
  environment?: NoriapayEnvironment;
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  tokenCacheSkewMs?: number;
  defaultHeaders?: HeadersInit;
  retry?: RetryPolicy | false;
  hooks?: HttpHooks;
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
