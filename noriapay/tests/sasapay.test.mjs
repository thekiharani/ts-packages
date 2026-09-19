import test from "node:test";
import assert from "node:assert/strict";

import { BusinessError, ConfigurationError } from "../dist/index.js";
import {
  SASAPAY_BASE_URLS,
  SASAPAY_ENDPOINTS,
  SASAPAY_WAAS_BASE_URLS,
  SASAPAY_WAAS_ENDPOINTS,
  SasaPayClient,
} from "../dist/sasapay.js";
import { json, mockFetch, tokenRoute } from "./helpers.mjs";

const credentials = { clientId: "id", clientSecret: "secret" };

function client(routes, options = {}) {
  const fetch = mockFetch([tokenRoute(), ...routes]);
  return { fetch, client: new SasaPayClient({ ...credentials, fetch, ...options }) };
}

test("requestPayment authenticates at the documented token URL and normalizes the payload", async () => {
  const { fetch, client: sasapay } = client([
    ["/payments/request-payment/", () => json({ status: true, CheckoutRequestID: "chk-1" })],
  ]);

  const response = await sasapay.requestPayment({
    MerchantCode: "600000",
    NetworkCode: "63902",
    Currency: "KES",
    Amount: 0.1 + 0.2,
    PhoneNumber: "0712345678",
    AccountReference: "INV-1",
    TransactionDesc: "Payment",
    CallBackURL: "https://example.test/cb",
  });

  assert.equal(response.CheckoutRequestID, "chk-1");

  const [tokenCall, paymentCall] = fetch.calls;
  assert.equal(
    tokenCall.url,
    "https://sandbox.sasapay.app/api/v1/auth/token/?grant_type=client_credentials",
  );
  assert.equal(tokenCall.init.method, "GET");
  assert.equal(paymentCall.url, `${SASAPAY_BASE_URLS.sandbox}/payments/request-payment/`);

  const body = fetch.jsonBody();
  assert.equal(body.PhoneNumber, "254712345678");
  assert.equal(body.Amount, "0.3", "float artefacts never reach the provider");
});

test("token URLs match SasaPay's published authentication endpoints", async () => {
  const urls = [];
  const fetch = async (url) => {
    urls.push(String(url));
    return json({ access_token: "t", expires_in: 3600 });
  };

  for (const environment of ["sandbox", "production"]) {
    const sasapay = new SasaPayClient({ ...credentials, environment, fetch });
    await sasapay.getAccessToken();
    await sasapay.waas.getAccessToken();
  }

  assert.deepEqual(urls, [
    "https://sandbox.sasapay.app/api/v1/auth/token/?grant_type=client_credentials",
    "https://sandbox.sasapay.app/api/v2/waas/auth/token/?grant_type=client_credentials",
    "https://api.sasapay.app/api/v1/auth/token/?grant_type=client_credentials",
    "https://api.sasapay.app/api/v2/waas/auth/token/?grant_type=client_credentials",
  ]);
});

test("the WaaS token response reports success as statusCode, not status", () => {
  assert.equal(SasaPayClient.succeeded({ status: true, detail: "SUCCESS" }), true);
  assert.equal(SasaPayClient.succeeded({ statusCode: 0 }), true);
  assert.equal(SasaPayClient.succeeded({ statusCode: "0" }), true);
  assert.equal(SasaPayClient.succeeded({ statusCode: 1 }), false);
});

test("paymentDefaults fill the fields that never change, without overriding a caller", async () => {
  const { fetch, client: sasapay } = client(
    [["/payments/", () => json({ status: true })]],
    {
      paymentDefaults: {
        MerchantCode: "600000",
        Currency: "KES",
        CallBackURL: "https://example.test/cb",
      },
    },
  );

  await sasapay.requestPayment({ Amount: 1, PhoneNumber: "254712345678" });
  let body = fetch.jsonBody();
  assert.equal(body.MerchantCode, "600000");
  assert.equal(body.Currency, "KES");
  assert.equal(body.CallBackURL, "https://example.test/cb");

  await sasapay.requestPayment({ Amount: 1, MerchantCode: "999999" });
  body = fetch.jsonBody();
  assert.equal(body.MerchantCode, "999999", "an explicit value wins");
});

test("production resolves to the observed live host, and baseUrl overrides it", async () => {
  const { fetch, client: live } = client([["/payments/", () => json({ status: true })]], {
    environment: "production",
  });

  await live.requestPayment({ Amount: 1 });
  assert.match(fetch.last().url, new RegExp(`^${SASAPAY_BASE_URLS.production}`));

  const { fetch: f2, client: custom } = client([["example.test", () => json({ status: true })]], {
    baseUrl: "https://sasapay.example.test/api/v1",
  });
  await custom.requestPayment({ Amount: 1 });
  assert.match(f2.last().url, /^https:\/\/sasapay\.example\.test\/api\/v1\//);
});

test("throwOnBusinessError catches a 200 that carries status false", async () => {
  const failed = { status: false, detail: "Insufficient funds" };

  const { client: quiet } = client([["/payments/b2c/", () => json(failed)]]);
  assert.deepEqual(await quiet.b2cPayment({ Amount: 1 }), failed);

  const { client: loud } = client([["/payments/b2c/", () => json(failed)]], {
    throwOnBusinessError: true,
  });

  await assert.rejects(
    () => loud.b2cPayment({ Amount: 1 }),
    (error) => {
      assert.ok(error instanceof BusinessError);
      assert.match(error.message, /Insufficient funds/);
      return true;
    },
  );
});

test("GET endpoints send their parameters as a query string", async () => {
  const { fetch, client: sasapay } = client([
    ["sasapay.app/api/v1", () => json({ status: true })],
  ]);

  await sasapay.merchantBalance("600000");
  assert.match(fetch.last().url, /\/payments\/check-balance\/\?MerchantCode=600000$/);
  assert.equal(fetch.last().method, "GET");

  await sasapay.dealerSubCounties(47);
  assert.match(fetch.last().url, /\/accounts\/sub-counties\/\?county_id=47$/);

  await sasapay.channelCodes();
  assert.match(fetch.last().url, /\/payments\/channel-codes\/$/);

  await sasapay.transactions({ page: 2 });
  assert.match(fetch.last().url, /\/transactions\/\?page=2$/);
});

test("every v1 endpoint this package wraps is reachable", async () => {
  const seen = [];
  const fetch = mockFetch([
    tokenRoute(),
    [
      "sasapay.app/api/v1",
      (ctx) => {
        seen.push(new URL(ctx.url).pathname.replace("/api/v1", ""));
        return json({ status: true });
      },
    ],
  ]);
  const sasapay = new SasaPayClient({ ...credentials, fetch });

  await sasapay.requestPayment({ Amount: 1 });
  await sasapay.processPayment({ VerificationCode: "1" });
  await sasapay.b2cPayment({ Amount: 1 });
  await sasapay.b2bPayment({ Amount: 1 });
  await sasapay.cardPayment({ Amount: 1 });
  await sasapay.preApprovedPayment({ Amount: 1 });
  await sasapay.remittancePayment({ Amount: 1 });
  await sasapay.accountValidation({});
  await sasapay.internalFundMovement({ Amount: 1 });
  await sasapay.transactionStatus({});
  await sasapay.transactionStatusQuery({});
  await sasapay.requestPaymentStatus({});
  await sasapay.merchantBalance("1");
  await sasapay.verifyTransaction({});
  await sasapay.businessToBeneficiary({ Amount: 1 });
  await sasapay.registerIpnUrl({});
  await sasapay.lipaFare({ Amount: 1 });
  await sasapay.transactions({});
  await sasapay.channelCodes();
  await sasapay.utilityPayment({ Amount: 1 });
  await sasapay.utilityBillQuery({});
  await sasapay.bulkPayment({});
  await sasapay.bulkPaymentStatus({});
  await sasapay.dealerBusinessTypes();
  await sasapay.dealerCountries();
  await sasapay.dealerSubCounties("1");
  await sasapay.dealerIndustries();
  await sasapay.availableBillNumber();
  await sasapay.merchantOnboarding({});

  const expected = Object.values(SASAPAY_ENDPOINTS);
  for (const path of seen) {
    assert.ok(expected.includes(path), `${path} is not a documented endpoint`);
  }
  assert.equal(new Set(seen).size, expected.length, "every endpoint was exercised");
});

test("WaaS runs on its own host, with its own credentials when supplied", async () => {
  const fetch = mockFetch([
    [
      "/auth/token/",
      (ctx) => json({ access_token: ctx.url.includes("/v2/") ? "waas-token" : "v1-token", expires_in: 3600 }),
    ],
    ["/v2/waas/", () => json({ status: true })],
  ]);

  const sasapay = new SasaPayClient({
    ...credentials,
    waasClientId: "waas-id",
    waasClientSecret: "waas-secret",
    fetch,
  });

  await sasapay.waas.requestPayment({ amount: 1, mobileNumber: "0712345678" });

  const tokenCall = fetch.calls.find((call) => call.url.includes("/auth/token/"));
  assert.equal(
    tokenCall.headers.get("authorization"),
    `Basic ${Buffer.from("waas-id:waas-secret").toString("base64")}`,
  );
  assert.match(tokenCall.url, new RegExp(`^${SASAPAY_WAAS_BASE_URLS.sandbox}/auth/token/`));

  const call = fetch.last();
  assert.equal(call.url, `${SASAPAY_WAAS_BASE_URLS.sandbox}/payments/request-payment/`);
  assert.equal(call.headers.get("authorization"), "Bearer waas-token");
  assert.equal(fetch.jsonBody().mobileNumber, "254712345678");
});

test("WaaS KYC sends multipart when documents are attached, JSON when they are not", async () => {
  const { fetch, client: sasapay } = client([["/v2/waas/", () => json({ status: true })]], {
    waasPaymentDefaults: { merchantCode: "600000", currencyCode: "KES", callbackUrl: "https://x.test" },
  });

  await sasapay.waas.personalKyc({ customerId: "C-1" });
  assert.equal(typeof fetch.last().body, "string", "no files means a JSON body");
  const jsonSent = fetch.jsonBody();
  assert.equal(jsonSent.merchantCode, "600000");
  assert.equal(jsonSent.currencyCode, undefined, "KYC excludes currencyCode and callbackUrl");

  await sasapay.waas.personalKyc(
    { customerId: "C-1" },
    { idFront: { filename: "id.png", contentType: "image/png", content: Buffer.from("x") } },
  );

  const form = fetch.last().body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("customerId"), "C-1");
  assert.equal(form.get("merchantCode"), "600000");
  assert.equal(form.get("idFront").name, "id.png");
});

test("every WaaS endpoint this package wraps is reachable", async () => {
  const seen = [];
  const fetch = mockFetch([
    tokenRoute(),
    [
      "/v2/waas",
      (ctx) => {
        seen.push(new URL(ctx.url).pathname.replace("/api/v2/waas", ""));
        return json({ status: true });
      },
    ],
  ]);
  const { waas } = new SasaPayClient({ ...credentials, fetch });

  await waas.personalOnboarding({});
  await waas.confirmPersonalOnboarding({});
  await waas.personalKyc({});
  await waas.businessOnboarding({});
  await waas.confirmBusinessOnboarding({});
  await waas.businessKyc({});
  await waas.customers({});
  await waas.customerDetails({});
  await waas.updateCustomerDetails({});
  await waas.requestPayment({});
  await waas.processPayment({});
  await waas.merchantTransfer({});
  await waas.sendMoney({});
  await waas.payBill({});
  await waas.createSubWallet({});
  await waas.transactions({});
  await waas.transactionStatus({});
  await waas.verifyTransaction({});
  await waas.merchantBalance("1");
  await waas.channelCodes();
  await waas.countries();
  await waas.countrySubRegions("254");
  await waas.industries();
  await waas.subIndustries("1");
  await waas.businessTypes();
  await waas.products();
  await waas.nearestAgents("36.8", "-1.28");
  await waas.utilityPayment({});

  const expected = Object.values(SASAPAY_WAAS_ENDPOINTS);
  for (const path of seen) {
    assert.ok(expected.includes(path), `${path} is not a documented WaaS endpoint`);
  }
  assert.equal(new Set(seen).size, expected.length, "every WaaS endpoint was exercised");
});

test("escape hatches and endpoint overrides work on both surfaces", async () => {
  const { fetch, client: sasapay } = client([["sasapay.app", () => json({ status: true })]], {
    endpoints: { requestPayment: "/payments/custom/" },
  });

  await sasapay.requestPayment({ Amount: 1 });
  assert.match(fetch.last().url, /\/payments\/custom\/$/);

  await sasapay.authorizedPost("/not/wrapped/", { a: 1 });
  assert.match(fetch.last().url, /\/not\/wrapped\/$/);
  assert.equal(fetch.last().headers.get("authorization"), "Bearer token-123");

  await sasapay.waas.authorizedGet("/also/not/wrapped/", { page: 1 });
  assert.match(fetch.last().url, /\/api\/v2\/waas\/also\/not\/wrapped\/\?page=1$/);
});

test("amountNormalization none sends the value exactly as supplied", async () => {
  const { fetch, client: sasapay } = client([["/payments/", () => json({ status: true })]]);

  await sasapay.requestPayment({ Amount: 10 }, { amountNormalization: "none" });
  assert.equal(fetch.jsonBody().Amount, 10);
});

test("credentials are required unless a token provider is supplied", () => {
  assert.throws(() => new SasaPayClient({}), ConfigurationError);
});
