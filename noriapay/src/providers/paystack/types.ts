import type { EnvLike } from "../../core/config";
import type {
  FetchLike,
  HttpHooks,
  JsonObject,
  ProviderRequestOptions,
  RetryPolicy,
} from "../../core/types";

interface PaystackBaseClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  defaultHeaders?: HeadersInit;
  retry?: RetryPolicy | false;
  hooks?: HttpHooks;
}

export interface PaystackClientOptions extends PaystackBaseClientOptions {
  secretKey: string;
}

export interface PaystackFromEnvOptions extends PaystackBaseClientOptions {
  prefix?: string;
  env?: EnvLike;
}

export interface PaystackRequestOptions extends ProviderRequestOptions {}

export type PaystackBearer = "account" | "subaccount";
export type PaystackPaymentChannel =
  | "card"
  | "bank"
  | "apple_pay"
  | "ussd"
  | "qr"
  | "mobile_money"
  | "bank_transfer"
  | "eft"
  | "capitec_pay"
  | "payattitude";
export type PaystackRecipientType =
  | "authorization"
  | "basa"
  | "ghipss"
  | "kepss"
  | "mobile_money"
  | "mobile_money_business"
  | "nuban";

export interface PaystackApiResponse extends JsonObject {
  status?: boolean;
  message?: string;
}

export interface PaystackInitializeTransactionRequest extends JsonObject {
  amount: string | number;
  email: string;
  channels?: PaystackPaymentChannel[];
  currency?: string;
  reference?: string;
  callback_url?: string;
  plan?: string;
  invoice_limit?: number;
  metadata?: JsonObject | JsonObject[] | string | number | boolean | null;
  split_code?: string;
  subaccount?: string;
  transaction_charge?: number;
  bearer?: PaystackBearer;
}

export interface PaystackInitializeTransactionData extends JsonObject {
  authorization_url?: string;
  access_code?: string;
  reference?: string;
}

export interface PaystackInitializeTransactionResponse extends PaystackApiResponse {
  data?: PaystackInitializeTransactionData;
}

export interface PaystackTransactionAuthorization extends JsonObject {
  authorization_code?: string;
  bin?: string;
  last4?: string;
  exp_month?: string;
  exp_year?: string;
  channel?: string;
  card_type?: string;
  bank?: string;
  country_code?: string;
  brand?: string;
  reusable?: boolean;
  signature?: string;
  account_name?: string | null;
}

export interface PaystackTransactionCustomer extends JsonObject {
  id?: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string;
  customer_code?: string;
  phone?: string | null;
  metadata?: JsonObject | JsonObject[] | string | number | boolean | null;
  risk_action?: string;
  international_format_phone?: string | null;
}

export interface PaystackTransaction extends JsonObject {
  id?: number;
  domain?: string;
  status?: string;
  reference?: string;
  receipt_number?: string | null;
  amount?: number;
  message?: string | null;
  gateway_response?: string;
  paid_at?: string;
  created_at?: string;
  channel?: string;
  currency?: string;
  ip_address?: string;
  metadata?: JsonObject | JsonObject[] | string | number | boolean | null;
  log?: JsonObject | JsonObject[] | string | number | boolean | null;
  fees?: number;
  fees_split?: JsonObject | JsonObject[] | string | number | boolean | null;
  authorization?: PaystackTransactionAuthorization;
  customer?: PaystackTransactionCustomer;
  plan?: JsonObject | JsonObject[] | string | number | boolean | null;
  split?: JsonObject | JsonObject[] | string | number | boolean | null;
  order_id?: JsonObject | JsonObject[] | string | number | boolean | null;
  paidAt?: string;
  createdAt?: string;
  requested_amount?: number;
  pos_transaction_data?: JsonObject | JsonObject[] | string | number | boolean | null;
  source?: JsonObject | JsonObject[] | string | number | boolean | null;
  fees_breakdown?: JsonObject | JsonObject[] | string | number | boolean | null;
  connect?: JsonObject | JsonObject[] | string | number | boolean | null;
  transaction_date?: string;
  plan_object?: JsonObject | JsonObject[] | string | number | boolean | null;
  subaccount?: JsonObject | JsonObject[] | string | number | boolean | null;
}

export interface PaystackVerifyTransactionResponse extends PaystackApiResponse {
  data?: PaystackTransaction;
}

export interface PaystackBank extends JsonObject {
  name?: string;
  slug?: string;
  code?: string;
  longcode?: string;
  gateway?: string | null;
  pay_with_bank?: boolean;
  active?: boolean;
  is_deleted?: boolean | null;
  country?: string;
  currency?: string;
  type?: string;
  id?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaystackCursorMeta extends JsonObject {
  total?: number;
  skipped?: number;
  perPage?: number;
  page?: number;
  pageCount?: number;
  next?: string | null;
  previous?: string | null;
}

export interface PaystackListBanksQuery
  extends Record<string, string | number | boolean | null | undefined> {
  country?: string;
  use_cursor?: boolean;
  perPage?: number;
  pay_with_bank_transfer?: boolean;
  pay_with_bank?: boolean;
  enabled_for_verification?: boolean;
  next?: string;
  previous?: string;
  gateway?: string;
  type?: string;
  currency?: string;
  include_nip_sort_code?: boolean;
}

export interface PaystackListBanksResponse extends PaystackApiResponse {
  data?: PaystackBank[];
  meta?: PaystackCursorMeta;
}

export interface PaystackResolveAccountData extends JsonObject {
  account_number?: string;
  account_name?: string;
  bank_id?: number;
}

export interface PaystackResolveAccountResponse extends PaystackApiResponse {
  data?: PaystackResolveAccountData;
}

export interface PaystackTransferRecipientDetails extends JsonObject {
  authorization_code?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  bank_code?: string | null;
  bank_name?: string | null;
}

export interface PaystackTransferRecipient extends JsonObject {
  active?: boolean;
  createdAt?: string;
  currency?: string;
  description?: string | null;
  domain?: string;
  email?: string | null;
  id?: number;
  integration?: number;
  metadata?: JsonObject | JsonObject[] | string | number | boolean | null;
  name?: string;
  recipient_code?: string;
  type?: string;
  updatedAt?: string;
  is_deleted?: boolean;
  isDeleted?: boolean;
  details?: PaystackTransferRecipientDetails;
}

export interface PaystackCreateTransferRecipientRequest extends JsonObject {
  type: PaystackRecipientType;
  name: string;
  account_number?: string;
  bank_code?: string;
  description?: string;
  currency?: string;
  authorization_code?: string;
  email?: string;
  metadata?: JsonObject | JsonObject[] | string | number | boolean | null;
}

export interface PaystackCreateTransferRecipientResponse extends PaystackApiResponse {
  data?: PaystackTransferRecipient;
}

export interface PaystackTransfer extends JsonObject {
  transfersessionid?: JsonObject[];
  transfertrials?: JsonObject[];
  domain?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  source?: string;
  source_details?: JsonObject | JsonObject[] | string | number | boolean | null;
  reason?: string | null;
  status?: string;
  failures?: JsonObject | JsonObject[] | string | number | boolean | null;
  transfer_code?: string;
  titan_code?: JsonObject | JsonObject[] | string | number | boolean | null;
  transferred_at?: string | null;
  id?: number;
  integration?: number;
  request?: JsonObject | JsonObject[] | string | number | boolean | null;
  recipient?: JsonObject | JsonObject[] | string | number | boolean | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaystackInitiateTransferRequest extends JsonObject {
  source: string;
  amount: number;
  recipient: string;
  reference?: string;
  reason?: string;
  currency?: string;
  account_reference?: string;
}

export interface PaystackInitiateTransferResponse extends PaystackApiResponse {
  data?: PaystackTransfer;
}

export interface PaystackFinalizeTransferRequest extends JsonObject {
  transfer_code: string;
  otp: string;
}

export interface PaystackFinalizeTransferResponse extends PaystackApiResponse {
  data?: PaystackTransfer;
}

export interface PaystackVerifyTransferResponse extends PaystackApiResponse {
  data?: PaystackTransfer;
}
