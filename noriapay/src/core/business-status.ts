import { BusinessError } from "./errors";

export type BusinessStatusProvider = "mpesa" | "sasapay" | "paystack" | "kcb_buni";

export function businessSucceeded(
  provider: BusinessStatusProvider,
  body: unknown,
): boolean | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  switch (provider) {
    case "mpesa":
      return mpesaSucceeded(body);
    case "sasapay":
      return sasapaySucceeded(body);
    case "paystack":
      return paystackSucceeded(body);
    case "kcb_buni":
      return kcbBuniSucceeded(body);
    default:
      return undefined;
  }
}

export function businessStatusCode(
  provider: BusinessStatusProvider,
  body: unknown,
): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  for (const path of STATUS_CODE_PATHS[provider]) {
    const value = dig(body, path);

    if (isScalar(value) && String(value).trim() !== "") {
      return String(value);
    }
  }

  return undefined;
}

export function businessStatusMessage(
  provider: BusinessStatusProvider,
  body: unknown,
): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  for (const path of STATUS_MESSAGE_PATHS[provider]) {
    const value = dig(body, path);

    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return undefined;
}

export function assertBusinessSuccess(
  provider: BusinessStatusProvider,
  body: unknown,
  context: string,
): void {
  if (businessSucceeded(provider, body) !== false) {
    return;
  }

  const statusCode = businessStatusCode(provider, body);
  const message = businessStatusMessage(provider, body) ?? "The provider reported a business failure.";

  throw new BusinessError(
    `${context} failed: ${message}${statusCode === undefined ? "" : ` (status ${statusCode})`}`,
    { provider, statusCode, responseBody: body },
  );
}

const STATUS_CODE_PATHS: Record<BusinessStatusProvider, string[][]> = {
  mpesa: [["errorCode"], ["ResponseCode"], ["ResultCode"], ["Body", "stkCallback", "ResultCode"]],
  sasapay: [["statusCode"], ["ResponseCode"], ["status_code"]],
  paystack: [["code"]],
  kcb_buni: [
    ["header", "statusCode"],
    ["response", "ResponseCode"],
    ["statusCode"],
    ["ResponseCode"],
  ],
};

const STATUS_MESSAGE_PATHS: Record<BusinessStatusProvider, string[][]> = {
  mpesa: [
    ["errorMessage"],
    ["ResponseDescription"],
    ["ResultDesc"],
    ["Body", "stkCallback", "ResultDesc"],
    ["message"],
  ],
  sasapay: [["detail"], ["message"], ["statusMessage"], ["ResponseDescription"]],
  paystack: [["message"]],
  kcb_buni: [
    ["header", "statusMessage"],
    ["header", "statusDescription"],
    ["response", "ResponseDescription"],
    ["response", "CustomerMessage"],
    ["statusMessage"],
    ["message"],
  ],
};

function mpesaSucceeded(body: Record<string, unknown>): boolean | undefined {
  const errorCode = body["errorCode"];

  if (isScalar(errorCode) && String(errorCode).trim() !== "") {
    return false;
  }

  for (const path of [["ResponseCode"], ["ResultCode"], ["Body", "stkCallback", "ResultCode"]]) {
    const value = dig(body, path);

    if (isScalar(value) && String(value).trim() !== "") {
      return isZero(value);
    }
  }

  return undefined;
}

function sasapaySucceeded(body: Record<string, unknown>): boolean | undefined {
  const status = booleanish(body["status"]);

  if (status !== undefined) {
    return status;
  }

  for (const path of [["statusCode"], ["ResponseCode"]]) {
    const value = dig(body, path);

    if (isScalar(value) && String(value).trim() !== "") {
      return isZero(value);
    }
  }

  return undefined;
}

function paystackSucceeded(body: Record<string, unknown>): boolean | undefined {
  return booleanish(body["status"]);
}

function kcbBuniSucceeded(body: Record<string, unknown>): boolean | undefined {
  const markers = [
    dig(body, ["header", "statusCode"]),
    dig(body, ["response", "ResponseCode"]) ?? dig(body, ["ResponseCode"]),
    dig(body, ["statusCode"]),
  ];

  let found = false;

  for (const marker of markers) {
    if (!isScalar(marker) || String(marker).trim() === "") {
      continue;
    }

    found = true;

    if (!isZero(marker)) {
      return false;
    }
  }

  return found ? true : undefined;
}

function booleanish(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return undefined;
}

function isZero(value: unknown): boolean {
  const text = String(value).trim();

  return text === "0" || (text !== "" && Number.isFinite(Number(text)) && Number(text) === 0);
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dig(body: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = body;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}
