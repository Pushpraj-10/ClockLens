"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ThemeChoice } from "../../lib/themeCore";

interface Props {
  choice: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
}

const icon = {
  className: "size-4",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const OPTIONS: { value: ThemeChoice; label: string; hint: string; glyph: React.ReactNode }[] = [
  {
    value: "system",
    label: "System",
    hint: "Match your device",
    glyph: (
      <svg {...icon}>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
  {
    value: "light",
    label: "Light",
    hint: "Always light",
    glyph: (
      <svg {...icon}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    hint: "Always dark",
    glyph: (
      <svg {...icon}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    ),
  },
];

/**
 * Compact theme picker: one icon button showing the current choice, opening a
 * System / Light / Dark menu (radio items, arrow keys, Escape to close).
 */
export function ThemeToggle({ choice, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const currentIndex = Math.max(
    0,
    OPTIONS.findIndex((o) => o.value === choice),
  );
  const current = OPTIONS[currentIndex] ?? OPTIONS[0]!;

  // Focus the checked item on open; close on outside click.
  useEffect(() => {
    if (!open) return;
    items.current[currentIndex]?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
    // currentIndex only matters at the moment the menu opens
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const i = items.current.findIndex((el) => el === document.activeElement);
    const focusAt = (n: number) => items.current[(n + OPTIONS.length) % OPTIONS.length]?.focus();
    if (e.key === "ArrowDown") focusAt(i + 1);
    else if (e.key === "ArrowUp") focusAt(i - 1);
    else if (e.key === "Home") focusAt(0);
    else if (e.key === "End") focusAt(OPTIONS.length - 1);
    else if (e.key === "Escape") close(true);
    else if (e.key === "Tab") setOpen(false);
    else return;
    if (e.key !== "Tab") e.preventDefault();
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        className="btn size-9 min-h-9 bg-panel px-0 text-muted shadow-panel hover:text-ink aria-expanded:border-primary aria-expanded:text-ink"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Theme: ${current.label}`}
        title={`Theme: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {current.glyph}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Theme"
          onKeyDown={onMenuKey}
          className="absolute top-full right-0 z-30 mt-2 w-48 rounded-2xl border border-line bg-panel p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)]"
          style={{ backgroundImage: "var(--card-glow)" }}
        >
          {OPTIONS.map((o, i) => {
            const checked = o.value === choice;
            return (
              <button
                key={o.value}
                ref={(el) => {
                  items.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={-1}
                onClick={() => {
                  onChange(o.value);
                  close(true);
                }}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm outline-none hover:bg-surface focus-visible:bg-surface ${
                  checked ? "text-ink" : "text-muted"
                }`}
              >
                <span className={checked ? "text-primary" : ""}>{o.glyph}</span>
                <span className="flex-1">
                  <span className="block font-medium text-ink">{o.label}</span>
                  <span className="block text-xs text-muted">{o.hint}</span>
                </span>
                {checked && (
                  <svg {...icon} className="size-4 text-primary">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
