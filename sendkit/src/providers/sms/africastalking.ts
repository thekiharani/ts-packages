import { getEnvNumber, getOptionalEnv, getRequiredEnv } from "../../core/config";
import { ConfigurationError, ProviderError } from "../../core/errors";
import { HttpClient } from "../../core/http";
import type { RequestOptions } from "../../core/types";
import { coerceInt, coerceNumber, coerceString, firstString } from "../../core/utils";
import type { DeliveryEvent } from "../../events";
import type {
  AfricasTalkingDeliveryReport,
  AfricasTalkingSmsClientOptions,
  AfricasTalkingSmsFromEnvOptions,
  SmsBalance,
  SmsClient,
  SmsMessage,
  SmsSendReceipt,
  SmsSendRequest,
  SmsSendResult,
} from "./types";

export const AFRICASTALKING_SMS_BASE_URL = "https://api.africastalking.com/version1";
export const AFRICASTALKING_SANDBOX_SMS_BASE_URL = "https://api.sandbox.africastalking.com/version1";

export class AfricasTalkingSmsClient implements SmsClient {
  static fromEnv(options: AfricasTalkingSmsFromEnvOptions = {}): AfricasTalkingSmsClient {
    const prefix = options.prefix ?? "AFRICASTALKING_";
    const env = options.env;

    return new AfricasTalkingSmsClient({
      apiKey: getRequiredEnvWithFallback(`${prefix}API_KEY`, "AFRICAS_TALKING_API_KEY", env),
      username: getRequiredEnvWithFallback(`${prefix}USERNAME`, "AFRICAS_TALKING_USERNAME", env),
      defaultSenderId: getOptionalEnvWithFallback(`${prefix}SENDER_ID`, "AFRICAS_TALKING_SENDER_ID", env),
      baseUrl: options.baseUrl ?? getOptionalEnvWithFallback(`${prefix}BASE_URL`, "AFRICAS_TALKING_BASE_URL", env),
      fetch: options.fetch,
      timeoutMs: options.timeoutMs ?? getEnvNumber(`${prefix}TIMEOUT_SECONDS`, env),
      defaultHeaders: options.defaultHeaders,
      retry: options.retry,
      hooks: options.hooks,
    });
  }

  readonly providerName = "africastalking";
  private readonly username: string;
  private readonly defaultSenderId?: string;
  private readonly http: HttpClient;

  constructor(options: AfricasTalkingSmsClientOptions) {
    this.username = requireText(options.username, "username");
    this.defaultSenderId = coerceString(options.defaultSenderId);
    this.http = new HttpClient({
      baseUrl: options.baseUrl ?? AFRICASTALKING_SMS_BASE_URL,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs ?? 30_000,
      defaultHeaders: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey: requireText(options.apiKey, "apiKey"),
        ...(options.defaultHeaders ?? {}),
      },
      retry: options.retry,
      hooks: options.hooks,
    });
  }

  async send(request: SmsSendRequest, options?: RequestOptions): Promise<SmsSendResult> {
    validateSendRequest(request);

    const receipts: SmsSendReceipt[] = [];
    const rawResponses: unknown[] = [];

    for (const group of groupMessagesByText(request.messages)) {
      const response = await this.request("/messaging", "POST", {
        body: this.buildSendPayload(request, group),
        options,
      });
      rawResponses.push(response);
      receipts.push(...buildSendReceipts(this.providerName, group, response));
    }

    return {
      provider: this.providerName,
      accepted: receipts.some((receipt) => receipt.status === "submitted"),
      messages: receipts,
      submittedCount: receipts.filter((receipt) => receipt.status === "submitted").length,
      failedCount: receipts.filter((receipt) => receipt.status === "failed").length,
      raw: rawResponses.length === 1 ? rawResponses[0] : rawResponses,
    };
  }

  async getBalance(options?: RequestOptions): Promise<SmsBalance> {
    const response = await this.request("/user", "GET", {
      query: { username: this.username },
      options,
    });
    const userData = toRecord(response["UserData"]);
    const balanceRaw = coerceString(userData["balance"]);

    return {
      provider: this.providerName,
      entries: [
        {
          label: "SMS",
          creditsRaw: balanceRaw,
          credits: parseBalance(balanceRaw),
          raw: userData,
        },
      ],
      raw: response,
    };
  }

  parseDeliveryReport(payload: Record<string, unknown>): DeliveryEvent | null {
    const report = parseAfricasTalkingDeliveryReport(payload);

    if (!report.id) {
      return null;
    }

    return {
      channel: "sms",
      provider: this.providerName,
      providerMessageId: report.id,
      recipient: report.phoneNumber,
      state: mapDeliveryState(report.status),
      providerStatus: report.status,
      errorCode: report.failureReason,
      occurredAt: undefined,
      metadata: {
        networkCode: report.networkCode,
        retryCount: report.retryCount,
      },
      raw: report.raw,
    };
  }

  async close(): Promise<void> {}

  private async request(
    path: string,
    method: "GET" | "POST",
    input: {
      body?: URLSearchParams;
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

  private buildSendPayload(
    request: SmsSendRequest,
    messages: SmsMessage[],
  ): URLSearchParams {
    const senderId = firstString(request.senderId, this.defaultSenderId);
    const params = new URLSearchParams();

    params.set("username", this.username);
    params.set("to", messages.map((message) => requireText(message.recipient, "recipient")).join(","));
    params.set("message", requireText(messages[0]?.text, "text"));

    if (senderId) {
      params.set("from", senderId);
    }

    for (const [key, value] of Object.entries(request.providerOptions ?? {})) {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    }

    return params;
  }
}

export function parseAfricasTalkingDeliveryReport(
  payload: Record<string, unknown>,
): AfricasTalkingDeliveryReport {
  const normalized = normalizeMapping(payload);

  return {
    id: firstString(normalized["id"], normalized["messageId"], normalized["message_id"]),
    phoneNumber: firstString(normalized["phoneNumber"], normalized["phone_number"], normalized["to"]),
    status: firstString(normalized["status"], normalized["Status"]),
    failureReason: firstString(normalized["failureReason"], normalized["failure_reason"]),
    networkCode: firstString(normalized["networkCode"], normalized["network_code"]),
    retryCount: coerceInt(normalized["retryCount"] ?? normalized["retry_count"]),
    raw: normalized,
  };
}

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

function groupMessagesByText(messages: SmsMessage[]): SmsMessage[][] {
  const groups = new Map<string, SmsMessage[]>();

  for (const message of messages) {
    const key = message.text;
    const group = groups.get(key);

    if (group) {
      group.push(message);
    } else {
      groups.set(key, [message]);
    }
  }

  return [...groups.values()];
}

function buildSendReceipts(
  providerName: string,
  messages: SmsMessage[],
  response: Record<string, unknown>,
): SmsSendReceipt[] {
  const data = toRecord(response["SMSMessageData"]);
  const recipients = normalizeRows(data["Recipients"]);
  const messageByRecipient = new Map(messages.map((message) => [message.recipient, message]));

  return recipients.map((row, index) => {
    const recipient = coerceString(row["number"]) ?? messages[index]?.recipient ?? "";
    const message = messageByRecipient.get(recipient) ?? messages[index];
    const providerMessageId = coerceString(row["messageId"]);
    const providerStatus = coerceString(row["status"]);
    const providerErrorCode = coerceString(row["statusCode"]);
    const submitted = isSubmittedStatus(row["statusCode"], providerStatus);

    return {
      provider: providerName,
      recipient,
      text: message?.text ?? "",
      status: submitted ? "submitted" : "failed",
      providerMessageId,
      reference: message?.reference,
      providerErrorCode: submitted ? undefined : providerErrorCode,
      providerErrorDescription: submitted ? undefined : providerStatus,
      raw: row,
    };
  });
}

function validateResponse(
  providerName: string,
  response: Record<string, unknown>,
): Record<string, unknown> {
  if (!Object.keys(response).length) {
    throw new ProviderError("Africa's Talking returned a non-object response.", {
      provider: providerName,
      responseBody: response,
    });
  }

  if (response["SMSMessageData"] !== undefined || response["UserData"] !== undefined) {
    return response;
  }

  throw new ProviderError("Africa's Talking returned an unexpected response shape.", {
    provider: providerName,
    responseBody: response,
  });
}

function isSubmittedStatus(statusCode: unknown, status?: string): boolean {
  const code = coerceInt(statusCode);

  if (code !== undefined) {
    return code >= 100 && code < 200;
  }

  const normalized = (status ?? "").toLowerCase();
  return ["success", "sent", "submitted", "queued"].some((entry) => normalized.includes(entry));
}

function mapDeliveryState(status?: string): DeliveryEvent["state"] {
  const normalized = (status ?? "").toLowerCase();

  if (["sent", "submitted"].includes(normalized)) {
    return "submitted";
  }

  if (["success", "delivered"].includes(normalized)) {
    return "delivered";
  }

  if (["queued", "failed"].includes(normalized)) {
    return normalized as DeliveryEvent["state"];
  }

  return "unknown";
}

function parseBalance(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? coerceNumber(match[0]) : undefined;
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    : [];
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function getRequiredEnvWithFallback(
  primaryName: string,
  fallbackName: string,
  env?: Record<string, string | undefined>,
): string {
  return getOptionalEnv(primaryName, env) ?? getRequiredEnv(fallbackName, env);
}

function getOptionalEnvWithFallback(
  primaryName: string,
  fallbackName: string,
  env?: Record<string, string | undefined>,
): string | undefined {
  return getOptionalEnv(primaryName, env) ?? getOptionalEnv(fallbackName, env);
}
