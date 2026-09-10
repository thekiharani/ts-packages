import test from "node:test";
import assert from "node:assert/strict";

import { ConfigurationError, MemoryTokenStore } from "../dist/index.js";
import { MpesaClient } from "../dist/mpesa.js";
import { SasaPayClient } from "../dist/sasapay.js";
import { PaystackClient } from "../dist/paystack.js";
import { KcbBuniClient } from "../dist/kcb-buni.js";
import { json, mockFetch, oauthRoute, tokenRoute } from "./helpers.mjs";

test("TIMEOUT_SECONDS is read as seconds and applied as milliseconds", async () => {
  // A 60 ms response under a 30 second budget must succeed. Reading the variable
  // as milliseconds would abort it after 30 ms.
  const slow = (url, init = {}) =>
    new Promise((resolve, reject) => {
      const handle = setTimeout(
        () => resolve(json({ access_token: "t", expires_in: 3600, ResponseCode: "0" })),
        60,
      );
      init.signal?.addEventListener("abort", () => {
        clearTimeout(handle);
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  const client = MpesaClient.fromEnv({
    env: {
      MPESA_CONSUMER_KEY: "key",
      MPESA_CONSUMER_SECRET: "secret",
      MPESA_TIMEOUT_SECONDS: "30",
    },
    fetch: slow,
  });

  await assert.doesNotReject(() => client.getAccessToken());
});

test("fromEnv reads credentials and transport options for every provider", async () => {
  const mpesaFetch = mockFetch([oauthRoute(), ["/stkpush/", () => json({ ResponseCode: "0" })]]);
  const mpesa = MpesaClient.fromEnv({
    env: {
      MPESA_CONSUMER_KEY: "consumer-key",
      MPESA_CONSUMER_SECRET: "consumer-secret",
      MPESA_ENVIRONMENT: "production",
      MPESA_TIMEOUT_SECONDS: "12.5",
      MPESA_B2C_VERSION: "v3",
      MPESA_THROW_ON_BUSINESS_ERROR: "false",
    },
    fetch: mpesaFetch,
  });

  await mpesa.stkPush({ Amount: 1 });
  assert.match(mpesaFetch.calls[0].url, /^https:\/\/api\.safaricom\.co\.ke\/oauth/);
  assert.equal(
    mpesaFetch.calls[0].headers.get("authorization"),
    `Basic ${Buffer.from("consumer-key:consumer-secret").toString("base64")}`,
  );

  const sasapayFetch = mockFetch([tokenRoute(), ["example.com", () => json({ status: true })]]);
  const sasapay = SasaPayClient.fromEnv({
    env: {
      SASAPAY_CLIENT_ID: "client-id",
      SASAPAY_CLIENT_SECRET: "client-secret",
      SASAPAY_BASE_URL: "https://api.example.com/sasapay",
      SASAPAY_MERCHANT_CODE: "600000",
      SASAPAY_CURRENCY: "KES",
    },
    fetch: sasapayFetch,
  });

  await sasapay.requestPayment({ Amount: 1 });
  assert.match(sasapayFetch.last().url, /^https:\/\/api\.example\.com\/sasapay\//);
  assert.equal(sasapayFetch.jsonBody().MerchantCode, "600000");
  assert.equal(sasapayFetch.jsonBody().Currency, "KES");

  const paystackFetch = mockFetch([["api.paystack.co", () => json({ status: true })]]);
  const paystack = PaystackClient.fromEnv({
    env: { PAYSTACK_SECRET_KEY: "sk_test_123", PAYSTACK_PUBLIC_KEY: "pk_test_456" },
    fetch: paystackFetch,
  });

  await paystack.listBanks();
  assert.equal(paystackFetch.last().headers.get("authorization"), "Bearer sk_test_123");
  assert.equal(paystack.publicKey, "pk_test_456");

  const buniFetch = mockFetch([tokenRoute(), ["/transfer", () => json({ header: { statusCode: "0" } })]]);
  const buni = KcbBuniClient.fromEnv({
    env: {
      KCB_BUNI_CONSUMER_KEY: "ck",
      KCB_BUNI_CONSUMER_SECRET: "cs",
      KCB_BUNI_API_KEY: "gateway-key",
      KCB_BUNI_MPESA_ROUTE_CODE: "207",
      KCB_BUNI_VALIDATE_PAYLOADS: "false",
    },
    fetch: buniFetch,
  });

  await buni.transferFunds({});
  assert.equal(buniFetch.last().headers.get("apikey"), "gateway-key");
});

test("fromEnv can skip credential variables when a token provider is supplied", async () => {
  const fetch = mockFetch([["/stkpush/", () => json({ ResponseCode: "0" })]]);
  const client = MpesaClient.fromEnv({
    env: {},
    fetch,
    tokenProvider: { getAccessToken: async () => "external" },
  });

  await client.stkPush({ Amount: 1 });
  assert.equal(fetch.last().headers.get("authorization"), "Bearer external");
});

test("fromEnv rejects missing, malformed, and out-of-range values", () => {
  assert.throws(
    () => MpesaClient.fromEnv({ env: {} }),
    (error) => {
      assert.ok(error instanceof ConfigurationError);
      assert.match(error.message, /MPESA_CONSUMER_KEY/);
      return true;
    },
  );

  assert.throws(
    () =>
      SasaPayClient.fromEnv({
        env: { SASAPAY_CLIENT_ID: "a", SASAPAY_CLIENT_SECRET: "b", SASAPAY_TIMEOUT_SECONDS: "abc" },
      }),
    ConfigurationError,
  );

  assert.throws(
    () =>
      MpesaClient.fromEnv({
        env: { MPESA_CONSUMER_KEY: "a", MPESA_CONSUMER_SECRET: "b", MPESA_ENVIRONMENT: "staging" },
      }),
    ConfigurationError,
  );

  assert.throws(
    () =>
      MpesaClient.fromEnv({
        env: {
          MPESA_CONSUMER_KEY: "a",
          MPESA_CONSUMER_SECRET: "b",
          MPESA_THROW_ON_BUSINESS_ERROR: "maybe",
        },
      }),
    ConfigurationError,
  );
});

test("a token store shares one token between two clients built from the same env", async () => {
  const store = new MemoryTokenStore();
  let tokenCalls = 0;

  const build = () =>
    MpesaClient.fromEnv({
      env: { MPESA_CONSUMER_KEY: "key", MPESA_CONSUMER_SECRET: "secret" },
      tokenStore: store,
      fetch: mockFetch([
        [
          "/oauth/v1/generate",
          () => {
            tokenCalls += 1;
            return json({ access_token: "shared", expires_in: 3600 });
          },
        ],
        ["/stkpush/", () => json({ ResponseCode: "0" })],
      ]),
    });

  await build().stkPush({ Amount: 1 });
  await build().stkPush({ Amount: 1 });

  assert.equal(tokenCalls, 1, "the second process reuses the stored token");
});
