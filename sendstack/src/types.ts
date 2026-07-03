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
export type WhatsAppStatus = EmailStatus;
export type TemplateChannel = "email" | "sms" | "whatsapp";
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
  /** WhatsApp templates: the approved Meta template name. */
  templateName?: string;
  template_name?: string;
  /** WhatsApp templates: BCP-47 language tag of the approved template (e.g. `en_US`). */
  language?: string;
  /** WhatsApp templates: ordered names for the `{{1}}`, `{{2}}`… body placeholders. */
  bodyVariables?: string[];
  body_variables?: string[];
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
  templateName?: string;
  template_name?: string;
  language?: string;
  bodyVariables?: string[];
  body_variables?: string[];
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

/** Result of `templates.create(...)`: awaitable to the created template, and chainable
 *  with `.publish()` to create then publish in one expression -
 *  `await client.templates.create({...}).publish()`. */
export interface PublishableTemplate extends Promise<EmailTemplate> {
  publish(options?: SendstackMutationOptions): Promise<EmailTemplate>;
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

export type WhatsAppTemplateCategory = "marketing" | "utility" | "authentication";

export interface WhatsAppTemplateRef {
  name: string;
  /** BCP-47 language tag of the approved template (e.g. `en_US`). */
  language: string;
  /** Values for the template's `{{1}}`, `{{2}}`… body placeholders, in order. */
  variables?: string[];
  category?: WhatsAppTemplateCategory;
}

export interface WhatsAppMediaRef {
  type: "image" | "document" | "video";
  link: string;
  caption?: string;
  filename?: string;
}

/** A send is exactly one content mode: an approved `template` (business-initiated), a
 *  free-form `text` or `media` reply (deliverable only inside the 24h window), or a
 *  local `templateId` reference. */
export interface SendWhatsAppRequest {
  to: string;
  from?: string;
  template?: WhatsAppTemplateRef;
  text?: string;
  media?: WhatsAppMediaRef;
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

export type SendWhatsAppBatchRequest = SendWhatsAppRequest[] | {
  messages: SendWhatsAppRequest[];
};

export interface SendWhatsAppResult {
  id: string;
  status: string;
}

export interface SendWhatsAppBatchResult {
  batch_id: string;
  data: SendWhatsAppResult[];
}

export interface WhatsAppMessage {
  id: string;
  status: string;
  to: string;
  kind: string;
  template_name: string | null;
  language: string | null;
  text: string | null;
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

export interface WhatsAppEvent {
  id: string;
  type: string;
  occurredAt: string;
  [key: string]: unknown;
}

export interface ListWhatsAppOptions {
  limit?: number;
  cursor?: string;
  status?: WhatsAppStatus;
}

export interface CreateWhatsAppSenderRequest {
  phoneNumberId?: string;
  phone_number_id?: string;
  wabaId?: string;
  waba_id?: string;
  /** Cloud API access token; stored encrypted and never echoed back. */
  accessToken?: string;
  access_token?: string;
  displayName?: string;
  display_name?: string;
  identifier?: string;
  isDefault?: boolean;
  is_default?: boolean;
}

export interface WhatsAppSender {
  id: string;
  identifier: string;
  display_name: string | null;
  status: string;
  is_default: boolean;
  phone_number_id: string | null;
  waba_id: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  has_own_token: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppSenderRef {
  id: string;
  object: string;
}

/** A non-paginated collection response (`{ data }` with no cursor), used by the
 *  sender-ID and billing list endpoints. */
export interface SendstackList<T> {
  data: T[];
}

export type SenderIdNetwork = "safaricom" | "airtel" | "telkom";
export type SenderEntityType = "limited_company" | "sole_proprietor";

export interface CreateSenderIdRequest {
  requestedId?: string;
  requested_id?: string;
  entityType?: SenderEntityType;
  entity_type?: SenderEntityType;
  networks: SenderIdNetwork[];
}

export interface SenderKycDocument {
  slug: string;
  filename: string;
  contentBase64?: string;
  content_base64?: string;
  contentType?: string;
  content_type?: string;
}

export interface SenderAuthLetter {
  filename: string;
  contentBase64?: string;
  content_base64?: string;
  contentType?: string;
  content_type?: string;
}

export interface UploadSenderKycRequest {
  documents?: SenderKycDocument[];
  authLetter?: SenderAuthLetter;
  auth_letter?: SenderAuthLetter;
}

export interface PaySenderIdRequest {
  phone: string;
}

export interface PaySenderIdResult {
  payment_id: string;
  status: string;
  customer_message: string | null;
}

export interface SenderIdNetworkState {
  status: string;
  fee_cents: number;
  approved_at?: string | null;
  failure_reason?: string | null;
}

export interface SenderIdRequest {
  id: string;
  requested_id: string;
  entity_type: string;
  status: string;
  networks: Record<string, SenderIdNetworkState>;
  total_cents: number;
  total_kes: number | null;
  missing_kyc: string[];
  kyc_documents: string[];
  has_auth_letter: boolean;
  submitted_via: string;
  sender_id: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SenderIdRequestRef {
  id: string;
  object: string;
}

export interface SenderIdOptions {
  fee_cents: number;
  fee_kes: number;
  total_schedule_cents: number[];
  total_schedule_kes: number[];
  networks: Array<{ code: string; label: string }>;
  entity_types: Array<{
    code: string;
    required_documents: Array<{ slug: string; label: string }>;
  }>;
}

export type CreditChannel = "email" | "sms" | "whatsapp";

export interface CreditsOptions {
  channel?: CreditChannel;
}

export interface CreditBalance {
  remaining: number | null;
  unlimited: boolean;
  active_packs: number;
}

export interface BillingProduct {
  code: string;
  name: string;
  description: string | null;
  kind: string;
  tier: string | null;
  currency: string;
  price_cents: number;
  price_kes: number | null;
  billing_period: string;
  setup_fee_cents: number | null;
  setup_fee_kes: number | null;
  email_credits: number | null;
  sms_credits: number | null;
  validity_days: number | null;
  limits: {
    max_seats: number | null;
    max_domains: number | null;
    max_api_keys: number | null;
    max_dedicated_ips: number | null;
    daily_email_limit: number | null;
    rate_limit_per_min: number | null;
  };
  features: Record<string, unknown>;
  support_level: string;
}

export interface CheckoutRequest {
  productCode?: string;
  product_code?: string;
  phone?: string;
  method?: "mpesa" | "wallet";
}

export interface CheckoutResult {
  payment_id: string | null;
  status: string;
  purchase_id?: string | null;
  balance_cents?: number | null;
  customer_message: string | null;
}

export interface ListPaymentsOptions {
  limit?: number;
}

export interface Payment {
  id: string;
  product_id: string | null;
  purpose: string;
  purchase_id: string | null;
  status: string;
  method: string;
  currency: string;
  amount_cents: number;
  amount_kes: number | null;
  payer_phone: string | null;
  provider_txn_code: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface Purchase {
  id: string;
  kind: string;
  status: string;
  quantity: number;
  amount_cents: number;
  amount_kes: number | null;
  email_credits_granted: number | null;
  email_credits_remaining: number | null;
  starts_at: string;
  expires_at: string | null;
  payment_method: string | null;
  created_at: string;
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

export interface WhatsAppDefaults {
  /** Default sender (business number or its id) applied to every WhatsApp send when the call omits one. */
  from?: string;
}

export interface SendstackClientOptions {
  baseUrl?: string;
  authToken?: string;
  emails?: EmailDefaults;
  sms?: SmsDefaults;
  whatsapp?: WhatsAppDefaults;
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
