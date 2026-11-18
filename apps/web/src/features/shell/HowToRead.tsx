interface Props {
  id: string;
  advanced: boolean;
  lanes: string[];
}

/** Short explanation of the diagram, shown inside the diagram card when "How to read" is open. */
export function HowToRead({ id, advanced, lanes }: Props) {
  return (
    <div id={id} className="mb-3 rounded-2xl border border-line bg-surface/60 px-4 py-3 text-sm">
      <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 marker:text-muted">
        <li>
          Each <strong>node</strong> ({lanes.length ? lanes.join(", ") : "P1, P2, …"}) is a computer running on its own. On the left,{" "}
          <strong>Local</strong> makes something happen inside a node and <strong>↗ P2</strong> sends a message to P2.
        </li>
        <li>
          Every action appears as a <strong>card</strong> on that node&apos;s row. Grey lines join a node&apos;s own steps; bold arrows are
          messages between nodes.
        </li>
        <li>
          Click a card to see what <strong>happened before</strong> it, what <strong>happens after</strong> it, and what was{" "}
          <strong>independent</strong> of it (neither could have caused the other).
        </li>
      </ol>
      <p className="mt-2 text-[13px] text-muted">
        {advanced && (
          <>
            <strong>L</strong> = Lamport clock, <code>[…]</code> = vector clock (order {lanes.join(", ")}).{" "}
          </>
        )}
        Sideways position only keeps arrows pointing forward — it is not time.
      </p>
    </div>
  );
}
