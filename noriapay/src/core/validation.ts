import { ValidationError } from "./errors";

/**
 * A single provider-published field constraint.
 *
 * `required` checks presence only, because providers routinely require a key
 * while accepting a blank value for it — Buni's `orgShortCode` on a shared
 * short code is the standing example.
 */
export interface FieldRule {
  required?: boolean;
  notEmpty?: boolean;
  max?: number;
  numeric?: boolean;
  pattern?: RegExp;
  boolean?: boolean;
  /** Human-readable shape, appended to a pattern failure. */
  format?: string;
}

export type FieldRules = Record<string, FieldRule>;

export function validateFields(payload: Record<string, unknown>, rules: FieldRules): string[] {
  const errors: string[] = [];

  for (const [field, rule] of Object.entries(rules)) {
    if (!(field in payload)) {
      if (rule.required) {
        errors.push(`[${field}] is required.`);
      }

      continue;
    }

    const value = payload[field];

    if (value === null || value === undefined) {
      if (rule.required) {
        errors.push(`[${field}] is required and cannot be null.`);
      }

      continue;
    }

    errors.push(...checkValue(field, value, rule));
  }

  return errors;
}

export function assertFields(
  payload: Record<string, unknown>,
  rules: FieldRules,
  context: string,
): void {
  const errors = validateFields(payload, rules);

  if (errors.length === 0) {
    return;
  }

  throw new ValidationError(`${context} payload is invalid: ${errors.join(" ")}`, { errors });
}

function checkValue(field: string, value: unknown, rule: FieldRule): string[] {
  if (rule.boolean) {
    return typeof value === "boolean" ? [] : [`[${field}] must be a boolean.`];
  }

  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    return [`[${field}] must be a scalar value.`];
  }

  if (rule.numeric && !isNumeric(value)) {
    return [`[${field}] must be numeric.`];
  }

  const text = typeof value === "boolean" ? (value ? "true" : "false") : String(value);

  if (rule.notEmpty && text.trim() === "") {
    return [`[${field}] cannot be empty.`];
  }

  const errors: string[] = [];

  if (rule.max !== undefined && [...text].length > rule.max) {
    errors.push(`[${field}] must not exceed ${rule.max} characters, got ${[...text].length}.`);
  }

  if (rule.pattern && text !== "" && !rule.pattern.test(text)) {
    errors.push(`[${field}] is malformed.${rule.format ? ` Expected format: ${rule.format}.` : ""}`);
  }

  return errors;
}

function isNumeric(value: string | number | boolean): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "boolean") {
    return false;
  }

  return value.trim() !== "" && Number.isFinite(Number(value));
}
