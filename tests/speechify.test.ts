import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import { FREE_SPEECHIFY_VOICE_IDS, STUDIO_VOICE_PRESETS, migrateLegacyVoiceId } from "../src/data/voice-presets";
import { isPlanVoiceIncluded } from "../src/config/plans";
import { activeWordIndexAt, alignWordTimings } from "../src/lib/word-sync";
import {
  buildSpeechifyVoiceProfiles,
  parseSpeechifySpeechMarks,
  parseSpeechifyVoices,
  resolveSpeechifyVoiceId,
  type SpeechifyVoice,
} from "../src/lib/speechify";

const h = createHarness();

const rows: SpeechifyVoice[] = [
  ...Array.from({ length: 10 }, (_, index) => ({
    id: `male-provider-${String(index + 1).padStart(2, "0")}`,
    display_name: `Male Voice ${String(index + 1).padStart(2, "0")}`,
    gender: "male" as const,
    locale: index % 2 === 0 ? "en-US" : "en-GB",
    models: ["simba-3.2"],
  })),
  ...Array.from({ length: 10 }, (_, index) => ({
    id: `female-provider-${String(index + 1).padStart(2, "0")}`,
    display_name: `Female Voice ${String(index + 1).padStart(2, "0")}`,
    gender: "female" as const,
    locale: index % 2 === 0 ? "en-US" : "en-GB",
    models: ["simba-3.2"],
  })),
];

const parsedCatalog = parseSpeechifyVoices({ voices: rows });
h.eq(parsedCatalog.length, 20, "valid Speechify catalogue entries are parsed");
h.eq(parseSpeechifyVoices({ voices: [{ id: "unknown", gender: "unspecified" }] }).length, 1, "unknown gender is represented safely");
h.eq(parseSpeechifyVoices(null).length, 0, "invalid catalogue payload becomes an empty list");

const profiles = buildSpeechifyVoiceProfiles(parsedCatalog);
h.eq(profiles.length, 20, "all twenty Scenering profiles are produced");
h.eq(profiles.filter((voice) => voice.gender === "male").length, 10, "profile binding retains ten male archetypes");
h.eq(profiles.filter((voice) => voice.gender === "female").length, 10, "profile binding retains ten female archetypes");
h.eq(new Set(profiles.map((voice) => voice.providerVoiceId)).size, 20, "available provider voices are bound distinctly");
h.eq(profiles[0].id, "speechify_male_01", "male free style is first");
h.eq(profiles[10].id, "speechify_female_01", "female free style begins its group");
h.ok(profiles.every((voice) => voice.providerVoiceId && voice.providerVoiceName), "every style resolves to a real customer voice");

const maleFree = profiles.find((voice) => voice.id === FREE_SPEECHIFY_VOICE_IDS[0])!;
h.eq(resolveSpeechifyVoiceId(maleFree.id, parsedCatalog, profiles), maleFree.providerVoiceId, "style profile resolves to its Speechify binding");
h.eq(resolveSpeechifyVoiceId("FEMALE-PROVIDER-03", parsedCatalog, profiles), "female-provider-03", "direct Speechify IDs retain provider case");
h.eq(resolveSpeechifyVoiceId("en-US-GuyNeural", parsedCatalog, profiles), maleFree.providerVoiceId, "legacy project voice migrates to a Speechify style");
h.eq(migrateLegacyVoiceId("CUSTOM_CaseSensitive_Voice"), "CUSTOM_CaseSensitive_Voice", "unknown provider IDs keep their original case");
h.ok(isPlanVoiceIncluded("free", FREE_SPEECHIFY_VOICE_IDS[0]), "free male Speechify profile is plan-included");
h.ok(isPlanVoiceIncluded("free", FREE_SPEECHIFY_VOICE_IDS[1]), "free female Speechify profile is plan-included");
h.ok(!isPlanVoiceIncluded("free", "speechify_male_02"), "advanced Speechify profile is plan-gated");

const words = parseSpeechifySpeechMarks([
  {
    type: "word",
    chunks: [
      { value: "Hello", start_time: 125, end_time: 420 },
      { value: "world", start_time: 500, end_time: 875 },
    ],
  },
  { value: "!", start_time: 876, end_time: 910 },
  { value: "invalid", start_time: "later", end_time: 1000 },
]);
h.eq(words.length, 3, "valid Speechify marks are retained and invalid marks skipped");
h.near(words[0].start, 0.125, 1e-9, "Speechify millisecond start is converted to seconds");
h.near(words[0].end, 0.42, 1e-9, "Speechify millisecond end is converted to seconds");
h.eq(parseSpeechifySpeechMarks({ chunks: [{ value: "single", start_time: 20, end_time: 80 }] }).length, 1, "single Speechify mark objects are accepted");
h.eq(parseSpeechifySpeechMarks(null).length, 0, "missing speech marks produce an empty timing list");
const captionSlots = alignWordTimings(["Hello", "world"], words);
h.near(captionSlots[0]?.start ?? NaN, 0.125, 1e-9, "converted Speechify marks align the first caption to the audio clock");
h.near(captionSlots[1]?.start ?? NaN, 0.5, 1e-9, "converted Speechify marks align the next caption to its spoken onset");
h.eq(activeWordIndexAt(captionSlots, 0.2), 0, "caption preview highlights the first word while it is spoken");
h.eq(activeWordIndexAt(captionSlots, 0.6), 1, "caption preview advances at the next provider word boundary");

const previewSource = readFileSync("src/components/VideoPreview.tsx", "utf8");
const renderSource = readFileSync("src/components/RenderView.tsx", "utf8");
h.ok(previewSource.includes("wordTimings: sa?.words") && previewSource.includes("audioTimeSec: speechElapsed"), "live captions use provider timings and the playback clock");
h.ok(renderSource.includes("wordTimings: audioBuffers.get(currentScene.id)?.words") && renderSource.includes("audioTimeSec: speechElapsed"), "exported captions use the same provider timings and render clock");
h.ok(previewSource.includes("sceneSpeechOffset(sceneIdx") && renderSource.includes("const speechOffset = idx === 0 ? leadIn : 0"), "preview and export apply the same narration lead-in before captions and speech");

const apiKeysModal = readFileSync("src/components/ApiKeysModal.tsx", "utf8");
const pixabayField = apiKeysModal.indexOf("{/* Pixabay Section */}");
const speechifyField = apiKeysModal.indexOf("{/* Speechify Section */}");
h.ok(pixabayField >= 0 && speechifyField > pixabayField, "Speechify key input remains below Pixabay in the existing API Keys modal");
h.ok(apiKeysModal.includes("Speechify API Key") && apiKeysModal.includes("speechifyKey"), "the modal saves the customer's Speechify key");
h.ok(apiKeysModal.includes("Required for voiceover"), "the modal marks the Speechify key as required for generated voiceover");
h.eq((apiKeysModal.match(/\{\/\* (?:Pexels|Pixabay|Speechify) Section \*\/\}/g) || []).length, 3, "the existing modal keeps exactly three provider-key sections, with no fourth field");
h.ok(apiKeysModal.includes("verifySpeechifyApiKey"), "Speechify key verification is a direct provider request");
h.ok(apiKeysModal.includes("Speechify requests go directly to Speechify"), "the modal explains Speechify key routing clearly");
h.ok(!apiKeysModal.includes("speechifyKey: keysToSave.speechifyKey"), "the Speechify secret is not included in the Cloudflare image-key verification body");
const speechifyClientSource = readFileSync("src/lib/speechify-client.ts", "utf8");
const workerSource = readFileSync("server.ts", "utf8");
h.ok(speechifyClientSource.includes('https://api.speechify.ai/v1'), "voice catalog and synthesis target Speechify directly");
h.ok(speechifyClientSource.includes('Authorization: `Bearer ${apiKey}`'), "direct Speechify requests use the browser-held key as provider authorization");
h.ok(!workerSource.includes("X-Speechify-Key") && !workerSource.includes("/api/tts"), "the Worker contains no Speechify credential or synthesis endpoint");

h.done("speechify");
