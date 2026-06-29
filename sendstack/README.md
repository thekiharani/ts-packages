# `@norialabs/sendstack`

Official JavaScript SDK for the SendStack messaging API.

Use it for:

- transactional and scheduled email and SMS
- batch email and SMS
- reusable attachment uploads
- sending domains
- email and SMS templates (with rendered previews)
- webhook endpoints and webhook event retries
- suppression lists

Node `>=20` is required.

## Install

```bash
npm install @norialabs/sendstack
```

## Quick Start

```ts
import { Sendstack } from "@norialabs/sendstack";

const token = process.env.SENDSTACK_TOKEN;

if (!token) {
  throw new Error("SENDSTACK_TOKEN is required.");
}

const sendstack = new Sendstack(token);

const message = await sendstack.emails.send(
  {
    from: "Noria <hello@example.com>",
    to: "friend@example.com",
    subject: "Hello from SendStack",
    html: "<p>Your email pipeline is working.</p>",
    text: "Your email pipeline is working.",
  },
  {
    idempotencyKey: "welcome-email-1",
  },
);

console.log(message.id, message.status);
```

The SDK defaults to `https://sendstack.norialabs.com/api/v1` (the versioned API base). Override `baseUrl` to point at another environment — include the `/api/v1` version segment, since the SDK sends resource paths (e.g. `/emails`) relative to whatever base you provide:

```ts
const sendstack = new Sendstack({
  authToken,
  baseUrl: "https://staging.norialabs.com/api/v1",
});
```

## Documentation

This package guide covers install, initialization, SDK methods, TypeScript names, request options, errors, and examples.

Complete SendStack SaaS docs: [`https://sendstack.norialabs.com/docs`](https://sendstack.norialabs.com/docs).

Use the SaaS docs as the canonical source for product/API behavior: account setup, API tokens, domain verification, DNS records, webhook event catalogs, deliverability concepts, provider behavior, dashboard workflows, and raw HTTP API reference.

## Auth

The current API uses bearer auth:

```http
Authorization: Bearer <token>
```

Passing a token as the first constructor argument configures that header automatically.

```ts
const sendstack = new Sendstack("mlr_live_...");
```

You can also pass custom auth:

```ts
const sendstack = new Sendstack({
  auth: {
    type: "bearer",
    token: async () => await getFreshToken(),
  },
});
```

## Method Reference

| SDK method | HTTP route | Returns |
| --- | --- | --- |
| `attachments.upload(payload, options?)` | `POST /attachments` | `UploadedAttachment` |
| `emails.send(payload, options?)` | `POST /emails` | `SendEmailResult` |
| `emails.sendBatch(payload, options?)` | `POST /emails/batch` | `SendEmailBatchResult` |
| `emails.list(options?)` | `GET /emails` | `CursorPage<EmailMessage>` |
| `emails.get(messageId, options?)` | `GET /emails/{id}` | `EmailMessage` |
| `emails.events(messageId, options?)` | `GET /emails/{id}/events` | `CursorPage<EmailEvent>` |
| `emails.cancel(messageId, options?)` | `POST /emails/{id}/cancel` | `EmailMessage` |
| `emails.requeue(messageId, options?)` | `POST /emails/{id}/requeue` | `EmailMessage` |
| `sms.send(payload, options?)` | `POST /sms` | `SendSmsResult` |
| `sms.sendBatch(payload, options?)` | `POST /sms/batch` | `SendSmsBatchResult` |
| `sms.list(options?)` | `GET /sms` | `CursorPage<SmsMessage>` |
| `sms.get(messageId, options?)` | `GET /sms/{id}` | `SmsMessage` |
| `sms.events(messageId, options?)` | `GET /sms/{id}/events` | `CursorPage<SmsEvent>` |
| `sms.cancel(messageId, options?)` | `POST /sms/{id}/cancel` | `SmsMessage` |
| `sms.requeue(messageId, options?)` | `POST /sms/{id}/requeue` | `SmsMessage` |
| `domains.create(payload, options?)` | `POST /domains` | `Domain` |
| `domains.list(options?)` | `GET /domains` | `CursorPage<Domain>` |
| `domains.get(domainId, options?)` | `GET /domains/{id}` | `Domain` |
| `domains.verify(domainId, options?)` | `POST /domains/{id}/verify` | `Domain` |
| `templates.create(payload, options?)` | `POST /templates` | `EmailTemplate` |
| `templates.list(options?)` | `GET /templates` | `CursorPage<EmailTemplate>` |
| `templates.get(templateId, options?)` | `GET /templates/{id}` | `EmailTemplate` |
| `templates.update(templateId, payload, options?)` | `PATCH /templates/{id}` | `EmailTemplate` |
| `templates.remove(templateId, options?)` | `DELETE /templates/{id}` | `void` |
| `templates.preview(payload, options?)` | `POST /templates/preview` | `TemplatePreview` |
| `webhooks.create(payload, options?)` | `POST /webhook-endpoints` | `WebhookEndpoint` |
| `webhooks.list(options?)` | `GET /webhook-endpoints` | `CursorPage<WebhookEndpoint>` |
| `webhooks.update(webhookId, payload, options?)` | `PATCH /webhook-endpoints/{id}` | `WebhookEndpoint` |
| `webhooks.remove(webhookId, options?)` | `DELETE /webhook-endpoints/{id}` | `void` |
| `webhookEvents.retry(eventId, options?)` | `POST /events/{id}/retry` | `RetryWebhookEventResult` |
| `suppressions.add(payload, options?)` | `POST /suppressions` | `CreateSuppressionResult` |
| `suppressions.list(options?)` | `GET /suppressions` | `CursorPage<Suppression>` |
| `suppressions.remove(recipient, options?)` | `DELETE /suppressions/{recipient}` | `void` |

## Emails

```ts
await sendstack.emails.send({
  from: "hello@example.com",
  to: ["a@example.com", "b@example.com"],
  replyTo: "support@example.com",
  subject: "Welcome",
  html: "<p>Hello</p>",
  text: "Hello",
  tags: [{ name: "campaign", value: "welcome" }],
  metadata: { account: "acct_123" },
  trackOpens: true,
  trackClicks: true,
});
```

Batch sends accept either an array or `{ emails: [...] }`:

```ts
await sendstack.emails.sendBatch([
  {
    from: "hello@example.com",
    to: "a@example.com",
    subject: "One",
    text: "First email",
  },
  {
    from: "hello@example.com",
    to: "b@example.com",
    subject: "Two",
    text: "Second email",
  },
]);
```

The SDK accepts TypeScript-friendly aliases like `replyTo`, `trackOpens`, `trackClicks`, `providerId`, `templateId`, `templateData`, and `scheduledAt`, then sends the snake-case API fields.

## Per-channel defaults

`from` (email) and `from` (SMS) are usually constant, so set them once on the client. Each send fills the default in when the call omits it, and any per-send value overrides it:

```ts
const sendstack = new Sendstack({
  authToken: "mlr_live_…",
  emails: { from: "Noria <hello@example.com>" },
  sms: { from: "NORIA" },
});

await sendstack.emails.send({ to: "customer@example.com", subject: "Welcome", html: "<p>Hi</p>" }); // from applied
await sendstack.sms.send({ to: "+254700000000", body: "Your code is 4821" });                       // from applied
```

The channel namespaces are bound methods, so you can destructure them for a terser call-site:

```ts
const { emails, sms } = new Sendstack({
  authToken: "mlr_live_…",
  emails: { from: "Noria <hello@example.com>" },
  sms: { from: "NORIA" },
});

await emails.send({ to: "customer@example.com", subject: "Welcome", html: "<p>Hi</p>" });
await sms.send({ to: "+254700000000", body: "Your code is 4821" });
```

## SMS

With `sms: { from }` set on the client (above), a send only needs `to` and `body`; pass `from` on the call to override for one message:

```ts
// Uses the client default sender.
await sendstack.sms.send({
  to: "+254700000000",
  body: "Your code is {{ code }}",
  templateData: { code: "1234" },
});

// Overrides the default for this one message.
await sendstack.sms.send({
  to: "+254700000001",
  body: "Reminder: your appointment is tomorrow.",
  from: "CLINIC",
});
```

Batch sends accept either an array or `{ messages: [...] }`, and the default sender is applied per message:

```ts
await sendstack.sms.sendBatch([
  { to: "+254700000002", body: "First" },
  { to: "+254700000003", body: "Second", from: "ALERTS" },
]);
```

`sms.list`, `sms.get`, `sms.events`, `sms.cancel`, and `sms.requeue` mirror their `emails.*` counterparts. SMS responses include a `segments` count — billing is one credit per segment. The SMS request accepts the same TypeScript-friendly aliases (`providerId`, `templateId`, `templateData`, `scheduledAt`).

## Attachments

```ts
const attachment = await sendstack.attachments.upload({
  filename: "invoice.pdf",
  contentBase64: invoicePdfBase64,
  contentType: "application/pdf",
});

await sendstack.emails.send({
  from: "billing@example.com",
  to: "customer@example.com",
  subject: "Invoice",
  text: "Attached.",
  attachments: [
    {
      filename: "invoice.pdf",
      attachmentId: attachment.attachment_id,
    },
  ],
});
```

### Reading from files (Node)

The core SDK is isomorphic and never touches the filesystem — `html`/`text` are
plain strings and attachments are base64. For Node apps, the optional
`@norialabs/sendstack/node` entrypoint does the read-and-encode step for you. It
imports `node:fs`, so it lives in a separate subpath to keep the core
browser/edge-safe.

```ts
import { Sendstack } from "@norialabs/sendstack";
import {
  htmlFromFile,
  textFromFile,
  attachmentFromFile,
  attachmentFromBuffer,
} from "@norialabs/sendstack/node";

await sendstack.emails.send({
  from: "billing@example.com",
  to: "customer@example.com",
  subject: "Your invoice",
  html: await htmlFromFile("./templates/invoice.html"),
  text: await textFromFile("./templates/invoice.txt"),
  attachments: [
    // From a path — filename defaults to the basename, content is base64-encoded.
    await attachmentFromFile("./invoices/2026-06.pdf", { contentType: "application/pdf" }),
    // From in-memory bytes (e.g. a generated PDF) — filename is required.
    attachmentFromBuffer(generatedPdf, { filename: "summary.pdf", contentType: "application/pdf" }),
  ],
});
```

- `htmlFromFile(path)` / `textFromFile(path)` — read a UTF-8 file into a string.
- `attachmentFromFile(path, options?)` — read a file into an `EmailAttachmentInput`
  (base64). `options` accepts `filename` (defaults to the basename), `contentType`,
  `inline`, and `contentId`. `path` may be a string or a `file:` URL.
- `attachmentFromBuffer(data, options)` — encode a `Buffer`/`Uint8Array`; `filename`
  is required.

## Domains

```ts
const domain = await sendstack.domains.create({
  domain: "example.com",
  region: "af-south-1",
  tls: "enforced",
  capabilities: { sending: "enabled" },
});

await sendstack.domains.verify(domain.id);
```

## Templates

Templates are channel-aware: pass `channel: "email"` (the default) or `channel: "sms"`. Email templates use `subject`/`html`/`text`; SMS templates use `body`. Filter the list with `templates.list({ channel })`.

```ts
const template = await sendstack.templates.create({
  name: "Welcome",
  slug: "welcome",
  subject: "Welcome, {{firstName}}",
  html: "<p>Hello {{firstName}}</p>",
  text: "Hello {{firstName}}",
});

await sendstack.emails.send({
  from: "hello@example.com",
  to: "friend@example.com",
  template: {
    id: template.id,
    variables: { firstName: "Amina" },
  },
});
```

Render any template against sample data with `templates.preview` before sending — for SMS the preview returns the `segments` count so you can check cost up front:

```ts
const otp = await sendstack.templates.create({
  channel: "sms",
  name: "otp",
  body: "Your code is {{ code }}",
  sampleData: { code: "1234" },
});

const preview = await sendstack.templates.preview({
  templateId: otp.id,
  data: { code: "4821" },
});
// { channel: "sms", body: "Your code is 4821", segments: 1, variables: ["code"], ... }
```

## Webhooks

```ts
const endpoint = await sendstack.webhooks.create({
  url: "https://example.com/webhooks/sendstack",
  eventTypes: ["email.sent", "email.failed"],
});

await sendstack.webhookEvents.retry("event_123");
await sendstack.webhooks.update(endpoint.id, { enabled: false });
```

## Suppressions

```ts
await sendstack.suppressions.add({
  recipient: "bad@example.com",
  reason: "manual",
});

const suppressions = await sendstack.suppressions.list();
await sendstack.suppressions.remove("bad@example.com");
```

## Request Options

All methods accept request options. Mutating methods also accept `idempotencyKey`.

```ts
await sendstack.emails.send(
  {
    from: "hello@example.com",
    to: "friend@example.com",
    subject: "Hello",
    text: "Hello",
  },
  {
    idempotencyKey: "email-123",
    timeoutMs: 10_000,
    query: { debug: true },
  },
);
```

Supported client/request options:

- `fetch`: custom Fetch implementation
- `headers`: extra headers
- `query`: default or per-request query params
- `timeoutMs`: request timeout, default `30000`
- `signal`: per-request `AbortSignal`
- `authenticated`: set `false` to strip auth headers for a request
- `auth`: bearer or custom header auth strategy
- `retry`: retry config, retry count, or `false`
- `middleware`: request/response middleware
- `parseResponse`: custom response parser
- `transformResponse`: custom response transformer
- `unwrapData`: unwrap `{ ok: true, data }` envelopes, default `true`

## Lower-Level Request

Every resource method uses `request(...)` internally. Use it directly for new API routes before the SDK grows a typed wrapper.

```ts
const result = await sendstack.request("GET", "/emails", {
  query: {
    limit: 25,
    status: "queued",
  },
});
```

## Errors

Failed responses throw `SendstackError`.

```ts
import { SendstackError } from "@norialabs/sendstack";

try {
  await sendstack.emails.send({
    from: "hello@example.com",
    to: "bad",
    subject: "Hello",
    text: "Hello",
  });
} catch (error) {
  if (error instanceof SendstackError) {
    console.error(error.statusCode, error.code, error.message, error.details);
  }
}
```

`SendstackError` includes:

- `statusCode`
- `code`
- `details`
- `responseBody`

## Exports

Runtime exports:

- `Sendstack`
- `SendstackClient`
- `SendstackError`
- `DEFAULT_BASE_URL`
- default export: `Sendstack`

Important type exports:

- `SendstackClientOptions`
- `EmailDefaults`
- `SmsDefaults`
- `SendstackRequestOptions`
- `SendstackMutationOptions`
- `SendstackRawRequestOptions`
- `SendstackAuthStrategy`
- `SendstackRetryOptions`
- `SendstackMiddleware`
- `SendEmailRequest`
- `SendEmailResult`
- `SendEmailBatchRequest`
- `SendEmailBatchResult`
- `EmailMessage`
- `EmailEvent`
- `SendSmsRequest`
- `SendSmsResult`
- `SendSmsBatchRequest`
- `SendSmsBatchResult`
- `SmsMessage`
- `SmsEvent`
- `UploadAttachmentRequest`
- `UploadedAttachment`
- `CreateDomainRequest`
- `Domain`
- `CreateTemplateRequest`
- `UpdateTemplateRequest`
- `EmailTemplate`
- `PreviewTemplateRequest`
- `TemplatePreview`
- `TemplateVariable`
- `CreateWebhookEndpointRequest`
- `UpdateWebhookEndpointRequest`
- `WebhookEndpoint`
- `RetryWebhookEventResult`
- `CreateSuppressionRequest`
- `CreateSuppressionResult`
- `Suppression`
- `CursorPage`

## Relationship To `@norialabs/sendkit`

`@norialabs/sendstack` is for the SendStack email SaaS API.

Use `@norialabs/sendkit` for WhatsApp and bulk SMS gateway wrappers.
