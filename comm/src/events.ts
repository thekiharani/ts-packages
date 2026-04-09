export type MessageChannel = "sms" | "whatsapp";
export type DeliveryState =
  | "accepted"
  | "queued"
  | "submitted"
  | "delivered"
  | "read"
  | "failed"
  | "unknown";

export interface DeliveryEvent {
  channel: MessageChannel;
  provider: string;
  providerMessageId: string;
  state: DeliveryState;
  recipient?: string;
  providerStatus?: string;
  errorCode?: string;
  errorDescription?: string;
  occurredAt?: string;
  metadata: Record<string, unknown>;
  raw?: unknown;
}
