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
  AudioFrame,
  ReactionSource,
  EMPTY_FRAME,
  getBars,
  getWaveform,
  beatPulse,
  pickBus,
} from "./audio-reactive";

/* ------------------------------------------------------------------ *
 * Geometry helpers shared with hit-testing / dragging
 * ------------------------------------------------------------------ */

/** Compact visualisers: circular/radial shapes and the small talking-dot cluster.
 *  They are never stretched across the frame and can be dragged anywhere. */
const ROUND_TYPES = new Set([
  "circular_wave",
  "voice_pulse",
  "energy_ring",
  "pulse_circle",
  "radial_pulse",
  "minimal_voice",
]);

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

/** Extra visualisers added with the modernisation pass */
export const MODERN_VISUALIZER_TYPES = ["neon_ribbon", "led_meter_wall", "dot_matrix_eq"] as const;

export function isRoundVisualizer(type: string): boolean {
  return ROUND_TYPES.has(type);
}

export function isLinearVisualizer(type: string): boolean {
  return LINEAR_TYPES.has(type);
}

/** Full width unless the user switched it off (round types are never full width) */
export function isVisualizerFullWidth(item: TimelineInsert): boolean {
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
  if (ROUND_TYPES.has(type)) return Math.max(canvasHeight * 0.22 * Math.min(1.35, size), 34);
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
    // the talking-dot cluster is far smaller than the circular analysers
    const d = item.type === "minimal_voice" ? Math.max(120, 190 * size) : Math.max(150, 300 * size);
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
}

export function renderAudioVisualizer(opts: VisualizerOptions) {
  const { ctx, item, x, y, canvasWidth, canvasHeight, elapsed } = opts;
  const frame = opts.frame || EMPTY_FRAME;
  const compact = Boolean(opts.compact);

  const source: ReactionSource = (item.audioSource as ReactionSource) || "voice";
  const bus = pickBus(frame, source);
  const size = item.size || 1;
  const opts3d = item.visualOptions || {};
  const primary = opts3d.primaryColor || (opts3d.colorPreset === "crt_green" ? "#10b981" : "#38bdf8");
  const secondary = opts3d.secondaryColor || "#f43f5e";
  const has3D = opts3d.has3DLook !== false;
  const glow = Math.max(0, Math.min(1, opts3d.glowIntensity ?? 0.85));
  const reactivity = Math.max(0.2, Math.min(2.4, opts3d.reactivity ?? 1));
  const thickness = Math.max(2, Math.min(24, opts3d.barThickness ?? 8));
  const fullWidth = isVisualizerFullWidth(item);
  const body = visualizerBodyHeight(item, canvasHeight);
  const beat = beatPulse(elapsed, source);
  const key = `${item.id || item.type}:${item.type}`;

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
      const count = Math.max(18, Math.min(96, Math.round(width / (bar + bar * 0.6))));
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
      const count = Math.max(18, Math.min(112, Math.round(width / (bar + bar * 0.5))));
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
      const count = Math.max(14, Math.min(72, Math.round(width / (bar * 1.7))));
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
      const count = Math.max(14, Math.min(80, Math.round(width / (bar * 1.6))));
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
