import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type {
  DeleteObjectCommandInput,
  DeleteObjectCommandOutput,
  GetObjectCommandInput,
  HeadObjectCommandInput,
  HeadObjectCommandOutput,
  PutObjectCommandInput,
  PutObjectCommandOutput,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageError } from "./errors";
import type {
  BuildPutCommandInputOptions,
  CreatePresignedDownloadUrlInput,
  CreatePresignedUploadUrlInput,
  CreatePublicUrlInput,
  DeleteObjectInput,
  DeleteObjectResult,
  HeadObjectInput,
  HeadObjectResult,
  PresignedRequest,
  PutCommandShape,
  PutObjectInput,
  PutObjectResult,
  ResolvedStoragePublicUrlInput,
  StorageClientOptions,
  StorageCommandClient,
  StorageDefaults,
  StorageKey,
  StorageMetadata,
  StorageObjectDescriptor,
  StorageObjectTarget,
  StorageOperation,
  StorageOperationContext,
  StoragePresignHandler,
  StorageProvider,
  StorageTagValue,
  StorageTags,
  StorageUrlStyle,
} from "./types";

export { StorageError } from "./errors";
export type {
  CreatePresignedDownloadUrlInput,
  CreatePresignedUploadUrlInput,
  CreatePublicUrlInput,
  DeleteObjectInput,
  DeleteObjectResult,
  HeadObjectInput,
  HeadObjectResult,
  PresignedRequest,
  PutObjectInput,
  PutObjectResult,
  ResolvedStoragePublicUrlInput,
  StorageClientOptions,
  StorageCommandClient,
  StorageKey,
  StorageMetadata,
  StorageObjectDescriptor,
  StorageObjectTarget,
  StorageOperation,
  StorageOperationContext,
  StoragePresignHandler,
  StorageProvider,
  StorageTagValue,
  StorageTags,
  StorageUrlStyle,
} from "./types";

export const DEFAULT_S3_REGION = "us-east-1";
export const DEFAULT_R2_REGION = "auto";
export const DEFAULT_UPLOAD_EXPIRES_IN = 900;
export const DEFAULT_DOWNLOAD_EXPIRES_IN = 3_600;
export const MAX_PRESIGN_EXPIRES_IN = 604_800;

export class StorageClient {
  readonly bucket: string;
  readonly provider: StorageProvider;
  readonly region: string;
  readonly endpoint?: string;
  readonly accountId?: string;
  readonly publicBaseUrl?: string;
  readonly keyPrefix?: string;
  readonly urlStyle: StorageUrlStyle;
  readonly defaultUploadExpiresIn: number;
  readonly defaultDownloadExpiresIn: number;
  readonly client: StorageCommandClient;

  readonly #defaults: StorageDefaults;
  readonly #presignUrl: StoragePresignHandler;
  readonly #resolveKeyHook?: StorageClientOptions["resolveKey"];
  readonly #buildPublicUrlHook?: StorageClientOptions["buildPublicUrl"];

  constructor(options: StorageClientOptions) {
    this.provider = options.provider ?? "s3";
    this.bucket = assertBucket(options.bucket);
    this.region = resolveRegion(this.provider, options.region);
    this.accountId = normalizeOptionalValue(options.accountId);
    this.endpoint = resolveEndpoint({
      provider: this.provider,
      endpoint: options.endpoint,
      accountId: this.accountId,
    });
    this.publicBaseUrl = normalizeOptionalBaseUrl(options.publicBaseUrl);
    this.urlStyle = resolveUrlStyle(this.provider, options.urlStyle, options.forcePathStyle);
    this.keyPrefix = normalizeOptionalKey(options.keyPrefix);
    this.defaultUploadExpiresIn = validateExpiresIn(
      options.defaultUploadExpiresIn ?? DEFAULT_UPLOAD_EXPIRES_IN,
      "defaultUploadExpiresIn",
    );
    this.defaultDownloadExpiresIn = validateExpiresIn(
      options.defaultDownloadExpiresIn ?? DEFAULT_DOWNLOAD_EXPIRES_IN,
      "defaultDownloadExpiresIn",
    );
    this.#defaults = {
      metadata: options.defaultMetadata,
      tags: options.defaultTags,
      contentType: normalizeOptionalValue(options.defaultContentType),
      cacheControl: normalizeOptionalValue(options.defaultCacheControl),
      contentDisposition: normalizeOptionalValue(options.defaultContentDisposition),
      contentEncoding: normalizeOptionalValue(options.defaultContentEncoding),
      contentLanguage: normalizeOptionalValue(options.defaultContentLanguage),
    };
    this.#resolveKeyHook = options.resolveKey;
    this.#buildPublicUrlHook = options.buildPublicUrl;
    this.#presignUrl = options.presignUrl ?? defaultPresignUrl;
    this.client =
      options.client ??
      new S3Client({
        ...(options.s3ClientConfig ?? {}),
        region: this.region,
        endpoint: this.endpoint,
        credentials: options.credentials,
        forcePathStyle: this.urlStyle === "path",
      } satisfies S3ClientConfig);
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const resolved = this.#resolveTarget("putObject", input);
    const commandInput = buildPutObjectCommandInput(input, {
      bucket: resolved.bucket,
      key: resolved.key,
      defaults: this.#defaults,
    });

    try {
      const output = await this.client.send(new PutObjectCommand(commandInput)) as PutObjectCommandOutput;

      return {
        ...this.#describeObject(resolved, input.publicUrl),
        etag: output.ETag ?? null,
        versionId: output.VersionId ?? null,
        checksumCRC32: output.ChecksumCRC32 ?? null,
        checksumCRC32C: output.ChecksumCRC32C ?? null,
        checksumSHA1: output.ChecksumSHA1 ?? null,
        checksumSHA256: output.ChecksumSHA256 ?? null,
      };
    } catch (error) {
      throw this.#wrapError("putObject", resolved, error, "Failed to store object.");
    }
  }

  async headObject(input: HeadObjectInput): Promise<HeadObjectResult | null> {
    const resolved = this.#resolveTarget("headObject", input);
    const commandInput: HeadObjectCommandInput = {
      ...(input.commandInput ?? {}),
      Bucket: resolved.bucket,
      Key: resolved.key,
    };

    try {
      const output = await this.client.send(new HeadObjectCommand(commandInput)) as HeadObjectCommandOutput;

      return {
        ...this.#describeObject(resolved, input.publicUrl),
        exists: true,
        etag: output.ETag ?? null,
        versionId: output.VersionId ?? null,
        lastModified: output.LastModified?.toISOString() ?? null,
        expiresAt: output.Expires?.toISOString() ?? null,
        contentLength: output.ContentLength ?? null,
        contentType: output.ContentType ?? null,
        cacheControl: output.CacheControl ?? null,
        contentDisposition: output.ContentDisposition ?? null,
        contentEncoding: output.ContentEncoding ?? null,
        contentLanguage: output.ContentLanguage ?? null,
        metadata: output.Metadata ?? {},
        raw: output,
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        if (input.notFound === "error") {
          throw this.#wrapError("headObject", resolved, error, "Object was not found.");
        }

        return null;
      }

      throw this.#wrapError("headObject", resolved, error, "Failed to fetch object metadata.");
    }
  }

  async objectExists(target: StorageObjectTarget): Promise<boolean> {
    const result = await this.headObject({
      ...target,
      notFound: "null",
      publicUrl: false,
    });

    return result !== null;
  }

  async deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult> {
    const resolved = this.#resolveTarget("deleteObject", input);
    const commandInput: DeleteObjectCommandInput = {
      ...(input.commandInput ?? {}),
      Bucket: resolved.bucket,
      Key: resolved.key,
    };

    try {
      const output = await this.client.send(new DeleteObjectCommand(commandInput)) as DeleteObjectCommandOutput;

      return {
        ...this.#describeObject(resolved, input.publicUrl),
        versionId: output.VersionId ?? null,
        deleteMarker: output.DeleteMarker ?? false,
        raw: output,
      };
    } catch (error) {
      throw this.#wrapError("deleteObject", resolved, error, "Failed to delete object.");
    }
  }

  async createPresignedUploadUrl(input: CreatePresignedUploadUrlInput): Promise<PresignedRequest> {
    const resolved = this.#resolveTarget("createPresignedUploadUrl", input);
    const expiresIn = validateExpiresIn(
      input.expiresIn ?? this.defaultUploadExpiresIn,
      "expiresIn",
    );
    const commandInput = buildPutObjectCommandInput(input, {
      bucket: resolved.bucket,
      key: resolved.key,
      defaults: this.#defaults,
    });
    delete commandInput.Body;

    try {
      const url = await this.#presignUrl(this.client, new PutObjectCommand(commandInput), { expiresIn });

      return {
        ...this.#describeObject(resolved, input.publicUrl),
        method: "PUT",
        url,
        headers: buildPresignedPutHeaders(commandInput),
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
      };
    } catch (error) {
      throw this.#wrapError(
        "createPresignedUploadUrl",
        resolved,
        error,
        "Failed to create presigned upload URL.",
      );
    }
  }

  async createPresignedDownloadUrl(input: CreatePresignedDownloadUrlInput): Promise<PresignedRequest> {
    const resolved = this.#resolveTarget("createPresignedDownloadUrl", input);
    const expiresIn = validateExpiresIn(
      input.expiresIn ?? this.defaultDownloadExpiresIn,
      "expiresIn",
    );
    const commandInput: GetObjectCommandInput = {
      ...(input.commandInput ?? {}),
      Bucket: resolved.bucket,
      Key: resolved.key,
    };

    try {
      const url = await this.#presignUrl(this.client, new GetObjectCommand(commandInput), { expiresIn });

      return {
        ...this.#describeObject(resolved, input.publicUrl),
        method: "GET",
        url,
        headers: {},
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
      };
    } catch (error) {
      throw this.#wrapError(
        "createPresignedDownloadUrl",
        resolved,
        error,
        "Failed to create presigned download URL.",
      );
    }
  }

  createPublicUrl(input: CreatePublicUrlInput | StorageKey): string {
    const target = isStorageObjectTarget(input)
      ? this.#resolveTarget("createPublicUrl", input)
      : this.#resolveTarget("createPublicUrl", { key: input });

    try {
      return this.#createPublicUrlFromResolvedTarget(target);
    } catch (error) {
      throw this.#wrapError("createPublicUrl", target, error, "Failed to create public URL.");
    }
  }

  #createPublicUrlFromResolvedTarget(target: { bucket: string; key: string }): string {
    const resolved: ResolvedStoragePublicUrlInput = {
      bucket: target.bucket,
      key: target.key,
      provider: this.provider,
      region: this.region,
      endpoint: this.endpoint,
      accountId: this.accountId,
      urlStyle: this.urlStyle,
      publicBaseUrl: this.publicBaseUrl,
    };

    if (this.#buildPublicUrlHook) {
      return this.#buildPublicUrlHook(resolved);
    }

    if (resolved.publicBaseUrl) {
      return appendUrlPath(resolved.publicBaseUrl, resolved.key);
    }

    if (resolved.endpoint) {
      return buildEndpointUrl(resolved.endpoint, resolved.bucket, resolved.key, resolved.urlStyle);
    }

    if (resolved.provider === "s3") {
      return buildAwsPublicUrl(resolved.bucket, resolved.key, resolved.region, resolved.urlStyle);
    }

    throw new TypeError("R2 public URL generation requires an endpoint, publicBaseUrl, or accountId.");
  }

  #resolveTarget(operation: StorageOperation, target: StorageObjectTarget): { bucket: string; key: string } {
    const bucket = assertBucket(target.bucket ?? this.bucket);
    const rawKey = normalizeKeyInput(target.key);
    const prefixedKey = this.keyPrefix ? normalizeKeyInput([this.keyPrefix, rawKey]) : rawKey;
    const resolvedKey = this.#resolveKeyHook
      ? this.#resolveKeyHook(prefixedKey, {
          operation,
          bucket,
          provider: this.provider,
        } satisfies StorageOperationContext)
      : prefixedKey;

    return {
      bucket,
      key: assertKey(resolvedKey),
    };
  }

  #describeObject(
    target: { bucket: string; key: string },
    includePublicUrl = true,
  ): StorageObjectDescriptor {
    let publicUrl: string | null = null;

    if (includePublicUrl !== false) {
      try {
        publicUrl = this.#createPublicUrlFromResolvedTarget(target);
      } catch {
        publicUrl = null;
      }
    }

    return {
      bucket: target.bucket,
      key: target.key,
      provider: this.provider,
      publicUrl,
    };
  }

  #wrapError(
    operation: StorageOperation,
    target: { bucket: string; key: string },
    error: unknown,
    message: string,
  ): StorageError {
    if (error instanceof StorageError) {
      return error;
    }

    const statusCode = extractStatusCode(error);

    return new StorageError(message, {
      code: storageErrorCodeFor(operation),
      operation,
      provider: this.provider,
      bucket: target.bucket,
      key: target.key,
      statusCode,
      retryable: statusCode === undefined || statusCode >= 500 || statusCode === 429,
      details: statusCode ? { httpStatusCode: statusCode } : undefined,
      cause: error,
    });
  }
}

export function createStorageClient(options: StorageClientOptions): StorageClient {
  return new StorageClient(options);
}

export function joinStorageKey(...parts: StorageKey[]): string {
  return normalizeKeyInput(parts);
}

function buildPutObjectCommandInput(
  input: Omit<PutObjectInput, "body"> & { body?: PutObjectInput["body"] },
  options: BuildPutCommandInputOptions,
): PutObjectCommandInput {
  const commandInput = input.commandInput ?? {};
  const metadata = mergeStringRecords(options.defaults.metadata, input.metadata);
  const tags = mergeTagRecords(options.defaults.tags, input.tags);
  const shape: PutCommandShape = {
    metadata,
    tags,
    contentType: input.contentType ?? commandInput.ContentType ?? options.defaults.contentType,
    cacheControl: input.cacheControl ?? commandInput.CacheControl ?? options.defaults.cacheControl,
    contentDisposition:
      input.contentDisposition ?? commandInput.ContentDisposition ?? options.defaults.contentDisposition,
    contentEncoding:
      input.contentEncoding ?? commandInput.ContentEncoding ?? options.defaults.contentEncoding,
    contentLanguage:
      input.contentLanguage ?? commandInput.ContentLanguage ?? options.defaults.contentLanguage,
    contentMD5: input.contentMD5 ?? commandInput.ContentMD5,
    expires: input.expires ?? commandInput.Expires,
  };

  return {
    ...commandInput,
    Bucket: options.bucket,
    Key: options.key,
    ...(input.body !== undefined ? { Body: input.body } : {}),
    Metadata: hasEntries(shape.metadata) ? shape.metadata : undefined,
    Tagging: shape.tags ? serializeTags(shape.tags) : undefined,
    ContentType: shape.contentType,
    CacheControl: shape.cacheControl,
    ContentDisposition: shape.contentDisposition,
    ContentEncoding: shape.contentEncoding,
    ContentLanguage: shape.contentLanguage,
    ContentMD5: shape.contentMD5,
    Expires: shape.expires,
  };
}

function buildPresignedPutHeaders(input: PutObjectCommandInput): Record<string, string> {
  const headers: Record<string, string> = {};

  if (input.ContentType) headers["content-type"] = input.ContentType;
  if (input.CacheControl) headers["cache-control"] = input.CacheControl;
  if (input.ContentDisposition) headers["content-disposition"] = input.ContentDisposition;
  if (input.ContentEncoding) headers["content-encoding"] = input.ContentEncoding;
  if (input.ContentLanguage) headers["content-language"] = input.ContentLanguage;
  if (input.ContentMD5) headers["content-md5"] = input.ContentMD5;
  if (input.ACL) headers["x-amz-acl"] = input.ACL;
  if (input.ChecksumCRC32) headers["x-amz-checksum-crc32"] = input.ChecksumCRC32;
  if (input.ChecksumCRC32C) headers["x-amz-checksum-crc32c"] = input.ChecksumCRC32C;
  if (input.ChecksumSHA1) headers["x-amz-checksum-sha1"] = input.ChecksumSHA1;
  if (input.ChecksumSHA256) headers["x-amz-checksum-sha256"] = input.ChecksumSHA256;
  if (input.ServerSideEncryption) {
    headers["x-amz-server-side-encryption"] = input.ServerSideEncryption;
  }
  if (input.SSEKMSKeyId) {
    headers["x-amz-server-side-encryption-aws-kms-key-id"] = input.SSEKMSKeyId;
  }
  if (input.SSECustomerAlgorithm) {
    headers["x-amz-server-side-encryption-customer-algorithm"] = input.SSECustomerAlgorithm;
  }
  if (input.SSECustomerKey) {
    headers["x-amz-server-side-encryption-customer-key"] = input.SSECustomerKey;
  }
  if (input.SSECustomerKeyMD5) {
    headers["x-amz-server-side-encryption-customer-key-md5"] = input.SSECustomerKeyMD5;
  }
  if (input.StorageClass) headers["x-amz-storage-class"] = input.StorageClass;
  if (input.WebsiteRedirectLocation) {
    headers["x-amz-website-redirect-location"] = input.WebsiteRedirectLocation;
  }

  for (const [key, value] of Object.entries(input.Metadata ?? {})) {
    headers[`x-amz-meta-${key}`] = String(value);
  }

  return headers;
}

function resolveRegion(provider: StorageProvider, region?: string): string {
  const normalizedRegion = normalizeOptionalValue(region);

  if (normalizedRegion) {
    return normalizedRegion;
  }

  return provider === "r2" ? DEFAULT_R2_REGION : DEFAULT_S3_REGION;
}

function resolveEndpoint(input: {
  provider: StorageProvider;
  endpoint?: string;
  accountId?: string;
}): string | undefined {
  const explicitEndpoint = normalizeOptionalBaseUrl(input.endpoint);

  if (explicitEndpoint) {
    return explicitEndpoint;
  }

  if (input.provider === "r2" && input.accountId) {
    return `https://${input.accountId}.r2.cloudflarestorage.com`;
  }

  return undefined;
}

function resolveUrlStyle(
  provider: StorageProvider,
  urlStyle?: StorageUrlStyle,
  forcePathStyle?: boolean,
): StorageUrlStyle {
  if (urlStyle) {
    return urlStyle;
  }

  if (typeof forcePathStyle === "boolean") {
    return forcePathStyle ? "path" : "virtual-hosted";
  }

  return provider === "r2" ? "path" : "virtual-hosted";
}

function assertBucket(bucket: string): string {
  const normalized = normalizeOptionalValue(bucket);

  if (!normalized) {
    throw new TypeError("Storage bucket is required.");
  }

  return normalized;
}

function assertKey(key: string): string {
  const normalized = normalizeOptionalKey(key);

  if (!normalized) {
    throw new TypeError("Storage key must contain at least one path segment.");
  }

  return normalized;
}

function normalizeKeyInput(key: StorageKey | readonly unknown[]): string {
  const parts = Array.isArray(key) ? key.flatMap(flattenKeyPart) : flattenKeyPart(key);
  const normalized = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");

  return normalized.replace(/\/{2,}/g, "/");
}

function flattenKeyPart(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenKeyPart);
  }

  return typeof value === "string" ? [value] : [];
}

function normalizeOptionalKey(value?: StorageKey): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = normalizeKeyInput(value);
  return normalized === "" ? undefined : normalized;
}

function normalizeOptionalValue(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeOptionalBaseUrl(value?: string): string | undefined {
  const normalized = normalizeOptionalValue(value);

  if (!normalized) {
    return undefined;
  }

  return normalized.replace(/\/+$/, "");
}

function appendUrlPath(baseUrl: string, ...segments: string[]): string {
  const url = new URL(baseUrl);
  const normalizedPath = [url.pathname, ...segments]
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");

  url.pathname = `/${normalizedPath}`;
  return url.toString();
}

function buildEndpointUrl(
  endpoint: string,
  bucket: string,
  key: string,
  urlStyle: StorageUrlStyle,
): string {
  const url = new URL(endpoint);
  const encodedKey = encodeStorageKeyForUrl(key);
  const basePath = url.pathname.replace(/\/+$/, "");

  if (urlStyle === "virtual-hosted") {
    url.hostname = `${bucket}.${url.hostname}`;
    url.pathname = `${basePath}/${encodedKey}`.replace(/\/{2,}/g, "/");
    return url.toString();
  }

  url.pathname = `${basePath}/${[bucket, encodedKey].join("/")}`.replace(/\/{2,}/g, "/");
  return url.toString();
}

function buildAwsPublicUrl(
  bucket: string,
  key: string,
  region: string,
  urlStyle: StorageUrlStyle,
): string {
  const encodedKey = encodeStorageKeyForUrl(key);
  const host =
    region === "us-east-1"
      ? "s3.amazonaws.com"
      : `s3.${region}.amazonaws.com`;

  if (urlStyle === "path") {
    return `https://${host}/${bucket}/${encodedKey}`;
  }

  return `https://${bucket}.${host}/${encodedKey}`;
}

function encodeStorageKeyForUrl(key: string): string {
  return key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function mergeStringRecords(
  defaults?: StorageMetadata,
  values?: StorageMetadata,
): StorageMetadata | undefined {
  const merged = {
    ...(defaults ?? {}),
    ...(values ?? {}),
  };

  return hasEntries(merged) ? merged : undefined;
}

function mergeTagRecords(defaults?: StorageTags, values?: StorageTags): StorageTags | undefined {
  const merged = {
    ...(defaults ?? {}),
    ...(values ?? {}),
  };

  return hasEntries(merged) ? merged : undefined;
}

function hasEntries(value?: Record<string, unknown>): boolean {
  return !!value && Object.keys(value).length > 0;
}

function serializeTags(tags: StorageTags): string {
  return Object.entries(tags)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

function isStorageObjectTarget(value: CreatePublicUrlInput | StorageKey): value is CreatePublicUrlInput {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "key" in value;
}

function validateExpiresIn(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${fieldName} must be a positive integer.`);
  }

  if (value > MAX_PRESIGN_EXPIRES_IN) {
    throw new RangeError(`${fieldName} must not exceed ${MAX_PRESIGN_EXPIRES_IN} seconds.`);
  }

  return value;
}

function storageErrorCodeFor(operation: StorageOperation): string {
  switch (operation) {
    case "putObject":
      return "STORAGE_PUT_FAILED";
    case "headObject":
      return "STORAGE_HEAD_FAILED";
    case "deleteObject":
      return "STORAGE_DELETE_FAILED";
    case "createPresignedUploadUrl":
      return "STORAGE_PRESIGN_UPLOAD_FAILED";
    case "createPresignedDownloadUrl":
      return "STORAGE_PRESIGN_DOWNLOAD_FAILED";
    case "createPublicUrl":
      return "STORAGE_PUBLIC_URL_FAILED";
  }
}

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const withMetadata = error as { $metadata?: { httpStatusCode?: number } };
  const fromMetadata = withMetadata.$metadata?.httpStatusCode;

  if (typeof fromMetadata === "number") {
    return fromMetadata;
  }

  const withStatusCode = error as { statusCode?: number; status?: number };

  if (typeof withStatusCode.statusCode === "number") {
    return withStatusCode.statusCode;
  }

  if (typeof withStatusCode.status === "number") {
    return withStatusCode.status;
  }

  return undefined;
}

function isNotFoundError(error: unknown): boolean {
  const statusCode = extractStatusCode(error);

  if (statusCode === 404) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const withName = error as { name?: string; Code?: string; code?: string };
  return (
    withName.name === "NotFound" ||
    withName.name === "NoSuchKey" ||
    withName.code === "NotFound" ||
    withName.code === "NoSuchKey" ||
    withName.Code === "NotFound" ||
    withName.Code === "NoSuchKey"
  );
}

async function defaultPresignUrl(
  client: StorageCommandClient,
  command: unknown,
  options: { expiresIn: number },
): Promise<string> {
  return getSignedUrl(client as S3Client, command as Parameters<typeof getSignedUrl>[1], options);
}

export default StorageClient;
