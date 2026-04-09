import { createHmac, timingSafeEqual } from "node:crypto";

import { WebhookVerificationError } from "./core/errors";

export const PAYSTACK_WEBHOOK_IPS = [
  "52.31.139.75",
  "52.49.173.169",
  "52.214.14.220",
] as const;

type RawBody = string | ArrayBuffer | ArrayBufferView;

export function computePaystackSignature(rawBody: RawBody, secretKey: string): string {
  return createHmac("sha512", secretKey).update(toBuffer(rawBody)).digest("hex");
}

export function verifyPaystackSignature(
  rawBody: RawBody,
  signature: string | null | undefined,
  secretKey: string,
): boolean {
  if (!signature) {
    return false;
  }

  const expected = computePaystackSignature(rawBody, secretKey);
  const normalized = signature.trim().toLowerCase();

  if (normalized.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(normalized, "utf8"));
}

export function requirePaystackSignature(
  rawBody: RawBody,
  signature: string | null | undefined,
  secretKey: string,
): void {
  if (!verifyPaystackSignature(rawBody, signature, secretKey)) {
    throw new WebhookVerificationError("Invalid Paystack webhook signature.");
  }
}

export function verifySourceIp(
  sourceIp: string | null | undefined,
  allowedIps: Iterable<string>,
): boolean {
  if (!sourceIp) {
    return false;
  }

  const normalizedSourceIp = sourceIp.trim();

  if (normalizedSourceIp === "") {
    return false;
  }

  const normalizedAllowedIps = new Set(
    Array.from(allowedIps, (value) => value.trim()).filter((value) => value !== ""),
  );

  return normalizedAllowedIps.has(normalizedSourceIp);
}

export function requireSourceIp(
  sourceIp: string | null | undefined,
  allowedIps: Iterable<string>,
): void {
  if (!verifySourceIp(sourceIp, allowedIps)) {
    throw new WebhookVerificationError(
      "Webhook request did not originate from an allowed IP.",
    );
  }
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
