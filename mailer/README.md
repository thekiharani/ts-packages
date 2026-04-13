# `@norialabs/mailer`

Compatibility package for `@norialabs/sendstack`.

For new projects, install `@norialabs/sendstack` instead:

```bash
npm install @norialabs/sendstack
```

## Why This Exists

`@norialabs/mailer` was the original package name when the SDK mainly targeted email flows.

The SDK now exposes the broader Sendstack messaging surface:

- email
- SMS
- WhatsApp
- merchant/control-plane messaging routes

Because of that, `@norialabs/sendstack` is now the canonical package name.

## Migration

Replace:

```ts
import { Mailer } from "@norialabs/mailer";
```

with:

```ts
import { Mailer } from "@norialabs/sendstack";
```

The public client shape remains the same.

## Current API Surface

The compatibility package still exposes the same Sendstack-first helpers:

- `emails`
- `sms`
- `whatsapp`
- `merchant`
- `health`
- raw `request(...)`

## Canonical Docs

Use the full docs in [`../sendstack/README.md`](../sendstack/README.md).

## License

[MIT](./LICENSE)
