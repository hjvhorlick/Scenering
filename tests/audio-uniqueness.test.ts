import { buildInsertAudioPlan } from "../src/lib/insert-audio";
import { getCachedSceneAudio, setCachedSceneAudio } from "../src/lib/tts-cache";
import type { TimelineInsert } from "../src/types";

let checks = 0;
const ok = (value: unknown, label: string) => {
  checks++;
  if (!value) throw new Error(label);
};

const insert = (id: string, category: TimelineInsert["category"], url: string): TimelineInsert => ({
  id,
  category,
  type: category,
  title: id,
  startTime: 0,
  duration: 10,
  position: { x: 0.5, y: 0.5 },
  size: 1,
  scope: "entire_video",
  audioSettings: { soundUrl: url, volume: 0.5, loop: category === "background_music" },
});

const plans = buildInsertAudioPlan([
  insert("old-music", "background_music", "/old.mp3"),
  insert("effect", "sound_effects", "/effect.mp3"),
  insert("new-music", "background_music", "/new.mp3"),
], 20);
ok(plans.filter((plan) => plan.key.includes("music")).length === 1, "only one music bed is rendered");
ok(plans.some((plan) => plan.key === "new-music"), "the newest music selection replaces the old one");
ok(plans.some((plan) => plan.key === "effect"), "sound effects remain independent");

const oldItem = { voiceId: "old", text: "hello", blobUrl: "blob:old", duration: 1 } as never;
const newItem = { voiceId: "new", text: "hello", blobUrl: "blob:new", duration: 1 } as never;
setCachedSceneAudio(99, "old", "hello", oldItem);
setCachedSceneAudio(99, "new", "hello", newItem);
ok(getCachedSceneAudio(99, "new", "hello") === newItem, "new voice resolves its own track");
ok(getCachedSceneAudio(99, "missing", "hello") === undefined, "missing voice never falls back to previous scene audio");

console.log(`PASS audio-uniqueness: ${checks} checks, 0 failed`);
