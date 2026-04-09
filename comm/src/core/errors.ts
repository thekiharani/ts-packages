export class NoriaMessagingError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, options?: { code?: string; cause?: unknown; details?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "NoriaMessagingError";
    this.code = options?.code ?? "NORIA_MESSAGING_ERROR";
    this.details = options?.details;
  }
}

export class ConfigurationError extends NoriaMessagingError {
  constructor(message: string, options?: { cause?: unknown; details?: unknown }) {
    super(message, { ...options, code: "CONFIGURATION_ERROR" });
    this.name = "ConfigurationError";
  }
}

export class TimeoutError extends NoriaMessagingError {
  constructor(message: string, options?: { cause?: unknown; details?: unknown }) {
    super(message, { ...options, code: "TIMEOUT_ERROR" });
    this.name = "TimeoutError";
  }
}

export class NetworkError extends NoriaMessagingError {
  constructor(message: string, options?: { cause?: unknown; details?: unknown }) {
    super(message, { ...options, code: "NETWORK_ERROR" });
    this.name = "NetworkError";
  }
}

export class ApiError extends NoriaMessagingError {
  readonly status: number;
  readonly responseBody?: unknown;

  constructor(
    message: string,
    options: { status: number; responseBody?: unknown; cause?: unknown; details?: unknown },
  ) {
    super(message, { code: "API_ERROR", cause: options.cause, details: options.details });
    this.name = "ApiError";
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}

export class GatewayError extends NoriaMessagingError {
  readonly provider: string;
  readonly errorCode?: string;
  readonly errorDescription?: string;
  readonly responseBody?: unknown;

  constructor(
    message: string,
    options: {
      provider: string;
      errorCode?: string;
      errorDescription?: string;
      responseBody?: unknown;
      cause?: unknown;
      details?: unknown;
    },
  ) {
    super(message, { code: "GATEWAY_ERROR", cause: options.cause, details: options.details });
    this.name = "GatewayError";
    this.provider = options.provider;
    this.errorCode = options.errorCode;
    this.errorDescription = options.errorDescription;
    this.responseBody = options.responseBody;
  }
}

export class WebhookVerificationError extends NoriaMessagingError {
  constructor(message: string, options?: { cause?: unknown; details?: unknown }) {
    super(message, { ...options, code: "WEBHOOK_VERIFICATION_ERROR" });
    this.name = "WebhookVerificationError";
  }
}

export { NoriaMessagingError as NoriaSmsError };
