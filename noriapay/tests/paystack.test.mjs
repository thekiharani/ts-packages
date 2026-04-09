import test from "node:test";
import assert from "node:assert/strict";

import { PAYSTACK_BASE_URL, PaystackClient } from "../dist/paystack.js";

test("PaystackClient requires a secret key", () => {
  assert.throws(() => new PaystackClient({ secretKey: "" }), /requires secretKey/i);
});

test("PaystackClient supports initialize, verify, bank, recipient, and transfer flows", async () => {
  const calls = [];
  const fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers = new Headers(init.headers);
    calls.push({ url, init: { ...init, headers } });

    if (url.endsWith("/transaction/initialize")) {
      return new Response(
        JSON.stringify({
          status: true,
          message: "Authorization URL created",
          data: {
            authorization_url: "https://checkout.paystack.com/test",
            access_code: "ACCESS_test",
            reference: "ref-init",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (url.endsWith("/transaction/verify/ref-init")) {
      return new Response(
        JSON.stringify({
          status: true,
          message: "Verification successful",
          data: {
            id: 123,
            status: "success",
            reference: "ref-init",
            amount: 5000,
            currency: "KES",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (url.includes("/bank?")) {
      return new Response(
        JSON.stringify({
          status: true,
          message: "Banks retrieved",
          data: [
            {
              name: "Safaricom",
              code: "MPESA",
              country: "Kenya",
              currency: "KES",
              type: "mobile_money",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (url.includes("/bank/resolve?")) {
      return new Response(
        JSON.stringify({
          status: true,
          message: "Account number resolved",
          data: {
            account_number: "247247",
            account_name: "Till Transfer Example",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (url.endsWith("/transferrecipient")) {
      return new Response(
        JSON.stringify({
          status: true,
          message: "Transfer recipient created successfully",
          data: {
            recipient_code: "RCP_paystack",
            type: "mobile_money_business",
            currency: "KES",
            details: {
              account_number: "247247",
              bank_code: "MPTILL",
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (url.endsWith("/transfer")) {
      return new Response(
        JSON.stringify({
          status: true,
          message: "Transfer has been queued",
          data: {
            transfer_code: "TRF_queued",
            status: "otp",
            reference: "ref-transfer",
            amount: 5000,
            currency: "KES",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (url.endsWith("/transfer/finalize_transfer")) {
      return new Response(
        JSON.stringify({
          status: true,
          message: "Transfer finalized",
          data: {
            transfer_code: "TRF_queued",
            status: "success",
            reference: "ref-transfer",
          },
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
        message: "Transfer retrieved",
        data: {
          transfer_code: "TRF_queued",
          status: "success",
          reference: "ref-transfer",
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  const client = new PaystackClient({
    secretKey: "sk_test_123",
    fetch,
    defaultHeaders: { "x-client-header": "client" },
    hooks: {
      beforeRequest(context) {
        context.headers.set("x-hooked", "yes");
      },
    },
  });

  assert.equal(PAYSTACK_BASE_URL, "https://api.paystack.co");
  assert.equal(
    (await client.initializeTransaction({
      amount: 5000,
      email: "customer@example.com",
      currency: "KES",
      reference: "ref-init",
    })).data.reference,
    "ref-init",
  );
  assert.equal((await client.verifyTransaction("ref-init")).data.status, "success");
  assert.equal(
    (await client.listBanks({ currency: "KES", type: "mobile_money" })).data[0].code,
    "MPESA",
  );
  assert.equal(
    (await client.resolveAccount({ accountNumber: "247247", bankCode: "MPTILL" })).data.account_name,
    "Till Transfer Example",
  );
  assert.equal(
    (
      await client.createTransferRecipient({
        type: "mobile_money_business",
        name: "Till Transfer Example",
        account_number: "247247",
        bank_code: "MPTILL",
        currency: "KES",
      })
    ).data.recipient_code,
    "RCP_paystack",
  );
  assert.equal(
    (
      await client.initiateTransfer({
        source: "balance",
        amount: 5000,
        recipient: "RCP_paystack",
        reference: "ref-transfer",
        currency: "KES",
        account_reference: "ACC-123",
      })
    ).data.status,
    "otp",
  );
  assert.equal(
    (
      await client.finalizeTransfer(
        {
          transfer_code: "TRF_queued",
          otp: "123456",
        },
        {
          accessToken: "sk_test_override",
          headers: { "x-request-id": "req-123" },
        },
      )
    ).data.status,
    "success",
  );
  assert.equal((await client.verifyTransfer("ref-transfer")).data.reference, "ref-transfer");

  assert.equal(calls[0].init.headers.get("authorization"), "Bearer sk_test_123");
  assert.equal(calls[0].init.headers.get("x-client-header"), "client");
  assert.equal(calls[0].init.headers.get("x-hooked"), "yes");
  assert.equal(JSON.parse(calls[0].init.body).email, "customer@example.com");
  assert.match(calls[1].url, /\/transaction\/verify\/ref-init$/);
  assert.match(calls[2].url, /currency=KES/);
  assert.match(calls[2].url, /type=mobile_money/);
  assert.match(calls[3].url, /account_number=247247/);
  assert.match(calls[3].url, /bank_code=MPTILL/);
  assert.equal(calls[6].init.headers.get("authorization"), "Bearer sk_test_override");
  assert.equal(calls[6].init.headers.get("x-request-id"), "req-123");
});
