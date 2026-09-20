/**
 * Shared audio-reactivity engine.
 *
 * Every audio visualiser in Scenering — the live video preview, the studio
 * catalogue thumbnails and the final render — reads its movement from this one
 * module, so what a user sees while editing is always what gets burned in.
 *
 * Two data paths exist:
 *  1. Real analyser data (browser). The voiceover bus and the background-music
 *     bus are analysed separately, so "moves with the music" and "moves with the
 *     voiceover" genuinely react to different audio.
 *  2. A deterministic rhythm model (used when no analyser data is available, or
 *     when the item is auditioned in the catalogue). It is a real 120 BPM drum
 *     pattern with kick, snare, hats, a walking bass line and 4-bar phrases, so
 *     the motion reads as music instead of a sine wave wobble.
 */

export type ReactionSource = "voice" | "music" | "all";

export interface AudioBus {
  /** 0..1 average loudness */
  level: number;
  /** frequency spectrum, 0..255 per bin */
  freq: Uint8Array | number[] | null;
  /** time-domain samples, 0..255 with 128 as silence */
  wave: Uint8Array | number[] | null;
}

export interface AudioFrame {
  voice: AudioBus;
  music: AudioBus;
}

export const EMPTY_BUS: AudioBus = { level: 0, freq: null, wave: null };

export const EMPTY_FRAME: AudioFrame = { voice: EMPTY_BUS, music: EMPTY_BUS };

export function makeBus(
  level: number,
  freq?: Uint8Array | number[] | null,
  wave?: Uint8Array | number[] | null
): AudioBus {
  return { level, freq: freq || null, wave: wave || null };
}

export function makeAudioFrame(
  voice?: Partial<AudioBus> | null,
  music?: Partial<AudioBus> | null
): AudioFrame {
  return {
    voice: { ...EMPTY_BUS, ...(voice || {}) },
    music: { ...EMPTY_BUS, ...(music || {}) },
  };
}

/** Selects the bus an item is wired to (falls back to whichever bus has signal) */
export function pickBus(frame: AudioFrame | null | undefined, source?: ReactionSource): AudioBus {
  if (!frame) return EMPTY_BUS;
  if (source === "music") return frame.music;
  if (source === "voice") return frame.voice;
  // "all" — prefer whichever track is actually playing
  return hasSignal(frame.music) ? frame.music : frame.voice;
}

/** True when the bus carries real audio rather than digital silence */
export function hasSignal(bus: AudioBus | null | undefined): boolean {
  if (!bus) return false;
  if (bus.freq && bus.freq.length > 0) {
    for (let i = 0; i < bus.freq.length; i++) if (bus.freq[i] > 6) return true;
  }
  if (bus.wave && bus.wave.length > 0) {
    for (let i = 0; i < bus.wave.length; i++) {
      const dev = Math.abs(bus.wave[i] - 128);
      if (dev > 4) return true;
    }
  }
  return bus.level > 0.02;
}

/* ------------------------------------------------------------------ *
 * Deterministic rhythm model (120 BPM)
 * ------------------------------------------------------------------ */

const BPM = 120;
const BEAT = 60 / BPM; // 0.5s

const frac = (v: number) => v - Math.floor(v);

/** 1.0 on every downbeat, decaying towards the next one */
function decayPulse(t: number, period: number, sharpness: number): number {
  const phase = frac(t / period);
  return Math.pow(1 - phase, sharpness);
}

interface Rhythm {
  kick: number;
  snare: number;
  hat: number;
  bass: number;
  pad: number;
  phrase: number;
  level: number;
}

/** A musical 16-step bass line (semitone offsets, -1 = rest) */
const BASS_LINE = [0, -1, 7, 0, 5, -1, 3, 5, 0, -1, 7, 10, 5, -1, 3, 2];

function musicRhythm(t: number): Rhythm {
  const kick = Math.pow(decayPulse(t, BEAT * 2, 6), 1.15) * 1.0;
  const snare = Math.pow(decayPulse(t + BEAT, BEAT * 2, 9), 1.0) * 0.85;
  const hat = Math.pow(Math.abs(Math.sin(Math.PI * t * 4)), 6) * 0.55;

  // 16th-note bass line (4 notes per beat)
  const step = Math.floor(t / (BEAT / 4)) % BASS_LINE.length;
  const note = BASS_LINE[step];
  const noteDecay = decayPulse(t, BEAT / 4, 3);
  const bass = note < 0 ? 0 : noteDecay * (0.55 + Math.min(0.45, note / 14));

  // Sustained chord pad swells every 4 beats
  const pad = 0.42 + 0.2 * Math.sin((t / (BEAT * 4)) * Math.PI * 2);

  // 4-bar phrasing: two bars driving, then a lift, then a short break
  const phrasePos = frac(t / (BEAT * 16));
  const phrase = phrasePos < 0.5 ? 0.86 : phrasePos < 0.88 ? 1.0 : 0.62;

  const level =
    (kick * 0.9 + snare * 0.55 + hat * 0.3 + bass * 0.5 + pad * 0.35) * phrase;
  return { kick, snare, hat, bass, pad, phrase, level: Math.min(1.35, level) };
}

function voiceRhythm(t: number): Rhythm {
  // Syllable cadence (~3.7 syllables/sec) shaped by a slow sentence envelope
  const syllable = Math.pow(Math.max(0, Math.sin(Math.PI * t * 3.7)), 0.65);
  const vowel = 0.62 + 0.38 * Math.sin(t * 9.1 + 1.3) * Math.sin(t * 3.3);
  const sentence = 0.72 + 0.28 * Math.sin(t * 0.85) * Math.sin(t * 0.31 + 0.7);
  const breath = Math.pow(Math.abs(Math.sin(Math.PI * t * 0.62)), 0.4);
  const en = syllable * vowel * sentence * (0.35 + 0.65 * breath);
  return {
    kick: en * 0.9,
    snare: en * 0.35,
    hat: en * 0.5,
    bass: en * 0.75,
    pad: en * 0.45,
    phrase: 1,
    level: Math.min(1.35, en * 1.2),
  };
}

/** Exposes the rhythm model for callers that want a single scalar pulse */
export function rhythmicLevel(t: number, source: ReactionSource): number {
  return source === "music" ? musicRhythm(t).level : voiceRhythm(t).level;
}

/** Punchy transient (0..1) used for scale/throb effects on icons and rings */
export function beatPulse(t: number, source: ReactionSource): number {
  if (source === "music") {
    const r = musicRhythm(t);
    return Math.min(1, r.kick * 0.8 + r.snare * 0.5 + r.hat * 0.25);
  }
  const r = voiceRhythm(t);
  return Math.min(1, r.level * 0.9);
}

/* ------------------------------------------------------------------ *
 * Frequency bars
 * ------------------------------------------------------------------ */

export interface BarsResult {
  values: Float32Array;
  peaks: Float32Array;
  energy: number;
  beat: number;
  low: number;
  mid: number;
  high: number;
}

interface BarsState {
  peaks: Float32Array;
  smooth: Float32Array;
  lastT: number;
  touched: number;
}

const stateCache = new Map<string, BarsState>();
const MAX_STATES = 48;

function getState(key: string, count: number, t: number): BarsState {
  let st = stateCache.get(key);
  if (!st || st.peaks.length !== count) {
    st = {
      peaks: new Float32Array(count),
      smooth: new Float32Array(count),
      lastT: t,
      touched: 0,
    };
    stateCache.set(key, st);
    if (stateCache.size > MAX_STATES) {
      // drop the oldest entry (insert auditioned long ago)
      let oldestKey: string | null = null;
      let oldest = Infinity;
      stateCache.forEach((v, k) => {
        if (v.touched < oldest) {
          oldest = v.touched;
          oldestKey = k;
        }
      });
      if (oldestKey && oldestKey !== key) stateCache.delete(oldestKey);
    }
  }
  st.touched = t;
  return st;
}

/** Clears cached peak-hold state (used when a timeline is reset) */
export function resetReactiveState(keyPrefix?: string) {
  if (!keyPrefix) {
    stateCache.clear();
    return;
  }
  Array.from(stateCache.keys()).forEach((k) => {
    if (k.startsWith(keyPrefix)) stateCache.delete(k);
  });
}

/**
 * Turns a bus into `count` bar levels (0..1). Real spectra are mapped on a
 * logarithmic (musical) scale with a spectral tilt so treble bars move as much
 * as bass bars; without real audio the rhythm model drives the bars instead.
 */
export function getBars(
  key: string,
  count: number,
  t: number,
  bus: AudioBus | null | undefined,
  source: ReactionSource = "voice",
  reactivity = 1
): BarsResult {
  const values = new Float32Array(count);
  const peaks = new Float32Array(count);
  const result: BarsResult = { values, peaks, energy: 0, beat: 0, low: 0, mid: 0, high: 0 };

  const real = bus && hasSignal(bus) && bus.freq && bus.freq.length > 8;
  const rhythmic = source === "music" ? musicRhythm(t) : voiceRhythm(t);
  const gain = Math.max(0.2, Math.min(2.4, reactivity));

  if (real) {
    const freq = bus!.freq as ArrayLike<number>;
    const n = freq.length;
    // log-spaced bin windows: octave-ish spacing keeps bass from eating the screen
    const minBin = 1;
    const maxBin = Math.max(minBin + 4, Math.floor(n * 0.92));
    for (let i = 0; i < count; i++) {
      const p0 = i / count;
      const p1 = (i + 1) / count;
      const b0 = Math.floor(minBin * Math.pow(maxBin / minBin, p0));
      const b1 = Math.max(b0 + 1, Math.floor(minBin * Math.pow(maxBin / minBin, p1)));
      let sum = 0;
      let hits = 0;
      for (let b = b0; b < b1 && b < n; b++) {
        sum += freq[b];
        hits++;
      }
      const raw = hits ? sum / hits / 255 : 0;
      // spectral tilt: lift the highs so the whole rack dances, not just the bass
      const tilt = 1 + p0 * 0.85;
      const shaped = Math.min(1.25, Math.pow(raw, 0.82) * tilt * gain * 1.35);
      values[i] = shaped;
    }
    result.energy = bus!.level;
  } else {
    // Deterministic rhythm model
    for (let i = 0; i < count; i++) {
      const p = i / (count - 1 || 1); // 0 = bass … 1 = air
      const lowShape = Math.exp(-Math.pow(p / 0.28, 2));
      const midShape = Math.exp(-Math.pow((p - 0.45) / 0.3, 2));
      const highShape = Math.exp(-Math.pow((1 - p) / 0.3, 2));

      let v: number;
      if (source === "music") {
        // bass line walks across the low third, pad breathes through the middle,
        // hats sparkle on top — each bar gets its own note-specific motion
        const bassShape = Math.exp(-Math.pow((p - 0.14 - 0.1 * Math.sin(t * 1.7)) / 0.22, 2));
        v =
          rhythmic.kick * lowShape * 1.0 +
          rhythmic.bass * bassShape * 1.15 +
          rhythmic.pad * midShape * 0.78 +
          rhythmic.hat * highShape * 0.85 +
          rhythmic.snare * midShape * 0.5;
        v += 0.09 * Math.abs(Math.sin(p * 22 + t * 2.1)) * highShape;
        v *= rhythmic.phrase;
      } else {
        // Vocal formants: three peaks that glide as the vowels change
        const f1 = 0.24 + 0.06 * Math.sin(t * 2.4);
        const f2 = 0.55 + 0.1 * Math.sin(t * 3.1 + 1.7);
        const f3 = 0.82 + 0.05 * Math.sin(t * 4.3 + 0.4);
        const formants =
          Math.exp(-Math.pow((p - f1) / 0.16, 2)) * 1.0 +
          Math.exp(-Math.pow((p - f2) / 0.14, 2)) * 0.72 +
          Math.exp(-Math.pow((p - f3) / 0.1, 2)) * 0.4;
        const sibilance = Math.pow(highShape, 1.6) * 0.35 * Math.abs(Math.sin(t * 17 + p * 30));
        v = rhythmic.level * formants + sibilance;
      }

      // per-bar organic wobble so the rack never looks like a static staircase
      v *= 0.9 + 0.1 * Math.sin(t * 3.4 + i * 1.37) + 0.05 * Math.sin(t * 8.1 + i * 0.61);
      // Idle floor: a real analyser always shows a little life on every band, so
      // even the top of the rack keeps a lit baseline instead of going dead.
      const idle = source === "music" ? 0.1 : 0.07;
      const idleWobble = idle * (0.7 + 0.3 * Math.sin(t * 2.2 + i * 0.9));
      v = Math.max(v, idleWobble);
      values[i] = Math.max(0, Math.min(1.3, v * gain * 1.05));
    }
    result.energy = Math.min(1, rhythmic.level * 0.9);
  }

  // Attack fast / release slow peak-hold + light temporal smoothing
  const st = getState(key, count, t);
  const dt = Math.max(0, Math.min(0.25, t - st.lastT));
  st.lastT = t;
  const attack = 0.62;
  const release = 0.16 + dt * 1.6;
  for (let i = 0; i < count; i++) {
    const target = values[i];
    const prev = st.smooth[i];
    const k = target > prev ? attack : release;
    const next = prev + (target - prev) * Math.min(1, k);
    st.smooth[i] = next;
    values[i] = next;
    // peak caps ride up instantly and drift down slowly
    st.peaks[i] = Math.max(target, st.peaks[i] - 0.012 - dt * 0.35);
    peaks[i] = st.peaks[i];
  }

  let low = 0;
  let mid = 0;
  let high = 0;
  const third = Math.max(1, Math.floor(count / 3));
  for (let i = 0; i < count; i++) {
    const v = values[i];
    if (i < third) low += v;
    else if (i < third * 2) mid += v;
    else high += v;
  }
  result.low = low / third;
  result.mid = mid / third;
  result.high = high / Math.max(1, count - third * 2);
  result.beat = real ? Math.min(1, result.low * 1.1) : beatPulse(t, source);

  return result;
}

/* ------------------------------------------------------------------ *
 * Waveform (time-domain) traces
 * ------------------------------------------------------------------ */

/**
 * Returns `count` samples in -1..1 for the wave / oscilloscope visualisers.
 * Real time-domain data gives a genuine oscilloscope trace of the voice; the
 * fallback synthesises a glottal-pulse style waveform for voice items and a
 * bass-heavy waveform for music items.
 */
export function getWaveform(
  count: number,
  t: number,
  bus: AudioBus | null | undefined,
  source: ReactionSource = "voice",
  reactivity = 1
): Float32Array {
  const out = new Float32Array(count);
  const gain = Math.max(0.2, Math.min(2.4, reactivity));
  const real = bus && hasSignal(bus) && bus.wave && bus.wave.length > 16;

  if (real) {
    const wave = bus!.wave as ArrayLike<number>;
    const n = wave.length;
    // Down-sample the analyser buffer, keeping peaks so the trace stays lively
    const per = n / count;
    for (let i = 0; i < count; i++) {
      const s = Math.floor(i * per);
      const e = Math.min(n, Math.max(s + 1, Math.floor((i + 1) * per)));
      let peak = 0;
      for (let b = s; b < e; b++) {
        const v = (wave[b] - 128) / 128;
        if (Math.abs(v) > Math.abs(peak)) peak = v;
      }
      out[i] = Math.max(-1, Math.min(1, peak * 1.25 * gain));
    }
    return out;
  }

  const rhythmic = source === "music" ? musicRhythm(t) : voiceRhythm(t);
  for (let i = 0; i < count; i++) {
    const p = i / (count - 1 || 1);
    let v: number;
    if (source === "music") {
      const bass = Math.sin(p * Math.PI * 6 + t * 7) * 0.45;
      const sub = Math.sin(p * Math.PI * 2 - t * 3.6) * (0.3 + rhythmic.kick * 0.7);
      const air = Math.sin(p * Math.PI * 24 + t * 22) * 0.12;
      v = (bass + sub + air) * (0.45 + rhythmic.level * 0.75);
    } else {
      // glottal pulses + formant ripple + breath noise
      const pulse = Math.sin(p * Math.PI * 5 - t * 26) * 0.62;
      const formant = Math.sin(p * Math.PI * 17 + t * 13) * 0.22;
      const breath = Math.sin(p * Math.PI * 41 - t * 33) * 0.08;
      v = (pulse + formant + breath) * (0.3 + rhythmic.level * 0.95);
    }
    out[i] = Math.max(-1, Math.min(1, v * gain * 1.15));
  }
  return out;
}
