"use client";

import type { Comparison, Order } from "@clocklens/events";
import type { Remote } from "../../lib/useRemote";

interface Props {
  /** Events that can be chosen (those visible at the current playback position). */
  options: string[];
  a?: string;
  b?: string;
  selectedId?: string;
  onChange: (a: string | undefined, b: string | undefined) => void;
  result: Remote<Comparison>;
}

function headline(c: Comparison): string {
  switch (c.relation) {
    case "before":
      return `${c.a} happened before ${c.b}`;
    case "after":
      return `${c.b} happened before ${c.a}`;
    case "concurrent":
      return `${c.a} and ${c.b} are concurrent`;
    default:
      return `${c.a} is the same event`;
  }
}

const BADGE: Record<Order, string> = {
  before: "text-ok",
  after: "text-ok",
  concurrent: "text-warn",
  equal: "text-muted",
};

/** Pick two events; the server says how they relate and shows its proof. */
export function ComparePanel({ options, a, b, selectedId, onChange, result }: Props) {
  const c = result.data;
  const choose = (letter: "A" | "B", label: string, value: string | undefined, set: (v: string | undefined) => void) => (
    <label className="flex items-center gap-2">
      <span className="text-[13px] font-semibold text-muted">{letter}</span>
      <select className="field" aria-label={label} value={value ?? ""} onChange={(e) => set(e.target.value || undefined)}>
        <option value="">choose…</option>
        {options.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="panel">
      <h2 className="section-title">Compare two events</h2>
      <div className="flex flex-wrap items-center gap-2">
        {choose("A", "First event", a, (v) => onChange(v, b))}
        {choose("B", "Second event", b, (v) => onChange(a, v))}
        <button className="btn" disabled={!selectedId} onClick={() => onChange(selectedId, b)} title="Use the selected event as A">
          Selected → A
        </button>
        <button className="btn" disabled={!selectedId} onClick={() => onChange(a, selectedId)} title="Use the selected event as B">
          Selected → B
        </button>
        <button className="btn" disabled={!a && !b} onClick={() => onChange(b, a)}>
          Swap
        </button>
      </div>

      {!a || !b ? (
        <p className="mt-2.5 text-muted">
          Choose two events (or select one in the diagram and shift-click another) to see whether one happened before the other.
        </p>
      ) : result.error ? (
        <p className="mt-2 text-sm text-bad" role="alert">
          {result.error}
        </p>
      ) : !c ? (
        <p className="mt-2.5 text-muted">Asking the server…</p>
      ) : (
        <div aria-live="polite">
          <div className="my-2.5 flex flex-wrap items-center gap-2.5" data-testid="verdict">
            <span className={`badge ${BADGE[c.relation]}`}>{c.relation === "equal" ? "same" : c.relation}</span>
            <strong>{headline(c)}</strong>
          </div>
          <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 marker:text-muted">
            {c.proof.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          {c.path && c.path.length > 1 && (
            <p className="mt-2 font-mono">
              Causal chain: {c.path.join(" → ")} <span className="font-sans text-muted">(program order and messages)</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
