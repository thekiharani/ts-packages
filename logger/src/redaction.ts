import type { LoggerRedactionConfig, RedactMatcher } from "./types";

const defaultSensitiveKeyPattern =
  /(token|secret|key|password|passkey|authorization|dsn|credential|api_key)/i;

export function createRedactMatcher(
  config: LoggerRedactionConfig | string[] = [],
): RedactMatcher {
  const resolvedConfig = Array.isArray(config)
    ? { keys: config, mode: "merge" as const }
    : { keys: config.keys ?? [], mode: config.mode ?? "merge" };

  const exactKeys = new Set(
    resolvedConfig.keys.map((entry) => entry.trim().toLowerCase()).filter(Boolean),
  );

  return (key: string) =>
    (resolvedConfig.mode === "merge" && defaultSensitiveKeyPattern.test(key)) ||
    exactKeys.has(key.toLowerCase());
}

export function sanitizeLogValue(value: unknown, shouldRedact: RedactMatcher): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeLogValue(entry, shouldRedact));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        shouldRedact(key) ? "[REDACTED]" : sanitizeLogValue(entry, shouldRedact),
      ]),
    );
  }

  return value;
}

export function parseCommaSeparatedList(rawValue?: string): string[] {
  if (!rawValue?.trim()) {
    return [];
  }

  return [...new Set(rawValue.split(",").map((entry) => entry.trim()).filter(Boolean))];
}
