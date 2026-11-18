package events

import "testing"

func TestValidate(t *testing.T) {
	ok := ClockEvent{ID: "P1:0", Process: "P1", Kind: Local, Vector: map[string]uint64{"P1": 1}}
	send := ClockEvent{ID: "P1:1", Process: "P1", Kind: Send, Peer: "P2", MsgID: "P1-m1", Vector: map[string]uint64{"P1": 2}}

	cases := []struct {
		name    string
		mutate  func(e ClockEvent) ClockEvent
		base    ClockEvent
		wantErr bool
	}{
		{"valid local", func(e ClockEvent) ClockEvent { return e }, ok, false},
		{"valid send", func(e ClockEvent) ClockEvent { return e }, send, false},
		{"empty id", func(e ClockEvent) ClockEvent { e.ID = ""; return e }, ok, true},
		{"empty process", func(e ClockEvent) ClockEvent { e.Process = ""; return e }, ok, true},
		{"nil vector", func(e ClockEvent) ClockEvent { e.Vector = nil; return e }, ok, true},
		{"unknown kind", func(e ClockEvent) ClockEvent { e.Kind = "teleport"; return e }, ok, true},
		{"send without peer", func(e ClockEvent) ClockEvent { e.Peer = ""; return e }, send, true},
		{"send without msgId", func(e ClockEvent) ClockEvent { e.MsgID = ""; return e }, send, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := c.mutate(c.base).Validate()
			if (err != nil) != c.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, c.wantErr)
			}
		})
	}
}

func TestMakeID(t *testing.T) {
	if got := MakeID("P2", 7); got != "P2:7" {
		t.Fatalf("MakeID = %q", got)
	}
}
