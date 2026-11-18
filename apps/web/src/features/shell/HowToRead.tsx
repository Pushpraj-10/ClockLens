/** A short, collapsed explanation of the picture. Open by default until the user has events to look at. */
export function HowToRead({ hasEvents }: { hasEvents: boolean }) {
  return (
    <details className="panel group py-3" open={!hasEvents}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
        <span>How to read this</span>
        <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 marker:text-muted">
        <li>
          Each <strong>node</strong> (P1, P2, …) is a computer running on its own. Use the controls on the left to make it do something or send a
          message to another node.
        </li>
        <li>
          Every action appears as a <strong>card</strong> on that node&apos;s row. Grey lines join a node&apos;s own steps in order; bold arrows are
          messages travelling between nodes.
        </li>
        <li>
          Click a card to see what <strong>happened before</strong> it, what <strong>happens after</strong> it, and what was{" "}
          <strong>independent</strong> of it (neither could have caused the other).
        </li>
      </ol>
    </details>
  );
}
