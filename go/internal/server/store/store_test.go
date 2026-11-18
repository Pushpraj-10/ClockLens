package store

import (
	"testing"

	"github.com/clocklens/clocklens/pkg/events"
)

func ev(id string) events.ClockEvent {
	return events.ClockEvent{ID: id, Process: "P1", Kind: events.Local, Vector: map[string]uint64{"P1": 1}}
}

func TestAddDeduplicates(t *testing.T) {
	s := New()
	if !s.Add(ev("P1:0")) {
		t.Fatal("first add should be new")
	}
	if s.Add(ev("P1:0")) {
		t.Fatal("duplicate id should be ignored")
	}
	if got := len(s.All()); got != 1 {
		t.Fatalf("len = %d", got)
	}
}

func TestResetAllowsSameIDsAgain(t *testing.T) {
	s := New()
	s.Add(ev("P1:0"))
	s.Reset()
	if len(s.All()) != 0 {
		t.Fatal("reset should empty the store")
	}
	if !s.Add(ev("P1:0")) {
		t.Fatal("id should be reusable after reset")
	}
}

func TestAllReturnsCopy(t *testing.T) {
	s := New()
	s.Add(ev("P1:0"))
	all := s.All()
	all[0].ID = "mutated"
	if s.All()[0].ID != "P1:0" {
		t.Fatal("All must return a copy")
	}
}

func TestReplaceValidatesBeforeChanging(t *testing.T) {
	s := New()
	s.Add(ev("P1:0"))
	bad := ev("")
	if err := s.Replace([]events.ClockEvent{ev("P2:0"), bad}); err == nil {
		t.Fatal("expected validation error")
	}
	if all := s.All(); len(all) != 1 || all[0].ID != "P1:0" {
		t.Fatalf("store changed on failed replace: %+v", all)
	}
	if err := s.Replace([]events.ClockEvent{ev("P2:0")}); err != nil {
		t.Fatal(err)
	}
	if all := s.All(); len(all) != 1 || all[0].ID != "P2:0" {
		t.Fatalf("replace result: %+v", all)
	}
}

func TestMarshalParseRoundTrip(t *testing.T) {
	in := []events.ClockEvent{ev("P1:0"), {
		ID: "P1:1", Process: "P1", Seq: 1, Kind: events.Send, Peer: "P2", MsgID: "P1-m1",
		Lamport: 2, Vector: map[string]uint64{"P1": 2},
	}}
	data, err := Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	out, err := Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 || out[1].MsgID != "P1-m1" || out[1].Vector["P1"] != 2 {
		t.Fatalf("round trip = %+v", out)
	}
}

func TestParseRejectsBadInput(t *testing.T) {
	if _, err := Parse([]byte("not json")); err == nil {
		t.Error("expected error for invalid json")
	}
	if _, err := Parse([]byte(`[{"id":"x"}]`)); err == nil {
		t.Error("expected error for invalid event")
	}
	if data, _ := Marshal(nil); string(data) != "[]" {
		t.Errorf("Marshal(nil) = %s, want []", data)
	}
}
