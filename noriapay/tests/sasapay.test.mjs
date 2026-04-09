import test from "node:test";
import assert from "node:assert/strict";

import { SasaPayClient } from "../dist/sasapay.js";

test("SasaPayClient requires explicit production baseUrl", () => {
  assert.throws(
    () =>
      new SasaPayClient({
        clientId: "client-id",
        clientSecret: "client-secret",
        environment: "production",
      }),
    /production baseUrl must be provided explicitly/i,
  );
});

test("SasaPayClient requests token and sends C2B request payment", async () => {
  const calls = [];
  const fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });

    if (url.includes("/auth/token/")) {
      return new Response(
        JSON.stringify({
          status: true,
          detail: "SUCCESS",
          access_token: "sasapay-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "merchants C2B/B2B/B2C",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        status: true,
        CheckoutRequestID: "checkout-123",
        ResponseCode: "0",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  const client = new SasaPayClient({
    clientId: "client-id",
    clientSecret: "client-secret",
    environment: "sandbox",
    fetch,
  });

  const response = await client.requestPayment({
    MerchantCode: "600980",
    NetworkCode: "63902",
    Currency: "KES",
    Amount: 1,
    PhoneNumber: "254700000080",
    AccountReference: "12345678",
    TransactionDesc: "Request Payment",
    CallBackURL: "https://example.com/callback",
  });

  assert.equal(response.ResponseCode, "0");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/auth\/token\/\?grant_type=client_credentials$/);
  assert.equal(
    calls[0].init.headers.get("authorization"),
    `Basic ${Buffer.from("client-id:client-secret", "utf8").toString("base64")}`,
  );
  assert.match(calls[1].url, /\/payments\/request-payment\/$/);
  assert.equal(calls[1].init.headers.get("authorization"), "Bearer sasapay-token");

  const parsedBody = JSON.parse(calls[1].init.body);
  assert.equal(parsedBody.Amount, "1");
});

test("SasaPayClient supports per-request retries for POST requests when explicitly enabled", async () => {
  const calls = [];
  let paymentAttempts = 0;

  const client = new SasaPayClient({
    clientId: "client-id",
    clientSecret: "client-secret",
    environment: "sandbox",
    fetch: async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, init });

      if (url.includes("/auth/token/")) {
        return new Response(
          JSON.stringify({
            access_token: "sasapay-token",
            expires_in: 3600,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      paymentAttempts += 1;

      if (paymentAttempts === 1) {
        return new Response(JSON.stringify({ detail: "temporary failure" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ status: true, ResponseCode: "0" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const response = await client.requestPayment(
    {
      MerchantCode: "600980",
      NetworkCode: "63902",
      Currency: "KES",
      Amount: "1.00",
      PhoneNumber: "254700000080",
      AccountReference: "12345678",
      TransactionDesc: "Request Payment",
      CallBackURL: "https://example.com/callback",
    },
    {
      retry: {
        maxAttempts: 2,
        retryMethods: ["POST"],
        retryOnStatuses: [500],
        baseDelayMs: 0,
      },
    },
  );

  assert.equal(response.ResponseCode, "0");
  assert.equal(paymentAttempts, 2);
  assert.equal(calls.length, 3);
});

test("SasaPayClient can use a per-request access token override without authenticating", async () => {
  const calls = [];

  const client = new SasaPayClient({
    tokenProvider: {
      async getAccessToken() {
        throw new Error("token provider should not be called");
      },
    },
    environment: "sandbox",
    fetch: async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, init });

      return new Response(JSON.stringify({ status: true, detail: "Transaction is being processed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  await client.processPayment(
    {
      MerchantCode: "600980",
      CheckoutRequestID: "checkout-123",
      VerificationCode: "123456",
    },
    {
      accessToken: "manual-token",
      headers: { "x-request-id": "abc-123" },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.get("authorization"), "Bearer manual-token");
  assert.equal(calls[0].init.headers.get("x-request-id"), "abc-123");
});
