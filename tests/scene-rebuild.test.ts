import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import { rebuildScenesFromScript, setupNeedsRebuild, type ScriptPart } from "../src/lib/scene-rebuild";
import type { Scene } from "../src/types";
import { splitScriptIntoScenes } from "../src/lib/duration-utils";
import {
  backgroundMusicFingerprint,
  planVoiceoverGeneration,
  recordGeneratedVoiceover,
  type VoiceoverAudioSnapshot,
} from "../src/lib/voiceover-generation";

/**
 * Going back to Setup and on again must never lose what was set in the other
 * sections (owner's rule, 2026-10-16). Setup's script is the one place that
 * can rewrite the scenes, so its two rules are pinned here.
 */
const h = createHarness();
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const NOW = 1_800_000_000_000;
const timing = (text: string) => 100 + text.length; // recognisable: a recomputed length
const options = { projectId: 7, retimeAll: false, now: () => NOW, durationFor: (text: string) => timing(text) };

/** A scene with settings from every section. */
const scene = (id: number, text: string, extra: Partial<Scene> = {}): Scene => ({
  id,
  project_id: 7,
  order_index: 0,
  text,
  image_query: `query for ${text}`,
  image_url: `https://img.example/${id}.jpg`,
  duration: 9, // a length set by hand in Scenes, not the computed one
  motion_effect: "pan_left",
  transition: "wipe-left",
  burn_caption: false,
  speaker_name: "Narrator B",
  image_zoom: 1.4,
  image_offset_x: 0.2,
  image_crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } as never,
  image_backdrop: "blur",
  blank_color: "#123456",
  voice_id: "scenering_female_03",
  animation: [{ id: "anim-1" }] as never,
  ...extra,
});
const parts = (...texts: string[]): ScriptPart[] => texts.map((text) => ({ text, imageQuery: `derived ${text}` }));

/* ---- 1. nothing changed in Setup, nothing changes ------------------------ */

const built = { script: "One.\n\nTwo.", duration: 20, oneScene: false };
h.ok(!setupNeedsRebuild({ ...built }, built), "the same script, length and one-scene choice need no rebuild");
h.ok(!setupNeedsRebuild({ ...built, script: "  One.\r\n\r\nTwo.  \n" }, built), "line endings and surrounding space are not a change");
/* The fault behind these: when Setup has nothing remembered for the project,
   the inputs the scenes were built from are reconstructed by joining the scene
   texts with a blank line. That is the very script the splitter flattened into
   those scenes, so it cannot be a change — but reading line breaks as
   significant said it was. Leaving Setup then rebuilt the whole list: every
   scene re-timed, re-searched and re-narrated, and because the scene count is
   derived from the word count of whichever text won the comparison, the
   rebuilt list could come back a different length. Whitespace now collapses
   the way splitScriptIntoScenes collapses it before splitting. */
h.ok(
  !setupNeedsRebuild({ ...built, script: "One. Two." }, built),
  "the same words rejoined as one paragraph are the script the scenes were split from"
);
h.ok(
  !setupNeedsRebuild({ ...built, script: "One.  Two." }, built),
  "a double space inside a sentence is not a change either"
);
h.ok(
  !setupNeedsRebuild({ ...built, script: "One.\nTwo." }, built),
  "nor is a single line break where the paragraph had two"
);
h.ok(setupNeedsRebuild({ ...built, script: "One.\n\nTwo!" }, built), "an edited word is a change");
/* A new scene length must NOT rebuild. Re-timing is applied on its own by
   handleUpdateSceneDuration and handleCalibrateScenesWordCount, and the
   latter's contract is that it persists the new duration without mutating
   text. A rebuild, by contrast, re-derives the scene count from the word
   count alone — so treating the length as a changed input used to delete a
   scene and invalidate every finished narration on the project. */
h.ok(!setupNeedsRebuild({ ...built, duration: 30 }, built), "a new scene length re-times the scenes but is not a rebuild");
h.ok(!setupNeedsRebuild({ ...built, duration: 10 }, built), "nor is a shorter one");
h.ok(setupNeedsRebuild({ ...built, oneScene: true }, built), "switching to one scene is a change");

/* ---- 2. a rebuild keeps every setting ---------------------------------- */

const prev = [scene(101, "One."), scene(102, "Two."), scene(103, "Three.")];
const same = rebuildScenesFromScript(prev, parts("One.", "Two.", "Three."), options);
h.eq(same.removed.length, 0, "an unchanged script removes nothing");
h.eq(JSON.stringify(same.scenes.map(({ order_index, ...rest }) => rest)), JSON.stringify(prev.map(({ order_index, ...rest }) => rest)), "an unchanged script leaves every scene exactly as it was");

const edited = rebuildScenesFromScript(prev, parts("One.", "Two, reworded.", "Three."), options);
const [a, b, c] = edited.scenes;
h.eq(b.text, "Two, reworded.", "the edited paragraph's new words reach its scene");
h.eq(b.duration, timing("Two, reworded."), "only the edited scene gets a new length");
h.eq(b.image_query, "derived Two, reworded.", "…and a search term from its new words");
h.eq(a.duration, 9, "an untouched scene keeps the length set by hand");
h.eq(c.duration, 9, "every untouched scene keeps its length");
for (const key of ["image_url", "motion_effect", "transition", "burn_caption", "speaker_name", "image_zoom", "image_offset_x", "image_backdrop", "blank_color", "voice_id"] as const) {
  h.eq(b[key], prev[1][key], `the edited scene keeps its ${key}`);
}
h.eq(JSON.stringify(b.image_crop), JSON.stringify(prev[1].image_crop), "the edited scene keeps its crop");
h.eq(JSON.stringify(b.animation), JSON.stringify(prev[1].animation), "the edited scene keeps its animations");
h.eq(b.id, 102, "a scene keeps its id, so its stored settings stay attached");

const locked = rebuildScenesFromScript([scene(201, "Old.", { image_query: "my pinned search", image_query_locked: true })], parts("New words."), options);
h.eq(locked.scenes[0].image_query, "my pinned search", "a pinned search term survives new words");

const retimed = rebuildScenesFromScript(prev, parts("One.", "Two.", "Three."), { ...options, retimeAll: true });
h.ok(retimed.scenes.every((s) => s.duration === timing(s.text)), "a new target length re-times every scene");
h.ok(retimed.scenes.every((s, i) => s.transition === prev[i].transition && s.burn_caption === false), "…and still keeps their settings");

const legacyVoice = rebuildScenesFromScript([scene(301, "Hi.", { voice_id: "en-US-GuyNeural" })], parts("Hi."), options);
h.eq(legacyVoice.scenes[0].voice_id, "scenering_male_01", "a historical voice id is migrated on the way through");

/* ---- 3. more or fewer paragraphs ---------------------------------------- */

const longer = rebuildScenesFromScript(prev, parts("One.", "Two.", "Three.", "Four.", "Five."), options);
h.eq(longer.scenes.length, 5, "new paragraphs become new scenes");
const fresh = longer.scenes.slice(3);
h.ok(fresh.every((s) => s.id > NOW - 1), "new scenes get clock-based ids, like the storage layer");
h.eq(new Set(longer.scenes.map((s) => s.id)).size, 5, "no two scenes share an id");
h.ok(fresh.every((s) => s.id !== 4 && s.id !== 5), "never a small id another project's scene could own");
h.ok(fresh.every((s) => s.project_id === 7 && s.image_url === null && s.duration === timing(s.text)), "new scenes start clean in this project");
h.ok(longer.scenes.slice(0, 3).every((s, i) => s.id === prev[i].id && s.burn_caption === false), "existing scenes are untouched by the additions");
h.eq(longer.scenes.map((s) => s.order_index).join(","), "0,1,2,3,4", "the running order is renumbered");

const shorter = rebuildScenesFromScript(prev, parts("One."), options);
h.eq(shorter.scenes.length, 1, "removed paragraphs remove their scenes");
h.eq(shorter.removed.map((s) => s.id).join(","), "102,103", "the removed scenes are reported so their rows can be deleted");

/* ---- 4. scenes added in Scenes are not part of the script ---------------- */

const withInserted = [scene(401, "One."), scene(402, "My clip", { is_inserted: true, video_url: "custom-video:abc" }), scene(403, "Two.")];
const kept = rebuildScenesFromScript(withInserted, parts("One.", "Two."), options);
h.eq(kept.scenes.map((s) => s.id).join(","), "401,402,403", "an inserted scene keeps its place between the script scenes");
h.eq(kept.scenes[1].text, "My clip", "an inserted scene is never overwritten by a paragraph");
h.eq(kept.removed.length, 0, "and nothing is deleted to make room");
const grown = rebuildScenesFromScript(
  [scene(501, "One."), scene(502, "Two."), scene(503, "Outro clip", { is_inserted: true })],
  parts("One.", "Two.", "Three."),
  options
);
h.eq(grown.scenes.map((s) => s.text).join(" | "), "One. | Two. | Three. | Outro clip", "a new paragraph continues the script, ahead of a scene inserted after it");

/* ---- 5. the app uses these rules ---------------------------------------- */

const app = read("src/App.tsx");
h.ok(app.includes('regenerateScenes === "if-changed" && !setupNeedsRebuild(submitted, saved)'), "an unchanged Setup leaves the scenes alone");
h.ok(app.includes("rebuildScenesFromScript(prev, parsed, {"), "a real change rebuilds through the rules above");
h.ok(app.includes("for (const stale of removed)"), "removed scenes' rows and settings are deleted");
h.ok(!/id: existing\?\.id \|\| idx \+ 1/.test(app), "the small-id rebuild is gone");
h.ok(app.includes("burn_caption: updates.burn_caption !== undefined ? updates.burn_caption : parsed.burn_caption"), "a scene's captions on/off is stored with its other settings");
const setup = read("src/components/SetupStudio.tsx");
h.ok(setup.includes('onUpdateScript(scriptText, "if-changed", durToApply, oneScene)'), "Setup's Next rebuilds only when something changed");
h.ok(setup.includes('onClick={() => handleApplyScript(true)}'), "the explicit Re-Generate button still rebuilds on request");

/* ---- 6. choosing a scene length must not re-narrate the project --------- */

/* THE FAULT THIS PINS.
 *
 * A creator with four narrated scenes who tapped "30 Seconds" in Setup lost
 * them. Two separate paths both treated the new length as a changed input and
 * rebuilt the scene list, and a rebuild re-derives the scene count from the
 * word count alone: this 180-word script is four scenes at twenty seconds and
 * TWO at thirty. The survivors were then re-written from the fresh split, so
 * their words no longer matched the narration already generated for them and
 * Voiceover re-narrated everything on the next Next. */
const line = "The camera moves slowly across the harbour at dawn today.";
const lengthScript = Array.from({ length: 18 }, () => line).join(" ");
const atTwenty = splitScriptIntoScenes(lengthScript, 20, false);
const atThirty = splitScriptIntoScenes(lengthScript, 30, false);
h.eq(atTwenty.length, 4, "the fixture script is four scenes at a twenty-second target");
h.eq(atThirty.length, 2, "and two at thirty — a rebuild on a length change would delete half the project");

const VOICE = "piper:scenering_male_01";
const music = backgroundMusicFingerprint([]);
const narratedScenes: Scene[] = atTwenty.map((text, i) => ({
  ...scene(500 + i, text),
  voice_id: VOICE,
  audio_url: `blob:https://scenering.app/narration-${500 + i}`,
}));
let snapshot: VoiceoverAudioSnapshot = {};
for (const sc of narratedScenes) snapshot = recordGeneratedVoiceover(snapshot, sc, VOICE, music);

const planTargets = (list: Scene[], snap: VoiceoverAudioSnapshot) =>
  planVoiceoverGeneration(list, {
    primaryVoice: VOICE,
    rotateVoices: false,
    secondVoice: VOICE,
    musicFingerprint: music,
    snapshot: snap,
  });

h.eq(planTargets(narratedScenes, snapshot).length, 0, "four fully narrated scenes need no further voiceover");

// The creator now picks "30 Seconds". Setup re-times the scenes and saves.
const lengthBuilt = { script: lengthScript, duration: 20, oneScene: false };
const lengthSubmitted = { script: lengthScript, duration: 30, oneScene: false };
h.ok(!setupNeedsRebuild(lengthSubmitted, lengthBuilt), "picking a new scene length does not rebuild the scene list");
h.eq(narratedScenes.length, 4, "so all four scenes are still there");
h.eq(narratedScenes.filter((sc) => sc.audio_url).length, 4, "and all four keep their finished narration");
h.eq(planTargets(narratedScenes, snapshot).length, 0, "and Voiceover still has nothing to regenerate");

// What the old behaviour did, kept visible so the guard cannot be reverted
// without the consequence being plain: rebuilding at thirty seconds.
const collapsed = rebuildScenesFromScript(
  narratedScenes,
  atThirty.map((text) => ({ text })),
  options
);
h.eq(collapsed.scenes.length, 2, "the rebuild the length change used to trigger leaves two scenes");
h.eq(collapsed.removed.length, 2, "and deletes the other two outright");

// The one-scene switch really does change the shape of the project.
h.ok(
  setupNeedsRebuild({ ...lengthBuilt, oneScene: true }, lengthBuilt),
  "switching to one scene still rebuilds, because that genuinely reshapes the project"
);

/* ---- 7. Setup re-times without re-splitting ------------------------------ */

const setupSource = read("src/components/SetupStudio.tsx");
const selectDuration = (() => {
  const start = setupSource.indexOf("const handleSelectDuration = (");
  const end = setupSource.indexOf("\n  };", start);
  return start === -1 ? "" : setupSource.slice(start, end === -1 ? setupSource.length : end);
})();
h.ok(selectDuration.includes("setSelectedDuration(seconds)"), "the slice really is handleSelectDuration's body");
/* Checked against the code with the comments removed. The explanation above
   the removed call names `onUpdateScript` on purpose, and a plain absence
   check would fail against the comment that documents the fix rather than
   against any code that regressed. */
const selectDurationCode = selectDuration
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((line) => line.replace(/\/\/.*$/, ""))
  .join("\n");
h.ok(
  !selectDurationCode.includes("onUpdateScript"),
  "choosing a scene length never rebuilds the script — re-timing is not re-splitting"
);
h.ok(
  selectDuration.includes("onUpdateSceneDuration?.(seconds, false)"),
  "it still re-times the scenes"
);
h.ok(
  selectDuration.includes("onCalibrateScenesWordCount?.(seconds, false)"),
  "and still calibrates them without mutating their text"
);
h.ok(
  setupSource.includes("will generate it again on Next"),
  "the format-to-duration action warns that finished narration will be remade"
);

h.done("scene rebuild");
