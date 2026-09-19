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
import type { MPESA_ENDPOINTS } from "./client";

export type MpesaEndpointName = keyof typeof MPESA_ENDPOINTS;

interface MpesaBaseClientOptions {
  environment?: NoriapayEnvironment;
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  tokenCacheSkewMs?: number;
  defaultHeaders?: HeadersInit;
  retry?: RetryPolicy | false;
  hooks?: HttpHooks;
  endpoints?: Partial<Record<MpesaEndpointName, string>>;
  throwOnBusinessError?: boolean;
  amountNormalization?: AmountNormalization;
  b2cVersion?: MpesaB2CVersion;
  tokenStore?: TokenStore;
  tokenCacheKey?: string;
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

export interface MpesaFromEnvOptions extends MpesaBaseClientOptions {
  prefix?: string;
  env?: EnvLike;
  tokenProvider?: AccessTokenProvider;
}

export interface MpesaRequestOptions extends ProviderRequestOptions {}

export type MpesaB2CVersion = "v1" | "v3";
export type MpesaC2BRegisterVersion = "v1" | "v2";

export interface MpesaApiResponse extends JsonObject {
  ConversationID?: string;
  OriginatorConversationID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
  errorCode?: string;
  errorMessage?: string;
  requestId?: string;
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

export interface MpesaStkQueryResponse extends MpesaApiResponse {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: string;
  ResultDesc?: string;
}

export interface MpesaRegisterC2BUrlsRequest extends JsonObject {
  ShortCode: string;
  ResponseType: "Completed" | "Cancelled";
  ConfirmationURL: string;
  ValidationURL: string;
}

export interface MpesaC2BSimulateRequest extends JsonObject {
  ShortCode: string;
  CommandID: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  Amount: string | number;
  Msisdn: string;
  BillRefNumber?: string;
}

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
  OriginatorConversationID?: string;
}

export interface MpesaB2BRequest extends JsonObject {
  Initiator: string;
  SecurityCredential: string;
  CommandID:
    | "BusinessBuyGoods"
    | "BusinessPayBill"
    | "BusinessPayToBulk"
    | "B2BAccountTopUp"
    | "DisburseFundsToBusiness"
    | "BusinessToBusinessTransfer";
  SenderIdentifierType?: string;
  RecieverIdentifierType?: string;
  Amount: string | number;
  PartyA: string;
  PartyB: string;
  Remarks: string;
  AccountReference: string;
  QueueTimeOutURL: string;
  ResultURL: string;
  Requester?: string;
}

export interface MpesaB2BExpressCheckoutRequest extends JsonObject {
  primaryShortCode: string;
  receiverShortCode: string;
  amount: string | number;
  paymentRef: string;
  callbackUrl: string;
  partnerName: string;
  RequestRefID: string;
}

export interface MpesaTaxRemittanceRequest extends JsonObject {
  Initiator: string;
  SecurityCredential: string;
  CommandID: "PayTaxToKRA";
  SenderIdentifierType: string;
  RecieverIdentifierType: string;
  Amount: string | number;
  PartyA: string;
  PartyB: string;
  AccountReference: string;
  Remarks: string;
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
  TransactionID?: string;
  OriginatorConversationID?: string;
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
  RefNo?: string;
  Amount: string | number;
  TrxCode?: "BG" | "WA" | "PB" | "SM" | "SB";
  CPI?: string;
  Size?: string;
}

export interface MpesaQrCodeResponse extends MpesaApiResponse {
  QRCode?: string;
  RequestID?: string;
}

export interface MpesaRatibaStandingOrderRequest extends JsonObject {
  StandingOrderName: string;
  StartDate: string;
  EndDate: string;
  BusinessShortCode: string;
  TransactionType: "Standing Order Customer Pay Bill" | "Standing Order Customer Pay Merchant";
  ReceiverPartyIdentifierType: "4" | "2";
  Amount: string | number;
  PartyA: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
  Frequency: string;
}

export interface MpesaPullTransactionsRegisterRequest extends JsonObject {
  ShortCode: string;
  RequestType: "Pull";
  NominatedNumber: string;
  CallBackURL: string;
}

export interface MpesaPullTransactionsRequest extends JsonObject {
  ShortCode: string;
  StartDate: string;
  EndDate: string;
  OffSetValue: string | number;
}

export type MpesaBillManagerRequest = JsonObject;

export interface MpesaStkCallback extends JsonObject {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number | string;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value?: string | number }>;
      };
    };
  };
}

export interface MpesaResultCallback extends JsonObject {
  Result: {
    ResultType: number | string;
    ResultCode: number | string;
    ResultDesc: string;
    OriginatorConversationID?: string;
    ConversationID?: string;
    TransactionID?: string;
    ResultParameters?: {
      ResultParameter: Array<{ Key: string; Value?: string | number }>;
    };
    ReferenceData?: {
      ReferenceItem: Array<{ Key: string; Value?: string | number }> | { Key: string; Value?: string | number };
    };
  };
}

export interface MpesaC2BCallback extends JsonObject {
  TransactionType?: string;
  TransID: string;
  TransTime: string;
  TransAmount: string;
  BusinessShortCode: string;
  BillRefNumber?: string;
  InvoiceNumber?: string;
  OrgAccountBalance?: string;
  ThirdPartyTransID?: string;
  MSISDN: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
}
