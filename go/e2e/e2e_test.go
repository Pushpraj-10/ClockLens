// Package e2e runs real nodes, the hub, the orchestrator and the HTTP/WebSocket API
// together on an in-memory bus, the way the deployed system runs them on NATS.
package e2e

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/clocklens/clocklens/internal/node"
	"github.com/clocklens/clocklens/internal/server/api"
	"github.com/clocklens/clocklens/internal/server/causality"
	"github.com/clocklens/clocklens/internal/server/hub"
	"github.com/clocklens/clocklens/internal/server/orchestrator"
	"github.com/clocklens/clocklens/internal/server/run"
	"github.com/clocklens/clocklens/internal/server/store"
	"github.com/clocklens/clocklens/pkg/bus"
	"github.com/clocklens/clocklens/pkg/clock"
	"github.com/clocklens/clocklens/pkg/events"
	"github.com/clocklens/clocklens/pkg/protocol"
)

type system struct {
	t   *testing.T
	url string
}

func start(t *testing.T, ids ...string) *system {
	t.Helper()
	b := bus.NewMemory()
	t.Cleanup(b.Close)

	h := hub.New(store.New())
	if err := h.Attach(b); err != nil {
		t.Fatal(err)
	}
	orch := orchestrator.New(b)
	if err := orch.Attach(); err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(api.New(h, orch, run.New(h, orch)).Handler())
	t.Cleanup(ts.Close)

	for _, id := range ids {
		n := node.New(id, b)
		if err := n.Start(); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(n.Close)
	}
	s := &system{t: t, url: ts.URL}
	s.eventually(func() bool { return len(s.nodes()) == len(ids) }, "nodes to register")
	return s
}

func (s *system) eventually(cond func() bool, what string) {
	s.t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	s.t.Fatalf("timed out waiting for %s", what)
}

func (s *system) do(method, path string, body any) (int, []byte) {
	s.t.Helper()
	var rd *bytes.Reader
	switch v := body.(type) {
	case nil:
		rd = bytes.NewReader(nil)
	case []byte:
		rd = bytes.NewReader(v)
	default:
		data, _ := json.Marshal(v)
		rd = bytes.NewReader(data)
	}
	req, _ := http.NewRequest(method, s.url+path, rd)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	defer resp.Body.Close()
	var buf bytes.Buffer
	_, _ = buf.ReadFrom(resp.Body)
	return resp.StatusCode, buf.Bytes()
}

func (s *system) cmd(id string, c protocol.Command) int {
	s.t.Helper()
	code, _ := s.do("POST", "/api/nodes/"+id+"/commands", c)
	return code
}

func (s *system) mustCmd(id string, c protocol.Command) {
	s.t.Helper()
	if code := s.cmd(id, c); code != http.StatusAccepted {
		s.t.Fatalf("command %+v to %s: status %d", c, id, code)
	}
}

type nodeView struct {
	ID     string           `json:"id"`
	Status *protocol.Status `json:"status"`
}

func (s *system) nodes() []nodeView {
	_, data := s.do("GET", "/api/nodes", nil)
	var out []nodeView
	_ = json.Unmarshal(data, &out)
	return out
}

func (s *system) events() []events.ClockEvent {
	_, data := s.do("GET", "/api/events", nil)
	var out []events.ClockEvent
	_ = json.Unmarshal(data, &out)
	return out
}

func (s *system) waitEvents(n int) []events.ClockEvent {
	s.t.Helper()
	var evs []events.ClockEvent
	s.eventually(func() bool { evs = s.events(); return len(evs) >= n }, "events")
	return evs
}

func byID(evs []events.ClockEvent, id string) events.ClockEvent {
	for _, e := range evs {
		if e.ID == id {
			return e
		}
	}
	return events.ClockEvent{}
}

// The project's core lesson: Lamport orders events that are actually concurrent;
// vector clocks do not.
func TestLamportMisleadsVectorDoesNot(t *testing.T) {
	s := start(t, "P1", "P2")
	s.mustCmd("P1", protocol.Command{Type: protocol.CmdLocal}) // P1:0  lamport 1
	s.mustCmd("P2", protocol.Command{Type: protocol.CmdLocal}) // P2:0  lamport 1
	s.mustCmd("P2", protocol.Command{Type: protocol.CmdLocal}) // P2:1  lamport 2
	evs := s.waitEvents(3)

	a, b := byID(evs, "P1:0"), byID(evs, "P2:1")
	if !(a.Lamport < b.Lamport) {
		t.Fatalf("setup: want lamport(a) < lamport(b), got %d, %d", a.Lamport, b.Lamport)
	}
	if got := clock.Compare(a.Vector, b.Vector); got != clock.Concurrent {
		t.Fatalf("vector clocks say %s, want concurrent", got)
	}
}

func waitFor(t *testing.T, cond func() bool, what string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

// A restarted server forgets everything in memory. It must find the still-running
// nodes again and start a fresh run, so the nodes' clocks match its empty store.
func TestServerRestartRediscoversNodesAndStartsFreshRun(t *testing.T) {
	b := bus.NewMemory()
	t.Cleanup(b.Close)
	for _, id := range []string{"P1", "P2"} {
		n := node.New(id, b)
		if err := n.Start(); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(n.Close)
	}

	// First server: create some history on the nodes.
	h1 := hub.New(store.New())
	if err := h1.Attach(b); err != nil {
		t.Fatal(err)
	}
	o1 := orchestrator.New(b)
	if err := o1.Attach(); err != nil {
		t.Fatal(err)
	}
	if err := o1.Discover(); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(o1.Nodes()) == 2 }, "first server to discover nodes")
	for i := 0; i < 3; i++ {
		if err := o1.Send("P1", protocol.Command{Type: protocol.CmdLocal}); err != nil {
			t.Fatal(err)
		}
	}
	time.Sleep(100 * time.Millisecond)
	if got := len(h1.Snapshot().Events); got != 3 {
		t.Fatalf("setup: first server saw %d events, want 3", got)
	}

	// "Restart": a brand new hub and orchestrator on the same bus; nodes keep running.
	h2 := hub.New(store.New())
	if err := h2.Attach(b); err != nil {
		t.Fatal(err)
	}
	o2 := orchestrator.New(b)
	if err := o2.Attach(); err != nil {
		t.Fatal(err)
	}
	if len(o2.Nodes()) != 0 {
		t.Fatal("a fresh orchestrator should know no nodes yet")
	}
	if err := run.New(h2, o2).Resync(100 * time.Millisecond); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)

	if got := o2.Nodes(); len(got) != 2 {
		t.Fatalf("rediscovered nodes = %v, want P1 and P2", got)
	}
	if st := h2.Snapshot().Statuses; len(st) != 2 {
		t.Fatalf("statuses after restart = %d, want 2", len(st))
	}
	if got := len(h2.Snapshot().Events); got != 0 {
		t.Fatalf("new run should start empty, has %d events", got)
	}

	// The node's clocks were reset: its next event is the first of the new run.
	if err := o2.Send("P1", protocol.Command{Type: protocol.CmdLocal}); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	evs := h2.Snapshot().Events
	if len(evs) != 1 || evs[0].ID != "P1:0" || evs[0].Lamport != 1 {
		t.Fatalf("first event of new run = %+v, want P1:0 with lamport 1", evs)
	}
}

// A node process that restarts mid-run has lost its clocks. Continuing the old run
// would reuse event ids (P1:0 again) that the store silently deduplicates, so the
// server starts a new run instead.
func TestNodeRestartMidRunStartsNewRun(t *testing.T) {
	b := bus.NewMemory()
	t.Cleanup(b.Close)
	h := hub.New(store.New())
	if err := h.Attach(b); err != nil {
		t.Fatal(err)
	}
	orch := orchestrator.New(b)
	if err := orch.Attach(); err != nil {
		t.Fatal(err)
	}
	runs := run.New(h, orch)
	orch.OnNodeRestart(func(string) { _ = runs.NewRun() })

	start := func() *node.Node {
		n := node.New("P1", b)
		if err := n.Start(); err != nil {
			t.Fatal(err)
		}
		return n
	}
	p1 := start()
	p2 := node.New("P2", b)
	if err := p2.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(p2.Close)
	waitFor(t, func() bool { return len(orch.Nodes()) == 2 }, "nodes to register")

	for i := 0; i < 2; i++ {
		if err := orch.Send("P1", protocol.Command{Type: protocol.CmdLocal}); err != nil {
			t.Fatal(err)
		}
	}
	if err := orch.Send("P2", protocol.Command{Type: protocol.CmdLocal}); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(h.Snapshot().Events) == 3 }, "three events")

	p1.Close()   // the P1 process dies...
	p1 = start() // ...and comes back with fresh clocks
	t.Cleanup(p1.Close)
	waitFor(t, func() bool { return len(h.Snapshot().Events) == 0 }, "new run to clear the old events")

	if err := orch.Send("P1", protocol.Command{Type: protocol.CmdLocal}); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(h.Snapshot().Events) == 1 }, "first event of the new run")
	if e := h.Snapshot().Events[0]; e.ID != "P1:0" || e.Lamport != 1 {
		t.Fatalf("first event = %+v, want P1:0 lamport 1", e)
	}
	// P2 was reset too: its first event of the new run is P2:0 again.
	if err := orch.Send("P2", protocol.Command{Type: protocol.CmdLocal}); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(h.Snapshot().Events) == 2 }, "P2 event")
	if e := h.Snapshot().Events[1]; e.ID != "P2:0" {
		t.Fatalf("P2 event = %+v, want P2:0", e)
	}
}

func TestCausalityEndpoints(t *testing.T) {
	s := start(t, "P1", "P2")
	s.mustCmd("P1", protocol.Command{Type: protocol.CmdLocal}) // P1:0  lamport 1
	s.mustCmd("P2", protocol.Command{Type: protocol.CmdLocal}) // P2:0  lamport 1
	s.mustCmd("P2", protocol.Command{Type: protocol.CmdLocal}) // P2:1  lamport 2
	s.waitEvents(3)

	var cmp causality.Comparison
	code, data := s.do("GET", "/api/compare?a=P1:0&b=P2:1", nil)
	if code != http.StatusOK {
		t.Fatalf("compare status %d: %s", code, data)
	}
	_ = json.Unmarshal(data, &cmp)
	if cmp.Relation != clock.Concurrent || !cmp.LamportMisleads {
		t.Fatalf("want concurrent with Lamport misleading, got %+v", cmp)
	}

	var rel causality.Relations
	code, data = s.do("GET", "/api/causality/P1:0", nil)
	if code != http.StatusOK {
		t.Fatalf("causality status %d: %s", code, data)
	}
	_ = json.Unmarshal(data, &rel)
	if len(rel.Concurrent) != 2 || len(rel.Past) != 0 || len(rel.Future) != 0 {
		t.Fatalf("unexpected relations %+v", rel)
	}

	var mis []causality.Misleading
	_, data = s.do("GET", "/api/misleading", nil)
	_ = json.Unmarshal(data, &mis)
	if len(mis) != 1 || mis[0].A != "P1:0" || mis[0].B != "P2:1" {
		t.Fatalf("misleading = %+v", mis)
	}

	if code, _ := s.do("GET", "/api/compare?a=P1:0", nil); code != http.StatusBadRequest {
		t.Fatalf("missing b: status %d, want 400", code)
	}
	if code, _ := s.do("GET", "/api/compare?a=P1:0&b=zzz", nil); code != http.StatusNotFound {
		t.Fatalf("unknown event: status %d, want 404", code)
	}
	if code, _ := s.do("GET", "/api/causality/zzz", nil); code != http.StatusNotFound {
		t.Fatalf("unknown event: status %d, want 404", code)
	}
}

func TestManualDeliveryThroughAPI(t *testing.T) {
	s := start(t, "P1", "P2")
	s.mustCmd("P2", protocol.Command{Type: protocol.CmdSetMode, Mode: protocol.ModeManual})
	s.mustCmd("P1", protocol.Command{Type: protocol.CmdSend, To: "P2"})
	s.mustCmd("P1", protocol.Command{Type: protocol.CmdSend, To: "P2"})

	pendingOf := func(id string) []protocol.Pending {
		for _, n := range s.nodes() {
			if n.ID == id && n.Status != nil {
				return n.Status.Pending
			}
		}
		return nil
	}
	s.eventually(func() bool { return len(pendingOf("P2")) == 2 }, "two held messages")

	s.mustCmd("P2", protocol.Command{Type: protocol.CmdDeliver, MsgID: "P1-m2"})
	s.mustCmd("P2", protocol.Command{Type: protocol.CmdDeliver, MsgID: "P1-m1"})
	evs := s.waitEvents(4)

	r0, r1 := byID(evs, "P2:0"), byID(evs, "P2:1")
	if r0.MsgID != "P1-m2" || r1.MsgID != "P1-m1" {
		t.Fatalf("receive order = %s, %s; want m2 then m1", r0.MsgID, r1.MsgID)
	}
	if clock.Compare(byID(evs, "P1:0").Vector, byID(evs, "P1:1").Vector) != clock.Before {
		t.Error("the two sends are causally ordered even though delivered reversed")
	}
}

func TestCommandErrors(t *testing.T) {
	s := start(t, "P1", "P2")
	if code := s.cmd("P9", protocol.Command{Type: protocol.CmdLocal}); code != http.StatusNotFound {
		t.Errorf("unknown node: %d, want 404", code)
	}
	if code := s.cmd("P1", protocol.Command{Type: protocol.CmdSend}); code != http.StatusBadRequest {
		t.Errorf("send without target: %d, want 400", code)
	}
	if code, _ := s.do("POST", "/api/nodes/P1/commands", []byte("{not json")); code != http.StatusBadRequest {
		t.Errorf("bad body: %d, want 400", code)
	}
}

func TestNewRunResetsEverything(t *testing.T) {
	s := start(t, "P1")
	s.mustCmd("P1", protocol.Command{Type: protocol.CmdLocal})
	s.waitEvents(1)

	if code, _ := s.do("POST", "/api/runs", nil); code != http.StatusNoContent {
		t.Fatalf("new run: %d", code)
	}
	s.eventually(func() bool { return len(s.events()) == 0 }, "store to clear")

	time.Sleep(50 * time.Millisecond) // let the node process the reset
	s.mustCmd("P1", protocol.Command{Type: protocol.CmdLocal})
	evs := s.waitEvents(1)
	if evs[0].ID != "P1:0" || evs[0].Lamport != 1 {
		t.Fatalf("after new run: %+v", evs[0])
	}
}

func TestExportImportRoundTrip(t *testing.T) {
	s := start(t, "P1", "P2")
	s.mustCmd("P1", protocol.Command{Type: protocol.CmdSend, To: "P2"})
	original := s.waitEvents(2)

	code, trace := s.do("GET", "/api/export", nil)
	if code != http.StatusOK {
		t.Fatalf("export: %d", code)
	}
	if code, _ := s.do("POST", "/api/runs", nil); code != http.StatusNoContent {
		t.Fatalf("new run: %d", code)
	}
	s.eventually(func() bool { return len(s.events()) == 0 }, "store to clear")

	if code, _ := s.do("POST", "/api/import", trace); code != http.StatusNoContent {
		t.Fatalf("import: %d", code)
	}
	imported := s.events()
	if len(imported) != len(original) {
		t.Fatalf("imported %d events, want %d", len(imported), len(original))
	}
	if code, _ := s.do("POST", "/api/import", []byte(`[{"id":"x"}]`)); code != http.StatusBadRequest {
		t.Errorf("invalid trace: %d, want 400", code)
	}
	if len(s.events()) != len(original) {
		t.Error("a rejected import must not change the stored trace")
	}
}

func TestWebSocketStreamsSnapshotThenEvents(t *testing.T) {
	s := start(t, "P1")
	s.mustCmd("P1", protocol.Command{Type: protocol.CmdLocal})
	s.waitEvents(1)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(s.url, "http")+"/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()

	read := func() hub.Message {
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var m hub.Message
		if err := json.Unmarshal(data, &m); err != nil {
			t.Fatal(err)
		}
		return m
	}

	snap := read()
	if snap.Type != hub.TypeSnapshot || len(snap.Events) != 1 {
		t.Fatalf("first message = %+v", snap)
	}

	s.mustCmd("P1", protocol.Command{Type: protocol.CmdLocal})
	for { // statuses may interleave; wait for the event
		m := read()
		if m.Type == hub.TypeEvent {
			if m.Event.ID != "P1:1" {
				t.Fatalf("event = %+v", m.Event)
			}
			return
		}
	}
}
