# ClockLens

Interactive Lamport vs vector clock visualizer with a simulator and a live Go system.

| Path | Responsibility |
|---|---|
| `contracts/` | Event schema + shared clock test vectors |
| `packages/clock` | TS Lamport/vector clocks |
| `packages/events` | TS event types / validation |
| `packages/simulator` | Script -> events (browser, no backend) |
| `apps/web` | Next.js UI: diagram, playback, highlighting, comparison |
| `go/pkg/{clock,events}` | Go clocks + event struct |
| `go/cmd/node`, `internal/node` | Real processes exchanging gRPC messages |
| `go/cmd/collector`, `internal/collector` | Event ingest, file persistence, WebSocket stream |
| `go/cmd/faultproxy` | Optional delay/drop/reorder/partition proxy |
| `deploy/`, `docker-compose.yml` | `docker compose up` |

Dev: `pnpm install && pnpm dev` · Tests: `make test` · Design: `docs/architecture.md`
