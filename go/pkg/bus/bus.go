// Package bus is the message transport used by the server and the nodes. The NATS
// implementation is used at runtime; the in-memory one is used in tests.
package bus

// Handler receives a message. Handlers of one subscription are called sequentially,
// in publish order for that subscription.
type Handler func(subject string, data []byte)

// Subscription can be cancelled.
type Subscription interface {
	Unsubscribe() error
}

// Bus is a core pub/sub transport: at-most-once, no ordering across subjects.
type Bus interface {
	Publish(subject string, data []byte) error
	Subscribe(subject string, h Handler) (Subscription, error)
	Close()
}
