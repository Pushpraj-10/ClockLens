package node

import (
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/clocklens/clocklens/pkg/bus"
	"github.com/clocklens/clocklens/pkg/clock"
	"github.com/clocklens/clocklens/pkg/events"
	"github.com/clocklens/clocklens/pkg/protocol"
)

// harness runs nodes on an in-memory bus and records events and statuses.
type harness struct {
	t      *testing.T
	bus    *bus.Memory
	mu     sync.Mutex
	events []events.ClockEvent
	status map[string]protocol.Status
}

func newHarness(t *testing.T, ids ...string) *harness {
	t.Helper()
	h := &harness{t: t, bus: bus.NewMemory(), status: map[string]protocol.Status{}}
	t.Cleanup(h.bus.Close)
	_, _ = h.bus.Subscribe(protocol.EventsWildcard, func(_ string, data []byte) {
		var e events.ClockEvent
		if err := json.Unmarshal(data, &e); err != nil {
			t.Errorf("bad event: %v", err)
			return
		}
		if err := e.Validate(); err != nil {
			t.Errorf("invalid event: %v", err)
		}
		h.mu.Lock()
		h.events = append(h.events, e)
		h.mu.Unlock()
	})
	_, _ = h.bus.Subscribe(protocol.StatusWildcard, func(_ string, data []byte) {
		var s protocol.Status
		_ = json.Unmarshal(data, &s)
		h.mu.Lock()
		h.status[s.ID] = s
		h.mu.Unlock()
	})
	for _, id := range ids {
		n := New(id, h.bus)
		if err := n.Start(); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(n.Close)
	}
	return h
}

func (h *harness) cmd(id string, c protocol.Command) {
	data, _ := json.Marshal(c)
	_ = h.bus.Publish(protocol.CtlSubject(id), data)
}

// waitEvents waits until at least n events were recorded and returns a copy.
func (h *harness) waitEvents(n int) []events.ClockEvent {
	h.t.Helper()
	var out []events.ClockEvent
	h.eventually(func() bool {
		h.mu.Lock()
		defer h.mu.Unlock()
		out = append([]events.ClockEvent(nil), h.events...)
		return len(out) >= n
	}, "events")
	return out
}

func (h *harness) waitStatus(id string, ok func(protocol.Status) bool) protocol.Status {
	h.t.Helper()
	var st protocol.Status
	h.eventually(func() bool {
		h.mu.Lock()
		defer h.mu.Unlock()
		st = h.status[id]
		return ok(st)
	}, "status of "+id)
	return st
}

func (h *harness) eventually(cond func() bool, what string) {
	h.t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	h.t.Fatalf("timed out waiting for %s", what)
}

// settle gives in-flight messages time to arrive when asserting that nothing happens.
func settle() { time.Sleep(100 * time.Millisecond) }

func find(evs []events.ClockEvent, process string, kind events.Kind) []events.ClockEvent {
	var out []events.ClockEvent
	for _, e := range evs {
		if e.Process == process && e.Kind == kind {
			out = append(out, e)
		}
	}
	return out
}

func TestAutoSendReceive(t *testing.T) {
	h := newHarness(t, "P1", "P2")
	h.cmd("P1", protocol.Command{Type: protocol.CmdSend, To: "P2"})
	evs := h.waitEvents(2)

	send := find(evs, "P1", events.Send)[0]
	recv := find(evs, "P2", events.Receive)[0]
	if send.Lamport != 1 || send.Vector["P1"] != 1 || send.Peer != "P2" {
		t.Errorf("send = %+v", send)
	}
	if recv.Lamport != 2 || recv.Vector["P1"] != 1 || recv.Vector["P2"] != 1 {
		t.Errorf("receive = %+v", recv)
	}
	if send.MsgID != recv.MsgID || recv.Peer != "P1" {
		t.Errorf("send/receive not linked: %+v %+v", send, recv)
	}
	if clock.Compare(send.Vector, recv.Vector) != clock.Before {
		t.Error("send should happen-before receive")
	}
	if send.ID != "P1:0" || recv.ID != "P2:0" {
		t.Errorf("ids = %s, %s", send.ID, recv.ID)
	}
}

func TestManualModeHoldsUntilDeliver(t *testing.T) {
	h := newHarness(t, "P1", "P2")
	h.cmd("P2", protocol.Command{Type: protocol.CmdSetMode, Mode: protocol.ModeManual})
	h.waitStatus("P2", func(s protocol.Status) bool { return s.Mode == protocol.ModeManual })

	h.cmd("P1", protocol.Command{Type: protocol.CmdSend, To: "P2"})
	st := h.waitStatus("P2", func(s protocol.Status) bool { return len(s.Pending) == 1 })
	settle()
	if got := h.waitEvents(1); len(find(got, "P2", events.Receive)) != 0 {
		t.Fatal("message was delivered before the deliver command")
	}

	h.cmd("P2", protocol.Command{Type: protocol.CmdDeliver, MsgID: st.Pending[0].MsgID})
	evs := h.waitEvents(2)
	if len(find(evs, "P2", events.Receive)) != 1 {
		t.Fatal("expected one receive after deliver")
	}
	h.waitStatus("P2", func(s protocol.Status) bool { return len(s.Pending) == 0 })
}

func TestManualDeliveryReordersMessages(t *testing.T) {
	h := newHarness(t, "P1", "P2")
	h.cmd("P2", protocol.Command{Type: protocol.CmdSetMode, Mode: protocol.ModeManual})
	h.waitStatus("P2", func(s protocol.Status) bool { return s.Mode == protocol.ModeManual })

	h.cmd("P1", protocol.Command{Type: protocol.CmdSend, To: "P2"}) // P1-m1
	h.cmd("P1", protocol.Command{Type: protocol.CmdSend, To: "P2"}) // P1-m2
	h.waitStatus("P2", func(s protocol.Status) bool { return len(s.Pending) == 2 })

	// Deliver in the opposite order to the sends.
	h.cmd("P2", protocol.Command{Type: protocol.CmdDeliver, MsgID: "P1-m2"})
	h.cmd("P2", protocol.Command{Type: protocol.CmdDeliver, MsgID: "P1-m1"})
	evs := h.waitEvents(4)

	recvs := find(evs, "P2", events.Receive)
	if len(recvs) != 2 || recvs[0].MsgID != "P1-m2" || recvs[1].MsgID != "P1-m1" {
		t.Fatalf("receives = %+v", recvs)
	}
	// The vector clock still knows m1's send happened before m2's.
	sends := find(evs, "P1", events.Send)
	if clock.Compare(sends[0].Vector, sends[1].Vector) != clock.Before {
		t.Error("first send should happen-before second send")
	}
}

func TestDropRemovesHeldMessage(t *testing.T) {
	h := newHarness(t, "P1", "P2")
	h.cmd("P2", protocol.Command{Type: protocol.CmdSetMode, Mode: protocol.ModeManual})
	h.waitStatus("P2", func(s protocol.Status) bool { return s.Mode == protocol.ModeManual })
	h.cmd("P1", protocol.Command{Type: protocol.CmdSend, To: "P2"})
	h.waitStatus("P2", func(s protocol.Status) bool { return len(s.Pending) == 1 })

	h.cmd("P2", protocol.Command{Type: protocol.CmdDrop, MsgID: "P1-m1"})
	h.waitStatus("P2", func(s protocol.Status) bool { return len(s.Pending) == 0 })
	settle()
	if len(find(h.waitEvents(1), "P2", events.Receive)) != 0 {
		t.Fatal("dropped message must not produce a receive")
	}
}

func TestSwitchingToAutoDeliversHeld(t *testing.T) {
	h := newHarness(t, "P1", "P2")
	h.cmd("P2", protocol.Command{Type: protocol.CmdSetMode, Mode: protocol.ModeManual})
	h.waitStatus("P2", func(s protocol.Status) bool { return s.Mode == protocol.ModeManual })
	h.cmd("P1", protocol.Command{Type: protocol.CmdSend, To: "P2"})
	h.waitStatus("P2", func(s protocol.Status) bool { return len(s.Pending) == 1 })

	h.cmd("P2", protocol.Command{Type: protocol.CmdSetMode, Mode: protocol.ModeAuto})
	if evs := h.waitEvents(2); len(find(evs, "P2", events.Receive)) != 1 {
		t.Fatal("expected held message to be delivered on switch to auto")
	}
}

func TestDuplicateMessageDiscarded(t *testing.T) {
	h := newHarness(t, "P2")
	msg, _ := json.Marshal(protocol.AppMessage{
		MsgID: "X-m1", From: "X", To: "P2", Lamport: 3, Vector: map[string]uint64{"X": 3},
	})
	_ = h.bus.Publish(protocol.InboxSubject("P2"), msg)
	_ = h.bus.Publish(protocol.InboxSubject("P2"), msg)
	h.waitEvents(1)
	settle()
	evs := h.waitEvents(1)
	if len(evs) != 1 {
		t.Fatalf("duplicate was delivered: %d events", len(evs))
	}
	if evs[0].Lamport != 4 {
		t.Errorf("lamport = %d, want max(0,3)+1 = 4", evs[0].Lamport)
	}
}

func TestPartitionDropsMessages(t *testing.T) {
	h := newHarness(t, "P1", "P2")
	h.cmd("P1", protocol.Command{Type: protocol.CmdSetPartition, Peers: []string{"P2"}})
	h.waitStatus("P1", func(s protocol.Status) bool { return len(s.Partition) == 1 })

	h.cmd("P1", protocol.Command{Type: protocol.CmdSend, To: "P2"})
	h.waitEvents(1)
	settle()
	evs := h.waitEvents(1)
	if len(find(evs, "P1", events.Send)) != 1 || len(find(evs, "P2", events.Receive)) != 0 {
		t.Fatalf("partitioned send should still be a send event with no receive: %+v", evs)
	}

	// Receiver-side partition also drops.
	h.cmd("P1", protocol.Command{Type: protocol.CmdSetPartition, Peers: nil})
	h.cmd("P2", protocol.Command{Type: protocol.CmdSetPartition, Peers: []string{"P1"}})
	h.waitStatus("P2", func(s protocol.Status) bool { return len(s.Partition) == 1 })
	h.cmd("P1", protocol.Command{Type: protocol.CmdSend, To: "P2"})
	h.waitEvents(2)
	settle()
	if len(find(h.waitEvents(2), "P2", events.Receive)) != 0 {
		t.Fatal("receiver-side partition should drop the message")
	}
}

func TestLocalEventAndReset(t *testing.T) {
	h := newHarness(t, "P1")
	h.cmd("P1", protocol.Command{Type: protocol.CmdLocal})
	h.cmd("P1", protocol.Command{Type: protocol.CmdLocal})
	evs := h.waitEvents(2)
	if evs[0].Lamport != 1 || evs[1].Lamport != 2 || evs[1].Seq != 1 {
		t.Fatalf("events = %+v", evs)
	}

	h.cmd("P1", protocol.Command{Type: protocol.CmdReset})
	h.cmd("P1", protocol.Command{Type: protocol.CmdLocal})
	evs = h.waitEvents(3)
	if last := evs[2]; last.Seq != 0 || last.Lamport != 1 || last.ID != "P1:0" {
		t.Fatalf("after reset: %+v", last)
	}
}

func TestStopClosesDone(t *testing.T) {
	b := bus.NewMemory()
	defer b.Close()
	n := New("P1", b)
	if err := n.Start(); err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(protocol.Command{Type: protocol.CmdStop})
	_ = b.Publish(protocol.CtlSubject("P1"), data)
	select {
	case <-n.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("node did not stop")
	}
}
