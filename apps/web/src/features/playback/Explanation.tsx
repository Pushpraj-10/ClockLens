import type { ClockEvent } from "@clocklens/events";
import type { Explanation as Explained } from "../../lib/explain";
import { plainStep } from "../../lib/plain";

interface Props {
  explanation?: Explained;
  /** The step being explained (used for the one-sentence simple view). */
  event?: ClockEvent;
  /** Advanced view shows the clock arithmetic; simple view shows one sentence. */
  advanced: boolean;
}

/** Plain-English explanation of the step currently shown. */
export function Explanation({ explanation, event, advanced }: Props) {
  return (
    <section className="panel" aria-live="polite">
      <h2 className="section-title">What just happened</h2>
      {explanation && event ? (
        <>
          <p className="mb-1.5 font-semibold">{explanation.title}</p>
          {advanced ? (
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 marker:text-muted">
              {explanation.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          ) : (
            <p>{plainStep(event)}</p>
          )}
        </>
      ) : (
        <p className="text-muted">Each step of the replay is explained here. Press a button on the left to make something happen.</p>
      )}
    </section>
  );
}
