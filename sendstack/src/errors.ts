import type { ErrorEnvelope } from "./types";

export interface MailerErrorOptions {
  statusCode: number;
  code?: string;
  details?: unknown;
  responseBody?: unknown;
}

export class MailerError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly responseBody?: unknown;

  constructor(message: string, options: MailerErrorOptions) {
    super(message);
    this.name = "MailerError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
    this.responseBody = options.responseBody;
  }
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record["ok"] !== false) {
    return false;
  }

  const error = record["error"];
  return Boolean(error && typeof error === "object");
}
