import { SendstackError, isErrorEnvelope } from "./errors";
import type {
  CreateDomainRequest,
  CreateSuppressionRequest,
  CreateSuppressionResult,
  CreateTemplateRequest,
  CreateWebhookEndpointRequest,
  CursorPage,
  Domain,
  EmailDefaults,
  EmailEvent,
  EmailMessage,
  EmailTemplate,
  ListEmailsOptions,
  ListSmsOptions,
  ListTemplatesOptions,
  PreviewTemplateRequest,
  RetryWebhookEventResult,
  SendEmailBatchRequest,
  SendEmailBatchResult,
  SendEmailRequest,
  SendEmailResult,
  SendSmsBatchRequest,
  SendSmsBatchResult,
  SendSmsRequest,
  SendSmsResult,
  SmsDefaults,
  SmsMessage,
  SmsEvent,
  TemplatePreview,
  SendstackAuthStrategy,
  SendstackBody,
  SendstackClientOptions,
  SendstackMiddleware,
  SendstackMutationOptions,
  SendstackQueryParams,
  SendstackQueryValue,
  SendstackRawRequestOptions,
  SendstackRequestContext,
  SendstackRequestOptions,
  SendstackResponseContext,
  SendstackResponseParser,
  SendstackResponseTransformer,
  SendstackRetryContext,
  SendstackRetryOptions,
  SuccessEnvelope,
  Suppression,
  UpdateTemplateRequest,
  UpdateWebhookEndpointRequest,
  UploadAttachmentRequest,
  UploadedAttachment,
  WebhookEndpoint,
} from "./types";
import { DEFAULT_BASE_URL } from "./types";

export { SendstackError } from "./errors";
export { DEFAULT_BASE_URL } from "./types";
export type {
  CreateDomainRequest,
  CreateSuppressionRequest,
  CreateSuppressionResult,
  CreateTemplateRequest,
  CreateWebhookEndpointRequest,
  CursorPage,
  Domain,
  DomainCapability,
  DomainRegion,
  DomainTlsPolicy,
  EmailAttachmentInput,
  EmailDefaults,
  EmailEvent,
  EmailMessage,
  EmailStatus,
  EmailTemplate,
  ErrorEnvelope,
  KnownWebhookEvent,
  ListEmailsOptions,
  ListSmsOptions,
  ListTemplatesOptions,
  PreviewTemplateRequest,
  Recipient,
  RetryWebhookEventResult,
  SendEmailBatchRequest,
  SendEmailBatchResult,
  SendEmailRequest,
  SendEmailResult,
  SendSmsBatchRequest,
  SendSmsBatchResult,
  SendSmsRequest,
  SendSmsResult,
  SmsDefaults,
  SmsEvent,
  SmsMessage,
  SmsStatus,
  TemplateChannel,
  TemplatePreview,
  TemplateVariable,
  SendstackAuthStrategy,
  SendstackBearerAuthStrategy,
  SendstackBody,
  SendstackClientOptions,
  SendstackHeadersAuthStrategy,
  SendstackMiddleware,
  SendstackMutationOptions,
  SendstackQueryParams,
  SendstackQueryValue,
  SendstackRawRequestOptions,
  SendstackRequestContext,
  SendstackRequestOptions,
  SendstackResponseContext,
  SendstackResponseParser,
  SendstackResponseTransformer,
  SendstackRetryContext,
  SendstackRetryOptions,
  SuccessEnvelope,
  Suppression,
  SuppressionReason,
  TemplateReference,
  UpdateTemplateRequest,
  UpdateWebhookEndpointRequest,
  UploadAttachmentRequest,
  UploadedAttachment,
  WebhookEndpoint,
  WebhookEventType,
} from "./types";

interface NormalizedRetryPolicy {
  maxAttempts: number;
  shouldRetry?: (context: SendstackRetryContext) => Promise<boolean>;
  delayMs?: (context: SendstackRetryContext) => Promise<number>;
}

export class Sendstack {
  readonly authToken: string;
  readonly emailFrom: string | undefined;
  readonly smsSenderId: string | undefined;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly attachments: {
    upload: <TRequest extends UploadAttachmentRequest>(
      request: TRequest,
      options?: SendstackMutationOptions,
    ) => Promise<UploadedAttachment>;
  };
  readonly emails: {
    send: <TRequest extends SendEmailRequest>(
      request: TRequest,
      options?: SendstackMutationOptions,
    ) => Promise<SendEmailResult>;
    sendBatch: <TRequest extends SendEmailBatchRequest>(
      request: TRequest,
      options?: SendstackMutationOptions,
    ) => Promise<SendEmailBatchResult>;
    list: <TOptions extends ListEmailsOptions & SendstackRequestOptions>(
      options?: TOptions,
    ) => Promise<CursorPage<EmailMessage>>;
    get: (id: string, options?: SendstackRequestOptions) => Promise<EmailMessage>;
    events: (id: string, options?: SendstackRequestOptions) => Promise<CursorPage<EmailEvent>>;
    cancel: (id: string, options?: SendstackMutationOptions) => Promise<EmailMessage>;
    requeue: (id: string, options?: SendstackMutationOptions) => Promise<EmailMessage>;
  };
  readonly domains: {
    create: <TRequest extends CreateDomainRequest>(
      request: TRequest,
      options?: SendstackMutationOptions,
    ) => Promise<Domain>;
    list: (options?: SendstackRequestOptions) => Promise<CursorPage<Domain>>;
    get: (id: string, options?: SendstackRequestOptions) => Promise<Domain>;
    verify: (id: string, options?: SendstackMutationOptions) => Promise<Domain>;
  };
  readonly templates: {
    create: <TRequest extends CreateTemplateRequest>(
      request: TRequest,
      options?: SendstackMutationOptions,
    ) => Promise<EmailTemplate>;
    list: (options?: ListTemplatesOptions & SendstackRequestOptions) => Promise<CursorPage<EmailTemplate>>;
    get: (id: string, options?: SendstackRequestOptions) => Promise<EmailTemplate>;
    update: <TRequest extends UpdateTemplateRequest>(
      id: string,
      request: TRequest,
      options?: SendstackMutationOptions,
    ) => Promise<EmailTemplate>;
    remove: (id: string, options?: SendstackMutationOptions) => Promise<void>;
    preview: <TRequest extends PreviewTemplateRequest>(
      request: TRequest,
      options?: SendstackMutationOptions,
    ) => Promise<TemplatePreview>;
  };
  readonly sms: {
    send: <TRequest extends SendSmsRequest>(
      request: TRequest,
      options?: SendstackMutationOptions,
    ) => Promise<SendSmsResult>;
    sendBatch: <TRequest extends SendSmsBatchRequest>(
      request: TRequest,
      options?: SendstackMutationOptions,
    ) => Promise<SendSmsBatchResult>;
    list: <TOptions extends ListSmsOptions & SendstackRequestOptions>(
      options?: TOptions,
    ) => Promise<CursorPage<SmsMessage>>;
    get: (id: string, options?: SendstackRequestOptions) => Promise<SmsMessage>;
    events: (id: string, options?: SendstackRequestOptions) => Promise<CursorPage<SmsEvent>>;
    cancel: (id: string, options?: SendstackMutationOptions) => Promise<SmsMessage>;
    requeue: (id: string, options?: SendstackMutationOptions) => Promise<SmsMessage>;
  };
  readonly webhooks: {
    create: <TRequest extends CreateWebhookEndpointRequest>(
      request: TRequest,
      options?: SendstackMutationOptions,
    ) => Promise<WebhookEndpoint>;
    list: (options?: SendstackRequestOptions) => Promise<CursorPage<WebhookEndpoint>>;
    update: <TRequest extends UpdateWebhookEndpointRequest>(
      id: string,
      request: TRequest,
      options?: SendstackMutationOptions,
    ) => Promise<WebhookEndpoint>;
    remove: (id: string, options?: SendstackMutationOptions) => Promise<void>;
  };
  readonly webhookEvents: {
    retry: (id: string, options?: SendstackMutationOptions) => Promise<RetryWebhookEventResult>;
  };
  readonly suppressions: {
    add: <TRequest extends CreateSuppressionRequest>(
      request: TRequest,
      options?: SendstackMutationOptions,
    ) => Promise<CreateSuppressionResult>;
    list: (options?: SendstackRequestOptions) => Promise<CursorPage<Suppression>>;
    remove: (recipient: string, options?: SendstackMutationOptions) => Promise<void>;
  };

  readonly #fetch: typeof fetch;
  readonly #headers: HeadersInit | undefined;
  readonly #query: SendstackQueryParams | undefined;
  readonly #auth: SendstackAuthStrategy | false;
  readonly #middleware: SendstackMiddleware[];
  readonly #retry: SendstackRetryOptions | number | false | undefined;
  readonly #parseResponse: SendstackResponseParser;
  readonly #transformResponse: SendstackResponseTransformer;

  constructor(options?: SendstackClientOptions);
  constructor(authToken: string, options?: SendstackClientOptions);
  constructor(
    authTokenOrOptions: string | SendstackClientOptions = {},
    maybeOptions?: SendstackClientOptions,
  ) {
    const options = typeof authTokenOrOptions === "string" ? maybeOptions ?? {} : authTokenOrOptions;
    const authToken = typeof authTokenOrOptions === "string" ? authTokenOrOptions : options.authToken ?? "";

    if (typeof fetch !== "function" && !options.fetch) {
      throw new TypeError("A fetch implementation is required in this runtime.");
    }

    const normalizedToken = authToken.trim();

    this.authToken = normalizedToken;
    this.emailFrom = normalizeDefault(options.emails?.from);
    this.smsSenderId = normalizeDefault(options.sms?.from);
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.#fetch = options.fetch ?? fetch;
    this.#headers = options.headers;
    this.#query = options.query;
    this.#auth = options.auth ?? (
      normalizedToken === ""
        ? false
        : {
            type: "bearer",
            token: normalizedToken,
          }
    );
    this.#middleware = options.middleware ?? [];
    this.#retry = options.retry;
    this.#parseResponse = options.parseResponse ?? parseResponseBody;
    this.#transformResponse = options.transformResponse ?? defaultTransformResponse;

    this.attachments = {
      upload: (request, requestOptions) =>
        this.request("POST", "/attachments", {
          ...requestOptions,
          body: normalizeUploadAttachmentRequest(request),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
    };

    this.emails = {
      send: (request, requestOptions) =>
        this.request("POST", "/emails", {
          ...requestOptions,
          body: normalizeSendEmailRequest(request, this.emailFrom),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      sendBatch: (request, requestOptions) =>
        this.request("POST", "/emails/batch", {
          ...requestOptions,
          body: normalizeSendEmailBatchRequest(request, this.emailFrom),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      list: (requestOptions) =>
        this.request("GET", "/emails", {
          ...requestOptions,
          query: mergeEmailListQuery(requestOptions),
        }),
      get: (id, requestOptions) =>
        this.request("GET", `/emails/${encodeURIComponent(id)}`, requestOptions),
      events: (id, requestOptions) =>
        this.request("GET", `/emails/${encodeURIComponent(id)}/events`, requestOptions),
      cancel: (id, requestOptions) =>
        this.request("POST", `/emails/${encodeURIComponent(id)}/cancel`, {
          ...requestOptions,
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      requeue: (id, requestOptions) =>
        this.request("POST", `/emails/${encodeURIComponent(id)}/requeue`, {
          ...requestOptions,
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
    };

    this.domains = {
      create: (request, requestOptions) =>
        this.request("POST", "/domains", {
          ...requestOptions,
          body: normalizeDomainRequest(request),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      list: (requestOptions) =>
        this.request("GET", "/domains", requestOptions),
      get: (id, requestOptions) =>
        this.request("GET", `/domains/${encodeURIComponent(id)}`, requestOptions),
      verify: (id, requestOptions) =>
        this.request("POST", `/domains/${encodeURIComponent(id)}/verify`, {
          ...requestOptions,
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
    };

    this.templates = {
      create: (request, requestOptions) =>
        this.request("POST", "/templates", {
          ...requestOptions,
          body: normalizeTemplateRequest(request),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      list: (requestOptions) =>
        this.request("GET", "/templates", {
          ...requestOptions,
          query: mergeTemplateListQuery(requestOptions),
        }),
      get: (id, requestOptions) =>
        this.request("GET", `/templates/${encodeURIComponent(id)}`, requestOptions),
      update: (id, request, requestOptions) =>
        this.request("PATCH", `/templates/${encodeURIComponent(id)}`, {
          ...requestOptions,
          body: normalizeTemplateRequest(request),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      remove: async (id, requestOptions) => {
        await this.request("DELETE", `/templates/${encodeURIComponent(id)}`, {
          ...requestOptions,
          idempotencyKey: requestOptions?.idempotencyKey,
        });
      },
      preview: (request, requestOptions) =>
        this.request("POST", "/templates/preview", {
          ...requestOptions,
          body: normalizeTemplatePreviewRequest(request),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
    };

    this.sms = {
      send: (request, requestOptions) =>
        this.request("POST", "/sms", {
          ...requestOptions,
          body: normalizeSendSmsRequest(request, this.smsSenderId),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      sendBatch: (request, requestOptions) =>
        this.request("POST", "/sms/batch", {
          ...requestOptions,
          body: normalizeSendSmsBatchRequest(request, this.smsSenderId),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      list: (requestOptions) =>
        this.request("GET", "/sms", {
          ...requestOptions,
          query: mergeSmsListQuery(requestOptions),
        }),
      get: (id, requestOptions) =>
        this.request("GET", `/sms/${encodeURIComponent(id)}`, requestOptions),
      events: (id, requestOptions) =>
        this.request("GET", `/sms/${encodeURIComponent(id)}/events`, requestOptions),
      cancel: (id, requestOptions) =>
        this.request("POST", `/sms/${encodeURIComponent(id)}/cancel`, {
          ...requestOptions,
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      requeue: (id, requestOptions) =>
        this.request("POST", `/sms/${encodeURIComponent(id)}/requeue`, {
          ...requestOptions,
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
    };

    this.webhooks = {
      create: (request, requestOptions) =>
        this.request("POST", "/webhook-endpoints", {
          ...requestOptions,
          body: normalizeWebhookEndpointRequest(request),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      list: (requestOptions) =>
        this.request("GET", "/webhook-endpoints", requestOptions),
      update: (id, request, requestOptions) =>
        this.request("PATCH", `/webhook-endpoints/${encodeURIComponent(id)}`, {
          ...requestOptions,
          body: normalizeWebhookEndpointRequest(request),
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      remove: async (id, requestOptions) => {
        await this.request("DELETE", `/webhook-endpoints/${encodeURIComponent(id)}`, {
          ...requestOptions,
          idempotencyKey: requestOptions?.idempotencyKey,
        });
      },
    };

    this.webhookEvents = {
      retry: (id, requestOptions) =>
        this.request("POST", `/events/${encodeURIComponent(id)}/retry`, {
          ...requestOptions,
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
    };

    this.suppressions = {
      add: (request, requestOptions) =>
        this.request("POST", "/suppressions", {
          ...requestOptions,
          body: request,
          idempotencyKey: requestOptions?.idempotencyKey,
        }),
      list: (requestOptions) =>
        this.request("GET", "/suppressions", requestOptions),
      remove: async (recipient, requestOptions) => {
        await this.request("DELETE", `/suppressions/${encodeURIComponent(recipient)}`, {
          ...requestOptions,
          idempotencyKey: requestOptions?.idempotencyKey,
        });
      },
    };
  }

  async request<T>(
    method: string,
    path: string,
    options: SendstackRawRequestOptions = {},
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

    throw new SendstackError("Sendstack request exhausted all retry attempts.", {
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
    options: SendstackRawRequestOptions;
  }): Promise<SendstackRequestContext> {
    const headers = mergeHeaders(this.#headers, input.options.headers);
    const authenticated = input.options.authenticated ?? true;
    const auth = input.options.auth === undefined ? this.#auth : input.options.auth;

    if (!authenticated) {
      headers.delete("authorization");
    } else {
      if (!auth && !hasExplicitAuthHeaders(headers)) {
        throw new TypeError("Sendstack auth is required for authenticated requests.");
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
  context: SendstackResponseContext,
  transformResponse: SendstackResponseTransformer,
  unwrapData?: boolean,
): Promise<T> {
  if (transformResponse === defaultTransformResponse) {
    return defaultTransformResponse(context, unwrapData) as T;
  }

  return await transformResponse(context) as T;
}

function defaultTransformResponse(
  context: SendstackResponseContext,
  unwrapData = true,
): unknown {
  if (!context.response.ok) {
    throw toSendstackError(context.response.status, context.payload);
  }

  if (unwrapData && isSuccessEnvelope(context.payload)) {
    return context.payload.data;
  }

  return context.payload;
}

function normalizeUploadAttachmentRequest(request: UploadAttachmentRequest): Record<string, unknown> {
  const payload = { ...request } as Record<string, unknown>;
  renameAlias(payload, "contentBase64", "content_base64");
  renameAlias(payload, "contentType", "content_type");
  return payload;
}

function normalizeDefault(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

function normalizeSendEmailBatchRequest(
  request: SendEmailBatchRequest,
  defaultFrom: string | undefined,
): Record<string, unknown> | Array<Record<string, unknown>> {
  if (Array.isArray(request)) {
    return request.map((email) => normalizeSendEmailRequest(email, defaultFrom));
  }

  return {
    emails: request.emails.map((email) => normalizeSendEmailRequest(email, defaultFrom)),
  };
}

function normalizeSendEmailRequest(
  request: SendEmailRequest,
  defaultFrom: string | undefined,
): Record<string, unknown> {
  const payload = { ...request } as Record<string, unknown>;
  renameAlias(payload, "replyTo", "reply_to");
  renameAlias(payload, "trackOpens", "track_opens");
  renameAlias(payload, "trackClicks", "track_clicks");
  renameAlias(payload, "providerId", "provider_id");
  renameAlias(payload, "templateId", "template_id");
  renameAlias(payload, "templateData", "template_data");
  renameAlias(payload, "scheduledAt", "scheduled_at");

  if (payload["scheduled_at"] instanceof Date) {
    payload["scheduled_at"] = payload["scheduled_at"].toISOString();
  }

  if (defaultFrom !== undefined && payload["from"] === undefined) {
    payload["from"] = defaultFrom;
  }

  const attachments = payload["attachments"];
  if (Array.isArray(attachments)) {
    payload["attachments"] = attachments.map((attachment) =>
      isRecord(attachment) ? normalizeEmailAttachment(attachment) : attachment);
  }

  return payload;
}

function normalizeEmailAttachment(attachment: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...attachment };
  renameAlias(payload, "contentBase64", "content_base64");
  renameAlias(payload, "attachmentId", "attachment_id");
  renameAlias(payload, "contentType", "content_type");
  renameAlias(payload, "contentId", "content_id");
  return payload;
}

function normalizeDomainRequest(request: CreateDomainRequest): Record<string, unknown> {
  const payload = { ...request } as Record<string, unknown>;
  renameAlias(payload, "providerId", "provider_id");
  renameAlias(payload, "customReturnPath", "custom_return_path");
  return payload;
}

function normalizeWebhookEndpointRequest(
  request: CreateWebhookEndpointRequest | UpdateWebhookEndpointRequest,
): Record<string, unknown> {
  const payload = { ...request } as Record<string, unknown>;
  renameAlias(payload, "eventTypes", "event_types");
  return payload;
}

function normalizeTemplateRequest(
  request: CreateTemplateRequest | UpdateTemplateRequest,
): Record<string, unknown> {
  const payload = { ...request } as Record<string, unknown>;
  renameAlias(payload, "sampleData", "sample_data");
  return payload;
}

function normalizeTemplatePreviewRequest(request: PreviewTemplateRequest): Record<string, unknown> {
  const payload = { ...request } as Record<string, unknown>;
  renameAlias(payload, "templateId", "template_id");
  return payload;
}

function normalizeSendSmsBatchRequest(
  request: SendSmsBatchRequest,
  defaultSenderId: string | undefined,
): Record<string, unknown> | Array<Record<string, unknown>> {
  if (Array.isArray(request)) {
    return request.map((message) => normalizeSendSmsRequest(message, defaultSenderId));
  }

  return {
    messages: request.messages.map((message) => normalizeSendSmsRequest(message, defaultSenderId)),
  };
}

function normalizeSendSmsRequest(
  request: SendSmsRequest,
  defaultSenderId: string | undefined,
): Record<string, unknown> {
  const payload = { ...request } as Record<string, unknown>;
  renameAlias(payload, "providerId", "provider_id");
  renameAlias(payload, "templateId", "template_id");
  renameAlias(payload, "templateData", "template_data");
  renameAlias(payload, "scheduledAt", "scheduled_at");

  if (payload["scheduled_at"] instanceof Date) {
    payload["scheduled_at"] = payload["scheduled_at"].toISOString();
  }

  if (defaultSenderId !== undefined && payload["from"] === undefined) {
    payload["from"] = defaultSenderId;
  }

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

function toSendstackError(statusCode: number, payload: unknown): SendstackError {
  if (isErrorEnvelope(payload)) {
    return new SendstackError(payload.error.message, {
      statusCode,
      code: payload.error.code,
      details: payload.error.details,
      responseBody: payload,
    });
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record["detail"] === "string" && record["detail"].trim() !== "") {
      return new SendstackError(record["detail"], {
        statusCode,
        details: record["errors"],
        responseBody: payload,
      });
    }

    if (typeof record["message"] === "string" && record["message"].trim() !== "") {
      return new SendstackError(record["message"], {
        statusCode,
        code: typeof record["code"] === "string" ? record["code"] : undefined,
        details: record["details"],
        responseBody: payload,
      });
    }
  }

  if (payload instanceof Error) {
    return new SendstackError(payload.message, {
      statusCode,
      responseBody: payload,
    });
  }

  if (typeof payload === "string" && payload.trim() !== "") {
    return new SendstackError(payload, {
      statusCode,
      responseBody: payload,
    });
  }

  return new SendstackError(`Sendstack request failed with status ${statusCode}.`, {
    statusCode,
    responseBody: payload,
  });
}

function mergeEmailListQuery(
  options?: ListEmailsOptions & SendstackRequestOptions,
): SendstackQueryParams | undefined {
  return mergeQueryParams(
    {
      limit: options?.limit,
      cursor: options?.cursor,
      status: options?.status,
    },
    options?.query,
  );
}

function mergeSmsListQuery(
  options?: ListSmsOptions & SendstackRequestOptions,
): SendstackQueryParams | undefined {
  return mergeQueryParams(
    {
      limit: options?.limit,
      cursor: options?.cursor,
      status: options?.status,
    },
    options?.query,
  );
}

function mergeTemplateListQuery(
  options?: ListTemplatesOptions & SendstackRequestOptions,
): SendstackQueryParams | undefined {
  return mergeQueryParams(
    {
      channel: options?.channel,
    },
    options?.query,
  );
}

function hasExplicitAuthHeaders(headers: Headers): boolean {
  return headers.has("authorization");
}

function createRequestSignal(
  timeoutMs: number,
  upstreamSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  if (timeoutMs <= 0) {
    return {
      signal: upstreamSignal ?? AbortSignal.abort("Sendstack request timed out."),
      cleanup: () => {},
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Sendstack request timed out after ${timeoutMs}ms.`));
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
  context: SendstackRequestContext,
  fetchImpl: typeof fetch,
  parseResponse: SendstackResponseParser,
): Promise<SendstackResponseContext> {
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
  middleware: SendstackMiddleware[],
  context: SendstackRequestContext,
  terminal: (context: SendstackRequestContext) => Promise<SendstackResponseContext>,
): Promise<SendstackResponseContext> {
  const pipeline = middleware.reduceRight<(context: SendstackRequestContext) => Promise<SendstackResponseContext>>(
    (next, current) => async (requestContext: SendstackRequestContext) => await current(requestContext, next),
    terminal,
  );

  return await pipeline(context);
}

async function parseResponseBody(response: Response, _context: SendstackRequestContext): Promise<unknown> {
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
  auth: SendstackAuthStrategy,
  context: SendstackRequestContext,
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
    throw new TypeError("Sendstack baseUrl must be a valid absolute URL.");
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

function appendQueryParams(url: URL, query?: SendstackQueryParams) {
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

function serializeQueryValue(value: Exclude<SendstackQueryValue, undefined>): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mergeQueryParams(...parts: Array<SendstackQueryParams | undefined>): SendstackQueryParams | undefined {
  const merged: SendstackQueryParams = {};

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

function prepareRequestBody(body: SendstackBody | undefined, headers: Headers): BodyInit | null | undefined {
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

function isNativeBody(body: SendstackBody): body is BodyInit {
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

function normalizeRetryPolicy(retry: SendstackRetryOptions | number | false | undefined): NormalizedRetryPolicy {
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

function defaultShouldRetry(context: SendstackRetryContext): boolean {
  if (context.error) {
    if (context.error instanceof SendstackError) {
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

export const SendstackClient = Sendstack;
export default Sendstack;
