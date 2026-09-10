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

/** A transport-level failure that never reached the provider: DNS, TLS, connection reset. */
export class NetworkError extends NoriapayError {
  constructor(message: string, options?: { cause?: unknown; details?: unknown }) {
    super(message, { ...options, code: "NETWORK_ERROR" });
    this.name = "NetworkError";
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

/** A payload rejected before it was sent, by the provider's own published field rules. */
export class ValidationError extends NoriapayError {
  readonly errors: string[];

  constructor(message: string, options: { errors: string[]; cause?: unknown; details?: unknown }) {
    super(message, { code: "VALIDATION_ERROR", cause: options.cause, details: options.details });
    this.name = "ValidationError";
    this.errors = options.errors;
  }
}

/**
 * A failure the provider reported inside an HTTP 200 body.
 *
 * Every provider in this package signals business outcomes this way — M-PESA with
 * `ResponseCode`, SasaPay and Paystack with `status`, KCB Buni with `header.statusCode` —
 * so an HTTP-level check alone will treat a declined payment as a success.
 */
export class BusinessError extends NoriapayError {
  readonly provider: string;
  readonly statusCode?: string;
  readonly responseBody?: unknown;

  constructor(
    message: string,
    options: {
      provider: string;
      statusCode?: string;
      responseBody?: unknown;
      cause?: unknown;
      details?: unknown;
    },
  ) {
    super(message, {
      code: "BUSINESS_ERROR",
      cause: options.cause,
      details: options.details ?? options.responseBody,
    });
    this.name = "BusinessError";
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.responseBody = options.responseBody;
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
