import { createHmac, timingSafeEqual } from "node:crypto";

import { WebhookVerificationError } from "./core/errors";
import { ipInList, ipMatches } from "./core/utils";

export const PAYSTACK_WEBHOOK_IPS = [
  "52.31.139.75",
  "52.49.173.169",
  "52.214.14.220",
] as const;

/**
 * Safaricom publishes no callback signature and no fixed source-IP list for Daraja.
 *
 * The only controls available are keeping the callback URL unguessable and
 * confirming every result with `transactionStatus()` before releasing goods.
 * `verifyMpesaCallbackToken` implements the first; nothing here can implement a
 * signature check Safaricom does not offer.
 */
export const MPESA_CALLBACK_SECURITY_NOTE =
  "Daraja callbacks are unsigned. Use an unguessable callback URL, verify the source, and confirm results with a transaction status query.";

type RawBody = string | ArrayBuffer | ArrayBufferView;

export function computePaystackSignature(rawBody: RawBody, secretKey: string): string {
  return createHmac("sha512", secretKey).update(toBuffer(rawBody)).digest("hex");
}

/**
 * Verifies Paystack's `x-paystack-signature`: HMAC-SHA512 of the raw body, keyed
 * with your secret key.
 *
 * `rawBody` must be the bytes as received. Re-serializing a parsed object changes
 * key order and whitespace and the digest will not match.
 */
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

/**
 * Matches a source address against an allowlist of exact addresses or CIDR blocks.
 *
 * CIDR matters in practice: providers publish bare addresses, but operators behind
 * a load balancer or NAT routinely need to widen an entry to a range, and an exact
 * string compare would silently never match one.
 */
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

/**
 * Verifies a capability token on an M-PESA callback URL.
 *
 * Daraja lets you set `CallBackURL`/`ResultURL` per request, so appending
 * `?token=<secret>` and checking it here is the only caller authentication available.
 * It proves the caller knew a secret you only ever sent to Safaricom; it does not
 * authenticate the body, so still confirm with a status query before settling.
 */
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
