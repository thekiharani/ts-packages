# `noria-ts`

TypeScript package monorepo for Noria Labs.

Published packages:

- `@norialabs/comm`: SMS and WhatsApp messaging SDK for Onfon and Meta Cloud API
- `@norialabs/logger`: structured JSON logging for Node.js services
- `@norialabs/sendstack`: JavaScript SDK for Sendstack email, SMS, WhatsApp, and merchant messaging APIs
- `@norialabs/payments`: payments SDK for M-PESA Daraja, SasaPay, and Paystack
- `@norialabs/storage`: S3 and R2 storage client for Node.js services

Quick install examples:

```bash
npm install @norialabs/logger
npm install @norialabs/sendstack
npm install @norialabs/comm
npm install @norialabs/payments
npm install @norialabs/storage
```

Repo layout:

- `comm/` -> `@norialabs/comm`
- `logger/` -> `@norialabs/logger`
- `sendstack/` -> `@norialabs/sendstack`
- `noriapay/` -> `@norialabs/payments`
- `storage/` -> `@norialabs/storage`

Each package is versioned and published from its own directory, with package-specific docs in its local `README.md`.
