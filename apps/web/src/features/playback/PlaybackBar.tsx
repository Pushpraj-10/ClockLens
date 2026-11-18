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

const icon = { className: "size-4", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true };

const Icons = {
  restart: (
    <svg {...icon}>
      <rect x="5" y="5" width="2.5" height="14" rx="1" />
      <path d="M19 6.2v11.6a1 1 0 0 1-1.5.86L9 13.4a1.6 1.6 0 0 1 0-2.8l8.5-5.26A1 1 0 0 1 19 6.2z" />
    </svg>
  ),
  back: (
    <svg {...icon}>
      <path d="M15.5 6.4v11.2a1 1 0 0 1-1.6.8l-7-5.6a1 1 0 0 1 0-1.6l7-5.6a1 1 0 0 1 1.6.8z" />
    </svg>
  ),
  forward: (
    <svg {...icon}>
      <path d="M8.5 6.4v11.2a1 1 0 0 0 1.6.8l7-5.6a1 1 0 0 0 0-1.6l-7-5.6a1 1 0 0 0-1.6.8z" />
    </svg>
  ),
  play: (
    <svg {...icon}>
      <path d="M7 5.7v12.6a1 1 0 0 0 1.53.85l10.1-6.3a1 1 0 0 0 0-1.7L8.53 4.85A1 1 0 0 0 7 5.7z" />
    </svg>
  ),
  pause: (
    <svg {...icon}>
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </svg>
  ),
};

export function PlaybackBar(p: Props) {
  const empty = p.total === 0;
  const pct = empty ? 0 : (p.position / p.total) * 100;
  return (
    <div
      // sticky so the controls stay in view while scrolling the panels below the diagram
      // (not on phones, where the bar wraps to several rows and would cover the page)
      className="z-10 md:sticky md:bottom-3 flex flex-wrap items-center gap-2 rounded-[28px] border border-line bg-panel/90 px-3 py-2 shadow-panel backdrop-blur-md"
      role="group"
      aria-label="Playback controls"
    >
      <div className="flex items-center gap-1">
        <button className="btn size-10 px-0" onClick={p.onRestart} disabled={empty || p.position === 0} title="Back to the start" aria-label="Restart">
          {Icons.restart}
        </button>
        <button className="btn size-10 px-0" onClick={() => p.onStep(-1)} disabled={empty || p.position === 0} title="Step back" aria-label="Step back">
          {Icons.back}
        </button>
        {p.playing ? (
          <button onClick={p.onPause} className="btn btn-primary min-w-24 gap-2" aria-label="Pause">
            {Icons.pause} Pause
          </button>
        ) : (
          <button onClick={p.onPlay} disabled={empty} className="btn btn-primary min-w-24 gap-2" aria-label="Play">
            {Icons.play} Play
          </button>
        )}
        <button className="btn size-10 px-0" onClick={() => p.onStep(1)} disabled={empty || p.live} title="Step forward" aria-label="Step forward">
          {Icons.forward}
        </button>
      </div>
      <input
        type="range"
        className="mx-1 h-1.5 min-w-[120px] flex-[1_1_160px] cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-panel [&::-moz-range-thumb]:bg-accent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-panel [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow"
        style={{ background: `linear-gradient(to right, var(--accent) ${pct}%, var(--line) ${pct}%)` }}
        min={0}
        max={p.total}
        value={p.position}
        disabled={empty}
        onChange={(e) => p.onSeek(Number(e.target.value))}
        aria-label="Playback position"
        aria-valuetext={`Step ${p.position} of ${p.total}`}
      />
      <span className="min-w-16 text-center font-mono text-sm tabular-nums" aria-live="polite">
        <span className="font-semibold text-accent">{p.position}</span>
        <span className="text-muted"> / {p.total}</span>
      </span>
      {p.showSpeed && (
        <label className="inline-flex items-center gap-1.5 text-[13px] text-muted">
          <span className="sr-only sm:not-sr-only">Speed</span>
          <select className="field" value={p.speed} onChange={(e) => p.onSpeed(Number(e.target.value))}>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </label>
      )}
      {p.live ? (
        // Following live is a state, not an action: show it as an indicator, not a dimmed button.
        <span
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-accent/50 bg-accent/10 px-4 text-sm font-semibold text-accent"
          role="status"
        >
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative size-2 rounded-full bg-accent" />
          </span>
          Live
        </span>
      ) : (
        <button onClick={p.onLive} className="btn gap-2" title="Jump to the newest event and follow along">
          <span aria-hidden="true" className="size-2 rounded-full bg-muted" />
          Go live
        </button>
      )}
    </div>
  );
}
