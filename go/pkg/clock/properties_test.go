package clock

import (
	"fmt"
	"math/rand"
	"testing"
)

type ev struct {
	lamport uint64
	vector  Vector
	preds   []int // direct causal predecessors: program order + matching send
}

type msg struct {
	to      string
	lamport uint64
	vector  Vector
	sendIdx int
}

// randomExecution builds a random execution; receives pick a random in-flight
// message, so messages may be reordered.
func randomExecution(seed int64, nProcs, nSteps int) []ev {
	rng := rand.New(rand.NewSource(seed))
	procs := make([]string, nProcs)
	for i := range procs {
		procs[i] = fmt.Sprintf("P%d", i+1)
	}
	lam := map[string]*Lamport{}
	vec := map[string]*VectorClock{}
	for _, p := range procs {
		lam[p] = &Lamport{}
		vec[p] = NewVectorClock(p, procs...)
	}
	last := map[string]int{}
	var inflight []msg
	var events []ev

	push := func(p string, l uint64, v Vector, extra int) int {
		var preds []int
		if prev, ok := last[p]; ok {
			preds = append(preds, prev)
		}
		if extra >= 0 {
			preds = append(preds, extra)
		}
		events = append(events, ev{l, v, preds})
		last[p] = len(events) - 1
		return len(events) - 1
	}

	for s := 0; s < nSteps; s++ {
		p := procs[rng.Intn(nProcs)]
		roll := rng.Float64()
		var mine []int
		for i, m := range inflight {
			if m.to == p {
				mine = append(mine, i)
			}
		}
		switch {
		case roll < 0.35 && len(mine) > 0:
			i := mine[rng.Intn(len(mine))]
			m := inflight[i]
			inflight = append(inflight[:i], inflight[i+1:]...)
			push(p, lam[p].Receive(m.lamport), vec[p].Receive(m.vector), m.sendIdx)
		case roll < 0.7 && nProcs > 1:
			var to string
			for {
				to = procs[rng.Intn(nProcs)]
				if to != p {
					break
				}
			}
			l, v := lam[p].Tick(), vec[p].Tick()
			idx := push(p, l, v, -1)
			inflight = append(inflight, msg{to, l, v, idx})
		default:
			push(p, lam[p].Tick(), vec[p].Tick(), -1)
		}
	}
	return events
}

// ancestors[j][i] is true iff event i happened-before event j (ground truth).
func ancestors(events []ev) [][]bool {
	anc := make([][]bool, len(events))
	for j, e := range events {
		row := make([]bool, len(events))
		for _, p := range e.preds {
			row[p] = true
			for i, v := range anc[p] {
				if v {
					row[i] = true
				}
			}
		}
		anc[j] = row
	}
	return anc
}

func TestHappenedBeforeLaws(t *testing.T) {
	for seed := int64(1); seed <= 200; seed++ {
		nProcs := 2 + int(seed%4)
		events := randomExecution(seed, nProcs, 60)
		anc := ancestors(events)
		for j := range events {
			for i := range events {
				if i == j {
					continue
				}
				hbAB, hbBA := anc[j][i], anc[i][j]
				order := Compare(events[i].vector, events[j].vector)

				// Lamport clock condition: a -> b implies L(a) < L(b).
				if hbAB && events[i].lamport >= events[j].lamport {
					t.Fatalf("seed %d: lamport violated %d->%d", seed, i, j)
				}
				// Vector clocks characterize causality exactly.
				if (order == Before) != hbAB || (order == After) != hbBA ||
					(order == Concurrent) != (!hbAB && !hbBA) {
					t.Fatalf("seed %d: events %d,%d: got %s, hb=%v/%v", seed, i, j, order, hbAB, hbBA)
				}
			}
		}
	}
}

func TestLamportMisleadsSomewhere(t *testing.T) {
	for seed := int64(1); seed <= 50; seed++ {
		events := randomExecution(seed, 3, 40)
		for _, a := range events {
			for _, b := range events {
				if a.lamport < b.lamport && Compare(a.vector, b.vector) == Concurrent {
					return
				}
			}
		}
	}
	t.Fatal("expected a pair where L(a) < L(b) but a and b are concurrent")
}

func TestConcurrentUse(t *testing.T) {
	var l Lamport
	c := NewVectorClock("a", "a", "b")
	done := make(chan struct{})
	for i := 0; i < 8; i++ {
		go func() {
			for j := 0; j < 100; j++ {
				l.Tick()
				c.Receive(Vector{"b": uint64(j)})
			}
			done <- struct{}{}
		}()
	}
	for i := 0; i < 8; i++ {
		<-done
	}
	if l.Value() != 800 {
		t.Fatalf("lamport = %d, want 800", l.Value())
	}
	if got := c.Snapshot()["a"]; got != 800 {
		t.Fatalf("vector[a] = %d, want 800", got)
	}
}
