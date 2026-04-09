# `@norialabs/mailer`

Official JavaScript SDK for the Noria Mailer API.

This package is standalone and publishable. It is not an internal monorepo helper and has no runtime dependency on the mailer service source tree.

Node `24+` is required. Use it in server-side Node.js and Next.js code, not in browser/client bundles.

## Install

```bash
npm install @norialabs/mailer
```

## Quick Start

```ts
import { Mailer } from "@norialabs/mailer";

const mailer = new Mailer(process.env.NORIA_MAILER_API_KEY!, {
  baseUrl: "https://mailer.example.com",
});

const email = await mailer.emails.send(
  {
    from: "Noria Demo <mail@noria.co.ke>",
    to: ["hello@example.com"],
    subject: "Hello from Noria Mailer",
    text: "Your SDK is working.",
  },
  {
    idempotencyKey: "demo-send-1",
  },
);

console.log(email.id);
```

## What This SDK Supports

- High-level resources: `emails`, `domains`, `apiKeys`, `webhooks`, and `health`
- A low-level `mailer.request(...)` method for unsupported or newly-added endpoints
- Client-level and request-level transport configuration
- Custom auth strategies
- Middleware
- Retry policies
- Custom response parsing and transformation
- Forward-compatible request payloads for API fields the SDK has not typed yet

## Constructor

```ts
const mailer = new Mailer(apiKey, {
  baseUrl: "https://mailer.example.com",
  timeoutMs: 30_000,
  fetch,
  query: {
    region: "eu-west-1",
  },
  headers: {
    "x-trace-source": "my-app",
  },
  retry: {
    maxAttempts: 2,
  },
  middleware: [
    async (request, next) => {
      request.headers.set("x-sdk", "mailer");
      return await next(request);
    },
  ],
});
```

### Constructor Options

- `baseUrl: string`
  Required. Must be an absolute URL. Path prefixes are preserved, so `https://gateway.example.com/mailer-api` becomes the base for all requests.
- `fetch?: typeof fetch`
  Optional. Defaults to global `fetch`.
- `timeoutMs?: number`
  Optional. Defaults to `30_000`.
- `headers?: HeadersInit`
  Optional default headers applied to every request.
- `query?: Record<string, string | number | boolean | Date | undefined | Array<...>>`
  Optional default query params applied to every request.
- `auth?: MailerAuthStrategy | false`
  Optional default auth strategy. If omitted and `apiKey` is non-empty, the SDK uses bearer auth with that key. If omitted and `apiKey` is empty, there is no default auth strategy.
- `retry?: MailerRetryOptions | number | false`
  Optional default retry policy. Retries are disabled by default.
- `middleware?: MailerMiddleware[]`
  Optional middleware chain. Defaults to `[]`.
- `parseResponse?: MailerResponseParser`
  Optional default response parser.
- `transformResponse?: MailerResponseTransformer`
  Optional default response transformer.

### Constructor Defaults

- `timeoutMs` defaults to `30_000`
- `fetch` defaults to global `fetch`
- `headers` defaults to no extra headers
- `query` defaults to no extra query params
- `retry` defaults to disabled
- `middleware` defaults to no middleware
- `parseResponse` defaults to:
  Empty body -> `null`
  JSON `content-type` -> parsed JSON
  Non-JSON body that still parses as JSON -> parsed JSON
  Otherwise -> plain text
- `transformResponse` defaults to:
  Non-2xx/3xx -> throw `MailerError`
  Successful `{ ok: true, data: ... }` envelope -> return `data`
  Any other successful payload -> return the parsed payload as-is
- Default auth behavior:
  Non-empty `apiKey` -> bearer auth using that key
  Empty `apiKey` -> no default auth

## Config Precedence And Merge Rules

Request-level options override or extend constructor-level options.

- `fetch`: request value replaces constructor value
- `timeoutMs`: request value replaces constructor value
- `auth`: request value replaces constructor value
- `headers`: request headers merge over constructor headers
- `query`: request query merges over constructor query
- `middleware`: constructor middleware runs first, request middleware runs after it
- `parseResponse`: request value replaces constructor value
- `transformResponse`: request value replaces constructor value

Header merging is last-write-wins by header name.

Query merging is key-based:

- if the request-level query provides a key, it replaces the constructor-level value for that key
- array values become repeated query params such as `tag=welcome&tag=trial`
- `Date` values are serialized with `toISOString()`
- `undefined` values are ignored during query merging

## Request-Level Options

Every resource method accepts request options. `mailer.request(...)` accepts the same options plus `body`.

```ts
await mailer.emails.send(
  {
    from: "Noria Demo <mail@noria.co.ke>",
    to: "hello@example.com",
    subject: "Hello",
    text: "World",
    scheduledAt: "2026-03-28T09:00:00.000Z",
  },
  {
    headers: {
      "x-tenant-id": "tenant_123",
    },
    timeoutMs: 10_000,
    idempotencyKey: "tenant-123-send-1",
  },
);
```

### Common Request Options

- `signal?: AbortSignal`
- `headers?: HeadersInit`
- `timeoutMs?: number`
- `fetch?: typeof fetch`
- `query?: MailerQueryParams`
- `authenticated?: boolean`
- `auth?: MailerAuthStrategy | false`
- `retry?: MailerRetryOptions | number | false`
- `middleware?: MailerMiddleware[]`
- `parseResponse?: MailerResponseParser`
- `transformResponse?: MailerResponseTransformer`
- `unwrapData?: boolean`

### Additional Request Options

- `idempotencyKey?: string`
  Supported by `emails.send(...)` and `mailer.request(...)`
- `body?: MailerBody`
  Supported by `mailer.request(...)`

## Auth

The constructor `apiKey` is only a convenience default. Auth is fully customizable.

### Auth Rules

- Authenticated requests default to `authenticated: true`
- `health.check()` and `health.ready()` default to `authenticated: false`
- If `authenticated` is `false`, the SDK removes the `authorization` header before sending
- If `authenticated` is `true` and there is no auth strategy and no `authorization` header, the SDK throws:
  `TypeError: Mailer auth is required for authenticated requests.`
- Request-level `auth` overrides constructor-level `auth`

### Bearer Auth

```ts
const mailer = new Mailer("", {
  baseUrl: "https://mailer.example.com",
  auth: {
    type: "bearer",
    token: async (request) => await getTenantToken(request.path),
    headerName: "authorization",
    prefix: "Bearer",
  },
});
```

Bearer auth options:

- `token: string | (context) => string | Promise<string>`
- `headerName?: string`
  Defaults to `authorization`
- `prefix?: string`
  Defaults to `Bearer`

### Header-Based Auth

```ts
const mailer = new Mailer("", {
  baseUrl: "https://mailer.example.com",
  auth: {
    type: "headers",
    headers: async (request) => ({
      authorization: `Bearer ${await getTenantToken(request.path)}`,
      "x-tenant-id": "tenant_123",
    }),
  },
});
```

### Supplying Auth Directly In Headers

```ts
const mailer = new Mailer("", {
  baseUrl: "https://mailer.example.com",
  auth: false,
});

await mailer.request("GET", "/secure-endpoint", {
  headers: {
    authorization: "Bearer pre-signed-token",
  },
});
```

## Retry

Retries are off by default.

You can enable retries with either a number or an options object.

```ts
const mailer = new Mailer(apiKey, {
  baseUrl: "https://mailer.example.com",
  retry: 2,
});
```

```ts
const mailer = new Mailer(apiKey, {
  baseUrl: "https://mailer.example.com",
  retry: {
    maxAttempts: 3,
    delayMs: async (context) => context.attempt * 250,
    shouldRetry: async (context) => {
      return context.response?.status === 409 || context.response?.status === 429;
    },
  },
});
```

### Retry Semantics

- `retry: false` or omitted -> no retries
- `retry: 2` -> up to 2 total attempts
- `maxAttempts` is total attempts, not additional retries
- Default `shouldRetry` behavior:
  Network/runtime errors -> retry
  `MailerError` instances -> do not retry
  HTTP statuses `408`, `425`, `429`, `500`, `502`, `503`, `504` -> retry
- Default `delayMs` behavior:
  `100ms`, `200ms`, `400ms`, ... capped at `1000ms`
- `delayMs <= 0` retries immediately

## Middleware

Middleware can inspect or modify the outgoing request and the parsed response.

```ts
const mailer = new Mailer(apiKey, {
  baseUrl: "https://mailer.example.com",
  middleware: [
    async (request, next) => {
      const startedAt = Date.now();
      request.headers.set("x-request-source", "billing-worker");
      const response = await next(request);
      console.log(request.method, request.path, response.response.status, Date.now() - startedAt);
      return response;
    },
  ],
});
```

Middleware receives:

- `request.method`
- `request.path`
- `request.url`
- `request.headers`
- `request.body`
- `request.signal`
- `request.timeoutMs`
- `request.attempt`

Middleware can:

- mutate `request.url`
- mutate `request.headers`
- inspect or replace the returned `MailerResponseContext`

## Response Parsing And Transformation

### Default Parsing

By default the SDK reads the response body as text and then:

- returns `null` for blank responses
- parses JSON when `content-type` includes `application/json`
- attempts JSON parsing even when the header is missing or incorrect
- returns plain text if JSON parsing fails

### Default Transformation

By default the SDK:

- throws `MailerError` for non-successful responses
- unwraps `{ ok: true, data: ... }` envelopes
- returns other successful payloads unchanged

If you do not want envelope unwrapping, pass `unwrapData: false`.

```ts
const rawEnvelope = await mailer.request("GET", "/raw-envelope", {
  unwrapData: false,
});
```

### Custom Parser

```ts
const total = await mailer.request("GET", "/stats", {
  parseResponse: async (response) => response.headers.get("x-total"),
});
```

### Custom Transformer

```ts
const result = await mailer.request("GET", "/stats", {
  parseResponse: async (response) => response.headers.get("x-total"),
  transformResponse: ({ payload, response }) => ({
    total: Number(payload),
    status: response.status,
  }),
});
```

### `sendBatch(...)` Default Response Behavior

`emails.sendBatch(...)` has a special default transformer:

- if the response payload is already an array, it returns that array
- if the response payload is an object with a `data` array, it returns the `data` array
- otherwise it returns the successful payload unchanged

## Raw Requests

Use `mailer.request(...)` for endpoints the SDK does not expose yet.

```ts
const result = await mailer.request("POST", "/emails/preview", {
  body: {
    from: "Noria Demo <mail@noria.co.ke>",
    to: "hello@example.com",
    subject: "Preview",
    templateId: "welcome-v2",
  },
  headers: {
    "x-preview-mode": "true",
  },
});
```

### Raw Request Signature

```ts
const result = await mailer.request<TResponse>(method, path, options);
```

- `method: string`
- `path: string`
  Relative to `baseUrl`
- `options: MailerRawRequestOptions`

### Supported Body Types

`mailer.request(...)` accepts:

- plain objects
- arrays
- strings
- `Blob`
- `FormData`
- `URLSearchParams`
- `ArrayBuffer`
- typed arrays / other `ArrayBufferView`s
- `ReadableStream`
- `null`

Body handling rules:

- object and array bodies are JSON-stringified
- if a JSON body is sent and no `content-type` is present, the SDK sets `content-type: application/json`
- native body types such as `FormData` and `URLSearchParams` are passed through unchanged
- if `body` is `undefined`, no request body is sent

## Forward-Compatible Request Payloads

Typed request interfaces only cover the fields the SDK currently knows about, but request helpers accept wider payloads at runtime.

That means you can pass newly-added API fields before the SDK adds explicit typings.

```ts
await mailer.emails.send({
  from: "Noria Demo <mail@noria.co.ke>",
  to: "hello@example.com",
  subject: "Hello",
  text: "World",
  scheduledAt: "2026-03-28T09:00:00.000Z",
});
```

## Resource Reference

### Emails

```ts
await mailer.emails.send({
  from: "Noria Demo <mail@noria.co.ke>",
  to: "hello@example.com",
  subject: "Hello",
  html: "<p>Hello</p>",
});

await mailer.emails.sendBatch([
  {
    from: "Noria Demo <mail@noria.co.ke>",
    to: "first@example.com",
    subject: "One",
    text: "First",
  },
  {
    from: "Noria Demo <mail@noria.co.ke>",
    to: "second@example.com",
    subject: "Two",
    text: "Second",
  },
]);

await mailer.emails.get("018f8c89-acde-7cc2-8a37-c7f2e051a123");
await mailer.emails.list({ limit: 25, offset: 0, status: "sent" });
```

Methods:

- `mailer.emails.send(request, options?) -> Promise<{ id: string }>`
- `mailer.emails.sendBatch(requests, options?) -> Promise<SendEmailResult[] | unknown>`
- `mailer.emails.get(id, options?) -> Promise<Email>`
- `mailer.emails.list(options?) -> Promise<ListResponse<Email>>`

### Domains

```ts
await mailer.domains.create({ name: "example.com" });
await mailer.domains.list();
await mailer.domains.get("018f8c89-acde-7cc2-8a37-c7f2e051a123");
await mailer.domains.verify("018f8c89-acde-7cc2-8a37-c7f2e051a123");
await mailer.domains.remove("018f8c89-acde-7cc2-8a37-c7f2e051a123");
```

Methods:

- `mailer.domains.create(request, options?) -> Promise<Domain>`
- `mailer.domains.list(options?) -> Promise<ListResponse<Domain>>`
- `mailer.domains.get(id, options?) -> Promise<Domain>`
- `mailer.domains.verify(id, options?) -> Promise<VerifyDomainResult>`
- `mailer.domains.remove(id, options?) -> Promise<DeleteDomainResult>`

### API Keys

```ts
await mailer.apiKeys.create({
  name: "Primary live key",
  environment: "live",
});

await mailer.apiKeys.list();
await mailer.apiKeys.get("018f8c89-acde-7cc2-8a37-c7f2e051a123");
await mailer.apiKeys.remove("018f8c89-acde-7cc2-8a37-c7f2e051a123");
```

Methods:

- `mailer.apiKeys.create(request?, options?) -> Promise<CreatedApiKey>`
- `mailer.apiKeys.list(options?) -> Promise<ApiKey[]>`
- `mailer.apiKeys.get(id, options?) -> Promise<ApiKey>`
- `mailer.apiKeys.remove(id, options?) -> Promise<RevokeApiKeyResult>`

Special behavior:

- `expiresAt` can be a string or `Date`
- `Date` values are serialized to ISO strings automatically
- `apiKeys.create()` may be called without a request body

### Webhooks

```ts
await mailer.webhooks.create({
  url: "https://example.com/webhooks/mailer",
  events: ["email.sent", "email.delivered"],
});

await mailer.webhooks.list();
await mailer.webhooks.remove("018f8c89-acde-7cc2-8a37-c7f2e051a123");
```

Methods:

- `mailer.webhooks.create(request, options?) -> Promise<WebhookEndpoint>`
- `mailer.webhooks.list(options?) -> Promise<WebhookEndpoint[]>`
- `mailer.webhooks.remove(id, options?) -> Promise<DeleteWebhookResult>`

Webhook events are open-ended strings. The SDK ships known event literals but does not block newer event names.

### Health

```ts
await mailer.health.check();
await mailer.health.ready();
```

Methods:

- `mailer.health.check(options?) -> Promise<HealthStatus>`
- `mailer.health.ready(options?) -> Promise<HealthStatus>`

Special behavior:

- both health endpoints default to unauthenticated requests
- you can opt back into auth by passing `{ authenticated: true }`

## Error Handling

```ts
import { Mailer, MailerError } from "@norialabs/mailer";

try {
  await mailer.emails.send({
    from: "Noria Demo <mail@noria.co.ke>",
    to: "hello@example.com",
    subject: "Hello",
    text: "World",
  });
} catch (error) {
  if (error instanceof MailerError) {
    console.error(error.statusCode, error.code, error.message, error.details, error.responseBody);
  }
}
```

`MailerError` includes:

- `statusCode`
- `code`
- `details`
- `responseBody`

Non-successful responses are converted to `MailerError` using these rules:

- structured `{ ok: false, error: ... }` payloads -> use `error.message`, `error.code`, and `error.details`
- `Error` payloads -> use `error.message`
- non-empty text payloads -> use the text as the message
- object payloads without a structured envelope -> use a generic status-based message
- empty payloads -> use a generic status-based message

## Type Notes

- `MailerRequestContext`, `MailerResponseContext`, `MailerRetryContext`, and the auth/middleware/parser/transformer types are exported for advanced integrations
- the package exports both `Mailer` and `default`
- all exports are ESM-only

## Development

```bash
npm install
npm run typecheck
npm test
npm test -- --coverage
```

## Publishing

The package is configured for public npm publishing under the `@noria` scope.

```bash
npm login
npm publish --access public
```

`prepublishOnly` runs typecheck plus the enforced `100%` coverage gate before publish.

## License

[MIT](./LICENSE)
