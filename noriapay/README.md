# `@norialabs/payments`

TypeScript SDK for **M-PESA Daraja**, **SasaPay**, **KCB Buni**, and **Paystack**.

Zero runtime dependencies. ESM. Node 20+.

```bash
npm install @norialabs/payments
```

The package is provider-first: each API gets a dedicated client with its own
payload names, rather than being forced into a lossy normalized abstraction. What
they share is the transport — OAuth token handling, retries, hooks, timeouts,
typed errors, and business-outcome detection.

---

## Contents

- [Scope](#scope)
- [Quick start](#quick-start)
- [Shared design](#shared-design)
  - [Business errors](#business-errors-the-important-one)
  - [Escape hatches](#escape-hatches)
  - [Endpoint overrides](#endpoint-overrides)
  - [Amounts](#amounts)
  - [Phone numbers](#phone-numbers)
  - [Timeouts and cancellation](#timeouts-and-cancellation)
  - [Retries](#retries)
  - [Hooks](#hooks)
  - [Token caching](#token-caching)
  - [Payload validation](#payload-validation)
  - [Environment configuration](#environment-configuration)
- [Errors](#errors)
- [M-PESA Daraja](#m-pesa-daraja)
- [SasaPay](#sasapay)
- [KCB Buni](#kcb-buni)
- [Paystack](#paystack)
- [Webhooks and callbacks](#webhooks-and-callbacks)
- [Upgrading from 0.1.3](#upgrading-from-013)

---

## Scope

| Provider | Endpoints | Auth | Callback verification |
| --- | --- | --- | --- |
| M-PESA Daraja | 29 | OAuth client credentials | Capability token only — Daraja does not sign |
| SasaPay | 61 (30 core + 31 WaaS) | OAuth client credentials | Capability token, optional HMAC, IP allowlist |
| KCB Buni | 9 | OAuth client credentials (form POST) | RSA-SHA256 signature, IP allowlist |
| Paystack | 164 | Secret key | HMAC-SHA512 signature, IP allowlist |

Everything not on that list is still reachable through the
[escape hatches](#escape-hatches).

---

## Quick start

### M-PESA STK push

```ts
import {
  MpesaClient,
  buildMpesaStkPassword,
  buildMpesaTimestamp,
} from "@norialabs/payments/mpesa";

const mpesa = MpesaClient.fromEnv({ throwOnBusinessError: true });

const timestamp = buildMpesaTimestamp();          // Africa/Nairobi, not the host clock
const response = await mpesa.stkPush({
  BusinessShortCode: "174379",
  Password: buildMpesaStkPassword({
    businessShortCode: "174379",
    passkey: process.env.MPESA_PASSKEY!,
    timestamp,
  }),
  Timestamp: timestamp,
  TransactionType: "CustomerPayBillOnline",
  Amount: 1500,
  PartyA: "0712345678",                            // normalized to 254712345678
  PartyB: "174379",
  PhoneNumber: "0712345678",
  CallBackURL: "https://example.com/mpesa/stk?token=SECRET",
  AccountReference: "INV-1042",
  TransactionDesc: "Invoice 1042",
});

console.log(response.CheckoutRequestID);
```

### SasaPay collection

```ts
import { SasaPayClient } from "@norialabs/payments/sasapay";

const sasapay = SasaPayClient.fromEnv({ throwOnBusinessError: true });

await sasapay.requestPayment({
  NetworkCode: "63902",
  Amount: 250,
  PhoneNumber: "0712345678",
  AccountReference: "INV-1042",
  TransactionDesc: "Invoice 1042",
  // MerchantCode, Currency and CallBackURL come from paymentDefaults
});
```

### KCB Buni M-PESA Express

```ts
import { KcbBuniClient } from "@norialabs/payments/kcb-buni";

const buni = KcbBuniClient.fromEnv();

await buni.mpesaStkPush(
  {
    phoneNumber: "0712345678",
    amount: "10",
    invoiceNumber: "INV-1042",
    sharedShortCode: true,
    orgShortCode: "",
    orgPassKey: "",
    callbackUrl: "https://example.com/buni/stk",
    transactionDescription: "Fees",
  },
  crypto.randomUUID(),
);
```

### Paystack checkout

```ts
import { PaystackClient } from "@norialabs/payments/paystack";

const paystack = PaystackClient.fromEnv({ throwOnBusinessError: true });

const { data } = await paystack.initializeTransaction({
  amount: 500_000,            // kobo
  email: "customer@example.com",
  callback_url: "https://example.com/paystack/return",
});

redirect(data!.authorization_url!);
```

---

## Shared design

### Business errors (the important one)

**Every provider here reports failure inside an HTTP 200 body.** A declined STK
push is `200 {"ResponseCode":"1"}`. A rejected SasaPay or Paystack call is
`200 {"status":false}`. A Buni failure is a non-zero `header.statusCode`. An
HTTP-level check alone treats all of these as success.

Set `throwOnBusinessError: true` and they become a typed `BusinessError`:

```ts
import { BusinessError } from "@norialabs/payments";

try {
  await mpesa.b2cPayment(payload);
} catch (error) {
  if (error instanceof BusinessError) {
    error.provider;      // "mpesa"
    error.statusCode;    // "1"
    error.responseBody;  // the untouched 200 body
  }
}
```

Off by default, so upgrading cannot change control flow underneath you. It can
also be set per call: `mpesa.b2cPayment(payload, { throwOnBusinessError: true })`.

If you would rather branch than catch, every client exposes the same reading as
static helpers, and they never throw:

```ts
MpesaClient.succeeded(response);       // true | false | undefined
MpesaClient.statusCode(response);      // "1"
MpesaClient.statusMessage(response);   // "The initiator information is invalid."
```

`succeeded()` returns `undefined` — never `false` — when it finds no marker it
recognizes, so an unfamiliar response shape is never reported as a failure.

### Escape hatches

No SDK tracks a payment API perfectly. Every client can reach any path on its
host, authenticated, without leaving the package:

```ts
await paystack.authorizedPost("/some/new/endpoint", { amount: 1000 });
await paystack.authorizedGet("/some/new/endpoint", { perPage: 50 });
await paystack.authorizedPut("/some/new/endpoint", { active: false });
await paystack.authorizedDelete("/some/new/endpoint");
await sasapay.waas.authorizedMultipartPost("/kyc/", { file: { content, filename } });
```

These take the same token handling, retries, hooks, timeouts and business-error
enforcement as the generated methods.

### Endpoint overrides

When a provider ships a path change ahead of this package, override it rather
than forking:

```ts
const mpesa = new MpesaClient({
  ...credentials,
  endpoints: { stkPush: "/mpesa/stkpush/v2/processrequest" },
});

mpesa.endpoint("stkPush");   // "/mpesa/stkpush/v2/processrequest"
```

Paystack overrides may also replace the verb: `{ verifyTransaction: ["POST", "/transaction/verify/{reference}"] }`.

The full maps are exported as `MPESA_ENDPOINTS`, `SASAPAY_ENDPOINTS`,
`SASAPAY_WAAS_ENDPOINTS`, `KCB_BUNI_ENDPOINTS` and `PAYSTACK_ENDPOINTS`.

### Amounts

`Amount` and `amount` are serialized to decimal strings, which is what every
provider here documents. The conversion is not `String(value)`:

```ts
amountToString(0.1 + 0.2);   // "0.3"    — not "0.30000000000000004"
amountToString(100.5);       // "100.5"
amountToString(1e21);        // "1000000000000000000000" — not "1e+21"
```

Both of those raw forms are rejected by providers. Values are rounded to 8
decimal places and trailing zeros dropped. Strings pass through untouched, so a
caller who has already formatted an amount stays in control.

For the handful of endpoints that reject a quoted number, opt out per call or per
client with `amountNormalization: "none"`.

### Phone numbers

Kenyan mobile numbers are rewritten to the `2547XXXXXXXX` / `2541XXXXXXXX` form
providers require, on the fields that carry them:

```ts
"0712345678"        → "254712345678"
"712345678"         → "254712345678"
"+254 712 345 678"  → "254712345678"
"0812345678"        → "0812345678"      // not a Kenyan mobile; left alone
```

Anything unrecognized is returned untouched rather than mangled.

### Timeouts and cancellation

`timeoutMs` is honoured whether or not you pass your own `AbortSignal` — the two
are combined, so a caller signal never silently disables the timeout, and a
timeout never ignores a caller who has already given up.

```ts
await paystack.listBanks(undefined, {
  timeoutMs: 5_000,
  signal: request.signal,
});
```

A timeout raises `TimeoutError`; your own abort propagates as your own
`AbortError`.

### Retries

Off by default. That is deliberate: replaying a payment `POST` without upstream
idempotency can charge a customer twice.

```ts
const paystack = new PaystackClient({
  secretKey,
  retry: {
    maxAttempts: 3,
    retryMethods: ["GET"],        // reads only
    retryOnStatuses: [429, 500, 502, 503, 504],
    retryOnNetworkError: true,
    baseDelayMs: 200,
    backoffMultiplier: 2,
    jitterMs: 100,                // de-synchronizes retries across workers
    maxDelayMs: 10_000,
    respectRetryAfter: true,      // default; a 429's Retry-After wins over backoff
  },
});
```

| Field | Description |
| --- | --- |
| `maxAttempts` | Total attempts, including the first. |
| `retryMethods` | Restrict to certain methods. Empty means all. |
| `retryOnStatuses` | Status codes that trigger a retry. |
| `retryOnNetworkError` | Retry `TimeoutError` and `NetworkError`. |
| `baseDelayMs` / `backoffMultiplier` / `maxDelayMs` | Exponential backoff bounds. |
| `jitterMs` | Upper bound of a random addition to each delay. |
| `respectRetryAfter` | Honour a `Retry-After` header over the computed delay. Default `true`. |
| `shouldRetry` | Final say, given attempt, status, error, and response. |
| `sleep` | Injectable delay, so tests do not wait in real time. |

Pass `retry: false` on a call to opt out of a client-level policy.

### Hooks

```ts
const mpesa = new MpesaClient({
  ...credentials,
  hooks: {
    beforeRequest: (ctx) => ctx.headers.set("x-correlation-id", correlationId),
    afterResponse: (ctx) => logger.info({ url: ctx.url, status: ctx.response.status }),
    onError: (ctx) => logger.error({ url: ctx.url, error: ctx.error }),
  },
});
```

Each accepts one function or an array. `beforeRequest` runs on every attempt and
can mutate headers.

### Token caching

Tokens are cached in-process by default, and concurrent callers share a single
authentication round trip. In a multi-worker or serverless deployment that still
means one authentication per process — enough to hit Daraja's OAuth rate limits.
Supply a `tokenStore` to share them:

```ts
import { MemoryTokenStore } from "@norialabs/payments";

const store = {
  get: (key) => redis.get(key),
  set: (key, value, ttlSeconds) => redis.set(key, value, "EX", ttlSeconds),
  delete: (key) => redis.del(key),
};

const mpesa = MpesaClient.fromEnv({ tokenStore: store });
```

Any object with `get`/`set`/`delete` works; `MemoryTokenStore` is provided for
tests and single-process use.

### Payload validation

Where a provider publishes machine-readable field constraints, they are checked
before the request leaves — currently KCB Buni's two OpenAPI-documented endpoints:

```ts
import { ValidationError } from "@norialabs/payments";

try {
  await buni.mpesaStkPush(payload, messageId);
} catch (error) {
  if (error instanceof ValidationError) {
    error.errors; // ["[transactionDescription] must not exceed 13 characters, got 20."]
  }
}
```

Turn it off with `validate: false`, per client or per call. The rule sets are
exported (`KCB_BUNI_MPESA_STK_PUSH_RULES`, `KCB_BUNI_FUNDS_TRANSFER_RULES`) and
`assertFields()` / `validateFields()` will run your own.

### Environment configuration

Every client has a `fromEnv()` that reads a prefixed variable set. The prefix is
configurable, and every value can be overridden in code.

```ts
MpesaClient.fromEnv();                                   // MPESA_*
MpesaClient.fromEnv({ prefix: "MPESA_PAYOUT_" });        // a second application
MpesaClient.fromEnv({ env: myConfigObject });            // not process.env
```

| Provider | Variables |
| --- | --- |
| M-PESA | `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_ENVIRONMENT`, `MPESA_BASE_URL`, `MPESA_TIMEOUT_SECONDS`, `MPESA_TOKEN_CACHE_SKEW_SECONDS`, `MPESA_B2C_VERSION`, `MPESA_THROW_ON_BUSINESS_ERROR` |
| SasaPay | `SASAPAY_CLIENT_ID`, `SASAPAY_CLIENT_SECRET`, `SASAPAY_ENVIRONMENT`, `SASAPAY_BASE_URL`, `SASAPAY_WAAS_BASE_URL`, `SASAPAY_TOKEN_URL`, `SASAPAY_WAAS_TOKEN_URL`, `SASAPAY_WAAS_CLIENT_ID`, `SASAPAY_WAAS_CLIENT_SECRET`, `SASAPAY_TIMEOUT_SECONDS`, `SASAPAY_TOKEN_CACHE_SKEW_SECONDS`, `SASAPAY_THROW_ON_BUSINESS_ERROR`, `SASAPAY_MERCHANT_CODE`, `SASAPAY_CURRENCY`, `SASAPAY_CALLBACK_URL`, `SASAPAY_WAAS_MERCHANT_CODE`, `SASAPAY_WAAS_CURRENCY_CODE`, `SASAPAY_WAAS_CALLBACK_URL` |
| KCB Buni | `KCB_BUNI_CONSUMER_KEY`, `KCB_BUNI_CONSUMER_SECRET`, `KCB_BUNI_ENVIRONMENT`, `KCB_BUNI_BASE_URL`, `KCB_BUNI_TOKEN_URL`, `KCB_BUNI_TOKEN_PATH`, `KCB_BUNI_API_KEY`, `KCB_BUNI_TIMEOUT_SECONDS`, `KCB_BUNI_TOKEN_CACHE_SKEW_SECONDS`, `KCB_BUNI_VALIDATE_PAYLOADS`, `KCB_BUNI_THROW_ON_BUSINESS_ERROR`, `KCB_BUNI_MPESA_ROUTE_CODE`, `KCB_BUNI_MPESA_OPERATION` |
| Paystack | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_BASE_URL`, `PAYSTACK_TIMEOUT_SECONDS`, `PAYSTACK_THROW_ON_BUSINESS_ERROR` |

`*_TIMEOUT_SECONDS` and `*_TOKEN_CACHE_SKEW_SECONDS` are read in **seconds** and
converted to milliseconds. All other options in this package take milliseconds
directly.

---

## Errors

All errors extend `NoriapayError` and carry a `.code`.

| Class | Code | Raised when |
| --- | --- | --- |
| `ConfigurationError` | `CONFIGURATION_ERROR` | Missing credentials, an unreadable certificate, an unguessable host. |
| `ValidationError` | `VALIDATION_ERROR` | A payload failed the provider's published field rules. Carries `.errors`. |
| `AuthenticationError` | `AUTHENTICATION_ERROR` | The token request failed, timed out, or returned no token. |
| `TimeoutError` | `TIMEOUT_ERROR` | The request exceeded `timeoutMs`. |
| `NetworkError` | `NETWORK_ERROR` | The request never reached the provider — DNS, TLS, connection reset. |
| `ApiError` | `API_ERROR` | A non-2xx response. Carries `.status` and `.responseBody`. |
| `BusinessError` | `BUSINESS_ERROR` | A 200 that reports failure. Carries `.provider`, `.statusCode`, `.responseBody`. |
| `WebhookVerificationError` | `WEBHOOK_VERIFICATION_ERROR` | An inbound callback failed verification. |

---

## M-PESA Daraja

```ts
import { MpesaClient } from "@norialabs/payments/mpesa";
```

Base URLs: `https://sandbox.safaricom.co.ke` and `https://api.safaricom.co.ke`.

### Helpers

#### `buildMpesaTimestamp(date?, timeZone?)`

`YYYYMMDDHHMMSS` in **`Africa/Nairobi`** by default. This is not cosmetic: Daraja
validates the STK password against East Africa Time, so a container running in
UTC signs every push three hours out of date and every one is rejected.

#### `buildMpesaStkPassword({ businessShortCode, passkey, timestamp })`

Base64 of the three concatenated.

#### `buildMpesaSecurityCredential({ initiatorPassword, certificate })`

Builds the `SecurityCredential` that B2C, B2B, reversal, transaction status and
account balance all require, following Daraja's published algorithm: write the
unencrypted initiator password to a byte array, encrypt it with the M-PESA X.509
certificate using RSA with PKCS #1 v1.5 padding (not OAEP), then base64 the
ciphertext.

```ts
import { readFileSync } from "node:fs";

const securityCredential = buildMpesaSecurityCredential({
  initiatorPassword: process.env.MPESA_INITIATOR_PASSWORD!,
  certificate: readFileSync("./ProductionCertificate.cer", "utf8"),
});
```

Sandbox and production use different certificates, both downloadable from the
Daraja portal. The wrong one fails at Safaricom as a locked credential, not as a
decode error here.

### Methods

| Method | Endpoint |
| --- | --- |
| `stkPush()` | `POST /mpesa/stkpush/v1/processrequest` |
| `stkPushQuery()` | `POST /mpesa/stkpushquery/v1/query` |
| `registerC2BUrls(payload, version?)` | `POST /mpesa/c2b/{v1\|v2}/registerurl` |
| `registerC2BUrlsV1()` | `POST /mpesa/c2b/v1/registerurl` |
| `c2bSimulate()` | `POST /mpesa/c2b/v1/simulate` (sandbox only) |
| `b2cPayment()` | `POST /mpesa/b2c/{v1\|v3}/paymentrequest` |
| `b2cPaymentV3()` | `POST /mpesa/b2c/v3/paymentrequest` |
| `b2bPayment()` | `POST /mpesa/b2b/v1/paymentrequest` |
| `b2cAccountTopUp()` | `POST /mpesa/b2b/v1/paymentrequest` with `BusinessPayToBulk` |
| `businessPayBill()` | `POST /mpesa/b2b/v1/paymentrequest` with `BusinessPayBill` |
| `businessBuyGoods()` | `POST /mpesa/b2b/v1/paymentrequest` with `BusinessBuyGoods` |
| `b2bExpressCheckout()` | `POST /v1/ussdpush/get-msisdn` |
| `taxRemittance()` | `POST /mpesa/b2b/v1/remittax` |
| `reversal()` | `POST /mpesa/reversal/v1/request` |
| `transactionStatus()` | `POST /mpesa/transactionstatus/v1/query` |
| `accountBalance()` | `POST /mpesa/accountbalance/v1/query` |
| `generateQrCode()` | `POST /mpesa/qrcode/v1/generate` |
| `ratibaStandingOrder()` | `POST /standingorder/v1/createStandingOrderExternal` |
| `registerPullTransactions()` | `POST /pulltransactions/v1/register` |
| `pullTransactions()` | `POST /pulltransactions/v1/query` |
| `billManagerOptIn()` | `POST /v1/billmanager-invoice/optin` |
| `billManagerSingleInvoice()` | `POST /v1/billmanager-invoice/single-invoicing` |
| `billManagerBulkInvoicing()` | `POST /v1/billmanager-invoice/bulk-invoicing` |
| `billManagerReconciliation()` | `POST /v1/billmanager-invoice/reconciliation` |
| `billManagerCancelSingleInvoice()` | `POST /v1/billmanager-invoice/cancel-single-invoice` |
| `billManagerCancelBulkInvoice()` | `POST /v1/billmanager-invoice/cancel-bulk-invoice` |
| `billManagerUpdateOnboardingDetails()` | `POST /v1/billmanager-invoice/change-optin-details` |
| `billManagerUpdateSingleInvoice()` | `POST /v1/billmanager-invoice/change-invoice` |
| `billManagerUpdateBulkInvoice()` | `POST /v1/billmanager-invoice/change-invoices` |

Bill Manager, Ratiba and pull-transaction payloads are typed as `JsonObject`
rather than guessed at: Daraja documents these on the portal with per-merchant
field sets, and inventing a shape here would be worse than admitting it.

### Callback types

`MpesaStkCallback`, `MpesaResultCallback` and `MpesaC2BCallback` describe the
three inbound shapes Daraja posts to `CallBackURL`, `ResultURL` and a registered
C2B URL.

---

## SasaPay

```ts
import { SasaPayClient } from "@norialabs/payments/sasapay";
```

Sandbox is `https://sandbox.sasapay.app/api/v1`, with WaaS on
`.../api/v2/waas`.

Each surface authenticates on **its own** path, both `GET` with HTTP Basic and
`grant_type` in the query string:

| Surface | Token endpoint | Docs |
| --- | --- | --- |
| Core | `GET {baseUrl}/auth/token/?grant_type=client_credentials` | [authentication](https://developer.sasapay.app/docs/apis/authentication) |
| WaaS | `GET {waasBaseUrl}/auth/token/?grant_type=client_credentials` | [waas/authentication](https://developer.sasapay.app/docs/apis/waas/authentication) |

The two responses differ: the core one reports success as `status: true` with
`detail` and `scope`, the WaaS one as `statusCode: 0`. Both are read correctly.

> **Production hosts are not published by SasaPay.** The defaults
> (`https://api.sasapay.app/...`) were established by probing the live hosts.
> Override `baseUrl` / `waasBaseUrl` if SasaPay issued your application a
> different one.

### Payment defaults

`MerchantCode`, `Currency` and `CallBackURL` are identical on every call. Set
them once:

```ts
const sasapay = new SasaPayClient({
  clientId, clientSecret,
  paymentDefaults: {
    MerchantCode: "600000",
    Currency: "KES",
    CallBackURL: "https://example.com/sasapay?token=SECRET",
  },
});
```

They fill only keys the caller left out. WaaS has its own
`waasPaymentDefaults` (`merchantCode`, `currencyCode`, `callbackUrl`); the
onboarding and KYC calls deliberately exclude the fields SasaPay rejects there.

### Core methods (30)

| Group | Methods |
| --- | --- |
| Collections | `requestPayment()`, `processPayment()`, `cardPayment()`, `preApprovedPayment()`, `lipaFare()` |
| Payouts | `b2cPayment()`, `b2bPayment()`, `businessToBeneficiary()`, `remittancePayment()`, `bulkPayment()`, `bulkPaymentStatus()`, `internalFundMovement()` |
| Queries | `accountValidation()`, `transactionStatus()`, `transactionStatusQuery()`, `requestPaymentStatus()`, `verifyTransaction()`, `merchantBalance()`, `transactions()` |
| Utilities | `utilityPayment()`, `utilityBillQuery()`, `registerIpnUrl()`, `channelCodes()` |
| Onboarding | `merchantOnboarding()`, `availableBillNumber()`, `dealerBusinessTypes()`, `dealerCountries()`, `dealerSubCounties()`, `dealerIndustries()` |

`transactionStatus()` answers synchronously; `transactionStatusQuery()` is the
documented one that answers on your callback URL.

### Wallet-as-a-Service (31)

WaaS runs on its own host with its own credentials, reached through
`sasapay.waas`:

```ts
const sasapay = new SasaPayClient({
  clientId, clientSecret,
  waasClientId, waasClientSecret,   // optional; falls back to the main pair
});

await sasapay.waas.personalOnboarding({ ... });
await sasapay.waas.sendMoney({ ... });
```

| Group | Methods |
| --- | --- |
| Onboarding | `personalOnboarding()`, `confirmPersonalOnboarding()`, `personalKyc()`, `businessOnboarding()`, `confirmBusinessOnboarding()`, `businessKyc()` |
| Customers | `customers()`, `customerDetails()`, `updateCustomerDetails()`, `createSubWallet()` |
| Payments | `requestPayment()`, `processPayment()`, `merchantTransfer()`, `sendMoney()`, `payBill()`, `utilityPayment()` |
| Queries | `transactions()`, `transactionStatus()`, `verifyTransaction()`, `merchantBalance()` |
| Reference | `channelCodes()`, `countries()`, `countrySubRegions()`, `industries()`, `subIndustries()`, `businessTypes()`, `products()`, `nearestAgents()` |

KYC accepts documents and switches to `multipart/form-data` automatically:

```ts
await sasapay.waas.personalKyc(
  { customerId: "C-1" },
  {
    idFront: {
      filename: "id-front.jpg",
      contentType: "image/jpeg",
      content: await readFile("./id-front.jpg"),
    },
  },
);
```

Omit the second argument and the same call sends JSON.

---

## KCB Buni

```ts
import { KcbBuniClient } from "@norialabs/payments/kcb-buni";
```

UAT is `https://uat.buni.kcbgroup.com`. Buni's token endpoint is a
**form POST**, unlike Daraja's and SasaPay's GET; that is handled for you.

> **Production requires an explicit `baseUrl`.** KCB does not publish a
> production Buni host, and the implementations that guess do not agree on what
> it is. This client refuses to guess — use the host KCB issued for your
> integration.

Some gateways also require an `apikey` header; set `apiKey` and it is sent on
every request.

| Method | Endpoint |
| --- | --- |
| `mpesaStkPush(payload, messageId, options?, routeCode?)` | `POST /mm/api/request/1.0.0/stkpush` |
| `transferFunds()` | `POST /fundstransfer/1.0.0/api/v1/transfer` |
| `queryCoreTransactionStatus()` | `POST /v1/core/t24/querytransaction/1.0.0/api/transactioninfo` |
| `queryTransactionDetails(identifier)` | `GET /kcb/transaction/query/1.0.0/api/v1/payment/query/{identifier}` |
| `vendingValidateRequest()` | `POST /kcb/vendingGateway/v1/1.0.0/api/validate-request` |
| `vendingVendorConfirmation()` | `POST /kcb/vendingGateway/v1/1.0.0/api/vendor-confirmation` |
| `vendingTransactionStatus()` | `POST /kcb/vendingGateway/v1/1.0.0/api/query/transaction-status` |
| `etimsRequest(path, payload?, method?, query?)` | `* /kcb/ke/kra/etims/1.0.0/{path}` |
| `p2pTransferStatusInquiry(payload, path?)` | `POST /kcb/bi/ips/p2p/transfer/status/inquiry/1.0.0/{path}` |

eTIMS and P2P are wildcard resources with no published schema; the operation path
and body come from the integration pack KCB issues.

`mpesaStkPush()` requires a `routeCode`, which KCB assigns per integration. Set
it once as `mpesaExpress.routeCode` or pass it per call. Both the headers and the
body are checked against the OpenAPI field rules before sending.

A Buni M-PESA Express reply carries **two independent verdicts** —
`header.statusCode` from the gateway and `response.ResponseCode` from Safaricom.
Both must be zero, and `succeeded()` enforces that.

---

## Paystack

```ts
import { PaystackClient } from "@norialabs/payments/paystack";
```

Authenticated with your secret key; `publicKey` is carried for the front end and
never sent. All 164 documented endpoints are wrapped, each verified against its
documented method and path.


<details>
<summary><code>/transaction</code> — 9</summary>

| Method | Endpoint |
| --- | --- |
| `initializeTransaction()` | `POST /transaction/initialize` |
| `chargeAuthorization()` | `POST /transaction/charge_authorization` |
| `partialDebit()` | `POST /transaction/partial_debit` |
| `verifyTransaction()` | `GET /transaction/verify/{reference}` |
| `listTransactions()` | `GET /transaction` |
| `fetchTransaction()` | `GET /transaction/{id}` |
| `transactionTimeline()` | `GET /transaction/timeline/{id}` |
| `transactionTotals()` | `GET /transaction/totals` |
| `exportTransactions()` | `GET /transaction/export` |

</details>

<details>
<summary><code>/charge</code> — 7</summary>

| Method | Endpoint |
| --- | --- |
| `createCharge()` | `POST /charge` |
| `submitChargePin()` | `POST /charge/submit_pin` |
| `submitChargeOtp()` | `POST /charge/submit_otp` |
| `submitChargePhone()` | `POST /charge/submit_phone` |
| `submitChargeBirthday()` | `POST /charge/submit_birthday` |
| `submitChargeAddress()` | `POST /charge/submit_address` |
| `checkPendingCharge()` | `GET /charge/{reference}` |

</details>

<details>
<summary><code>/capitec-pay</code> — 1</summary>

| Method | Endpoint |
| --- | --- |
| `requeryCapitecPayCharge()` | `POST /capitec-pay/requery/{ref}` |

</details>

<details>
<summary><code>/bulkcharge</code> — 6</summary>

| Method | Endpoint |
| --- | --- |
| `initiateBulkCharge()` | `POST /bulkcharge` |
| `listBulkChargeBatches()` | `GET /bulkcharge` |
| `fetchBulkChargeBatch()` | `GET /bulkcharge/{code}` |
| `fetchBulkChargeBatchCharges()` | `GET /bulkcharge/{code}/charges` |
| `pauseBulkChargeBatch()` | `GET /bulkcharge/pause/{code}` |
| `resumeBulkChargeBatch()` | `GET /bulkcharge/resume/{code}` |

</details>

<details>
<summary><code>/subaccount</code> — 4</summary>

| Method | Endpoint |
| --- | --- |
| `createSubaccount()` | `POST /subaccount` |
| `listSubaccounts()` | `GET /subaccount` |
| `fetchSubaccount()` | `GET /subaccount/{code}` |
| `updateSubaccount()` | `PUT /subaccount/{code}` |

</details>

<details>
<summary><code>/split</code> — 6</summary>

| Method | Endpoint |
| --- | --- |
| `createSplit()` | `POST /split` |
| `listSplits()` | `GET /split` |
| `fetchSplit()` | `GET /split/{id}` |
| `updateSplit()` | `PUT /split/{id}` |
| `addSubaccountToSplit()` | `POST /split/{id}/subaccount/add` |
| `removeSubaccountFromSplit()` | `POST /split/{id}/subaccount/remove` |

</details>

<details>
<summary><code>/terminal</code> — 8</summary>

| Method | Endpoint |
| --- | --- |
| `sendTerminalEvent()` | `POST /terminal/{id}/event` |
| `fetchTerminalEventStatus()` | `GET /terminal/{terminal_id}/event/{event_id}` |
| `fetchTerminalStatus()` | `GET /terminal/{terminal_id}/presence` |
| `listTerminals()` | `GET /terminal` |
| `fetchTerminal()` | `GET /terminal/{terminal_id}` |
| `updateTerminal()` | `PUT /terminal/{terminal_id}` |
| `commissionTerminal()` | `POST /terminal/commission_device` |
| `decommissionTerminal()` | `POST /terminal/decommission_device` |

</details>

<details>
<summary><code>/virtual_terminal</code> — 9</summary>

| Method | Endpoint |
| --- | --- |
| `createVirtualTerminal()` | `POST /virtual_terminal` |
| `listVirtualTerminals()` | `GET /virtual_terminal` |
| `fetchVirtualTerminal()` | `GET /virtual_terminal/{code}` |
| `updateVirtualTerminal()` | `PUT /virtual_terminal/{code}` |
| `deactivateVirtualTerminal()` | `PUT /virtual_terminal/{code}/deactivate` |
| `assignVirtualTerminalDestination()` | `POST /virtual_terminal/{code}/destination/assign` |
| `unassignVirtualTerminalDestination()` | `POST /virtual_terminal/{code}/destination/unassign` |
| `addVirtualTerminalSplitCode()` | `PUT /virtual_terminal/{code}/split_code` |
| `removeVirtualTerminalSplitCode()` | `DELETE /virtual_terminal/{code}/split_code` |

</details>

<details>
<summary><code>/customer</code> — 12</summary>

| Method | Endpoint |
| --- | --- |
| `createCustomer()` | `POST /customer` |
| `listCustomers()` | `GET /customer` |
| `fetchCustomer()` | `GET /customer/{code}` |
| `updateCustomer()` | `PUT /customer/{code}` |
| `setCustomerRiskAction()` | `POST /customer/set_risk_action` |
| `validateCustomer()` | `POST /customer/{code}/identification` |
| `initializeAuthorization()` | `POST /customer/authorization/initialize` |
| `verifyAuthorization()` | `GET /customer/authorization/verify/{reference}` |
| `deactivateAuthorization()` | `POST /customer/authorization/deactivate` |
| `initializeDirectDebit()` | `POST /customer/{id}/initialize-direct-debit` |
| `customerDirectDebitActivationCharge()` | `PUT /customer/{id}/directdebit-activation-charge` |
| `customerDirectDebitMandateAuthorizations()` | `GET /customer/{id}/directdebit-mandate-authorizations` |

</details>

<details>
<summary><code>/directdebit</code> — 2</summary>

| Method | Endpoint |
| --- | --- |
| `triggerDirectDebitActivationCharge()` | `PUT /directdebit/activation-charge` |
| `listDirectDebitMandateAuthorizations()` | `GET /directdebit/mandate-authorizations` |

</details>

<details>
<summary><code>/dedicated_account</code> — 9</summary>

| Method | Endpoint |
| --- | --- |
| `createDedicatedAccount()` | `POST /dedicated_account` |
| `listDedicatedAccounts()` | `GET /dedicated_account` |
| `assignDedicatedAccount()` | `POST /dedicated_account/assign` |
| `fetchDedicatedAccount()` | `GET /dedicated_account/{id}` |
| `deactivateDedicatedAccount()` | `DELETE /dedicated_account/{id}` |
| `requeryDedicatedAccount()` | `GET /dedicated_account/requery` |
| `splitDedicatedAccountTransaction()` | `POST /dedicated_account/split` |
| `removeSplitFromDedicatedAccount()` | `DELETE /dedicated_account/split` |
| `fetchDedicatedAccountProviders()` | `GET /dedicated_account/available_providers` |

</details>

<details>
<summary><code>/apple-pay</code> — 3</summary>

| Method | Endpoint |
| --- | --- |
| `registerApplePayDomain()` | `POST /apple-pay/domain` |
| `listApplePayDomains()` | `GET /apple-pay/domain` |
| `unregisterApplePayDomain()` | `DELETE /apple-pay/domain` |

</details>

<details>
<summary><code>/plan</code> — 4</summary>

| Method | Endpoint |
| --- | --- |
| `createPlan()` | `POST /plan` |
| `listPlans()` | `GET /plan` |
| `fetchPlan()` | `GET /plan/{code}` |
| `updatePlan()` | `PUT /plan/{code}` |

</details>

<details>
<summary><code>/subscription</code> — 7</summary>

| Method | Endpoint |
| --- | --- |
| `createSubscription()` | `POST /subscription` |
| `listSubscriptions()` | `GET /subscription` |
| `fetchSubscription()` | `GET /subscription/{code}` |
| `disableSubscription()` | `POST /subscription/disable` |
| `enableSubscription()` | `POST /subscription/enable` |
| `subscriptionManagementLink()` | `GET /subscription/{code}/manage/link` |
| `sendSubscriptionManagementEmail()` | `POST /subscription/{code}/manage/email` |

</details>

<details>
<summary><code>/transferrecipient</code> — 6</summary>

| Method | Endpoint |
| --- | --- |
| `createTransferRecipient()` | `POST /transferrecipient` |
| `listTransferRecipients()` | `GET /transferrecipient` |
| `bulkCreateTransferRecipients()` | `POST /transferrecipient/bulk` |
| `fetchTransferRecipient()` | `GET /transferrecipient/{code}` |
| `updateTransferRecipient()` | `PUT /transferrecipient/{code}` |
| `deleteTransferRecipient()` | `DELETE /transferrecipient/{code}` |

</details>

<details>
<summary><code>/transfer</code> — 11</summary>

| Method | Endpoint |
| --- | --- |
| `initiateTransfer()` | `POST /transfer` |
| `listTransfers()` | `GET /transfer` |
| `finalizeTransfer()` | `POST /transfer/finalize_transfer` |
| `initiateBulkTransfer()` | `POST /transfer/bulk` |
| `fetchTransfer()` | `GET /transfer/{code}` |
| `verifyTransfer()` | `GET /transfer/verify/{reference}` |
| `exportTransfers()` | `GET /transfer/export` |
| `resendTransferOtp()` | `POST /transfer/resend_otp` |
| `disableTransferOtp()` | `POST /transfer/disable_otp` |
| `finalizeDisableTransferOtp()` | `POST /transfer/disable_otp_finalize` |
| `enableTransferOtp()` | `POST /transfer/enable_otp` |

</details>

<details>
<summary><code>/balance</code> — 2</summary>

| Method | Endpoint |
| --- | --- |
| `balance()` | `GET /balance` |
| `balanceLedger()` | `GET /balance/ledger` |

</details>

<details>
<summary><code>/paymentrequest</code> — 9</summary>

| Method | Endpoint |
| --- | --- |
| `createPaymentRequest()` | `POST /paymentrequest` |
| `listPaymentRequests()` | `GET /paymentrequest` |
| `fetchPaymentRequest()` | `GET /paymentrequest/{id}` |
| `updatePaymentRequest()` | `PUT /paymentrequest/{id}` |
| `verifyPaymentRequest()` | `GET /paymentrequest/verify/{id}` |
| `notifyPaymentRequest()` | `POST /paymentrequest/notify/{id}` |
| `paymentRequestTotals()` | `GET /paymentrequest/totals` |
| `finalizePaymentRequest()` | `POST /paymentrequest/finalize/{id}` |
| `archivePaymentRequest()` | `POST /paymentrequest/archive/{id}` |

</details>

<details>
<summary><code>/product</code> — 5</summary>

| Method | Endpoint |
| --- | --- |
| `createProduct()` | `POST /product` |
| `listProducts()` | `GET /product` |
| `fetchProduct()` | `GET /product/{id}` |
| `updateProduct()` | `PUT /product/{id}` |
| `deleteProduct()` | `DELETE /product/{id}` |

</details>

<details>
<summary><code>/storefront</code> — 11</summary>

| Method | Endpoint |
| --- | --- |
| `createStorefront()` | `POST /storefront` |
| `listStorefronts()` | `GET /storefront` |
| `fetchStorefront()` | `GET /storefront/{id}` |
| `updateStorefront()` | `PUT /storefront/{id}` |
| `deleteStorefront()` | `DELETE /storefront/{id}` |
| `verifyStorefront()` | `GET /storefront/verify/{slug}` |
| `listStorefrontOrders()` | `GET /storefront/{id}/order` |
| `addStorefrontProducts()` | `POST /storefront/{id}/product` |
| `listStorefrontProducts()` | `GET /storefront/{id}/product` |
| `publishStorefront()` | `POST /storefront/{id}/publish` |
| `duplicateStorefront()` | `POST /storefront/{id}/duplicate` |

</details>

<details>
<summary><code>/order</code> — 5</summary>

| Method | Endpoint |
| --- | --- |
| `createOrder()` | `POST /order` |
| `listOrders()` | `GET /order` |
| `fetchOrder()` | `GET /order/{id}` |
| `listProductOrders()` | `GET /order/product/{id}` |
| `validateOrder()` | `GET /order/{code}/validate` |

</details>

<details>
<summary><code>/page</code> — 6</summary>

| Method | Endpoint |
| --- | --- |
| `createPage()` | `POST /page` |
| `listPages()` | `GET /page` |
| `fetchPage()` | `GET /page/{id}` |
| `updatePage()` | `PUT /page/{id}` |
| `checkSlugAvailability()` | `GET /page/check_slug_availability/{slug}` |
| `addProductsToPage()` | `POST /page/{id}/product` |

</details>

<details>
<summary><code>/settlement</code> — 2</summary>

| Method | Endpoint |
| --- | --- |
| `listSettlements()` | `GET /settlement` |
| `listSettlementTransactions()` | `GET /settlement/{id}/transactions` |

</details>

<details>
<summary><code>/integration</code> — 2</summary>

| Method | Endpoint |
| --- | --- |
| `fetchPaymentSessionTimeout()` | `GET /integration/payment_session_timeout` |
| `updatePaymentSessionTimeout()` | `PUT /integration/payment_session_timeout` |

</details>

<details>
<summary><code>/refund</code> — 4</summary>

| Method | Endpoint |
| --- | --- |
| `createRefund()` | `POST /refund` |
| `listRefunds()` | `GET /refund` |
| `retryRefundWithCustomerDetails()` | `POST /refund/retry_with_customer_details/{id}` |
| `fetchRefund()` | `GET /refund/{id}` |

</details>

<details>
<summary><code>/dispute</code> — 8</summary>

| Method | Endpoint |
| --- | --- |
| `listDisputes()` | `GET /dispute` |
| `fetchDispute()` | `GET /dispute/{id}` |
| `updateDispute()` | `PUT /dispute/{id}` |
| `disputeUploadUrl()` | `GET /dispute/{id}/upload_url` |
| `exportDisputes()` | `GET /dispute/export` |
| `transactionDisputes()` | `GET /dispute/transaction/{id}` |
| `resolveDispute()` | `PUT /dispute/{id}/resolve` |
| `addDisputeEvidence()` | `POST /dispute/{id}/evidence` |

</details>

<details>
<summary><code>/bank</code> — 3</summary>

| Method | Endpoint |
| --- | --- |
| `listBanks()` | `GET /bank` |
| `resolveBankAccount()` | `GET /bank/resolve` |
| `validateBankAccount()` | `POST /bank/validate` |

</details>

<details>
<summary><code>/decision</code> — 1</summary>

| Method | Endpoint |
| --- | --- |
| `resolveCardBin()` | `GET /decision/bin/{bin}` |

</details>

<details>
<summary><code>/country</code> — 1</summary>

| Method | Endpoint |
| --- | --- |
| `listCountries()` | `GET /country` |

</details>

<details>
<summary><code>/address_verification</code> — 1</summary>

| Method | Endpoint |
| --- | --- |
| `listAddressVerificationStates()` | `GET /address_verification/states` |

</details>

Path parameters are URL-encoded; list endpoints take `perPage`, `page` and their
own filters as the argument after any path parameters.

```ts
await paystack.listTransactions({ perPage: 50, page: 2, status: "success" });
await paystack.fetchBulkChargeBatchCharges("BCH_xyz", { perPage: 100 });
await paystack.updateSubaccount("ACCT_xyz", { active: false });
```

---

## Webhooks and callbacks

Inbound verification differs sharply by provider, and this section is explicit
about which controls are the provider's and which are yours. **Verify against the
raw bytes as received** — re-serializing a parsed body changes key order and
whitespace, and no signature will match.

### Paystack — signed

HMAC-SHA512 of the raw body, keyed with your secret key, in
`x-paystack-signature`. Compared in constant time.

```ts
import { requirePaystackSignature, requireSourceIp, PAYSTACK_WEBHOOK_IPS } from "@norialabs/payments/webhooks";

app.post("/paystack", express.raw({ type: "application/json" }), (req, res) => {
  requireSourceIp(req.ip, PAYSTACK_WEBHOOK_IPS);           // optional
  requirePaystackSignature(req.body, req.get("x-paystack-signature"), secretKey);

  const event = JSON.parse(req.body.toString("utf8"));
  res.sendStatus(200);
});
```

### KCB Buni — signed

RSA-SHA256 over the raw body, base64, in the `Signature` header, verified with
the public key KCB issues for your integration.

```ts
import {
  requireKcbBuniIpn,
  detectKcbBuniIpnKind,
  kcbBuniTillAcknowledgement,
  kcbBuniAccountAcknowledgement,
  kcbBuniValidationResponse,
} from "@norialabs/payments/kcb-buni";

app.post("/buni/ipn", express.raw({ type: "*/*" }), (req, res) => {
  const payload = JSON.parse(req.body.toString("utf8"));
  const kind = detectKcbBuniIpnKind(payload);   // "till" | "account" | "validation"

  requireKcbBuniIpn(
    { rawBody: req.body, signature: req.get("Signature"), sourceIp: req.ip },
    {
      publicKey: process.env.KCB_BUNI_IPN_PUBLIC_KEY,
      // /validation is the one unsigned route
      verifySignature: kind !== "validation",
      trustedIps: ["196.216.0.0/16"],
      enforceIpAllowlist: true,
    },
  );

  res.json(
    kind === "till"
      ? kcbBuniTillAcknowledgement(payload, transactionId)
      : kind === "validation"
        ? kcbBuniValidationResponse(transactionId, { CustomerName: "JOHN DOE", billAmount: "250" })
        : kcbBuniAccountAcknowledgement(transactionId),
  );
});
```

Each envelope expects its own acknowledgement shape, and the till one must echo
the inbound `messageID` and `originatorConversationID`. `kcbBuniRejection()`
builds a non-zero response in whichever shape arrived.

Note that the **M-PESA Express `callbackUrl` is not an IPN** — it receives a
Daraja-shaped STK result with no `Signature` header, so this verifier must not be
applied to that route.

### SasaPay — nothing published

**SasaPay publishes no signature, HMAC, checksum, token or IP allowlist** for the
C2B callback, the IPN, the B2C/B2B result callback or the status-query callback.
Searching the documentation for `signature`, `hmac`, `sha256` and `checksum`
returns nothing.

The control this package recommends is a **capability token of your own**.
`CallBackURL` is supplied per request, so append a secret at initiation and check
it on receipt:

```ts
import { requireSasaPayCallback } from "@norialabs/payments/sasapay";

// when initiating
await sasapay.requestPayment({
  CallBackURL: `https://example.com/sasapay?token=${process.env.SASAPAY_CALLBACK_TOKEN}`,
  ...
});

// when receiving
requireSasaPayCallback(
  { payload: req.body, token: req.query.token, sourceIp: req.ip },
  { expectedToken: process.env.SASAPAY_CALLBACK_TOKEN_SHA256 },
);
```

`expectedToken` accepts the token or its SHA-256 hex digest, so the plaintext
need not sit in config. Comparison is constant-time.

What it buys: the caller knew a secret you only ever sent to SasaPay, which stops
anyone who merely learned the callback URL. What it does not: it authenticates
the *caller*, not the *body*. A token leaked through a log or a proxy is enough
to forge a settlement. Keep it out of logs, rotate it if a callback URL is ever
exposed, and confirm with `transactionStatus()` before releasing goods.

An HMAC-SHA512 scheme over `code-merchant-account-reference-amount` is also
provided for parity with the sibling Laravel SDK and for accounts SasaPay has
separately issued it to. **Do not enable it speculatively** — against an account
that never signs anything it rejects every legitimate callback.

`verifySasaPayCallback()` reports which control passed, and returns
`{ verified: false, reason: "unsupported" }` when nothing is configured, so a
handler can store the callback and refuse to settle rather than treat an
unauthenticated request as genuine.

SasaPay's callbacks also name the same value differently across products.
`sasaPayCallbackValue()` reads a canonical field through every known alias:

```ts
import { sasaPayCallbackValue } from "@norialabs/payments/sasapay";

sasaPayCallbackValue(payload, "sasapayTransactionCode");  // TransactionCode | TransID | SasaPayTransactionCode
sasaPayCallbackValue(payload, "accountNumber");           // MSISDN | CustomerMobile | RecipientAccountNumber | ...
sasaPayCallbackValue(payload, "paymentReference");        // BillRefNumber | InvoiceNumber | MerchantRequestID | ...
```

### M-PESA — nothing published

Safaricom signs nothing and publishes no fixed source-IP list for Daraja
callbacks. The same capability-token pattern applies:

```ts
import { requireMpesaCallbackToken } from "@norialabs/payments/webhooks";

await mpesa.stkPush({ CallBackURL: `https://example.com/mpesa?token=${token}`, ... });

requireMpesaCallbackToken(req.query.token, token);
```

Then confirm the outcome with `transactionStatus()` before releasing goods. That
confirmation, not the callback, is what settles a payment.

### IP allowlists

`verifySourceIp()` and every provider's IP check accept exact addresses **and
CIDR blocks**, in IPv4 and IPv6, plus `*`:

```ts
verifySourceIp(req.ip, ["52.31.139.0/24", "2001:db8::/32", "52.49.173.169"]);
```

Behind a proxy or load balancer, make sure `req.ip` is the real client address
before enforcing an allowlist — trust your proxy configuration first, or the
check either passes for everyone or nobody.

---

## Upgrading from 0.1.3

The 0.1.3 surface still compiles. Three behaviours changed, all of them fixes,
so read these before upgrading even though the version bump is a patch:

| Change | Why |
| --- | --- |
| `*_TIMEOUT_SECONDS` is now read as seconds. | It was being applied as milliseconds, so `MPESA_TIMEOUT_SECONDS=30` gave a 30 ms budget and every live call failed. If you compensated by setting a large number, divide it by 1000. |
| `timeoutMs` now applies when you pass an `AbortSignal`. | It was silently ignored. Calls that quietly ran unbounded will now time out as configured. |
| `buildMpesaTimestamp()` uses `Africa/Nairobi`, not the host clock. | Daraja validates the STK password against EAT. Pass a second argument to keep the old behaviour: `buildMpesaTimestamp(date, "UTC")`. |

Additions worth adopting: `throwOnBusinessError`, the `authorized*` escape
hatches, `tokenStore`, and `buildMpesaSecurityCredential()`.

`toAmountString()` still exists and now formats correctly; `amountToString()` is
the same function under a clearer name.

---

## License

MIT © Noria Labs
