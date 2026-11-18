# Architecture

ClockLens is a small distributed system built to be looked at. A web UI drives a central
server; the server drives a set of independent node processes; the nodes exchange real
messages and keep real clocks. There are no scripts, presets or simulators — every event
on screen was produced by a node.

- [Components](#components)
- [Message flow](#message-flow)
- [Ordering rules](#ordering-rules)
- [Run lifecycle](#run-lifecycle)
- [The central server](#the-central-server)
- [The node](#the-node)
- [The web app](#the-web-app)
- [Package dependencies](#package-dependencies)
- [Testing strategy](#testing-strategy)
- [Design decisions and limitations](#design-decisions-and-limitations)

## Components

| Component | Language | Role |
|---|---|---|
| **Web app** (`apps/web`) | TypeScript, Next.js | Control panel and diagram. Sends commands, draws events. Runs no clock or causality logic. |
| **Central server** (`go/cmd/server`) | Go | HTTP/WebSocket API, run manager, orchestrator, event hub, in-memory store, causality service. |
| **Nodes** (`go/cmd/node`) | Go | One process each. Own their Lamport and vector clocks and exchange messages. |
| **NATS** | — | Core publish/subscribe transport between the server and nodes and between nodes. No JetStream. |

```
┌───────────────────────────────────────────────┐
│             Web UI (Next.js + TS)             │
│ controls · diagram · playback · compare ·     │
│ Lamport vs vector · import / export           │
└───────┬───────────────────────────────▲───────┘
        │ REST (commands, queries)      │ WebSocket (snapshot, events, status)
        ▼                               │
┌─────────────────────────────────────────────────────────────────┐
│                      CENTRAL SERVER (Go)                        │
│                                                                 │
│  API (REST + WS) ──▶ Run manager   (new run, resync on startup) │
│     │                    │                                      │
│     │            ┌───────▼────────┐        ┌──────────────────┐ │
│     │            │  Orchestrator  │        │    Event hub     │ │
│     │            │ UI command →   │        │ validate, dedup, │ │
│     │            │ node.<id>.ctl  │        │ fan out. Never   │ │
│     │            │ tracks nodes   │        │ orders by arrival│ │
│     ▼            └───────┬────────┘        └────┬──────┬──────┘ │
│  Causality               │                      │      │        │
│  service                 │                      │   Store       │
│  (past / future /        │                      │   (in memory, │
│   concurrent / proof)    │                      │    by event id)│
└──────────────────────────┼──────────────────────┼───────────────┘
                           │ NATS client          │
                           ▼                      ▼
                   ┌──────────────────────────────────────┐
                   │          NATS (core pub/sub)         │
                   └───┬──────────────┬──────────────┬────┘
        node.P1.inbox  │              │              │  node.P3.inbox
        node.P1.ctl    │              │              │  node.P3.ctl
                    ┌──▼──┐        ┌──▼──┐        ┌──▼──┐
                    │ P1  │        │ P2  │        │ P3  │
                    └─────┘        └─────┘        └─────┘
         each node: Lamport clock, vector clock, delivery mode,
                    held messages, partition set
```

### NATS subjects

The subjects and payloads in `go/pkg/protocol` are the **only coupling** between the server
and the nodes.

| Subject | Direction | Payload |
|---|---|---|
| `node.<id>.inbox` | node → node | `AppMessage` `{msgId, from, to, lamport, vector}` |
| `node.<id>.ctl` | server → node | `Command` (see below) |
| `events.<id>` | node → server | `ClockEvent` (validated against `contracts/event.schema.json`) |
| `status.<id>` | node → server | `Status`: delivery mode, partition set, held (pending) messages |
| `nodes.hello` | node → server | `Hello` `{id, started}` — a node announces itself |
| `nodes.discover` | server → all nodes | Asks every running node to announce itself again |

Commands on `ctl`: `local`, `send {to}`, `deliver {msgId}`, `drop {msgId}`,
`set_mode {auto|manual}`, `set_partition {peers}`, `reset`, `stop`.

## Message flow

1. **Local event.** The UI posts `local` to the server. The orchestrator publishes it on
   `node.<id>.ctl`. The node ticks both clocks and publishes a `ClockEvent` on `events.<id>`.
2. **Send.** The sending node ticks its clocks, publishes a `send` event, and puts an
   `AppMessage` — stamped with the sender's Lamport value and vector — on the target's inbox.
3. **Delivery.**
   - In **auto** mode the target delivers immediately: it merges the stamps into its clocks,
     ticks, and publishes a `receive` event.
   - In **manual** mode the target holds the message and reports it in its `status`. The user
     later chooses **deliver** (the receive happens now) or **drop** (it never does).
     Delivering messages in a different order than they were sent creates reordering and
     concurrency without any preset.
4. **Partition.** `set_partition` lists the peers a node is cut off from. The UI sets both
   ends of a link, so the cut is symmetric. A send across a cut still happens — the sender
   cannot know — but the message is lost. Incoming messages from a cut-off peer are discarded.
5. **Collection.** The server's hub subscribes to `events.>` and `status.>`, validates each
   event, drops duplicates, stores it, and fans it out to every WebSocket client.
6. **Analysis.** Clicking an event or comparing two calls the causality service, which
   computes everything from the vector clocks inside the stored events.

## Ordering rules

These are the point of the project.

- Events are ordered **only by their clocks**. Never by NATS arrival order, hub receive
  order, or wall-clock time (`wallTime` is informational).
- The store keeps events in arrival order *for display only*. Nothing treats that order as
  causal.
- Core NATS only: at-most-once delivery, no global order across subjects. JetStream is not
  used.
- Every `AppMessage` carries a `msgId`; a node discards a message it has already accepted.
- `status` messages are not events and carry no clock values.
- Missing vector keys mean `0`.

## Run lifecycle

A **run** is one experiment from a clean start to the next reset.

| Trigger | What happens |
|---|---|
| **New run** (UI button, `POST /api/runs`) | The hub clears the store and tells clients to resync; the orchestrator sends `reset` to every known node, which zeroes its clocks and clears held messages and partitions. |
| **Server restart** | The store is in memory, so it starts empty. On startup the run manager publishes `nodes.discover`, waits one second for nodes to announce, then starts a fresh run so node clocks match the empty store. |
| **Node restart** | A restarted node announces itself with `started: true`. If the server already knew that node, its old clocks are gone and its events could not continue the previous history, so the server starts a new run. |

Known limitation: an event a node published just before it processed a `reset` can arrive
after the store was cleared and appear at the start of the new run.

## The central server

`go/internal/server` is split into small packages with one job each:

| Package | Job |
|---|---|
| `api` | HTTP routes, CORS, the WebSocket stream. No business logic. |
| `run` | The "current run": `NewRun` and the startup `Resync`. |
| `orchestrator` | Validates UI commands, publishes them to nodes, tracks which nodes exist, detects node restarts. Never computes clocks. |
| `hub` | Receives `events.>` and `status.>`, validates and dedups, stores, and fans out to subscribers. Keeps the latest status per node. A subscriber that falls behind its 256-message buffer is disconnected and must resync from a snapshot. |
| `store` | In-memory event list with an id index. Also encodes and parses the JSON trace format. |
| `causality` | Pure functions over a list of events: relations (past, future, concurrent), pairwise comparison with proof and causal chain, and the concurrent pairs Lamport misorders. |

## The node

`go/internal/node` is one process's behaviour. All of its state changes happen under a
single mutex, so events are numbered (`seq`) and published in exactly the order the node
performed them. A node holds:

- a Lamport clock and a vector clock (`go/pkg/clock`),
- a per-process sequence number and a message counter,
- its delivery mode (`auto` or `manual`) and the messages it is holding,
- the set of peers it is cut off from,
- the ids of messages it has already accepted, to discard duplicates.

Event ids have the form `<process>:<seq>` (for example `P1:0`; `seq` starts at 0) and
message ids `<process>-m<n>` (for example `P1-m1`).

## The web app

`apps/web` is a Next.js app (a single client-rendered page) with no clock logic. It receives
state over the WebSocket, asks the server causality questions over REST, and renders.

```
src/
  app/            page.tsx (composition), layout, globals.css (design tokens), favicon
  features/
    controls/     node cards, run actions (ControlPanel)
    diagram/      the space-time diagram (SpaceTimeDiagram)
    playback/     playback bar, "what just happened" (PlaybackBar, Explanation)
    causality/    selected-event panels (EventInspector, PlainSummary)
    compare/      pairwise comparison, Lamport vs vector
    shell/        sidebar, view and theme switches, tabs, stat pills, legend swatch
  lib/            pure logic and hooks: state reducer, layout, playback reducer,
                  explanations, plain-English text, API client, theme and view mode
```

Key points:

- **State.** `useClockLens` keeps one WebSocket open (reconnecting with backoff). A snapshot
  replaces local state; `event` and `status` messages update it. Events are deduplicated by id.
- **Layout.** `computeLayout` places each event in a column equal to its depth in the causal
  graph (previous event on the same node, plus the matching send for a receive), so every
  message arrow points forward. Horizontal position is a drawing aid, not time.
- **Playback.** A small reducer tracks a cursor into the causally ordered event list, or
  "live" mode that always shows everything.
- **Server answers.** `useRemote` fetches relations, comparisons and misleading pairs, and
  discards a response that arrives after the question has changed.
- **Views.** *Simple* shows plain-English text; *Advanced* adds vector clocks, speed control,
  comparison and network controls. Both the view and the theme (system, light, dark) are
  remembered in `localStorage`.
- **Styling.** Tailwind CSS 4 with design tokens (colours, radii, fonts) in `globals.css`.
  Dark theme is neutral black and grey with orange reserved for primary and accent elements.

## Package dependencies

```
apps/web ──(REST / WebSocket)──▶ cmd/server ──▶ internal/server/* ──▶ pkg/*
                                 cmd/node   ──▶ internal/node     ──▶ pkg/*
```

- `internal/server` and `internal/node` never import each other. They share only `pkg/*`
  (`clock`, `events`, `protocol`, `bus`) and talk over NATS. Only `go/e2e` imports both, for tests.
- `pkg/*` imports nothing from `internal/*`.
- `contracts/` is the source of truth: change a contract first, then the implementation.

## Testing strategy

| Layer | Where | What it proves |
|---|---|---|
| Clock contract | `go/pkg/clock` + `contracts/clock-vectors` | Lamport and vector clocks follow the shared test cases; property tests check the happened-before laws. |
| Units | each Go package, `apps/web/src/lib/*.test.ts` | Node behaviour, hub, store, orchestrator, causality, and the web state, layout, playback and text logic. |
| End to end | `go/e2e` | The real server and real nodes on an in-memory bus: manual delivery through the API, causality endpoints, new run, export/import round trip, WebSocket stream, server restart and node restart. |

The in-memory bus (`pkg/bus.Memory`) implements the same `Bus` interface as NATS, including
NATS-style subject matching, so tests need no broker.

## Design decisions and limitations

- **Why NATS?** It makes nodes genuinely independent processes with a real network between
  them, and its lack of global ordering is exactly the situation clocks exist for.
- **Why not JetStream?** Persistence and ordering guarantees would hide the very effects the
  tool demonstrates.
- **In-memory storage.** A run lives in the server's memory. Restarting the server starts a
  new run; use export to keep a trace.
- **No authentication, open CORS.** This is a teaching tool meant to run locally. Do not
  expose it to an untrusted network.
- **Event-per-card layout.** The diagram trades a true time axis for readable, forward-pointing
  arrows. Time on the diagram is causal, not physical.
