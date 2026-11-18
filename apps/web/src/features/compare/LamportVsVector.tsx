"use client";

import type { Misleading } from "@clocklens/events";

interface Props {
  /** Concurrent pairs with different Lamport values (already limited to visible events). */
  pairs: Misleading[];
  error?: string;
  onCompare: (a: string, b: string) => void;
}

/** Where the Lamport clock tells a story the vector clock proves false. */
export function LamportVsVector({ pairs, error, onCompare }: Props) {
  return (
    <section className="panel">
      <h2>Lamport vs vector</h2>
      <p>
        A Lamport clock guarantees: if <code>x</code> happened before <code>y</code>, then <code>L(x) &lt; L(y)</code>. The
        reverse is not true. Vector clocks give both directions, so they can tell when two events were concurrent.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {pairs.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>
          No misleading pairs yet. Make two nodes do things without exchanging messages and Lamport will start ordering events that
          are really concurrent.
        </p>
      ) : (
        <>
          <p className="callout" role="status">
            <strong>{pairs.length}</strong> concurrent {pairs.length === 1 ? "pair looks" : "pairs look"} ordered by Lamport. Vector
            clocks show they are not.
          </p>
          <ul className="pair-list" aria-label="Pairs where Lamport misleads">
            {pairs.map((p) => (
              <li key={`${p.a}|${p.b}`}>
                <span>
                  <code>
                    {p.a} (L={p.lamportA})
                  </code>{" "}
                  looks before{" "}
                  <code>
                    {p.b} (L={p.lamportB})
                  </code>
                  , but they are concurrent
                </span>
                <button onClick={() => onCompare(p.a, p.b)}>Compare</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
