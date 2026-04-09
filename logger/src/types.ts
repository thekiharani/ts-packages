import type pino from "pino";
import type {
  CloudWatchLogsClient,
  CloudWatchLogsClientConfig,
} from "@aws-sdk/client-cloudwatch-logs";

export type LogLevel = pino.LevelWithSilent;

export type LoggerDestination = "stdout" | "stderr" | "file" | "cloudwatch";

export type RedactMatcher = (key: string) => boolean;

export type RotationMode = "none" | "daily" | "monthly" | "annual";

export interface LoggerRuntimeContext {
  serviceName?: string;
  environment?: string;
  hostname: string;
  pid: number;
  instanceId?: string;
}

export interface LoggerTargetContext extends LoggerRuntimeContext {
  timestamp: number;
  isoTimestamp: string;
}

export type TargetResolver = (context: LoggerTargetContext) => string;

export interface TargetConfig {
  value?: string;
  prefix?: string;
  suffix?: string;
  separator?: string;
  rotation?: RotationMode;
  timezone?: string;
  identifier?: string;
  includeServiceName?: boolean;
  includeEnvironment?: boolean;
  includeHostname?: boolean;
  includeInstanceId?: boolean;
  includePid?: boolean;
  resolve?: TargetResolver;
}

export interface LoggerSchemaConfig {
  messageKey?: string;
  levelKey?: string;
  levelValueKey?: string;
  timeKey?: string;
  timestampKey?: string;
  serviceKey?: string;
  environmentKey?: string;
  errorKey?: string;
  timeMode?: "epoch" | "iso" | "both";
}

export interface LoggerIdentityConfig {
  hostname?: string;
  pid?: number;
  instanceId?: string;
}

export interface LoggerRedactionConfig {
  keys?: string[];
  mode?: "merge" | "replace";
}

export interface FileLoggerConfig {
  target?: TargetConfig;
  mkdir?: boolean;
}

export interface CloudWatchLoggerConfig {
  region: string;
  logGroupName: string;
  stream?: TargetConfig;
  credentials?: CloudWatchLogsClientConfig["credentials"];
  retentionInDays?: number;
  createLogGroup?: boolean;
  createLogStream?: boolean;
  flushIntervalMs?: number;
  maxBatchCount?: number;
  maxBatchBytes?: number;
  maxBufferedEvents?: number;
  retryBaseDelayMs?: number;
  client?: CloudWatchLogsClient;
}

export interface ServiceLoggerConfig {
  serviceName: string;
  environment?: string;
  level?: LogLevel;
  destinations?: LoggerDestination[];
  schema?: LoggerSchemaConfig;
  identity?: LoggerIdentityConfig;
  redact?: LoggerRedactionConfig;
  file?: FileLoggerConfig;
  redactKeys?: string[];
  base?: Record<string, unknown>;
  cloudwatch?: CloudWatchLoggerConfig;
}

export interface ManagedLogger {
  logger: pino.Logger;
  flush: () => Promise<void>;
  close: () => Promise<void>;
}
