export type ApiKeyEnvironment = "live" | "sandbox";

export type Recipient = string | string[];
export type MailerQueryValue = string | number | boolean | Date | undefined;
export type MailerQueryParams = Record<string, MailerQueryValue | MailerQueryValue[]>;
export type MailerBody =
  | BodyInit
  | ArrayBufferView
  | object
  | null;

export interface EmailTag {
  name: string;
  value: string;
}

export interface SendEmailRequest {
  from: string;
  to: Recipient;
  cc?: Recipient;
  bcc?: Recipient;
  replyTo?: Recipient;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  tags?: EmailTag[];
}

export interface SendEmailResult {
  id: string;
}

export interface Email {
  object: "email";
  id: string;
  from: string;
  to: string[];
  subject: string;
  html: string | null;
  text: string | null;
  cc: string[];
  bcc: string[];
  reply_to: string[];
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
  tags: EmailTag[];
  headers: Record<string, string>;
  message_id: string | null;
  last_event: string;
  updated_at: string;
}

export interface ListEmailsOptions {
  limit?: number;
  offset?: number;
  status?: string;
}

export interface ListResponse<T> {
  object: "list";
  has_more: boolean;
  data: T[];
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
  status: "ok";
}

export interface SuccessEnvelope<T> {
  ok: true;
  data: T;
}

export interface ErrorEnvelope {
  ok: false;
  error: {
    code: string;
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
