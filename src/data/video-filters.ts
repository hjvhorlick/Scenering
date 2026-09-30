/* =========================================================================
   SCENERING — GLOBAL VIDEO FILTERS
   -------------------------------------------------------------------------
   One filter runs across the WHOLE video (every scene), exactly like the
   background music track. A filter is made of two halves:

     1. `grade`   — a real pixel colour grade (ctx.filter / CSS filter)
     2. `layers`  — animated canvas layers painted over the frame
                    (grain, mist, dust motes, sun flare, scratches, …)

   Every preset exposes a small set of live controls so the look can be
   dialled in per project (strength, grain, glow, mist, motion speed …).
   ========================================================================= */

export type FilterGroupId =
  | "film"
  | "vintage"
  | "warm"
  | "pastel"
  | "nature";

export interface FilterGroupDef {
  id: FilterGroupId;
  name: string;
  icon: string;
  blurb: string;
}

export const FILTER_GROUPS: FilterGroupDef[] = [
  {
    id: "film",
    name: "Cinematic Film",
    icon: "🎬",
    blurb: "Blockbuster grades, noir and high-drama contrast",
  },
  {
    id: "vintage",
    name: "Vintage & VHS",
    icon: "📼",
    blurb: "Old projector film, Super 8, VHS tape and faded 70s prints",
  },
  {
    id: "warm",
    name: "Warm & Gold Glow",
    icon: "🌇",
    blurb: "Golden hour, amber cinema warmth and candle light",
  },
  {
    id: "pastel",
    name: "Pastel & Misty",
    icon: "🌸",
    blurb: "Soft pastel colour with a dreamy misty bloom",
  },
  {
    id: "nature",
    name: "Nature & Outdoors",
    icon: "🌿",
    blurb: "Sun flare, sun spots, god rays, floating dust, pollen and snow",
  },
];

/* ----------------------------- controls ---------------------------------- */

export interface VideoFilterSettings {
  /** master look strength — scales the colour grade and every layer */
  strength: number; // 0.2 – 1.6
  /** film grain / noise texture */
  grain: number; // 0 – 1
  /** edge darkening */
  vignette: number; // 0 – 1
  /** warm (+) / cool (−) colour push */
  warmth: number; // -1 – 1
  /** highlight bloom, flare and light glow */
  glow: number; // 0 – 1
  /** floating elements: dust, bokeh, pollen, snow, rain */
  particles: number; // 0 – 1
  /** haze / fog / mist density */
  mist: number; // 0 – 1
  /** animation speed of every moving layer */
  speed: number; // 0.2 – 2.2
  /** colour intensity multiplier on top of the preset grade */
  saturation: number; // 0 – 2
  /** contrast multiplier on top of the preset grade */
  contrast: number; // 0.5 – 1.8
  /** soft out-of-focus blur (px @ 1280 wide) */
  softness: number; // 0 – 1
  /** widescreen cinema bars top and bottom — 0 = full frame (default) */
  letterbox: number; // 0 – 1
}

export type FilterControlKey = keyof VideoFilterSettings;

export const CONTROL_META: Record<
  FilterControlKey,
  { label: string; icon: string; min: number; max: number; step: number; hint: string; unit?: string }
> = {
  strength: { label: "Look Strength", icon: "🎚️", min: 0.2, max: 1.6, step: 0.05, hint: "How strong the whole filter reads on screen" },
  grain: { label: "Film Grain", icon: "🎞️", min: 0, max: 1, step: 0.05, hint: "Analogue grain and dirt texture" },
  vignette: { label: "Vignette", icon: "🎯", min: 0, max: 1, step: 0.05, hint: "Darkened edges that push the eye to the middle" },
  warmth: { label: "Warm ⇄ Cool", icon: "🌡️", min: -1, max: 1, step: 0.05, hint: "Amber warmth on the right, blue chill on the left" },
  glow: { label: "Light Glow", icon: "✨", min: 0, max: 1, step: 0.05, hint: "Bloom, flares and light leaks" },
  particles: { label: "Floating Motion", icon: "🌾", min: 0, max: 1, step: 0.05, hint: "Dust, bokeh, pollen, snow — gives still photos real movement" },
  mist: { label: "Mist / Haze", icon: "🌫️", min: 0, max: 1, step: 0.05, hint: "Atmospheric fog rolling through the frame" },
  speed: { label: "Motion Speed", icon: "⏩", min: 0.2, max: 2.2, step: 0.05, hint: "How fast the animated layers drift" },
  saturation: { label: "Colour Pop", icon: "🎨", min: 0, max: 2, step: 0.05, hint: "Colour intensity of the grade" },
  contrast: { label: "Contrast", icon: "◐", min: 0.5, max: 1.8, step: 0.05, hint: "Punch between blacks and whites" },
  softness: { label: "Soft Focus", icon: "🫧", min: 0, max: 1, step: 0.05, hint: "Dreamy out-of-focus diffusion" },
  letterbox: { label: "Cinema Bars", icon: "🎬", min: 0, max: 1, step: 0.05, hint: "Black widescreen bars top and bottom — keep at 0 so the video fills the whole frame on social platforms" },
};

export const BASE_SETTINGS: VideoFilterSettings = {
  strength: 1,
  grain: 0,
  vignette: 0.3,
  warmth: 0,
  glow: 0.35,
  particles: 0,
  mist: 0,
  speed: 1,
  saturation: 1,
  contrast: 1,
  softness: 0,
  // Cinema bars are strictly OPT-IN. They used to be painted unconditionally
  // by the anamorphic preset, which read as a rendering bug — black bars top
  // and bottom of every studio preview and export, whatever the aspect.
  letterbox: 0,
};

/* ------------------------------ grade ------------------------------------ */

export interface ColorGrade {
  sepia?: number;       // 0 – 1
  saturate?: number;    // 1 = neutral
  contrast?: number;    // 1 = neutral
  brightness?: number;  // 1 = neutral
  hueRotate?: number;   // degrees
  grayscale?: number;   // 0 – 1
  blur?: number;        // px @ 1280 wide
}

/* ------------------------------ layers ----------------------------------- */

export type LayerSpec =
  /** flat / gradient colour wash */
  | { kind: "wash"; colors: string[]; dir?: "diag" | "vert" | "horiz"; alpha: number; blend?: GlobalCompositeOperation; ctl?: FilterControlKey }
  /** darkened edges */
  | { kind: "vignette"; color?: string; alpha: number; inner?: number }
  /** analogue grain */
  | { kind: "grain"; alpha: number; density?: number; mono?: boolean }
  /** vertical projector scratches */
  | { kind: "scratches"; alpha: number }
  /** dirt specks, hairs and blotches */
  | { kind: "specks"; alpha: number }
  /** projector / bulb flicker */
  | { kind: "flicker"; alpha: number; rate?: number }
  /** CRT scanlines */
  | { kind: "scanlines"; alpha: number; gap?: number }
  /** rolling VHS tracking band */
  | { kind: "tracking"; alpha: number }
  /** RGB chromatic split at the edges */
  | { kind: "chroma"; alpha: number }
  /** soft radial light bloom */
  | { kind: "bloom"; color: string; alpha: number; x?: number; y?: number; radius?: number }
  /** anamorphic sun flare with streaks and ghosts */
  | { kind: "sunflare"; x?: number; y?: number; alpha: number; rays?: number; color?: string }
  /** volumetric god rays through the frame */
  | { kind: "godrays"; alpha: number; angle?: number; count?: number; color?: string }
  /** floating particles */
  | { kind: "particles"; style: "dust" | "bokeh" | "pollen" | "snow" | "ember"; alpha: number; count: number; color: string; size: number; drift?: number }
  /** drifting fog banks */
  | { kind: "fog"; alpha: number; color: string; bands?: number; from?: "bottom" | "all" | "top" }
  /** coloured light leak breathing in from one edge */
  | { kind: "leak"; color: string; alpha: number; side?: "left" | "right" | "top" }
  /** cinema letterbox bars */
  | { kind: "letterbox"; alpha: number; ratio?: number }
  /** halation glow around highlights */
  | { kind: "halation"; alpha: number; color: string }
  /** falling rain streaks */
  | { kind: "rain"; alpha: number; count: number };

export interface VideoFilterPreset {
  id: string;
  name: string;
  group: FilterGroupId;
  icon: string;
  /** one-line sell of the mood */
  tagline: string;
  /** UI accent colour */
  accent: string;
  grade: ColorGrade;
  layers: LayerSpec[];
  /** which sliders are meaningful for this look (shown in the settings panel) */
  controls: FilterControlKey[];
  /** starting values for this look */
  defaults: Partial<VideoFilterSettings>;
}

const S = (o: Partial<VideoFilterSettings>) => o;

export const VIDEO_FILTERS: VideoFilterPreset[] = [
  /* ============================ CINEMATIC FILM ============================ */
  {
    id: "teal_orange",
    name: "Blockbuster Teal & Orange",
    group: "film",
    icon: "\ud83c\udfac",
    tagline: "The Hollywood grade — cold shadows, warm skin, wide-screen punch",
    accent: "#f59e0b",
    grade: { saturate: 1.5, contrast: 1.38, brightness: 0.98, hueRotate: -10 },
    layers: [
      { kind: "wash", colors: ["rgba(0,80,125,0.52)", "rgba(255,125,35,0.42)"], dir: "diag", alpha: 1, blend: "overlay" },
      { kind: "halation", alpha: 0.5, color: "rgba(255,170,90,1)" },
      { kind: "vignette", alpha: 0.68, color: "rgba(2,8,16,1)" },
      { kind: "grain", alpha: 0.4 },
    ],
    controls: ["strength", "contrast", "saturation", "warmth", "vignette", "grain", "glow"],
    defaults: S({ strength: 1.2, vignette: 0.55, grain: 0.35, glow: 0.5, contrast: 1.05 }),
  },
  {
    id: "moody_night",
    name: "Moody Midnight Drama",
    group: "film",
    icon: "\ud83c\udf19",
    tagline: "Deep blue shadows and tense, cinematic darkness",
    accent: "#6366f1",
    grade: { saturate: 0.95, contrast: 1.52, brightness: 0.76, hueRotate: -16 },
    layers: [
      { kind: "wash", colors: ["rgba(6,16,38,0.65)", "rgba(2,6,18,0.78)"], dir: "vert", alpha: 1 },
      { kind: "bloom", color: "rgba(120,160,255,1)", alpha: 0.3, x: 0.5, y: 0.35, radius: 0.7 },
      { kind: "vignette", alpha: 0.85, color: "rgba(0,0,0,1)" },
      { kind: "grain", alpha: 0.45 },
    ],
    controls: ["strength", "contrast", "vignette", "warmth", "grain", "glow", "mist"],
    defaults: S({ strength: 1.2, vignette: 0.75, grain: 0.35, glow: 0.3, warmth: -0.2 }),
  },
  {
    id: "silver_noir",
    name: "Silver Noir B&W",
    group: "film",
    icon: "\ud83d\udda4",
    tagline: "High-contrast silver gelatin monochrome with a hard vignette",
    accent: "#e5e7eb",
    grade: { grayscale: 1, contrast: 1.65, brightness: 0.9 },
    layers: [
      { kind: "wash", colors: ["rgba(255,255,255,0.08)", "rgba(0,0,0,0.38)"], dir: "vert", alpha: 1 },
      { kind: "vignette", alpha: 0.9, color: "rgba(0,0,0,1)" },
      { kind: "grain", alpha: 0.75, mono: true },
      { kind: "scratches", alpha: 0.3 },
    ],
    controls: ["strength", "contrast", "vignette", "grain", "glow"],
    defaults: S({ strength: 1.2, vignette: 0.8, grain: 0.55, glow: 0.2, contrast: 1.1 }),
  },
  {
    id: "bleach_bypass",
    name: "Bleach Bypass Grit",
    group: "film",
    icon: "\u2694\ufe0f",
    tagline: "Washed steel colour, crushed blacks, raw documentary tension",
    accent: "#94a3b8",
    grade: { saturate: 0.32, contrast: 1.62, brightness: 1.05 },
    layers: [
      { kind: "wash", colors: ["rgba(190,205,215,0.26)", "rgba(20,28,34,0.42)"], dir: "diag", alpha: 1 },
      { kind: "vignette", alpha: 0.68, color: "rgba(0,0,0,1)" },
      { kind: "grain", alpha: 0.8 },
    ],
    controls: ["strength", "contrast", "saturation", "grain", "vignette"],
    defaults: S({ strength: 1.2, grain: 0.6, vignette: 0.55, saturation: 0.9, contrast: 1.1 }),
  },
  {
    id: "epic_hdr",
    name: "Epic Drama HDR",
    group: "film",
    icon: "\ud83d\udc8e",
    tagline: "Huge micro-contrast and rich colour for trailer-grade impact",
    accent: "#22d3ee",
    grade: { saturate: 1.65, contrast: 1.5, brightness: 1.05 },
    layers: [
      { kind: "bloom", color: "rgba(255,255,255,1)", alpha: 0.28, x: 0.5, y: 0.45, radius: 0.75 },
      { kind: "wash", colors: ["rgba(0,140,180,0.22)", "rgba(255,120,40,0.22)"], dir: "horiz", alpha: 1, blend: "overlay" },
      { kind: "vignette", alpha: 0.65, color: "rgba(0,0,0,1)" },
      { kind: "grain", alpha: 0.3 },
    ],
    controls: ["strength", "contrast", "saturation", "glow", "vignette", "grain"],
    defaults: S({ strength: 1.2, glow: 0.5, vignette: 0.5, grain: 0.25 }),
  },
  {
    id: "anamorphic",
    name: "Anamorphic Widescreen",
    group: "film",
    icon: "\ud83c\udfa5",
    tagline: "Blue horizontal lens streak across the frame, with optional cinema bars",
    accent: "#38bdf8",
    grade: { saturate: 1.32, contrast: 1.34, brightness: 0.98, hueRotate: -8 },
    layers: [
      { kind: "wash", colors: ["rgba(0,60,120,0.34)", "rgba(240,130,50,0.26)"], dir: "diag", alpha: 1, blend: "overlay" },
      { kind: "sunflare", x: 0.28, y: 0.3, alpha: 0.75, rays: 0, color: "rgba(120,190,255,1)" },
      // The bars only appear when the Cinema Bars slider is raised — they
      // are never forced, because social formats need the full frame.
      { kind: "letterbox", alpha: 1, ratio: 0.1 },
      { kind: "vignette", alpha: 0.55 },
      { kind: "grain", alpha: 0.35 },
    ],
    controls: ["strength", "glow", "contrast", "saturation", "vignette", "grain", "letterbox", "speed"],
    defaults: S({ strength: 1.2, glow: 0.6, vignette: 0.45, grain: 0.3, letterbox: 0 }),
  },

  /* ============================== VINTAGE ================================= */
  {
    id: "old_movie_1930",
    name: "Old Movie 1930s",
    group: "vintage",
    icon: "\ud83c\udf9e\ufe0f",
    tagline: "Projector flicker, scratches, dust specks and a sepia wash",
    accent: "#d6a75f",
    grade: { sepia: 0.9, contrast: 1.4, brightness: 0.92, saturate: 0.7 },
    layers: [
      { kind: "wash", colors: ["rgba(190,140,70,0.4)", "rgba(120,80,35,0.4)"], dir: "vert", alpha: 1 },
      { kind: "specks", alpha: 1.0 },
      { kind: "scratches", alpha: 0.9 },
      { kind: "flicker", alpha: 0.75, rate: 34 },
      { kind: "vignette", alpha: 0.9, color: "rgba(22,12,4,1)" },
      { kind: "grain", alpha: 0.95, mono: true },
    ],
    controls: ["strength", "grain", "vignette", "warmth", "speed", "contrast"],
    defaults: S({ strength: 1.2, grain: 0.85, vignette: 0.8, warmth: 0.3, speed: 1 }),
  },
  {
    id: "super8",
    name: "Super 8 Home Movie",
    group: "vintage",
    icon: "\ud83d\udcfd\ufe0f",
    tagline: "Warm faded 8mm with soft edges and a breathing light leak",
    accent: "#fb923c",
    grade: { sepia: 0.55, saturate: 1.25, contrast: 1.16, brightness: 1.04, blur: 0.5 },
    layers: [
      { kind: "wash", colors: ["rgba(255,170,90,0.36)", "rgba(180,90,30,0.3)"], dir: "diag", alpha: 1 },
      { kind: "leak", color: "rgba(255,140,60,1)", alpha: 0.9, side: "right" },
      { kind: "flicker", alpha: 0.45, rate: 22 },
      { kind: "vignette", alpha: 0.78, color: "rgba(40,20,5,1)" },
      { kind: "grain", alpha: 0.8 },
    ],
    controls: ["strength", "grain", "glow", "warmth", "vignette", "softness", "speed"],
    defaults: S({ strength: 1.2, grain: 0.65, glow: 0.6, warmth: 0.4, vignette: 0.65, softness: 0.18 }),
  },
  {
    id: "vhs_1994",
    name: "VHS Tape 1994",
    group: "vintage",
    icon: "\ud83d\udcfc",
    tagline: "CRT scanlines, rolling tracking band and RGB tape bleed",
    accent: "#a855f7",
    grade: { saturate: 1.65, contrast: 1.42, brightness: 0.96 },
    layers: [
      { kind: "chroma", alpha: 1.0 },
      { kind: "scanlines", alpha: 0.9 },
      { kind: "tracking", alpha: 1.0 },
      { kind: "wash", colors: ["rgba(90,0,140,0.2)", "rgba(0,120,160,0.2)"], dir: "vert", alpha: 1 },
      { kind: "vignette", alpha: 0.62 },
      { kind: "grain", alpha: 0.7 },
    ],
    controls: ["strength", "grain", "saturation", "contrast", "speed", "vignette"],
    defaults: S({ strength: 1.2, grain: 0.55, speed: 1, vignette: 0.5 }),
  },
  {
    id: "retro_70s",
    name: "Faded Retro 70s",
    group: "vintage",
    icon: "\ud83d\udcf8",
    tagline: "Milky lifted blacks, creamy highlights and warm nostalgia",
    accent: "#eab308",
    grade: { sepia: 0.6, saturate: 0.95, contrast: 1.08, brightness: 1.06 },
    layers: [
      { kind: "wash", colors: ["rgba(255,205,140,0.38)", "rgba(150,110,60,0.3)"], dir: "diag", alpha: 1 },
      { kind: "wash", colors: ["rgba(235,225,205,0.3)", "rgba(235,225,205,0.06)"], dir: "vert", alpha: 1, blend: "lighter" },
      { kind: "vignette", alpha: 0.55, color: "rgba(70,45,20,1)" },
      { kind: "grain", alpha: 0.65 },
    ],
    controls: ["strength", "grain", "warmth", "saturation", "vignette", "softness"],
    defaults: S({ strength: 1.2, grain: 0.5, warmth: 0.35, saturation: 0.95, vignette: 0.45 }),
  },
  {
    id: "polaroid",
    name: "Polaroid Instant",
    group: "vintage",
    icon: "\ud83d\uddbc\ufe0f",
    tagline: "Cyan-shifted shadows and chalky instant-print softness",
    accent: "#2dd4bf",
    grade: { sepia: 0.3, saturate: 0.9, contrast: 0.92, brightness: 1.12, hueRotate: 14, blur: 0.4 },
    layers: [
      { kind: "wash", colors: ["rgba(120,220,220,0.42)", "rgba(255,225,190,0.46)"], dir: "diag", alpha: 1 },
      { kind: "bloom", color: "rgba(255,255,245,1)", alpha: 0.36, x: 0.5, y: 0.5, radius: 0.85 },
      { kind: "vignette", alpha: 0.56, color: "rgba(30,40,45,1)" },
      { kind: "grain", alpha: 0.5 },
    ],
    controls: ["strength", "grain", "glow", "softness", "saturation", "vignette"],
    defaults: S({ strength: 1.2, grain: 0.4, glow: 0.45, softness: 0.3, vignette: 0.35 }),
  },

  /* ============================ WARM & GOLD =============================== */
  {
    id: "golden_hour",
    name: "Golden Hour Glow",
    group: "warm",
    icon: "\ud83c\udf07",
    tagline: "That last hour of sunlight — amber air and a low glowing sun",
    accent: "#f59e0b",
    grade: { sepia: 0.36, saturate: 1.5, contrast: 1.18, brightness: 1.06 },
    layers: [
      { kind: "wash", colors: ["rgba(255,185,60,0.46)", "rgba(210,90,25,0.36)"], dir: "vert", alpha: 1 },
      { kind: "bloom", color: "rgba(255,225,150,1)", alpha: 0.6, x: 0.82, y: 0.2, radius: 0.72 },
      { kind: "halation", alpha: 0.5, color: "rgba(255,190,110,1)" },
      { kind: "particles", style: "dust", alpha: 0.65, count: 30, color: "255,235,190", size: 1, drift: 0.6 },
      { kind: "vignette", alpha: 0.56, color: "rgba(60,30,5,1)" },
      { kind: "grain", alpha: 0.35 },
    ],
    controls: ["strength", "glow", "warmth", "particles", "vignette", "grain", "speed", "saturation"],
    defaults: S({ strength: 1.2, glow: 0.65, warmth: 0.45, particles: 0.5, vignette: 0.45, grain: 0.3 }),
  },
  {
    id: "warm_amber",
    name: "Warm Amber Cinema",
    group: "warm",
    icon: "\ud83c\udf1e",
    tagline: "Rich honey midtones and creamy highlights — instantly inviting",
    accent: "#fbbf24",
    grade: { sepia: 0.3, saturate: 1.45, contrast: 1.26, brightness: 1.03 },
    layers: [
      { kind: "wash", colors: ["rgba(255,165,55,0.42)", "rgba(235,120,30,0.32)"], dir: "diag", alpha: 1 },
      { kind: "bloom", color: "rgba(255,225,170,1)", alpha: 0.45, x: 0.5, y: 0.42, radius: 0.72 },
      { kind: "halation", alpha: 0.5, color: "rgba(255,190,120,1)" },
      { kind: "vignette", alpha: 0.58, color: "rgba(45,22,5,1)" },
      { kind: "grain", alpha: 0.35 },
    ],
    controls: ["strength", "warmth", "glow", "contrast", "saturation", "vignette", "grain"],
    defaults: S({ strength: 1.2, warmth: 0.4, glow: 0.5, vignette: 0.45, grain: 0.25 }),
  },
  {
    id: "candle_glow",
    name: "Candlelight Glow",
    group: "warm",
    icon: "\ud83d\udcc6",
    tagline: "Intimate flickering firelight with soft embers in the air",
    accent: "#f97316",
    grade: { sepia: 0.4, saturate: 1.3, contrast: 1.3, brightness: 0.9 },
    layers: [
      { kind: "wash", colors: ["rgba(255,140,30,0.4)", "rgba(80,25,0,0.5)"], dir: "vert", alpha: 1 },
      { kind: "bloom", color: "rgba(255,190,90,1)", alpha: 0.6, x: 0.5, y: 0.6, radius: 0.55 },
      { kind: "flicker", alpha: 0.6, rate: 7 },
      { kind: "particles", style: "ember", alpha: 0.7, count: 20, color: "255,170,70", size: 1.1, drift: -0.8 },
      { kind: "vignette", alpha: 0.9, color: "rgba(25,8,0,1)" },
      { kind: "grain", alpha: 0.4 },
    ],
    controls: ["strength", "glow", "warmth", "particles", "vignette", "speed", "grain"],
    defaults: S({ strength: 1.2, glow: 0.65, warmth: 0.5, particles: 0.55, vignette: 0.75 }),
  },
  {
    id: "sunset_dusk",
    name: "Sunset Purple & Gold",
    group: "warm",
    icon: "\ud83c\udf06",
    tagline: "Violet dusk sky melting into a fiery gold horizon",
    accent: "#e879f9",
    grade: { saturate: 1.6, contrast: 1.28, brightness: 0.98, hueRotate: -16 },
    layers: [
      { kind: "wash", colors: ["rgba(130,35,150,0.46)", "rgba(255,95,80,0.4)", "rgba(255,180,45,0.38)"], dir: "vert", alpha: 1 },
      { kind: "bloom", color: "rgba(255,200,130,1)", alpha: 0.5, x: 0.5, y: 0.78, radius: 0.7 },
      { kind: "vignette", alpha: 0.58, color: "rgba(30,5,40,1)" },
      { kind: "grain", alpha: 0.35 },
    ],
    controls: ["strength", "saturation", "glow", "warmth", "vignette", "grain"],
    defaults: S({ strength: 1.2, glow: 0.5, saturation: 1.08, vignette: 0.45, grain: 0.22 }),
  },

  /* =========================== PASTEL & MISTY ============================= */
  {
    id: "pastel_dream",
    name: "Pastel Dream Mist",
    group: "pastel",
    icon: "\ud83c\udf38",
    tagline: "Soft lilac and peach pastels floating in a gentle mist",
    accent: "#f9a8d4",
    grade: { saturate: 1.2, contrast: 0.9, brightness: 1.15, hueRotate: -10, blur: 0.6 },
    layers: [
      { kind: "wash", colors: ["rgba(250,190,235,0.5)", "rgba(190,205,255,0.42)", "rgba(180,240,250,0.44)"], dir: "diag", alpha: 1 },
      { kind: "fog", alpha: 0.75, color: "255,235,250", bands: 3, from: "all" },
      { kind: "bloom", color: "rgba(255,240,255,1)", alpha: 0.5, x: 0.5, y: 0.4, radius: 0.9 },
      { kind: "particles", style: "bokeh", alpha: 0.5, count: 14, color: "255,225,250", size: 1.5, drift: 0.4 },
      { kind: "vignette", alpha: 0.28, color: "rgba(120,90,140,1)" },
      { kind: "grain", alpha: 0.25 },
    ],
    controls: ["strength", "mist", "glow", "softness", "particles", "saturation", "speed", "vignette"],
    defaults: S({ strength: 1.2, mist: 0.7, glow: 0.55, softness: 0.4, particles: 0.45, saturation: 0.95, vignette: 0.25 }),
  },
  {
    id: "rose_mist",
    name: "Rose Blush Mist",
    group: "pastel",
    icon: "\ud83c\udf39",
    tagline: "Warm blush pinks with a romantic soft-focus haze",
    accent: "#fb7185",
    grade: { saturate: 1.18, contrast: 0.94, brightness: 1.1, hueRotate: -16, blur: 0.5 },
    layers: [
      { kind: "wash", colors: ["rgba(255,170,190,0.5)", "rgba(255,215,200,0.4)"], dir: "diag", alpha: 1 },
      { kind: "fog", alpha: 0.68, color: "255,225,230", bands: 2, from: "bottom" },
      { kind: "bloom", color: "rgba(255,225,230,1)", alpha: 0.52, x: 0.42, y: 0.45, radius: 0.85 },
      { kind: "vignette", alpha: 0.34, color: "rgba(140,70,90,1)" },
      { kind: "grain", alpha: 0.26 },
    ],
    controls: ["strength", "mist", "glow", "softness", "warmth", "saturation", "vignette"],
    defaults: S({ strength: 1.2, mist: 0.6, glow: 0.5, softness: 0.35, warmth: 0.25, vignette: 0.3 }),
  },
  {
    id: "mint_haze",
    name: "Mint & Sky Haze",
    group: "pastel",
    icon: "\ud83e\ude75",
    tagline: "Cool mint-cyan pastels with clean airy diffusion",
    accent: "#5eead4",
    grade: { saturate: 1.12, contrast: 0.92, brightness: 1.13, hueRotate: 16, blur: 0.5 },
    layers: [
      { kind: "wash", colors: ["rgba(170,240,230,0.46)", "rgba(190,215,255,0.44)"], dir: "diag", alpha: 1 },
      { kind: "fog", alpha: 0.72, color: "230,250,255", bands: 3, from: "all" },
      { kind: "bloom", color: "rgba(235,255,255,1)", alpha: 0.46, x: 0.55, y: 0.38, radius: 0.9 },
      { kind: "particles", style: "bokeh", alpha: 0.42, count: 12, color: "225,255,250", size: 1.4, drift: 0.35 },
      { kind: "vignette", alpha: 0.26, color: "rgba(70,110,120,1)" },
      { kind: "grain", alpha: 0.24 },
    ],
    controls: ["strength", "mist", "glow", "softness", "particles", "warmth", "saturation"],
    defaults: S({ strength: 1.2, mist: 0.7, glow: 0.45, softness: 0.35, particles: 0.35, warmth: -0.2 }),
  },
  {
    id: "morning_mist",
    name: "Soft Morning Mist",
    group: "pastel",
    icon: "\ud83c\udf2b\ufe0f",
    tagline: "Silvery dawn fog rolling slowly through the scene",
    accent: "#cbd5e1",
    grade: { saturate: 0.82, contrast: 0.9, brightness: 1.15, blur: 0.55 },
    layers: [
      { kind: "wash", colors: ["rgba(225,238,248,0.42)", "rgba(200,215,230,0.38)"], dir: "vert", alpha: 1 },
      { kind: "fog", alpha: 1.0, color: "245,250,255", bands: 4, from: "bottom" },
      { kind: "godrays", alpha: 0.4, angle: -0.42, count: 5, color: "255,255,245" },
      { kind: "particles", style: "dust", alpha: 0.42, count: 20, color: "255,255,255", size: 0.8, drift: 0.3 },
      { kind: "vignette", alpha: 0.3, color: "rgba(80,95,110,1)" },
      { kind: "grain", alpha: 0.3 },
    ],
    controls: ["strength", "mist", "glow", "softness", "particles", "speed", "contrast"],
    defaults: S({ strength: 1.2, mist: 0.85, glow: 0.4, softness: 0.35, particles: 0.4, speed: 0.8 }),
  },

  /* =========================== NATURE & OUTDOORS ========================== */
  {
    id: "sun_flare",
    name: "Sun Flare & Beams",
    group: "nature",
    icon: "\ud83c\udf05",
    tagline: "A real sun burning into the lens with beams and warm ghosts",
    accent: "#facc15",
    grade: { saturate: 1.42, contrast: 1.3, brightness: 1.08 },
    layers: [
      { kind: "wash", colors: ["rgba(255,225,150,0.32)", "rgba(255,150,60,0.24)"], dir: "diag", alpha: 1 },
      { kind: "sunflare", x: 0.18, y: 0.16, alpha: 1.0, rays: 9, color: "rgba(255,240,190,1)" },
      { kind: "godrays", alpha: 0.55, angle: 0.55, count: 6, color: "255,235,180" },
      { kind: "halation", alpha: 0.45, color: "rgba(255,210,140,1)" },
      { kind: "particles", style: "dust", alpha: 0.5, count: 22, color: "255,240,200", size: 0.9, drift: 0.5 },
      { kind: "vignette", alpha: 0.56 },
      { kind: "grain", alpha: 0.3 },
    ],
    controls: ["strength", "glow", "warmth", "particles", "speed", "vignette", "saturation"],
    defaults: S({ strength: 1.2, glow: 0.7, warmth: 0.35, particles: 0.45, speed: 1, vignette: 0.35 }),
  },
  {
    id: "sun_spots",
    name: "Sun Spots & Lens Bokeh",
    group: "nature",
    icon: "\ud83c\udf06",
    tagline: "Big out-of-focus light circles drifting across the picture",
    accent: "#fde047",
    grade: { saturate: 1.35, contrast: 1.3, brightness: 1.07 },
    layers: [
      { kind: "wash", colors: ["rgba(255,230,170,0.32)", "rgba(255,170,90,0.22)"], dir: "horiz", alpha: 1 },
      { kind: "particles", style: "bokeh", alpha: 1.0, count: 15, color: "255,235,180", size: 2.4, drift: 0.45 },
      { kind: "bloom", color: "rgba(255,240,200,1)", alpha: 0.4, x: 0.75, y: 0.28, radius: 0.7 },
      { kind: "vignette", alpha: 0.56 },
      { kind: "grain", alpha: 0.3 },
    ],
    controls: ["strength", "particles", "glow", "speed", "softness", "warmth", "vignette"],
    defaults: S({ strength: 1.2, particles: 0.75, glow: 0.55, speed: 0.9, softness: 0.12, warmth: 0.3 }),
  },
  {
    id: "forest_rays",
    name: "Forest God Rays",
    group: "nature",
    icon: "\ud83c\udf32",
    tagline: "Shafts of light cutting through trees with living green air",
    accent: "#4ade80",
    grade: { saturate: 1.5, contrast: 1.28, brightness: 1.02, hueRotate: 6 },
    layers: [
      { kind: "wash", colors: ["rgba(90,200,120,0.3)", "rgba(20,60,40,0.34)"], dir: "vert", alpha: 1 },
      { kind: "godrays", alpha: 0.95, angle: 0.62, count: 7, color: "255,250,200" },
      { kind: "fog", alpha: 0.5, color: "220,255,220", bands: 2, from: "bottom" },
      { kind: "particles", style: "pollen", alpha: 0.7, count: 28, color: "255,250,190", size: 1, drift: 0.35 },
      { kind: "vignette", alpha: 0.58, color: "rgba(5,25,12,1)" },
      { kind: "grain", alpha: 0.35 },
    ],
    controls: ["strength", "glow", "particles", "mist", "speed", "saturation", "vignette"],
    defaults: S({ strength: 1.2, glow: 0.65, particles: 0.55, mist: 0.4, speed: 0.9, vignette: 0.5 }),
  },
  {
    id: "dust_motes",
    name: "Hazy Floating Dust",
    group: "nature",
    icon: "\u2728",
    tagline: "Out-of-focus dust drifting in sunlit air — still photos start breathing",
    accent: "#fcd34d",
    grade: { saturate: 1.3, contrast: 1.26, brightness: 1.06, blur: 0.4 },
    layers: [
      { kind: "wash", colors: ["rgba(255,225,175,0.32)", "rgba(190,140,80,0.24)"], dir: "diag", alpha: 1 },
      { kind: "fog", alpha: 0.5, color: "255,240,215", bands: 2, from: "all" },
      { kind: "particles", style: "dust", alpha: 1.0, count: 50, color: "255,245,215", size: 1, drift: 0.4 },
      { kind: "particles", style: "bokeh", alpha: 0.6, count: 9, color: "255,235,195", size: 2.2, drift: 0.3 },
      { kind: "bloom", color: "rgba(255,240,205,1)", alpha: 0.38, x: 0.2, y: 0.2, radius: 0.7 },
      { kind: "vignette", alpha: 0.56 },
      { kind: "grain", alpha: 0.35 },
    ],
    controls: ["strength", "particles", "mist", "softness", "glow", "speed", "warmth"],
    defaults: S({ strength: 1.2, particles: 0.8, mist: 0.45, softness: 0.28, glow: 0.45, speed: 0.9, warmth: 0.25 }),
  },
  {
    id: "pollen_fireflies",
    name: "Pollen & Fireflies",
    group: "nature",
    icon: "\ud83e\udeb0",
    tagline: "Warm glowing specks lifting through a summer evening",
    accent: "#a3e635",
    grade: { saturate: 1.4, contrast: 1.28, brightness: 0.96 },
    layers: [
      { kind: "wash", colors: ["rgba(60,90,40,0.34)", "rgba(20,30,50,0.4)"], dir: "vert", alpha: 1 },
      { kind: "particles", style: "pollen", alpha: 1.0, count: 36, color: "255,240,150", size: 1.2, drift: -0.5 },
      { kind: "bloom", color: "rgba(200,255,170,1)", alpha: 0.32, x: 0.5, y: 0.5, radius: 0.8 },
      { kind: "vignette", alpha: 0.68, color: "rgba(5,15,10,1)" },
      { kind: "grain", alpha: 0.35 },
    ],
    controls: ["strength", "particles", "glow", "speed", "vignette", "saturation"],
    defaults: S({ strength: 1.2, particles: 0.75, glow: 0.5, speed: 0.85, vignette: 0.55 }),
  },
  {
    id: "snow_fall",
    name: "Gentle Snowfall",
    group: "nature",
    icon: "\u2744\ufe0f",
    tagline: "Cold blue air with soft snow drifting down the frame",
    accent: "#bae6fd",
    grade: { saturate: 0.95, contrast: 1.2, brightness: 1.06, hueRotate: 18 },
    layers: [
      { kind: "wash", colors: ["rgba(150,200,255,0.42)", "rgba(60,100,170,0.36)"], dir: "vert", alpha: 1 },
      { kind: "fog", alpha: 0.55, color: "230,245,255", bands: 2, from: "bottom" },
      { kind: "particles", style: "snow", alpha: 1.0, count: 55, color: "255,255,255", size: 1.2, drift: 0.9 },
      { kind: "vignette", alpha: 0.56, color: "rgba(20,40,70,1)" },
      { kind: "grain", alpha: 0.3 },
    ],
    controls: ["strength", "particles", "mist", "speed", "warmth", "vignette", "contrast"],
    defaults: S({ strength: 1.2, particles: 0.75, mist: 0.45, speed: 1, warmth: -0.35, vignette: 0.4 }),
  },
  {
    id: "rain_mist",
    name: "Soft Rain & Mist",
    group: "nature",
    icon: "\ud83c\udf27\ufe0f",
    tagline: "Moody wet-weather light with fine rain and low cloud",
    accent: "#7dd3fc",
    grade: { saturate: 0.92, contrast: 1.26, brightness: 0.92, hueRotate: 12 },
    layers: [
      { kind: "wash", colors: ["rgba(90,130,175,0.42)", "rgba(20,35,55,0.42)"], dir: "vert", alpha: 1 },
      { kind: "fog", alpha: 0.85, color: "210,230,245", bands: 3, from: "all" },
      { kind: "rain", alpha: 1.0, count: 110 },
      { kind: "vignette", alpha: 0.62, color: "rgba(8,18,30,1)" },
      { kind: "grain", alpha: 0.4 },
    ],
    controls: ["strength", "particles", "mist", "speed", "contrast", "vignette", "warmth"],
    defaults: S({ strength: 1.2, particles: 0.7, mist: 0.65, speed: 1.1, warmth: -0.3, vignette: 0.55 }),
  },
];


export const VIDEO_FILTERS_BY_ID: Record<string, VideoFilterPreset> = VIDEO_FILTERS.reduce(
  (acc, f) => {
    acc[f.id] = f;
    return acc;
  },
  {} as Record<string, VideoFilterPreset>
);

/** Saved on the project — one filter for the entire video, like the music track. */
export interface VideoFilterConfig {
  id: string;
  settings: VideoFilterSettings;
}

export function getPreset(id?: string | null): VideoFilterPreset | null {
  if (!id) return null;
  return VIDEO_FILTERS_BY_ID[id] || null;
}

export function defaultSettingsFor(preset: VideoFilterPreset): VideoFilterSettings {
  return { ...BASE_SETTINGS, ...preset.defaults };
}

export function makeFilterConfig(id: string): VideoFilterConfig | null {
  const preset = getPreset(id);
  if (!preset) return null;
  return { id, settings: defaultSettingsFor(preset) };
}

export function resolveSettings(
  preset: VideoFilterPreset,
  settings?: Partial<VideoFilterSettings>
): VideoFilterSettings {
  return { ...BASE_SETTINGS, ...preset.defaults, ...(settings || {}) };
}

/* ------------------------- colour grade strings -------------------------- */

function buildGrade(
  preset: VideoFilterPreset,
  s: VideoFilterSettings,
  widthScale: number,
  pct: boolean
): string {
  const k = Math.max(0, s.strength);
  const g = preset.grade;
  const parts: string[] = [];

  const mix = (neutral: number, value: number | undefined) =>
    value === undefined ? neutral : neutral + (value - neutral) * k;

  const sepia = (g.sepia ?? 0) * k;
  const gray = (g.grayscale ?? 0) * k;
  const sat = mix(1, g.saturate) * s.saturation;
  const con = mix(1, g.contrast) * s.contrast;
  const bri = mix(1, g.brightness);
  const hue = (g.hueRotate ?? 0) * k + s.warmth * -14;
  const blurPx = ((g.blur ?? 0) * k + s.softness * 2.2) * widthScale;

  const fmt = (v: number) => (pct ? `${Math.round(v * 100)}%` : `${v.toFixed(3)}`);

  if (sepia > 0.001) parts.push(`sepia(${fmt(Math.min(1, sepia))})`);
  if (gray > 0.001) parts.push(`grayscale(${fmt(Math.min(1, gray))})`);
  if (Math.abs(sat - 1) > 0.001) parts.push(`saturate(${fmt(Math.max(0, sat))})`);
  if (Math.abs(con - 1) > 0.001) parts.push(`contrast(${fmt(Math.max(0, con))})`);
  if (Math.abs(bri - 1) > 0.001) parts.push(`brightness(${fmt(Math.max(0, bri))})`);
  if (Math.abs(hue) > 0.2) parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
  if (blurPx > 0.05) parts.push(`blur(${blurPx.toFixed(2)}px)`);

  return parts.length ? parts.join(" ") : "none";
}

/** CSS filter string (for <img> / DOM previews). */
export function getFilterCss(config?: VideoFilterConfig | null): string {
  const preset = getPreset(config?.id);
  if (!preset) return "none";
  return buildGrade(preset, resolveSettings(preset, config?.settings), 1, false);
}

/** Canvas ctx.filter string, scaled for the real render width. */
export function getFilterCanvas(config: VideoFilterConfig | null | undefined, canvasWidth = 1280): string {
  const preset = getPreset(config?.id);
  if (!preset) return "none";
  return buildGrade(preset, resolveSettings(preset, config?.settings), Math.max(0.3, canvasWidth / 1280), true);
}
