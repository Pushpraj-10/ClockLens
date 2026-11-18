/** Theme logic that must work on the server too (no React, no "use client"). */

export type ThemeChoice = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "clocklens.theme";

/** Anything that is not exactly "light" or "dark" means "follow the system". */
export function parseTheme(raw: string | null | undefined): ThemeChoice {
  return raw === "light" || raw === "dark" ? raw : "system";
}

/** The theme that is actually shown. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  if (choice === "system") return systemDark ? "dark" : "light";
  return choice;
}

/**
 * Runs in <head> before first paint so the page never flashes the wrong theme.
 * It mirrors parseTheme/resolveTheme above; storage can be blocked, so it is guarded.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(THEME_KEY)});var d=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=c==="light"||c==="dark"?c:(d?"dark":"light");}catch(e){}})();`;
