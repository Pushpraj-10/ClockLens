import { describe, expect, it } from "vitest";
import { parseTheme, resolveTheme, THEME_INIT_SCRIPT, THEME_KEY } from "./themeCore";

describe("parseTheme", () => {
  it("accepts light and dark", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });
  it("treats everything else as system", () => {
    for (const raw of [null, undefined, "", "system", "auto", "DARK", "blue"]) expect(parseTheme(raw)).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("follows the OS only for system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  it("an explicit choice wins over the OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  const run = (stored: string | null, systemDark: boolean): string | undefined => {
    const doc = { documentElement: { dataset: {} as Record<string, string> } };
    const win = {
      localStorage: { getItem: (k: string) => (k === THEME_KEY ? stored : null) },
      matchMedia: () => ({ matches: systemDark }),
    };
    new Function("document", "window", "localStorage", THEME_INIT_SCRIPT)(doc, win, win.localStorage);
    return doc.documentElement.dataset.theme;
  };

  it("applies a stored explicit choice", () => {
    expect(run("light", true)).toBe("light");
    expect(run("dark", false)).toBe("dark");
  });
  it("falls back to the OS setting", () => {
    expect(run(null, true)).toBe("dark");
    expect(run("system", false)).toBe("light");
    expect(run("garbage", true)).toBe("dark");
  });
  it("agrees with parseTheme + resolveTheme", () => {
    for (const stored of [null, "light", "dark", "system", "x"]) {
      for (const dark of [true, false]) {
        expect(run(stored, dark)).toBe(resolveTheme(parseTheme(stored), dark));
      }
    }
  });
  it("does not throw when storage is blocked", () => {
    const doc = { documentElement: { dataset: {} as Record<string, string> } };
    const win = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
      matchMedia: () => ({ matches: true }),
    };
    expect(() => new Function("document", "window", "localStorage", THEME_INIT_SCRIPT)(doc, win, win.localStorage)).not.toThrow();
  });
});
