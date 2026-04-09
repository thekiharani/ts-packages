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

export function encodeBasicAuth(username: string, password: string): string {
  const raw = `${username}:${password}`;

  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(raw);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(raw, "utf8").toString("base64");
  }

  throw new ConfigurationError("No base64 encoder is available in this runtime.");
}

export function toAmountString(value: string | number): string {
  return typeof value === "number" ? value.toString() : value;
}

export function toJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function formatTimestamp(date: Date = new Date()): string {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}
