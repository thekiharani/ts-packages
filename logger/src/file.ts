import pino from "pino";
import type { DestinationStream } from "pino";
import { Writable } from "node:stream";
import type { FileLoggerConfig, LoggerRuntimeContext } from "./types";
import { createLoggerTargetContext, resolveTarget } from "./targets";

type ManagedFileDestination = {
  stream: Writable;
  flush: () => Promise<void>;
  close: () => Promise<void>;
};

type ManagedFileStream = DestinationStream & {
  end?: () => void;
  flush?: () => void;
  once?: (event: string, listener: () => void) => void;
  write: (chunk: string, callback?: (error?: Error | null) => void) => boolean;
};

export function createFileDestination(
  config: FileLoggerConfig,
  runtimeContext: LoggerRuntimeContext,
): ManagedFileDestination {
  const state = new FileDestinationBuffer(config, runtimeContext);

  return {
    stream: state.stream,
    flush: () => state.flush(),
    close: () => state.close(),
  };
}

class FileDestinationBuffer {
  readonly stream: Writable;

  readonly #config: FileLoggerConfig;
  readonly #runtimeContext: LoggerRuntimeContext;
  readonly #streams = new Map<string, ManagedFileStream>();

  constructor(config: FileLoggerConfig, runtimeContext: LoggerRuntimeContext) {
    this.#config = config;
    this.#runtimeContext = runtimeContext;

    this.stream = new Writable({
      write: (chunk, _encoding, callback) => {
        try {
          this.enqueue(String(chunk));
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
      final: async (callback) => {
        try {
          await this.close();
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
    });
  }

  async flush(): Promise<void> {
    for (const stream of this.#streams.values()) {
      if (typeof stream.flush === "function") {
        stream.flush();
      }
    }
  }

  async close(): Promise<void> {
    await this.flush();

    for (const stream of this.#streams.values()) {
      if (typeof stream.flush === "function") {
        stream.flush();
      }

      if (typeof stream.end === "function" && typeof stream.once === "function") {
        await new Promise<void>((resolve) => {
          stream.once!("close", resolve);
          stream.end!();
        });
      }
    }

    this.#streams.clear();
  }

  private enqueue(chunk: string): void {
    const lines = chunk
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const line of lines) {
      const timestamp = extractTimestamp(line);
      const path = resolveTarget(
        this.#config.target,
        createLoggerTargetContext(this.#runtimeContext, timestamp),
        {
          value: "",
        },
      );

      if (!path) {
        throw new Error("file logging requires file.target.value, file.target.prefix, or file.target.resolve.");
      }

      this.getStream(path).write(`${line}\n`);
    }
  }

  private getStream(path: string): ManagedFileStream {
    const existing = this.#streams.get(path);

    if (existing) {
      return existing;
    }

    const stream = pino.destination({
      dest: path,
      mkdir: this.#config.mkdir ?? true,
      sync: false,
    }) as ManagedFileStream;

    this.#streams.set(path, stream);
    return stream;
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
