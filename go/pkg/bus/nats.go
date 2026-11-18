package bus

import (
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
)

// NATS is a Bus backed by a core NATS connection (no JetStream).
type NATS struct {
	conn *nats.Conn
}

// ConnectNATS connects to url, retrying for up to wait so services can start in any order.
func ConnectNATS(url string, wait time.Duration) (*NATS, error) {
	deadline := time.Now().Add(wait)
	for {
		c, err := nats.Connect(url, nats.MaxReconnects(-1), nats.ReconnectWait(500*time.Millisecond))
		if err == nil {
			return &NATS{conn: c}, nil
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("connect %s: %w", url, err)
		}
		time.Sleep(500 * time.Millisecond)
	}
}

func (n *NATS) Publish(subject string, data []byte) error {
	return n.conn.Publish(subject, data)
}

func (n *NATS) Subscribe(subject string, h Handler) (Subscription, error) {
	return n.conn.Subscribe(subject, func(m *nats.Msg) { h(m.Subject, m.Data) })
}

func (n *NATS) Close() {
	_ = n.conn.Drain()
}
