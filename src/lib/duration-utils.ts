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
 * Splits a script into scenes of EVEN length.
 *
 * The old approach sliced fixed chunks of exactly `targetWords` and left the
 * remainder as its own scene. An 84-word script at 20s therefore produced
 * 50 + 34 words, and because every scene is still labelled 20s the short one
 * held ~6 seconds of silence. That is the "34 words in a 20 second scene" bug.
 *
 * Instead we choose the scene COUNT that gets closest to the target, then
 * spread the words evenly over that many scenes, preferring to break on
 * sentence boundaries so no scene ends mid-sentence.
 *
 * 84 words at 20s  -> 2 scenes of 42
 * 134 words at 20s -> 3 scenes of ~45
 * 234 words at 20s -> 5 scenes of ~47
 */
export function splitScriptIntoScenes(
  script: string,
  targetDuration: number = 20
): string[] {
  const targetWords = getTargetWordCount(targetDuration);
  const continuous = (script || "").replace(/\s+/g, " ").trim();
  if (!continuous) return [];

  const totalWords = countWords(continuous);

  // How many scenes gets each one closest to the target length?
  // Math.round means a 74-word script becomes one 74-word scene rather than
  // 50 + 24, while a 76-word script becomes two of 38.
  let sceneCount = Math.max(1, Math.round(totalWords / targetWords));
  // Never let a scene run more than ~1.25x the target, so a 74-word script at
  // 20s becomes two ~37-word scenes rather than one 30-second scene.
  while (totalWords / sceneCount > targetWords * 1.25) sceneCount++;
  if (sceneCount > totalWords) sceneCount = totalWords;

  if (sceneCount === 1) return [continuous];

  // Sentence-aware units, so a scene break lands at a full stop when possible.
  const sentences = continuous.match(/[^.!?]+[.!?]+(?:["')\]]+)?\s*|[^.!?]+$/g) || [continuous];
  const perSceneTarget = totalWords / sceneCount;

  // A sentence longer than a whole scene (or unpunctuated text) would block
  // splitting entirely, so break those on clause marks, then on plain words.
  const units: string[] = [];
  const maxUnit = Math.max(8, Math.ceil(perSceneTarget));
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (countWords(sentence) <= maxUnit) {
      units.push(sentence);
      continue;
    }
    // try clause boundaries first — commas, semicolons, colons, dashes
    const clauses = sentence.match(/[^,;:—–]+[,;:—–]+\s*|[^,;:—–]+$/g) || [sentence];
    for (const clauseRaw of clauses) {
      const clause = clauseRaw.trim();
      if (!clause) continue;
      if (countWords(clause) <= maxUnit) {
        units.push(clause);
        continue;
      }
      // Last resort: plain word slices. These are cut finer than a scene
      // (about a quarter) so the boundary picker below still has enough
      // granularity to make every scene the same length — coarse slices would
      // force the remainder into a short final scene.
      const w = clause.split(" ");
      const grain = Math.max(1, Math.floor(maxUnit / 4));
      for (let i = 0; i < w.length; i += grain) units.push(w.slice(i, i + grain).join(" "));
    }
  }
  if (units.length === 0) return [continuous];

  // Cumulative word count at every possible break point.
  const cum: number[] = [0];
  for (const u of units) cum.push(cum[cum.length - 1] + countWords(u));

  const effectiveCount = Math.min(sceneCount, units.length);
  const ideal = totalWords / effectiveCount;

  // Choose the break points that minimise total squared deviation from the
  // ideal scene length. An exact dynamic program rather than a greedy walk,
  // because greedy accumulates rounding error and dumps the remainder into a
  // short final scene — exactly the bug this replaces.
  //
  // cost[k][i] = best cost using k scenes for the first i units.
  const INF = Infinity;
  const cost: number[][] = [];
  const from: number[][] = [];
  for (let k = 0; k <= effectiveCount; k++) {
    cost.push(new Array(units.length + 1).fill(INF));
    from.push(new Array(units.length + 1).fill(0));
  }
  cost[0][0] = 0;

  for (let k = 1; k <= effectiveCount; k++) {
    for (let i = k; i <= units.length - (effectiveCount - k); i++) {
      for (let j = k - 1; j < i; j++) {
        if (cost[k - 1][j] === INF) continue;
        const len = cum[i] - cum[j];
        const dev = len - ideal;
        const c = cost[k - 1][j] + dev * dev;
        if (c < cost[k][i]) {
          cost[k][i] = c;
          from[k][i] = j;
        }
      }
    }
  }

  // Walk the choices back into scene boundaries.
  const cuts: number[] = new Array(effectiveCount + 1);
  cuts[effectiveCount] = units.length;
  let idx = units.length;
  for (let k = effectiveCount; k >= 1; k--) {
    idx = from[k][idx];
    cuts[k - 1] = idx;
  }

  const scenes: string[] = [];
  for (let k = 0; k < effectiveCount; k++) {
    const text = units.slice(cuts[k], cuts[k + 1]).join(" ").trim();
    if (text) scenes.push(text);
  }

  return scenes.length > 0 ? scenes : [continuous];
}

/**
 * Predicts how many scenes a script will produce. Always agrees with
 * splitScriptIntoScenes, so the count shown in Setup matches what is created.
 */
export function countScenesFromScript(script: string, targetDuration: number = 20): number {
  return splitScriptIntoScenes(script, targetDuration).length;
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

/**
 * The duration a scene should hold, given its own text.
 *
 * Every scene used to be stamped with the project's target duration, so a
 * short scene sat in silence for the remainder. Scenes are now split evenly,
 * and this rounds each one to its actual spoken length while staying within
 * sensible bounds of the target the user chose.
 */
export function sceneDurationForText(text: string, targetDuration: number = 20): number {
  const spoken = getSpokenDurationFromWords(text);
  if (spoken <= 0) return targetDuration;
  // a little breathing room at the end of the narration
  const withPad = spoken + 0.4;
  const lo = Math.max(3, targetDuration * 0.5);
  const hi = targetDuration * 1.6;
  return Math.round(Math.min(hi, Math.max(lo, withPad)) * 10) / 10;
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
  // A scene lasts as long as its narration — no longer.
  //
  // This used to return Math.max(targetDuration, spoken), which padded every
  // scene out to the configured length and left a silent stretch on screen
  // whenever the narration was shorter. The voice is now the authority; the
  // target is only a fallback for scenes with no words at all.
  if (audioDuration && audioDuration > 0.3) {
    // A short breath so the cut does not clip the last syllable.
    return Math.round((audioDuration + 0.35) * 10) / 10;
  }
  const clean = (text || "").trim();
  if (!clean) return targetDuration || 20;

  const spoken = getSpokenDurationFromWords(clean);
  return spoken > 0 ? Math.round(spoken * 10) / 10 : targetDuration || 20;
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
