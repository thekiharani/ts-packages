import test from "node:test";
import assert from "node:assert/strict";

import { MpesaClient, buildMpesaStkPassword, buildMpesaTimestamp } from "../dist/mpesa.js";

test("buildMpesaTimestamp formats local date parts into YYYYMMDDHHMMSS", () => {
  const date = new Date(2025, 0, 2, 3, 4, 5);
  assert.equal(buildMpesaTimestamp(date), "20250102030405");
});

test("buildMpesaStkPassword encodes short code, passkey, and timestamp", () => {
  const value = buildMpesaStkPassword({
    businessShortCode: "174379",
    passkey: "passkey",
    timestamp: "20250102030405",
  });

  assert.equal(value, Buffer.from("174379passkey20250102030405", "utf8").toString("base64"));
});

test("MpesaClient authenticates and sends STK push with bearer token", async () => {
  const calls = [];
  const fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });

    if (url.includes("/oauth/v1/generate")) {
      return new Response(JSON.stringify({ access_token: "token-123", expires_in: 3599 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        MerchantRequestID: "123",
        CheckoutRequestID: "ws_CO_123",
        ResponseCode: "0",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  const client = new MpesaClient({
    consumerKey: "consumer-key",
    consumerSecret: "consumer-secret",
    environment: "sandbox",
    fetch,
  });

  const timestamp = "20250102030405";
  const response = await client.stkPush({
    BusinessShortCode: "174379",
    Password: buildMpesaStkPassword({
      businessShortCode: "174379",
      passkey: "passkey",
      timestamp,
    }),
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: 1,
    PartyA: "254700000000",
    PartyB: "174379",
    PhoneNumber: "254700000000",
    CallBackURL: "https://example.com/callback",
    AccountReference: "INV-001",
    TransactionDesc: "Payment",
  });

  assert.equal(response.ResponseCode, "0");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/oauth\/v1\/generate\?grant_type=client_credentials$/);
  assert.equal(
    calls[0].init.headers.get("authorization"),
    `Basic ${Buffer.from("consumer-key:consumer-secret", "utf8").toString("base64")}`,
  );
  assert.match(calls[1].url, /\/mpesa\/stkpush\/v1\/processrequest$/);
  assert.equal(calls[1].init.headers.get("authorization"), "Bearer token-123");

  const parsedBody = JSON.parse(calls[1].init.body);
  assert.equal(parsedBody.Amount, "1");
});

test("MpesaClient supports external token providers, hooks, and per-request headers", async () => {
  const calls = [];
  let tokenCalls = 0;

  const client = new MpesaClient({
    environment: "sandbox",
    tokenProvider: {
      async getAccessToken() {
        tokenCalls += 1;
        return "external-token";
      },
    },
    defaultHeaders: {
      "x-client-header": "client",
    },
    hooks: {
      beforeRequest(context) {
        context.headers.set("x-hook-header", "hooked");
      },
    },
    fetch: async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, init });

      return new Response(JSON.stringify({ ResponseCode: "0" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  await client.accountBalance(
    {
      Initiator: "apiuser",
      SecurityCredential: "EncryptedPassword",
      CommandID: "AccountBalance",
      PartyA: "600000",
      IdentifierType: "4",
      ResultURL: "https://example.com/result",
      QueueTimeOutURL: "https://example.com/timeout",
      Remarks: "Account balance",
    },
    {
      headers: new Headers({ "x-request-header": "request" }),
    },
  );

  assert.equal(tokenCalls, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.get("authorization"), "Bearer external-token");
  assert.equal(calls[0].init.headers.get("x-client-header"), "client");
  assert.equal(calls[0].init.headers.get("x-request-header"), "request");
  assert.equal(calls[0].init.headers.get("x-hook-header"), "hooked");
});
