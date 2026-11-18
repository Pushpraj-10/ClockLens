package hub

import (
	"encoding/json"
	"log"
	"sort"
	"sync"

	"github.com/clocklens/clocklens/internal/server/store"
	"github.com/clocklens/clocklens/pkg/bus"
	"github.com/clocklens/clocklens/pkg/events"
	"github.com/clocklens/clocklens/pkg/protocol"
)

// Message types sent to subscribers (and over the WebSocket).
const (
	TypeEvent    = "event"    // one new event
	TypeStatus   = "status"   // one node's status changed
	TypeSnapshot = "snapshot" // full state; the receiver replaces what it has
)

// Message is what the hub fans out. A client that subscribes and then reads a snapshot
// may see an event in both; clients dedup by event id.
type Message struct {
	Type     string              `json:"type"`
	Event    *events.ClockEvent  `json:"event,omitempty"`
	Status   *protocol.Status    `json:"status,omitempty"`
	Events   []events.ClockEvent `json:"events,omitempty"`
	Statuses []protocol.Status   `json:"statuses,omitempty"`
}

// Hub receives node events and statuses from the bus, drops duplicate events, stores
// them and fans them out to subscribers. It never orders events by arrival.
type Hub struct {
	store *store.Store

	mu       sync.RWMutex
	statuses map[string]protocol.Status
	subs     map[chan Message]struct{}
}

// New creates a hub backed by s.
func New(s *store.Store) *Hub {
	return &Hub{store: s, statuses: map[string]protocol.Status{}, subs: map[chan Message]struct{}{}}
}

// Attach subscribes the hub to node events and statuses on b.
func (h *Hub) Attach(b bus.Bus) error {
	if _, err := b.Subscribe(protocol.EventsWildcard, h.onEvent); err != nil {
		return err
	}

	_, err := b.Subscribe(protocol.StatusWildcard, h.onStatus)

	return err
}

// onEvent stores a node's event and forwards it to subscribers.
func (h *Hub) onEvent(_ string, data []byte) {
	var e events.ClockEvent
	if err := json.Unmarshal(data, &e); err != nil {
		log.Printf("hub: bad event: %v", err)

		return
	}

	if err := e.Validate(); err != nil {
		log.Printf("hub: dropping invalid event: %v", err)

		return
	}

	if !h.store.Add(e) {
		return // duplicate
	}

	h.broadcast(Message{Type: TypeEvent, Event: &e})
}

// onStatus remembers a node's latest status and forwards it to subscribers.
func (h *Hub) onStatus(_ string, data []byte) {
	var s protocol.Status
	if err := json.Unmarshal(data, &s); err != nil || s.ID == "" {
		log.Printf("hub: bad status: %v", err)

		return
	}

	h.mu.Lock()
	h.statuses[s.ID] = s
	h.mu.Unlock()

	h.broadcast(Message{Type: TypeStatus, Status: &s})
}

// Subscribe returns a channel of messages and a cancel function. A subscriber that
// falls too far behind is disconnected (its channel is closed); it should reconnect
// and resync from a snapshot.
func (h *Hub) Subscribe() (<-chan Message, func()) {
	ch := make(chan Message, 256)

	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()

	return ch, func() { h.drop(ch) }
}

// drop removes a subscriber and closes its channel (once).
func (h *Hub) drop(ch chan Message) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.subs[ch]; ok {
		delete(h.subs, ch)
		close(ch)
	}
}

// broadcast sends m to every subscriber; one whose buffer is full is disconnected.
func (h *Hub) broadcast(m Message) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for ch := range h.subs {
		select {
		case ch <- m:
		default:
			delete(h.subs, ch)
			close(ch)
		}
	}
}

// Snapshot returns the full current state: all events (arrival order) and node statuses.
func (h *Hub) Snapshot() Message {
	h.mu.RLock()

	statuses := make([]protocol.Status, 0, len(h.statuses))
	for _, s := range h.statuses {
		statuses = append(statuses, s)
	}

	h.mu.RUnlock()

	// Map order is random; sort so the snapshot is stable.
	sort.Slice(statuses, func(i, j int) bool { return statuses[i].ID < statuses[j].ID })

	return Message{Type: TypeSnapshot, Events: h.store.All(), Statuses: statuses}
}

// Reset clears the stored events and tells subscribers to resync.
func (h *Hub) Reset() {
	h.store.Reset()
	h.broadcast(h.Snapshot())
}

// Load replaces the stored events with a validated trace and tells subscribers to resync.
func (h *Hub) Load(evs []events.ClockEvent) error {
	if err := h.store.Replace(evs); err != nil {
		return err
	}

	h.broadcast(h.Snapshot())

	return nil
}
