import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { ConfigurationError, WebhookVerificationError } from "../../core/errors";
import { ipInList } from "../../core/utils";

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
  expectedToken?: string;
  secretKey?: string;
  trustedIps?: Iterable<string>;
  enforceIpAllowlist?: boolean;
}

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
