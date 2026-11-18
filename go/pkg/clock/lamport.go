package clock

import "sync"

// Lamport is a Lamport logical clock, safe for concurrent use.
//
//	Tick (local event or send): t = t + 1
//	Receive(remote):            t = max(t, remote) + 1
//
// The behaviour is pinned by the shared test cases in contracts/clock-vectors/lamport.json.
type Lamport struct {
	mu sync.Mutex
	t  uint64
}

// Value returns the current clock value.
func (l *Lamport) Value() uint64 {
	l.mu.Lock()
	defer l.mu.Unlock()

	return l.t
}

// Tick records a local event or a send and returns the new value.
func (l *Lamport) Tick() uint64 {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.t++

	return l.t
}

// Receive records the receipt of a message stamped remote and returns the new value.
func (l *Lamport) Receive(remote uint64) uint64 {
	l.mu.Lock()
	defer l.mu.Unlock()

	if remote > l.t {
		l.t = remote
	}

	l.t++

	return l.t
}
