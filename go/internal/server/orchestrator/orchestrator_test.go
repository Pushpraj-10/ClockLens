package orchestrator

import (
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/clocklens/clocklens/pkg/bus"
	"github.com/clocklens/clocklens/pkg/protocol"
)

func setup(t *testing.T, nodes ...string) (*Orchestrator, *bus.Memory) {
	t.Helper()
	b := bus.NewMemory()
	t.Cleanup(b.Close)
	o := New(b)
	if err := o.Attach(); err != nil {
		t.Fatal(err)
	}
	for _, id := range nodes {
		data, _ := json.Marshal(protocol.Hello{ID: id})
		_ = b.Publish(protocol.SubjectHello, data)
	}
	deadline := time.Now().Add(time.Second)
	for len(o.Nodes()) < len(nodes) {
		if time.Now().After(deadline) {
			t.Fatal("nodes did not register")
		}
		time.Sleep(5 * time.Millisecond)
	}
	return o, b
}

func TestHelloRegistersNodesSorted(t *testing.T) {
	o, _ := setup(t, "P3", "P1", "P2")
	got := o.Nodes()
	if len(got) != 3 || got[0] != "P1" || got[1] != "P2" || got[2] != "P3" {
		t.Fatalf("nodes = %v", got)
	}
}

func TestOnNodeRestartFiresOnlyForKnownNodeStartingFresh(t *testing.T) {
	o, b := setup(t, "P1")
	var mu sync.Mutex
	var restarted []string
	o.OnNodeRestart(func(id string) {
		mu.Lock()
		defer mu.Unlock()
		restarted = append(restarted, id)
	})
	hello := func(h protocol.Hello) {
		data, _ := json.Marshal(h)
		_ = b.Publish(protocol.SubjectHello, data)
		time.Sleep(50 * time.Millisecond)
	}
	got := func() []string {
		mu.Lock()
		defer mu.Unlock()
		return append([]string{}, restarted...)
	}

	hello(protocol.Hello{ID: "P2", Started: true}) // new node: not a restart
	hello(protocol.Hello{ID: "P1"})                // answer to a discover: not a restart
	if len(got()) != 0 {
		t.Fatalf("unexpected restart callbacks: %v", got())
	}
	hello(protocol.Hello{ID: "P1", Started: true}) // known node started again: restart
	if r := got(); len(r) != 1 || r[0] != "P1" {
		t.Fatalf("restart callbacks = %v, want [P1]", r)
	}
}

func TestSendValidation(t *testing.T) {
	o, _ := setup(t, "P1", "P2")
	cases := []struct {
		name string
		id   string
		cmd  protocol.Command
		want error
	}{
		{"unknown node", "P9", protocol.Command{Type: protocol.CmdLocal}, ErrUnknownNode},
		{"unknown type", "P1", protocol.Command{Type: "explode"}, ErrInvalidCommand},
		{"send without target", "P1", protocol.Command{Type: protocol.CmdSend}, ErrInvalidCommand},
		{"send to self", "P1", protocol.Command{Type: protocol.CmdSend, To: "P1"}, ErrInvalidCommand},
		{"send to unknown", "P1", protocol.Command{Type: protocol.CmdSend, To: "P9"}, ErrUnknownNode},
		{"deliver without msgId", "P1", protocol.Command{Type: protocol.CmdDeliver}, ErrInvalidCommand},
		{"bad mode", "P1", protocol.Command{Type: protocol.CmdSetMode, Mode: "sideways"}, ErrInvalidCommand},
		{"valid send", "P1", protocol.Command{Type: protocol.CmdSend, To: "P2"}, nil},
		{"valid mode", "P1", protocol.Command{Type: protocol.CmdSetMode, Mode: protocol.ModeManual}, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := o.Send(c.id, c.cmd)
			if !errors.Is(err, c.want) {
				t.Fatalf("err = %v, want %v", err, c.want)
			}
		})
	}
}

func TestResetAllReachesEveryNode(t *testing.T) {
	o, b := setup(t, "P1", "P2")
	var mu sync.Mutex
	got := map[string]protocol.CommandType{}
	for _, id := range []string{"P1", "P2"} {
		id := id
		_, _ = b.Subscribe(protocol.CtlSubject(id), func(_ string, data []byte) {
			var c protocol.Command
			_ = json.Unmarshal(data, &c)
			mu.Lock()
			got[id] = c.Type
			mu.Unlock()
		})
	}
	if err := o.ResetAll(); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for {
		mu.Lock()
		n := len(got)
		mu.Unlock()
		if n == 2 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("reset did not reach all nodes")
		}
		time.Sleep(5 * time.Millisecond)
	}
	if got["P1"] != protocol.CmdReset || got["P2"] != protocol.CmdReset {
		t.Fatalf("got %v", got)
	}
}
