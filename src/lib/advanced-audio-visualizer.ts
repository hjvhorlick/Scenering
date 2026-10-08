import type { TimelineInsert, InsertVisualOptions } from "../types";
import {
  type AudioBus,
  type AudioFrame,
  type ReactionSource,
  EMPTY_FRAME,
  getBars,
  getWaveform,
  hasSignal,
  pickBus,
  reactiveBeat,
} from "./audio-reactive";
import { rgba, mixColors, softGlow } from "./visualizer-colors";
import { resolveVisualizerPalette } from "./visualizer-palettes";
import {
  drawBottomLight,
  drawGlassBar,
  drawGlassOrb,
  drawGlassRadialStroke,
  drawLustrousSparkle,
  resolveSpacedBarLayout,
} from "./visualizer-materials";

/**
 * Scenering-native advanced visualiser engine.
 *
 * This is intentionally not a copied third-party app. It consumes the same
 * AudioFrame telemetry as the legacy visualisers, then maps it through an
 * explicit frequency/band layer and deterministic radial geometry. Preview,
 * thumbnails and final export can therefore call the same renderer.
 */

export const ADVANCED_VISUALIZER_TYPES = [
  "fine_radial_bars",
  "fine_radial_bars_3d",
  "flat_circular_spectrum",
  "circular_waveform",
  "circular_pulse",
  "advanced_spectrum_bars",
  "advanced_mirror_spectrum",
  "advanced_waveform",
  "particle_ring",
  "particle_ring_3d",
  "glass_orbit_bubbles",
  "glass_pulse_marbles",
  "smoke_orbit",
  "smoke_bloom",
  "glitter_gold_swirl",
  "glitter_silver_vortex",
  "glitter_opal_dust",
] as const;
export type AdvancedVisualizerType = (typeof ADVANCED_VISUALIZER_TYPES)[number];

export const ADVANCED_LINEAR_VISUALIZER_TYPES = [
  "advanced_spectrum_bars",
  "advanced_mirror_spectrum",
  "advanced_waveform",
] as const;

export function isAdvancedLinearVisualizerType(type: string): boolean {
  return (ADVANCED_LINEAR_VISUALIZER_TYPES as readonly string[]).includes(type);
}

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
  barRoundness: number;
  barShine: number;
  /** Multiplies the size of glass bubbles, smoke puffs and lustrous dust. */
  particleScale: number;
  /** Multiplies the number of atmospheric particle layers without changing audio mapping. */
  effectDensity: number;
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
  barCount: 128,
  barThickness: 4,
  barGap: 0.48,
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
  barRoundness: 1,
  barShine: 0.86,
  particleScale: 1,
  effectDensity: 1,
};

export const FINE_RADIAL_PRESET_PATCHES: Record<string, Partial<InsertVisualOptions>> = {
  professional: {
    visualizerStyle: "fine_radial_bars",
    visualizerPreset: "professional",
    colorTheme: "gold",
    bandCount: 128,
    elementCount: 128,
    barThickness: 4,
    barGap: 0.48,
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
    barRoundness: 1,
    barShine: 0.9,
    fullWidth: false,
    has3DLook: false,
    floatShadow: true,
  },
  minimal_voice: {
    visualizerStyle: "fine_radial_bars",
    visualizerPreset: "minimal_voice",
    colorTheme: "mono",
    bandCount: 96,
    elementCount: 96,
    barThickness: 4,
    barGap: 0.52,
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
    bandCount: 144,
    elementCount: 144,
    barThickness: 4,
    barGap: 0.46,
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
  fine_radial_3d: {
    visualizerStyle: "fine_radial_bars_3d",
    visualizerPreset: "fine_radial_3d",
    colorTheme: "arctic",
    bandCount: 112,
    elementCount: 112,
    barThickness: 5,
    barGap: 0.48,
    radialRadius: 0.225,
    maxBarHeight: 0.18,
    frequencyMapping: "logarithmic",
    fftSize: 2048,
    reactivity: 1.12,
    glowIntensity: 0.56,
    bloomIntensity: 0.28,
    beatResponse: true,
    barRoundness: 1,
    barShine: 0.86,
    has3DLook: true,
    fullWidth: false,
  },
  flat_circular_spectrum: {
    visualizerStyle: "flat_circular_spectrum",
    visualizerPreset: "flat_circular_spectrum",
    colorTheme: "ocean",
    bandCount: 112,
    elementCount: 112,
    barThickness: 5,
    barGap: 0.5,
    radialRadius: 0.23,
    maxBarHeight: 0.14,
    frequencyMapping: "logarithmic",
    fftSize: 2048,
    reactivity: 1,
    smoothing: 0.45,
    glowIntensity: 0.36,
    bloomIntensity: 0.16,
    fullWidth: false,
  },
  circular_waveform: {
    visualizerStyle: "circular_waveform",
    visualizerPreset: "circular_waveform",
    colorTheme: "vaporwave",
    bandCount: 192,
    elementCount: 192,
    barThickness: 3,
    radialRadius: 0.24,
    maxBarHeight: 0.13,
    fftSize: 1024,
    reactivity: 0.95,
    smoothing: 0.55,
    glowIntensity: 0.42,
    bloomIntensity: 0.18,
    voiceMode: true,
    fullWidth: false,
  },
  circular_pulse: {
    visualizerStyle: "circular_pulse",
    visualizerPreset: "circular_pulse",
    colorTheme: "fire",
    bandCount: 128,
    elementCount: 128,
    radialRadius: 0.22,
    maxBarHeight: 0.16,
    fftSize: 1024,
    reactivity: 1.15,
    smoothing: 0.52,
    glowIntensity: 0.58,
    bloomIntensity: 0.24,
    beatResponse: true,
    fullWidth: false,
  },
  advanced_spectrum_bars: {
    visualizerStyle: "advanced_spectrum_bars",
    visualizerPreset: "advanced_spectrum_bars",
    colorTheme: "molten_gold",
    bandCount: 40,
    elementCount: 40,
    barThickness: 22,
    barGap: 0.3,
    maxBarHeight: 0.27,
    frequencyMapping: "logarithmic",
    fftSize: 2048,
    reactivity: 1.36,
    smoothing: 0.22,
    attack: 0.9,
    release: 0.42,
    spectrumBalance: 0,
    spectrumStretch: 1.2,
    spectrumWidth: 1,
    barRoundness: 1,
    barShine: 0.96,
    glowIntensity: 0.44,
    bloomIntensity: 0.18,
    fullWidth: true,
    has3DLook: true,
  },
  advanced_mirror_spectrum: {
    visualizerStyle: "advanced_mirror_spectrum",
    visualizerPreset: "advanced_mirror_spectrum",
    colorTheme: "silver_chrome",
    bandCount: 42,
    elementCount: 42,
    barThickness: 22,
    barGap: 0.32,
    maxBarHeight: 0.24,
    frequencyMapping: "musical",
    fftSize: 2048,
    reactivity: 1.32,
    smoothing: 0.26,
    attack: 0.88,
    release: 0.4,
    spectrumBalance: 0,
    spectrumStretch: 1.15,
    spectrumWidth: 1,
    barRoundness: 1,
    barShine: 0.96,
    glowIntensity: 0.46,
    bloomIntensity: 0.2,
    fullWidth: true,
    has3DLook: true,
  },
  advanced_waveform: {
    visualizerStyle: "advanced_waveform",
    visualizerPreset: "advanced_waveform",
    colorTheme: "glacial",
    bandCount: 160,
    elementCount: 160,
    barThickness: 5,
    maxBarHeight: 0.16,
    fftSize: 1024,
    reactivity: 1,
    smoothing: 0.58,
    glowIntensity: 0.52,
    voiceMode: true,
    fullWidth: true,
  },
  particle_ring: {
    visualizerStyle: "particle_ring",
    visualizerPreset: "particle_ring",
    colorTheme: "aurora",
    bandCount: 84,
    elementCount: 84,
    barThickness: 6,
    radialRadius: 0.23,
    maxBarHeight: 0.16,
    fftSize: 2048,
    reactivity: 1.08,
    smoothing: 0.42,
    glowIntensity: 0.55,
    bloomIntensity: 0.28,
    beatResponse: true,
    particleScale: 0.95,
    effectDensity: 1,
    fullWidth: false,
  },
  particle_ring_3d: {
    visualizerStyle: "particle_ring_3d",
    visualizerPreset: "particle_ring_3d",
    colorTheme: "synthwave",
    bandCount: 96,
    elementCount: 96,
    barThickness: 6,
    radialRadius: 0.22,
    maxBarHeight: 0.17,
    fftSize: 2048,
    reactivity: 1.12,
    smoothing: 0.38,
    glowIntensity: 0.62,
    bloomIntensity: 0.32,
    beatResponse: true,
    particleScale: 1.05,
    effectDensity: 1.15,
    has3DLook: true,
    fullWidth: false,
  },
  glass_orbit_bubbles: {
    visualizerStyle: "glass_orbit_bubbles",
    visualizerPreset: "glass_orbit_bubbles",
    colorTheme: "diamond_bright",
    bandCount: 72,
    elementCount: 72,
    barThickness: 10,
    radialRadius: 0.22,
    maxBarHeight: 0.16,
    fftSize: 2048,
    reactivity: 1.18,
    smoothing: 0.42,
    glowIntensity: 0.56,
    bloomIntensity: 0.3,
    beatResponse: true,
    beatExpansion: 0.075,
    particleScale: 1.15,
    effectDensity: 1,
    centreLogo: true,
    fullWidth: false,
  },
  glass_pulse_marbles: {
    visualizerStyle: "glass_pulse_marbles",
    visualizerPreset: "glass_pulse_marbles",
    colorTheme: "vaporwave",
    bandCount: 44,
    elementCount: 44,
    barThickness: 16,
    radialRadius: 0.19,
    maxBarHeight: 0.2,
    fftSize: 1024,
    reactivity: 1.25,
    smoothing: 0.34,
    glowIntensity: 0.7,
    bloomIntensity: 0.42,
    beatResponse: true,
    beatExpansion: 0.1,
    particleScale: 1.35,
    effectDensity: 0.9,
    centreLogo: true,
    has3DLook: true,
    fullWidth: false,
  },
  smoke_orbit: {
    visualizerStyle: "smoke_orbit",
    visualizerPreset: "smoke_orbit",
    colorTheme: "vaporwave",
    bandCount: 88,
    elementCount: 88,
    barThickness: 8,
    radialRadius: 0.22,
    maxBarHeight: 0.2,
    fftSize: 2048,
    reactivity: 1.22,
    smoothing: 0.64,
    glowIntensity: 0.74,
    bloomIntensity: 0.62,
    beatResponse: true,
    beatExpansion: 0.1,
    particleScale: 1.1,
    effectDensity: 1.1,
    centreLogo: true,
    fullWidth: false,
  },
  smoke_bloom: {
    visualizerStyle: "smoke_bloom",
    visualizerPreset: "smoke_bloom",
    colorTheme: "aurora",
    bandCount: 72,
    elementCount: 72,
    barThickness: 10,
    radialRadius: 0.18,
    maxBarHeight: 0.24,
    fftSize: 2048,
    reactivity: 1.32,
    smoothing: 0.56,
    glowIntensity: 0.78,
    bloomIntensity: 0.7,
    beatResponse: true,
    beatExpansion: 0.13,
    particleScale: 1.28,
    effectDensity: 1.2,
    centreLogo: true,
    fullWidth: false,
  },
  glitter_gold_swirl: {
    visualizerStyle: "glitter_gold_swirl",
    visualizerPreset: "glitter_gold_swirl",
    colorTheme: "molten_gold",
    bandCount: 104,
    elementCount: 104,
    barThickness: 5,
    radialRadius: 0.2,
    maxBarHeight: 0.22,
    fftSize: 2048,
    reactivity: 1.22,
    smoothing: 0.38,
    glowIntensity: 0.7,
    bloomIntensity: 0.4,
    beatResponse: true,
    beatExpansion: 0.11,
    particleScale: 1.05,
    effectDensity: 1.18,
    centreLogo: true,
    fullWidth: false,
  },
  glitter_silver_vortex: {
    visualizerStyle: "glitter_silver_vortex",
    visualizerPreset: "glitter_silver_vortex",
    colorTheme: "silver_chrome",
    bandCount: 112,
    elementCount: 112,
    barThickness: 5,
    radialRadius: 0.21,
    maxBarHeight: 0.2,
    fftSize: 2048,
    reactivity: 1.16,
    smoothing: 0.46,
    glowIntensity: 0.62,
    bloomIntensity: 0.38,
    beatResponse: true,
    beatExpansion: 0.09,
    particleScale: 0.95,
    effectDensity: 1.24,
    centreLogo: true,
    fullWidth: false,
  },
  glitter_opal_dust: {
    visualizerStyle: "glitter_opal_dust",
    visualizerPreset: "glitter_opal_dust",
    colorTheme: "candyfloss",
    bandCount: 96,
    elementCount: 96,
    barThickness: 6,
    radialRadius: 0.19,
    maxBarHeight: 0.24,
    fftSize: 2048,
    reactivity: 1.28,
    smoothing: 0.35,
    glowIntensity: 0.76,
    bloomIntensity: 0.48,
    beatResponse: true,
    beatExpansion: 0.12,
    particleScale: 1.1,
    effectDensity: 1.12,
    centreLogo: true,
    fullWidth: false,
  },
};

export function isAdvancedAudioVisualizerType(type: string): type is AdvancedVisualizerType {
  return (ADVANCED_VISUALIZER_TYPES as readonly string[]).includes(type);
}

export function advancedVisualizerSettings(vo: InsertVisualOptions | undefined): AdvancedFineRadialSettings {
  const d = FINE_RADIAL_PROFESSIONAL_DEFAULTS;
  const count = Math.round(Number(vo?.elementCount ?? vo?.bandCount ?? d.barCount));
  return {
    barCount: clampInt(count, 16, 512),
    barThickness: clamp(Number(vo?.barThickness ?? d.barThickness), 0.75, 36),
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
    barRoundness: clamp(Number(vo?.barRoundness ?? d.barRoundness), 0, 1),
    barShine: clamp(Number(vo?.barShine ?? (vo?.has3DLook ? Math.max(d.barShine, 0.72) : d.barShine)), 0, 1),
    particleScale: clamp(Number(vo?.particleScale ?? d.particleScale), 0.35, 3),
    effectDensity: clamp(Number(vo?.effectDensity ?? d.effectDensity), 0.35, 2.4),
  };
}

function rawAdvancedVisualizerFootprint(
  item: TimelineInsert,
  canvasWidth: number,
  canvasHeight: number
): { w: number; h: number } {
  const minDim = Math.min(canvasWidth, canvasHeight);
  const s = advancedVisualizerSettings(item.visualOptions);
  const size = clamp(Number(item.size || 1), 0.35, 2.4);
  if (isAdvancedLinearVisualizerType(item.type)) {
    return {
      w: item.visualOptions?.fullWidth === false ? Math.min(canvasWidth, minDim * 1.35 * size) : canvasWidth,
      h: Math.max(minDim * 0.18, minDim * (s.maxHeightRatio * 2.4 + 0.08) * size),
    };
  }
  const radius = minDim * s.radiusRatio * size;
  const maxH = minDim * s.maxHeightRatio * size;
  const glowPad = minDim * (0.03 + s.glow * 0.035 + s.bloom * 0.025);
  const atmospheric = [
    "glass_orbit_bubbles",
    "glass_pulse_marbles",
    "smoke_orbit",
    "smoke_bloom",
    "glitter_gold_swirl",
    "glitter_silver_vortex",
    "glitter_opal_dust",
  ].includes(item.type);
  const atmosphericSpread = atmospheric ? 1.55 : 1;
  const outer = (radius + maxH) * atmosphericSpread + glowPad + s.barThickness * 2 * (atmospheric ? s.particleScale : 1);
  return { w: outer * 2, h: outer * 2 };
}

export function advancedVisualizerFitScale(
  item: TimelineInsert,
  canvasWidth: number,
  canvasHeight: number
): number {
  if (isAdvancedLinearVisualizerType(item.type)) return 1;
  const raw = rawAdvancedVisualizerFootprint(item, canvasWidth, canvasHeight);
  const safeW = canvasWidth * 0.94;
  const safeH = canvasHeight * 0.94;
  return clamp(Math.min(1, safeW / Math.max(1, raw.w), safeH / Math.max(1, raw.h)), 0.1, 1);
}

export function advancedVisualizerFootprint(
  item: TimelineInsert,
  canvasWidth: number,
  canvasHeight: number
): { w: number; h: number } {
  const raw = rawAdvancedVisualizerFootprint(item, canvasWidth, canvasHeight);
  const fit = advancedVisualizerFitScale(item, canvasWidth, canvasHeight);
  return { w: raw.w * fit, h: raw.h * fit };
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
  switch (opts.item.type) {
    case "fine_radial_bars_3d":
      renderFineRadialBars3D(opts);
      return;
    case "flat_circular_spectrum":
      renderFlatCircularSpectrum(opts);
      return;
    case "circular_waveform":
      renderCircularWaveform(opts);
      return;
    case "circular_pulse":
      renderCircularPulse(opts);
      return;
    case "advanced_spectrum_bars":
      renderAdvancedSpectrumBars(opts, false);
      return;
    case "advanced_mirror_spectrum":
      renderAdvancedSpectrumBars(opts, true);
      return;
    case "advanced_waveform":
      renderAdvancedWaveform(opts);
      return;
    case "particle_ring":
      renderParticleRing(opts, false);
      return;
    case "particle_ring_3d":
      renderParticleRing(opts, true);
      return;
    case "glass_orbit_bubbles":
      renderGlassBubbles(opts, false);
      return;
    case "glass_pulse_marbles":
      renderGlassBubbles(opts, true);
      return;
    case "smoke_orbit":
      renderCircularSmoke(opts, false);
      return;
    case "smoke_bloom":
      renderCircularSmoke(opts, true);
      return;
    case "glitter_gold_swirl":
      renderGlitterSwirl(opts, "gold");
      return;
    case "glitter_silver_vortex":
      renderGlitterSwirl(opts, "silver");
      return;
    case "glitter_opal_dust":
      renderGlitterSwirl(opts, "opal");
      return;
    default:
      renderFineRadialBars(opts);
  }
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
  // Preserve the analyser's requested resolution, then display a deliberately
  // airier subset so even saved dense presets become wider, separated glass bars.
  const count = Math.max(16, Math.min(settings.barCount, Math.round(settings.barCount * 0.72)));
  const circumferenceSlot = (TAU * Math.max(1, radius)) / count;
  const fineWidth = circumferenceSlot * (1 - Math.max(settings.barGap, 0.42));
  const barWidth = clamp(Math.min(settings.barThickness * frameScale(canvasHeight) * 1.28, fineWidth), 0.75, Math.max(0.9, circumferenceSlot * 0.78));
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
    const v = clamp(sampleBandValue(bands.values, (i + 0.5) / count), 0, 1.6);
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

    drawRadialLine(ctx, angle, innerR, outerR, radius, barWidth, colour, palette.accent, glow, shaped, bands.beat, settings.beatGlow, settings.barRoundness, settings.barShine);
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

function renderFineRadialBars3D(opts: AdvancedVisualizerRenderOptions) {
  const { ctx, item, canvasWidth, canvasHeight, elapsed, frame, compact, logo } = opts;
  const vo = item.visualOptions || {};
  const settings = advancedVisualizerSettings(vo);
  const palette = resolveVisualizerPalette(vo);
  const source: ReactionSource = (item.audioSource as ReactionSource) || "music";
  const bus = pickBus(frame || EMPTY_FRAME, source);
  const bands = analyseAdvancedBands(`advanced:${item.id || item.type}:3d`, settings, elapsed, bus, source);
  const minDim = Math.min(canvasWidth, canvasHeight);
  const size = clamp(Number(item.size || 1), 0.35, 2.4);
  const radius = minDim * settings.radiusRatio * size * (1 + bands.beat * settings.beatExpansion);
  const maxHeight = minDim * settings.maxHeightRatio * size;
  const rotation = (settings.rotationDeg * Math.PI) / 180 + elapsed * 0.04;
  const count = Math.max(16, Math.min(settings.barCount, Math.round(settings.barCount * 0.72)));
  const slot = (TAU * Math.max(1, radius)) / count;
  const barWidth = clamp(Math.min(settings.barThickness * frameScale(canvasHeight) * 1.45, slot * (1 - Math.max(settings.barGap, 0.42))), 0.85, slot * 0.78);
  const depth = minDim * 0.018 * size * (1 + bands.beat * 0.8);
  const glow = compact ? settings.glow * 0.35 : settings.glow;

  ctx.save();
  ctx.globalAlpha *= settings.opacity;
  if (!compact) {
    ctx.save();
    ctx.scale(1, 0.28);
    ctx.beginPath();
    ctx.arc(0, radius * 0.18, radius + maxHeight * 0.92, 0, TAU);
    ctx.fillStyle = rgba(palette.primary, 0.05 + bands.bass * 0.04);
    ctx.shadowColor = rgba(palette.secondary, 0.45);
    ctx.shadowBlur = 22 * glow;
    ctx.fill();
    ctx.restore();
  }
  softGlow(ctx, 0, 0, radius + maxHeight * 1.7, rgba(palette.accent, 0.08), rgba(palette.primary, 0.06), 0.75 * glow);

  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => Math.sin((a / count) * TAU + rotation) - Math.sin((b / count) * TAU + rotation));
  for (const i of order) {
    const t = i / count;
    const angle = t * TAU + rotation;
    const v = clamp(sampleBandValue(bands.values, (i + 0.5) / count), 0, 1.6);
    const len = settings.minHeightRatio * minDim + Math.pow(v, 0.78) * maxHeight;
    const color = colourForBand(palette.primary, palette.secondary, palette.accent, t, v, vo.frequencyColorMode || "gradient");
    drawRadialPrism(ctx, angle, radius, radius + len, barWidth, depth, color, palette.accent, glow, v, settings.barRoundness, settings.barShine);
  }

  drawFineRadialCentre(ctx, {
    radius,
    minDim,
    settings,
    palette,
    logo: settings.centreLogo ? logo || null : null,
    beat: bands.beat,
    energy: bands.energy,
    low: bands.bass,
  });
  ctx.restore();
}

function renderFlatCircularSpectrum(opts: AdvancedVisualizerRenderOptions) {
  const { ctx, item, canvasWidth, canvasHeight, elapsed, frame, compact, logo } = opts;
  const vo = item.visualOptions || {};
  const settings = advancedVisualizerSettings(vo);
  const palette = resolveVisualizerPalette(vo);
  const source: ReactionSource = (item.audioSource as ReactionSource) || "music";
  const bus = pickBus(frame || EMPTY_FRAME, source);
  const bands = analyseAdvancedBands(`advanced:${item.id || item.type}:flat`, settings, elapsed, bus, source);
  const minDim = Math.min(canvasWidth, canvasHeight);
  const size = clamp(Number(item.size || 1), 0.35, 2.4);
  const radius = minDim * settings.radiusRatio * size * (1 + bands.beat * settings.beatExpansion * 0.6);
  const maxHeight = minDim * settings.maxHeightRatio * size;
  const rotation = (settings.rotationDeg * Math.PI) / 180 - Math.PI / 2;
  const count = settings.barCount;
  const glow = compact ? settings.glow * 0.45 : settings.glow;

  ctx.save();
  ctx.globalAlpha *= settings.opacity;
  softGlow(ctx, 0, 0, radius + maxHeight * 1.8, rgba(palette.primary, 0.08), rgba(palette.secondary, 0.06), glow);

  ctx.beginPath();
  for (let i = 0; i <= count; i++) {
    const idx = i % count;
    const t = idx / count;
    const v = clamp(bands.values[idx] || 0, 0, 1.4);
    const r = radius + Math.pow(v, 0.85) * maxHeight;
    const a = t * TAU + rotation;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const fill = ctx.createRadialGradient(0, 0, radius * 0.35, 0, 0, radius + maxHeight);
  fill.addColorStop(0, rgba(palette.primary, 0.02));
  fill.addColorStop(0.62, rgba(palette.primary, 0.2));
  fill.addColorStop(1, rgba(palette.secondary, 0.5));
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i <= count; i++) {
    const idx = i % count;
    const t = idx / count;
    const v = clamp(bands.values[idx] || 0, 0, 1.4);
    const r = radius + Math.pow(v, 0.85) * maxHeight;
    const a = t * TAU + rotation;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = rgba(palette.accent, 0.78);
  ctx.lineWidth = Math.max(1.2, settings.barThickness * frameScale(canvasHeight) * 0.55);
  ctx.shadowColor = rgba(palette.primary, 0.8);
  ctx.shadowBlur = 14 * glow;
  ctx.stroke();
  ctx.shadowBlur = 0;
  drawFineRadialCentre(ctx, { radius, minDim, settings, palette, logo: settings.centreLogo ? logo || null : null, beat: bands.beat, energy: bands.energy, low: bands.bass });
  ctx.restore();
}

function renderCircularWaveform(opts: AdvancedVisualizerRenderOptions) {
  const { ctx, item, canvasWidth, canvasHeight, elapsed, frame, compact, logo } = opts;
  const vo = item.visualOptions || {};
  const settings = advancedVisualizerSettings(vo);
  const palette = resolveVisualizerPalette(vo);
  const source: ReactionSource = (item.audioSource as ReactionSource) || "voice";
  const bus = pickBus(frame || EMPTY_FRAME, source);
  const count = settings.barCount;
  const wave = getWaveform(count, elapsed, bus, source, settings.reactivity);
  const bands = analyseAdvancedBands(`advanced:${item.id || item.type}:wave-ring`, settings, elapsed, bus, source);
  const minDim = Math.min(canvasWidth, canvasHeight);
  const size = clamp(Number(item.size || 1), 0.35, 2.4);
  const radius = minDim * settings.radiusRatio * size;
  const maxHeight = minDim * settings.maxHeightRatio * size;
  const rotation = (settings.rotationDeg * Math.PI) / 180 - Math.PI / 2;
  const glow = compact ? settings.glow * 0.45 : settings.glow;

  ctx.save();
  ctx.globalAlpha *= settings.opacity;
  softGlow(ctx, 0, 0, radius + maxHeight * 1.6, rgba(palette.secondary, 0.08), rgba(palette.primary, 0.04), glow);
  drawCircularTrace(ctx, wave, radius, maxHeight, rotation, rgba(palette.primary, 0.25), Math.max(4, settings.barThickness * 2.2), 22 * glow);
  drawCircularTrace(ctx, wave, radius, maxHeight, rotation, mixColors(palette.primary, palette.secondary, 0.45), Math.max(1.6, settings.barThickness * 0.75), 10 * glow);
  drawCircularTrace(ctx, wave, radius, maxHeight * 0.9, rotation, "#ffffff", Math.max(0.9, settings.barThickness * 0.22), 4 * glow);
  drawFineRadialCentre(ctx, { radius, minDim, settings, palette, logo: settings.centreLogo ? logo || null : null, beat: bands.beat, energy: bands.energy, low: bands.bass });
  ctx.restore();
}

function renderCircularPulse(opts: AdvancedVisualizerRenderOptions) {
  const { ctx, item, canvasWidth, canvasHeight, elapsed, frame, compact, logo } = opts;
  const vo = item.visualOptions || {};
  const settings = advancedVisualizerSettings(vo);
  const palette = resolveVisualizerPalette(vo);
  const source: ReactionSource = (item.audioSource as ReactionSource) || "music";
  const bus = pickBus(frame || EMPTY_FRAME, source);
  const bands = analyseAdvancedBands(`advanced:${item.id || item.type}:pulse`, settings, elapsed, bus, source);
  const minDim = Math.min(canvasWidth, canvasHeight);
  const size = clamp(Number(item.size || 1), 0.35, 2.4);
  const base = minDim * settings.radiusRatio * size;
  const maxHeight = minDim * settings.maxHeightRatio * size;
  const glow = compact ? settings.glow * 0.45 : settings.glow;
  ctx.save();
  ctx.globalAlpha *= settings.opacity;
  softGlow(ctx, 0, 0, base + maxHeight * 2.2, rgba(palette.accent, 0.14 + bands.bass * 0.08), rgba(palette.primary, 0.08), glow);
  for (let r = 0; r < 6; r++) {
    const phase = ((elapsed * (0.32 + r * 0.04) + r / 6) % 1);
    const rr = base * (0.62 + r * 0.12) + phase * maxHeight * (0.7 + bands.beat * 0.8);
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, TAU);
    ctx.strokeStyle = rgba(mixColors(palette.primary, palette.secondary, r / 6), (0.44 - r * 0.045) * (1 - phase * 0.55) + bands.beat * 0.12);
    ctx.lineWidth = Math.max(1, settings.barThickness * frameScale(canvasHeight) * (1.3 - r * 0.08));
    ctx.shadowColor = rgba(palette.accent, 0.75);
    ctx.shadowBlur = (10 + bands.beat * 22) * glow;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  drawFineRadialCentre(ctx, { radius: base, minDim, settings, palette, logo: settings.centreLogo ? logo || null : null, beat: bands.beat, energy: bands.energy, low: bands.bass });
  ctx.restore();
}

function renderAdvancedSpectrumBars(opts: AdvancedVisualizerRenderOptions, mirror: boolean) {
  const { ctx, item, canvasWidth, canvasHeight, elapsed, frame, compact } = opts;
  const vo = item.visualOptions || {};
  const settings = advancedVisualizerSettings(vo);
  const palette = resolveVisualizerPalette(vo);
  const source: ReactionSource = (item.audioSource as ReactionSource) || "music";
  const bus = pickBus(frame || EMPTY_FRAME, source);
  const sourceCount = Math.max(16, Math.min(192, settings.barCount));
  const bands = analyseAdvancedBands(
    `advanced:${item.id || item.type}:linear`,
    { ...settings, barCount: sourceCount },
    elapsed,
    bus,
    source
  );
  const minDim = Math.min(canvasWidth, canvasHeight);
  const size = clamp(Number(item.size || 1), 0.35, 2.4);
  const widthScale = clamp(Number(vo.spectrumWidth ?? 1), 0.45, 1.6);
  const baseWidth = item.visualOptions?.fullWidth === false ? Math.min(canvasWidth * 0.82, minDim * 1.35 * size) : canvasWidth * 0.92;
  const width = Math.min(canvasWidth * 1.6, baseWidth * widthScale);
  const maxH = minDim * settings.maxHeightRatio * size;
  // Wider clear bars need actual air between them. Preserve spectrum detail in
  // the source data, then sample it into the material-aware display layout.
  const layout = resolveSpacedBarLayout({
    width,
    count: sourceCount,
    requestedWidth: settings.barThickness,
    requestedGap: Math.max(2, settings.barThickness * (0.28 + settings.barGap * 0.45)),
    minWidth: 1.5,
  });
  const { count, slot, barWidth: barW, gap } = layout;
  const glow = compact ? settings.glow * 0.35 : settings.glow;
  const balance = clamp(Number(vo.spectrumBalance ?? 0), -1, 1);
  const spectrumStretch = clamp(Number(vo.spectrumStretch ?? 1.25), 0.5, 2);
  const activityCentre = 0.5 + balance * 0.34;

  ctx.save();
  ctx.globalAlpha *= settings.opacity;
  drawBottomLight(ctx, {
    y: 2,
    width: width * 0.62,
    height: Math.max(6, maxH * 0.15),
    primary: palette.primary,
    secondary: palette.secondary,
    accent: palette.accent,
    intensity: (0.34 + bands.bass * 0.3 + bands.beat * 0.18) * (0.55 + glow * 0.45),
  });
  ctx.beginPath();
  ctx.moveTo(-width / 2, 0);
  ctx.lineTo(width / 2, 0);
  ctx.strokeStyle = rgba(palette.accent, 0.42);
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const p = (i + 0.5) / count;
    // Keep the rack visually full without making it a mirror image. The direct
    // spectrum still decides which bars are tallest, while a broad energy wash
    // makes quiet sides participate so the whole graph feels alive.
    const shifted = clamp(0.5 + (p - 0.5) / spectrumStretch - balance * 0.38, 0, 1);
    const direct = sampleBandValue(bands.values, shifted);
    const nearby = (sampleBandValue(bands.values, shifted - 0.035) + sampleBandValue(bands.values, shifted + 0.035)) * 0.5;
    const centreWeight = clamp(1 - Math.abs(p - activityCentre) / 0.62, 0, 1);
    const bassWash = bands.bass * (0.1 + 0.2 * centreWeight);
    const midTexture = bands.mid * (0.08 + 0.1 * Math.pow(0.5 + 0.5 * Math.sin(p * TAU * 2.15 + elapsed * 1.7), 2));
    const trebleSpark = bands.treble * (0.05 + 0.09 * Math.pow(0.5 + 0.5 * Math.sin(p * TAU * 7.3 - elapsed * 5.2), 4));
    const liveEnergy = (bands.energy * 0.12 + bands.beat * 0.16) * (0.68 + 0.32 * Math.sin(i * 2.399 + elapsed * 4.1));
    const v = clamp((direct * 0.72 + nearby * 0.18 + bassWash + midTexture + trebleSpark + liveEnergy) * settings.reactivity, 0, 1.9);
    const h = Math.max(3, Math.pow(v, 0.64) * maxH);
    const x = -width / 2 + i * slot + gap / 2;
    const color = colourForBand(palette.primary, palette.secondary, palette.accent, t, v, vo.frequencyColorMode || "gradient");
    drawVerticalBar(ctx, x, 0, barW, h, color, palette.accent, glow, v, false, settings.barRoundness, settings.barShine);
    if (mirror) {
      drawVerticalBar(ctx, x, 0, barW, h * 0.88, mixColors(color, palette.secondary, 0.35), palette.accent, glow * 0.75, v, true, settings.barRoundness, settings.barShine);
    }
  }
  ctx.restore();
}
function renderAdvancedWaveform(opts: AdvancedVisualizerRenderOptions) {
  const { ctx, item, canvasWidth, canvasHeight, elapsed, frame, compact } = opts;
  const vo = item.visualOptions || {};
  const settings = advancedVisualizerSettings(vo);
  const palette = resolveVisualizerPalette(vo);
  const source: ReactionSource = (item.audioSource as ReactionSource) || "voice";
  const bus = pickBus(frame || EMPTY_FRAME, source);
  const minDim = Math.min(canvasWidth, canvasHeight);
  const size = clamp(Number(item.size || 1), 0.35, 2.4);
  const width = item.visualOptions?.fullWidth === false ? Math.min(canvasWidth * 0.82, minDim * 1.35 * size) : canvasWidth * 0.92;
  const points = Math.max(96, Math.min(384, settings.barCount * 2));
  const wave = getWaveform(points, elapsed, bus, source, settings.reactivity);
  const amp = minDim * settings.maxHeightRatio * size;
  const glow = compact ? settings.glow * 0.35 : settings.glow;
  ctx.save();
  ctx.globalAlpha *= settings.opacity;
  ctx.beginPath();
  ctx.moveTo(-width / 2, 0);
  for (let i = 0; i < points; i++) {
    const x = -width / 2 + (i / (points - 1)) * width;
    const y = wave[i] * amp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width / 2, 0);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, -amp, 0, amp);
  fill.addColorStop(0, rgba(palette.primary, 0.28));
  fill.addColorStop(0.5, rgba(palette.secondary, 0.22));
  fill.addColorStop(1, rgba(palette.primary, 0.24));
  ctx.fillStyle = fill;
  ctx.fill();
  drawLinearWaveTrace(ctx, wave, width, amp, rgba(palette.primary, 0.35), Math.max(4, settings.barThickness * 2.1), 24 * glow);
  drawLinearWaveTrace(ctx, wave, width, amp, mixColors(palette.primary, palette.secondary, 0.45), Math.max(1.6, settings.barThickness * 0.75), 10 * glow);
  drawLinearWaveTrace(ctx, wave, width, amp, "#ffffff", Math.max(0.9, settings.barThickness * 0.22), 4 * glow);
  ctx.restore();
}

function renderParticleRing(opts: AdvancedVisualizerRenderOptions, threeD: boolean) {
  const { ctx, item, canvasWidth, canvasHeight, elapsed, frame, compact, logo } = opts;
  const vo = item.visualOptions || {};
  const settings = advancedVisualizerSettings(vo);
  const palette = resolveVisualizerPalette(vo);
  const source: ReactionSource = (item.audioSource as ReactionSource) || "music";
  const bus = pickBus(frame || EMPTY_FRAME, source);
  const bands = analyseAdvancedBands(`advanced:${item.id || item.type}:particles`, settings, elapsed, bus, source);
  const minDim = Math.min(canvasWidth, canvasHeight);
  const size = clamp(Number(item.size || 1), 0.35, 2.4);
  const base = minDim * settings.radiusRatio * size * (1 + bands.beat * settings.beatExpansion);
  const spread = minDim * settings.maxHeightRatio * size;
  const count = Math.max(18, Math.min(compact ? 42 : 92, Math.round(settings.barCount * settings.effectDensity)));
  const glow = compact ? settings.glow * 0.45 : settings.glow;
  const spin = elapsed * (threeD ? 0.36 : 0.12);

  ctx.save();
  ctx.globalAlpha *= settings.opacity;
  drawBottomLight(ctx, {
    y: base * 0.88,
    width: base * 2.35,
    height: Math.max(5, base * 0.24),
    primary: palette.primary,
    secondary: palette.secondary,
    accent: palette.accent,
    intensity: 0.24 + glow * 0.22 + bands.bass * 0.2,
  });
  softGlow(ctx, 0, 0, base + spread * 1.8, rgba(palette.primary, 0.08 + bands.bass * 0.06), rgba(palette.secondary, 0.05), glow);
  const particles = Array.from({ length: count }, (_, i) => {
    const band = sampleBandValue(bands.values, (i + 0.5) / count);
    const a = (i / count) * TAU + spin * (0.7 + hash01(i) * 0.4);
    const jitter = (hash01(i * 17) - 0.5) * spread * 0.28;
    const r = base + Math.pow(band, 0.78) * spread + jitter;
    const z = threeD ? Math.sin(a * 1.1 + elapsed * 0.45 + hash01(i) * TAU) * base * 0.45 : 0;
    const perspective = threeD ? 1 / (1 + z / Math.max(1, base * 3.2)) : 1;
    return { i, a, r, z, perspective, band };
  }).sort((a, b) => a.z - b.z);

  for (const p of particles) {
    const x = Math.cos(p.a) * p.r * p.perspective;
    const y = Math.sin(p.a) * p.r * p.perspective;
    const t = p.i / Math.max(1, count - 1);
    const color = colourForBand(palette.primary, palette.secondary, palette.accent, t, p.band, vo.frequencyColorMode || "gradient");
    const orb = Math.max(1.4, (settings.barThickness * 0.36 + p.band * 6.4) * frameScale(canvasHeight) * settings.particleScale * p.perspective);
    drawGlassOrb(ctx, {
      x,
      y,
      radius: orb,
      primary: color,
      secondary: palette.secondary,
      accent: palette.accent,
      glow,
      value: p.band,
      shine: settings.barShine,
    });
    if (!compact && p.i % 6 === 0) {
      const x2 = Math.cos(p.a + 0.035) * (base + p.band * spread) * p.perspective;
      const y2 = Math.sin(p.a + 0.035) * (base + p.band * spread) * p.perspective;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = rgba(color, 0.14 + p.band * 0.16);
      ctx.lineWidth = Math.max(0.55, orb * 0.16);
      ctx.stroke();
    }
  }
  drawFineRadialCentre(ctx, {
    radius: base,
    minDim,
    settings,
    palette,
    logo: settings.centreLogo ? logo || null : null,
    beat: bands.beat,
    energy: bands.energy,
    low: bands.bass,
  });
  ctx.restore();
}

/** Two additional ball-based options: a floating glass orbit and a larger beat-pulsed marble set. */
function renderGlassBubbles(opts: AdvancedVisualizerRenderOptions, marbles: boolean) {
  const { ctx, item, canvasWidth, canvasHeight, elapsed, frame, compact, logo } = opts;
  const vo = item.visualOptions || {};
  const settings = advancedVisualizerSettings(vo);
  const palette = resolveVisualizerPalette(vo);
  const source: ReactionSource = (item.audioSource as ReactionSource) || "music";
  const bus = pickBus(frame || EMPTY_FRAME, source);
  const bands = analyseAdvancedBands(`advanced:${item.id || item.type}:glass-bubbles`, settings, elapsed, bus, source);
  const minDim = Math.min(canvasWidth, canvasHeight);
  const size = clamp(Number(item.size || 1), 0.35, 2.4);
  const base = minDim * settings.radiusRatio * size * (1 + bands.beat * settings.beatExpansion);
  const spread = minDim * settings.maxHeightRatio * size;
  const count = Math.max(14, Math.min(compact ? 30 : marbles ? 56 : 76, Math.round(settings.barCount * settings.effectDensity)));
  const glow = compact ? settings.glow * 0.46 : settings.glow;
  const spin = elapsed * (marbles ? 0.33 : 0.18);

  ctx.save();
  ctx.globalAlpha *= settings.opacity;
  drawBottomLight(ctx, {
    y: base + spread * 0.45,
    width: (base + spread) * 2.15,
    height: Math.max(6, minDim * 0.045),
    primary: palette.primary,
    secondary: palette.secondary,
    accent: palette.accent,
    intensity: 0.38 + bands.bass * 0.22 + bands.beat * 0.2,
  });
  softGlow(ctx, 0, 0, base + spread * 1.95, rgba(palette.accent, 0.1 + bands.bass * 0.09), rgba(palette.primary, 0.05), glow);
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const band = sampleBandValue(bands.values, t);
    const arm = marbles ? i % 2 : 0;
    const a = t * TAU + spin * (1 + arm * 0.38) + arm * Math.PI;
    const rise = Math.sin(elapsed * (1.5 + hash01(i * 9) * 0.75) + i * 0.71) * spread * (0.08 + band * 0.1);
    const radial = base + spread * (0.14 + Math.pow(band, 0.72) * (marbles ? 0.96 : 0.7)) + (marbles ? Math.sin(a * 2 + elapsed) * spread * 0.13 : 0);
    const x = Math.cos(a) * radial;
    const y = Math.sin(a) * radial + rise;
    const colour = colourForBand(palette.primary, palette.secondary, palette.accent, t, band, vo.frequencyColorMode || "gradient");
    const radius = Math.max(
      2,
      (settings.barThickness * (marbles ? 0.48 : 0.34) + band * (marbles ? 10 : 7)) * frameScale(canvasHeight) * settings.particleScale
    );
    drawGlassOrb(ctx, {
      x,
      y,
      radius,
      primary: colour,
      secondary: palette.secondary,
      accent: palette.accent,
      glow,
      value: band + bands.beat * 0.3,
      shine: Math.max(settings.barShine, 0.82),
    });
  }
  if (bands.beat > 0.16) {
    const phase = (elapsed * 0.9) % 1;
    ctx.beginPath();
    ctx.arc(0, 0, base + phase * (spread * 1.9 + base * 0.4), 0, TAU);
    ctx.strokeStyle = rgba(palette.accent, bands.beat * (1 - phase) * 0.32);
    ctx.lineWidth = Math.max(0.7, minDim * 0.004 * (1 - phase));
    ctx.stroke();
  }
  drawFineRadialCentre(ctx, {
    radius: base * 0.92,
    minDim,
    settings,
    palette,
    logo: settings.centreLogo ? logo || null : null,
    beat: bands.beat,
    energy: bands.energy,
    low: bands.bass,
  });
  ctx.restore();
}

/** Coloured translucent smoke circulates in arms and opens outward on the beat. */
function renderCircularSmoke(opts: AdvancedVisualizerRenderOptions, bloomStyle: boolean) {
  const { ctx, item, canvasWidth, canvasHeight, elapsed, frame, compact, logo } = opts;
  const vo = item.visualOptions || {};
  const settings = advancedVisualizerSettings(vo);
  const palette = resolveVisualizerPalette(vo);
  const source: ReactionSource = (item.audioSource as ReactionSource) || "music";
  const bus = pickBus(frame || EMPTY_FRAME, source);
  const bands = analyseAdvancedBands(`advanced:${item.id || item.type}:smoke`, settings, elapsed, bus, source);
  const minDim = Math.min(canvasWidth, canvasHeight);
  const size = clamp(Number(item.size || 1), 0.35, 2.4);
  const base = minDim * settings.radiusRatio * size;
  const spread = minDim * settings.maxHeightRatio * size;
  const puffCount = Math.max(30, Math.min(compact ? 48 : 112, Math.round(settings.barCount * settings.effectDensity)));
  const arms = bloomStyle ? 5 : 3;
  const glow = compact ? settings.glow * 0.42 : settings.glow;
  const expansion = 1 + bands.beat * (bloomStyle ? 0.36 : 0.24);

  ctx.save();
  ctx.globalAlpha *= settings.opacity;
  ctx.globalCompositeOperation = "lighter";
  softGlow(ctx, 0, 0, (base + spread * 2.2) * expansion, rgba(palette.primary, 0.12 + bands.bass * 0.12), rgba(palette.secondary, 0.06), glow);
  for (let i = 0; i < puffCount; i++) {
    const t = i / puffCount;
    const arm = i % arms;
    const local = Math.floor(i / arms) / Math.max(1, Math.ceil(puffCount / arms));
    const band = sampleBandValue(bands.values, (t + arm / arms * 0.21) % 1);
    const spin = elapsed * (0.36 + arm * 0.045 + bands.mid * 0.16);
    const angle = arm * (TAU / arms) + local * TAU * (bloomStyle ? 1.7 : 1.18) + spin;
    const wave = Math.sin(elapsed * 1.9 + i * 0.77) * spread * (0.08 + band * 0.12);
    const radius = (base * (0.76 + local * 0.37) + spread * (0.22 + Math.pow(band, 0.78)) + wave) * expansion;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const puffR = Math.max(2, minDim * (0.011 + hash01(i * 5 + arm) * 0.014) * settings.particleScale * (0.85 + band * 0.95));
    const colour = colourForBand(palette.primary, palette.secondary, palette.accent, (t + local * 0.25) % 1, band, vo.frequencyColorMode || "gradient");
    const puff = ctx.createRadialGradient(x - puffR * 0.18, y - puffR * 0.22, puffR * 0.04, x, y, puffR);
    puff.addColorStop(0, rgba(mixColors(colour, palette.accent, 0.34), 0.22 + band * 0.18));
    puff.addColorStop(0.42, rgba(colour, 0.13 + band * 0.13));
    puff.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = puff;
    ctx.beginPath();
    ctx.arc(x, y, puffR, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  if (bands.beat > 0.1) {
    const phase = (elapsed * (bloomStyle ? 0.82 : 1.05)) % 1;
    ctx.beginPath();
    ctx.arc(0, 0, (base + phase * (spread * 2.2 + base * 0.65)) * expansion, 0, TAU);
    ctx.strokeStyle = rgba(palette.accent, bands.beat * (1 - phase) * 0.34);
    ctx.lineWidth = Math.max(0.8, minDim * 0.005 * (1 - phase));
    ctx.stroke();
  }
  drawFineRadialCentre(ctx, {
    radius: base * 0.86,
    minDim,
    settings,
    palette,
    logo: settings.centreLogo ? logo || null : null,
    beat: bands.beat,
    energy: bands.energy,
    low: bands.bass,
  });
  ctx.restore();
}

/** Gold, silver and opal pixie dust spiral through distinct audio-driven arms. */
function renderGlitterSwirl(opts: AdvancedVisualizerRenderOptions, finish: "gold" | "silver" | "opal") {
  const { ctx, item, canvasWidth, canvasHeight, elapsed, frame, compact, logo } = opts;
  const vo = item.visualOptions || {};
  const settings = advancedVisualizerSettings(vo);
  const palette = resolveVisualizerPalette(vo);
  const source: ReactionSource = (item.audioSource as ReactionSource) || "music";
  const bus = pickBus(frame || EMPTY_FRAME, source);
  const bands = analyseAdvancedBands(`advanced:${item.id || item.type}:glitter`, settings, elapsed, bus, source);
  const minDim = Math.min(canvasWidth, canvasHeight);
  const size = clamp(Number(item.size || 1), 0.35, 2.4);
  const base = minDim * settings.radiusRatio * size;
  const spread = minDim * settings.maxHeightRatio * size;
  const count = Math.max(34, Math.min(compact ? 56 : 136, Math.round(settings.barCount * settings.effectDensity)));
  const arms = finish === "opal" ? 5 : finish === "silver" ? 4 : 3;
  const glow = compact ? settings.glow * 0.46 : settings.glow;
  const spin = elapsed * (0.46 + bands.mid * 0.25);

  ctx.save();
  ctx.globalAlpha *= settings.opacity;
  drawBottomLight(ctx, {
    y: base + spread * 0.54,
    width: (base + spread) * 2.05,
    height: Math.max(5, minDim * 0.036),
    primary: palette.primary,
    secondary: palette.secondary,
    accent: palette.accent,
    intensity: 0.24 + bands.bass * 0.19 + bands.beat * 0.24,
  });
  softGlow(ctx, 0, 0, base + spread * 2.35, rgba(palette.accent, 0.1 + bands.energy * 0.09), rgba(palette.primary, 0.05), glow);
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const arm = i % arms;
    const local = Math.floor(i / arms) / Math.max(1, Math.ceil(count / arms));
    const band = sampleBandValue(bands.values, (local + arm * 0.11) % 1);
    const angle = arm * (TAU / arms) + local * TAU * (1.2 + arm * 0.08) + spin * (0.75 + hash01(i) * 0.45);
    const burst = bands.beat * (0.2 + hash01(i * 17) * 0.38);
    const radial = base * (0.26 + local * 1.05) + spread * (0.18 + Math.pow(band, 0.7) * 1.15 + burst);
    const wobble = Math.sin(elapsed * 2.5 + i * 1.63) * spread * 0.12 * (0.4 + bands.treble);
    const x = Math.cos(angle) * (radial + wobble);
    const y = Math.sin(angle) * (radial + wobble);
    const colour = colourForBand(palette.primary, palette.secondary, palette.accent, (t + arm * 0.17) % 1, band, vo.frequencyColorMode || "gradient");
    const sparkleR = Math.max(0.9, minDim * (0.0026 + band * 0.006 + (i % 7 === 0 ? 0.004 : 0)) * settings.particleScale);
    if (i % 5 === 0) {
      drawGlassOrb(ctx, {
        x,
        y,
        radius: sparkleR * 0.82,
        primary: colour,
        secondary: palette.secondary,
        accent: palette.accent,
        glow: glow * 0.72,
        value: band,
        shine: settings.barShine,
      });
    } else {
      drawLustrousSparkle(ctx, {
        x,
        y,
        radius: sparkleR,
        primary: colour,
        accent: palette.accent,
        glow,
        rotation: angle + elapsed * (0.65 + hash01(i) * 0.5),
        opacity: 0.4 + band * 0.52 + bands.treble * 0.16,
      });
    }
  }
  if (bands.beat > 0.12) {
    const phase = (elapsed * 1.1) % 1;
    ctx.beginPath();
    ctx.arc(0, 0, base * 0.55 + phase * (base + spread * 1.65), 0, TAU);
    ctx.strokeStyle = rgba(palette.accent, bands.beat * (1 - phase) * 0.36);
    ctx.lineWidth = Math.max(0.6, minDim * 0.0035 * (1 - phase));
    ctx.stroke();
  }
  drawFineRadialCentre(ctx, {
    radius: base * 0.72,
    minDim,
    settings,
    palette,
    logo: settings.centreLogo ? logo || null : null,
    beat: bands.beat,
    energy: bands.energy,
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

function drawRadialPrism(
  ctx: CanvasRenderingContext2D,
  angle: number,
  innerR: number,
  outerR: number,
  width: number,
  depth: number,
  color: string,
  accent: string,
  glow: number,
  value: number,
  roundness: number,
  shine: number
) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tx = -s;
  const ty = c;
  const dx = Math.cos(angle - Math.PI / 4) * depth;
  const dy = Math.sin(angle - Math.PI / 4) * depth;
  const half = width / 2;
  const p1 = { x: c * innerR + tx * half, y: s * innerR + ty * half };
  const p2 = { x: c * outerR + tx * half, y: s * outerR + ty * half };
  const p3 = { x: c * outerR - tx * half, y: s * outerR - ty * half };
  const p4 = { x: c * innerR - tx * half, y: s * innerR - ty * half };
  ctx.save();
  const glossy = clamp(shine, 0, 1);
  if (glow > 0.02) {
    ctx.shadowColor = rgba(color, 0.54);
    ctx.shadowBlur = (2 + value * 10) * glow * (1 - glossy * 0.32);
  }
  const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
  grad.addColorStop(0, rgba(color, 0.56));
  grad.addColorStop(0.48, rgba(mixColors(color, accent, value * 0.4), 0.92));
  grad.addColorStop(1, rgba(mixColors(accent, "#ffffff", 0.34 + glossy * 0.24), 0.99));
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowBlur = 0;
  if (roundness >= 0.5 && width > 1.5) {
    ctx.beginPath();
    ctx.moveTo(c * innerR, s * innerR);
    ctx.lineTo(c * outerR, s * outerR);
    ctx.strokeStyle = rgba("#ffffff", 0.18 + glossy * 0.3);
    ctx.lineWidth = Math.max(0.7, width * 0.18);
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(p2.x, p2.y);
  ctx.lineTo(p2.x + dx, p2.y + dy);
  ctx.lineTo(p3.x + dx, p3.y + dy);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
  ctx.fillStyle = rgba(mixColors(color, "#000000", 0.28), 0.6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p2.x + dx, p2.y + dy);
  ctx.lineTo(p1.x + dx, p1.y + dy);
  ctx.closePath();
  ctx.fillStyle = rgba(mixColors(color, "#ffffff", 0.2), 0.22);
  ctx.fill();
  // Keep the prism depth, then lay the shared clear-glass material over its
  // face so the 3D variation belongs to the same bottom-lit family as every
  // other bar style.
  drawGlassRadialStroke(ctx, {
    x1: c * innerR,
    y1: s * innerR,
    x2: c * outerR,
    y2: s * outerR,
    baseX: c * innerR,
    baseY: s * innerR,
    width: Math.max(0.8, width * 0.66),
    primary: color,
    accent,
    glow: glow * 0.75,
    value,
    shine,
    round: roundness >= 0.5,
  });
  ctx.restore();
}

function drawCircularTrace(
  ctx: CanvasRenderingContext2D,
  wave: Float32Array,
  radius: number,
  amplitude: number,
  rotation: number,
  color: string,
  width: number,
  glow: number
) {
  const n = wave.length;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const idx = i % n;
    const a = (idx / n) * TAU + rotation;
    const r = radius + (wave[idx] || 0) * amplitude;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (glow > 0.02) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.stroke();
  ctx.restore();
}

function drawVerticalBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  accent: string,
  glow: number,
  value: number,
  mirror: boolean,
  roundness: number,
  shine: number
) {
  const rawTop = mirror ? y : y - height;
  const rawBottom = mirror ? y + height : y;
  const top = Math.round(Math.min(rawTop, rawBottom));
  const h = Math.max(2, Math.round(Math.abs(rawBottom - rawTop)));
  drawGlassBar(ctx, {
    x: Math.round(x),
    y: top,
    width: Math.max(2, Math.round(width)),
    height: h,
    primary: color,
    accent,
    glow,
    value,
    roundness,
    shine,
  });
}
function drawLinearWaveTrace(
  ctx: CanvasRenderingContext2D,
  wave: Float32Array,
  width: number,
  amp: number,
  color: string,
  lineWidth: number,
  glow: number
) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < wave.length; i++) {
    const x = -width / 2 + (i / Math.max(1, wave.length - 1)) * width;
    const y = (wave[i] || 0) * amp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (glow > 0.02) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.stroke();
  ctx.restore();
}

function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function drawRadialLine(
  ctx: CanvasRenderingContext2D,
  angle: number,
  innerR: number,
  outerR: number,
  baseR: number,
  width: number,
  color: string,
  accent: string,
  glow: number,
  value: number,
  beat: number,
  beatGlow: number,
  roundness: number,
  shine: number
) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  drawGlassRadialStroke(ctx, {
    x1: c * innerR,
    y1: s * innerR,
    x2: c * outerR,
    y2: s * outerR,
    baseX: c * baseR,
    baseY: s * baseR,
    width: Math.max(1, width),
    primary: color,
    accent,
    glow: glow * (1 + beat * beatGlow * 0.5),
    value,
    shine,
    round: roundness >= 0.5,
  });
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

function sampleBandValue(values: Float32Array, position: number): number {
  const n = values.length;
  if (n <= 0) return 0;
  const exact = clamp(position, 0, 1) * (n - 1);
  const lo = clampInt(Math.floor(exact), 0, n - 1);
  const hi = clampInt(Math.ceil(exact), 0, n - 1);
  const f = exact - lo;
  return (values[lo] || 0) * (1 - f) + (values[hi] || 0) * f;
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
