"use client";

interface Props {
  position: number;
  total: number;
  playing: boolean;
  live: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onStep: (delta: number) => void;
  onSeek: (to: number) => void;
  onRestart: () => void;
  onLive: () => void;
  onSpeed: (speed: number) => void;
}

export function PlaybackBar(p: Props) {
  const empty = p.total === 0;
  return (
    <div className="playback" role="group" aria-label="Playback controls">
      <button onClick={p.onRestart} disabled={empty} title="Back to the start" aria-label="Restart">
        ⏮
      </button>
      <button onClick={() => p.onStep(-1)} disabled={empty || p.position === 0} title="Step back" aria-label="Step back">
        ◀
      </button>
      {p.playing ? (
        <button onClick={p.onPause} className="primary" aria-label="Pause">
          ⏸ Pause
        </button>
      ) : (
        <button onClick={p.onPlay} disabled={empty} className="primary" aria-label="Play">
          ▶ Play
        </button>
      )}
      <button onClick={() => p.onStep(1)} disabled={empty || p.live} title="Step forward" aria-label="Step forward">
        ▶|
      </button>
      <input
        type="range"
        min={0}
        max={p.total}
        value={p.position}
        disabled={empty}
        onChange={(e) => p.onSeek(Number(e.target.value))}
        aria-label="Playback position"
      />
      <span className="position" aria-live="polite">
        {p.position} / {p.total}
      </span>
      <label className="speed">
        Speed
        <select value={p.speed} onChange={(e) => p.onSpeed(Number(e.target.value))}>
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
      </label>
      <button onClick={p.onLive} disabled={p.live} className={p.live ? "live on" : "live"}>
        ● Live
      </button>
    </div>
  );
}
