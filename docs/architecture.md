# Architecture (v3: interactive UI + central server + NATS + real nodes)

No scripts, presets or simulator. The user drives the system from the UI, and every
event comes from real node processes.

- **Web** (Next.js + TS): control panel and diagram. Sends commands, draws events. Runs no clock or causality logic.
- **Central server** (Go): API, run manager, orchestrator, event hub, storage, causality queries.
- **Nodes** (Go, N processes): keep their own Lamport and vector clocks and exchange messages through the broker.
- **NATS** (core pub/sub, no JetStream): transport between nodes and between nodes and the server.

```
┌──────────────────────────────────────────────┐
│            Web UI (Next.js + TS)             │
│  control panel: [local event] [send P1→P2]   │
│    [deliver] [drop] [auto/manual] [partition]│
│  diagram · highlight · pairwise compare ·    │
│  Lamport vs vector · import/export           │
└───────┬──────────────────────────────▲───────┘
        │ REST (commands, queries)     │ WebSocket (events + in-flight status)
        ▼                              │
┌────────────────────────────────────────────────────────────────┐
│                   CENTRAL SERVER (Go)                          │
│   API (REST + WS) ──▶ Run manager (new run / reset)            │
│        │                    │                                  │
│        │             ┌──────▼───────┐        ┌──────────────┐  │
│        │             │ Orchestrator │        │  Event hub   │  │
│        │             │ commands →   │        │ dedup, fan-  │  │
│        │             │ node.<id>.ctl│        │ out, NO      │  │
│        ▼             └──────┬───────┘        │ arrival order│  │
│   Causality                 │      events.>  └──┬────────┬──┘  │
│   service                   │      status.>     │        │     │
│   (past/future/             │      nodes.hello──┘   Event store│
│    concurrent/proof)        │                       (JSONL)    │
└─────────────────────────────┼──────────────────────────────────┘
        uses go/pkg/{clock,events,protocol}  │ NATS client
                                             ▼
                          ┌─────────────────────────────┐
                          │     NATS (core pub/sub)     │
                          └───┬───────────┬───────────┬─┘
           node.P1.inbox/ctl  │           │           │ node.P3.inbox/ctl
                           ┌──▼──┐     ┌──▼──┐     ┌──▼──┐
                           │ P1  │     │ P2  │     │ P3  │
                           └─────┘     └─────┘     └─────┘
          each node: Lamport + vector clock, inbox buffer, delivery mode, partition set
```

## NATS subjects (the only coupling between server and nodes)

| Subject | Direction | Payload |
|---|---|---|
| `node.<id>.inbox` | node -> node | `AppMessage` {msgId, from, to, lamport, vector, body} |
| `node.<id>.ctl` | server -> node | command (below) |
| `events.<id>` | node -> server | `ClockEvent` (see `contracts/event.schema.json`) |
| `status.<id>` | node -> server | non-clock status: delivery mode, pending (held) messages, partition set |
| `nodes.hello` | node -> server | announce {id}; the server learns which nodes exist |

Commands on `ctl`: `local`, `send{to}`, `deliver{msgId}`, `drop{msgId}`,
`set_mode{auto|manual}`, `set_partition{peers}`, `reset`, `stop`.

## How the user interacts

1. **Local event:** the user clicks a node's "local event". The server sends `local`; the node ticks its clocks and publishes a `ClockEvent`.
2. **Send:** the user picks a source and a target. The node ticks, stamps the message with its clocks, publishes a `send` event, and puts the `AppMessage` on the target's inbox.
3. **Delivery:**
   - In **auto** mode the target receives immediately and publishes a `receive` event.
   - In **manual** mode the target holds the message and reports it via `status`. The UI shows it as an in-flight arrow, and the user clicks **deliver** or **drop**. Delivering messages in a different order than they were sent creates reordering and concurrency, with no preset needed.
4. **Partition:** the user cuts links between nodes (`set_partition`); messages across the cut are dropped.
5. **Analysis:** clicking an event or a pair of events calls the Causality service, which returns the past, future and concurrent sets or a happened-before proof.
6. **Run control:** "new run" resets the nodes and the store. Import and export move JSON traces in and out of the hub and store.

Playback (play, pause, step) replays the stored event list of a run in the UI.

## Ordering rules (the point of the project)

- Events are ordered **only by their clocks**. Never by NATS arrival order, hub receive order, or wall time.
- The UI may show events in arrival order for convenience but must not treat it as causal order.
- Use core NATS only (at-most-once, no global order across subjects). Do not enable JetStream.
- Every `AppMessage` has a `msgId`; nodes discard duplicates.
- `status` messages are not events and carry no clock values.

## Repo layout

```
contracts/
  event.schema.json            source of truth for ClockEvent (TS types generated from it)
  clock-vectors/               Lamport + vector cases, tested against Go
apps/web/                      Next.js (features: controls, diagram, playback, causality, compare)
packages/events/               generated TS types for ClockEvent
go/
  pkg/
    clock/                     Lamport, vector, Compare
    events/                    ClockEvent struct
    protocol/                  NATS subjects, AppMessage, control commands, status
  internal/
    server/{api,run,orchestrator,hub,store,causality}
    node/                      node behaviour, inbox buffer, delivery mode, NATS transport
  cmd/
    server/                    central server binary
    node/                      node binary
deploy/, docker-compose.yml    nats, server, node-1..3, web
```

## Dependency direction

```
apps/web ──(REST/WS)──▶ cmd/server ──▶ internal/server/* ──▶ pkg/{clock,events,protocol}
                        cmd/node   ──▶ internal/node     ──▶ pkg/{clock,events,protocol}
```

- `internal/server` and `internal/node` never import each other; they share only `pkg/*` and talk over NATS.
- `pkg/*` imports nothing from `internal/*`.
- Wall-clock time is informational only.

## Phases (revised)

1. Clock library in Go and tests (done; the TS clock package is to be removed).
2. Event format, protocol, node, hub, store and API.
3. Web controls, diagram and playback.
4. Causality service, comparison view and manual delivery/partition controls.
5. Extras (trace import/export polish), documentation, report and demo.
