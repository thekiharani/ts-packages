import type { StorageOperation } from "./types";

export interface StorageErrorOptions {
  code: string;
  operation: StorageOperation;
  provider: string;
  bucket?: string;
  key?: string;
  statusCode?: number;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class StorageError extends Error {
  readonly code: string;
  readonly operation: StorageOperation;
  readonly provider: string;
  readonly bucket?: string;
  readonly key?: string;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;

  constructor(message: string, options: StorageErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "StorageError";
    this.code = options.code;
    this.operation = options.operation;
    this.provider = options.provider;
    this.bucket = options.bucket;
    this.key = options.key;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export default StorageError;
