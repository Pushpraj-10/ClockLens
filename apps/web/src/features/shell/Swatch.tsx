export type Relation = "past" | "future" | "concurrent";

// Same outline as the diagram cards: shape (solid / dashed / dotted) as well as colour.
const STROKE: Record<Relation, string> = {
  past: "stroke-ok",
  future: "stroke-info [stroke-dasharray:4_2.5]",
  concurrent: "stroke-warn [stroke-dasharray:0.5_3] [stroke-linecap:round]",
};

/** Legend mark for a happened-before relation. */
export function Swatch({ rel }: { rel: Relation }) {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true" className="inline-block flex-none align-[-1px]">
      <rect x="1.25" y="1.25" width="13.5" height="9.5" rx="3" className={`fill-none stroke-[2] ${STROKE[rel]}`} />
    </svg>
  );
}
