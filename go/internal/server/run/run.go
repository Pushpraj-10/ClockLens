package run

import (
	"time"

	"github.com/clocklens/clocklens/internal/server/hub"
	"github.com/clocklens/clocklens/internal/server/orchestrator"
)

// Manager owns the idea of "the current run": one experiment from start to reset.
type Manager struct {
	hub  *hub.Hub
	orch *orchestrator.Orchestrator
}

// New creates a run manager.
func New(h *hub.Hub, o *orchestrator.Orchestrator) *Manager {
	return &Manager{hub: h, orch: o}
}

// Resync is for server startup: it finds the running nodes, waits up to settle for
// them to answer, then starts a fresh run. The server's store is in memory and so is
// empty after a restart; resetting the nodes keeps their clocks consistent with it.
func (m *Manager) Resync(settle time.Duration) error {
	if err := m.orch.Discover(); err != nil {
		return err
	}

	time.Sleep(settle)

	return m.NewRun()
}

// NewRun clears the stored events and resets every node's clocks.
//
// Known limitation: an event a node published just before it processed the reset
// can arrive after the clear and appear at the start of the new run.
func (m *Manager) NewRun() error {
	m.hub.Reset()

	return m.orch.ResetAll()
}
