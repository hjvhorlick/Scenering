import type { TimelineInsert, InsertVisualOptions } from "../types";
import {
  type AudioBus,
  type AudioFrame,
  type ReactionSource,
  EMPTY_FRAME,
  getBars,
  hasSignal,
  pickBus,
  reactiveBeat,
} from "./audio-reactive";
import { rgba, mixColors, softGlow } from "./visualizer-colors";
import { resolveVisualizerPalette } from "./visualizer-palettes";

/**
 * Scenering-native advanced visualiser engine.
 *
 * This is intentionally not a copied third-party app. It consumes the same
 * AudioFrame telemetry as the legacy visualisers, then maps it through an
 * explicit frequency/band layer and deterministic radial geometry. Preview,
 * thumbnails and final export can therefore call the same renderer.
 */

export const ADVANCED_VISUALIZER_TYPES = ["fine_radial_bars"] as const;
export type AdvancedVisualizerType = (typeof ADVANCED_VISUALIZER_TYPES)[number];

export type AdvancedFrequencyMapping = "linear" | "logarithmic" | "musical";
export type AdvancedRadialDirection = "outward" | "inward" | "both";

export const ADVANCED_FFT_SIZES = [512, 1024, 2048, 4096] as const;
export type AdvancedFftSize = (typeof ADVANCED_FFT_SIZES)[number];

export interface AdvancedFineRadialSettings {
  barCount: number;
  barThickness: number;
  barGap: number;
  radiusRatio: number;
  maxHeightRatio: number;
  minHeightRatio: number;
  direction: AdvancedRadialDirection;
  mapping: AdvancedFrequencyMapping;
  minFrequency: number;
  maxFrequency: number;
  fftSize: AdvancedFftSize;
  reactivity: number;
  smoothing: number;
  attack: number;
  release: number;
  rotationDeg: number;
  voiceMode: boolean;
  glow: number;
  bloom: number;
  opacity: number;
  beatEnabled: boolean;
  beatExpansion: number;
  beatGlow: number;
  centreLogo: boolean;
  centreScale: number;
  centreOpacity: number;
}

export interface AdvancedBandSnapshot {
  values: Float32Array;
  raw: Float32Array;
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  beat: number;
}

interface AdvancedState {
  smooth: Float32Array;
  lastT: number;
  bassHistory: number;
  beat: number;
  touched: number;
}

const states = new Map<string, AdvancedState>();
const MAX_STATES = 64;
const ASSUMED_SAMPLE_RATE = 48_000;
const TAU = Math.PI * 2;

export const FINE_RADIAL_PROFESSIONAL_DEFAULTS: AdvancedFineRadialSettings = {
  barCount: 256,
  barThickness: 2,
  barGap: 0.42,
  radiusRatio: 0.245,
  maxHeightRatio: 0.18,
  minHeightRatio: 0.006,
  direction: "outward",
  mapping: "logarithmic",
  minFrequency: 36,
  maxFrequency: 16_000,
  fftSize: 2048,
  reactivity: 1.06,
  smoothing: 0.38,
  attack: 0.72,
  release: 0.28,
  rotationDeg: -90,
  voiceMode: false,
  glow: 0.46,
  bloom: 0.32,
  opacity: 0.94,
  beatEnabled: true,
  beatExpansion: 0.045,
  beatGlow: 0.35,
  centreLogo: true,
  centreScale: 1,
  centreOpacity: 1,
};

export const FINE_RADIAL_PRESET_PATCHES: Record<string, Partial<InsertVisualOptions>> = {
  professional: {
    visualizerStyle: "fine_radial_bars",
    visualizerPreset: "professional",
    colorTheme: "gold",
    bandCount: 256,
    elementCount: 256,
    barThickness: 2,
    barGap: 0.42,
    radialRadius: 0.245,
    maxBarHeight: 0.18,
    minBarHeight: 0.006,
    radialDirection: "outward",
    frequencyMapping: "logarithmic",
    minFrequency: 36,
    maxFrequency: 16000,
    fftSize: 2048,
    reactivity: 1.06,
    smoothing: 0.38,
    attack: 0.72,
    release: 0.28,
    glowIntensity: 0.46,
    bloomIntensity: 0.32,
    beatResponse: true,
    beatExpansion: 0.045,
    beatGlow: 0.35,
    voiceMode: false,
    centreLogo: true,
    centreScale: 1,
    centreOpacity: 1,
    fullWidth: false,
    has3DLook: false,
    floatShadow: true,
  },
  minimal_voice: {
    visualizerStyle: "fine_radial_bars",
    visualizerPreset: "minimal_voice",
    colorTheme: "mono",
    bandCount: 192,
    elementCount: 192,
    barThickness: 2,
    barGap: 0.55,
    radialRadius: 0.225,
    maxBarHeight: 0.13,
    radialDirection: "both",
    frequencyMapping: "logarithmic",
    minFrequency: 85,
    maxFrequency: 7200,
    fftSize: 1024,
    reactivity: 0.82,
    smoothing: 0.72,
    attack: 0.42,
    release: 0.18,
    glowIntensity: 0.2,
    bloomIntensity: 0.08,
    beatResponse: false,
    voiceMode: true,
  },
  neon_spectrum: {
    visualizerStyle: "fine_radial_bars",
    visualizerPreset: "neon_spectrum",
    colorTheme: "neon",
    bandCount: 256,
    elementCount: 256,
    barThickness: 2,
    barGap: 0.36,
    radialRadius: 0.235,
    maxBarHeight: 0.2,
    radialDirection: "outward",
    frequencyMapping: "musical",
    fftSize: 2048,
    reactivity: 1.2,
    smoothing: 0.32,
    attack: 0.82,
    release: 0.34,
    glowIntensity: 0.72,
    bloomIntensity: 0.45,
    beatResponse: true,
    beatExpansion: 0.07,
    beatGlow: 0.55,
  },
};

export function isAdvancedAudioVisualizerType(type: string): type is AdvancedVisualizerType {
  return (ADVANCED_VISUALIZER_TYPES as readonly string[]).includes(type);
}

export function advancedVisualizerSettings(vo: InsertVisualOptions | undefined): AdvancedFineRadialSettings {
  const d = FINE_RADIAL_PROFESSIONAL_DEFAULTS;
  const count = Math.round(Number(vo?.elementCount ?? vo?.bandCount ?? d.barCount));
  return {
    barCount: clampInt(count, 64, 512),
    barThickness: clamp(Number(vo?.barThickness ?? d.barThickness), 0.75, 12),
    barGap: clamp(Number(vo?.barGap ?? d.barGap), 0, 0.86),
    radiusRatio: clamp(Number(vo?.radialRadius ?? d.radiusRatio), 0.08, 0.42),
    maxHeightRatio: clamp(Number(vo?.maxBarHeight ?? d.maxHeightRatio), 0.035, 0.38),
    minHeightRatio: clamp(Number(vo?.minBarHeight ?? d.minHeightRatio), 0, 0.04),
    direction: normalDirection(vo?.radialDirection, d.direction),
    mapping: normalMapping(vo?.frequencyMapping, d.mapping),
    minFrequency: clamp(Number(vo?.minFrequency ?? d.minFrequency), 18, 4000),
    maxFrequency: clamp(Number(vo?.maxFrequency ?? d.maxFrequency), 500, 22_000),
    fftSize: normalFftSize(vo?.fftSize ?? d.fftSize),
    reactivity: clamp(Number(vo?.reactivity ?? d.reactivity), 0.2, 2.4),
    smoothing: clamp(Number(vo?.smoothing ?? d.smoothing), 0, 0.95),
    attack: clamp(Number(vo?.attack ?? d.attack), 0.04, 1),
    release: clamp(Number(vo?.release ?? d.release), 0.03, 1),
    rotationDeg: clamp(Number(vo?.rotation ?? d.rotationDeg), -360, 360),
    voiceMode: Boolean(vo?.voiceMode ?? d.voiceMode),
    glow: clamp(Number(vo?.glowIntensity ?? d.glow), 0, 1),
    bloom: clamp(Number(vo?.bloomIntensity ?? d.bloom), 0, 1),
    opacity: clamp(Number(vo?.visualizerOpacity ?? d.opacity), 0, 1),
    beatEnabled: vo?.beatResponse === undefined ? d.beatEnabled : Boolean(vo.beatResponse),
    beatExpansion: clamp(Number(vo?.beatExpansion ?? d.beatExpansion), 0, 0.18),
    beatGlow: clamp(Number(vo?.beatGlow ?? d.beatGlow), 0, 1),
    centreLogo: vo?.centreLogo === undefined ? d.centreLogo : Boolean(vo.centreLogo),
    centreScale: clamp(Number(vo?.centreScale ?? d.centreScale), 0.35, 1.8),
    centreOpacity: clamp(Number(vo?.centreOpacity ?? d.centreOpacity), 0, 1),
  };
}

export function advancedVisualizerFootprint(
  item: TimelineInsert,
  canvasWidth: number,
  canvasHeight: number
): { w: number; h: number } {
  const minDim = Math.min(canvasWidth, canvasHeight);
  const s = advancedVisualizerSettings(item.visualOptions);
  const size = clamp(Number(item.size || 1), 0.35, 2.4);
  const radius = minDim * s.radiusRatio * size;
  const maxH = minDim * s.maxHeightRatio * size;
  const glowPad = minDim * (0.03 + s.glow * 0.035 + s.bloom * 0.025);
  const outer = radius + maxH + glowPad + s.barThickness * 2;
  return { w: outer * 2, h: outer * 2 };
}

export function requiredVisualizerFftSize(inserts: TimelineInsert[] | undefined): AdvancedFftSize {
  let wanted: AdvancedFftSize = 512;
  for (const insert of inserts || []) {
    if (insert.category !== "audio_visualizers" && insert.category !== "speech_reactive" && insert.category !== "meditation") {
      continue;
    }
    if (!isAdvancedAudioVisualizerType(insert.type)) continue;
    const next = advancedVisualizerSettings(insert.visualOptions).fftSize;
    if (next > wanted) wanted = next;
  }
  return wanted;
}

export function resetAdvancedVisualizerState(keyPrefix?: string) {
  if (!keyPrefix) {
    states.clear();
    return;
  }
  Array.from(states.keys()).forEach((key) => {
    if (key.startsWith(keyPrefix)) states.delete(key);
  });
}

export interface AdvancedVisualizerRenderOptions {
  ctx: CanvasRenderingContext2D;
  item: TimelineInsert;
  canvasWidth: number;
  canvasHeight: number;
  elapsed: number;
  frame?: AudioFrame | null;
  compact?: boolean;
  logo?: CanvasImageSource | null;
}

export function renderAdvancedAudioVisualizer(opts: AdvancedVisualizerRenderOptions) {
  if (!isAdvancedAudioVisualizerType(opts.item.type)) return;
  renderFineRadialBars(opts);
}

function renderFineRadialBars({ ctx, item, canvasWidth, canvasHeight, elapsed, frame, compact, logo }: AdvancedVisualizerRenderOptions) {
  const vo = item.visualOptions || {};
  const settings = advancedVisualizerSettings(vo);
  const palette = resolveVisualizerPalette(vo);
  const source: ReactionSource = (item.audioSource as ReactionSource) || "music";
  const bus = pickBus(frame || EMPTY_FRAME, source);
  const key = `advanced:${item.id || item.type}:${item.type}`;
  const bands = analyseAdvancedBands(key, settings, elapsed, bus, source);

  const minDim = Math.min(canvasWidth, canvasHeight);
  const size = clamp(Number(item.size || 1), 0.35, 2.4);
  const radiusBase = minDim * settings.radiusRatio * size;
  const beatExpansion = settings.beatEnabled ? bands.beat * settings.beatExpansion : 0;
  const radius = radiusBase * (1 + beatExpansion);
  const maxHeight = minDim * settings.maxHeightRatio * size;
  const minHeight = Math.max(0, minDim * settings.minHeightRatio * size);
  const rotation = (settings.rotationDeg * Math.PI) / 180;
  const count = settings.barCount;
  const circumferenceSlot = (TAU * Math.max(1, radius)) / count;
  const fineWidth = circumferenceSlot * (1 - settings.barGap);
  const barWidth = clamp(Math.min(settings.barThickness * frameScale(canvasHeight), fineWidth), 0.55, Math.max(0.75, circumferenceSlot * 0.92));
  const direction = settings.direction;
  const glow = compact ? settings.glow * 0.42 : settings.glow;
  const bloom = compact ? 0 : settings.bloom;
  const globalOpacity = settings.opacity;
  const energy = Math.max(bands.energy, (bands.bass + bands.mid + bands.treble) / 3);

  ctx.save();
  ctx.globalAlpha *= globalOpacity;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (bloom > 0.02 || glow > 0.04) {
    const haloR = radius + maxHeight * (1.5 + bloom * 0.7);
    softGlow(
      ctx,
      0,
      0,
      haloR,
      rgba(palette.accent, 0.08 + energy * 0.08 + bands.beat * settings.beatGlow * 0.1),
      rgba(palette.primary, 0.05 + glow * 0.08),
      clamp(0.38 + bloom * 0.5, 0, 1)
    );
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.strokeStyle = rgba(mixColors(palette.primary, "#ffffff", 0.48), 0.36 + glow * 0.18);
  ctx.lineWidth = Math.max(0.65, barWidth * 0.42);
  if (glow > 0.03) {
    ctx.shadowColor = rgba(palette.primary, 0.58);
    ctx.shadowBlur = (4 + bands.beat * 10 * settings.beatGlow) * glow;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (settings.beatEnabled && bands.beat > 0.1) {
    const phase = (elapsed * 1.2) % 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius + phase * maxHeight * 1.55, 0, TAU);
    ctx.strokeStyle = rgba(palette.accent, bands.beat * (1 - phase) * 0.34);
    ctx.lineWidth = Math.max(0.6, barWidth * (1.1 - phase * 0.6));
    ctx.stroke();
  }

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const angle = t * TAU + rotation;
    const v = clamp(bands.values[i] || 0, 0, 1.6);
    const shaped = Math.pow(v, settings.voiceMode ? 0.92 : 0.78);
    const length = minHeight + shaped * maxHeight;
    const colour = colourForBand(palette.primary, palette.secondary, palette.accent, t, shaped, vo.frequencyColorMode || "gradient");

    let innerR = radius;
    let outerR = radius;
    if (direction === "inward") {
      innerR = Math.max(0, radius - length);
    } else if (direction === "both") {
      innerR = Math.max(0, radius - length * 0.5);
      outerR = radius + length * 0.5;
    } else {
      outerR = radius + length;
    }

    drawRadialLine(ctx, angle, innerR, outerR, barWidth, colour, palette.accent, glow, shaped, bands.beat, settings.beatGlow);
  }

  drawFineRadialCentre(ctx, {
    radius,
    minDim,
    settings,
    palette,
    logo: settings.centreLogo ? logo || null : null,
    beat: bands.beat,
    energy,
    low: bands.bass,
  });

  ctx.restore();
}

function analyseAdvancedBands(
  key: string,
  settings: AdvancedFineRadialSettings,
  elapsed: number,
  bus: AudioBus | null | undefined,
  source: ReactionSource
): AdvancedBandSnapshot {
  const count = settings.barCount;
  const raw = new Float32Array(count);
  const values = new Float32Array(count);
  const real = Boolean(bus && hasSignal(bus) && bus.freq && bus.freq.length > 8);

  if (real && bus?.freq) {
    mapRealSpectrum(bus.freq, raw, settings);
  } else {
    const fallback = getBars(`${key}:sample`, count, elapsed, bus, source, settings.reactivity);
    raw.set(fallback.values);
  }

  const st = stateFor(key, count, elapsed);
  const dt = elapsed <= st.lastT ? 1 / 30 : clamp(elapsed - st.lastT, 1 / 240, 0.25);
  if (elapsed < st.lastT || elapsed - st.lastT > 1.25) {
    st.smooth.set(raw);
  }
  st.lastT = elapsed;
  st.touched = elapsed;

  const attackRate = lerp(5, 84, settings.attack) * (1 - settings.smoothing * 0.36);
  const releaseRate = lerp(0.8, 32, settings.release) * (1 - settings.smoothing * 0.5);
  const neighbourMix = settings.smoothing * 0.32;

  for (let i = 0; i < count; i++) {
    const prev = st.smooth[i] || 0;
    let target = raw[i] || 0;
    if (neighbourMix > 0.001) {
      const l = raw[(i - 1 + count) % count] || target;
      const r = raw[(i + 1) % count] || target;
      target = target * (1 - neighbourMix) + ((l + r) * 0.5) * neighbourMix;
    }
    const rate = target > prev ? attackRate : releaseRate;
    const k = 1 - Math.exp(-rate * dt);
    const next = prev + (target - prev) * clamp(k, 0, 1);
    st.smooth[i] = next;
    values[i] = next;
  }

  const third = Math.max(1, Math.floor(count / 3));
  let bass = 0;
  let mid = 0;
  let treble = 0;
  for (let i = 0; i < count; i++) {
    if (i < third) bass += values[i];
    else if (i < third * 2) mid += values[i];
    else treble += values[i];
  }
  bass /= third;
  mid /= third;
  treble /= Math.max(1, count - third * 2);
  const energy = real ? clamp(Number(bus?.level || 0) * 1.8, 0, 1.4) : (bass + mid + treble) / 3;

  const onset = Math.max(0, bass - st.bassHistory);
  st.bassHistory = st.bassHistory + (bass - st.bassHistory) * (1 - Math.exp(-dt * 2.4));
  const analyserBeat = clamp(onset * 4.2 + reactiveBeat(elapsed, bus, source) * 0.22, 0, 1);
  st.beat = Math.max(analyserBeat, st.beat * Math.exp(-dt * 5.5));

  return {
    values,
    raw,
    bass,
    mid,
    treble,
    energy,
    beat: settings.voiceMode ? st.beat * 0.35 : st.beat,
  };
}

function mapRealSpectrum(freq: ArrayLike<number>, out: Float32Array, settings: AdvancedFineRadialSettings) {
  const n = freq.length;
  const nyquist = ASSUMED_SAMPLE_RATE / 2;
  const minHz = Math.min(settings.minFrequency, settings.maxFrequency - 1);
  const maxHz = Math.max(settings.maxFrequency, minHz + 1);
  for (let i = 0; i < out.length; i++) {
    const p0 = i / out.length;
    const p1 = (i + 1) / out.length;
    const f0 = mappedFrequency(p0, minHz, maxHz, settings.mapping);
    const f1 = mappedFrequency(p1, minHz, maxHz, settings.mapping);
    const b0 = clampInt(Math.floor((f0 / nyquist) * n), 0, n - 1);
    const b1 = clampInt(Math.ceil((f1 / nyquist) * n), b0 + 1, n);
    let sum = 0;
    let hits = 0;
    for (let b = b0; b < b1; b++) {
      sum += freq[b] || 0;
      hits++;
    }
    const raw = hits > 0 ? sum / hits / 255 : (freq[b0] || 0) / 255;
    const tilt = settings.voiceMode ? 1.18 - p0 * 0.28 : 0.9 + p0 * 0.92;
    const bassShare = Math.exp(-Math.pow(p0 / 0.22, 2));
    const speechPresence = Math.exp(-Math.pow((p0 - 0.34) / 0.22, 2));
    const shaped = Math.pow(raw, settings.voiceMode ? 0.88 : 0.72) * tilt * settings.reactivity;
    const speechBoost = settings.voiceMode ? speechPresence * 0.16 + bassShare * 0.06 : bassShare * 0.04;
    out[i] = clamp(shaped + speechBoost * Math.min(0.65, raw + 0.08), 0, 1.65);
  }
}

function mappedFrequency(t: number, minHz: number, maxHz: number, mapping: AdvancedFrequencyMapping): number {
  const p = clamp(t, 0, 1);
  if (mapping === "linear") return minHz + (maxHz - minHz) * p;
  const safeMin = Math.max(1, minHz);
  if (mapping === "musical") {
    const minMidi = 69 + 12 * Math.log2(safeMin / 440);
    const maxMidi = 69 + 12 * Math.log2(Math.max(safeMin + 1, maxHz) / 440);
    const midi = minMidi + (maxMidi - minMidi) * p;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  return safeMin * Math.pow(Math.max(safeMin + 1, maxHz) / safeMin, p);
}

function drawRadialLine(
  ctx: CanvasRenderingContext2D,
  angle: number,
  innerR: number,
  outerR: number,
  width: number,
  color: string,
  accent: string,
  glow: number,
  value: number,
  beat: number,
  beatGlow: number
) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x1 = c * innerR;
  const y1 = s * innerR;
  const x2 = c * outerR;
  const y2 = s * outerR;
  const grad = ctx.createLinearGradient(x1, y1, x2, y2);
  grad.addColorStop(0, rgba(color, 0.54));
  grad.addColorStop(0.62, rgba(mixColors(color, accent, value * 0.38), 0.92));
  grad.addColorStop(1, rgba(mixColors(accent, "#ffffff", Math.min(0.55, value * 0.4)), 0.98));
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = grad;
  ctx.lineWidth = width;
  if (glow > 0.02) {
    ctx.shadowColor = rgba(color, 0.68);
    ctx.shadowBlur = (2.5 + value * 13 + beat * beatGlow * 14) * glow;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawFineRadialCentre(
  ctx: CanvasRenderingContext2D,
  opts: {
    radius: number;
    minDim: number;
    settings: AdvancedFineRadialSettings;
    palette: { primary: string; secondary: string; accent: string };
    logo: CanvasImageSource | null;
    beat: number;
    energy: number;
    low: number;
  }
) {
  const { radius, settings, palette, logo } = opts;
  const coreR = radius * 0.54 * settings.centreScale;
  if (coreR <= 1 || settings.centreOpacity <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= settings.centreOpacity;

  const shell = ctx.createRadialGradient(-coreR * 0.2, -coreR * 0.24, coreR * 0.05, 0, 0, coreR);
  shell.addColorStop(0, rgba("#ffffff", 0.74));
  shell.addColorStop(0.32, rgba(palette.accent, 0.34 + opts.energy * 0.16));
  shell.addColorStop(0.78, rgba(palette.primary, 0.12));
  shell.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.arc(0, 0, coreR * (1 + opts.beat * 0.03), 0, TAU);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, coreR * 0.86, 0, TAU);
  ctx.strokeStyle = rgba(mixColors(palette.primary, "#ffffff", 0.38), 0.38 + opts.low * 0.2);
  ctx.lineWidth = Math.max(0.7, radius * 0.01);
  ctx.stroke();

  if (logo) {
    const anyLogo = logo as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
    const iw = Number(anyLogo.naturalWidth || anyLogo.width || 0);
    const ih = Number(anyLogo.naturalHeight || anyLogo.height || 0);
    if (iw > 0 && ih > 0) {
      const box = coreR * 1.24;
      const scale = Math.min(box / iw, box / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      try {
        ctx.drawImage(logo, -dw / 2, -dh / 2, dw, dh);
      } catch {}
    }
  }
  ctx.restore();
}

function colourForBand(primary: string, secondary: string, accent: string, t: number, value: number, mode: unknown): string {
  if (mode === "amplitude") return mixColors(primary, accent, clamp(value, 0, 1));
  if (mode === "frequency") return mixColors(primary, secondary, t);
  return mixColors(mixColors(primary, secondary, t), accent, clamp(value * 0.22, 0, 0.45));
}

function stateFor(key: string, count: number, elapsed: number): AdvancedState {
  let st = states.get(key);
  if (!st || st.smooth.length !== count) {
    st = {
      smooth: new Float32Array(count),
      lastT: elapsed,
      bassHistory: 0,
      beat: 0,
      touched: elapsed,
    };
    states.set(key, st);
    if (states.size > MAX_STATES) {
      let oldestKey: string | null = null;
      let oldest = Infinity;
      states.forEach((value, stateKey) => {
        if (value.touched < oldest) {
          oldest = value.touched;
          oldestKey = stateKey;
        }
      });
      if (oldestKey && oldestKey !== key) states.delete(oldestKey);
    }
  }
  return st;
}

function normalMapping(value: unknown, fallback: AdvancedFrequencyMapping): AdvancedFrequencyMapping {
  return value === "linear" || value === "logarithmic" || value === "musical" ? value : fallback;
}

function normalDirection(value: unknown, fallback: AdvancedRadialDirection): AdvancedRadialDirection {
  return value === "outward" || value === "inward" || value === "both" ? value : fallback;
}

function normalFftSize(value: unknown): AdvancedFftSize {
  const n = Number(value);
  if (n >= 4096) return 4096;
  if (n >= 2048) return 2048;
  if (n >= 1024) return 1024;
  return 512;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function frameScale(canvasHeight: number): number {
  return Math.max(0.62, Math.min(2.2, canvasHeight / 720));
}
