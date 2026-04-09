# `@noria/storage`

Configurable object storage client for S3-compatible providers, with first-class support for AWS S3 and Cloudflare R2.

Node `>=20` is required.

## Install

```bash
npm install @noria/storage
```

## What This Package Gives You

- one API for both AWS S3 and Cloudflare R2
- direct object operations and presigned URL generation
- public URL derivation with sensible defaults and override hooks
- constructor-level defaults for metadata, tags, content headers, and TTLs
- raw AWS command overrides when you need lower-level S3 options
- injectable S3 client and presigner hooks for advanced runtime control

## Exports

```ts
import StorageClient, {
  DEFAULT_DOWNLOAD_EXPIRES_IN,
  DEFAULT_R2_REGION,
  DEFAULT_S3_REGION,
  DEFAULT_UPLOAD_EXPIRES_IN,
  MAX_PRESIGN_EXPIRES_IN,
  StorageError,
  createStorageClient,
  joinStorageKey,
} from "@noria/storage";
```

- `StorageClient` is the main class and the default export
- `createStorageClient(options)` is a convenience wrapper around `new StorageClient(options)`
- `joinStorageKey(...parts)` normalizes storage keys the same way the client does
- `DEFAULT_S3_REGION`, `DEFAULT_R2_REGION`, `DEFAULT_UPLOAD_EXPIRES_IN`, `DEFAULT_DOWNLOAD_EXPIRES_IN`, and `MAX_PRESIGN_EXPIRES_IN` expose the package defaults
- `StorageError` is the package error type for wrapped operation failures

Useful exported types include:

- `StorageClientOptions`
- `StorageProvider`
- `StorageUrlStyle`
- `StorageKey`
- `StorageMetadata`
- `StorageTags`
- `StorageObjectTarget`
- `StorageObjectDescriptor`
- `PutObjectInput` and `PutObjectResult`
- `HeadObjectInput` and `HeadObjectResult`
- `DeleteObjectInput` and `DeleteObjectResult`
- `CreatePresignedUploadUrlInput`
- `CreatePresignedDownloadUrlInput`
- `CreatePublicUrlInput`
- `PresignedRequest`
- `ResolvedStoragePublicUrlInput`
- `StorageOperation`
- `StorageOperationContext`
- `StorageCommandClient`
- `StoragePresignHandler`

## Quick Start

```ts
import { StorageClient } from "@noria/storage";

const storage = new StorageClient({
  bucket: "documents",
  region: "eu-west-1",
  keyPrefix: "tenant-a",
  publicBaseUrl: "https://cdn.example.com",
});

await storage.putObject({
  key: ["invoices", "march-2026.pdf"],
  body: Buffer.from("hello"),
  contentType: "application/pdf",
  metadata: {
    source: "admin",
  },
});

const upload = await storage.createPresignedUploadUrl({
  key: ["uploads", "avatar.png"],
  contentType: "image/png",
});
```

## Defaults And Provider Behavior

| Setting | S3 | R2 |
| --- | --- | --- |
| `provider` default | `"s3"` | n/a |
| `region` default | `"us-east-1"` | `"auto"` |
| `urlStyle` default | `"virtual-hosted"` | `"path"` |
| derived `endpoint` | none | `https://<accountId>.r2.cloudflarestorage.com` when `accountId` is set |

Other defaults:

- `defaultUploadExpiresIn` defaults to `900` seconds
- `defaultDownloadExpiresIn` defaults to `3600` seconds
- any presign TTL must be a positive integer and may not exceed `604800` seconds

Resolution rules:

- `urlStyle` wins over `forcePathStyle`
- if `urlStyle` is not supplied, `forcePathStyle: true` becomes `"path"` and `forcePathStyle: false` becomes `"virtual-hosted"`
- if neither `urlStyle` nor `forcePathStyle` is supplied, the provider default is used
- explicit `endpoint` wins over derived R2 endpoint generation

## Credentials, Clients, And AWS Overrides

The storage client exposes the same kind of credential override surface that `@noria/logger` exposes for CloudWatch.

### Explicit S3 credentials

```ts
import { StorageClient } from "@noria/storage";

const storage = new StorageClient({
  provider: "s3",
  bucket: "public-assets",
  region: "eu-west-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },
});
```

### Explicit R2 credentials

```ts
import { StorageClient } from "@noria/storage";

const storage = new StorageClient({
  provider: "r2",
  bucket: "attachments",
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  publicBaseUrl: "https://files.example.com",
});
```

### Default AWS SDK credential chain

If `credentials` is omitted, the internally constructed `S3Client` uses the AWS SDK default credential chain as-is.

That means the package works with the usual AWS SDK sources:

- environment variables
- shared config and credentials files
- IAM roles
- web identity
- any other source the AWS SDK would normally resolve

### Custom `client`

You can provide your own `client` if you want full control over transport behavior.

```ts
import { S3Client } from "@aws-sdk/client-s3";
import { StorageClient } from "@noria/storage";

const rawClient = new S3Client({
  region: "eu-west-1",
  maxAttempts: 5,
});

const storage = new StorageClient({
  bucket: "documents",
  region: "eu-west-1",
  client: rawClient,
});
```

Important behavior:

- if `client` is supplied, the package does not construct its own `S3Client`
- `credentials` and `s3ClientConfig` only affect the internally created `S3Client`; they do not reconfigure a custom `client`
- top-level storage settings such as `provider`, `region`, `endpoint`, `publicBaseUrl`, `accountId`, `keyPrefix`, and `urlStyle` still control key resolution, public URL derivation, and normalized results

### Custom `presignUrl`

By default, presigned URLs use `@aws-sdk/s3-request-presigner`'s `getSignedUrl`.

If you supply a custom `client` that is not a real `S3Client`, and you still want presigned URLs, provide a matching `presignUrl` implementation too.

```ts
const storage = new StorageClient({
  bucket: "assets",
  client: myCustomClient,
  presignUrl: async (_client, command, { expiresIn }) => {
    return signSomeOtherWay(command, expiresIn);
  },
});
```

### `s3ClientConfig`

Use `s3ClientConfig` to pass extra AWS SDK `S3Client` options without giving up the higher-level storage API.

```ts
const storage = new StorageClient({
  bucket: "documents",
  region: "eu-west-1",
  s3ClientConfig: {
    maxAttempts: 4,
    retryMode: "standard",
  },
});
```

Notes:

- `s3ClientConfig` is merged first
- top-level `region`, `endpoint`, `credentials`, and resolved `forcePathStyle` win over the same settings
- `s3ClientConfig` exists for extra client tuning, not for replacing the package's storage-level configuration model

## Constructor Reference

### Core Provider Options

| Option | Required | Description |
| --- | --- | --- |
| `bucket` | yes | Default bucket for all operations. Must be a non-empty string. |
| `provider` | no | `"s3"` or `"r2"`. Defaults to `"s3"`. |
| `region` | no | Region for URL generation and the internally created `S3Client`. Defaults to `"us-east-1"` for S3 and `"auto"` for R2. |
| `endpoint` | no | Explicit S3-compatible endpoint. If omitted for R2 and `accountId` is set, the package derives `https://<accountId>.r2.cloudflarestorage.com`. |
| `accountId` | no | R2 account ID used to derive the default R2 endpoint when `endpoint` is omitted. Ignored for S3 public URL derivation. |
| `credentials` | no | Passed to the internally created `S3Client` as `S3ClientConfig["credentials"]`. Supports static credentials or a credential provider function. |
| `publicBaseUrl` | no | Base URL used first when deriving public URLs. Useful for CDNs or custom public domains. Trailing slashes are normalized away. |
| `keyPrefix` | no | Prefix added to every resolved key before the optional `resolveKey` hook runs. Supports string or string-array input. |
| `urlStyle` | no | `"path"` or `"virtual-hosted"`. Controls endpoint and public URL formatting. Takes precedence over `forcePathStyle`. |
| `forcePathStyle` | no | Compatibility alias for the AWS SDK path-style setting. Only used when `urlStyle` is not provided. |

### Default Object Options

| Option | Required | Description |
| --- | --- | --- |
| `defaultMetadata` | no | Default metadata merged into `putObject` and `createPresignedUploadUrl`. Per-call metadata wins on conflicts. |
| `defaultTags` | no | Default object tags merged into `putObject` and `createPresignedUploadUrl`. Per-call tags win on conflicts. |
| `defaultContentType` | no | Default `ContentType` for uploads when a call does not set one directly. |
| `defaultCacheControl` | no | Default `CacheControl` for uploads when a call does not set one directly. |
| `defaultContentDisposition` | no | Default `ContentDisposition` for uploads when a call does not set one directly. |
| `defaultContentEncoding` | no | Default `ContentEncoding` for uploads when a call does not set one directly. |
| `defaultContentLanguage` | no | Default `ContentLanguage` for uploads when a call does not set one directly. |
| `defaultUploadExpiresIn` | no | Default TTL, in seconds, for `createPresignedUploadUrl`. Defaults to `900`. Must be `1..604800`. |
| `defaultDownloadExpiresIn` | no | Default TTL, in seconds, for `createPresignedDownloadUrl`. Defaults to `3600`. Must be `1..604800`. |

### Extension Points

| Option | Required | Description |
| --- | --- | --- |
| `client` | no | Custom command client with a `send(command)` method. If supplied, it replaces the internally constructed `S3Client`. |
| `presignUrl` | no | Custom presign handler. Receives the resolved client, the AWS command, and `{ expiresIn }`. |
| `s3ClientConfig` | no | Extra AWS SDK `S3Client` options. Cannot override `region`, `endpoint`, `credentials`, or `forcePathStyle`; the top-level storage options own those. |
| `resolveKey` | no | Hook that receives the normalized key after `keyPrefix` has been applied. Return the final key to send to storage. Receives `{ operation, bucket, provider }`. |
| `buildPublicUrl` | no | Hook that receives the fully resolved public URL input and returns the final public URL string. This is the highest-priority public URL override. |

## Key, Bucket, And URL Resolution

### Key normalization

Every API that accepts a `key` supports either:

- a string, such as `"reports/march.pdf"`
- an array of path segments, such as `["reports", "march.pdf"]`

Normalization rules:

- nested arrays are flattened
- non-string values inside key arrays are ignored
- whitespace around each segment is trimmed
- leading and trailing slashes are removed from each segment
- repeated separators are collapsed to a single `/`
- empty segments are discarded

Examples:

```ts
joinStorageKey(" invoices/ ", ["2026", "/march/"], "statement.pdf");
// "invoices/2026/march/statement.pdf"
```

```ts
const storage = new StorageClient({
  bucket: "assets",
  publicBaseUrl: "https://cdn.example.com",
});

storage.createPublicUrl({ key: ["safe", 123, "file.txt"] });
// "https://cdn.example.com/safe/file.txt"
```

### Bucket overrides

The constructor `bucket` is the default bucket, but the following operations can override it per call by passing `bucket` inside the target object:

- `putObject`
- `headObject`
- `deleteObject`
- `createPresignedUploadUrl`
- `createPresignedDownloadUrl`
- `createPublicUrl` when called with the object target form

Example:

```ts
await storage.putObject({
  bucket: "archive-bucket",
  key: "reports/2026-03.json",
  body: JSON.stringify({ ok: true }),
});
```

### Public URL derivation order

When the package needs to produce a public URL, it resolves it in this order:

1. `buildPublicUrl(...)`
2. `publicBaseUrl`
3. `endpoint`
4. AWS S3 default public URL generation

Provider-specific behavior:

- S3 can derive a public URL from `region` and `urlStyle` even when `endpoint` is omitted
- R2 cannot derive a public URL unless at least one of `buildPublicUrl`, `publicBaseUrl`, `endpoint`, or `accountId` is present
- if `accountId` is provided for R2 and `endpoint` is omitted, the derived endpoint is enough for public URL generation

Important difference between methods:

- operation results such as `putObject`, `headObject`, `deleteObject`, and the presign methods return `publicUrl: null` when public URL generation is not possible
- `createPublicUrl(...)` is explicit and throws when public URL generation is not possible

### Path-style vs virtual-hosted URLs

Examples for S3:

- path style in `eu-west-1`: `https://s3.eu-west-1.amazonaws.com/assets/images/logo.png`
- virtual-hosted in `eu-west-1`: `https://assets.s3.eu-west-1.amazonaws.com/images/logo.png`
- virtual-hosted in `us-east-1`: `https://assets.s3.amazonaws.com/images/logo.png`

Examples for explicit endpoints:

- path style: `https://objects.example.com/root/assets/images/logo.png`
- virtual-hosted: `https://assets.objects.example.com/root/images/logo.png`

## Operation Reference

All wrapped failures use `StorageError`, except for local validation errors such as an empty bucket, empty key, or invalid TTL, which throw standard `TypeError` or `RangeError`.

### `putObject(input)`

Stores an object immediately.

Required input:

- `key`
- `body`

Optional input:

- `bucket`
- `metadata`
- `tags`
- `contentType`
- `cacheControl`
- `contentDisposition`
- `contentEncoding`
- `contentLanguage`
- `contentMD5`
- `expires`
- `publicUrl`
- `commandInput`

Behavior:

- `metadata` merges with `defaultMetadata`; per-call keys win
- `tags` merges with `defaultTags`; per-call keys win
- `contentType`, `cacheControl`, `contentDisposition`, `contentEncoding`, and `contentLanguage` use this precedence:
  per-call field -> `commandInput` field -> constructor default
- `contentMD5` and `expires` use this precedence:
  per-call field -> `commandInput` field
- `commandInput` cannot override `Bucket`, `Key`, `Body`, `Metadata`, or `Tagging`; the package owns those fields
- `publicUrl` defaults to `true`; pass `false` to suppress public URL generation and always return `publicUrl: null`

Result shape:

- `bucket`
- `key`
- `provider`
- `publicUrl`
- `etag`
- `versionId`
- `checksumCRC32`
- `checksumCRC32C`
- `checksumSHA1`
- `checksumSHA256`

Example:

```ts
const result = await storage.putObject({
  key: "exports/data.json",
  body: JSON.stringify({ ok: true }),
  contentType: "application/json",
  commandInput: {
    ChecksumAlgorithm: "SHA256",
    ServerSideEncryption: "AES256",
  },
});
```

### `headObject(input)`

Fetches object metadata.

Required input:

- `key`

Optional input:

- `bucket`
- `notFound`
- `publicUrl`
- `commandInput`

Behavior:

- `notFound` defaults to `"null"`
- with `notFound: "null"`, missing objects return `null`
- with `notFound: "error"`, missing objects throw `StorageError`
- not-found detection covers HTTP `404`, `NotFound`, and `NoSuchKey` forms from AWS-style errors
- `publicUrl` defaults to `true`

Result shape when found:

- `bucket`
- `key`
- `provider`
- `publicUrl`
- `exists: true`
- `etag`
- `versionId`
- `lastModified`
- `expiresAt`
- `contentLength`
- `contentType`
- `cacheControl`
- `contentDisposition`
- `contentEncoding`
- `contentLanguage`
- `metadata`
- `raw`

Example:

```ts
const metadata = await storage.headObject({
  key: "images/logo.png",
  notFound: "error",
});
```

### `objectExists(target)`

Boolean existence check built on top of `headObject`.

Required input:

- `key`

Optional input:

- `bucket`

Behavior:

- returns `true` when the object exists
- returns `false` for `404`, `NotFound`, and `NoSuchKey`
- still throws for other failures
- always skips public URL generation internally

Example:

```ts
const exists = await storage.objectExists({ key: "archive/2026-03.zip" });
```

### `deleteObject(input)`

Deletes an object.

Required input:

- `key`

Optional input:

- `bucket`
- `publicUrl`
- `commandInput`

Behavior:

- `publicUrl` defaults to `true`
- `commandInput` cannot override `Bucket` or `Key`

Result shape:

- `bucket`
- `key`
- `provider`
- `publicUrl`
- `versionId`
- `deleteMarker`
- `raw`

Example:

```ts
const result = await storage.deleteObject({
  key: "private/report.pdf",
  publicUrl: false,
});
```

### `createPresignedUploadUrl(input)`

Builds a presigned `PUT` request for uploading an object.

Required input:

- `key`

Optional input:

- `bucket`
- `expiresIn`
- `metadata`
- `tags`
- `contentType`
- `cacheControl`
- `contentDisposition`
- `contentEncoding`
- `contentLanguage`
- `contentMD5`
- `publicUrl`
- `commandInput`

Behavior:

- uses the same metadata, tags, and content-header precedence rules as `putObject`
- `expiresIn` defaults to `defaultUploadExpiresIn`
- `commandInput` cannot override `Bucket`, `Key`, `Body`, `Metadata`, or `Tagging`
- the generated `headers` object contains the headers the upload caller must send with the signed `PUT`
- headers are generated for standard content fields, metadata, ACL, checksum fields, server-side encryption, storage class, and website redirect location when present in the resolved command input

Result shape:

- `bucket`
- `key`
- `provider`
- `publicUrl`
- `method: "PUT"`
- `url`
- `headers`
- `expiresIn`
- `expiresAt`

Example:

```ts
const upload = await storage.createPresignedUploadUrl({
  key: ["avatars", "user-1.png"],
  contentType: "image/png",
  metadata: { uploadedBy: "admin" },
  commandInput: {
    ACL: "public-read",
    ChecksumSHA256: "sha256",
    ServerSideEncryption: "AES256",
  },
});
```

### `createPresignedDownloadUrl(input)`

Builds a presigned `GET` request for downloading an object.

Required input:

- `key`

Optional input:

- `bucket`
- `expiresIn`
- `publicUrl`
- `commandInput`

Behavior:

- `expiresIn` defaults to `defaultDownloadExpiresIn`
- `commandInput` cannot override `Bucket` or `Key`
- returned `headers` is always an empty object

Result shape:

- `bucket`
- `key`
- `provider`
- `publicUrl`
- `method: "GET"`
- `url`
- `headers`
- `expiresIn`
- `expiresAt`

Example:

```ts
const download = await storage.createPresignedDownloadUrl({
  key: ["reports", "march report.pdf"],
  expiresIn: 300,
});
```

### `createPublicUrl(input)`

Returns the public URL string for an object.

Accepted input:

- a key string
- a key array
- an object target with `key` and optional `bucket`

Behavior:

- applies `keyPrefix` and `resolveKey`
- uses the same public URL derivation order documented above
- throws when the key is empty
- throws `StorageError` when the provider configuration cannot produce a public URL

Examples:

```ts
const url = storage.createPublicUrl("images/logo.png");
```

```ts
const url = storage.createPublicUrl({
  bucket: "archive-assets",
  key: ["reports", "2026", "march.pdf"],
});
```

### `joinStorageKey(...parts)`

Normalizes and joins key parts using the same rules as the client.

Example:

```ts
const key = joinStorageKey("tenant-a", ["reports", "2026"], "march.pdf");
// "tenant-a/reports/2026/march.pdf"
```

## Advanced Customization Examples

### Custom key resolution

```ts
const storage = new StorageClient({
  bucket: "documents",
  keyPrefix: "tenant-a",
  resolveKey: (key, context) => `v1/${context.bucket}/${key}`,
});
```

Notes:

- `resolveKey` receives the key after `keyPrefix` has already been applied
- `context.operation` tells you which storage operation is being resolved

### Custom public URL generation

```ts
const storage = new StorageClient({
  bucket: "assets",
  buildPublicUrl: ({ bucket, key, provider }) => {
    return `https://cdn.example.com/${provider}/${bucket}/${key}`;
  },
});
```

Notes:

- `buildPublicUrl` runs before `publicBaseUrl`, `endpoint`, and provider defaults
- use this when URL generation depends on a CDN routing rule or custom public path contract

### Raw command overrides

Use `commandInput` when you need lower-level AWS SDK fields that the package does not expose as first-class top-level inputs.

Examples:

- `ChecksumAlgorithm`
- `ServerSideEncryption`
- `ACL`
- `StorageClass`
- `ResponseContentType`
- `VersionId`

```ts
await storage.putObject({
  key: "exports/data.json",
  body: JSON.stringify({ ok: true }),
  contentType: "application/json",
  commandInput: {
    ChecksumAlgorithm: "SHA256",
    ServerSideEncryption: "AES256",
  },
});
```

```ts
const url = await storage.createPresignedDownloadUrl({
  key: "reports/march.pdf",
  commandInput: {
    ResponseContentDisposition: "attachment; filename=report.pdf",
  },
});
```

## Error Model

Wrapped operation failures throw `StorageError`.

`StorageError` fields:

- `name`
- `message`
- `code`
- `operation`
- `provider`
- `bucket`
- `key`
- `statusCode`
- `retryable`
- `details`
- `cause`

`details` currently includes `httpStatusCode` when the upstream error exposes a status code.

Error codes by operation:

| Operation | Error code |
| --- | --- |
| `putObject` | `STORAGE_PUT_FAILED` |
| `headObject` | `STORAGE_HEAD_FAILED` |
| `deleteObject` | `STORAGE_DELETE_FAILED` |
| `createPresignedUploadUrl` | `STORAGE_PRESIGN_UPLOAD_FAILED` |
| `createPresignedDownloadUrl` | `STORAGE_PRESIGN_DOWNLOAD_FAILED` |
| `createPublicUrl` | `STORAGE_PUBLIC_URL_FAILED` |

Retryability behavior for wrapped errors:

- `retryable` is `true` for unknown-status failures
- `retryable` is `true` for `429`
- `retryable` is `true` for `>= 500`
- `retryable` is `false` for most other explicit client-side status codes such as `400` or `403`

The package extracts `statusCode` from these AWS-style error shapes:

- `error.$metadata.httpStatusCode`
- `error.statusCode`
- `error.status`

Validation failures are not wrapped:

- empty bucket -> `TypeError`
- empty key -> `TypeError`
- invalid TTL type or value -> `TypeError`
- TTL over `604800` -> `RangeError`

## Practical Notes

- `createPublicUrl` only formats a URL; it does not make the object public
- operation results default to trying `publicUrl` generation, but degrade to `null` when safe derivation is not possible
- use `publicUrl: false` on individual operations when you do not want any public URL work done
- R2 uses the same package surface as S3; the provider differences stay in configuration, not in the operation APIs
- the package URL-encodes path segments when generating public and presigned URLs, so keys like `"march report.pdf"` are emitted safely
