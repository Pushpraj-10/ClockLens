package events

import (
	"errors"
	"fmt"
)

// Kind is the type of an event.
type Kind string

const (
	Local   Kind = "local"
	Send    Kind = "send"
	Receive Kind = "receive"
)

// ClockEvent is the one event structure used everywhere. It mirrors
// contracts/event.schema.json. Missing vector keys mean 0.
type ClockEvent struct {
	ID       string            `json:"id"`
	Process  string            `json:"process"`
	Seq      uint64            `json:"seq"` // per-process order, from 0
	Kind     Kind              `json:"kind"`
	Lamport  uint64            `json:"lamport"`
	Vector   map[string]uint64 `json:"vector"`
	Peer     string            `json:"peer,omitempty"`  // other process for send/receive
	MsgID    string            `json:"msgId,omitempty"` // links a send to its receive
	Label    string            `json:"label,omitempty"`
	WallTime int64             `json:"wallTime,omitempty"` // unix ms; informational only, never used for ordering
}

// MakeID returns the canonical event id for a process and its sequence number.
func MakeID(process string, seq uint64) string {
	return fmt.Sprintf("%s:%d", process, seq)
}

// Validate checks the structural rules of the event schema.
func (e ClockEvent) Validate() error {
	// Required fields.
	switch {
	case e.ID == "":
		return errors.New("event: empty id")
	case e.Process == "":
		return errors.New("event: empty process")
	case e.Vector == nil:
		return errors.New("event: missing vector")
	}

	// A send or receive must name its peer and the message it belongs to.
	switch e.Kind {
	case Local:
	case Send, Receive:
		if e.Peer == "" || e.MsgID == "" {
			return fmt.Errorf("event %s: %s requires peer and msgId", e.ID, e.Kind)
		}
	default:
		return fmt.Errorf("event %s: unknown kind %q", e.ID, e.Kind)
	}

	return nil
}
