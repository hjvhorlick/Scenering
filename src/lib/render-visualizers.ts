/**
 * Modern audio & speech reactive visualisers.
 *
 * Shared by the video preview, the studio catalogue thumbnails (live animated
 * canvases) and the final render, so all three are pixel-for-pixel the same
 * drawing code. Bars and waves span the entire width of the frame by default,
 * every rack is lit by the real audio buses and every element is drawn on a
 * glass plate / floor reflection so the floating shadow reads as real depth.
 */
import type { TimelineInsert } from "../types";
import {
  AudioBus,
  AudioFrame,
  BarsResult,
  ReactionSource,
  EMPTY_FRAME,
  getBars,
  getWaveform,
  beatPulse,
  pickBus,
} from "./audio-reactive";
import { resolveVisualizerPalette } from "./visualizer-palettes";

/* ------------------------------------------------------------------ *
 * Geometry helpers shared with hit-testing / dragging
 * ------------------------------------------------------------------ */

/**
 * Full-frame "scenes": instead of a rack or a ring, these fill the picture with
 * a moving world (a wireframe landscape, a warp starfield, plasma blobs...). They
 * are drawn from the same spectrum data as everything else, so they react just as
 * hard, and because the whole scene is code it stays pin sharp in a 4K render.
 */
export const IMMERSIVE_VISUALIZER_TYPES = [
  "terrain_grid",
  "warp_starfield",
  "glow_pills",
  "particle_swarm",
  "lava_blobs",
  "jellyfish_mesh",
  "ring_of_fire",
] as const;

const IMMERSIVE_TYPES = new Set<string>(IMMERSIVE_VISUALIZER_TYPES);

/** Compact visualisers: circular/radial shapes and the small talking-dot cluster.
 *  They are never stretched across the frame and can be dragged anywhere. */
const ROUND_TYPES = new Set([
  "circular_wave",
  "voice_pulse",
  "energy_ring",
  "pulse_circle",
  "radial_pulse",
  "minimal_voice",
  "audio_orb",
  "orbit_disc",
]);

/** Centre visualisers: a ring / disc built around the middle of the frame.
 *  They can carry the user's own logo in the middle. */
export const CENTRE_VISUALIZER_TYPES = ["audio_orb", "orbit_disc", "circular_wave", "voice_pulse", "energy_ring", "pulse_circle"] as const;

const CENTRE_LOGO_TYPES = new Set<string>([
  "audio_orb",
  "orbit_disc",
  "circular_wave",
  "voice_pulse",
  "energy_ring",
  "pulse_circle",
]);

/** The two styles that are *built* around a centre: the logo is on by default */
const CENTRE_STAGE_TYPES = new Set<string>(["audio_orb", "orbit_disc"]);

/** Does this insert want the user's logo in its middle? */
export function wantsCentreLogo(item: TimelineInsert): boolean {
  if (!CENTRE_LOGO_TYPES.has(item.type)) return false;
  const choice = item.visualOptions?.centreLogo;
  if (choice === undefined) return CENTRE_STAGE_TYPES.has(item.type);
  return choice === true;
}

/** Types that stretch across the full frame width */
const LINEAR_TYPES = new Set([
  "waveform",
  "voice_wave",
  "neon_ribbon",
  "oscilloscope",
  "mirror_wave",
  "equalizer_bars",
  "spectrum",
  "speech_spectrum",
  "led_meter_wall",
  "dot_matrix_eq",
  "spectrum_bars",
]);

export function isRoundVisualizer(type: string): boolean {
  return ROUND_TYPES.has(type);
}

export function isLinearVisualizer(type: string): boolean {
  return LINEAR_TYPES.has(type);
}

/** Full width unless the user switched it off (round types are never full width) */
export function isVisualizerFullWidth(item: TimelineInsert): boolean {
  // Scenes always fill the frame: they are the picture, not an overlay on it.
  if (IMMERSIVE_TYPES.has(item.type)) return true;
  if (isRoundVisualizer(item.type)) return false;
  if (!isLinearVisualizer(item.type)) return false;
  return item.visualOptions?.fullWidth !== false;
}

/** Height of the visualiser body in px (used for the glass plate + floor glow) */
export function visualizerBodyHeight(item: TimelineInsert, canvasHeight: number): number {
  const size = item.size || 1;
  const type = item.type;
  // Every size is a fraction of the frame, so the same visualiser looks identical
  // in a 720p render and in a small studio thumbnail (just smaller).
  const ofFrame = (ratio: number) =>
    Math.max(canvasHeight * ratio * Math.max(0.32, size), canvasHeight * 0.055);
  if (CENTRE_STAGE_TYPES.has(type)) {
    // the orb and the disc are bigger than the small round badges: they are the
    // centrepiece of the shot
    return Math.max(canvasHeight * 0.34 * Math.max(0.45, Math.min(1.6, size)), 40);
  }
  if (ROUND_TYPES.has(type)) return Math.max(canvasHeight * 0.22 * Math.min(1.35, size), 34);
  // Scenes are pushed a little smaller than the frame so dragging them stays
  // usable; the drawing itself always uses the full frame.
  if (IMMERSIVE_TYPES.has(type)) return canvasHeight * 0.62 * Math.max(0.4, Math.min(1.6, size));
  if (type === "neon_ribbon") return ofFrame(0.17);
  if (type === "oscilloscope") return ofFrame(0.16);
  if (type === "waveform" || type === "voice_wave") return ofFrame(0.15);
  if (type === "dot_matrix_eq") return ofFrame(0.14);
  if (type === "led_meter_wall") return ofFrame(0.16);
  return ofFrame(0.2); // bar racks
}

/**
 * Real drawn footprint in pixels, independent of the item position. Hit-testing
 * uses this so grabbing a wall-to-wall rack works from anywhere along it.
 */
export function getVisualizerFootprint(
  item: TimelineInsert,
  canvasWidth: number,
  canvasHeight: number
): { w: number; h: number } {
  const body = visualizerBodyHeight(item, canvasHeight);
  if (isRoundVisualizer(item.type)) {
    const size = item.size || 1;
    // the talking-dot cluster is far smaller than the circular analysers, and
    // the centre stages are the largest of all
    const d = CENTRE_STAGE_TYPES.has(item.type)
      ? Math.max(200, canvasHeight * 0.92 * Math.max(0.45, Math.min(1.6, size)))
      : item.type === "minimal_voice"
      ? Math.max(120, 190 * size)
      : Math.max(150, 300 * size);
    return { w: d, h: d };
  }
  const full = isVisualizerFullWidth(item);
  const w = full ? canvasWidth : Math.max(220, canvasWidth * 0.5) * (item.size || 1);
  // wave/ribbon traces also spill a little above and below the plate
  const pad = body * 0.35;
  return { w, h: body + pad };
}

/** 720p is the reference frame: every pixel dimension scales from it, so the
 *  studio thumbnails are true miniatures of what lands in the video. */
function frameScale(canvasHeight: number): number {
  return Math.max(0.28, Math.min(2.2, canvasHeight / 720));
}

/**
 * Keeps "runs through the entire video" visualisers pinned to the full length.
 * Called whenever the video gets longer or shorter so a rack added early stays
 * on screen from the first frame to the last. Returns the same array reference
 * when nothing changed, so React can skip the update.
 */
export function stretchFullVideoVisualisers(
  inserts: TimelineInsert[],
  totalDuration: number
): TimelineInsert[] {
  if (!inserts.length || !(totalDuration > 0)) return inserts;
  let changed = false;
  const next = inserts.map((ins) => {
    if (ins.category !== "audio_visualizers" && ins.category !== "speech_reactive") return ins;
    if (ins.visualOptions?.spanFullVideo !== true) return ins;
    if (Math.abs(ins.startTime) < 0.01 && Math.abs(ins.duration - totalDuration) < 0.15) return ins;
    changed = true;
    return { ...ins, startTime: 0, duration: totalDuration };
  });
  return changed ? next : inserts;
}

/* ------------------------------------------------------------------ *
 * Colour utilities
 * ------------------------------------------------------------------ */

function hexToRgb(color: string, fallback: [number, number, number] = [56, 189, 248]): [number, number, number] {
  if (!color) return fallback;
  let hex = color.trim();
  if (hex.startsWith("#")) hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length !== 6 || /[^0-9a-fA-F]/.test(hex)) return fallback;
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(color: string, alpha: number, fallback?: [number, number, number]): string {
  const [r, g, b] = hexToRgb(color, fallback);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function mixColors(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * Math.max(0, Math.min(1, t)));
  return `rgb(${m(r1, r2)}, ${m(g1, g2)}, ${m(b1, b2)})`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.max(0, Math.min(r, Math.min(Math.abs(w), Math.abs(h)) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/* ------------------------------------------------------------------ *
 * Shared building blocks
 * ------------------------------------------------------------------ */

/** Frosted plate behind a rack/wave: gives the floating shadow something to land on */
function drawGlassPlate(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  primary: string,
  opts: { radius?: number; glowing?: boolean; glow?: number } = {}
) {
  const radius = opts.radius ?? Math.min(18, height * 0.35);
  // Fades out towards the top so the plate reads as a soft glass panel instead
  // of a hard black band across the picture.
  const grad = ctx.createLinearGradient(0, -height, 0, 8);
  grad.addColorStop(0, "rgba(8, 12, 22, 0.02)");
  grad.addColorStop(0.45, "rgba(10, 14, 26, 0.22)");
  grad.addColorStop(1, "rgba(6, 9, 18, 0.6)");

  ctx.save();
  roundRectPath(ctx, -width / 2, -height, width, height + 6, radius);
  ctx.fillStyle = grad;
  ctx.fill();

  // colour bloom along the floor of the plate
  const bloom = ctx.createLinearGradient(0, -height * 0.35, 0, 6);
  bloom.addColorStop(0, rgba(primary, 0));
  bloom.addColorStop(1, rgba(primary, (opts.glow ?? 0.85) * 0.16));
  ctx.fillStyle = bloom;
  ctx.fill();
  ctx.restore();
}

/** Height of the glass plate that hugs the tallest bar (so the rack never sits
 *  in a band of empty glass), clamped to the visualiser body. */
function plateTopFor(
  values: Float32Array,
  peaks: Float32Array,
  maxHeight: number,
  body: number
): number {
  let top = 0;
  for (let i = 0; i < values.length; i++) {
    const v = Math.max(values[i], peaks[i] || 0);
    if (v > top) top = v;
  }
  const hug = top * maxHeight * 1.14 + maxHeight * 0.16;
  return Math.max(maxHeight * 0.45, Math.min(body, hug));
}

/** Soft coloured light pooling under the element — grounds it in the frame */
function drawFloorGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  primary: string,
  secondary: string,
  intensity: number
) {
  if (intensity <= 0.02) return;
  const grad = ctx.createRadialGradient(0, 6, 0, 0, 6, width * 0.55);
  grad.addColorStop(0, rgba(primary, 0.36 * intensity));
  grad.addColorStop(0.45, rgba(secondary, 0.16 * intensity));
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 6, width * 0.55, 16, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

/** Elliptical floor reflection of the bars — classic studio "glass stage" look */
function drawReflection(
  ctx: CanvasRenderingContext2D,
  width: number,
  partnerHeight: number,
  primary: string,
  secondary: string,
  full: boolean
) {
  const depth = Math.min(34, partnerHeight * 0.4);
  if (depth < 4) return;
  const grad = ctx.createLinearGradient(0, 4, 0, 4 + depth);
  grad.addColorStop(0, rgba(primary, 0.28));
  grad.addColorStop(0.5, rgba(secondary, 0.12));
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  const w = full ? width : width * 0.94;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 4 + depth * 0.35, w * 0.5, depth * 0.85, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * Bar racks
 * ------------------------------------------------------------------ */

interface RackOptions {
  width: number;
  count: number;
  barWidth: number;
  gap: number;
  maxHeight: number;
  values: Float32Array;
  peaks: Float32Array;
  primary: string;
  secondary: string;
  has3D: boolean;
  glow: number;
  mirror?: boolean;
  segments?: number;
  rainbow?: boolean;
  dots?: boolean;
  rows?: number;
}

function drawBarRack(ctx: CanvasRenderingContext2D, o: RackOptions) {
  const {
    width, count, barWidth, gap, maxHeight, values, peaks,
    primary, secondary, has3D, glow, mirror, segments, rainbow, dots, rows,
  } = o;
  const slot = width / count;
  const bw = Math.max(1.5, Math.min(barWidth, slot - gap));
  const startX = -width / 2 + (slot - bw) / 2;

  // One shared vertical gradient for every bar: cheaper and more uniform
  const bodyGrad = rainbow
    ? (() => {
        const g = ctx.createLinearGradient(0, 0, 0, -maxHeight);
        g.addColorStop(0, "#2563eb");
        g.addColorStop(0.3, "#06b6d4");
        g.addColorStop(0.55, "#10b981");
        g.addColorStop(0.78, "#f59e0b");
        g.addColorStop(1, "#ef4444");
        return g;
      })()
    : (() => {
        const g = ctx.createLinearGradient(0, 4, 0, -maxHeight);
        g.addColorStop(0, rgba(primary, 0.55));
        g.addColorStop(0.35, primary);
        g.addColorStop(0.82, mixColors(primary, secondary, 0.55));
        g.addColorStop(1, secondary);
        return g;
      })();

  const segCount = segments && segments > 0 ? segments : 0;
  const rowCount = rows && rows > 0 ? rows : 0;

  for (let i = 0; i < count; i++) {
    const v = Math.max(0, values[i]);
    const bx = startX + i * slot;
    const hUp = Math.max(2, Math.min(maxHeight, v * maxHeight));
    const peakH = Math.max(2, Math.min(maxHeight * 1.04, (peaks[i] || 0) * maxHeight));

    if (dots && rowCount > 0) {
      // dot-matrix column
      const cell = maxHeight / rowCount;
      const dotR = Math.max(1.2, Math.min(bw, cell) * 0.44);
      // at least a couple of dots stay lit so the full row reads as a live meter
      const lit = Math.max(2, Math.round((hUp / maxHeight) * rowCount));
      for (let r = 0; r < rowCount; r++) {
        const cy = -cell * (r + 0.5);
        const on = r < lit;
        ctx.beginPath();
        ctx.arc(bx + bw / 2, cy, dotR, 0, Math.PI * 2);
        if (on) {
          ctx.fillStyle = rainbow
            ? `hsl(${190 + (r / rowCount) * 150 + i * 1.5}, 92%, 62%)`
            : mixColors(primary, secondary, r / Math.max(1, rowCount - 1));
          ctx.shadowColor = ctx.fillStyle as string;
          ctx.shadowBlur = (r === lit - 1 ? 8 : 3) * glow;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
          ctx.fill();
        }
      }
      continue;
    }

    if (segCount > 0) {
      // segmented LED column
      const segH = Math.max(2.5, maxHeight / segCount - 2.5);
      const lit = Math.round((hUp / maxHeight) * segCount);
      for (let s = 0; s < segCount; s++) {
        const sy = -segH * (s + 1) - 2.5 * s;
        const on = s < lit;
        const t = s / Math.max(1, segCount - 1);
        ctx.fillStyle = on
          ? rainbow
            ? `hsl(${180 + t * 160}, 92%, 60%)`
            : mixColors(primary, secondary, t)
          : "rgba(255, 255, 255, 0.06)";
        if (on) {
          ctx.shadowColor = ctx.fillStyle as string;
          ctx.shadowBlur = 6 * glow;
        }
        roundRectPath(ctx, bx, sy, bw, segH, Math.min(2.5, bw * 0.4));
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      // cap the lit column with a hot pixel
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.shadowColor = primary;
      ctx.shadowBlur = 8 * glow;
      roundRectPath(ctx, bx, -(lit / segCount) * maxHeight - 1.5, bw, 2.5, 1.2);
      ctx.fill();
      ctx.shadowBlur = 0;
      continue;
    }

    // solid rounded bar (optionally mirrored around the baseline)
    roundRectPath(ctx, bx, -hUp, bw, mirror ? hUp * 2 : hUp, Math.min(bw / 2, 5));
    ctx.fillStyle = bodyGrad;
    if (glow > 0.05) {
      ctx.shadowColor = rgba(primary, 0.9);
      ctx.shadowBlur = 12 * glow;
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    if (has3D) {
      // left specular highlight + right shaded edge = extruded 3D bar
      ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
      ctx.fillRect(bx + 1, -hUp + 2, Math.max(1, bw * 0.16), hUp - 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
      ctx.fillRect(bx + bw - Math.max(1, bw * 0.16) - 1, -hUp + 2, Math.max(1, bw * 0.16), hUp - 2);
      // glossy cap
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      roundRectPath(ctx, bx + bw * 0.18, -hUp + 1.5, bw * 0.64, 2.4, 1.2);
      ctx.fill();
    }

    // peak cap riding the held peak
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.shadowColor = secondary;
    ctx.shadowBlur = 9 * glow;
    roundRectPath(ctx, bx, -peakH - 4, bw, 2.6, 1.3);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

/* ------------------------------------------------------------------ *
 * Main renderer
 * ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ *
 * Centre stage helper — the user's own logo in the middle
 * ------------------------------------------------------------------ */

/**
 * Draws the hub every centre visualiser is built around: a glass disc that
 * pulses with the bass with the user's logo sitting on it. When the project has
 * no logo, the hub falls back to a plain glowing core — no third-party mark is
 * ever drawn here.
 */
function drawCentreCore(
  ctx: CanvasRenderingContext2D,
  radius: number,
  colours: { primary: string; secondary: string; accent: string },
  opts: { logo?: CanvasImageSource | null; beat: number; low: number; glow: number; reveal?: number }
) {
  const { primary, secondary, accent } = colours;
  const r = Math.max(6, radius);
  const pulse = 1 + opts.beat * 0.05 + opts.low * 0.06;

  // halo behind the disc so the logo sits in light
  const halo = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.1);
  halo.addColorStop(0, rgba(accent, 0.3 + opts.beat * 0.25));
  halo.addColorStop(0.45, rgba(primary, 0.14));
  halo.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2);
  ctx.fill();

  // glass disc
  ctx.save();
  ctx.scale(pulse, pulse);
  const disc = ctx.createRadialGradient(0, -r * 0.25, r * 0.1, 0, 0, r);
  disc.addColorStop(0, "rgba(12, 16, 28, 0.92)");
  disc.addColorStop(0.75, "rgba(8, 11, 20, 0.88)");
  disc.addColorStop(1, rgba(primary, 0.35));
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = Math.max(1.2, r * 0.055);
  ctx.strokeStyle = rgba(mixColors(primary, "#ffffff", 0.35), 0.55 + opts.beat * 0.35);
  if (opts.glow > 0.05) {
    ctx.shadowColor = rgba(primary, 0.9);
    ctx.shadowBlur = 22 * opts.glow;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  const logo = opts.logo;
  if (logo) {
    // fit the logo inside the hub without ever distorting it
    const nat = logo as unknown as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
    const iw = nat.naturalWidth || nat.width || 1;
    const ih = nat.naturalHeight || nat.height || 1;
    const box = r * 1.52;
    const scale = Math.min(box / iw, box / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.save();
    ctx.scale(pulse, pulse);
    if (opts.glow > 0.05) {
      ctx.shadowColor = rgba(accent, 0.75);
      ctx.shadowBlur = 18 * opts.glow;
    }
    try {
      ctx.drawImage(logo, -dw / 2, -dh / 2, dw, dh);
    } catch {
      // A logo that cannot be drawn (cross-origin taint, broken image) simply
      // leaves the glowing core showing.
      ctx.shadowBlur = 0;
    }
    ctx.shadowBlur = 0;
    ctx.restore();
    return;
  }

  // no logo: a white-hot core that thumps on the beat
  const coreR = r * (0.34 + opts.beat * 0.12 + opts.low * 0.1);
  const core = ctx.createRadialGradient(0, 0, 1, 0, 0, coreR);
  core.addColorStop(0, "#ffffff");
  core.addColorStop(0.4, rgba(accent, 0.95));
  core.addColorStop(0.8, rgba(secondary, 0.6));
  core.addColorStop(1, rgba(primary, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, Math.PI * 2);
  ctx.fill();
}

/* ================================================================== *
 * IMMERSIVE SCENES
 * ------------------------------------------------------------------
 * Seven full-frame visualisers built for drama: a wireframe landscape, a
 * warp starfield, glowing pills, a particle swarm, lava-lamp plasma, a
 * jellyfish wireframe and a ring of fire. Every one of them is driven by
 * the same spectrum snapshot as the racks (values, peaks, energy, beat),
 * is fully deterministic from `elapsed` (so the studio preview and the
 * render agree frame for frame) and is drawn at the frame's own size so it
 * stays sharp in any export resolution.
 * ================================================================== */

export type ImmersiveStyle =
  | "terrain_grid"
  | "warp_starfield"
  | "glow_pills"
  | "particle_swarm"
  | "lava_blobs"
  | "jellyfish_mesh"
  | "ring_of_fire";

export function isImmersiveVisualizer(type: string): boolean {
  return IMMERSIVE_TYPES.has(type);
}

interface SceneCtx {
  ctx: CanvasRenderingContext2D;
  /** frame size in px — the scene is drawn centred on the origin */
  w: number;
  h: number;
  elapsed: number;
  primary: string;
  secondary: string;
  accent: string;
  glow: number;
  reactive: number;
  bands: BarsResult;
  beat: number;
  compact: boolean;
}

/** Deterministic 0..1 from an index: no Math.random, so stars, particles and
 *  blobs land in exactly the same place in the preview and in the render. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/** Soft radial bloom used by the plasma and ring styles. */
function softGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  inner: string,
  mid: string,
  alpha: number
) {
  if (r <= 0.5 || alpha <= 0.01) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(0.42, mid);
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ---------------- 1. TERRAIN OVERDRIVE ---------------- */
/** A 3D wireframe landscape flying toward the viewer: every ridge is a frequency
 *  band, the bass lifts the whole range and the beat lights the near rows. */
function drawTerrain(s: SceneCtx) {
  const { ctx, w, h } = s;
  const values = s.bands.values;
  const cols = Math.max(24, Math.min(64, values.length));
  const rows = 26;
  const horizon = -h * 0.2;
  const scroll = (s.elapsed * 0.5) % 1;
  const energy = Math.max(0, Math.min(1.4, s.bands.energy));
  const amp = h * (0.5 + energy * 0.7) * s.reactive;

  // a dark sky behind the mesh so the neon lines have something to burn against
  const sky = ctx.createLinearGradient(0, -h / 2, 0, h * 0.35);
  sky.addColorStop(0, "rgba(4, 6, 16, 0.82)");
  sky.addColorStop(0.55, "rgba(6, 8, 20, 0.4)");
  sky.addColorStop(1, "rgba(4, 6, 16, 0)");
  ctx.fillStyle = sky;
  ctx.fillRect(-w / 2, -h / 2, w, h * 0.85);

  // -- sun disc on the horizon, breathing with the bass -----------------------
  const sunR = Math.min(w, h) * (0.13 + s.bands.low * 0.05);
  softGlow(ctx, 0, horizon, sunR * 1.7, rgba(s.accent, 0.3 + s.beat * 0.25), rgba(s.primary, 0.12), 1);
  ctx.save();
  const sun = ctx.createLinearGradient(0, horizon - sunR, 0, horizon + sunR);
  sun.addColorStop(0, rgba(s.accent, 0.95));
  sun.addColorStop(0.5, rgba(s.primary, 0.8));
  sun.addColorStop(1, rgba(s.secondary, 0.4));
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(0, horizon, sunR, 0, Math.PI * 2);
  ctx.fill();
  // scan lines across the disc keep the retro grade
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 1; i < 7; i++) {
    const y = horizon - sunR * 0.05 + i * sunR * 0.15;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(-sunR, y, sunR * 2, Math.max(1, sunR * 0.045 * i * 0.6));
  }
  ctx.restore();

  // -- the mesh: rows recede into the distance, each row a spectrum slice -------
  for (let r = rows - 1; r >= 0; r--) {
    const z = r + 1 + scroll;
    const persp = 1 - 1 / (1 + z * 0.2);              // 0 at the horizon … ~0.8 up close
    const y = horizon + (h * 0.55 - horizon) * persp * 1.15;
    const depth = 0.25 + persp * 1.15;
    const alpha = 0.16 + persp * 0.78;
    const liftOf = (c: number) => {
      const band = values[(c + r * 3) % values.length] || 0;
      // a little expansion on the peaks: the loud bands tower over the quiet ones
      return Math.pow(Math.max(0, Math.min(1.3, band)), 0.8) * amp * depth * 0.42;
    };

    // the ridge line itself
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) {
      const x = -w / 2 + (c / cols) * w;
      const yy = y - liftOf(c);
      if (c === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = rgba(
      mixColors(s.primary, s.accent, persp * 0.85),
      Math.min(1, 0.32 + persp * 0.78 + energy * 0.1)
    );
    ctx.lineWidth = Math.max(1.1, h * 0.003 * (0.55 + persp));
    if (s.glow > 0.05) {
      ctx.shadowColor = rgba(s.primary, 0.9);
      ctx.shadowBlur = 20 * s.glow * persp * (0.6 + s.beat * 0.9);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // upright wires give the mesh its structure
    ctx.beginPath();
    for (let c = 0; c <= cols; c += 3) {
      const x = -w / 2 + (c / cols) * w;
      ctx.moveTo(x, y - liftOf(c));
      ctx.lineTo(x, y + h * 0.02 * (0.4 + persp));
    }
    ctx.strokeStyle = rgba(s.accent, alpha * 0.22);
    ctx.lineWidth = Math.max(0.6, h * 0.0012 * (0.4 + persp));
    ctx.stroke();
  }

  // -- floor haze so the nearest row sits in light instead of stopping dead ----
  const haze = ctx.createLinearGradient(0, h * 0.06, 0, h * 0.5);
  haze.addColorStop(0, "rgba(0,0,0,0)");
  haze.addColorStop(1, rgba(s.primary, 0.1 + s.beat * 0.1));
  ctx.fillStyle = haze;
  ctx.fillRect(-w / 2, h * 0.06, w, h * 0.44);
}

/* ---------------- 2. WARP STARFIELD ---------------- */
/** Thousands of stars streaming past the camera in a tunnel: the bass opens the
 *  warp, the beat fires a shockwave and the nearest stars burn white hot. */
function drawStarfield(s: SceneCtx) {
  const { ctx, w, h } = s;
  const stars = s.compact ? 170 : 420;
  const energy = Math.max(0, Math.min(1.4, s.bands.energy));
  const speed = 0.2 + energy * 0.45 + s.beat * 0.2;
  const base = Math.min(w, h) * 0.5;
  const eye = 1.05;
  const dz = 0.045 + speed * 0.06;

  // the tunnel mouth: a soft glow that breathes with the bass
  softGlow(
    ctx,
    0,
    0,
    base * (0.65 + s.bands.low * 0.5),
    rgba(s.primary, 0.14 + s.bands.low * 0.16),
    rgba(s.secondary, 0.07),
    1
  );

  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < stars; i++) {
    const seed = hash01(i * 3 + 1);
    const angle = hash01(i * 3 + 2) * Math.PI * 2;
    const away = 0.18 + hash01(i * 3 + 3) * 0.95;
    const phase = (seed + s.elapsed * speed) % 1;      // 0 = far away … 1 = at the eye
    const z = eye - phase * eye;                       // eye … 0 in front of the lens
    if (z < 0.04) continue;
    const k = 1 / z;
    const wx = Math.cos(angle) * away * k * w * 0.3;
    const wy = Math.sin(angle) * away * k * h * 0.3;
    if (Math.abs(wx) > w * 0.78 || Math.abs(wy) > h * 0.78) continue;

    // where the same star was a moment ago: the length of its streak
    const kp = 1 / Math.min(eye, z + dz);
    const tx = Math.cos(angle) * away * kp * w * 0.3;
    const ty = Math.sin(angle) * away * kp * h * 0.3;

    const near = 1 - z / eye;                          // 0 far … ~1 right here
    const colour = mixColors(s.primary, s.accent, Math.min(1, near * 1.15));
    ctx.strokeStyle = rgba(colour, Math.min(1, 0.18 + near * 0.9));
    ctx.lineWidth = Math.max(0.7, near * Math.min(w, h) * 0.006);
    if (s.glow > 0.05 && near > 0.45) {
      ctx.shadowColor = colour;
      ctx.shadowBlur = 14 * s.glow * near;
    }
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(wx, wy);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // white-hot head on the stars rushing past
    if (near > 0.7) {
      ctx.fillStyle = rgba(s.accent, Math.min(1, (near - 0.7) * 3));
      ctx.beginPath();
      ctx.arc(wx, wy, Math.max(0.8, near * Math.min(w, h) * 0.0045), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // beat flash: a shockwave ring racing outward
  if (s.beat > 0.2) {
    const t = (s.elapsed * 0.9) % 1;
    const r = Math.min(w, h) * (0.06 + t * 0.6);
    ctx.save();
    ctx.strokeStyle = rgba(s.accent, 0.5 * s.beat * (1 - t));
    ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.005 * (1 - t));
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.74, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------------- 3. GLOW PILLS ---------------- */
/** Fat glowing capsules with floating peak caps and a floor reflection. */
function drawGlowPills(s: SceneCtx) {
  const { ctx, w, h } = s;
  const values = s.bands.values;
  const peaks = s.bands.peaks;
  const count = Math.max(10, Math.min(72, values.length));
  const slot = w / count;
  const pillW = Math.max(4, slot * 0.62);
  const maxH = h * 0.56 * Math.max(0.6, Math.min(1.5, s.reactive));
  const base = h * 0.24;
  const energy = Math.max(0, Math.min(1.4, s.bands.energy));

  // stage glow under the rack
  const stage = ctx.createRadialGradient(0, base, 4, 0, base, w * 0.5);
  stage.addColorStop(0, rgba(s.primary, 0.3 + energy * 0.2));
  stage.addColorStop(0.5, rgba(s.secondary, 0.12));
  stage.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = stage;
  ctx.fillRect(-w / 2, base - h * 0.3, w, h * 0.6);

  for (let i = 0; i < count; i++) {
    const v = Math.max(0, values[i] || 0);
    const pk = Math.max(0, peaks[i] || 0);
    const x = -w / 2 + slot * (i + 0.5);
    const height = Math.max(pillW, v * maxH);
    const top = base - height;

    // reflection first, so the pill sits on top of it
    const reflH = Math.min(height * 0.55, h * 0.22);
    const refl = ctx.createLinearGradient(0, base, 0, base + reflH);
    refl.addColorStop(0, rgba(s.primary, 0.3));
    refl.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = refl;
    roundRectPath(ctx, x - pillW / 2, base + 2, pillW, reflH, pillW / 2);
    ctx.fill();

    // the pill body
    const body = ctx.createLinearGradient(x, base, x, top);
    body.addColorStop(0, rgba(s.primary, 0.55));
    body.addColorStop(0.35, s.primary);
    body.addColorStop(0.8, mixColors(s.primary, s.secondary, 0.55));
    body.addColorStop(1, s.accent);
    if (s.glow > 0.05) {
      ctx.shadowColor = rgba(s.primary, 0.9);
      ctx.shadowBlur = (18 + s.beat * 22) * s.glow;
    }
    ctx.fillStyle = body;
    roundRectPath(ctx, x - pillW / 2, top, pillW, height, pillW / 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // glass highlight down the left side of the capsule
    ctx.save();
    roundRectPath(ctx, x - pillW / 2, top, pillW, height, pillW / 2);
    ctx.clip();
    ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
    ctx.fillRect(x - pillW / 2, top, Math.max(1, pillW * 0.26), height);
    ctx.restore();

    // floating cap that marks the band's peak
    const capY = base - Math.max(pillW, pk * maxH) - pillW * 0.85;
    ctx.fillStyle = rgba(s.accent, 0.75);
    roundRectPath(ctx, x - pillW * 0.36, capY, pillW * 0.72, Math.max(2.5, pillW * 0.3), pillW * 0.2);
    ctx.fill();
  }
}

/* ---------------- 4. PARTICLE SWARM ---------------- */
/** A rotating sphere of particles that swells with the bass and bursts on the beat. */
function drawParticleSwarm(s: SceneCtx) {
  const { ctx, w, h } = s;
  const count = s.compact ? 130 : 240;
  const R = Math.min(w, h) * 0.3 * (0.82 + s.bands.low * 0.5 + s.beat * 0.22);
  const spin = s.elapsed * (0.28 + s.bands.mid * 0.5);
  const burst = s.beat * R * 0.22;
  const tilt = 0.42;

  softGlow(ctx, 0, 0, R * 2.2, rgba(s.primary, 0.14 + s.bands.low * 0.16), rgba(s.secondary, 0.08), 1);

  const pts: { x: number; y: number; z: number; i: number }[] = [];
  for (let i = 0; i < count; i++) {
    const u = hash01(i * 5 + 1);
    const v = hash01(i * 5 + 2);
    const theta = u * Math.PI * 2 + spin * (0.7 + hash01(i * 5 + 3) * 0.6);
    const phi = Math.acos(2 * v - 1);
    const r = R * (0.62 + hash01(i * 5 + 4) * 0.38);
    const band = s.bands.values[i % s.bands.values.length] || 0;
    const rr = r + band * R * 0.34 + burst;
    const sx = Math.sin(phi) * Math.cos(theta) * rr;
    const syRaw = Math.cos(phi) * rr;
    const sz = Math.sin(phi) * Math.sin(theta) * rr;
    const sy = syRaw * Math.cos(tilt) - sz * Math.sin(tilt);
    const zz = syRaw * Math.sin(tilt) + sz * Math.cos(tilt);
    const persp = 1 / (1 + (zz / R) * 0.55);
    pts.push({ x: sx * persp, y: sy * persp, z: zz, i });
  }

  // constellation lines between the closest few neighbours give the swarm detail
  ctx.save();
  ctx.lineWidth = Math.max(0.5, Math.min(w, h) * 0.0012);
  for (let i = 0; i < pts.length; i += 3) {
    const a = pts[i];
    const b = pts[(i + 7) % pts.length];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < R * 0.22) {
      ctx.strokeStyle = rgba(s.accent, 0.16 * (1 - d / (R * 0.22)));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();

  for (const p of pts) {
    const near = (p.z / R + 1) / 2; // 0 back … 1 front
    const size = Math.max(0.9, Math.min(w, h) * 0.0045 * (0.4 + near * 1.5 + s.beat * 0.5));
    const colour = mixColors(s.secondary, s.primary, near);
    if (s.glow > 0.05 && near > 0.5) {
      ctx.shadowColor = colour;
      ctx.shadowBlur = 12 * s.glow * near;
    }
    ctx.fillStyle = rgba(colour, 0.28 + near * 0.7);
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // hot core
  const coreR = Math.min(w, h) * (0.035 + s.bands.low * 0.03 + s.beat * 0.02);
  softGlow(ctx, 0, 0, coreR * 3.2, rgba(s.accent, 0.85), rgba(s.primary, 0.4), 1);
}

/* ---------------- 5. LAVA LAMP ---------------- */
/** Molten metaballs rising through dark liquid. The low end swells them and the
 *  beat makes them collide; the treble shimmers on their surface. Layers are
 *  added with low alpha so overlapping blobs fuse into one glowing fluid
 *  instead of blowing out to white. */
function drawLavaBlobs(s: SceneCtx) {
  const { ctx, w, h } = s;
  const blobs = 8;
  const energy = Math.max(0, Math.min(1.4, s.bands.energy));

  // dark liquid: almost black, with the faintest warm pool underneath
  const pool = ctx.createRadialGradient(0, h * 0.15, 0, 0, h * 0.15, Math.max(w, h) * 0.8);
  pool.addColorStop(0, "rgba(10, 5, 14, 0.8)");
  pool.addColorStop(0.6, "rgba(6, 3, 10, 0.72)");
  pool.addColorStop(1, "rgba(2, 1, 6, 0.5)");
  ctx.fillStyle = pool;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < blobs; i++) {
    const lane = hash01(i * 7 + 1);
    const phase = hash01(i * 7 + 2);
    const speed = 0.04 + hash01(i * 7 + 3) * 0.045;
    const rise = ((s.elapsed * speed + phase) % 1 + 1) % 1;
    const band = s.bands.values[(i * 5) % s.bands.values.length] || 0;
    const x = -w * 0.34 + lane * w * 0.68 + Math.sin(s.elapsed * 0.55 + i * 1.7) * w * 0.05;
    const y = h * 0.46 - rise * h * 0.92;
    const r =
      Math.min(w, h) *
      (0.07 + hash01(i * 7 + 4) * 0.055) *
      (0.85 + band * 1.25 * s.reactive + energy * 0.2);

    // deep body → molten core → white-hot heart
    softGlow(ctx, x, y, r * 2.5, rgba(s.secondary, 0.14 + band * 0.1), rgba(s.secondary, 0.06), 0.95);
    softGlow(ctx, x, y, r * 1.2, rgba(s.primary, 0.34 + band * 0.12), rgba(s.secondary, 0.16), 0.92);
    softGlow(
      ctx,
      x,
      y,
      r * 0.45,
      rgba(mixColors(s.primary, s.accent, 0.55), 0.45 + band * 0.25),
      rgba(s.primary, 0.2),
      0.95
    );
  }
  ctx.restore();

}

/* ---------------- 6. JELLYFISH MESH ---------------- */
/** A wireframe bell that breathes with the bass while glowing tendrils trail the
 *  highs — projected properly (a dome, not stacked ellipses) so it reads as a
 *  living 3D creature hanging in the frame. */
function drawJellyfishMesh(s: SceneCtx) {
  const { ctx, w, h } = s;
  const rings = 8;
  const spokes = 28;
  const bell =
    Math.min(w * 0.31, h * 0.42) * (0.85 + s.bands.low * 0.3 + s.beat * 0.08);
  const cy = h * 0.02;
  const spin = s.elapsed * 0.4;
  const focal = bell * 2.8;                      // perspective strength

  /** Projects a point of the dome: (x, y from the bell centre, z) → screen. */
  const project = (x: number, yLocal: number, z: number) => {
    const p = focal / (focal + z);
    return { x: x * p, y: cy + yLocal * p, z };
  };

  const point = (ri: number, si: number) => {
    const rr = ri / (rings - 1);                 // 0 = top pole … 1 = rim
    const lat = rr * Math.PI * 0.58;             // slightly taller than a hemisphere
    const breathe = 1 + Math.sin(s.elapsed * 2.2 - rr * 3.1) * 0.06 * (1 + s.bands.mid * 1.2);
    const radius = bell * Math.sin(lat) * breathe;
    const a = (si / spokes) * Math.PI * 2 + spin * (0.3 + rr * 0.5);
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius * 0.55;       // depth squashed: no rubbery stretch
    const wave = Math.sin(a * 2 + s.elapsed * 1.8) * bell * 0.025 * (1 + s.bands.high * 2);
    return project(x, -Math.cos(lat) * bell * 0.72 + wave, z);
  };

  ctx.save();
  ctx.lineCap = "round";

  // latitude rings: the bell's ribs
  for (let ri = 1; ri < rings; ri++) {
    const rr = ri / (rings - 1);
    ctx.beginPath();
    for (let si = 0; si <= spokes; si++) {
      const p = point(ri, si % spokes);
      if (si === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = rgba(mixColors(s.primary, s.accent, rr), 0.22 + rr * 0.55);
    ctx.lineWidth = Math.max(0.7, Math.min(w, h) * 0.0016 * (0.5 + rr));
    if (s.glow > 0.05) {
      ctx.shadowColor = rgba(s.primary, 0.8);
      ctx.shadowBlur = 12 * s.glow;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // meridians: the spokes running from the pole to the rim
  for (let si = 0; si < spokes; si += 3) {
    ctx.beginPath();
    for (let ri = 0; ri < rings; ri++) {
      const p = point(ri, si);
      if (ri === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = rgba(s.secondary, 0.18);
    ctx.lineWidth = Math.max(0.6, Math.min(w, h) * 0.0013);
    ctx.stroke();
  }

  // the core glow inside the bell
  softGlow(ctx, 0, cy - bell * 0.12, bell * 1.15, rgba(s.accent, 0.3 + s.bands.low * 0.3), rgba(s.primary, 0.16), 1);

  // tendrils hanging off the rim, waving with the top of the spectrum
  const high = s.bands.high;
  for (let t = 0; t < 5; t++) {
    const si = Math.round((t / 5) * spokes);
    const rim = point(rings - 1, si);
    const len = bell * (0.75 + high * 1.4 + hash01(t * 13 + 1) * 0.4);
    ctx.beginPath();
    ctx.moveTo(rim.x, rim.y);
    for (let k = 1; k <= 9; k++) {
      const f = k / 9;
      const sway =
        Math.sin(s.elapsed * 2.6 - f * 4.6 + t * 1.3) * bell * 0.3 * (0.5 + high * 1.6) * f;
      ctx.lineTo(rim.x + sway, rim.y + len * f);
    }
    ctx.strokeStyle = rgba(s.accent, 0.45 - t * 0.03);
    ctx.lineWidth = Math.max(0.6, Math.min(w, h) * 0.0014 * (1 - t * 0.06));
    if (s.glow > 0.05 && high > 0.25) {
      ctx.shadowColor = rgba(s.accent, 0.7);
      ctx.shadowBlur = 10 * s.glow * high;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/* ---------------- 7. RING OF FIRE ---------------- */
/** A pulsing core, a ring of spectrum spikes and a shockwave on every beat. */
function drawRingOfFire(s: SceneCtx) {
  const { ctx, w, h } = s;
  const values = s.bands.values;
  const spokes = Math.max(48, Math.min(160, values.length * 3));
  const inner = Math.min(w, h) * (0.14 + s.bands.low * 0.05 + s.beat * 0.02);
  const maxLen = Math.min(w, h) * 0.26 * Math.max(0.6, Math.min(1.6, s.reactive));
  const spin = s.elapsed * 0.35;
  const energy = Math.max(0, Math.min(1.4, s.bands.energy));

  // core: white-hot heart with a coloured corona
  softGlow(ctx, 0, 0, inner * 3.4, rgba(s.accent, 0.55 + s.bands.low * 0.35), rgba(s.primary, 0.3), 0.85);
  const core = ctx.createRadialGradient(0, 0, inner * 0.15, 0, 0, inner);
  core.addColorStop(0, "#ffffff");
  core.addColorStop(0.35, rgba(s.accent, 0.95));
  core.addColorStop(0.8, rgba(s.primary, 0.55));
  core.addColorStop(1, rgba(s.secondary, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, inner, 0, Math.PI * 2);
  ctx.fill();

  // spikes: each one reads a band, tips go white hot
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < spokes; i++) {
    const t = i / spokes;
    const band = values[Math.floor(t * values.length) % values.length] || 0;
    const prev = values[(Math.floor(t * values.length) - 1 + values.length) % values.length] || 0;
    const v = Math.max(0, band * 0.7 + prev * 0.3);
    const a = t * Math.PI * 2 + spin;
    const len = inner * 0.35 + v * maxLen;
    const x0 = Math.cos(a) * inner * 1.02;
    const y0 = Math.sin(a) * inner * 1.02;
    const x1 = Math.cos(a) * (inner * 1.02 + len);
    const y1 = Math.sin(a) * (inner * 1.02 + len);
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba(s.primary, 0.85));
    g.addColorStop(0.6, rgba(s.secondary, 0.9));
    g.addColorStop(1, rgba(s.accent, 0.95));
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1.2, (Math.PI * 2 * inner) / spokes * 0.42);
    if (s.glow > 0.05) {
      ctx.shadowColor = rgba(s.secondary, 0.9);
      ctx.shadowBlur = (10 + v * 26 + s.beat * 16) * s.glow;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  // beat shockwave
  if (s.beat > 0.2) {
    const t = (s.elapsed * 0.8) % 1;
    const r = inner + t * inner * 3.2;
    ctx.save();
    ctx.strokeStyle = rgba(s.accent, 0.55 * s.beat * (1 - t));
    ctx.lineWidth = Math.max(1, inner * 0.06 * (1 - t));
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // faint outer halo ties the ring into the picture
  softGlow(ctx, 0, 0, inner * 3.2 + maxLen * 0.6, rgba(s.secondary, 0.12 + energy * 0.1), rgba(s.primary, 0.08), 1);
}

/** Dispatches one immersive scene at the frame's own size. */
function drawImmersiveScene(style: ImmersiveStyle, s: SceneCtx) {
  switch (style) {
    case "terrain_grid":
      return drawTerrain(s);
    case "warp_starfield":
      return drawStarfield(s);
    case "glow_pills":
      return drawGlowPills(s);
    case "particle_swarm":
      return drawParticleSwarm(s);
    case "lava_blobs":
      return drawLavaBlobs(s);
    case "jellyfish_mesh":
      return drawJellyfishMesh(s);
    case "ring_of_fire":
      return drawRingOfFire(s);
    default:
      return;
  }
}

export interface VisualizerOptions {
  ctx: CanvasRenderingContext2D;
  item: TimelineInsert;
  /** anchor point in canvas px (already the visualiser centre) */
  x: number;
  y: number;
  canvasWidth: number;
  canvasHeight: number;
  elapsed: number;
  frame?: AudioFrame | null;
  /** catalogue thumbnails render smaller and skip the heaviest passes */
  compact?: boolean;
  /**
   * The user's own logo, drawn in the middle of the centre visualisers (the
   * audio orb and the orbit disc) when they ask for it. It is loaded by the
   * preview / render and passed in already decoded — the visualiser never
   * fetches anything, so a render can't stall on a network request.
   *
   * Nothing is drawn when this is absent: no third-party logo is ever baked
   * into these styles.
   */
  logo?: CanvasImageSource | null;
}

export function renderAudioVisualizer(opts: VisualizerOptions) {
  const { ctx, item, x, y, canvasWidth, canvasHeight, elapsed } = opts;
  const frame = opts.frame || EMPTY_FRAME;
  const compact = Boolean(opts.compact);

  const source: ReactionSource = (item.audioSource as ReactionSource) || "voice";
  /** the user's own logo (never a third-party one) for the centre visualisers */
  const logo = opts.logo || null;
  const bus = pickBus(frame, source);
  const size = item.size || 1;
  const opts3d = item.visualOptions || {};
  // A colour theme (Neon, Synthwave, Fire…) supplies all three colours at once;
  // without one the insert keeps its own pickers, so old projects look unchanged.
  const palette = resolveVisualizerPalette(opts3d);
  const primary = palette.primary;
  const secondary = palette.secondary;
  const accent = palette.accent;
  const has3D = opts3d.has3DLook !== false;
  const glow = Math.max(0, Math.min(1, opts3d.glowIntensity ?? 0.85));
  const reactivity = Math.max(0.2, Math.min(2.4, opts3d.reactivity ?? 1));
  const thickness = Math.max(2, Math.min(24, opts3d.barThickness ?? 8));
  const fullWidth = isVisualizerFullWidth(item);
  const body = visualizerBodyHeight(item, canvasHeight);
  const beat = beatPulse(elapsed, source);
  const key = `${item.id || item.type}:${item.type}`;

  // How many frequency bands the analyser splits the sound into. 64 is the
  // reference default (16 = chunky, 128 = very detailed).
  const bandCount = Math.max(8, Math.min(256, Math.round(opts3d.bandCount ?? 64)));

  /* ------------------------------------------------------------------
   * Immersive scenes (terrain, starfield, plasma…) are the picture, not an
   * overlay on it: they fill the frame, so they are drawn here and the rack
   * geometry below is skipped entirely.
   * ------------------------------------------------------------------ */
  if (IMMERSIVE_TYPES.has(item.type)) {
    const bars = getBars(key, bandCount, elapsed, bus, source, reactivity);
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(-canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight);
    ctx.clip();
    drawImmersiveScene(item.type as ImmersiveStyle, {
      ctx,
      w: canvasWidth,
      h: canvasHeight,
      elapsed,
      primary,
      secondary,
      accent,
      glow,
      reactive: reactivity,
      bands: bars,
      beat: Math.max(beat, bars.beat * 0.85),
      compact,
    });
    ctx.restore();
    return;
  }

  // Nothing may be cut off by the frame: racks that mirror around the baseline
  // are centred on the anchor, and every visualiser is clamped to stay inside
  // the picture with a small margin.
  const mirrored = item.type === "mirror_wave";
  const margin = Math.max(6, canvasHeight * 0.02);
  const upExtent = mirrored ? body * 0.95 : body * 1.0;
  const downExtent = mirrored ? body * 0.95 : margin;
  const anchorY = Math.max(upExtent + margin * 0.5, Math.min(canvasHeight - downExtent - margin * 0.5, y));

  ctx.save();
  ctx.translate(fullWidth ? canvasWidth / 2 : x, anchorY);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  switch (item.type) {
    /* ---------------- WAVE TRACES: waveform, voice_wave, neon_ribbon ---------------- */
    case "waveform":
    case "voice_wave":
    case "neon_ribbon": {
      const width = fullWidth ? canvasWidth : Math.max(240, 560 * size);
      const points = Math.max(72, Math.min(320, Math.round(width / 5)));
      const wave = getWaveform(points, elapsed, bus, source, reactivity);
      const amp = body * 0.5;
      const ribbon = item.type === "neon_ribbon";

      if (!compact && has3D) drawGlassPlate(ctx, width, body, primary, { glow });

      // area fill under the trace (ribbon style) or mirrored envelope (wave)
      ctx.beginPath();
      ctx.moveTo(-width / 2, 0);
      for (let i = 0; i < points; i++) {
        const px = -width / 2 + (i / (points - 1)) * width;
        ctx.lineTo(px, wave[i] * amp);
      }
      ctx.lineTo(width / 2, 0);
      ctx.closePath();
      const area = ctx.createLinearGradient(0, -amp, 0, amp);
      area.addColorStop(0, rgba(primary, 0.42));
      area.addColorStop(0.5, rgba(secondary, 0.5));
      area.addColorStop(1, rgba(primary, 0.38));
      ctx.fillStyle = area;
      ctx.globalAlpha = ribbon ? 0.95 : 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;

      const trace = (gain: number, color: string, line: number, blur: number) => {
        ctx.beginPath();
        for (let i = 0; i < points; i++) {
          const px = -width / 2 + (i / (points - 1)) * width;
          const py = wave[i] * amp * gain;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = line;
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.stroke();
        ctx.shadowBlur = 0;
      };

      trace(1, rgba(primary, 0.35), thickness * 2.1, 26 * glow); // bloom
      trace(1, mixColors(primary, secondary, 0.2), thickness * 0.75, 12 * glow);
      trace(1, "#ffffff", Math.max(1.3, thickness * 0.28), 5); // hot core

      // mid-line zero reference
      ctx.beginPath();
      ctx.moveTo(-width / 2, 0);
      ctx.lineTo(width / 2, 0);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // mirrored ghost trace for depth
      trace(-1, rgba(secondary, 0.4), Math.max(1, thickness * 0.4), 10 * glow);
      break;
    }

    /* ---------------- CRT OSCILLOSCOPE ---------------- */
    case "oscilloscope": {
      const width = fullWidth ? canvasWidth : Math.max(240, 560 * size);
      const points = Math.max(90, Math.min(360, Math.round(width / 4)));
      const wave = getWaveform(points, elapsed, bus, source, reactivity);
      const amp = body * 0.46;

      // phosphor screen
      ctx.save();
      roundRectPath(ctx, -width / 2, -body, width, body + 6, Math.min(14, body * 0.25));
      const screen = ctx.createLinearGradient(0, -body, 0, 6);
      screen.addColorStop(0, "rgba(3, 18, 14, 0.82)");
      screen.addColorStop(1, "rgba(2, 10, 9, 0.92)");
      ctx.fillStyle = screen;
      if (glow > 0.05) {
        ctx.shadowColor = "#10b981";
        ctx.shadowBlur = 20 * glow;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      // graticule
      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, -width / 2, -body, width, body + 6, Math.min(14, body * 0.25));
      ctx.clip();
      ctx.strokeStyle = "rgba(16, 185, 129, 0.18)";
      ctx.lineWidth = 1;
      for (let gx = -width / 2; gx <= width / 2; gx += 42) {
        ctx.beginPath();
        ctx.moveTo(gx, -body);
        ctx.lineTo(gx, 6);
        ctx.stroke();
      }
      for (let gy = -body; gy <= 6; gy += 24) {
        ctx.beginPath();
        ctx.moveTo(-width / 2, gy);
        ctx.lineTo(width / 2, gy);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(16, 185, 129, 0.3)";
      ctx.beginPath();
      ctx.moveTo(-width / 2, 0);
      ctx.lineTo(width / 2, 0);
      ctx.stroke();

      // trace
      const drawTrace = (gain: number, color: string, line: number, blur: number) => {
        ctx.beginPath();
        for (let i = 0; i < points; i++) {
          const px = -width / 2 + (i / (points - 1)) * width;
          const py = wave[i] * amp * gain;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = line;
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.stroke();
        ctx.shadowBlur = 0;
      };
      drawTrace(1, "rgba(52, 211, 153, 0.42)", thickness * 2.4, 28 * glow);
      drawTrace(1, "#34d399", thickness * 0.8, 12 * glow);
      drawTrace(1, "#ffffff", Math.max(1.2, thickness * 0.26), 6);

      // sweep highlight travelling across the screen
      const sweepX = -width / 2 + ((elapsed * 0.55) % 1) * width;
      const sweep = ctx.createLinearGradient(sweepX - 40, 0, sweepX + 40, 0);
      sweep.addColorStop(0, "rgba(255,255,255,0)");
      sweep.addColorStop(0.5, `rgba(255,255,255,${0.08 + beat * 0.08})`);
      sweep.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sweep;
      ctx.fillRect(sweepX - 40, -body, 80, body + 6);
      ctx.restore();
      break;
    }

    /* ---------------- MIRRORED BAR WAVE ---------------- */
    case "mirror_wave": {
      const width = fullWidth ? canvasWidth : Math.max(240, 560 * size);
      const bar = thickness * frameScale(canvasHeight);
      const maxH = body * 0.8;
      const count = opts3d.bandCount
        ? bandCount
        : Math.max(18, Math.min(96, Math.round(width / (bar + bar * 0.6))));
      const bars = getBars(key, count, elapsed, bus, source, reactivity);
      ctx.save();
      ctx.translate(0, -maxH * 0.55);
      if (!compact && has3D) {
        drawGlassPlate(ctx, width, plateTopFor(bars.values, bars.peaks, maxH, maxH), primary, { glow });
      }
      drawBarRack(ctx, {
        width,
        count,
        barWidth: bar,
        gap: Math.max(1.5, bar * 0.6),
        maxHeight: maxH,
        values: bars.values,
        peaks: bars.peaks,
        primary,
        secondary,
        has3D,
        glow,
        mirror: true,
      });
      ctx.beginPath();
      ctx.moveTo(-width / 2, 0);
      ctx.lineTo(width / 2, 0);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 1.4;
      ctx.shadowColor = primary;
      ctx.shadowBlur = 10 * glow;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
      break;
    }

    /* ---------------- BAR RACKS: equalizer, spectrum, speech ---------------- */
    case "equalizer_bars":
    case "spectrum":
    case "spectrum_bars":
    case "speech_spectrum": {
      const width = fullWidth ? canvasWidth : Math.max(240, 560 * size);
      const bar = thickness * frameScale(canvasHeight);
      const maxH = body * 0.84;
      const count = opts3d.bandCount
        ? bandCount
        : Math.max(18, Math.min(112, Math.round(width / (bar + bar * 0.5))));
      const bars = getBars(key, count, elapsed, bus, source, reactivity);
      const rainbow = item.type === "spectrum";
      if (!compact && has3D) {
        drawGlassPlate(ctx, width, plateTopFor(bars.values, bars.peaks, maxH, body), primary, { glow });
      }
      drawBarRack(ctx, {
        width,
        count,
        barWidth: bar,
        gap: Math.max(1.5, bar * 0.5),
        maxHeight: maxH,
        values: bars.values,
        peaks: bars.peaks,
        primary,
        secondary,
        has3D,
        glow,
        rainbow,
      });
      drawReflection(ctx, width, body * 0.3, primary, secondary, fullWidth);
      break;
    }

    /* ---------------- SEGMENTED LED METER WALL ---------------- */
    case "led_meter_wall": {
      const width = fullWidth ? canvasWidth : Math.max(240, 560 * size);
      const bar = thickness * frameScale(canvasHeight);
      const maxH = body * 0.82;
      const count = opts3d.bandCount
        ? bandCount
        : Math.max(14, Math.min(72, Math.round(width / (bar * 1.7))));
      const bars = getBars(key, count, elapsed, bus, source, reactivity);
      const segments = compact ? 10 : 18;
      if (!compact) {
        drawGlassPlate(ctx, width, plateTopFor(bars.values, bars.peaks, maxH, body), primary, { glow, radius: 10 });
      }
      drawBarRack(ctx, {
        width,
        count,
        barWidth: Math.max(3, bar),
        gap: Math.max(2, bar * 0.7),
        maxHeight: maxH,
        values: bars.values,
        peaks: bars.peaks,
        primary,
        secondary,
        has3D,
        glow,
        segments,
      });
      drawReflection(ctx, width, body * 0.28, primary, secondary, fullWidth);
      break;
    }

    /* ---------------- DOT MATRIX EQUALISER ---------------- */
    case "dot_matrix_eq": {
      const width = fullWidth ? canvasWidth : Math.max(240, 560 * size);
      const rows = compact ? 9 : 14;
      const bar = thickness * frameScale(canvasHeight);
      const maxH = body * 0.82;
      const count = opts3d.bandCount
        ? bandCount
        : Math.max(14, Math.min(80, Math.round(width / (bar * 1.6))));
      const bars = getBars(key, count, elapsed, bus, source, reactivity);
      if (!compact) {
        drawGlassPlate(ctx, width, plateTopFor(bars.values, bars.peaks, maxH, body), primary, { glow, radius: 10 });
      }
      drawBarRack(ctx, {
        width,
        count,
        barWidth: bar,
        gap: Math.max(1.5, bar * 0.6),
        maxHeight: maxH,
        values: bars.values,
        peaks: bars.peaks,
        primary,
        secondary,
        has3D,
        glow,
        dots: true,
        rows,
      });
      break;
    }

    /* ---------------- CIRCULAR / RADIAL ---------------- */
    case "circular_wave": {
      const baseR = Math.max(10, 62 * size * frameScale(canvasHeight));
      const numBars = compact ? 40 : 64;
      const bars = getBars(key, numBars, elapsed, bus, source, reactivity);
      const hub = ctx.createRadialGradient(0, 0, 1, 0, 0, baseR);
      hub.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      hub.addColorStop(0.35, rgba(primary, 0.75));
      hub.addColorStop(0.85, "rgba(8, 12, 22, 0.92)");
      hub.addColorStop(1, rgba(secondary, 0.9));
      ctx.fillStyle = hub;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(3, baseR - 3), 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = rgba(primary, 0.95);
      ctx.lineWidth = 3 + beat * 2;
      ctx.shadowColor = primary;
      ctx.shadowBlur = 18 * glow;
      ctx.stroke();
      ctx.shadowBlur = 0;

      for (let i = 0; i < numBars; i++) {
        const angle = (i / numBars) * Math.PI * 2 - Math.PI / 2 + elapsed * 0.06;
        const v = bars.values[i];
        const len = Math.max(3, v * 82 * size * frameScale(canvasHeight));
        const r1 = baseR + 3;
        const r2 = r1 + len;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const grad = ctx.createLinearGradient(c * r1, s * r1, c * r2, s * r2);
        grad.addColorStop(0, mixColors(primary, "#ffffff", 0.25));
        grad.addColorStop(1, mixColors(secondary, primary, i / numBars));
        ctx.beginPath();
        ctx.moveTo(c * r1, s * r1);
        ctx.lineTo(c * r2, s * r2);
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(3, 4.6 * size);
        ctx.shadowColor = primary;
        ctx.shadowBlur = 9 * glow;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(c * (r2 + 5 * size), s * (r2 + 5 * size), Math.max(1.2, 2.1 * size), 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }

      // rotating sweep arc for a "live analyser" feel
      ctx.beginPath();
      ctx.arc(0, 0, baseR + 10 + beat * 8, elapsed * 1.6, elapsed * 1.6 + 0.7);
      ctx.strokeStyle = rgba(primary, 0.5);
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }

    /* ---------------- AUDIO ORB (centre stage, logo in the middle) ---------------- */
    // The reference-style centre visualiser: a ring of spectrum spikes around a
    // glowing hub that can hold the user's own logo. Nothing is drawn in the
    // hub unless the project has a logo — no third-party mark is ever used.
    case "audio_orb": {
      const scale = frameScale(canvasHeight);
      const stage = Math.max(0.4, Math.min(1.7, size));
      const ringR = Math.max(14, 74 * scale * stage);
      const maxLen = Math.max(10, 92 * scale * stage) * Math.min(1.9, Math.max(0.5, reactivity));
      const spokes = Math.max(48, Math.min(160, bandCount));
      const orbBars = getBars(key, spokes, elapsed, bus, source, reactivity);
      const spin = elapsed * 0.28;
      const coreR = ringR * (0.78 + orbBars.low * 0.12);

      // ambience behind the whole orb
      softGlow(ctx, 0, 0, ringR * 3.4, rgba(accent, 0.12 + orbBars.low * 0.16), rgba(primary, 0.08), 1);

      // spectrum: every spoke reads one band, mirrored so the orb is symmetric
      for (let i = 0; i < spokes; i++) {
        const band = orbBars.values[i % orbBars.values.length] || 0;
        const mirror = Math.floor(i / 2);
        const v = i % 2 === 0 ? band : orbBars.values[(spokes - mirror - 1 + spokes) % spokes] || band;
        const angle = (i / spokes) * Math.PI * 2 - Math.PI / 2 + spin;
        const len = ringR * 0.12 + Math.pow(v, 0.86) * maxLen;
        const x0 = Math.cos(angle) * ringR;
        const y0 = Math.sin(angle) * ringR;
        const x1 = Math.cos(angle) * (ringR + len);
        const y1 = Math.sin(angle) * (ringR + len);

        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, rgba(primary, 0.9));
        grad.addColorStop(0.55, rgba(secondary, 0.92));
        grad.addColorStop(1, rgba(accent, 0.95));
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(1.4, (Math.PI * 2 * ringR) / spokes * 0.55);
        if (glow > 0.05) {
          ctx.shadowColor = rgba(secondary, 0.85);
          ctx.shadowBlur = (8 + v * 22 + beat * 14) * glow;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // hot tip on the loud bands
        if (v > 0.55) {
          ctx.fillStyle = rgba(accent, Math.min(1, (v - 0.55) * 2));
          ctx.beginPath();
          ctx.arc(x1, y1, Math.max(1.1, 2.4 * scale * stage), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // the ring the spikes sit on, plus three sweeping arcs
      ctx.beginPath();
      ctx.arc(0, 0, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(mixColors(primary, "#ffffff", 0.3), 0.75);
      ctx.lineWidth = Math.max(1.2, 3 * scale * stage);
      if (glow > 0.05) {
        ctx.shadowColor = primary;
        ctx.shadowBlur = 16 * glow;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      for (let a = 0; a < 3; a++) {
        ctx.beginPath();
        ctx.arc(0, 0, ringR * 1.16, spin * 2 + (a * Math.PI * 2) / 3, spin * 2 + (a * Math.PI * 2) / 3 + 0.5);
        ctx.strokeStyle = rgba(accent, 0.45 - a * 0.08);
        ctx.lineWidth = Math.max(1, 2.2 * scale * stage);
        ctx.stroke();
      }

      // beat shockwave
      if (beat > 0.18) {
        const t = (elapsed * 0.75) % 1;
        ctx.beginPath();
        ctx.arc(0, 0, ringR + t * ringR * 2.2, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(accent, 0.5 * beat * (1 - t));
        ctx.lineWidth = Math.max(1, ringR * 0.05 * (1 - t));
        ctx.stroke();
      }

      drawCentreCore(ctx, coreR, { primary, secondary, accent }, {
        logo: wantsCentreLogo(item) ? opts.logo : null,
        beat,
        low: orbBars.low,
        glow,
      });
      break;
    }

    /* ---------------- ORBIT DISC (centre stage, spinning label) ---------------- */
    // A record-like disc seen at a slight tilt: grooves, a light sweep, spikes
    // firing off the rim and the user's logo on the label.
    case "orbit_disc": {
      const scale = frameScale(canvasHeight);
      const stage = Math.max(0.4, Math.min(1.7, size));
      const discR = Math.max(16, 88 * scale * stage);
      const tilt = 0.66;                                  // vertical squash = looking at it from above
      const spikes = Math.max(48, Math.min(144, bandCount));
      const discBars = getBars(key, spikes, elapsed, bus, source, reactivity);
      const spin = elapsed * 0.5;
      const maxSpike = Math.max(10, 74 * scale * stage) * Math.min(1.9, Math.max(0.5, reactivity));

      softGlow(ctx, 0, 0, discR * 2.6, rgba(primary, 0.14 + discBars.low * 0.14), rgba(secondary, 0.08), 1);

      // the disc body
      ctx.save();
      ctx.scale(1, tilt);
      const body = ctx.createRadialGradient(-discR * 0.3, -discR * 0.35, discR * 0.1, 0, 0, discR);
      body.addColorStop(0, rgba(mixColors(primary, "#ffffff", 0.12), 0.95));
      body.addColorStop(0.6, "rgba(10, 13, 22, 0.94)");
      body.addColorStop(1, "rgba(6, 8, 16, 0.98)");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, discR, 0, Math.PI * 2);
      ctx.fill();

      // grooves: thin rings that shimmer with the top end
      const high = discBars.high;
      for (let g = 1; g <= 7; g++) {
        const gr = (discR * g) / 8;
        ctx.beginPath();
        ctx.arc(0, 0, gr, spin, spin + Math.PI * 1.97);
        ctx.strokeStyle = rgba(mixColors(secondary, accent, g / 8), 0.14 + high * 0.22);
        ctx.lineWidth = Math.max(0.8, discR * 0.018);
        ctx.stroke();
      }

      // rim
      ctx.beginPath();
      ctx.arc(0, 0, discR, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(mixColors(primary, "#ffffff", 0.35), 0.8);
      ctx.lineWidth = Math.max(1.4, discR * 0.045);
      if (glow > 0.05) {
        ctx.shadowColor = primary;
        ctx.shadowBlur = 20 * glow * (0.7 + beat * 0.8);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // light sweep across the surface
      const sweep = ctx.createLinearGradient(-discR, -discR, discR, discR);
      const phase = (spin * 0.6) % 1;
      sweep.addColorStop(Math.max(0, phase - 0.18), "rgba(255,255,255,0)");
      sweep.addColorStop(Math.min(1, phase), "rgba(255,255,255,0.16)");
      sweep.addColorStop(Math.min(1, phase + 0.18), "rgba(255,255,255,0)");
      ctx.fillStyle = sweep;
      ctx.beginPath();
      ctx.arc(0, 0, discR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // spectrum spikes firing outward from the rim
      for (let i = 0; i < spikes; i++) {
        const v = discBars.values[i % discBars.values.length] || 0;
        const angle = (i / spikes) * Math.PI * 2 - Math.PI / 2 + spin * 0.35;
        const c = Math.cos(angle);
        const sn = Math.sin(angle) * tilt;
        const len = discR * 0.06 + Math.pow(v, 0.85) * maxSpike;
        ctx.beginPath();
        ctx.moveTo(c * discR * 1.02, sn * discR * 1.02);
        ctx.lineTo(c * (discR * 1.02 + len), sn * (discR * 1.02 + len));
        ctx.strokeStyle = rgba(mixColors(primary, accent, Math.min(1, v)), 0.35 + v * 0.6);
        ctx.lineWidth = Math.max(1, discR * 0.02);
        if (glow > 0.05) {
          ctx.shadowColor = rgba(secondary, 0.8);
          ctx.shadowBlur = (6 + v * 16) * glow;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // the label: the user's logo, or a plain pulsing core
      drawCentreCore(ctx, discR * 0.47, { primary, secondary, accent }, {
        logo: wantsCentreLogo(item) ? opts.logo : null,
        beat,
        low: discBars.low,
        glow,
      });

      // beat ring rippling out across the disc
      if (beat > 0.2) {
        const t = (elapsed * 0.7) % 1;
        ctx.save();
        ctx.scale(1, tilt);
        ctx.beginPath();
        ctx.arc(0, 0, discR * (0.3 + t * 1.1), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(accent, 0.4 * beat * (1 - t));
        ctx.lineWidth = Math.max(1, discR * 0.04 * (1 - t));
        ctx.stroke();
        ctx.restore();
      }
      break;
    }

    /* ---------------- VOICE PULSE / ENERGY RING ---------------- */
    case "pulse_circle":
    case "voice_pulse":
    case "energy_ring": {
      const isRing = item.type === "energy_ring";
      const baseR = Math.max(9, 58 * size * frameScale(canvasHeight));
      const c1 = isRing ? "#f43f5e" : primary;
      const c2 = isRing ? "#fb923c" : secondary;
      const rings = compact ? 3 : 5;

      for (let i = 0; i < rings; i++) {
        const phase = ((elapsed * (0.55 + i * 0.09)) + i / rings) % 1;
        const r = baseR + phase * (70 + beat * 60) * size * frameScale(canvasHeight);
        const alpha = (1 - phase) * (0.5 + beat * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1, r), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(i % 2 === 0 ? c1 : c2, alpha * 0.75);
        ctx.lineWidth = Math.max(1.2, (3.4 - phase * 2.4) * size);
        ctx.shadowColor = c1;
        ctx.shadowBlur = 16 * glow * (1 - phase);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // pulsing core
      const coreR = Math.max(2, (18 + beat * 14) * size * frameScale(canvasHeight));
      const core = ctx.createRadialGradient(0, 0, 1, 0, 0, coreR);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.45, rgba(c1, 0.95));
      core.addColorStop(1, rgba(c2, 0));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.fill();

      // inner glass disc so the shadow reads as a floating object
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2, baseR * 0.72), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
      ctx.lineWidth = Math.max(1, 2 * size);
      ctx.stroke();
      break;
    }

    /* ---------------- MINIMAL AI TALKING DOTS ---------------- */
    case "minimal_voice": {
      const colors = [primary, "#ef4444", "#f59e0b", "#10b981"];
      // Sized against the frame (not the 720p reference) so the little cluster
      // stays clearly visible in the video and in the studio thumbnails.
      const dotW = Math.max(7, canvasHeight * 0.026 * size);
      const spacing = dotW * 2.35;
      const startX = -((colors.length - 1) * spacing) / 2;

      colors.forEach((color, i) => {
        const local = Math.max(0, Math.sin(elapsed * 9.5 + i * 1.25)) * (0.35 + beat * 0.9);
        const h = Math.max(dotW, dotW + local * canvasHeight * 0.14 * size * reactivity);
        const by = -h / 2;
        const bx = startX + i * spacing;

        // floor shadow ellipse
        ctx.beginPath();
        ctx.ellipse(bx, h / 2 + 5 * size, dotW * (0.7 + local * 0.2), dotW * 0.3, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fill();

        const grad = ctx.createLinearGradient(bx - dotW, by, bx + dotW, by + h);
        grad.addColorStop(0, mixColors(color, "#ffffff", 0.35));
        grad.addColorStop(0.45, color);
        grad.addColorStop(1, mixColors(color, "#000000", 0.35));
        ctx.fillStyle = grad;
        if (glow > 0.05) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 14 * glow;
        }
        roundRectPath(ctx, bx - dotW / 2, by, dotW, h, dotW / 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // glossy bulb
        ctx.beginPath();
        ctx.arc(bx - dotW * 0.12, by + dotW * 0.42, dotW * 0.24, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fill();
      });
      break;
    }

    /* ---------------- FALLBACK ---------------- */
    default: {
      const width = fullWidth ? canvasWidth : Math.max(240, 560 * size);
      const count = Math.max(24, Math.min(96, Math.round(width / (thickness + 5))));
      const bars = getBars(key, count, elapsed, bus, source, reactivity);
      drawBarRack(ctx, {
        width,
        count,
        barWidth: thickness,
        gap: Math.max(2, thickness * 0.45),
        maxHeight: body * 0.8,
        values: bars.values,
        peaks: bars.peaks,
        primary,
        secondary,
        has3D,
        glow,
      });
      break;
    }
  }

  ctx.restore();
}
