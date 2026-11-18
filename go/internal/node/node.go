package node

import (
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"sync"
	"time"

	"github.com/clocklens/clocklens/pkg/bus"
	"github.com/clocklens/clocklens/pkg/clock"
	"github.com/clocklens/clocklens/pkg/events"
	"github.com/clocklens/clocklens/pkg/protocol"
)

// Node is one process: it keeps its own Lamport and vector clocks, exchanges messages
// with other nodes through the bus, and reports every event it performs.
//
// All state changes happen under n.mu, so events are numbered and published in the
// order the node performed them.
type Node struct {
	id  string
	bus bus.Bus
	now func() time.Time

	mu        sync.Mutex
	lamport   *clock.Lamport
	vector    *clock.VectorClock
	seq       uint64
	msgN      uint64
	mode      protocol.Mode
	partition map[string]bool       // peers we are cut off from (both directions)
	held      []protocol.AppMessage // manual mode: received but not yet delivered, in arrival order
	seen      map[string]bool       // msgIds already accepted, for duplicate discard

	subs     []bus.Subscription
	stopped  chan struct{}
	stopOnce sync.Once
}

// New creates a node. Call Start to connect it to the bus.
func New(id string, b bus.Bus) *Node {
	n := &Node{id: id, bus: b, now: time.Now, stopped: make(chan struct{})}
	n.resetLocked()

	return n
}

// ID returns the node's process id.
func (n *Node) ID() string { return n.id }

// Done is closed when the node receives a stop command.
func (n *Node) Done() <-chan struct{} { return n.stopped }

// Start subscribes to the node's control and inbox subjects and announces the node.
func (n *Node) Start() error {
	ctl, err := n.bus.Subscribe(protocol.CtlSubject(n.id), n.handleCtl)
	if err != nil {
		return err
	}

	inbox, err := n.bus.Subscribe(protocol.InboxSubject(n.id), n.handleInbox)
	if err != nil {
		_ = ctl.Unsubscribe()

		return err
	}

	discover, err := n.bus.Subscribe(protocol.SubjectDiscover, func(string, []byte) { n.announce() })
	if err != nil {
		_ = ctl.Unsubscribe()
		_ = inbox.Unsubscribe()

		return err
	}

	n.subs = []bus.Subscription{ctl, inbox, discover}

	// This is a fresh start: tell the server so it can begin a new run.
	n.announceHello(true)

	return nil
}

// announce answers a discovery request (the node did not just start).
func (n *Node) announce() { n.announceHello(false) }

// announceHello tells the server this node exists and what its current status is.
func (n *Node) announceHello(started bool) {
	n.publish(protocol.SubjectHello, protocol.Hello{ID: n.id, Started: started})

	n.mu.Lock()
	n.publishStatusLocked()
	n.mu.Unlock()
}

// Close unsubscribes the node. The bus itself is owned by the caller.
func (n *Node) Close() {
	for _, s := range n.subs {
		_ = s.Unsubscribe()
	}
}

// resetLocked returns the node to a fresh state: new clocks, no held messages.
func (n *Node) resetLocked() {
	n.lamport = &clock.Lamport{}
	n.vector = clock.NewVectorClock(n.id)

	n.seq = 0
	n.msgN = 0

	n.mode = protocol.ModeAuto
	n.partition = map[string]bool{}
	n.held = nil
	n.seen = map[string]bool{}
}

// handleCtl executes one command from the server.
func (n *Node) handleCtl(_ string, data []byte) {
	var cmd protocol.Command
	if err := json.Unmarshal(data, &cmd); err != nil {
		log.Printf("node %s: bad command: %v", n.id, err)

		return
	}

	n.mu.Lock()
	defer n.mu.Unlock()

	switch cmd.Type {
	case protocol.CmdLocal:
		n.emitLocked(events.Local, "", "", n.lamport.Tick(), n.vector.Tick())

	case protocol.CmdSend:
		n.sendLocked(cmd.To)

	case protocol.CmdDeliver:
		if msg, ok := n.takeHeldLocked(cmd.MsgID); ok {
			n.deliverLocked(msg)
			n.publishStatusLocked()
		}

	case protocol.CmdDrop:
		if _, ok := n.takeHeldLocked(cmd.MsgID); ok {
			n.publishStatusLocked()
		}

	case protocol.CmdSetMode:
		n.setModeLocked(cmd.Mode)

	case protocol.CmdSetPartition:
		n.partition = map[string]bool{}
		for _, p := range cmd.Peers {
			n.partition[p] = true
		}

		n.publishStatusLocked()

	case protocol.CmdReset:
		n.resetLocked()
		n.publishStatusLocked()

	case protocol.CmdStop:
		n.stopOnce.Do(func() { close(n.stopped) })

	default:
		log.Printf("node %s: unknown command %q", n.id, cmd.Type)
	}
}

// handleInbox accepts an application message from another node: it is delivered at
// once in auto mode, or held until the user decides in manual mode.
func (n *Node) handleInbox(_ string, data []byte) {
	var msg protocol.AppMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Printf("node %s: bad message: %v", n.id, err)

		return
	}

	n.mu.Lock()
	defer n.mu.Unlock()

	if msg.To != n.id || n.seen[msg.MsgID] || n.partition[msg.From] {
		return // not for us, duplicate, or cut off by a partition
	}

	n.seen[msg.MsgID] = true

	if n.mode == protocol.ModeAuto {
		n.deliverLocked(msg)

		return
	}

	n.held = append(n.held, msg)
	n.publishStatusLocked()
}

// sendLocked performs a send event and puts the message on the target's inbox. If we
// are partitioned from the target the send still happens but the message is lost.
func (n *Node) sendLocked(to string) {
	if to == "" || to == n.id {
		log.Printf("node %s: invalid send target %q", n.id, to)

		return
	}

	// Sending counts as an event, so both clocks tick first.
	l, v := n.lamport.Tick(), n.vector.Tick()

	n.msgN++
	msgID := fmt.Sprintf("%s-m%d", n.id, n.msgN)

	n.emitLocked(events.Send, to, msgID, l, v)

	if n.partition[to] {
		return
	}

	n.publish(protocol.InboxSubject(to), protocol.AppMessage{
		MsgID: msgID, From: n.id, To: to, Lamport: l, Vector: v,
	})
}

// deliverLocked performs the receive event for msg.
func (n *Node) deliverLocked(msg protocol.AppMessage) {
	l := n.lamport.Receive(msg.Lamport)
	v := n.vector.Receive(msg.Vector)

	n.emitLocked(events.Receive, msg.From, msg.MsgID, l, v)
}

// takeHeldLocked removes and returns the held message with the given id.
func (n *Node) takeHeldLocked(msgID string) (protocol.AppMessage, bool) {
	for i, m := range n.held {
		if m.MsgID == msgID {
			n.held = append(n.held[:i], n.held[i+1:]...)

			return m, true
		}
	}

	return protocol.AppMessage{}, false
}

// setModeLocked switches between auto and manual delivery. Going back to auto
// delivers everything that was being held.
func (n *Node) setModeLocked(mode protocol.Mode) {
	if mode != protocol.ModeAuto && mode != protocol.ModeManual {
		log.Printf("node %s: invalid mode %q", n.id, mode)

		return
	}

	n.mode = mode

	if mode == protocol.ModeAuto {
		held := n.held
		n.held = nil

		for _, m := range held {
			n.deliverLocked(m)
		}
	}

	n.publishStatusLocked()
}

// emitLocked numbers an event and publishes it.
func (n *Node) emitLocked(kind events.Kind, peer, msgID string, l uint64, v clock.Vector) {
	e := events.ClockEvent{
		ID: events.MakeID(n.id, n.seq), Process: n.id, Seq: n.seq, Kind: kind,
		Lamport: l, Vector: v, Peer: peer, MsgID: msgID, WallTime: n.now().UnixMilli(),
	}

	n.seq++

	n.publish(protocol.EventsSubject(n.id), e)
}

// publishStatusLocked publishes the node's mode, cut-off peers and held messages.
func (n *Node) publishStatusLocked() {
	st := protocol.Status{ID: n.id, Mode: n.mode, Partition: []string{}, Pending: []protocol.Pending{}}

	for p := range n.partition {
		st.Partition = append(st.Partition, p)
	}

	// Map order is random; sort so the status is stable.
	sort.Strings(st.Partition)

	for _, m := range n.held {
		st.Pending = append(st.Pending, protocol.Pending{MsgID: m.MsgID, From: m.From})
	}

	n.publish(protocol.StatusSubject(n.id), st)
}

// publish encodes payload as JSON and sends it; failures are logged, not returned.
func (n *Node) publish(subject string, payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		log.Printf("node %s: marshal: %v", n.id, err)

		return
	}

	if err := n.bus.Publish(subject, data); err != nil {
		log.Printf("node %s: publish %s: %v", n.id, subject, err)
	}
}
