"use client";

import { useCallback, useEffect, useState } from "react";
import { parseTheme, resolveTheme, THEME_KEY, type ResolvedTheme, type ThemeChoice } from "./themeCore";

const BROWSER_BAR: Record<ResolvedTheme, string> = { light: "#efeff1", dark: "#09080b" };

/**
 * System / Light / Dark, remembered in this browser. With "system" it follows the OS
 * setting live. The inline script in <head> has already set data-theme before first
 * paint; this hook keeps it in sync afterwards.
 */
export function useTheme(): { choice: ThemeChoice; setChoice: (c: ThemeChoice) => void; resolved: ResolvedTheme } {
  // First render is "system" so server and client markup match; the saved choice is applied after mount.
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [loaded, setLoaded] = useState(false);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    try {
      setChoiceState(parseTheme(window.localStorage.getItem(THEME_KEY)));
    } catch {
      // storage unavailable: follow the system
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    setLoaded(true);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved = resolveTheme(choice, systemDark);

  // Apply only after the saved choice is known, so we never flip away from what the init script set.
  useEffect(() => {
    if (!loaded) return;
    document.documentElement.dataset.theme = resolved;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", BROWSER_BAR[resolved]));
  }, [loaded, resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // not persisted, still works for this visit
    }
  }, []);

  return { choice, setChoice, resolved };
}
