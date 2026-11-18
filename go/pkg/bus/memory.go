package bus

import (
	"strings"
	"sync"
)

// Memory is an in-process Bus with NATS-style subject matching ("*" matches one
// token, ">" matches one or more trailing tokens).
type Memory struct {
	mu     sync.Mutex
	subs   map[*memSub]struct{}
	closed bool
}

type memMsg struct {
	subject string
	data    []byte
}

type memSub struct {
	pattern []string
	h       Handler
	owner   *Memory

	mu     sync.Mutex
	cond   *sync.Cond
	queue  []memMsg
	closed bool
}

// NewMemory returns an empty in-memory bus.
func NewMemory() *Memory {
	return &Memory{subs: map[*memSub]struct{}{}}
}

func (m *Memory) Publish(subject string, data []byte) error {
	m.mu.Lock()
	var targets []*memSub
	for s := range m.subs {
		if match(s.pattern, strings.Split(subject, ".")) {
			targets = append(targets, s)
		}
	}
	m.mu.Unlock()
	for _, s := range targets {
		s.push(memMsg{subject, append([]byte(nil), data...)})
	}
	return nil
}

func (m *Memory) Subscribe(subject string, h Handler) (Subscription, error) {
	s := &memSub{pattern: strings.Split(subject, "."), h: h, owner: m}
	s.cond = sync.NewCond(&s.mu)
	m.mu.Lock()
	m.subs[s] = struct{}{}
	m.mu.Unlock()
	go s.run()
	return s, nil
}

func (m *Memory) Close() {
	m.mu.Lock()
	subs := make([]*memSub, 0, len(m.subs))
	for s := range m.subs {
		subs = append(subs, s)
	}
	m.closed = true
	m.mu.Unlock()
	for _, s := range subs {
		_ = s.Unsubscribe()
	}
}

func (s *memSub) push(msg memMsg) {
	s.mu.Lock()
	if !s.closed {
		s.queue = append(s.queue, msg)
		s.cond.Signal()
	}
	s.mu.Unlock()
}

func (s *memSub) run() {
	for {
		s.mu.Lock()
		for len(s.queue) == 0 && !s.closed {
			s.cond.Wait()
		}
		if s.closed {
			s.mu.Unlock()
			return
		}
		msg := s.queue[0]
		s.queue = s.queue[1:]
		s.mu.Unlock()
		s.h(msg.subject, msg.data)
	}
}

func (s *memSub) Unsubscribe() error {
	s.owner.mu.Lock()
	delete(s.owner.subs, s)
	s.owner.mu.Unlock()
	s.mu.Lock()
	s.closed = true
	s.cond.Signal()
	s.mu.Unlock()
	return nil
}

func match(pattern, subject []string) bool {
	for i, p := range pattern {
		if p == ">" {
			return len(subject) > i
		}
		if i >= len(subject) {
			return false
		}
		if p != "*" && p != subject[i] {
			return false
		}
	}
	return len(pattern) == len(subject)
}
