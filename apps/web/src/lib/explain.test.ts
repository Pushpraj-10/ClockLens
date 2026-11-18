import { describe, expect, it } from "vitest";
import type { ClockEvent } from "@clocklens/events";
import { explainEvent, formatVector } from "./explain";

const lanes = ["P1", "P2", "P3"];

describe("formatVector", () => {
  it("prints in lane order and treats missing keys as 0", () => {
    expect(formatVector({ P2: 3, P1: 1 }, lanes)).toBe("[1,3,0]");
  });
});

describe("explainEvent", () => {
  it("explains a local event with the arithmetic", () => {
    const prev: ClockEvent = { id: "P1:0", process: "P1", seq: 0, kind: "local", lamport: 1, vector: { P1: 1 } };
    const e: ClockEvent = { id: "P1:1", process: "P1", seq: 1, kind: "local", lamport: 2, vector: { P1: 2 } };
    const x = explainEvent(e, { prev, lanes });
    expect(x.title).toBe("P1 does a local event");
    expect(x.steps.join(" ")).toContain("1 + 1 = 2");
    expect(x.steps.join(" ")).toContain("1 → 2");
  });

  it("explains a first event (no previous)", () => {
    const e: ClockEvent = { id: "P1:0", process: "P1", seq: 0, kind: "local", lamport: 1, vector: { P1: 1 } };
    expect(explainEvent(e, { lanes }).steps.join(" ")).toContain("0 + 1 = 1");
  });

  it("explains a send", () => {
    const e: ClockEvent = {
      id: "P1:0", process: "P1", seq: 0, kind: "send", lamport: 1, vector: { P1: 1 }, peer: "P2", msgId: "P1-m1",
    };
    const x = explainEvent(e, { lanes });
    expect(x.title).toBe("P1 sends P1-m1 to P2");
    expect(x.steps.join(" ")).toContain("[1,0,0]");
  });

  it("explains a receive using the send's stamps", () => {
    const send: ClockEvent = {
      id: "P1:0", process: "P1", seq: 0, kind: "send", lamport: 5, vector: { P1: 4 }, peer: "P2", msgId: "P1-m1",
    };
    const prev: ClockEvent = { id: "P2:0", process: "P2", seq: 0, kind: "local", lamport: 2, vector: { P2: 1 } };
    const e: ClockEvent = {
      id: "P2:1", process: "P2", seq: 1, kind: "receive", lamport: 6, vector: { P1: 4, P2: 2 },
      peer: "P1", msgId: "P1-m1",
    };
    const x = explainEvent(e, { prev, send, lanes });
    expect(x.title).toBe("P2 receives P1-m1 from P1");
    const text = x.steps.join(" ");
    expect(text).toContain("max(own 2, message 5) + 1 = 6");
    expect(text).toContain("[4,2,0]");
  });

  it("copes with a missing send event", () => {
    const e: ClockEvent = {
      id: "P2:0", process: "P2", seq: 0, kind: "receive", lamport: 3, vector: { P2: 1 }, peer: "P1", msgId: "m",
    };
    expect(explainEvent(e, { lanes }).steps.join(" ")).toContain("not in this trace");
  });
});
