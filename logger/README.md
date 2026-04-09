# `@noria/logger`

Structured JSON logging for Node.js services, built on `pino`.

Supported destinations:

- `stdout`
- `stderr`
- `file`
- `cloudwatch`

Node `24+` is required.

## Install

```bash
npm install @noria/logger
```

## Recommended Deployment Model

For most production systems:

1. log structured JSON to `stdout`
2. let the runtime or platform ship logs to CloudWatch, Loki, Datadog, or another backend

Use direct `cloudwatch` delivery only when the application must own log shipping itself.

## Quick Start

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "payments",
  environment: process.env.NODE_ENV,
});

export const logger = managedLogger.logger;
export const flushLogger = managedLogger.flush;
export const closeLogger = managedLogger.close;
```

Default behavior:

- destination defaults to `["stdout"]`
- level defaults to `"info"`
- `level` is emitted as a string and `levelValue` keeps the numeric severity
- `time` is emitted as Unix epoch milliseconds and `timestamp` as ISO UTC
- base log fields always include `service`
- `environment` is included when provided
- common secret-like keys are redacted automatically
- runtime identity defaults to the current `hostname` and `pid`

Example output:

```json
{
  "level": "info",
  "levelValue": 30,
  "time": 1774566041398,
  "timestamp": "2026-03-27T02:20:41.398Z",
  "service": "payments",
  "environment": "production",
  "msg": "Service started"
}
```

Structured error example:

```json
{
  "level": "error",
  "levelValue": 50,
  "time": 1774566041398,
  "timestamp": "2026-03-27T02:20:41.398Z",
  "service": "conversations",
  "conversationId": "conv_123",
  "err": {
    "name": "Error",
    "message": "Webhook signature mismatch",
    "stack": "Error: Webhook signature mismatch\n    at ..."
  },
  "msg": "Failed to process inbound webhook"
}
```

Structured payload example:

```json
{
  "level": "info",
  "levelValue": 30,
  "time": 1774566041398,
  "timestamp": "2026-03-27T02:20:41.398Z",
  "service": "conversations",
  "provider": "telegram",
  "payload": {
    "update_id": 1,
    "message": {
      "message_id": 10,
      "text": "Hello"
    }
  },
  "msg": "Received Telegram webhook"
}
```

## Driver Examples

### `stdout`

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "api",
  environment: "development",
  destinations: ["stdout"],
});
```

### `stderr`

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "worker",
  destinations: ["stderr"],
});
```

### Fixed File Path

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "mailer",
  destinations: ["file"],
  file: {
    target: {
      value: "/var/log/mailer/service.log",
    },
  },
});
```

### Rotated File Paths

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "batch",
  environment: "production",
  destinations: ["file"],
  file: {
    target: {
      prefix: "./logs/batch",
      rotation: "monthly",
      timezone: "Africa/Nairobi",
      includeEnvironment: true,
      suffix: ".log",
    },
  },
});
```

That resolves to paths like:

```text
./logs/batch-2026-03-production.log
```

### CloudWatch With Rotating Streams

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "conversations",
  environment: "production",
  destinations: ["cloudwatch"],
  cloudwatch: {
    region: "af-south-1",
    logGroupName: "/norialabs/conversations",
    stream: {
      prefix: "api",
      rotation: "daily",
    },
  },
});
```

That resolves to stream names like:

```text
api-2026-03-27-hostname
```

Rotation is based on each event timestamp, so rollover works without restarting the process.

By default, rotating CloudWatch streams with a configured `prefix` resolve to `prefix-date-hostname`.

### CloudWatch With Explicit AWS Credentials

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "billing",
  destinations: ["cloudwatch"],
  cloudwatch: {
    region: "af-south-1",
    logGroupName: "/norialabs/billing",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    },
    stream: {
      prefix: "billing",
      rotation: "monthly",
    },
  },
});
```

If `credentials` is omitted, the AWS SDK credential chain is used as-is.

### CloudWatch With Retention

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "billing",
  destinations: ["cloudwatch"],
  cloudwatch: {
    region: "af-south-1",
    logGroupName: "/norialabs/billing",
    retentionInDays: 30,
    stream: {
      prefix: "billing",
      rotation: "daily",
    },
  },
});
```

Important:

- retention is applied at the CloudWatch log-group level
- all streams in the same log group share that retention policy
- if `retentionInDays` is omitted, the package leaves retention unmanaged and unchanged
- that means the package does not set an expiry by default
- valid values are the CloudWatch-supported retention periods:
  `1`, `3`, `5`, `7`, `14`, `30`, `60`, `90`, `120`, `150`, `180`, `365`, `400`,
  `545`, `731`, `1096`, `1827`, `2192`, `2557`, `2922`, `3288`, `3653`

### Multiple Destinations

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "worker",
  environment: "production",
  destinations: ["stdout", "file"],
  file: {
    target: {
      value: "./logs/worker.log",
    },
  },
});
```

### Custom Schema

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "api",
  environment: "production",
  schema: {
    messageKey: "message",
    levelKey: "severity",
    levelValueKey: "severityValue",
    timeKey: "ts",
    timestampKey: "tsIso",
    serviceKey: "app",
    environmentKey: "stage",
    errorKey: "error",
    timeMode: "iso",
  },
});
```

This emits records like:

```json
{
  "severity": "info",
  "severityValue": 30,
  "tsIso": "2026-03-27T02:20:41.398Z",
  "app": "api",
  "stage": "production",
  "message": "Service started"
}
```

### Custom Identity

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "worker",
  identity: {
    hostname: "pod-7",
    instanceId: "replica-a",
    pid: 42,
  },
  destinations: ["cloudwatch"],
  cloudwatch: {
    region: "af-south-1",
    logGroupName: "/norialabs/worker",
    stream: {
      prefix: "jobs",
      rotation: "daily",
      includeHostname: false,
      includeInstanceId: true,
    },
  },
});
```

That resolves to stream names like:

```text
jobs-2026-03-27-replica-a
```

### Redaction Modes

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "api",
  redact: {
    keys: ["session_id"],
    mode: "replace",
  },
});
```

Redaction modes:

- `merge`: built-in sensitive keys plus your custom keys
- `replace`: only your custom keys

## Target Model

`file.target` and `cloudwatch.stream` share the same structure:

```ts
type TargetConfig = {
  value?: string;
  prefix?: string;
  suffix?: string;
  separator?: string;
  rotation?: "none" | "daily" | "monthly" | "annual";
  timezone?: string;
  identifier?: string;
  includeServiceName?: boolean;
  includeEnvironment?: boolean;
  includeHostname?: boolean;
  includeInstanceId?: boolean;
  includePid?: boolean;
  resolve?: (context) => string;
};
```

Resolution order:

1. `resolve(context)` if provided
2. `value` if provided
3. composed target from prefix, rotation stamp, and optional runtime fields

Available resolver context:

- `serviceName`
- `environment`
- `hostname`
- `instanceId`
- `pid`
- `timestamp`
- `isoTimestamp`

Notes:

- `timezone` defaults to `UTC`
- `rotation` defaults to `"none"`
- monthly and annual rotation are timezone-aware, not just daily
- `includeHostname` defaults to `true` for rotating CloudWatch streams with a configured `prefix`
- `includeInstanceId` defaults to `false`
- `identifier` lets you append a stable custom suffix after the date and runtime parts
- `includePid` defaults to `false` unless you opt in explicitly
- otherwise inclusion flags default to `false`

## Target Examples

### Fixed Value

```ts
target: {
  value: "./logs/app.log",
}
```

### Daily Rotation

```ts
target: {
  prefix: "./logs/app",
  rotation: "daily",
  suffix: ".log",
}
```

Resolves to:

```text
./logs/app-2026-03-27.log
```

### Monthly Rotation With Runtime Parts

```ts
target: {
  prefix: "jobs",
  rotation: "monthly",
  identifier: "worker-a",
  includeHostname: false,
  includeEnvironment: true,
}
```

Resolves to:

```text
jobs-2026-03-production-worker-a
```

### Prefix-Date Only

```ts
target: {
  prefix: "api",
  rotation: "daily",
  includeHostname: false,
}
```

Resolves to:

```text
api-2026-03-27
```

### Prefix-Date-Custom Identifier

```ts
target: {
  prefix: "api",
  rotation: "daily",
  includeHostname: false,
  identifier: "worker-a",
}
```

Resolves to:

```text
api-2026-03-27-worker-a
```

### Custom Resolver

```ts
import { createServiceLogger, formatDateStamp } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "api",
  environment: "production",
  destinations: ["cloudwatch"],
  cloudwatch: {
    region: "af-south-1",
    logGroupName: "/norialabs/api",
    stream: {
      resolve: (context) =>
        `${context.environment}-${context.serviceName}-${formatDateStamp(context.timestamp, {
          mode: "annual",
        })}`,
    },
  },
});
```

## Configuration Reference

### `createServiceLogger`

```ts
createServiceLogger({
  serviceName: string;
  environment?: string;
  level?: LogLevel; // default: "info"
  destinations?: ("stdout" | "stderr" | "file" | "cloudwatch")[]; // default: ["stdout"]
  schema?: LoggerSchemaConfig;
  identity?: LoggerIdentityConfig;
  redact?: LoggerRedactionConfig;
  file?: FileLoggerConfig;
  cloudwatch?: CloudWatchLoggerConfig;
  redactKeys?: string[];
  base?: Record<string, unknown>;
});
```

### `FileLoggerConfig`

```ts
type FileLoggerConfig = {
  target?: TargetConfig;
  mkdir?: boolean; // default: true
};
```

### `LoggerSchemaConfig`

```ts
type LoggerSchemaConfig = {
  messageKey?: string; // default: "msg"
  levelKey?: string; // default: "level"
  levelValueKey?: string; // default: "levelValue"
  timeKey?: string; // default: "time"
  timestampKey?: string; // default: "timestamp"
  serviceKey?: string; // default: "service"
  environmentKey?: string; // default: "environment"
  errorKey?: string; // default: "err"
  timeMode?: "epoch" | "iso" | "both"; // default: "both"
};
```

### `LoggerIdentityConfig`

```ts
type LoggerIdentityConfig = {
  hostname?: string; // default: os.hostname()
  pid?: number; // default: process.pid
  instanceId?: string;
};
```

### `LoggerRedactionConfig`

```ts
type LoggerRedactionConfig = {
  keys?: string[];
  mode?: "merge" | "replace"; // default: "merge"
};
```

### `CloudWatchLoggerConfig`

```ts
type CloudWatchLoggerConfig = {
  region: string;
  logGroupName: string;
  stream?: TargetConfig;
  credentials?: AwsCredentialIdentity | AwsCredentialIdentityProvider;
  retentionInDays?: number; // default: unset, package leaves retention unchanged
  client?: CloudWatchLogsClient;
  createLogGroup?: boolean; // default: true
  createLogStream?: boolean; // default: true
  flushIntervalMs?: number; // default: 2000
  maxBatchCount?: number; // default: 1000
  maxBatchBytes?: number; // default: 900000
  maxBufferedEvents?: number; // default: 20000
  retryBaseDelayMs?: number; // default: 1000
};
```

If `client` is supplied internally, it takes precedence over region/credentials settings. Otherwise the package constructs its own `CloudWatchLogsClient`.

## Redaction

The logger redacts common secret-like keys by default, including:

- `token`
- `secret`
- `key`
- `password`
- `authorization`
- `api_key`

Add extra keys like this:

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "conversations",
  destinations: ["stdout"],
  redactKeys: ["session_id", "merchant_reference"],
});
```

Or replace the built-in defaults entirely:

```ts
const managedLogger = createServiceLogger({
  serviceName: "conversations",
  destinations: ["stdout"],
  redact: {
    keys: ["session_id", "merchant_reference"],
    mode: "replace",
  },
});
```

For env-driven config:

```ts
import { parseLoggerDestinations, parseLoggerRedactKeys } from "@noria/logger";

const destinations = parseLoggerDestinations(process.env.LOG_DESTINATIONS);
const redactKeys = parseLoggerRedactKeys(process.env.LOG_REDACT_KEYS);
```

## Graceful Shutdown

```ts
import { createServiceLogger } from "@noria/logger";

const managedLogger = createServiceLogger({
  serviceName: "payments",
  destinations: ["stdout"],
});

process.on("SIGTERM", () => {
  void managedLogger.close().finally(() => process.exit(0));
});
```

## Low-Level Helpers

The package also exports:

- `createCloudWatchDestination`
- `createFileDestination`
- `createLoggerRuntimeContext`
- `createLoggerTargetContext`
- `resolveTarget`
- `formatDateStamp`
- `parseLoggerDestinations`
- `parseLoggerRedactKeys`
- `sanitizeLogValue`

## License

MIT
