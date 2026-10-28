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
 *   • no clipping                 (a soft safety limiter at the end, tuned
 *                                  exactly like the live preview's limiter)
 *   • no excessive loudness       (gentle bus compression, ~2 dB of work)
 *   • audible narration           (gentle vocal leveling and clarity EQ,
 *                                  never enough gain to re-trigger the
 *                                  limiter on ordinary speech)
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
 * The render's safety limiter.
 *
 * These are the exact values VideoPreview.tsx gives its master limiter,
 * pinned as exports so the rendered file and the approved preview share one
 * limiter. A soft knee (not zero) and a 16:1 ratio mean a peak is rounded
 * off rather than slammed, which is what keeps loud narration free of the
 * dips and grit an over-driven hard limiter puts into a voice track.
 * ------------------------------------------------------------------ */
export const RENDER_LIMITER_THRESHOLD_DB = -1.5;
export const RENDER_LIMITER_KNEE_DB = 6;
export const RENDER_LIMITER_RATIO = 16;
export const RENDER_LIMITER_ATTACK_SECONDS = 0.003;
export const RENDER_LIMITER_RELEASE_SECONDS = 0.15;
/**
 * Makeup gain after the gentle voice compressor.
 *
 * The compressor only does about 1–2 dB of work, and adding it back on top
 * of already maximised narration was enough to drive the limiter on every
 * loud syllable. Unity gain keeps the voice clear and leaves real headroom
 * for the limiter to do its actual job: catching the occasional true peak.
 */
export const VOICE_MAKEUP_GAIN = 1.0;

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
  /** Pre-ducks the music bed slightly ahead of a scheduled narration entrance
   *  during offline rendering so opening consonants are never masked before
   *  the first analyser sample fires. */
  primeVoiceEntrance?(speechStartSeconds: number): void;
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
  const internalNodes: AudioNode[] = [];

  if (mode === "automatic") {
    // Voice-priority ducking on the music bus only.
    duckGain = ctx.createGain();
    duckGain.gain.value = 1;
    internalNodes.push(duckGain);

    // Safety limiter: the render can never clip, no matter what the user
    // stacked on the timeline. It is deliberately the SAME limiter the live
    // preview plays through (VideoPreview.tsx) — a soft knee and a gentle
    // ratio, engaged only on the rare peak — so the exported voice sounds
    // like the one the creator approved.
    //
    // THE BUG THIS REPLACES: this used to be a hard-knee (knee 0), 20:1,
    // 1 ms-attack limiter at -1.2 dB, sitting behind a +1.28 dB makeup gain
    // and the presence/air EQ. Generated narration is already loudness
    // maximised (-14 LUFS / -2 dBTP), so those gains pushed every loud
    // syllable, sibilant and plosive OVER the limiter's threshold. It fired
    // over and over through the whole voiceover: each firing is an instant
    // gain dip (the "intermittent breaks") and fast 20:1 gain reduction on a
    // zero knee adds transient grit (the "glitches"). It only ever existed in
    // the offline render chain, which is exactly why the preview stayed clean
    // while the rendered voice did not. The constants are exported so the two
    // chains can never silently drift apart again.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = RENDER_LIMITER_THRESHOLD_DB;
    limiter.knee.value = RENDER_LIMITER_KNEE_DB;
    limiter.ratio.value = RENDER_LIMITER_RATIO;
    limiter.attack.value = RENDER_LIMITER_ATTACK_SECONDS;
    limiter.release.value = RENDER_LIMITER_RELEASE_SECONDS;
    internalNodes.push(limiter);

    // Dedicated vocal clarity & leveling channel, isolated from music-bus
    // compression so bass hits in the soundtrack never pump the narrator.
    let voiceTail: AudioNode = voiceInput;
    if (typeof ctx.createBiquadFilter === "function") {
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 80;
      highpass.Q.value = 0.707;

      const deMud = ctx.createBiquadFilter();
      deMud.type = "peaking";
      deMud.frequency.value = 250;
      deMud.Q.value = 1.1;
      deMud.gain.value = -1.8;

      const presence = ctx.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = 3200;
      presence.Q.value = 0.9;
      presence.gain.value = 2.2;

      const air = ctx.createBiquadFilter();
      air.type = "highshelf";
      air.frequency.value = 7500;
      air.gain.value = 1.6;

      voiceTail.connect(highpass);
      highpass.connect(deMud);
      deMud.connect(presence);
      presence.connect(air);
      voiceTail = air;
      internalNodes.push(highpass, deMud, presence, air);
    }

    const voiceCompressor = ctx.createDynamicsCompressor();
    voiceCompressor.threshold.value = -19;
    voiceCompressor.knee.value = 12;
    voiceCompressor.ratio.value = 2.2;
    voiceCompressor.attack.value = 0.006;
    voiceCompressor.release.value = 0.16;

    const voiceMakeup = ctx.createGain();
    voiceMakeup.gain.value = VOICE_MAKEUP_GAIN;
    voiceTail.connect(voiceCompressor);
    voiceCompressor.connect(voiceMakeup);
    voiceMakeup.connect(limiter);
    internalNodes.push(voiceCompressor, voiceMakeup);

    // Subtle vocal-pocket dip on the music bus around 2.8 kHz so speech
    // consonants stay intelligible without needing deeper volume ducking.
    let musicTail: AudioNode = musicInput;
    if (typeof ctx.createBiquadFilter === "function") {
      const musicPocket = ctx.createBiquadFilter();
      musicPocket.type = "peaking";
      musicPocket.frequency.value = 2800;
      musicPocket.Q.value = 0.85;
      musicPocket.gain.value = -1.8;
      musicInput.connect(musicPocket);
      musicTail = musicPocket;
      internalNodes.push(musicPocket);
    }
    musicTail.connect(duckGain);

    // Gentle glue compression on the music/SFX bus so stacked beds stay smooth.
    const musicCompressor = ctx.createDynamicsCompressor();
    musicCompressor.threshold.value = -15;
    musicCompressor.knee.value = 12;
    musicCompressor.ratio.value = 2.6;
    musicCompressor.attack.value = 0.01;
    musicCompressor.release.value = 0.24;
    duckGain.connect(musicCompressor);
    musicCompressor.connect(limiter);
    internalNodes.push(musicCompressor);

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
    primeVoiceEntrance(speechStartSeconds: number) {
      if (!duckGain || !Number.isFinite(speechStartSeconds)) return;
      const lead = Math.max(0, speechStartSeconds - 0.035);
      try {
        duckGain.gain.setTargetAtTime(MUSIC_DUCK_FLOOR, lead, 0.04);
      } catch {}
    },
    dispose() {
      try {
        voiceInput.disconnect();
        musicInput.disconnect();
        for (const node of internalNodes) {
          try { node.disconnect(); } catch {}
        }
        output.disconnect();
      } catch {}
    },
  };
}
