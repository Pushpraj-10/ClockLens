import type { Explanation as Explained } from "../../lib/explain";

/** Plain-English explanation of the step currently shown. */
export function Explanation({ explanation }: { explanation?: Explained }) {
  return (
    <section className="panel" aria-live="polite">
      <h2>What just happened</h2>
      {explanation ? (
        <>
          <p className="explain-title">{explanation.title}</p>
          <ol className="explain-steps">
            {explanation.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      ) : (
        <p className="muted">Each step of the replay is explained here.</p>
      )}
    </section>
  );
}
