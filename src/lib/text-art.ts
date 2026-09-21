/**
 * Text Art Engine
 * ===============
 * Draws display titles as *artwork* rather than plain text: the letters
 * themselves get a material (gold, silver, chrome, rusted, damaged…), an
 * outline, an extruded 3D body, an inner bevel and a shadow.
 *
 * How the materials work
 * ----------------------
 * Canvas can fill text with a gradient, so a material is essentially a
 * carefully tuned vertical gradient plus per-material extras painted through a
 * clip of the glyph path:
 *   - metals (gold/silver/chrome/copper) use multi-stop gradients with a hard
 *     specular band where the "horizon" line sits — that hard stop is what
 *     makes metal read as metal instead of as a coloured blur;
 *   - rusted and damaged add procedural speckle and erosion scratches, seeded
 *     deterministically from the glyph index so a title looks identical in the
 *     preview and in the export;
 *   - neon/glass/fire rely on layered glows and transparency.
 *
 * Everything is deterministic: no Math.random at draw time.
 */

/** Material applied to the letter faces. */
export type TextMaterial =
  | "solid"
  | "gradient"
  | "gold"
  | "silver"
  | "chrome"
  | "copper"
  | "rose_gold"
  | "bronze"
  | "rusted"
  | "damaged"
  | "stone"
  | "wood"
  | "neon"
  | "fire"
  | "ice"
  | "glass"
  | "candy"
  | "camo"
  | "holographic";

export interface MaterialDef {
  id: TextMaterial;
  name: string;
  icon: string;
  blurb: string;
  /** suggested companion outline colour */
  outline: string;
  /** swatch colours for the picker button */
  swatch: [string, string];
}

export const TEXT_MATERIALS: MaterialDef[] = [
  { id: "solid", name: "Solid", icon: "⬛", blurb: "One flat colour", outline: "#000000", swatch: ["#FFFFFF", "#CCCCCC"] },
  { id: "gradient", name: "Gradient", icon: "🌈", blurb: "Two-colour vertical blend", outline: "#0B1220", swatch: ["#6366F1", "#EC4899"] },
  { id: "gold", name: "Gold", icon: "🥇", blurb: "Polished gold with a hard specular band", outline: "#3E2708", swatch: ["#FFF3B0", "#A8730B"] },
  { id: "silver", name: "Silver", icon: "🥈", blurb: "Brushed silver with cool highlights", outline: "#2B3240", swatch: ["#FFFFFF", "#7C8896"] },
  { id: "chrome", name: "Chrome", icon: "🪞", blurb: "Mirror chrome with a sky/ground split", outline: "#0A0F18", swatch: ["#DFF3FF", "#26445E"] },
  { id: "copper", name: "Copper", icon: "🟠", blurb: "Warm copper with a dark patina", outline: "#3A1B08", swatch: ["#FFCBA4", "#8A4118"] },
  { id: "rose_gold", name: "Rose Gold", icon: "🌹", blurb: "Soft pink-gold sheen", outline: "#4A2029", swatch: ["#FFE0E0", "#B76E79"] },
  { id: "bronze", name: "Bronze", icon: "🟤", blurb: "Aged bronze, statue-like", outline: "#241405", swatch: ["#E8C08A", "#6B4A20"] },
  { id: "rusted", name: "Rusted", icon: "🦀", blurb: "Corroded iron with pitting and rust bloom", outline: "#2A1206", swatch: ["#B45309", "#5B2607"] },
  { id: "damaged", name: "Damaged", icon: "💥", blurb: "Worn paint, cracks and chipped edges", outline: "#101010", swatch: ["#C9C4BC", "#54504A"] },
  { id: "stone", name: "Stone", icon: "🪨", blurb: "Carved granite with speckled grain", outline: "#1A1A1A", swatch: ["#C6C3BD", "#5E5B56"] },
  { id: "wood", name: "Wood", icon: "🪵", blurb: "Timber with running grain", outline: "#2A1708", swatch: ["#C08A4E", "#6B4423"] },
  { id: "neon", name: "Neon", icon: "💡", blurb: "Glowing tube with a bright core", outline: "#FF2D95", swatch: ["#FFFFFF", "#FF2D95"] },
  { id: "fire", name: "Fire", icon: "🔥", blurb: "White-hot core fading to ember", outline: "#3A0A00", swatch: ["#FFF3B0", "#D92B04"] },
  { id: "ice", name: "Ice", icon: "🧊", blurb: "Frosted blue with a cold rim", outline: "#0A2A3E", swatch: ["#EAFBFF", "#4DA8CC"] },
  { id: "glass", name: "Glass", icon: "🫧", blurb: "Translucent with a sharp sheen", outline: "#FFFFFF", swatch: ["#FFFFFF", "#8FD4FF"] },
  { id: "candy", name: "Candy", icon: "🍬", blurb: "Glossy sweet-shop colours", outline: "#4A0B3A", swatch: ["#FF9AE0", "#7C3AED"] },
  { id: "camo", name: "Camo", icon: "🪖", blurb: "Military camouflage patches", outline: "#1B2410", swatch: ["#7A8B50", "#3F4A24"] },
  { id: "holographic", name: "Holographic", icon: "🌌", blurb: "Iridescent rainbow shift", outline: "#120A2A", swatch: ["#A0F0FF", "#FF9AE0"] },
];

export const MATERIAL_BY_ID: Record<string, MaterialDef> = Object.fromEntries(
  TEXT_MATERIALS.map((m) => [m.id, m])
);

/** Letter shape treatment. */
export type LetterStyle =
  | "normal"
  | "bold"
  | "black"
  | "italic"
  | "bold_italic"
  | "script"
  | "script_bold"
  | "condensed"
  | "wide";

export const LETTER_STYLES: { id: LetterStyle; name: string; blurb: string }[] = [
  { id: "normal", name: "Regular", blurb: "Standard weight" },
  { id: "bold", name: "Bold", blurb: "Heavier strokes" },
  { id: "black", name: "Black", blurb: "Maximum weight" },
  { id: "italic", name: "Italic", blurb: "Slanted" },
  { id: "bold_italic", name: "Bold Italic", blurb: "Heavy and slanted" },
  { id: "script", name: "Script", blurb: "Flowing handwritten face" },
  { id: "script_bold", name: "Script Bold", blurb: "Heavy handwritten face" },
  { id: "condensed", name: "Condensed", blurb: "Narrow letters, tight fit" },
  { id: "wide", name: "Wide", blurb: "Stretched letters" },
];

/** Full artwork settings for a title. */
export interface TextArtStyle {
  material: TextMaterial;
  /** used by solid/gradient, and tints some materials */
  color1: string;
  color2: string;
  letterStyle: LetterStyle;
  /** font id from CAPTION_FONTS */
  fontId: string;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  uppercase: boolean;
  /** extra slant in degrees, on top of any italic face (-30..30) */
  skew: number;
  /** curve the baseline into an arc, -1..1 (0 = straight) */
  arc: number;

  /* ---- letter border / outline ---- */
  outlineWidth: number;
  outlineColor: string;
  outlineOpacity: number;
  /** second, wider outline for a sticker-style double border */
  outline2Width: number;
  outline2Color: string;

  /* ---- 3D extrusion ---- */
  depth: number;
  depthColor: string;
  /** extrusion direction in degrees (45 = down-right) */
  depthAngle: number;

  /* ---- bevel & finish ---- */
  bevel: number;
  gloss: number;
  /** material texture strength (rust pitting, wood grain, etc.) */
  texture: number;

  /* ---- shadow & glow ---- */
  shadow: number;
  shadowColor: string;
  glow: number;
  glowColor: string;
}

export const DEFAULT_TEXT_ART: TextArtStyle = {
  material: "gold",
  color1: "#FFD54A",
  color2: "#8A5A00",
  letterStyle: "black",
  fontId: "anton",
  fontSize: 92,
  letterSpacing: 0.02,
  lineHeight: 1.05,
  uppercase: true,
  skew: 0,
  arc: 0,
  outlineWidth: 3,
  outlineColor: "#3E2708",
  outlineOpacity: 1,
  outline2Width: 0,
  outline2Color: "#FFFFFF",
  depth: 7,
  depthColor: "#4A2F06",
  depthAngle: 50,
  bevel: 0.6,
  gloss: 0.55,
  texture: 0.6,
  shadow: 0.6,
  shadowColor: "#000000",
  glow: 0.2,
  glowColor: "#FFC400",
};

/** Ready-made looks so a user gets something striking in one click. */
export interface TextArtPreset {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  style: Partial<TextArtStyle>;
}

export const TEXT_ART_PRESETS: TextArtPreset[] = [
  {
    id: "classic_gold",
    name: "Classic Gold",
    icon: "🥇",
    blurb: "Heavy gold with a dark bevelled edge",
    style: { material: "gold", letterStyle: "black", fontId: "anton", outlineWidth: 3, outlineColor: "#3E2708", depth: 8, depthColor: "#4A2F06", bevel: 0.7, gloss: 0.6, glow: 0.25, glowColor: "#FFC400" },
  },
  {
    id: "silver_chrome",
    name: "Chrome Plate",
    icon: "🪞",
    blurb: "Mirror chrome with a crisp white rim",
    style: { material: "chrome", letterStyle: "black", fontId: "anton", outlineWidth: 2.5, outlineColor: "#0A0F18", outline2Width: 5, outline2Color: "#E8F4FF", depth: 6, depthColor: "#1B2A38", bevel: 0.8, gloss: 0.9, glow: 0.15, glowColor: "#9FD8FF" },
  },
  {
    id: "rusted_iron",
    name: "Rusted Iron",
    icon: "🦀",
    blurb: "Corroded metal, pitted and weathered",
    style: { material: "rusted", letterStyle: "black", fontId: "anton", outlineWidth: 3.5, outlineColor: "#2A1206", depth: 7, depthColor: "#2A1206", bevel: 0.35, gloss: 0.15, texture: 1, shadow: 0.75, glow: 0 },
  },
  {
    id: "battle_damaged",
    name: "Battle Damaged",
    icon: "💥",
    blurb: "Chipped paint with cracks running through",
    style: { material: "damaged", letterStyle: "black", fontId: "anton", outlineWidth: 3, outlineColor: "#101010", depth: 5, depthColor: "#1A1A1A", bevel: 0.3, gloss: 0.2, texture: 1, shadow: 0.8, glow: 0 },
  },
  {
    id: "neon_sign",
    name: "Neon Sign",
    icon: "💡",
    blurb: "Glowing tube against the dark",
    style: { material: "neon", letterStyle: "bold", fontId: "monoton", outlineWidth: 2, outlineColor: "#FF2D95", depth: 0, bevel: 0, gloss: 0.3, glow: 1, glowColor: "#FF2D95", shadow: 0.2 },
  },
  {
    id: "elegant_script",
    name: "Elegant Script",
    icon: "✒️",
    blurb: "Flowing gold script with a fine outline",
    style: { material: "gold", letterStyle: "script_bold", fontId: "caveat", fontSize: 104, outlineWidth: 1.5, outlineColor: "#4A3208", depth: 3, bevel: 0.5, gloss: 0.7, glow: 0.3, glowColor: "#FFE9A8", uppercase: false },
  },
  {
    id: "fire_title",
    name: "Fire",
    icon: "🔥",
    blurb: "White-hot core bleeding into embers",
    style: { material: "fire", letterStyle: "black", fontId: "anton", outlineWidth: 2.5, outlineColor: "#3A0A00", depth: 4, depthColor: "#5B1500", bevel: 0.4, gloss: 0.5, glow: 0.85, glowColor: "#FF7A18" },
  },
  {
    id: "frozen",
    name: "Frozen",
    icon: "🧊",
    blurb: "Frosted ice with a cold blue rim",
    style: { material: "ice", letterStyle: "bold", fontId: "baloo2", outlineWidth: 2.5, outlineColor: "#0A2A3E", outline2Width: 5, outline2Color: "#CFF3FF", depth: 4, depthColor: "#12475F", bevel: 0.7, gloss: 0.85, glow: 0.45, glowColor: "#8FE4FF" },
  },
  {
    id: "carved_stone",
    name: "Carved Stone",
    icon: "🪨",
    blurb: "Granite letters chiselled into the frame",
    style: { material: "stone", letterStyle: "bold", fontId: "cinzel", outlineWidth: 2, outlineColor: "#1A1A1A", depth: 6, depthColor: "#2E2C29", bevel: 0.9, gloss: 0.1, texture: 0.8, shadow: 0.7, glow: 0 },
  },
  {
    id: "comic_pop",
    name: "Comic Pop",
    icon: "💢",
    blurb: "Thick double outline, candy colours",
    style: { material: "candy", letterStyle: "black", fontId: "bangers", outlineWidth: 4, outlineColor: "#2A0620", outline2Width: 9, outline2Color: "#FFFFFF", depth: 8, depthColor: "#7C1D6F", bevel: 0.4, gloss: 0.8, glow: 0.2 },
  },
  {
    id: "holo_shift",
    name: "Holographic",
    icon: "🌌",
    blurb: "Iridescent rainbow with a white edge",
    style: { material: "holographic", letterStyle: "black", fontId: "inter", outlineWidth: 2, outlineColor: "#120A2A", outline2Width: 4, outline2Color: "#FFFFFF", depth: 5, depthColor: "#241155", bevel: 0.6, gloss: 0.9, glow: 0.5, glowColor: "#A0F0FF" },
  },
  {
    id: "clean_modern",
    name: "Clean Modern",
    icon: "⬜",
    blurb: "Flat white, no frills — lets the footage speak",
    style: { material: "solid", color1: "#FFFFFF", letterStyle: "bold", fontId: "inter", outlineWidth: 0, depth: 0, bevel: 0, gloss: 0, glow: 0, shadow: 0.65 },
  },
];

export const PRESET_BY_ID: Record<string, TextArtPreset> = Object.fromEntries(
  TEXT_ART_PRESETS.map((p) => [p.id, p])
);

// ------------------------------------------------------------------ helpers

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || "#000000").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
}

/** Deterministic pseudo-random in [0,1) — same output every render. */
function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** CSS font string for the chosen letter style. */
/** Slider definitions for the Text Art panel in the Design tab. */
export const ART_CONTROLS: {
  key: keyof TextArtStyle;
  label: string;
  min: number;
  max: number;
  step: number;
  group: "letters" | "outline" | "depth" | "finish";
  suffix?: "px" | "percent" | "deg";
}[] = [
  { key: "fontSize", label: "Letter size", min: 36, max: 180, step: 2, group: "letters", suffix: "px" },
  { key: "letterSpacing", label: "Letter spacing", min: -0.05, max: 0.4, step: 0.01, group: "letters", suffix: "percent" },
  { key: "lineHeight", label: "Line height", min: 0.85, max: 1.8, step: 0.05, group: "letters" },
  { key: "skew", label: "Slant", min: -30, max: 30, step: 1, group: "letters", suffix: "deg" },
  { key: "arc", label: "Arc / curve", min: -1, max: 1, step: 0.05, group: "letters" },
  { key: "outlineWidth", label: "Letter border", min: 0, max: 16, step: 0.5, group: "outline", suffix: "px" },
  { key: "outlineOpacity", label: "Border opacity", min: 0, max: 1, step: 0.05, group: "outline", suffix: "percent" },
  { key: "outline2Width", label: "Outer border", min: 0, max: 26, step: 0.5, group: "outline", suffix: "px" },
  { key: "depth", label: "3D depth", min: 0, max: 30, step: 1, group: "depth", suffix: "px" },
  { key: "depthAngle", label: "Depth angle", min: 0, max: 360, step: 5, group: "depth", suffix: "deg" },
  { key: "bevel", label: "Bevel", min: 0, max: 1, step: 0.05, group: "finish", suffix: "percent" },
  { key: "gloss", label: "Gloss / shine", min: 0, max: 1, step: 0.05, group: "finish", suffix: "percent" },
  { key: "texture", label: "Texture", min: 0, max: 1, step: 0.05, group: "finish", suffix: "percent" },
  { key: "shadow", label: "Drop shadow", min: 0, max: 40, step: 1, group: "finish", suffix: "px" },
  { key: "glow", label: "Glow", min: 0, max: 1, step: 0.05, group: "finish", suffix: "percent" },
];

export function artFontString(
  style: TextArtStyle,
  family: string,
  fallback: string,
  size: number
): string {
  const ls = style.letterStyle;
  const italic = ls === "italic" || ls === "bold_italic" ? "italic " : "";
  let weight = 700;
  if (ls === "normal" || ls === "italic") weight = 400;
  else if (ls === "bold" || ls === "bold_italic" || ls === "script_bold") weight = 700;
  else if (ls === "black") weight = 900;
  else if (ls === "script") weight = 500;
  else if (ls === "condensed" || ls === "wide") weight = 800;
  return `${italic}${weight} ${Math.max(6, size)}px "${family}", ${fallback}`;
}

/** Script styles override the chosen face with a handwritten one. */
export function artFamilyFor(
  style: TextArtStyle,
  base: { family: string; fallback: string }
): { family: string; fallback: string } {
  if (style.letterStyle === "script" || style.letterStyle === "script_bold") {
    return { family: "Caveat", fallback: "'Segoe Script', 'Bradley Hand', cursive" };
  }
  return base;
}

/** Horizontal scale for condensed/wide letter styles. */
export function artStretch(style: TextArtStyle): number {
  if (style.letterStyle === "condensed") return 0.82;
  if (style.letterStyle === "wide") return 1.18;
  return 1;
}

// ------------------------------------------------------------- materials

/**
 * Builds the fill for the letter faces. Metals get hard specular stops; the
 * gradient runs over the text block's own height so every line matches.
 */
function materialFill(
  ctx: CanvasRenderingContext2D,
  style: TextArtStyle,
  top: number,
  height: number
): string | CanvasGradient {
  const g = ctx.createLinearGradient(0, top, 0, top + height);
  const h = (t: number) => top + height * t;
  void h;

  switch (style.material) {
    case "solid":
      return style.color1;

    case "gradient":
      g.addColorStop(0, style.color1);
      g.addColorStop(1, style.color2);
      return g;

    case "gold":
      // the tight 0.46→0.52 jump is the specular band that sells the metal
      g.addColorStop(0.0, "#FFF8D0");
      g.addColorStop(0.18, "#FFE071");
      g.addColorStop(0.46, "#E8A302");
      g.addColorStop(0.52, "#FFF0A8");
      g.addColorStop(0.72, "#C87F06");
      g.addColorStop(0.9, "#8A5A00");
      g.addColorStop(1, "#5E3C00");
      return g;

    case "silver":
      g.addColorStop(0.0, "#FFFFFF");
      g.addColorStop(0.2, "#DDE4EC");
      g.addColorStop(0.46, "#8A96A6");
      g.addColorStop(0.52, "#FFFFFF");
      g.addColorStop(0.74, "#98A3B2");
      g.addColorStop(1, "#5C6675");
      return g;

    case "chrome":
      // sky above, ground below — the classic chrome reflection cheat
      g.addColorStop(0.0, "#DFF3FF");
      g.addColorStop(0.34, "#7FB6D9");
      g.addColorStop(0.49, "#1E3B52");
      g.addColorStop(0.51, "#6E5A3C");
      g.addColorStop(0.66, "#E8D9B8");
      g.addColorStop(0.85, "#8A97A5");
      g.addColorStop(1, "#26445E");
      return g;

    case "copper":
      g.addColorStop(0.0, "#FFD9B8");
      g.addColorStop(0.24, "#E08A4E");
      g.addColorStop(0.5, "#B15A22");
      g.addColorStop(0.56, "#FFC69A");
      g.addColorStop(0.8, "#8A4118");
      g.addColorStop(1, "#5A2A0E");
      return g;

    case "rose_gold":
      g.addColorStop(0.0, "#FFF0F0");
      g.addColorStop(0.26, "#F2C0BE");
      g.addColorStop(0.5, "#C98089");
      g.addColorStop(0.56, "#FFDCDC");
      g.addColorStop(0.82, "#A9636E");
      g.addColorStop(1, "#7A4450");
      return g;

    case "bronze":
      g.addColorStop(0.0, "#F0D3A6");
      g.addColorStop(0.28, "#C79A5C");
      g.addColorStop(0.52, "#8A6631");
      g.addColorStop(0.58, "#DCB87E");
      g.addColorStop(0.82, "#6B4A20");
      g.addColorStop(1, "#453014");
      return g;

    case "rusted":
      g.addColorStop(0.0, "#C7793A");
      g.addColorStop(0.3, "#A2521F");
      g.addColorStop(0.55, "#7A3A12");
      g.addColorStop(0.78, "#5B2607");
      g.addColorStop(1, "#43200A");
      return g;

    case "damaged":
      g.addColorStop(0.0, "#D8D3CB");
      g.addColorStop(0.35, "#A8A29A");
      g.addColorStop(0.7, "#6E6A64");
      g.addColorStop(1, "#4A4742");
      return g;

    case "stone":
      g.addColorStop(0.0, "#D4D1CB");
      g.addColorStop(0.4, "#A9A6A0");
      g.addColorStop(0.75, "#7C7975");
      g.addColorStop(1, "#5E5B56");
      return g;

    case "wood":
      g.addColorStop(0.0, "#D39A5E");
      g.addColorStop(0.35, "#A9703C");
      g.addColorStop(0.72, "#7E5027");
      g.addColorStop(1, "#5A3A1B");
      return g;

    case "neon":
      g.addColorStop(0, "#FFFFFF");
      g.addColorStop(0.5, mix(style.glowColor || "#FF2D95", "#FFFFFF", 0.35));
      g.addColorStop(1, style.glowColor || "#FF2D95");
      return g;

    case "fire":
      g.addColorStop(0.0, "#FFFCE8");
      g.addColorStop(0.24, "#FFD166");
      g.addColorStop(0.52, "#FF8A1E");
      g.addColorStop(0.78, "#E23A05");
      g.addColorStop(1, "#8A1A02");
      return g;

    case "ice":
      g.addColorStop(0.0, "#FFFFFF");
      g.addColorStop(0.26, "#E2F8FF");
      g.addColorStop(0.55, "#9BD8EE");
      g.addColorStop(0.8, "#5FAFD0");
      g.addColorStop(1, "#2F7E9E");
      return g;

    case "glass":
      g.addColorStop(0.0, "rgba(255,255,255,0.92)");
      g.addColorStop(0.45, "rgba(190,230,255,0.42)");
      g.addColorStop(0.55, "rgba(255,255,255,0.72)");
      g.addColorStop(1, "rgba(140,200,240,0.5)");
      return g;

    case "candy":
      g.addColorStop(0.0, "#FFFFFF");
      g.addColorStop(0.2, style.color1 || "#FF9AE0");
      g.addColorStop(0.62, style.color2 || "#7C3AED");
      g.addColorStop(1, mix(style.color2 || "#7C3AED", "#000000", 0.35));
      return g;

    case "camo":
      g.addColorStop(0, "#7A8B50");
      g.addColorStop(1, "#3F4A24");
      return g;

    case "holographic": {
      // iridescent sweep
      const stops = ["#A0F0FF", "#B7A0FF", "#FF9AE0", "#FFD98F", "#9AFFC7", "#A0F0FF"];
      stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
      return g;
    }

    default:
      return style.color1;
  }
}

/**
 * Extra passes painted *inside* the glyph clip: rust pitting, wood grain,
 * camo patches, stone speckle, cracks. Seeded so it never shimmers.
 */
function materialTexture(
  ctx: CanvasRenderingContext2D,
  style: TextArtStyle,
  left: number,
  top: number,
  width: number,
  height: number,
  seed: number
) {
  const amt = Math.max(0, Math.min(1, style.texture));
  if (amt <= 0.01) return;

  switch (style.material) {
    case "rusted": {
      // corrosion blooms
      const blooms = Math.round(26 * amt);
      for (let i = 0; i < blooms; i++) {
        const px = left + rnd(seed + i * 3.1) * width;
        const py = top + rnd(seed + i * 7.7) * height;
        const r = (4 + rnd(seed + i * 2.3) * 16) * amt;
        const rg = ctx.createRadialGradient(px, py, 0, px, py, r);
        const dark = rnd(seed + i) > 0.5;
        rg.addColorStop(0, dark ? "rgba(60,26,6,0.55)" : "rgba(200,110,40,0.5)");
        rg.addColorStop(1, "rgba(90,40,10,0)");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // pitting
      const pits = Math.round(90 * amt);
      for (let i = 0; i < pits; i++) {
        const px = left + rnd(seed + 500 + i * 1.7) * width;
        const py = top + rnd(seed + 900 + i * 2.9) * height;
        ctx.fillStyle = `rgba(40,18,4,${0.15 + rnd(seed + i) * 0.4})`;
        ctx.fillRect(px, py, 1 + rnd(seed + i * 5) * 2.5, 1 + rnd(seed + i * 9) * 2.5);
      }
      break;
    }

    case "damaged": {
      // chipped paint patches
      const chips = Math.round(20 * amt);
      for (let i = 0; i < chips; i++) {
        const px = left + rnd(seed + i * 4.3) * width;
        const py = top + rnd(seed + i * 8.1) * height;
        const w = (6 + rnd(seed + i) * 26) * amt;
        const h = (4 + rnd(seed + i * 3) * 16) * amt;
        ctx.fillStyle = `rgba(28,26,24,${0.3 + rnd(seed + i * 2) * 0.35})`;
        ctx.beginPath();
        ctx.ellipse(px, py, w / 2, h / 2, rnd(seed + i) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // cracks
      ctx.strokeStyle = `rgba(18,17,16,${0.55 * amt})`;
      ctx.lineWidth = 1.6;
      const cracks = Math.round(7 * amt);
      for (let i = 0; i < cracks; i++) {
        let px = left + rnd(seed + 300 + i * 6.1) * width;
        let py = top + rnd(seed + 400 + i * 3.3) * height;
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let k = 0; k < 5; k++) {
          px += (rnd(seed + i * 10 + k) - 0.45) * width * 0.12;
          py += (rnd(seed + i * 20 + k) - 0.3) * height * 0.24;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      break;
    }

    case "stone": {
      const specks = Math.round(220 * amt);
      for (let i = 0; i < specks; i++) {
        const px = left + rnd(seed + i * 1.3) * width;
        const py = top + rnd(seed + i * 2.1) * height;
        const v = rnd(seed + i * 3.7);
        ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${0.22 * amt})` : `rgba(40,38,36,${0.3 * amt})`;
        ctx.fillRect(px, py, 1.6, 1.6);
      }
      break;
    }

    case "wood": {
      ctx.lineWidth = 1.4;
      const grains = Math.round(20 * amt);
      for (let i = 0; i < grains; i++) {
        const y0 = top + (i / grains) * height + rnd(seed + i) * 4;
        ctx.strokeStyle = `rgba(70,42,18,${0.18 + rnd(seed + i) * 0.22})`;
        ctx.beginPath();
        ctx.moveTo(left, y0);
        for (let x = left; x < left + width; x += 18) {
          ctx.lineTo(x, y0 + Math.sin((x + i * 30) * 0.02) * 3.2);
        }
        ctx.stroke();
      }
      break;
    }

    case "camo": {
      const patches = Math.round(22 * amt);
      const cols = ["#4A5A2A", "#2E3A18", "#8A9560", "#1F2812"];
      for (let i = 0; i < patches; i++) {
        const px = left + rnd(seed + i * 5.1) * width;
        const py = top + rnd(seed + i * 9.3) * height;
        const r = 10 + rnd(seed + i * 2.7) * 34;
        ctx.fillStyle = cols[i % cols.length];
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * (0.5 + rnd(seed + i) * 0.5), rnd(seed + i) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }

    default:
      break;
  }
}

// --------------------------------------------------------------- drawing

export interface DrawTextArtOptions {
  /** resolved font family + fallback (already run through artFamilyFor) */
  family: string;
  fallback: string;
  /** centre x of the text block */
  x: number;
  /** top y of the first line */
  y: number;
  maxWidth: number;
  /** 0..1 reveal for typewriter-style entrances */
  reveal?: number;
  /** deterministic seed so texture never shimmers between frames */
  seed?: number;
}

/** Splits text into lines that fit, honouring explicit newlines. */
export function layoutArtLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: TextArtStyle,
  opts: { family: string; fallback: string; maxWidth: number; size: number }
): string[] {
  const stretch = artStretch(style);
  ctx.save();
  ctx.font = artFontString(style, opts.family, opts.fallback, opts.size);
  const fits = (s: string) => ctx.measureText(s).width * stretch <= opts.maxWidth;

  const out: string[] = [];
  for (const para of (text || "").split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${line} ${words[i]}`;
      if (fits(test)) line = test;
      else {
        out.push(line);
        line = words[i];
      }
    }
    out.push(line);
  }
  ctx.restore();
  return out;
}

/** Draws one line's glyph path, honouring letter spacing and arc. */
function tracePath(
  ctx: CanvasRenderingContext2D,
  line: string,
  style: TextArtStyle,
  cx: number,
  y: number,
  size: number,
  mode: "fill" | "stroke"
) {
  const spacing = style.letterSpacing * size;
  const stretch = artStretch(style);

  // total width including spacing so we can centre the line
  let total = 0;
  const widths: number[] = [];
  for (const ch of line) {
    const w = ctx.measureText(ch).width * stretch;
    widths.push(w);
    total += w + spacing;
  }
  total -= spacing;

  if (Math.abs(style.arc) < 0.02) {
    let px = cx - total / 2;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      ctx.save();
      ctx.translate(px + widths[i] / 2, y);
      if (stretch !== 1) ctx.scale(stretch, 1);
      if (mode === "fill") ctx.fillText(ch, 0, 0);
      else ctx.strokeText(ch, 0, 0);
      ctx.restore();
      px += widths[i] + spacing;
    }
    return;
  }

  // arc: place each glyph along a circle of radius derived from the arc amount
  const radius = (total / Math.max(0.08, Math.abs(style.arc))) * 0.5;
  const dir = style.arc >= 0 ? 1 : -1;
  const totalAngle = total / radius;
  let angle = -totalAngle / 2;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const step = (widths[i] + spacing) / radius;
    const a = angle + step / 2;
    ctx.save();
    ctx.translate(cx + Math.sin(a) * radius * dir, y - dir * (radius - Math.cos(a) * radius));
    ctx.rotate(a * dir);
    if (stretch !== 1) ctx.scale(stretch, 1);
    if (mode === "fill") ctx.fillText(ch, 0, 0);
    else ctx.strokeText(ch, 0, 0);
    ctx.restore();
    angle += step;
  }
}

/**
 * Paints display text as artwork.
 *
 * Draw order matters: extrusion first (behind), then outlines widest to
 * narrowest, then the material face, then texture/bevel/gloss on top.
 */
export function drawTextArt(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: TextArtStyle,
  opts: DrawTextArtOptions
): { width: number; height: number; lines: number } {
  const size = Math.max(8, style.fontSize);
  const body = style.uppercase ? (text || "").toUpperCase() : text || "";
  const lines = layoutArtLines(ctx, body, style, {
    family: opts.family,
    fallback: opts.fallback,
    maxWidth: opts.maxWidth,
    size,
  });

  const reveal = opts.reveal ?? 1;
  const seed = opts.seed ?? 7;
  const lh = size * style.lineHeight;
  const blockH = lh * lines.length;
  const stretch = artStretch(style);

  ctx.save();
  ctx.font = artFontString(style, opts.family, opts.fallback, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // extra slant on top of the face's own italic
  if (style.skew) {
    ctx.transform(1, 0, Math.tan((-style.skew * Math.PI) / 180), 1, 0, 0);
  }

  // measure the widest line for the caller
  let widest = 0;
  for (const l of lines) {
    const w = ctx.measureText(l).width * stretch + style.letterSpacing * size * Math.max(0, l.length - 1);
    if (w > widest) widest = w;
  }

  const firstY = opts.y + lh / 2;
  const topY = opts.y;

  // how many characters to show (typewriter reveal)
  const totalChars = lines.reduce((n, l) => n + l.length, 0);
  let budget = Math.ceil(totalChars * Math.max(0, Math.min(1, reveal)));

  lines.forEach((rawLine, li) => {
    if (budget <= 0 && reveal < 1) return;
    let line = rawLine;
    if (reveal < 1) {
      line = rawLine.slice(0, Math.max(0, budget));
      budget -= rawLine.length;
    }
    if (!line) return;

    const y = firstY + li * lh;

    // ---------- 1. drop shadow ----------
    if (style.shadow > 0) {
      ctx.save();
      ctx.shadowColor = rgba(style.shadowColor, 0.75 * style.shadow);
      ctx.shadowBlur = 16 * style.shadow;
      ctx.shadowOffsetY = 6 * style.shadow;
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      tracePath(ctx, line, style, opts.x, y, size, "fill");
      ctx.restore();
    }

    // ---------- 2. outer glow ----------
    if (style.glow > 0) {
      ctx.save();
      ctx.shadowColor = rgba(style.glowColor, 0.95);
      ctx.shadowBlur = 30 * style.glow;
      ctx.fillStyle = rgba(style.glowColor, 0.5);
      tracePath(ctx, line, style, opts.x, y, size, "fill");
      // a second pass deepens the bloom for neon
      if (style.material === "neon") {
        ctx.shadowBlur = 60 * style.glow;
        tracePath(ctx, line, style, opts.x, y, size, "fill");
      }
      ctx.restore();
    }

    // ---------- 3. 3D extrusion ----------
    if (style.depth > 0) {
      const rad = (style.depthAngle * Math.PI) / 180;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      const steps = Math.max(2, Math.round(style.depth));
      for (let i = steps; i >= 1; i--) {
        ctx.save();
        ctx.fillStyle = mix(style.depthColor, "#000000", 0.1 + (i / steps) * 0.35);
        tracePath(ctx, line, style, opts.x + dx * i, y + dy * i, size, "fill");
        ctx.restore();
      }
    }

    // ---------- 4. outlines, widest first ----------
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    if (style.outline2Width > 0) {
      ctx.save();
      ctx.lineWidth = style.outline2Width * 2 + style.outlineWidth * 2;
      ctx.strokeStyle = style.outline2Color;
      tracePath(ctx, line, style, opts.x, y, size, "stroke");
      ctx.restore();
    }
    if (style.outlineWidth > 0 && style.outlineOpacity > 0) {
      ctx.save();
      ctx.lineWidth = style.outlineWidth * 2;
      ctx.strokeStyle = rgba(style.outlineColor, style.outlineOpacity);
      tracePath(ctx, line, style, opts.x, y, size, "stroke");
      ctx.restore();
    }

    // ---------- 5. material face ----------
    ctx.save();
    ctx.fillStyle = materialFill(ctx, style, topY, blockH);
    tracePath(ctx, line, style, opts.x, y, size, "fill");
    ctx.restore();

    // ---------- 6. texture + bevel + gloss, clipped to the glyphs ----------
    const needsOverlay =
      style.texture > 0.01 || style.bevel > 0.01 || style.gloss > 0.01;
    if (needsOverlay) {
      ctx.save();
      // Clip to the glyph shapes: build the path by stroking/filling into a clip
      // region. Canvas has no text-to-path, so we clip with a rect and rely on
      // 'source-atop' to keep the overlay inside what we already painted.
      ctx.globalCompositeOperation = "source-atop";

      const left = opts.x - widest / 2 - 8;
      const wBox = widest + 16;

      if (style.texture > 0.01) {
        materialTexture(ctx, style, left, y - lh / 2, wBox, lh, seed + li * 131);
      }

      // bevel: light from top, shade at the bottom
      if (style.bevel > 0.01) {
        const bg = ctx.createLinearGradient(0, y - lh / 2, 0, y + lh / 2);
        bg.addColorStop(0, `rgba(255,255,255,${0.42 * style.bevel})`);
        bg.addColorStop(0.42, "rgba(255,255,255,0)");
        bg.addColorStop(0.62, "rgba(0,0,0,0)");
        bg.addColorStop(1, `rgba(0,0,0,${0.45 * style.bevel})`);
        ctx.fillStyle = bg;
        ctx.fillRect(left, y - lh / 2, wBox, lh);
      }

      // gloss: a bright sweep across the upper half
      if (style.gloss > 0.01) {
        const gg = ctx.createLinearGradient(0, y - lh / 2, 0, y + lh * 0.1);
        gg.addColorStop(0, `rgba(255,255,255,${0.5 * style.gloss})`);
        gg.addColorStop(0.55, `rgba(255,255,255,${0.12 * style.gloss})`);
        gg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gg;
        ctx.fillRect(left, y - lh / 2, wBox, lh * 0.6);
      }

      ctx.restore();
    }
  });

  ctx.restore();
  return { width: widest, height: blockH, lines: lines.length };
}
