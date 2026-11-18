export * from "./protocol";

// Event format types — mirror contracts/event.schema.json.
export type EventKind = "local" | "send" | "receive";

export interface ClockEvent {
  id: string;
  process: string;
  seq: number; // per-process order
  kind: EventKind;
  lamport: number;
  vector: Record<string, number>;
  peer?: string; // other process for send/receive
  msgId?: string; // links a send to its receive
  label?: string;
  wallTime?: number; // informational only, never used for ordering
}
