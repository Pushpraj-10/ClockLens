"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ClockEvent, Relations } from "@clocklens/events";
import { laneColor } from "../../lib/colors";
import { formatVector } from "../../lib/explain";
import type { Layout } from "../../lib/layout";

// Node-graph geometry: every event is a card with an input port (left) and an output port (right).
const CARD_W = 164;
const CARD_H_FULL = 70;
const CARD_H_COMPACT = 50;
const BAND_H = 42;
const COL_W = 212;
const LANE_H = 128;
const LEFT = 28;
const TOP = 14;
const PORT_R = 5;

interface Props {
  layout: Layout;
  /** How many events (in playback order) are shown. */
  visible: number;
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  /** Shift-click: use this event as the second event of the pairwise comparison. */
  onPickSecond?: (id: string) => void;
  /** Server-computed relations of the selected event; drives the highlighting. */
  relations?: Relations;
  /** Events currently chosen in the comparison panel. */
  compareA?: string;
  compareB?: string;
  /** Keep the newest event in view. */
  follow: boolean;
  /** Advanced view: print the vector clock on every card. */
  showVectors: boolean;
}

type Rel = "past" | "future" | "concurrent";

const REL_TEXT: Record<Rel, string> = {
  past: "happened before the selected event",
  future: "happens after the selected event",
  concurrent: "independent of the selected event (concurrent)",
};

// Card outline: shape (solid / dashed / dotted) as well as color tells the groups apart.
const CARD_STROKE: Record<Rel | "plain", string> = {
  plain: "stroke-line stroke-[1.5]",
  past: "stroke-ok stroke-[2.5]",
  future: "stroke-info stroke-[2.5] [stroke-dasharray:7_4]",
  concurrent: "stroke-warn stroke-[2.5] [stroke-dasharray:2_4] [stroke-linecap:round]",
};

/** Smooth horizontal-tangent curve between two ports, like a workflow connection. */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(48, (x2 - x1) * 0.5);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

const GLYPH: Record<ClockEvent["kind"], string> = {
  local: "M-3,0 a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0", // dot
  send: "M-4,4 L4,-4 M-1,-4 L4,-4 L4,1", // arrow up-right
  receive: "M4,-4 L-4,4 M1,4 L-4,4 L-4,-1", // arrow down-left
};

export function SpaceTimeDiagram({
  layout,
  visible,
  selectedId,
  onSelect,
  onPickSecond,
  relations,
  compareA,
  compareB,
  follow,
  showVectors,
}: Props) {
  const { lanes, order, column, columns, messages } = layout;
  const CARD_H = showVectors ? CARD_H_FULL : CARD_H_COMPACT;
  // the header band is the whole card in the simple view, the top part when the vector row is shown
  const bandH = showVectors ? BAND_H : CARD_H;
  const shown = useMemo(() => new Set(order.slice(0, visible).map((e) => e.id)), [order, visible]);
  const current = visible > 0 ? order[visible - 1] : undefined;
  const scroller = useRef<HTMLDivElement>(null);

  const relOf = useMemo(() => {
    const m = new Map<string, Rel>();
    if (relations && relations.id === selectedId) {
      relations.past.forEach((id) => m.set(id, "past"));
      relations.future.forEach((id) => m.set(id, "future"));
      relations.concurrent.forEach((id) => m.set(id, "concurrent"));
    }
    return m;
  }, [relations, selectedId]);

  // Consecutive events of one process are connected too (program order).
  const lanesEvents = useMemo(
    () => lanes.map((p) => order.filter((e) => e.process === p).sort((a, b) => a.seq - b.seq)),
    [lanes, order],
  );

  const laneIndex = (p: string) => lanes.indexOf(p);
  const cardX = (e: ClockEvent) => LEFT + (column[e.id] ?? 0) * COL_W;
  const midY = (e: ClockEvent) => TOP + laneIndex(e.process) * LANE_H + LANE_H / 2;
  const out = (e: ClockEvent) => ({ x: cardX(e) + CARD_W, y: midY(e) });
  const inn = (e: ClockEvent) => ({ x: cardX(e), y: midY(e) });

  // content width only; min-w-full on the svg stretches it to the window when there is little to draw
  const width = LEFT + columns * COL_W + 24;
  const height = TOP + Math.max(lanes.length, 1) * LANE_H + 6;

  useEffect(() => {
    if (follow && scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [follow, visible]);

  if (lanes.length === 0) {
    return <div className="px-4 py-8 text-center text-muted">Waiting for nodes to connect…</div>;
  }

  return (
    <div>
      <div className="relative flex overflow-hidden rounded-2xl border border-line bg-surface/40">
        {/* Lane labels stay put while the canvas scrolls sideways. */}
        <div className="relative z-10 flex-none border-r border-line bg-panel/80 backdrop-blur-sm" style={{ width: 76, height }}>
          {lanes.map((p, i) => (
            <div
              key={p}
              className="absolute inset-x-0 flex items-center justify-center"
              style={{ top: TOP + i * LANE_H, height: LANE_H }}
            >
              <span
                className="rounded-full px-3 py-1 text-sm font-bold text-dot-ink"
                style={{ background: laneColor(i) }}
              >
                {p}
              </span>
            </div>
          ))}
        </div>

        <div className="relative min-w-0 flex-1 overflow-x-auto" ref={scroller}>
          {/* select-none: shift-click (compare) would otherwise range-select the labels */}
          {/* min-w-full: the canvas always fills the window; it only grows (and scrolls) when events need more room */}
          <svg className="block min-w-full select-none" width={width} height={height} role="img" aria-label="Space-time diagram of events">
            <defs>
              <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.2" className="fill-muted/30" />
              </pattern>
              {/* userSpaceOnUse keeps the heads small and the same size whatever the line width */}
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0,0.5 L10,5 L0,9.5 L2.6,5 z" className="fill-primary" />
              </marker>
              <marker id="arrow-order" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M0,0.5 L10,5 L0,9.5 L2.6,5 z" className="fill-muted/70" />
              </marker>
            </defs>

            {/* canvas: dotted grid and one soft band per lane */}
            <rect x={0} y={0} width="100%" height={height} fill="url(#dots)" />
            {lanes.map((p, i) => (
              <g key={p}>
                {i % 2 === 0 && <rect x={0} y={TOP + i * LANE_H} width="100%" height={LANE_H} className="fill-band" />}
              </g>
            ))}

            {/* program order: previous event of the same node -> next */}
            {lanesEvents.map((evs) =>
              evs.slice(1).map((e, k) => {
                const prev = evs[k];
                if (!prev || !shown.has(e.id) || !shown.has(prev.id)) return null;
                const a = out(prev);
                const b = inn(e);
                return (
                  <path
                    key={`${prev.id}>${e.id}`}
                    d={curve(a.x + PORT_R, a.y, b.x - PORT_R - 2, b.y)}
                    className="fill-none stroke-muted/45 stroke-[1.75]"
                    markerEnd="url(#arrow-order)"
                  />
                );
              }),
            )}

            {/* messages */}
            {messages.map((m) => {
              if (!shown.has(m.send.id)) return null;
              const a = out(m.send);
              if (!m.receive) {
                // Sent but never received (still in flight, held, or lost).
                return (
                  <g key={m.msgId} data-message="open">
                    <title>{`${m.msgId}: not received (in flight, held, or lost)`}</title>
                    <path
                      d={`M${a.x + PORT_R},${a.y} L${a.x + 28},${a.y}`}
                      className="fill-none stroke-primary/70 stroke-[2.5] [stroke-dasharray:3_4] [stroke-linecap:round]"
                    />
                    <circle cx={a.x + 36} cy={a.y} r={6} className="fill-panel stroke-primary/70 stroke-2" />
                    <path d={`M${a.x + 33.5},${a.y - 2.5} l5,5 m0,-5 l-5,5`} className="fill-none stroke-primary/70 stroke-[1.5] [stroke-linecap:round]" />
                  </g>
                );
              }
              if (!shown.has(m.receive.id)) return null;
              const b = inn(m.receive);
              const d = curve(a.x + PORT_R, a.y, b.x - PORT_R - 3, b.y);
              return (
                <g key={m.msgId} data-message="delivered">
                  <title>{`${m.msgId}: ${m.send.process} → ${m.receive.process}`}</title>
                  {/* soft glow under the line so messages read as the important links */}
                  <path d={d} className="fill-none stroke-primary/15 stroke-[9] [stroke-linecap:round]" />
                  <path d={d} className="fill-none stroke-primary stroke-[2.5] [stroke-linecap:round]" markerEnd="url(#arrow)" />
                </g>
              );
            })}

            {/* event cards */}
            {order.map((e) => {
              if (!shown.has(e.id)) return null;
              const x = cardX(e);
              const y = midY(e) - CARD_H / 2;
              const color = laneColor(laneIndex(e.process));
              const isSelected = e.id === selectedId;
              const isCurrent = e.id === current?.id;
              const rel = relOf.get(e.id);
              const base = `${e.process} ${e.kind}${e.msgId ? " " + e.msgId : ""}, Lamport ${e.lamport}, vector ${formatVector(e.vector, lanes)}`;
              const label = rel ? `${base}; ${REL_TEXT[rel]}` : base;
              const mark = e.id === compareA ? "A" : e.id === compareB ? "B" : undefined;
              const sub = e.kind === "send" ? `to ${e.peer}` : e.kind === "receive" ? `from ${e.peer}` : "local event";
              const clipId = `clip-${e.id.replace(/\W/g, "_")}`;
              return (
                <g
                  key={e.id}
                  data-event={e.id}
                  data-kind={e.kind}
                  data-relation={rel}
                  className="group cursor-pointer outline-none"
                  tabIndex={0}
                  role="button"
                  aria-label={label}
                  aria-pressed={isSelected}
                  onClick={(ev) => {
                    if (ev.shiftKey && onPickSecond) onPickSecond(e.id);
                    else onSelect(isSelected ? undefined : e.id);
                  }}
                  onKeyDown={(k) => {
                    if (k.key === "Enter" || k.key === " ") {
                      k.preventDefault();
                      if (k.shiftKey && onPickSecond) onPickSecond(e.id);
                      else onSelect(isSelected ? undefined : e.id);
                    }
                  }}
                >
                  <title>{label}</title>

                  {/* hover / keyboard-focus halo */}
                  <rect
                    x={x - 6}
                    y={y - 6}
                    width={CARD_W + 12}
                    height={CARD_H + 12}
                    rx={20}
                    className="fill-none stroke-primary stroke-2 opacity-0 transition-opacity group-hover:opacity-50 group-focus-visible:opacity-100 motion-reduce:transition-none"
                  />
                  {isCurrent && (
                    <rect
                      x={x - 5}
                      y={y - 5}
                      width={CARD_W + 10}
                      height={CARD_H + 10}
                      rx={19}
                      className="fill-none stroke-accent stroke-[3] opacity-90 drop-shadow-[0_0_8px_var(--accent)] motion-safe:animate-ring"
                    />
                  )}
                  {isSelected && (
                    <rect x={x - 3} y={y - 3} width={CARD_W + 6} height={CARD_H + 6} rx={17} className="fill-none stroke-ink stroke-[2.5]" />
                  )}

                  {/* card body: header band (tinted with the node's colour) + optional vector row */}
                  <clipPath id={clipId}>
                    <rect x={x} y={y} width={CARD_W} height={CARD_H} rx={14} />
                  </clipPath>
                  <rect x={x} y={y} width={CARD_W} height={CARD_H} rx={14} className="fill-panel" />
                  <g clipPath={`url(#${clipId})`}>
                    <rect x={x} y={y} width={CARD_W} height={bandH} fill={color} fillOpacity={0.13} />
                    {showVectors && <rect x={x} y={y + bandH} width={CARD_W} height={CARD_H - bandH} className="fill-surface/60" />}
                    {showVectors && <line x1={x} x2={x + CARD_W} y1={y + bandH} y2={y + bandH} className="stroke-line stroke-1" />}
                  </g>
                  <rect x={x} y={y} width={CARD_W} height={CARD_H} rx={14} className={`fill-none ${CARD_STROKE[rel ?? "plain"]}`} />

                  {/* kind icon */}
                  <circle cx={x + 27} cy={y + bandH / 2} r={12.5} fill={color} />
                  <path
                    transform={`translate(${x + 27} ${y + bandH / 2})`}
                    d={GLYPH[e.kind]}
                    fill={e.kind === "local" ? "var(--dot-text)" : "none"}
                    stroke="var(--dot-text)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  <text x={x + 48} y={y + bandH / 2 - 2} className="pointer-events-none fill-ink text-[12.5px] font-semibold">
                    {e.process} {e.kind}
                  </text>
                  <text x={x + 48} y={y + bandH / 2 + 11} className="pointer-events-none fill-muted text-[10.5px]">
                    {sub}
                  </text>

                  {/* Lamport badge */}
                  <rect x={x + CARD_W - 42} y={y + bandH / 2 - 10} width={32} height={20} rx={10} className="fill-panel stroke-line stroke-1" />
                  <text
                    x={x + CARD_W - 26}
                    y={y + bandH / 2 + 4}
                    textAnchor="middle"
                    className="pointer-events-none fill-ink font-mono text-[11px] font-bold"
                  >
                    L{e.lamport}
                  </text>

                  {/* vector clock (advanced view) */}
                  {showVectors && (
                    <text x={x + 14} y={y + bandH + 17} className="pointer-events-none fill-muted font-mono text-[11px]">
                      {formatVector(e.vector, lanes)}
                    </text>
                  )}

                  {mark && (
                    <g className="pointer-events-none">
                      <rect x={x + CARD_W - 20} y={y - 10} width={24} height={20} rx={10} className="fill-primary" />
                      <text x={x + CARD_W - 8} y={y + 4} textAnchor="middle" className="fill-primary-ink text-[12px] font-bold">
                        {mark}
                      </text>
                    </g>
                  )}

                  {/* ports */}
                  <circle cx={x} cy={midY(e)} r={PORT_R} className="fill-panel stroke-2" stroke={color} />
                  <circle cx={x + CARD_W} cy={midY(e)} r={PORT_R} className="fill-panel stroke-2" stroke={color} />
                </g>
              );
            })}
          </svg>
          {visible === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-muted">
              Nothing has happened yet. Press Local event or a Send button on a node to begin.
            </div>
          )}
        </div>
      </div>

      {selectedId && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted" aria-label="Highlight key">
          <span className="swatch swatch-past" /> before the selected event <span className="swatch swatch-future" /> after it{" "}
          <span className="swatch swatch-concurrent" /> independent of it (neither could have caused the other).
          {showVectors && " Shift-click another event to compare it with the selected one."}
        </p>
      )}
      {showVectors ? (
        <p className="mt-2 text-[13px] text-muted">
          <strong>L</strong> = Lamport clock. <code>[…]</code> = vector clock (order {lanes.join(", ")}). Grey links follow a node&apos;s own
          order; bold links are messages. Horizontal position keeps links pointing forward — it is not time.
        </p>
      ) : (
        <p className="mt-2 text-[13px] text-muted">
          Each card is something that happened on a node. Grey lines follow a node&apos;s own steps; bold arrows are messages. Sideways
          position just keeps arrows pointing forward — it is not time.
        </p>
      )}
    </div>
  );
}
