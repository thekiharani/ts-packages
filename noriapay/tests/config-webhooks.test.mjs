import test from "node:test";
import assert from "node:assert/strict";

import {
  ConfigurationError,
  MPESA_BASE_URLS,
  MpesaClient,
  PAYSTACK_WEBHOOK_IPS,
  PaystackClient,
  SASAPAY_BASE_URL,
  SasaPayClient,
  WebhookVerificationError,
  computePaystackSignature,
  requirePaystackSignature,
  requireSourceIp,
  verifyPaystackSignature,
  verifySourceIp,
} from "../dist/index.js";

test("fromEnv helpers read credentials and common transport options", async () => {
  const mpesaCalls = [];
  const mpesa = MpesaClient.fromEnv({
    env: {
      MPESA_CONSUMER_KEY: "consumer-key",
      MPESA_CONSUMER_SECRET: "consumer-secret",
      MPESA_ENVIRONMENT: "production",
      MPESA_TIMEOUT_SECONDS: "12.5",
      MPESA_TOKEN_CACHE_SKEW_SECONDS: "30",
    },
    fetch: async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.toString();
      mpesaCalls.push({ url, init: { ...init, headers: new Headers(init.headers) } });

      return new Response(JSON.stringify({ access_token: "mpesa-token", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(await mpesa.getAccessToken(), "mpesa-token");
  assert.equal(mpesaCalls[0].url, `${MPESA_BASE_URLS.production}/oauth/v1/generate?grant_type=client_credentials`);

  const sasapayCalls = [];
  const sasapay = SasaPayClient.fromEnv({
    env: {
      SASAPAY_CLIENT_ID: "client-id",
      SASAPAY_CLIENT_SECRET: "client-secret",
      SASAPAY_ENVIRONMENT: "production",
      SASAPAY_BASE_URL: "https://api.example.com/sasapay",
      SASAPAY_TIMEOUT_SECONDS: "20",
    },
    fetch: async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.toString();
      sasapayCalls.push({ url, init: { ...init, headers: new Headers(init.headers) } });

      return new Response(JSON.stringify({ access_token: "sasapay-token", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(await sasapay.getAccessToken(), "sasapay-token");
  assert.equal(sasapayCalls[0].url, "https://api.example.com/sasapay/auth/token/?grant_type=client_credentials");

  const paystackCalls = [];
  const paystack = PaystackClient.fromEnv({
    env: {
      PAYSTACK_SECRET_KEY: "sk_test_123",
      PAYSTACK_TIMEOUT_SECONDS: "9",
    },
    fetch: async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.toString();
      paystackCalls.push({ url, init: { ...init, headers: new Headers(init.headers) } });

      return new Response(JSON.stringify({ status: true, message: "Banks", data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal((await paystack.listBanks()).status, true);
  assert.equal(paystackCalls[0].init.headers.get("authorization"), "Bearer sk_test_123");
  assert.equal(SASAPAY_BASE_URL, "https://sandbox.sasapay.app/api/v1");
});

test("fromEnv can skip credential env variables when a token provider is supplied", async () => {
  const client = MpesaClient.fromEnv({
    env: {
      MPESA_ENVIRONMENT: "sandbox",
    },
    tokenProvider: {
      async getAccessToken() {
        return "external-token";
      },
    },
    fetch: async () =>
      new Response(JSON.stringify({ ResponseCode: "0" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  const response = await client.accountBalance({
    Initiator: "apiuser",
    SecurityCredential: "EncryptedPassword",
    CommandID: "AccountBalance",
    PartyA: "600000",
    IdentifierType: "4",
    ResultURL: "https://example.com/result",
    QueueTimeOutURL: "https://example.com/timeout",
    Remarks: "Account balance",
  });

  assert.equal(response.ResponseCode, "0");
});

test("fromEnv validates required and typed environment values", () => {
  assert.throws(
    () => PaystackClient.fromEnv({ env: {} }),
    /Missing required environment variable: PAYSTACK_SECRET_KEY/,
  );

  assert.throws(
    () =>
      MpesaClient.fromEnv({
        env: {
          MPESA_CONSUMER_KEY: "consumer-key",
          MPESA_CONSUMER_SECRET: "consumer-secret",
          MPESA_ENVIRONMENT: "staging",
        },
      }),
    ConfigurationError,
  );

  assert.throws(
    () =>
      SasaPayClient.fromEnv({
        env: {
          SASAPAY_CLIENT_ID: "client-id",
          SASAPAY_CLIENT_SECRET: "client-secret",
          SASAPAY_TIMEOUT_SECONDS: "abc",
        },
      }),
    ConfigurationError,
  );
});

test("webhook helpers verify signatures and source IPs", () => {
  const rawBody = '{"event":"charge.success"}';
  const secretKey = "sk_test_123";
  const signature = computePaystackSignature(rawBody, secretKey);
  const bytesSignature = computePaystackSignature(Buffer.from(rawBody, "utf8"), secretKey);

  assert.equal(verifyPaystackSignature(rawBody, signature, secretKey), true);
  assert.equal(
    verifyPaystackSignature(Buffer.from(rawBody, "utf8"), bytesSignature, secretKey),
    true,
  );
  assert.equal(verifyPaystackSignature(rawBody, "bad-signature", secretKey), false);
  assert.equal(verifyPaystackSignature(rawBody, undefined, secretKey), false);

  assert.doesNotThrow(() => requirePaystackSignature(rawBody, signature, secretKey));
  assert.throws(
    () => requirePaystackSignature(rawBody, "bad-signature", secretKey),
    WebhookVerificationError,
  );

  assert.equal(verifySourceIp(PAYSTACK_WEBHOOK_IPS[0], PAYSTACK_WEBHOOK_IPS), true);
  assert.equal(verifySourceIp(" 52.31.139.75 ", PAYSTACK_WEBHOOK_IPS), true);
  assert.equal(verifySourceIp(undefined, PAYSTACK_WEBHOOK_IPS), false);
  assert.equal(verifySourceIp("   ", PAYSTACK_WEBHOOK_IPS), false);
  assert.equal(verifySourceIp("127.0.0.1", PAYSTACK_WEBHOOK_IPS), false);

  assert.doesNotThrow(() => requireSourceIp(PAYSTACK_WEBHOOK_IPS[1], PAYSTACK_WEBHOOK_IPS));
  assert.throws(
    () => requireSourceIp("127.0.0.1", PAYSTACK_WEBHOOK_IPS),
    WebhookVerificationError,
  );
});
