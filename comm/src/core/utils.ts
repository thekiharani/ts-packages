import { ConfigurationError } from "./errors";
import type { FetchLike } from "./types";

export function getFetch(override?: FetchLike): FetchLike {
  if (override) {
    return override;
  }

  if (typeof globalThis.fetch !== "function") {
    throw new ConfigurationError("A fetch implementation is required in this runtime.");
  }

  return globalThis.fetch.bind(globalThis);
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function appendPath(baseUrl: string, path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedBase = trimTrailingSlash(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function appendQuery(
  input: string,
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!query) {
    return input;
  }

  const url = new URL(input);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

export function toJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function coerceString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized === "" ? undefined : normalized;
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = coerceString(value);
    if (normalized !== undefined) {
      return normalized;
    }
  }

  return undefined;
}

export function requireString(value: unknown, fieldName: string): string {
  const normalized = coerceString(value);

  if (normalized === undefined) {
    throw new ConfigurationError(`${fieldName} is required.`);
  }

  return normalized;
}

export function compactRecord<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null),
  ) as Partial<T>;
}

export function normalizeQueryMapping(
  input: Record<string, unknown>,
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      normalized[key] = coerceString(value[0]);
      continue;
    }

    normalized[key] = coerceString(value);
  }

  return normalized;
}

export function buildErrorMessage(status: number, responseBody: unknown): string {
  const objectBody = toJsonObject(responseBody);

  return typeof objectBody["errorMessage"] === "string"
    ? objectBody["errorMessage"]
    : typeof objectBody["detail"] === "string"
      ? objectBody["detail"]
      : typeof objectBody["message"] === "string"
        ? objectBody["message"]
        : typeof objectBody["ErrorDescription"] === "string"
          ? objectBody["ErrorDescription"]
          : `Request failed with status ${status}`;
}

export function formatScheduleTime(value: Date | string): string {
  if (value instanceof Date) {
    const year = value.getFullYear().toString().padStart(4, "0");
    const month = (value.getMonth() + 1).toString().padStart(2, "0");
    const day = value.getDate().toString().padStart(2, "0");
    const hours = value.getHours().toString().padStart(2, "0");
    const minutes = value.getMinutes().toString().padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  return requireString(value, "scheduleAt");
}

export function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = coerceString(value)?.toLowerCase();

  if (normalized === undefined) {
    return undefined;
  }

  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  return undefined;
}

export function coerceInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  const normalized = coerceString(value);

  if (normalized === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = coerceString(value);

  if (normalized === undefined) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}
