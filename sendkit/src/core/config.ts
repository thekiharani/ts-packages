import process from "node:process";

import { ConfigurationError } from "./errors";

export type EnvLike = Record<string, string | undefined>;

export function resolveEnv(env?: EnvLike): EnvLike {
  return env ?? process.env;
}

export function getOptionalEnv(name: string, env?: EnvLike): string | undefined {
  const value = resolveEnv(env)[name];

  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized === "" ? undefined : normalized;
}

export function getRequiredEnv(name: string, env?: EnvLike): string {
  const value = getOptionalEnv(name, env);

  if (value === undefined) {
    throw new ConfigurationError(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getEnvNumber(name: string, env?: EnvLike): number | undefined {
  const value = getOptionalEnv(name, env);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new ConfigurationError(`Environment variable ${name} must be a valid number.`);
  }

  return parsed;
}
