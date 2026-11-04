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
  sceneNeedsVoiceoverGeneration,
  voiceoverGenerationReason,
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

const primaryVoice = "scenering_male_01";
const secondVoice = "scenering_female_01";
const voiceB = "scenering_female_03";

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

/* ---- why a scene is queued, not merely that it is ---------------------- *
 *
 * A creator reported finished narration being synthesized again on pressing
 * Next, and the decision behind that was a bare boolean: every branch that can
 * cause it looked identical from the outside. The reason is now returned
 * beside the decision and reported when a batch starts, so the next report
 * carries the cause instead of inviting a guess. */

h.eq(
  voiceoverGenerationReason(scene(2, { voice_id: secondVoice }), secondVoice, musicKey, initialSnapshot["2"]),
  "no narration is attached to the scene",
  "a scene with nothing attached says so plainly"
);

const wrongVoiceReason = voiceoverGenerationReason(
  scene(1, { audio_url: "blob:session/one", voice_id: voiceB }),
  primaryVoice,
  musicKey,
  initialSnapshot["1"]
);
h.ok(
  Boolean(wrongVoiceReason && wrongVoiceReason.includes(voiceB) && wrongVoiceReason.includes(primaryVoice)),
  "a narrator mismatch names the narrator on the scene and the one expected"
);

h.eq(
  voiceoverGenerationReason(
    scene(1, { audio_url: "blob:session/one", voice_id: primaryVoice, text: "Rewritten line." }),
    primaryVoice,
    musicKey,
    initialSnapshot["1"]
  ),
  "the recorded words or narrator no longer match the scene",
  "an edited line is reported as the words having changed"
);

h.eq(
  voiceoverGenerationReason(savedScenes[0], primaryVoice, "a-different-music-bed", initialSnapshot["1"]),
  "the background music bed changed",
  "a new music bed is named as the cause"
);

h.eq(
  voiceoverGenerationReason(savedScenes[0], primaryVoice, musicKey, initialSnapshot["1"]),
  null,
  "a scene that is current gives no reason at all"
);

h.eq(
  voiceoverGenerationReason(
    scene(1, { audio_url: "blob:session/one", voice_id: primaryVoice, text: "" }),
    primaryVoice,
    musicKey,
    initialSnapshot["1"]
  ),
  null,
  "a scene with no words is never queued, so it has no reason either"
);

/* The decision and the explanation must not be able to drift apart: the
   boolean is the reason being present, so a scene is queued exactly when there
   is something to say about it. */
for (const candidate of [
  savedScenes[0],
  scene(2, { voice_id: secondVoice }),
  scene(1, { audio_url: "blob:session/one", voice_id: voiceB }),
  scene(1, { audio_url: "blob:session/one", voice_id: primaryVoice, text: "Rewritten line." }),
]) {
  h.eq(
    sceneNeedsVoiceoverGeneration(candidate, primaryVoice, musicKey, initialSnapshot["1"]),
    voiceoverGenerationReason(candidate, primaryVoice, musicKey, initialSnapshot["1"]) !== null,
    `scene ${candidate.id} is queued exactly when a reason exists`
  );
}

const studioReasons = read("src/components/VoiceoverStudio.tsx");
h.ok(
  studioReasons.includes("voiceoverGenerationReason(scene, voiceId, musicFingerprint, savedSnapshot[String(scene.id)])"),
  "Next writes down why each scene is queued before the batch costs the creator any time"
);
h.ok(
  studioReasons.includes("title={generationReasons.get(scene.id) || undefined}"),
  "and the review list carries the same reason on the badge it already shows"
);

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
  "prepared audio is preserved when a music bed changes"
);
h.ok(!isPreparedVoiceoverId(primaryVoice), "a Scenering profile is not mistaken for an imported voice");

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
h.ok(studio.includes("if (!generationInFlightRef.current) void stopLocalPiperSynthesis()"), "navigating away does not kill an in-flight narration batch");
h.ok(studio.includes("if (!componentMountedRef.current) return;"), "a finished background batch saves without pulling the user away from another step");
h.ok(studio.includes("You can visit another step; this batch keeps running"), "the progress notice tells creators they can inspect another step while audio finishes");
h.ok(
  studio.includes("await replaceSceneNarration("),
  "new audio replaces the old file outright (and is durably written) before Next leaves the section"
);
h.ok(studio.includes("resolveSceneAudioBuffer(scene, getSharedAudioContext())"), "scene playback restores saved audio instead of synthesizing it again");
h.ok(cache.includes("scene.audio_url?.startsWith(\"blob:\")"), "expired generated blob URLs fall back to the persistent voiceover cache");
h.ok(downloads.includes("resolveSceneAudioBuffer(scene, getSharedAudioContext())"), "downloads can recover voiceover files after a page reload");

/* ---- the button, the badges and the spoken report ------------------------ */

/** A function body, sliced by brace depth rather than by an indent guess. */
function bodyOf(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start === -1) return "";
  /* Start the brace count at the arrow, not at the first `{` after the
     signature: a parameter type such as `options: { viaNext?: boolean } = {}`
     has braces of its own, and counting from there returns the signature
     instead of the body. */
  const arrow = source.indexOf("=>", start);
  const open = arrow === -1 ? source.indexOf("{", start) : source.indexOf("{", arrow);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}
/** Code with the comments removed, so a check cannot be satisfied — or broken — by prose. */
const codeOnly = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");

const proceed = bodyOf(studio, "const handleProceedNext = async (");
h.ok(proceed.length > 0, "handleProceedNext was found in VoiceoverStudio");
h.ok(
  !codeOnly(proceed).includes("readAudioSnapshot("),
  "Next decides from the same record the badges were drawn from, not a second read of the store"
);
h.ok(
  proceed.includes("const savedSnapshot = voiceoverAudioSnapshot;"),
  "Next uses the render-time snapshot the review list is showing"
);

/* The seeding effect drops every entry whose scene is not in the list it is
   given. The list is transiently empty while a project loads, and running then
   erased the whole record — so finished narration came back unknown. */
const seeding = bodyOf(
  studio.slice(studio.indexOf("// Older projects already have useful audio")),
  "useEffect(() => {"
);
h.ok(seeding.length > 0, "the snapshot seeding effect was found");
h.ok(
  codeOnly(seeding).includes("if (scenes.length === 0) return;"),
  "the seeding effect never adopts from an empty scene list"
);

/* ---- completion is spoken, not only written ------------------------------ */

const spoken = bodyOf(studio, "const speakCompletion = (");
h.ok(spoken.length > 0, "a spoken completion report exists");
h.ok(spoken.includes("window.speechSynthesis"), "it uses the browser's own speech synthesis, so it needs no model download");
h.ok(spoken.includes("} catch {"), "a browser that refuses speech cannot fail the work it reports on");
h.ok(
  codeOnly(proceed).includes("speakCompletion("),
  "Next speaks the result before it moves on"
);
h.ok(
  /if \(!saved\) return;/.test(codeOnly(proceed)),
  "a failed batch is never announced as complete"
);
h.ok(
  codeOnly(proceed).includes("if (!componentMountedRef.current) return;"),
  "nothing is spoken to a creator who already left the section"
);

/* ---- a stuck commit flag used to freeze every Next button ---------------- */

const appSource = read("src/App.tsx");
const goToPhase = bodyOf(appSource, "const goToPhase = async (");
h.ok(goToPhase.length > 0, "goToPhase was found in App");
h.ok(
  /finally\s*{[^}]*setCommittingPhase\(null\)/.test(codeOnly(goToPhase)),
  "the committing flag clears whatever the commit does, so it can never stick"
);
h.ok(
  /if \(committingPhase\) \{[^}]*setNavNotice\(/.test(codeOnly(goToPhase)),
  "a Next press during a commit says so instead of doing nothing at all"
);

h.done("voiceover generation");
