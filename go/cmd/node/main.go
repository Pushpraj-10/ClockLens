// Command node runs one ClockLens node: its own clocks, exchanging messages over NATS.
package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/clocklens/clocklens/internal/node"
	"github.com/clocklens/clocklens/pkg/bus"
)

func main() {
	id := os.Getenv("NODE_ID")
	if id == "" {
		log.Fatal("NODE_ID is required")
	}
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = "nats://localhost:4222"
	}

	b, err := bus.ConnectNATS(natsURL, 30*time.Second)
	if err != nil {
		log.Fatal(err)
	}
	defer b.Close()

	n := node.New(id, b)
	if err := n.Start(); err != nil {
		log.Fatal(err)
	}
	defer n.Close()
	log.Printf("node %s running (nats %s)", id, natsURL)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	select {
	case <-sig:
	case <-n.Done():
	}
}
