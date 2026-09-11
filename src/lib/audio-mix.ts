/**
 * Audio preparation helpers shared by both video export engines:
 *  - procedural background music (a seamless loop, synthesised offline)
 *  - a single deterministic mix of narration + insert sound effects + music,
 *    rendered through an OfflineAudioContext so it can be encoded to AAC
 */

export type MusicStyle = "none" | "lofi" | "cinematic" | "ambient" | "energetic";

/** Length of the synthesised music loop, in seconds. */
const LOOP_SECONDS = 10;

/** Peak level the mix is normalised to when normalisation is enabled. */
const NORMALISE_TARGET = 0.95;
/** Never boost a very quiet mix by more than this factor. */
const MAX_NORMALISE_GAIN = 4;

function chordForStyle(style: MusicStyle): number[] {
  if (style === "lofi") return [220.0, 261.63, 329.63, 392.0]; // Am7
  if (style === "cinematic") return [174.61, 220.0, 261.63, 349.23]; // Fmaj7 (low)
  if (style === "energetic") return [293.66, 369.99, 440.0, 587.33]; // D major
  return [261.63, 329.63, 392.0, 523.25]; // C major (ambient + fallback)
}

function lowpassCutoffForStyle(style: MusicStyle): number {
  if (style === "lofi") return 900;
  if (style === "ambient") return 1400;
  if (style === "cinematic") return 1800;
  return 2500;
}

/**
 * Snaps a frequency so that a whole (even) number of cycles fits in the loop,
 * which makes the loop perfectly seamless — no click at the wrap point.
 */
function quantiseFrequency(freq: number, loopSeconds: number): number {
  const cycles = Math.max(1, Math.round((freq * loopSeconds) / 2) * 2);
  return cycles / loopSeconds;
}

/**
 * Synthesises one loop of ambient background music.
 * The buffer is exactly loop-safe, so it can be repeated for any video length.
 */
export function createAmbientMusicBuffer(
  ctx: BaseAudioContext,
  style: MusicStyle,
  volume: number
): AudioBuffer | null {
  if (style === "none" || volume <= 0) return null;

  try {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * LOOP_SECONDS);
    const buffer = ctx.createBuffer(2, length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const baseFreqs = chordForStyle(style).map((f) => quantiseFrequency(f, LOOP_SECONDS));
    const lfoRate = Math.max(1, Math.round(0.15 * LOOP_SECONDS)) / LOOP_SECONDS;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let sample = 0;
      baseFreqs.forEach((freq, idx) => {
        const osc = Math.sin(2 * Math.PI * freq * t);
        const sub = Math.sin(Math.PI * freq * t) * 0.4; // one octave down
        const slowLfo = 0.6 + 0.4 * Math.sin(2 * Math.PI * lfoRate * t + idx);
        sample += (osc + sub) * 0.15 * slowLfo;
      });

      // Soft stereo spread (0.5 Hz completes whole cycles inside the loop)
      left[i] = sample * (0.8 + 0.2 * Math.sin(t * 0.5));
      right[i] = sample * (0.8 + 0.2 * Math.cos(t * 0.5));
    }

    return buffer;
  } catch {
    return null;
  }
}

/** Music buffer wired up as a looping, filtered, gain-staged source. */
export function createAmbientMusicSource(
  ctx: AudioContext,
  style: MusicStyle,
  durationSeconds: number,
  volume: number
): AudioNode | null {
  if (style === "none" || volume <= 0) return null;

  try {
    const buffer = createAmbientMusicBuffer(ctx, style, 1);
    if (!buffer) return null;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    if (durationSeconds > 0) {
      source.loopEnd = buffer.duration;
    }

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lowpassCutoffForStyle(style);

    const gain = ctx.createGain();
    gain.gain.value = volume;

    source.connect(filter);
    filter.connect(gain);
    source.start();
    return gain;
  } catch {
    return null;
  }
}

export interface ScheduledClip {
  buffer: AudioBuffer;
  /** Absolute start time in seconds from the start of the video. */
  startTime: number;
  /** Linear gain, 1 = unchanged. */
  gain: number;
  loop?: boolean;
}

export interface AudioMixInput {
  /** Length of the video in seconds. */
  duration: number;
  narration: ScheduledClip[];
  effects: ScheduledClip[];
  music: { style: MusicStyle; volume: number } | null;
  normalize?: boolean;
  /** Silence appended after the last scene so nothing is cut off abruptly. */
  tailSeconds?: number;
  sampleRate?: number;
}

/**
 * Renders the complete soundtrack offline (deterministic, faster than real
 * time) and returns a single stereo AudioBuffer covering the whole video.
 * Returns null when there is nothing to play.
 */
export async function mixTimelineAudio(input: AudioMixInput): Promise<AudioBuffer | null> {
  const hasNarration = input.narration.length > 0;
  const hasEffects = input.effects.length > 0;
  const hasMusic = Boolean(input.music && input.music.style !== "none" && input.music.volume > 0);

  if (!hasNarration && !hasEffects && !hasMusic) return null;

  const sampleRate = input.sampleRate ?? 48000;
  const tail = input.tailSeconds ?? 0.5;
  const totalSeconds = Math.max(0.5, input.duration + tail);
  const frameCount = Math.ceil(totalSeconds * sampleRate);

  const ctx = new OfflineAudioContext(2, frameCount, sampleRate);
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  // Narration
  for (const clip of input.narration) {
    const source = ctx.createBufferSource();
    source.buffer = clip.buffer;
    const gain = ctx.createGain();
    gain.gain.value = clip.gain;
    source.connect(gain);
    gain.connect(master);
    source.start(Math.max(0, clip.startTime));
  }

  // Insert sound effects
  for (const clip of input.effects) {
    const source = ctx.createBufferSource();
    source.buffer = clip.buffer;
    source.loop = Boolean(clip.loop);
    const gain = ctx.createGain();
    gain.gain.value = clip.gain;
    source.connect(gain);
    gain.connect(master);
    source.start(Math.max(0, clip.startTime));
  }

  // Background music bed
  if (hasMusic && input.music) {
    const buffer = createAmbientMusicBuffer(ctx, input.music.style, 1);
    if (buffer) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lowpassCutoffForStyle(input.music.style);

      const gain = ctx.createGain();
      gain.gain.value = input.music.volume;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      // Gentle fade in/out so the bed never starts or stops on a click.
      const fade = Math.min(1.5, totalSeconds / 4);
      gain.gain.setValueAtTime(0, 0);
      gain.gain.linearRampToValueAtTime(input.music.volume, fade);
      gain.gain.setValueAtTime(input.music.volume, Math.max(fade, totalSeconds - fade));
      gain.gain.linearRampToValueAtTime(0, totalSeconds);

      source.start(0);
      source.stop(totalSeconds);
    }
  }

  const rendered = await ctx.startRendering();

  if (input.normalize) {
    normaliseBuffer(rendered, NORMALISE_TARGET);
  }

  return rendered;
}

/** Scales the buffer in place so its loudest sample hits `target`. */
export function normaliseBuffer(buffer: AudioBuffer, target: number): void {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak === 0) return;

  const gain = Math.min(target / peak, MAX_NORMALISE_GAIN);
  if (Math.abs(gain - 1) < 0.01) return;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gain;
    }
  }
}

/**
 * Builds a fast `time -> amplitude (0..1)` sampler for audio-reactive inserts,
 * backed by a short RMS window over the rendered mix.
 */
export function createAudioLevelSampler(
  buffer: AudioBuffer | null,
  windowSeconds = 0.08
): (time: number) => number {
  if (!buffer || buffer.length === 0) return () => 0.4;

  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  const sampleRate = buffer.sampleRate;
  const windowSamples = Math.max(1, Math.floor(windowSeconds * sampleRate));
  const cache = new Map<number, number>();

  return (time: number) => {
    const key = Math.round(time * 30); // ~1/30s resolution, matches frame rate
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const center = Math.floor(time * sampleRate);
    const from = Math.max(0, center - Math.floor(windowSamples / 2));
    const to = Math.min(buffer.length, from + windowSamples);

    let sumSquares = 0;
    let count = 0;
    for (let c = 0; c < channels.length; c++) {
      const data = channels[c];
      for (let i = from; i < to; i++) {
        const v = data[i];
        sumSquares += v * v;
        count++;
      }
    }

    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
    const level = Math.max(0, Math.min(1, rms * 4));
    cache.set(key, level);
    return level;
  };
}
