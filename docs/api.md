# API reference

The central server exposes a small REST API and a WebSocket stream to the web app, and talks
to nodes over NATS. Everything here is defined in `go/internal/server/api` and
`go/pkg/protocol`.

- [Conventions](#conventions)
- [REST endpoints](#rest-endpoints)
- [Data types](#data-types)
- [WebSocket stream](#websocket-stream)
- [Trace format](#trace-format)
- [NATS subjects](#nats-subjects)

## Conventions

- Base URL: `http://localhost:8080` (set by `HTTP_ADDR`).
- Request and response bodies are JSON (`Content-Type: application/json`).
- Errors are returned as `{"error": "message"}` with a suitable status code.
- CORS is open (`*`) for `GET`, `POST` and `OPTIONS`. There is no authentication; this is a local teaching tool.

| Status | Meaning |
|---|---|
| `200` | OK, body returned |
| `202` | Command accepted and sent to the node |
| `204` | Done, no body |
| `400` | Malformed body or invalid command, query or trace |
| `404` | Unknown node or unknown event |
| `500` | Server error |

## REST endpoints

### `GET /healthz`

Liveness check. Returns `200` with an empty body.

### `GET /api/nodes`

Known nodes and their latest status.

```json
[
  { "id": "P1", "status": { "id": "P1", "mode": "auto", "partition": [], "pending": [] } },
  { "id": "P2", "status": null }
]
```

`status` is `null` until the node has reported one.

### `POST /api/nodes/{id}/commands`

Send a command to node `{id}`. Body is a [`Command`](#command), at most 64 KiB.

```bash
curl -X POST localhost:8080/api/nodes/P1/commands \
  -H 'Content-Type: application/json' -d '{"type":"send","to":"P2"}'
```

| Command | Fields | Effect |
|---|---|---|
| `local` | — | Node performs a local event |
| `send` | `to` | Node sends a message to another node (`to` must be a known node other than the sender) |
| `deliver` | `msgId` | Deliver a held message |
| `drop` | `msgId` | Discard a held message |
| `set_mode` | `mode`: `auto` or `manual` | Change delivery mode; `auto` delivers all held messages |
| `set_partition` | `peers` | Replace the set of peers this node is cut off from |
| `reset` | — | Reset the node's clocks and state |
| `stop` | — | Ask the node to shut down |

Returns `202` on success, `404` for an unknown node or target, `400` for an invalid command.

### `POST /api/runs`

Start a new run: clear all events and reset every node. Returns `204`.

### `GET /api/events`

All stored events, in **arrival order** (not causal order), as an array of [`ClockEvent`](#clockevent).

### `GET /api/causality/{id}`

Classify every other event relative to event `{id}`. Returns [`Relations`](#relations), or `404` if the event is unknown.

### `GET /api/compare?a={id}&b={id}`

Compare two events. Both query parameters are required (`400` otherwise); `404` if either event
is unknown. Returns a [`Comparison`](#comparison).

### `GET /api/misleading`

Every pair of **concurrent** events whose Lamport values differ, as an array of [`Misleading`](#misleading),
ordered by Lamport value then id.

### `GET /api/export`

Download the current run as a JSON trace (`Content-Disposition: attachment; filename="clocklens-trace.json"`).
See [Trace format](#trace-format).

### `POST /api/import`

Replace the current run with a JSON trace. Body: an array of `ClockEvent`, at most 10 MiB. The
whole trace is validated first; on any error nothing changes and `400` is returned. Returns `204`.
Connected clients receive a fresh snapshot.

## Data types

### ClockEvent

Defined by [`contracts/event.schema.json`](../contracts/event.schema.json).

```json
{
  "id": "P2:1",
  "process": "P2",
  "seq": 1,
  "kind": "receive",
  "lamport": 3,
  "vector": { "P1": 2, "P2": 1, "P3": 0 },
  "peer": "P1",
  "msgId": "P1-m1",
  "wallTime": 1767225600000
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | `<process>:<seq>`, unique within a run |
| `process` | string | The node that performed the event |
| `seq` | integer ≥ 0 | Per-process order, starting at 0 |
| `kind` | `local` \| `send` \| `receive` | |
| `lamport` | integer ≥ 0 | Lamport clock after the event |
| `vector` | object | Vector clock after the event. A missing key means 0 |
| `peer` | string | Other node for `send` / `receive`; required for those kinds |
| `msgId` | string | Links a send to its receive; required for `send` / `receive` |
| `label` | string | Optional |
| `wallTime` | number | Unix ms. Informational only, never used for ordering |

### Command

```json
{ "type": "set_mode", "mode": "manual" }
```

Fields: `type` (required), `to`, `msgId`, `mode`, `peers` — see the table above.

### NodeStatus

A node's non-clock state. It carries no clock values and is not an event.

```json
{ "id": "P2", "mode": "manual", "partition": ["P3"], "pending": [{ "msgId": "P1-m1", "from": "P1" }] }
```

### Relations

```json
{ "id": "P2:1", "past": ["P1:0", "P1:1"], "future": ["P3:1"], "concurrent": ["P3:0"] }
```

### Comparison

```json
{
  "a": "P2:1", "b": "P3:0",
  "relation": "concurrent",
  "lamportA": 3, "lamportB": 1,
  "lamportSays": "after",
  "lamportMisleads": true,
  "proof": ["Vector of P2:1 is {P1=2, P2=1, P3=0}; …", "Compared entry by entry …", "…"],
  "path": ["P1:1", "P2:1"]
}
```

| Field | Meaning |
|---|---|
| `relation` | `a` relative to `b`: `before`, `after`, `equal` or `concurrent` |
| `lamportSays` | What the Lamport values alone suggest: `before`, `after` or `tie` |
| `lamportMisleads` | `true` when that suggestion disagrees with the real relation |
| `proof` | Human-readable steps, including a note on whether Lamport agrees |
| `path` | Chain of event ids linked by program order and messages from the earlier to the later event. Present only when one event is before the other |

### Misleading

```json
{ "a": "P3:0", "b": "P1:1", "lamportA": 1, "lamportB": 2 }
```

`a` has the lower Lamport value; the two events are concurrent.

## WebSocket stream

Connect to `ws://localhost:8080/ws`. The server first sends a **snapshot**, then every change.

```jsonc
{ "type": "snapshot", "events": [ /* ClockEvent… */ ], "statuses": [ /* NodeStatus… */ ] }
{ "type": "event",    "event":  { /* ClockEvent */ } }
{ "type": "status",   "status": { /* NodeStatus */ } }
```

- A **snapshot replaces** everything the client holds. It is also sent after *new run* and
  *import*, so clients resync.
- The server subscribes before it sends the first snapshot, so nothing is missed. A client may
  therefore see an event in both the snapshot and the stream; **deduplicate by `id`**.
- A client that falls behind (its 256-message buffer fills) is disconnected with close code
  `1008` ("too slow"). Reconnect and use the new snapshot.
- Messages are text frames, server to client only.

## Trace format

A trace is a JSON array of `ClockEvent`, indented with two spaces. `GET /api/export` produces it
and `POST /api/import` accepts it. Every event must satisfy the schema and these rules:
non-empty `id`, `process` and `vector`; `send` and `receive` events need `peer` and `msgId`.

## NATS subjects

Used between the server and nodes. The web app never touches NATS.

| Subject | Direction | Payload |
|---|---|---|
| `node.<id>.inbox` | node → node | `AppMessage` `{msgId, from, to, lamport, vector, body?}` |
| `node.<id>.ctl` | server → node | `Command` |
| `events.<id>` | node → server | `ClockEvent` |
| `status.<id>` | node → server | `NodeStatus` |
| `nodes.hello` | node → server | `{id, started?}` — `started` is true only for a freshly started node |
| `nodes.discover` | server → nodes | Empty object; every node answers with a hello and its status |

The server subscribes to `events.>`, `status.>` and `nodes.hello`.
