import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";

import { BusinessError, ConfigurationError, ValidationError } from "../dist/index.js";
import {
  KCB_BUNI_BASE_URLS,
  KCB_BUNI_ENDPOINTS,
  KcbBuniClient,
  detectKcbBuniIpnKind,
  kcbBuniAccountAcknowledgement,
  kcbBuniRejection,
  kcbBuniTillAcknowledgement,
  kcbBuniTillNotificationData,
  kcbBuniValidationResponse,
  requireKcbBuniIpn,
  verifyKcbBuniIpn,
  verifyKcbBuniIpnSignature,
} from "../dist/kcb-buni.js";
import { json, mockFetch, tokenRoute } from "./helpers.mjs";

const credentials = { consumerKey: "key", consumerSecret: "secret" };

const validStkPush = {
  phoneNumber: "254712345678",
  amount: "10",
  invoiceNumber: "INV-001",
  sharedShortCode: true,
  orgShortCode: "",
  orgPassKey: "",
  callbackUrl: "https://example.test/cb",
  transactionDescription: "Fees",
};

function client(routes, options = {}) {
  const fetch = mockFetch([tokenRoute("buni-token"), ...routes]);
  return {
    fetch,
    client: new KcbBuniClient({
      ...credentials,
      fetch,
      mpesaExpress: { routeCode: "207" },
      ...options,
    }),
  };
}

test("the token endpoint is a form POST, unlike Daraja's and SasaPay's GET", async () => {
  const { fetch, client: buni } = client([["/stkpush", () => json({ header: { statusCode: "0" } })]]);

  await buni.mpesaStkPush(validStkPush, "msg-1");

  const tokenCall = fetch.calls[0];
  assert.equal(tokenCall.url, `${KCB_BUNI_BASE_URLS.uat}/token`);
  assert.equal(tokenCall.init.method, "POST");
  assert.equal(tokenCall.headers.get("content-type"), "application/x-www-form-urlencoded");
  assert.equal(tokenCall.init.body, "grant_type=client_credentials");
  assert.equal(
    tokenCall.headers.get("authorization"),
    `Basic ${Buffer.from("key:secret").toString("base64")}`,
  );
});

test("mpesaStkPush sends the three headers KCB declares required", async () => {
  const { fetch, client: buni } = client([["/stkpush", () => json({ header: { statusCode: "0" } })]]);

  await buni.mpesaStkPush(validStkPush, "232323_KCBOrg_8875661561");

  const call = fetch.last();
  assert.equal(call.url, `${KCB_BUNI_BASE_URLS.uat}${KCB_BUNI_ENDPOINTS.mpesaStkPush}`);
  assert.equal(call.headers.get("routecode"), "207");
  assert.equal(call.headers.get("operation"), "STKPush");
  assert.equal(call.headers.get("messageid"), "232323_KCBOrg_8875661561");
  assert.equal(call.headers.get("authorization"), "Bearer buni-token");
});

test("mpesaStkPush validates against the published field rules before sending", async () => {
  const { fetch, client: buni } = client([["/stkpush", () => json({ header: { statusCode: "0" } })]]);

  await assert.rejects(
    () => buni.mpesaStkPush({ ...validStkPush, transactionDescription: "far too long a value" }, "m"),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.errors.some((e) => e.includes("[transactionDescription] must not exceed 13")));
      return true;
    },
  );

  assert.equal(fetch.calls.length, 0, "an invalid payload never reaches the network");

  await assert.rejects(
    () => buni.mpesaStkPush({ ...validStkPush, phoneNumber: "0712345678x" }, "m"),
    ValidationError,
  );
});

test("a local phone number is normalized before the 2547XXXXXXXX rule runs", async () => {
  const { fetch, client: buni } = client([["/stkpush", () => json({ header: { statusCode: "0" } })]]);

  await buni.mpesaStkPush({ ...validStkPush, phoneNumber: "0712345678" }, "m");
  assert.equal(fetch.jsonBody().phoneNumber, "254712345678");
});

test("a blank short code passes because a shared short code sends one", async () => {
  const { client: buni } = client([["/stkpush", () => json({ header: { statusCode: "0" } })]]);

  await assert.doesNotReject(() => buni.mpesaStkPush(validStkPush, "m"));
});

test("validation can be turned off per call and per client", async () => {
  const { fetch, client: buni } = client([["/stkpush", () => json({ header: { statusCode: "0" } })]]);

  await buni.mpesaStkPush({ ...validStkPush, amount: "not-a-number" }, "m", { validate: false });
  assert.equal(fetch.calls.length, 2);

  const { client: lax } = client([["/stkpush", () => json({ header: { statusCode: "0" } })]], {
    validate: false,
  });
  await assert.doesNotReject(() => lax.mpesaStkPush({}, "m"));
});

test("a missing route code is a configuration error, not a silent bad request", async () => {
  const fetch = mockFetch([tokenRoute()]);
  const buni = new KcbBuniClient({ ...credentials, fetch });

  await assert.rejects(() => buni.mpesaStkPush(validStkPush, "m"), ConfigurationError);
  await assert.doesNotReject(async () => {
    const withOverride = new KcbBuniClient({
      ...credentials,
      fetch: mockFetch([tokenRoute(), ["/stkpush", () => json({ header: { statusCode: "0" } })]]),
    });
    await withOverride.mpesaStkPush(validStkPush, "m", undefined, "207");
  });
});

test("transferFunds validates the FundsTransfer field lengths", async () => {
  const { client: buni } = client([["/transfer", () => json({ header: { statusCode: "0" } })]]);

  await assert.rejects(
    () =>
      buni.transferFunds({
        companyCode: "KE0010001",
        transactionType: "TOO_LONG",
        debitAccountNumber: "37890012",
        creditAccountNumber: "909099090",
        debitAmount: 10,
        paymentDetails: "fee payment",
        transactionReference: "MHSGS7883",
        currency: "KES",
        beneficiaryDetails: "JOHN DOE",
      }),
    (error) => {
      assert.ok(error.errors.some((e) => e.includes("[transactionType] must not exceed 2")));
      return true;
    },
  );
});

test("a Buni reply where the gateway succeeded but Safaricom did not is a failure", async () => {
  const split = { header: { statusCode: "0" }, response: { ResponseCode: "1", ResponseDescription: "Rejected" } };

  const { client: buni } = client([["/stkpush", () => json(split)]], {
    throwOnBusinessError: true,
  });

  await assert.rejects(
    () => buni.mpesaStkPush(validStkPush, "m"),
    (error) => {
      assert.ok(error instanceof BusinessError);
      assert.equal(error.provider, "kcb_buni");
      assert.match(error.message, /Rejected/);
      return true;
    },
  );
});

test("production refuses to guess a host KCB does not publish", () => {
  assert.throws(
    () => new KcbBuniClient({ ...credentials, environment: "production" }),
    (error) => {
      assert.ok(error instanceof ConfigurationError);
      assert.match(error.message, /does not publish a production Buni host/);
      return true;
    },
  );

  assert.doesNotThrow(
    () =>
      new KcbBuniClient({
        ...credentials,
        environment: "production",
        baseUrl: "https://buni.example.test",
      }),
  );
});

test("an apikey is sent on every request when the gateway requires one", async () => {
  const { fetch, client: buni } = client([["/transfer", () => json({ header: { statusCode: "0" } })]], {
    apiKey: "gateway-key",
  });

  await buni.transferFunds({
    companyCode: "KE0010001",
    transactionType: "IF",
    debitAccountNumber: "37890012",
    creditAccountNumber: "909099090",
    debitAmount: 10,
    paymentDetails: "fee",
    transactionReference: "REF1",
    currency: "KES",
    beneficiaryDetails: "JOHN DOE",
  });

  assert.equal(fetch.last().headers.get("apikey"), "gateway-key");
});

test("the vending, query, eTIMS and P2P endpoints are reachable", async () => {
  const seen = [];
  const fetch = mockFetch([
    tokenRoute(),
    [
      "buni.kcbgroup.com",
      (ctx) => {
        seen.push([ctx.init.method, new URL(ctx.url).pathname]);
        return json({ header: { statusCode: "0" } });
      },
    ],
  ]);
  const buni = new KcbBuniClient({ ...credentials, fetch });

  await buni.queryCoreTransactionStatus({});
  await buni.queryTransactionDetails("FT2200/6670X0");
  await buni.vendingValidateRequest({});
  await buni.vendingVendorConfirmation({});
  await buni.vendingTransactionStatus({});
  await buni.etimsRequest("/sales/save", { a: 1 });
  await buni.etimsRequest("lookup", undefined, "GET", { code: "1" });
  await buni.p2pTransferStatusInquiry({}, "status");

  assert.deepEqual(seen, [
    ["POST", KCB_BUNI_ENDPOINTS.queryCoreTransactionStatus],
    ["GET", "/kcb/transaction/query/1.0.0/api/v1/payment/query/FT2200%2F6670X0"],
    ["POST", KCB_BUNI_ENDPOINTS.vendingValidateRequest],
    ["POST", KCB_BUNI_ENDPOINTS.vendingVendorConfirmation],
    ["POST", KCB_BUNI_ENDPOINTS.vendingTransactionStatus],
    ["POST", "/kcb/ke/kra/etims/1.0.0/sales/save"],
    ["GET", "/kcb/ke/kra/etims/1.0.0/lookup"],
    ["POST", "/kcb/bi/ips/p2p/transfer/status/inquiry/1.0.0/status"],
  ]);
});

// ------------------------------------------------------------------ IPN handling

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });

function sign(body) {
  const signer = createSign("RSA-SHA256");
  signer.update(body, "utf8");
  signer.end();
  return signer.sign(privateKey, "base64");
}

test("an IPN signature is verified against the exact bytes received", () => {
  const rawBody = '{"transactionReference":"FT1","transactionAmount":"10"}';
  const signature = sign(rawBody);

  assert.equal(verifyKcbBuniIpnSignature(rawBody, signature, publicKeyPem), true);
  assert.equal(verifyKcbBuniIpnSignature(rawBody, "not-a-signature", publicKeyPem), false);
  assert.equal(verifyKcbBuniIpnSignature(rawBody, undefined, publicKeyPem), false);
  assert.equal(
    verifyKcbBuniIpnSignature('{"transactionAmount":"10","transactionReference":"FT1"}', signature, publicKeyPem),
    false,
    "re-serializing changes the bytes and must not verify",
  );
  assert.equal(verifyKcbBuniIpnSignature(Buffer.from(rawBody), signature, publicKeyPem), true);
});

test("verifyKcbBuniIpn applies the IP allowlist and signature together", () => {
  const rawBody = '{"a":1}';
  const signature = sign(rawBody);

  assert.equal(
    verifyKcbBuniIpn({ rawBody, signature, sourceIp: "10.1.2.3" }, {
      publicKey: publicKeyPem,
      trustedIps: ["10.0.0.0/8"],
      enforceIpAllowlist: true,
    }),
    true,
  );

  assert.equal(
    verifyKcbBuniIpn({ rawBody, signature, sourceIp: "11.1.2.3" }, {
      publicKey: publicKeyPem,
      trustedIps: ["10.0.0.0/8"],
      enforceIpAllowlist: true,
    }),
    false,
  );

  assert.equal(
    verifyKcbBuniIpn({ rawBody, sourceIp: "10.1.2.3" }, {
      trustedIps: ["10.0.0.0/8"],
      enforceIpAllowlist: true,
      verifySignature: false,
    }),
    true,
    "the unsigned /validation route",
  );

  assert.throws(
    () => verifyKcbBuniIpn({ rawBody, signature }, {}),
    /requires the public key/,
  );

  assert.throws(() => requireKcbBuniIpn({ rawBody, signature: "bad" }, { publicKey: publicKeyPem }));
});

test("the three inbound envelopes are told apart by shape", () => {
  const till = {
    header: { messageID: "m1", originatorConversationID: "c1" },
    requestPayload: { additionalData: { notificationData: { transactionID: "T1", transactionAmt: "10", currency: "KES" } } },
  };

  assert.equal(detectKcbBuniIpnKind(till), "till");
  assert.equal(detectKcbBuniIpnKind({ transactionReference: "FT1", transactionAmount: "10" }), "account");
  assert.equal(
    detectKcbBuniIpnKind({ requestId: "r", customerReference: "c", organizationReference: "o" }),
    "validation",
  );
  assert.equal(detectKcbBuniIpnKind({ unrelated: true }), undefined);
  assert.equal(detectKcbBuniIpnKind(null), undefined);

  assert.equal(kcbBuniTillNotificationData(till).transactionID, "T1");
});

test("acknowledgements echo the identifiers each envelope expects", () => {
  const till = {
    header: { messageID: "m1", originatorConversationID: "c1" },
    requestPayload: { additionalData: { notificationData: { transactionID: "T1" } } },
  };

  assert.deepEqual(kcbBuniTillAcknowledgement(till, "T1"), {
    header: { messageID: "m1", originatorConversationID: "c1", statusCode: "0", statusMessage: "Success" },
    responsePayload: { transactionInfo: { transactionId: "T1" } },
  });

  assert.deepEqual(kcbBuniAccountAcknowledgement("T1"), {
    transactionID: "T1",
    statusCode: "0",
    statusMessage: "Success",
  });

  assert.deepEqual(
    kcbBuniValidationResponse("T1", { CustomerName: "JOHN DOE", billAmount: "250", currency: "KES" }),
    {
      transactionID: "T1",
      statusCode: "0",
      statusMessage: "Success",
      CustomerName: "JOHN DOE",
      billAmount: "250",
      currency: "KES",
    },
  );

  assert.deepEqual(kcbBuniRejection({ transactionReference: "FT1" }, "1", "Unknown account"), {
    transactionID: "",
    statusCode: "1",
    statusMessage: "Unknown account",
  });

  assert.equal(kcbBuniRejection(till, "1", "Rejected").header.statusCode, "1");
});
