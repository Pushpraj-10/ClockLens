package protocol

// NATS subjects and payloads. This package is the only coupling between the server
// and the nodes.

const (
	SubjectHello = "nodes.hello"

	// SubjectDiscover is published by a (re)started server; every node answers with
	// a hello and its current status, so the server learns who exists.
	SubjectDiscover = "nodes.discover"

	EventsWildcard = "events.>"
	StatusWildcard = "status.>"
)

// InboxSubject is where a node receives application messages from other nodes.
func InboxSubject(id string) string { return "node." + id + ".inbox" }

// CtlSubject is where a node receives commands from the server.
func CtlSubject(id string) string { return "node." + id + ".ctl" }

// EventsSubject is where a node publishes its clock events.
func EventsSubject(id string) string { return "events." + id }

// StatusSubject is where a node publishes its non-clock status.
func StatusSubject(id string) string { return "status." + id }

// AppMessage is an application message between nodes. Lamport and Vector are the
// sender's clocks at the send event.
type AppMessage struct {
	MsgID   string            `json:"msgId"`
	From    string            `json:"from"`
	To      string            `json:"to"`
	Lamport uint64            `json:"lamport"`
	Vector  map[string]uint64 `json:"vector"`
	Body    string            `json:"body,omitempty"`
}

// CommandType is a command the server sends on node.<id>.ctl.
type CommandType string

const (
	CmdLocal        CommandType = "local"
	CmdSend         CommandType = "send"          // To
	CmdDeliver      CommandType = "deliver"       // MsgID
	CmdDrop         CommandType = "drop"          // MsgID
	CmdSetMode      CommandType = "set_mode"      // Mode
	CmdSetPartition CommandType = "set_partition" // Peers
	CmdReset        CommandType = "reset"
	CmdStop         CommandType = "stop"
)

// Valid reports whether t is a known command type.
func (t CommandType) Valid() bool {
	switch t {
	case CmdLocal, CmdSend, CmdDeliver, CmdDrop, CmdSetMode, CmdSetPartition, CmdReset, CmdStop:
		return true
	}

	return false
}

// Mode is how a node handles incoming messages.
type Mode string

const (
	ModeAuto   Mode = "auto"   // deliver immediately
	ModeManual Mode = "manual" // hold until a deliver or drop command
)

// Command is the payload on node.<id>.ctl.
type Command struct {
	Type  CommandType `json:"type"`
	To    string      `json:"to,omitempty"`
	MsgID string      `json:"msgId,omitempty"`
	Mode  Mode        `json:"mode,omitempty"`
	Peers []string    `json:"peers,omitempty"`
}

// Hello is announced on nodes.hello when a node starts, and again whenever the server
// asks nodes to announce themselves.
type Hello struct {
	ID string `json:"id"`

	// Started is true only when the node process has just started, with fresh clocks.
	// A server that already knew this node must then start a new run: the node's old
	// clocks are gone, so its events could no longer continue the previous history.
	Started bool `json:"started,omitempty"`
}

// Pending is a message a node is holding in manual mode.
type Pending struct {
	MsgID string `json:"msgId"`
	From  string `json:"from"`
}

// Status is a node's non-clock state, published on status.<id>. It is not an event
// and carries no clock values.
type Status struct {
	ID        string    `json:"id"`
	Mode      Mode      `json:"mode"`
	Partition []string  `json:"partition"`
	Pending   []Pending `json:"pending"`
}
