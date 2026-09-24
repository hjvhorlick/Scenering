/**
 * Voice echo / ambience for the narration.
 *
 * The voiceover is played through the Web Audio graph everywhere it is heard —
 * the voice previews in the Voiceover step, the live video preview and the
 * final render — so one small echo chain gives all three the same sound. The
 * chain is deliberately simple and sample-accurate:
 *
 *     input ─┬──────────────────────────────► dry ──► output
 *            └─► delay ─► damping ─┬────────► wet ──► output
 *                                  └─► feedback ─► back into the delay
 *
 * plus an optional second, longer tap panned the other way so big spaces feel
 * wide instead of like a single slap. Everything is driven from a plain config
 * object, so the UI, the preview and the render can never disagree.
 */

export type VoiceEchoMode = "off" | "studio" | "room" | "plate" | "hall" | "cathedral" | "canyon" | "doubler";

export interface VoiceEchoConfig {
  /** true = the echo is part of the voice on the video */
  enabled: boolean;
  /** id from VOICE_ECHO_PRESETS */
  preset: VoiceEchoMode;
  /** how loud the echo is compared with the dry voice (0 - 1) */
  amount: number;
  /** gap before the echo arrives, in milliseconds */
  delay: number;
  /** how long the tail keeps bouncing (0 - 0.85) */
  feedback: number;
  /** how dark the echo is (0 = bright/tiled, 1 = soft and far away) */
  tone: number;
  /** stereo spread of the tail (0 = mono, 1 = wide) */
  width: number;
}

export interface VoiceEchoPreset {
  id: VoiceEchoMode;
  name: string;
  icon: string;
  blurb: string;
  delay: number;
  feedback: number;
  amount: number;
  tone: number;
  width: number;
}

/**
 * The spaces a narrator can be placed in. The numbers are the actual settings
 * the audio graph uses (not labels), so what the slider shows is what the video
 * plays.
 */
export const VOICE_ECHO_PRESETS: VoiceEchoPreset[] = [
  {
    id: "off",
    name: "No Echo",
    icon: "🚫",
    blurb: "Dry studio voice, exactly as recorded",
    delay: 0,
    feedback: 0,
    amount: 0,
    tone: 0.5,
    width: 0,
  },
  {
    id: "studio",
    name: "Studio Slap",
    icon: "🎙️",
    blurb: "Tight single repeat — presence without mud",
    delay: 88,
    feedback: 0.16,
    amount: 0.26,
    tone: 0.3,
    width: 0,
  },
  {
    id: "plate",
    name: "Plate",
    icon: "💽",
    blurb: "Smooth studio plate — vocals sit back a step",
    delay: 110,
    feedback: 0.46,
    amount: 0.34,
    tone: 0.45,
    width: 0.55,
  },
  {
    id: "room",
    name: "Warm Room",
    icon: "🛋️",
    blurb: "Small, cosy room — a natural live feel",
    delay: 150,
    feedback: 0.3,
    amount: 0.3,
    tone: 0.5,
    width: 0.25,
  },
  {
    id: "hall",
    name: "Concert Hall",
    icon: "🎻",
    blurb: "Grand hall tail — cinematic narration",
    delay: 250,
    feedback: 0.5,
    amount: 0.36,
    tone: 0.45,
    width: 0.7,
  },
  {
    id: "cathedral",
    name: "Cathedral",
    icon: "⛪",
    blurb: "Vast stone space — long, lush repeats",
    delay: 420,
    feedback: 0.62,
    amount: 0.4,
    tone: 0.55,
    width: 0.8,
  },
  {
    id: "canyon",
    name: "Canyon",
    icon: "🏜️",
    blurb: "Huge distance — the voice calls back to you",
    delay: 540,
    feedback: 0.66,
    amount: 0.42,
    tone: 0.35,
    width: 0.9,
  },
  {
    id: "doubler",
    name: "Double Voice",
    icon: "👥",
    blurb: "Tiny delay underneath — a doubled, thicker voice",
    delay: 42,
    feedback: 0.1,
    amount: 0.3,
    tone: 0.25,
    width: 0.35,
  },
];

export const DEFAULT_VOICE_ECHO: VoiceEchoConfig = {
  enabled: false,
  preset: "room",
  amount: VOICE_ECHO_PRESETS[2].amount,
  delay: VOICE_ECHO_PRESETS[2].delay,
  feedback: VOICE_ECHO_PRESETS[2].feedback,
  tone: VOICE_ECHO_PRESETS[2].tone,
  width: VOICE_ECHO_PRESETS[2].width,
};

export function getVoiceEchoPreset(id: string | undefined): VoiceEchoPreset {
  return VOICE_ECHO_PRESETS.find((p) => p.id === id) || VOICE_ECHO_PRESETS[0];
}

/** Config carrying one preset's own numbers (used when a chip is tapped). */
export function voiceEchoPresetConfig(id: VoiceEchoMode, base?: Partial<VoiceEchoConfig>): VoiceEchoConfig {
  const preset = getVoiceEchoPreset(id);
  return {
    ...DEFAULT_VOICE_ECHO,
    ...base,
    enabled: id !== "off",
    preset: id,
    amount: preset.amount,
    delay: preset.delay,
    feedback: preset.feedback,
    tone: preset.tone,
    width: preset.width,
  };
}

/** Clamps a value, falling back to `fallback` when it is not a real number —
 *  a corrupted project setting must never reach the audio graph as NaN. */
const clamp = (v: number | undefined, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.max(lo, Math.min(hi, n));
};

/** Every value clamped into the range the audio graph can safely take. */
export function resolveVoiceEcho(config: VoiceEchoConfig | undefined | null): VoiceEchoConfig {
  const preset = getVoiceEchoPreset(config?.preset);
  return {
    enabled: Boolean(config?.enabled) && preset.id !== "off",
    preset: preset.id,
    amount: clamp(config?.amount, 0, 1, preset.amount),
    delay: clamp(config?.delay, 0, 1000, preset.delay),
    feedback: clamp(config?.feedback, 0, 0.85, preset.feedback),
    tone: clamp(config?.tone, 0, 1, preset.tone),
    width: clamp(config?.width, 0, 1, preset.width),
  };
}

/** Short human sentence for the summaries ("Concert Hall · 36% echo"). */
export function describeVoiceEcho(config: VoiceEchoConfig | undefined | null): string {
  const r = resolveVoiceEcho(config);
  if (!r.enabled) return "Off — dry studio voice";
  const preset = getVoiceEchoPreset(r.preset);
  return `${preset.name} · ${Math.round(r.amount * 100)}% echo · ${Math.round(r.delay)}ms`;
}

/** Is this config actually going to change anything? */
export function voiceEchoIsActive(config: VoiceEchoConfig | undefined | null): boolean {
  const r = resolveVoiceEcho(config);
  return r.enabled && r.amount > 0.005 && r.delay > 2;
}

export interface VoiceEchoGraph {
  input: GainNode;
  output: GainNode;
  /** Applies a new config to the live graph (no re-wiring, so nothing clicks). */
  update(config: VoiceEchoConfig): void;
  dispose(): void;
  readonly config: VoiceEchoConfig;
}

type AnyCtx = BaseAudioContext;

/**
 * Builds the echo chain. The graph never changes shape: switching the echo off
 * just moves the wet mix to zero, so toggling it during playback cannot click or
 * drop the voice.
 */
export function createVoiceEchoGraph(ctx: AnyCtx, config: VoiceEchoConfig): VoiceEchoGraph {
  const resolved = resolveVoiceEcho(config);

  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const delay = ctx.createDelay(2);
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  const feedback = ctx.createGain();
  const wet = ctx.createGain();

  // second, longer tap gives the big spaces their width
  const delayB = ctx.createDelay(2);
  const dampB = ctx.createBiquadFilter();
  dampB.type = "lowpass";
  const wetB = ctx.createGain();
  const panB = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;

  input.connect(dry);
  dry.connect(output);
  input.connect(delay);
  delay.connect(damp);
  damp.connect(wet);
  wet.connect(output);
  damp.connect(feedback);
  feedback.connect(delay);

  if (panB) {
    delay.connect(delayB);
    delayB.connect(dampB);
    dampB.connect(wetB);
    wetB.connect(panB);
    panB.connect(output);
  }

  const apply = (cfg: VoiceEchoConfig) => {
    const r = resolveVoiceEcho(cfg);
    const now = typeof ctx.currentTime === "number" ? ctx.currentTime : 0;
    const on = r.enabled;
    const set = (param: AudioParam, value: number) => {
      try {
        param.setTargetAtTime(value, now, 0.02);
      } catch {
        param.value = value;
      }
    };

    set(dry.gain, 1); // the voice itself is never thinned out
    set(wet.gain, on ? r.amount : 0);
    set(delay.delayTime, Math.max(0.005, r.delay / 1000));
    // darker presets roll the repeats off sooner, which is what makes them read
    // as distance rather than a machine repeat
    set(damp.frequency, 1800 + (1 - r.tone) * 7200);
    set(feedback.gain, on ? r.feedback : 0);

    const secondTap = on && r.width > 0.15;
    set(wetB.gain, secondTap ? r.amount * 0.55 * r.width : 0);
    set(delayB.delayTime, Math.max(0.005, (r.delay * 1.55) / 1000));
    set(dampB.frequency, 1200 + (1 - r.tone) * 5200);
    if (panB) set(panB.pan, secondTap ? 0.75 * r.width : 0);
  };

  apply(resolved);
  output.gain.value = 1;

  return {
    input,
    output,
    config: resolved,
    update: (next: VoiceEchoConfig) => apply(next),
    dispose: () => {
      try {
        input.disconnect();
        dry.disconnect();
        delay.disconnect();
        damp.disconnect();
        feedback.disconnect();
        wet.disconnect();
        delayB.disconnect();
        dampB.disconnect();
        wetB.disconnect();
        panB?.disconnect();
        output.disconnect();
      } catch {}
    },
  };
}

/**
 * Routes an audio element through the echo chain. `<audio>` elements cannot be
 * processed directly, so the element is tapped with a MediaElementSource node —
 * it still plays through the element itself (volume / playback-rate keep
 * working), it is simply heard through the graph instead.
 *
 * Returns null when the browser cannot process the element; the caller then
 * leaves the element alone and the voice simply plays dry.
 */
/**
 * A small shared AudioContext for element-based playback (voice previews).
 * Voice processing is completely independent of the app's data layer, so this
 * module stays free of those imports — that keeps the catalogue and the tests
 * free of browser-only dependencies too.
 */
let sharedPlaybackCtx: AudioContext | null = null;

export function getEchoAudioContext(): AudioContext {
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!Ctor) throw new Error("Web Audio is not available");
  if (!sharedPlaybackCtx || sharedPlaybackCtx.state === "closed") {
    sharedPlaybackCtx = new Ctor();
  }
  if (sharedPlaybackCtx.state === "suspended") {
    sharedPlaybackCtx.resume().catch(() => {});
  }
  return sharedPlaybackCtx;
}

export interface ElementEchoRoute {
  graph: VoiceEchoGraph;
  update(config: VoiceEchoConfig): void;
  dispose(): void;
}

export function routeElementThroughEcho(
  element: HTMLAudioElement,
  config: VoiceEchoConfig,
  ctxFactory: () => AudioContext
): ElementEchoRoute | null {
  try {
    const ctx = ctxFactory();
    const source = ctx.createMediaElementSource(element);
    const graph = createVoiceEchoGraph(ctx, config);
    source.connect(graph.input);
    graph.output.connect(ctx.destination);
    return {
      graph,
      update: (next: VoiceEchoConfig) => graph.update(next),
      dispose: () => {
        try {
          source.disconnect();
        } catch {}
        graph.dispose();
      },
    };
  } catch {
    return null;
  }
}

/** Frequency curve used by the tests: the delay tail gets darker as tone rises. */
export function echoDampingFrequency(tone: number): number {
  const t = clamp(tone, 0, 1, 0.5);
  return 1800 + (1 - t) * 7200;
}
