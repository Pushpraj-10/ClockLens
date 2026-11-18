"use client";

import { useId, useRef } from "react";

export interface Tab<T extends string> {
  id: T;
  label: string;
  /** Small count shown after the label; `warn` tints it. */
  badge?: number;
  warn?: boolean;
}

interface Props<T extends string> {
  label: string;
  tabs: Tab<T>[];
  value: T;
  onChange: (id: T) => void;
  children: React.ReactNode;
}

/** A card with a tab strip; only the active tab's content is rendered. Arrow keys move between tabs. */
export function TabbedPanel<T extends string>({ label, tabs, value, onChange, children }: Props<T>) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, delta: number) => {
    const next = (from + delta + tabs.length) % tabs.length;
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    refs.current[next]?.focus();
  };

  return (
    <section className="panel flex h-full flex-col p-0" aria-label={label}>
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-3 pt-2 [scrollbar-width:none]">
        {tabs.map((t, i) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={active}
              aria-controls={`${base}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") move(i, 1);
                else if (e.key === "ArrowLeft") move(i, -1);
                else return;
                e.preventDefault();
              }}
              className={`-mb-px inline-flex min-h-10 cursor-pointer items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors ${
                active ? "border-primary text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span
                  className={`rounded-full px-1.5 font-mono text-[11px] font-semibold tabular-nums ${
                    t.warn ? "bg-warn/15 text-warn" : "bg-surface text-muted"
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${value}`} className="min-h-0 flex-1 p-5">
        {children}
      </div>
    </section>
  );
}
