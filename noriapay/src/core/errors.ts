export class NoriapayError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, options?: { code?: string; cause?: unknown; details?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "NoriapayError";
    this.code = options?.code ?? "NORIAPAY_ERROR";
    this.details = options?.details;
  }
}

export class ConfigurationError extends NoriapayError {
  constructor(message: string, options?: { cause?: unknown; details?: unknown }) {
    super(message, { ...options, code: "CONFIGURATION_ERROR" });
    this.name = "ConfigurationError";
  }
}

export class TimeoutError extends NoriapayError {
  constructor(message: string, options?: { cause?: unknown; details?: unknown }) {
    super(message, { ...options, code: "TIMEOUT_ERROR" });
    this.name = "TimeoutError";
  }
}

export class AuthenticationError extends NoriapayError {
  constructor(message: string, options?: { cause?: unknown; details?: unknown }) {
    super(message, { ...options, code: "AUTHENTICATION_ERROR" });
    this.name = "AuthenticationError";
  }
}

export class WebhookVerificationError extends NoriapayError {
  constructor(message: string, options?: { cause?: unknown; details?: unknown }) {
    super(message, { ...options, code: "WEBHOOK_VERIFICATION_ERROR" });
    this.name = "WebhookVerificationError";
  }
}

export class ApiError extends NoriapayError {
  readonly status: number;
  readonly responseBody?: unknown;

  constructor(
    message: string,
    options: {
      status: number;
      responseBody?: unknown;
      cause?: unknown;
      details?: unknown;
    },
  ) {
    super(message, { code: "API_ERROR", cause: options.cause, details: options.details });
    this.name = "ApiError";
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}
