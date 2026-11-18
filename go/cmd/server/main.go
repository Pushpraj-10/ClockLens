// Command server is the central ClockLens server: API, orchestrator, event hub and store.
package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/clocklens/clocklens/internal/server/api"
	"github.com/clocklens/clocklens/internal/server/hub"
	"github.com/clocklens/clocklens/internal/server/orchestrator"
	"github.com/clocklens/clocklens/internal/server/run"
	"github.com/clocklens/clocklens/internal/server/store"
	"github.com/clocklens/clocklens/pkg/bus"
)

func main() {
	// Configuration comes from the environment.
	natsURL := env("NATS_URL", "nats://localhost:4222")
	addr := env("HTTP_ADDR", ":8080")

	// Connect to the message bus.
	b, err := bus.ConnectNATS(natsURL, 30*time.Second)
	if err != nil {
		log.Fatal(err)
	}
	defer b.Close()

	// The hub collects node events; the orchestrator sends commands to nodes.
	h := hub.New(store.New())
	if err := h.Attach(b); err != nil {
		log.Fatal(err)
	}

	orch := orchestrator.New(b)
	if err := orch.Attach(); err != nil {
		log.Fatal(err)
	}

	runs := run.New(h, orch)

	// A node that restarts mid-run lost its clocks: continue in a new run.
	orch.OnNodeRestart(func(id string) {
		log.Printf("node %s restarted; starting a new run", id)

		if err := runs.NewRun(); err != nil {
			log.Printf("new run after restart of %s: %v", id, err)
		}
	})

	// The store is in memory, so a restarted server starts a fresh run and re-finds
	// the nodes that are still running.
	if err := runs.Resync(time.Second); err != nil {
		log.Fatal(err)
	}

	// Serve the HTTP API and the WebSocket stream.
	srv := api.New(h, orch, runs)

	log.Printf("server listening on %s (nats %s)", addr, natsURL)
	log.Fatal(http.ListenAndServe(addr, srv.Handler()))
}

// env returns the environment variable key, or fallback when it is unset or empty.
func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}

	return fallback
}
