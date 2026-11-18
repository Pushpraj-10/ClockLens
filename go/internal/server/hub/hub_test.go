package hub

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/clocklens/clocklens/internal/server/store"
	"github.com/clocklens/clocklens/pkg/bus"
	"github.com/clocklens/clocklens/pkg/events"
	"github.com/clocklens/clocklens/pkg/protocol"
)

func setup(t *testing.T) (*Hub, *bus.Memory) {
	t.Helper()
	b := bus.NewMemory()
	t.Cleanup(b.Close)
	h := New(store.New())
	if err := h.Attach(b); err != nil {
		t.Fatal(err)
	}
	return h, b
}

func publish(t *testing.T, b bus.Bus, subject string, v any) {
	t.Helper()
	data, _ := json.Marshal(v)
	if err := b.Publish(subject, data); err != nil {
		t.Fatal(err)
	}
}

func next(t *testing.T, ch <-chan Message) Message {
	t.Helper()
	select {
	case m, ok := <-ch:
		if !ok {
			t.Fatal("channel closed")
		}
		return m
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for message")
	}
	return Message{}
}

func localEvent(id string) events.ClockEvent {
	return events.ClockEvent{ID: id, Process: "P1", Kind: events.Local, Lamport: 1, Vector: map[string]uint64{"P1": 1}}
}

func TestDedupsAndFansOut(t *testing.T) {
	h, b := setup(t)
	ch, cancel := h.Subscribe()
	defer cancel()

	publish(t, b, protocol.EventsSubject("P1"), localEvent("P1:0"))
	publish(t, b, protocol.EventsSubject("P1"), localEvent("P1:0")) // duplicate
	publish(t, b, protocol.EventsSubject("P1"), localEvent("P1:1"))

	if m := next(t, ch); m.Type != TypeEvent || m.Event.ID != "P1:0" {
		t.Fatalf("first = %+v", m)
	}
	if m := next(t, ch); m.Type != TypeEvent || m.Event.ID != "P1:1" {
		t.Fatalf("second should skip the duplicate, got %+v", m)
	}
	if got := len(h.Snapshot().Events); got != 2 {
		t.Fatalf("stored %d events, want 2", got)
	}
}

func TestInvalidEventIgnored(t *testing.T) {
	h, b := setup(t)
	ch, cancel := h.Subscribe()
	defer cancel()
	publish(t, b, protocol.EventsSubject("P1"), map[string]any{"id": "P1:0"}) // no process/vector/kind
	publish(t, b, protocol.EventsSubject("P1"), localEvent("P1:1"))
	if m := next(t, ch); m.Event.ID != "P1:1" {
		t.Fatalf("invalid event should have been dropped, got %+v", m)
	}
}

func TestStatusTrackedAndBroadcast(t *testing.T) {
	h, b := setup(t)
	ch, cancel := h.Subscribe()
	defer cancel()
	st := protocol.Status{ID: "P2", Mode: protocol.ModeManual, Pending: []protocol.Pending{{MsgID: "P1-m1", From: "P1"}}}
	publish(t, b, protocol.StatusSubject("P2"), st)

	if m := next(t, ch); m.Type != TypeStatus || m.Status.ID != "P2" {
		t.Fatalf("message = %+v", m)
	}
	snap := h.Snapshot()
	if len(snap.Statuses) != 1 || snap.Statuses[0].Mode != protocol.ModeManual || len(snap.Statuses[0].Pending) != 1 {
		t.Fatalf("snapshot statuses = %+v", snap.Statuses)
	}
}

func TestResetAndLoadBroadcastSnapshots(t *testing.T) {
	h, b := setup(t)
	ch, cancel := h.Subscribe() // subscribe first so the event broadcast is not missed
	defer cancel()
	publish(t, b, protocol.EventsSubject("P1"), localEvent("P1:0"))
	next(t, ch) // the event itself

	h.Reset()
	if m := next(t, ch); m.Type != TypeSnapshot || len(m.Events) != 0 {
		t.Fatalf("reset message = %+v", m)
	}

	if err := h.Load([]events.ClockEvent{localEvent("X:0"), localEvent("X:1")}); err != nil {
		t.Fatal(err)
	}
	if m := next(t, ch); m.Type != TypeSnapshot || len(m.Events) != 2 {
		t.Fatalf("load message = %+v", m)
	}
	if err := h.Load([]events.ClockEvent{{ID: "bad"}}); err == nil {
		t.Fatal("expected error loading invalid trace")
	}
}

func TestSlowSubscriberIsDisconnected(t *testing.T) {
	h, _ := setup(t)
	ch, _ := h.Subscribe()
	for i := 0; i < 300; i++ { // buffer is 256; never read from ch
		h.broadcast(Message{Type: TypeStatus, Status: &protocol.Status{ID: "P1"}})
	}
	for i := 0; i < 300; i++ {
		select {
		case _, ok := <-ch:
			if !ok {
				return // closed after draining the buffer: disconnected as designed
			}
		default:
			t.Fatal("channel should have been closed after overflow")
		}
	}
	t.Fatal("slow subscriber was not disconnected")
}
