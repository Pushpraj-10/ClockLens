import type { ClockEvent, Relations } from "@clocklens/events";

interface Props {
  event?: ClockEvent;
  lanes: string[];
  /** Server-computed relations of `event`. */
  relations?: Relations;
  error?: string;
  /** Only events up to the playback position are listed. */
  visibleIds: Set<string>;
}

const dt = "text-muted";

/** Details of the selected event and what is before, after and concurrent with it. */
export function EventInspector({ event, lanes, relations, error, visibleIds }: Props) {
  const list = (ids: string[]) => {
    const shown = ids.filter((id) => visibleIds.has(id));
    return shown.length ? shown.join(", ") : "none";
  };
  const ready = event && relations?.id === event.id;

  return (
    <section className="panel">
      <h2 className="section-title">Selected event</h2>
      {!event ? (
        <p className="text-muted">Click an event in the diagram to inspect it and highlight its past, future and concurrent events.</p>
      ) : (
        <>
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
            <dt className={dt}>Event</dt>
            <dd className="m-0">
              {event.id} ({event.kind})
            </dd>
            <dt className={dt}>Lamport</dt>
            <dd className="m-0 font-mono">{event.lamport}</dd>
            <dt className={dt}>Vector</dt>
            <dd className="m-0">
              {lanes.map((p) => (
                <span key={p} className="mr-2.5 inline-block font-mono">
                  {p}: {event.vector[p] ?? 0}
                </span>
              ))}
            </dd>
            {event.peer && (
              <>
                <dt className={dt}>{event.kind === "send" ? "Sent to" : "Received from"}</dt>
                <dd className="m-0">
                  {event.peer} ({event.msgId})
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
            <dl className="mt-2.5 grid gap-1.5" data-testid="relation-lists">
              <Group swatch="swatch-past" title="Happened before" ids={list(relations.past)} />
              <Group swatch="swatch-future" title="Happens after" ids={list(relations.future)} />
              <Group swatch="swatch-concurrent" title="Independent (concurrent)" ids={list(relations.concurrent)} />
            </dl>
          )}
        </>
      )}
    </section>
  );
}

function Group({ swatch, title, ids }: { swatch: string; title: string; ids: string }) {
  return (
    <div>
      <dt className="font-semibold">
        <span className={`swatch ${swatch}`} /> {title}
      </dt>
      <dd className="m-0 font-mono text-[13px]">{ids}</dd>
    </div>
  );
}
