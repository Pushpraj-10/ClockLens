interface Props {
  events: number;
  nodes: number;
  /** Messages a node is holding in manual mode. */
  held: number;
  /** Concurrent pairs that Lamport would wrongly order. */
  misleading: number;
}

/** Four headline numbers as a compact strip, all taken from state and server answers (no clock logic here). */
export function StatTiles({ events, nodes, held, misleading }: Props) {
  const stats: { label: string; value: number; hint: string; warn?: boolean }[] = [
    { label: "events", value: events, hint: "Events in this run" },
    { label: "nodes", value: nodes, hint: "Nodes online" },
    { label: "held", value: held, hint: "Messages awaiting delivery", warn: held > 0 },
    { label: "misleading", value: misleading, hint: "Concurrent pairs that Lamport makes look ordered", warn: misleading > 0 },
  ];
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Run summary">
      {stats.map((s) => (
        <li
          key={s.label}
          title={s.hint}
          className={`inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
            s.warn ? "border-warn/40 bg-warn/10 text-warn" : "border-line bg-surface text-muted"
          }`}
        >
          <span className={`font-mono text-sm font-semibold tabular-nums ${s.warn ? "" : "text-ink"}`}>{s.value}</span>
          {s.label}
        </li>
      ))}
    </ul>
  );
}
