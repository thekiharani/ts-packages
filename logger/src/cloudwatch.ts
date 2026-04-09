import { Writable } from "node:stream";
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutRetentionPolicyCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import type {
  CloudWatchLoggerConfig,
  LoggerRuntimeContext,
} from "./types";
import {
  createLoggerRuntimeContext,
  createLoggerTargetContext,
  resolveTarget,
} from "./targets";

const DEFAULT_FLUSH_INTERVAL_MS = 2_000;
const DEFAULT_MAX_BATCH_COUNT = 1_000;
const DEFAULT_MAX_BATCH_BYTES = 900_000;
const DEFAULT_MAX_BUFFERED_EVENTS = 20_000;
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const CLOUDWATCH_EVENT_OVERHEAD_BYTES = 26;
const SUPPORTED_RETENTION_DAYS = new Set([
  1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096,
  1827, 2192, 2557, 2922, 3288, 3653,
]);

type QueuedLogEvent = {
  message: string;
  timestamp: number;
  bytes: number;
  streamName: string;
};

type CloudWatchDestination = {
  stream: Writable;
  flush: () => Promise<void>;
  close: () => Promise<void>;
};

export function createCloudWatchDestination(
  config: CloudWatchLoggerConfig,
  runtimeContext = createLoggerRuntimeContext(),
): CloudWatchDestination {
  const client =
    config.client ??
    new CloudWatchLogsClient({
      region: config.region,
      credentials: config.credentials,
    });

  const state = new CloudWatchLogBuffer(client, config, runtimeContext);

  return {
    stream: state.stream,
    flush: () => state.flush(),
    close: () => state.close(),
  };
}

class CloudWatchLogBuffer {
  readonly stream: Writable;

  readonly #client: CloudWatchLogsClient;
  readonly #logGroupName: string;
  readonly #runtimeContext: LoggerRuntimeContext;
  readonly #streamConfig: CloudWatchLoggerConfig["stream"];
  readonly #retentionInDays: number | undefined;
  readonly #createLogGroup: boolean;
  readonly #createLogStream: boolean;
  readonly #flushIntervalMs: number;
  readonly #maxBatchCount: number;
  readonly #maxBatchBytes: number;
  readonly #maxBufferedEvents: number;
  readonly #retryBaseDelayMs: number;

  #queue: QueuedLogEvent[] = [];
  #queueBytes = 0;
  #logGroupInit?: Promise<void>;
  #streamInit = new Map<string, Promise<void>>();
  #flushInFlight?: Promise<void>;
  #flushTimer: NodeJS.Timeout | undefined;
  #closed = false;
  #retryDelayMs = DEFAULT_RETRY_BASE_DELAY_MS;

  constructor(
    client: CloudWatchLogsClient,
    config: CloudWatchLoggerConfig,
    runtimeContext: LoggerRuntimeContext,
  ) {
    this.#client = client;
    this.#logGroupName = config.logGroupName;
    this.#runtimeContext = runtimeContext;
    this.#streamConfig = config.stream;
    this.#retentionInDays = config.retentionInDays;
    this.#createLogGroup = config.createLogGroup ?? true;
    this.#createLogStream = config.createLogStream ?? true;
    this.#flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.#maxBatchCount = config.maxBatchCount ?? DEFAULT_MAX_BATCH_COUNT;
    this.#maxBatchBytes = config.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES;
    this.#maxBufferedEvents = config.maxBufferedEvents ?? DEFAULT_MAX_BUFFERED_EVENTS;
    this.#retryBaseDelayMs = config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;

    this.stream = new Writable({
      write: (chunk, _encoding, callback) => {
        try {
          this.enqueue(String(chunk));
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
      final: (callback) => {
        void this.close().then(
          () => callback(),
          (error) => callback(error as Error),
        );
      },
    });
  }

  async flush(): Promise<void> {
    if (this.#flushInFlight) {
      await this.#flushInFlight;
      return;
    }

    this.#flushInFlight = this.flushInternal().finally(() => {
      this.#flushInFlight = undefined;
    });

    await this.#flushInFlight;
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.clearFlushTimer();
    await this.flush();
  }

  private enqueue(chunk: string): void {
    const lines = chunk
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const line of lines) {
      const event = this.createEvent(line);
      this.#queue.push(event);
      this.#queueBytes += event.bytes;
    }

    this.trimQueueIfNeeded();

    if (this.#queue.length >= this.#maxBatchCount || this.#queueBytes >= this.#maxBatchBytes) {
      void this.flush();
      return;
    }

    this.scheduleFlush();
  }

  private createEvent(message: string): QueuedLogEvent {
    const timestamp = extractTimestamp(message);
    const streamConfig = this.resolveStreamConfig();
    const shouldIncludeHostnameByDefault =
      streamConfig?.rotation !== undefined &&
      streamConfig.rotation !== "none" &&
      streamConfig.prefix !== undefined;

    return {
      message,
      timestamp,
      bytes: Buffer.byteLength(message, "utf8") + CLOUDWATCH_EVENT_OVERHEAD_BYTES,
      streamName: resolveTarget(
        streamConfig,
        createLoggerTargetContext(this.#runtimeContext, timestamp),
        {
          value: `${this.#runtimeContext.hostname}-${this.#runtimeContext.pid}`,
          includeHostname: shouldIncludeHostnameByDefault,
          includePid: false,
          separator: "-",
        },
      ),
    };
  }

  private trimQueueIfNeeded(): void {
    while (this.#queue.length > this.#maxBufferedEvents) {
      const removed = this.#queue.shift()!;
      this.#queueBytes -= removed.bytes;
    }
  }

  private scheduleFlush(delayMs = this.#flushIntervalMs): void {
    if (this.#closed || this.#flushTimer) {
      return;
    }

    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = undefined;
      void this.flush();
    }, delayMs);
  }

  private clearFlushTimer(): void {
    if (!this.#flushTimer) {
      return;
    }

    clearTimeout(this.#flushTimer);
    this.#flushTimer = undefined;
  }

  private async flushInternal(): Promise<void> {
    this.clearFlushTimer();

    if (this.#queue.length === 0) {
      return;
    }

    await this.ensureLogGroup();

    while (this.#queue.length > 0) {
      const batch = this.takeBatch();
      await this.ensureResources(batch.streamName);

      try {
        await this.#client.send(
          new PutLogEventsCommand({
            logGroupName: this.#logGroupName,
            logStreamName: batch.streamName,
            logEvents: batch
              .events
              .sort((left, right) => left.timestamp - right.timestamp)
              .map((event) => ({
                message: event.message,
                timestamp: event.timestamp,
              })),
          }),
        );

        this.#retryDelayMs = this.#retryBaseDelayMs;
      } catch (error) {
        this.prependBatch(batch.events);
        this.writeInternalError("Failed to publish logs to CloudWatch.", error);
        this.scheduleFlush(this.#retryDelayMs);
        this.#retryDelayMs = Math.min(this.#retryDelayMs * 2, MAX_RETRY_DELAY_MS);
        return;
      }
    }
  }

  private takeBatch(): {
    events: QueuedLogEvent[];
    streamName: string;
  } {
    const streamName = this.#queue[0]!.streamName;
    const batch: QueuedLogEvent[] = [];
    let bytes = 0;
    let index = 0;

    while (index < this.#queue.length && batch.length < this.#maxBatchCount) {
      const next = this.#queue[index]!;

      if (next.streamName !== streamName) {
        index += 1;
        continue;
      }

      if (batch.length > 0 && bytes + next.bytes > this.#maxBatchBytes) {
        break;
      }

      batch.push(next);
      bytes += next.bytes;
      this.#queue.splice(index, 1);
      this.#queueBytes -= next.bytes;
    }

    return {
      events: batch,
      streamName,
    };
  }

  private prependBatch(batch: QueuedLogEvent[]): void {
    this.#queue = [...batch, ...this.#queue];
    this.#queueBytes += batch.reduce((total, entry) => total + entry.bytes, 0);
    this.trimQueueIfNeeded();
  }

  private async ensureResources(streamName: string): Promise<void> {
    await this.ensureLogGroup();
    await this.ensureLogStream(streamName);
  }

  private async ensureLogGroup(): Promise<void> {
    if (!this.#createLogGroup && this.#retentionInDays === undefined) {
      return;
    }

    this.#logGroupInit ??= this.initializeLogGroup();
    await this.#logGroupInit;
  }

  private async initializeLogGroup(): Promise<void> {
    if (this.#createLogGroup) {
      try {
        await this.#client.send(
          new CreateLogGroupCommand({
            logGroupName: this.#logGroupName,
          }),
        );
      } catch (error) {
        if (!isAwsError(error, "ResourceAlreadyExistsException")) {
          throw error;
        }
      }
    }

    if (this.#retentionInDays !== undefined) {
      validateRetentionInDays(this.#retentionInDays);
      await this.#client.send(
        new PutRetentionPolicyCommand({
          logGroupName: this.#logGroupName,
          retentionInDays: this.#retentionInDays,
        }),
      );
    }
  }

  private async ensureLogStream(streamName: string): Promise<void> {
    if (!this.#createLogStream) {
      return;
    }

    let init = this.#streamInit.get(streamName);

    if (!init) {
      init = this.initializeLogStream(streamName);
      this.#streamInit.set(streamName, init);
    }

    await init;
  }

  private async initializeLogStream(streamName: string): Promise<void> {
    try {
      await this.#client.send(
        new CreateLogStreamCommand({
          logGroupName: this.#logGroupName,
          logStreamName: streamName,
        }),
      );
    } catch (error) {
      if (!isAwsError(error, "ResourceAlreadyExistsException")) {
        throw error;
      }
    }
  }

  private resolveStreamConfig() {
    return this.#streamConfig;
  }

  private writeInternalError(message: string, error: unknown): void {
    const text =
      error instanceof Error ? `${message} ${error.name}: ${error.message}` : `${message} ${String(error)}`;

    process.stderr.write(`[logger] ${text}\n`);
  }

}

function extractTimestamp(message: string): number {
  try {
    const parsed = JSON.parse(message) as Record<string, unknown>;
    const time = parsed["time"];
    const timestamp = parsed["timestamp"];

    if (typeof time === "number" && Number.isFinite(time)) {
      return time;
    }

    if (typeof time === "string") {
      const timestamp = Date.parse(time);
      if (Number.isFinite(timestamp)) {
        return timestamp;
      }
    }

    if (typeof timestamp === "string") {
      const parsedTimestamp = Date.parse(timestamp);
      if (Number.isFinite(parsedTimestamp)) {
        return parsedTimestamp;
      }
    }
  } catch {
    // Fall back to wall clock if the line is not valid JSON.
  }

  return Date.now();
}

function isAwsError(error: unknown, expectedName: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === expectedName
  );
}

function validateRetentionInDays(retentionInDays: number): void {
  if (!Number.isInteger(retentionInDays) || !SUPPORTED_RETENTION_DAYS.has(retentionInDays)) {
    throw new Error(
      `Unsupported CloudWatch retentionInDays '${retentionInDays}'.`,
    );
  }
}
