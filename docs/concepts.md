# Concepts

The ideas ClockLens is built to show. No prior knowledge assumed.

- [The problem: no shared clock](#the-problem-no-shared-clock)
- [Happened-before](#happened-before)
- [Lamport clocks](#lamport-clocks)
- [Vector clocks](#vector-clocks)
- [Where Lamport clocks mislead](#where-lamport-clocks-mislead)
- [Worked example](#worked-example)
- [Glossary](#glossary)
- [Further reading](#further-reading)

## The problem: no shared clock

Computers in a distributed system cannot rely on wall-clock time to order events: their clocks
drift, and messages take unpredictable time. If P1 logs "10:00:00.003" and P2 logs
"10:00:00.001", you cannot conclude that P2's event happened first.

What you *can* know is **causality**: if one event could have influenced another, the first
must have happened first. Logical clocks capture exactly that.

## Happened-before

Leslie Lamport defined the relation **a → b** ("a happened before b") by three rules:

1. If a and b are on the same process and a comes first, then a → b.
2. If a is the **sending** of a message and b is the **receiving** of that same message, then a → b.
3. It is transitive: if a → b and b → c, then a → c.

If neither a → b nor b → a, the events are **concurrent** (written a ∥ b). Concurrent does not
mean "at the same time": it means that neither could have affected the other, so there is no
meaningful order between them.

Comparing two events therefore has four possible answers, and these are the verdicts ClockLens
reports: **before**, **after**, **equal** (the same event) and **concurrent**.

## Lamport clocks

Each process keeps one counter, starting at 0.

| Event | Rule |
|---|---|
| Local event | `t = t + 1` |
| Send | `t = t + 1`, then stamp the message with `t` |
| Receive a message stamped `r` | `t = max(t, r) + 1` |

**Guarantee:** if a → b, then `L(a) < L(b)`.

**What it does not give you:** the reverse. `L(a) < L(b)` does *not* mean a → b. Lamport values
are enough to build a consistent total order, but they cannot tell you whether two events
were concurrent.

## Vector clocks

Each process keeps a counter **for every process**: a vector. With three processes, P2's vector
`[2,1,0]` means "I have seen 2 events from P1, 1 from myself, 0 from P3".

| Event | Rule |
|---|---|
| Local event | `v[self] = v[self] + 1` |
| Send | `v[self] = v[self] + 1`, then stamp the message with the whole vector |
| Receive a message stamped `w` | `v = elementwise max(v, w)`, then `v[self] = v[self] + 1` |

To compare two vectors `x` and `y`:

- `x ≤ y` when every entry of `x` is ≤ the matching entry of `y`.
- **x → y** when `x ≤ y` and `x ≠ y`.
- **y → x** when `y ≤ x` and `x ≠ y`.
- **concurrent** when neither is ≤ the other (each is larger somewhere).

**Guarantee, both ways:** a → b *if and only if* `V(a) < V(b)`. Vector clocks can tell you the
events are concurrent. The cost is that each message carries a vector the size of the number
of processes.

A missing entry is treated as 0, so `{P1: 1}` equals `{P1: 1, P2: 0}`.

## Where Lamport clocks mislead

Take two processes that never talk to each other:

- P1 does two local events: Lamport values 1 and 2.
- P3 does one local event: Lamport value 1.

P3's event has the *smaller* number than P1's second event, so someone reading only Lamport
values would say P3's event came first. But there is no chain of messages between them: they
are **concurrent**, and the vectors show it:

```
P1's second event   [2,0,0]
P3's event          [0,0,1]     neither vector is ≤ the other  →  concurrent
```

ClockLens lists every such pair under **Lamport vs vector** (Advanced view), and the
comparison panel states for any pair whether Lamport agrees, misleads, or gets lucky with a tie.

## Worked example

Three nodes, P1, P2 and P3. For each event: its Lamport value `L` and its vector.

| Step | Event | L | Vector |
|---|---|---|---|
| 1 | P1 does a local event | 1 | `[1,0,0]` |
| 2 | P1 sends m1 to P2 | 2 | `[2,0,0]` |
| 3 | P2 receives m1 | max(0, 2)+1 = **3** | max(`[0,0,0]`, `[2,0,0]`) = `[2,0,0]`, then P2+1 → `[2,1,0]` |
| 4 | P3 does a local event | 1 | `[0,0,1]` |

Compare P2's receive (step 3) with P3's local event (step 4):

- `[2,1,0]` vs `[0,0,1]`: P1 is larger on the left, P3 on the right → **concurrent**.
- Lamport says `1 < 3`, so P3's event looks earlier: **Lamport misleads**.

Compare P1's first local event with P2's receive: `[1,0,0] ≤ [2,1,0]`, so the first
**happened before** the second, and the chain is *P1 local → P1 send → P2 receive*.

## Glossary

| Term | Meaning |
|---|---|
| **Event** | Something a process does: a local step, a send, or a receive |
| **Process / node** | One participant with its own clocks |
| **Happened-before (→)** | Could have influenced; the causal order |
| **Concurrent (∥)** | Neither event could have influenced the other |
| **Lamport clock** | One counter per process; respects → but cannot detect concurrency |
| **Vector clock** | A counter per process; characterises → exactly |
| **Program order** | The order of events on a single node |
| **Run** | One experiment, from a clean start to the next reset |
| **Trace** | The list of events of a run, exportable as JSON |

## Further reading

- Leslie Lamport, *Time, Clocks, and the Ordering of Events in a Distributed System* (1978).
- Colin Fidge (1988) and Friedemann Mattern (1988), the independent introductions of vector clocks.
