import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import type { Scene, TimelineInsert } from "../src/types";
import {
  backgroundMusicFingerprint,
  expectedVoiceForSceneIndex,
  isPreparedVoiceoverId,
  isVoiceoverAudioSnapshot,
  planVoiceoverGeneration,
  recordCurrentVoiceoverAudio,
  recordGeneratedVoiceover,
  type VoiceoverAudioSnapshot,
} from "../src/lib/voiceover-generation";

const h = createHarness();
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const scene = (id: number, overrides: Partial<Scene> = {}): Scene => ({
  id,
  project_id: 42,
  order_index: id - 1,
  text: `Scene ${id} narration.`,
  image_query: "abstract background",
  image_url: null,
  duration: 5,
  ...overrides,
});

const music = (overrides: Partial<TimelineInsert> = {}): TimelineInsert => ({
  id: "music-insert-one",
  category: "background_music",
  type: "bgm_soft_piano",
  title: "Soft piano",
  startTime: 0,
  duration: 30,
  position: { x: 0, y: 0 },
  size: 1,
  audioSettings: { soundUrl: "/audio/piano.mp3", volume: 0.4, loop: true },
  ...overrides,
});

const primaryVoice = "speechify_male_01";
const secondVoice = "speechify_female_01";
const voiceB = "speechify_female_03";

h.eq(expectedVoiceForSceneIndex(0, primaryVoice, true, secondVoice), primaryVoice, "rotation starts with Voice A");
h.eq(expectedVoiceForSceneIndex(1, primaryVoice, true, secondVoice), secondVoice, "rotation assigns Voice B to the next scene");
h.eq(expectedVoiceForSceneIndex(1, primaryVoice, false, secondVoice), primaryVoice, "rotation off uses Voice A for every scene");

const savedScenes = [
  scene(1, { audio_url: "blob:session/one", voice_id: primaryVoice }),
  scene(2, { audio_url: "blob:session/two", voice_id: secondVoice }),
];
const musicTrack = music();
const musicKey = backgroundMusicFingerprint([musicTrack]);
const baseOptions = {
  primaryVoice,
  rotateVoices: true,
  secondVoice,
  musicFingerprint: musicKey,
};

h.eq(
  planVoiceoverGeneration(savedScenes, { ...baseOptions, snapshot: {} }).length,
  0,
  "an existing A/B rotation is kept instead of being mistaken for stale Voice A audio"
);

const initialSnapshot = recordCurrentVoiceoverAudio({}, savedScenes, baseOptions);
h.eq(Object.keys(initialSnapshot).length, 2, "legacy saved tracks are adopted as the first baseline");
h.eq(
  planVoiceoverGeneration(savedScenes, { ...baseOptions, snapshot: initialSnapshot }).length,
  0,
  "returning to the section with the same voices and music skips synthesis"
);

const missingAudio = [savedScenes[0], scene(2, { voice_id: secondVoice })];
const missingPlan = planVoiceoverGeneration(missingAudio, { ...baseOptions, snapshot: initialSnapshot });
h.eq(missingPlan.length, 1, "only a scene with no saved audio is generated");
h.eq(missingPlan[0]?.scene.id, 2, "the generation plan identifies the missing scene");

const changedVoicePlan = planVoiceoverGeneration(savedScenes, {
  ...baseOptions,
  secondVoice: voiceB,
  snapshot: initialSnapshot,
});
h.eq(changedVoicePlan.length, 1, "changing Voice B regenerates only scenes assigned to Voice B");
h.eq(changedVoicePlan[0]?.scene.id, 2, "the changed speaker is associated with the correct scene");
h.eq(changedVoicePlan[0]?.voiceId, voiceB, "the plan carries the new speaker into synthesis");

const changedScriptScenes = [
  scene(1, { ...savedScenes[0], text: "Revised narration." }),
  savedScenes[1],
];
const changedScriptPlan = planVoiceoverGeneration(changedScriptScenes, {
  ...baseOptions,
  snapshot: initialSnapshot,
});
h.eq(changedScriptPlan.length, 1, "editing one scene's script invalidates only that scene's audio");
h.eq(changedScriptPlan[0]?.scene.id, 1, "the edited scene is the one queued for synthesis");

const changedMusicKey = backgroundMusicFingerprint([
  music({ audioSettings: { soundUrl: "/audio/piano.mp3", volume: 0.7, loop: true } }),
]);
h.ok(changedMusicKey !== musicKey, "changing music settings changes the music fingerprint");
const changedMusicPlan = planVoiceoverGeneration(savedScenes, {
  ...baseOptions,
  musicFingerprint: changedMusicKey,
  snapshot: initialSnapshot,
});
h.eq(changedMusicPlan.length, 2, "a changed music bed invalidates each generated narration track on Next");

const sameTrackWithDifferentInsertId = backgroundMusicFingerprint([
  music({ id: "new-timeline-item-id" }),
]);
h.eq(sameTrackWithDifferentInsertId, musicKey, "reselecting the same music does not count as a track change");
const nonMusicInsert = {
  ...music(),
  id: "visual-insert",
  category: "audio_visualizers" as const,
  type: "orb_visualizer",
};
h.eq(
  backgroundMusicFingerprint([musicTrack, nonMusicInsert]),
  musicKey,
  "visual and other timeline inserts do not invalidate narration audio"
);

const prepared = scene(3, {
  audio_url: "blob:prepared-track",
  voice_id: "custom:recorded narration",
});
h.ok(isPreparedVoiceoverId(prepared.voice_id), "user-provided audio is identified as a prepared voice");
h.eq(
  planVoiceoverGeneration([prepared], {
    ...baseOptions,
    musicFingerprint: changedMusicKey,
    snapshot: initialSnapshot,
  }).length,
  0,
  "prepared audio is preserved when a music bed changes instead of being sent to Speechify"
);
h.ok(!isPreparedVoiceoverId(primaryVoice), "a Speechify style is not mistaken for an imported voice");

h.eq(
  planVoiceoverGeneration([scene(4, { text: "   " })], { ...baseOptions, snapshot: {} }).length,
  0,
  "empty scenes are never sent for synthesis"
);

const staleSnapshot: VoiceoverAudioSnapshot = {
  ...initialSnapshot,
  "1": { input: "previous text/voice", music: "previous music" },
};
const notOverwritten = recordCurrentVoiceoverAudio(staleSnapshot, savedScenes, baseOptions);
h.eq(notOverwritten["1"]?.input, "previous text/voice", "baseline adoption never hides a known-stale scene");
const generatedSnapshot = recordGeneratedVoiceover(notOverwritten, savedScenes[0], primaryVoice, musicKey);
h.ok(generatedSnapshot["1"]?.input !== "previous text/voice", "a successful synthesis replaces that scene's fingerprint");
h.ok(isVoiceoverAudioSnapshot(generatedSnapshot), "the saved generation snapshot passes validation");
h.ok(!isVoiceoverAudioSnapshot([]) && !isVoiceoverAudioSnapshot({ "1": { input: 1, music: "x" } }), "malformed snapshots are rejected safely");

const studio = read("src/components/VoiceoverStudio.tsx");
const cache = read("src/lib/tts-cache.ts");
const downloads = read("src/lib/voice-download.ts");
h.ok(!studio.includes("Generate & Save Voiceover for All Scenes"), "the duplicate whole-project Generate button is removed");
h.ok(studio.includes('onNext={() => handleProceedNext("captions")}'), "Next remains the whole-project generation action");
h.ok(studio.includes("planVoiceoverGeneration(scenes"), "Next uses the input-aware generation plan");
h.ok(
  studio.includes("await replaceSceneNarration("),
  "new audio replaces the old file outright (and is durably written) before Next leaves the section"
);
h.ok(studio.includes("resolveSceneAudioBuffer(scene, getSharedAudioContext())"), "scene playback restores saved audio instead of synthesizing it again");
h.ok(cache.includes("scene.audio_url?.startsWith(\"blob:\")"), "expired generated blob URLs fall back to the persistent voiceover cache");
h.ok(downloads.includes("resolveSceneAudioBuffer(scene, getSharedAudioContext())"), "downloads can recover voiceover files after a page reload");

h.done("voiceover generation");
