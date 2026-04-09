import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  PutRetentionPolicyCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  createCloudWatchDestination,
  createFileDestination,
  createRedactMatcher,
  createLoggerRuntimeContext,
  createServiceLogger,
  formatDateStamp,
  parseLoggerDestinations,
  parseLoggerRedactKeys,
  resolveTarget,
  sanitizeLogValue,
} from "../dist/index.js";

const TEST_RUNTIME = createLoggerRuntimeContext({
  serviceName: "test-service",
  environment: "test",
  hostname: "logger-host",
  instanceId: "instance-a",
  pid: 4321,
});

test("parseLoggerDestinations parses defaults and deduplicates entries", () => {
  assert.deepEqual(parseLoggerDestinations(), ["stdout"]);
  assert.deepEqual(parseLoggerDestinations("stdout, cloudwatch, stdout"), [
    "stdout",
    "cloudwatch",
  ]);
  assert.throws(() => parseLoggerDestinations("stdout,unknown"), /Unsupported logger destination/);
});

test("parseLoggerRedactKeys parses comma separated values", () => {
  assert.deepEqual(parseLoggerRedactKeys("authorization, api_key, authorization"), [
    "authorization",
    "api_key",
  ]);
});

test("sanitizeLogValue redacts secrets recursively", () => {
  const error = new Error("boom");
  const sanitized = sanitizeLogValue(
    {
      api_key: "secret",
      nested: { password: "secret-2", ok: "value" },
      list: [error, { token: "secret-3" }],
    },
    (key) => /(api_key|password|token)/i.test(key),
  );

  assert.deepEqual(sanitized, {
    api_key: "[REDACTED]",
    nested: { password: "[REDACTED]", ok: "value" },
    list: [
      {
        name: "Error",
        message: "boom",
        stack: error.stack,
      },
      { token: "[REDACTED]" },
    ],
  });
});

test("createRedactMatcher supports replace mode", () => {
  const matcher = createRedactMatcher({
    keys: ["session_id"],
    mode: "replace",
  });

  assert.equal(matcher("session_id"), true);
  assert.equal(matcher("token"), false);
});

test("createRedactMatcher supports array shorthand with merged defaults", () => {
  const matcher = createRedactMatcher(["session_id"]);

  assert.equal(matcher("session_id"), true);
  assert.equal(matcher("token"), true);
});

test("createRedactMatcher defaults object config to built-in merge behavior", () => {
  const matcher = createRedactMatcher({});

  assert.equal(matcher("token"), true);
  assert.equal(matcher("session_id"), false);
});

test("formatDateStamp supports daily monthly annual and timezone-aware formatting", () => {
  const timestamp = Date.parse("2024-01-02T03:04:05.000Z");

  assert.equal(formatDateStamp(timestamp, { mode: "none" }), "");
  assert.equal(formatDateStamp(timestamp, { mode: "daily" }), "2024-01-02");
  assert.equal(formatDateStamp(timestamp, { mode: "monthly" }), "2024-01");
  assert.equal(formatDateStamp(timestamp, { mode: "annual" }), "2024");
  assert.equal(
    formatDateStamp(timestamp, {
      mode: "daily",
      timezone: "America/New_York",
    }),
    "2024-01-01",
  );
});

test("formatDateStamp surfaces invalid formatter output", () => {
  const OriginalDateTimeFormat = Intl.DateTimeFormat;

  try {
    Intl.DateTimeFormat = class FakeDateTimeFormat extends OriginalDateTimeFormat {
      formatToParts() {
        return [];
      }
    };

    assert.throws(
      () => formatDateStamp(Date.now(), { mode: "annual" }),
      /Unable to format log target year/,
    );

    Intl.DateTimeFormat = class FakeDateTimeFormat extends OriginalDateTimeFormat {
      formatToParts() {
        return [{ type: "year", value: "2024" }];
      }
    };

    assert.throws(
      () => formatDateStamp(Date.now(), { mode: "monthly" }),
      /Unable to format log target month/,
    );

    Intl.DateTimeFormat = class FakeDateTimeFormat extends OriginalDateTimeFormat {
      formatToParts() {
        return [
          { type: "year", value: "2024" },
          { type: "month", value: "01" },
        ];
      }
    };

    assert.throws(
      () => formatDateStamp(Date.now(), { mode: "daily" }),
      /Unable to format log target day/,
    );
  } finally {
    Intl.DateTimeFormat = OriginalDateTimeFormat;
  }
});

test("resolveTarget supports defaults rotations custom separators and custom resolvers", () => {
  const timestamp = Date.parse("2024-03-27T22:30:00.000Z");
  const context = {
    ...TEST_RUNTIME,
    timestamp,
    isoTimestamp: new Date(timestamp).toISOString(),
  };

  assert.equal(resolveTarget(undefined, context, { value: "fallback" }), "fallback");
  assert.equal(resolveTarget({ value: "fixed" }, context), "fixed");
  assert.equal(
    resolveTarget(
      {
        prefix: "logs",
        rotation: "monthly",
        includeServiceName: true,
        includeEnvironment: true,
        includeHostname: true,
        includePid: true,
        suffix: ".jsonl",
        separator: "/",
      },
      context,
    ),
    "logs/2024-03/test-service/test/logger-host/4321.jsonl",
  );
  assert.equal(
    resolveTarget(
      {
        prefix: "logs",
        rotation: "daily",
        includeInstanceId: true,
      },
      context,
    ),
    "logs-2024-03-27-instance-a",
  );
  assert.equal(
    resolveTarget(
      {
        prefix: "logs",
        rotation: "daily",
        identifier: "worker-a",
      },
      context,
    ),
    "logs-2024-03-27-worker-a",
  );
  assert.equal(
    resolveTarget(
      {
        prefix: "logs",
        rotation: "daily",
        includeHostname: false,
      },
      context,
      {
        includeHostname: true,
      },
    ),
    "logs-2024-03-27",
  );
  assert.equal(
    resolveTarget(
      {
        resolve: (targetContext) =>
          `${targetContext.serviceName}-${formatDateStamp(targetContext.timestamp, { mode: "annual" })}`,
      },
      context,
      { value: "unused" },
    ),
    "test-service-2024",
  );
});

test("createServiceLogger supports schema remapping identity overrides and redaction replace mode", async () => {
  const directory = await mkdtemp(join(tmpdir(), "noria-schema-"));
  const filePath = join(directory, "custom-host-instance-b-9876.log");

  const loggerBundle = createServiceLogger({
    serviceName: "test-service",
    environment: "test",
    destinations: ["file"],
    identity: {
      hostname: "custom-host",
      instanceId: "instance-b",
      pid: 9876,
    },
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
    redact: {
      keys: ["session_id"],
      mode: "replace",
    },
    file: {
      target: {
        resolve: (context) => join(directory, `${context.hostname}-${context.instanceId}-${context.pid}.log`),
      },
    },
  });

  loggerBundle.logger.info(
    {
      token: "visible",
      session_id: "hidden",
      hostname: TEST_RUNTIME.hostname,
    },
    "hello",
  );
  loggerBundle.logger.error(new Error("boom"), "broken");

  await loggerBundle.close();

  const lines = (await readFile(filePath, "utf8")).trim().split("\n");
  const first = JSON.parse(lines[0]);
  const second = JSON.parse(lines[1]);

  assert.equal(first.severity, "info");
  assert.equal(first.severityValue, 30);
  assert.equal(first.message, "hello");
  assert.equal(first.app, "test-service");
  assert.equal(first.stage, "test");
  assert.equal(first.token, "visible");
  assert.equal(first.session_id, "[REDACTED]");
  assert.equal(first.ts, undefined);
  assert.equal(typeof first.tsIso, "string");
  assert.equal(second.error.message, "boom");
});

test("createServiceLogger rejects duplicate timestamp keys when both timestamp fields are enabled", () => {
  assert.throws(
    () =>
      createServiceLogger({
        serviceName: "test-service",
        schema: {
          timeKey: "timestamp",
          timestampKey: "timestamp",
          timeMode: "both",
        },
      }),
    /schema\.timeKey and schema\.timestampKey must differ/,
  );
});

test("createServiceLogger merges redactKeys into redact config when explicit keys are omitted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "noria-redact-"));
  const filePath = join(directory, "service.log");

  const loggerBundle = createServiceLogger({
    serviceName: "test-service",
    destinations: ["file"],
    redactKeys: ["session_id"],
    redact: {},
    file: {
      target: {
        value: filePath,
      },
    },
  });

  loggerBundle.logger.info({ session_id: "hidden" }, "hello");
  await loggerBundle.close();

  const parsed = JSON.parse((await readFile(filePath, "utf8")).trim());
  assert.equal(parsed.session_id, "[REDACTED]");
});

test("createServiceLogger defaults empty redact config to built-in merge behavior", async () => {
  const directory = await mkdtemp(join(tmpdir(), "noria-redact-default-"));
  const filePath = join(directory, "service.log");

  const loggerBundle = createServiceLogger({
    serviceName: "test-service",
    destinations: ["file"],
    redact: {},
    file: {
      target: {
        value: filePath,
      },
    },
  });

  loggerBundle.logger.info({ token: "hidden" }, "hello");
  await loggerBundle.close();

  const parsed = JSON.parse((await readFile(filePath, "utf8")).trim());
  assert.equal(parsed.token, "[REDACTED]");
});

test("createServiceLogger writes sanitized logs to file destinations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "logger-"));
  const filePath = join(directory, "service.log");

  const loggerBundle = createServiceLogger({
    serviceName: "test-service",
    environment: "test",
    destinations: ["file"],
    file: {
      target: {
        value: filePath,
      },
    },
    redactKeys: ["session_id"],
  });

  loggerBundle.logger.info(
    {
      token: "secret",
      session_id: "secret-2",
      keep: "value",
    },
    "hello",
  );

  await loggerBundle.close();

  const content = await readFile(filePath, "utf8");
  const parsed = JSON.parse(content.trim());

  assert.equal(parsed.level, "info");
  assert.equal(parsed.levelValue, 30);
  assert.equal(typeof parsed.time, "number");
  assert.equal(parsed.timestamp, new Date(parsed.time).toISOString());
  assert.equal(parsed.token, "[REDACTED]");
  assert.equal(parsed.session_id, "[REDACTED]");
  assert.equal(parsed.service, "test-service");
});

test("createServiceLogger flushes stdout logging without closing standard streams", async () => {
  const loggerBundle = createServiceLogger({
    serviceName: "test-service",
    destinations: ["stdout"],
  });

  loggerBundle.logger.info({ event: "stdout-close" }, "hello");
  await loggerBundle.flush();
  await loggerBundle.close();
});

test("createServiceLogger defaults to stdout when no destinations are configured", async () => {
  const loggerBundle = createServiceLogger({
    serviceName: "test-service",
  });

  await loggerBundle.flush();
  await loggerBundle.close();
});

test("createServiceLogger supports multi-destination logging", async () => {
  const loggerBundle = createServiceLogger({
    serviceName: "test-service",
    environment: "test",
    destinations: ["stdout", "stderr"],
    base: { component: "worker" },
  });

  loggerBundle.logger.info({ event: "multistream" }, "hello");
  await loggerBundle.flush();
  await loggerBundle.close();
});

test("createServiceLogger requires file config for file logging", () => {
  assert.throws(
    () =>
      createServiceLogger({
        serviceName: "test-service",
        destinations: ["file"],
      }),
    /file logging requires file configuration/,
  );
});

test("createServiceLogger requires cloudwatch config for cloudwatch logging", () => {
  assert.throws(
    () =>
      createServiceLogger({
        serviceName: "test-service",
        destinations: ["cloudwatch"],
      }),
    /cloudwatch logging requires cloudwatch configuration/,
  );
});

test("file destination resolves dynamic targets using event timestamps", async () => {
  const directory = await mkdtemp(join(tmpdir(), "noria-file-"));
  const destination = createFileDestination(
    {
      target: {
        prefix: join(directory, "app"),
        rotation: "daily",
        suffix: ".log",
      },
    },
    TEST_RUNTIME,
  );

  destination.stream.write('{"time":"2024-01-01T23:59:59.000Z","msg":"before"}\n');
  destination.stream.write('{"time":"2024-01-02T00:00:01.000Z","msg":"after"}\n');
  await destination.flush();
  await destination.close();

  const files = (await readdir(directory)).sort();
  assert.deepEqual(files, ["app-2024-01-01.log", "app-2024-01-02.log"]);
});

test("file destination supports custom resolvers and emits write errors for invalid targets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "noria-file-"));
  const destination = createFileDestination(
    {
      target: {
        resolve: (context) =>
          join(directory, `${context.environment}-${context.serviceName}.log`),
      },
    },
    TEST_RUNTIME,
  );

  destination.stream.write('{"time":"2024-01-01T00:00:00.000Z","msg":"hello"}\n');
  await destination.close();

  const content = await readFile(join(directory, "test-test-service.log"), "utf8");
  assert.ok(content.includes('"msg":"hello"'));

  const brokenDestination = createFileDestination({}, TEST_RUNTIME);
  await new Promise((resolve, reject) => {
    brokenDestination.stream.once("error", (error) => {
      try {
        assert.match(
          error.message,
          /file logging requires file.target.value, file.target.prefix, or file.target.resolve/,
        );
        resolve();
      } catch (assertionError) {
        reject(assertionError);
      }
    });

    brokenDestination.stream.write('{"time":1,"msg":"boom"}\n', () => {});
  });
});

test("file destination reuses existing streams handles non-json fallback timestamps and finalizes on stream end", async () => {
  const directory = await mkdtemp(join(tmpdir(), "noria-file-"));
  const filePath = join(directory, "shared.log");
  const destination = createFileDestination(
    {
      target: {
        value: filePath,
      },
    },
    TEST_RUNTIME,
  );

  destination.stream.write('{"time":"2024-01-01T00:00:00.000Z","msg":"first"}\n');
  destination.stream.write('{"time":"invalid","msg":"second"}\nnot-json\n');

  await new Promise((resolve, reject) => {
    destination.stream.once("error", reject);
    destination.stream.end(resolve);
  });

  const content = await readFile(filePath, "utf8");
  assert.ok(content.includes('"msg":"first"'));
  assert.ok(content.includes('"msg":"second"'));
  assert.ok(content.includes("not-json"));

  const lines = content
    .trim()
    .split("\n")
    .map((line) => line.trim());
  assert.equal(lines.length, 3);
  assert.equal(lines[2], "not-json");

  const parsedSecond = JSON.parse(lines[1]);
  assert.equal(parsedSecond.time, "invalid");
});

test("file destination derives timestamps from an iso timestamp field when numeric time is absent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "noria-file-"));
  const filePath = join(directory, "timestamp.log");
  const destination = createFileDestination(
    {
      target: {
        value: filePath,
      },
    },
    TEST_RUNTIME,
  );

  destination.stream.write(
    '{"timestamp":"2024-01-02T03:04:05.000Z","msg":"hello-from-timestamp"}\n',
  );
  await destination.close();

  const content = await readFile(filePath, "utf8");
  assert.ok(content.includes('"timestamp":"2024-01-02T03:04:05.000Z"'));
});

test("file destination surfaces close failures through the writable finalizer", async () => {
  const originalDestination = pino.destination;

  pino.destination = () => {
    return {
      write: () => true,
      flush: () => {
        throw new Error("flush-boom");
      },
    };
  };

  try {
    const destination = createFileDestination(
      {
        target: {
          value: join(tmpdir(), "unused.log"),
        },
      },
      TEST_RUNTIME,
    );

    destination.stream.write('{"time":"2024-01-01T00:00:00.000Z","msg":"hello"}\n');

    await new Promise((resolve, reject) => {
      destination.stream.once("error", (error) => {
        try {
          assert.match(error.message, /flush-boom/);
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      });

      destination.stream.end(() => {});
    });
  } finally {
    pino.destination = originalDestination;
  }
});

test("cloudwatch destination creates resources and publishes batched events", async () => {
  const commands = [];
  const client = {
    send: async (command) => {
      commands.push(command);
      return {};
    },
  };

  const loggerBundle = createServiceLogger({
    serviceName: "test-service",
    destinations: ["cloudwatch"],
    cloudwatch: {
      client,
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        value: "stream",
      },
      flushIntervalMs: 1,
    },
  });

  loggerBundle.logger.info({ event: "one" }, "hello");
  loggerBundle.logger.error({ event: "two" }, "world");
  await loggerBundle.close();

  assert.ok(commands[0] instanceof CreateLogGroupCommand);
  assert.ok(commands[1] instanceof CreateLogStreamCommand);
  assert.ok(commands[2] instanceof PutLogEventsCommand);

  const putEventsInput = commands[2].input;
  assert.equal(putEventsInput.logGroupName, "group");
  assert.equal(putEventsInput.logStreamName, "stream");
  assert.equal(putEventsInput.logEvents.length, 2);
});

test("cloudwatch destination applies configured log-group retention", async () => {
  const commands = [];
  const destination = createCloudWatchDestination(
    {
      client: {
        send: async (command) => {
          commands.push(command);
          return {};
        },
      },
      region: "eu-west-1",
      logGroupName: "group",
      retentionInDays: 30,
      stream: {
        value: "stream",
      },
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  destination.stream.write('{"time":1,"msg":"hello"}\n');
  await destination.close();

  const retentionCommand = commands.find((command) => command instanceof PutRetentionPolicyCommand);
  assert.equal(retentionCommand.input.logGroupName, "group");
  assert.equal(retentionCommand.input.retentionInDays, 30);
});

test("cloudwatch destination can apply retention without creating the log group", async () => {
  const commands = [];
  const destination = createCloudWatchDestination(
    {
      client: {
        send: async (command) => {
          commands.push(command);
          return {};
        },
      },
      region: "eu-west-1",
      logGroupName: "group",
      retentionInDays: 90,
      stream: {
        value: "stream",
      },
      createLogGroup: false,
      createLogStream: false,
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  destination.stream.write('{"time":1,"msg":"hello"}\n');
  await destination.close();

  assert.equal(commands.filter((command) => command instanceof CreateLogGroupCommand).length, 0);
  const retentionCommand = commands.find((command) => command instanceof PutRetentionPolicyCommand);
  assert.equal(retentionCommand.input.retentionInDays, 90);
});

test("cloudwatch destination rejects unsupported retention values", async () => {
  const destination = createCloudWatchDestination(
    {
      client: {
        send: async () => ({}),
      },
      region: "eu-west-1",
      logGroupName: "group",
      retentionInDays: 2,
      stream: {
        value: "stream",
      },
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  destination.stream.write('{"time":1,"msg":"hello"}\n');
  await assert.rejects(() => destination.close(), /Unsupported CloudWatch retentionInDays '2'/);
});

test("cloudwatch destination accepts explicit aws credentials and otherwise relies on sdk defaults", async () => {
  const originalSend = CloudWatchLogsClient.prototype.send;
  let resolvedCredentials;
  let resolvedRegion;
  let credentialMode;

  CloudWatchLogsClient.prototype.send = async function send() {
    resolvedRegion = await this.config.region();
    credentialMode = typeof this.config.credentials;
    resolvedCredentials =
      typeof this.config.credentials === "function"
        ? await this.config.credentials()
        : this.config.credentials;
    return {};
  };

  try {
    const destination = createCloudWatchDestination(
      {
        region: "eu-west-1",
        logGroupName: "group",
        stream: {
          value: "stream",
        },
        credentials: {
          accessKeyId: "test-access-key",
          secretAccessKey: "test-secret-key",
          sessionToken: "test-session-token",
        },
        createLogGroup: false,
        createLogStream: false,
        flushIntervalMs: 60_000,
      },
      TEST_RUNTIME,
    );

    destination.stream.write('{"time":1,"msg":"hello"}\n');
    await destination.close();

    assert.equal(resolvedRegion, "eu-west-1");
    assert.equal(credentialMode, "function");
    assert.equal(resolvedCredentials.accessKeyId, "test-access-key");
    assert.equal(resolvedCredentials.secretAccessKey, "test-secret-key");
    assert.equal(resolvedCredentials.sessionToken, "test-session-token");

    const fallbackDestination = createCloudWatchDestination(
      {
        region: "eu-west-1",
        logGroupName: "group",
        stream: {
          value: "fallback-stream",
        },
        createLogGroup: false,
        createLogStream: false,
        flushIntervalMs: 60_000,
      },
      TEST_RUNTIME,
    );

    fallbackDestination.stream.write('{"time":2,"msg":"hello"}\n');
    await fallbackDestination.close();

    assert.equal(credentialMode, "function");
  } finally {
    CloudWatchLogsClient.prototype.send = originalSend;
  }
});

test("cloudwatch destination retries after publish failures", async () => {
  const commands = [];
  let attempts = 0;

  const client = {
    send: async (command) => {
      commands.push(command);

      if (command instanceof PutLogEventsCommand && attempts === 0) {
        attempts += 1;
        throw new Error("temporary failure");
      }

      return {};
    },
  };

  const loggerBundle = createServiceLogger({
    serviceName: "test-service",
    destinations: ["cloudwatch"],
    cloudwatch: {
      client,
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        value: "stream",
      },
      flushIntervalMs: 1,
      retryBaseDelayMs: 1,
    },
  });

  loggerBundle.logger.info({ event: "retry" }, "hello");
  await new Promise((resolve) => setTimeout(resolve, 5));
  await loggerBundle.close();

  assert.ok(commands.filter((command) => command instanceof PutLogEventsCommand).length >= 2);
});

test("cloudwatch destination handles direct writes existing resources and stream finalization", async () => {
  const commands = [];
  const originalSend = CloudWatchLogsClient.prototype.send;

  CloudWatchLogsClient.prototype.send = async function send(command) {
    commands.push(command);

    if (command instanceof CreateLogGroupCommand || command instanceof CreateLogStreamCommand) {
      const error = new Error("exists");
      error.name = "ResourceAlreadyExistsException";
      throw error;
    }

    return {};
  };

  try {
    const destination = createCloudWatchDestination(
      {
        region: "eu-west-1",
        logGroupName: "group",
        stream: {
          value: "stream",
        },
        flushIntervalMs: 1,
      },
      TEST_RUNTIME,
    );

    destination.stream.write('{"time":"2024-01-02T03:04:05.000Z","msg":"hello"}\nnot-json\n');
    await new Promise((resolve, reject) => {
      destination.stream.once("error", reject);
      destination.stream.end(resolve);
    });

    assert.ok(commands.some((command) => command instanceof CreateLogGroupCommand));
    assert.ok(commands.some((command) => command instanceof CreateLogStreamCommand));
    const putCommand = commands.find((command) => command instanceof PutLogEventsCommand);
    assert.equal(putCommand.input.logEvents.length, 2);
    assert.equal(putCommand.input.logEvents[0].timestamp, Date.parse("2024-01-02T03:04:05.000Z"));
    assert.equal(typeof putCommand.input.logEvents[1].timestamp, "number");
  } finally {
    CloudWatchLogsClient.prototype.send = originalSend;
  }
});

test("cloudwatch destination derives timestamps from an iso timestamp field when numeric time is absent", async () => {
  const commands = [];
  const destination = createCloudWatchDestination(
    {
      client: {
        send: async (command) => {
          commands.push(command);
          return {};
        },
      },
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        value: "stream",
      },
      createLogGroup: false,
      createLogStream: false,
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  destination.stream.write('{"timestamp":"2024-01-02T03:04:05.000Z","msg":"hello"}\n');
  await destination.close();

  const putCommand = commands.find((command) => command instanceof PutLogEventsCommand);
  assert.equal(putCommand.input.logEvents[0].timestamp, Date.parse("2024-01-02T03:04:05.000Z"));
});

test("cloudwatch destination reuses in-flight flushes and can skip resource creation", async () => {
  const commands = [];
  let resolvePut;

  const client = {
    send: async (command) => {
      commands.push(command);

      if (command instanceof PutLogEventsCommand) {
        await new Promise((resolve) => {
          resolvePut = resolve;
        });
      }

      return {};
    },
  };

  const destination = createCloudWatchDestination(
    {
      client,
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        value: "stream",
      },
      createLogGroup: false,
      createLogStream: false,
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  await new Promise((resolve, reject) => {
    destination.stream.write('{"time":1,"msg":"hello"}\n', (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
  const firstFlush = destination.flush();
  const secondFlush = destination.flush();
  while (!resolvePut) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  resolvePut();
  await Promise.all([firstFlush, secondFlush]);
  await destination.close();

  assert.equal(commands.filter((command) => command instanceof CreateLogGroupCommand).length, 0);
  assert.equal(commands.filter((command) => command instanceof CreateLogStreamCommand).length, 0);
  assert.equal(commands.filter((command) => command instanceof PutLogEventsCommand).length, 1);
});

test("cloudwatch destination surfaces stream write conversion failures", async () => {
  const destination = createCloudWatchDestination(
    {
      client: {
        send: async () => ({}),
      },
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        value: "stream",
      },
      createLogGroup: false,
      createLogStream: false,
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  await new Promise((resolve, reject) => {
    const chunk = Buffer.from("boom");
    chunk.toString = () => {
      throw new Error("write-boom");
    };

    destination.stream.once("error", (error) => {
      try {
        assert.match(error.message, /write-boom/);
        resolve();
      } catch (assertionError) {
        reject(assertionError);
      }
    });

    destination.stream.write(chunk, () => {});
  });
});

test("cloudwatch destination returns immediately when there is nothing to flush", async () => {
  const destination = createCloudWatchDestination(
    {
      client: {
        send: async () => {
          throw new Error("should not send");
        },
      },
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        value: "stream",
      },
      createLogGroup: false,
      createLogStream: false,
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  await destination.flush();
  await destination.close();
});

test("cloudwatch destination falls back to hostname-pid naming and default flush interval", async () => {
  const commands = [];
  const destination = createCloudWatchDestination(
    {
      client: {
        send: async (command) => {
          commands.push(command);
          return {};
        },
      },
      region: "eu-west-1",
      logGroupName: "group",
      createLogGroup: false,
      createLogStream: false,
    },
    TEST_RUNTIME,
  );

  destination.stream.write('{"time":1,"msg":"hello"}\n');
  await destination.close();

  const putCommand = commands.find((command) => command instanceof PutLogEventsCommand);
  assert.equal(putCommand.input.logStreamName, "logger-host-4321");
});

test("cloudwatch destination trims oversized buffers and splits by batch size", async () => {
  const commands = [];
  const client = {
    send: async (command) => {
      commands.push(command);
      return {};
    },
  };

  const destination = createCloudWatchDestination(
    {
      client,
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        value: "stream",
      },
      createLogGroup: false,
      createLogStream: false,
      flushIntervalMs: 60_000,
      maxBufferedEvents: 1,
      maxBatchBytes: 60,
    },
    TEST_RUNTIME,
  );

  destination.stream.write("first\nsecond\n");
  await destination.close();

  const putCommands = commands.filter((command) => command instanceof PutLogEventsCommand);
  assert.equal(putCommands.length, 1);
  assert.deepEqual(
    putCommands[0].input.logEvents.map((event) => event.message),
    ["second"],
  );
});

test("cloudwatch destination splits log events into multiple requests when batch bytes are exceeded", async () => {
  const commands = [];
  const client = {
    send: async (command) => {
      commands.push(command);
      return {};
    },
  };

  const destination = createCloudWatchDestination(
    {
      client,
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        value: "stream",
      },
      createLogGroup: false,
      createLogStream: false,
      flushIntervalMs: 60_000,
      maxBufferedEvents: 10,
      maxBatchBytes: 60,
    },
    TEST_RUNTIME,
  );

  destination.stream.write("first\nsecond\n");
  await destination.close();

  const putCommands = commands.filter((command) => command instanceof PutLogEventsCommand);
  assert.equal(putCommands.length, 2);
  assert.equal(putCommands[0].input.logEvents.length, 1);
  assert.equal(putCommands[1].input.logEvents.length, 1);
});

test("cloudwatch destination surfaces initialization failures for non-AWS-exists errors", async () => {
  const client = {
    send: async (command) => {
      if (command instanceof CreateLogGroupCommand) {
        throw new Error("boom");
      }

      return {};
    },
  };

  const destination = createCloudWatchDestination(
    {
      client,
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        value: "stream",
      },
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  destination.stream.write('{"time":1,"msg":"hello"}\n');
  await assert.rejects(() => destination.close(), /boom/);
});

test("cloudwatch destination surfaces create-log-stream failures for non-AWS-exists errors", async () => {
  const client = {
    send: async (command) => {
      if (command instanceof CreateLogStreamCommand) {
        throw new Error("stream-boom");
      }

      return {};
    },
  };

  const destination = createCloudWatchDestination(
    {
      client,
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        value: "stream",
      },
      createLogGroup: false,
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  destination.stream.write('{"time":1,"msg":"hello"}\n');
  await assert.rejects(() => destination.close(), /stream-boom/);
});

test("cloudwatch destination supports daily monthly annual rotation and per-event rollover", async () => {
  const commands = [];
  const client = {
    send: async (command) => {
      commands.push(command);
      return {};
    },
  };

  const dailyDestination = createCloudWatchDestination(
    {
      client,
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        prefix: "noria-stream",
        rotation: "daily",
      },
      createLogGroup: false,
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  dailyDestination.stream.write('{"time":"2024-01-31T23:59:59.000Z","msg":"before"}\n');
  dailyDestination.stream.write('{"time":"2024-02-01T00:00:01.000Z","msg":"after"}\n');
  await dailyDestination.close();

  const dailyStreams = commands
    .filter((command) => command instanceof CreateLogStreamCommand)
    .map((command) => command.input.logStreamName)
    .sort();
  assert.deepEqual(dailyStreams, [
    "noria-stream-2024-01-31-logger-host",
    "noria-stream-2024-02-01-logger-host",
  ]);

  commands.length = 0;

  const monthlyDestination = createCloudWatchDestination(
    {
      client,
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        prefix: "noria-stream",
        rotation: "monthly",
        includeHostname: false,
        includePid: false,
      },
      createLogGroup: false,
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  monthlyDestination.stream.write('{"time":"2024-03-27T22:30:00.000Z","msg":"march"}\n');
  await monthlyDestination.close();

  const monthlyPut = commands.find((command) => command instanceof PutLogEventsCommand);
  assert.equal(monthlyPut.input.logStreamName, "noria-stream-2024-03");

  commands.length = 0;

  const annualDestination = createCloudWatchDestination(
    {
      client,
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        prefix: "noria-stream",
        rotation: "annual",
        includeHostname: false,
        includePid: false,
      },
      createLogGroup: false,
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  annualDestination.stream.write('{"time":"2024-03-27T22:30:00.000Z","msg":"year"}\n');
  await annualDestination.close();

  const annualPut = commands.find((command) => command instanceof PutLogEventsCommand);
  assert.equal(annualPut.input.logStreamName, "noria-stream-2024");
});

test("cloudwatch destination supports timezone-aware rotation and custom stream resolvers", async () => {
  const commands = [];
  const client = {
    send: async (command) => {
      commands.push(command);
      return {};
    },
  };

  const zonedDestination = createCloudWatchDestination(
    {
      client,
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        prefix: "noria-stream",
        rotation: "daily",
        timezone: "America/New_York",
        includeHostname: false,
        includePid: false,
      },
      createLogGroup: false,
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  zonedDestination.stream.write('{"time":"2024-01-02T03:04:05.000Z","msg":"zoned"}\n');
  await zonedDestination.close();

  const zonedPut = commands.find((command) => command instanceof PutLogEventsCommand);
  assert.equal(zonedPut.input.logStreamName, "noria-stream-2024-01-01");

  commands.length = 0;

  const resolvedDestination = createCloudWatchDestination(
    {
      client,
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        resolve: (context) =>
          `${context.environment}-${context.serviceName}-${formatDateStamp(context.timestamp, {
            mode: "annual",
          })}`,
      },
      createLogGroup: false,
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  resolvedDestination.stream.write('{"time":"2024-01-02T03:04:05.000Z","msg":"resolved"}\n');
  await resolvedDestination.close();

  const resolvedPut = commands.find((command) => command instanceof PutLogEventsCommand);
  assert.equal(resolvedPut.input.logStreamName, "test-test-service-2024");
});

test("cloudwatch destination can still include pid explicitly for rotated streams", async () => {
  const commands = [];
  const destination = createCloudWatchDestination(
    {
      client: {
        send: async (command) => {
          commands.push(command);
          return {};
        },
      },
      region: "eu-west-1",
      logGroupName: "group",
      stream: {
        prefix: "noria-stream",
        rotation: "daily",
        includePid: true,
      },
      createLogGroup: false,
      flushIntervalMs: 60_000,
    },
    TEST_RUNTIME,
  );

  destination.stream.write('{"time":"2024-03-27T22:30:00.000Z","msg":"hello"}\n');
  await destination.close();

  const putCommand = commands.find((command) => command instanceof PutLogEventsCommand);
  assert.equal(putCommand.input.logStreamName, "noria-stream-2024-03-27-logger-host-4321");
});

test("cloudwatch destination supports prefix-date-only and custom identifiers", async () => {
  const commandLog = [];
  const destination = createCloudWatchDestination(
    {
      region: "af-south-1",
      logGroupName: "/noria/test",
      stream: {
        prefix: "noria-stream",
        rotation: "daily",
        includeHostname: false,
      },
      client: {
        send: async (command) => {
          commandLog.push(command);
          return {};
        },
      },
    },
    TEST_RUNTIME,
  );

  destination.stream.write('{"time":"2024-03-27T10:15:00.000Z","msg":"hello"}\n');
  await destination.close();

  const putCommand = commandLog.find((entry) => entry instanceof PutLogEventsCommand);
  assert.equal(putCommand.input.logStreamName, "noria-stream-2024-03-27");

  const customCommandLog = [];
  const customDestination = createCloudWatchDestination(
    {
      region: "af-south-1",
      logGroupName: "/noria/test",
      stream: {
        prefix: "noria-stream",
        rotation: "daily",
        includeHostname: false,
        identifier: "worker-a",
      },
      client: {
        send: async (command) => {
          customCommandLog.push(command);
          return {};
        },
      },
    },
    TEST_RUNTIME,
  );

  customDestination.stream.write('{"time":"2024-03-27T10:15:00.000Z","msg":"hello"}\n');
  await customDestination.close();

  const customPutCommand = customCommandLog.find((entry) => entry instanceof PutLogEventsCommand);
  assert.equal(customPutCommand.input.logStreamName, "noria-stream-2024-03-27-worker-a");
});

test("cloudwatch destination logs non-Error publish failures and caps retry delay", async () => {
  const originalWrite = process.stderr.write;
  const writes = [];
  let attempts = 0;

  process.stderr.write = ((chunk, encoding, callback) => {
    writes.push(String(chunk));

    if (typeof encoding === "function") {
      encoding();
      return true;
    }

    callback?.();
    return true;
  });

  const client = {
    send: async (command) => {
      if (command instanceof PutLogEventsCommand && attempts < 6) {
        attempts += 1;
        throw "temporary";
      }

      return {};
    },
  };

  try {
    const destination = createCloudWatchDestination(
      {
        client,
        region: "eu-west-1",
        logGroupName: "group",
        stream: {
          value: "stream",
        },
        createLogGroup: false,
        createLogStream: false,
        flushIntervalMs: 1,
        retryBaseDelayMs: 10_000,
      },
      TEST_RUNTIME,
    );

    destination.stream.write('{"time":1,"msg":"hello"}\n');
    await new Promise((resolve) => setTimeout(resolve, 80));
    await destination.close();

    assert.ok(writes.some((entry) => entry.includes("[logger] Failed to publish logs to CloudWatch. temporary")));
  } finally {
    process.stderr.write = originalWrite;
  }
});
