import { STUDIO_VOICE_PRESETS } from "../data/voice-presets";
import { PIPER_CANDIDATE_VOICES, type PiperCandidateVoice } from "./piper-candidate-voices";

/**
 * Current provisional bindings preserve Scenering's existing 10 male + 10
 * female style profiles and descriptions while routing them to a smaller set
 * of same-gender Piper models. Several profiles intentionally share a model
 * and use their rate variation. Final model selection and license/asset audit
 * remain release gates; these bindings are not a license certification.
 */
const MODEL_BY_PROFILE: Readonly<Record<string, string>> = {
  scenering_male_01: "en_US-joe-medium",
  scenering_male_02: "en_US-ryan-high",
  scenering_male_03: "en_GB-alan-medium",
  scenering_male_04: "en_GB-alan-medium",
  scenering_male_05: "en_US-hfc_male-medium",
  scenering_male_06: "en_GB-northern_english_male-medium",
  scenering_male_07: "en_US-ryan-high",
  scenering_male_08: "en_US-hfc_male-medium",
  scenering_male_09: "en_GB-alan-medium",
  scenering_male_10: "en_US-joe-medium",
  scenering_female_01: "en_US-amy-medium",
  scenering_female_02: "en_US-hfc_female-medium",
  scenering_female_03: "en_GB-cori-high",
  scenering_female_04: "en_GB-alba-medium",
  scenering_female_05: "en_US-kristin-medium",
  scenering_female_06: "en_GB-jenny_dioco-medium",
  scenering_female_07: "en_GB-cori-high",
  scenering_female_08: "en_GB-jenny_dioco-medium",
  scenering_female_09: "en_US-amy-medium",
  scenering_female_10: "en_US-kristin-medium",
};

export interface PiperSynthesisProfile {
  id: string;
  name: string;
  gender: "male" | "female";
  speed: number;
  voice: PiperCandidateVoice;
}

/** Parse an explicit Piper runtime voice ID: `piper:<scenering-profile-id>`. */
export function resolvePiperProfileVoice(voiceId: string): PiperSynthesisProfile | null {
  if (!voiceId.startsWith("piper:")) return null;
  const profileId = voiceId.slice("piper:".length);
  const preset = STUDIO_VOICE_PRESETS.find((item) => item.id === profileId);
  const modelId = MODEL_BY_PROFILE[profileId];
  if (!preset || !modelId) return null;
  const voice = PIPER_CANDIDATE_VOICES.find((item) => item.id === modelId);
  if (!voice) return null;
  const rate = preset.rateAdjustment ? Number.parseFloat(preset.rateAdjustment) / 100 : 0;
  return {
    id: profileId,
    name: preset.name,
    gender: preset.gender,
    speed: Math.max(0.75, Math.min(1.5, 1 + rate)),
    voice,
  };
}

/**
 * Piper currently returns audio without word-level speech marks. Keep the
 * script-caption/karaoke path alive with a monotonic duration-weighted estimate
 * until the final voice set exposes verified alignment data.
 */
export function estimatePiperWordTimings(text: string, duration: number) {
  const words = (text.match(/\S+/g) || []).filter(Boolean);
  if (!words.length || !Number.isFinite(duration) || duration <= 0) return [];
  const weights = words.map((word) => {
    const letters = word.replace(/[^\p{L}\p{N}']/gu, "");
    const syllableGroups = (letters.toLowerCase().match(/[aeiouy]+/g) || []).length;
    const punctuationPause = /[,;:]$/.test(word) ? 0.35 : /[.!?]$/.test(word) ? 0.65 : 0;
    return Math.max(1, letters.length * 0.45 + syllableGroups * 0.7) + punctuationPause;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  return words.map((word, index) => {
    const start = cursor;
    cursor = index === words.length - 1
      ? duration
      : cursor + duration * (weights[index] / totalWeight);
    return { text: word, start, end: Math.max(start, cursor) };
  });
}
