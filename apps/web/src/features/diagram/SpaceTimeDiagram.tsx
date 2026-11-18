"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ClockEvent, Relations } from "@clocklens/events";
import { laneColor } from "../../lib/colors";
import { formatVector } from "../../lib/explain";
import type { Layout } from "../../lib/layout";

const LANE_H = 100;
const COL_W = 88;
const LEFT = 88;
const TOP = 28;
const R = 16;

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
}

type Rel = "past" | "future" | "concurrent";

const REL_TEXT: Record<Rel, string> = {
  past: "happened before the selected event",
  future: "happens after the selected event",
  concurrent: "concurrent with the selected event",
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
}: Props) {
  const { lanes, order, column, columns, messages } = layout;
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

  const laneIndex = (p: string) => lanes.indexOf(p);
  const x = (e: ClockEvent) => LEFT + (column[e.id] ?? 0) * COL_W + COL_W / 2;
  const y = (e: ClockEvent) => TOP + laneIndex(e.process) * LANE_H + LANE_H / 2;

  const width = LEFT + Math.max(columns, 3) * COL_W + 24;
  const height = TOP + Math.max(lanes.length, 1) * LANE_H + 8;

  useEffect(() => {
    if (follow && scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [follow, visible]);

  if (lanes.length === 0) {
    return <div className="empty">Waiting for nodes to connect…</div>;
  }

  return (
    <div className="diagram">
      <div className="diagram-scroll" ref={scroller}>
        <svg width={width} height={height} role="img" aria-label="Space-time diagram of events">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="arrowhead" />
            </marker>
          </defs>

          {lanes.map((p, i) => {
            const cy = TOP + i * LANE_H + LANE_H / 2;
            return (
              <g key={p}>
                <line x1={LEFT - 8} x2={width - 12} y1={cy} y2={cy} className="lane" />
                <text x={16} y={cy + 5} className="lane-label" fill={laneColor(i)}>
                  {p}
                </text>
              </g>
            );
          })}

          {messages.map((m) => {
            if (!shown.has(m.send.id)) return null;
            const x1 = x(m.send);
            const y1 = y(m.send);
            if (!m.receive) {
              // Sent but never received (still in flight, held, or lost).
              return (
                <line key={m.msgId} x1={x1 + R} y1={y1} x2={x1 + R + 36} y2={y1 + 0.001} className="msg msg-open" markerEnd="url(#arrow)">
                  <title>{`${m.msgId}: not received (in flight, held, or lost)`}</title>
                </line>
              );
            }
            if (!shown.has(m.receive.id)) return null;
            const x2 = x(m.receive);
            const y2 = y(m.receive);
            const len = Math.hypot(x2 - x1, y2 - y1) || 1;
            const ux = (x2 - x1) / len;
            const uy = (y2 - y1) / len;
            return (
              <line
                key={m.msgId}
                x1={x1 + ux * R}
                y1={y1 + uy * R}
                x2={x2 - ux * (R + 2)}
                y2={y2 - uy * (R + 2)}
                className="msg"
                markerEnd="url(#arrow)"
              >
                <title>{`${m.msgId}: ${m.send.process} → ${m.receive.process}`}</title>
              </line>
            );
          })}

          {order.map((e) => {
            if (!shown.has(e.id)) return null;
            const cx = x(e);
            const cy = y(e);
            const isSelected = e.id === selectedId;
            const isCurrent = e.id === current?.id;
            const rel = relOf.get(e.id);
            const base = `${e.process} ${e.kind}${e.msgId ? " " + e.msgId : ""}, Lamport ${e.lamport}, vector ${formatVector(e.vector, lanes)}`;
            const label = rel ? `${base}; ${REL_TEXT[rel]}` : base;
            const mark = e.id === compareA ? "A" : e.id === compareB ? "B" : undefined;
            return (
              <g
                key={e.id}
                className={`event ${e.kind}${rel ? " rel-" + rel : ""}`}
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
                {mark && (
                  <text x={cx} y={cy - R - 8} className="mark">
                    {mark}
                  </text>
                )}
                {isCurrent && <circle cx={cx} cy={cy} r={R + 6} className="ring current" />}
                {isSelected && <circle cx={cx} cy={cy} r={R + 3} className="ring selected" />}
                <circle cx={cx} cy={cy} r={R} fill={laneColor(laneIndex(e.process))} className="dot" />
                <text x={cx} y={cy + 5} className="lamport">
                  {e.lamport}
                </text>
                <text x={cx} y={cy + R + 16} className="vector">
                  {formatVector(e.vector, lanes)}
                </text>
              </g>
            );
          })}
        </svg>
        {visible === 0 && (
          <div className="empty overlay">No events yet. Use the controls to create a local event or send a message.</div>
        )}
      </div>
      {selectedId && (
        <p className="legend key" aria-label="Highlight key">
          <span className="swatch past" /> before the selected event <span className="swatch future" /> after it{" "}
          <span className="swatch concurrent" /> concurrent with it (no chain of messages either way). Shift-click another event
          to compare it with the selected one.
        </p>
      )}
      <p className="legend">
        Number in a dot = <strong>Lamport clock</strong>. <code>[…]</code> under a dot = <strong>vector clock</strong> (order{" "}
        {lanes.join(", ")}). Horizontal position is a drawing aid that keeps arrows pointing forward — it is not time.
      </p>
    </div>
  );
}
