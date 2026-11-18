# Setup

There are two ways to run ClockLens: everything in Docker (easiest), or each piece on your
own machine (best for development).

- [Prerequisites](#prerequisites)
- [Option A: Docker Compose](#option-a-docker-compose)
- [Option B: run it locally](#option-b-run-it-locally)
- [Configuration](#configuration)
- [Adding more nodes](#adding-more-nodes)
- [Running the tests](#running-the-tests)
- [Troubleshooting](#troubleshooting)

## Prerequisites

| For | You need |
|---|---|
| Docker route | Docker with the Compose plugin |
| Local route | Go 1.26 or newer, Node.js 22, pnpm 9 (`corepack enable` provides it), and a NATS server (a Docker one is fine) |

Default ports:

| Port | Service |
|---|---|
| `3000` | Web app |
| `8080` | Central server (REST and WebSocket) |
| `4222` | NATS |

## Option A: Docker Compose

```bash
docker compose up --build
```

(`make up` runs the same command.) Open **http://localhost:3000**.

This starts six containers: `nats`, `server`, three nodes (`node-1` to `node-3`, ids `P1` to
`P3`) and `web`. The first build takes a few minutes; later starts are fast.

Stop everything with `Ctrl+C`, then `docker compose down` to remove the containers.

## Option B: run it locally

Open four terminals from the repository root.

**1. NATS**

```bash
docker run --rm -p 4222:4222 nats:2
```

Any NATS server on port 4222 works. Do not enable JetStream.

**2. Central server**

```bash
cd go
go run ./cmd/server
```

It listens on `:8080` and connects to `nats://localhost:4222`.

**3. Nodes** (one process per node; run the command once per id)

```bash
cd go
NODE_ID=P1 go run ./cmd/node
NODE_ID=P2 go run ./cmd/node
NODE_ID=P3 go run ./cmd/node
```

On Windows PowerShell, set the variable first:

```powershell
cd go
$env:NODE_ID = "P1"; go run ./cmd/node
```

**4. Web app**

```bash
pnpm install
pnpm dev
```

Open **http://localhost:3000**. The node cards for P1, P2 and P3 should appear in the left
panel with their buttons enabled.

Start the services in any order: the server and nodes retry their NATS connection for up to
30 seconds.

### Production build of the web app

```bash
pnpm build
pnpm --filter @clocklens/web start
```

## Configuration

| Variable | Used by | Default | Meaning |
|---|---|---|---|
| `NATS_URL` | server, nodes | `nats://localhost:4222` | NATS server to connect to |
| `HTTP_ADDR` | server | `:8080` | Address the server listens on |
| `NODE_ID` | node | *(required)* | The node's process id, for example `P1` |
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:8080` | Where the browser finds the server |

`NEXT_PUBLIC_API_URL` is read **at build time** and baked into the browser bundle. If you
change it, rebuild the web app (for Docker, `docker compose build web`). The WebSocket URL is
derived from it (`http` becomes `ws`, path `/ws`).

## Adding more nodes

A node is just another process with a unique `NODE_ID`; the server discovers it from its
announcement. With Docker, add a service to `docker-compose.yml`:

```yaml
  node-4:
    <<: *node
    environment: { NODE_ID: P4, NATS_URL: "nats://nats:4222" }
```

Locally, start another `NODE_ID=P4 go run ./cmd/node`. The UI adds a lane and a control card
automatically. Ids are sorted naturally (`P2` before `P10`) and the first six lanes have their
own colour.

Starting a node the server already knew about is treated as a restart and begins a new run
(see [architecture.md](architecture.md#run-lifecycle)).

## Running the tests

```bash
make test         # everything
make test-go      # cd go && go test ./...
make test-ts      # pnpm test (web unit tests)
pnpm typecheck    # TypeScript type check
```

The Go end-to-end tests run the server and nodes in one process on an in-memory bus, so they
need no NATS server or Docker.

## Troubleshooting

**The buttons are greyed out, or "Waiting for nodes to connect…" never goes away**
The browser cannot reach the server's WebSocket, so the controls are disabled while it keeps
retrying in the background. Check that the server is running (`curl http://localhost:8080/healthz`
should return an empty 200) and that `NEXT_PUBLIC_API_URL` points at it. On Windows use
`curl.exe`, since plain `curl` is a PowerShell alias.

**The page loads but there are no nodes**
Nodes announce themselves when they start, and again when the server asks. Make sure the
nodes can reach NATS, then reload the page. If you started nodes before the server, no action
is needed: the server asks all nodes to announce on startup.

**"Cannot reach the server. Is it running?" when pressing a button**
The REST call failed. Same causes as above.

**Port already in use**
Something else is on 3000, 8080 or 4222. Stop it, or change the mapping: `HTTP_ADDR` for the
server (and `NEXT_PUBLIC_API_URL` to match), `pnpm dev --port <n>` for the web app, or the
`ports:` lines in `docker-compose.yml`.

**The run suddenly cleared**
That is by design when a node restarts or the server restarts: the old clocks no longer match,
so a new run begins. Use **Export** (Advanced view) first if you want to keep a trace.

**`go: ... requires go >= 1.26`**
Install a newer Go toolchain, or run the services through Docker.
