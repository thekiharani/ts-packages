import { createHmac, timingSafeEqual } from "node:crypto";

import { ConfigurationError, WebhookVerificationError } from "./core/errors";
import { coerceString, normalizeQueryMapping } from "./core/utils";
import type { DeliveryEvent } from "./events";
import type { SmsGateway } from "./providers/sms/types";

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
  gateway: SmsGateway,
): DeliveryEvent | null {
  return gateway.parseDeliveryReport(queryParams);
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
