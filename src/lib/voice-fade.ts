/**
 * Click-free narration playback.
 *
 * Every scene's line is a buffer that starts and stops on a timeline the
 * browser does not control: the frame loop decides that scene 3 has ended and
 * scene 4 has begun, and the old code answered by calling `stop()` on a source
 * that was mid-waveform and `start()` on the next one at full gain. Cutting a
 * waveform anywhere other than a zero crossing is a step in the signal, and a
 * step in the signal is a click — heard as crackling on every scene change, on
 * every stop, and on every seek.
 *
 * The fix is the standard one: never cut, always fade. A source opens from
 * silence over ~12ms and closes over ~18ms, and the hard stop happens after the
 * fade has finished. Twelve milliseconds is shorter than a syllable, so the
 * narration still sounds immediate, but it is long enough that the ear hears an
 * envelope instead of an edge.
 *
 * The scheduling helpers take any AudioParam-shaped object, so the behaviour —
 * "ramps from silence, ramps back to silence, never an instant cut" — is pinned
 * by tests without an audio device.
 */

/** Opening time. Short enough to feel instant, long enough to remove the click. */
export const VOICE_FADE_IN_SECONDS = 0.012;
/** Closing time. Slightly longer: a stop often lands mid-vowel. */
export const VOICE_FADE_OUT_SECONDS = 0.018;

/** The subset of AudioParam this module schedules on. */
export interface GainParam {
  value: number;
  setValueAtTime?(value: number, when: number): unknown;
  linearRampToValueAtTime?(value: number, when: number): unknown;
  cancelScheduledValues?(when: number): unknown;
}

/** Open a voice gain from silence, starting now. */
export const VOICE_NARRATION_GAIN = 1.3;

export function scheduleVoiceFadeIn(
  param: GainParam,
  startTime: number,
  seconds = VOICE_FADE_IN_SECONDS,
  targetGain = 1,
): void {
  const fade = Math.max(0.004, seconds);
  const gain = Math.max(0, Math.min(2, Number.isFinite(targetGain) ? targetGain : 1));
  if (typeof param.setValueAtTime === "function" && typeof param.linearRampToValueAtTime === "function") {
    param.setValueAtTime(0, startTime);
    param.linearRampToValueAtTime(gain, startTime + fade);
    return;
  }
  // No automation available: at least do not start at full gain.
  param.value = gain;
}

/**
 * Close a voice gain and say when the source may be stopped.
 *
 * The ramp starts from the gain's *current* value, so a fade that interrupts a
 * fade-out (a restart mid-fade) does not jump back to 1 and click. Returns the
 * moment the signal has reached silence.
 */
export function scheduleVoiceFadeOut(
  param: GainParam,
  startTime: number,
  seconds = VOICE_FADE_OUT_SECONDS,
  startGain?: number,
): number {
  const fade = Math.max(0.006, seconds);
  const from = typeof startGain === "number" && Number.isFinite(startGain)
    ? Math.max(0, Math.min(2, startGain))
    : typeof param.value === "number" && Number.isFinite(param.value) ? param.value : 1;
  if (typeof param.cancelScheduledValues === "function") param.cancelScheduledValues(startTime);
  if (typeof param.setValueAtTime === "function" && typeof param.linearRampToValueAtTime === "function") {
    param.setValueAtTime(from, startTime);
    param.linearRampToValueAtTime(0, startTime + fade);
    return startTime + fade;
  }
  param.value = 0;
  return startTime;
}

/** A playing narration line and the gain that carries it. */
export interface VoiceSourceHandle {
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** Fade out and stop. Idempotent — a second call does nothing. */
  stop(fadeSeconds?: number): void;
  /** True once stop() has been called. */
  readonly stopping: boolean;
}

export interface StartVoiceOptions {
  /** Where in the buffer to begin (the scene's speech offset). */
  offsetSeconds?: number;
  /**
   * When to begin, on this context's clock. Defaults to now, which is what the
   * live preview wants; the offline render schedules ahead of the clock and
   * passes the scene's timeline position instead.
   */
  whenSeconds?: number;
  /**
   * How much of the line may sound, in seconds. The scene's own window.
   *
   * A line that is longer than the picture it narrates used to be scheduled
   * whole, so its tail ran on into the next scene — and, on the last scene,
   * past the end of the video. Whatever is left of a longer buffer is heard
   * now exactly as far as the scene lasts, and then closes on the same short
   * fade as a stop.
   */
  durationSeconds?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  /** Linear narration gain (1.3 is +30%; compressor/mastering manages peaks). */
  gainScale?: number;
}

/**
 * Start a narration buffer through its own gain node.
 *
 * The source and its gain are created together so every stop has a fade to
 * hang off, and the nodes are released when the buffer ends by itself.
 */
export function startVoiceSource(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  destination: AudioNode,
  options: StartVoiceOptions = {}
): VoiceSourceHandle {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  const param = gain.gain as unknown as GainParam;
  const startAt = options.whenSeconds ?? ctx.currentTime;
  const gainScale = Math.max(0, Math.min(2, Number.isFinite(options.gainScale) ? Number(options.gainScale) : 1));
  scheduleVoiceFadeIn(param, startAt, options.fadeInSeconds, gainScale);

  source.connect(gain);
  gain.connect(destination);

  const duration = Math.max(0, buffer.duration || 0);
  // Never start so late that the offset is past the end of the audio.
  const offset = Math.min(Math.max(0, options.offsetSeconds || 0), Math.max(0, duration - 0.02));
  const remaining = Math.max(0, duration - offset);
  const allowed = typeof options.durationSeconds === "number" && Number.isFinite(options.durationSeconds)
    ? Math.max(0, options.durationSeconds)
    : remaining;
  /** The scene window ends before the buffer does — close the line there. */
  const clipped = allowed < remaining - 0.001;
  let clippedUntil = 0;
  if (clipped && allowed > 0.02 && typeof param.linearRampToValueAtTime === "function") {
    const fadeOut = Math.max(0.006, options.fadeOutSeconds ?? VOICE_FADE_OUT_SECONDS);
    const endAt = startAt + Math.max(0.02, allowed);
    const fadeFrom = Math.max(startAt, endAt - fadeOut);
    scheduleVoiceFadeOut(param, fadeFrom, fadeOut, gainScale);
    clippedUntil = endAt;
  }

  try {
    if (clipped && clippedUntil > 0) source.start(startAt, offset, Math.max(0.02, allowed));
    else source.start(startAt, offset);
  } catch {
    try { source.start(0, offset); } catch { /* a buffer with no audio */ }
  }

  let stopping = false;
  const release = () => {
    try { source.disconnect(); } catch { /* already gone */ }
    try { gain.disconnect(); } catch { /* already gone */ }
  };
  source.onended = release;

  return {
    source,
    gain,
    get stopping() {
      return stopping;
    },
    stop(fadeSeconds = options.fadeOutSeconds) {
      if (stopping) return;
      stopping = true;
      const at = Math.max(ctx.currentTime, startAt);
      const silentAt = scheduleVoiceFadeOut(param, at, fadeSeconds);
      try {
        source.stop(silentAt);
      } catch {
        try { source.stop(); } catch { /* never started */ }
        release();
      }
    },
  };
}
