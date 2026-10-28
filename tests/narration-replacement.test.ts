import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import type { Scene, TimelineInsert } from "../src/types";
import {
  cachedNarrationBelongsToScene,
  planNarrationRetirement,
  planVoiceoverGeneration,
  type VoiceoverAudioSnapshot,
} from "../src/lib/voiceover-generation";
import { startVoiceSource } from "../src/lib/voice-fade";

/* ------------------------------------------------------------------ *
 * Replacing a narrator, rather than layering a second one.
 *
 * The report this pins down: a video was narrated, the creator went back and
 * chose a different voice, and the new (shorter) narration was generated —
 * yet a short piece of the FIRST voice was still heard at the end of the
 * video. The old file had never actually been replaced in every place a
 * later step could find it, so one scene kept playing it.
 *
 * Three separate rules make that impossible, and each is checked here:
 *
 *  1. A cached file counts as a scene's narration only while it was made for
 *     that scene's CURRENT narrator and CURRENT words.
 *  2. Choosing a different narrator detaches the files made with the old one,
 *     so no surface can play them while the new narration is being made.
 *  3. A line never sounds longer than its own scene, so a leftover longer file
 *     cannot be heard over the following scene or past the last frame.
 * ------------------------------------------------------------------ */

const h = createHarness();
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const scene = (id: number, overrides: Partial<Scene> = {}): Scene => ({
  id,
  project_id: 7,
  order_index: id - 1,
  text: `Scene ${id} narration.`,
  image_query: "abstract background",
  image_url: null,
  duration: 6,
  ...overrides,
});

const voiceA = "scenering_male_01";
const voiceB = "scenering_female_03";
const voiceC = "scenering_male_07";

/* ---- 1. Which files are this scene's narration? -------------------- */

h.eq(
  cachedNarrationBelongsToScene({ voiceId: voiceA, text: "Hello there." }, scene(1, { text: "Hello there.", voice_id: voiceA })),
  true,
  "a file made for the scene's own narrator and words is its narration"
);
h.eq(
  cachedNarrationBelongsToScene({ voiceId: voiceA, text: "Hello there." }, scene(1, { text: "Hello there.", voice_id: voiceB })),
  false,
  "a file made with the narrator this scene no longer has is not its narration"
);
h.eq(
  cachedNarrationBelongsToScene({ voiceId: voiceA, text: "Old script." }, scene(1, { text: "New script.", voice_id: voiceA })),
  false,
  "a file made for an earlier script is not this scene's narration"
);
h.eq(
  cachedNarrationBelongsToScene({ voiceId: voiceA, text: "Old script." }, scene(1, { text: "New script.", voice_id: "custom:my take" })),
  true,
  "the creator's own recording is never judged by the synthesised voice's fields"
);
h.eq(
  cachedNarrationBelongsToScene({ voiceId: "imported", text: "Hello." }, scene(1, { text: "Hello.", voice_id: voiceA })),
  true,
  "a file the shared cache did not make itself is matched on its words"
);
h.eq(cachedNarrationBelongsToScene(null, scene(1, { voice_id: voiceA })), false, "nothing cached is never narration");
h.eq(
  cachedNarrationBelongsToScene({ voiceId: voiceA, text: "  Spaced  " }, scene(1, { text: "Spaced", voice_id: voiceA })),
  true,
  "whitespace differences do not make a file stale"
);
h.eq(
  cachedNarrationBelongsToScene({ voiceId: voiceA, text: "Scene 1 narration." }, scene(1, { text: "Scene 1 narration." })),
  true,
  "a project saved before scenes recorded a narrator is matched on its words"
);
h.eq(
  cachedNarrationBelongsToScene({}, scene(1, { text: "Scene 1 narration.", voice_id: voiceA })),
  true,
  "a file entry with no identity fields of its own is still usable"
);

/* ---- 2. Choosing a narrator retires the old files ------------------ */

const narrated = [
  scene(1, { audio_url: "blob:one", voice_id: voiceA }),
  scene(2, { audio_url: "blob:two", voice_id: voiceA }),
  scene(3, { text: "", audio_url: null, voice_id: voiceA }),
];
const noRotation = { primaryVoice: voiceA, rotateVoices: false, secondVoice: voiceB };

h.eq(
  planNarrationRetirement(narrated, noRotation).length,
  0,
  "leaving the narrator alone retires nothing"
);

const changed = planNarrationRetirement(narrated, { ...noRotation, primaryVoice: voiceB });
h.eq(changed.length, 2, "every attached scene made with the old narrator is retired");
h.eq(changed[0]?.scene.id, 1, "the retirement names the scene that still holds the old file");
h.eq(changed[0]?.fromVoiceId, voiceA, "the retirement records which narrator is being replaced");
h.eq(changed[0]?.voiceId, voiceB, "the retirement carries the narrator the scene should now use");

const prepared = scene(4, { audio_url: "blob:prepared", voice_id: "custom:my own recording" });
h.eq(
  planNarrationRetirement([prepared], { ...noRotation, primaryVoice: voiceB }).length,
  0,
  "a prepared recording is an explicit choice and is never retired"
);

const legacy = scene(5, { audio_url: "blob:legacy" });
h.eq(
  planNarrationRetirement([legacy], { ...noRotation, primaryVoice: voiceB }).length,
  0,
  "audio saved before scenes recorded a narrator is left alone (nothing proves it is stale)"
);

const rotationScenes = [
  scene(1, { audio_url: "blob:a1", voice_id: voiceA }),
  scene(2, { audio_url: "blob:b1", voice_id: voiceB }),
  scene(3, { audio_url: "blob:a2", voice_id: voiceA }),
];
const rotation = { primaryVoice: voiceA, rotateVoices: true, secondVoice: voiceB };
h.eq(planNarrationRetirement(rotationScenes, rotation).length, 0, "an unchanged A/B rotation retires nothing");

const newSecond = planNarrationRetirement(rotationScenes, { ...rotation, secondVoice: voiceC });
h.eq(newSecond.length, 1, "changing Voice B retires only the scenes Voice B narrated");
h.eq(newSecond[0]?.scene.id, 2, "the rotating scene that used the old Voice B is the one retired");
h.eq(newSecond[0]?.voiceId, voiceC, "it is stamped with the new Voice B");

// What the Voiceover step does with the plan: detach the file, keep the scene
// pointed at the narrator it should now use. Next must then regenerate it.
const music: TimelineInsert = {
  id: "bed",
  category: "background_music",
  type: "bgm_soft_piano",
  title: "Soft piano",
  startTime: 0,
  duration: 30,
  position: { x: 0, y: 0 },
  size: 1,
  audioSettings: { soundUrl: "/audio/piano.mp3", volume: 0.3, loop: true },
};
const musicFingerprint = JSON.stringify([]);
const snapshot: VoiceoverAudioSnapshot = {
  "1": { input: JSON.stringify({ sceneId: 1, text: "Scene 1 narration.", voiceId: voiceA }), music: musicFingerprint },
  "2": { input: JSON.stringify({ sceneId: 2, text: "Scene 2 narration.", voiceId: voiceA }), music: musicFingerprint },
};
const retiredScenes = narrated.map((entry) => {
  const retirement = changed.find((row) => row.scene.id === entry.id);
  return retirement ? { ...entry, audio_url: null, voice_id: retirement.voiceId } : entry;
});
const regenerate = planVoiceoverGeneration(retiredScenes, {
  ...noRotation,
  primaryVoice: voiceB,
  musicFingerprint,
  snapshot,
});
h.eq(regenerate.length, 2, "the retired scenes are exactly what Next regenerates");
h.eq(
  regenerate.every((target) => target.voiceId === voiceB),
  true,
  "and they are regenerated in the newly chosen voice"
);
h.eq(regenerate[0]?.scene.audio_url ?? null, null, "the old file is no longer attached to the scene");

/* ---- 3. A line never sounds past its own scene -------------------- */

/** Just enough of a Web Audio graph to see what was scheduled. */
class FakeParam {
  value = 1;
  events: { kind: "set" | "ramp" | "cancel"; value: number; at: number }[] = [];
  setValueAtTime(value: number, at: number) {
    this.events.push({ kind: "set", value, at });
    return this;
  }
  linearRampToValueAtTime(value: number, at: number) {
    this.events.push({ kind: "ramp", value, at });
    return this;
  }
  cancelScheduledValues(at: number) {
    this.events.push({ kind: "cancel", value: 0, at });
    return this;
  }
}

class FakeGain {
  gain = new FakeParam();
  connect() {}
  disconnect() {}
}

class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started: { when: number; offset: number; duration?: number }[] = [];
  connect() {}
  disconnect() {}
  start(when: number, offset: number, duration?: number) {
    this.started.push({ when, offset, duration });
  }
  stop() {}
}

const makeContext = () => {
  const sources: FakeSource[] = [];
  const gains: FakeGain[] = [];
  const ctx = {
    currentTime: 0,
    destination: {} as AudioNode,
    createBufferSource: () => {
      const source = new FakeSource();
      sources.push(source);
      return source;
    },
    createGain: () => {
      const gain = new FakeGain();
      gains.push(gain);
      return gain;
    },
  };
  return { ctx, sources, gains };
};

const buffer = { duration: 9 } as AudioBuffer;

// A nine-second line under a four-second scene is heard for four seconds.
const clipped = makeContext();
startVoiceSource(clipped.ctx as unknown as BaseAudioContext, buffer, {} as AudioNode, {
  whenSeconds: 2,
  durationSeconds: 4,
});
h.eq(clipped.sources[0]?.started[0]?.duration, 4, "a line longer than its scene is scheduled only for the scene");
h.eq(clipped.sources[0]?.started[0]?.when, 2, "it still starts exactly where the scene placed it");
h.eq(
  clipped.gains[0]?.gain.events.some((event) => event.kind === "ramp" && event.value === 0 && Math.abs(event.at - 6) < 1e-9),
  true,
  "the cut is a short fade to silence at the end of the scene, not a click"
);

// A line shorter than its scene is left whole.
const whole = makeContext();
startVoiceSource(whole.ctx as unknown as BaseAudioContext, buffer, {} as AudioNode, {
  whenSeconds: 0,
  durationSeconds: 30,
});
h.eq(whole.sources[0]?.started[0]?.duration, undefined, "a line that fits its scene is not trimmed");
h.ok(
  !whole.gains[0]?.gain.events.some((event) => event.kind === "ramp" && event.value === 0),
  "and it keeps its natural ending instead of being faded out early"
);

// The offset (a seek into a line) counts against the scene's window too.
const seeked = makeContext();
startVoiceSource(seeked.ctx as unknown as BaseAudioContext, buffer, {} as AudioNode, {
  whenSeconds: 0,
  offsetSeconds: 3,
  durationSeconds: 2,
});
h.eq(seeked.sources[0]?.started[0]?.offset, 3, "playback starts at the requested point in the line");
h.eq(seeked.sources[0]?.started[0]?.duration, 2, "and is limited to what is left of the scene");

/* ---- 4. The pipeline uses these rules ----------------------------- */

const cache = read("src/lib/tts-cache.ts");
const studio = read("src/components/VoiceoverStudio.tsx");
const render = read("src/components/RenderView.tsx");
const preview = read("src/components/VideoPreview.tsx");

h.ok(
  cache.includes("export async function replaceSceneNarration("),
  "the voiceover cache can replace a scene's file outright"
);
h.ok(
  cache.includes("collectSceneNarration(sceneId)") && cache.includes("deleteSceneNarrationFromIDB(sceneId)"),
  "a replacement clears the scene's previous copies from memory and from IndexedDB"
);
h.ok(
  cache.includes("cachedNarrationBelongsToScene(candidate, scene)"),
  "resolution refuses a cached file that belongs to another narrator or script"
);
h.ok(
  studio.includes("planNarrationRetirement(scenes") && studio.includes("audio_url: null"),
  "choosing a narrator detaches the files made with the previous one"
);
h.ok(
  studio.includes("await replaceSceneNarration("),
  "generating a scene files the new narration as a replacement"
);
h.ok(
  studio.includes("findCachedNarration("),
  "switching back to a narrator re-attaches its cached file instead of paying to re-synthesise it"
);
h.ok(
  render.includes("durationSeconds: Math.max(0.05, entry.duration - entry.speechOffset)"),
  "the exported mix stops each narration at the end of its scene"
);
h.ok(
  preview.includes("durationSeconds: Math.max(0.05, windowDur - speechStartsAt - offset)"),
  "the live preview stops each narration at the end of its scene too"
);
h.ok(
  render.includes("isPreparedVoiceoverId(s.voice_id)") && preview.includes("isPreparedVoiceoverId(scene.voice_id)"),
  "a scene with nothing to say no longer plays a file an earlier script left behind"
);

h.done("narration replacement");
