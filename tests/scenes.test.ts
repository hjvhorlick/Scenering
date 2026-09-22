import { createHarness } from "./harness";
import {
  splitScriptIntoScenes,
  countScenesFromScript,
  sceneDurationForText,
  calculateDynamicDuration,
  getSpokenDurationFromWords,
  getTargetWordCount,
  countWords,
  WORDS_PER_SECOND,
} from "../src/lib/duration-utils";
import {
  clipTiming,
  clipIsMuted,
  clipTimeForProgress,
  sceneHasClip,
} from "../src/lib/scene-clip";
import { buildSceneImageQuery, extractEntities } from "../src/lib/topic-extract";
import type { Scene } from "../src/types";

const h = createHarness();

// ---------------------------------------------------------------- splitting
// Scenes must be evenly filled. The original bug: 84 words at 20s produced a
// 50-word scene followed by a stunted 34-word one.
const SENTENCES = [
  "The old lighthouse stood against the storm.",
  "Waves broke across the rocks below it.",
  "A single lamp burned in the tower window.",
  "Nobody had climbed those stairs in years.",
  "The keeper's journal lay open on the desk.",
  "Salt had eaten through the iron railings.",
];

for (const target of [10, 20, 30]) {
  for (let count = 1; count <= 24; count++) {
    const script = Array.from({ length: count }, (_, i) => SENTENCES[i % SENTENCES.length]).join(" ");
    const scenes = splitScriptIntoScenes(script, target);

    h.ok(scenes.length >= 1, `at least one scene (${count} sentences, ${target}s)`);
    h.eq(
      countScenesFromScript(script, target),
      scenes.length,
      `predicted count matches actual (${count} sentences, ${target}s)`
    );

    // No words may be lost or duplicated by the split.
    const originalWords = countWords(script);
    const splitWords = scenes.reduce((sum, s) => sum + countWords(s), 0);
    h.eq(splitWords, originalWords, `words conserved (${count} sentences, ${target}s)`);

    for (const scene of scenes) {
      h.ok(scene.trim().length > 0, "no empty scene produced");
    }

    // Evenness: with several scenes, none should be a stunted remainder.
    if (scenes.length > 1) {
      const counts = scenes.map(countWords);
      const smallest = Math.min(...counts);
      const largest = Math.max(...counts);
      h.ok(
        smallest >= largest * 0.45,
        `uneven split at ${target}s: ${counts.join("+")} (smallest ${smallest}, largest ${largest})`
      );
    }
  }
}

// The reported regression, pinned exactly.
const eightyFour = Array.from({ length: 12 }, () => "Alpha beta gamma delta epsilon zeta eta.").join(" ");
const evenSplit = splitScriptIntoScenes(eightyFour, 20).map(countWords);
h.ok(
  Math.max(...evenSplit) - Math.min(...evenSplit) <= 6,
  `well-punctuated prose splits evenly, got ${evenSplit.join("+")}`
);

h.eq(splitScriptIntoScenes("", 20).length, 0, "empty script yields no scenes");
h.eq(splitScriptIntoScenes("   ", 20).length, 0, "blank script yields no scenes");
h.eq(splitScriptIntoScenes("One short line.", 20).length, 1, "a short script is one scene");

// --------------------------------------------------------------- durations
h.eq(WORDS_PER_SECOND, 2.5, "speech rate constant");
h.eq(getTargetWordCount(20), 50, "20s target word count");

for (const target of [10, 20, 30]) {
  h.eq(sceneDurationForText("", target), target, "empty text falls back to the target");
  for (let words = 1; words <= 120; words += 3) {
    const text = Array.from({ length: words }, () => "word").join(" ");
    const dur = sceneDurationForText(text, target);
    h.finite(dur, `duration finite (${words} words)`);
    h.ok(dur > 0, `duration positive (${words} words)`);
    h.ok(dur <= target * 1.6 + 0.001, `duration capped (${words} words @${target}s)`);
    h.ok(dur >= Math.max(3, target * 0.5) - 0.001, `duration floored (${words} words @${target}s)`);
  }
}

// THE RULE: scene length follows the voice, so there are no silent stretches.
// This used to be Math.max(configured, spoken), padding every short scene.
for (let audio = 0.5; audio <= 40; audio += 0.5) {
  const fitted = calculateDynamicDuration("some narration", audio, 20);
  h.near(fitted, audio + 0.35, 0.06, `duration follows the voice at ${audio}s`);
}
h.ok(
  calculateDynamicDuration("short", 3, 20) < 20,
  "a 3s narration must not be padded out to 20s"
);
h.eq(calculateDynamicDuration("", undefined, 20), 20, "no text and no audio uses the target");
h.ok(getSpokenDurationFromWords("one two three four five") > 0, "spoken duration is positive");

// ------------------------------------------------------------------- clips
const base = {
  id: 1, project_id: 1, order_index: 0, text: "hi",
  image_query: "", image_url: null, duration: 10,
} as Scene;

h.eq(clipIsMuted({ ...base, video_url: "x" }), true, "script scene mutes its clip");
h.eq(
  clipIsMuted({ ...base, video_url: "x", is_inserted: true }),
  false,
  "an inserted scene keeps its own clip audio"
);
h.eq(
  clipIsMuted({ ...base, video_url: "x", is_inserted: true, video_mute: true }),
  true,
  "an explicit mute overrides the inserted default"
);
h.eq(
  clipIsMuted({ ...base, video_url: "x", video_mute: false }),
  false,
  "an explicit unmute overrides the script default"
);
h.ok(sceneHasClip({ ...base, video_url: "x" }) && !sceneHasClip(base), "sceneHasClip");

const trimmed = clipTiming({
  ...base, video_url: "x", video_duration: 30, video_trim_start: 5, video_trim_end: 15,
});
h.eq(trimmed.length, 10, "trim window length");
const repaired = clipTiming({
  ...base, video_url: "x", video_duration: 12, video_trim_start: 8, video_trim_end: 3,
});
h.ok(repaired.end > repaired.start, "an inverted trim window is repaired");

for (const mode of ["trim", "loop", "slow"] as const) {
  const scene = {
    ...base, video_url: "x", video_duration: 30,
    video_trim_start: 5, video_trim_end: 15, video_fit_mode: mode,
  } as Scene;
  for (let i = 0; i <= 100; i++) {
    const t = clipTimeForProgress(scene, i / 100, 20);
    h.finite(t, `${mode} clip time finite`);
    h.ok(t >= 5 - 1e-6 && t <= 15 + 1e-6, `${mode} stays inside the trim window (got ${t})`);
  }
}
h.finite(clipTimeForProgress({ ...base, video_url: "x" } as Scene, 0.5, 10), "clip time without a duration");
h.finite(
  clipTimeForProgress(
    { ...base, video_url: "x", video_duration: 30, video_trim_end: 15 } as Scene, 0.5, 0
  ),
  "clip time with a zero-length scene"
);

// -------------------------------------------------------- image topic terms
// Names and places must drive the query, not the opening words.
const topicCases: [string, string][] = [
  ["In the years that followed, Nelson Mandela walked out of Victor Verster Prison.", "Mandela"],
  ["It was a long journey. The caravan finally reached Jerusalem at dawn.", "Jerusalem"],
  ["Meanwhile, the Roman Empire expanded across Gaul under Julius Caesar's command.", "Caesar"],
  ["She walked to the market in Marrakesh, where spices filled the air.", "Marrakesh"],
];
for (const [text, mustContain] of topicCases) {
  const query = buildSceneImageQuery(text);
  h.ok(
    query.toLowerCase().includes(mustContain.toLowerCase()),
    `"${query}" should mention ${mustContain}`
  );
  h.ok(query.split(/\s+/).length <= 5, `query stays short: "${query}"`);
}

const naiveInput = "In the years that followed, Nelson Mandela walked out of prison.";
const naive = naiveInput
  .replace(/[^a-zA-Z\s]/g, " ")
  .split(/\s+/)
  .filter((w) => w.length > 3)
  .slice(0, 5)
  .join(" ");
h.ok(
  buildSceneImageQuery(naiveInput) !== naive,
  "the query must not be the old first-few-words behaviour"
);
h.eq(buildSceneImageQuery(""), "cinematic background", "empty text falls back");
h.eq(buildSceneImageQuery("a an the of", { stored: "ocean" }), "ocean", "stored query is the fallback");
h.ok(
  extractEntities("The battle of New York changed everything. New York never recovered.")
    .some((e) => e.text.includes("New York")),
  "multi-word place names are kept together"
);

h.done("scenes");
