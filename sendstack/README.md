# `@norialabs/sendstack`

Official JavaScript SDK for Sendstack messaging APIs.

Use it for:

- developer API email, SMS, WhatsApp, and health endpoints
- merchant/control-plane messaging routes, including group email
- custom auth, retries, middleware, and raw `request(...)` access

Node `>=20` is required.

## Install

```bash
npm install @norialabs/sendstack
```

## Shared Setup

The examples below assume:

```ts
const BASE_URL = "https://sendstack.noria.co.ke/api/v1";
const API_KEY = process.env.SENDSTACK_API_KEY!;
const MERCHANT_TOKEN = process.env.SENDSTACK_MERCHANT_TOKEN!;
const MERCHANT_ID = "merchant_123";
```

Change `BASE_URL` once if your Sendstack host changes.

## Quick Start

### Developer API

```ts
import { Mailer } from "@norialabs/sendstack";

const client = new Mailer(API_KEY, {
  baseUrl: BASE_URL,
});

const emailMessage = await client.emails.send(
  {
    from: "Noria Demo <mail@noria.co.ke>",
    to: ["hello@example.com"],
    replyTo: ["support@noria.co.ke", "ops@noria.co.ke"],
    subject: "Hello from Sendstack",
    html: "<p>Your <strong>SDK</strong> is working.</p>",
    text: "Your SDK is working.",
  },
  {
    idempotencyKey: "welcome-email-1",
  },
);

const smsQuote = await client.sms.quote({
  from: "SENDSTACK",
  to: "+254722111222",
  text: "Hello from SMS",
});

const whatsappMessage = await client.whatsapp.send({
  from: "WABA",
  to: "+254733000333",
  text: "Hello from WhatsApp",
});

console.log(emailMessage.id, emailMessage.status);
console.log(smsQuote.estimated_units);
console.log(whatsappMessage.id, whatsappMessage.status);
```

### Merchant API

```ts
import { Mailer } from "@norialabs/sendstack";

const merchantClient = new Mailer({
  baseUrl: BASE_URL,
  auth: {
    type: "bearer",
    token: MERCHANT_TOKEN,
  },
});

const groupQuote = await merchantClient.merchant.emails.quoteGroup(
  MERCHANT_ID,
  {
    from: "sender@example.com",
    to: ["a@example.com", "b@example.com"],
    cc: "finance@example.com",
    subject: "Monthly update",
    html: "<p>Hello from the control plane</p>",
    text: "Hello from the control plane",
  },
);

const groupSend = await merchantClient.merchant.emails.sendGroup(
  MERCHANT_ID,
  {
    from: "sender@example.com",
    to: ["a@example.com", "b@example.com"],
    replyTo: ["support@example.com", "ops@example.com"],
    subject: "Monthly update",
    html: "<p>Queued from the control plane</p>",
    text: "Queued from the control plane",
  },
  {
    idempotencyKey: "merchant-group-send-1",
  },
);

console.log(groupQuote.estimated_units);
console.log(groupSend.recipient_count);
```

## How To Read The Examples

- `client`
  The main Sendstack SDK client.
- `client.emails`
  The email part of the API.
- `client.sms`
  The SMS part of the API.
- `client.whatsapp`
  The WhatsApp part of the API.
- `client.merchant`
  Merchant and control-plane routes on a Sendstack client.
- `quote(...)`
  Ask Sendstack for the estimated units before sending.
- `send(...)`
  Queue a message for delivery.
- `get(...)`
  Fetch one message by ID.
- `list(...)`
  Fetch many messages, usually with filters or pagination.
- variable names like `emailMessage`, `smsQuote`, and `groupSend`
  These are just local JavaScript variables holding API responses.

## Auth

### Developer API Auth

When you pass a non-empty first constructor argument, the SDK sends:

```http
X-API-Key: <apiKey>
```

```ts
const client = new Mailer(API_KEY, {
  baseUrl: BASE_URL,
});
```

That matches the current Sendstack developer API.

### Merchant And Control-Plane Auth

Merchant routes usually need a custom auth strategy instead of an API key.

```ts
const merchantClient = new Mailer({
  baseUrl: BASE_URL,
  auth: {
    type: "bearer",
    token: MERCHANT_TOKEN,
  },
});
```

You can also use:

- `type: "headers"` for custom header-based auth
- request-level `auth` overrides for one call
- explicit `authorization` or `x-api-key` headers when you do not want a default auth strategy

## Developer API

### Emails

Available methods:

- `client.emails.quote(payload, options?)`
- `client.emails.send(payload, options?)`
- `client.emails.get(messageId, options?)`
- `client.emails.list(options?)`

Example:

```ts
const quote = await client.emails.quote({
  from: "sender@example.com",
  to: ["recipient@example.com"],
  subject: "Welcome",
  html: "<p>Hello from Sendstack</p>",
  text: "Hello from Sendstack",
});

const emailMessage = await client.emails.send({
  from: "sender@example.com",
  to: ["recipient@example.com"],
  replyTo: ["support@example.com", "help@example.com"],
  subject: "Welcome",
  html: "<p>Hello from Sendstack</p>",
  text: "Hello from Sendstack",
});
```

Notes:

- Sendstack accepts plain text, HTML, or both.
- Using both `html` and `text` is the recommended default.
- The SDK accepts JavaScript-friendly aliases like `replyTo`, `scheduledAt`, and `listManagementOptions`.
- Snake-case aliases like `reply_to` and `scheduled_at` are also accepted if you already have those payloads.

### SMS

Available methods:

- `client.sms.quote(payload, options?)`
- `client.sms.send(payload, options?)`
- `client.sms.get(messageId, options?)`
- `client.sms.list(options?)`

Example:

```ts
const smsQuote = await client.sms.quote({
  from: "SENDSTACK",
  to: "+254722111222",
  text: "Your verification code is 123456",
});

const smsMessage = await client.sms.send({
  from: "SENDSTACK",
  to: "+254722111222",
  text: "Your verification code is 123456",
});
```

The SDK accepts camel-case aliases like `contactId`, `templateId`, `providerConnectionId`, and `idempotencyKey`, then maps them to the current Sendstack wire format.

### WhatsApp

Available methods:

- `client.whatsapp.quote(payload, options?)`
- `client.whatsapp.send(payload, options?)`
- `client.whatsapp.get(messageId, options?)`
- `client.whatsapp.list(options?)`

Plain-text example:

```ts
const whatsappMessage = await client.whatsapp.send({
  from: "WABA",
  to: "+254733000333",
  text: "Hello from WhatsApp",
});
```

Template example:

```ts
const templateQuote = await client.whatsapp.quote({
  from: "WABA",
  to: "+254733000333",
  templateId: "template_123",
  variables: {
    first_name: "Mercy",
  },
});
```

Notes:

- Use `text` for a plain WhatsApp message.
- Use `templateId` plus `variables` for a template-based WhatsApp send.
- `templateVariables` is accepted as an alias and is normalized to `variables`.

### Health

Available methods:

- `client.health.live(options?)`
- `client.health.check(options?)`
- `client.health.ready(options?)`

These default to unauthenticated requests and target the root service URL, not `/api/v1`.

```ts
await client.health.live();
await client.health.check();
await client.health.ready();
```

## Merchant API

### Message History

Available methods:

- `client.merchant.messages.list(merchantId, options?)`
- `client.merchant.messages.get(merchantId, messageId, options?)`

```ts
const merchantMessages = await merchantClient.merchant.messages.list(MERCHANT_ID, {
  status: "queued",
  channel: "email",
  limit: 25,
});
```

### Merchant Email

Available methods:

- `client.merchant.emails.quote(merchantId, payload, options?)`
- `client.merchant.emails.quoteGroup(merchantId, payload, options?)`
- `client.merchant.emails.send(merchantId, payload, options?)`
- `client.merchant.emails.sendGroup(merchantId, payload, options?)`

Use `sendGroup` when you want Sendstack’s merchant group-email flow.

### Merchant SMS

Available methods:

- `client.merchant.sms.quote(merchantId, payload, options?)`
- `client.merchant.sms.send(merchantId, payload, options?)`

### Merchant WhatsApp

Available methods:

- `client.merchant.whatsapp.quote(merchantId, payload, options?)`
- `client.merchant.whatsapp.send(merchantId, payload, options?)`

## Pagination And Idempotency

List endpoints accept:

- `limit`
- `cursor`
- `perPage`
- `status`
- `channel` for `merchant.messages.list(...)`

Example:

```ts
const emailsPage = await client.emails.list({
  limit: 25,
  cursor: "cursor_123",
  perPage: 25,
  status: "sent",
});

console.log(emailsPage.items, emailsPage.next_cursor, emailsPage.has_more);
```

For idempotent sends, pass `idempotencyKey` in request options:

```ts
await client.sms.send(
  {
    from: "SENDSTACK",
    to: "+254722111222",
    text: "Hello again",
  },
  {
    idempotencyKey: "sms-send-1",
  },
);
```

## Raw Requests And Customization

Use `request(...)` when you need an endpoint that does not have a helper yet.

```ts
const result = await client.request("POST", "/emails/preview", {
  body: {
    from: "sender@example.com",
    to: ["recipient@example.com"],
    subject: "Preview me",
    html: "<p>Preview</p>",
    text: "Preview",
  },
});
```

Available constructor and request-level transport options:

- `headers`
- `query`
- `timeoutMs`
- `auth`
- `retry`
- `middleware`
- `parseResponse`
- `transformResponse`
- request-level `fetch`

Retry example:

```ts
const client = new Mailer(API_KEY, {
  baseUrl: BASE_URL,
  retry: {
    maxAttempts: 2,
  },
});
```

Middleware example:

```ts
const client = new Mailer(API_KEY, {
  baseUrl: BASE_URL,
  middleware: [
    async (request, next) => {
      request.headers.set("x-sdk", "@norialabs/sendstack");
      return await next(request);
    },
  ],
});
```

## Error Handling

```ts
import { Mailer, MailerError } from "@norialabs/sendstack";

try {
  await client.emails.send({
    from: "sender@example.com",
    to: ["recipient@example.com"],
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

The SDK understands both:

- compatibility envelopes like `{ ok: false, error: ... }`
- Sendstack/FastAPI responses like `{ detail: "..." }`

## Compatibility Appendix

The package keeps a few helpers for older fully mailer-compatible APIs:

- `client.domains`
- `client.apiKeys`
- `client.webhooks`
- `client.emails.sendBatch(...)`

These are not part of the current Sendstack developer messaging surface, but they remain available when you are targeting a compatible API.

## License

[MIT](./LICENSE)
