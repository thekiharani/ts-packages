import type {
  AccessTokenProvider,
  FetchLike,
  HttpHooks,
  JsonObject,
  NoriapayEnvironment,
  ProviderRequestOptions,
  RetryPolicy,
} from "../../core/types";

interface MpesaBaseClientOptions {
  environment?: NoriapayEnvironment;
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  tokenCacheSkewMs?: number;
  defaultHeaders?: HeadersInit;
  retry?: RetryPolicy | false;
  hooks?: HttpHooks;
}

interface MpesaCredentialAuthOptions {
  consumerKey: string;
  consumerSecret: string;
  tokenProvider?: never;
}

interface MpesaExternalTokenAuthOptions {
  tokenProvider: AccessTokenProvider;
  consumerKey?: never;
  consumerSecret?: never;
}

export type MpesaClientOptions = MpesaBaseClientOptions &
  (MpesaCredentialAuthOptions | MpesaExternalTokenAuthOptions);

export interface MpesaRequestOptions extends ProviderRequestOptions {}

export interface MpesaApiResponse extends JsonObject {
  ConversationID?: string;
  OriginatorConversationID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface MpesaStkPushRequest extends JsonObject {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  Amount: string | number;
  PartyA: string;
  PartyB: string;
  PhoneNumber: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

export interface MpesaStkPushResponse extends MpesaApiResponse {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
}

export interface MpesaStkQueryRequest extends JsonObject {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  CheckoutRequestID: string;
}

export interface MpesaRegisterC2BUrlsRequest extends JsonObject {
  ShortCode: string;
  ResponseType: "Completed" | "Cancelled";
  ConfirmationURL: string;
  ValidationURL: string;
}

export type MpesaC2BRegisterVersion = "v1" | "v2";

export interface MpesaB2CRequest extends JsonObject {
  InitiatorName: string;
  SecurityCredential: string;
  CommandID: "BusinessPayment" | "SalaryPayment" | "PromotionPayment";
  Amount: string | number;
  PartyA: string;
  PartyB: string;
  Remarks: string;
  QueueTimeOutURL: string;
  ResultURL: string;
  Occasion?: string;
}

export interface MpesaB2BRequest extends JsonObject {
  Initiator: string;
  SecurityCredential: string;
  CommandID: "BusinessBuyGoods" | "BusinessPayBill" | "B2BAccountTopUp";
  Amount: string | number;
  PartyA: string;
  PartyB: string;
  Remarks: string;
  AccountReference: string;
  QueueTimeOutURL: string;
  ResultURL: string;
}

export interface MpesaReversalRequest extends JsonObject {
  Initiator: string;
  SecurityCredential: string;
  CommandID: "TransactionReversal";
  TransactionID: string;
  Amount: string | number;
  ReceiverParty: string;
  RecieverIdentifierType: string;
  ResultURL: string;
  QueueTimeOutURL: string;
  Remarks: string;
  Occasion?: string;
}

export interface MpesaTransactionStatusRequest extends JsonObject {
  Initiator: string;
  SecurityCredential: string;
  CommandID: "TransactionStatusQuery";
  TransactionID: string;
  PartyA: string;
  IdentifierType: string;
  ResultURL: string;
  QueueTimeOutURL: string;
  Remarks: string;
  Occasion?: string;
}

export interface MpesaAccountBalanceRequest extends JsonObject {
  Initiator: string;
  SecurityCredential: string;
  CommandID: "AccountBalance";
  PartyA: string;
  IdentifierType: string;
  ResultURL: string;
  QueueTimeOutURL: string;
  Remarks: string;
}

export interface MpesaQrCodeRequest extends JsonObject {
  MerchantName: string;
  MerchantShortCode: string;
  Amount: string | number;
  QRType: "PAYBILL" | "BUYGOODS";
}
