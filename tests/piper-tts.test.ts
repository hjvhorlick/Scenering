import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import { migrateLegacyVoiceId, STUDIO_VOICE_PRESETS } from "../src/data/voice-presets";
import { estimatePiperWordTimings, resolvePiperProfileVoice } from "../src/lib/piper-profile-bindings";

const h = createHarness();
const male = STUDIO_VOICE_PRESETS.filter((profile) => profile.gender === "male");
const female = STUDIO_VOICE_PRESETS.filter((profile) => profile.gender === "female");

h.eq(STUDIO_VOICE_PRESETS.length, 20, "the existing curated profile catalogue remains at 20");
h.eq(male.length, 10, "the existing catalogue retains ten male profiles");
h.eq(female.length, 10, "the existing catalogue retains ten female profiles");
h.eq(migrateLegacyVoiceId("speechify_male_01"), "scenering_male_01", "saved male profile IDs migrate to the stable Scenering ID");
h.eq(migrateLegacyVoiceId("speechify_female_10"), "scenering_female_10", "saved female profile IDs migrate to the stable Scenering ID");
const studioSource = readFileSync("src/components/VoiceoverStudio.tsx", "utf8");
h.ok(studioSource.includes("handlePlayVoicePreview(voice.sampleText, voice.id, voice.id, globalSpeed)"), "every profile card has its own audition action");
h.ok(studioSource.includes("<span>Listen Sample</span>"), "audition controls are visible without a bulk-test gate");
h.ok(!studioSource.includes("Piper TTS · on-device synthesis") && !studioSource.includes("Prepare selected voice"), "the separate Piper info/preload panel is removed");
h.ok(studioSource.includes("aria-label={`Listen to ${voice.name} sample") && studioSource.includes("handlePlayVoicePreview(voice.sampleText, voice.id, voice.id, globalSpeed)"), "each individual voice card has its own accessible sample audition");
h.ok(studioSource.includes("ttsPlayer.play(text, engineVoice, speed") && !studioSource.includes("ttsPlayer.playBlob(new Blob([audio.rawBuffer]"), "voice samples use the shared player cache so replaying a card skips Piper synthesis");
const playerSource = readFileSync("src/lib/tts-player.ts", "utf8");
h.ok(playerSource.includes("const cacheKey = `${voice}\\u0000${cleanText}`") && playerSource.includes("this.rememberAudio(cacheKey, audioUrl)"), "synthesized previews are memoized by voice and sample text");
h.ok(playerSource.includes("onProgress"), "cold first use surfaces Piper preparation progress instead of appearing unresponsive");
const piperStorage = readFileSync("src/lib/piper-storage.ts", "utf8");
const piperWorker = readFileSync("src/lib/piper-tts.worker.ts", "utf8");
h.ok(piperStorage.includes("storage.persist()") && studioSource.includes("void requestPiperStoragePersistence(true)"), "user-initiated audition gestures request persistent browser storage for downloaded voice models");
h.ok(piperWorker.includes("cache.match(modelUrl)") && piperWorker.includes("await cache.put(modelUrl") && piperWorker.includes("await persistPromise"), "voice model downloads are saved and verified in CacheStorage before the first synthesis completes");
h.ok(piperWorker.includes("cache.match(url)") && piperWorker.includes("cache.put(url"), "voice configuration JSON is cached with the model to avoid repeated small network requests");
h.ok(piperWorker.includes("now - lastProgressAt >= 120"), "model-download progress updates are throttled to keep the UI responsive");
const piperClient = readFileSync("src/lib/piper-tts.ts", "utf8");
h.ok(studioSource.includes("prewarmPiperRuntime") && studioSource.includes('import("../lib/piper-tts")') && piperClient.includes('type: "warm"') && piperWorker.includes('request.type === "warm"') && piperWorker.includes("void loadPhonemizer().catch(() => {})"), "the voice screen warms shared phonemizer assets before audition without downloading every model");
const appSource = readFileSync("src/App.tsx", "utf8");
h.ok(appSource.includes("onClick={openPiperDemoWorkspace}") && appSource.includes("Open Piper demo project") && appSource.includes('setEditorStep("voiceover")'), "the demo CTA handler opens the real Voiceover step");
for (const profile of STUDIO_VOICE_PRESETS) {
  const local = resolvePiperProfileVoice(`piper:${profile.id}`);
  h.ok(Boolean(local), `${profile.name} resolves to a Piper synthesis model`);
  h.eq(local?.gender, profile.gender, `${profile.name} keeps its original gender group`);
  h.ok(Boolean(local?.voice.id), `${profile.name} resolves to a Piper model`);
  h.ok((local?.speed ?? 0) >= 0.75 && (local?.speed ?? 0) <= 1.5, `${profile.name} rate stays within the safe synthesis range`);
}

h.eq(resolvePiperProfileVoice("scenering_male_01"), null, "plain Scenering profile IDs require an explicit Piper synthesis prefix");
h.eq(resolvePiperProfileVoice("piper:missing-profile"), null, "unknown profile IDs fail closed");

const timings = estimatePiperWordTimings("A measured voice, with words that end well.", 4.8);
h.eq(timings.length, 8, "estimated timings preserve each script token");
h.eq(timings[0]?.start, 0, "the first word begins at the scene start");
h.eq(timings[timings.length - 1]?.end, 4.8, "the final word ends at the audio duration");
h.ok(timings.every((word, index) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end >= word.start && (index === 0 || word.start >= timings[index - 1]!.start)), "estimated word times stay finite and monotonic");
h.eq(estimatePiperWordTimings("   ", 3).length, 0, "empty text produces no word timings");
h.eq(estimatePiperWordTimings("hello", 0).length, 0, "zero-duration audio produces no word timings");

h.done("Piper voice catalogue and timing");
