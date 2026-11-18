export interface PlaybackState {
  /** Following the newest event. While live, the position is always the total. */
  live: boolean;
  cursor: number;
  playing: boolean;
  /** Steps per second. */
  speed: number;
}

export type PlaybackAction =
  | { type: "play"; total: number }
  | { type: "pause" }
  | { type: "step"; delta: number; total: number }
  | { type: "seek"; to: number; total: number }
  | { type: "tick"; total: number }
  | { type: "live" }
  | { type: "restart"; total: number }
  | { type: "speed"; speed: number }
  | { type: "total"; total: number };

export const initialPlayback: PlaybackState = { live: true, cursor: 0, playing: false, speed: 1 };

/** Number of events currently shown. */
export function position(s: PlaybackState, total: number): number {
  return s.live ? total : Math.min(s.cursor, total);
}

function goTo(s: PlaybackState, to: number, total: number): PlaybackState {
  const next = Math.max(0, Math.min(to, total));
  if (next >= total) return { ...s, live: true, cursor: total, playing: false };
  return { ...s, live: false, cursor: next, playing: false };
}

export function playbackReducer(s: PlaybackState, a: PlaybackAction): PlaybackState {
  switch (a.type) {
    case "play":
      if (a.total === 0) return s;
      // Playing from the end (or from live) replays from the start.
      return s.live || s.cursor >= a.total
        ? { ...s, live: false, cursor: 0, playing: true }
        : { ...s, playing: true };
    case "pause":
      return { ...s, playing: false };
    case "step":
      return goTo(s, position(s, a.total) + a.delta, a.total);
    case "seek":
      return goTo(s, a.to, a.total);
    case "tick": {
      if (!s.playing) return s;
      const next = s.cursor + 1;
      return next >= a.total
        ? { ...s, live: true, cursor: a.total, playing: false }
        : { ...s, cursor: next };
    }
    case "live":
      return { ...s, live: true, playing: false };
    case "restart":
      return a.total === 0 ? s : { ...s, live: false, cursor: 0, playing: false };
    case "speed":
      return { ...s, speed: a.speed };
    case "total":
      // The trace shrank (new run or import): fall back to following the end.
      return a.total === 0 || s.cursor > a.total ? { ...s, live: true, cursor: 0, playing: false } : s;
  }
}
