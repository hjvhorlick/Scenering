/**
 * Pixabay-inspired visualiser families
 * ====================================
 * Pixabay's free video library has thousands of audio-visualiser clips. Sorted
 * by the likes/downloads on the clips themselves, the same handful of looks keep
 * coming out on top, and those are the five families built here:
 *
 *   1. Bass & Speakers — the loudspeaker with EQ bars. The single most popular
 *      free visualiser on the site (559 likes · 82,200 downloads · Editor's
 *      Choice) is exactly this: a blue speaker with bars moving under it.
 *   2. Spectrum Bars — bars across the frame with peak caps (390 / 341 likes).
 *   3. Flowing Waves — smooth abstract waveforms and ribbons (334 / 200 likes).
 *   4. 3D Grids — cube waves, city skylines and wire tunnels (293 / 219 likes).
 *   5. Circular — radial spectrums, sunbursts and halo rings (341 likes).
 *
 * Each family ships six looks, so the studio gains 30 visualisers, filed under
 * their own sub-category each so the catalogue stays readable.
 *
 * Two things every style here shares, both deliberate:
 *
 *   • **Transparent.** Nothing in this file paints a background — no filled
 *     rectangle, no vignette, no black plate. The visualiser is drawn as light
 *     on top of the user's own footage, which is also why it can be dragged
 *     anywhere in the frame. (The Pixabay clips themselves are mostly
 *     black-background MP4s; ours are overlays.)
 *   • **Audio-reactive and code-drawn.** Every look reads the project's real
 *     voice/music buses, so it moves with the actual narration or track and
 *     stays pin sharp at any export size.
 */
import type { InsertVisualOptions } from "../types";
import type { BarsResult } from "./audio-reactive";
import { hash01, mixColors, rgba, roundRectPath, softGlow } from "./visualizer-colors";

/* ------------------------------------------------------------------ *
 * Family table
 * ------------------------------------------------------------------ */

export type PixabayFamilyId = "bass" | "spectrum" | "flow" | "grid" | "circular";

/** How much of the frame the style occupies and where it is anchored.
 *  `object` = a compact object you place anywhere, `round` = a circular
 *  centrepiece, `wide` = a band across the frame, `frame` = fills the frame. */
export type PixabayShape = "object" | "wide" | "frame" | "round";

export interface PixabayStyleSpec {
  id: string;
  /** which drawing routine inside the family paints this look */
  variant: string;
  name: string;
  icon: string;
  description: string;
  /** likes on the Pixabay clip this look is modelled on */
  likes: number;
  /** the Pixabay clips behind the look, most popular first */
  source: string;
  /** the look's signature colours (the theme picker can still re-colour it) */
  colors: { primary: string; secondary: string; accent: string };
  size: number;
  position: "bottom" | "center";
  bandCount: number;
  glow: number;
  reactivity: number;
  thickness?: number;
  /** extra options merged into the catalogue defaults */
  options?: InsertVisualOptions;
}

export interface PixabayFamilySpec {
  id: PixabayFamilyId;
  name: string;
  icon: string;
  blurb: string;
  shape: PixabayShape;
  styles: PixabayStyleSpec[];
}

export const PIXABAY_FAMILIES: PixabayFamilySpec[] = [
  /* ---------------- 1. BASS & SPEAKERS ---------------- */
  {
    id: "bass",
    name: "Bass & Speakers",
    icon: "🔊",
    blurb: "The most-liked free visualiser look on Pixabay: a speaker with EQ bars. Six speakers, from studio monitor to festival stack",
    shape: "object",
    styles: [
      {
        id: "px_speaker_blue",
        variant: "classic",
        name: "Blue Beat Speaker",
        icon: "🔊",
        description:
          "The classic: a blue loudspeaker with a row of EQ bars pulsing underneath. Modelled on the most popular free visualiser on Pixabay (559 likes, 82,200 downloads, Editor's Choice)",
        likes: 559,
        source: "Pixabay · Sound, Music, Speakers — tommyvideo",
        colors: { primary: "#38bdf8", secondary: "#1d4ed8", accent: "#e0f2fe" },
        size: 1.0,
        position: "center",
        bandCount: 32,
        glow: 0.9,
        reactivity: 1.25,
        thickness: 8,
      },
      {
        id: "px_speaker_neon",
        variant: "neon",
        name: "Neon Woofer",
        icon: "🟣",
        description:
          "A cyan-neon cone with two banks of bars firing up either side of it — festival-poster energy, built for music-led videos",
        likes: 202,
        source: "Pixabay · Loudspeaker Sound Volume — Iconikmg",
        colors: { primary: "#22d3ee", secondary: "#a21caf", accent: "#f0abfc" },
        size: 1.0,
        position: "center",
        bandCount: 40,
        glow: 1.0,
        reactivity: 1.3,
        thickness: 7,
      },
      {
        id: "px_speaker_sub",
        variant: "porthole",
        name: "Sub Porthole",
        icon: "🕳️",
        description:
          "One oversized sub driver seen head-on: the cone pumps on every kick and bass shockwaves roll out of it. The most bass-forward look in the set",
        likes: 122,
        source: "Pixabay · Speakers, Sound, Audio, Noise — tommyvideo",
        colors: { primary: "#f59e0b", secondary: "#7c2d12", accent: "#fde68a" },
        size: 1.15,
        position: "center",
        bandCount: 24,
        glow: 0.95,
        reactivity: 1.45,
      },
      {
        id: "px_speaker_monitor",
        variant: "monitor",
        name: "Studio Monitor",
        icon: "🎚️",
        description:
          "A pair of flat studio monitors with a thin precision meter above them — clean, neutral and broadcast-looking",
        likes: 129,
        source: "Pixabay · Headphones, Speakers, Music — olenchic",
        colors: { primary: "#e5e7eb", secondary: "#4b5563", accent: "#ffffff" },
        size: 1.0,
        position: "center",
        bandCount: 28,
        glow: 0.7,
        reactivity: 1.15,
        thickness: 6,
      },
      {
        id: "px_speaker_retro",
        variant: "retro",
        name: "Retro Hi-Fi",
        icon: "📻",
        description:
          "A vintage driver with groove rings and two VU meters breathing with the track — tape-era warmth for nostalgic videos",
        likes: 298,
        source: "Pixabay · Reel to reel / Radio, Vintage — mootlak, Sertmidia",
        colors: { primary: "#f59e0b", secondary: "#166534", accent: "#fde68a" },
        size: 1.05,
        position: "center",
        bandCount: 24,
        glow: 0.8,
        reactivity: 1.2,
      },
      {
        id: "px_speaker_stack",
        variant: "stack",
        name: "Festival Stack",
        icon: "🎪",
        description:
          "A stacked tweeter-over-woofer rig on a wide bar array — the big-stage look, with the low end driving the whole stack",
        likes: 230,
        source: "Pixabay · Bling, DJ, Disco — stickabilly",
        colors: { primary: "#f43f5e", secondary: "#7c2d12", accent: "#fdba74" },
        size: 1.1,
        position: "center",
        bandCount: 48,
        glow: 0.95,
        reactivity: 1.3,
        thickness: 9,
      },
    ],
  },

  /* ---------------- 2. SPECTRUM BARS ---------------- */
  {
    id: "spectrum",
    name: "Spectrum Bars",
    icon: "📊",
    blurb: "The equaliser workhorses: bars, needles, blocks and dots across the whole width — six treatments",
    shape: "wide",
    styles: [
      {
        id: "px_bars_green",
        variant: "classic",
        name: "Green Reactor",
        icon: "🟢",
        description:
          "Solid green bars with white peak caps riding every transient, glowing as the spectrum builds — the most-liked spectrum look on Pixabay",
        likes: 390,
        source: "Pixabay · Spectrum, Green, React — tommyvideo",
        colors: { primary: "#22c55e", secondary: "#15803d", accent: "#bbf7d0" },
        size: 1.0,
        position: "bottom",
        bandCount: 48,
        glow: 0.85,
        reactivity: 1.3,
        thickness: 14,
      },
      {
        id: "px_bars_needles",
        variant: "needles",
        name: "Neon Needles",
        icon: "💜",
        description:
          "Hair-thin neon needles that spike upward with heavy bloom — maximum detail, minimum ink",
        likes: 341,
        source: "Pixabay · Audio Spectrum — VFS_World",
        colors: { primary: "#e879f9", secondary: "#22d3ee", accent: "#ffffff" },
        size: 1.0,
        position: "bottom",
        bandCount: 96,
        glow: 1.0,
        reactivity: 1.35,
        thickness: 3,
      },
      {
        id: "px_bars_diamond",
        variant: "diamond",
        name: "Diamond Mirror",
        icon: "🔷",
        description:
          "Bars that grow up and down from a single centre line, so the whole rack opens like a diamond around the middle of the screen",
        likes: 163,
        source: "Pixabay · Music Visualizer, Visualization — TonyDias7",
        colors: { primary: "#fb7185", secondary: "#38bdf8", accent: "#fde68a" },
        size: 1.0,
        position: "bottom",
        bandCount: 56,
        glow: 0.85,
        reactivity: 1.25,
        thickness: 12,
      },
      {
        id: "px_bars_blocks",
        variant: "blocks",
        name: "LED Blocks",
        icon: "🟧",
        description:
          "Each band is a stack of chunky LED blocks that light one by one as the level climbs — the club-wall meter look",
        likes: 109,
        source: "Pixabay · Audio, Sound, Equalizer — olenchic",
        colors: { primary: "#f97316", secondary: "#dc2626", accent: "#fef08a" },
        size: 1.0,
        position: "bottom",
        bandCount: 40,
        glow: 0.8,
        reactivity: 1.25,
        thickness: 18,
      },
      {
        id: "px_bars_dots",
        variant: "dots",
        name: "Dot Rain",
        icon: "🟡",
        description:
          "Dots that fall back down out of each band after it peaks — a rain of light instead of solid bars",
        likes: 88,
        source: "Pixabay · Music, Visualizer, Visualization — TonyDias7",
        colors: { primary: "#a3e635", secondary: "#0ea5e9", accent: "#ecfccb" },
        size: 1.0,
        position: "bottom",
        bandCount: 64,
        glow: 0.9,
        reactivity: 1.3,
        thickness: 10,
      },
      {
        id: "px_bars_tuner",
        variant: "tuner",
        name: "Radio Tuner",
        icon: "📶",
        description:
          "A wide dial with tick marks and a needle that snaps to the loudest band, over a low bank of bars — retro receiver styling",
        likes: 43,
        source: "Pixabay · Audio, Bars, Music, Volume — BlenderTimer",
        colors: { primary: "#facc15", secondary: "#b45309", accent: "#fef9c3" },
        size: 1.0,
        position: "bottom",
        bandCount: 48,
        glow: 0.8,
        reactivity: 1.2,
        thickness: 12,
      },
    ],
  },

  /* ---------------- 3. FLOWING WAVES ---------------- */
  {
    id: "flow",
    name: "Flowing Waves",
    icon: "🌊",
    blurb: "Smooth, cinematic waveforms and ribbons — the abstract-waveform looks that top the Pixabay charts",
    shape: "wide",
    styles: [
      {
        id: "px_wave_aurora",
        variant: "aurora",
        name: "Aurora Ribbons",
        icon: "🌌",
        description:
          "Three translucent ribbons that fold over each other and glow from underneath like northern lights moving with the music",
        likes: 334,
        source: "Pixabay · Audio, Music, Abstract Waveform — Damnwell Media",
        colors: { primary: "#34d399", secondary: "#818cf8", accent: "#f0abfc" },
        size: 1.0,
        position: "bottom",
        bandCount: 64,
        glow: 0.95,
        reactivity: 1.3,
      },
      {
        id: "px_wave_silk",
        variant: "silk",
        name: "Liquid Silk",
        icon: "🪢",
        description:
          "One silky line with a soft mirrored ghost of itself below, drifting like smoke through the frame",
        likes: 200,
        source: "Pixabay · Rhythm, Music, Audio Waves — jorono",
        colors: { primary: "#38bdf8", secondary: "#c084fc", accent: "#e0f2fe" },
        size: 1.0,
        position: "bottom",
        bandCount: 72,
        glow: 0.9,
        reactivity: 1.35,
      },
      {
        id: "px_wave_pulse",
        variant: "pulse",
        name: "Pulse Line",
        icon: "📉",
        description:
          "A crisp oscilloscope line that snaps with the voice, firing a glowing ring outward on every beat",
        likes: 99,
        source: "Pixabay · Audio, Audio Visualizer, Music — VFS_World",
        colors: { primary: "#f43f5e", secondary: "#fb923c", accent: "#ffe4e6" },
        size: 1.0,
        position: "bottom",
        bandCount: 96,
        glow: 1.0,
        reactivity: 1.4,
      },
      {
        id: "px_wave_helix",
        variant: "helix",
        name: "Double Helix",
        icon: "🧬",
        description:
          "Two waves twisting through each other in opposite phases, cross-linking where they meet — the sound made visible as a strand",
        likes: 75,
        source: "Pixabay · Audio, Audio Visualizer — VFS_World",
        colors: { primary: "#22d3ee", secondary: "#a855f7", accent: "#e9d5ff" },
        size: 1.0,
        position: "bottom",
        bandCount: 80,
        glow: 0.95,
        reactivity: 1.35,
      },
      {
        id: "px_wave_hills",
        variant: "hills",
        name: "Spectrum Hills",
        icon: "⛰️",
        description:
          "Filled hills rolling through the frame, each layer a different stretch of the spectrum — landscape-shaped sound",
        likes: 45,
        source: "Pixabay · Audio Spectrum, Visualiser — VFS_World",
        colors: { primary: "#f97316", secondary: "#e11d48", accent: "#fed7aa" },
        size: 1.0,
        position: "bottom",
        bandCount: 48,
        glow: 0.85,
        reactivity: 1.3,
      },
      {
        id: "px_wave_spark",
        variant: "spark",
        name: "Particle Wake",
        icon: "✨",
        description:
          "A clean wave trailed by thousands of sparks that fly off the crests and fade — light that behaves like water",
        likes: 24,
        source: "Pixabay · Audio, Wave, Sound, Audio Frequency — agp_studios",
        colors: { primary: "#67e8f9", secondary: "#3b82f6", accent: "#ffffff" },
        size: 1.0,
        position: "bottom",
        bandCount: 64,
        glow: 0.95,
        reactivity: 1.4,
      },
    ],
  },

  /* ---------------- 4. 3D GRIDS ---------------- */
  {
    id: "grid",
    name: "3D Grids",
    icon: "🧊",
    blurb: "Isometric cubes, city skylines, wire tunnels and rippling grids — the dimensional looks, drawn in perspective",
    shape: "frame",
    styles: [
      {
        id: "px_grid_cube",
        variant: "cube",
        name: "Cube Wave",
        icon: "🧊",
        description:
          "A field of isometric cubes rising and falling with the spectrum like a solid equaliser you can look down onto",
        likes: 293,
        source: "Pixabay · Cube, Wave, Abstract — ChristianBodhi",
        colors: { primary: "#e879f9", secondary: "#4f46e5", accent: "#fde68a" },
        size: 1.0,
        position: "center",
        bandCount: 48,
        glow: 0.9,
        reactivity: 1.3,
      },
      {
        id: "px_grid_skyline",
        variant: "skyline",
        name: "City Skyline",
        icon: "🌆",
        description:
          "A neon skyline where every tower is a frequency band and the windows light up floor by floor as the level climbs",
        likes: 219,
        source: "Pixabay · Night, City, Music Visualization — olexlia",
        colors: { primary: "#38bdf8", secondary: "#f472b6", accent: "#fde68a" },
        size: 1.0,
        position: "center",
        bandCount: 44,
        glow: 0.9,
        reactivity: 1.3,
      },
      {
        id: "px_grid_tunnel",
        variant: "tunnel",
        name: "Warp Tunnel",
        icon: "🌀",
        description:
          "Wireframe tunnel walls rushing past the camera, twisting with the mids and punching forward on every kick",
        likes: 106,
        source: "Pixabay · Intro, Outro, Beats, Rhythm — 7surr195",
        colors: { primary: "#22d3ee", secondary: "#8b5cf6", accent: "#ffffff" },
        size: 1.0,
        position: "center",
        bandCount: 56,
        glow: 1.0,
        reactivity: 1.4,
      },
      {
        id: "px_grid_ripple",
        variant: "ripple",
        name: "Wire Ripple",
        icon: "🕸️",
        description:
          "A wire mesh seen from above, rippling outward from the centre with every drum hit — water made of light",
        likes: 163,
        source: "Pixabay · Music Visualizer, Visualization — TonyDias7",
        colors: { primary: "#34d399", secondary: "#0ea5e9", accent: "#ecfeff" },
        size: 1.0,
        position: "center",
        bandCount: 64,
        glow: 0.9,
        reactivity: 1.3,
      },
      {
        id: "px_grid_iso",
        variant: "iso",
        name: "Iso Bars",
        icon: "📐",
        description:
          "Isometric bars with lit tops and shaded sides — a 3D equaliser that reads clearly even on busy footage",
        likes: 95,
        source: "Pixabay · Music Visualiser — VFS_World",
        colors: { primary: "#fbbf24", secondary: "#b91c1c", accent: "#fef3c7" },
        size: 1.0,
        position: "center",
        bandCount: 40,
        glow: 0.85,
        reactivity: 1.3,
      },
      {
        id: "px_grid_cells",
        variant: "cells",
        name: "Prism Cells",
        icon: "🔳",
        description:
          "A grid of glass cells that light up as the sound passes through them, with a soft scanner sweeping the wall",
        likes: 27,
        source: "Pixabay · Music, Visualizer, Visualization — TonyDias7",
        colors: { primary: "#e879f9", secondary: "#22d3ee", accent: "#fce7f3" },
        size: 1.0,
        position: "center",
        bandCount: 72,
        glow: 0.9,
        reactivity: 1.35,
      },
    ],
  },

  /* ---------------- 5. CIRCULAR ---------------- */
  {
    id: "circular",
    name: "Circular",
    icon: "⭕",
    blurb: "Radial spectrums, sunbursts and halo rings — the scrolling-stopper circular looks, six ways",
    shape: "round",
    styles: [
      {
        id: "px_ring_neon",
        variant: "wheel",
        name: "Neon Wheel",
        icon: "🎡",
        description:
          "A full circle of spikes whose colours rotate as it turns — the hypnotic circular spectrum that stops the scroll",
        likes: 341,
        source: "Pixabay · Audio Spectrum, Spectrum — VFS_World",
        colors: { primary: "#22d3ee", secondary: "#e879f9", accent: "#ffffff" },
        size: 1.2,
        position: "center",
        bandCount: 72,
        glow: 1.0,
        reactivity: 1.3,
        thickness: 6,
      },
      {
        id: "px_ring_sunburst",
        variant: "sunburst",
        name: "Sunburst",
        icon: "🌞",
        description:
          "Long thin rays shooting out of a white-hot core, flaring with the bass — maximum drama in the smallest footprint",
        likes: 158,
        source: "Pixabay · Sound, Speakers, Music — tommyvideo",
        colors: { primary: "#facc15", secondary: "#ea580c", accent: "#fffbeb" },
        size: 1.25,
        position: "center",
        bandCount: 96,
        glow: 1.0,
        reactivity: 1.35,
      },
      {
        id: "px_ring_bars",
        variant: "bars",
        name: "Radial Bars",
        icon: "🕸️",
        description:
          "Thick wedges instead of thin spikes — a chunky radial equaliser that stays readable in a thumbnail",
        likes: 122,
        source: "Pixabay · Audio, Sound, Equalizer — olenchic",
        colors: { primary: "#38bdf8", secondary: "#1e40af", accent: "#e0f2fe" },
        size: 1.15,
        position: "center",
        bandCount: 36,
        glow: 0.85,
        reactivity: 1.3,
        thickness: 14,
      },
      {
        id: "px_ring_halo",
        variant: "halo",
        name: "Halo Rings",
        icon: "💫",
        description:
          "Concentric rings that expand and brighten with the bass — calm, modern and perfect behind a title",
        likes: 134,
        source: "Pixabay · Waves, Beat, Sound, Audio Effect — VFS_World",
        colors: { primary: "#34d399", secondary: "#0d9488", accent: "#d1fae5" },
        size: 1.2,
        position: "center",
        bandCount: 40,
        glow: 0.9,
        reactivity: 1.3,
      },
      {
        id: "px_ring_dots",
        variant: "dots",
        name: "Orbit Dots",
        icon: "🔵",
        description:
          "A ring of glowing dots, each one swelling with its own band while the whole orbit slowly turns",
        likes: 88,
        source: "Pixabay · Music Visualizer, Audio Visualizer — VFS_World",
        colors: { primary: "#f472b6", secondary: "#8b5cf6", accent: "#fce7f3" },
        size: 1.1,
        position: "center",
        bandCount: 48,
        glow: 0.95,
        reactivity: 1.3,
      },
      {
        id: "px_ring_vortex",
        variant: "vortex",
        name: "Vortex Spiral",
        icon: "🌀",
        description:
          "Spiral arms of light winding out of the centre, spinning faster and reaching further as the track lifts",
        likes: 51,
        source: "Pixabay · Music Visualizer, Audio Visualizer — VFS_World",
        colors: { primary: "#a855f7", secondary: "#06b6d4", accent: "#f5d0fe" },
        size: 1.15,
        position: "center",
        bandCount: 64,
        glow: 0.95,
        reactivity: 1.35,
      },
    ],
  },
];

/** Every style id, for fast dispatch from the main renderer. */
export const PIXABAY_STYLE_IDS: string[] = PIXABAY_FAMILIES.flatMap((f) =>
  f.styles.map((s) => s.id)
);

const STYLE_INDEX = new Map<string, { family: PixabayFamilySpec; style: PixabayStyleSpec }>();
for (const family of PIXABAY_FAMILIES) {
  for (const style of family.styles) STYLE_INDEX.set(style.id, { family, style });
}

export function isPixabayStyle(type: string): boolean {
  return STYLE_INDEX.has(type);
}

export function pixabayFamilyOf(type: string): PixabayFamilySpec | null {
  return STYLE_INDEX.get(type)?.family || null;
}

export function pixabayStyleOf(type: string): PixabayStyleSpec | null {
  return STYLE_INDEX.get(type)?.style || null;
}

/** Total likes behind a family — the popularity ranking the set is built on. */
export function familyLikes(family: PixabayFamilySpec): number {
  return family.styles.reduce((sum, s) => sum + s.likes, 0);
}

/* ------------------------------------------------------------------ *
 * Scene passed to every family renderer
 * ------------------------------------------------------------------ */

export interface PixabayScene {
  ctx: CanvasRenderingContext2D;
  /** frame size in px — everything is drawn around the origin */
  w: number;
  h: number;
  /** width available to the element (the full frame for wide/frame shapes) */
  width: number;
  elapsed: number;
  primary: string;
  secondary: string;
  accent: string;
  glow: number;
  reactive: number;
  bars: BarsResult;
  beat: number;
  compact: boolean;
}

/** Level of band `i` of `count`, comfortably in 0..1.3 */
function band(s: PixabayScene, i: number, count: number): number {
  const v = s.bars.values[Math.abs(i) % s.bars.values.length] || 0;
  return Math.max(0, Math.min(1.3, v));
}

/** A row of bars. `dir` = -1 grows upward, +1 grows downward. */
function barRow(
  ctx: CanvasRenderingContext2D,
  s: PixabayScene,
  opts: {
    from: number;
    to: number;
    baseline: number;
    maxH: number;
    dir: 1 | -1;
    count: number;
    width: number;
    gap: number;
    glow: number;
    rainbow?: boolean;
    cap?: boolean;
    radius?: number;
  }
) {
  const { from, to, baseline, maxH, dir, count, width, gap, glow, rainbow, cap, radius } = opts;
  const span = to - from;
  const slot = span / count;
  const bw = Math.max(1.5, Math.min(width, slot - gap));
  for (let i = 0; i < count; i++) {
    const v = band(s, i, count);
    // every bar keeps a visible block: the Pixabay racks always show a floor of
    // light even between hits, which is what makes them read as a meter
    const h = Math.max(bw, Math.max(maxH * 0.07, Math.pow(v, 0.86) * maxH));
    const x = from + i * slot + (slot - bw) / 2;
    const y = dir < 0 ? baseline - h : baseline;
    const body = rainbow
      ? (() => {
          const g = ctx.createLinearGradient(0, baseline, 0, baseline + dir * -maxH);
          g.addColorStop(0, "#2563eb");
          g.addColorStop(0.35, "#06b6d4");
          g.addColorStop(0.6, "#10b981");
          g.addColorStop(0.82, "#f59e0b");
          g.addColorStop(1, "#ef4444");
          return g;
        })()
      : (() => {
          const g = ctx.createLinearGradient(0, baseline, 0, baseline + dir * -maxH);
          g.addColorStop(0, rgba(s.primary, 0.55));
          g.addColorStop(0.4, s.primary);
          g.addColorStop(0.85, mixColors(s.primary, s.secondary, 0.55));
          g.addColorStop(1, s.accent);
          return g;
        })();
    if (glow > 0.05) {
      ctx.shadowColor = rgba(s.primary, 0.9);
      ctx.shadowBlur = (10 + v * 22) * glow;
    }
    ctx.fillStyle = body;
    if (radius && radius > 0) roundRectPath(ctx, x, y, bw, h, radius);
    else ctx.beginPath(), ctx.rect(x, y, bw, h);
    ctx.fill();
    ctx.shadowBlur = 0;

    // glass highlight down the left edge of the bar
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(x + bw * 0.12, y, Math.max(0.8, bw * 0.22), h);
  }
}

/* ------------------------------------------------------------------ *
 * 1. BASS & SPEAKERS
 * ------------------------------------------------------------------ */

/**
 * A loudspeaker driver, drawn solid and lit so it reads as real hardware rather
 * than a glowing disc: cast shadow, steel basket, rubber surround, a paper cone
 * lit from the top left, a convex dust cap and the mounting screws. The bass
 * pumps the cone (and the cast shadow) on every kick.
 */
function speakerCone(
  ctx: CanvasRenderingContext2D,
  s: PixabayScene,
  cx: number,
  cy: number,
  r: number,
  opts: { rings?: number; screws?: number; pulse?: number; face?: string } = {}
) {
  const pump = 1 + (opts.pulse ?? 0);
  const R = r * pump;
  const ribs = opts.rings ?? 3;
  const screws = opts.screws ?? 0;
  const face = opts.face || s.accent;

  // ambient glow behind the cabinet, kept low so the metal stays readable
  softGlow(ctx, cx, cy, R * 2.1, rgba(s.primary, 0.16), rgba(s.secondary, 0.1), 1);

  // ---- cast shadow: the driver sits *on* something --------------------
  ctx.save();
  if (ctx.shadowBlur !== undefined) ctx.shadowBlur = 0;
  const shadow = ctx.createRadialGradient(cx, cy + R * 1.02, R * 0.1, cx, cy + R * 1.02, R * 1.25);
  shadow.addColorStop(0, "rgba(3, 6, 14, 0.55)");
  shadow.addColorStop(0.6, "rgba(3, 6, 14, 0.28)");
  shadow.addColorStop(1, "rgba(3, 6, 14, 0)");
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(cx, cy + R * 1.02, R * 1.25, R * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ---- steel basket ---------------------------------------------------
  const basket = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  basket.addColorStop(0, "#39465a");
  basket.addColorStop(0.35, "#1b2433");
  basket.addColorStop(0.7, "#242f40");
  basket.addColorStop(1, "#0d1119");
  ctx.fillStyle = basket;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  // ---- rubber surround ------------------------------------------------
  ctx.lineWidth = Math.max(1.5, R * 0.15);
  ctx.strokeStyle = rgba(mixColors(s.secondary, "#0b0f16", 0.45), 0.95);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.86, 0, Math.PI * 2);
  ctx.stroke();
  // a sliver of light on the surround's top edge keeps it from reading flat
  ctx.lineWidth = Math.max(1, R * 0.045);
  ctx.strokeStyle = rgba(mixColors(face, "#ffffff", 0.35), 0.4);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.86, Math.PI * 1.05, Math.PI * 1.75);
  ctx.stroke();

  // ---- paper cone, lit from the top left ------------------------------
  const coneR = R * 0.79;
  const cone = ctx.createRadialGradient(
    cx - coneR * 0.28,
    cy - coneR * 0.32,
    coneR * 0.05,
    cx,
    cy,
    coneR
  );
  cone.addColorStop(0, "#4a5468");
  cone.addColorStop(0.28, "#333d4f");
  cone.addColorStop(0.62, rgba(mixColors(s.secondary, "#161c26", 0.55), 1));
  cone.addColorStop(0.92, "#10151d");
  cone.addColorStop(1, "#0a0d13");
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.arc(cx, cy, coneR, 0, Math.PI * 2);
  ctx.fill();

  // ribs pressed into the cone
  for (let i = 1; i <= ribs; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (coneR * i) / (ribs + 1), 0, Math.PI * 2);
    ctx.strokeStyle = rgba("#0a0e15", 0.32);
    ctx.lineWidth = Math.max(0.7, R * 0.014);
    ctx.stroke();
  }
  // rim shadow, then the lit top-left arc (the money shot)
  ctx.beginPath();
  ctx.arc(cx, cy, coneR * 0.99, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
  ctx.lineWidth = Math.max(1, R * 0.03);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, coneR * 0.92, Math.PI * 1.02, Math.PI * 1.62);
  ctx.strokeStyle = rgba(mixColors(face, "#ffffff", 0.25), 0.55);
  ctx.lineWidth = Math.max(1, R * 0.028);
  ctx.stroke();

  // ---- convex dust cap -------------------------------------------------
  const capR = R * 0.3;
  const cap = ctx.createRadialGradient(
    cx - capR * 0.36,
    cy - capR * 0.42,
    capR * 0.08,
    cx,
    cy,
    capR * 1.05
  );
  cap.addColorStop(0, mixColors(face, "#ffffff", 0.65));
  cap.addColorStop(0.45, mixColors(face, s.primary, 0.35));
  cap.addColorStop(1, rgba(mixColors(s.primary, "#0a0d13", 0.6), 1));
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.arc(cx, cy, capR, 0, Math.PI * 2);
  ctx.fill();
  if (s.glow > 0.05 && (s.bars.low + s.beat) > 0.25) {
    ctx.shadowColor = rgba(face, 0.9);
    ctx.shadowBlur = 16 * s.glow * (0.4 + s.bars.low * 0.8);
  }
  ctx.strokeStyle = rgba(mixColors(face, "#ffffff", 0.5), 0.8);
  ctx.lineWidth = Math.max(1, R * 0.022);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // specular dot on the dome
  ctx.beginPath();
  ctx.arc(cx - capR * 0.38, cy - capR * 0.44, Math.max(1.2, capR * 0.2), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.fill();

  // ---- basket screws ---------------------------------------------------
  for (let i = 0; i < screws; i++) {
    const a = (i / screws) * Math.PI * 2 - Math.PI / 2;
    const sx = cx + Math.cos(a) * R * 0.94;
    const sy = cy + Math.sin(a) * R * 0.94;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1, R * 0.045), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(203, 213, 225, 0.9)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(0.6, R * 0.02), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(15, 20, 30, 0.85)";
    ctx.fill();
  }

  // ---- outer bevel ring ------------------------------------------------
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.99, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(mixColors(face, "#ffffff", 0.4), 0.9);
  ctx.lineWidth = Math.max(1.4, R * 0.05);
  if (s.glow > 0.05) {
    ctx.shadowColor = s.primary;
    ctx.shadowBlur = 18 * s.glow * (0.6 + s.bars.low * 0.7 + s.beat * 0.5);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawBassFamily(s: PixabayScene, variant: string) {
  const { ctx, width, h } = s;
  const pump = s.bars.low * 0.14 + s.beat * 0.1;
  const unit = Math.min(width * 0.46, h * 0.46);

  switch (variant) {
    /* --- the classic: one cone, bars underneath (Pixabay's most-liked look) --- */
    case "classic": {
      const r = unit * 0.46;
      const baseY = r * 1.22;
      const span = unit * 1.5;
      barRow(ctx, s, {
        from: -span / 2,
        to: span / 2,
        baseline: baseY,
        maxH: unit * 0.42,
        dir: -1,
        count: 26,
        width: Math.max(3, span / 40),
        gap: Math.max(2, span / 60),
        glow: s.glow,
        cap: true,
        radius: 2,
      });
      speakerCone(ctx, s, 0, 0, r, { rings: 3, screws: 8, pulse: pump });
      // floor glow so the speaker sits on the bar bank
      softGlow(ctx, 0, baseY, span * 0.6, rgba(s.primary, 0.12), rgba(s.secondary, 0.05), 1);
      break;
    }

    /* --- neon cone with bars firing up either side --- */
    case "neon": {
      const r = unit * 0.4;
      const maxH = unit * 0.72;
      const sideSpan = unit * 0.55;
      for (const dir of [-1, 1]) {
        const from = dir < 0 ? -r - sideSpan * 1.25 : r + sideSpan * 0.25;
        barRow(ctx, s, {
          from,
          to: from + sideSpan,
          baseline: r * 0.75,
          maxH,
          dir: -1,
          count: 12,
          width: sideSpan / 22,
          gap: sideSpan / 34,
          glow: s.glow,
          radius: 2,
        });
      }
      speakerCone(ctx, s, 0, 0, r, { rings: 4, screws: 6, pulse: pump * 1.2 });
      break;
    }

    /* --- one huge sub driver, bass shockwaves rolling off it --- */
    case "porthole": {
      const r = unit * 0.72;
      speakerCone(ctx, s, 0, 0, r, { rings: 5, screws: 12, pulse: s.bars.low * 0.2 + s.beat * 0.14 });
      for (let i = 0; i < 3; i++) {
        const t = ((s.elapsed * 0.6 + i / 3) % 1 + 1) % 1;
        ctx.beginPath();
        ctx.arc(0, 0, r * (1 + t * 0.75), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(s.accent, (1 - t) * (0.25 + s.bars.low * 0.5));
        ctx.lineWidth = Math.max(1, r * 0.03 * (1 - t));
        ctx.stroke();
      }
      break;
    }

    /* --- two neutral monitors with a precision meter above --- */
    case "monitor": {
      const r = unit * 0.3;
      const gap = r * 2.5;
      barRow(ctx, s, {
        from: -gap * 0.85,
        to: gap * 0.85,
        baseline: -r * 1.7,
        maxH: unit * 0.28,
        dir: -1,
        count: 30,
        width: Math.max(2, gap / 44),
        gap: Math.max(2, gap / 66),
        glow: s.glow * 0.7,
        radius: 1,
      });
      speakerCone(ctx, s, -gap / 2, 0, r, { rings: 2, screws: 4, pulse: pump * 0.7, face: "#ffffff" });
      speakerCone(ctx, s, gap / 2, 0, r, { rings: 2, screws: 4, pulse: pump * 0.7, face: "#ffffff" });
      break;
    }

    /* --- vintage driver with two VU meters breathing either side --- */
    case "retro": {
      const r = unit * 0.42;
      speakerCone(ctx, s, 0, 0, r, { rings: 5, screws: 10, pulse: pump * 0.8 });
      for (const dir of [-1, 1]) {
        const bw = unit * 0.3;
        const bh = unit * 0.2;
        const bx = dir * (r * 1.5) - (dir < 0 ? bw : 0);
        const by = -bh / 2;
        const level = dir < 0 ? s.bars.mid : s.bars.high;
        ctx.strokeStyle = rgba(s.accent, 0.6);
        ctx.lineWidth = Math.max(1, r * 0.02);
        roundRectPath(ctx, bx, by, bw, bh, bh * 0.28);
        ctx.stroke();
        // needle swings with the level
        const a = (-Math.PI / 2.4) + Math.min(1.2, level * 1.5) * (Math.PI / 1.5);
        const cx = bx + bw / 2;
        const cy = by + bh * 0.92;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.sin(a) * bh * 0.7, cy - Math.cos(a) * bh * 0.7);
        ctx.strokeStyle = rgba(s.primary, 0.95);
        ctx.lineWidth = Math.max(1.2, bh * 0.05);
        if (s.glow > 0.05) {
          ctx.shadowColor = s.primary;
          ctx.shadowBlur = 12 * s.glow;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        // ticks
        for (let i = 0; i <= 4; i++) {
          const ta = (-Math.PI / 2.4) + (i / 4) * (Math.PI / 1.5);
          ctx.beginPath();
          ctx.moveTo(cx + Math.sin(ta) * bh * 0.55, cy - Math.cos(ta) * bh * 0.55);
          ctx.lineTo(cx + Math.sin(ta) * bh * 0.72, cy - Math.cos(ta) * bh * 0.72);
          ctx.strokeStyle = rgba(s.accent, 0.45);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      break;
    }

    /* --- stacked tweeter over woofer on a wide bar array --- */
    case "stack": {
      const rTop = unit * 0.24;
      const rLow = unit * 0.5;
      const topY = -rLow * 0.85 - rTop * 0.9;
      speakerCone(ctx, s, 0, topY, rTop, { rings: 2, screws: 4, pulse: s.beat * 0.18, face: "#ffffff" });
      speakerCone(ctx, s, 0, rLow * 0.35, rLow, { rings: 4, screws: 10, pulse: pump * 1.15 });
      const span = unit * 1.85;
      barRow(ctx, s, {
        from: -span / 2,
        to: span / 2,
        baseline: rLow * 0.35 + rLow * 1.15,
        maxH: unit * 0.5,
        dir: -1,
        count: 40,
        width: Math.max(2.5, span / 56),
        gap: Math.max(2, span / 88),
        glow: s.glow,
        radius: 2,
      });
      break;
    }
  }
}

/* ------------------------------------------------------------------ *
 * 2. SPECTRUM BARS
 * ------------------------------------------------------------------ */

function drawSpectrumFamily(s: PixabayScene, variant: string) {
  const { ctx, width, h } = s;
  const span = width;
  // the rack is the subject of the shot: it gets better than half the band's
  // headroom (the Pixabay bar clips fill a good third of the frame)
  const maxH = h * 0.58 * Math.max(0.6, Math.min(1.6, s.reactive));

  switch (variant) {
    /* --- solid bars with peak caps --- */
    case "classic": {
      const count = 44;
      barRow(ctx, s, {
        from: -span / 2,
        to: span / 2,
        baseline: 0,
        maxH,
        dir: -1,
        count,
        width: Math.max(3, (span / count) * 0.62),
        gap: Math.max(2, (span / count) * 0.2),
        glow: s.glow,
        radius: 3,
      });
      // peak caps ride above each bar
      const slot = span / count;
      for (let i = 0; i < count; i++) {
        const pk = Math.min(1, s.bars.peaks[i % s.bars.peaks.length] || 0);
        const cw = Math.max(3, slot * 0.5);
        const y = -Math.pow(pk, 0.86) * maxH - Math.max(4, h * 0.008);
        ctx.fillStyle = rgba(s.accent, 0.9);
        roundRectPath(ctx, -span / 2 + i * slot + (slot - cw) / 2, y, cw, Math.max(2.5, h * 0.006), 2);
        ctx.fill();
      }
      break;
    }

    /* --- hair-thin needles with heavy bloom --- */
    case "needles": {
      const count = s.compact ? 64 : 110;
      const slot = span / count;
      for (let i = 0; i < count; i++) {
        const v = band(s, i, count);
        const bh = Math.max(2, Math.pow(v, 0.92) * maxH * 1.15);
        const x = -span / 2 + i * slot + slot * 0.5;
        const g = ctx.createLinearGradient(0, 0, 0, -bh);
        g.addColorStop(0, rgba(s.secondary, 0.85));
        g.addColorStop(0.5, rgba(s.primary, 0.95));
        g.addColorStop(1, rgba(s.accent, 1));
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1, slot * 0.34);
        if (s.glow > 0.05) {
          ctx.shadowColor = s.primary;
          ctx.shadowBlur = (8 + v * 26) * s.glow;
        }
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, -bh);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      break;
    }

    /* --- grows both ways from the centre line --- */
    case "diamond": {
      const count = 52;
      const half = maxH * 0.62;
      for (const dir of [-1, 1] as const) {
        barRow(ctx, s, {
          from: -span / 2,
          to: span / 2,
          baseline: 0,
          maxH: half,
          dir,
          count,
          width: Math.max(3, (span / count) * 0.58),
          gap: Math.max(2, (span / count) * 0.22),
          glow: s.glow,
          radius: 2,
        });
      }
      // the centre line the diamond opens around
      const line = ctx.createLinearGradient(-span / 2, 0, span / 2, 0);
      line.addColorStop(0, rgba(s.primary, 0));
      line.addColorStop(0.5, rgba(s.accent, 0.75));
      line.addColorStop(1, rgba(s.primary, 0));
      ctx.fillStyle = line;
      ctx.fillRect(-span / 2, -Math.max(1, h * 0.0016), span, Math.max(2, h * 0.0032));
      break;
    }

    /* --- chunky LED blocks --- */
    case "blocks": {
      const count = 34;
      const seg = 16;
      const slot = span / count;
      const bw = Math.max(4, slot * 0.66);
      const segH = maxH / seg;
      for (let i = 0; i < count; i++) {
        const v = band(s, i, count);
        const lit = Math.round(Math.min(seg, v * seg));
        for (let k = 0; k < seg; k++) {
          const on = k < lit;
          const t = k / seg;
          const y = -segH * (k + 1);
          ctx.fillStyle = on
            ? rgba(mixColors(s.primary, s.accent, t), 0.95)
            : rgba(s.secondary, 0.16);
          if (on && s.glow > 0.05) {
            ctx.shadowColor = s.primary;
            ctx.shadowBlur = 10 * s.glow * (0.5 + t);
          }
          roundRectPath(ctx, -span / 2 + i * slot + (slot - bw) / 2, y, bw, segH * 0.78, 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      break;
    }

    /* --- dots that rain back down after each peak --- */
    case "dots": {
      const count = 56;
      const slot = span / count;
      const dot = Math.max(2, slot * 0.3);
      for (let i = 0; i < count; i++) {
        const v = band(s, i, count);
        const pk = Math.min(1, s.bars.peaks[i % s.bars.peaks.length] || 0);
        const top = Math.pow(v, 0.9) * maxH;
        const peakY = Math.pow(pk, 0.9) * maxH;
        const x = -span / 2 + i * slot + slot * 0.5;
        const steps = 26;
        for (let k = 0; k < steps; k++) {
          const y = -(k / steps) * maxH;
          const lit = -y <= top;
          const falling = !lit && -y <= peakY;
          if (!lit && !falling) continue;
          const alpha = lit ? 0.95 : Math.max(0, 0.5 * (1 - (-y - top) / Math.max(1, peakY - top)));
          ctx.fillStyle = rgba(lit ? mixColors(s.primary, s.accent, k / steps) : s.secondary, alpha);
          if (lit && s.glow > 0.05) {
            ctx.shadowColor = s.primary;
            ctx.shadowBlur = 8 * s.glow;
          }
          ctx.beginPath();
          ctx.arc(x, y, dot * (lit ? 1 : 0.75), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      break;
    }

    /* --- retro receiver: dial, ticks and a snapping needle --- */
    case "tuner": {
      const dialH = h * 0.075;
      const dialY = -dialH * 1.45;
      // dial strip
      ctx.fillStyle = rgba(s.secondary, 0.22);
      roundRectPath(ctx, -span / 2, dialY, span, dialH, dialH * 0.18);
      ctx.fill();
      ctx.strokeStyle = rgba(s.accent, 0.4);
      ctx.lineWidth = Math.max(1, h * 0.0016);
      roundRectPath(ctx, -span / 2, dialY, span, dialH, dialH * 0.18);
      ctx.stroke();
      // ticks
      const ticks = 44;
      for (let i = 0; i <= ticks; i++) {
        const x = -span / 2 + (i / ticks) * span;
        const tall = i % 4 === 0;
        ctx.beginPath();
        ctx.moveTo(x, dialY + dialH * (tall ? 0.12 : 0.4));
        ctx.lineTo(x, dialY + dialH * 0.88);
        ctx.strokeStyle = rgba(s.accent, tall ? 0.55 : 0.28);
        ctx.lineWidth = tall ? Math.max(1, h * 0.0022) : 1;
        ctx.stroke();
      }
      // needle snaps to the loudest band
      let loudest = 0;
      let loudestV = -1;
      for (let i = 0; i < ticks; i++) {
        const v = band(s, i, ticks);
        if (v > loudestV) {
          loudestV = v;
          loudest = i;
        }
      }
      const nx = -span / 2 + (loudest / ticks) * span;
      ctx.beginPath();
      ctx.moveTo(nx, dialY - dialH * 0.25);
      ctx.lineTo(nx, dialY + dialH * 1.05);
      ctx.strokeStyle = rgba(s.primary, 0.95);
      ctx.lineWidth = Math.max(1.6, h * 0.004);
      if (s.glow > 0.05) {
        ctx.shadowColor = s.primary;
        ctx.shadowBlur = 14 * s.glow;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      // bars under the dial
      barRow(ctx, s, {
        from: -span / 2,
        to: span / 2,
        baseline: 0,
        maxH: maxH * 0.55,
        dir: -1,
        count: 40,
        width: Math.max(3, (span / 40) * 0.6),
        gap: Math.max(2, (span / 40) * 0.24),
        glow: s.glow * 0.8,
        radius: 2,
      });
      break;
    }
  }
}

/* ------------------------------------------------------------------ *
 * 3. FLOWING WAVES
 * ------------------------------------------------------------------ */

/** A wave sampled from the spectrum, smoothed with a slow swell so it flows. */
function wavePoints(
  s: PixabayScene,
  count: number,
  span: number,
  amp: number,
  phase: number,
  opts: { mirror?: number; flatten?: number } = {}
) {
  const pts: { x: number; y: number }[] = [];
  const mirror = opts.mirror ?? 1;
  const flatten = opts.flatten ?? 1;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = -span / 2 + t * span;
    // a floor under the band level so the ribbons always show their shape
    const b = Math.max(0.16, band(s, Math.floor(t * s.bars.values.length), count));
    const swell = 0.6 + 0.4 * Math.sin(t * Math.PI * 2 + phase);
    const y =
      -Math.pow(b, 0.9) * amp * mirror * (0.55 + 0.45 * swell) * flatten -
      amp * 0.16 * Math.sin(t * Math.PI * 3 + s.elapsed * 1.5 + phase) * flatten;
    pts.push({ x, y });
  }
  return pts;
}

function strokeWave(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  opts: {
    colour: string | CanvasGradient;
    width: number;
    glow: number;
    closed?: boolean;
    baseline?: number;
    fill?: string | CanvasGradient;
    glowColour?: string;
    offsetY?: number;
  }
) {
  const dy = opts.offsetY || 0;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y + dy) : ctx.lineTo(p.x, p.y + dy)));
  if (opts.closed) {
    ctx.lineTo(pts[pts.length - 1].x, opts.baseline ?? 0);
    ctx.lineTo(pts[0].x, opts.baseline ?? 0);
    ctx.closePath();
    if (opts.fill) {
      ctx.fillStyle = opts.fill;
      ctx.fill();
    }
  }
  if (opts.width > 0) {
    ctx.strokeStyle = opts.colour;
    ctx.lineWidth = opts.width;
    if (opts.glow > 0.05) {
      ctx.shadowColor = typeof opts.colour === "string" ? opts.colour : opts.glowColour ?? "#ffffff";
      ctx.shadowBlur = 18 * opts.glow;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function drawFlowFamily(s: PixabayScene, variant: string) {
  const { ctx, width, h } = s;
  const span = width;
  const amp = h * 0.5 * Math.max(0.6, Math.min(1.6, s.reactive));

  switch (variant) {
    /* --- three ribbon bands folding through each other --- */
    case "aurora": {
      const layers = [
        { phase: 0, colour: s.secondary, alpha: 0.32, width: amp * 0.3, y: -amp * 0.5 },
        { phase: 2.1, colour: s.primary, alpha: 0.36, width: amp * 0.26, y: -amp * 0.34 },
        { phase: 4.2, colour: s.accent, alpha: 0.28, width: amp * 0.2, y: -amp * 0.2 },
      ];
      for (const layer of layers) {
        const pts = wavePoints(s, 90, span, amp * 0.62, layer.phase);
        const g = ctx.createLinearGradient(0, layer.y - layer.width, 0, layer.y + layer.width * 2.4);
        g.addColorStop(0, rgba(layer.colour, layer.alpha * 0.15));
        g.addColorStop(0.5, rgba(layer.colour, layer.alpha));
        g.addColorStop(1, rgba(s.primary, 0));
        strokeWave(ctx, pts, {
          colour: g,
          width: layer.width,
          glow: s.glow,
          closed: true,
          fill: g,
          offsetY: layer.y,
        });
        strokeWave(ctx, pts, { colour: rgba(layer.colour, 0.85), width: Math.max(1.4, layer.width * 0.12), glow: s.glow, offsetY: layer.y });
      }
      break;
    }

    /* --- one silky line with a soft mirrored ghost --- */
    case "silk": {
      const pts = wavePoints(s, 110, span, amp * 0.7, 0.4);
      const g = ctx.createLinearGradient(0, -amp * 1.4, 0, amp * 0.4);
      g.addColorStop(0, rgba(s.primary, 0));
      g.addColorStop(0.45, rgba(s.primary, 0.34));
      g.addColorStop(1, rgba(s.secondary, 0.05));
      strokeWave(ctx, pts, { colour: g, width: amp * 0.5, glow: 0, closed: true, fill: g });
      // mirrored ghost underneath
      strokeWave(ctx, pts, {
        colour: rgba(s.secondary, 0.35),
        width: Math.max(1, amp * 0.05),
        glow: s.glow * 0.7,
        offsetY: amp * 0.5,
      });
      strokeWave(ctx, pts, { colour: rgba(s.accent, 0.95), width: Math.max(2, amp * 0.075), glow: s.glow });
      break;
    }

    /* --- crisp scope line with a shockwave ring on the beat --- */
    case "pulse": {
      const pts = wavePoints(s, 128, span, amp * 0.62, 0);
      if (s.beat > 0.2) {
        const t = (s.elapsed * 0.8) % 1;
        ctx.beginPath();
        ctx.ellipse(0, -amp * 0.2, span * 0.5 * t, amp * 0.5 * t, 0, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(s.accent, 0.5 * s.beat * (1 - t));
        ctx.lineWidth = Math.max(1, amp * 0.03 * (1 - t));
        ctx.stroke();
      }
      strokeWave(ctx, pts, { colour: rgba(s.secondary, 0.45), width: Math.max(2, amp * 0.1), glow: s.glow * 0.6 });
      strokeWave(ctx, pts, { colour: rgba(s.accent, 0.98), width: Math.max(1.6, amp * 0.045), glow: s.glow });
      break;
    }

    /* --- two strands twisting through each other --- */
    case "helix": {
      const a = wavePoints(s, 110, span, amp * 0.6, 0);
      const b = wavePoints(s, 110, span, amp * 0.6, Math.PI, { mirror: -1 });
      strokeWave(ctx, b, { colour: rgba(s.secondary, 0.9), width: Math.max(1.6, amp * 0.06), glow: s.glow });
      strokeWave(ctx, a, { colour: rgba(s.primary, 0.95), width: Math.max(1.6, amp * 0.06), glow: s.glow });
      // cross-links where the strands pass each other
      ctx.beginPath();
      for (let i = 0; i < a.length; i += 4) {
        ctx.moveTo(a[i].x, a[i].y);
        ctx.lineTo(b[i].x, b[i].y);
      }
      ctx.strokeStyle = rgba(s.accent, 0.22);
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }

    /* --- filled hills, one per stretch of the spectrum --- */
    case "hills": {
      const layers = [
        { span: 0.55, colour: s.secondary, alpha: 0.5, amp: 0.5, phase: 1.4 },
        { span: 0.8, colour: s.primary, alpha: 0.42, amp: 0.66, phase: 0.7 },
        { span: 1, colour: s.accent, alpha: 0.3, amp: 0.82, phase: 0 },
      ];
      for (const layer of layers) {
        const pts = wavePoints(s, 72, span, amp * layer.amp, layer.phase, { flatten: layer.span });
        const g = ctx.createLinearGradient(0, -amp, 0, amp * 0.2);
        g.addColorStop(0, rgba(layer.colour, layer.alpha * 0.1));
        g.addColorStop(0.6, rgba(layer.colour, layer.alpha));
        g.addColorStop(1, rgba(layer.colour, 0.02));
        strokeWave(ctx, pts, { colour: g, width: 2, glow: s.glow * 0.5, closed: true, fill: g });
      }
      break;
    }

    /* --- a clean line trailing sparks --- */
    case "spark": {
      const pts = wavePoints(s, 120, span, amp * 0.55, 0);
      strokeWave(ctx, pts, { colour: rgba(s.accent, 0.95), width: Math.max(1.6, amp * 0.05), glow: s.glow });
      const sparks = s.compact ? 90 : 220;
      for (let i = 0; i < sparks; i++) {
        const t = hash01(i * 3 + 1);
        const idx = Math.floor(t * pts.length) % pts.length;
        const p = pts[idx];
        const life = ((s.elapsed * (0.5 + hash01(i * 3 + 2) * 0.7) + hash01(i * 3 + 3)) % 1 + 1) % 1;
        const fly = life * amp * 0.55;
        const x = p.x + (hash01(i * 3 + 4) - 0.5) * span * 0.02 * fly * 0.1;
        const y = p.y - fly * (0.6 + hash01(i * 3 + 5) * 0.8);
        const a = (1 - life) * 0.9;
        ctx.fillStyle = rgba(mixColors(s.primary, s.accent, life), a);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.7, (1 - life) * amp * 0.02), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
}

/* ------------------------------------------------------------------ *
 * 4. 3D GRIDS   (origin = centre of the frame)
 * ------------------------------------------------------------------ */

function drawGridFamily(s: PixabayScene, variant: string) {
  const { ctx, w, h } = s;
  const energy = Math.max(0, Math.min(1.4, s.bars.energy));

  switch (variant) {
    /* --- isometric cube field --- */
    case "cube": {
      const cols = s.compact ? 14 : 20;
      const rows = 9;
      const cellW = w / (cols * 1.05);
      const cellH = cellW * 0.5;
      // the field is centred on the anchor (rows run back and down from it) so
      // the cubes fill the frame whether it is dragged to the middle or low
      const originY = -h * 0.16;
      for (let r = rows - 1; r >= 0; r--) {
        for (let c = 0; c < cols; c++) {
          const v = band(s, c + r * 2, cols + rows);
          const depth = 0.35 + (1 - r / rows) * 0.65;
          const cx = -w / 2 + (c - (cols - 1) / 2) * cellW + (r % 2 ? cellW * 0.5 : 0);
          const cy = originY + r * cellH * 0.92 + Math.sin(s.elapsed * 1.4 - r * 0.5) * cellH * 0.2;
          const cubeH = Math.max(2, Math.pow(v, 0.85) * h * 0.3 * depth);
          const hw = cellW * 0.42;
          const hh = cellH * 0.42;
          // left face
          ctx.beginPath();
          ctx.moveTo(cx - hw, cy);
          ctx.lineTo(cx, cy + hh);
          ctx.lineTo(cx, cy + hh - cubeH);
          ctx.lineTo(cx - hw, cy - cubeH);
          ctx.closePath();
          ctx.fillStyle = rgba(s.secondary, 0.55 * depth);
          ctx.fill();
          // right face
          ctx.beginPath();
          ctx.moveTo(cx + hw, cy);
          ctx.lineTo(cx, cy + hh);
          ctx.lineTo(cx, cy + hh - cubeH);
          ctx.lineTo(cx + hw, cy - cubeH);
          ctx.closePath();
          ctx.fillStyle = rgba(mixColors(s.primary, s.secondary, 0.5), 0.6 * depth);
          ctx.fill();
          // lit top
          ctx.beginPath();
          ctx.moveTo(cx, cy - cubeH - hh);
          ctx.lineTo(cx + hw, cy - cubeH);
          ctx.lineTo(cx, cy - cubeH + hh);
          ctx.lineTo(cx - hw, cy - cubeH);
          ctx.closePath();
          ctx.fillStyle = rgba(mixColors(s.primary, s.accent, Math.min(1, v)), 0.9 * depth);
          if (s.glow > 0.05 && v > 0.4) {
            ctx.shadowColor = s.primary;
            ctx.shadowBlur = 12 * s.glow * v;
          }
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      break;
    }

    /* --- neon skyline, windows lit floor by floor --- */
    case "skyline": {
      const baseY = h * 0.22;
      const count = s.compact ? 22 : 34;
      const slot = w / count;
      for (let i = 0; i < count; i++) {
        const v = band(s, i, count);
        const bh = Math.max(h * 0.04, Math.pow(v, 0.82) * h * 0.5 * Math.max(0.7, s.reactive * 0.8));
        const bw = slot * (0.55 + hash01(i * 7 + 1) * 0.3);
        const x = -w / 2 + i * slot + (slot - bw) / 2;
        const top = baseY - bh;
        const body = ctx.createLinearGradient(0, top, 0, baseY);
        body.addColorStop(0, rgba(mixColors(s.secondary, s.primary, 0.6), 0.85));
        body.addColorStop(1, rgba(s.secondary, 0.55));
        ctx.fillStyle = body;
        ctx.fillRect(x, top, bw, bh);
        // edge lights
        ctx.strokeStyle = rgba(s.primary, 0.85);
        ctx.lineWidth = Math.max(1, w * 0.0011);
        if (s.glow > 0.05) {
          ctx.shadowColor = s.primary;
          ctx.shadowBlur = 12 * s.glow * (0.5 + v * 0.6);
        }
        ctx.strokeRect(x, top, bw, bh);
        ctx.shadowBlur = 0;
        // windows: rows light up with the level
        const rows = Math.max(3, Math.floor(bh / (h * 0.032)));
        const colsW = Math.max(2, Math.floor(bw / (slot * 0.22)));
        for (let rr = 0; rr < rows; rr++) {
          const lit = rr / rows < v;
          for (let cc = 0; cc < colsW; cc++) {
            const on = lit && hash01(i * 31 + rr * 7 + cc) > 0.35;
            if (!on) continue;
            ctx.fillStyle = rgba(
              mixColors(s.accent, s.primary, hash01(i * 13 + rr * 3 + cc)),
              0.75 + 0.25 * hash01(i + rr * 5 + cc * 9)
            );
            ctx.fillRect(
              x + bw * 0.12 + cc * (bw * 0.76) / colsW,
              top + h * 0.012 + rr * (bh / rows) * 0.9,
              Math.max(1, (bw * 0.6) / colsW),
              Math.max(1, (bh / rows) * 0.4)
            );
          }
        }
      }
      // ground haze line
      const line = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      line.addColorStop(0, rgba(s.primary, 0));
      line.addColorStop(0.5, rgba(s.accent, 0.5));
      line.addColorStop(1, rgba(s.primary, 0));
      ctx.fillStyle = line;
      ctx.fillRect(-w / 2, baseY, w, Math.max(1.5, h * 0.003));
      softGlow(ctx, 0, baseY, w * 0.5, rgba(s.primary, 0.1 + energy * 0.08), rgba(s.secondary, 0.05), 1);
      break;
    }

    /* --- tunnel of wireframe rings rushing forward --- */
    case "tunnel": {
      const rings = 16;
      const speed = 0.22 + energy * 0.42 + s.beat * 0.22;
      const spin = s.elapsed * 0.06;
      // four rails running into the vanishing point turn the ring stack into a
      // corridor, which is what the Pixabay wire-tunnel clips actually read as
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const grad = ctx.createLinearGradient(sx * w * 0.5, sy * h * 0.5, 0, 0);
        grad.addColorStop(0, rgba(s.secondary, 0.5));
        grad.addColorStop(0.7, rgba(s.primary, 0.32));
        grad.addColorStop(1, rgba(s.accent, 0.6));
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(1, h * 0.0032);
        ctx.beginPath();
        ctx.moveTo(sx * w * 0.52, sy * h * 0.54);
        ctx.lineTo(sx * w * 0.03, sy * h * 0.04);
        ctx.stroke();
      }
      for (let i = rings; i >= 0; i--) {
        const t = ((i / rings) + (s.elapsed * speed) % 1) % 1;
        const scale = Math.pow(t, 1.7);
        const rw = w * 0.56 * scale + w * 0.03;
        const rh = h * 0.52 * scale + h * 0.03;
        const alpha = Math.pow(t, 0.9) * 0.95;
        const v = band(s, i, rings);
        ctx.save();
        ctx.rotate(spin + i * 0.012);
        ctx.strokeStyle = rgba(mixColors(s.secondary, s.accent, t), alpha * (0.5 + v * 0.5));
        ctx.lineWidth = Math.max(1.2, (1 - t) * h * 0.005 + 1.4);
        if (s.glow > 0.05 && t > 0.4) {
          ctx.shadowColor = s.primary;
          ctx.shadowBlur = 14 * s.glow * t;
        }
        roundRectPath(ctx, -rw / 2, -rh / 2, rw, rh, Math.min(rw, rh) * 0.16);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
      }
      softGlow(ctx, 0, 0, Math.min(w, h) * (0.1 + s.bars.low * 0.08 + s.beat * 0.04), rgba(s.accent, 0.5), rgba(s.primary, 0.25), 1);
      break;
    }

    /* --- wire mesh seen from above, rippling outward --- */
    case "ripple": {
      const cols = s.compact ? 14 : 22;
      const rows = s.compact ? 9 : 14;
      const cellW = w / cols;
      const cellH = h / rows;
      const flatten = 0.42;
      for (let r = 0; r <= rows; r++) {
        ctx.beginPath();
        for (let c = 0; c <= cols; c++) {
          const x = -w / 2 + c * cellW;
          const yBase = (-h / 2 + r * cellH) * flatten;
          const d = Math.hypot(x, yBase);
          const ripple = Math.sin(d * 0.011 - s.elapsed * 3.2) * (0.5 + s.bars.low * 1.4) * h * 0.09;
          const v = band(s, c, cols);
          const y = yBase + ripple + Math.pow(v, 1.2) * h * 0.09;
          if (c === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(mixColors(s.primary, s.accent, (r % 2 ? 1 : 0.3) * 0.5), 0.42 + (r % 2 ? 0.3 : 0.12));
        ctx.lineWidth = Math.max(1, h * 0.0024);
        if (s.glow > 0.05) {
          ctx.shadowColor = s.primary;
          ctx.shadowBlur = 10 * s.glow;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      for (let c = 0; c <= cols; c++) {
        ctx.beginPath();
        for (let r = 0; r <= rows; r++) {
          const x = -w / 2 + c * cellW;
          const yBase = (-h / 2 + r * cellH) * flatten;
          const d = Math.hypot(x, yBase);
          const ripple = Math.sin(d * 0.011 - s.elapsed * 3.2) * (0.5 + s.bars.low * 1.4) * h * 0.09;
          const v = band(s, c, cols);
          const y = yBase + ripple + Math.pow(v, 1.2) * h * 0.09;
          if (r === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(s.secondary, 0.36);
        ctx.lineWidth = Math.max(1, h * 0.002);
        ctx.stroke();
      }
      softGlow(ctx, 0, 0, Math.min(w, h) * 0.35, rgba(s.accent, 0.22 + s.beat * 0.16), rgba(s.primary, 0.1), 1);
      break;
    }

    /* --- isometric bars with lit tops --- */
    case "iso": {
      const count = s.compact ? 18 : 26;
      const slot = w / count;
      const baseY = h * 0.22;
      const depth = slot * 0.32;
      for (let i = 0; i < count; i++) {
        const v = band(s, i, count);
        const bh = Math.max(3, Math.pow(v, 0.85) * h * 0.46 * Math.max(0.7, s.reactive * 0.8));
        const cx = -w / 2 + i * slot + slot * 0.5;
        const hw = slot * 0.3;
        const hh = depth;
        const topY = baseY - bh;
        // front face
        ctx.beginPath();
        ctx.moveTo(cx - hw, topY);
        ctx.lineTo(cx, topY + hh * 0.55);
        ctx.lineTo(cx + hw, topY);
        ctx.lineTo(cx + hw, baseY + hh * 0.55);
        ctx.lineTo(cx, baseY + hh * 1.1);
        ctx.lineTo(cx - hw, baseY + hh * 0.55);
        ctx.closePath();
        const face = ctx.createLinearGradient(cx, topY, cx, baseY);
        face.addColorStop(0, rgba(s.primary, 0.9));
        face.addColorStop(1, rgba(s.secondary, 0.75));
        ctx.fillStyle = face;
        ctx.fill();
        // lit top diamond
        ctx.beginPath();
        ctx.moveTo(cx - hw, topY);
        ctx.lineTo(cx, topY + hh * 0.55);
        ctx.lineTo(cx + hw, topY);
        ctx.lineTo(cx, topY - hh * 0.55);
        ctx.closePath();
        ctx.fillStyle = rgba(mixColors(s.primary, s.accent, Math.min(1, v * 0.9)), 0.95);
        if (s.glow > 0.05) {
          ctx.shadowColor = s.primary;
          ctx.shadowBlur = 14 * s.glow * v;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      break;
    }

    /* --- grid of glass cells with a scanner sweep --- */
    case "cells": {
      const cols = s.compact ? 18 : 28;
      const rows = s.compact ? 10 : 15;
      const cellW = w / cols;
      const cellH = h / rows;
      const sweep = ((s.elapsed * 0.35) % 1) * 1.4 - 0.2;
      for (let r = 0; r < rows; r++) {
        // perspective: cells grow as they come forward, so the wall reads as a
        // surface rushing past rather than wallpaper
        const depth = 1 + (r / rows) * 1.35;
        for (let c = 0; c < cols; c++) {
          const v = band(s, c + r, cols + rows);
          const cw = cellW * 0.66 * depth;
          const ch = cellH * 0.66 * depth;
          const x = -w / 2 + c * cellW + cellW * 0.5 - cw / 2;
          const y = -h / 2 + r * cellH + cellH * 0.5 - ch / 2;
          const near = Math.max(0, 1 - Math.abs(c / cols - sweep) * 3.2);
          const lit = Math.max(near * 0.9, v);
          ctx.fillStyle = rgba(mixColors(s.secondary, s.primary, lit), 0.08 + lit * 0.5);
          if (s.glow > 0.05 && lit > 0.6) {
            ctx.shadowColor = s.primary;
            ctx.shadowBlur = 14 * s.glow * lit;
          }
          roundRectPath(ctx, x, y, cw, ch, Math.min(cw, ch) * 0.22);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = rgba(s.accent, 0.12 + lit * 0.3);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      break;
    }
  }
}

/* ------------------------------------------------------------------ *
 * 5. CIRCULAR   (origin = centre of the ring)
 * ------------------------------------------------------------------ */

function drawCircularFamily(s: PixabayScene, variant: string) {
  const { ctx, width } = s;
  const R = Math.max(24, width * 0.34);
  const maxLen = R * 1.1 * Math.max(0.6, Math.min(1.7, s.reactive));

  switch (variant) {
    /* --- spikes whose hue rotates as the wheel turns --- */
    case "wheel": {
      const spokes = s.compact ? 72 : 128;
      const spin = s.elapsed * 0.32;
      softGlow(ctx, 0, 0, R * 2.4, rgba(s.accent, 0.16 + s.bars.low * 0.16), rgba(s.primary, 0.08), 1);
      for (let i = 0; i < spokes; i++) {
        const t = i / spokes;
        const v = band(s, i, spokes);
        const a = t * Math.PI * 2 + spin;
        const len = R * 0.16 + Math.pow(v, 0.88) * maxLen;
        const hue = mixColors(s.primary, s.accent, (t + s.elapsed * 0.12) % 1);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
        ctx.lineTo(Math.cos(a) * (R + len), Math.sin(a) * (R + len));
        ctx.strokeStyle = hue;
        ctx.lineWidth = Math.max(1.2, (Math.PI * 2 * R) / spokes * 0.5);
        if (s.glow > 0.05) {
          ctx.shadowColor = hue;
          ctx.shadowBlur = (8 + v * 22) * s.glow;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(s.accent, 0.5);
      ctx.lineWidth = Math.max(1.2, R * 0.03);
      ctx.stroke();
      break;
    }

    /* --- long thin rays from a white-hot core --- */
    case "sunburst": {
      const rays = s.compact ? 64 : 110;
      const spin = s.elapsed * 0.16;
      softGlow(ctx, 0, 0, R * 2.6, rgba(s.accent, 0.24 + s.bars.low * 0.24), rgba(s.primary, 0.12), 1);
      for (let i = 0; i < rays; i++) {
        const t = i / rays;
        const v = band(s, i, rays);
        const a = t * Math.PI * 2 + spin;
        const inner = R * 0.22;
        const len = inner + Math.pow(v, 0.85) * maxLen * 1.25 + R * 0.1;
        const g = ctx.createLinearGradient(
          Math.cos(a) * inner,
          Math.sin(a) * inner,
          Math.cos(a) * len,
          Math.sin(a) * len
        );
        g.addColorStop(0, rgba(s.accent, 0.9));
        g.addColorStop(0.5, rgba(s.primary, 0.85));
        g.addColorStop(1, rgba(s.secondary, 0.15));
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1, R * 0.012);
        if (s.glow > 0.05) {
          ctx.shadowColor = s.primary;
          ctx.shadowBlur = (10 + v * 24) * s.glow;
        }
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      const core = ctx.createRadialGradient(0, 0, 1, 0, 0, R * 0.34);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.5, rgba(s.accent, 0.9));
      core.addColorStop(1, rgba(s.primary, 0));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.34, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    /* --- chunky radial wedges --- */
    case "bars": {
      const wedges = s.compact ? 32 : 44;
      const spin = s.elapsed * 0.08;
      const inner = R * 0.9;
      for (let i = 0; i < wedges; i++) {
        const v = band(s, i, wedges);
        const a0 = (i / wedges) * Math.PI * 2 + spin;
        const a1 = ((i + 0.72) / wedges) * Math.PI * 2 + spin;
        const outer = inner + R * 0.12 + Math.pow(v, 0.85) * maxLen * 1.05;
        ctx.beginPath();
        ctx.arc(0, 0, inner, a0, a1);
        ctx.arc(0, 0, outer, a1, a0, true);
        ctx.closePath();
        const g = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);
        g.addColorStop(0, rgba(s.secondary, 0.85));
        g.addColorStop(0.6, rgba(s.primary, 0.9));
        g.addColorStop(1, rgba(s.accent, 0.95));
        ctx.fillStyle = g;
        if (s.glow > 0.05) {
          ctx.shadowColor = s.primary;
          ctx.shadowBlur = (8 + v * 18) * s.glow;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.arc(0, 0, inner * 0.96, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(s.accent, 0.35);
      ctx.lineWidth = Math.max(1, R * 0.02);
      ctx.stroke();
      break;
    }

    /* --- concentric rings breathing with the bass --- */
    case "halo": {
      const rings = 7;
      const low = s.bars.low;
      softGlow(ctx, 0, 0, R * 2.2, rgba(s.primary, 0.16 + low * 0.18), rgba(s.secondary, 0.08), 1);
      for (let i = rings; i >= 1; i--) {
        const t = i / rings;
        const pulse = Math.sin(s.elapsed * 1.6 - t * 3) * 0.04 * (1 + low * 2);
        const rr = R * t * (0.72 + low * 0.22) * (1 + pulse);
        const v = band(s, i * 3, rings * 3);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(4, rr), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(mixColors(s.primary, s.accent, 1 - t), 0.25 + v * 0.5);
        ctx.lineWidth = Math.max(1.2, R * 0.02 * (1.2 - t * 0.4));
        if (s.glow > 0.05) {
          ctx.shadowColor = s.primary;
          ctx.shadowBlur = (10 + v * 20) * s.glow;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      // beat shockwave
      if (s.beat > 0.2) {
        const t = (s.elapsed * 0.7) % 1;
        ctx.beginPath();
        ctx.arc(0, 0, R * (0.4 + t * 0.9), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(s.accent, 0.5 * s.beat * (1 - t));
        ctx.lineWidth = Math.max(1, R * 0.04 * (1 - t));
        ctx.stroke();
      }
      break;
    }

    /* --- orbiting dots, one per band --- */
    case "dots": {
      const dots = s.compact ? 40 : 64;
      const spin = s.elapsed * 0.4;
      softGlow(ctx, 0, 0, R * 1.9, rgba(s.secondary, 0.14 + s.bars.low * 0.14), rgba(s.primary, 0.07), 1);
      // the orbit track
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(s.primary, 0.18);
      ctx.lineWidth = Math.max(1, R * 0.012);
      ctx.stroke();
      for (let i = 0; i < dots; i++) {
        const v = band(s, i, dots);
        const a = (i / dots) * Math.PI * 2 + spin;
        const rr = R * (1 + v * 0.3);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        const size = Math.max(1.6, R * (0.03 + v * 0.085));
        const colour = mixColors(s.primary, s.accent, Math.min(1, v * 1.3));
        if (s.glow > 0.05) {
          ctx.shadowColor = colour;
          ctx.shadowBlur = (8 + v * 22) * s.glow;
        }
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      // a soft core so the middle is not empty
      softGlow(ctx, 0, 0, R * 0.5, rgba(s.accent, 0.4 + s.bars.low * 0.3), rgba(s.primary, 0.2), 1);
      break;
    }

    /* --- spiral arms winding outward --- */
    case "vortex": {
      const arms = 4;
      const spin = s.elapsed * (0.5 + s.bars.mid * 0.6);
      softGlow(ctx, 0, 0, R * 2.2, rgba(s.accent, 0.16 + s.bars.low * 0.2), rgba(s.secondary, 0.08), 1);
      for (let a = 0; a < arms; a++) {
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
          const t = i / 60;
          const ang = a * ((Math.PI * 2) / arms) + t * Math.PI * 2.1 + spin;
          const rr = R * (0.12 + t * 1.05);
          const v = band(s, Math.floor(t * s.bars.values.length), s.bars.values.length);
          const wobble = 1 + Math.sin(s.elapsed * 2 + t * 6) * 0.06 * (1 + s.bars.high);
          const x = Math.cos(ang) * rr * wobble;
          const y = Math.sin(ang) * rr * wobble;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          void v;
        }
        const g = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 1.2);
        g.addColorStop(0, rgba(s.accent, 0.9));
        g.addColorStop(0.55, rgba(s.primary, 0.65));
        g.addColorStop(1, rgba(s.secondary, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1.6, R * 0.05);
        if (s.glow > 0.05) {
          ctx.shadowColor = s.primary;
          ctx.shadowBlur = 18 * s.glow;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      const core = ctx.createRadialGradient(0, 0, 1, 0, 0, R * 0.3);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.6, rgba(s.accent, 0.8));
      core.addColorStop(1, rgba(s.primary, 0));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

export function drawPixabayStyle(type: string, s: PixabayScene) {
  const entry = STYLE_INDEX.get(type);
  if (!entry) return;
  const { family, style } = entry;
  switch (family.id) {
    case "bass":
      return drawBassFamily(s, style.variant);
    case "spectrum":
      return drawSpectrumFamily(s, style.variant);
    case "flow":
      return drawFlowFamily(s, style.variant);
    case "grid":
      return drawGridFamily(s, style.variant);
    case "circular":
      return drawCircularFamily(s, style.variant);
    default:
      return;
  }
}
