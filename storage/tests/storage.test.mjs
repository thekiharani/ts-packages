import test from "node:test";
import assert from "node:assert/strict";
import StorageClient, {
  StorageError,
  createStorageClient,
  joinStorageKey,
} from "../dist/index.js";

function createMockClient(handler) {
  return {
    async send(command) {
      return handler(command);
    },
  };
}

test("StorageError stores metadata with and without an explicit cause", () => {
  const withCause = new StorageError("boom", {
    code: "STORAGE_TEST",
    operation: "putObject",
    provider: "s3",
    bucket: "files",
    key: "a.txt",
    retryable: true,
    details: { status: 500 },
    cause: new Error("upstream"),
  });
  const withoutCause = new StorageError("plain", {
    code: "STORAGE_TEST",
    operation: "deleteObject",
    provider: "r2",
  });

  assert.equal(withCause.name, "StorageError");
  assert.equal(withCause.bucket, "files");
  assert.equal(withCause.key, "a.txt");
  assert.equal(withCause.retryable, true);
  assert.deepEqual(withCause.details, { status: 500 });
  assert.equal(withoutCause.retryable, false);
  assert.equal(withoutCause.details, undefined);
});

test("joinStorageKey normalizes repeated separators and arrays", () => {
  assert.equal(joinStorageKey(" invoices/ ", ["2026", "/march/"], "statement.pdf"), "invoices/2026/march/statement.pdf");
});

test("constructor applies default provider, region, URL style, and TTLs", () => {
  const s3 = new StorageClient({ bucket: "documents" });
  const r2 = new StorageClient({ bucket: "documents", provider: "r2", accountId: "acct-1" });
  const forcedPath = new StorageClient({
    bucket: "documents",
    forcePathStyle: true,
    defaultUploadExpiresIn: 60,
    defaultDownloadExpiresIn: 120,
  });

  assert.equal(s3.provider, "s3");
  assert.equal(s3.region, "us-east-1");
  assert.equal(s3.urlStyle, "virtual-hosted");
  assert.equal(r2.region, "auto");
  assert.equal(r2.urlStyle, "path");
  assert.equal(r2.endpoint, "https://acct-1.r2.cloudflarestorage.com");
  assert.equal(forcedPath.urlStyle, "path");
  assert.equal(forcedPath.defaultUploadExpiresIn, 60);
  assert.equal(forcedPath.defaultDownloadExpiresIn, 120);
});

test("constructor validates bucket and default expiry inputs", () => {
  assert.throws(() => new StorageClient({ bucket: "   " }), /Storage bucket is required/);
  assert.throws(
    () => new StorageClient({ bucket: "files", defaultUploadExpiresIn: 0 }),
    /defaultUploadExpiresIn must be a positive integer/,
  );
  assert.throws(
    () => new StorageClient({ bucket: "files", defaultDownloadExpiresIn: 604801 }),
    /defaultDownloadExpiresIn must not exceed 604800 seconds/,
  );
});

test("putObject applies defaults, prefixes, tags, and custom key resolution", async () => {
  const sent = [];
  const client = createStorageClient({
    bucket: "documents",
    keyPrefix: ["tenant-a", "uploads"],
    defaultMetadata: { visibility: "private", source: "api" },
    defaultTags: { project: "noria", env: "test" },
    defaultContentType: "application/octet-stream",
    resolveKey: (key) => `v1/${key}`,
    publicBaseUrl: "https://cdn.example.com",
    client: createMockClient(async (command) => {
      sent.push(command.input);
      return {
        ETag: '"abc123"',
        VersionId: "3",
        ChecksumSHA256: "sum-1",
      };
    }),
  });

  const result = await client.putObject({
    key: ["reports", "2026", "march.pdf"],
    body: "file-contents",
    metadata: { source: "dashboard" },
    tags: { env: "prod", kind: "invoice" },
  });

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    Bucket: "documents",
    Key: "v1/tenant-a/uploads/reports/2026/march.pdf",
    Body: "file-contents",
    Metadata: {
      visibility: "private",
      source: "dashboard",
    },
    Tagging: "project=noria&env=prod&kind=invoice",
    ContentType: "application/octet-stream",
    CacheControl: undefined,
    ContentDisposition: undefined,
    ContentEncoding: undefined,
    ContentLanguage: undefined,
    ContentMD5: undefined,
    Expires: undefined,
  });
  assert.equal(result.key, "v1/tenant-a/uploads/reports/2026/march.pdf");
  assert.equal(result.publicUrl, "https://cdn.example.com/v1/tenant-a/uploads/reports/2026/march.pdf");
  assert.equal(result.checksumSHA256, "sum-1");
});

test("putObject supports raw commandInput overrides and optional public URL suppression", async () => {
  const sent = [];
  const client = new StorageClient({
    bucket: "files",
    defaultCacheControl: "public, max-age=300",
    client: createMockClient(async (command) => {
      sent.push(command.input);
      return {};
    }),
  });

  const result = await client.putObject({
    key: "exports/data.json",
    body: '{"ok":true}',
    publicUrl: false,
    commandInput: {
      ContentType: "application/json",
      ChecksumAlgorithm: "SHA256",
      ServerSideEncryption: "AES256",
    },
  });

  assert.equal(result.publicUrl, null);
  assert.equal(sent[0].ChecksumAlgorithm, "SHA256");
  assert.equal(sent[0].ServerSideEncryption, "AES256");
  assert.equal(sent[0].ContentType, "application/json");
  assert.equal(sent[0].CacheControl, "public, max-age=300");
});

test("putObject wraps upstream failures with statusCode-based retryability", async () => {
  const client = new StorageClient({
    bucket: "files",
    client: createMockClient(async () => {
      const error = new Error("bad request");
      error.statusCode = 400;
      throw error;
    }),
  });

  await assert.rejects(
    () => client.putObject({ key: "bad.txt", body: "x" }),
    (error) => {
      assert.ok(error instanceof StorageError);
      assert.equal(error.code, "STORAGE_PUT_FAILED");
      assert.equal(error.statusCode, 400);
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

test("headObject returns normalized metadata for existing objects", async () => {
  const client = new StorageClient({
    bucket: "media",
    client: createMockClient(async () => ({
      ETag: '"etag-1"',
      VersionId: "7",
      LastModified: new Date("2026-03-29T00:00:00.000Z"),
      Expires: new Date("2026-03-30T00:00:00.000Z"),
      ContentLength: 128,
      ContentType: "image/png",
      CacheControl: "public, max-age=60",
      ContentDisposition: "inline",
      ContentEncoding: "gzip",
      ContentLanguage: "en",
      Metadata: { source: "webhook" },
    })),
  });

  const result = await client.headObject({ key: "images/logo.png" });

  assert.deepEqual(result, {
    bucket: "media",
    key: "images/logo.png",
    provider: "s3",
    publicUrl: "https://media.s3.amazonaws.com/images/logo.png",
    exists: true,
    etag: '"etag-1"',
    versionId: "7",
    lastModified: "2026-03-29T00:00:00.000Z",
    expiresAt: "2026-03-30T00:00:00.000Z",
    contentLength: 128,
    contentType: "image/png",
    cacheControl: "public, max-age=60",
    contentDisposition: "inline",
    contentEncoding: "gzip",
    contentLanguage: "en",
    metadata: { source: "webhook" },
    raw: {
      ETag: '"etag-1"',
      VersionId: "7",
      LastModified: new Date("2026-03-29T00:00:00.000Z"),
      Expires: new Date("2026-03-30T00:00:00.000Z"),
      ContentLength: 128,
      ContentType: "image/png",
      CacheControl: "public, max-age=60",
      ContentDisposition: "inline",
      ContentEncoding: "gzip",
      ContentLanguage: "en",
      Metadata: { source: "webhook" },
    },
  });
});

test("headObject defaults missing metadata to an empty object", async () => {
  const client = new StorageClient({
    bucket: "media",
    client: createMockClient(async () => ({
      ContentLength: 42,
    })),
  });

  const result = await client.headObject({ key: "images/raw.bin", publicUrl: false });

  assert.deepEqual(result.metadata, {});
});

test("headObject returns null for not found by default and wraps notFound errors when requested", async () => {
  let calls = 0;
  const client = new StorageClient({
    bucket: "media",
    client: createMockClient(async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("missing");
        error.name = "NotFound";
        throw error;
      }

      const error = new Error("missing");
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    }),
  });

  const result = await client.headObject({ key: "missing/file.txt" });
  assert.equal(result, null);

  await assert.rejects(
    () => client.headObject({ key: "missing/file.txt", notFound: "error" }),
    (error) => {
      assert.ok(error instanceof StorageError);
      assert.equal(error.code, "STORAGE_HEAD_FAILED");
      assert.equal(error.statusCode, 404);
      return true;
    },
  );
});

test("headObject wraps generic failures and objectExists uses the null path", async () => {
  let calls = 0;
  const client = new StorageClient({
    bucket: "media",
    client: createMockClient(async () => {
      calls += 1;
      if (calls === 1) {
        return { Metadata: {} };
      }

      if (calls === 2) {
        const error = new Error("missing");
        error.code = "NoSuchKey";
        throw error;
      }

      throw "network-down";
    }),
  });

  assert.equal(await client.objectExists({ key: "present.txt" }), true);
  assert.equal(await client.objectExists({ key: "missing.txt" }), false);

  await assert.rejects(
    () => client.headObject({ key: "boom.txt" }),
    (error) => {
      assert.ok(error instanceof StorageError);
      assert.equal(error.code, "STORAGE_HEAD_FAILED");
      assert.equal(error.retryable, true);
      assert.equal(error.statusCode, undefined);
      return true;
    },
  );
});

test("headObject treats Code=NoSuchKey as not found", async () => {
  const client = new StorageClient({
    bucket: "media",
    client: createMockClient(async () => {
      throw { Code: "NoSuchKey" };
    }),
  });

  assert.equal(await client.objectExists({ key: "missing-code.txt" }), false);
});

test("deleteObject returns normalized output and suppresses public URL when requested", async () => {
  const client = new StorageClient({
    bucket: "private-assets",
    client: createMockClient(async () => ({
      VersionId: "9",
      DeleteMarker: true,
    })),
  });

  const result = await client.deleteObject({ key: "top-secret.txt", publicUrl: false });

  assert.deepEqual(result, {
    bucket: "private-assets",
    key: "top-secret.txt",
    provider: "s3",
    publicUrl: null,
    versionId: "9",
    deleteMarker: true,
    raw: {
      VersionId: "9",
      DeleteMarker: true,
    },
  });
});

test("deleteObject defaults missing version fields cleanly", async () => {
  const client = new StorageClient({
    bucket: "private-assets",
    client: createMockClient(async () => ({})),
  });

  const result = await client.deleteObject({ key: "missing-version.txt", publicUrl: false });

  assert.equal(result.versionId, null);
  assert.equal(result.deleteMarker, false);
});

test("deleteObject wraps failures consistently", async () => {
  const client = new StorageClient({
    bucket: "private-assets",
    client: createMockClient(async () => {
      const error = new Error("forbidden");
      error.$metadata = { httpStatusCode: 403 };
      throw error;
    }),
  });

  await assert.rejects(
    () => client.deleteObject({ key: "top-secret.txt" }),
    (error) => {
      assert.ok(error instanceof StorageError);
      assert.equal(error.code, "STORAGE_DELETE_FAILED");
      assert.equal(error.operation, "deleteObject");
      assert.equal(error.statusCode, 403);
      assert.equal(error.bucket, "private-assets");
      assert.equal(error.key, "top-secret.txt");
      return true;
    },
  );
});

test("wrapped StorageError instances pass through unchanged", async () => {
  const original = new StorageError("already wrapped", {
    code: "STORAGE_DELETE_FAILED",
    operation: "deleteObject",
    provider: "s3",
    bucket: "private-assets",
    key: "same.txt",
  });
  const client = new StorageClient({
    bucket: "private-assets",
    client: createMockClient(async () => {
      throw original;
    }),
  });

  await assert.rejects(
    () => client.deleteObject({ key: "same.txt" }),
    (error) => {
      assert.equal(error, original);
      return true;
    },
  );
});

test("createPresignedUploadUrl returns signed headers and uses custom presigner", async () => {
  const client = new StorageClient({
    bucket: "assets",
    provider: "r2",
    accountId: "acc-123",
    defaultUploadExpiresIn: 600,
    defaultMetadata: { app: "noria" },
    presignUrl: async (_client, command, options) => {
      assert.equal(options.expiresIn, 600);
      assert.equal(command.input.Bucket, "assets");
      assert.equal(command.input.Key, "avatars/user-1.png");
      return "https://signed.example.com/upload";
    },
    client: createMockClient(async () => {
      throw new Error("send should not be called for presigning");
    }),
  });

  const result = await client.createPresignedUploadUrl({
    key: ["avatars", "user-1.png"],
    contentType: "image/png",
    metadata: { uploadedBy: "admin" },
    commandInput: {
      ACL: "public-read",
      ChecksumCRC32: "crc32",
      ChecksumCRC32C: "crc32c",
      ChecksumSHA1: "sha1",
      ChecksumSHA256: "sha256",
      ServerSideEncryption: "AES256",
      SSEKMSKeyId: "kms-key",
      SSECustomerAlgorithm: "AES256",
      SSECustomerKey: "secret-key",
      SSECustomerKeyMD5: "secret-md5",
      StorageClass: "STANDARD",
      WebsiteRedirectLocation: "/next",
    },
  });

  assert.equal(result.method, "PUT");
  assert.equal(result.url, "https://signed.example.com/upload");
  assert.equal(result.publicUrl, "https://acc-123.r2.cloudflarestorage.com/assets/avatars/user-1.png");
  assert.deepEqual(result.headers, {
    "content-type": "image/png",
    "x-amz-acl": "public-read",
    "x-amz-checksum-crc32": "crc32",
    "x-amz-checksum-crc32c": "crc32c",
    "x-amz-checksum-sha1": "sha1",
    "x-amz-checksum-sha256": "sha256",
    "x-amz-meta-app": "noria",
    "x-amz-meta-uploadedBy": "admin",
    "x-amz-server-side-encryption": "AES256",
    "x-amz-server-side-encryption-aws-kms-key-id": "kms-key",
    "x-amz-server-side-encryption-customer-algorithm": "AES256",
    "x-amz-server-side-encryption-customer-key": "secret-key",
    "x-amz-server-side-encryption-customer-key-md5": "secret-md5",
    "x-amz-storage-class": "STANDARD",
    "x-amz-website-redirect-location": "/next",
  });
});

test("createPresignedUploadUrl validates expiry bounds and wraps presign failures", async () => {
  const client = new StorageClient({
    bucket: "assets",
    presignUrl: async () => {
      const error = new Error("rate limited");
      error.status = 429;
      throw error;
    },
    client: createMockClient(async () => {
      throw new Error("send should not be called");
    }),
  });

  await assert.rejects(
    () => client.createPresignedUploadUrl({ key: "bad.txt", expiresIn: -1 }),
    /expiresIn must be a positive integer/,
  );
  await assert.rejects(
    () => client.createPresignedUploadUrl({ key: "bad.txt", expiresIn: 604801 }),
    /expiresIn must not exceed 604800 seconds/,
  );
  await assert.rejects(
    () => client.createPresignedUploadUrl({ key: "rate-limited.txt" }),
    (error) => {
      assert.ok(error instanceof StorageError);
      assert.equal(error.code, "STORAGE_PRESIGN_UPLOAD_FAILED");
      assert.equal(error.statusCode, 429);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test("createPresignedUploadUrl emits the standard content headers when present", async () => {
  const client = new StorageClient({
    bucket: "assets",
    presignUrl: async () => "https://signed.example.com/basic-upload",
    client: createMockClient(async () => {
      throw new Error("send should not be called");
    }),
  });

  const result = await client.createPresignedUploadUrl({
    key: "headers.txt",
    contentType: "text/plain",
    cacheControl: "public, max-age=60",
    contentDisposition: "attachment; filename=headers.txt",
    contentEncoding: "gzip",
    contentLanguage: "en",
    contentMD5: "md5-value",
  });

  assert.deepEqual(result.headers, {
    "content-type": "text/plain",
    "cache-control": "public, max-age=60",
    "content-disposition": "attachment; filename=headers.txt",
    "content-encoding": "gzip",
    "content-language": "en",
    "content-md5": "md5-value",
  });
});

test("createPresignedDownloadUrl supports the default presigner with the built-in S3 client", async () => {
  const client = new StorageClient({
    bucket: "signed-assets",
    region: "us-east-1",
    credentials: {
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "secret",
    },
  });

  const result = await client.createPresignedDownloadUrl({
    key: ["reports", "march report.pdf"],
    expiresIn: 60,
  });

  assert.equal(result.method, "GET");
  assert.equal(result.bucket, "signed-assets");
  assert.equal(result.key, "reports/march report.pdf");
  assert.equal(result.publicUrl, "https://signed-assets.s3.amazonaws.com/reports/march%20report.pdf");
  assert.equal(result.headers && Object.keys(result.headers).length, 0);
  assert.match(result.url, /^https:\/\/signed-assets\.s3(\.us-east-1)?\.amazonaws\.com\/reports\/march%20report\.pdf\?/);
  assert.match(result.url, /X-Amz-Signature=/);
});

test("createPresignedDownloadUrl wraps presign failures", async () => {
  const client = new StorageClient({
    bucket: "assets",
    presignUrl: async () => {
      throw new Error("offline");
    },
    client: createMockClient(async () => {
      throw new Error("send should not be called");
    }),
  });

  await assert.rejects(
    () => client.createPresignedDownloadUrl({ key: "offline.txt" }),
    (error) => {
      assert.ok(error instanceof StorageError);
      assert.equal(error.code, "STORAGE_PRESIGN_DOWNLOAD_FAILED");
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test("createPublicUrl supports custom builders, explicit endpoints, path style, and object input", () => {
  const custom = new StorageClient({
    bucket: "assets",
    buildPublicUrl: ({ bucket, key, provider }) => `https://cdn.example.com/${provider}/${bucket}/${key}`,
  });
  const endpointPath = new StorageClient({
    bucket: "assets",
    endpoint: "https://objects.example.com/root/",
    urlStyle: "path",
  });
  const endpointHosted = new StorageClient({
    bucket: "assets",
    endpoint: "https://objects.example.com/root/",
    urlStyle: "virtual-hosted",
  });
  const prefixed = new StorageClient({
    bucket: "assets",
    keyPrefix: "tenant-a",
    publicBaseUrl: "https://cdn.example.com/base/",
  });
  const regionalPathStyle = new StorageClient({
    bucket: "assets",
    region: "eu-west-1",
    urlStyle: "path",
  });
  const explicitFalsePathStyle = new StorageClient({
    bucket: "assets",
    region: "eu-west-1",
    forcePathStyle: false,
  });

  assert.equal(custom.createPublicUrl("hero.png"), "https://cdn.example.com/s3/assets/hero.png");
  assert.equal(
    endpointPath.createPublicUrl("images/logo.png"),
    "https://objects.example.com/root/assets/images/logo.png",
  );
  assert.equal(
    endpointHosted.createPublicUrl("images/logo.png"),
    "https://assets.objects.example.com/root/images/logo.png",
  );
  assert.equal(
    prefixed.createPublicUrl({ key: ["documents", "report.pdf"] }),
    "https://cdn.example.com/base/tenant-a/documents/report.pdf",
  );
  assert.equal(
    regionalPathStyle.createPublicUrl("images/logo.png"),
    "https://s3.eu-west-1.amazonaws.com/assets/images/logo.png",
  );
  assert.equal(
    explicitFalsePathStyle.createPublicUrl("images/logo.png"),
    "https://assets.s3.eu-west-1.amazonaws.com/images/logo.png",
  );
});

test("createPublicUrl wraps invalid targets and missing provider configuration", () => {
  const client = new StorageClient({ bucket: "assets", provider: "r2", endpoint: "   " });

  assert.throws(
    () => client.createPublicUrl("   "),
    (error) => {
      assert.ok(error instanceof TypeError);
      assert.match(error.message, /Storage key must contain at least one path segment/);
      return true;
    },
  );

  assert.throws(
    () => client.createPublicUrl("report.pdf"),
    (error) => {
      assert.ok(error instanceof StorageError);
      assert.equal(error.code, "STORAGE_PUBLIC_URL_FAILED");
      assert.equal(error.operation, "createPublicUrl");
      assert.equal(error.provider, "r2");
      return true;
    },
  );
});

test("non-string nested key parts are ignored during normalization", () => {
  const client = new StorageClient({
    bucket: "assets",
    publicBaseUrl: "https://cdn.example.com",
  });

  assert.equal(
    client.createPublicUrl({ key: ["safe", 123, "file.txt"] }),
    "https://cdn.example.com/safe/file.txt",
  );
});

test("operations degrade to publicUrl null when public URL generation fails internally", async () => {
  const client = new StorageClient({
    bucket: "assets",
    provider: "r2",
    endpoint: "   ",
    client: createMockClient(async () => ({
      VersionId: "1",
      DeleteMarker: false,
    })),
  });

  const result = await client.deleteObject({ key: "private/report.pdf" });

  assert.equal(result.publicUrl, null);
});
