# contracts

Source of truth. `go/pkg/clock` must pass every case in `clock-vectors/`, and every event
on the wire must validate against `event.schema.json` (TS types in `packages/events` mirror it).
Change a contract here first, then the implementation.

## Semantics both implementations must follow

- Lamport: `tick` (local event or send) is `t+1`; `receive(r)` is `max(t, r) + 1`.
- Vector: `tick` is `v[self]+1`; `receive(w)` is element-wise max with `w`, then `v[self]+1`.
- **A missing vector key means 0.** Vectors are compared and asserted with this
  normalization, so `{a:1}` equals `{a:1, b:0}`.
- `compare` returns `before`, `after`, `equal` or `concurrent`.
- `expect` lists the clock value after each op, in order.
