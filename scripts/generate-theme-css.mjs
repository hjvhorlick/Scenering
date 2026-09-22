#!/usr/bin/env node
/**
 * Generates src/themes.generated.css — the per-theme colour matrix.
 *
 * How it works
 * ------------
 * The whole UI is styled with a consistent dark Tailwind palette
 * (gray-800/900/950 surfaces, indigo accents, semantic hues for feature
 * cards). Instead of touching ~19k lines of components, this script:
 *
 *   1. Scans src/ + index.html for every Tailwind colour utility token
 *      (bg-*, text-*, border-*, ring-*, from-*, …, including hover:/focus:/
 *      disabled:/group-hover:/sm: prefixes and /alpha modifiers).
 *   2. Remaps each token's colour through a per-theme transform:
 *        - neutral hues  (gray/slate/zinc/…) → the theme's surface ramp
 *        - accent hues   (indigo/violet)     → the theme's accent ramp
 *        - semantic hues (amber/emerald/…)   → a per-theme colour transform
 *   3. Emits `html[data-theme="<id>"] .token { … }` overrides.
 *
 * Neutral & accent ramps are hand-tuned per property role (bg/border/text);
 * everything else is computed, so coverage is automatic and nothing in the
 * components needs to change. The "classic" theme is intentionally absent —
 * it keeps the original Tailwind colours untouched.
 *
 * Run:  node scripts/generate-theme-css.mjs   (or: npm run theme:css)
 */

import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ */
/* Tailwind v3 default palette (the values the app was designed with)  */
/* ------------------------------------------------------------------ */
const P = {
  slate:  {50:"#f8fafc",100:"#f1f5f9",200:"#e2e8f0",300:"#cbd5e1",400:"#94a3b8",500:"#64748b",600:"#475569",700:"#334155",800:"#1e293b",900:"#0f172a",950:"#020617"},
  gray:   {50:"#f9fafb",100:"#f3f4f6",200:"#e5e7eb",300:"#d1d5db",400:"#9ca3af",500:"#6b7280",600:"#4b5563",700:"#374151",800:"#1f2937",900:"#111827",950:"#030712"},
  zinc:   {50:"#fafafa",100:"#f4f4f5",200:"#e4e4e7",300:"#d4d4d8",400:"#a1a1aa",500:"#71717a",600:"#52525b",700:"#3f3f46",800:"#27272a",900:"#18181b",950:"#09090b"},
  neutral:{50:"#fafafa",100:"#f5f5f5",200:"#e5e5e5",300:"#d4d4d4",400:"#a3a3a3",500:"#737373",600:"#525252",700:"#404040",800:"#262626",900:"#171717",950:"#0a0a0a"},
  stone:  {50:"#fafaf9",100:"#f5f5f4",200:"#e7e5e4",300:"#d6d3d1",400:"#a8a29e",500:"#78716c",600:"#57534e",700:"#44403c",800:"#292524",900:"#1c1917",950:"#0c0a09"},
  red:    {50:"#fef2f2",100:"#fee2e2",200:"#fecaca",300:"#fca5a5",400:"#f87171",500:"#ef4444",600:"#dc2626",700:"#b91c1c",800:"#991b1b",900:"#7f1d1d",950:"#450a0a"},
  orange: {50:"#fff7ed",100:"#ffedd5",200:"#fed7aa",300:"#fdba74",400:"#fb923c",500:"#f97316",600:"#ea580c",700:"#c2410c",800:"#9a3412",900:"#7c2d12",950:"#431407"},
  amber:  {50:"#fffbeb",100:"#fef3c7",200:"#fde68a",300:"#fcd34d",400:"#fbbf24",500:"#f59e0b",600:"#d97706",700:"#b45309",800:"#92400e",900:"#78350f",950:"#451a03"},
  yellow: {50:"#fefce8",100:"#fef9c3",200:"#fef08a",300:"#fde047",400:"#facc15",500:"#eab308",600:"#ca8a04",700:"#a16207",800:"#854d0e",900:"#713f12",950:"#422006"},
  lime:   {50:"#f7fee7",100:"#ecfccb",200:"#d9f99d",300:"#bef264",400:"#a3e635",500:"#84cc16",600:"#65a30d",700:"#4d7c0f",800:"#3f6212",900:"#365314",950:"#1a2e05"},
  green:  {50:"#f0fdf4",100:"#dcfce7",200:"#bbf7d0",300:"#86efac",400:"#4ade80",500:"#22c55e",600:"#16a34a",700:"#15803d",800:"#166534",900:"#14532d",950:"#052e16"},
  emerald:{50:"#ecfdf5",100:"#d1fae5",200:"#a7f3d0",300:"#6ee7b7",400:"#34d399",500:"#10b981",600:"#059669",700:"#047857",800:"#065f46",900:"#064e3b",950:"#022c22"},
  teal:   {50:"#f0fdfa",100:"#ccfbf1",200:"#99f6e4",300:"#5eead4",400:"#2dd4bf",500:"#14b8a6",600:"#0d9488",700:"#0f766e",800:"#115e59",900:"#134e4a",950:"#042f2e"},
  cyan:   {50:"#ecfeff",100:"#cffafe",200:"#a5f3fc",300:"#67e8f9",400:"#22d3ee",500:"#06b6d4",600:"#0891b2",700:"#0e7490",800:"#155e75",900:"#164e63",950:"#083344"},
  sky:    {50:"#f0f9ff",100:"#e0f2fe",200:"#bae6fd",300:"#7dd3fc",400:"#38bdf8",500:"#0ea5e9",600:"#0284c7",700:"#0369a1",800:"#075985",900:"#0c4a6e",950:"#082f49"},
  blue:   {50:"#eff6ff",100:"#dbeafe",200:"#bfdbfe",300:"#93c5fd",400:"#60a5fa",500:"#3b82f6",600:"#2563eb",700:"#1d4ed8",800:"#1e40af",900:"#1e3a8a",950:"#172554"},
  indigo: {50:"#eef2ff",100:"#e0e7ff",200:"#c7d2fe",300:"#a5b4fc",400:"#818cf8",500:"#6366f1",600:"#4f46e5",700:"#4338ca",800:"#3730a3",900:"#312e81",950:"#1e1b4b"},
  violet: {50:"#f5f3ff",100:"#ede9fe",200:"#ddd6fe",300:"#c4b5fd",400:"#a78bfa",500:"#8b5cf6",600:"#7c3aed",700:"#6d28d9",800:"#5b21b6",900:"#4c1d95",950:"#2e1065"},
  purple: {50:"#faf5ff",100:"#f3e8ff",200:"#e9d5ff",300:"#d8b4fe",400:"#c084fc",500:"#a855f7",600:"#9333ea",700:"#7e22ce",800:"#6b21a8",900:"#581c87",950:"#3b0764"},
  fuchsia:{50:"#fdf4ff",100:"#fae8ff",200:"#f5d0fe",300:"#f0abfc",400:"#e879f9",500:"#d946ef",600:"#c026d3",700:"#a21caf",800:"#86198f",900:"#701a75",950:"#4a044e"},
  pink:   {50:"#fdf2f8",100:"#fce7f3",200:"#fbcfe8",300:"#f9a8d4",400:"#f472b6",500:"#ec4899",600:"#db2777",700:"#be185d",800:"#9d174d",900:"#831843",950:"#500724"},
  rose:   {50:"#fff1f2",100:"#ffe4e6",200:"#fecdd3",300:"#fda4af",400:"#fb7185",500:"#f43f5e",600:"#e11d48",700:"#be123c",800:"#9f1239",900:"#881337",950:"#4c0519"},
  white:  {DEFAULT:"#ffffff"},
  black:  {DEFAULT:"#000000"},
};

const NEUTRAL_HUES = ["slate", "gray", "zinc", "neutral", "stone", "white", "black"];
const ACCENT_HUES = ["indigo", "violet"];

/* ------------------------------------------------------------------ */
/* Colour helpers                                                      */
/* ------------------------------------------------------------------ */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = ((b - r) / d + 2);
  else h = ((r - g) / d + 4);
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => Math.round((v + m) * 255));
}

/** mix rgb `a` toward rgb `b` by k (0 → a, 1 → b) */
function mixc(a, b, k) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * k));
}

/** Normalise a ramp entry ([r,g,b] | [r,g,b,a] | "#hex") to [r,g,b,a] */
function norm(v) {
  if (typeof v === "string") return [...hexToRgb(v), 1];
  if (v.length === 3) return [...v, 1];
  return v;
}

const WHITE = [255, 255, 255, 1];

/* ------------------------------------------------------------------ */
/* Semantic transforms (amber/emerald/rose/… — the feature-card hues)  */
/* ------------------------------------------------------------------ */

/**
 * Light-theme semantic mapping (Apple). The app's semantic colours were
 * picked for dark surfaces: light text shades (200–400) and deep washes
 * (950). On white surfaces we:
 *   - lighten solid fills into iOS-style tints (dark ink text stays readable)
 *   - turn the 950 washes into pale tints
 *   - darken text shades for contrast
 */
function lightSemanticFactory(opts) {
  const { washK = 0.6, tintK = 0.55, pastelBg = 0, pastelText = 0, pastelBorder = 0, textMix = [107, 90, 142] } = opts;
  return (rgb, role, hue, shade) => {
    const pal = P[hue];
    const S = (s) => hexToRgb(pal[s] || pal[500]);
    let out;
    if (role === "bg") {
      if (shade >= 950) out = mixc(S(200), [255, 255, 255], washK);
      else if (shade >= 900) out = mixc(S(200), [255, 255, 255], washK - 0.18);
      else if (shade >= 800) out = mixc(S(300), [255, 255, 255], tintK - 0.05);
      else if (shade >= 400) out = mixc(S(shade), [255, 255, 255], tintK);
      else out = rgb;
      if (pastelBg) out = mixc(out, [255, 255, 255], pastelBg);
    } else if (role === "text") {
      if (shade <= 200) out = S(700);
      else if (shade === 300) out = S(600);
      else if (shade === 400) out = mixc(S(600), S(500), 0.25);
      else out = rgb;
      if (pastelText) out = mixc(out, textMix, pastelText);
    } else {
      out = rgb;
      if (pastelBorder) out = mixc(out, textMix, pastelBorder);
    }
    return out;
  };
}

/** Dark-theme HSL tweak: scale saturation (Fluent tones down, Neon cranks up) */
function darkSemanticFactory(sMul, lAdd = 0) {
  return (rgb) => {
    const [h, s, l] = rgbToHsl(rgb);
    return hslToRgb([h, clamp(s * sMul, 0, 1), clamp(l * (1 + lAdd), 0, 1)]);
  };
}

/* ------------------------------------------------------------------ */
/* Theme definitions — neutral & accent ramps per property role        */
/* Values: [r,g,b] | [r,g,b,a] | "#hex"                                */
/* Roles: bg (bg/from/via/to/fill/stroke/shadow/accent/caret),         */
/*        border (border/divide/ring/outline), text (text/placeholder) */
/* ------------------------------------------------------------------ */
const THEME_SPECS = {
  apple: {
    semantic: lightSemanticFactory({ washK: 0.62, tintK: 0.55 }),
    neutral: {
      bg: {
        black: "#ffffff", 950: "#f5f5f7", 900: "#ffffff", 800: "#ffffff", 750: "#f5f5f7",
        700: "#e8e8ed", 600: "#d2d2d7", 500: "#aeaeb2", white: "#ffffff",
      },
      border: {
        900: "#e8e8ed", 800: "#e3e3e8", 700: "#d2d2d7", 600: "#c7c7cc",
        500: "#aeaeb2", white: "#d2d2d7", black: "#d2d2d7",
      },
      text: {
        white: "#1d1d1f", 200: "#3a3a3c", 300: "#424245", 400: "#6e6e73",
        500: "#86868b", 600: "#8e8e93", 700: "#48484a", black: "#1d1d1f",
      },
    },
    accent: {
      bg: { 950: "#e3f0ff", 900: "#c5ddff", 800: "#9cc7ff", 700: "#0066d6", 600: "#007aff", 500: "#0a84ff", 400: "#4da3ff" },
      border: { 800: "#005ec4", 700: "#007aff", 600: "#007aff", 500: "#0a84ff", 400: "#8ec2ff" },
      text: { 200: "#005ec4", 300: "#007aff", 400: "#0a84ff", 500: "#007aff" },
    },
  },

  windows: {
    semantic: darkSemanticFactory(0.88),
    neutral: {
      bg: {
        black: [10, 16, 24], 950: [17, 23, 34, 0.82], 900: [24, 32, 45, 0.86], 800: [32, 43, 60, 0.78],
        750: [38, 50, 70, 0.78], 700: [45, 58, 79, 0.85], 600: [57, 71, 95], 500: [82, 97, 122],
        white: "#eef3fa",
      },
      border: {
        900: [50, 63, 84, 0.6], 800: [58, 72, 96, 0.65], 700: [79, 96, 124, 0.55],
        600: [96, 114, 143, 0.6], 500: [126, 143, 170], white: [203, 213, 225, 0.35], black: [0, 0, 0, 0.5],
      },
      text: {
        white: "#f2f6fc", 200: "#d9e1ee", 300: "#bfcadd", 400: "#96a3ba",
        500: "#7b89a2", 600: "#5c6880", 700: "#48546c", black: "#0b0f16",
      },
    },
    accent: {
      bg: { 950: [76, 194, 255, 0.14], 900: [76, 194, 255, 0.22], 800: "#255c9e", 700: "#2d7fd9", 600: "#1f6fd6", 500: "#3b83ec", 400: "#6aa8f2" },
      border: { 800: "#255c9e", 700: "#2d7fd9", 600: "#3b96e8", 500: "#4cc2ff", 400: "#6fd3ff" },
      text: { 200: "#c4e7ff", 300: "#96d9ff", 400: "#60cdff", 500: "#4cc2ff" },
    },
  },

  playful: {
    semantic: darkSemanticFactory(1.32, 0.02),
    neutral: {
      bg: {
        black: [13, 10, 22], 950: [22, 17, 36], 900: [30, 23, 49], 800: [39, 30, 63],
        750: [46, 36, 74], 700: [56, 44, 88], 600: [72, 58, 110], 500: [98, 82, 142],
        white: "#ffffff",
      },
      border: {
        900: [63, 51, 97], 800: [64, 51, 99], 700: [96, 78, 142], 600: [119, 99, 168],
        500: [147, 127, 196], white: "#ffffff", black: [10, 7, 18],
      },
      text: {
        white: "#ffffff", 200: "#f3edff", 300: "#ddd2f7", 400: "#c0b1e6",
        500: "#9d8ec7", 600: "#7e6ea6", 700: "#5f5188", black: "#0d0a16",
      },
    },
    accent: {
      bg: { 950: [244, 63, 142, 0.16], 900: [244, 63, 142, 0.26], 800: "#b02a68", 700: "#d12d75", 600: "#f43f8e", 500: "#ff5ea8", 400: "#ff86bc" },
      border: { 800: "#c73a82", 700: "#e0499b", 600: "#ff5ea8", 500: "#ff6fb1", 400: "#ff9fc9" },
      text: { 200: "#ffd3e6", 300: "#ffadd2", 400: "#ff8cc0", 500: "#ff6fb1" },
    },
  },

  glass: {
    semantic: lightSemanticFactory({ washK: 0.66, tintK: 0.58, pastelBg: 0.22, pastelText: 0.16, pastelBorder: 0.22 }),
    neutral: {
      bg: {
        black: [255, 255, 255], 950: [250, 247, 255, 0.85], 900: [255, 255, 255, 0.62], 800: [255, 255, 255, 0.55],
        750: [255, 255, 255, 0.65], 700: [255, 255, 255, 0.78], 600: [238, 231, 250, 0.9], 500: [164, 148, 194],
        white: [255, 255, 255, 0.92],
      },
      border: {
        900: [255, 255, 255, 0.55], 800: [186, 168, 214, 0.4], 700: [158, 138, 194, 0.45],
        600: [143, 123, 183, 0.5], 500: [128, 108, 170], white: [255, 255, 255, 0.8], black: [122, 101, 160, 0.35],
      },
      text: {
        white: [61, 51, 82], 200: [74, 63, 99], 300: [88, 76, 115], 400: [113, 99, 143],
        500: [136, 122, 165], 600: [164, 148, 194], 700: [95, 82, 122], black: [61, 51, 82],
      },
    },
    accent: {
      bg: { 950: [183, 158, 230, 0.2], 900: [183, 158, 230, 0.3], 800: "#9376cf", 700: "#a88ce2", 600: "#b9a3ea", 500: "#c9b8f0", 400: "#d9ccf7" },
      border: { 800: "#9376d4", 700: "#a488dd", 600: "#b79ee6", 500: "#b79ee6", 400: "#cbbcf2" },
      text: { 200: "#6f53b8", 300: "#7a5fc0", 400: "#856ccb", 500: "#a488dd" },
    },
  },
};

/* ------------------------------------------------------------------ */
/* Token scanning                                                      */
/* ------------------------------------------------------------------ */
const HUE_ALT = Object.keys(P).join("|");
const TOKEN_RE = new RegExp(
  String.raw`(?<![\w-])((?:(?:hover|focus|active|disabled|focus-visible|focus-within|group-hover|peer-checked|peer-focus|sm|md|lg|xl|2xl|xs):)+)?` +
  String.raw`(bg|text|border|placeholder|ring|divide|from|via|to|fill|stroke|accent|caret|shadow|outline)-(${HUE_ALT})(?:-(50|100|200|300|400|500|600|700|800|900|950))?(?:\/(\d{1,3}))?(?![\w/-])`,
  "g"
);

const escToken = (t) => t.replace(/:/g, "\\:").replace(/\//g, "\\/");

function collectFiles(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collectFiles(full, exts, out);
    else if (exts.includes(extname(name))) out.push(full);
  }
  return out;
}

function scanTokens() {
  const files = [...collectFiles(join(root, "src"), [".ts", ".tsx", ".js", ".jsx"]), join(root, "index.html")];
  const tokens = new Set();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(TOKEN_RE)) {
      tokens.add(m[0]);
    }
  }
  return [...tokens].sort();
}

/** Parse a token into { states: [...], role, hue, shade, alpha } */
function parseToken(token) {
  const parts = token.split(":");
  const base = parts.pop();
  const states = parts;
  const m = base.match(
    /^(bg|text|border|placeholder|ring|divide|from|via|to|fill|stroke|accent|caret|shadow|outline)-([a-z]+)(?:-(\d{2,3}))?(?:\/(\d{1,3}))?$/
  );
  if (!m) return null;
  const [, prefix, hue, shadeStr, alphaStr] = m;
  const shade = hue === "white" || hue === "black" ? hue : Number(shadeStr || 500);
  const alpha = alphaStr ? clamp(Number(alphaStr), 0, 100) / 100 : 1;
  let role;
  if (["border", "divide", "ring", "outline"].includes(prefix)) role = "border";
  else if (["text", "placeholder"].includes(prefix)) role = "text";
  else role = "bg";
  return { token, states, prefix, role, hue, shade, alpha };
}

/* ------------------------------------------------------------------ */
/* Colour resolution                                                   */
/* ------------------------------------------------------------------ */
function lookupRamp(ramp, shade) {
  const key = typeof shade === "string" ? shade : String(shade);
  if (ramp[key] !== undefined) return norm(ramp[key]);
  // nearest numeric shade defined in the ramp
  const numericKeys = Object.keys(ramp).filter((k) => /^\d+$/.test(k)).map(Number);
  if (typeof shade === "number" && numericKeys.length) {
    const nearest = numericKeys.reduce((a, b) => (Math.abs(b - shade) < Math.abs(a - shade) ? b : a));
    return norm(ramp[String(nearest)]);
  }
  if (ramp[typeof shade === "string" ? shade : "500"] !== undefined) return norm(ramp[typeof shade === "string" ? shade : "500"]);
  return null;
}

function resolveColor(spec, parsed) {
  const { role, hue, shade, alpha } = parsed;
  let rgba = null;

  if (NEUTRAL_HUES.includes(hue)) {
    rgba = lookupRamp(spec.neutral[role], shade);
  } else if (ACCENT_HUES.includes(hue)) {
    rgba = lookupRamp(spec.accent[role], shade);
  } else {
    const pal = P[hue];
    const raw = hexToRgb(pal[typeof shade === "number" ? shade : 500] || pal[500]);
    const rgb = spec.semantic(raw, role, hue, typeof shade === "number" ? shade : 500);
    rgba = [...rgb, 1];
  }
  if (!rgba) return null;
  const a = clamp(rgba[3] * alpha, 0, 1);
  return { rgb: [rgba[0], rgba[1], rgba[2]], a };
}

function cssColor({ rgb, a }) {
  const [r, g, b] = rgb;
  return `rgb(${r} ${g} ${b} / ${Math.round(a * 1000) / 1000})`;
}

/* ------------------------------------------------------------------ */
/* Rule emission                                                       */
/* ------------------------------------------------------------------ */
const PSEUDO = {
  hover: ":hover", focus: ":focus", active: ":active", disabled: ":disabled",
  "focus-visible": ":focus-visible", "focus-within": ":focus-within",
};
const MEDIA = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536, xs: 420 };

function declarationFor(prefix, color) {
  const colorStr = cssColor(color);
  const transparentSameHue = `rgb(${color.rgb[0]} ${color.rgb[1]} ${color.rgb[2]} / 0)`;
  switch (prefix) {
    case "bg": return [`background-color: ${colorStr}`];
    case "text": return [`color: ${colorStr}`];
    case "placeholder": return [`color: ${colorStr}`]; // applied via ::placeholder
    case "border": return [`border-color: ${colorStr}`];
    case "divide": return [`border-color: ${colorStr}`];
    case "outline": return [`outline-color: ${colorStr}`];
    case "ring": return [`--tw-ring-color: ${colorStr}`];
    case "fill": return [`fill: ${colorStr}`];
    case "stroke": return [`stroke: ${colorStr}`];
    case "accent": return [`accent-color: ${colorStr}`];
    case "caret": return [`caret-color: ${colorStr}`];
    case "shadow": return [`--tw-shadow-color: ${colorStr}`];
    // Gradient stops replicate Tailwind v3's own variable mechanism so that
    // from-/via-/to- utilities composed on one element keep working.
    case "from":
      return [
        `--tw-gradient-from: ${colorStr} var(--tw-gradient-from-position)`,
        `--tw-gradient-to: ${transparentSameHue} var(--tw-gradient-to-position)`,
        `--tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to)`,
      ];
    case "via":
      return [
        `--tw-gradient-to: ${transparentSameHue} var(--tw-gradient-to-position)`,
        `--tw-gradient-stops: var(--tw-gradient-from), ${colorStr} var(--tw-gradient-via-position), var(--tw-gradient-to)`,
      ];
    case "to":
      return [`--tw-gradient-to: ${colorStr} var(--tw-gradient-to-position)`];
    default: return [];
  }
}

function selectorFor(themeId, parsed) {
  const { token, states, prefix } = parsed;
  const target = `.${escToken(token)}`;
  // segment prefix tokens that restyle via pseudo-element
  const suffix = prefix === "placeholder" ? "::placeholder" : "";
  const pseudoChain = states.filter((s) => PSEUDO[s]).map((s) => PSEUDO[s]).join("");
  let sel;
  if (states.includes("group-hover")) {
    const rest = states.filter((s) => s !== "group-hover" && PSEUDO[s]).map((s) => PSEUDO[s]).join("");
    sel = `html[data-theme="${themeId}"] .group:hover ${target}${rest}${suffix}`;
  } else if (states.some((s) => s.startsWith("peer-"))) {
    const peer = states.find((s) => s.startsWith("peer-"));
    const peerPseudo = peer === "peer-checked" ? ":checked" : ":focus";
    const rest = states.filter((s) => s !== peer).map((s) => PSEUDO[s] || "").join("");
    sel = `html[data-theme="${themeId}"] .peer${peerPseudo} ~ ${target}${rest}${suffix}`;
  } else {
    sel = `html[data-theme="${themeId}"] ${target}${pseudoChain}${suffix}`;
  }
  const media = states.find((s) => MEDIA[s]);
  return { sel, media: media ? MEDIA[media] : null };
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */
function main() {
  const tokens = scanTokens();
  const parsed = tokens.map(parseToken).filter(Boolean);

  const out = [];
  out.push(`/* ------------------------------------------------------------------`);
  out.push(`   GENERATED FILE — do not edit by hand.`);
  out.push(`   Rebuild with: node scripts/generate-theme-css.mjs  (npm run theme:css)`);
  out.push(`   Colour matrix for the four non-classic themes. ${parsed.length} utility`);
  out.push(`   tokens were discovered in src/ + index.html and remapped per theme.`);
  out.push(`------------------------------------------------------------------ */\n`);

  let ruleCount = 0;
  for (const [themeId, spec] of Object.entries(THEME_SPECS)) {
    out.push(`/* ==================== theme: ${themeId} ==================== */`);
    for (const p of parsed) {
      const color = resolveColor(spec, p);
      if (!color) continue;
      const decls = declarationFor(p.prefix, color);
      if (!decls.length) continue;
      const { sel, media } = selectorFor(themeId, p);
      const rule = `${sel} {\n  ${decls.join(";\n  ")};\n}`;
      out.push(media ? `@media (min-width: ${media}px) {\n${rule}\n}` : rule);
      ruleCount++;
    }
    out.push("");
  }

  const css = out.join("\n") + "\n";
  writeFileSync(join(root, "src", "themes.generated.css"), css);
  console.log(`themes.generated.css: ${parsed.length} tokens → ${ruleCount} rules (${(css.length / 1024).toFixed(1)} kB)`);
}

main();
