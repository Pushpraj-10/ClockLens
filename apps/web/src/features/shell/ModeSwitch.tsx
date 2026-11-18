"use client";

import type { ViewMode } from "../../lib/viewMode";

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const icon = {
  className: "size-4 flex-none",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const OPTIONS: { value: ViewMode; label: string; hint: string; glyph: React.ReactNode }[] = [
  {
    value: "simple",
    label: "Simple",
    hint: "Just the story: what caused what",
    glyph: (
      <svg {...icon}>
        <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.8" />
      </svg>
    ),
  },
  {
    value: "advanced",
    label: "Advanced",
    hint: "Clock numbers, comparisons and network controls",
    glyph: (
      <svg {...icon}>
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
        <circle cx="15" cy="7" r="2" />
        <circle cx="9" cy="17" r="2" />
      </svg>
    ),
  },
];

/** Switch between the beginner view and the full tool: one track with a sliding thumb. */
export function ModeSwitch({ mode, onChange }: Props) {
  const index = Math.max(
    0,
    OPTIONS.findIndex((o) => o.value === mode),
  );
  return (
    <div role="group" aria-label="View" className="relative grid grid-cols-2 rounded-full border border-line bg-panel p-1 shadow-panel">
      {/* thumb: slides under the active option */}
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-primary shadow-[0_2px_8px_-2px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {OPTIONS.map((o) => {
        const active = o.value === mode;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={`relative z-[1] inline-flex min-h-8 cursor-pointer touch-manipulation items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
              active ? "text-primary-ink" : "text-muted hover:text-ink"
            }`}
          >
            {o.glyph}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
