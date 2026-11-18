"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { EventInspector } from "../features/causality/EventInspector";
import { ComparePanel } from "../features/compare/ComparePanel";
import { LamportVsVector } from "../features/compare/LamportVsVector";
import { SpaceTimeDiagram } from "../features/diagram/SpaceTimeDiagram";
import { Explanation } from "../features/playback/Explanation";
import { PlaybackBar } from "../features/playback/PlaybackBar";
import { PlainSummary } from "../features/causality/PlainSummary";
import { HowToRead } from "../features/shell/HowToRead";
import { ModeSwitch } from "../features/shell/ModeSwitch";
import { TabbedPanel } from "../features/shell/Tabs";
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

type DetailTab = "selected" | "compare" | "lamport";

export default function Home() {
  const state = useClockLens();
  const [mode, setMode] = useViewMode();
  const theme = useTheme();
  const advanced = mode === "advanced";
  const lanes = useMemo(() => processList(state), [state]);
  const layout = useMemo(() => computeLayout(state.events, lanes), [state.events, lanes]);
  const total = layout.order.length;
  const hasEvents = state.events.length > 0;

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

  // "How to read" is open until there is something to look at, unless the user toggled it.
  const [help, setHelp] = useState<boolean>();
  const helpOpen = help ?? !hasEvents;
  const [tab, setTab] = useState<DetailTab>("selected");

  const [selectedId, setSelectedId] = useState<string>();
  const [pair, setPair] = useState<{ a?: string; b?: string }>({});
  const current = shown > 0 ? layout.order[shown - 1] : undefined;
  const visibleIds = useMemo(() => new Set(layout.order.slice(0, shown).map((e) => e.id)), [layout.order, shown]);
  const selected = layout.order.slice(0, shown).find((e) => e.id === selectedId);

  const select = (id: string | undefined) => {
    setSelectedId(id);
    if (id) setTab("selected");
  };
  const compare = (na: string | undefined, nb: string | undefined) => {
    setPair({ a: na, b: nb });
    setTab("compare");
  };

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
    <div className="mx-auto grid max-w-[1560px] grid-cols-1 items-start gap-5 p-4 lg:grid-cols-[248px_minmax(0,1fr)]">
      <Sidebar
        nodes={lanes}
        statuses={state.statuses}
        connected={state.connected}
        advanced={advanced}
        hasEvents={hasEvents}
        brandAction={<ThemeToggle choice={theme.choice} onChange={theme.setChoice} />}
      />

      <main id="main" tabIndex={-1} className="flex min-w-0 flex-col gap-3 outline-none">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
          <div className="min-w-0">
            <h1 className="text-xl leading-tight font-semibold tracking-tight text-balance">
              {advanced ? "Lamport vs vector clocks" : "What caused what?"}
            </h1>
            <p className="text-sm text-muted">
              {advanced
                ? "Real nodes, real messages. Drive them from the left and watch causality unfold."
                : "Make nodes act on the left, then click any card to see what happened before, after, and independently."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ModeSwitch mode={mode} onChange={setMode} />
          </div>
        </header>

        <section className="panel p-4" aria-labelledby="diagram-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="diagram-title" className="section-title mb-0">
              Space-time diagram
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {advanced && <StatTiles events={total} nodes={lanes.length} held={held} misleading={pairs.length} />}
              <button
                type="button"
                className={`btn btn-sm gap-1.5 ${helpOpen ? "border-primary" : ""}`}
                aria-expanded={helpOpen}
                aria-controls="how-to-read"
                onClick={() => setHelp(!helpOpen)}
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17h.01" strokeLinecap="round" />
                </svg>
                How to read
              </button>
            </div>
          </div>
          {helpOpen && <HowToRead id="how-to-read" advanced={advanced} lanes={lanes} />}
          <SpaceTimeDiagram
            layout={layout}
            visible={shown}
            selectedId={selected?.id}
            onSelect={select}
            onPickSecond={(id) => compare(selected?.id ?? pair.a, id)}
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
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] [&>*]:min-h-[15rem]">
            <Explanation explanation={explanation} event={current} advanced />
            <TabbedPanel<DetailTab>
              label="Event details"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "selected", label: "Selected event" },
                { id: "compare", label: "Compare" },
                { id: "lamport", label: "Lamport vs vector", badge: pairs.length, warn: true },
              ]}
            >
              {tab === "selected" ? (
                <EventInspector
                  event={selected}
                  lanes={layout.lanes}
                  relations={relations.data}
                  error={relations.error}
                  visibleIds={visibleIds}
                />
              ) : tab === "compare" ? (
                <ComparePanel
                  options={options}
                  a={a}
                  b={b}
                  selectedId={selected?.id}
                  onChange={(na, nb) => setPair({ a: na, b: nb })}
                  result={comparison}
                />
              ) : (
                <LamportVsVector pairs={pairs} error={misleading.error} onCompare={compare} />
              )}
            </TabbedPanel>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Explanation explanation={explanation} event={current} advanced={false} />
            <PlainSummary
              event={selected}
              relations={relations.data}
              error={relations.error}
              visibleIds={visibleIds}
              lamportNote={warning}
              onShowAdvanced={() => setMode("advanced")}
            />
          </div>
        )}
      </main>
    </div>
  );
}
