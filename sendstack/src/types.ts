export type ApiKeyEnvironment = "live" | "sandbox";

export type Recipient = string | string[];
export type MailerQueryValue = string | number | boolean | Date | undefined;
export type MailerQueryParams = Record<string, MailerQueryValue | MailerQueryValue[]>;
export type MailerBody =
  | BodyInit
  | ArrayBufferView
  | object
  | null;

export interface EmailAttachmentInput {
  content: string;
  filename: string;
  contentType?: string;
  content_type?: string;
  contentId?: string;
  content_id?: string;
  disposition?: string;
  contentDisposition?: string;
  content_disposition?: string;
  [key: string]: unknown;
}

export interface ListManagementOptionsInput {
  contactListName?: string;
  contact_list_name?: string;
  topicName?: string | null;
  topic_name?: string | null;
  [key: string]: unknown;
}

export interface SendEmailRequest {
  from: string;
  to: Recipient;
  cc?: Recipient;
  bcc?: Recipient;
  replyTo?: Recipient;
  reply_to?: Recipient;
  contactId?: string;
  contact_id?: string;
  subject: string;
  html?: string;
  text?: string;
  configurationSetName?: string;
  configuration_set_name?: string;
  tenantName?: string;
  tenant_name?: string;
  endpointId?: string;
  endpoint_id?: string;
  feedbackForwardingEmailAddress?: string;
  feedback_forwarding_email_address?: string;
  feedbackForwardingEmailAddressIdentityArn?: string;
  feedback_forwarding_email_address_identity_arn?: string;
  fromEmailAddressIdentityArn?: string;
  from_email_address_identity_arn?: string;
  listManagementOptions?: ListManagementOptionsInput;
  list_management_options?: ListManagementOptionsInput;
  providerConnectionId?: string;
  provider_connection_id?: string;
  scheduledAt?: string | Date;
  scheduled_at?: string | Date;
  tags?: string[];
  headers?: Record<string, string>;
  attachments?: EmailAttachmentInput[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SendSmsRequest {
  from: string;
  to: string;
  text: string;
  contactId?: string;
  contact_id?: string;
  templateId?: string;
  template_id?: string;
  providerConnectionId?: string;
  provider_connection_id?: string;
  idempotencyKey?: string;
  idempotency_key?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SendWhatsAppRequest {
  from: string;
  to: string;
  text?: string;
  contactId?: string;
  contact_id?: string;
  templateId?: string;
  template_id?: string;
  templateVariables?: Record<string, string>;
  template_variables?: Record<string, string>;
  variables?: Record<string, string>;
  providerConnectionId?: string;
  provider_connection_id?: string;
  idempotencyKey?: string;
  idempotency_key?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MessageAttachment {
  id: string;
  filename: string;
  content_type: string | null;
  content_disposition: string | null;
  content_id: string | null;
  size_bytes: number;
  checksum_sha256: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  merchant_id: string;
  sender_identity_id: string | null;
  provider_connection_id: string | null;
  template_id: string | null;
  contact_id: string | null;
  channel: string;
  direction: string;
  provider_name: string | null;
  provider_message_id: string | null;
  to_address: string;
  from_address: string;
  subject: string | null;
  html_body: string | null;
  text_body: string | null;
  status: string;
  error_type: string | null;
  error_subtype: string | null;
  queued_at: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  units_estimated: number;
  units_reserved: number;
  units_consumed: number;
  pricing: Record<string, unknown>;
  attachments: MessageAttachment[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MessageQuote {
  channel: string;
  estimated_units: number;
  available_units: number;
  reserved_units: number;
  can_send: boolean;
  pricing: Record<string, unknown>;
}

export interface MessageBatch {
  messages: Message[];
  recipient_count: number;
  delivery_mode: string;
}

export interface PaginationResponse<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
}

export type ListResponse<T> = PaginationResponse<T>;
export type Email = Message;
export type SendEmailResult = Message;
export type SendSmsResult = Message;
export type SendWhatsAppResult = Message;

export interface ListEmailsOptions {
  limit?: number;
  cursor?: string;
  perPage?: number;
  per_page?: number;
  status?: string;
}

export interface ListMessagesOptions extends ListEmailsOptions {
  channel?: string;
}

export interface CreateDomainRequest {
  name: string;
}

export interface DomainRecord {
  record: string;
  name: string;
  type: string;
  ttl: string;
  status: string;
  value: string;
  priority: number | null;
}

export interface DomainCapabilities {
  sending: string;
  receiving: string;
}

export interface Domain {
  object: "domain";
  id: string;
  name: string;
  status: string;
  region: string;
  created_at: string;
  records: DomainRecord[];
  capabilities: DomainCapabilities;
}

export interface VerifyDomainResult {
  object: "domain";
  id: string;
}

export interface DeleteDomainResult {
  object: "domain";
  id: string;
  deleted: true;
}

export interface CreateApiKeyRequest {
  name?: string;
  environment?: ApiKeyEnvironment;
  expiresAt?: string | Date;
  expires_at?: string | Date;
}

export interface ApiKey {
  id: string;
  accountId: string;
  keyPrefix: string;
  name: string | null;
  environment: ApiKeyEnvironment;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey {
  id: string;
  key: string;
  token: string;
  keyPrefix: string;
  name?: string;
  environment: ApiKeyEnvironment;
  createdAt: string;
}

export interface RevokeApiKeyResult {
  revoked: true;
}

export type KnownWebhookEvent =
  | "email.sent"
  | "email.delivered"
  | "email.bounced"
  | "email.complained"
  | "email.rejected";

export type WebhookEvent = KnownWebhookEvent | (string & {});

export interface CreateWebhookRequest {
  url: string;
  events: WebhookEvent[];
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: WebhookEvent[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeleteWebhookResult {
  deleted: true;
}

export interface HealthStatus {
  status: string;
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

export interface MailerRequestContext {
  method: string;
  path: string;
  url: URL;
  headers: Headers;
  body: BodyInit | null | undefined;
  signal: AbortSignal;
  timeoutMs: number;
  attempt: number;
}

export interface MailerResponseContext {
  request: MailerRequestContext;
  response: Response;
  payload: unknown;
}

export interface MailerRetryContext {
  request: MailerRequestContext;
  attempt: number;
  response?: Response;
  error?: unknown;
}

export interface MailerBearerAuthStrategy {
  type: "bearer";
  token: string | ((context: MailerRequestContext) => string | Promise<string>);
  headerName?: string;
  prefix?: string;
}

export interface MailerHeadersAuthStrategy {
  type: "headers";
  headers: HeadersInit | ((context: MailerRequestContext) => HeadersInit | Promise<HeadersInit>);
}

export type MailerAuthStrategy = MailerBearerAuthStrategy | MailerHeadersAuthStrategy;

export interface MailerRetryOptions {
  maxAttempts?: number;
  delayMs?: number | ((context: MailerRetryContext) => number | Promise<number>);
  shouldRetry?: (context: MailerRetryContext) => boolean | Promise<boolean>;
}

export type MailerResponseParser = (
  response: Response,
  context: MailerRequestContext,
) => Promise<unknown>;

export type MailerResponseTransformer = (
  context: MailerResponseContext,
) => unknown | Promise<unknown>;

export type MailerMiddleware = (
  context: MailerRequestContext,
  next: (context: MailerRequestContext) => Promise<MailerResponseContext>,
) => Promise<MailerResponseContext>;

export interface MailerRequestOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
  timeoutMs?: number;
  fetch?: typeof fetch;
  query?: MailerQueryParams;
  authenticated?: boolean;
  auth?: MailerAuthStrategy | false;
  retry?: MailerRetryOptions | number | false;
  middleware?: MailerMiddleware[];
  parseResponse?: MailerResponseParser;
  transformResponse?: MailerResponseTransformer;
  unwrapData?: boolean;
}

export interface SendEmailOptions extends MailerRequestOptions {
  idempotencyKey?: string;
}

export interface MailerRawRequestOptions extends MailerRequestOptions {
  body?: MailerBody;
  idempotencyKey?: string;
}

export interface MailerClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  headers?: HeadersInit;
  query?: MailerQueryParams;
  auth?: MailerAuthStrategy | false;
  retry?: MailerRetryOptions | number | false;
  middleware?: MailerMiddleware[];
  parseResponse?: MailerResponseParser;
  transformResponse?: MailerResponseTransformer;
}
