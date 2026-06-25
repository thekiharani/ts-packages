# `@norialabs/sendkit`

Modular TypeScript/JavaScript SDK for WhatsApp and bulk SMS providers.

Node `>=20` is required. The package is ESM-only and designed for Node.js services, workers, and serverless messaging flows.

Use `sendkit` when you want direct provider wrappers:

- Meta WhatsApp Cloud API
- Onfon bulk SMS
- Africa's Talking SMS

For SendStack email SaaS, use `@norialabs/sendstack` instead.

## Install

```bash
npm install @norialabs/sendkit
```

## Import Paths

Import the whole package:

```ts
import {
  AfricasTalkingSmsClient,
  MetaWhatsAppClient,
  OnfonSmsClient,
} from "@norialabs/sendkit";
```

Or import only what you need:

```ts
import { MetaWhatsAppClient } from "@norialabs/sendkit/whatsapp";
import { OnfonSmsClient } from "@norialabs/sendkit/sms/onfon";
import { AfricasTalkingSmsClient } from "@norialabs/sendkit/sms/africastalking";
import {
  requireValidMetaSignature,
  resolveMetaSubscriptionChallenge,
} from "@norialabs/sendkit/webhooks";
```

Available subpaths:

- `@norialabs/sendkit`
- `@norialabs/sendkit/whatsapp`
- `@norialabs/sendkit/sms`
- `@norialabs/sendkit/sms/onfon`
- `@norialabs/sendkit/sms/africastalking`
- `@norialabs/sendkit/webhooks`

## Quick Start

### WhatsApp

```ts
import { MetaWhatsAppClient } from "@norialabs/sendkit/whatsapp";

const whatsapp = new MetaWhatsAppClient({
  accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID!,
});

await whatsapp.sendText({
  recipient: "254700123456",
  text: "Hello from Noria",
});
```

### Onfon SMS

```ts
import { OnfonSmsClient } from "@norialabs/sendkit/sms/onfon";

const sms = new OnfonSmsClient({
  accessKey: process.env.ONFON_ACCESS_KEY!,
  apiKey: process.env.ONFON_API_KEY!,
  clientId: process.env.ONFON_CLIENT_ID!,
  defaultSenderId: "NORIALABS",
});

await sms.send({
  messages: [
    { recipient: "254700123456", text: "Your OTP is 123456", reference: "otp-1" },
  ],
});
```

### Africa's Talking SMS

```ts
import { AfricasTalkingSmsClient } from "@norialabs/sendkit/sms/africastalking";

const sms = new AfricasTalkingSmsClient({
  apiKey: process.env.AFRICASTALKING_API_KEY!,
  username: process.env.AFRICASTALKING_USERNAME!,
  defaultSenderId: "NORIALABS",
});

await sms.send({
  messages: [
    { recipient: "+254700123456", text: "Your OTP is 123456", reference: "otp-1" },
  ],
});
```

## Provider Coverage

| Provider | Capabilities |
| --- | --- |
| Meta WhatsApp | Text, templates, media by ID or URL, media upload/get/delete, location, contacts, reactions, interactive buttons/lists, catalog, single product, product list, flows, mark-read, typing indicator, template management, delivery parsing, inbound parsing |
| Onfon SMS | Bulk SMS send, scheduled SMS, Unicode/flash flags, balance, groups, templates, delivery report parsing |
| Africa's Talking SMS | Bulk SMS send, premium SMS reply, incoming message fetch, subscription create/delete, balance, delivery report parsing |

Non-SMS Africa's Talking products such as Airtime, Voice, USSD, Payments, and Data Bundles are intentionally outside the current `sendkit` SMS scope.

## Shared Transport

Every provider client supports:

- `fetch`: custom Fetch implementation
- `timeoutMs`: request timeout
- `defaultHeaders`: extra default headers
- `retry`: retry policy or `false`
- `hooks`: `beforeRequest`, `afterResponse`, `onError`

Per-request options:

- `headers`
- `signal`
- `timeoutMs`
- `retry`

Example:

```ts
const sms = new OnfonSmsClient({
  accessKey: "access-key",
  apiKey: "api-key",
  clientId: "client-id",
  timeoutMs: 15_000,
  retry: {
    maxAttempts: 3,
    retryMethods: ["GET", "POST"],
    retryOnStatuses: [429, 500, 502, 503, 504],
    retryOnNetworkError: true,
    baseDelayMs: 250,
  },
  hooks: {
    beforeRequest(context) {
      context.headers.set("x-trace-id", "trace-123");
    },
  },
});
```

## WhatsApp: Meta Cloud API

### Construction

```ts
const whatsapp = new MetaWhatsAppClient({
  accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID!,
  whatsappBusinessAccountId: process.env.META_WHATSAPP_WHATSAPP_BUSINESS_ACCOUNT_ID,
  appSecret: process.env.META_WHATSAPP_APP_SECRET,
  webhookVerifyToken: process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN,
});
```

`whatsappBusinessAccountId` is required only for template management methods.

### From Env

```ts
const whatsapp = MetaWhatsAppClient.fromEnv();
```

Supported env vars:

- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_WHATSAPP_BUSINESS_ACCOUNT_ID`
- `META_WHATSAPP_APP_SECRET`
- `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `META_WHATSAPP_API_VERSION`
- `META_WHATSAPP_BASE_URL`
- `META_WHATSAPP_TIMEOUT_SECONDS`

### WhatsApp Method Reference

| Method | Purpose |
| --- | --- |
| `sendText(request, options?)` | Send text messages with optional URL preview |
| `sendTemplate(request, options?)` | Send approved template messages, including text/media/button parameters |
| `sendMedia(request, options?)` | Send image, audio, document, sticker, or video by uploaded media ID or public URL |
| `sendLocation(request, options?)` | Send a location pin |
| `sendContacts(request, options?)` | Send one or more contacts |
| `sendReaction(request, options?)` | React to an existing message |
| `sendInteractive(request, options?)` | Send reply-button or list interactive messages |
| `sendCatalog(request, options?)` | Send catalog messages |
| `sendProduct(request, options?)` | Send a single-product message |
| `sendProductList(request, options?)` | Send a multi-product list |
| `sendFlow(request, options?)` | Send a WhatsApp Flow interactive message |
| `markMessageRead(request, options?)` | Mark an inbound message as read |
| `sendTypingIndicator(request, options?)` | Mark an inbound message as read and show a typing indicator |
| `uploadMedia(request, options?)` | Upload media bytes to Meta |
| `getMedia(mediaId, options?)` | Get media metadata and download URL |
| `deleteMedia(mediaId, options?)` | Delete uploaded media |
| `listTemplates(request?, options?)` | List templates for a WABA |
| `getTemplate(templateId, fields?, options?)` | Fetch one template |
| `createTemplate(request, options?)` | Create a template |
| `updateTemplate(templateId, request, options?)` | Update a template |
| `deleteTemplate(request, options?)` | Delete a template by name, ID, or IDs |
| `parseEvents(payload)` | Parse delivery/read/failed webhook statuses |
| `parseInboundMessages(payload)` | Parse inbound messages |
| `parseEvent(payload)` | Return the first parsed delivery event or `null` |
| `parseInboundMessage(payload)` | Return the first parsed inbound message or `null` |

### Text

```ts
await whatsapp.sendText({
  recipient: "254700123456",
  text: "Plain text message",
  previewUrl: true,
  replyToMessageId: "wamid.previous",
});
```

### Templates

Template messages support text, media, and button parameters. For media template headers, pass a parameter of type `image`, `video`, or `document` and either provide the provider-specific object through `providerOptions`, or pass `value` to use an uploaded media ID.

```ts
await whatsapp.sendTemplate({
  recipient: "254700123456",
  templateName: "order_update",
  languageCode: "en",
  components: [
    {
      type: "header",
      parameters: [
        {
          type: "document",
          providerOptions: {
            document: {
              id: "media-id",
              filename: "invoice.pdf",
            },
          },
        },
      ],
    },
    {
      type: "body",
      parameters: [
        { type: "text", value: "NORIA-123" },
        { type: "text", value: "Ready for pickup" },
      ],
    },
    {
      type: "button",
      subType: "quick_reply",
      index: 0,
      parameters: [{ type: "payload", value: "track-order" }],
    },
  ],
});
```

### Media And Attachments

Meta WhatsApp calls these files “media”. You can send media by public URL, send media by uploaded ID, or upload bytes first and then use the returned media ID.

```ts
await whatsapp.sendMedia({
  recipient: "254700123456",
  mediaType: "image",
  link: "https://example.com/product.jpg",
  caption: "Preview",
});

const uploaded = await whatsapp.uploadMedia({
  filename: "menu.pdf",
  mimeType: "application/pdf",
  content: Buffer.from("file-bytes"),
});

await whatsapp.sendMedia({
  recipient: "254700123456",
  mediaType: "document",
  mediaId: uploaded.mediaId,
  filename: "menu.pdf",
});

await whatsapp.getMedia(uploaded.mediaId);
await whatsapp.deleteMedia(uploaded.mediaId);
```

Supported media types:

- `image`
- `audio`
- `document`
- `sticker`
- `video`

### Location, Contacts, And Reactions

```ts
await whatsapp.sendLocation({
  recipient: "254700123456",
  latitude: -1.286389,
  longitude: 36.817223,
  name: "Nairobi Office",
  address: "Nairobi, Kenya",
});

await whatsapp.sendContacts({
  recipient: "254700123456",
  contacts: [
    {
      name: { formattedName: "Noria Support", firstName: "Noria" },
      phones: [{ phone: "+254700000000", type: "WORK" }],
      emails: [{ email: "support@example.com", type: "WORK" }],
    },
  ],
});

await whatsapp.sendReaction({
  recipient: "254700123456",
  messageId: "wamid.inbound",
  emoji: "👍",
});
```

### Interactive, Catalog, Product, And Flow Messages

```ts
await whatsapp.sendInteractive({
  recipient: "254700123456",
  interactiveType: "button",
  bodyText: "Choose one",
  buttons: [
    { identifier: "yes", title: "Yes" },
    { identifier: "no", title: "No" },
  ],
});

await whatsapp.sendInteractive({
  recipient: "254700123456",
  interactiveType: "list",
  bodyText: "Choose a product",
  buttonText: "View options",
  sections: [
    {
      title: "Products",
      rows: [
        { identifier: "sku-1", title: "Starter" },
        { identifier: "sku-2", title: "Pro" },
      ],
    },
  ],
});

await whatsapp.sendCatalog({
  recipient: "254700123456",
  bodyText: "Browse our catalog",
});

await whatsapp.sendProduct({
  recipient: "254700123456",
  catalogId: "catalog-1",
  productRetailerId: "sku-1",
});

await whatsapp.sendProductList({
  recipient: "254700123456",
  catalogId: "catalog-1",
  header: { type: "text", text: "Featured" },
  sections: [
    {
      title: "Top Picks",
      productItems: [{ productRetailerId: "sku-1" }],
    },
  ],
});

await whatsapp.sendFlow({
  recipient: "254700123456",
  flowCta: "Start",
  flowId: "flow-1",
  flowAction: "navigate",
});
```

### Read Receipts And Typing Indicator

```ts
await whatsapp.markMessageRead({
  messageId: "wamid.inbound",
});

await whatsapp.sendTypingIndicator({
  messageId: "wamid.inbound",
});
```

### Template Management

```ts
const list = await whatsapp.listTemplates({
  limit: 20,
  status: ["approved"],
  fields: ["name", "status", "category", "language", "components"],
});

await whatsapp.getTemplate("template-id");

await whatsapp.createTemplate({
  name: "order_update",
  language: "en_US",
  category: "utility",
  components: [
    {
      type: "body",
      text: "Order {{1}} is ready",
      example: {
        body_text: [["NORIA-123"]],
      },
    },
  ],
});

await whatsapp.updateTemplate("template-id", {
  category: "utility",
});

await whatsapp.deleteTemplate({ templateId: "template-id" });
```

### WhatsApp Webhooks

```ts
const deliveryEvents = whatsapp.parseEvents(metaWebhookPayload);
const inboundMessages = whatsapp.parseInboundMessages(metaWebhookPayload);
```

`parseInboundMessages` supports inbound text, media, location, contacts, button replies, interactive replies, reactions, and unsupported message fallback metadata.

## SMS: Shared Types

All SMS providers use the shared send shape:

```ts
await sms.send({
  senderId: "NORIALABS",
  messages: [
    {
      recipient: "254700123456",
      text: "Hello",
      reference: "internal-id",
      metadata: { accountId: "acct_1" },
    },
  ],
  scheduleAt: new Date("2026-06-26T09:00:00.000Z"),
  isUnicode: false,
  isFlash: false,
  providerOptions: {},
});
```

`providerOptions` is passed through to the underlying provider payload when you need provider-specific fields.

## SMS: Onfon

### Construction

```ts
const sms = new OnfonSmsClient({
  accessKey: process.env.ONFON_ACCESS_KEY!,
  apiKey: process.env.ONFON_API_KEY!,
  clientId: process.env.ONFON_CLIENT_ID!,
  defaultSenderId: "NORIALABS",
});
```

### From Env

```ts
const sms = OnfonSmsClient.fromEnv();
```

Supported env vars:

- `ONFON_ACCESS_KEY`
- `ONFON_API_KEY`
- `ONFON_CLIENT_ID`
- `ONFON_SENDER_ID`
- `ONFON_BASE_URL`
- `ONFON_TIMEOUT_SECONDS`

### Onfon Method Reference

| Method | Purpose |
| --- | --- |
| `send(request, options?)` | Send one or more SMS messages |
| `getBalance(options?)` | Read SMS balance |
| `listGroups(options?)` | List contact groups |
| `createGroup(request, options?)` | Create a contact group |
| `updateGroup(groupId, request, options?)` | Update a contact group |
| `deleteGroup(groupId, options?)` | Delete a contact group |
| `listTemplates(options?)` | List SMS templates |
| `createTemplate(request, options?)` | Create an SMS template |
| `updateTemplate(templateId, request, options?)` | Update an SMS template |
| `deleteTemplate(templateId, options?)` | Delete an SMS template |
| `parseDeliveryReport(payload)` | Parse delivery-report callbacks |

### Onfon Examples

```ts
const result = await sms.send({
  senderId: "NORIALABS",
  messages: [
    { recipient: "254700123456", text: "Hello there", reference: "msg-1" },
    { recipient: "254711111111", text: "Hello again", reference: "msg-2" },
  ],
  isUnicode: false,
});

await sms.getBalance();

const group = await sms.createGroup({ name: "VIP Customers" });
await sms.updateGroup(group.resourceId!, { name: "Priority Customers" });
await sms.deleteGroup(group.resourceId!);

const template = await sms.createTemplate({
  name: "otp",
  body: "Your OTP is {{1}}",
});
await sms.updateTemplate(template.resourceId!, {
  name: "otp",
  body: "Use code {{1}}",
});
await sms.deleteTemplate(template.resourceId!);

const report = sms.parseDeliveryReport({
  messageId: "abc123",
  mobile: "254700123456",
  status: "Delivered",
});
```

## SMS: Africa's Talking

### Construction

```ts
const sms = new AfricasTalkingSmsClient({
  apiKey: process.env.AFRICASTALKING_API_KEY!,
  username: process.env.AFRICASTALKING_USERNAME!,
  defaultSenderId: "NORIALABS",
});
```

Use `AFRICASTALKING_SANDBOX_SMS_BASE_URL` for sandbox clients:

```ts
const sandboxSms = new AfricasTalkingSmsClient({
  apiKey: process.env.AFRICASTALKING_API_KEY!,
  username: "sandbox",
  baseUrl: AFRICASTALKING_SANDBOX_SMS_BASE_URL,
});
```

### From Env

```ts
const sms = AfricasTalkingSmsClient.fromEnv();
```

Supported env vars:

- `AFRICASTALKING_API_KEY`
- `AFRICASTALKING_USERNAME`
- `AFRICASTALKING_SENDER_ID`
- `AFRICASTALKING_BASE_URL`
- `AFRICASTALKING_TIMEOUT_SECONDS`

Fallback env vars are also accepted:

- `AFRICAS_TALKING_API_KEY`
- `AFRICAS_TALKING_USERNAME`
- `AFRICAS_TALKING_SENDER_ID`
- `AFRICAS_TALKING_BASE_URL`

### Africa's Talking Method Reference

| Method | Purpose |
| --- | --- |
| `send(request, options?)` | Send normal bulk SMS |
| `sendPremium(request, options?)` | Send premium SMS replies using keyword and link ID |
| `fetchMessages(request?, options?)` | Fetch incoming SMS messages |
| `createSubscription(request, options?)` | Opt a phone number into a premium SMS subscription |
| `deleteSubscription(request, options?)` | Remove a premium SMS subscription |
| `getBalance(options?)` | Read account balance |
| `parseDeliveryReport(payload)` | Parse delivery-report callbacks |

### Normal SMS

```ts
await sms.send({
  senderId: "NORIALABS",
  messages: [
    { recipient: "+254700123456", text: "Hello", reference: "msg-1" },
    { recipient: "+254711111111", text: "Hello", reference: "msg-2" },
  ],
  providerOptions: {
    enqueue: "1",
  },
});
```

The client groups messages by text because Africa's Talking accepts one message body per request and many recipients.

### Premium SMS

```ts
await sms.sendPremium({
  recipient: "+254700123456",
  shortCode: "22384",
  keyword: "NORIA",
  linkId: "link-id-from-inbound-message",
  text: "Thanks for subscribing",
  retryDurationInHours: 2,
});
```

### Incoming Messages

```ts
const inbox = await sms.fetchMessages({
  lastReceivedId: 42,
});

for (const message of inbox.messages) {
  console.log(message.providerMessageId, message.sender, message.text);
}
```

### Premium Subscriptions

```ts
await sms.createSubscription({
  phoneNumber: "+254700123456",
  shortCode: "22384",
  keyword: "NORIA",
});

await sms.deleteSubscription({
  phoneNumber: "+254700123456",
  shortCode: "22384",
  keyword: "NORIA",
});
```

### Balance And Delivery Reports

```ts
const balance = await sms.getBalance();

const event = sms.parseDeliveryReport({
  id: "at-message-id",
  phoneNumber: "+254700123456",
  status: "Success",
  networkCode: "63902",
  retryCount: "0",
});
```

## Webhooks

### Meta Verification Challenge

```ts
const challenge = resolveMetaSubscriptionChallenge(
  {
    "hub.mode": "subscribe",
    "hub.verify_token": "verify-me",
    "hub.challenge": "12345",
  },
  "verify-me",
);
```

### Meta Signature Verification

```ts
import { requireValidMetaSignature } from "@norialabs/sendkit/webhooks";

requireValidMetaSignature(rawBody, req.headers["x-hub-signature-256"], appSecret);
```

### SMS Delivery Reports

```ts
import {
  parseAfricasTalkingSmsDeliveryReport,
  parseOnfonDeliveryReport,
} from "@norialabs/sendkit/webhooks";

const onfonEvent = parseOnfonDeliveryReport(req.query, onfonClient);
const atEvent = parseAfricasTalkingSmsDeliveryReport(req.body, africasTalkingClient);
```

## Errors

Important exported errors:

- `SendKitError`
- `ConfigurationError`
- `ApiError`
- `ProviderError`
- `NetworkError`
- `TimeoutError`
- `WebhookVerificationError`

Provider errors include provider response details where available.

```ts
import { ProviderError } from "@norialabs/sendkit";

try {
  await sms.send({ messages: [] });
} catch (error) {
  if (error instanceof ProviderError) {
    console.error(error.provider, error.errorCode, error.responseBody);
  }
}
```

## Runtime Exports

Root exports:

- `OnfonSmsClient`
- `AfricasTalkingSmsClient`
- `MetaWhatsAppClient`
- `ONFON_BASE_URL`
- `ONFON_SMS_BASE_URL`
- `AFRICASTALKING_SMS_BASE_URL`
- `AFRICASTALKING_SANDBOX_SMS_BASE_URL`
- `META_GRAPH_BASE_URL`
- `META_GRAPH_API_VERSION`
- `parseAfricasTalkingDeliveryReport`
- `parseOnfonDeliveryReport`
- `parseAfricasTalkingSmsDeliveryReport`
- `resolveMetaSubscriptionChallenge`
- `verifyMetaSignature`
- `requireValidMetaSignature`
- all exported error classes

Provider-specific subpaths export the same provider classes and related types for that provider.

## Important Type Exports

SMS:

- `SmsClient`
- `SmsManagementClient`
- `SmsSendRequest`
- `SmsSendResult`
- `SmsSendReceipt`
- `SmsMessage`
- `SmsBalance`
- `SmsGroup`
- `SmsTemplate`
- `AfricasTalkingPremiumSmsRequest`
- `AfricasTalkingFetchMessagesResult`
- `AfricasTalkingIncomingMessage`
- `AfricasTalkingSubscriptionRequest`
- `AfricasTalkingSubscriptionResult`

WhatsApp:

- `WhatsAppClient`
- `WhatsAppTemplateManagementClient`
- `WhatsAppTextRequest`
- `WhatsAppTemplateRequest`
- `WhatsAppMediaRequest`
- `WhatsAppLocationRequest`
- `WhatsAppContactsRequest`
- `WhatsAppReactionRequest`
- `WhatsAppInteractiveRequest`
- `WhatsAppCatalogMessageRequest`
- `WhatsAppProductMessageRequest`
- `WhatsAppProductListRequest`
- `WhatsAppFlowMessageRequest`
- `WhatsAppReadRequest`
- `WhatsAppStatusResult`
- `WhatsAppMediaUploadRequest`
- `WhatsAppMediaUploadResult`
- `WhatsAppManagedTemplate`
- `WhatsAppInboundMessage`
- `WhatsAppSendResult`

Core:

- `RequestOptions`
- `RetryPolicy`
- `Hooks`
- `DeliveryEvent`
- `DeliveryState`
- `MessageChannel`

## Versioning And Publish Notes

The package publishes only built JavaScript, declaration files, and this package guide. The publish build uses `build:dist`, which does not emit sourcemaps.
