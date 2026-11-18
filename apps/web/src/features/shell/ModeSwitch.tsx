"use client";

import type { ViewMode } from "../../lib/viewMode";

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const OPTIONS: { value: ViewMode; label: string; hint: string }[] = [
  { value: "simple", label: "Simple", hint: "Just the story: what caused what" },
  { value: "advanced", label: "Advanced", hint: "Clock numbers, comparisons and network controls" },
];

/** Switch between the beginner view and the full tool. */
export function ModeSwitch({ mode, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-[13px] text-muted" id="view-label">
        View
      </span>
      <div className="inline-flex" role="group" aria-labelledby="view-label">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={mode === o.value}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className="btn first:rounded-r-none last:rounded-l-none last:border-l-0 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-ink"
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
