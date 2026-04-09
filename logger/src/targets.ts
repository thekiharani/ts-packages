import { hostname } from "node:os";
import type {
  LoggerRuntimeContext,
  LoggerTargetContext,
  RotationMode,
  TargetConfig,
} from "./types";

export function createLoggerRuntimeContext(input?: {
  environment?: string;
  hostname?: string;
  instanceId?: string;
  pid?: number;
  serviceName?: string;
}): LoggerRuntimeContext {
  return {
    serviceName: input?.serviceName,
    environment: input?.environment,
    hostname: input?.hostname ?? hostname(),
    instanceId: input?.instanceId,
    pid: input?.pid ?? process.pid,
  };
}

export function createLoggerTargetContext(
  runtime: LoggerRuntimeContext,
  timestamp: number,
): LoggerTargetContext {
  return {
    ...runtime,
    timestamp,
    isoTimestamp: new Date(timestamp).toISOString(),
  };
}

export function formatDateStamp(
  timestamp: number,
  options: {
    mode: RotationMode;
    timezone?: string;
  },
): string {
  if (options.mode === "none") {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: options.timezone ?? "UTC",
    year: "numeric",
    ...(options.mode === "annual" ? {} : { month: "2-digit" }),
    ...(options.mode === "daily" ? { day: "2-digit" } : {}),
  });

  const parts = formatter.formatToParts(new Date(timestamp));
  const year = parts.find((entry) => entry.type === "year")?.value;
  const month = parts.find((entry) => entry.type === "month")?.value;
  const day = parts.find((entry) => entry.type === "day")?.value;

  if (!year) {
    throw new Error("Unable to format log target year.");
  }

  if (options.mode === "annual") {
    return year;
  }

  if (!month) {
    throw new Error("Unable to format log target month.");
  }

  if (options.mode === "monthly") {
    return `${year}-${month}`;
  }

  if (!day) {
    throw new Error("Unable to format log target day.");
  }

  return `${year}-${month}-${day}`;
}

export function resolveTarget(
  target: TargetConfig | undefined,
  context: LoggerTargetContext,
  defaults: {
    identifier?: string;
    includeServiceName?: boolean;
    includeEnvironment?: boolean;
    includeHostname?: boolean;
    includeInstanceId?: boolean;
    includePid?: boolean;
    separator?: string;
    value?: string;
  } = {},
): string {
  if (target?.resolve) {
    return target.resolve(context);
  }

  if (target?.value) {
    return target.value;
  }

  const separator = target?.separator ?? defaults.separator ?? "-";
  const parts = [];
  const prefix = target?.prefix ?? defaults.value;

  if (prefix) {
    parts.push(prefix);
  }

  const rotation = target?.rotation ?? "none";
  if (rotation !== "none") {
    parts.push(
      formatDateStamp(context.timestamp, {
        mode: rotation,
        timezone: target?.timezone,
      }),
    );
  }

  const includeServiceName =
    target?.includeServiceName ?? defaults.includeServiceName ?? false;
  const includeEnvironment =
    target?.includeEnvironment ?? defaults.includeEnvironment ?? false;
  const includeHostname = target?.includeHostname ?? defaults.includeHostname ?? false;
  const includeInstanceId =
    target?.includeInstanceId ?? defaults.includeInstanceId ?? false;
  const includePid = target?.includePid ?? defaults.includePid ?? false;
  const identifier = target?.identifier ?? defaults.identifier;

  if (includeServiceName && context.serviceName) {
    parts.push(context.serviceName);
  }

  if (includeEnvironment && context.environment) {
    parts.push(context.environment);
  }

  if (includeHostname) {
    parts.push(context.hostname);
  }

  if (includeInstanceId && context.instanceId) {
    parts.push(context.instanceId);
  }

  if (includePid) {
    parts.push(String(context.pid));
  }

  if (identifier) {
    parts.push(identifier);
  }

  return `${parts.filter(Boolean).join(separator)}${target?.suffix ?? ""}`;
}
