"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { ControlPanel } from "../features/controls/ControlPanel";
import { EventInspector } from "../features/causality/EventInspector";
import { SpaceTimeDiagram } from "../features/diagram/SpaceTimeDiagram";
import { Explanation } from "../features/playback/Explanation";
import { PlaybackBar } from "../features/playback/PlaybackBar";
import { ComparePanel } from "../features/compare/ComparePanel";
import { LamportVsVector } from "../features/compare/LamportVsVector";
import { fetchComparison, fetchMisleading, fetchRelations } from "../lib/api";
import { useRemote } from "../lib/useRemote";
import { explainEvent } from "../lib/explain";
import { computeLayout } from "../lib/layout";
import { initialPlayback, playbackReducer, position } from "../lib/playback";
import { processList } from "../lib/state";
import { useClockLens } from "../lib/useClockLens";

export default function Home() {
  const state = useClockLens();
  const lanes = useMemo(() => processList(state), [state]);
  const layout = useMemo(() => computeLayout(state.events, lanes), [state.events, lanes]);
  const total = layout.order.length;

  const [pb, dispatch] = useReducer(playbackReducer, initialPlayback);
  const shown = position(pb, total);

  useEffect(() => {
    dispatch({ type: "total", total });
  }, [total]);

  useEffect(() => {
    if (!pb.playing) return;
    const timer = setInterval(() => dispatch({ type: "tick", total }), 1000 / pb.speed);
    return () => clearInterval(timer);
  }, [pb.playing, pb.speed, total]);

  const [selectedId, setSelectedId] = useState<string>();
  const [pair, setPair] = useState<{ a?: string; b?: string }>({});
  const current = shown > 0 ? layout.order[shown - 1] : undefined;
  const visibleIds = useMemo(() => new Set(layout.order.slice(0, shown).map((e) => e.id)), [layout.order, shown]);
  const selected = layout.order.slice(0, shown).find((e) => e.id === selectedId);

  // Events arriving (or a new run / import) change what the server would answer.
  const version = `${state.events.length}:${state.events[state.events.length - 1]?.id ?? ""}`;

  const relations = useRemote(selected?.id, version, () => fetchRelations(selected!.id));

  // A pair only counts while both events are still visible at this playback position.
  const a = pair.a && visibleIds.has(pair.a) ? pair.a : undefined;
  const b = pair.b && visibleIds.has(pair.b) ? pair.b : undefined;
  const comparison = useRemote(a && b ? `${a}|${b}` : undefined, version, () => fetchComparison(a!, b!));

  const misleading = useRemote("all", version, fetchMisleading);
  const pairs = useMemo(
    () => (misleading.data ?? []).filter((p) => visibleIds.has(p.a) && visibleIds.has(p.b)),
    [misleading.data, visibleIds],
  );
  const options = useMemo(() => layout.order.slice(0, shown).map((e) => e.id), [layout.order, shown]);

  const explanation = useMemo(() => {
    if (!current) return undefined;
    return explainEvent(current, {
      lanes: layout.lanes,
      prev: state.events.find((e) => e.process === current.process && e.seq === current.seq - 1),
      send:
        current.kind === "receive"
          ? state.events.find((e) => e.kind === "send" && e.msgId === current.msgId)
          : undefined,
    });
  }, [current, layout.lanes, state.events]);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>ClockLens</h1>
          <p className="muted">Lamport and vector clocks on real, running nodes.</p>
        </div>
        <span className={state.connected ? "pill ok" : "pill bad"} role="status">
          {state.connected ? "Connected" : "Disconnected — retrying…"}
        </span>
      </header>

      <main className="grid">
        <aside>
          <ControlPanel nodes={lanes} statuses={state.statuses} connected={state.connected} />
        </aside>

        <div className="main-col">
          <section className="panel">
            <h2>Space-time diagram</h2>
            <SpaceTimeDiagram
              layout={layout}
              visible={shown}
              selectedId={selected?.id}
              onSelect={setSelectedId}
              onPickSecond={(id) => setPair({ a: selected?.id ?? pair.a, b: id })}
              relations={relations.data}
              compareA={a}
              compareB={b}
              follow={pb.live}
            />
          </section>

          <PlaybackBar
            position={shown}
            total={total}
            playing={pb.playing}
            live={pb.live}
            speed={pb.speed}
            onPlay={() => dispatch({ type: "play", total })}
            onPause={() => dispatch({ type: "pause" })}
            onStep={(delta) => dispatch({ type: "step", delta, total })}
            onSeek={(to) => dispatch({ type: "seek", to, total })}
            onRestart={() => dispatch({ type: "restart", total })}
            onLive={() => dispatch({ type: "live" })}
            onSpeed={(speed) => dispatch({ type: "speed", speed })}
          />

          <div className="two-col">
            <Explanation explanation={explanation} />
            <EventInspector
              event={selected}
              lanes={layout.lanes}
              relations={relations.data}
              error={relations.error}
              visibleIds={visibleIds}
            />
          </div>

          <ComparePanel
            options={options}
            a={a}
            b={b}
            selectedId={selected?.id}
            onChange={(na, nb) => setPair({ a: na, b: nb })}
            result={comparison}
          />

          <LamportVsVector pairs={pairs} error={misleading.error} onCompare={(pa, pb) => setPair({ a: pa, b: pb })} />
        </div>
      </main>
    </div>
  );
}
