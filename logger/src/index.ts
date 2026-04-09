import pino from "pino";
import type { DestinationStream, LoggerOptions } from "pino";
import { createCloudWatchDestination } from "./cloudwatch";
import { createFileDestination } from "./file";
import { createRedactMatcher, parseCommaSeparatedList, sanitizeLogValue } from "./redaction";
import { createLoggerRuntimeContext } from "./targets";
import type {
  LoggerSchemaConfig,
  LoggerRuntimeContext,
  LoggerDestination,
  LoggerRedactionConfig,
  ManagedLogger,
  ServiceLoggerConfig,
} from "./types";

export type {
  CloudWatchLoggerConfig,
  FileLoggerConfig,
  LogLevel,
  LoggerRuntimeContext,
  LoggerTargetContext,
  LoggerDestination,
  LoggerIdentityConfig,
  ManagedLogger,
  LoggerRedactionConfig,
  LoggerSchemaConfig,
  RedactMatcher,
  RotationMode,
  ServiceLoggerConfig,
  TargetConfig,
  TargetResolver,
} from "./types";

export { createCloudWatchDestination } from "./cloudwatch";
export { createFileDestination } from "./file";
export {
  createRedactMatcher,
  parseCommaSeparatedList as parseLoggerRedactKeys,
  sanitizeLogValue,
} from "./redaction";
export {
  createLoggerRuntimeContext,
  createLoggerTargetContext,
  formatDateStamp,
  resolveTarget,
} from "./targets";

type ManagedDestination = {
  stream: DestinationStream;
  flush: () => Promise<void>;
  close: () => Promise<void>;
};

export function createServiceLogger(config: ServiceLoggerConfig): ManagedLogger {
  const destinations: LoggerDestination[] =
    config.destinations?.length ? config.destinations : ["stdout"];
  const schema = resolveSchemaConfig(config.schema);
  const redactConfig = resolveRedactionConfig(config);
  const redactMatcher = createRedactMatcher(redactConfig);
  const runtimeContext = createLoggerRuntimeContext({
    environment: config.environment,
    hostname: config.identity?.hostname,
    instanceId: config.identity?.instanceId,
    pid: config.identity?.pid,
    serviceName: config.serviceName,
  });
  const managedDestinations = destinations.map((destination) =>
    createManagedDestination(destination, config, runtimeContext),
  );

  const loggerOptions: LoggerOptions = {
    level: config.level ?? "info",
    messageKey: schema.messageKey,
    errorKey: schema.errorKey,
    base: createBaseFields(config, schema),
    formatters: {
      level(label, number) {
        return {
          [schema.levelKey]: label,
          [schema.levelValueKey]: number,
        };
      },
    },
    timestamp: createJsonTimestamp(schema),
    hooks: {
      logMethod(inputArgs, method) {
        const sanitizedArgs = inputArgs.map((arg) =>
          arg instanceof Error ? arg : sanitizeLogValue(arg, redactMatcher),
        );
        method.apply(this, sanitizedArgs as Parameters<typeof method>);
      },
    },
  };

  const logger =
    managedDestinations.length === 1
      ? pino(loggerOptions, managedDestinations[0]!.stream)
      : pino(
          loggerOptions,
          pino.multistream(managedDestinations.map((entry) => ({ stream: entry.stream }))),
        );

  return {
    logger,
    flush: async () => {
      await Promise.all(managedDestinations.map((entry) => entry.flush()));
    },
    close: async () => {
      await Promise.all(managedDestinations.map((entry) => entry.close()));
    },
  };
}

export function parseLoggerDestinations(rawValue?: string): LoggerDestination[] {
  const rawEntries = parseCommaSeparatedList(rawValue);
  const entries = rawEntries.length > 0 ? rawEntries : ["stdout"];
  const destinations = entries.map((entry) => entry.toLowerCase());

  for (const destination of destinations) {
    if (!isLoggerDestination(destination)) {
      throw new Error(`Unsupported logger destination '${destination}'.`);
    }
  }

  return [...new Set(destinations)] as LoggerDestination[];
}

function createManagedDestination(
  destination: LoggerDestination,
  config: ServiceLoggerConfig,
  runtimeContext: LoggerRuntimeContext,
): ManagedDestination {
  switch (destination) {
    case "stdout":
      return createPinoDestination(1);
    case "stderr":
      return createPinoDestination(2);
    case "file":
      if (!config.file) {
        throw new Error("file logging requires file configuration.");
      }
      return createFileDestination(config.file, runtimeContext);
    case "cloudwatch":
      if (!config.cloudwatch) {
        throw new Error("cloudwatch logging requires cloudwatch configuration.");
      }
      return createCloudWatchDestination(config.cloudwatch, runtimeContext);
  }
}

function createPinoDestination(target: number): ManagedDestination {
  const stream = pino.destination({ dest: target, sync: false });

  return {
    stream,
    flush: async () => {
      if (typeof stream.flush === "function") {
        stream.flush();
      }
    },
    close: async () => {
      if (typeof stream.flush === "function") {
        stream.flush();
      }
    },
  };
}

function isLoggerDestination(value: string): value is LoggerDestination {
  return value === "stdout" || value === "stderr" || value === "file" || value === "cloudwatch";
}

function createJsonTimestamp(schema: Required<LoggerSchemaConfig>): () => string {
  return () => {
    const now = Date.now();
    const fields = [];

    if (schema.timeMode === "epoch" || schema.timeMode === "both") {
      fields.push(`"${schema.timeKey}":${now}`);
    }

    if (schema.timeMode === "iso" || schema.timeMode === "both") {
      fields.push(`"${schema.timestampKey}":"${new Date(now).toISOString()}"`);
    }

    return `,${fields.join(",")}`;
  };
}

function createBaseFields(
  config: ServiceLoggerConfig,
  schema: Required<LoggerSchemaConfig>,
): Record<string, unknown> {
  return {
    [schema.serviceKey]: config.serviceName,
    ...(config.environment ? { [schema.environmentKey]: config.environment } : {}),
    ...(config.base ?? {}),
  };
}

function resolveSchemaConfig(schema: LoggerSchemaConfig | undefined): Required<LoggerSchemaConfig> {
  const resolved = {
    messageKey: schema?.messageKey ?? "msg",
    levelKey: schema?.levelKey ?? "level",
    levelValueKey: schema?.levelValueKey ?? "levelValue",
    timeKey: schema?.timeKey ?? "time",
    timestampKey: schema?.timestampKey ?? "timestamp",
    serviceKey: schema?.serviceKey ?? "service",
    environmentKey: schema?.environmentKey ?? "environment",
    errorKey: schema?.errorKey ?? "err",
    timeMode: schema?.timeMode ?? "both",
  } satisfies Required<LoggerSchemaConfig>;

  if (resolved.timeMode === "both" && resolved.timeKey === resolved.timestampKey) {
    throw new Error("schema.timeKey and schema.timestampKey must differ when both timestamp fields are enabled.");
  }

  return resolved;
}

function resolveRedactionConfig(config: ServiceLoggerConfig): LoggerRedactionConfig {
  if (config.redact) {
    return {
      keys: config.redact.keys ?? config.redactKeys ?? [],
      mode: config.redact.mode ?? "merge",
    };
  }

  return {
    keys: config.redactKeys ?? [],
    mode: "merge",
  };
}
export default createServiceLogger;
