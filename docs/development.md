# Development guide

For contributors. To just run the project, see [setup.md](setup.md); for how the system is put
together, see [architecture.md](architecture.md).

- [Repository layout](#repository-layout)
- [Everyday commands](#everyday-commands)
- [Principles](#principles)
- [Code style](#code-style)
- [Testing](#testing)
- [How to extend](#how-to-extend)
- [The web UI](#the-web-ui)
- [Commits](#commits)

## Repository layout

```
contracts/
  event.schema.json        source of truth for ClockEvent
  clock-vectors/           shared Lamport and vector test cases
apps/web/                  Next.js viewer (see architecture.md for the folder map)
packages/events/           TypeScript types: ClockEvent and the wire protocol
go/
  pkg/
    clock/                 Lamport, vector clock, Compare
    events/                ClockEvent struct and validation
    protocol/              NATS subjects, AppMessage, Command, Status
    bus/                   Bus interface; NATS and in-memory implementations
  internal/
    server/{api,run,orchestrator,hub,store,causality}
    node/                  one node's behaviour
  cmd/{server,node}/       the two binaries
  e2e/                     end-to-end tests
deploy/, docker-compose.yml
docs/
```

This is a pnpm workspace (`apps/*`, `packages/*`) plus a Go module in `go/`.

## Everyday commands

| Task | Command |
|---|---|
| Install JS dependencies | `pnpm install` |
| Run the web app (dev) | `pnpm dev` |
| Run the server | `cd go && go run ./cmd/server` |
| Run a node | `cd go && NODE_ID=P1 go run ./cmd/node` |
| All tests | `make test` |
| Go tests only | `cd go && go test ./...` |
| Go tests with the race detector | `cd go && go test -race ./...` |
| Web tests | `pnpm test` |
| Type check | `pnpm typecheck` |
| Production web build | `pnpm build` |
| Whole stack in Docker | `make up` |

## Principles

1. **Contracts first.** The event schema and clock test vectors in `contracts/` are the source
   of truth. Change a contract first, then the implementation.
2. **Clocks live in the nodes.** The web app computes no clocks and derives no causality; it
   asks the server (`/api/causality`, `/api/compare`, `/api/misleading`) and draws the answer.
   The only logic in the UI is presentation, such as layout and plain-English wording.
3. **Order by clocks, never by arrival.** No code may treat arrival order, hub order or
   `wallTime` as causal.
4. **Server and node stay independent.** `internal/server` and `internal/node` must not import
   each other; they share only `pkg/*` and communicate over NATS.
5. **`pkg/*` never imports `internal/*`.**
6. **Core NATS only.** Do not introduce JetStream.

## Code style

The same conventions apply to Go and TypeScript.

- **Separate sections with blank lines.** Group statements by purpose — setup, locking, the work,
  the return — with a blank line between groups, and a short comment where a group's intent is
  not obvious.
- **Comment the why.** Every exported identifier has a doc comment starting with its name.
  Unexported helpers get one when their purpose is not obvious from the name.
- **Keep functions small and single-purpose.** Return early for error and edge cases.
- **No dead code.** Remove unused functions, tokens and files rather than commenting them out.
- **Go:** `gofmt`. Keep the "lock … `defer` unlock … work … return" shape, and name methods that
  require the lock `…Locked`.
- **TypeScript:** strict mode is on. Prefer pure functions in `src/lib` (with tests) and keep
  components thin. Use the design tokens in `globals.css` rather than hard-coded colours.

## Testing

- **Go.** Each package has unit tests. `go/pkg/clock` tests every case in `contracts/clock-vectors`
  and checks the happened-before laws as properties. `go/e2e` starts the real server and real nodes
  on `bus.Memory`, so the same code paths as production run with no broker.
- **Web.** Vitest tests under `apps/web/src/lib` cover the reducers, layout, playback, explanations
  and theme logic. Components have no unit tests; check UI changes by running the app in light and
  dark theme, in both views and at phone width.
- **Add a test with every change.** A bug fix gets a regression test first.

## How to extend

### Add a control command (for example `pause`)

1. Add the `CommandType` constant and include it in `Valid()` in `go/pkg/protocol/protocol.go`.
2. Mirror it in `packages/events/src/protocol.ts`.
3. Validate it in `orchestrator.validate` if it has required fields.
4. Handle it in the `switch` in `node.handleCtl`.
5. Add a node unit test and an end-to-end test through the API.
6. Add a button in `ControlPanel.tsx` that calls `sendCommand`.
7. Document it in [api.md](api.md).

### Add a causality query

1. Write a pure function in `go/internal/server/causality` with tests.
2. Expose it from a handler in `api.go` and add the route in `Handler()`.
3. Add the response type to `packages/events` and a fetch function in `apps/web/src/lib/api.ts`.
4. Load it with `useRemote` and render it in a feature component.

### Change the event format

1. Edit `contracts/event.schema.json`.
2. Update `go/pkg/events/event.go` (struct and `Validate`) and `packages/events/src/index.ts`.
3. Update any test fixtures, then run `make test`.

### Add another node

Start another process with a new `NODE_ID`; nothing else changes. See [setup.md](setup.md#adding-more-nodes).

## The web UI

- **Design tokens** live in `apps/web/src/app/globals.css`: colours for light and dark themes,
  exposed to Tailwind as `bg-panel`, `text-muted`, `border-line` and so on, plus the shared
  `.btn`, `.btn-sm`, `.seg`, `.field`, `.badge`, `.chip` and `.panel` classes. The dark theme is
  neutral black and grey; orange is used only for primary and accent elements.
- **Themes.** `data-theme` on `<html>` is set before first paint by a tiny inline script
  (`themeCore.ts`) so the page never flashes the wrong theme. `useTheme` keeps it in sync.
- **Colours carry no meaning alone.** Before, after and independent use outline shape (solid,
  dashed, dotted) as well as colour; keep it that way for any new highlight.
- **Fonts** are Plus Jakarta Sans and JetBrains Mono, bundled through `@fontsource-variable`.
- **Responsive.** The layout is a sidebar plus main column from `lg` up and a single column below.
  The playback bar is sticky from `md` up.

### Running the UI without Go

For pure UI work you do not need the Go services: any server that implements the endpoints in
[api.md](api.md) works. Point `NEXT_PUBLIC_API_URL` at it.

## Commits

History uses [Conventional Commits](https://www.conventionalcommits.org/): `feat(web): …`,
`fix(go): …`, `refactor: …`, `docs: …`, `build: …`. Keep each commit to one logical change.
