package bus

import (
	"strings"
	"sync"
	"testing"
	"time"
)

func TestMatch(t *testing.T) {
	cases := []struct {
		pattern, subject string
		want             bool
	}{
		{"events.>", "events.P1", true},
		{"events.>", "events", false},
		{"events.>", "events.a.b", true},
		{"node.*.ctl", "node.P1.ctl", true},
		{"node.*.ctl", "node.P1.inbox", false},
		{"node.P1.ctl", "node.P1.ctl", true},
		{"node.P1.ctl", "node.P2.ctl", false},
		{"a.b", "a.b.c", false},
	}
	for _, c := range cases {
		if got := match(strings.Split(c.pattern, "."), strings.Split(c.subject, ".")); got != c.want {
			t.Errorf("match(%q, %q) = %v, want %v", c.pattern, c.subject, got, c.want)
		}
	}
}

func TestMemoryDeliversInOrderPerSubscription(t *testing.T) {
	b := NewMemory()
	defer b.Close()
	var mu sync.Mutex
	var got []string
	done := make(chan struct{})
	_, _ = b.Subscribe("x.>", func(_ string, data []byte) {
		mu.Lock()
		got = append(got, string(data))
		n := len(got)
		mu.Unlock()
		if n == 3 {
			close(done)
		}
	})
	for _, s := range []string{"1", "2", "3"} {
		_ = b.Publish("x.a", []byte(s))
	}
	_ = b.Publish("y.a", []byte("ignored"))
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("timed out")
	}
	mu.Lock()
	defer mu.Unlock()
	if got[0] != "1" || got[1] != "2" || got[2] != "3" {
		t.Fatalf("got %v", got)
	}
}

func TestUnsubscribeStopsDelivery(t *testing.T) {
	b := NewMemory()
	defer b.Close()
	var mu sync.Mutex
	count := 0
	sub, _ := b.Subscribe("a", func(string, []byte) { mu.Lock(); count++; mu.Unlock() })
	_ = sub.Unsubscribe()
	_ = b.Publish("a", []byte("x"))
	time.Sleep(50 * time.Millisecond)
	mu.Lock()
	defer mu.Unlock()
	if count != 0 {
		t.Fatalf("received %d after unsubscribe", count)
	}
}
