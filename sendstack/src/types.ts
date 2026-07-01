export const DEFAULT_BASE_URL = "https://sendstack.norialabs.com/api/v1";

export type Recipient = string | string[];
export type SendstackQueryValue = string | number | boolean | Date | undefined;
export type SendstackQueryParams = Record<string, SendstackQueryValue | SendstackQueryValue[]>;
export type SendstackBody =
  | BodyInit
  | ArrayBufferView
  | object
  | null;

export type EmailStatus = "queued" | "sending" | "sent" | "failed" | "canceled";
export type SmsStatus = EmailStatus;
export type TemplateChannel = "email" | "sms";
export type DomainRegion = "af-south-1" | "us-east-1" | "eu-central-1";
export type DomainTlsPolicy = "opportunistic" | "enforced";
export type DomainCapability = "enabled" | "disabled";
export type SuppressionReason = "bounce" | "complaint" | "manual";

export interface SendstackTag {
  name: string;
  value: string;
}

export interface EmailAttachmentInput {
  filename: string;
  contentBase64?: string;
  content_base64?: string;
  content?: string;
  attachmentId?: string;
  attachment_id?: string;
  contentType?: string;
  content_type?: string;
  inline?: boolean;
  contentId?: string;
  content_id?: string;
}

export interface UploadAttachmentRequest {
  filename: string;
  contentBase64?: string;
  content_base64?: string;
  contentType?: string;
  content_type?: string;
}

export interface UploadedAttachment {
  attachment_id: string;
  sha256: string;
  size_bytes: number;
  filename: string;
  content_type: string | null;
}

export interface SendEmailRequest {
  from?: string;
  to: Recipient;
  cc?: Recipient;
  bcc?: Recipient;
  replyTo?: Recipient;
  reply_to?: Recipient;
  subject?: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: EmailAttachmentInput[];
  metadata?: Record<string, string>;
  tags?: SendstackTag[];
  trackOpens?: boolean;
  track_opens?: boolean;
  trackClicks?: boolean;
  track_clicks?: boolean;
  providerId?: string;
  provider_id?: string;
  templateId?: string;
  template_id?: string;
  templateData?: Record<string, unknown>;
  template_data?: Record<string, unknown>;
  scheduledAt?: string | Date;
  scheduled_at?: string | Date;
}

export type SendEmailBatchRequest = SendEmailRequest[] | {
  emails: SendEmailRequest[];
};

export interface SendEmailResult {
  id: string;
  status: string;
}

export interface SendEmailBatchResult {
  batch_id: string;
  data: SendEmailResult[];
}

export interface EmailMessage {
  id: string;
  status: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  batch_id: string | null;
  provider_id: string | null;
  provider_message_id: string | null;
  attempts: number;
  scheduled_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  tags: SendstackTag[];
  created_at: string;
}

export interface EmailEvent {
  id: string;
  messageId: string | null;
  type: string;
  occurredAt: string;
  [key: string]: unknown;
}

export interface ListEmailsOptions {
  limit?: number;
  cursor?: string;
  status?: EmailStatus;
}

export interface CursorPage<T> {
  data: T[];
  next_cursor: string | null;
}

export interface CreateDomainRequest {
  domain?: string;
  name?: string;
  providerId?: string;
  provider_id?: string;
  import?: boolean;
  region?: DomainRegion;
  tls?: DomainTlsPolicy;
  capabilities?: {
    sending?: DomainCapability;
    receiving?: DomainCapability;
  };
  customReturnPath?: string;
  custom_return_path?: string;
}

export interface Domain {
  id: string;
  tenantId: string;
  domain: string;
  status: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface TemplateVariable {
  name: string;
  type?: "string" | "number" | "boolean";
  required?: boolean;
  /** Used at send time when the variable is absent; a required variable with no fallback fails 422. */
  fallback_value?: string | number | boolean;
  description?: string;
  example?: string;
}

export interface DuplicateTemplateRequest {
  name?: string;
}

export interface CreateTemplateRequest {
  channel?: TemplateChannel;
  name: string;
  slug?: string;
  subject?: string;
  html?: string;
  text?: string;
  body?: string;
  variables?: TemplateVariable[];
  sampleData?: Record<string, unknown>;
  sample_data?: Record<string, unknown>;
  from?: string;
  fromName?: string;
  from_name?: string;
  replyTo?: string;
  reply_to?: string;
  preheader?: string;
  category?: string;
  description?: string;
  tags?: string[];
  /** Create and publish in one call; otherwise the template starts as a draft. */
  publish?: boolean;
}

export interface UpdateTemplateRequest {
  subject?: string;
  html?: string | null;
  text?: string | null;
  body?: string;
  variables?: TemplateVariable[];
  sampleData?: Record<string, unknown>;
  sample_data?: Record<string, unknown>;
  from?: string;
  fromName?: string;
  from_name?: string;
  replyTo?: string;
  reply_to?: string;
  preheader?: string;
  category?: string;
  description?: string;
  tags?: string[];
}

export interface PreviewTemplateRequest {
  templateId?: string;
  template_id?: string;
  channel?: TemplateChannel;
  subject?: string;
  html?: string;
  text?: string;
  body?: string;
  templateData?: Record<string, unknown>;
  template_data?: Record<string, unknown>;
}

export interface TemplatePreview {
  channel: string;
  subject: string | null;
  html: string | null;
  text: string | null;
  body: string | null;
  segments: number | null;
  variables: string[];
}

export interface ListTemplatesOptions {
  channel?: TemplateChannel;
  status?: "draft" | "published";
  limit?: number;
  cursor?: string;
}

export interface EmailTemplate {
  id: string;
  tenantId: string;
  channel: string;
  name: string;
  slug: string | null;
  subject: string | null;
  htmlBody: string | null;
  textBody: string | null;
  status: string;
  version: number;
  variables: TemplateVariable[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface SendSmsRequest {
  to: string;
  body?: string;
  from?: string;
  providerId?: string;
  provider_id?: string;
  metadata?: Record<string, string>;
  templateId?: string;
  template_id?: string;
  templateData?: Record<string, unknown>;
  template_data?: Record<string, unknown>;
  scheduledAt?: string | Date;
  scheduled_at?: string | Date;
}

export type SendSmsBatchRequest = SendSmsRequest[] | {
  messages: SendSmsRequest[];
};

export interface SendSmsResult {
  id: string;
  status: string;
}

export interface SendSmsBatchResult {
  batch_id: string;
  data: SendSmsResult[];
}

export interface SmsMessage {
  id: string;
  status: string;
  to: string;
  body: string;
  segments: number;
  sender: string | null;
  sender_id: string | null;
  provider_id: string | null;
  provider_message_id: string | null;
  attempts: number;
  scheduled_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SmsEvent {
  id: string;
  type: string;
  occurredAt: string;
  [key: string]: unknown;
}

export interface ListSmsOptions {
  limit?: number;
  cursor?: string;
  status?: SmsStatus;
}

export type KnownWebhookEvent =
  | "email.queued"
  | "email.sending"
  | "email.sent"
  | "email.failed"
  | "email.canceled"
  | "email.delivered"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained";

export type WebhookEventType = KnownWebhookEvent | (string & {});

export interface CreateWebhookEndpointRequest {
  url: string;
  eventTypes?: WebhookEventType[];
  event_types?: WebhookEventType[];
}

export interface UpdateWebhookEndpointRequest {
  url?: string;
  eventTypes?: WebhookEventType[];
  event_types?: WebhookEventType[];
  enabled?: boolean;
}

export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  secret: string;
  eventTypes: string[];
  enabled: boolean;
  createdAt: string;
  [key: string]: unknown;
}

export interface RetryWebhookEventResult {
  id: string;
  webhook_status: string;
}

export interface CreateSuppressionRequest {
  recipient: string;
  reason?: SuppressionReason;
}

export interface Suppression {
  id: string;
  tenantId: string;
  recipient: string;
  reason: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface CreateSuppressionResult {
  recipient: string;
  reason: string;
}

export interface SuccessEnvelope<T> {
  ok: true;
  data: T;
}

export interface ErrorEnvelope {
  ok: false;
  error: {
    code?: string;
    message: string;
    details?: unknown;
  };
}

export interface SendstackRequestContext {
  method: string;
  path: string;
  url: URL;
  headers: Headers;
  body: BodyInit | null | undefined;
  signal: AbortSignal;
  timeoutMs: number;
  attempt: number;
}

export interface SendstackResponseContext {
  request: SendstackRequestContext;
  response: Response;
  payload: unknown;
}

export interface SendstackRetryContext {
  request: SendstackRequestContext;
  attempt: number;
  response?: Response;
  error?: unknown;
}

export interface SendstackBearerAuthStrategy {
  type: "bearer";
  token: string | ((context: SendstackRequestContext) => string | Promise<string>);
  headerName?: string;
  prefix?: string;
}

export interface SendstackHeadersAuthStrategy {
  type: "headers";
  headers: HeadersInit | ((context: SendstackRequestContext) => HeadersInit | Promise<HeadersInit>);
}

export type SendstackAuthStrategy = SendstackBearerAuthStrategy | SendstackHeadersAuthStrategy;

export interface SendstackRetryOptions {
  maxAttempts?: number;
  delayMs?: number | ((context: SendstackRetryContext) => number | Promise<number>);
  shouldRetry?: (context: SendstackRetryContext) => boolean | Promise<boolean>;
}

export type SendstackResponseParser = (
  response: Response,
  context: SendstackRequestContext,
) => Promise<unknown>;

export type SendstackResponseTransformer = (
  context: SendstackResponseContext,
) => unknown | Promise<unknown>;

export type SendstackMiddleware = (
  context: SendstackRequestContext,
  next: (context: SendstackRequestContext) => Promise<SendstackResponseContext>,
) => Promise<SendstackResponseContext>;

export interface SendstackRequestOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
  timeoutMs?: number;
  fetch?: typeof fetch;
  query?: SendstackQueryParams;
  authenticated?: boolean;
  auth?: SendstackAuthStrategy | false;
  retry?: SendstackRetryOptions | number | false;
  middleware?: SendstackMiddleware[];
  parseResponse?: SendstackResponseParser;
  transformResponse?: SendstackResponseTransformer;
  unwrapData?: boolean;
}

export interface SendstackMutationOptions extends SendstackRequestOptions {
  idempotencyKey?: string;
}

export interface SendstackRawRequestOptions extends SendstackRequestOptions {
  body?: SendstackBody;
  idempotencyKey?: string;
}

export interface EmailDefaults {
  /** Default `from` applied to every email send when the call omits one. */
  from?: string;
}

export interface SmsDefaults {
  /** Default sender id applied to every SMS send when the call omits one. */
  from?: string;
}

export interface SendstackClientOptions {
  baseUrl?: string;
  authToken?: string;
  emails?: EmailDefaults;
  sms?: SmsDefaults;
  fetch?: typeof fetch;
  timeoutMs?: number;
  headers?: HeadersInit;
  query?: SendstackQueryParams;
  auth?: SendstackAuthStrategy | false;
  retry?: SendstackRetryOptions | number | false;
  middleware?: SendstackMiddleware[];
  parseResponse?: SendstackResponseParser;
  transformResponse?: SendstackResponseTransformer;
}
