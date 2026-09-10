import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { ConfigurationError, WebhookVerificationError } from "../../core/errors";
import { ipInList } from "../../core/utils";

/**
 * Source addresses observed for SasaPay callbacks.
 *
 * SasaPay does not publish an allowlist; this list is carried by the sibling
 * Laravel SDK and is treated as observed, not authoritative. Entries may be exact
 * addresses or CIDR blocks.
 */
export const SASAPAY_CALLBACK_IPS = [
  "47.129.43.141",
  "13.229.247.179",
  "13.215.155.141",
  "13.214.60.231",
  "54.169.74.198",
  "18.142.226.87",
  "47.129.243.116",
  "13.250.110.3",
  "155.12.30.40",
  "155.12.30.58",
] as const;

/**
 * SasaPay's callbacks name the same value differently across C2B, IPN, B2C, B2B,
 * remittance, utilities, WaaS and bulk-status payloads. These aliases let a handler
 * read one canonical field without a switch per product.
 */
export const SASAPAY_CALLBACK_FIELD_ALIASES = {
  sasapayTransactionCode: [
    "sasapay_transaction_code",
    "TransactionCode",
    "TransID",
    "SasaPayTransactionCode",
  ],
  sasapayTransactionId: ["SasaPayTransactionID"],
  thirdPartyTransactionId: [
    "ThirdPartyTransID",
    "ThirdPartyTransactionCode",
    "third_party_transaction_code",
  ],
  merchantCode: ["merchant_code", "merchantCode", "MerchantCode", "BusinessShortCode"],
  accountNumber: [
    "account_number",
    "accountNumber",
    "AccountNumber",
    "CustomerMobile",
    "MSISDN",
    "RecipientAccountNumber",
    "BeneficiaryAccountNumber",
    "SenderAccountNumber",
    "ContactNumber",
    "DestinationAccountNumber",
  ],
  checkoutRequestId: ["CheckoutRequestID", "CheckoutRequestId", "checkoutRequestId"],
  paymentReference: [
    "payment_reference",
    "BillRefNumber",
    "InvoiceNumber",
    "MerchantReference",
    "merchantReference",
    "MerchantTransactionReference",
    "TransactionReference",
    "transactionReference",
    "PaymentRequestID",
    "MerchantRequestID",
    "bulk_payment_reference",
  ],
  amount: [
    "amount",
    "TransactionAmount",
    "TransAmount",
    "AmountPaid",
    "PaidAmount",
    "Amount",
    "RequestedAmount",
  ],
} as const;

export type SasaPayCallbackField = keyof typeof SASAPAY_CALLBACK_FIELD_ALIASES;

/** Reads a canonical field from whichever alias this particular callback used. */
export function sasaPayCallbackValue(
  payload: Record<string, unknown>,
  field: SasaPayCallbackField,
): string | undefined {
  const aliases = SASAPAY_CALLBACK_FIELD_ALIASES[field];

  if (!aliases) {
    throw new ConfigurationError(`Unknown SasaPay callback field [${String(field)}].`);
  }

  for (const alias of aliases) {
    if (alias in payload) {
      const value = payload[alias];

      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        const text = String(value).trim();

        if (text !== "") {
          return text;
        }
      }
    }
  }

  return undefined;
}

export function verifySasaPayCallbackIp(
  sourceIp: string | null | undefined,
  allowedIps: Iterable<string> = SASAPAY_CALLBACK_IPS,
): boolean {
  return ipInList(sourceIp, allowedIps);
}

/**
 * Verifies a capability token carried on the callback URL.
 *
 * **This is the control this package recommends.** SasaPay publishes no signature,
 * HMAC, checksum or allowlist for any of its callbacks, and `CallBackURL` is supplied
 * per request — so append `?token=<secret>` when you initiate, and check it here on
 * receipt. Only SasaPay ever saw the token, so a caller that presents it knew a secret
 * you sent nowhere else.
 *
 * What it does not buy: it authenticates the *caller*, not the *body*. A token leaked
 * through a log or a proxy is enough to forge a settlement, so keep it out of logs,
 * rotate it if a callback URL is ever exposed, and still reconcile against a status
 * query before releasing goods.
 *
 * `expected` may be the token itself or its lowercase SHA-256 hex digest, so the
 * plaintext need not be stored alongside the config.
 */
export function verifySasaPayCallbackToken(
  token: string | null | undefined,
  expected: string,
): boolean {
  if (!token || token.trim() === "" || expected.trim() === "") {
    return false;
  }

  const presented = sha256Hex(token.trim());
  const target = /^[0-9a-f]{64}$/i.test(expected.trim())
    ? expected.trim().toLowerCase()
    : sha256Hex(expected.trim());

  return constantTimeEquals(presented, target);
}

export function requireSasaPayCallbackToken(
  token: string | null | undefined,
  expected: string,
): void {
  if (!verifySasaPayCallbackToken(token, expected)) {
    throw new WebhookVerificationError("SasaPay callback token is missing or does not match.");
  }
}

/**
 * The canonical message an HMAC callback signature is computed over:
 * `code-merchant-account-reference-amount`, read through the field aliases.
 */
export function sasaPayCallbackSignatureMessage(payload: Record<string, unknown>): string {
  const fields: SasaPayCallbackField[] = [
    "sasapayTransactionCode",
    "merchantCode",
    "accountNumber",
    "paymentReference",
    "amount",
  ];

  return fields
    .map((field) => {
      const value = sasaPayCallbackValue(payload, field);

      if (value === undefined) {
        throw new WebhookVerificationError(`Missing SasaPay callback field [${field}].`);
      }

      return value;
    })
    .join("-");
}

export function computeSasaPayCallbackSignature(
  payload: Record<string, unknown>,
  secretKey: string,
): string {
  return createHmac("sha512", secretKey)
    .update(sasaPayCallbackSignatureMessage(payload), "utf8")
    .digest("hex");
}

/**
 * Verifies an HMAC-SHA512 signature over the canonical callback message.
 *
 * **Not a SasaPay-published scheme.** Searching SasaPay's documentation for
 * `signature`, `hmac`, `sha512` and `checksum` returns nothing for any callback.
 * This exists for parity with the sibling Laravel SDK and for accounts where SasaPay
 * has separately issued this scheme. If your account has not, use
 * `verifySasaPayCallbackToken` instead — enabling this against a provider that never
 * signs anything rejects every legitimate callback.
 *
 * The signature is read from a `sasapay_signature` field unless passed explicitly.
 */
export function verifySasaPayCallbackSignature(
  payload: Record<string, unknown>,
  signature: string | null | undefined,
  secretKey: string,
): boolean {
  const presented = signature ?? readSignatureField(payload);

  if (!presented || presented.trim() === "") {
    return false;
  }

  let expected: string;

  try {
    expected = computeSasaPayCallbackSignature(payload, secretKey);
  } catch {
    return false;
  }

  return constantTimeEquals(expected.toLowerCase(), presented.trim().toLowerCase());
}

export interface SasaPayCallbackVerificationOptions {
  /** The capability token you appended to `CallBackURL`, or its SHA-256 hex digest. */
  expectedToken?: string;
  /** Secret for the HMAC scheme; only set this if SasaPay issued you one. */
  secretKey?: string;
  trustedIps?: Iterable<string>;
  enforceIpAllowlist?: boolean;
}

/**
 * Applies whichever controls are configured, and reports which one passed.
 *
 * Returns `verified: false` with `reason: "unsupported"` when nothing is configured,
 * so a caller can store the callback and refuse to settle rather than treating an
 * unauthenticated request as genuine.
 */
export function verifySasaPayCallback(
  input: {
    payload: Record<string, unknown>;
    token?: string | null;
    signature?: string | null;
    sourceIp?: string | null;
  },
  options: SasaPayCallbackVerificationOptions,
): { verified: boolean; reason?: "ip" | "token" | "signature" | "unsupported" } {
  if (options.enforceIpAllowlist) {
    if (!verifySasaPayCallbackIp(input.sourceIp, options.trustedIps ?? SASAPAY_CALLBACK_IPS)) {
      return { verified: false, reason: "ip" };
    }
  }

  if (options.expectedToken) {
    return verifySasaPayCallbackToken(input.token, options.expectedToken)
      ? { verified: true, reason: "token" }
      : { verified: false, reason: "token" };
  }

  if (options.secretKey) {
    return verifySasaPayCallbackSignature(input.payload, input.signature, options.secretKey)
      ? { verified: true, reason: "signature" }
      : { verified: false, reason: "signature" };
  }

  if (options.enforceIpAllowlist) {
    return { verified: true, reason: "ip" };
  }

  return { verified: false, reason: "unsupported" };
}

export function requireSasaPayCallback(
  input: {
    payload: Record<string, unknown>;
    token?: string | null;
    signature?: string | null;
    sourceIp?: string | null;
  },
  options: SasaPayCallbackVerificationOptions,
): void {
  const result = verifySasaPayCallback(input, options);

  if (result.verified) {
    return;
  }

  throw new WebhookVerificationError(
    result.reason === "unsupported"
      ? "SasaPay callback could not be authenticated: no token, signature secret or IP allowlist is configured."
      : `SasaPay callback failed ${result.reason} verification.`,
  );
}

function readSignatureField(payload: Record<string, unknown>): string | undefined {
  const value = payload["sasapay_signature"];

  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
