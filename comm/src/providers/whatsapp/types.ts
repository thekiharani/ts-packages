import type { FetchLike, Hooks, RequestOptions, RetryPolicy } from "../../core/types";
import type { DeliveryEvent } from "../../events";

export type WhatsAppSendStatus = "submitted" | "failed";
export type WhatsAppComponentType = "header" | "body" | "button";
export type WhatsAppMediaType = "image" | "audio" | "document" | "sticker" | "video";
export type WhatsAppInteractiveType = "button" | "list";
export type WhatsAppInteractiveHeaderType = "text" | "image" | "video" | "document";
export type WhatsAppFlowActionType = "navigate" | "data_exchange";
export type WhatsAppInboundMessageType =
  | "text"
  | "image"
  | "audio"
  | "document"
  | "sticker"
  | "video"
  | "location"
  | "contacts"
  | "button"
  | "interactive"
  | "reaction"
  | "unsupported";
export type WhatsAppInboundReplyType = "button" | "button_reply" | "list_reply";

export interface WhatsAppTextRequest {
  recipient: string;
  text: string;
  previewUrl?: boolean;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppTemplateParameter {
  type: string;
  value?: string;
  providerOptions?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface WhatsAppTemplateComponent {
  type: WhatsAppComponentType;
  parameters?: WhatsAppTemplateParameter[];
  subType?: string;
  index?: number;
}

export interface WhatsAppTemplateRequest {
  recipient: string;
  templateName: string;
  languageCode: string;
  components?: WhatsAppTemplateComponent[];
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppTemplateButtonDefinition {
  type: string;
  text?: string;
  phoneNumber?: string;
  url?: string;
  example?: string[];
  flowId?: string;
  flowName?: string;
  flowJson?: string;
  flowAction?: string;
  navigateScreen?: string;
  otpType?: string;
  zeroTapTermsAccepted?: boolean;
  supportedApps?: Record<string, unknown>[];
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppTemplateComponentDefinition {
  type: string;
  format?: string;
  text?: string;
  buttons?: WhatsAppTemplateButtonDefinition[];
  example?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppTemplateListRequest {
  category?: string[];
  content?: string;
  language?: string[];
  name?: string;
  nameOrContent?: string;
  qualityScore?: string[];
  since?: number;
  status?: string[];
  until?: number;
  fields?: string[];
  summaryFields?: string[];
  limit?: number;
  before?: string;
  after?: string;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppTemplateCreateRequest {
  name: string;
  language: string;
  category: string;
  components?: WhatsAppTemplateComponentDefinition[];
  allowCategoryChange?: boolean;
  parameterFormat?: string;
  subCategory?: string;
  messageSendTtlSeconds?: number;
  libraryTemplateName?: string;
  isPrimaryDeviceDeliveryOnly?: boolean;
  creativeSourcingSpec?: Record<string, unknown>;
  libraryTemplateBodyInputs?: Record<string, unknown>;
  libraryTemplateButtonInputs?: Record<string, unknown>[];
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppTemplateUpdateRequest {
  category?: string;
  components?: WhatsAppTemplateComponentDefinition[];
  parameterFormat?: string;
  messageSendTtlSeconds?: number;
  creativeSourcingSpec?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppTemplateDeleteRequest {
  name?: string;
  templateId?: string;
  templateIds?: string[];
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppManagedTemplate {
  provider: string;
  templateId: string;
  name?: string;
  language?: string;
  category?: string;
  status?: string;
  components: WhatsAppTemplateComponentDefinition[];
  parameterFormat?: string;
  subCategory?: string;
  previousCategory?: string;
  correctCategory?: string;
  rejectedReason?: string;
  qualityScore?: string;
  ctaUrlLinkTrackingOptedOut?: boolean;
  libraryTemplateName?: string;
  messageSendTtlSeconds?: number;
  metadata: Record<string, unknown>;
  raw?: unknown;
}

export interface WhatsAppTemplateListSummary {
  totalCount?: number;
  messageTemplateCount?: number;
  messageTemplateLimit?: number;
  areTranslationsComplete?: boolean;
  raw?: unknown;
}

export interface WhatsAppTemplateListResult {
  provider: string;
  templates: WhatsAppManagedTemplate[];
  before?: string;
  after?: string;
  summary?: WhatsAppTemplateListSummary;
  raw?: unknown;
}

export interface WhatsAppTemplateMutationResult {
  provider: string;
  success: boolean;
  templateId?: string;
  name?: string;
  category?: string;
  status?: string;
  raw?: unknown;
}

export interface WhatsAppTemplateDeleteResult {
  provider: string;
  deleted: boolean;
  name?: string;
  templateId?: string;
  templateIds: string[];
  raw?: unknown;
}

export interface WhatsAppMediaRequest {
  recipient: string;
  mediaType: WhatsAppMediaType;
  mediaId?: string;
  link?: string;
  caption?: string;
  filename?: string;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppLocationRequest {
  recipient: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppContactName {
  formattedName: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  suffix?: string;
  prefix?: string;
}

export interface WhatsAppContactPhone {
  phone: string;
  type?: string;
  waId?: string;
}

export interface WhatsAppContactEmail {
  email: string;
  type?: string;
}

export interface WhatsAppContactUrl {
  url: string;
  type?: string;
}

export interface WhatsAppContactAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  countryCode?: string;
  type?: string;
}

export interface WhatsAppContactOrg {
  company?: string;
  department?: string;
  title?: string;
}

export interface WhatsAppContact {
  name: WhatsAppContactName;
  phones?: WhatsAppContactPhone[];
  emails?: WhatsAppContactEmail[];
  urls?: WhatsAppContactUrl[];
  addresses?: WhatsAppContactAddress[];
  org?: WhatsAppContactOrg;
  birthday?: string;
}

export interface WhatsAppContactsRequest {
  recipient: string;
  contacts: WhatsAppContact[];
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppReactionRequest {
  recipient: string;
  messageId: string;
  emoji: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppInteractiveHeader {
  type: WhatsAppInteractiveHeaderType;
  text?: string;
  mediaId?: string;
  link?: string;
  filename?: string;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppInteractiveButton {
  identifier: string;
  title: string;
}

export interface WhatsAppInteractiveRow {
  identifier: string;
  title: string;
  description?: string;
}

export interface WhatsAppInteractiveSection {
  rows: WhatsAppInteractiveRow[];
  title?: string;
}

export interface WhatsAppInteractiveRequest {
  recipient: string;
  interactiveType: WhatsAppInteractiveType;
  bodyText: string;
  header?: WhatsAppInteractiveHeader;
  footerText?: string;
  buttons?: WhatsAppInteractiveButton[];
  buttonText?: string;
  sections?: WhatsAppInteractiveSection[];
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppCatalogMessageRequest {
  recipient: string;
  bodyText?: string;
  header?: WhatsAppInteractiveHeader;
  footerText?: string;
  thumbnailProductRetailerId?: string;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppProductItem {
  productRetailerId: string;
}

export interface WhatsAppProductMessageRequest {
  recipient: string;
  catalogId: string;
  productRetailerId: string;
  bodyText?: string;
  footerText?: string;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppProductSection {
  title: string;
  productItems: WhatsAppProductItem[];
}

export interface WhatsAppProductListRequest {
  recipient: string;
  catalogId: string;
  sections: WhatsAppProductSection[];
  header: WhatsAppInteractiveHeader;
  bodyText?: string;
  footerText?: string;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppFlowMessageRequest {
  recipient: string;
  flowCta: string;
  flowId?: string;
  flowName?: string;
  bodyText?: string;
  header?: WhatsAppInteractiveHeader;
  footerText?: string;
  flowToken?: string;
  flowAction?: WhatsAppFlowActionType;
  flowActionPayload?: Record<string, unknown>;
  flowMessageVersion?: string;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppMediaUploadRequest {
  filename: string;
  content: Buffer | Uint8Array | ArrayBuffer;
  mimeType: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface WhatsAppMediaUploadResult {
  provider: string;
  mediaId: string;
  raw?: unknown;
}

export interface WhatsAppMediaInfo {
  provider: string;
  mediaId: string;
  url?: string;
  mimeType?: string;
  sha256?: string;
  fileSize?: number;
  raw?: unknown;
}

export interface WhatsAppMediaDeleteResult {
  provider: string;
  mediaId: string;
  deleted: boolean;
  raw?: unknown;
}

export interface WhatsAppSendReceipt {
  provider: string;
  recipient: string;
  status: WhatsAppSendStatus;
  providerMessageId?: string;
  providerStatus?: string;
  conversationId?: string;
  errorCode?: string;
  errorDescription?: string;
  raw?: unknown;
}

export interface WhatsAppSendResult {
  provider: string;
  accepted: boolean;
  errorCode?: string;
  errorDescription?: string;
  messages: WhatsAppSendReceipt[];
  submittedCount: number;
  failedCount: number;
  raw?: unknown;
}

export interface WhatsAppInboundMedia {
  mediaType: WhatsAppMediaType;
  mediaId?: string;
  mimeType?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
  raw?: unknown;
}

export interface WhatsAppInboundLocation {
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
  url?: string;
  raw?: unknown;
}

export interface WhatsAppInboundReply {
  replyType: WhatsAppInboundReplyType;
  identifier?: string;
  title?: string;
  description?: string;
  payload?: string;
  raw?: unknown;
}

export interface WhatsAppInboundReaction {
  emoji?: string;
  relatedMessageId?: string;
  raw?: unknown;
}

export interface WhatsAppInboundMessage {
  provider: string;
  senderId: string;
  messageId: string;
  messageType: WhatsAppInboundMessageType;
  timestamp?: string;
  profileName?: string;
  contextMessageId?: string;
  forwarded?: boolean;
  frequentlyForwarded?: boolean;
  text?: string;
  media?: WhatsAppInboundMedia;
  location?: WhatsAppInboundLocation;
  contacts: WhatsAppContact[];
  reply?: WhatsAppInboundReply;
  reaction?: WhatsAppInboundReaction;
  metadata: Record<string, unknown>;
  raw?: unknown;
}

export interface WhatsAppGateway {
  readonly providerName: string;
  sendText(request: WhatsAppTextRequest, options?: RequestOptions): Promise<WhatsAppSendResult>;
  sendTemplate(
    request: WhatsAppTemplateRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult>;
  sendMedia(request: WhatsAppMediaRequest, options?: RequestOptions): Promise<WhatsAppSendResult>;
  sendLocation(
    request: WhatsAppLocationRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult>;
  sendContacts(
    request: WhatsAppContactsRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult>;
  sendReaction(
    request: WhatsAppReactionRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult>;
  sendInteractive(
    request: WhatsAppInteractiveRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult>;
  sendCatalog(
    request: WhatsAppCatalogMessageRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult>;
  sendProduct(
    request: WhatsAppProductMessageRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult>;
  sendProductList(
    request: WhatsAppProductListRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult>;
  sendFlow(request: WhatsAppFlowMessageRequest, options?: RequestOptions): Promise<WhatsAppSendResult>;
  uploadMedia(
    request: WhatsAppMediaUploadRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppMediaUploadResult>;
  getMedia(mediaId: string, options?: RequestOptions): Promise<WhatsAppMediaInfo>;
  deleteMedia(mediaId: string, options?: RequestOptions): Promise<WhatsAppMediaDeleteResult>;
  parseEvents(payload: Record<string, unknown>): DeliveryEvent[];
  parseInboundMessages(payload: Record<string, unknown>): WhatsAppInboundMessage[];
  close?(): Promise<void> | void;
}

export interface WhatsAppTemplateManagementGateway extends WhatsAppGateway {
  listTemplates(
    request?: WhatsAppTemplateListRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppTemplateListResult>;
  getTemplate(
    templateId: string,
    fields?: string[],
    options?: RequestOptions,
  ): Promise<WhatsAppManagedTemplate>;
  createTemplate(
    request: WhatsAppTemplateCreateRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppTemplateMutationResult>;
  updateTemplate(
    templateId: string,
    request: WhatsAppTemplateUpdateRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppTemplateMutationResult>;
  deleteTemplate(
    request: WhatsAppTemplateDeleteRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppTemplateDeleteResult>;
}

export interface MetaWhatsAppGatewayOptions {
  accessToken: string;
  phoneNumberId: string;
  whatsappBusinessAccountId?: string;
  appSecret?: string;
  webhookVerifyToken?: string;
  apiVersion?: string;
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  defaultHeaders?: HeadersInit;
  retry?: RetryPolicy | false;
  hooks?: Hooks;
}

export interface MetaWhatsAppFromEnvOptions {
  prefix?: string;
  env?: Record<string, string | undefined>;
  apiVersion?: string;
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  defaultHeaders?: HeadersInit;
  retry?: RetryPolicy | false;
  hooks?: Hooks;
}
