package clock

import "sync"

// Vector maps a process id to its counter. A missing key means 0.
type Vector map[string]uint64

// Copy returns an independent copy of v.
func (v Vector) Copy() Vector {
	out := make(Vector, len(v))
	for k, n := range v {
		out[k] = n
	}
	return out
}

// Order is the relation of x to y under happened-before.
type Order string

const (
	Before     Order = "before"
	After      Order = "after"
	Equal      Order = "equal"
	Concurrent Order = "concurrent"
)

// Compare relates two vectors (missing keys count as 0).
func Compare(x, y Vector) Order {
	xLess, yLess := false, false
	check := func(k string) {
		a, b := x[k], y[k]
		if a < b {
			xLess = true
		} else if a > b {
			yLess = true
		}
	}
	for k := range x {
		check(k)
	}
	for k := range y {
		check(k)
	}
	switch {
	case xLess && yLess:
		return Concurrent
	case xLess:
		return Before
	case yLess:
		return After
	default:
		return Equal
	}
}

// HappenedBefore reports whether the event stamped x happened-before the one stamped y.
func HappenedBefore(x, y Vector) bool { return Compare(x, y) == Before }

// AreConcurrent reports whether neither event happened-before the other.
func AreConcurrent(x, y Vector) bool { return Compare(x, y) == Concurrent }

// VectorClock is the vector clock of one process, safe for concurrent use.
//
//	Tick (local event or send): v[self]++
//	Receive(remote):            v = elementwise max(v, remote); v[self]++
//
// Mirrors packages/clock/src/vector.ts; both pass contracts/clock-vectors/vector.json.
type VectorClock struct {
	mu   sync.Mutex
	self string
	v    Vector
}

// NewVectorClock creates a clock for process self. processes pre-seeds zero
// entries so snapshots list every process.
func NewVectorClock(self string, processes ...string) *VectorClock {
	v := Vector{self: 0}
	for _, p := range processes {
		v[p] = 0
	}
	return &VectorClock{self: self, v: v}
}

// Snapshot returns a copy of the current vector.
func (c *VectorClock) Snapshot() Vector {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.v.Copy()
}

// Tick records a local event or a send and returns a snapshot after the tick.
func (c *VectorClock) Tick() Vector {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.tick()
}

// Receive merges a received vector, then ticks, and returns a snapshot.
func (c *VectorClock) Receive(remote Vector) Vector {
	c.mu.Lock()
	defer c.mu.Unlock()
	for p, n := range remote {
		if n > c.v[p] {
			c.v[p] = n
		}
	}
	return c.tick()
}

func (c *VectorClock) tick() Vector {
	c.v[c.self]++
	return c.v.Copy()
}
