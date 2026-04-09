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

export type StorageProvider = "s3" | "r2";
export type StorageUrlStyle = "path" | "virtual-hosted";
export type StorageOperation =
  | "putObject"
  | "headObject"
  | "deleteObject"
  | "createPresignedUploadUrl"
  | "createPresignedDownloadUrl"
  | "createPublicUrl";

export type StorageKey = string | readonly string[];
export type StorageMetadata = Record<string, string>;
export type StorageTagValue = string | number | boolean;
export type StorageTags = Record<string, StorageTagValue>;

export interface StorageCommandClient {
  send(command: unknown): Promise<unknown>;
}

export interface StorageOperationContext {
  operation: StorageOperation;
  bucket: string;
  provider: StorageProvider;
}

export interface ResolvedStoragePublicUrlInput {
  bucket: string;
  key: string;
  provider: StorageProvider;
  region: string;
  endpoint?: string;
  accountId?: string;
  urlStyle: StorageUrlStyle;
  publicBaseUrl?: string;
}

export type StoragePresignHandler = (
  client: StorageCommandClient,
  command: unknown,
  options: { expiresIn: number },
) => Promise<string>;

export interface StorageClientOptions {
  bucket: string;
  provider?: StorageProvider;
  region?: string;
  endpoint?: string;
  accountId?: string;
  credentials?: S3ClientConfig["credentials"];
  publicBaseUrl?: string;
  keyPrefix?: StorageKey;
  forcePathStyle?: boolean;
  urlStyle?: StorageUrlStyle;
  defaultMetadata?: StorageMetadata;
  defaultTags?: StorageTags;
  defaultContentType?: string;
  defaultCacheControl?: string;
  defaultContentDisposition?: string;
  defaultContentEncoding?: string;
  defaultContentLanguage?: string;
  defaultUploadExpiresIn?: number;
  defaultDownloadExpiresIn?: number;
  client?: StorageCommandClient;
  presignUrl?: StoragePresignHandler;
  s3ClientConfig?: Omit<S3ClientConfig, "region" | "endpoint" | "credentials" | "forcePathStyle">;
  resolveKey?: (key: string, context: StorageOperationContext) => string;
  buildPublicUrl?: (input: ResolvedStoragePublicUrlInput) => string;
}

export interface StorageObjectTarget {
  bucket?: string;
  key: StorageKey;
}

export interface PutObjectInput extends StorageObjectTarget {
  body: PutObjectCommandInput["Body"];
  metadata?: StorageMetadata;
  tags?: StorageTags;
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  contentMD5?: string;
  expires?: Date;
  publicUrl?: boolean;
  commandInput?: Omit<PutObjectCommandInput, "Bucket" | "Key" | "Body" | "Metadata" | "Tagging">;
}

export interface HeadObjectInput extends StorageObjectTarget {
  notFound?: "null" | "error";
  publicUrl?: boolean;
  commandInput?: Omit<HeadObjectCommandInput, "Bucket" | "Key">;
}

export interface DeleteObjectInput extends StorageObjectTarget {
  publicUrl?: boolean;
  commandInput?: Omit<DeleteObjectCommandInput, "Bucket" | "Key">;
}

export interface CreatePresignedUploadUrlInput extends StorageObjectTarget {
  expiresIn?: number;
  metadata?: StorageMetadata;
  tags?: StorageTags;
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  contentMD5?: string;
  publicUrl?: boolean;
  commandInput?: Omit<PutObjectCommandInput, "Bucket" | "Key" | "Body" | "Metadata" | "Tagging">;
}

export interface CreatePresignedDownloadUrlInput extends StorageObjectTarget {
  expiresIn?: number;
  publicUrl?: boolean;
  commandInput?: Omit<GetObjectCommandInput, "Bucket" | "Key">;
}

export interface CreatePublicUrlInput extends StorageObjectTarget {}

export interface StorageObjectDescriptor {
  bucket: string;
  key: string;
  provider: StorageProvider;
  publicUrl: string | null;
}

export interface PutObjectResult extends StorageObjectDescriptor {
  etag: string | null;
  versionId: string | null;
  checksumCRC32: string | null;
  checksumCRC32C: string | null;
  checksumSHA1: string | null;
  checksumSHA256: string | null;
}

export interface HeadObjectResult extends StorageObjectDescriptor {
  exists: true;
  etag: string | null;
  versionId: string | null;
  lastModified: string | null;
  expiresAt: string | null;
  contentLength: number | null;
  contentType: string | null;
  cacheControl: string | null;
  contentDisposition: string | null;
  contentEncoding: string | null;
  contentLanguage: string | null;
  metadata: StorageMetadata;
  raw: HeadObjectCommandOutput;
}

export interface DeleteObjectResult extends StorageObjectDescriptor {
  versionId: string | null;
  deleteMarker: boolean;
  raw: DeleteObjectCommandOutput;
}

export interface PresignedRequest extends StorageObjectDescriptor {
  method: "GET" | "PUT";
  url: string;
  headers: Record<string, string>;
  expiresIn: number;
  expiresAt: string;
}

export interface BuildPutCommandInputOptions {
  bucket: string;
  key: string;
  defaults: {
    metadata?: StorageMetadata;
    tags?: StorageTags;
    contentType?: string;
    cacheControl?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    contentLanguage?: string;
  };
}

export interface StorageDefaults {
  metadata?: StorageMetadata;
  tags?: StorageTags;
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
}

export interface PutCommandShape {
  metadata?: StorageMetadata;
  tags?: StorageTags;
  contentType?: string;
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  contentMD5?: string;
  expires?: Date;
}

export type StoragePutOutput = PutObjectCommandOutput;
