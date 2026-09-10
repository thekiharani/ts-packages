import test from "node:test";
import assert from "node:assert/strict";

import { BusinessError, ConfigurationError } from "../dist/index.js";
import { PAYSTACK_BASE_URL, PAYSTACK_ENDPOINTS, PaystackClient } from "../dist/paystack.js";
import { json, mockFetch } from "./helpers.mjs";

function client(routes, options = {}) {
  const fetch = mockFetch(routes);
  return { fetch, client: new PaystackClient({ secretKey: "sk_test_123", fetch, ...options }) };
}

test("a secret key or token provider is required", () => {
  assert.throws(() => new PaystackClient({}), ConfigurationError);
  assert.doesNotThrow(
    () => new PaystackClient({ tokenProvider: { getAccessToken: async () => "sk" } }),
  );
});

test("initializeTransaction posts with the secret key as the bearer", async () => {
  const { fetch, client: paystack } = client([
    [
      "/transaction/initialize",
      () => json({ status: true, data: { authorization_url: "https://checkout.test/x" } }),
    ],
  ]);

  const response = await paystack.initializeTransaction({
    amount: 500000,
    email: "customer@example.test",
  });

  assert.equal(response.data.authorization_url, "https://checkout.test/x");
  assert.equal(fetch.last().url, `${PAYSTACK_BASE_URL}/transaction/initialize`);
  assert.equal(fetch.last().headers.get("authorization"), "Bearer sk_test_123");
  assert.equal(fetch.last().method, "POST");
});

test("path parameters are URL-encoded", async () => {
  const { fetch, client: paystack } = client([["/transaction/verify", () => json({ status: true })]]);

  await paystack.verifyTransaction("ref/with spaces");
  assert.equal(fetch.last().url, `${PAYSTACK_BASE_URL}/transaction/verify/ref%2Fwith%20spaces`);
});

test("throwOnBusinessError catches a 200 with status false", async () => {
  const failed = { status: false, message: "Invalid split code" };

  const { client: quiet } = client([["/transaction/initialize", () => json(failed)]]);
  assert.deepEqual(await quiet.initializeTransaction({}), failed);

  const { client: loud } = client([["/transaction/initialize", () => json(failed)]], {
    throwOnBusinessError: true,
  });

  await assert.rejects(
    () => loud.initializeTransaction({}),
    (error) => {
      assert.ok(error instanceof BusinessError);
      assert.equal(error.provider, "paystack");
      assert.match(error.message, /Invalid split code/);
      return true;
    },
  );
});

test("every wrapped endpoint calls the method and path Paystack documents", async () => {
  const seen = [];
  const fetch = mockFetch([
    [
      "api.paystack.co",
      (ctx) => {
        seen.push([ctx.init.method, new URL(ctx.url).pathname]);
        return json({ status: true });
      },
    ],
  ]);
  const paystack = new PaystackClient({ secretKey: "sk", fetch });

  for (const [name, [method, template]] of Object.entries(PAYSTACK_ENDPOINTS)) {
    const parameters = [...template.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
    const args = parameters.map((parameter) => `sample-${parameter}`);
    // Every method takes an optional body or query object after its path parameters.
    args.push({});

    seen.length = 0;
    await paystack[name](...args);

    assert.equal(seen.length, 1, `${name} made ${seen.length} requests`);

    const expectedPath = parameters.reduce(
      (path, parameter) => path.replace(`{${parameter}}`, `sample-${parameter}`),
      template,
    );

    assert.deepEqual(seen[0], [method, expectedPath], `${name} did not match its endpoint entry`);
  }
});

test("list endpoints send their filters as a query string", async () => {
  const { fetch, client: paystack } = client([["api.paystack.co", () => json({ status: true })]]);

  await paystack.listTransactions({ perPage: 50, page: 2, status: "success" });
  const url = new URL(fetch.last().url);
  assert.equal(url.pathname, "/transaction");
  assert.equal(url.searchParams.get("perPage"), "50");
  assert.equal(url.searchParams.get("status"), "success");
  assert.equal(fetch.last().method, "GET");
});

test("the escape hatches cover every verb", async () => {
  const { fetch, client: paystack } = client([["api.paystack.co", () => json({ status: true })]]);

  await paystack.authorizedPost("/some/new/endpoint", { a: 1 });
  assert.equal(fetch.last().method, "POST");
  assert.deepEqual(fetch.jsonBody(), { a: 1 });

  await paystack.authorizedGet("/some/new/endpoint", { page: 1 });
  assert.equal(fetch.last().method, "GET");

  await paystack.authorizedPut("/some/new/endpoint", { a: 1 });
  assert.equal(fetch.last().method, "PUT");

  await paystack.authorizedDelete("/some/new/endpoint");
  assert.equal(fetch.last().method, "DELETE");

  assert.equal(fetch.last().headers.get("authorization"), "Bearer sk_test_123");
});

test("an endpoint override can change a path or a whole method and path pair", async () => {
  const { fetch, client: paystack } = client([["api.paystack.co", () => json({ status: true })]], {
    endpoints: {
      listBanks: "/bank/v2",
      verifyTransaction: ["POST", "/transaction/verify/{reference}"],
    },
  });

  await paystack.listBanks();
  assert.equal(new URL(fetch.last().url).pathname, "/bank/v2");
  assert.equal(fetch.last().method, "GET", "an override path keeps the documented verb");

  await paystack.verifyTransaction("ref");
  assert.equal(fetch.last().method, "POST");

  assert.deepEqual(paystack.endpoint("listBanks"), ["GET", "/bank/v2"]);
  assert.deepEqual(paystack.endpoint("createRefund"), PAYSTACK_ENDPOINTS.createRefund);
});

test("the public key is carried for the front end and never sent", async () => {
  const { fetch, client: paystack } = client([["api.paystack.co", () => json({ status: true })]], {
    publicKey: "pk_test_456",
  });

  assert.equal(paystack.publicKey, "pk_test_456");
  await paystack.listBanks();
  assert.equal(fetch.last().headers.get("authorization"), "Bearer sk_test_123");
});

test("static helpers read a business outcome", () => {
  assert.equal(PaystackClient.succeeded({ status: true }), true);
  assert.equal(PaystackClient.succeeded({ status: false }), false);
  assert.equal(PaystackClient.statusMessage({ message: "Declined" }), "Declined");
});
