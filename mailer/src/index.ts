import { MailerError, isErrorEnvelope } from "./errors";
import type {
  ApiKey,
  CreateApiKeyRequest,
  CreateDomainRequest,
  CreateWebhookRequest,
  CreatedApiKey,
  DeleteDomainResult,
  DeleteWebhookResult,
  Domain,
  Email,
  HealthStatus,
  ListEmailsOptions,
  ListMessagesOptions,
  ListResponse,
  MailerAuthStrategy,
  MailerBody,
  MailerClientOptions,
  MailerMiddleware,
  MailerQueryParams,
  MailerQueryValue,
  MailerRawRequestOptions,
  MailerRequestContext,
  MailerRequestOptions,
  MailerResponseContext,
  MailerResponseParser,
  MailerResponseTransformer,
  MailerRetryContext,
  MailerRetryOptions,
  Message,
  MessageBatch,
  MessageQuote,
  RevokeApiKeyResult,
  SendEmailOptions,
  SendEmailRequest,
  SendEmailResult,
  SendSmsRequest,
  SendSmsResult,
  SendWhatsAppRequest,
  SendWhatsAppResult,
  SuccessEnvelope,
  VerifyDomainResult,
  WebhookEndpoint,
} from "./types";

export { MailerError } from "./errors";
export type {
  ApiKey,
  ApiKeyEnvironment,
  CreateApiKeyRequest,
  CreateDomainRequest,
  CreateWebhookRequest,
  CreatedApiKey,
  DeleteDomainResult,
  DeleteWebhookResult,
  Domain,
  DomainCapabilities,
  DomainRecord,
  Email,
  EmailAttachmentInput,
  ErrorEnvelope,
  HealthStatus,
  KnownWebhookEvent,
  ListEmailsOptions,
  ListManagementOptionsInput,
  ListMessagesOptions,
  ListResponse,
  MailerAuthStrategy,
  MailerBearerAuthStrategy,
  MailerBody,
  MailerClientOptions,
  MailerHeadersAuthStrategy,
  MailerMiddleware,
  MailerQueryParams,
  MailerQueryValue,
  MailerRawRequestOptions,
  MailerRequestContext,
  MailerRequestOptions,
  MailerResponseContext,
  MailerResponseParser,
  MailerResponseTransformer,
  MailerRetryContext,
  MailerRetryOptions,
  Message,
  MessageAttachment,
  MessageBatch,
  MessageQuote,
  PaginationResponse,
  Recipient,
  RevokeApiKeyResult,
  SendEmailOptions,
  SendEmailRequest,
  SendEmailResult,
  SendSmsRequest,
  SendSmsResult,
  SendWhatsAppRequest,
  SendWhatsAppResult,
  SuccessEnvelope,
  VerifyDomainResult,
  WebhookEndpoint,
  WebhookEvent,
} from "./types";

interface NormalizedRetryPolicy {
  maxAttempts: number;
  shouldRetry?: (context: MailerRetryContext) => Promise<boolean>;
  delayMs?: (context: MailerRetryContext) => Promise<number>;
}

export class Mailer {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly emails: {
    quote: <TRequest extends SendEmailRequest>(
      request: TRequest,
      options?: SendEmailOptions,
    ) => Promise<MessageQuote>;
    send: <TRequest extends SendEmailRequest>(
      request: TRequest,
      options?: SendEmailOptions,
    ) => Promise<SendEmailResult>;
    sendBatch: <TRequest extends SendEmailRequest>(
      requests: TRequest[],
      options?: MailerRequestOptions,
    ) => Promise<unknown>;
    get: (id: string, options?: MailerRequestOptions) => Promise<Email>;
    list: <TOptions extends ListEmailsOptions & MailerRequestOptions>(
      options?: TOptions,
    ) => Promise<ListResponse<Message>>;
  };
  readonly sms: {
    quote: <TRequest extends SendSmsRequest>(
      request: TRequest,
      options?: SendEmailOptions,
    ) => Promise<MessageQuote>;
    send: <TRequest extends SendSmsRequest>(
      request: TRequest,
      options?: SendEmailOptions,
    ) => Promise<SendSmsResult>;
    get: (id: string, options?: MailerRequestOptions) => Promise<Message>;
    list: <TOptions extends ListEmailsOptions & MailerRequestOptions>(
      options?: TOptions,
    ) => Promise<ListResponse<Message>>;
  };
  readonly whatsapp: {
    quote: <TRequest extends SendWhatsAppRequest>(
      request: TRequest,
      options?: SendEmailOptions,
    ) => Promise<MessageQuote>;
    send: <TRequest extends SendWhatsAppRequest>(
      request: TRequest,
      options?: SendEmailOptions,
    ) => Promise<SendWhatsAppResult>;
    get: (id: string, options?: MailerRequestOptions) => Promise<Message>;
    list: <TOptions extends ListEmailsOptions & MailerRequestOptions>(
      options?: TOptions,
    ) => Promise<ListResponse<Message>>;
  };
  readonly merchant: {
    messages: {
      get: (merchantId: string, messageId: string, options?: MailerRequestOptions) => Promise<Message>;
      list: <TOptions extends ListMessagesOptions & MailerRequestOptions>(
        merchantId: string,
        options?: TOptions,
      ) => Promise<ListResponse<Message>>;
    };
    emails: {
      quote: <TRequest extends SendEmailRequest>(
        merchantId: string,
        request: TRequest,
        options?: SendEmailOptions,
      ) => Promise<MessageQuote>;
      quoteGroup: <TRequest extends SendEmailRequest>(
        merchantId: string,
        request: TRequest,
        options?: SendEmailOptions,
      ) => Promise<MessageQuote>;
      send: <TRequest extends SendEmailRequest>(
        merchantId: string,
        request: TRequest,
        options?: SendEmailOptions,
      ) => Promise<Message>;
      sendGroup: <TRequest extends SendEmailRequest>(
        merchantId: string,
        request: TRequest,
        options?: SendEmailOptions,
      ) => Promise<MessageBatch>;
    };
    sms: {
      quote: <TRequest extends SendSmsRequest>(
        merchantId: string,
        request: TRequest,
        options?: SendEmailOptions,
      ) => Promise<MessageQuote>;
      send: <TRequest extends SendSmsRequest>(
        merchantId: string,
        request: TRequest,
        options?: SendEmailOptions,
      ) => Promise<Message>;
    };
    whatsapp: {
      quote: <TRequest extends SendWhatsAppRequest>(
        merchantId: string,
        request: TRequest,
        options?: SendEmailOptions,
      ) => Promise<MessageQuote>;
      send: <TRequest extends SendWhatsAppRequest>(
        merchantId: string,
        request: TRequest,
        options?: SendEmailOptions,
      ) => Promise<Message>;
    };
  };
  readonly domains: {
    create: <TRequest extends CreateDomainRequest>(
      request: TRequest,
      options?: MailerRequestOptions,
    ) => Promise<Domain>;
    list: (options?: MailerRequestOptions) => Promise<ListResponse<Domain>>;
    get: (id: string, options?: MailerRequestOptions) => Promise<Domain>;
    verify: (id: string, options?: MailerRequestOptions) => Promise<VerifyDomainResult>;
    remove: (id: string, options?: MailerRequestOptions) => Promise<DeleteDomainResult>;
  };
  readonly apiKeys: {
    create: <TRequest extends CreateApiKeyRequest>(
      request?: TRequest,
      options?: MailerRequestOptions,
    ) => Promise<CreatedApiKey>;
    list: (options?: MailerRequestOptions) => Promise<ApiKey[]>;
    get: (id: string, options?: MailerRequestOptions) => Promise<ApiKey>;
    remove: (id: string, options?: MailerRequestOptions) => Promise<RevokeApiKeyResult>;
  };
  readonly webhooks: {
    create: <TRequest extends CreateWebhookRequest>(
      request: TRequest,
      options?: MailerRequestOptions,
    ) => Promise<WebhookEndpoint>;
    list: (options?: MailerRequestOptions) => Promise<WebhookEndpoint[]>;
    remove: (id: string, options?: MailerRequestOptions) => Promise<DeleteWebhookResult>;
  };
  readonly health: {
    live: (options?: MailerRequestOptions) => Promise<HealthStatus>;
    check: (options?: MailerRequestOptions) => Promise<HealthStatus>;
    ready: (options?: MailerRequestOptions) => Promise<HealthStatus>;
  };

  readonly #fetch: typeof fetch;
  readonly #headers: HeadersInit | undefined;
  readonly #query: MailerQueryParams | undefined;
  readonly #auth: MailerAuthStrategy | false;
  readonly #middleware: MailerMiddleware[];
  readonly #retry: MailerRetryOptions | number | false | undefined;
  readonly #parseResponse: MailerResponseParser;
  readonly #transformResponse: MailerResponseTransformer;

  constructor(options: MailerClientOptions);
  constructor(apiKey: string, options: MailerClientOptions);
  constructor(
    apiKeyOrOptions: string | MailerClientOptions,
    maybeOptions?: MailerClientOptions,
  ) {
    const options = typeof apiKeyOrOptions === "string" ? maybeOptions : apiKeyOrOptions;
    const apiKey = typeof apiKeyOrOptions === "string" ? apiKeyOrOptions : "";

    if (!options?.baseUrl || options.baseUrl.trim() === "") {
      throw new TypeError("Mailer baseUrl is required.");
    }

    if (typeof fetch !== "function" && !options.fetch) {
      throw new TypeError("A fetch implementation is required in this runtime.");
    }

    const normalizedApiKey = apiKey.trim();

    this.apiKey = normalizedApiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.#fetch = options.fetch ?? fetch;
    this.#headers = options.headers;
    this.#query = options.query;
    this.#auth = options.auth ?? (
      normalizedApiKey === ""
        ? false
        : {
            type: "headers",
            headers: {
              "x-api-key": normalizedApiKey,
            },
          }
    );
    this.#middleware = options.middleware ?? [];
    this.#retry = options.retry;
    this.#parseResponse = options.parseResponse ?? parseResponseBody;
    this.#transformResponse = options.transformResponse ?? defaultTransformResponse;

    this.emails = {
      quote: (request, requestOptions) =>
        this.request("POST", "/emails/quote", {
          ...requestOptions,
          body: normalizeSendEmailRequest(request),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      send: (request, requestOptions) =>
        this.request("POST", "/emails", {
          ...requestOptions,
          body: normalizeSendEmailRequest(request),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      sendBatch: (requests, requestOptions) =>
        this.request("POST", "/emails/batch", {
          ...requestOptions,
          body: requests.map((request) => normalizeSendEmailRequest(request)),
          transformResponse: requestOptions?.transformResponse ?? extractDataArrayResponse,
        }),
      get: (id, requestOptions) =>
        this.request("GET", `/emails/${encodeURIComponent(id)}`, requestOptions),
      list: (requestOptions) =>
        this.request("GET", "/emails", {
          ...requestOptions,
          query: mergeListQuery(requestOptions),
        }),
    };

    this.sms = {
      quote: (request, requestOptions) =>
        this.request("POST", "/sms/quote", {
          ...requestOptions,
          body: normalizeSmsRequest(request),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      send: (request, requestOptions) =>
        this.request("POST", "/sms", {
          ...requestOptions,
          body: normalizeSmsRequest(request),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      get: (id, requestOptions) =>
        this.request("GET", `/sms/${encodeURIComponent(id)}`, requestOptions),
      list: (requestOptions) =>
        this.request("GET", "/sms", {
          ...requestOptions,
          query: mergeListQuery(requestOptions),
        }),
    };

    this.whatsapp = {
      quote: (request, requestOptions) =>
        this.request("POST", "/whatsapp/messages/quote", {
          ...requestOptions,
          body: normalizeWhatsAppRequest(request),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      send: (request, requestOptions) =>
        this.request("POST", "/whatsapp/messages", {
          ...requestOptions,
          body: normalizeWhatsAppRequest(request),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      get: (id, requestOptions) =>
        this.request("GET", `/whatsapp/messages/${encodeURIComponent(id)}`, requestOptions),
      list: (requestOptions) =>
        this.request("GET", "/whatsapp/messages", {
          ...requestOptions,
          query: mergeListQuery(requestOptions),
        }),
    };

    this.merchant = {
      messages: {
        get: (merchantId, messageId, requestOptions) =>
          this.request(
            "GET",
            merchantMessagesPath(merchantId, `/${encodeURIComponent(messageId)}`),
            requestOptions,
          ),
        list: (merchantId, requestOptions) =>
          this.request("GET", merchantMessagesPath(merchantId), {
            ...requestOptions,
            query: mergeListQuery(requestOptions, {
              channel: requestOptions?.channel,
            }),
          }),
      },
      emails: {
        quote: (merchantId, request, requestOptions) =>
          this.request("POST", merchantMessagesPath(merchantId, "/email/quote"), {
            ...requestOptions,
            body: normalizeSendEmailRequest(request),
            idempotencyKey: requestOptions?.idempotencyKey,
          }),
        quoteGroup: (merchantId, request, requestOptions) =>
          this.request("POST", merchantMessagesPath(merchantId, "/email/group/quote"), {
            ...requestOptions,
            body: normalizeSendEmailRequest(request),
            idempotencyKey: requestOptions?.idempotencyKey,
          }),
        send: (merchantId, request, requestOptions) =>
          this.request("POST", merchantMessagesPath(merchantId, "/email"), {
            ...requestOptions,
            body: normalizeSendEmailRequest(request),
            idempotencyKey: requestOptions?.idempotencyKey,
          }),
        sendGroup: (merchantId, request, requestOptions) =>
          this.request("POST", merchantMessagesPath(merchantId, "/email/group"), {
            ...requestOptions,
            body: normalizeSendEmailRequest(request),
            idempotencyKey: requestOptions?.idempotencyKey,
          }),
      },
      sms: {
        quote: (merchantId, request, requestOptions) =>
          this.request("POST", merchantMessagesPath(merchantId, "/sms/quote"), {
            ...requestOptions,
            body: normalizeSmsRequest(request),
            idempotencyKey: requestOptions?.idempotencyKey,
          }),
        send: (merchantId, request, requestOptions) =>
          this.request("POST", merchantMessagesPath(merchantId, "/sms"), {
            ...requestOptions,
            body: normalizeSmsRequest(request),
            idempotencyKey: requestOptions?.idempotencyKey,
          }),
      },
      whatsapp: {
        quote: (merchantId, request, requestOptions) =>
          this.request("POST", merchantMessagesPath(merchantId, "/whatsapp/quote"), {
            ...requestOptions,
            body: normalizeWhatsAppRequest(request),
            idempotencyKey: requestOptions?.idempotencyKey,
          }),
        send: (merchantId, request, requestOptions) =>
          this.request("POST", merchantMessagesPath(merchantId, "/whatsapp"), {
            ...requestOptions,
            body: normalizeWhatsAppRequest(request),
            idempotencyKey: requestOptions?.idempotencyKey,
          }),
      },
    };

    this.domains = {
      create: (request, requestOptions) =>
        this.request("POST", "/domains", { ...requestOptions, body: request }),
      list: (requestOptions) =>
        this.request("GET", "/domains", requestOptions),
      get: (id, requestOptions) =>
        this.request("GET", `/domains/${encodeURIComponent(id)}`, requestOptions),
      verify: (id, requestOptions) =>
        this.request("POST", `/domains/${encodeURIComponent(id)}/verify`, requestOptions),
      remove: (id, requestOptions) =>
        this.request("DELETE", `/domains/${encodeURIComponent(id)}`, requestOptions),
    };

    this.apiKeys = {
      create: (request, requestOptions) =>
        this.request("POST", "/api-keys", {
          ...requestOptions,
          body: serializeCreateApiKeyRequest(request),
        }),
      list: (requestOptions) =>
        this.request("GET", "/api-keys", requestOptions),
      get: (id, requestOptions) =>
        this.request("GET", `/api-keys/${encodeURIComponent(id)}`, requestOptions),
      remove: (id, requestOptions) =>
        this.request("DELETE", `/api-keys/${encodeURIComponent(id)}`, requestOptions),
    };

    this.webhooks = {
      create: (request, requestOptions) =>
        this.request("POST", "/webhooks", { ...requestOptions, body: request }),
      list: (requestOptions) =>
        this.request("GET", "/webhooks", requestOptions),
      remove: (id, requestOptions) =>
        this.request("DELETE", `/webhooks/${encodeURIComponent(id)}`, requestOptions),
    };

    this.health = {
      live: (requestOptions) =>
        this.request("GET", rootUrlPath(this.baseUrl, "/livez"), withDefaultUnauthenticated(requestOptions)),
      check: (requestOptions) =>
        this.request("GET", rootUrlPath(this.baseUrl, "/healthz"), withDefaultUnauthenticated(requestOptions)),
      ready: (requestOptions) =>
        this.request("GET", rootUrlPath(this.baseUrl, "/readyz"), withDefaultUnauthenticated(requestOptions)),
    };
  }

  async request<T>(
    method: string,
    path: string,
    options: MailerRawRequestOptions = {},
  ): Promise<T> {
    const fetchImpl = options.fetch ?? this.#fetch;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const parseResponse = options.parseResponse ?? this.#parseResponse;
    const transformResponse = options.transformResponse ?? this.#transformResponse;
    const retry = normalizeRetryPolicy(options.retry ?? this.#retry);
    const middleware = [...this.#middleware, ...(options.middleware ?? [])];
    const mergedQuery = mergeQueryParams(this.#query, options.query);

    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      const url = buildRequestUrl(this.baseUrl, path);
      appendQueryParams(url, mergedQuery);

      const requestSignal = createRequestSignal(timeoutMs, options.signal);

      try {
        const context = await this.buildRequestContext({
          attempt,
          method,
          path,
          url,
          timeoutMs,
          signal: requestSignal.signal,
          options,
        });
        const responseContext = await runMiddlewareStack(
          middleware,
          context,
          (requestContext) => transport(requestContext, fetchImpl, parseResponse),
        );

        if (
          !responseContext.response.ok
          && attempt < retry.maxAttempts
          && await retry.shouldRetry!({
            request: responseContext.request,
            attempt,
            response: responseContext.response,
          })
        ) {
          await sleep(await retry.delayMs!({
            request: responseContext.request,
            attempt,
            response: responseContext.response,
          }));
          requestSignal.cleanup();
          continue;
        }

        const result = await applyResponseTransform<T>(responseContext, transformResponse, options.unwrapData);
        requestSignal.cleanup();
        return result;
      } catch (error) {
        if (
          attempt < retry.maxAttempts
          && await retry.shouldRetry!({
            request: {
              method,
              path,
              url,
              headers: mergeHeaders(this.#headers, options.headers),
              body: undefined,
              signal: requestSignal.signal,
              timeoutMs,
              attempt,
            },
            attempt,
            error,
          })
        ) {
          await sleep(await retry.delayMs!({
            request: {
              method,
              path,
              url,
              headers: mergeHeaders(this.#headers, options.headers),
              body: undefined,
              signal: requestSignal.signal,
              timeoutMs,
              attempt,
            },
            attempt,
            error,
          }));
          requestSignal.cleanup();
          continue;
        }

        requestSignal.cleanup();
        throw error;
      }
    }

    throw new MailerError("Mailer request exhausted all retry attempts.", {
      statusCode: 0,
    });
  }

  private async buildRequestContext(input: {
    attempt: number;
    method: string;
    path: string;
    url: URL;
    timeoutMs: number;
    signal: AbortSignal;
    options: MailerRawRequestOptions;
  }): Promise<MailerRequestContext> {
    const headers = mergeHeaders(this.#headers, input.options.headers);
    const authenticated = input.options.authenticated ?? true;
    const auth = input.options.auth === undefined ? this.#auth : input.options.auth;

    if (!authenticated) {
      headers.delete("authorization");
      headers.delete("x-api-key");
    } else {
      if (!auth && !hasExplicitAuthHeaders(headers)) {
        throw new TypeError("Mailer auth is required for authenticated requests.");
      }

      if (auth) {
        const authHeaders = await resolveAuthHeaders(auth, {
          method: input.method,
          path: input.path,
          url: input.url,
          headers,
          body: undefined,
          signal: input.signal,
          timeoutMs: input.timeoutMs,
          attempt: input.attempt,
        });

        authHeaders.forEach((value, key) => {
          headers.set(key, value);
        });
      }
    }

    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }

    if (input.options.idempotencyKey) {
      headers.set("idempotency-key", input.options.idempotencyKey);
    }

    const body = prepareRequestBody(input.options.body, headers);

    return {
      method: input.method,
      path: input.path,
      url: input.url,
      headers,
      body,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
      attempt: input.attempt,
    };
  }
}

async function applyResponseTransform<T>(
  context: MailerResponseContext,
  transformResponse: MailerResponseTransformer,
  unwrapData?: boolean,
): Promise<T> {
  if (transformResponse === defaultTransformResponse) {
    return defaultTransformResponse(context, unwrapData) as T;
  }

  return await transformResponse(context) as T;
}

function defaultTransformResponse(
  context: MailerResponseContext,
  unwrapData = true,
): unknown {
  if (!context.response.ok) {
    throw toMailerError(context.response.status, context.payload);
  }

  if (unwrapData && isSuccessEnvelope(context.payload)) {
    return context.payload.data;
  }

  return context.payload;
}

function extractDataArrayResponse(context: MailerResponseContext): unknown {
  const payload = defaultTransformResponse(context, false);

  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record["data"])) {
      return record["data"];
    }
  }

  return payload;
}

function serializeCreateApiKeyRequest(request?: CreateApiKeyRequest): Record<string, unknown> {
  if (!request) {
    return {};
  }

  const payload = { ...request } as Record<string, unknown>;
  renameAlias(payload, "expires_at", "expiresAt");

  if (payload["expiresAt"] instanceof Date) {
    payload["expiresAt"] = payload["expiresAt"].toISOString();
  }

  return payload;
}

function normalizeSendEmailRequest(request: SendEmailRequest): Record<string, unknown> {
  const payload = { ...request } as Record<string, unknown>;
  renameAlias(payload, "reply_to", "replyTo");
  renameAlias(payload, "scheduled_at", "scheduledAt");
  renameAlias(payload, "configuration_set_name", "configurationSetName");
  renameAlias(payload, "tenant_name", "tenantName");
  renameAlias(payload, "endpoint_id", "endpointId");
  renameAlias(payload, "feedback_forwarding_email_address", "feedbackForwardingEmailAddress");
  renameAlias(
    payload,
    "feedback_forwarding_email_address_identity_arn",
    "feedbackForwardingEmailAddressIdentityArn",
  );
  renameAlias(payload, "from_email_address_identity_arn", "fromEmailAddressIdentityArn");
  renameAlias(payload, "list_management_options", "listManagementOptions");
  renameAlias(payload, "contactId", "contact_id");
  renameAlias(payload, "providerConnectionId", "provider_connection_id");

  if (payload["scheduledAt"] instanceof Date) {
    payload["scheduledAt"] = payload["scheduledAt"].toISOString();
  }

  const listManagementOptions = payload["listManagementOptions"];
  if (isRecord(listManagementOptions)) {
    payload["listManagementOptions"] = normalizeListManagementOptions(listManagementOptions);
  }

  const attachments = payload["attachments"];
  if (Array.isArray(attachments)) {
    payload["attachments"] = attachments.map((attachment) =>
      isRecord(attachment) ? normalizeEmailAttachment(attachment) : attachment);
  }

  return payload;
}

function normalizeMessageRequestAliases(request: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...request } as Record<string, unknown>;
  renameAlias(payload, "contactId", "contact_id");
  renameAlias(payload, "templateId", "template_id");
  renameAlias(payload, "providerConnectionId", "provider_connection_id");
  renameAlias(payload, "idempotencyKey", "idempotency_key");
  return payload;
}

function normalizeSmsRequest(request: SendSmsRequest): Record<string, unknown> {
  return normalizeMessageRequestAliases(request);
}

function normalizeWhatsAppRequest(request: SendWhatsAppRequest): Record<string, unknown> {
  const payload = normalizeMessageRequestAliases(request);
  renameAlias(payload, "templateVariables", "variables");
  renameAlias(payload, "template_variables", "variables");
  return payload;
}

function normalizeListManagementOptions(options: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...options };
  renameAlias(payload, "contact_list_name", "contactListName");
  renameAlias(payload, "topic_name", "topicName");
  return payload;
}

function normalizeEmailAttachment(attachment: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...attachment };
  renameAlias(payload, "content_type", "contentType");
  renameAlias(payload, "content_id", "contentId");
  renameAlias(payload, "contentDisposition", "disposition");
  renameAlias(payload, "content_disposition", "disposition");
  return payload;
}

function renameAlias(payload: Record<string, unknown>, sourceName: string, targetName: string) {
  if (sourceName in payload && !(targetName in payload)) {
    payload[targetName] = payload[sourceName];
    delete payload[sourceName];
  }
}

function isSuccessEnvelope<T>(value: unknown): value is SuccessEnvelope<T> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record["ok"] === true && "data" in record;
}

function toMailerError(statusCode: number, payload: unknown): MailerError {
  if (isErrorEnvelope(payload)) {
    return new MailerError(payload.error.message, {
      statusCode,
      code: payload.error.code,
      details: payload.error.details,
      responseBody: payload,
    });
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record["detail"] === "string" && record["detail"].trim() !== "") {
      return new MailerError(record["detail"], {
        statusCode,
        details: record["errors"],
        responseBody: payload,
      });
    }
  }

  if (payload instanceof Error) {
    return new MailerError(payload.message, {
      statusCode,
      responseBody: payload,
    });
  }

  if (typeof payload === "string" && payload.trim() !== "") {
    return new MailerError(payload, {
      statusCode,
      responseBody: payload,
    });
  }

  return new MailerError(`Mailer request failed with status ${statusCode}.`, {
    statusCode,
    responseBody: payload,
  });
}

function withDefaultUnauthenticated(options?: MailerRequestOptions): MailerRequestOptions {
  return {
    ...options,
    authenticated: options?.authenticated ?? false,
  };
}

function mergeListQuery(
  options?: (ListEmailsOptions & MailerRequestOptions) | (ListMessagesOptions & MailerRequestOptions),
  extra?: MailerQueryParams,
): MailerQueryParams | undefined {
  return mergeQueryParams(
    {
      limit: options?.limit,
      cursor: options?.cursor,
      per_page: options?.perPage ?? options?.per_page,
      status: options?.status,
    },
    extra,
    options?.query,
  );
}

function merchantMessagesPath(merchantId: string, suffix = ""): string {
  const path = `/merchants/${encodeURIComponent(merchantId)}/messages`;
  return suffix === "" ? path : `${path}${suffix}`;
}

function rootUrlPath(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  return `${url.protocol}//${url.host}${path}`;
}

function hasExplicitAuthHeaders(headers: Headers): boolean {
  return headers.has("authorization") || headers.has("x-api-key");
}

function createRequestSignal(
  timeoutMs: number,
  upstreamSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  if (timeoutMs <= 0) {
    return {
      signal: upstreamSignal ?? AbortSignal.abort("Mailer request timed out."),
      cleanup: () => {},
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Mailer request timed out after ${timeoutMs}ms.`));
  }, timeoutMs);
  let detachUpstreamAbort: (() => void) | undefined;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) {
      return;
    }

    cleaned = true;
    clearTimeout(timer);
    detachUpstreamAbort?.();
  };

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort(upstreamSignal.reason);
      cleanup();
      return { signal: controller.signal, cleanup };
    }

    const abortFromUpstream = () => {
      controller.abort(upstreamSignal.reason);
      cleanup();
    };

    upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
    detachUpstreamAbort = () => {
      upstreamSignal.removeEventListener("abort", abortFromUpstream);
    };
  }

  controller.signal.addEventListener(
    "abort",
    () => cleanup(),
    { once: true },
  );

  return { signal: controller.signal, cleanup };
}

async function transport(
  context: MailerRequestContext,
  fetchImpl: typeof fetch,
  parseResponse: MailerResponseParser,
): Promise<MailerResponseContext> {
  const response = await fetchImpl(context.url, {
    method: context.method,
    headers: context.headers,
    body: context.body,
    signal: context.signal,
  });

  const payload = await parseResponse(response, context);
  return {
    request: context,
    response,
    payload,
  };
}

async function runMiddlewareStack(
  middleware: MailerMiddleware[],
  context: MailerRequestContext,
  terminal: (context: MailerRequestContext) => Promise<MailerResponseContext>,
): Promise<MailerResponseContext> {
  const pipeline = middleware.reduceRight<(context: MailerRequestContext) => Promise<MailerResponseContext>>(
    (next, current) => async (requestContext: MailerRequestContext) => await current(requestContext, next),
    terminal,
  );

  return await pipeline(context);
}

async function parseResponseBody(response: Response, _context: MailerRequestContext): Promise<unknown> {
  const text = await response.text();

  if (text.trim() === "") {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return JSON.parse(text) as unknown;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function resolveAuthHeaders(
  auth: MailerAuthStrategy,
  context: MailerRequestContext,
): Promise<Headers> {
  if (auth.type === "bearer") {
    const token = typeof auth.token === "function"
      ? await auth.token(context)
      : auth.token;
    const headers = new Headers();
    headers.set(auth.headerName ?? "authorization", `${auth.prefix ?? "Bearer"} ${token}`);
    return headers;
  }

  const value = typeof auth.headers === "function"
    ? await auth.headers(context)
    : auth.headers;
  return new Headers(value);
}

function normalizeBaseUrl(baseUrl: string): string {
  let parsed: URL;

  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new TypeError("Mailer baseUrl must be a valid absolute URL.");
  }

  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function buildRequestUrl(baseUrl: string, path: string): URL {
  try {
    return new URL(path);
  } catch {
    const normalizedPath = path.replace(/^\/+/, "");
    return new URL(normalizedPath, `${baseUrl}/`);
  }
}

function appendQueryParams(url: URL, query?: MailerQueryParams) {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.delete(key);

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) {
          url.searchParams.append(key, serializeQueryValue(item));
        }
      }
      continue;
    }

    if (value !== undefined) {
      url.searchParams.set(key, serializeQueryValue(value));
    }
  }
}

function serializeQueryValue(value: Exclude<MailerQueryValue, undefined>): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mergeQueryParams(...parts: Array<MailerQueryParams | undefined>): MailerQueryParams | undefined {
  const merged: MailerQueryParams = {};

  for (const part of parts) {
    if (!part) {
      continue;
    }

    for (const [key, value] of Object.entries(part)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeHeaders(...parts: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();

  for (const part of parts) {
    if (!part) {
      continue;
    }

    const incoming = new Headers(part);
    incoming.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

function prepareRequestBody(body: MailerBody | undefined, headers: Headers): BodyInit | null | undefined {
  if (body === undefined) {
    return undefined;
  }

  if (isNativeBody(body)) {
    return body;
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return JSON.stringify(body);
}

function isNativeBody(body: MailerBody): body is BodyInit {
  return typeof body === "string"
    || body instanceof Blob
    || body instanceof FormData
    || body instanceof URLSearchParams
    || body instanceof ArrayBuffer
    || ArrayBuffer.isView(body)
    || isReadableStream(body);
}

function isReadableStream(value: unknown): value is ReadableStream {
  return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRetryPolicy(retry: MailerRetryOptions | number | false | undefined): NormalizedRetryPolicy {
  if (retry === false || retry === undefined) {
    return { maxAttempts: 1 };
  }

  const config = typeof retry === "number"
    ? { maxAttempts: retry }
    : retry;
  const maxAttempts = Math.max(1, Math.floor(config.maxAttempts ?? 2));

  return {
    maxAttempts,
    shouldRetry: async (context) =>
      await Promise.resolve(config.shouldRetry?.(context) ?? defaultShouldRetry(context)),
    delayMs: async (context) => {
      const delayMs = typeof config.delayMs === "function"
        ? await config.delayMs(context)
        : config.delayMs;
      return Math.max(0, delayMs ?? defaultRetryDelay(context.attempt));
    },
  };
}

function defaultShouldRetry(context: MailerRetryContext): boolean {
  if (context.error) {
    if (context.error instanceof MailerError) {
      return false;
    }

    return true;
  }

  return Boolean(context.response && [408, 425, 429, 500, 502, 503, 504].includes(context.response.status));
}

function defaultRetryDelay(attempt: number): number {
  return Math.min(1000, 100 * 2 ** Math.max(0, attempt - 1));
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default Mailer;
