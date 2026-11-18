import { describe, expect, it } from "vitest";
import type { ClockEvent, Misleading, Relations } from "@clocklens/events";
import { lamportNote, plainStep, relationSentence } from "./plain";
import { parseMode } from "./viewMode";

const ev = (over: Partial<ClockEvent>): ClockEvent => ({
  id: "P1:0",
  process: "P1",
  seq: 0,
  kind: "local",
  lamport: 1,
  vector: { P1: 1 },
  ...over,
});

describe("plainStep", () => {
  it("describes a local event without any message", () => {
    expect(plainStep(ev({}))).toBe("P1 did something on its own. No message was involved.");
  });
  it("names the receiver of a send", () => {
    expect(plainStep(ev({ kind: "send", peer: "P2", msgId: "m" }))).toBe("P1 sent a message to P2.");
  });
  it("explains what a receive means in words", () => {
    const s = plainStep(ev({ process: "P2", kind: "receive", peer: "P1", msgId: "m" }));
    expect(s).toContain("P2 received a message from P1");
    expect(s).toContain("everything P1 knew when it sent it");
  });
});

describe("relationSentence", () => {
  const rel: Relations = { id: "P2:0", past: ["a", "b"], future: ["c"], concurrent: ["d", "e", "f"] };

  it("counts each group", () => {
    const all = new Set(["a", "b", "c", "d", "e", "f"]);
    expect(relationSentence(rel, all)).toBe(
      "2 events happened before this one, 1 happen after it, and 3 are independent of it (neither could have caused the other).",
    );
  });
  it("only counts events visible at the playback position", () => {
    const s = relationSentence(rel, new Set(["a", "d"]));
    expect(s).toContain("1 event happened before");
    expect(s).toContain("0 happen after");
    expect(s).toContain("1 is independent of it");
  });
});

describe("lamportNote", () => {
  const pairs: Misleading[] = [
    { a: "P1:0", b: "P3:2", lamportA: 1, lamportB: 3 },
    { a: "P1:0", b: "P3:1", lamportA: 1, lamportB: 2 },
    { a: "P2:0", b: "P3:2", lamportA: 2, lamportB: 3 },
  ];
  it("is silent without a selection or without a matching pair", () => {
    expect(lamportNote(undefined, pairs)).toBeUndefined();
    expect(lamportNote("P9:0", pairs)).toBeUndefined();
  });
  it("warns about the first pair and mentions the rest", () => {
    const n = lamportNote("P1:0", pairs);
    expect(n).toContain("P1:0 came before P3:2 (1 < 3)");
    expect(n).toContain("independently");
    expect(n).toContain("and 1 more like it");
  });
  it("also matches when the selection is the later event of the pair", () => {
    expect(lamportNote("P2:0", pairs)).toContain("P2:0 came before P3:2");
  });
});

describe("parseMode", () => {
  it("defaults to simple for anything unknown", () => {
    expect(parseMode(null)).toBe("simple");
    expect(parseMode(undefined)).toBe("simple");
    expect(parseMode("")).toBe("simple");
    expect(parseMode("expert")).toBe("simple");
  });
  it("accepts advanced", () => {
    expect(parseMode("advanced")).toBe("advanced");
    expect(parseMode("simple")).toBe("simple");
  });
});
