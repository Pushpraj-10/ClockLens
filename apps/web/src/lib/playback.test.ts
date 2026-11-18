import { describe, expect, it } from "vitest";
import { initialPlayback, playbackReducer, position, type PlaybackState } from "./playback";

const run = (s: PlaybackState, ...actions: Parameters<typeof playbackReducer>[1][]) =>
  actions.reduce(playbackReducer, s);

describe("playback", () => {
  it("starts live and follows the total", () => {
    expect(position(initialPlayback, 7)).toBe(7);
  });

  it("stepping back leaves live mode and stepping forward to the end returns to it", () => {
    let s = run(initialPlayback, { type: "step", delta: -1, total: 5 });
    expect(s.live).toBe(false);
    expect(position(s, 5)).toBe(4);
    s = run(s, { type: "step", delta: 1, total: 5 });
    expect(s.live).toBe(true);
  });

  it("a paused position does not move when new events arrive", () => {
    const s = run(initialPlayback, { type: "seek", to: 2, total: 5 });
    expect(position(s, 5)).toBe(2);
    expect(position(s, 9)).toBe(2);
  });

  it("clamps stepping", () => {
    expect(position(run(initialPlayback, { type: "seek", to: -5, total: 3 }), 3)).toBe(0);
    expect(run(initialPlayback, { type: "step", delta: 10, total: 3 }).live).toBe(true);
  });

  it("play from live replays from the start, ticks forward, then stops at the end", () => {
    let s = run(initialPlayback, { type: "play", total: 3 });
    expect(s).toMatchObject({ live: false, cursor: 0, playing: true });
    s = run(s, { type: "tick", total: 3 });
    expect(position(s, 3)).toBe(1);
    s = run(s, { type: "tick", total: 3 }, { type: "tick", total: 3 });
    expect(s).toMatchObject({ live: true, playing: false });
  });

  it("pause keeps the position", () => {
    let s = run(initialPlayback, { type: "play", total: 5 }, { type: "tick", total: 5 }, { type: "pause" });
    expect(s.playing).toBe(false);
    expect(position(s, 5)).toBe(1);
    s = run(s, { type: "tick", total: 5 });
    expect(position(s, 5)).toBe(1);
  });

  it("resuming play continues from the current position", () => {
    const s = run(initialPlayback, { type: "seek", to: 2, total: 5 }, { type: "play", total: 5 });
    expect(s).toMatchObject({ live: false, cursor: 2, playing: true });
  });

  it("play does nothing with no events", () => {
    expect(run(initialPlayback, { type: "play", total: 0 })).toEqual(initialPlayback);
  });

  it("restart goes to the beginning, paused", () => {
    const s = run(initialPlayback, { type: "restart", total: 4 });
    expect(s).toMatchObject({ live: false, cursor: 0, playing: false });
  });

  it("falls back to live when the trace shrinks (new run)", () => {
    const s = run(initialPlayback, { type: "seek", to: 3, total: 5 }, { type: "total", total: 0 });
    expect(s.live).toBe(true);
    const t = run(initialPlayback, { type: "seek", to: 4, total: 5 }, { type: "total", total: 2 });
    expect(t.live).toBe(true);
    const u = run(initialPlayback, { type: "seek", to: 1, total: 5 }, { type: "total", total: 8 });
    expect(u.live).toBe(false);
  });

  it("go live", () => {
    const s = run(initialPlayback, { type: "seek", to: 1, total: 5 }, { type: "live" });
    expect(position(s, 5)).toBe(5);
  });
});
