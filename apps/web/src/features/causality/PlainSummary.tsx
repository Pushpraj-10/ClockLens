import type { ClockEvent, Relations } from "@clocklens/events";
import { relationSentence } from "../../lib/plain";
import { Swatch } from "../shell/Swatch";

interface Props {
  event?: ClockEvent;
  relations?: Relations;
  error?: string;
  visibleIds: Set<string>;
  /** Warning text when Lamport numbers order two independent events (simple view). */
  lamportNote?: string;
  onShowAdvanced: () => void;
}

/** Simple-view "selected event" panel: one sentence and a colour key, no clock numbers. */
export function PlainSummary({ event, relations, error, visibleIds, lamportNote, onShowAdvanced }: Props) {
  const ready = event && relations?.id === event.id;
  return (
    <section className="panel">
      <h2 className="section-title">Selected event</h2>
      {!event ? (
        <p className="text-muted">Click any card on the timeline to see what happened before it, after it, and independently of it.</p>
      ) : (
        <>
          <p className="font-semibold">
            {event.process} {event.kind === "send" ? `sent to ${event.peer}` : event.kind === "receive" ? `received from ${event.peer}` : "did a local event"}
          </p>
          {error && (
            <p className="mt-2 text-sm text-bad" role="alert">
              {error}
            </p>
          )}
          {ready && <p className="mt-1.5">{relationSentence(relations, visibleIds)}</p>}
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Swatch rel="past" /> before
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Swatch rel="future" /> after
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Swatch rel="concurrent" /> independent
            </span>
          </p>
          {lamportNote && (
            <p className="mt-3 rounded-r-xl border-l-4 border-warn bg-warn/10 py-2 pr-3 pl-3" role="status">
              {lamportNote}{" "}
              <button type="button" className="font-semibold underline underline-offset-2" onClick={onShowAdvanced}>
                Switch to Advanced to see why
              </button>
              .
            </p>
          )}
        </>
      )}
    </section>
  );
}
