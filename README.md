# `noria-ts`

TypeScript package monorepo for Noria Labs.

Published packages:

- `@noria/logger`: structured JSON logging for Node.js services
- `@noria/mailer`: JavaScript SDK for the Noria Mailer API
- `@noria/payments`: payments SDK for M-PESA Daraja and SasaPay
- `@noria/storage`: S3 and R2 storage client for Node.js services

Quick install examples:

```bash
npm install @noria/logger
npm install @noria/mailer
npm install @noria/payments
npm install @noria/storage
```

Repo layout:

- `logger/` -> `@noria/logger`
- `mailer/` -> `@noria/mailer`
- `noriapay/` -> `@noria/payments`
- `storage/` -> `@noria/storage`

Each package is versioned and published from its own directory, with package-specific docs in its local `README.md`.
