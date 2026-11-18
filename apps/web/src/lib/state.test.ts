import { describe, expect, it } from "vitest";
import type { ClockEvent, NodeStatus } from "@clocklens/events";
import { initialState, processList, reducer, type State } from "./state";

const ev = (id: string, process = "P1"): ClockEvent => ({
  id, process, seq: 0, kind: "local", lamport: 1, vector: { [process]: 1 },
});
const status = (id: string): NodeStatus => ({ id, mode: "auto", partition: [], pending: [] });

describe("state reducer", () => {
  it("tracks the connection", () => {
    expect(reducer(initialState, { type: "connection", connected: true }).connected).toBe(true);
  });

  it("appends new events and ignores duplicates", () => {
    let s: State = reducer(initialState, { type: "message", message: { type: "event", event: ev("P1:0") } });
    s = reducer(s, { type: "message", message: { type: "event", event: ev("P1:0") } });
    s = reducer(s, { type: "message", message: { type: "event", event: ev("P1:1") } });
    expect(s.events.map((e) => e.id)).toEqual(["P1:0", "P1:1"]);
  });

  it("a snapshot replaces events and statuses, dedups, and tolerates missing fields", () => {
    let s = reducer(initialState, { type: "message", message: { type: "event", event: ev("old") } });
    s = reducer(s, {
      type: "message",
      message: { type: "snapshot", events: [ev("a"), ev("a"), ev("b")], statuses: [status("P1")] },
    });
    expect(s.events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(Object.keys(s.statuses)).toEqual(["P1"]);

    s = reducer(s, { type: "message", message: { type: "snapshot" } }); // server omits empty fields
    expect(s.events).toEqual([]);
    expect(s.statuses).toEqual({});
  });

  it("after a snapshot, an event already in it is not added twice", () => {
    let s = reducer(initialState, { type: "message", message: { type: "snapshot", events: [ev("a")] } });
    s = reducer(s, { type: "message", message: { type: "event", event: ev("a") } });
    expect(s.events).toHaveLength(1);
  });

  it("updates one node status", () => {
    const s = reducer(initialState, {
      type: "message",
      message: { type: "status", status: { ...status("P2"), mode: "manual" } },
    });
    expect(s.statuses["P2"]?.mode).toBe("manual");
  });
});

describe("processList", () => {
  it("merges statuses and event processes in natural order", () => {
    let s = reducer(initialState, {
      type: "message",
      message: { type: "snapshot", statuses: [status("P10"), status("P2")], events: [ev("x", "P1")] },
    });
    expect(processList(s)).toEqual(["P1", "P2", "P10"]);
    s = initialState;
    expect(processList(s)).toEqual([]);
  });
});
