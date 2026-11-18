"use client";

import type { Comparison } from "@clocklens/events";
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

/** Pick two events; the server says how they relate and shows its proof. */
export function ComparePanel({ options, a, b, selectedId, onChange, result }: Props) {
  const c = result.data;
  return (
    <section className="panel">
      <h2>Compare two events</h2>
      <div className="row">
        <label className="row">
          <span className="label">A</span>
          <select aria-label="First event" value={a ?? ""} onChange={(e) => onChange(e.target.value || undefined, b)}>
            <option value="">choose…</option>
            {options.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="row">
          <span className="label">B</span>
          <select aria-label="Second event" value={b ?? ""} onChange={(e) => onChange(a, e.target.value || undefined)}>
            <option value="">choose…</option>
            {options.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!selectedId} onClick={() => onChange(selectedId, b)} title="Use the selected event as A">
          Selected → A
        </button>
        <button disabled={!selectedId} onClick={() => onChange(a, selectedId)} title="Use the selected event as B">
          Selected → B
        </button>
        <button disabled={!a && !b} onClick={() => onChange(b, a)}>
          Swap
        </button>
      </div>

      {!a || !b ? (
        <p className="muted" style={{ marginTop: 10 }}>
          Choose two events (or select one in the diagram and shift-click another) to see whether one happened before the other.
        </p>
      ) : result.error ? (
        <p className="error" role="alert">
          {result.error}
        </p>
      ) : !c ? (
        <p className="muted" style={{ marginTop: 10 }}>
          Asking the server…
        </p>
      ) : (
        <div aria-live="polite">
          <div className="verdict">
            <span className={`badge ${c.relation}`}>{c.relation === "equal" ? "same" : c.relation}</span>
            <strong>{headline(c)}</strong>
          </div>
          <ol className="proof">
            {c.proof.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          {c.path && c.path.length > 1 && (
            <p className="path">
              Causal chain: {c.path.join(" → ")} <span className="muted">(program order and messages)</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
