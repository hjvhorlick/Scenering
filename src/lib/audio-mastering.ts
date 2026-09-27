/**
 * ============================================================================
 * SCENERING AUDIO MASTERING STAGE
 * ============================================================================
 *
 * The optional final-mix stage the Master Render Profile switches on
 * (audioMastering: "automatic" — the default). It sits between the render's
 * voice/music buses and the recorder destination and guarantees the final
 * mix has:
 *
 *   • no clipping                 (a brick-wall-ish limiter at the end)
 *   • no excessive loudness       (gentle bus compression, ~2 dB of work)
 *   • audible narration           (voice bus passes through untouched)
 *   • music that never overpowers speech
 *     (voice-priority ducking: the music bus is eased down while the
 *      narrator is speaking and eased back up in the gaps)
 *
 * "Manual" mode wires the buses straight through — the user's own levels
 * from the studio's audio controls are respected verbatim. Automatic mode is
 * deliberately gentle: it protects the mix, it does not re-balance it, so
 * the per-track volume sliders in Video Studio remain the creative control.
 *
 *      voice bus ──────────────┐
 *                              ├── compressor ── limiter ── output
 *      music bus ── duck gain ─┘
 */

import type { MasteringMode } from "./render-profile";

/* ------------------------------------------------------------------ *
 * Pure ducking maths (kept separate so it is testable without Web Audio)
 * ------------------------------------------------------------------ */

/** Music gain multiplier while the voice is fully active. -7.5 dB — clearly
 *  behind the voice but still present, matching the §13 mix picture
 *  (Voice ████████████ / Music ████░░░░░░). */
export const MUSIC_DUCK_FLOOR = 0.42;

/** Voice bus level (0..1 analyser average) above which speech is
 *  considered present. Narration averages ~0.06–0.2 on this scale. */
export const VOICE_ACTIVE_THRESHOLD = 0.025;

/**
 * Target music gain for a given voice level. Fully open when the narrator
 * is silent, easing down to MUSIC_DUCK_FLOOR while they speak. The ramp is
 * proportional between the threshold and 3× the threshold so a breath or a
 * click never slams the music down.
 */
export function duckTargetForVoiceLevel(voiceLevel: number): number {
  if (!(voiceLevel > VOICE_ACTIVE_THRESHOLD)) return 1;
  const span = VOICE_ACTIVE_THRESHOLD * 2; // full duck by 3× threshold
  const depth = Math.min(1, (voiceLevel - VOICE_ACTIVE_THRESHOLD) / span);
  return 1 - (1 - MUSIC_DUCK_FLOOR) * depth;
}

/** Attack fast (music steps aside quickly when speech starts), release slow
 *  (it swells back gently in the pauses) — the classic broadcast duck. */
export function duckTimeConstant(currentGain: number, targetGain: number): number {
  return targetGain < currentGain ? 0.08 : 0.45;
}

/* ------------------------------------------------------------------ *
 * The Web Audio chain
 * ------------------------------------------------------------------ */

export interface MasteringChain {
  /** connect the narration/voice bus here */
  voiceInput: AudioNode;
  /** connect the music/SFX bus here */
  musicInput: AudioNode;
  /** connect this to the recorder destination */
  output: AudioNode;
  mode: MasteringMode;
  /** Feed the current voice-bus level (0..1) each frame; automatic mode
   *  eases the music bus toward the right level. No-op in manual mode. */
  updateVoiceLevel(voiceLevel: number, audioTime: number): void;
  dispose(): void;
}

export function createMasteringChain(ctx: BaseAudioContext, mode: MasteringMode): MasteringChain {
  const voiceInput = ctx.createGain();
  const musicInput = ctx.createGain();
  const output = ctx.createGain();
  voiceInput.gain.value = 1;
  musicInput.gain.value = 1;
  output.gain.value = 1;

  let duckGain: GainNode | null = null;
  let lastTarget = 1;

  if (mode === "automatic") {
    // Voice-priority ducking on the music bus only.
    duckGain = ctx.createGain();
    duckGain.gain.value = 1;
    musicInput.connect(duckGain);

    // Gentle glue compression: catches the moments when narration, music
    // and SFX stack up, without pumping. ~2-3 dB of reduction at most.
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.24;

    // Brick-wall-ish safety limiter: the render can never clip, no matter
    // what the user stacked on the timeline.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;

    voiceInput.connect(compressor);
    duckGain.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(output);
  } else {
    // Manual: the user's own audio, untouched.
    voiceInput.connect(output);
    musicInput.connect(output);
  }

  return {
    voiceInput,
    musicInput,
    output,
    mode,
    updateVoiceLevel(voiceLevel: number, audioTime: number) {
      if (!duckGain) return;
      const target = duckTargetForVoiceLevel(voiceLevel);
      // Only retarget on a meaningful change — setTargetAtTime spam is wasteful.
      if (Math.abs(target - lastTarget) < 0.02) return;
      lastTarget = target;
      try {
        duckGain.gain.setTargetAtTime(target, audioTime, duckTimeConstant(duckGain.gain.value, target));
      } catch {
        duckGain.gain.value = target;
      }
    },
    dispose() {
      try {
        voiceInput.disconnect();
        musicInput.disconnect();
        duckGain?.disconnect();
        output.disconnect();
      } catch {}
    },
  };
}
