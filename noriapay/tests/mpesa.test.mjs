import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, privateDecrypt, constants } from "node:crypto";

import { BusinessError, ConfigurationError } from "../dist/index.js";
import {
  MPESA_ENDPOINTS,
  MpesaClient,
  buildMpesaSecurityCredential,
  buildMpesaStkPassword,
  buildMpesaTimestamp,
} from "../dist/mpesa.js";
import { json, mockFetch, oauthRoute } from "./helpers.mjs";

const credentials = { consumerKey: "key", consumerSecret: "secret" };

function client(routes, options = {}) {
  const fetch = mockFetch([oauthRoute(), ...routes]);
  return { fetch, client: new MpesaClient({ ...credentials, fetch, ...options }) };
}

test("buildMpesaStkPassword encodes short code, passkey, and timestamp", () => {
  assert.equal(
    buildMpesaStkPassword({
      businessShortCode: "174379",
      passkey: "passkey",
      timestamp: "20250102030405",
    }),
    Buffer.from("174379passkey20250102030405", "utf8").toString("base64"),
  );
});

test("buildMpesaSecurityCredential RSA-encrypts the plaintext initiator password", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const certificate = publicKey.export({ type: "spki", format: "pem" });

  const credential = buildMpesaSecurityCredential({
    initiatorPassword: "Safaricom999!*!",
    certificate,
  });

  const ciphertext = Buffer.from(credential, "base64");
  assert.equal(ciphertext.length, 256, "one RSA block for a 2048-bit key");

  // Unwrapped with RSA_NO_PADDING rather than privateDecrypt + RSA_PKCS1_PADDING,
  // which Node blocks from 20.11 as the CVE-2023-46809 mitigation. Reading the raw
  // block is also the stronger check: it shows the padding really is PKCS#1 v1.5
  // and not OAEP, which is what Daraja requires.
  const block = privateDecrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, ciphertext);

  assert.equal(block[0], 0x00);
  assert.equal(block[1], 0x02, "0x00 0x02 is the PKCS#1 v1.5 encryption block type, not OAEP");

  const separator = block.indexOf(0x00, 2);
  assert.ok(separator >= 10, "at least eight bytes of random padding");
  assert.ok(
    block.subarray(2, separator).every((byte) => byte !== 0x00),
    "v1.5 padding bytes are all non-zero",
  );

  assert.equal(
    block.subarray(separator + 1).toString("utf8"),
    "Safaricom999!*!",
    "Daraja's algorithm encrypts the raw password, then base64s the ciphertext",
  );

  // PKCS#1 v1.5 pads with random bytes, so two calls must not be identical.
  assert.notEqual(
    credential,
    buildMpesaSecurityCredential({ initiatorPassword: "Safaricom999!*!", certificate }),
  );
});

test("buildMpesaSecurityCredential rejects an unreadable certificate", () => {
  assert.throws(
    () => buildMpesaSecurityCredential({ initiatorPassword: "x", certificate: "not a pem" }),
    ConfigurationError,
  );
  assert.throws(
    () => buildMpesaSecurityCredential({ initiatorPassword: "", certificate: "x" }),
    ConfigurationError,
  );
});

test("stkPush authenticates, normalizes the phone and amount, and sends a bearer token", async () => {
  const { fetch, client: mpesa } = client([
    ["/stkpush/", () => json({ MerchantRequestID: "1", CheckoutRequestID: "ws_CO_1", ResponseCode: "0" })],
  ]);

  const timestamp = buildMpesaTimestamp(new Date("2026-01-02T00:04:05Z"));
  const response = await mpesa.stkPush({
    BusinessShortCode: "174379",
    Password: "pwd",
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: 10.5,
    PartyA: "0712345678",
    PartyB: "174379",
    PhoneNumber: "0712345678",
    CallBackURL: "https://example.test/cb",
    AccountReference: "INV-1",
    TransactionDesc: "Payment",
  });

  assert.equal(response.CheckoutRequestID, "ws_CO_1");

  const [tokenCall, pushCall] = fetch.calls;
  assert.match(tokenCall.url, /\/oauth\/v1\/generate\?grant_type=client_credentials$/);
  assert.equal(pushCall.url, "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest");
  assert.equal(pushCall.headers.get("authorization"), "Bearer token-123");

  const body = fetch.jsonBody();
  assert.equal(body.PhoneNumber, "254712345678");
  assert.equal(body.PartyA, "254712345678");
  assert.equal(body.Amount, "10.5");
});

test("production selects the live host", async () => {
  const { fetch, client: mpesa } = client([["/stkpush/", () => json({ ResponseCode: "0" })]], {
    environment: "production",
  });

  await mpesa.stkPush({ Amount: 1 });
  assert.match(fetch.last().url, /^https:\/\/api\.safaricom\.co\.ke\//);
});

test("throwOnBusinessError turns a declined 200 into a BusinessError", async () => {
  const declined = { ResponseCode: "1", ResponseDescription: "The initiator information is invalid." };

  const { client: quiet } = client([["/b2c/", () => json(declined)]]);
  assert.deepEqual(await quiet.b2cPayment({ Amount: 1 }), declined, "off by default");

  const { client: loud } = client([["/b2c/", () => json(declined)]], {
    throwOnBusinessError: true,
  });

  await assert.rejects(
    () => loud.b2cPayment({ Amount: 1 }),
    (error) => {
      assert.ok(error instanceof BusinessError);
      assert.equal(error.provider, "mpesa");
      assert.equal(error.statusCode, "1");
      assert.match(error.message, /M-PESA B2C payment failed: The initiator information is invalid\./);
      return true;
    },
  );

  const { client: perCall } = client([["/b2c/", () => json(declined)]]);
  await assert.rejects(
    () => perCall.b2cPayment({ Amount: 1 }, { throwOnBusinessError: true }),
    BusinessError,
  );
});

test("static helpers read a business outcome without throwing", () => {
  assert.equal(MpesaClient.succeeded({ ResponseCode: "0" }), true);
  assert.equal(MpesaClient.statusCode({ ResponseCode: "1" }), "1");
  assert.equal(MpesaClient.statusMessage({ errorMessage: "Bad Request" }), "Bad Request");
});

test("C2B registration, B2C and B2B versions resolve to the documented paths", async () => {
  const seen = [];
  const capture = () => (ctx) => {
    seen.push(ctx.url);
    return json({ ResponseCode: "0" });
  };

  const fetch = mockFetch([oauthRoute(), ["safaricom.co.ke/mpesa", capture()], ["safaricom.co.ke/v1", capture()]]);
  const mpesa = new MpesaClient({ ...credentials, fetch });

  await mpesa.registerC2BUrls({ ShortCode: "600000" });
  await mpesa.registerC2BUrlsV1({ ShortCode: "600000" });
  await mpesa.b2cPayment({ Amount: 1 });
  await mpesa.b2cPaymentV3({ Amount: 1 });
  await mpesa.businessPayBill({ Amount: 1 });
  await mpesa.b2bExpressCheckout({ amount: 1 });

  assert.deepEqual(seen, [
    "https://sandbox.safaricom.co.ke/mpesa/c2b/v2/registerurl",
    "https://sandbox.safaricom.co.ke/mpesa/c2b/v1/registerurl",
    "https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest",
    "https://sandbox.safaricom.co.ke/mpesa/b2c/v3/paymentrequest",
    "https://sandbox.safaricom.co.ke/mpesa/b2b/v1/paymentrequest",
    "https://sandbox.safaricom.co.ke/v1/ussdpush/get-msisdn",
  ]);
});

test("b2cVersion sets the default path for every B2C call", async () => {
  const { fetch, client: mpesa } = client([["/b2c/", () => json({ ResponseCode: "0" })]], {
    b2cVersion: "v3",
  });

  await mpesa.b2cPayment({ Amount: 1 });
  assert.match(fetch.last().url, /\/mpesa\/b2c\/v3\/paymentrequest$/);
});

test("the B2B command shortcuts set CommandID without overriding an explicit one", async () => {
  const { fetch, client: mpesa } = client([["/b2b/", () => json({ ResponseCode: "0" })]]);

  await mpesa.b2cAccountTopUp({ Amount: 1 });
  assert.equal(fetch.jsonBody().CommandID, "BusinessPayToBulk");

  await mpesa.businessBuyGoods({ Amount: 1 });
  assert.equal(fetch.jsonBody().CommandID, "BusinessBuyGoods");

  await mpesa.businessPayBill({ Amount: 1, CommandID: "BusinessPayBill" });
  assert.equal(fetch.jsonBody().CommandID, "BusinessPayBill");
});

test("every Bill Manager, Ratiba and pull endpoint is reachable", async () => {
  const seen = [];
  const fetch = mockFetch([
    oauthRoute(),
    [
      "safaricom.co.ke",
      (ctx) => {
        seen.push(ctx.url.replace("https://sandbox.safaricom.co.ke", ""));
        return json({ ResponseCode: "0" });
      },
    ],
  ]);
  const mpesa = new MpesaClient({ ...credentials, fetch });

  await mpesa.billManagerOptIn({});
  await mpesa.billManagerSingleInvoice({ Amount: 1 });
  await mpesa.billManagerBulkInvoicing([{ Amount: 1 }]);
  await mpesa.billManagerReconciliation({});
  await mpesa.billManagerCancelSingleInvoice({});
  await mpesa.billManagerCancelBulkInvoice([{}]);
  await mpesa.billManagerUpdateOnboardingDetails({});
  await mpesa.billManagerUpdateSingleInvoice({});
  await mpesa.billManagerUpdateBulkInvoice([{}]);
  await mpesa.ratibaStandingOrder({ Amount: 1, PartyA: "0712345678" });
  await mpesa.registerPullTransactions({});
  await mpesa.pullTransactions({});
  await mpesa.taxRemittance({ Amount: 1 });
  await mpesa.c2bSimulate({ Amount: 1, Msisdn: "0712345678" });

  assert.deepEqual(seen, [
    MPESA_ENDPOINTS.billManagerOptIn,
    MPESA_ENDPOINTS.billManagerSingleInvoice,
    MPESA_ENDPOINTS.billManagerBulkInvoicing,
    MPESA_ENDPOINTS.billManagerReconciliation,
    MPESA_ENDPOINTS.billManagerCancelSingleInvoice,
    MPESA_ENDPOINTS.billManagerCancelBulkInvoice,
    MPESA_ENDPOINTS.billManagerUpdateOnboardingDetails,
    MPESA_ENDPOINTS.billManagerUpdateSingleInvoice,
    MPESA_ENDPOINTS.billManagerUpdateBulkInvoice,
    MPESA_ENDPOINTS.ratibaStandingOrder,
    MPESA_ENDPOINTS.pullTransactionsRegister,
    MPESA_ENDPOINTS.pullTransactions,
    MPESA_ENDPOINTS.taxRemittance,
    MPESA_ENDPOINTS.c2bSimulate,
  ]);
});

test("a bulk invoice array survives as an array, not spread into an object", async () => {
  const { fetch, client: mpesa } = client([
    ["/billmanager-invoice/", () => json({ ResponseCode: "0" })],
  ]);

  const invoices = [
    { externalReference: "INV-1", amount: 100 },
    { externalReference: "INV-2", amount: 200 },
  ];

  await mpesa.billManagerBulkInvoicing(invoices);
  assert.deepEqual(fetch.jsonBody(), invoices);
  assert.ok(Array.isArray(fetch.jsonBody()));

  await mpesa.billManagerCancelBulkInvoice([{ externalReference: "INV-1" }]);
  assert.ok(Array.isArray(fetch.jsonBody()));

  await mpesa.billManagerUpdateBulkInvoice([{ externalReference: "INV-1" }]);
  assert.ok(Array.isArray(fetch.jsonBody()));
});

test("reversal, status, balance and QR keep their documented paths", async () => {
  const seen = [];
  const fetch = mockFetch([
    oauthRoute(),
    [
      "safaricom.co.ke/mpesa",
      (ctx) => {
        seen.push(ctx.url.replace("https://sandbox.safaricom.co.ke", ""));
        return json({ ResponseCode: "0" });
      },
    ],
  ]);
  const mpesa = new MpesaClient({ ...credentials, fetch });

  await mpesa.reversal({ Amount: 1 });
  await mpesa.transactionStatus({});
  await mpesa.accountBalance({});
  await mpesa.generateQrCode({ Amount: 1 });
  await mpesa.stkPushQuery({});

  assert.deepEqual(seen, [
    MPESA_ENDPOINTS.reversal,
    MPESA_ENDPOINTS.transactionStatus,
    MPESA_ENDPOINTS.accountBalance,
    MPESA_ENDPOINTS.dynamicQr,
    MPESA_ENDPOINTS.stkPushQuery,
  ]);
});

test("the escape hatches reach an endpoint this package does not wrap", async () => {
  const { fetch, client: mpesa } = client([
    ["/mpesa/anything", () => json({ ResponseCode: "0", custom: true })],
  ]);

  const posted = await mpesa.authorizedPost("/mpesa/anything/v9/new", { A: 1 });
  assert.equal(posted.custom, true);
  assert.equal(fetch.last().headers.get("authorization"), "Bearer token-123");
  assert.deepEqual(fetch.jsonBody(), { A: 1 });

  await mpesa.authorizedGet("/mpesa/anything/v9/new", { page: 2 });
  assert.match(fetch.last().url, /\?page=2$/);
  assert.equal(fetch.last().method, "GET");
});

test("endpoint overrides survive into the request", async () => {
  const { fetch, client: mpesa } = client([["/custom/stk", () => json({ ResponseCode: "0" })]], {
    endpoints: { stkPush: "/custom/stk" },
  });

  await mpesa.stkPush({ Amount: 1 });
  assert.match(fetch.last().url, /\/custom\/stk$/);
  assert.equal(mpesa.endpoint("stkPush"), "/custom/stk");
  assert.equal(mpesa.endpoint("reversal"), MPESA_ENDPOINTS.reversal, "others keep the default");
});

test("an external token provider replaces the OAuth round trip entirely", async () => {
  const fetch = mockFetch([["/stkpush/", () => json({ ResponseCode: "0" })]]);
  const mpesa = new MpesaClient({
    fetch,
    tokenProvider: { getAccessToken: async () => "external-token" },
  });

  await mpesa.stkPush({ Amount: 1 });
  assert.equal(fetch.calls.length, 1, "no token request");
  assert.equal(fetch.last().headers.get("authorization"), "Bearer external-token");
});

test("a per-request access token skips authentication for that call", async () => {
  const fetch = mockFetch([["/stkpush/", () => json({ ResponseCode: "0" })]]);
  const mpesa = new MpesaClient({ ...credentials, fetch });

  await mpesa.stkPush({ Amount: 1 }, { accessToken: "one-off" });
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.last().headers.get("authorization"), "Bearer one-off");
});

test("credentials are required unless a token provider is supplied", () => {
  assert.throws(() => new MpesaClient({}), ConfigurationError);
});
