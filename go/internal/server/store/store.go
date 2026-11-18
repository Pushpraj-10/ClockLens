package store

import (
	"encoding/json"
	"fmt"
	"sync"

	"github.com/clocklens/clocklens/pkg/events"
)

// Store holds the current run's events in memory, deduplicated by event id.
//
// All() returns events in arrival order. That order is for display only; causal
// order comes from the clock values inside the events, never from this order.
type Store struct {
	mu     sync.RWMutex
	events []events.ClockEvent
	ids    map[string]struct{}
}

// New returns an empty store.
func New() *Store {
	return &Store{ids: map[string]struct{}{}}
}

// Add stores e and reports whether it was new. Events with a known id are ignored.
func (s *Store) Add(e events.ClockEvent) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.addLocked(e)
}

func (s *Store) addLocked(e events.ClockEvent) bool {
	if _, dup := s.ids[e.ID]; dup {
		return false
	}
	s.ids[e.ID] = struct{}{}
	s.events = append(s.events, e)
	return true
}

// All returns a copy of the stored events in arrival order.
func (s *Store) All() []events.ClockEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]events.ClockEvent{}, s.events...)
}

// Reset removes all events.
func (s *Store) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = nil
	s.ids = map[string]struct{}{}
}

// Replace swaps the contents for evs. It validates everything first, so on error
// the store is unchanged.
func (s *Store) Replace(evs []events.ClockEvent) error {
	for _, e := range evs {
		if err := e.Validate(); err != nil {
			return err
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = nil
	s.ids = map[string]struct{}{}
	for _, e := range evs {
		s.addLocked(e)
	}
	return nil
}

// Marshal encodes events as an indented JSON array (the trace export format).
func Marshal(evs []events.ClockEvent) ([]byte, error) {
	if evs == nil {
		evs = []events.ClockEvent{}
	}
	return json.MarshalIndent(evs, "", "  ")
}

// Parse decodes and validates a JSON trace.
func Parse(data []byte) ([]events.ClockEvent, error) {
	var evs []events.ClockEvent
	if err := json.Unmarshal(data, &evs); err != nil {
		return nil, fmt.Errorf("trace: %w", err)
	}
	for _, e := range evs {
		if err := e.Validate(); err != nil {
			return nil, err
		}
	}
	return evs, nil
}
