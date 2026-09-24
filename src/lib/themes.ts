import { useEffect, useState } from "react";

/**
 * Application theme system.
 *
 * Five drastically different looks, switched at runtime by setting the
 * `data-theme` attribute on <html>. Every theme's actual styling lives in
 * `src/themes.css` (hand-crafted design language) and
 * `src/themes.generated.css` (machine-generated utility colour remapping —
 * run `node scripts/generate-theme-css.mjs` to rebuild it).
 *
 * The choice persists in localStorage and is applied before first paint via
 * `initTheme()` in main.tsx, so there is no flash of the wrong theme.
 */

export type ThemeId = "classic" | "apple" | "windows" | "playful" | "glass" | "porcelain";

export interface ThemeDef {
  id: ThemeId;
  /** Display name in the switcher */
  name: string;
  /** One-line description of the look */
  tagline: string;
  /** Emoji shown in the switcher rows */
  icon: string;
  /** Three swatch colours previewing the palette */
  swatches: [string, string, string];
}

export const THEMES: ThemeDef[] = [
  {
    id: "classic",
    name: "Classic Dark",
    tagline: "The original Scenering look — dark panels, thin lines",
    icon: "🌙",
    swatches: ["#0b0f19", "#1f2937", "#6366f1"],
  },
  {
    id: "apple",
    name: "Apple Light",
    tagline: "Clean white, sharp borders & line icons — at home on iPad & iPhone",
    icon: "",
    swatches: ["#f5f5f7", "#ffffff", "#007aff"],
  },
  {
    id: "windows",
    name: "Fluent 11",
    tagline: "Windows 11 mica — frosted panels, rounded corners, cool blues",
    icon: "🪟",
    swatches: ["#141a24", "#232d3d", "#4cc2ff"],
  },
  {
    id: "playful",
    name: "Neon Pop",
    tagline: "Bold, colourful & full of fun — chunky 2D depth on dark",
    icon: "🎉",
    swatches: ["#191527", "#7c3aed", "#f43f8e"],
  },
  {
    id: "glass",
    name: "Fairytale Glass",
    tagline: "Frosted glass, pastel light, elegant serif warmth",
    icon: "🔮",
    swatches: ["#e8defa", "#ffffff", "#9b7ede"],
  },
  {
    id: "porcelain",
    name: "Porcelain",
    tagline: "Second light theme — warm china white, cobalt ink, glazed panels",
    icon: "🏺",
    swatches: ["#f7f4ef", "#fffdfa", "#2f6fb5"],
  },
];

export const DEFAULT_THEME: ThemeId = "classic";

const STORAGE_KEY = "scenering_theme";
const CHANGE_EVENT = "scenering-theme-changed";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((t) => t.id === value);
}

export function getStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isThemeId(raw)) return raw;
  } catch {}
  return DEFAULT_THEME;
}

/** Applies the theme to <html> and notifies listeners (idempotent). */
export function applyTheme(id: ThemeId) {
  const theme: ThemeId = isThemeId(id) ? id : DEFAULT_THEME;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<ThemeId>(CHANGE_EVENT, { detail: theme }));
  }
}

/** Read + apply the persisted theme. Call once before first render. */
export function initTheme(): ThemeId {
  const theme = getStoredTheme();
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
  return theme;
}

/** React hook: current theme + setter, stays in sync across components. */
export function useTheme(): { theme: ThemeId; setTheme: (id: ThemeId) => void; themes: ThemeDef[] } {
  const [theme, setThemeState] = useState<ThemeId>(() => getStoredTheme());

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ThemeId>).detail;
      if (isThemeId(detail)) setThemeState(detail);
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return { theme, setTheme: applyTheme, themes: THEMES };
}

export function getThemeDef(id: ThemeId): ThemeDef {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

/** Display font stack per theme (used for headings/tab labels). */
export { CHANGE_EVENT as THEME_CHANGE_EVENT, STORAGE_KEY as THEME_STORAGE_KEY };
