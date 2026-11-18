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
    <div>
      <p className="text-sm">
        A Lamport clock guarantees: if <code>x</code> happened before <code>y</code>, then <code>L(x) &lt; L(y)</code>. The
        reverse is not true. Vector clocks give both directions, so they can tell when two events were concurrent.
      </p>
      {error && (
        <p className="mt-2 text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      {pairs.length === 0 ? (
        <p className="mt-2 text-muted">
          No misleading pairs yet. Make two nodes do things without exchanging messages and Lamport will start ordering events that
          are really concurrent.
        </p>
      ) : (
        <>
          <p className="mt-3 rounded-r-xl border-l-4 border-warn bg-warn/10 py-2 pr-3 pl-3" role="status">
            <strong>{pairs.length}</strong> concurrent {pairs.length === 1 ? "pair looks" : "pairs look"} ordered by Lamport. Vector
            clocks show they are not.
          </p>
          <ul
            className="m-0 mt-3 flex max-h-[19rem] list-none flex-col overflow-y-auto overscroll-contain rounded-2xl border border-line p-0"
            aria-label="Pairs where Lamport misleads"
          >
            {pairs.map((p) => (
              <li
                key={`${p.a}|${p.b}`}
                className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 last:border-b-0 odd:bg-surface/50"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px]">
                  <span className="chip">
                    {p.a}
                    <span className="ml-1 text-muted">L{p.lamportA}</span>
                  </span>
                  <span className="text-muted" title="Lamport says before, but they are concurrent">
                    looks before
                  </span>
                  <span className="chip">
                    {p.b}
                    <span className="ml-1 text-muted">L{p.lamportB}</span>
                  </span>
                </span>
                <button
                  className="btn btn-sm flex-none"
                  onClick={() => onCompare(p.a, p.b)}
                  aria-label={`Compare ${p.a} with ${p.b}`}
                >
                  Compare
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Each pair is concurrent: neither event could have caused the other.</p>
        </>
      )}
    </div>
  );
}
