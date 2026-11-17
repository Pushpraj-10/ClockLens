# Architecture

```
contracts/  (event schema + clock test vectors)   <- source of truth
   |                          |
go/pkg/clock, go/pkg/events   packages/clock, packages/events
   |                          |
go/internal/{node,collector,transport}   packages/simulator
   |                          |
go/cmd/{node,collector,faultproxy}       apps/web (draws events only)
```

## Rules

- Dependencies point downward only; libraries never import apps.
- `apps/web` consumes `ClockEvent[]` from three interchangeable sources: simulator, collector WebSocket, imported JSON.
- `internal/*` is private to its Go binary; shared logic lives in `pkg/*`.
- Wall-clock time is informational only, never used for ordering.
