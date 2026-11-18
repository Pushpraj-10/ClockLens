package causality

import (
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/clocklens/clocklens/pkg/clock"
	"github.com/clocklens/clocklens/pkg/events"
)

func ev(proc string, seq uint64, kind events.Kind, lamport uint64, vec map[string]uint64, peer, msg string) events.ClockEvent {
	return events.ClockEvent{
		ID: events.MakeID(proc, seq), Process: proc, Seq: seq, Kind: kind,
		Lamport: lamport, Vector: vec, Peer: peer, MsgID: msg,
	}
}

// P1: a0 local, a1 send m1 -> P2
// P2: b0 local, b1 local, b2 receive m1
// P3: c0, c1, c2 local (never talks to anyone)
func trace() []events.ClockEvent {
	return []events.ClockEvent{
		ev("P1", 0, events.Local, 1, map[string]uint64{"P1": 1}, "", ""),
		ev("P1", 1, events.Send, 2, map[string]uint64{"P1": 2}, "P2", "m1"),
		ev("P2", 0, events.Local, 1, map[string]uint64{"P2": 1}, "", ""),
		ev("P2", 1, events.Local, 2, map[string]uint64{"P2": 2}, "", ""),
		ev("P2", 2, events.Receive, 3, map[string]uint64{"P1": 2, "P2": 3}, "P1", "m1"),
		ev("P3", 0, events.Local, 1, map[string]uint64{"P3": 1}, "", ""),
		ev("P3", 1, events.Local, 2, map[string]uint64{"P3": 2}, "", ""),
		ev("P3", 2, events.Local, 3, map[string]uint64{"P3": 3}, "", ""),
	}
}

func TestRelate(t *testing.T) {
	r, err := Relate(trace(), "P2:2")
	if err != nil {
		t.Fatal(err)
	}
	slices.Sort(r.Past)
	slices.Sort(r.Concurrent)
	if want := []string{"P1:0", "P1:1", "P2:0", "P2:1"}; !slices.Equal(r.Past, want) {
		t.Fatalf("past = %v, want %v", r.Past, want)
	}
	if len(r.Future) != 0 {
		t.Fatalf("future = %v, want none", r.Future)
	}
	if want := []string{"P3:0", "P3:1", "P3:2"}; !slices.Equal(r.Concurrent, want) {
		t.Fatalf("concurrent = %v, want %v", r.Concurrent, want)
	}
}

func TestRelateFuture(t *testing.T) {
	r, _ := Relate(trace(), "P1:1")
	if !slices.Equal(r.Future, []string{"P2:2"}) {
		t.Fatalf("future = %v, want [P2:2]", r.Future)
	}
}

func TestUnknownEvent(t *testing.T) {
	if _, err := Relate(trace(), "nope"); !errors.Is(err, ErrUnknownEvent) {
		t.Fatalf("Relate err = %v", err)
	}
	if _, err := Compare(trace(), "P1:0", "nope"); !errors.Is(err, ErrUnknownEvent) {
		t.Fatalf("Compare err = %v", err)
	}
	if _, err := Compare(trace(), "nope", "P1:0"); !errors.Is(err, ErrUnknownEvent) {
		t.Fatalf("Compare err = %v", err)
	}
}

func TestCompareBeforeHasPathAndProof(t *testing.T) {
	c, err := Compare(trace(), "P1:0", "P2:2")
	if err != nil {
		t.Fatal(err)
	}
	if c.Relation != clock.Before {
		t.Fatalf("relation = %s, want before", c.Relation)
	}
	if want := []string{"P1:0", "P1:1", "P2:2"}; !slices.Equal(c.Path, want) {
		t.Fatalf("path = %v, want %v", c.Path, want)
	}
	if c.LamportMisleads {
		t.Fatal("Lamport agrees here, should not mislead")
	}
	if !strings.Contains(strings.Join(c.Proof, " "), "happened before") {
		t.Fatalf("proof lacks verdict: %v", c.Proof)
	}
}

func TestCompareAfterIsMirror(t *testing.T) {
	c, _ := Compare(trace(), "P2:2", "P1:0")
	if c.Relation != clock.After {
		t.Fatalf("relation = %s, want after", c.Relation)
	}
	if want := []string{"P1:0", "P1:1", "P2:2"}; !slices.Equal(c.Path, want) {
		t.Fatalf("path = %v, want %v", c.Path, want)
	}
}

func TestCompareConcurrentLamportMisleads(t *testing.T) {
	// P1:0 has Lamport 1, P3:2 has Lamport 3: Lamport says "before" but they are concurrent.
	c, _ := Compare(trace(), "P1:0", "P3:2")
	if c.Relation != clock.Concurrent {
		t.Fatalf("relation = %s, want concurrent", c.Relation)
	}
	if !c.LamportMisleads || c.LamportSays != "before" {
		t.Fatalf("expected Lamport to mislead with 'before', got %+v", c)
	}
	if len(c.Path) != 0 {
		t.Fatalf("concurrent events have no path, got %v", c.Path)
	}
	if !strings.Contains(strings.Join(c.Proof, " "), "Lamport misleads") {
		t.Fatalf("proof should call out Lamport: %v", c.Proof)
	}
}

func TestCompareConcurrentLamportTie(t *testing.T) {
	c, _ := Compare(trace(), "P1:0", "P3:0") // both Lamport 1
	if c.Relation != clock.Concurrent || c.LamportMisleads || c.LamportSays != "tie" {
		t.Fatalf("unexpected: %+v", c)
	}
}

func TestCompareSameEvent(t *testing.T) {
	c, _ := Compare(trace(), "P1:0", "P1:0")
	if c.Relation != clock.Equal || c.LamportMisleads {
		t.Fatalf("unexpected: %+v", c)
	}
}

func TestMisleadingPairs(t *testing.T) {
	pairs := MisleadingPairs(trace())
	for _, p := range pairs {
		if p.LamportA >= p.LamportB {
			t.Fatalf("pair not ordered by lamport: %+v", p)
		}
	}
	has := func(a, b string) bool {
		return slices.ContainsFunc(pairs, func(p Misleading) bool { return p.A == a && p.B == b })
	}
	if !has("P1:0", "P3:2") {
		t.Fatalf("expected P1:0/P3:2 in %v", pairs)
	}
	if has("P1:0", "P3:0") {
		t.Fatalf("equal Lamport values are not misleading: %v", pairs)
	}
	if has("P1:0", "P2:2") {
		t.Fatalf("causally ordered pair flagged: %v", pairs)
	}
}

// Vector verdicts must agree with an independent reachability search over
// program-order and message edges (the definition of happened-before).
func TestVectorVerdictMatchesReachability(t *testing.T) {
	evs := trace()
	for _, a := range evs {
		for _, b := range evs {
			if a.ID == b.ID {
				continue
			}
			c, _ := Compare(evs, a.ID, b.ID)
			reachable := path(evs, a.ID, b.ID) != nil
			if reachable != (c.Relation == clock.Before) {
				t.Errorf("%s -> %s: reachable=%v but relation=%s", a.ID, b.ID, reachable, c.Relation)
			}
		}
	}
}
