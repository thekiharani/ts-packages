import { createVerify, createPublicKey, type KeyObject } from "node:crypto";

import { WebhookVerificationError } from "../../core/errors";
import { ipInList } from "../../core/utils";
import type {
  KcbBuniAccountNotification,
  KcbBuniIpnAcknowledgement,
  KcbBuniIpnKind,
  KcbBuniTillAcknowledgement,
  KcbBuniTillNotification,
} from "./types";

type RawBody = string | ArrayBuffer | ArrayBufferView;

/**
 * Verifies the `Signature` header KCB sends with an Instant Payment Notification:
 * an RSA-SHA256 signature over the exact raw request body, base64 encoded.
 *
 * The body must be the bytes as received. Re-serializing a parsed object changes
 * key order and whitespace, and the signature will not match.
 *
 * `/validation` requests are unsigned, and the M-PESA Express `callbackUrl` result
 * is not an IPN at all — neither carries a signature to check.
 */
export function verifyKcbBuniIpnSignature(
  rawBody: RawBody,
  signature: string | null | undefined,
  publicKey: string | KeyObject,
): boolean {
  if (!signature || signature.trim() === "") {
    return false;
  }

  let key: KeyObject;

  try {
    key = typeof publicKey === "string" ? createPublicKey(publicKey) : publicKey;
  } catch (error) {
    throw new WebhookVerificationError(
      "The KCB Buni IPN public key could not be read. Supply the PEM KCB issued for your integration.",
      { cause: error },
    );
  }

  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(toBuffer(rawBody));
    verifier.end();

    return verifier.verify(key, signature.trim(), "base64");
  } catch {
    // A malformed signature is a failed verification, not a crash.
    return false;
  }
}

export interface KcbBuniIpnVerificationOptions {
  publicKey?: string | KeyObject;
  /** Exact addresses or CIDR blocks. KCB issues these per integration. */
  trustedIps?: string[];
  enforceIpAllowlist?: boolean;
  /** Set false only for the unsigned `/validation` route. */
  verifySignature?: boolean;
}

export function verifyKcbBuniIpn(
  input: {
    rawBody: RawBody;
    signature?: string | null;
    sourceIp?: string | null;
  },
  options: KcbBuniIpnVerificationOptions,
): boolean {
  if (options.enforceIpAllowlist) {
    if (!ipInList(input.sourceIp, options.trustedIps ?? [])) {
      return false;
    }
  }

  if (options.verifySignature === false) {
    return true;
  }

  if (!options.publicKey) {
    throw new WebhookVerificationError(
      "KCB Buni IPN verification requires the public key KCB issued for your integration. Pass verifySignature: false only for the unsigned /validation route.",
    );
  }

  return verifyKcbBuniIpnSignature(input.rawBody, input.signature, options.publicKey);
}

export function requireKcbBuniIpn(
  input: { rawBody: RawBody; signature?: string | null; sourceIp?: string | null },
  options: KcbBuniIpnVerificationOptions,
): void {
  if (!verifyKcbBuniIpn(input, options)) {
    throw new WebhookVerificationError("Invalid KCB Buni instant payment notification.");
  }
}

/** Tells the three inbound Buni contracts apart by their envelope shape. */
export function detectKcbBuniIpnKind(payload: unknown): KcbBuniIpnKind | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const body = payload as Record<string, unknown>;

  if (body["requestPayload"] && typeof body["requestPayload"] === "object") {
    return "till";
  }

  if ("transactionReference" in body || "transactionAmount" in body) {
    return "account";
  }

  if ("customerReference" in body && "organizationReference" in body) {
    return "validation";
  }

  return undefined;
}

/** The payment fields of a till notification, from under its two envelope layers. */
export function kcbBuniTillNotificationData(
  payload: KcbBuniTillNotification,
): KcbBuniTillNotification["requestPayload"]["additionalData"]["notificationData"] | undefined {
  return payload.requestPayload?.additionalData?.notificationData;
}

export function kcbBuniTillPrimaryData(
  payload: KcbBuniTillNotification,
): KcbBuniTillNotification["requestPayload"]["primaryData"] | undefined {
  return payload.requestPayload?.primaryData;
}

/** The response body a till notification expects, echoing the inbound message IDs. */
export function kcbBuniTillAcknowledgement(
  payload: Pick<KcbBuniTillNotification, "header">,
  transactionId: string,
  statusCode = "0",
  statusMessage = "Success",
): KcbBuniTillAcknowledgement {
  return {
    header: {
      messageID: payload.header?.messageID ?? "",
      originatorConversationID: payload.header?.originatorConversationID ?? "",
      statusCode,
      statusMessage,
    },
    responsePayload: {
      transactionInfo: {
        transactionId,
      },
    },
  };
}

/** The response body an account notification expects. */
export function kcbBuniAccountAcknowledgement(
  transactionId: string,
  statusCode = "0",
  statusMessage = "Success",
): KcbBuniIpnAcknowledgement {
  return {
    transactionID: transactionId,
    statusCode,
    statusMessage,
  };
}

/**
 * The response to `/validation`: an acknowledgement plus whatever bill details the
 * integration is configured to return to the paying customer.
 */
export function kcbBuniValidationResponse(
  transactionId: string,
  bill: Partial<{
    CustomerName: string;
    billAmount: string | number;
    currency: string;
    billType: string;
    creditAccountIdentifier: string;
  }> = {},
  statusCode = "0",
  statusMessage = "Success",
): KcbBuniIpnAcknowledgement {
  const response = kcbBuniAccountAcknowledgement(transactionId, statusCode, statusMessage);

  for (const key of [
    "CustomerName",
    "billAmount",
    "currency",
    "billType",
    "creditAccountIdentifier",
  ] as const) {
    const value = bill[key];

    if (value !== undefined && value !== null) {
      (response as Record<string, unknown>)[key] = value;
    }
  }

  return response;
}

/** Rejects an inbound notification in whichever envelope shape it arrived in. */
export function kcbBuniRejection(
  payload: unknown,
  statusCode: string,
  statusMessage: string,
  transactionId = "",
): KcbBuniIpnAcknowledgement | KcbBuniTillAcknowledgement {
  if (detectKcbBuniIpnKind(payload) === "till") {
    return kcbBuniTillAcknowledgement(
      payload as KcbBuniTillNotification,
      transactionId,
      statusCode,
      statusMessage,
    );
  }

  return kcbBuniAccountAcknowledgement(transactionId, statusCode, statusMessage);
}

export type { KcbBuniAccountNotification, KcbBuniTillNotification };

function toBuffer(value: RawBody): Buffer {
  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength);
  }

  return Buffer.from(value);
}
