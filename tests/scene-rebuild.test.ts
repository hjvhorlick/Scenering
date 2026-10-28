import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import { rebuildScenesFromScript, setupNeedsRebuild, type ScriptPart } from "../src/lib/scene-rebuild";
import type { Scene } from "../src/types";

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
h.ok(setupNeedsRebuild({ ...built, script: "One.\n\nTwo!" }, built), "an edited word is a change");
h.ok(setupNeedsRebuild({ ...built, duration: 30 }, built), "a new scene length is a change");
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

h.done("scene rebuild");
