# `@norialabs/payments`

Reusable TypeScript/JavaScript SDK for M-PESA Daraja, SasaPay, and Paystack payments.

Current provider support:

- M-PESA Daraja
- SasaPay
- Paystack

This package is provider-first. It gives you dedicated clients for each API instead of forcing providers into a lossy normalized abstraction too early.

Request payloads are strongly typed at compile time, but this first package cut does not perform full runtime schema validation of provider payloads. The SDK sends the payload object you provide after its internal normalization steps such as amount string conversion.

## Scope

Implemented now:

- M-PESA OAuth client credentials
- M-PESA STK push
- M-PESA STK push query
- M-PESA C2B URL registration (`v1` and `v2`)
- M-PESA B2C
- M-PESA B2B
- M-PESA reversal
- M-PESA transaction status query
- M-PESA account balance query
- M-PESA QR generation
- SasaPay OAuth client credentials
- SasaPay C2B request payment
- SasaPay C2B OTP completion
- SasaPay B2C
- SasaPay B2B
- SasaPay callback and IPN payload types
- Paystack transaction initialize and verify
- Paystack bank listing
- Paystack account resolution
- Paystack transfer recipient creation
- Paystack transfer initiation, finalization, and verification
- Environment-based client construction with `fromEnv()`
- Paystack webhook signature and source-IP verification helpers

Not implemented yet:

- SasaPay checkout payments
- SasaPay remittance
- SasaPay utilities
- SasaPay WaaS
- Daraja Bill Manager and portal-only APIs with undocumented request bodies

## Source Docs

This SDK was implemented against:

- Safaricom Daraja developer portal: <https://developer.safaricom.co.ke/>
- SasaPay getting started: <https://developer.sasapay.app/docs/getting-started>
- SasaPay authentication: <https://developer.sasapay.app/docs/apis/authentication>
- SasaPay C2B: <https://developer.sasapay.app/docs/apis/c2b>
- SasaPay B2C: <https://developer.sasapay.app/docs/apis/b2c>
- SasaPay B2B: <https://developer.sasapay.app/docs/apis/b2b>
- Paystack API reference: <https://paystack.com/docs/api/>
- Paystack transfer recipients: <https://paystack.com/docs/transfers/creating-transfer-recipients/>
- Paystack webhooks: <https://paystack.com/docs/payments/webhooks/>

Important SasaPay note:

- Sandbox host is explicitly documented and is used as the default.
- Production API host was not clearly documented in the reviewed docs, so this package requires `baseUrl` explicitly for SasaPay production instead of guessing.

## Install

```bash
npm install @norialabs/payments
```

## Runtime

- Node.js `>=20`
- ESM package output
- Uses global `fetch` by default
- You can inject your own `fetch` implementation if needed

## Imports

Root exports:

```ts
import {
  ApiError,
  AuthenticationError,
  ClientCredentialsTokenProvider,
  ConfigurationError,
  PaystackClient,
  TimeoutError,
  WebhookVerificationError,
} from "@norialabs/payments";
```

Provider subpath exports:

```ts
import { MpesaClient, buildMpesaStkPassword, buildMpesaTimestamp } from "@norialabs/payments/mpesa";
import { PaystackClient } from "@norialabs/payments/paystack";
import { SasaPayClient } from "@norialabs/payments/sasapay";
```

## Quick Start

### M-PESA

```ts
import { MpesaClient, buildMpesaStkPassword, buildMpesaTimestamp } from "@norialabs/payments/mpesa";

const mpesa = new MpesaClient({
  consumerKey: process.env.MPESA_CONSUMER_KEY!,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
  environment: "sandbox",
});

const timestamp = buildMpesaTimestamp();

const response = await mpesa.stkPush({
  BusinessShortCode: "174379",
  Password: buildMpesaStkPassword({
    businessShortCode: "174379",
    passkey: process.env.MPESA_PASSKEY!,
    timestamp,
  }),
  Timestamp: timestamp,
  TransactionType: "CustomerPayBillOnline",
  Amount: 1,
  PartyA: "254700000000",
  PartyB: "174379",
  PhoneNumber: "254700000000",
  CallBackURL: "https://example.com/mpesa/callback",
  AccountReference: "INV-001",
  TransactionDesc: "Payment",
});
```

### SasaPay

```ts
import { SasaPayClient } from "@norialabs/payments/sasapay";

const sasapay = new SasaPayClient({
  clientId: process.env.SASAPAY_CLIENT_ID!,
  clientSecret: process.env.SASAPAY_CLIENT_SECRET!,
  environment: "sandbox",
});

const response = await sasapay.requestPayment({
  MerchantCode: "600980",
  NetworkCode: "63902",
  Currency: "KES",
  Amount: "1.00",
  PhoneNumber: "254700000080",
  AccountReference: "12345678",
  TransactionDesc: "Request Payment",
  CallBackURL: "https://example.com/sasapay/callback",
});
```

### Paystack

```ts
import { PaystackClient } from "@norialabs/payments/paystack";

const paystack = PaystackClient.fromEnv();

const response = await paystack.initializeTransaction({
  amount: 5000,
  email: "customer@example.com",
  currency: "KES",
  reference: "INV-001",
  callback_url: "https://example.com/paystack/callback",
});
```

## Shared Design

### Authentication

By default, `MpesaClient` and `SasaPayClient` manage OAuth client-credentials tokens internally. `PaystackClient` uses your secret key directly as the bearer credential.

You can also inject your own token provider:

```ts
const tokenProvider = {
  async getAccessToken(forceRefresh?: boolean) {
    return process.env.ACCESS_TOKEN!;
  },
};
```

When a custom `tokenProvider` is supplied:

- the SDK does not call the provider token endpoint
- credentials like `consumerKey` or `clientId` are not required
- you remain responsible for token freshness

### Environment Configuration

All three provider clients support `fromEnv()`:

```ts
const mpesa = MpesaClient.fromEnv();
const sasapay = SasaPayClient.fromEnv();
const paystack = PaystackClient.fromEnv();
```

Supported environment variables:

- M-PESA: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_ENVIRONMENT`, `MPESA_BASE_URL`, `MPESA_TIMEOUT_SECONDS`, `MPESA_TOKEN_CACHE_SKEW_SECONDS`
- SasaPay: `SASAPAY_CLIENT_ID`, `SASAPAY_CLIENT_SECRET`, `SASAPAY_ENVIRONMENT`, `SASAPAY_BASE_URL`, `SASAPAY_TIMEOUT_SECONDS`, `SASAPAY_TOKEN_CACHE_SKEW_SECONDS`
- Paystack: `PAYSTACK_SECRET_KEY`, `PAYSTACK_BASE_URL`, `PAYSTACK_TIMEOUT_SECONDS`

### Amount Normalization

For request payloads that contain `Amount`, the SDK accepts `string | number` and serializes numbers to strings before sending the HTTP request.

### Async Payment Behavior

Across all providers, many payment APIs are asynchronous.

Treat the initial API response as:

- accepted
- queued
- in progress

Do not treat it as final settlement unless the provider explicitly says so. Final success or failure usually arrives via callback/webhook/IPN or a later query.

### Response Pass-Through

Provider JSON responses are returned as raw provider payloads with typed known fields. If the provider includes additional keys beyond the documented interfaces, the SDK preserves them instead of stripping them.

## Customization

This SDK is configurable at three levels:

1. constructor-level transport and auth defaults
2. per-request overrides
3. hook-based request/response/error interception

### Constructor Options

Shared transport-style options available on all clients:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `environment` | `"sandbox" \| "production"` | `"sandbox"` | Selects the default base URL when documented. |
| `baseUrl` | `string` | Provider default | Override the full provider base URL. |
| `fetch` | `typeof fetch` | global `fetch` | Inject a custom fetch implementation. |
| `timeoutMs` | `number` | `undefined` | Default timeout for all requests in milliseconds. |
| `tokenCacheSkewMs` | `number` | `60000` | Refresh OAuth tokens slightly before expiry. Used by OAuth-backed clients only. |
| `defaultHeaders` | `HeadersInit` | `undefined` | Headers added to every request. |
| `retry` | `RetryPolicy \| false` | `undefined` | Default retry policy for all requests. |
| `hooks` | `HttpHooks` | `undefined` | Request, response, and error hooks. |

Provider-specific auth options:

### `MpesaClient` auth

Use one of:

| Auth mode | Required fields |
| --- | --- |
| Built-in OAuth | `consumerKey`, `consumerSecret` |
| External token provider | `tokenProvider` |

### `SasaPayClient` auth

Use one of:

| Auth mode | Required fields |
| --- | --- |
| Built-in OAuth | `clientId`, `clientSecret` |
| External token provider | `tokenProvider` |

### `PaystackClient` auth

Required fields:

| Auth mode | Required fields |
| --- | --- |
| Secret key | `secretKey` |

### SasaPay Production

For SasaPay production you must pass:

```ts
const sasapay = new SasaPayClient({
  environment: "production",
  baseUrl: "https://your-confirmed-production-host/api/v1",
  clientId: process.env.SASAPAY_CLIENT_ID!,
  clientSecret: process.env.SASAPAY_CLIENT_SECRET!,
});
```

This is deliberate. The package does not guess an undocumented production host.

### Per-Request Overrides

Every provider method accepts an optional second argument:

```ts
type ProviderRequestOptions = {
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: RetryPolicy | false;
  accessToken?: string;
  forceTokenRefresh?: boolean;
};
```

Use it for:

- request-specific headers
- request-specific timeout
- request-specific retry rules
- direct access-token override
- forced token refresh on the next call

Example:

```ts
await sasapay.requestPayment(payload, {
  timeoutMs: 15_000,
  headers: { "x-request-id": "abc-123" },
  retry: {
    maxAttempts: 2,
    retryMethods: ["POST"],
    retryOnStatuses: [500, 502, 503, 504],
    baseDelayMs: 250,
  },
});
```

### Retry Policy

Retries are configurable but intentionally not enabled by default.

That default is deliberate for payments. Blind automatic retries on `POST` can duplicate operations unless you have upstream idempotency.

`RetryPolicy` fields:

| Field | Type | Description |
| --- | --- | --- |
| `maxAttempts` | `number` | Total attempts including the first request. |
| `retryMethods` | `HttpMethod[]` | Restrict retries to certain methods such as `["GET"]` or explicitly `["POST"]`. |
| `retryOnStatuses` | `number[]` | HTTP status codes that should trigger a retry. |
| `retryOnNetworkError` | `boolean` | Retry on network/timeout style errors. |
| `baseDelayMs` | `number` | Base delay before retrying. |
| `maxDelayMs` | `number` | Upper bound for backoff delay. |
| `backoffMultiplier` | `number` | Exponential multiplier applied to the base delay. |
| `shouldRetry` | `(context) => boolean \| Promise<boolean>` | Final custom decision hook. |

### Hooks

`HttpHooks` lets you observe and mutate request flow.

```ts
type HttpHooks = {
  beforeRequest?: Hook | Hook[];
  afterResponse?: Hook | Hook[];
  onError?: Hook | Hook[];
};
```

Hook context shapes:

| Hook | Context fields |
| --- | --- |
| `beforeRequest` | `url`, `path`, `method`, `headers`, `body`, `attempt` |
| `afterResponse` | `beforeRequest` fields plus `response`, `responseBody` |
| `onError` | `beforeRequest` fields plus `error`, optional `response`, optional `responseBody` |

Example:

```ts
const mpesa = new MpesaClient({
  consumerKey: "...",
  consumerSecret: "...",
  hooks: {
    beforeRequest(context) {
      context.headers.set("x-correlation-id", "corr-123");
    },
    afterResponse(context) {
      console.log(context.method, context.url, context.response.status);
    },
    onError(context) {
      console.error(context.method, context.url, context.error);
    },
  },
});
```

### Header Precedence

Header merge order is:

1. client `defaultHeaders`
2. per-request `headers`
3. SDK auth headers such as `Authorization`
4. `beforeRequest` hook mutations

## Errors

The package throws structured error classes:

| Error | When it is used |
| --- | --- |
| `ConfigurationError` | Invalid client configuration such as missing credentials or missing SasaPay production `baseUrl`. |
| `AuthenticationError` | Token acquisition failed. |
| `TimeoutError` | Request timeout elapsed. |
| `ApiError` | Non-2xx provider response. |
| `WebhookVerificationError` | Paystack webhook signature or source-IP verification failed. |
| `NoriapayError` | Base class for package-specific errors. |

### `ApiError`

`ApiError` includes:

- `message`
- `code`
- `status`
- `responseBody`

Example:

```ts
try {
  await mpesa.stkPush(payload);
} catch (error) {
  if (error instanceof ApiError) {
    console.error(error.status, error.responseBody);
  }
}
```

## M-PESA

### Base URLs

| Environment | Base URL |
| --- | --- |
| `sandbox` | `https://sandbox.safaricom.co.ke` |
| `production` | `https://api.safaricom.co.ke` |

### M-PESA Helpers

#### `buildMpesaTimestamp(date?)`

Formats a date into `YYYYMMDDHHMMSS`.

#### `buildMpesaStkPassword({ businessShortCode, passkey, timestamp })`

Returns `base64(shortCode + passkey + timestamp)`.

### M-PESA Client Methods

| Method | Endpoint |
| --- | --- |
| `getAccessToken(forceRefresh?)` | `GET /oauth/v1/generate?grant_type=client_credentials` |
| `stkPush(request, options?)` | `POST /mpesa/stkpush/v1/processrequest` |
| `stkPushQuery(request, options?)` | `POST /mpesa/stkpushquery/v1/query` |
| `registerC2BUrls(request, version?, options?)` | `POST /mpesa/c2b/v1/registerurl` or `POST /mpesa/c2b/v2/registerurl` |
| `b2cPayment(request, options?)` | `POST /mpesa/b2c/v1/paymentrequest` |
| `b2bPayment(request, options?)` | `POST /mpesa/b2b/v1/paymentrequest` |
| `reversal(request, options?)` | `POST /mpesa/reversal/v1/request` |
| `transactionStatus(request, options?)` | `POST /mpesa/transactionstatus/v1/query` |
| `accountBalance(request, options?)` | `POST /mpesa/accountbalance/v1/query` |
| `generateQrCode(request, options?)` | `POST /mpesa/qrcode/v1/generate` |

### M-PESA Response Types

Most non-STK M-PESA methods currently return `MpesaApiResponse`.

Known common fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `ConversationID` | `string` | Provider conversation identifier. |
| `OriginatorConversationID` | `string` | Originator-side conversation identifier. |
| `ResponseCode` | `string` | Provider response code. `"0"` usually means accepted. |
| `ResponseDescription` | `string` | Provider response description. |
| `CustomerMessage` | `string` | Human-facing provider message when present. |
| `errorCode` | `string` | Provider error code when present. |
| `errorMessage` | `string` | Provider error message when present. |

For `stkPush()`, the SDK returns `MpesaStkPushResponse`, which extends `MpesaApiResponse` and may also include:

| Field | Type |
| --- | --- |
| `MerchantRequestID` | `string` |
| `CheckoutRequestID` | `string` |

### `stkPush()`

Request payload:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `BusinessShortCode` | `string` | Yes | Short code used for the transaction. |
| `Password` | `string` | Yes | Usually from `buildMpesaStkPassword()`. |
| `Timestamp` | `string` | Yes | Usually from `buildMpesaTimestamp()`. |
| `TransactionType` | `"CustomerPayBillOnline" \| "CustomerBuyGoodsOnline"` | Yes | Daraja transaction type. |
| `Amount` | `string \| number` | Yes | Normalized to string by the SDK. |
| `PartyA` | `string` | Yes | Customer phone in international format. |
| `PartyB` | `string` | Yes | Short code receiving payment. |
| `PhoneNumber` | `string` | Yes | Customer phone. |
| `CallBackURL` | `string` | Yes | Async callback endpoint. |
| `AccountReference` | `string` | Yes | Merchant reference. |
| `TransactionDesc` | `string` | Yes | Human-readable description. |

### `stkPushQuery()`

Request payload:

| Field | Type | Required |
| --- | --- | --- |
| `BusinessShortCode` | `string` | Yes |
| `Password` | `string` | Yes |
| `Timestamp` | `string` | Yes |
| `CheckoutRequestID` | `string` | Yes |

### `registerC2BUrls()`

Request payload:

| Field | Type | Required |
| --- | --- | --- |
| `ShortCode` | `string` | Yes |
| `ResponseType` | `"Completed" \| "Cancelled"` | Yes |
| `ConfirmationURL` | `string` | Yes |
| `ValidationURL` | `string` | Yes |

The optional `version` argument is:

- `"v2"` by default
- `"v1"` when you specifically need the older endpoint

### `b2cPayment()`

Request payload:

| Field | Type | Required |
| --- | --- | --- |
| `InitiatorName` | `string` | Yes |
| `SecurityCredential` | `string` | Yes |
| `CommandID` | `"BusinessPayment" \| "SalaryPayment" \| "PromotionPayment"` | Yes |
| `Amount` | `string \| number` | Yes |
| `PartyA` | `string` | Yes |
| `PartyB` | `string` | Yes |
| `Remarks` | `string` | Yes |
| `QueueTimeOutURL` | `string` | Yes |
| `ResultURL` | `string` | Yes |
| `Occasion` | `string` | No |

### `b2bPayment()`

Request payload:

| Field | Type | Required |
| --- | --- | --- |
| `Initiator` | `string` | Yes |
| `SecurityCredential` | `string` | Yes |
| `CommandID` | `"BusinessBuyGoods" \| "BusinessPayBill" \| "B2BAccountTopUp"` | Yes |
| `Amount` | `string \| number` | Yes |
| `PartyA` | `string` | Yes |
| `PartyB` | `string` | Yes |
| `Remarks` | `string` | Yes |
| `AccountReference` | `string` | Yes |
| `QueueTimeOutURL` | `string` | Yes |
| `ResultURL` | `string` | Yes |

### `reversal()`

Request payload:

| Field | Type | Required |
| --- | --- | --- |
| `Initiator` | `string` | Yes |
| `SecurityCredential` | `string` | Yes |
| `CommandID` | `"TransactionReversal"` | Yes |
| `TransactionID` | `string` | Yes |
| `Amount` | `string \| number` | Yes |
| `ReceiverParty` | `string` | Yes |
| `RecieverIdentifierType` | `string` | Yes |
| `ResultURL` | `string` | Yes |
| `QueueTimeOutURL` | `string` | Yes |
| `Remarks` | `string` | Yes |
| `Occasion` | `string` | No |

Note: `RecieverIdentifierType` is intentionally spelled to match the source Daraja reference.

### `transactionStatus()`

Request payload:

| Field | Type | Required |
| --- | --- | --- |
| `Initiator` | `string` | Yes |
| `SecurityCredential` | `string` | Yes |
| `CommandID` | `"TransactionStatusQuery"` | Yes |
| `TransactionID` | `string` | Yes |
| `PartyA` | `string` | Yes |
| `IdentifierType` | `string` | Yes |
| `ResultURL` | `string` | Yes |
| `QueueTimeOutURL` | `string` | Yes |
| `Remarks` | `string` | Yes |
| `Occasion` | `string` | No |

### `accountBalance()`

Request payload:

| Field | Type | Required |
| --- | --- | --- |
| `Initiator` | `string` | Yes |
| `SecurityCredential` | `string` | Yes |
| `CommandID` | `"AccountBalance"` | Yes |
| `PartyA` | `string` | Yes |
| `IdentifierType` | `string` | Yes |
| `ResultURL` | `string` | Yes |
| `QueueTimeOutURL` | `string` | Yes |
| `Remarks` | `string` | Yes |

### `generateQrCode()`

Request payload:

| Field | Type | Required |
| --- | --- | --- |
| `MerchantName` | `string` | Yes |
| `MerchantShortCode` | `string` | Yes |
| `Amount` | `string \| number` | Yes |
| `QRType` | `"PAYBILL" \| "BUYGOODS"` | Yes |

## SasaPay

### Base URL

| Environment | Base URL behavior |
| --- | --- |
| `sandbox` | defaults to `https://sandbox.sasapay.app/api/v1` |
| `production` | must be supplied via `baseUrl` |

### SasaPay Client Methods

| Method | Endpoint |
| --- | --- |
| `getAccessToken(forceRefresh?)` | `GET /auth/token/?grant_type=client_credentials` |
| `requestPayment(request, options?)` | `POST /payments/request-payment/` |
| `processPayment(request, options?)` | `POST /payments/process-payment/` |
| `b2cPayment(request, options?)` | `POST /payments/b2c/` |
| `b2bPayment(request, options?)` | `POST /payments/b2b/` |

### SasaPay Authentication

The SDK uses:

- `GET /api/v1/auth/token/?grant_type=client_credentials`
- HTTP Basic auth using `clientId:clientSecret`
- Bearer token for protected requests

### `requestPayment()`

This is SasaPay C2B initiation.

Request payload:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `MerchantCode` | `string` | Yes | Merchant code. |
| `NetworkCode` | `string` | Yes | Payment channel identifier. |
| `Currency` | `string` | Yes | Usually `KES`. |
| `Amount` | `string \| number` | Yes | Normalized to string by the SDK. |
| `PhoneNumber` | `string` | Yes | Customer phone number. |
| `AccountReference` | `string` | Yes | Merchant transaction reference. |
| `TransactionDesc` | `string` | Yes | Payment description. |
| `CallBackURL` | `string` | Yes | Async callback URL. |

Documented response fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `status` | `boolean` | Request status. |
| `detail` | `string` | Provider detail message. |
| `PaymentGateway` | `string` | Channel/provider used. |
| `MerchantRequestID` | `string` | Merchant request identifier. |
| `CheckoutRequestID` | `string` | SasaPay checkout identifier. |
| `TransactionReference` | `string` | Unique payment request reference. |
| `ResponseCode` | `string` | `"0"` usually means accepted. |
| `ResponseDescription` | `string` | Provider response message. |
| `CustomerMessage` | `string` | Customer-facing instructions. |

#### Network code behavior

From the reviewed SasaPay docs:

- `NetworkCode: "0"` is SasaPay wallet and triggers an OTP flow
- codes such as `63902` are mobile money providers like M-PESA and use an STK-like flow

### `processPayment()`

Used for SasaPay wallet OTP completion only.

Request payload:

| Field | Type | Required |
| --- | --- | --- |
| `MerchantCode` | `string` | Yes |
| `CheckoutRequestID` | `string` | Yes |
| `VerificationCode` | `string` | Yes |

Response fields:

| Field | Type |
| --- | --- |
| `status` | `boolean` |
| `detail` | `string` |

### `b2cPayment()`

Request payload:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `MerchantCode` | `string` | Yes | Merchant code. |
| `Amount` | `string \| number` | Yes | Normalized to string by the SDK. |
| `Currency` | `string` | Yes | Usually `KES`. |
| `MerchantTransactionReference` | `string` | Yes | Merchant-side reference. |
| `ReceiverNumber` | `string` | Yes | Receiver mobile or bank account number. |
| `Channel` | `string` | Yes | Destination channel code. |
| `Reason` | `string` | Yes | Payment reason. |
| `CallBackURL` | `string` | Yes | Async callback URL. |

Documented response fields:

| Field | Type |
| --- | --- |
| `status` | `boolean` |
| `detail` | `string` |
| `B2CRequestID` | `string` |
| `ConversationID` | `string` |
| `OriginatorConversationID` | `string` |
| `ResponseCode` | `string` |
| `TransactionCharges` | `string` |
| `ResponseDescription` | `string` |

### `b2bPayment()`

Request payload:

| Field | Type | Required |
| --- | --- | --- |
| `MerchantCode` | `string` | Yes |
| `MerchantTransactionReference` | `string` | Yes |
| `Currency` | `string` | Yes |
| `Amount` | `string \| number` | Yes |
| `ReceiverMerchantCode` | `string` | Yes |
| `AccountReference` | `string` | Yes |
| `ReceiverAccountType` | `"PAYBILL" \| "TILL"` | Yes |
| `NetworkCode` | `string` | Yes |
| `Reason` | `string` | Yes |
| `CallBackURL` | `string` | Yes |

Documented response fields:

| Field | Type |
| --- | --- |
| `status` | `boolean` |
| `detail` | `string` |
| `B2BRequestID` | `string` |
| `ConversationID` | `string` |
| `OriginatorConversationID` | `string` |
| `TransactionCharges` | `string` |
| `ResponseCode` | `string` |
| `ResponseDescription` | `string` |

## SasaPay Callback Types

The SDK exports callback payload types for downstream webhook handling.

### `SasaPayC2BCallback`

Final C2B callback payload posted to your `CallBackURL`.

| Field | Type |
| --- | --- |
| `MerchantRequestID` | `string` |
| `CheckoutRequestID` | `string` |
| `PaymentRequestID` | `string` |
| `ResultCode` | `string` |
| `ResultDesc` | `string` |
| `SourceChannel` | `string` |
| `TransAmount` | `string` |
| `RequestedAmount` | `string` |
| `Paid` | `boolean` |
| `BillRefNumber` | `string` |
| `TransactionDate` | `string` |
| `CustomerMobile` | `string` |
| `TransactionCode` | `string` |
| `ThirdPartyTransID` | `string` |

### `SasaPayC2BIpn`

Instant payment notification payload.

| Field | Type |
| --- | --- |
| `MerchantCode` | `string` |
| `BusinessShortCode` | `string` |
| `InvoiceNumber` | `string` |
| `PaymentMethod` | `string` |
| `TransID` | `string` |
| `ThirdPartyTransID` | `string` |
| `FullName` | `string` |
| `FirstName` | `string` |
| `MiddleName` | `string` |
| `LastName` | `string` |
| `TransactionType` | `string` |
| `MSISDN` | `string` |
| `OrgAccountBalance` | `string` |
| `TransAmount` | `string` |
| `TransTime` | `string` |
| `BillRefNumber` | `string` |

### `SasaPayTransferCallback`

Shared callback shape for SasaPay B2C and B2B-style transfer result payloads.

| Field | Type |
| --- | --- |
| `MerchantCode` | `string` |
| `DestinationChannel` | `string` |
| `RecipientName` | `string` |
| `RecipientAccountNumber` | `string` |
| `ResultCode` | `string` |
| `ResultDesc` | `string` |
| `SourceChannel` | `string` |
| `SasaPayTransactionCode` | `string` |
| `CheckoutRequestID` | `string` |
| `SasaPayTransactionID` | `string` |
| `ThirdPartyTransactionCode` | `string` |
| `TransactionAmount` | `string` |
| `TransactionCharge` | `string` optional |
| `TransactionCharges` | `string` optional |
| `MerchantRequestID` | `string` |
| `MerchantTransactionReference` | `string` |
| `TransactionDate` | `string` |
| `MerchantAccountBalance` | `string` |
| `LinkedTransactionCode` | `string` optional |

## Paystack

### Base URL

- default: `https://api.paystack.co`
- override with `baseUrl` or `PAYSTACK_BASE_URL`

### Paystack Client Methods

| Method | Endpoint |
| --- | --- |
| `initializeTransaction(request, options?)` | `POST /transaction/initialize` |
| `verifyTransaction(reference, options?)` | `GET /transaction/verify/{reference}` |
| `listBanks(query?, options?)` | `GET /bank` |
| `resolveAccount({ accountNumber, bankCode }, options?)` | `GET /bank/resolve` |
| `createTransferRecipient(request, options?)` | `POST /transferrecipient` |
| `initiateTransfer(request, options?)` | `POST /transfer` |
| `finalizeTransfer(request, options?)` | `POST /transfer/finalize_transfer` |
| `verifyTransfer(reference, options?)` | `GET /transfer/verify/{reference}` |

### Paystack Notes

- amounts are lowest-unit integers, so `5000` means `50.00` in a 2-decimal currency such as KES
- `accessToken` in per-request options overrides the bearer secret key for one request
- Paystack does not use OAuth token lookup in this SDK

### Verify Paystack Webhooks

```ts
import {
  PAYSTACK_WEBHOOK_IPS,
  requirePaystackSignature,
  requireSourceIp,
} from "@norialabs/payments";

export function verifyPaystackWebhook(rawBody, signature, sourceIp) {
  requirePaystackSignature(rawBody, signature, process.env.PAYSTACK_SECRET_KEY!);
  requireSourceIp(sourceIp, PAYSTACK_WEBHOOK_IPS);
}
```

## Usage Patterns

### Use the SDK-managed token flow

Best when:

- you want the package to fetch and cache OAuth tokens
- you do not already have a central auth service

### Use an external token provider

Best when:

- you already manage tokens elsewhere
- you want a shared token cache across multiple SDK clients
- you need custom auth behavior not built into the package

Example:

```ts
import { MpesaClient } from "@norialabs/payments/mpesa";

const client = new MpesaClient({
  tokenProvider: {
    async getAccessToken(forceRefresh) {
      return getTokenFromMyCache(forceRefresh);
    },
  },
});
```

### Override token per request

Best when:

- a single call must use a specific bearer token
- you are proxying requests through your own auth layer

```ts
await sasapay.processPayment(payload, {
  accessToken: "pre-fetched-token",
});
```

### Force a fresh token

```ts
await mpesa.stkPush(payload, {
  forceTokenRefresh: true,
});
```

## Versioning Expectations

This is the first package cut. Expect additive growth in:

- more provider endpoints
- richer response typing
- more provider-specific modules

Breaking changes should be reserved for places where the current first-cut API is too weak or misleading.
