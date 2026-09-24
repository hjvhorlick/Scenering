/**
 * Visualiser colour themes
 * ========================
 * The audio visualisers are drawn in code, so a "theme" is simply a set of
 * colours the drawing routines reach for: a primary (the body of the bars /
 * terrain / ring), a secondary (the gradient's far end and the highlights) and
 * an accent (hot cores, tips and flashes). The list mirrors the palettes the
 * reference visualiser sites offer — Neon, Synthwave, Fire, Matrix, Blood Moon
 * and friends — so one click changes the whole look of a visualiser.
 *
 * Picking a theme writes the colours onto the insert as well, which keeps the
 * existing per-insert colour pickers honest: whatever the pickers show is what
 * the renderer uses. Choosing "Custom" leaves the pickers in charge.
 */

import type { InsertVisualOptions } from "../types";

export interface VisualizerPalette {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
}

export const VISUALIZER_PALETTES: VisualizerPalette[] = [
  { id: "neon", name: "Neon", primary: "#22d3ee", secondary: "#e879f9", accent: "#f0abfc" },
  { id: "synthwave", name: "Synthwave", primary: "#f472b6", secondary: "#2dd4bf", accent: "#fde68a" },
  { id: "fire", name: "Fire", primary: "#f97316", secondary: "#dc2626", accent: "#fef08a" },
  { id: "matrix", name: "Matrix", primary: "#22c55e", secondary: "#0d9488", accent: "#bbf7d0" },
  { id: "ocean", name: "Ocean", primary: "#0ea5e9", secondary: "#1e3a8a", accent: "#a5f3fc" },
  { id: "sunset", name: "Sunset", primary: "#fb7185", secondary: "#f59e0b", accent: "#fde68a" },
  { id: "vaporwave", name: "Vaporwave", primary: "#e879f9", secondary: "#60a5fa", accent: "#fbcfe8" },
  { id: "glacial", name: "Glacial", primary: "#67e8f9", secondary: "#e2e8f0", accent: "#ffffff" },
  { id: "blood_moon", name: "Blood Moon", primary: "#ef4444", secondary: "#7c2d12", accent: "#fdba74" },
  { id: "aurora", name: "Aurora", primary: "#34d399", secondary: "#818cf8", accent: "#f0abfc" },
  { id: "gold", name: "Gold", primary: "#facc15", secondary: "#b45309", accent: "#fef9c3" },
  { id: "mono", name: "Mono", primary: "#e5e7eb", secondary: "#6b7280", accent: "#ffffff" },
  { id: "toxic", name: "Toxic", primary: "#a3e635", secondary: "#16a34a", accent: "#ecfccb" },
  { id: "arctic", name: "Arctic", primary: "#38bdf8", secondary: "#c7d2fe", accent: "#ffffff" },
  { id: "candyfloss", name: "Candyfloss", primary: "#f9a8d4", secondary: "#c4b5fd", accent: "#fef3c7" },
  { id: "obsidian", name: "Obsidian", primary: "#94a3b8", secondary: "#0f172a", accent: "#f8fafc" },
];

export const VISUALIZER_PALETTE_BY_ID: Record<string, VisualizerPalette> = Object.fromEntries(
  VISUALIZER_PALETTES.map((p) => [p.id, p])
);

/** The colours the renderer should use for one visualiser insert. */
export function resolveVisualizerPalette(vo: InsertVisualOptions | undefined): VisualizerPalette {
  const themeId = vo?.colorTheme;
  if (themeId && themeId !== "custom" && VISUALIZER_PALETTE_BY_ID[themeId]) {
    return VISUALIZER_PALETTE_BY_ID[themeId];
  }
  // No theme picked (or an older saved project): keep exactly the colours this
  // insert already carries, so nothing on screen changes until a theme is chosen.
  const primary = vo?.primaryColor || (vo?.colorPreset === "crt_green" ? "#10b981" : "#38bdf8");
  const secondary = vo?.secondaryColor || "#f43f5e";
  return {
    id: themeId || "custom",
    name: "Custom",
    primary,
    secondary,
    accent: vo?.accentColor || mixHex(primary, "#ffffff", 0.4),
  };
}

/** Tiny local hex mix so this module has no dependency on the renderer. */
function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [
      parseInt(full.slice(0, 2), 16) || 0,
      parseInt(full.slice(2, 4), 16) || 0,
      parseInt(full.slice(4, 6), 16) || 0,
    ];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * Math.max(0, Math.min(1, t)));
  return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)]
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
    .join("")}`;
}
