# contracts

Language-neutral source of truth. Go (`go/pkg/clock`) and TypeScript (`packages/clock`)
must both pass every case in `clock-vectors/`; every event on the wire must validate
against `event.schema.json`. Change a contract here first, then both implementations.
