import type { ClockEvent, Misleading, Relations } from "@clocklens/events";

/**
 * Plain-English sentences for the simple view. They only restate facts the server has
 * already computed (counts of before / after / independent); no causality is derived here.
 */

/** One sentence about what a step did. */
export function plainStep(e: ClockEvent): string {
  const p = e.process;

  switch (e.kind) {
    case "local":
      return `${p} did something on its own. No message was involved.`;

    case "send":
      return `${p} sent a message to ${e.peer ?? "another node"}.`;

    case "receive":
      return `${p} received a message from ${e.peer ?? "another node"}, so it now knows everything ${e.peer ?? "the sender"} knew when it sent it.`;
  }
}

const events = (n: number) => `${n} ${n === 1 ? "event" : "events"}`;

/** "2 events happened before this one, 3 happen after it, and 1 is independent of it." */
export function relationSentence(relations: Relations, visibleIds: Set<string>): string {
  // Only events already shown at the current playback position are counted.
  const count = (ids: string[]) => ids.filter((id) => visibleIds.has(id)).length;

  const before = count(relations.past);
  const after = count(relations.future);
  const independent = count(relations.concurrent);

  const indep = independent === 1 ? "1 is independent of it" : `${independent} are independent of it`;

  return `${events(before)} happened before this one, ${after} happen after it, and ${indep} (neither could have caused the other).`;
}

/**
 * The simple-view warning: Lamport numbers order two events that were actually independent.
 * `pairs` are the server's misleading pairs (a has the lower Lamport value).
 */
export function lamportNote(selectedId: string | undefined, pairs: Misleading[]): string | undefined {
  if (!selectedId) return undefined;

  // The pairs the selected event takes part in.
  const mine = pairs.filter((p) => p.a === selectedId || p.b === selectedId);

  const first = mine[0];
  if (!first) return undefined;

  const more = mine.length > 1 ? ` (and ${mine.length - 1} more like it)` : "";

  return `Lamport numbers suggest ${first.a} came before ${first.b} (${first.lamportA} < ${first.lamportB}), but they happened independently${more}.`;
}
