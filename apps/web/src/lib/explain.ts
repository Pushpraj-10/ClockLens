import type { ClockEvent } from "@clocklens/events";

export interface Explanation {
  title: string;
  steps: string[];
}

export interface ExplainContext {
  /** Previous event on the same process, if any. */
  prev?: ClockEvent;

  /** For a receive: the matching send event, if known. */
  send?: ClockEvent;

  /** Process order used when printing vectors. */
  lanes: string[];
}

/** Format a vector in lane order, e.g. [2,1,0]. Missing entries count as 0. */
export function formatVector(v: Record<string, number>, lanes: string[]): string {
  return `[${lanes.map((l) => v[l] ?? 0).join(",")}]`;
}

/** Plain-English description of one step, with the arithmetic shown. */
export function explainEvent(e: ClockEvent, ctx: ExplainContext): Explanation {
  const { prev, send, lanes } = ctx;

  // Clock values before this step (0 when it is the node's first event) and after it.
  const p = e.process;
  const prevL = prev?.lamport ?? 0;
  const prevOwn = prev?.vector[p] ?? 0;
  const own = e.vector[p] ?? 0;
  const prevVec = prev?.vector ?? {};

  const fv = (v: Record<string, number>) => formatVector(v, lanes);

  switch (e.kind) {
    case "local":
      return {
        title: `${p} does a local event`,
        steps: [
          `${p} does something on its own. No message is involved.`,
          `Lamport clock: ${prevL} + 1 = ${e.lamport}.`,
          `Vector clock: ${p}'s own counter goes ${prevOwn} → ${own}; the other counters are unchanged. Now ${fv(e.vector)}.`,
        ],
      };

    case "send":
      return {
        title: `${p} sends ${e.msgId ?? "a message"} to ${e.peer ?? "?"}`,
        steps: [
          `Sending counts as an event, so ${p} ticks its clocks first.`,
          `Lamport clock: ${prevL} + 1 = ${e.lamport}.`,
          `Vector clock: ${p}'s own counter goes ${prevOwn} → ${own}. Now ${fv(e.vector)}.`,
          `The message carries these two stamps (Lamport ${e.lamport}, vector ${fv(e.vector)}) so the receiver can use them.`,
        ],
      };

    case "receive": {
      const steps: string[] = [];

      if (send) {
        steps.push(`The message ${e.msgId} carried Lamport ${send.lamport} and vector ${fv(send.vector)}.`);
        steps.push(`Lamport clock: max(own ${prevL}, message ${send.lamport}) + 1 = ${e.lamport}.`);
        steps.push(
          `Vector clock: take the larger value for each process from own ${fv(prevVec)} and the message ${fv(send.vector)}, then add 1 to ${p}'s own counter. Now ${fv(e.vector)}.`,
        );
      } else {
        steps.push(`The matching send event is not in this trace.`);
        steps.push(`Lamport clock: max(own ${prevL}, message) + 1 = ${e.lamport}.`);
        steps.push(`Vector clock: element-wise max with the message's vector, then +1 on ${p}. Now ${fv(e.vector)}.`);
      }

      steps.push(`Everything the sender knew when it sent the message is now part of ${p}'s past.`);

      return { title: `${p} receives ${e.msgId ?? "a message"} from ${e.peer ?? "?"}`, steps };
    }
  }
}
