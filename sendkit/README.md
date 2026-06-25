# `@norialabs/sendkit`

Modular TypeScript/JavaScript SDK for WhatsApp and bulk SMS providers.

Node `>=20` is required.

Designed for Node.js services, workers, and serverless messaging flows.

Import only the WhatsApp client or the SMS gateway client you need.

## Install

```bash
npm install @norialabs/sendkit
```

## What This Package Gives You

- one package for WhatsApp and bulk SMS client wrappers
- Onfon SMS send, balance, groups, templates, and delivery report parsing
- Africa's Talking SMS send, balance, and delivery report parsing
- Meta WhatsApp text, template, media, location, contacts, reaction, interactive, catalog, product, product-list, and flow sends
- Meta WhatsApp template management and media upload helpers
- reusable fetch-based transport with retries, hooks, and typed errors
- generic webhook helpers for Meta signature verification and subscription challenge resolution

## Quick Start

### WhatsApp only

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

### Onfon SMS only

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

### Africa's Talking SMS only

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

## Main Exports

```ts
import {
  OnfonSmsClient,
  AfricasTalkingSmsClient,
  MetaWhatsAppClient,
  resolveMetaSubscriptionChallenge,
  verifyMetaSignature,
} from "@norialabs/sendkit";
```

Subpath exports:

```ts
import { OnfonSmsClient } from "@norialabs/sendkit/sms/onfon";
import { AfricasTalkingSmsClient } from "@norialabs/sendkit/sms/africastalking";
import { MetaWhatsAppClient } from "@norialabs/sendkit/whatsapp";
import { resolveMetaSubscriptionChallenge } from "@norialabs/sendkit/webhooks";
```

## SMS

### Onfon client construction

```ts
import { OnfonSmsClient } from "@norialabs/sendkit/sms/onfon";

const sms = new OnfonSmsClient({
  accessKey: process.env.ONFON_ACCESS_KEY!,
  apiKey: process.env.ONFON_API_KEY!,
  clientId: process.env.ONFON_CLIENT_ID!,
  defaultSenderId: "NORIALABS",
});
```

### Environment construction

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

### Send SMS

```ts
const result = await sms.send({
  senderId: "NORIALABS",
  messages: [
    { recipient: "254700123456", text: "Hello there", reference: "msg-1" },
    { recipient: "254711111111", text: "Hello again", reference: "msg-2" },
  ],
  isUnicode: false,
});
```

### Balance, groups, and templates

```ts
await sms.getBalance();
await sms.listGroups();
await sms.createGroup({ name: "VIP Customers" });
await sms.updateGroup("group-1", { name: "Priority Customers" });
await sms.deleteGroup("group-1");

await sms.listTemplates();
await sms.createTemplate({ name: "otp", body: "Your OTP is {{1}}" });
await sms.updateTemplate("template-1", { name: "otp", body: "Use code {{1}}" });
await sms.deleteTemplate("template-1");
```

### Delivery reports

```ts
const report = sms.parseDeliveryReport({
  messageId: "abc123",
  mobile: "254700123456",
  status: "Delivered",
});
```

## WhatsApp

### Meta client construction

```ts
import { MetaWhatsAppClient } from "@norialabs/sendkit/whatsapp";

const whatsapp = new MetaWhatsAppClient({
  accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID!,
  whatsappBusinessAccountId: process.env.META_WHATSAPP_WHATSAPP_BUSINESS_ACCOUNT_ID!,
  appSecret: process.env.META_WHATSAPP_APP_SECRET,
  webhookVerifyToken: process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN,
});
```

### Environment construction

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

### Send messages

```ts
await whatsapp.sendText({
  recipient: "254700123456",
  text: "Plain text message",
  previewUrl: true,
});

await whatsapp.sendTemplate({
  recipient: "254700123456",
  templateName: "order_update",
  languageCode: "en",
  components: [
    {
      type: "body",
      parameters: [{ type: "text", value: "NORIA-123" }],
    },
  ],
});

await whatsapp.sendMedia({
  recipient: "254700123456",
  mediaType: "image",
  link: "https://example.com/product.jpg",
  caption: "Preview",
});

await whatsapp.sendLocation({
  recipient: "254700123456",
  latitude: -1.286389,
  longitude: 36.817223,
  name: "Nairobi Office",
});
```

### Interactive, commerce, and flow messages

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

### Template management

```ts
await whatsapp.listTemplates({ limit: 20 });
await whatsapp.getTemplate("tmpl-1");
await whatsapp.createTemplate({
  name: "order_update",
  language: "en_US",
  category: "utility",
  components: [
    {
      type: "body",
      text: "Order {{1}} is ready",
    },
  ],
});
await whatsapp.updateTemplate("tmpl-1", {
  category: "utility",
});
await whatsapp.deleteTemplate({ templateId: "tmpl-1" });
```

### Media helpers

```ts
await whatsapp.uploadMedia({
  filename: "menu.pdf",
  mimeType: "application/pdf",
  content: Buffer.from("file-bytes"),
});

await whatsapp.getMedia("media-1");
await whatsapp.deleteMedia("media-1");
```

### Parsing delivery and inbound events

```ts
const deliveryEvents = whatsapp.parseEvents(metaWebhookPayload);
const inboundMessages = whatsapp.parseInboundMessages(metaWebhookPayload);
```

## Webhooks

### Resolve Meta subscription challenge

```ts
import { resolveMetaSubscriptionChallenge } from "@norialabs/sendkit/webhooks";

const challenge = resolveMetaSubscriptionChallenge(
  {
    "hub.mode": "subscribe",
    "hub.verify_token": "verify-me",
    "hub.challenge": "12345",
  },
  "verify-me",
);
```

### Verify Meta signature

```ts
import { requireValidMetaSignature } from "@norialabs/sendkit/webhooks";

requireValidMetaSignature(rawBody, req.headers["x-hub-signature-256"], appSecret);
```

### Parse Onfon delivery reports

```ts
import { parseOnfonDeliveryReport } from "@norialabs/sendkit/webhooks";

const event = parseOnfonDeliveryReport(req.query, smsClient);
```

## Transport customization

Provider clients support:

- custom `fetch`
- `timeoutMs`
- `defaultHeaders`
- `retry`
- `hooks`

Example:

```ts
const sms = new OnfonSmsClient({
  accessKey: "access-key",
  apiKey: "api-key",
  clientId: "client-id",
  fetch: customFetch,
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

## Errors

Important exported errors:

- `ConfigurationError`
- `SendKitError`
- `ApiError`
- `ProviderError`
- `NetworkError`
- `TimeoutError`
- `WebhookVerificationError`

## Package scope

Implemented today:

- Onfon SMS send, balance, groups, templates, and delivery report parsing
- Meta WhatsApp sends, template management, media helpers, and webhook event parsing

Not implemented today:

- extra SMS providers
- framework-specific webhook adapters
