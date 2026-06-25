import { createHmac, timingSafeEqual } from "node:crypto";

import { ConfigurationError, WebhookVerificationError } from "./core/errors";
import { coerceString, normalizeQueryMapping } from "./core/utils";
import type { DeliveryEvent } from "./events";
import { parseAfricasTalkingDeliveryReport } from "./providers/sms/africastalking";
import type { SmsClient } from "./providers/sms/types";

type RawBody = string | ArrayBuffer | ArrayBufferView;

export function resolveMetaSubscriptionChallenge(
  queryParams: Record<string, unknown>,
  verifyToken: string,
): string | undefined {
  const expected = coerceString(verifyToken);

  if (!expected) {
    throw new ConfigurationError("verifyToken is required.");
  }

  const normalized = normalizeQueryMapping(queryParams);

  if (normalized["hub.mode"] !== "subscribe") {
    return undefined;
  }

  if (normalized["hub.verify_token"] !== expected) {
    return undefined;
  }

  return normalized["hub.challenge"];
}

export function verifyMetaSignature(
  rawBody: RawBody,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean {
  const secret = coerceString(appSecret);
  const header = coerceString(signatureHeader);

  if (!secret) {
    throw new ConfigurationError("appSecret is required for signature verification.");
  }

  if (!header || !header.startsWith("sha256=")) {
    return false;
  }

  const provided = header.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(toBuffer(rawBody)).digest("hex");

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
}

export function requireValidMetaSignature(
  rawBody: RawBody,
  signatureHeader: string | null | undefined,
  appSecret: string,
): void {
  if (!verifyMetaSignature(rawBody, signatureHeader, appSecret)) {
    throw new WebhookVerificationError("Meta webhook signature verification failed.");
  }
}

export function parseOnfonDeliveryReport(
  queryParams: Record<string, unknown>,
  client: SmsClient,
): DeliveryEvent | null {
  return client.parseDeliveryReport(queryParams);
}

export function parseAfricasTalkingSmsDeliveryReport(
  queryParams: Record<string, unknown>,
  client?: SmsClient,
): DeliveryEvent | null {
  if (client) {
    return client.parseDeliveryReport(queryParams);
  }

  const report = parseAfricasTalkingDeliveryReport(queryParams);

  if (!report.id) {
    return null;
  }

  return {
    channel: "sms",
    provider: "africastalking",
    providerMessageId: report.id,
    recipient: report.phoneNumber,
    state: mapAfricasTalkingState(report.status),
    providerStatus: report.status,
    errorCode: report.failureReason,
    metadata: {
      networkCode: report.networkCode,
      retryCount: report.retryCount,
    },
    raw: report.raw,
  };
}

function mapAfricasTalkingState(status?: string): DeliveryEvent["state"] {
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

function toBuffer(value: RawBody): Buffer {
  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  return Buffer.from(value);
}
