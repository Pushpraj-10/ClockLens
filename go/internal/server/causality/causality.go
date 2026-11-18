// Package causality answers happened-before questions about a set of events.
//
// It uses only the vector clocks inside the events (never arrival order or wall
// time). Lamport values are used solely to report where they would mislead.
package causality

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/clocklens/clocklens/pkg/clock"
	"github.com/clocklens/clocklens/pkg/events"
)

// ErrUnknownEvent is returned when a requested event id is not in the set.
var ErrUnknownEvent = errors.New("causality: unknown event")

// Relations classifies every other event relative to one chosen event.
type Relations struct {
	ID         string   `json:"id"`
	Past       []string `json:"past"`       // events that happened-before ID
	Future     []string `json:"future"`     // events ID happened-before
	Concurrent []string `json:"concurrent"` // neither
}

// Comparison is the verdict for an ordered pair (A, B) with a human-readable proof.
type Comparison struct {
	A        string      `json:"a"`
	B        string      `json:"b"`
	Relation clock.Order `json:"relation"` // A relative to B: before, after, equal, concurrent

	LamportA        uint64   `json:"lamportA"`
	LamportB        uint64   `json:"lamportB"`
	LamportSays     string   `json:"lamportSays"`     // "before", "after" or "tie"
	LamportMisleads bool     `json:"lamportMisleads"` // Lamport implies an order the events do not have
	Proof           []string `json:"proof"`
	// Path is a chain of events linked by program order and messages, from the earlier
	// to the later event, when one is causally before the other.
	Path []string `json:"path,omitempty"`
}

// Misleading is a pair of concurrent events whose Lamport values still differ, so a
// reader trusting Lamport order would wrongly think one came first.
type Misleading struct {
	A        string `json:"a"` // lower Lamport value
	B        string `json:"b"` // higher Lamport value
	LamportA uint64 `json:"lamportA"`
	LamportB uint64 `json:"lamportB"`
}

// Relate classifies all events relative to id.
func Relate(evs []events.ClockEvent, id string) (Relations, error) {
	target, ok := find(evs, id)
	if !ok {
		return Relations{}, fmt.Errorf("%w: %q", ErrUnknownEvent, id)
	}
	r := Relations{ID: id, Past: []string{}, Future: []string{}, Concurrent: []string{}}
	for _, e := range evs {
		if e.ID == id {
			continue
		}
		switch clock.Compare(e.Vector, target.Vector) {
		case clock.Before:
			r.Past = append(r.Past, e.ID)
		case clock.After:
			r.Future = append(r.Future, e.ID)
		default: // concurrent (equal vectors cannot occur for distinct events of one run)
			r.Concurrent = append(r.Concurrent, e.ID)
		}
	}
	return r, nil
}

// Compare decides how events a and b relate and explains why.
func Compare(evs []events.ClockEvent, a, b string) (Comparison, error) {
	ea, ok := find(evs, a)
	if !ok {
		return Comparison{}, fmt.Errorf("%w: %q", ErrUnknownEvent, a)
	}
	eb, ok := find(evs, b)
	if !ok {
		return Comparison{}, fmt.Errorf("%w: %q", ErrUnknownEvent, b)
	}

	rel := clock.Compare(ea.Vector, eb.Vector)
	if a == b {
		rel = clock.Equal
	}
	c := Comparison{
		A: a, B: b, Relation: rel,
		LamportA: ea.Lamport, LamportB: eb.Lamport,
		LamportSays: lamportSays(ea.Lamport, eb.Lamport),
	}
	c.LamportMisleads = lamportMisleads(rel, ea.Lamport, eb.Lamport)
	c.Proof = proof(ea, eb, rel)

	switch rel {
	case clock.Before:
		c.Path = path(evs, a, b)
	case clock.After:
		c.Path = path(evs, b, a)
	}
	c.Proof = append(c.Proof, lamportNote(c)...)
	return c, nil
}

// MisleadingPairs lists every concurrent pair whose Lamport values differ, ordered
// by (lamport, id) for stable output.
func MisleadingPairs(evs []events.ClockEvent) []Misleading {
	out := []Misleading{}
	for i := range evs {
		for j := i + 1; j < len(evs); j++ {
			x, y := evs[i], evs[j]
			if x.Lamport == y.Lamport || !clock.AreConcurrent(x.Vector, y.Vector) {
				continue
			}
			if x.Lamport > y.Lamport {
				x, y = y, x
			}
			out = append(out, Misleading{A: x.ID, B: y.ID, LamportA: x.Lamport, LamportB: y.Lamport})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].LamportA != out[j].LamportA {
			return out[i].LamportA < out[j].LamportA
		}
		if out[i].A != out[j].A {
			return out[i].A < out[j].A
		}
		return out[i].B < out[j].B
	})
	return out
}

func find(evs []events.ClockEvent, id string) (events.ClockEvent, bool) {
	for _, e := range evs {
		if e.ID == id {
			return e, true
		}
	}
	return events.ClockEvent{}, false
}

func lamportSays(a, b uint64) string {
	switch {
	case a < b:
		return "before"
	case a > b:
		return "after"
	default:
		return "tie"
	}
}

// lamportMisleads is true when the Lamport comparison disagrees with the true
// relation: concurrent events with different values, or ordered events that Lamport
// does not order the same way (impossible for a correct clock, but checked anyway).
func lamportMisleads(rel clock.Order, a, b uint64) bool {
	says := lamportSays(a, b)
	switch rel {
	case clock.Concurrent:
		return says != "tie"
	case clock.Before:
		return says != "before"
	case clock.After:
		return says != "after"
	}
	return false
}

func processes(a, b clock.Vector) []string {
	set := map[string]struct{}{}
	for p := range a {
		set[p] = struct{}{}
	}
	for p := range b {
		set[p] = struct{}{}
	}
	out := make([]string, 0, len(set))
	for p := range set {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}

func proof(a, b events.ClockEvent, rel clock.Order) []string {
	if a.ID == b.ID {
		return []string{fmt.Sprintf("%s and %s are the same event.", a.ID, b.ID)}
	}
	var cells, lesser, greater []string
	for _, p := range processes(a.Vector, b.Vector) {
		x, y := a.Vector[p], b.Vector[p]
		op := "="
		switch {
		case x < y:
			op, lesser = "<", append(lesser, p)
		case x > y:
			op, greater = ">", append(greater, p)
		}
		cells = append(cells, fmt.Sprintf("%s: %d %s %d", p, x, op, y))
	}
	steps := []string{
		fmt.Sprintf("Vector of %s is %s; vector of %s is %s.", a.ID, formatVec(a.Vector), b.ID, formatVec(b.Vector)),
		"Compared entry by entry (" + a.ID + " vs " + b.ID + "): " + strings.Join(cells, "; ") + ".",
	}
	switch rel {
	case clock.Before:
		steps = append(steps, fmt.Sprintf("Every entry of %s is ≤ the matching entry of %s, and it is strictly smaller in %s. So %s happened before %s.",
			a.ID, b.ID, joinOr(lesser), a.ID, b.ID))
	case clock.After:
		steps = append(steps, fmt.Sprintf("Every entry of %s is ≤ the matching entry of %s, and it is strictly smaller in %s. So %s happened before %s.",
			b.ID, a.ID, joinOr(greater), b.ID, a.ID))
	case clock.Concurrent:
		steps = append(steps, fmt.Sprintf("%s is larger in %s, but %s is larger in %s. Neither vector is ≤ the other, so no chain of messages connects them: the events are concurrent.",
			a.ID, joinOr(greater), b.ID, joinOr(lesser)))
	case clock.Equal:
		steps = append(steps, "The vectors are identical.")
	}
	return steps
}

func lamportNote(c Comparison) []string {
	var cmp string
	switch c.LamportSays {
	case "before":
		cmp = fmt.Sprintf("%d < %d", c.LamportA, c.LamportB)
	case "after":
		cmp = fmt.Sprintf("%d > %d", c.LamportA, c.LamportB)
	default:
		cmp = fmt.Sprintf("%d = %d", c.LamportA, c.LamportB)
	}
	switch {
	case c.A == c.B:
		return nil
	case c.LamportMisleads:
		return []string{fmt.Sprintf("Lamport misleads here: the scalars (%s) suggest %s is %s %s, but the events are %s.",
			cmp, c.A, c.LamportSays, c.B, relationWord(c.Relation))}
	case c.Relation == clock.Concurrent:
		return []string{fmt.Sprintf("Lamport gives the tie %s, which happens to avoid claiming an order, but it cannot tell \"concurrent\" from \"tied\" in general.", cmp)}
	}
	return []string{fmt.Sprintf("Lamport agrees (%s).", cmp)}
}

func relationWord(r clock.Order) string {
	if r == clock.Concurrent {
		return "concurrent"
	}
	return "ordered the other way"
}

func joinOr(ps []string) string {
	if len(ps) == 0 {
		return "no entry"
	}
	return strings.Join(ps, ", ")
}

func formatVec(v clock.Vector) string {
	ps := processes(v, nil)
	parts := make([]string, len(ps))
	for i, p := range ps {
		parts[i] = fmt.Sprintf("%s=%d", p, v[p])
	}
	return "{" + strings.Join(parts, ", ") + "}"
}

// path finds a chain of events from -> to using program order and message edges.
// It is a second, independent justification of "happened-before": the vector
// verdict says it must exist, this shows it.
func path(evs []events.ClockEvent, from, to string) []string {
	byID := map[string]events.ClockEvent{}
	byPos := map[string]string{} // "process#seq" -> id
	recvByMsg := map[string]string{}
	for _, e := range evs {
		byID[e.ID] = e
		byPos[fmt.Sprintf("%s#%d", e.Process, e.Seq)] = e.ID
		if e.Kind == events.Receive {
			recvByMsg[e.MsgID] = e.ID
		}
	}
	next := func(id string) []string {
		e := byID[id]
		var out []string
		if n, ok := byPos[fmt.Sprintf("%s#%d", e.Process, e.Seq+1)]; ok {
			out = append(out, n)
		}
		if e.Kind == events.Send {
			if r, ok := recvByMsg[e.MsgID]; ok {
				out = append(out, r)
			}
		}
		return out
	}
	prev := map[string]string{from: ""}
	queue := []string{from}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		if cur == to {
			var rev []string
			for n := to; n != ""; n = prev[n] {
				rev = append(rev, n)
			}
			for i, j := 0, len(rev)-1; i < j; i, j = i+1, j-1 {
				rev[i], rev[j] = rev[j], rev[i]
			}
			return rev
		}
		for _, n := range next(cur) {
			if _, seen := prev[n]; !seen {
				prev[n] = cur
				queue = append(queue, n)
			}
		}
	}
	return nil
}
