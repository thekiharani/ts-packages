import { getEnvNumber, getOptionalEnv, getRequiredEnv } from "../../core/config";
import { ConfigurationError, GatewayError } from "../../core/errors";
import { HttpClient } from "../../core/http";
import type { RequestOptions } from "../../core/types";
import { coerceBoolean, coerceInt, coerceNumber, coerceString, compactRecord, firstString } from "../../core/utils";
import type { DeliveryEvent } from "../../events";
import type {
  MetaWhatsAppFromEnvOptions,
  MetaWhatsAppGatewayOptions,
  WhatsAppCatalogMessageRequest,
  WhatsAppContact,
  WhatsAppContactAddress,
  WhatsAppContactEmail,
  WhatsAppContactName,
  WhatsAppContactOrg,
  WhatsAppContactPhone,
  WhatsAppContactUrl,
  WhatsAppContactsRequest,
  WhatsAppFlowMessageRequest,
  WhatsAppGateway,
  WhatsAppInboundLocation,
  WhatsAppInboundMedia,
  WhatsAppInboundMessage,
  WhatsAppInboundReaction,
  WhatsAppInboundReply,
  WhatsAppInteractiveButton,
  WhatsAppInteractiveHeader,
  WhatsAppInteractiveRequest,
  WhatsAppInteractiveRow,
  WhatsAppInteractiveSection,
  WhatsAppLocationRequest,
  WhatsAppManagedTemplate,
  WhatsAppMediaDeleteResult,
  WhatsAppMediaInfo,
  WhatsAppMediaRequest,
  WhatsAppMediaUploadRequest,
  WhatsAppMediaUploadResult,
  WhatsAppProductItem,
  WhatsAppProductListRequest,
  WhatsAppProductMessageRequest,
  WhatsAppProductSection,
  WhatsAppReactionRequest,
  WhatsAppSendReceipt,
  WhatsAppSendResult,
  WhatsAppTemplateButtonDefinition,
  WhatsAppTemplateComponent,
  WhatsAppTemplateComponentDefinition,
  WhatsAppTemplateCreateRequest,
  WhatsAppTemplateDeleteRequest,
  WhatsAppTemplateDeleteResult,
  WhatsAppTemplateListRequest,
  WhatsAppTemplateListResult,
  WhatsAppTemplateListSummary,
  WhatsAppTemplateManagementGateway,
  WhatsAppTemplateMutationResult,
  WhatsAppTemplateParameter,
  WhatsAppTemplateRequest,
  WhatsAppTemplateUpdateRequest,
  WhatsAppTextRequest,
} from "./types";

export const META_GRAPH_BASE_URL = "https://graph.facebook.com";
export const META_GRAPH_API_VERSION = "v25.0";

const MEDIA_TYPES = new Set(["image", "audio", "document", "sticker", "video"]);

export class MetaWhatsAppGateway implements WhatsAppTemplateManagementGateway {
  static fromEnv(options: MetaWhatsAppFromEnvOptions = {}): MetaWhatsAppGateway {
    const prefix = options.prefix ?? "META_WHATSAPP_";
    const env = options.env;

    return new MetaWhatsAppGateway({
      accessToken: getRequiredEnv(`${prefix}ACCESS_TOKEN`, env),
      phoneNumberId: getRequiredEnv(`${prefix}PHONE_NUMBER_ID`, env),
      whatsappBusinessAccountId: getOptionalEnv(`${prefix}WHATSAPP_BUSINESS_ACCOUNT_ID`, env),
      appSecret: getOptionalEnv(`${prefix}APP_SECRET`, env),
      webhookVerifyToken: getOptionalEnv(`${prefix}WEBHOOK_VERIFY_TOKEN`, env),
      apiVersion: options.apiVersion ?? getOptionalEnv(`${prefix}API_VERSION`, env),
      baseUrl: options.baseUrl ?? getOptionalEnv(`${prefix}BASE_URL`, env),
      fetch: options.fetch,
      timeoutMs: options.timeoutMs ?? getEnvNumber(`${prefix}TIMEOUT_SECONDS`, env),
      defaultHeaders: options.defaultHeaders,
      retry: options.retry,
      hooks: options.hooks,
    });
  }

  readonly providerName = "meta";
  readonly appSecret?: string;
  readonly webhookVerifyToken?: string;
  private readonly phoneNumberId: string;
  private readonly whatsappBusinessAccountId?: string;
  private readonly apiVersion: string;
  private readonly http: HttpClient;

  constructor(options: MetaWhatsAppGatewayOptions) {
    const accessToken = requireText(options.accessToken, "accessToken");
    this.phoneNumberId = requireText(options.phoneNumberId, "phoneNumberId");
    this.whatsappBusinessAccountId = coerceString(options.whatsappBusinessAccountId);
    this.appSecret = coerceString(options.appSecret);
    this.webhookVerifyToken = coerceString(options.webhookVerifyToken);
    this.apiVersion = requireText(options.apiVersion ?? META_GRAPH_API_VERSION, "apiVersion");
    this.http = new HttpClient({
      baseUrl: options.baseUrl ?? META_GRAPH_BASE_URL,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs ?? 30_000,
      defaultHeaders: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.defaultHeaders ?? {}),
      },
      retry: options.retry,
      hooks: options.hooks,
    });
  }

  async sendText(request: WhatsAppTextRequest, options?: RequestOptions): Promise<WhatsAppSendResult> {
    return this.sendRequest(request.recipient, buildTextPayload(request), options);
  }

  async sendTemplate(
    request: WhatsAppTemplateRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.sendRequest(request.recipient, buildTemplatePayload(request), options);
  }

  async listTemplates(
    request?: WhatsAppTemplateListRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppTemplateListResult> {
    const response = await this.request(this.templateCollectionPath(), "GET", {
      query: buildTemplateListQuery(request),
      options,
    });

    return buildTemplateListResult(this.providerName, response);
  }

  async getTemplate(
    templateId: string,
    fields: string[] = [],
    options?: RequestOptions,
  ): Promise<WhatsAppManagedTemplate> {
    const response = await this.request(this.templatePath(templateId), "GET", {
      query: buildTemplateFieldsQuery(fields),
      options,
    });

    const template = buildManagedTemplate(this.providerName, response);

    if (!template) {
      throw new GatewayError("Meta WhatsApp template lookup did not return a template id.", {
        provider: this.providerName,
        responseBody: response,
      });
    }

    return template;
  }

  async createTemplate(
    request: WhatsAppTemplateCreateRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppTemplateMutationResult> {
    const response = await this.request(this.templateCollectionPath(), "POST", {
      body: buildTemplateCreatePayload(request),
      options,
    });

    return buildTemplateMutationResult(this.providerName, response);
  }

  async updateTemplate(
    templateId: string,
    request: WhatsAppTemplateUpdateRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppTemplateMutationResult> {
    const normalizedTemplateId = requireText(templateId, "templateId");
    const response = await this.request(this.templatePath(normalizedTemplateId), "POST", {
      body: buildTemplateUpdatePayload(request),
      options,
    });

    return buildTemplateMutationResult(this.providerName, response, normalizedTemplateId);
  }

  async deleteTemplate(
    request: WhatsAppTemplateDeleteRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppTemplateDeleteResult> {
    const response = await this.request(this.templateCollectionPath(), "DELETE", {
      query: buildTemplateDeleteQuery(request),
      options,
    });

    return buildTemplateDeleteResult(this.providerName, request, response);
  }

  async sendMedia(request: WhatsAppMediaRequest, options?: RequestOptions): Promise<WhatsAppSendResult> {
    return this.sendRequest(request.recipient, buildMediaPayload(request), options);
  }

  async sendLocation(
    request: WhatsAppLocationRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.sendRequest(request.recipient, buildLocationPayload(request), options);
  }

  async sendContacts(
    request: WhatsAppContactsRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.sendRequest(request.recipient, buildContactsPayload(request), options);
  }

  async sendReaction(
    request: WhatsAppReactionRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.sendRequest(request.recipient, buildReactionPayload(request), options);
  }

  async sendInteractive(
    request: WhatsAppInteractiveRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.sendRequest(request.recipient, buildInteractivePayload(request), options);
  }

  async sendCatalog(
    request: WhatsAppCatalogMessageRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.sendRequest(request.recipient, buildCatalogMessagePayload(request), options);
  }

  async sendProduct(
    request: WhatsAppProductMessageRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.sendRequest(request.recipient, buildProductMessagePayload(request), options);
  }

  async sendProductList(
    request: WhatsAppProductListRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.sendRequest(request.recipient, buildProductListPayload(request), options);
  }

  async sendFlow(
    request: WhatsAppFlowMessageRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    return this.sendRequest(request.recipient, buildFlowMessagePayload(request), options);
  }

  async uploadMedia(
    request: WhatsAppMediaUploadRequest,
    options?: RequestOptions,
  ): Promise<WhatsAppMediaUploadResult> {
    const form = new FormData();

    for (const [key, value] of Object.entries(request.providerOptions ?? {})) {
      form.set(key, requireText(coerceString(value), `providerOptions[${key}]`));
    }

    form.set("messaging_product", "whatsapp");
    form.set("type", requireText(request.mimeType, "mimeType"));
    form.set(
      "file",
      new Blob([toBlobPart(request.content)], { type: requireText(request.mimeType, "mimeType") }),
      requireText(request.filename, "filename"),
    );

    const response = await this.request(this.mediaUploadPath(), "POST", {
      body: form,
      options,
    });

    return buildMediaUploadResult(this.providerName, response);
  }

  async getMedia(mediaId: string, options?: RequestOptions): Promise<WhatsAppMediaInfo> {
    const normalizedMediaId = requireText(mediaId, "mediaId");
    const response = await this.request(this.mediaPath(normalizedMediaId), "GET", {
      query: this.mediaQuery(),
      options,
    });

    return buildMediaInfo(this.providerName, normalizedMediaId, response);
  }

  async deleteMedia(mediaId: string, options?: RequestOptions): Promise<WhatsAppMediaDeleteResult> {
    const normalizedMediaId = requireText(mediaId, "mediaId");
    const response = await this.request(this.mediaPath(normalizedMediaId), "DELETE", {
      query: this.mediaQuery(),
      options,
    });

    return buildMediaDeleteResult(this.providerName, normalizedMediaId, response);
  }

  parseEvents(payload: Record<string, unknown>): DeliveryEvent[] {
    const events: DeliveryEvent[] = [];

    for (const value of iterateValueObjects(payload)) {
      const statuses = value["statuses"];

      if (!Array.isArray(statuses)) {
        continue;
      }

      for (const row of statuses) {
        const event = buildStatusEvent(this.providerName, row);

        if (event) {
          events.push(event);
        }
      }
    }

    return events;
  }

  parseInboundMessages(payload: Record<string, unknown>): WhatsAppInboundMessage[] {
    const messages: WhatsAppInboundMessage[] = [];

    for (const value of iterateValueObjects(payload)) {
      const inboundRows = value["messages"];

      if (!Array.isArray(inboundRows)) {
        continue;
      }

      const profiles = buildProfileLookup(value["contacts"]);
      const metadata = asRecord(value["metadata"]);

      for (const row of inboundRows) {
        const message = buildInboundMessage({
          providerName: this.providerName,
          payload: row,
          profiles,
          webhookMetadata: metadata,
        });

        if (message) {
          messages.push(message);
        }
      }
    }

    return messages;
  }

  parseEvent(payload: Record<string, unknown>): DeliveryEvent | null {
    return this.parseEvents(payload)[0] ?? null;
  }

  parseInboundMessage(payload: Record<string, unknown>): WhatsAppInboundMessage | null {
    return this.parseInboundMessages(payload)[0] ?? null;
  }

  async close(): Promise<void> {}

  private async sendRequest(
    recipient: string,
    payload: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<WhatsAppSendResult> {
    const response = await this.request(this.messagesPath(), "POST", {
      body: payload,
      options,
    });

    return buildSendResult(this.providerName, recipient, response);
  }

  private async request(
    path: string,
    method: "GET" | "POST" | "DELETE",
    input: {
      body?: unknown;
      options?: RequestOptions;
      query?: Record<string, string | number | boolean | null | undefined>;
    },
  ): Promise<Record<string, unknown>> {
    const response = await this.http.request<Record<string, unknown>>({
      path,
      method,
      body: input.body,
      query: input.query,
      headers: input.options?.headers,
      signal: input.options?.signal,
      timeoutMs: input.options?.timeoutMs,
      retry: input.options?.retry,
    });

    return validateResponse(this.providerName, response);
  }

  private messagesPath(): string {
    return `/${this.apiVersion}/${this.phoneNumberId}/messages`;
  }

  private templateCollectionPath(): string {
    return `/${this.apiVersion}/${this.requireWhatsappBusinessAccountId()}/message_templates`;
  }

  private templatePath(templateId: string): string {
    return `/${this.apiVersion}/${requireText(templateId, "templateId")}`;
  }

  private mediaUploadPath(): string {
    return `/${this.apiVersion}/${this.phoneNumberId}/media`;
  }

  private mediaPath(mediaId: string): string {
    return `/${this.apiVersion}/${requireText(mediaId, "mediaId")}`;
  }

  private mediaQuery(): Record<string, string> {
    return { phone_number_id: this.phoneNumberId };
  }

  private requireWhatsappBusinessAccountId(): string {
    if (!this.whatsappBusinessAccountId) {
      throw new ConfigurationError(
        "Meta WhatsApp template management requires whatsappBusinessAccountId.",
      );
    }

    return this.whatsappBusinessAccountId;
  }
}

function buildMediaUploadResult(
  providerName: string,
  response: Record<string, unknown>,
): WhatsAppMediaUploadResult {
  const mediaId = coerceString(response["id"]);

  if (!mediaId) {
    throw new GatewayError("Meta media upload did not return a media id.", {
      provider: providerName,
      responseBody: response,
    });
  }

  return {
    provider: providerName,
    mediaId,
    raw: response,
  };
}

function buildMediaInfo(
  providerName: string,
  mediaId: string,
  response: Record<string, unknown>,
): WhatsAppMediaInfo {
  return {
    provider: providerName,
    mediaId: coerceString(response["id"]) ?? mediaId,
    url: coerceString(response["url"]),
    mimeType: coerceString(response["mime_type"]),
    sha256: coerceString(response["sha256"]),
    fileSize: coerceInt(response["file_size"]),
    raw: response,
  };
}

function buildMediaDeleteResult(
  providerName: string,
  mediaId: string,
  response: Record<string, unknown>,
): WhatsAppMediaDeleteResult {
  return {
    provider: providerName,
    mediaId,
    deleted: Boolean(response["success"]),
    raw: response,
  };
}

function buildTemplateListQuery(
  request?: WhatsAppTemplateListRequest,
): Record<string, string> | undefined {
  if (!request) {
    return undefined;
  }

  const query: Record<string, string> = {};

  for (const [key, value] of Object.entries(request.providerOptions ?? {})) {
    query[key] = requireText(coerceString(value), `providerOptions[${key}]`);
  }

  setQueryValue(query, "category", request.category, { uppercase: true });
  setQueryValue(query, "content", request.content);
  setQueryValue(query, "language", request.language);
  setQueryValue(query, "name", request.name);
  setQueryValue(query, "name_or_content", request.nameOrContent);
  setQueryValue(query, "quality_score", request.qualityScore, { uppercase: true });
  setQueryValue(query, "since", request.since);
  setQueryValue(query, "status", request.status, { uppercase: true });
  setQueryValue(query, "until", request.until);
  setQueryValue(query, "fields", request.fields);
  setQueryValue(query, "limit", request.limit);
  setQueryValue(query, "before", request.before);
  setQueryValue(query, "after", request.after);

  if (request.summaryFields?.length) {
    query["fields"] = query["fields"]
      ? `${query["fields"]},${request.summaryFields.join(",")}`
      : request.summaryFields.join(",");
    query["include_template_quality"] = "true";
  }

  return Object.keys(query).length ? query : undefined;
}

function buildTemplateFieldsQuery(fields: string[]): Record<string, string> | undefined {
  return fields.length ? { fields: fields.join(",") } : undefined;
}

function buildTemplateCreatePayload(
  request: WhatsAppTemplateCreateRequest,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...(request.providerOptions ?? {}),
    name: requireText(request.name, "name"),
    language: requireText(request.language, "language"),
    category: normalizeTemplateEnum(request.category, "category"),
  };

  if (request.components?.length) {
    payload["components"] = request.components.map((component) =>
      buildTemplateComponentDefinition(component),
    );
  }

  if (request.allowCategoryChange !== undefined) {
    payload["allow_category_change"] = request.allowCategoryChange;
  }

  if (request.parameterFormat) {
    payload["parameter_format"] = request.parameterFormat;
  }

  if (request.subCategory) {
    payload["sub_category"] = request.subCategory;
  }

  if (request.messageSendTtlSeconds !== undefined) {
    payload["message_send_ttl_seconds"] = request.messageSendTtlSeconds;
  }

  if (request.libraryTemplateName) {
    payload["library_template_name"] = request.libraryTemplateName;
  }

  if (request.isPrimaryDeviceDeliveryOnly !== undefined) {
    payload["is_primary_device_delivery_only"] = request.isPrimaryDeviceDeliveryOnly;
  }

  if (request.creativeSourcingSpec && Object.keys(request.creativeSourcingSpec).length) {
    payload["creative_sourcing_spec"] = request.creativeSourcingSpec;
  }

  if (request.libraryTemplateBodyInputs && Object.keys(request.libraryTemplateBodyInputs).length) {
    payload["library_template_body_inputs"] = request.libraryTemplateBodyInputs;
  }

  if (request.libraryTemplateButtonInputs?.length) {
    payload["library_template_button_inputs"] = request.libraryTemplateButtonInputs;
  }

  return payload;
}

function buildTemplateUpdatePayload(
  request: WhatsAppTemplateUpdateRequest,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...(request.providerOptions ?? {}),
  };

  if (request.category) {
    payload["category"] = normalizeTemplateEnum(request.category, "category");
  }

  if (request.components?.length) {
    payload["components"] = request.components.map((component) =>
      buildTemplateComponentDefinition(component),
    );
  }

  if (request.parameterFormat) {
    payload["parameter_format"] = request.parameterFormat;
  }

  if (request.messageSendTtlSeconds !== undefined) {
    payload["message_send_ttl_seconds"] = request.messageSendTtlSeconds;
  }

  if (request.creativeSourcingSpec && Object.keys(request.creativeSourcingSpec).length) {
    payload["creative_sourcing_spec"] = request.creativeSourcingSpec;
  }

  return payload;
}

function buildTemplateDeleteQuery(
  request: WhatsAppTemplateDeleteRequest,
): Record<string, string> {
  const query: Record<string, string> = {};

  for (const [key, value] of Object.entries(request.providerOptions ?? {})) {
    query[key] = requireText(coerceString(value), `providerOptions[${key}]`);
  }

  setQueryValue(query, "name", request.name);
  setQueryValue(query, "hsm_id", request.templateId);
  setQueryValue(query, "template_ids", request.templateIds);
  return query;
}

function buildTemplateComponentDefinition(
  component: WhatsAppTemplateComponentDefinition,
): Record<string, unknown> {
  return compactRecord({
    ...component.providerOptions,
    type: requireText(component.type, "components[].type"),
    format: coerceString(component.format),
    text: coerceString(component.text),
    buttons: component.buttons?.length
      ? component.buttons.map((button) => buildTemplateButtonDefinition(button))
      : undefined,
    example:
      component.example && Object.keys(component.example).length ? component.example : undefined,
  });
}

function buildTemplateButtonDefinition(
  button: WhatsAppTemplateButtonDefinition,
): Record<string, unknown> {
  return compactRecord({
    ...button.providerOptions,
    type: requireText(button.type, "buttons[].type"),
    text: coerceString(button.text),
    phone_number: coerceString(button.phoneNumber),
    url: coerceString(button.url),
    example: button.example?.length ? button.example : undefined,
    flow_id: coerceString(button.flowId),
    flow_name: coerceString(button.flowName),
    flow_json: coerceString(button.flowJson),
    flow_action: coerceString(button.flowAction),
    navigate_screen: coerceString(button.navigateScreen),
    otp_type: coerceString(button.otpType),
    zero_tap_terms_accepted: button.zeroTapTermsAccepted,
    supported_apps: button.supportedApps?.length ? button.supportedApps : undefined,
  });
}

function buildTemplateListResult(
  providerName: string,
  response: Record<string, unknown>,
): WhatsAppTemplateListResult {
  const data = Array.isArray(response["data"]) ? response["data"] : [];
  const paging = asRecord(response["paging"]);
  const cursors = asRecord(paging["cursors"]);

  return {
    provider: providerName,
    templates: data
      .map((row) => buildManagedTemplate(providerName, asRecord(row)))
      .filter((template): template is WhatsAppManagedTemplate => template !== null),
    before: coerceString(cursors["before"]),
    after: coerceString(cursors["after"]),
    summary: buildTemplateListSummary(response["summary"]),
    raw: response,
  };
}

function buildTemplateListSummary(value: unknown): WhatsAppTemplateListSummary | undefined {
  const payload = asRecord(value);

  if (!Object.keys(payload).length) {
    return undefined;
  }

  return {
    totalCount: coerceInt(payload["total_count"]),
    messageTemplateCount: coerceInt(payload["message_template_count"]),
    messageTemplateLimit: coerceInt(payload["message_template_limit"]),
    areTranslationsComplete:
      typeof payload["are_translations_complete"] === "boolean"
        ? payload["are_translations_complete"]
        : undefined,
    raw: payload,
  };
}

function buildManagedTemplate(
  providerName: string,
  payload: Record<string, unknown>,
): WhatsAppManagedTemplate | null {
  const templateId = coerceString(payload["id"]);

  if (!templateId) {
    return null;
  }

  return {
    provider: providerName,
    templateId,
    name: coerceString(payload["name"]),
    language: coerceString(payload["language"]),
    category: coerceString(payload["category"]),
    status: coerceString(payload["status"]),
    components: normalizeRows(payload["components"]).map((component) =>
      parseTemplateComponentDefinition(component),
    ),
    parameterFormat: coerceString(payload["parameter_format"]),
    subCategory: coerceString(payload["sub_category"]),
    previousCategory: coerceString(payload["previous_category"]),
    correctCategory: coerceString(payload["correct_category"]),
    rejectedReason: coerceString(payload["rejected_reason"]),
    qualityScore: coerceString(payload["quality_score"]),
    ctaUrlLinkTrackingOptedOut:
      typeof payload["cta_url_link_tracking_opted_out"] === "boolean"
        ? payload["cta_url_link_tracking_opted_out"]
        : undefined,
    libraryTemplateName: coerceString(payload["library_template_name"]),
    messageSendTtlSeconds: coerceInt(payload["message_send_ttl_seconds"]),
    metadata: compactRecord({
      previousCategory: coerceString(payload["previous_category"]),
      correctCategory: coerceString(payload["correct_category"]),
    }),
    raw: payload,
  };
}

function parseTemplateComponentDefinition(
  payload: Record<string, unknown>,
): WhatsAppTemplateComponentDefinition {
  return {
    type: coerceString(payload["type"]) ?? "",
    format: coerceString(payload["format"]),
    text: coerceString(payload["text"]),
    buttons: normalizeRows(payload["buttons"]).map((button) => parseTemplateButtonDefinition(button)),
    example: asRecord(payload["example"]),
    providerOptions: {},
  };
}

function parseTemplateButtonDefinition(
  payload: Record<string, unknown>,
): WhatsAppTemplateButtonDefinition {
  return {
    type: coerceString(payload["type"]) ?? "",
    text: coerceString(payload["text"]),
    phoneNumber: coerceString(payload["phone_number"]),
    url: coerceString(payload["url"]),
    example: Array.isArray(payload["example"])
      ? payload["example"].map((value) => coerceString(value) ?? "").filter(Boolean)
      : [],
    flowId: coerceString(payload["flow_id"]),
    flowName: coerceString(payload["flow_name"]),
    flowJson: coerceString(payload["flow_json"]),
    flowAction: coerceString(payload["flow_action"]),
    navigateScreen: coerceString(payload["navigate_screen"]),
    otpType: coerceString(payload["otp_type"]),
    zeroTapTermsAccepted:
      typeof payload["zero_tap_terms_accepted"] === "boolean"
        ? payload["zero_tap_terms_accepted"]
        : undefined,
    supportedApps: Array.isArray(payload["supported_apps"])
      ? payload["supported_apps"]
          .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
          .map((value) => value)
      : [],
    providerOptions: {},
  };
}

function buildTemplateMutationResult(
  providerName: string,
  response: Record<string, unknown>,
  fallbackTemplateId?: string,
): WhatsAppTemplateMutationResult {
  return {
    provider: providerName,
    success: true,
    templateId: coerceString(response["id"]) ?? fallbackTemplateId,
    name: coerceString(response["name"]),
    category: coerceString(response["category"]),
    status: coerceString(response["status"]),
    raw: response,
  };
}

function buildTemplateDeleteResult(
  providerName: string,
  request: WhatsAppTemplateDeleteRequest,
  response: Record<string, unknown>,
): WhatsAppTemplateDeleteResult {
  return {
    provider: providerName,
    deleted: Boolean(response["success"]),
    name: coerceString(request.name),
    templateId: coerceString(request.templateId),
    templateIds: request.templateIds ?? [],
    raw: response,
  };
}

function buildTextPayload(request: WhatsAppTextRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    body: requireText(request.text, "text"),
  };

  if (request.previewUrl !== undefined) {
    payload["preview_url"] = request.previewUrl;
  }

  return buildMessagePayload({
    recipient: request.recipient,
    messageType: "text",
    messageBody: payload,
    replyToMessageId: request.replyToMessageId,
    providerOptions: request.providerOptions,
  });
}

function buildTemplatePayload(request: WhatsAppTemplateRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: requireText(request.templateName, "templateName"),
    language: { code: requireText(request.languageCode, "languageCode") },
  };

  if (request.components?.length) {
    payload["components"] = request.components.map((component) => buildTemplateComponent(component));
  }

  return buildMessagePayload({
    recipient: request.recipient,
    messageType: "template",
    messageBody: payload,
    replyToMessageId: request.replyToMessageId,
    providerOptions: request.providerOptions,
  });
}

function buildMediaPayload(request: WhatsAppMediaRequest): Record<string, unknown> {
  const mediaPayload = buildMediaObject({
    mediaId: request.mediaId,
    link: request.link,
    fieldName: "media",
  });

  if (request.caption && ["image", "video", "document"].includes(request.mediaType)) {
    mediaPayload["caption"] = request.caption;
  }

  if (request.filename && request.mediaType === "document") {
    mediaPayload["filename"] = request.filename;
  }

  return buildMessagePayload({
    recipient: request.recipient,
    messageType: request.mediaType,
    messageBody: mediaPayload,
    replyToMessageId: request.replyToMessageId,
    providerOptions: request.providerOptions,
  });
}

function buildLocationPayload(request: WhatsAppLocationRequest): Record<string, unknown> {
  return buildMessagePayload({
    recipient: request.recipient,
    messageType: "location",
    messageBody: compactRecord({
      latitude: request.latitude,
      longitude: request.longitude,
      name: coerceString(request.name),
      address: coerceString(request.address),
    }),
    replyToMessageId: request.replyToMessageId,
    providerOptions: request.providerOptions,
  });
}

function buildContactsPayload(request: WhatsAppContactsRequest): Record<string, unknown> {
  if (!request.contacts.length) {
    throw new Error("contacts must not be empty.");
  }

  return buildMessagePayload({
    recipient: request.recipient,
    messageType: "contacts",
    messageBody: request.contacts.map((contact) => buildContact(contact)),
    replyToMessageId: request.replyToMessageId,
    providerOptions: request.providerOptions,
  });
}

function buildReactionPayload(request: WhatsAppReactionRequest): Record<string, unknown> {
  return buildMessagePayload({
    recipient: request.recipient,
    messageType: "reaction",
    messageBody: {
      message_id: requireText(request.messageId, "messageId"),
      emoji: requireText(request.emoji, "emoji"),
    },
    providerOptions: request.providerOptions,
  });
}

function buildInteractivePayload(request: WhatsAppInteractiveRequest): Record<string, unknown> {
  const interactive: Record<string, unknown> = {
    type: request.interactiveType,
    body: { text: requireText(request.bodyText, "bodyText") },
  };

  if (request.header) {
    interactive["header"] = buildInteractiveHeader(request.header);
  }

  if (request.footerText) {
    interactive["footer"] = { text: request.footerText };
  }

  if (request.interactiveType === "button") {
    if (!request.buttons?.length) {
      throw new Error("buttons must not be empty for button interactive messages.");
    }

    interactive["action"] = {
      buttons: request.buttons.map((button) => buildInteractiveButton(button)),
    };
  } else {
    const sections = request.sections?.map((section) => buildInteractiveSection(section)) ?? [];

    if (!sections.length) {
      throw new Error("sections must not be empty for list interactive messages.");
    }

    interactive["action"] = {
      button: requireText(request.buttonText, "buttonText"),
      sections,
    };
  }

  return buildMessagePayload({
    recipient: request.recipient,
    messageType: "interactive",
    messageBody: interactive,
    replyToMessageId: request.replyToMessageId,
    providerOptions: request.providerOptions,
  });
}

function buildCatalogMessagePayload(request: WhatsAppCatalogMessageRequest): Record<string, unknown> {
  return buildMessagePayload({
    recipient: request.recipient,
    messageType: "interactive",
    messageBody: buildCatalogInteractivePayload(request),
    replyToMessageId: request.replyToMessageId,
    providerOptions: request.providerOptions,
  });
}

function buildProductMessagePayload(request: WhatsAppProductMessageRequest): Record<string, unknown> {
  return buildMessagePayload({
    recipient: request.recipient,
    messageType: "interactive",
    messageBody: buildProductInteractivePayload(request),
    replyToMessageId: request.replyToMessageId,
    providerOptions: request.providerOptions,
  });
}

function buildProductListPayload(request: WhatsAppProductListRequest): Record<string, unknown> {
  return buildMessagePayload({
    recipient: request.recipient,
    messageType: "interactive",
    messageBody: buildProductListInteractivePayload(request),
    replyToMessageId: request.replyToMessageId,
    providerOptions: request.providerOptions,
  });
}

function buildFlowMessagePayload(request: WhatsAppFlowMessageRequest): Record<string, unknown> {
  return buildMessagePayload({
    recipient: request.recipient,
    messageType: "interactive",
    messageBody: buildFlowInteractivePayload(request),
    replyToMessageId: request.replyToMessageId,
    providerOptions: request.providerOptions,
  });
}

function buildMessagePayload(input: {
  recipient: string;
  messageType: string;
  messageBody: unknown;
  replyToMessageId?: string;
  providerOptions?: Record<string, unknown>;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...(input.providerOptions ?? {}),
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: requireText(input.recipient, "recipient"),
    type: input.messageType,
    [input.messageType]: input.messageBody,
  };

  if (input.replyToMessageId) {
    payload["context"] = { message_id: input.replyToMessageId };
  }

  return payload;
}

function buildTemplateComponent(component: WhatsAppTemplateComponent): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: component.type,
  };

  if (component.subType) {
    payload["sub_type"] = component.subType;
  }

  if (component.index !== undefined) {
    payload["index"] = component.index;
  }

  if (component.parameters?.length) {
    payload["parameters"] = component.parameters.map((parameter) => buildTemplateParameter(parameter));
  }

  return payload;
}

function buildTemplateParameter(parameter: WhatsAppTemplateParameter): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...(parameter.providerOptions ?? {}),
    type: parameter.type,
  };

  if (parameter.value !== undefined) {
    if (parameter.type === "text") {
      payload["text"] = parameter.value;
    } else if (parameter.type === "payload") {
      payload["payload"] = parameter.value;
    } else if (["image", "video", "document"].includes(parameter.type)) {
      if (!payload[parameter.type]) {
        payload[parameter.type] = { id: parameter.value };
      }
    } else if (!("text" in payload)) {
      payload["text"] = parameter.value;
    }
  }

  return payload;
}

function buildMediaObject(input: {
  mediaId?: string;
  link?: string;
  fieldName: string;
}): Record<string, string> {
  const mediaId = coerceString(input.mediaId);
  const link = coerceString(input.link);

  if (mediaId && link) {
    throw new Error(`${input.fieldName} accepts either mediaId or link, not both.`);
  }

  if (!mediaId && !link) {
    throw new Error(`${input.fieldName} requires either mediaId or link.`);
  }

  return mediaId ? { id: mediaId } : { link: link ?? "" };
}

function buildContact(contact: WhatsAppContact): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: compactRecord({
      formatted_name: requireText(contact.name.formattedName, "contacts[].name.formattedName"),
      first_name: coerceString(contact.name.firstName),
      last_name: coerceString(contact.name.lastName),
      middle_name: coerceString(contact.name.middleName),
      suffix: coerceString(contact.name.suffix),
      prefix: coerceString(contact.name.prefix),
    }),
  };

  if (contact.phones?.length) {
    payload["phones"] = contact.phones.map((phone) => buildContactPhone(phone));
  }

  if (contact.emails?.length) {
    payload["emails"] = contact.emails.map((email) => buildContactEmail(email));
  }

  if (contact.urls?.length) {
    payload["urls"] = contact.urls.map((url) => buildContactUrl(url));
  }

  if (contact.addresses?.length) {
    payload["addresses"] = contact.addresses.map((address) => buildContactAddress(address));
  }

  if (contact.org) {
    payload["org"] = buildContactOrg(contact.org);
  }

  if (contact.birthday) {
    payload["birthday"] = contact.birthday;
  }

  return payload;
}

function buildContactPhone(phone: WhatsAppContactPhone): Record<string, unknown> {
  return compactRecord({
    phone: requireText(phone.phone, "contacts[].phones[].phone"),
    type: coerceString(phone.type),
    wa_id: coerceString(phone.waId),
  });
}

function buildContactEmail(email: WhatsAppContactEmail): Record<string, unknown> {
  return compactRecord({
    email: requireText(email.email, "contacts[].emails[].email"),
    type: coerceString(email.type),
  });
}

function buildContactUrl(url: WhatsAppContactUrl): Record<string, unknown> {
  return compactRecord({
    url: requireText(url.url, "contacts[].urls[].url"),
    type: coerceString(url.type),
  });
}

function buildContactAddress(address: WhatsAppContactAddress): Record<string, unknown> {
  return compactRecord({
    street: coerceString(address.street),
    city: coerceString(address.city),
    state: coerceString(address.state),
    zip: coerceString(address.zip),
    country: coerceString(address.country),
    country_code: coerceString(address.countryCode),
    type: coerceString(address.type),
  });
}

function buildContactOrg(org: WhatsAppContactOrg): Record<string, unknown> {
  return compactRecord({
    company: coerceString(org.company),
    department: coerceString(org.department),
    title: coerceString(org.title),
  });
}

function buildInteractiveHeader(header: WhatsAppInteractiveHeader): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...(header.providerOptions ?? {}),
    type: header.type,
  };

  if (header.type === "text") {
    payload["text"] = requireText(header.text, "header.text");
    return payload;
  }

  const mediaPayload = buildMediaObject({
    mediaId: header.mediaId,
    link: header.link,
    fieldName: "header",
  });

  if (header.filename && header.type === "document") {
    mediaPayload["filename"] = header.filename;
  }

  payload[header.type] = mediaPayload;
  return payload;
}

function buildInteractiveButton(button: WhatsAppInteractiveButton): Record<string, unknown> {
  return {
    type: "reply",
    reply: {
      id: requireText(button.identifier, "buttons[].identifier"),
      title: requireText(button.title, "buttons[].title"),
    },
  };
}

function buildInteractiveSection(section: WhatsAppInteractiveSection): Record<string, unknown> {
  if (!section.rows.length) {
    throw new Error("sections[].rows must not be empty.");
  }

  return compactRecord({
    title: coerceString(section.title),
    rows: section.rows.map((row) => buildInteractiveRow(row)),
  });
}

function buildInteractiveRow(row: WhatsAppInteractiveRow): Record<string, unknown> {
  return compactRecord({
    id: requireText(row.identifier, "sections[].rows[].identifier"),
    title: requireText(row.title, "sections[].rows[].title"),
    description: coerceString(row.description),
  });
}

function buildCatalogInteractivePayload(
  request: WhatsAppCatalogMessageRequest,
): Record<string, unknown> {
  const interactive = buildCommonInteractivePayload({
    interactiveType: "catalog_message",
    bodyText: request.bodyText,
    header: request.header,
    footerText: request.footerText,
  });

  const action: Record<string, unknown> = { name: "catalog_message" };

  if (request.thumbnailProductRetailerId) {
    action["parameters"] = {
      thumbnail_product_retailer_id: requireText(
        request.thumbnailProductRetailerId,
        "thumbnailProductRetailerId",
      ),
    };
  }

  interactive["action"] = action;
  return interactive;
}

function buildProductInteractivePayload(
  request: WhatsAppProductMessageRequest,
): Record<string, unknown> {
  const interactive = buildCommonInteractivePayload({
    interactiveType: "product",
    bodyText: request.bodyText,
    footerText: request.footerText,
  });

  interactive["action"] = {
    catalog_id: requireText(request.catalogId, "catalogId"),
    product_retailer_id: requireText(request.productRetailerId, "productRetailerId"),
  };

  return interactive;
}

function buildProductListInteractivePayload(
  request: WhatsAppProductListRequest,
): Record<string, unknown> {
  const sections = request.sections.map((section) => buildProductSection(section));

  if (!sections.length) {
    throw new Error("sections must not be empty for productList interactive messages.");
  }

  if (!request.header) {
    throw new Error("header is required for productList interactive messages.");
  }

  const interactive = buildCommonInteractivePayload({
    interactiveType: "product_list",
    bodyText: request.bodyText,
    header: request.header,
    footerText: request.footerText,
  });

  interactive["action"] = {
    catalog_id: requireText(request.catalogId, "catalogId"),
    sections,
  };

  return interactive;
}

function buildFlowInteractivePayload(request: WhatsAppFlowMessageRequest): Record<string, unknown> {
  const interactive = buildCommonInteractivePayload({
    interactiveType: "flow",
    bodyText: request.bodyText,
    header: request.header,
    footerText: request.footerText,
  });

  const parameters: Record<string, unknown> = compactRecord({
    flow_message_version: requireText(request.flowMessageVersion ?? "3", "flowMessageVersion"),
    flow_token: coerceString(request.flowToken),
    flow_id: coerceString(request.flowId),
    flow_name: coerceString(request.flowName),
    flow_cta: requireText(request.flowCta, "flowCta"),
    flow_action: requireText(request.flowAction ?? "navigate", "flowAction"),
  });

  if (Boolean(parameters["flow_id"]) === Boolean(parameters["flow_name"])) {
    throw new Error("flow messages require exactly one of flowId or flowName.");
  }

  if (request.flowActionPayload && Object.keys(request.flowActionPayload).length) {
    parameters["flow_action_payload"] = request.flowActionPayload;
  }

  interactive["action"] = {
    name: "flow",
    parameters,
  };

  return interactive;
}

function buildCommonInteractivePayload(input: {
  interactiveType: string;
  bodyText?: string;
  header?: WhatsAppInteractiveHeader;
  footerText?: string;
}): Record<string, unknown> {
  const interactive: Record<string, unknown> = {
    type: input.interactiveType,
  };

  if (input.bodyText) {
    interactive["body"] = { text: requireText(input.bodyText, "bodyText") };
  }

  if (input.header) {
    interactive["header"] = buildInteractiveHeader(input.header);
  }

  if (input.footerText) {
    interactive["footer"] = { text: input.footerText };
  }

  return interactive;
}

function buildProductSection(section: WhatsAppProductSection): Record<string, unknown> {
  if (!section.productItems.length) {
    throw new Error("sections[].productItems must not be empty.");
  }

  return {
    title: requireText(section.title, "sections[].title"),
    product_items: section.productItems.map((item) => buildProductItem(item)),
  };
}

function buildProductItem(item: WhatsAppProductItem): Record<string, unknown> {
  return {
    product_retailer_id: requireText(
      item.productRetailerId,
      "sections[].productItems[].productRetailerId",
    ),
  };
}

function iterateValueObjects(payload: Record<string, unknown>): Record<string, unknown>[] {
  const root = asRecord(payload);
  const entries = Array.isArray(root["entry"]) ? root["entry"] : [];
  const values: Record<string, unknown>[] = [];

  for (const entry of entries) {
    const rawChanges = asRecord(entry)["changes"];
    const changes = Array.isArray(rawChanges) ? rawChanges : [];

    for (const change of changes) {
      values.push(asRecord(asRecord(change)["value"]));
    }
  }

  return values;
}

function buildProfileLookup(value: unknown): Record<string, string | undefined> {
  const contacts = Array.isArray(value) ? value : [];
  const profiles: Record<string, string | undefined> = {};

  for (const row of contacts) {
    const payload = asRecord(row);
    const waId = coerceString(payload["wa_id"]);

    if (waId) {
      profiles[waId] = coerceString(asRecord(payload["profile"])["name"]);
    }
  }

  return profiles;
}

function buildInboundMessage(input: {
  providerName: string;
  payload: unknown;
  profiles: Record<string, string | undefined>;
  webhookMetadata: Record<string, unknown>;
}): WhatsAppInboundMessage | null {
  const message = asRecord(input.payload);
  const senderId = coerceString(message["from"]);
  const messageId = coerceString(message["id"]);

  if (!senderId || !messageId) {
    return null;
  }

  const rawType = coerceString(message["type"]) ?? "unsupported";
  const context = asRecord(message["context"]);
  const referral = asRecord(message["referral"]);
  let metadata: Record<string, unknown> = compactRecord({
    displayPhoneNumber: coerceString(input.webhookMetadata["display_phone_number"]),
    phoneNumberId: coerceString(input.webhookMetadata["phone_number_id"]),
    referral: Object.keys(referral).length ? referral : undefined,
    providerMessageType: rawType === "unsupported" ? rawType : undefined,
  });

  let text: string | undefined;
  let media: WhatsAppInboundMedia | undefined;
  let location: WhatsAppInboundLocation | undefined;
  let contacts: WhatsAppContact[] = [];
  let reply: WhatsAppInboundReply | undefined;
  let reaction: WhatsAppInboundReaction | undefined;
  let messageType = rawType;

  if (rawType === "text") {
    text = coerceString(asRecord(message["text"])["body"]);
  } else if (MEDIA_TYPES.has(rawType)) {
    media = buildInboundMedia(rawType, message[rawType]);
  } else if (rawType === "location") {
    location = buildInboundLocation(message["location"]);
  } else if (rawType === "contacts") {
    contacts = parseContactList(message["contacts"]);
  } else if (rawType === "button") {
    reply = buildButtonReply(message["button"]);
  } else if (rawType === "interactive") {
    reply = buildInteractiveReply(message["interactive"]);
  } else if (rawType === "reaction") {
    reaction = buildInboundReaction(message["reaction"]);
  } else {
    messageType = "unsupported";
    metadata = {
      ...metadata,
      providerMessageType: rawType,
    };
  }

  return {
    provider: input.providerName,
    senderId,
    messageId,
    messageType: messageType as WhatsAppInboundMessage["messageType"],
    timestamp: coerceString(message["timestamp"]),
    profileName: input.profiles[senderId],
    contextMessageId: coerceString(context["message_id"]),
    forwarded: typeof context["forwarded"] === "boolean" ? context["forwarded"] : undefined,
    frequentlyForwarded:
      typeof context["frequently_forwarded"] === "boolean"
        ? context["frequently_forwarded"]
        : undefined,
    text,
    media,
    location,
    contacts,
    reply,
    reaction,
    metadata,
    raw: message,
  };
}

function buildInboundMedia(messageType: string, payload: unknown): WhatsAppInboundMedia | undefined {
  const data = asRecord(payload);

  if (!Object.keys(data).length) {
    return undefined;
  }

  return {
    mediaType: messageType as WhatsAppInboundMedia["mediaType"],
    mediaId: coerceString(data["id"]),
    mimeType: coerceString(data["mime_type"]),
    sha256: coerceString(data["sha256"]),
    caption: coerceString(data["caption"]),
    filename: coerceString(data["filename"]),
    raw: data,
  };
}

function buildInboundLocation(payload: unknown): WhatsAppInboundLocation | undefined {
  const data = asRecord(payload);

  if (!Object.keys(data).length) {
    return undefined;
  }

  return {
    latitude: coerceNumber(data["latitude"]),
    longitude: coerceNumber(data["longitude"]),
    name: coerceString(data["name"]),
    address: coerceString(data["address"]),
    url: coerceString(data["url"]),
    raw: data,
  };
}

function buildButtonReply(payload: unknown): WhatsAppInboundReply | undefined {
  const data = asRecord(payload);

  if (!Object.keys(data).length) {
    return undefined;
  }

  return {
    replyType: "button",
    payload: coerceString(data["payload"]),
    title: coerceString(data["text"]),
    raw: data,
  };
}

function buildInteractiveReply(payload: unknown): WhatsAppInboundReply | undefined {
  const data = asRecord(payload);
  const replyType = coerceString(data["type"]);

  if (replyType === "button_reply") {
    const reply = asRecord(data["button_reply"]);
    return {
      replyType: "button_reply",
      identifier: coerceString(reply["id"]),
      title: coerceString(reply["title"]),
      raw: data,
    };
  }

  if (replyType === "list_reply") {
    const reply = asRecord(data["list_reply"]);
    return {
      replyType: "list_reply",
      identifier: coerceString(reply["id"]),
      title: coerceString(reply["title"]),
      description: coerceString(reply["description"]),
      raw: data,
    };
  }

  return undefined;
}

function buildInboundReaction(payload: unknown): WhatsAppInboundReaction | undefined {
  const data = asRecord(payload);

  if (!Object.keys(data).length) {
    return undefined;
  }

  return {
    emoji: coerceString(data["emoji"]),
    relatedMessageId: coerceString(data["message_id"]),
    raw: data,
  };
}

function parseContactList(value: unknown): WhatsAppContact[] {
  return normalizeRows(value)
    .map((row) => parseContact(row))
    .filter((contact): contact is WhatsAppContact => contact !== null);
}

function parseContact(value: Record<string, unknown>): WhatsAppContact | null {
  const namePayload = asRecord(value["name"]);
  const formattedName = coerceString(namePayload["formatted_name"]);

  if (!formattedName) {
    return null;
  }

  return {
    name: {
      formattedName,
      firstName: coerceString(namePayload["first_name"]),
      lastName: coerceString(namePayload["last_name"]),
      middleName: coerceString(namePayload["middle_name"]),
      suffix: coerceString(namePayload["suffix"]),
      prefix: coerceString(namePayload["prefix"]),
    },
    phones: normalizeRows(value["phones"]).map((row) => parseContactPhone(row)),
    emails: normalizeRows(value["emails"]).map((row) => parseContactEmail(row)),
    urls: normalizeRows(value["urls"]).map((row) => parseContactUrl(row)),
    addresses: normalizeRows(value["addresses"]).map((row) => parseContactAddress(row)),
    org: parseContactOrg(value["org"]),
    birthday: coerceString(value["birthday"]),
  };
}

function parseContactPhone(value: Record<string, unknown>): WhatsAppContactPhone {
  return {
    phone: coerceString(value["phone"]) ?? "",
    type: coerceString(value["type"]),
    waId: coerceString(value["wa_id"]),
  };
}

function parseContactEmail(value: Record<string, unknown>): WhatsAppContactEmail {
  return {
    email: coerceString(value["email"]) ?? "",
    type: coerceString(value["type"]),
  };
}

function parseContactUrl(value: Record<string, unknown>): WhatsAppContactUrl {
  return {
    url: coerceString(value["url"]) ?? "",
    type: coerceString(value["type"]),
  };
}

function parseContactAddress(value: Record<string, unknown>): WhatsAppContactAddress {
  return {
    street: coerceString(value["street"]),
    city: coerceString(value["city"]),
    state: coerceString(value["state"]),
    zip: coerceString(value["zip"]),
    country: coerceString(value["country"]),
    countryCode: coerceString(value["country_code"]),
    type: coerceString(value["type"]),
  };
}

function parseContactOrg(value: unknown): WhatsAppContactOrg | undefined {
  const payload = asRecord(value);

  if (!Object.keys(payload).length) {
    return undefined;
  }

  return {
    company: coerceString(payload["company"]),
    department: coerceString(payload["department"]),
    title: coerceString(payload["title"]),
  };
}

function buildStatusEvent(providerName: string, payload: unknown): DeliveryEvent | null {
  const status = asRecord(payload);
  const providerMessageId = coerceString(status["id"]);

  if (!providerMessageId) {
    return null;
  }

  const error = firstMapping(status["errors"]);
  const conversation = asRecord(status["conversation"]);
  const pricing = asRecord(status["pricing"]);
  const providerStatus = coerceString(status["status"]);

  return {
    channel: "whatsapp",
    provider: providerName,
    providerMessageId,
    state: mapWhatsAppState(providerStatus),
    recipient: coerceString(status["recipient_id"]),
    providerStatus,
    errorCode: coerceString(error["code"]),
    errorDescription:
      coerceString(error["message"]) ??
      coerceString(error["title"]) ??
      coerceString(error["details"]),
    occurredAt: coerceString(status["timestamp"]),
    metadata: compactRecord({
      conversationId: coerceString(conversation["id"]),
      conversationOriginType: coerceString(asRecord(conversation["origin"])["type"]),
      pricingModel: coerceString(pricing["pricing_model"]),
      billable: pricing["billable"] as boolean | undefined,
      category: coerceString(pricing["category"]),
    }),
    raw: status,
  };
}

function buildSendResult(
  providerName: string,
  recipient: string,
  response: Record<string, unknown>,
): WhatsAppSendResult {
  const contact = firstMapping(response["contacts"]);
  const message = firstMapping(response["messages"]);
  const providerMessageId = coerceString(message["id"]);

  if (!providerMessageId) {
    throw new GatewayError("Meta WhatsApp Cloud API did not return a message id.", {
      provider: providerName,
      responseBody: response,
    });
  }

  const receipt: WhatsAppSendReceipt = {
    provider: providerName,
    recipient: coerceString(contact["wa_id"]) ?? recipient,
    status: "submitted",
    providerMessageId,
    providerStatus: coerceString(message["message_status"]),
    raw: Object.keys(message).length ? message : response,
  };

  return {
    provider: providerName,
    accepted: true,
    messages: [receipt],
    submittedCount: 1,
    failedCount: 0,
    raw: response,
  };
}

function validateResponse(
  providerName: string,
  response: Record<string, unknown>,
): Record<string, unknown> {
  if (!Object.keys(response).length) {
    throw new GatewayError("Meta WhatsApp Cloud API returned a non-object response.", {
      provider: providerName,
      responseBody: response,
    });
  }

  const error = asRecord(response["error"]);

  if (Object.keys(error).length) {
    const description =
      coerceString(error["error_user_msg"]) ??
      coerceString(error["message"]) ??
      "Provider request failed.";

    throw new GatewayError(`Meta WhatsApp request failed: ${description}`, {
      provider: providerName,
      errorCode: coerceString(error["code"]),
      errorDescription: description,
      responseBody: response,
    });
  }

  return response;
}

function firstMapping(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return value.length ? asRecord(value[0]) : {};
  }

  return asRecord(value);
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => entry)
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function setQueryValue(
  query: Record<string, string>,
  key: string,
  value: unknown,
  options: { uppercase?: boolean } = {},
): void {
  if (value === undefined || value === null) {
    return;
  }

  if (typeof value === "string" || typeof value === "number") {
    const normalized = requireText(coerceString(value), key);
    query[key] = options.uppercase ? normalized.toUpperCase() : normalized;
    return;
  }

  if (Array.isArray(value)) {
    const items = normalizeTextSequence(value, `${key}[]`);

    if (!items.length) {
      return;
    }

    query[key] = (options.uppercase ? items.map((item) => item.toUpperCase()) : items).join(",");
    return;
  }

  const normalized = requireText(coerceString(value), key);
  query[key] = options.uppercase ? normalized.toUpperCase() : normalized;
}

function normalizeTextSequence(value: unknown[], fieldName: string): string[] {
  return value.map((item) => requireText(coerceString(item), fieldName));
}

function normalizeTemplateEnum(value: string, fieldName: string): string {
  return requireText(value, fieldName).toUpperCase();
}

function mapWhatsAppState(status?: string): DeliveryEvent["state"] {
  const normalized = (status ?? "").toLowerCase();

  if (normalized === "accepted" || normalized === "sent") {
    return "submitted";
  }

  if (normalized === "delivered" || normalized === "read" || normalized === "failed") {
    return normalized as DeliveryEvent["state"];
  }

  return "unknown";
}

function toBlobPart(value: Buffer | Uint8Array | ArrayBuffer): ArrayBuffer {
  if (Buffer.isBuffer(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  }

  if (value instanceof Uint8Array) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  }

  if (value instanceof ArrayBuffer) {
    return value;
  }

  return value;
}

function requireText(value: unknown, fieldName: string): string {
  const normalized = coerceString(value);

  if (!normalized) {
    throw new ConfigurationError(`${fieldName} is required.`);
  }

  return normalized;
}
