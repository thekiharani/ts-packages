import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";

import { WebhookVerificationError } from "../dist/index.js";
import {
  PAYSTACK_WEBHOOK_IPS,
  SASAPAY_CALLBACK_IPS,
  computePaystackSignature,
  computeSasaPayCallbackSignature,
  requireMpesaCallbackToken,
  requirePaystackSignature,
  requireSasaPayCallback,
  requireSourceIp,
  sasaPayCallbackSignatureMessage,
  sasaPayCallbackValue,
  verifyMpesaCallbackToken,
  verifyPaystackSignature,
  verifySasaPayCallback,
  verifySasaPayCallbackIp,
  verifySasaPayCallbackSignature,
  verifySasaPayCallbackToken,
  verifySourceIp,
} from "../dist/webhooks.js";

const secret = "sk_test_secret";

test("a Paystack signature is HMAC-SHA512 over the raw body", () => {
  const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref" } });
  const signature = createHmac("sha512", secret).update(rawBody).digest("hex");

  assert.equal(computePaystackSignature(rawBody, secret), signature);
  assert.equal(verifyPaystackSignature(rawBody, signature, secret), true);
  assert.equal(verifyPaystackSignature(rawBody, signature.toUpperCase(), secret), true);
  assert.equal(verifyPaystackSignature(rawBody, ` ${signature} `, secret), true);
  assert.equal(verifyPaystackSignature(rawBody, signature, "other-secret"), false);
  assert.equal(verifyPaystackSignature(`${rawBody} `, signature, secret), false);
  assert.equal(verifyPaystackSignature(rawBody, null, secret), false);
  assert.equal(verifyPaystackSignature(rawBody, "short", secret), false);

  assert.equal(verifyPaystackSignature(Buffer.from(rawBody), signature, secret), true);
  assert.equal(
    verifyPaystackSignature(new TextEncoder().encode(rawBody).buffer, signature, secret),
    true,
  );

  assert.throws(() => requirePaystackSignature(rawBody, "bad", secret), WebhookVerificationError);
});

test("source IP checks accept exact addresses and CIDR blocks", () => {
  assert.equal(verifySourceIp("52.31.139.75", PAYSTACK_WEBHOOK_IPS), true);
  assert.equal(verifySourceIp("52.31.139.76", PAYSTACK_WEBHOOK_IPS), false);
  assert.equal(verifySourceIp("52.31.139.76", ["52.31.139.0/24"]), true);
  assert.equal(verifySourceIp("  52.31.139.75  ", PAYSTACK_WEBHOOK_IPS), true);
  assert.equal(verifySourceIp(null, PAYSTACK_WEBHOOK_IPS), false);
  assert.equal(verifySourceIp("52.31.139.75", []), false);

  assert.throws(() => requireSourceIp("1.2.3.4", PAYSTACK_WEBHOOK_IPS), WebhookVerificationError);
});

test("an M-PESA callback token is compared in constant time", () => {
  assert.equal(verifyMpesaCallbackToken("s3cret", "s3cret"), true);
  assert.equal(verifyMpesaCallbackToken("s3crea", "s3cret"), false);
  assert.equal(verifyMpesaCallbackToken("", "s3cret"), false);
  assert.equal(verifyMpesaCallbackToken(null, "s3cret"), false);
  assert.equal(verifyMpesaCallbackToken("s3cret", ""), false);
  assert.equal(verifyMpesaCallbackToken("longer-value", "s3cret"), false);

  assert.throws(() => requireMpesaCallbackToken("wrong", "right"), WebhookVerificationError);
});

test("a SasaPay callback token verifies against the secret or its digest", () => {
  const token = "capability-token";
  const digest = createHash("sha256").update(token).digest("hex");

  assert.equal(verifySasaPayCallbackToken(token, token), true);
  assert.equal(verifySasaPayCallbackToken(token, digest), true, "only the digest need be stored");
  assert.equal(verifySasaPayCallbackToken("other", digest), false);
  assert.equal(verifySasaPayCallbackToken(null, digest), false);
  assert.equal(verifySasaPayCallbackToken(token, ""), false);
});

test("SasaPay callback fields are read through their per-product aliases", () => {
  const c2b = {
    TransactionCode: "SP123",
    MerchantCode: "600000",
    CustomerMobile: "254712345678",
    BillRefNumber: "INV-1",
    TransAmount: "250",
  };

  assert.equal(sasaPayCallbackValue(c2b, "sasapayTransactionCode"), "SP123");
  assert.equal(sasaPayCallbackValue(c2b, "merchantCode"), "600000");
  assert.equal(sasaPayCallbackValue(c2b, "accountNumber"), "254712345678");
  assert.equal(sasaPayCallbackValue(c2b, "paymentReference"), "INV-1");
  assert.equal(sasaPayCallbackValue(c2b, "amount"), "250");
  assert.equal(sasaPayCallbackValue(c2b, "checkoutRequestId"), undefined);

  const transfer = {
    SasaPayTransactionCode: "SP999",
    MerchantCode: "600000",
    RecipientAccountNumber: "254700000000",
    MerchantTransactionReference: "PAYOUT-1",
    TransactionAmount: "1000",
  };

  assert.equal(sasaPayCallbackValue(transfer, "sasapayTransactionCode"), "SP999");
  assert.equal(sasaPayCallbackValue(transfer, "accountNumber"), "254700000000");
  assert.equal(sasaPayCallbackValue(transfer, "paymentReference"), "PAYOUT-1");
});

test("the SasaPay HMAC scheme signs the canonical five-field message", () => {
  const payload = {
    TransactionCode: "SP123",
    MerchantCode: "600000",
    CustomerMobile: "254712345678",
    BillRefNumber: "INV-1",
    TransAmount: "250",
  };

  assert.equal(
    sasaPayCallbackSignatureMessage(payload),
    "SP123-600000-254712345678-INV-1-250",
  );

  const signature = computeSasaPayCallbackSignature(payload, "shared-secret");
  assert.equal(verifySasaPayCallbackSignature(payload, signature, "shared-secret"), true);
  assert.equal(verifySasaPayCallbackSignature(payload, signature, "wrong-secret"), false);
  assert.equal(
    verifySasaPayCallbackSignature({ ...payload, sasapay_signature: signature }, undefined, "shared-secret"),
    true,
    "the signature is read from the payload when not passed explicitly",
  );
  assert.equal(verifySasaPayCallbackSignature({ TransactionCode: "SP123" }, signature, "shared-secret"), false);
});

test("SasaPay IP checks use the observed list and accept CIDR overrides", () => {
  assert.equal(verifySasaPayCallbackIp("13.229.247.179"), true);
  assert.equal(verifySasaPayCallbackIp("8.8.8.8"), false);
  assert.equal(verifySasaPayCallbackIp("13.229.0.1", ["13.229.0.0/16"]), true);
  assert.ok(SASAPAY_CALLBACK_IPS.length > 0);
});

test("verifySasaPayCallback reports which control passed, or that none is configured", () => {
  const payload = { TransactionCode: "SP1", MerchantCode: "M", MSISDN: "254712345678", BillRefNumber: "R", Amount: "1" };

  assert.deepEqual(
    verifySasaPayCallback({ payload, token: "tok" }, { expectedToken: "tok" }),
    { verified: true, reason: "token" },
  );

  assert.deepEqual(
    verifySasaPayCallback({ payload, token: "nope" }, { expectedToken: "tok" }),
    { verified: false, reason: "token" },
  );

  const signature = computeSasaPayCallbackSignature(payload, "s");
  assert.deepEqual(
    verifySasaPayCallback({ payload, signature }, { secretKey: "s" }),
    { verified: true, reason: "signature" },
  );

  assert.deepEqual(
    verifySasaPayCallback({ payload, token: "tok", sourceIp: "8.8.8.8" }, {
      expectedToken: "tok",
      enforceIpAllowlist: true,
    }),
    { verified: false, reason: "ip" },
  );

  assert.deepEqual(
    verifySasaPayCallback({ payload }, {}),
    { verified: false, reason: "unsupported" },
    "nothing configured must not read as verified",
  );

  assert.throws(
    () => requireSasaPayCallback({ payload }, {}),
    (error) => {
      assert.ok(error instanceof WebhookVerificationError);
      assert.match(error.message, /no token, signature secret or IP allowlist is configured/);
      return true;
    },
  );
});
