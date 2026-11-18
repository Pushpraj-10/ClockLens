import { describe, expect, it } from "vitest";
import type { ClockEvent } from "@clocklens/events";
import { computeLayout } from "./layout";

function ev(process: string, seq: number, kind: ClockEvent["kind"], extra: Partial<ClockEvent> = {}): ClockEvent {
  return { id: `${process}:${seq}`, process, seq, kind, lamport: seq + 1, vector: { [process]: seq + 1 }, ...extra };
}

describe("computeLayout", () => {
  it("is empty for no events", () => {
    const l = computeLayout([], ["P1", "P2"]);
    expect(l.columns).toBe(0);
    expect(l.order).toEqual([]);
    expect(l.lanes).toEqual(["P1", "P2"]);
  });

  it("puts events of one process in successive columns", () => {
    const l = computeLayout([ev("P1", 0, "local"), ev("P1", 1, "local"), ev("P1", 2, "local")], ["P1"]);
    expect(["P1:0", "P1:1", "P1:2"].map((id) => l.column[id])).toEqual([0, 1, 2]);
  });

  it("places a receive after its send so the arrow points forward", () => {
    // P1 does two local events before sending; P2 receives immediately.
    const late = [
      ev("P1", 0, "local"),
      ev("P1", 1, "local"),
      ev("P1", 2, "send", { peer: "P2", msgId: "m1" }),
      ev("P2", 0, "receive", { peer: "P1", msgId: "m1" }),
    ];
    const l = computeLayout(late, ["P1", "P2"]);
    expect(l.column["P2:0"]).toBe(3);
    expect(l.column["P2:0"]).toBeGreaterThan(l.column["P1:2"]!);

    // A receiver that is already further along stays after its own predecessors.
    const busy = [
      ev("P1", 0, "send", { peer: "P2", msgId: "m1" }),
      ev("P2", 0, "local"),
      ev("P2", 1, "local"),
      ev("P2", 2, "receive", { peer: "P1", msgId: "m1" }),
    ];
    expect(computeLayout(busy, ["P1", "P2"]).column["P2:2"]).toBe(2);
  });

  it("does not depend on arrival order or Lamport values", () => {
    const events = [
      ev("P1", 0, "send", { peer: "P2", msgId: "m1", lamport: 99 }),
      ev("P2", 0, "receive", { peer: "P1", msgId: "m1", lamport: 1 }),
    ];
    const a = computeLayout(events, ["P1", "P2"]);
    const b = computeLayout([...events].reverse(), ["P1", "P2"]);
    expect(a.column).toEqual(b.column);
    expect(a.column["P2:0"]).toBe(1);
  });

  it("orders playback so every event follows its causal predecessors", () => {
    const events = [
      ev("P2", 0, "receive", { peer: "P1", msgId: "m1" }),
      ev("P1", 1, "send", { peer: "P2", msgId: "m1" }),
      ev("P1", 0, "local"),
    ];
    const l = computeLayout(events, ["P1", "P2"]);
    const pos = (id: string) => l.order.findIndex((e) => e.id === id);
    expect(pos("P1:0")).toBeLessThan(pos("P1:1"));
    expect(pos("P1:1")).toBeLessThan(pos("P2:0"));
  });

  it("links sends to receives and keeps unreceived sends", () => {
    const events = [
      ev("P1", 0, "send", { peer: "P2", msgId: "m1" }),
      ev("P1", 1, "send", { peer: "P2", msgId: "m2" }),
      ev("P2", 0, "receive", { peer: "P1", msgId: "m2" }),
    ];
    const l = computeLayout(events, ["P1", "P2"]);
    expect(l.messages.map((m) => [m.msgId, m.receive?.id])).toEqual([
      ["m1", undefined],
      ["m2", "P2:0"],
    ]);
  });

  it("adds lanes for processes seen only in events", () => {
    const l = computeLayout([ev("P3", 0, "local")], ["P1"]);
    expect(l.lanes).toEqual(["P1", "P3"]);
  });

  it("survives a cyclic (corrupt) trace by still assigning every event a column", () => {
    const events = [
      ev("P1", 0, "receive", { peer: "P2", msgId: "b" }),
      ev("P1", 1, "send", { peer: "P2", msgId: "a" }),
      ev("P2", 0, "receive", { peer: "P1", msgId: "a" }),
      ev("P2", 1, "send", { peer: "P1", msgId: "b" }),
    ];
    const l = computeLayout(events, ["P1", "P2"]);
    expect(Object.keys(l.column)).toHaveLength(4);
    expect(l.order).toHaveLength(4);
  });
});
