import { getEnvNumber, getOptionalEnv, getRequiredEnv } from "../../core/config";
import { ConfigurationError, GatewayError } from "../../core/errors";
import { HttpClient } from "../../core/http";
import type { RequestOptions } from "../../core/types";
import { coerceBoolean, coerceInt, coerceNumber, coerceString, firstString, formatScheduleTime } from "../../core/utils";
import type { DeliveryEvent } from "../../events";
import type {
  OnfonSmsFromEnvOptions,
  OnfonSmsGatewayOptions,
  SmsBalance,
  SmsBalanceEntry,
  SmsGateway,
  SmsGroup,
  SmsGroupUpsertRequest,
  SmsManagementGateway,
  SmsManagementResult,
  SmsMessage,
  SmsSendReceipt,
  SmsSendRequest,
  SmsSendResult,
  SmsTemplate,
  SmsTemplateUpsertRequest,
} from "./types";

export const ONFON_SMS_BASE_URL = "https://api.onfonmedia.co.ke/v1/sms";
export const ONFON_BASE_URL = ONFON_SMS_BASE_URL;

export class OnfonSmsGateway implements SmsManagementGateway {
  static fromEnv(options: OnfonSmsFromEnvOptions = {}): OnfonSmsGateway {
    const prefix = options.prefix ?? "ONFON_";
    const env = options.env;

    return new OnfonSmsGateway({
      accessKey: getRequiredEnv(`${prefix}ACCESS_KEY`, env),
      apiKey: getRequiredEnv(`${prefix}API_KEY`, env),
      clientId: getRequiredEnv(`${prefix}CLIENT_ID`, env),
      defaultSenderId: getOptionalEnv(`${prefix}SENDER_ID`, env),
      baseUrl: options.baseUrl ?? getOptionalEnv(`${prefix}BASE_URL`, env),
      fetch: options.fetch,
      timeoutMs: options.timeoutMs ?? getEnvNumber(`${prefix}TIMEOUT_SECONDS`, env),
      defaultHeaders: options.defaultHeaders,
      retry: options.retry,
      hooks: options.hooks,
    });
  }

  readonly providerName = "onfon";
  private readonly apiKey: string;
  private readonly clientId: string;
  private readonly defaultSenderId?: string;
  private readonly http: HttpClient;

  constructor(options: OnfonSmsGatewayOptions) {
    const accessKey = requireText(options.accessKey, "accessKey");
    this.apiKey = requireText(options.apiKey, "apiKey");
    this.clientId = requireText(options.clientId, "clientId");
    this.defaultSenderId = coerceString(options.defaultSenderId);
    this.http = new HttpClient({
      baseUrl: options.baseUrl ?? ONFON_SMS_BASE_URL,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs ?? 30_000,
      defaultHeaders: {
        "AccessKey": accessKey,
        "Content-Type": "application/json",
        ...(options.defaultHeaders ?? {}),
      },
      retry: options.retry,
      hooks: options.hooks,
    });
  }

  async send(request: SmsSendRequest, options?: RequestOptions): Promise<SmsSendResult> {
    const response = await this.request("/SendBulkSMS", "POST", {
      body: this.buildSendPayload(request),
      options,
    });

    return this.buildSendResult(request, response);
  }

  async getBalance(options?: RequestOptions): Promise<SmsBalance> {
    const response = await this.request("/Balance", "GET", {
      query: this.authQuery(),
      options,
    });

    return {
      provider: this.providerName,
      entries: normalizeRows(response["Data"]).map((row) => buildBalanceEntry(row)),
      raw: response,
    };
  }

  async listGroups(options?: RequestOptions): Promise<SmsGroup[]> {
    const response = await this.request("/Group", "GET", {
      query: this.authQuery(),
      options,
    });

    return normalizeRows(response["Data"])
      .map((row) => buildGroup(row))
      .filter((row): row is SmsGroup => row !== null);
  }

  async createGroup(
    request: SmsGroupUpsertRequest,
    options?: RequestOptions,
  ): Promise<SmsManagementResult> {
    const response = await this.request("/Group", "POST", {
      body: buildGroupPayload(request, this.apiKey, this.clientId),
      options,
    });

    return buildManagementResult(this.providerName, response);
  }

  async updateGroup(
    groupId: string,
    request: SmsGroupUpsertRequest,
    options?: RequestOptions,
  ): Promise<SmsManagementResult> {
    const normalizedGroupId = requireIdentifier(groupId, "groupId");
    const response = await this.request("/Group", "PUT", {
      query: { id: normalizedGroupId },
      body: buildGroupPayload(request, this.apiKey, this.clientId),
      options,
    });

    return buildManagementResult(this.providerName, response, normalizedGroupId);
  }

  async deleteGroup(groupId: string, options?: RequestOptions): Promise<SmsManagementResult> {
    const normalizedGroupId = requireIdentifier(groupId, "groupId");
    const response = await this.request("/Group", "DELETE", {
      query: {
        ...this.authQuery(),
        id: normalizedGroupId,
      },
      options,
    });

    return buildManagementResult(this.providerName, response, normalizedGroupId);
  }

  async listTemplates(options?: RequestOptions): Promise<SmsTemplate[]> {
    const response = await this.request("/Template", "GET", {
      query: this.authQuery(),
      options,
    });

    return normalizeRows(response["Data"])
      .map((row) => buildTemplate(row))
      .filter((row): row is SmsTemplate => row !== null);
  }

  async createTemplate(
    request: SmsTemplateUpsertRequest,
    options?: RequestOptions,
  ): Promise<SmsManagementResult> {
    const response = await this.request("/Template", "POST", {
      body: buildTemplatePayload(request, this.apiKey, this.clientId),
      options,
    });

    return buildManagementResult(this.providerName, response);
  }

  async updateTemplate(
    templateId: string,
    request: SmsTemplateUpsertRequest,
    options?: RequestOptions,
  ): Promise<SmsManagementResult> {
    const normalizedTemplateId = requireIdentifier(templateId, "templateId");
    const response = await this.request("/Template", "PUT", {
      query: { id: normalizedTemplateId },
      body: buildTemplatePayload(request, this.apiKey, this.clientId),
      options,
    });

    return buildManagementResult(this.providerName, response, normalizedTemplateId);
  }

  async deleteTemplate(
    templateId: string,
    options?: RequestOptions,
  ): Promise<SmsManagementResult> {
    const normalizedTemplateId = requireIdentifier(templateId, "templateId");
    const response = await this.request("/Template", "DELETE", {
      query: {
        ...this.authQuery(),
        id: normalizedTemplateId,
      },
      options,
    });

    return buildManagementResult(this.providerName, response, normalizedTemplateId);
  }

  parseDeliveryReport(payload: Record<string, unknown>): DeliveryEvent | null {
    const normalized = normalizeMapping(payload);
    const providerMessageId = firstString(normalized["messageId"], normalized["MessageId"]);

    if (!providerMessageId) {
      return null;
    }

    const providerStatus = firstString(normalized["status"], normalized["Status"]);

    return {
      channel: "sms",
      provider: this.providerName,
      providerMessageId,
      recipient: firstString(normalized["mobile"], normalized["MobileNumber"]),
      state: mapDeliveryState(providerStatus),
      providerStatus,
      errorCode: firstString(normalized["errorCode"], normalized["ErrorCode"]),
      occurredAt: firstString(
        normalized["doneDate"],
        normalized["DoneDate"],
        normalized["submitDate"],
        normalized["SubmitDate"],
      ),
      metadata: {},
      raw: normalized,
    };
  }

  async close(): Promise<void> {}

  private async request(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    input: {
      body?: Record<string, unknown>;
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

  private authQuery(): Record<string, string> {
    return {
      ApiKey: this.apiKey,
      ClientId: this.clientId,
    };
  }

  private buildSendPayload(request: SmsSendRequest): Record<string, unknown> {
    validateSendRequest(request);
    const senderId = firstString(request.senderId, this.defaultSenderId);

    if (!senderId) {
      throw new ConfigurationError(
        "senderId is required either on SmsSendRequest or as defaultSenderId.",
      );
    }

    const payload: Record<string, unknown> = {
      ...(request.providerOptions ?? {}),
      SenderId: senderId,
      MessageParameters: request.messages.map((message) => ({
        Number: message.recipient,
        Text: message.text,
      })),
      ApiKey: this.apiKey,
      ClientId: this.clientId,
    };

    if (request.isUnicode !== undefined) {
      payload["IsUnicode"] = request.isUnicode;
    }

    if (request.isFlash !== undefined) {
      payload["IsFlash"] = request.isFlash;
    }

    if (request.scheduleAt !== undefined) {
      payload["ScheduleDateTime"] = formatScheduleTime(request.scheduleAt);
    }

    return payload;
  }

  private buildSendResult(
    request: SmsSendRequest,
    response: Record<string, unknown>,
  ): SmsSendResult {
    const items = normalizeRows(response["Data"]);
    const messages = request.messages.map((message, index) => {
      const row = items[index] ?? {};
      const providerMessageId = coerceString(row["MessageId"]);
      const recipient = firstString(row["MobileNumber"], message.recipient) ?? message.recipient;

      return buildSendReceipt(this.providerName, message, row, recipient, providerMessageId);
    });

    return {
      provider: this.providerName,
      accepted: true,
      errorCode: normalizeErrorCode(response["ErrorCode"]),
      errorDescription: coerceString(response["ErrorDescription"]),
      submittedCount: messages.filter((message) => message.status === "submitted").length,
      failedCount: messages.filter((message) => message.status === "failed").length,
      messages,
      raw: response,
    };
  }
}

export { OnfonSmsGateway as OnfonGateway };

function validateSendRequest(request: SmsSendRequest): void {
  if (!request.messages.length) {
    throw new Error("SmsSendRequest.messages must not be empty.");
  }

  request.messages.forEach((message, index) => {
    if (!coerceString(message.recipient)) {
      throw new Error(`messages[${index}].recipient must not be empty.`);
    }

    if (!coerceString(message.text)) {
      throw new Error(`messages[${index}].text must not be empty.`);
    }
  });
}

function buildSendReceipt(
  providerName: string,
  message: SmsMessage,
  row: Record<string, unknown>,
  recipient: string,
  providerMessageId?: string,
): SmsSendReceipt {
  if (!providerMessageId) {
    return {
      provider: providerName,
      recipient,
      text: message.text,
      status: "failed",
      reference: message.reference,
      providerErrorCode: "MISSING_MESSAGE_ID",
      providerErrorDescription:
        "Provider accepted the request but did not return a MessageId for this recipient.",
      raw: Object.keys(row).length ? row : undefined,
    };
  }

  return {
    provider: providerName,
    recipient,
    text: message.text,
    status: "submitted",
    providerMessageId,
    reference: message.reference,
    raw: Object.keys(row).length ? row : undefined,
  };
}

function buildBalanceEntry(row: Record<string, unknown>): SmsBalanceEntry {
  const creditsRaw = coerceString(row["Credits"]);

  return {
    label: coerceString(row["PluginType"]),
    creditsRaw,
    credits: parseNumberFromText(creditsRaw),
    raw: row,
  };
}

function buildGroup(row: Record<string, unknown>): SmsGroup | null {
  const groupId = coerceString(row["GroupId"]);

  if (!groupId) {
    return null;
  }

  return {
    groupId,
    name: coerceString(row["GroupName"]) ?? "",
    contactCount: coerceInt(row["ContactCount"]),
    raw: row,
  };
}

function buildTemplate(row: Record<string, unknown>): SmsTemplate | null {
  const templateId = coerceString(row["TemplateId"]);

  if (!templateId) {
    return null;
  }

  return {
    templateId,
    name: coerceString(row["TemplateName"]) ?? "",
    body: coerceString(row["MessageTemplate"]) ?? "",
    approved: coerceBoolean(row["IsApproved"]),
    active: coerceBoolean(row["IsActive"]),
    createdAt: coerceString(row["CreatededDate"]),
    approvedAt: coerceString(row["ApprovedDate"]),
    raw: row,
  };
}

function buildGroupPayload(
  request: SmsGroupUpsertRequest,
  apiKey: string,
  clientId: string,
): Record<string, unknown> {
  return {
    ...(request.providerOptions ?? {}),
    GroupName: requireText(request.name, "name"),
    ApiKey: apiKey,
    ClientId: clientId,
  };
}

function buildTemplatePayload(
  request: SmsTemplateUpsertRequest,
  apiKey: string,
  clientId: string,
): Record<string, unknown> {
  return {
    ...(request.providerOptions ?? {}),
    TemplateName: requireText(request.name, "name"),
    MessageTemplate: requireText(request.body, "body"),
    ApiKey: apiKey,
    ClientId: clientId,
  };
}

function buildManagementResult(
  providerName: string,
  response: Record<string, unknown>,
  resourceId?: string,
): SmsManagementResult {
  return {
    provider: providerName,
    success: true,
    message: firstString(response["Data"], response["ErrorDescription"]),
    resourceId,
    raw: response,
  };
}

function validateResponse(
  providerName: string,
  response: Record<string, unknown>,
): Record<string, unknown> {
  if (!Object.keys(response).length) {
    throw new GatewayError("Onfon returned a non-object response.", {
      provider: providerName,
      responseBody: response,
    });
  }

  if (!isSuccessPayload(response)) {
    const errorCode = normalizeErrorCode(response["ErrorCode"]);
    const errorDescription = coerceString(response["ErrorDescription"]) ?? "Provider request failed.";

    throw new GatewayError(`Onfon request failed: ${errorDescription}`, {
      provider: providerName,
      errorCode,
      errorDescription,
      responseBody: response,
    });
  }

  return response;
}

function isSuccessPayload(payload: Record<string, unknown>): boolean {
  const errorCode = payload["ErrorCode"];
  const errorDescription = coerceString(payload["ErrorDescription"]);

  if (!isSuccessCode(errorCode)) {
    return false;
  }

  if (errorDescription === undefined) {
    return true;
  }

  return errorDescription.toLowerCase().includes("success");
}

function isSuccessCode(value: unknown): boolean {
  const normalized = normalizeErrorCode(value);
  return normalized === undefined || normalized === "000" || normalized === "0";
}

function normalizeErrorCode(value: unknown): string | undefined {
  const normalized = coerceString(value);

  if (!normalized) {
    return undefined;
  }

  return /^\d+$/.test(normalized) ? normalized.padStart(3, "0") : normalized;
}

function mapDeliveryState(status?: string): DeliveryEvent["state"] {
  const normalized = (status ?? "").toLowerCase();

  if (["accepted", "queued"].includes(normalized)) {
    return normalized as DeliveryEvent["state"];
  }

  if (["sent", "submitted"].includes(normalized)) {
    return "submitted";
  }

  if (["delivered", "read", "failed"].includes(normalized)) {
    return normalized as DeliveryEvent["state"];
  }

  return "unknown";
}

function parseNumberFromText(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? coerceNumber(match[0]) : undefined;
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => entry)
    : [];
}

function normalizeMapping(value: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    normalized[key] = Array.isArray(entry) ? entry[0] : entry;
  }

  return normalized;
}

function requireText(value: unknown, fieldName: string): string {
  const normalized = coerceString(value);

  if (!normalized) {
    throw new ConfigurationError(`${fieldName} is required.`);
  }

  return normalized;
}

function requireIdentifier(value: unknown, fieldName: string): string {
  const normalized = coerceString(value);

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}
