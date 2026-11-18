"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { EventInspector } from "../features/causality/EventInspector";
import { ComparePanel } from "../features/compare/ComparePanel";
import { LamportVsVector } from "../features/compare/LamportVsVector";
import { SpaceTimeDiagram } from "../features/diagram/SpaceTimeDiagram";
import { Explanation } from "../features/playback/Explanation";
import { PlaybackBar } from "../features/playback/PlaybackBar";
import { PlainSummary } from "../features/causality/PlainSummary";
import { ConnectionPill } from "../features/shell/ConnectionPill";
import { HowToRead } from "../features/shell/HowToRead";
import { ModeSwitch } from "../features/shell/ModeSwitch";
import { ThemeToggle } from "../features/shell/ThemeToggle";
import { useTheme } from "../lib/useTheme";
import { Sidebar } from "../features/shell/Sidebar";
import { StatTiles } from "../features/shell/StatTiles";
import { lamportNote } from "../lib/plain";
import { useViewMode } from "../lib/viewMode";
import { fetchComparison, fetchMisleading, fetchRelations } from "../lib/api";
import { explainEvent } from "../lib/explain";
import { computeLayout } from "../lib/layout";
import { initialPlayback, playbackReducer, position } from "../lib/playback";
import { processList } from "../lib/state";
import { useClockLens } from "../lib/useClockLens";
import { useRemote } from "../lib/useRemote";

export default function Home() {
  const state = useClockLens();
  const [mode, setMode] = useViewMode();
  const theme = useTheme();
  const advanced = mode === "advanced";
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
  const warning = useMemo(() => lamportNote(selected?.id, pairs), [selected?.id, pairs]);
  const options = useMemo(() => layout.order.slice(0, shown).map((e) => e.id), [layout.order, shown]);
  const held = useMemo(
    () => Object.values(state.statuses).reduce((n, s) => n + (s.pending?.length ?? 0), 0),
    [state.statuses],
  );

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
    <div className="mx-auto grid max-w-[1560px] grid-cols-1 items-start gap-6 p-4 lg:grid-cols-[272px_minmax(0,1fr)] lg:p-5">
      <Sidebar
        nodes={lanes}
        statuses={state.statuses}
        connected={state.connected}
        advanced={advanced}
        hasEvents={state.events.length > 0}
      />

      <main id="main" tabIndex={-1} className="flex min-w-0 flex-col gap-4 outline-none">
        <header className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
              {advanced ? "Lamport vs vector clocks" : "What caused what?"}
            </h1>
            <p className="text-muted">
              {advanced
                ? "Real nodes, real messages. Drive them from the left and watch causality unfold."
                : "Press a button on a node (left). Then click any card to see what happened before it, after it, and independently."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ModeSwitch mode={mode} onChange={setMode} />
            <ThemeToggle choice={theme.choice} onChange={theme.setChoice} />
            <div className="lg:hidden">
              <ConnectionPill connected={state.connected} />
            </div>
          </div>
        </header>

        {advanced ? (
          <StatTiles events={total} nodes={lanes.length} held={held} misleading={pairs.length} />
        ) : (
          <HowToRead hasEvents={state.events.length > 0} />
        )}

        <section className="panel">
          <h2 className="section-title">Space-time diagram</h2>
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
            showVectors={advanced}
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
          showSpeed={advanced}
        />

        {advanced ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 [&>div>section]:h-full">
            <div className="xl:col-span-5">
              <Explanation explanation={explanation} event={current} advanced />
            </div>
            <div className="xl:col-span-7">
              <EventInspector
                event={selected}
                lanes={layout.lanes}
                relations={relations.data}
                error={relations.error}
                visibleIds={visibleIds}
              />
            </div>
            <div className="xl:col-span-7">
              <ComparePanel
                options={options}
                a={a}
                b={b}
                selectedId={selected?.id}
                onChange={(na, nb) => setPair({ a: na, b: nb })}
                result={comparison}
              />
            </div>
            <div className="xl:col-span-5">
              <LamportVsVector pairs={pairs} error={misleading.error} onCompare={(pa, pb) => setPair({ a: pa, b: pb })} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>div>section]:h-full">
            <div>
              <Explanation explanation={explanation} event={current} advanced={false} />
            </div>
            <div>
              <PlainSummary
                event={selected}
                relations={relations.data}
                error={relations.error}
                visibleIds={visibleIds}
                lamportNote={warning}
                onShowAdvanced={() => setMode("advanced")}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
