import type { ClockEvent, Relations } from "@clocklens/events";
import { Swatch, type Relation } from "../shell/Swatch";

interface Props {
  event?: ClockEvent;
  lanes: string[];
  /** Server-computed relations of `event`. */
  relations?: Relations;
  error?: string;
  /** Only events up to the playback position are listed. */
  visibleIds: Set<string>;
}

const dt = "text-[13px] text-muted";

/** Details of the selected event and what is before, after and concurrent with it. */
export function EventInspector({ event, lanes, relations, error, visibleIds }: Props) {
  const ready = event && relations?.id === event.id;
  const shown = (ids: string[]) => ids.filter((id) => visibleIds.has(id));

  return (
    <div>
      {!event ? (
        <p className="text-muted">Click an event in the diagram to inspect it and highlight its past, future and concurrent events.</p>
      ) : (
        <>
          <dl className="m-0 grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-1.5">
            <dt className={dt}>Event</dt>
            <dd className="m-0">
              <span className="chip">{event.id}</span> <span className="text-muted">{event.kind}</span>
            </dd>
            <dt className={dt}>Lamport</dt>
            <dd className="m-0 font-mono font-semibold">{event.lamport}</dd>
            <dt className={dt}>Vector</dt>
            <dd className="m-0 flex flex-wrap gap-1">
              {lanes.map((p) => (
                <span key={p} className="chip gap-1">
                  <span className="text-muted">{p}</span>
                  {event.vector[p] ?? 0}
                </span>
              ))}
            </dd>
            {event.peer && (
              <>
                <dt className={dt}>{event.kind === "send" ? "Sent to" : "Received from"}</dt>
                <dd className="m-0">
                  {event.peer} <span className="text-muted">via</span> <span className="chip">{event.msgId}</span>
                </dd>
              </>
            )}
          </dl>
          {error && (
            <p className="mt-2 text-sm text-bad" role="alert">
              {error}
            </p>
          )}
          {ready && (
            <dl className="mt-4 grid gap-3 border-t border-line pt-3.5" data-testid="relation-lists">
              <Group rel="past" title="Happened before" ids={shown(relations.past)} />
              <Group rel="future" title="Happens after" ids={shown(relations.future)} />
              <Group rel="concurrent" title="Independent (concurrent)" ids={shown(relations.concurrent)} />
            </dl>
          )}
        </>
      )}
    </div>
  );
}

function Group({ rel, title, ids }: { rel: Relation; title: string; ids: string[] }) {
  return (
    <div>
      <dt className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Swatch rel={rel} /> {title}
        <span className="font-mono text-xs font-normal text-muted tabular-nums">{ids.length}</span>
      </dt>
      <dd className="m-0 flex flex-wrap gap-1">
        {ids.length ? ids.map((id) => <span key={id} className="chip">{id}</span>) : <span className="text-[13px] text-muted">none</span>}
      </dd>
    </div>
  );
}
