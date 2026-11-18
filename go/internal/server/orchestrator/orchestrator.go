package orchestrator

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"sync"

	"github.com/clocklens/clocklens/pkg/bus"
	"github.com/clocklens/clocklens/pkg/protocol"
)

var (
	// ErrUnknownNode means no node with that id has announced itself.
	ErrUnknownNode = errors.New("unknown node")

	// ErrInvalidCommand means the command is malformed.
	ErrInvalidCommand = errors.New("invalid command")
)

// Orchestrator turns UI commands into messages on node.<id>.ctl and tracks which
// nodes exist. It controls nodes but never computes clocks.
type Orchestrator struct {
	bus bus.Bus

	mu        sync.RWMutex
	nodes     map[string]struct{}
	onRestart func(id string)
}

// New creates an orchestrator publishing on b.
func New(b bus.Bus) *Orchestrator {
	return &Orchestrator{bus: b, nodes: map[string]struct{}{}}
}

// Attach starts listening for node announcements.
func (o *Orchestrator) Attach() error {
	_, err := o.bus.Subscribe(protocol.SubjectHello, func(_ string, data []byte) {
		var h protocol.Hello
		if err := json.Unmarshal(data, &h); err != nil || h.ID == "" {
			log.Printf("orchestrator: bad hello: %v", err)

			return
		}

		o.mu.Lock()
		_, wasKnown := o.nodes[h.ID]
		o.nodes[h.ID] = struct{}{}
		onRestart := o.onRestart
		o.mu.Unlock()

		// A node we already knew has started again with fresh clocks.
		if h.Started && wasKnown && onRestart != nil {
			onRestart(h.ID)
		}
	})

	return err
}

// OnNodeRestart registers f to be called when a node we already knew starts again with
// fresh clocks (its process restarted). It runs on the bus delivery goroutine.
func (o *Orchestrator) OnNodeRestart(f func(id string)) {
	o.mu.Lock()
	defer o.mu.Unlock()

	o.onRestart = f
}

// Discover asks every running node to announce itself. Call it after (re)starting the
// server, which does not remember nodes across restarts.
func (o *Orchestrator) Discover() error {
	return o.bus.Publish(protocol.SubjectDiscover, []byte("{}"))
}

// Nodes returns the ids of known nodes, sorted.
func (o *Orchestrator) Nodes() []string {
	o.mu.RLock()
	defer o.mu.RUnlock()

	ids := make([]string, 0, len(o.nodes))
	for id := range o.nodes {
		ids = append(ids, id)
	}

	sort.Strings(ids)

	return ids
}

// known reports whether a node with this id has announced itself.
func (o *Orchestrator) known(id string) bool {
	o.mu.RLock()
	defer o.mu.RUnlock()

	_, ok := o.nodes[id]

	return ok
}

// Send validates cmd and publishes it to node id.
func (o *Orchestrator) Send(id string, cmd protocol.Command) error {
	if !o.known(id) {
		return fmt.Errorf("%w: %q", ErrUnknownNode, id)
	}

	if err := o.validate(id, cmd); err != nil {
		return err
	}

	return o.publish(id, cmd)
}

// validate checks that cmd makes sense for node id.
func (o *Orchestrator) validate(id string, cmd protocol.Command) error {
	if !cmd.Type.Valid() {
		return fmt.Errorf("%w: unknown type %q", ErrInvalidCommand, cmd.Type)
	}

	switch cmd.Type {
	case protocol.CmdSend:
		if cmd.To == "" || cmd.To == id {
			return fmt.Errorf("%w: send needs a target other than the sender", ErrInvalidCommand)
		}

		if !o.known(cmd.To) {
			return fmt.Errorf("%w: send target %q", ErrUnknownNode, cmd.To)
		}

	case protocol.CmdDeliver, protocol.CmdDrop:
		if cmd.MsgID == "" {
			return fmt.Errorf("%w: %s needs msgId", ErrInvalidCommand, cmd.Type)
		}

	case protocol.CmdSetMode:
		if cmd.Mode != protocol.ModeAuto && cmd.Mode != protocol.ModeManual {
			return fmt.Errorf("%w: mode must be auto or manual", ErrInvalidCommand)
		}
	}

	return nil
}

// publish encodes cmd and sends it on the node's control subject.
func (o *Orchestrator) publish(id string, cmd protocol.Command) error {
	data, err := json.Marshal(cmd)
	if err != nil {
		return err
	}

	return o.bus.Publish(protocol.CtlSubject(id), data)
}

// ResetAll tells every known node to reset its clocks and state.
func (o *Orchestrator) ResetAll() error {
	var firstErr error

	for _, id := range o.Nodes() {
		if err := o.publish(id, protocol.Command{Type: protocol.CmdReset}); err != nil && firstErr == nil {
			firstErr = err
		}
	}

	return firstErr
}
