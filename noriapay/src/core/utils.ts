import { ConfigurationError } from "./errors";
import type { AmountNormalization, FetchLike, QueryParams } from "./types";

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

export function appendQuery(input: string, query?: QueryParams): string {
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

  if (typeof Buffer !== "undefined") {
    return Buffer.from(raw, "utf8").toString("base64");
  }

  if (typeof globalThis.btoa === "function") {
    if (/^[\x00-\xFF]*$/.test(raw)) {
      return globalThis.btoa(raw);
    }

    throw new ConfigurationError(
      "Credentials contain characters this runtime's base64 encoder cannot represent.",
    );
  }

  throw new ConfigurationError("No base64 encoder is available in this runtime.");
}

export function amountToString(value: string | number | boolean): string {
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  if (typeof value === "string") {
    return value;
  }

  if (!Number.isFinite(value)) {
    return String(value);
  }

  const text = Math.abs(value) < 1e21 ? value.toFixed(8) : expandExponential(value);

  return trimFractionalZeros(text);
}

export function toAmountString(value: string | number): string {
  return amountToString(value);
}

export function normalizeAmount<T extends object>(
  payload: T,
  normalization: AmountNormalization = "string",
): T {
  if (normalization === "none" || Array.isArray(payload)) {
    return payload;
  }

  const normalized = { ...payload } as Record<string, unknown>;

  for (const key of ["Amount", "amount"]) {
    const value = normalized[key];

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      normalized[key] = amountToString(value);
    }
  }

  return normalized as T;
}

export function resolveAmountNormalization(value?: string | null): AmountNormalization {
  const normalized = (value ?? "string").trim().toLowerCase();

  return normalized === "none" || normalized === "raw" || normalized === "preserve"
    ? "none"
    : "string";
}

export function normalizeKenyanPhoneNumber<T extends string | number>(value: T): T | string {
  const raw = String(value);

  if (!/^[\d\s()+-]+$/.test(raw)) {
    return value;
  }

  const digits = raw.replace(/\D/g, "");

  const leadingZero = /^0([17]\d{8})$/.exec(digits);
  if (leadingZero) {
    return `254${leadingZero[1]}`;
  }

  if (/^[17]\d{8}$/.test(digits)) {
    return `254${digits}`;
  }

  if (/^254[17]\d{8}$/.test(digits)) {
    return digits;
  }

  return value;
}

export function normalizeKenyanPhoneNumbers<T extends object>(payload: T, keys: string[]): T {
  const normalized = { ...payload } as Record<string, unknown>;
  let touched = false;

  for (const key of keys) {
    const value = normalized[key];

    if (typeof value !== "string" && typeof value !== "number") {
      continue;
    }

    const next = normalizeKenyanPhoneNumber(value);

    if (next !== value) {
      normalized[key] = next;
      touched = true;
    }
  }

  return touched ? (normalized as T) : payload;
}

export function toJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function formatTimestamp(date: Date = new Date(), timeZone = "Africa/Nairobi"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const lookup: Record<string, string> = {};
  for (const part of parts) {
    lookup[part.type] = part.value;
  }

  const hour = lookup["hour"] === "24" ? "00" : (lookup["hour"] ?? "00");

  return [
    (lookup["year"] ?? "0000").padStart(4, "0"),
    lookup["month"] ?? "01",
    lookup["day"] ?? "01",
    hour,
    lookup["minute"] ?? "00",
    lookup["second"] ?? "00",
  ].join("");
}

export function ipMatches(ip: string, pattern: string): boolean {
  const address = ip.trim();
  const rule = pattern.trim();

  if (address === "" || rule === "") {
    return false;
  }

  if (rule === "*" || rule === "0.0.0.0/0" || rule === "::/0") {
    return true;
  }

  const [network, prefixText] = rule.split("/", 2);
  const candidate = parseIp(address);
  const target = parseIp(network ?? "");

  if (!candidate || !target || candidate.length !== target.length) {
    return false;
  }

  const maxPrefix = candidate.length * 8;
  const prefix = prefixText === undefined ? maxPrefix : Number(prefixText);

  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
    return false;
  }

  const fullBytes = prefix >> 3;

  for (let index = 0; index < fullBytes; index += 1) {
    if (candidate[index] !== target[index]) {
      return false;
    }
  }

  const remainingBits = prefix & 7;

  if (remainingBits === 0) {
    return true;
  }

  const mask = 0xff << (8 - remainingBits) & 0xff;

  return ((candidate[fullBytes] ?? 0) & mask) === ((target[fullBytes] ?? 0) & mask);
}

export function ipInList(ip: string | null | undefined, patterns: Iterable<string>): boolean {
  if (!ip || ip.trim() === "") {
    return false;
  }

  for (const pattern of patterns) {
    if (ipMatches(ip, pattern)) {
      return true;
    }
  }

  return false;
}

function parseIp(value: string): number[] | undefined {
  const text = value.trim();

  if (text.includes(":")) {
    return parseIpv6(text);
  }

  return parseIpv4(text);
}

function parseIpv4(value: string): number[] | undefined {
  const parts = value.split(".");

  if (parts.length !== 4) {
    return undefined;
  }

  const bytes: number[] = [];

  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return undefined;
    }

    const byte = Number(part);

    if (byte > 255) {
      return undefined;
    }

    bytes.push(byte);
  }

  return bytes;
}

function parseIpv6(value: string): number[] | undefined {
  let text = value;
  let tail: number[] = [];

  const dotted = text.lastIndexOf(":");
  const maybeIpv4 = text.slice(dotted + 1);

  if (maybeIpv4.includes(".")) {
    const parsed = parseIpv4(maybeIpv4);

    if (!parsed) {
      return undefined;
    }

    tail = parsed;
    text = text.slice(0, dotted + 1) + "0:0";
  }

  const halves = text.split("::");

  if (halves.length > 2) {
    return undefined;
  }

  const head = halves[0] === "" ? [] : (halves[0] ?? "").split(":");
  const rest = halves.length === 2 ? (halves[1] === "" ? [] : (halves[1] ?? "").split(":")) : [];

  const groups: string[] =
    halves.length === 2
      ? [...head, ...Array(Math.max(0, 8 - head.length - rest.length)).fill("0"), ...rest]
      : head;

  if (groups.length !== 8) {
    return undefined;
  }

  const bytes: number[] = [];

  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) {
      return undefined;
    }

    const word = Number.parseInt(group, 16);
    bytes.push((word >> 8) & 0xff, word & 0xff);
  }

  if (tail.length === 4) {
    bytes.splice(12, 4, ...tail);
  }

  return bytes;
}

function expandExponential(value: number): string {
  const text = value.toString();
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(text);

  if (!match) {
    return text;
  }

  const sign = match[1] ?? "";
  const intPart = match[2] ?? "0";
  const fracPart = match[3] ?? "";
  const exponent = Number(match[4]);
  const digits = intPart + fracPart;
  const pointPosition = intPart.length + exponent;

  if (pointPosition <= 0) {
    return `${sign}0.${"0".repeat(-pointPosition)}${digits}`;
  }

  if (pointPosition >= digits.length) {
    return `${sign}${digits}${"0".repeat(pointPosition - digits.length)}`;
  }

  return `${sign}${digits.slice(0, pointPosition)}.${digits.slice(pointPosition)}`;
}

function trimFractionalZeros(value: string): string {
  if (!value.includes(".")) {
    return value;
  }

  return value.replace(/0+$/, "").replace(/\.$/, "");
}
