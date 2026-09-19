import { createHmac, timingSafeEqual } from "node:crypto";

import { WebhookVerificationError } from "./core/errors";
import { ipInList, ipMatches } from "./core/utils";

export const PAYSTACK_WEBHOOK_IPS = [
  "52.31.139.75",
  "52.49.173.169",
  "52.214.14.220",
] as const;

export const MPESA_CALLBACK_SECURITY_NOTE =
  "Daraja callbacks are unsigned. Use an unguessable callback URL, verify the source, and confirm results with a transaction status query.";

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
  return ipInList(sourceIp, allowedIps);
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

export { ipMatches };

export function verifyMpesaCallbackToken(
  token: string | null | undefined,
  expected: string,
): boolean {
  if (!token || token.trim() === "" || expected.trim() === "") {
    return false;
  }

  const a = Buffer.from(token.trim(), "utf8");
  const b = Buffer.from(expected.trim(), "utf8");

  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireMpesaCallbackToken(
  token: string | null | undefined,
  expected: string,
): void {
  if (!verifyMpesaCallbackToken(token, expected)) {
    throw new WebhookVerificationError("M-PESA callback token is missing or does not match.");
  }
}

export {
  SASAPAY_CALLBACK_FIELD_ALIASES,
  SASAPAY_CALLBACK_IPS,
  computeSasaPayCallbackSignature,
  requireSasaPayCallback,
  requireSasaPayCallbackToken,
  sasaPayCallbackSignatureMessage,
  sasaPayCallbackValue,
  verifySasaPayCallback,
  verifySasaPayCallbackIp,
  verifySasaPayCallbackSignature,
  verifySasaPayCallbackToken,
} from "./providers/sasapay/callbacks";
export type {
  SasaPayCallbackField,
  SasaPayCallbackVerificationOptions,
} from "./providers/sasapay/callbacks";

export {
  detectKcbBuniIpnKind,
  kcbBuniAccountAcknowledgement,
  kcbBuniRejection,
  kcbBuniTillAcknowledgement,
  kcbBuniTillNotificationData,
  kcbBuniTillPrimaryData,
  kcbBuniValidationResponse,
  requireKcbBuniIpn,
  verifyKcbBuniIpn,
  verifyKcbBuniIpnSignature,
} from "./providers/kcb-buni/ipn";
export type { KcbBuniIpnVerificationOptions } from "./providers/kcb-buni/ipn";

function toBuffer(value: RawBody): Buffer {
  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength);
  }

  return Buffer.from(value);
}
