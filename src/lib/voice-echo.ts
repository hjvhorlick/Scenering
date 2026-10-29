/**
 * Natural room ambience for narration.
 *
 * The same convolution-reverb graph is used by card audition, the voiceover
 * preview, the video preview and offline render. Each room has a generated,
 * deterministic stereo impulse response (early reflections + a diffuse decay),
 * rather than a long feedback delay that sounds like a hollow repeated word.
 */

export type VoiceEchoMode =
  | "off" | "studio" | "bedroom" | "room" | "hall"
  // Legacy ids stay readable so old projects migrate to a similar real space.
  | "plate" | "cathedral" | "canyon" | "doubler";

export interface VoiceEchoConfig {
  enabled: boolean;
  preset: VoiceEchoMode;
  /** Wet room signal relative to the unchanged dry voice (0..1). */
  amount: number;
  /** Short pre-delay before the room reflections, in milliseconds. */
  delay: number;
  /** Controls the room's decay time (legacy field name retained for saved projects). */
  feedback: number;
  /** High-frequency damping: 0 = bright, 1 = dark. */
  tone: number;
  /** Stereo width of the room response. */
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
  decaySeconds: number;
}

/** A deliberately curated set: no artificial double-voice preset. */
export const VOICE_ECHO_PRESETS: VoiceEchoPreset[] = [
  {
    id: "off", name: "Off", icon: "🔇", blurb: "Clean, close narration with no room tail",
    delay: 0, feedback: 0, amount: 0, tone: 0.4, width: 0, decaySeconds: 0,
  },
  {
    id: "studio", name: "Studio", icon: "🎙️", blurb: "A little air around the voice; still crisp and close",
    delay: 7, feedback: 0.16, amount: 0.14, tone: 0.28, width: 0.18, decaySeconds: 0.28,
  },
  {
    id: "bedroom", name: "Bedroom", icon: "🛏️", blurb: "Soft, very short reflections — like a quiet bedroom",
    delay: 9, feedback: 0.2, amount: 0.16, tone: 0.62, width: 0.24, decaySeconds: 0.34,
  },
  {
    id: "room", name: "Warm Room", icon: "🛋️", blurb: "Natural early reflections from a comfortable room",
    delay: 13, feedback: 0.28, amount: 0.2, tone: 0.48, width: 0.48, decaySeconds: 0.72,
  },
  {
    id: "hall", name: "Hall", icon: "🏛️", blurb: "A spacious, smooth tail for cinematic narration",
    delay: 22, feedback: 0.46, amount: 0.22, tone: 0.58, width: 0.82, decaySeconds: 1.9,
  },
];

const LEGACY_PRESET: Partial<Record<VoiceEchoMode, VoiceEchoMode>> = {
  plate: "studio",
  cathedral: "hall",
  canyon: "hall",
  doubler: "room",
};

export const DEFAULT_VOICE_ECHO: VoiceEchoConfig = {
  enabled: false,
  preset: "room",
  amount: 0.2,
  delay: 13,
  feedback: 0.28,
  tone: 0.48,
  width: 0.48,
};

export function getVoiceEchoPreset(id: string | undefined): VoiceEchoPreset {
  const canonical = (id && LEGACY_PRESET[id as VoiceEchoMode]) || id;
  return VOICE_ECHO_PRESETS.find((preset) => preset.id === canonical) || VOICE_ECHO_PRESETS[0];
}

export function voiceEchoPresetConfig(id: VoiceEchoMode, base?: Partial<VoiceEchoConfig>): VoiceEchoConfig {
  const preset = getVoiceEchoPreset(id);
  return {
    ...DEFAULT_VOICE_ECHO,
    ...base,
    enabled: preset.id !== "off",
    preset: preset.id,
    amount: preset.amount,
    delay: preset.delay,
    feedback: preset.feedback,
    tone: preset.tone,
    width: preset.width,
  };
}

const clamp = (v: number | undefined, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.max(lo, Math.min(hi, n));
};

export function resolveVoiceEcho(config: VoiceEchoConfig | undefined | null): VoiceEchoConfig {
  const preset = getVoiceEchoPreset(config?.preset);
  return {
    enabled: Boolean(config?.enabled) && preset.id !== "off",
    preset: preset.id,
    amount: clamp(config?.amount, 0, 0.55, preset.amount),
    delay: clamp(config?.delay, 0, 80, preset.delay),
    feedback: clamp(config?.feedback, 0, 0.85, preset.feedback),
    tone: clamp(config?.tone, 0, 1, preset.tone),
    width: clamp(config?.width, 0, 1, preset.width),
  };
}

export function describeVoiceEcho(config: VoiceEchoConfig | undefined | null): string {
  const resolved = resolveVoiceEcho(config);
  if (!resolved.enabled) return "Off · clean voice";
  return `${getVoiceEchoPreset(resolved.preset).name} · ${Math.round(resolved.amount * 100)}% room`;
}

export function voiceEchoIsActive(config: VoiceEchoConfig | undefined | null): boolean {
  const resolved = resolveVoiceEcho(config);
  return resolved.enabled && resolved.amount > 0.005;
}

export interface VoiceEchoGraph {
  input: GainNode;
  output: GainNode;
  update(config: VoiceEchoConfig): void;
  dispose(): void;
  readonly config: VoiceEchoConfig;
}

type AnyCtx = BaseAudioContext;

/** Generates a repeatable room response for a ConvolverNode. */
export function createRoomImpulse(ctx: BaseAudioContext, config: VoiceEchoConfig): AudioBuffer {
  const resolved = resolveVoiceEcho(config);
  const preset = getVoiceEchoPreset(resolved.preset);
  const tailScale = Math.max(0.45, Math.min(1.8, 0.55 + resolved.feedback * 1.2));
  const decay = Math.max(0.12, preset.decaySeconds * tailScale);
  const duration = Math.min(3.2, Math.max(0.18, decay * 1.25));
  const sampleRate = ctx.sampleRate || 48_000;
  const length = Math.max(1, Math.ceil(sampleRate * duration));
  const channels = resolved.width < 0.12 ? 1 : 2;
  const buffer = ctx.createBuffer(channels, length, sampleRate);
  const reflections = [
    [0.004, 0.34], [0.009, 0.24], [0.016, 0.17], [0.027, 0.11],
    [0.043, 0.075], [0.061, 0.048],
  ] as const;
  let seed = 0x5f3759df ^ Math.round(decay * 10_000) ^ Math.round(resolved.width * 1000);
  const random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 0x1_0000_0000;
  };

  for (let channel = 0; channel < channels; channel += 1) {
    const samples = buffer.getChannelData(channel);
    const channelScale = channel === 0 || channels === 1 ? 1 : 0.94;
    for (const [seconds, gain] of reflections) {
      const index = Math.round((seconds + (channel ? 0.0017 : 0)) * sampleRate);
      if (index < samples.length) samples[index] += gain * channelScale;
    }
    for (let index = Math.round(0.075 * sampleRate); index < samples.length; index += 1) {
      const seconds = index / sampleRate;
      const envelope = Math.exp((-6.91 * seconds) / decay);
      // Noise density fills the tail into a diffuse room decay, unlike discrete
      // repeats. Web Audio normalizes the impulse and the wet mix stays subtle.
      samples[index] += (random() * 2 - 1) * envelope * 0.035 * channelScale;
    }
  }
  return buffer;
}

/** The damping curve used by the room's late reflections. */
export function echoDampingFrequency(tone: number): number {
  const t = clamp(tone, 0, 1, 0.5);
  return 2000 + (1 - t) * 6800;
}

/** Dry voice plus a short pre-delay, convolver, damping and subtle wet return. */
export function createVoiceEchoGraph(ctx: AnyCtx, config: VoiceEchoConfig): VoiceEchoGraph {
  const resolved = resolveVoiceEcho(config);
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const preDelay = ctx.createDelay(0.12);
  const convolver = ctx.createConvolver();
  const damp = ctx.createBiquadFilter();
  const wet = ctx.createGain();
  convolver.normalize = true;

  input.connect(dry);
  dry.connect(output);
  input.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(damp);
  damp.connect(wet);
  wet.connect(output);

  let currentConfig = resolved;
  let currentImpulseKey = "";
  const apply = (cfg: VoiceEchoConfig) => {
    const r = resolveVoiceEcho(cfg);
    const preset = getVoiceEchoPreset(r.preset);
    const now = typeof ctx.currentTime === "number" ? ctx.currentTime : 0;
    const set = (param: AudioParam, value: number) => {
      try { param.setTargetAtTime(value, now, 0.02); }
      catch { param.value = value; }
    };
    set(dry.gain, 1);
    set(wet.gain, r.enabled ? r.amount : 0);
    set(preDelay.delayTime, r.delay / 1000);
    set(damp.frequency, echoDampingFrequency(r.tone));
    if (r.enabled) {
      const impulseKey = `${preset.id}:${r.feedback}:${r.width}:${ctx.sampleRate}`;
      if (impulseKey !== currentImpulseKey) {
        convolver.buffer = createRoomImpulse(ctx, r);
        currentImpulseKey = impulseKey;
      }
    } else if (currentImpulseKey) {
      convolver.buffer = null;
      currentImpulseKey = "";
    }
    // Keep the graph object aligned with legacy-config migration.
    currentConfig = { ...r, preset: preset.id };
  };

  apply(resolved);

  return {
    input,
    output,
    get config() { return currentConfig; },
    update: (next) => apply(next),
    dispose: () => {
      for (const node of [input, dry, preDelay, convolver, damp, wet, output]) {
        try { node.disconnect(); } catch { /* best-effort cleanup */ }
      }
    },
  };
}

let sharedPlaybackCtx: AudioContext | null = null;
export function getEchoAudioContext(): AudioContext {
  const Ctor = typeof window !== "undefined"
    ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    : undefined;
  if (!Ctor) throw new Error("Web Audio is not available");
  if (!sharedPlaybackCtx || sharedPlaybackCtx.state === "closed") sharedPlaybackCtx = new Ctor();
  if (sharedPlaybackCtx.state === "suspended") sharedPlaybackCtx.resume().catch(() => {});
  return sharedPlaybackCtx;
}

export interface ElementEchoRoute {
  graph: VoiceEchoGraph;
  update(config: VoiceEchoConfig): void;
  dispose(): void;
}

/** Routes an audio element through the shared room graph; dry fallback on failure. */
export function routeElementThroughEcho(
  element: HTMLAudioElement,
  config: VoiceEchoConfig,
  ctxFactory: () => AudioContext,
  tap?: AnalyserNode | null
): ElementEchoRoute | null {
  try {
    const ctx = ctxFactory();
    const source = ctx.createMediaElementSource(element);
    const graph = createVoiceEchoGraph(ctx, config);
    source.connect(graph.input);
    graph.output.connect(tap ?? ctx.destination);
    return {
      graph,
      update: (next) => graph.update(next),
      dispose: () => {
        try { source.disconnect(); } catch {}
        graph.dispose();
      },
    };
  } catch {
    return null;
  }
}
