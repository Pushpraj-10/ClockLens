import type { ClockEvent, NodeStatus, StreamMessage } from "@clocklens/events";

export interface State {
  connected: boolean;
  /** Events in arrival order. Arrival order is for storage only, never causal order. */
  events: ClockEvent[];
  seen: Record<string, true>;
  statuses: Record<string, NodeStatus>;
}

export const initialState: State = { connected: false, events: [], seen: {}, statuses: {} };

export type Action =
  | { type: "connection"; connected: boolean }
  | { type: "message"; message: StreamMessage };

function addEvents(evs: ClockEvent[]): Pick<State, "events" | "seen"> {
  const events: ClockEvent[] = [];
  const seen: Record<string, true> = {};
  for (const e of evs) {
    if (seen[e.id]) continue;
    seen[e.id] = true;
    events.push(e);
  }
  return { events, seen };
}

export function reducer(state: State, action: Action): State {
  if (action.type === "connection") return { ...state, connected: action.connected };

  const msg = action.message;
  switch (msg.type) {
    case "snapshot":
      return {
        ...state,
        ...addEvents(msg.events ?? []),
        statuses: Object.fromEntries((msg.statuses ?? []).map((s) => [s.id, s])),
      };
    case "event":
      // A client may see an event both in a snapshot and in the stream: dedup by id.
      if (state.seen[msg.event.id]) return state;
      return {
        ...state,
        events: [...state.events, msg.event],
        seen: { ...state.seen, [msg.event.id]: true },
      };
    case "status":
      return { ...state, statuses: { ...state.statuses, [msg.status.id]: msg.status } };
    default:
      return state;
  }
}

const collator = new Intl.Collator(undefined, { numeric: true });

/** Process ids known from node statuses and events, in natural order (P2 before P10). */
export function processList(state: State): string[] {
  const ids = new Set<string>(Object.keys(state.statuses));
  for (const e of state.events) ids.add(e.process);
  return [...ids].sort(collator.compare);
}
