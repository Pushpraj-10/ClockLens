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
  /** The speed picker is an advanced control. */
  showSpeed: boolean;
}

export function PlaybackBar(p: Props) {
  const empty = p.total === 0;
  return (
    <div
      // sticky so the controls stay in view while scrolling the panels below the diagram
      className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-[28px] border border-line bg-panel px-4 py-2.5 shadow-panel"
      role="group"
      aria-label="Playback controls"
    >
      <button className="btn" onClick={p.onRestart} disabled={empty} title="Back to the start" aria-label="Restart">
        ⏮
      </button>
      <button className="btn" onClick={() => p.onStep(-1)} disabled={empty || p.position === 0} title="Step back" aria-label="Step back">
        ◀
      </button>
      {p.playing ? (
        <button onClick={p.onPause} className="btn btn-primary" aria-label="Pause">
          ⏸ Pause
        </button>
      ) : (
        <button onClick={p.onPlay} disabled={empty} className="btn btn-primary" aria-label="Play">
          ▶ Play
        </button>
      )}
      <button className="btn" onClick={() => p.onStep(1)} disabled={empty || p.live} title="Step forward" aria-label="Step forward">
        ▶|
      </button>
      <input
        type="range"
        className="min-w-[120px] flex-[1_1_160px] accent-accent"
        min={0}
        max={p.total}
        value={p.position}
        disabled={empty}
        onChange={(e) => p.onSeek(Number(e.target.value))}
        aria-label="Playback position"
      />
      <span className="position min-w-16 text-center font-mono tabular-nums text-accent" aria-live="polite">
        {p.position} / {p.total}
      </span>
      {p.showSpeed && (
        <label className="inline-flex items-center gap-1.5 text-[13px] text-muted">
          Speed
          <select className="field" value={p.speed} onChange={(e) => p.onSpeed(Number(e.target.value))}>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </label>
      )}
      <button onClick={p.onLive} disabled={p.live} className={`btn ${p.live ? "border-accent! text-accent" : ""}`}>
        ● Live
      </button>
    </div>
  );
}
