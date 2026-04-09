import type { FetchLike, Hooks, RequestOptions, RetryPolicy } from "../../core/types";
import type { DeliveryEvent } from "../../events";

export type SmsSendStatus = "submitted" | "failed";

export interface SmsMessage {
  recipient: string;
  text: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface SmsSendRequest {
  messages: SmsMessage[];
  senderId?: string;
  scheduleAt?: Date | string;
  isUnicode?: boolean;
  isFlash?: boolean;
  providerOptions?: Record<string, unknown>;
}

export interface SmsSendReceipt {
  provider: string;
  recipient: string;
  text: string;
  status: SmsSendStatus;
  providerMessageId?: string;
  reference?: string;
  providerErrorCode?: string;
  providerErrorDescription?: string;
  raw?: unknown;
}

export interface SmsSendResult {
  provider: string;
  accepted: boolean;
  errorCode?: string;
  errorDescription?: string;
  messages: SmsSendReceipt[];
  submittedCount: number;
  failedCount: number;
  raw?: unknown;
}

export interface SmsBalanceEntry {
  label?: string;
  creditsRaw?: string;
  credits?: number;
  raw?: unknown;
}

export interface SmsBalance {
  provider: string;
  entries: SmsBalanceEntry[];
  raw?: unknown;
}

export interface SmsGroup {
  groupId: string;
  name: string;
  contactCount?: number;
  raw?: unknown;
}

export interface SmsGroupUpsertRequest {
  name: string;
  providerOptions?: Record<string, unknown>;
}

export interface SmsTemplate {
  templateId: string;
  name: string;
  body: string;
  approved?: boolean;
  active?: boolean;
  createdAt?: string;
  approvedAt?: string;
  raw?: unknown;
}

export interface SmsTemplateUpsertRequest {
  name: string;
  body: string;
  providerOptions?: Record<string, unknown>;
}

export interface SmsManagementResult {
  provider: string;
  success: boolean;
  message?: string;
  resourceId?: string;
  raw?: unknown;
}

export interface SmsGateway {
  readonly providerName: string;
  send(request: SmsSendRequest, options?: RequestOptions): Promise<SmsSendResult>;
  getBalance(options?: RequestOptions): Promise<SmsBalance>;
  parseDeliveryReport(payload: Record<string, unknown>): DeliveryEvent | null;
  close?(): Promise<void> | void;
}

export interface SmsManagementGateway extends SmsGateway {
  listGroups(options?: RequestOptions): Promise<SmsGroup[]>;
  createGroup(request: SmsGroupUpsertRequest, options?: RequestOptions): Promise<SmsManagementResult>;
  updateGroup(
    groupId: string,
    request: SmsGroupUpsertRequest,
    options?: RequestOptions,
  ): Promise<SmsManagementResult>;
  deleteGroup(groupId: string, options?: RequestOptions): Promise<SmsManagementResult>;
  listTemplates(options?: RequestOptions): Promise<SmsTemplate[]>;
  createTemplate(
    request: SmsTemplateUpsertRequest,
    options?: RequestOptions,
  ): Promise<SmsManagementResult>;
  updateTemplate(
    templateId: string,
    request: SmsTemplateUpsertRequest,
    options?: RequestOptions,
  ): Promise<SmsManagementResult>;
  deleteTemplate(templateId: string, options?: RequestOptions): Promise<SmsManagementResult>;
}

export interface OnfonSmsGatewayOptions {
  accessKey: string;
  apiKey: string;
  clientId: string;
  defaultSenderId?: string;
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  defaultHeaders?: HeadersInit;
  retry?: RetryPolicy | false;
  hooks?: Hooks;
}

export interface OnfonSmsFromEnvOptions {
  prefix?: string;
  env?: Record<string, string | undefined>;
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  defaultHeaders?: HeadersInit;
  retry?: RetryPolicy | false;
  hooks?: Hooks;
}

export type SendSmsRequest = SmsSendRequest;
export type SendReceipt = SmsSendReceipt;
export type SendSmsResult = SmsSendResult;
