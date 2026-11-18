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

/** Details of the selected event and what is before, after and concurrent with it. */
export function EventInspector({ event, lanes, relations, error, visibleIds }: Props) {
  const list = (ids: string[]) => {
    const shown = ids.filter((id) => visibleIds.has(id));
    return shown.length ? shown.join(", ") : "none";
  };
  const ready = event && relations?.id === event.id;

  return (
    <section className="panel">
      <h2>Selected event</h2>
      {!event ? (
        <p className="muted">Click an event in the diagram to inspect it and highlight its past, future and concurrent events.</p>
      ) : (
        <>
          <dl className="inspector">
            <dt>Event</dt>
            <dd>
              {event.id} ({event.kind})
            </dd>
            <dt>Lamport</dt>
            <dd>{event.lamport}</dd>
            <dt>Vector</dt>
            <dd>
              {lanes.map((p) => (
                <span key={p} className="vec-entry">
                  {p}: {event.vector[p] ?? 0}
                </span>
              ))}
            </dd>
            {event.peer && (
              <>
                <dt>{event.kind === "send" ? "Sent to" : "Received from"}</dt>
                <dd>
                  {event.peer} ({event.msgId})
                </dd>
              </>
            )}
          </dl>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {ready && (
            <dl className="relation-lists">
              <div>
                <dt>
                  <span className="swatch past" /> Happened before
                </dt>
                <dd>{list(relations.past)}</dd>
              </div>
              <div>
                <dt>
                  <span className="swatch future" /> Happens after
                </dt>
                <dd>{list(relations.future)}</dd>
              </div>
              <div>
                <dt>
                  <span className="swatch concurrent" /> Concurrent
                </dt>
                <dd>{list(relations.concurrent)}</dd>
              </div>
            </dl>
          )}
        </>
      )}
    </section>
  );
}
