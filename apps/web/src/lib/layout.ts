import type { ClockEvent } from "@clocklens/events";

export interface Message {
  msgId: string;
  send: ClockEvent;
  receive?: ClockEvent;
}

export interface Layout {
  /** Process ids, one lane each, in display order. */
  lanes: string[];

  /** All events in a causally consistent order (used for playback). */
  order: ClockEvent[];

  /** Horizontal slot of each event, by id. */
  column: Record<string, number>;

  /** Number of horizontal slots. */
  columns: number;

  messages: Message[];
}

/**
 * Lay events out on a space-time diagram.
 *
 * The column of an event is its depth in the causal graph (previous event on the
 * same process, plus the matching send for a receive), so every message arrow points
 * forward. This uses the event structure only, not Lamport values and not arrival
 * order. Horizontal position is a drawing aid, not a measurement of time.
 */
export function computeLayout(events: ClockEvent[], lanes: string[]): Layout {
  // Lanes: the known processes first, then any process that only appears in events.
  const laneList = [...lanes];
  for (const e of events) if (!laneList.includes(e.process)) laneList.push(e.process);

  const laneIndex = new Map(laneList.map((p, i) => [p, i]));

  // Each process's events in program order.
  const perProcess = new Map<string, ClockEvent[]>();

  for (const e of events) {
    const list = perProcess.get(e.process);

    if (list) list.push(e);
    else perProcess.set(e.process, [e]);
  }

  for (const list of perProcess.values()) list.sort((a, b) => a.seq - b.seq);

  // Match every send with its receive by message id.
  const sendBy = new Map<string, ClockEvent>();
  const receiveBy = new Map<string, ClockEvent>();

  for (const e of events) {
    if (!e.msgId) continue;

    if (e.kind === "send") sendBy.set(e.msgId, e);
    else if (e.kind === "receive") receiveBy.set(e.msgId, e);
  }

  // Direct causal predecessors of every event.
  const preds = new Map<string, ClockEvent[]>();
  const succ = new Map<string, ClockEvent[]>();
  const indegree = new Map<string, number>();

  const link = (from: ClockEvent, to: ClockEvent) => {
    preds.set(to.id, [...(preds.get(to.id) ?? []), from]);
    succ.set(from.id, [...(succ.get(from.id) ?? []), to]);
    indegree.set(to.id, (indegree.get(to.id) ?? 0) + 1);
  };

  for (const list of perProcess.values()) {
    list.forEach((e, i) => {
      // Program order: the previous event on the same node.
      const prev = list[i - 1];
      if (prev) link(prev, e);

      // A receive also follows its send.
      if (e.kind === "receive" && e.msgId) {
        const send = sendBy.get(e.msgId);
        if (send && send.process !== e.process) link(send, e);
      }
    });
  }

  // Longest-path layering via Kahn's algorithm.
  const column: Record<string, number> = {};
  const queue = events.filter((e) => (indegree.get(e.id) ?? 0) === 0);

  for (let head = 0; head < queue.length; head++) {
    const e = queue[head]!;

    // An event sits one column to the right of its right-most predecessor.
    let col = 0;
    for (const p of preds.get(e.id) ?? []) col = Math.max(col, (column[p.id] ?? -1) + 1);

    column[e.id] = col;

    for (const s of succ.get(e.id) ?? []) {
      const left = (indegree.get(s.id) ?? 0) - 1;
      indegree.set(s.id, left);

      if (left === 0) queue.push(s);
    }
  }

  // Events left over are on a cycle (only possible in a corrupt imported trace).
  let next = Math.max(-1, ...Object.values(column)) + 1;

  const rest = events
    .filter((e) => column[e.id] === undefined)
    .sort((a, b) => (laneIndex.get(a.process) ?? 0) - (laneIndex.get(b.process) ?? 0) || a.seq - b.seq);

  for (const e of rest) column[e.id] = next++;

  // Playback order: by column, then lane, then program order.
  const order = [...events].sort(
    (a, b) =>
      (column[a.id] ?? 0) - (column[b.id] ?? 0) ||
      (laneIndex.get(a.process) ?? 0) - (laneIndex.get(b.process) ?? 0) ||
      a.seq - b.seq,
  );

  // One entry per message, with its receive if it has arrived.
  const messages: Message[] = [...sendBy.values()]
    .map((send) => ({ msgId: send.msgId!, send, receive: receiveBy.get(send.msgId!) }))
    .sort((a, b) => (column[a.send.id] ?? 0) - (column[b.send.id] ?? 0));

  const columns = order.length === 0 ? 0 : Math.max(...Object.values(column)) + 1;

  return { lanes: laneList, order, column, columns, messages };
}
