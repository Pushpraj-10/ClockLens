# ClockLens

Interactive Lamport vs vector clock visualizer. You drive real Go nodes from the UI
and watch the events and their causality on a space-time diagram.

| Path | Responsibility |
|---|---|
| `contracts/` | Event schema + clock test vectors (source of truth) |
| `apps/web` | Next.js viewer: controls, diagram, playback, causality, comparison |
| `packages/events` | TS `ClockEvent` types (to be generated from the schema) |
| `go/pkg/clock` | Lamport + vector clocks, `Compare` |
| `go/pkg/events` | Go `ClockEvent` struct |
| `go/pkg/protocol` | NATS subjects, messages, control commands, status |
| `go/internal/server/*` | Central server: api, run, orchestrator, hub, store, causality |
| `go/internal/node` | Node: clocks, inbox buffer, delivery mode, partition |
| `go/cmd/server`, `go/cmd/node` | The two Go binaries |
| `deploy/`, `docker-compose.yml` | `docker compose up`: nats, server, 3 nodes, web |

Dev: `pnpm install && pnpm dev` · Go tests: `make test-go` · Design: `docs/architecture.md`
