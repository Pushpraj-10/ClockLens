interface Props {
  events: number;
  nodes: number;
  /** Messages a node is holding in manual mode. */
  held: number;
  /** Concurrent pairs that Lamport would wrongly order. */
  misleading: number;
}

/** Four headline numbers, all taken from state and server answers (no clock logic here). */
export function StatTiles({ events, nodes, held, misleading }: Props) {
  const tiles: { label: string; value: number; hint: string; tone?: string }[] = [
    { label: "Events", value: events, hint: "in this run" },
    { label: "Nodes", value: nodes, hint: "online" },
    { label: "Held", value: held, hint: "messages awaiting delivery", tone: held > 0 ? "text-warn" : undefined },
    {
      label: "Lamport misleads",
      value: misleading,
      hint: misleading === 1 ? "concurrent pair looks ordered" : "concurrent pairs look ordered",
      tone: misleading > 0 ? "text-warn" : undefined,
    },
  ];
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 xl:grid-cols-4" aria-label="Run summary">
      {tiles.map((t) => (
        <li key={t.label} className="tile">
          <span className="text-[13px] text-muted">{t.label}</span>
          <span className={`font-mono text-3xl leading-none font-semibold tabular-nums ${t.tone ?? ""}`}>{t.value}</span>
          <span className="text-xs text-muted">{t.hint}</span>
        </li>
      ))}
    </ul>
  );
}
