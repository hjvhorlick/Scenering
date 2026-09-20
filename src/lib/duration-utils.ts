/**
 * Dynamic Scene Duration & Word Count Calibration Utilities
 *
 * Speaking Rate Standard:
 * - Natural conversational narration is ~2.5 words per second (150 words per minute).
 *
 * Durations:
 * - 10 seconds = ~25 words (range: 22 - 28 words)
 * - 20 seconds = ~50 words (range: 46 - 54 words)  <-- Standard 20s narration requires 2-3 full sentences
 * - 30 seconds = ~75 words (range: 70 - 80 words)
 */

export type DurationOption = 10 | 20 | 30;

export const DURATION_OPTIONS: {
  seconds: DurationOption;
  label: string;
  targetWords: number;
  wordRange: [number, number];
  tag: string;
  description: string;
}[] = [
  {
    seconds: 10,
    label: "10 Seconds",
    targetWords: 25,
    wordRange: [22, 28],
    tag: "Fast & Snappy",
    description: "Ideal for TikTok / YouTube Shorts with punchy, rapid-fire narration (~25 words).",
  },
  {
    seconds: 20,
    label: "20 Seconds",
    targetWords: 50,
    wordRange: [46, 54],
    tag: "Standard Pacing (Recommended)",
    description: "Balanced, natural documentary narration lasting 20s (~50 words / 2-3 full sentences).",
  },
  {
    seconds: 30,
    label: "30 Seconds",
    targetWords: 75,
    wordRange: [70, 80],
    tag: "Deep Dive & Cinematic",
    description: "Rich, detailed storytelling and in-depth educational or cinematic analysis (~75 words).",
  },
];

export const WORDS_PER_SECOND = 2.5;

/**
 * Returns the exact target word count for a duration in seconds.
 */
export function getTargetWordCount(seconds: number = 20): number {
  return Math.round(seconds * WORDS_PER_SECOND);
}

/**
 * Counts words in a string accurately.
 */
export function countWords(text?: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Calculates estimated spoken duration from word count at 2.5 words/second.
 */
export function getSpokenDurationFromWords(text?: string): number {
  const words = countWords(text);
  if (words === 0) return 0;
  return Math.round((words / WORDS_PER_SECOND) * 10) / 10;
}

/**
 * Predicts how many scenes a script will produce when flattened into one
 * continuous string and sliced into fixed word-count chunks (see parseScript).
 * Tiny leftovers (< 25% of a full chunk) are folded into the previous scene.
 * e.g. 102 words at the 20s default (50 words/scene) = 2 scenes (50 + 52).
 */
export function countScenesFromScript(script: string, targetDuration: number = 20): number {
  const targetWords = getTargetWordCount(targetDuration);
  const words = countWords(script);
  if (words === 0) return 0;

  const fullChunks = Math.floor(words / targetWords);
  const remainder = words % targetWords;
  if (fullChunks === 0) return 1;
  if (remainder === 0) return fullChunks;

  const leftoverThreshold = Math.max(3, Math.floor(targetWords * 0.25));
  return remainder < leftoverThreshold ? fullChunks : fullChunks + 1;
}

/**
 * Checks whether text is a short 1-liner that cannot fill a 20s duration.
 */
export function isOneLiner(text?: string): boolean {
  const words = countWords(text);
  return words > 0 && words < 28;
}

/**
 * Calculates the ideal duration for a given text so there is no dead silence.
 */
export function fitDurationToText(text?: string): number {
  const spoken = getSpokenDurationFromWords(text);
  return Math.max(3, Math.round(spoken));
}

export interface SceneTimingAssessment {
  wordsCount: number;
  spokenSeconds: number;
  targetSeconds: number;
  targetWords: number;
  isTooShort: boolean;
  isTooLong: boolean;
  isBalanced: boolean;
  differenceWords: number;
  differenceSeconds: number;
  recommendedDuration: number;
}

/**
 * Assesses whether scene text matches its duration.
 */
export function assessSceneTiming(
  text?: string,
  sceneDuration: number = 20
): SceneTimingAssessment {
  const wordsCount = countWords(text);
  const spokenSeconds = getSpokenDurationFromWords(text);
  const targetWords = getTargetWordCount(sceneDuration);
  const differenceWords = targetWords - wordsCount;
  const differenceSeconds = Math.round((sceneDuration - spokenSeconds) * 10) / 10;

  // A 1-liner (e.g. 12 words) taking 5s when duration is 20s is definitely too short
  const isTooShort = spokenSeconds < sceneDuration * 0.7;
  const isTooLong = spokenSeconds > sceneDuration * 1.35;
  const isBalanced = !isTooShort && !isTooLong;

  return {
    wordsCount,
    spokenSeconds,
    targetSeconds: sceneDuration,
    targetWords,
    isTooShort,
    isTooLong,
    isBalanced,
    differenceWords,
    differenceSeconds,
    recommendedDuration: Math.max(3, Math.round(spokenSeconds)),
  };
}

/**
 * Calculates dynamic scene duration based on narration text and audio.
 */
export function calculateDynamicDuration(
  text?: string,
  audioDuration?: number,
  targetDuration: number = 20
): number {
  if (audioDuration && audioDuration > 0.3) {
    const audioSec = Math.round((audioDuration + 0.1) * 10) / 10;
    return targetDuration ? Math.max(targetDuration, audioSec) : audioSec;
  }
  const clean = (text || "").trim();
  if (!clean) return targetDuration || 20;

  const spoken = getSpokenDurationFromWords(clean);
  return targetDuration ? Math.max(targetDuration, spoken) : (spoken > 0 ? spoken : 20);
}

// Topic-aware sentence expansions to turn 1-line text into a coherent 20s narration
function getContextualContinuations(
  text: string,
  targetWords: number
): string[] {
  const lower = text.toLowerCase();

  if (
    lower.includes("mountain") ||
    lower.includes("sun") ||
    lower.includes("nature") ||
    lower.includes("valley") ||
    lower.includes("forest") ||
    lower.includes("tree") ||
    lower.includes("wild") ||
    lower.includes("river") ||
    lower.includes("lake")
  ) {
    return [
      "Soft morning light filters through the ancient canopy, casting warm golden reflections that dance across the peaceful landscape.",
      "A gentle mountain breeze sweeps across the untamed wilderness, carrying the crisp scent of pine and fresh earth.",
      "Every ridge catches the amber glow of sunrise, creating dramatic shadows that sculpt the terrain in timeless elegance and quiet majesty.",
      "In this untouched sanctuary, each passing moment reveals nature's enduring power, inviting the viewer to pause and experience complete stillness.",
    ];
  }

  if (
    lower.includes("ocean") ||
    lower.includes("sea") ||
    lower.includes("wave") ||
    lower.includes("water") ||
    lower.includes("beach") ||
    lower.includes("sand") ||
    lower.includes("fish") ||
    lower.includes("turtle") ||
    lower.includes("dolphin") ||
    lower.includes("coral")
  ) {
    return [
      "Crystal-clear turquoise waters glisten under the radiant midday sun as vibrant schools of reef fish glide through blooming coral gardens.",
      "Rolling ocean swells rhythmically wash ashore, leaving delicate sea foam along the untouched coastline.",
      "The sweeping aerial perspective showcases the boundless expanse of azure waters stretching effortlessly toward the distant horizon.",
      "Beneath the tranquil surface lies an extraordinary aquatic world teeming with vitality, harmony, and ancient rhythm.",
    ];
  }

  if (
    lower.includes("city") ||
    lower.includes("street") ||
    lower.includes("building") ||
    lower.includes("skyline") ||
    lower.includes("urban") ||
    lower.includes("traffic") ||
    lower.includes("neon") ||
    lower.includes("metropolis") ||
    lower.includes("taxi") ||
    lower.includes("people")
  ) {
    return [
      "Towering skyscrapers reflect the dynamic pulse of the metropolis as crowds move through vibrant plazas with boundless energy.",
      "Architectural glass and illuminated billboards transform the urban corridor into a breathtaking symphony of light and motion.",
      "From elevated walkways to lively street corners, the city radiates innovation, ambition, and the collective heartbeat of modern life.",
      "As day turns to dusk, glowing avenues trace the continuous movement that defines this thriving cultural hub.",
    ];
  }

  if (
    lower.includes("ai") ||
    lower.includes("tech") ||
    lower.includes("future") ||
    lower.includes("cyber") ||
    lower.includes("computer") ||
    lower.includes("digital") ||
    lower.includes("robot") ||
    lower.includes("code") ||
    lower.includes("data")
  ) {
    return [
      "Intelligent neural networks synthesize complex streams of telemetry in real time, unlocking unprecedented clarity and seamless digital precision.",
      "Sleek interfaces and glowing data conduits converge to empower modern workflows and accelerate creative breakthroughs.",
      "This harmonious fusion of cutting-edge technology and human intuition paves the way for a transformative new era of discovery.",
      "Every algorithm works quietly behind the scenes, anticipating demands and shaping the future with effortless fluidity.",
    ];
  }

  // Universal cinematic narration continuations
  return [
    "Every subtle nuance and vivid atmospheric detail unfolds with crystal clarity as the camera glides steadily across the composition.",
    "Light and shadow play naturally across the scene, revealing rich textures and captivating movement that draw the viewer deep into the story.",
    "The sweeping perspective captures the grandeur of this moment, letting each spoken thought resonate with cinematic presence and deliberate focus.",
    "A deliberate, measured cadence gives viewers the space to absorb the visual beauty while connecting deeply with the overarching narrative.",
  ];
}

/**
 * Preserves the user's exact original words without appending any synthetic sentences.
 * User scripts are sacred and must NEVER have unsolicited descriptions or continuation sentences added.
 */
export function calibrateTextToTargetDuration(
  currentText: string,
  targetSeconds: number = 20
): string {
  const clean = (currentText || "").trim();
  if (!clean) {
    return generatePlaceholderForDuration(targetSeconds);
  }
  // Strictly preserve the user's exact script without appending any unsolicited sentences
  return clean;
}

/**
 * Specifically expands a 1-line script into a full 20-second narration paragraph (~50 words).
 */
export function expandOneLinerToTwentySeconds(oneLiner: string): string {
  return calibrateTextToTargetDuration(oneLiner, 20);
}

function generatePlaceholderForDuration(seconds: number): string {
  if (seconds === 10) {
    return "Golden light breaks across the horizon, casting warm cinematic reflections while the morning breeze gently sweeps through the open landscape.";
  }
  if (seconds === 30) {
    return "Golden morning light breaks across the boundless mountain range, casting warm cinematic reflections through the valley mist below. A gentle breeze sweeps through ancient pines as distant wildlife awakens in the crisp mountain air. Every detail reveals nature's timeless grandeur, creating an unforgettable atmosphere of serenity, resilience, and awe-inspiring wonder.";
  }
  // Default 20s (~50 words, takes exactly 20 seconds to read aloud)
  return "Golden morning light breaks across the boundless mountain range, casting warm cinematic reflections through the valley mist below. A gentle breeze sweeps through ancient pines as the entire landscape awakens. Every detail reveals nature's timeless grandeur, creating a peaceful and inspiring atmosphere for our journey.";
}
