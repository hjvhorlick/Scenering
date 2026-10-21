import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import { FREE_SPEECHIFY_VOICE_IDS, SIMBA_32_VOICE_IDS, STUDIO_VOICE_PRESETS, migrateLegacyVoiceId, sameSpeechifySpeaker } from "../src/data/voice-presets";
import { buildSpeechifyVoiceDirectory } from "../src/lib/speechify-client";
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

// ── Casting: every style is spoken by one of the eight voices built for Simba 3.2.
const builtForModel: SpeechifyVoice[] = [
  { id: "wyatt_32", display_name: "Wyatt", gender: "male", locale: "en-US" },
  { id: "dominic_32", display_name: "Dominic", gender: "male", locale: "en-US" },
  { id: "hugh_32", display_name: "Hugh", gender: "male", locale: "en-GB" },
  { id: "edmund_32", display_name: "Edmund", gender: "male", locale: "en-GB" },
  { id: "geffen_32", display_name: "Geffen", gender: "female", locale: "en-US" },
  { id: "harper_32", display_name: "Harper", gender: "female", locale: "en-US" },
  { id: "beatrice_32", display_name: "Beatrice", gender: "female", locale: "en-GB" },
  { id: "imogen_32", display_name: "Imogen", gender: "female", locale: "en-GB" },
];
// Zero-shot catalogue voices that sort first alphabetically — what the old rule picked.
const imitated: SpeechifyVoice[] = [
  { id: "aaron", display_name: "Aaron", gender: "male", locale: "en-US" },
  { id: "abbie", display_name: "Abbie", gender: "female", locale: "en-US" },
  { id: "alfie", display_name: "Alfie", gender: "male", locale: "en-GB" },
  { id: "amelia", display_name: "Amelia", gender: "female", locale: "en-GB" },
  { id: "bruce", display_name: "Bruce", gender: "male", locale: "en-AU" },
  { id: "ciara", display_name: "Ciara", gender: "female", locale: "en-IE" },
];
const fullCatalog = [...imitated, ...rows, ...builtForModel];
const cast = buildSpeechifyVoiceProfiles(fullCatalog);
const builtIds = new Set<string>(SIMBA_32_VOICE_IDS);
h.eq(SIMBA_32_VOICE_IDS.length, 8, "the eight voices built for Simba 3.2 are listed");
h.ok(STUDIO_VOICE_PRESETS.every((preset) => !!preset.speechifyVoiceId && builtIds.has(preset.speechifyVoiceId)), "every style is cast with a built-for-Simba-3.2 voice");
h.ok(cast.every((profile) => profile.providerVoiceId === STUDIO_VOICE_PRESETS.find((preset) => preset.id === profile.id)?.speechifyVoiceId), "each style binds to the voice it is cast with");
h.eq(new Set(cast.map((profile) => profile.providerVoiceId)).size, 8, "all eight voices are used across the twenty styles");
h.ok(cast.every((profile) => builtIds.has(profile.providerVoiceId)), "no style falls back to an imitated catalogue voice");
h.eq(cast.length, 20, "the picker still has twenty styles");
h.eq(cast[0].providerVoiceId, "wyatt_32", "the Free male style (Warm Conversational) is Wyatt");
h.eq(cast[10].providerVoiceId, "geffen_32", "the Free female style (Clear Conversational) is Geffen");
h.eq(cast[0].name, "Wyatt · Warm Conversational", "the picker shows the Speechify voice name with the style");
const castCounts = new Map<string, number>();
for (const profile of cast) castCounts.set(profile.providerVoiceId, (castCounts.get(profile.providerVoiceId) || 0) + 1);
h.ok([...castCounts.values()].every((count) => count >= 2 && count <= 3), "each voice covers two or three styles");
h.ok(cast.every((profile) => {
  const voice = builtForModel.find((v) => v.id === profile.providerVoiceId)!;
  return voice.gender === profile.gender;
}), "every style keeps its gender");
h.ok(cast.filter((profile) => profile.locale === "en-US").every((profile) => profile.providerLocale === "en-US"), "American styles are spoken by American voices");
h.ok(cast.filter((profile) => profile.locale === "en-GB").every((profile) => profile.providerLocale === "en-GB"), "British styles are spoken by British voices");
const formerlyAustralianOrIrish = ["speechify_male_04", "speechify_male_09", "speechify_female_04", "speechify_female_08"];
h.ok(formerlyAustralianOrIrish.every((id) => cast.find((profile) => profile.id === id)?.providerLocale === "en-GB"), "the Australian and Irish styles are spoken by British voices");
h.ok(formerlyAustralianOrIrish.every((id) => STUDIO_VOICE_PRESETS.find((preset) => preset.id === id)?.accent === "British English"), "their cards say British English, matching the speaker");
h.ok(STUDIO_VOICE_PRESETS.every((preset) => builtForModel.find((voice) => voice.id === preset.speechifyVoiceId)?.locale === preset.locale), "every card's accent matches the voice that speaks it");
h.eq(cast.find((profile) => profile.id === "speechify_male_04")?.accent, "British English", "the accent shown follows the voice actually speaking");
h.eq(resolveSpeechifyVoiceId("speechify_female_07", fullCatalog, cast), "imogen_32", "a saved style resolves to its cast voice for synthesis");

// If Speechify withdraws one of the eight, another of the eight stands in.
const withoutHugh = buildSpeechifyVoiceProfiles(fullCatalog.filter((voice) => voice.id !== "hugh_32"));
h.eq(withoutHugh.find((profile) => profile.id === "speechify_male_03")?.providerVoiceId, "edmund_32", "a missing British voice is replaced by the other British voice built for the model");
h.ok(withoutHugh.every((profile) => builtIds.has(profile.providerVoiceId)), "a withdrawn voice never drops a style to an imitated voice while others of the eight remain");
const withoutWyatt = buildSpeechifyVoiceProfiles(fullCatalog.filter((voice) => voice.id !== "wyatt_32"));
h.eq(withoutWyatt[0].providerVoiceId, "dominic_32", "a missing American voice is replaced by the other American voice built for the model");

// Directory picks map to the Free style first, so Free users keep their voices.
const freeDirectory = buildSpeechifyVoiceDirectory(fullCatalog, false);
h.eq(freeDirectory.map((voice) => voice.id).sort().join(","), "geffen_32,wyatt_32", "the Free directory offers exactly the two Free voices");
h.eq(freeDirectory.find((voice) => voice.id === "wyatt_32")?.profileId, "speechify_male_01", "picking Wyatt maps to the Free male style, not a paid style sharing the voice");
h.eq(freeDirectory.find((voice) => voice.id === "geffen_32")?.profileId, "speechify_female_01", "picking Geffen maps to the Free female style");
h.ok(isPlanVoiceIncluded("free", freeDirectory.find((voice) => voice.id === "wyatt_32")!.profileId!), "the Free directory pick passes the plan check");
const paidDirectory = buildSpeechifyVoiceDirectory(fullCatalog, true);
h.eq(paidDirectory.find((voice) => voice.id === "dominic_32")?.profileId, "speechify_male_05", "a shared voice maps to the first style cast with it");

// Two-voice rotation needs two different speakers, not just two style names.
h.ok(sameSpeechifySpeaker("speechify_male_01", "speechify_male_02"), "Warm Conversational and Deep Cinematic are the same speaker");
h.ok(sameSpeechifySpeaker("speechify_female_03", "speechify_female_08"), "two styles cast with Imogen are the same speaker");
h.ok(sameSpeechifySpeaker("speechify_male_01", "wyatt_32"), "a style and its voice picked from the directory are the same speaker");
h.ok(sameSpeechifySpeaker("speechify_male_03", "speechify_male_03"), "the same style is the same speaker");
h.ok(!sameSpeechifySpeaker("speechify_male_01", "speechify_male_05"), "Wyatt and Dominic are different speakers");
h.ok(!sameSpeechifySpeaker("speechify_male_01", "speechify_female_01"), "the two Free voices are different speakers");
h.ok(!sameSpeechifySpeaker("speechify_male_01", undefined), "an empty selection is never the same speaker");
const voiceoverSource = readFileSync("src/components/VoiceoverStudio.tsx", "utf8");
h.ok(voiceoverSource.includes("sameSpeechifySpeaker(selectedVoice, secondVoice)") && !voiceoverSource.includes("selectedVoice === secondVoice"), "the rotation warning compares speakers");
h.ok(voiceoverSource.includes("Both sides are the same voice — rotation will sound like a single"), "the rotation warning keeps its existing wording");

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
/* Captions follow the provider's own word marks, on the clock the picture is
   drawn from. Footage with no narration has no provider, so its transcript
   supplies the marks and the footage supplies the clock — both branches are
   asserted, because a transcript read against the speech clock would put
   every caption a lead-in late. */
h.ok(
  previewSource.includes("wordTimings: sa?.words ?? footageWords") &&
    /audioTimeSec: footageWords \? Math\.max\(0, elapsedInScene \?\? 0\) : speechElapsed \?\? 0/.test(previewSource),
  "live captions use provider timings and the playback clock, or the footage's clock when the words came from its soundtrack"
);
h.ok(
  renderSource.includes("const spokenWords = audioBuffers.get(currentScene.id)?.words;") &&
    renderSource.includes("wordTimings: spokenWords ?? footageWords,") &&
    /audioTimeSec: footageWords \? elapsedInScene : speechElapsed/.test(renderSource),
  "exported captions use the same provider timings and render clock, falling back to a transcript only when there is no narration"
);
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
