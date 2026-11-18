# Using ClockLens

A tour of the interface. For the ideas behind it, read [concepts.md](concepts.md).

- [The screen](#the-screen)
- [Simple and Advanced views](#simple-and-advanced-views)
- [Driving the nodes](#driving-the-nodes)
- [Reading the diagram](#reading-the-diagram)
- [Asking causality questions](#asking-causality-questions)
- [Playback](#playback)
- [Exporting and importing a run](#exporting-and-importing-a-run)
- [Keyboard and accessibility](#keyboard-and-accessibility)
- [Things to try](#things-to-try)

## The screen

```
┌──────────────┬────────────────────────────────────────────────────┐
│ ClockLens  ◐ │  Title                              [Simple|Advanced]│
│ [New run]    │ ┌────────────────────────────────────────────────┐ │
│              │ │ Space-time diagram         stats   [How to read]│ │
│ P1           │ │  P1  ▢──▢──────▢                               │ │
│ [Local][↗P2] │ │  P2  ▢────▢──▢                                 │ │
│ [↗P3]        │ │  P3  ▢──────────▢                              │ │
│ P2 …         │ └────────────────────────────────────────────────┘ │
│ P3 …         │  ⏮ ◀ ▶ Play ▶ ──────●────────  6 / 6      ● Live  │
│              │ ┌─────────────────┐ ┌──────────────────────────┐  │
│              │ │ What just       │ │ Selected event / Compare │  │
│              │ │ happened        │ │ / Lamport vs vector      │  │
└──────────────┴─┴─────────────────┴─┴──────────────────────────┴──┘
```

- **Left panel:** the run actions, one control card per node, and the theme menu (the round
  button beside the logo). If the server cannot be reached, the action buttons are disabled.
- **Diagram:** one lane per node, one card per event.
- **Playback bar:** step through the run or follow it live.
- **Bottom panels:** an explanation of the step shown, and details about the selected event.

## Simple and Advanced views

Switch with the toggle at the top right. The choice is remembered in your browser.

| | Simple | Advanced |
|---|---|---|
| Diagram cards | Node, event kind, Lamport value | Also the vector clock |
| Explanation | One plain-English sentence | The clock arithmetic, step by step |
| Selected event | A sentence and a colour key | Clock values and exact before/after/independent lists |
| Comparison, Lamport vs vector | Hidden (a note appears when Lamport misleads) | Available in tabs |
| Network controls | Hidden (a note shows if any are on) | Delivery mode and disconnects per node |
| Run actions | New run | New run, Export, Import |
| Playback | No speed control | Speed control |
| Stats | Hidden | Events, nodes, held messages, misleading pairs |

## Driving the nodes

Each node has a card in the left panel.

- **Local** — something happens inside the node. No message is sent.
- **↗ P2** — the node sends a message to P2 (one button per other node).
- **New run** — clears every event and resets every node's clocks. If there are events, you
  are asked to confirm.

In **Advanced** view each node card also has a **Network** section:

- **Deliver messages — Instantly / I'll deliver them.** In manual mode, incoming messages are
  not delivered; they are held and listed under *Waiting messages* with **Deliver** and
  **Drop** buttons. Deliver messages in a different order than they were sent to create
  reordering. Switching back to *Instantly* delivers everything that was held.
- **Disconnect from Pn.** Cuts the link between two nodes in both directions. Messages sent
  across it still show a send event, but never arrive (shown as a dashed line ending in ✕).

Badges next to a node's name show when it is in `manual` mode, is `cut off` from another
node, or is `offline`.

## Reading the diagram

- Each **card** is one event: the node, what it did (`local`, `send to P2`, `receive from P1`),
  and a badge with its **Lamport value** (`L3`). In Advanced view the card also shows its
  **vector clock**, ordered by node (`[2,1,0]` means P1=2, P2=1, P3=0).
- A **grey line** joins consecutive events on the same node (program order).
- A **bold arrow** is a message, from the sending event to the receiving event.
- A dashed line ending in ✕ is a message with no receive: in flight, held, or lost.
- Cards are coloured by node. The **icon** shows the kind: a dot for local, an arrow out for send,
  an arrow in for receive.
- The **horizontal position is not time.** It only keeps arrows pointing forward. What the layout
  does tell you: an arrow or a chain of arrows from one card to another means the first
  could have influenced the second.
- The **ring** around the newest event marks the step currently shown.

Press **How to read** (top of the diagram card) for a short reminder in the app itself.

## Asking causality questions

**Click a card** to select it. Every other event is then outlined:

| Outline | Meaning |
|---|---|
| Solid green | Happened **before** the selected event |
| Dashed blue | Happens **after** the selected event |
| Dotted amber | **Independent** (concurrent): neither could have caused the other |

The shape differs as well as the colour, so it works without telling colours apart. Click the
card again, or another card, to change or clear the selection.

In Advanced view, three tabs sit in the card at the bottom right:

- **Selected event** — the event's clock values and the exact lists of past, future and
  concurrent events.
- **Compare** — pick two events (A and B) from the menus, use **Selected → A / B**, or
  **Shift+click** a second card in the diagram. You get a verdict (`before`, `after`, `equal`
  or `concurrent`), a numbered proof comparing the vectors entry by entry, a note on whether
  Lamport agrees, and — when one event is before the other — the chain of events and
  messages connecting them.
- **Lamport vs vector** — every pair of concurrent events whose Lamport values differ. For each,
  Lamport suggests an order that does not exist. **Compare** jumps to the proof. The number on
  the tab counts these pairs.

In Simple view, selecting an event shows one sentence ("3 events happened before this one…")
and, if Lamport would mislead about it, a note with a link to switch to Advanced.

## Playback

The bar below the diagram replays the run.

| Control | Action |
|---|---|
| ⏮ | Back to the start |
| ◀ / ▶ | Step back / forward |
| Play / Pause | Replay from the current position (from the start if you were at the end) |
| Slider | Jump to any step |
| `6 / 12` | Steps shown / total |
| Speed (Advanced) | 0.5×, 1×, 2×, 4× |
| **Live** | Following the newest event. When you step back it becomes **Go live**. |

While you are not live, new events still arrive but stay hidden until you reach them. The
**What just happened** panel always explains the last event shown.

## Exporting and importing a run

In Advanced view the **Run** section has **Export** and **Import**.

- **Export** downloads the current run as `clocklens-trace.json`: a JSON array of events in the
  format described by [`contracts/event.schema.json`](../contracts/event.schema.json).
- **Import** replaces the current events with a trace from a file (up to 10 MiB). The trace is
  validated first; an invalid file leaves your current run untouched. You are asked to confirm
  if there are events you would lose.

An imported trace is a read-only view: the nodes' own clocks are not changed.

## Keyboard and accessibility

- Every control is reachable with **Tab**; diagram cards are focusable buttons.
- **Enter** or **Space** on a card selects it; **Shift+Enter** (or Shift+click) picks it as the
  second event for comparison.
- The tabs and the theme menu use **arrow keys**; **Esc** closes the menu.
- Relations use outline *shape* as well as colour. Motion is reduced when your system asks for it.
- **Theme:** the round button beside the logo opens a menu: System, Light or Dark.

## Things to try

1. **Cause and effect.** P1 Local, then P1 ↗ P2, then P2 ↗ P3. Click the last receive: P1's
   events are all *before* it.
2. **Concurrency.** P1 Local and P3 Local with no messages. Select one: the other is independent.
3. **Lamport misleads.** Add a second Local on P1. Now P1's second event (L2) and P3's event (L1)
   are concurrent, but Lamport numbers order them. Open *Lamport vs vector*.
4. **Reordering.** Switch P2 to *I'll deliver them*, send two messages from P1 to P2, then deliver
   the second one first. Compare the receives.
5. **Lost messages.** Disconnect P1 from P2, send from P1 to P2, and notice the send with no
   receive. Reconnect and send again.
