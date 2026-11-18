// Wire types shared with the Go server (go/pkg/protocol and go/internal/server/hub).
import type { ClockEvent } from "./index";

export type Mode = "auto" | "manual";

export interface Pending {
  msgId: string;
  from: string;
}

/** A node's non-clock state. Carries no clock values. */
export interface NodeStatus {
  id: string;
  mode: Mode;
  partition: string[];
  pending: Pending[];
}

export type CommandType =
  | "local"
  | "send"
  | "deliver"
  | "drop"
  | "set_mode"
  | "set_partition"
  | "reset"
  | "stop";

export interface Command {
  type: CommandType;
  to?: string;
  msgId?: string;
  mode?: Mode;
  peers?: string[];
}

/** Relation of event A to event B under happened-before. */
export type Order = "before" | "after" | "equal" | "concurrent";

/** GET /api/causality/{id}: every other event classified relative to one event. */
export interface Relations {
  id: string;
  past: string[];
  future: string[];
  concurrent: string[];
}

/** GET /api/compare?a=&b=: the server's verdict for a pair, with proof. */
export interface Comparison {
  a: string;
  b: string;
  relation: Order;
  lamportA: number;
  lamportB: number;
  lamportSays: "before" | "after" | "tie";
  lamportMisleads: boolean;
  proof: string[];
  path?: string[];
}

/** GET /api/misleading: concurrent pairs whose Lamport values differ (a < b by Lamport). */
export interface Misleading {
  a: string;
  b: string;
  lamportA: number;
  lamportB: number;
}

/** What the server sends over the WebSocket. A snapshot replaces all local state. */
export type StreamMessage =
  | { type: "event"; event: ClockEvent }
  | { type: "status"; status: NodeStatus }
  | { type: "snapshot"; events?: ClockEvent[]; statuses?: NodeStatus[] };
