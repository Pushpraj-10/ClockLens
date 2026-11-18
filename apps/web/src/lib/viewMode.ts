"use client";

import { useCallback, useEffect, useState } from "react";

export type ViewMode = "simple" | "advanced";

const KEY = "clocklens.view";

/** Anything that is not exactly "advanced" is the simple view. */
export function parseMode(raw: string | null | undefined): ViewMode {
  return raw === "advanced" ? "advanced" : "simple";
}

/**
 * Simple / Advanced view, remembered in this browser.
 * The first render is always "simple" so server and client markup agree; the saved
 * choice is applied right after mount. Storage can be blocked, so every access is guarded.
 */
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setModeState] = useState<ViewMode>("simple");

  // Apply the saved choice once, after the first render.
  useEffect(() => {
    try {
      setModeState(parseMode(window.localStorage.getItem(KEY)));
    } catch {
      // storage unavailable: stay on the default
    }
  }, []);

  const setMode = useCallback((next: ViewMode) => {
    setModeState(next);

    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // not persisted, still works for this visit
    }
  }, []);

  return [mode, setMode];
}
