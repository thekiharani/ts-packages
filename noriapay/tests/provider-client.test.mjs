import test from "node:test";
import assert from "node:assert/strict";

import { BusinessError, TimeoutError } from "../dist/index.js";
import { PaystackClient } from "../dist/paystack.js";
import { SasaPayClient } from "../dist/sasapay.js";
import { MpesaClient } from "../dist/mpesa.js";
import { json, mockFetch, oauthRoute, tokenRoute } from "./helpers.mjs";

test("fromEnv does not demand a secret key when a token provider is supplied", async () => {
  const fetch = mockFetch([["api.paystack.co", () => json({ status: true })]]);
  const paystack = PaystackClient.fromEnv({
    env: {},
    fetch,
    tokenProvider: { getAccessToken: async () => "sk_from_vault" },
  });

  await paystack.listBanks();
  assert.equal(fetch.last().headers.get("authorization"), "Bearer sk_from_vault");
});

test("business-error enforcement also covers the escape hatches", async () => {
  const fetch = mockFetch([oauthRoute(), ["/anything", () => json({ ResponseCode: "1", ResponseDescription: "Nope" })]]);
  const mpesa = new MpesaClient({
    consumerKey: "k",
    consumerSecret: "s",
    fetch,
    throwOnBusinessError: true,
  });

  await assert.rejects(() => mpesa.authorizedPost("/anything", {}), BusinessError);
});

test("a caller-supplied accept header is respected", async () => {
  const fetch = mockFetch([oauthRoute(), ["/anything", () => json({})]]);
  const mpesa = new MpesaClient({ consumerKey: "k", consumerSecret: "s", fetch });

  await mpesa.authorizedPost("/anything", {}, { headers: { accept: "application/xml" } });
  assert.equal(fetch.last().headers.get("accept"), "application/xml");

  await mpesa.authorizedPost("/anything", {});
  assert.equal(fetch.last().headers.get("accept"), "application/json", "default otherwise");
});

test("the SDK's Authorization header wins over a caller-supplied one", async () => {
  const fetch = mockFetch([oauthRoute(), ["/anything", () => json({})]]);
  const mpesa = new MpesaClient({ consumerKey: "k", consumerSecret: "s", fetch });

  await mpesa.authorizedPost("/anything", {}, { headers: { authorization: "Bearer forged" } });
  assert.equal(fetch.last().headers.get("authorization"), "Bearer token-123");
});

test("a retried multipart request rebuilds its body on every attempt", async () => {
  const bodies = [];
  let attempts = 0;

  const fetch = mockFetch([
    tokenRoute(),
    [
      "/v2/waas/",
      (ctx) => {
        attempts += 1;
        bodies.push(ctx.init.body);
        return attempts === 1 ? json({}, { status: 503 }) : json({ status: true });
      },
    ],
  ]);

  const sasapay = new SasaPayClient({
    clientId: "id",
    clientSecret: "secret",
    fetch,
    retry: {
      maxAttempts: 2,
      retryMethods: ["POST"],
      retryOnStatuses: [503],
      sleep: async () => {},
    },
  });

  await sasapay.waas.personalKyc(
    { customerId: "C-1" },
    { doc: { filename: "a.txt", content: "hello" } },
  );

  assert.equal(attempts, 2);
  assert.ok(bodies.every((body) => body instanceof FormData));
  assert.notEqual(bodies[0], bodies[1], "a consumed FormData is not reused");
  assert.equal(bodies[1].get("customerId"), "C-1");
});

test("a per-request timeout overrides the client default", async () => {
  const slow = (url, init = {}) =>
    new Promise((resolve, reject) => {
      if (url.includes("token")) {
        resolve(json({ access_token: "t", expires_in: 3600 }));
        return;
      }
      const handle = setTimeout(() => resolve(json({ status: true })), 80);
      init.signal?.addEventListener("abort", () => {
        clearTimeout(handle);
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  const sasapay = new SasaPayClient({
    clientId: "id",
    clientSecret: "secret",
    fetch: slow,
    timeoutMs: 5_000,
  });

  await assert.doesNotReject(() => sasapay.channelCodes());
  await assert.rejects(() => sasapay.channelCodes({ timeoutMs: 10 }), TimeoutError);
});

test("forceTokenRefresh re-authenticates for a single call", async () => {
  let tokens = 0;
  const fetch = mockFetch([
    [
      "/oauth/v1/generate",
      () => {
        tokens += 1;
        return json({ access_token: `token-${tokens}`, expires_in: 3600 });
      },
    ],
    ["/stkpush/", () => json({ ResponseCode: "0" })],
  ]);

  const mpesa = new MpesaClient({ consumerKey: "k", consumerSecret: "s", fetch });

  await mpesa.stkPush({ Amount: 1 });
  assert.equal(fetch.last().headers.get("authorization"), "Bearer token-1");

  await mpesa.stkPush({ Amount: 1 });
  assert.equal(fetch.last().headers.get("authorization"), "Bearer token-1", "cached");

  await mpesa.stkPush({ Amount: 1 }, { forceTokenRefresh: true });
  assert.equal(fetch.last().headers.get("authorization"), "Bearer token-2");
  assert.equal(tokens, 2);
});
