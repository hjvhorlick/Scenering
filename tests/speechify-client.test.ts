import { createHarness } from "./harness";
import {
  SPEECHIFY_OUTPUT_FORMAT,
  SPEECHIFY_RENDITION,
  SpeechifyClientError,
  fetchSpeechifyVoiceCatalog,
  synthesizeSpeechify,
  verifySpeechifyApiKey,
} from "../src/lib/speechify-client";
import { getAudioCacheKey } from "../src/lib/tts-cache";
import { SIMBA_32_VOICE_IDS } from "../src/data/voice-presets";

const h = createHarness();
const originalFetch = globalThis.fetch;

interface Call { url: string; method: string; key: string; authorization?: string; body?: any }
const calls: Call[] = [];

/** What the fake Speechify answers; each scenario sets it before it runs. */
let speechify: {
  key: string;
  listed: any[];
  byId: Record<string, any>;
  byIdStatus?: Record<string, number>;
  speechReplies?: Array<{ status: number; body: any }>;
} = { key: "", listed: [], byId: {} };

const genericVoices = [
  { id: "male-direct-01", display_name: "Male Direct 01", gender: "male", locale: "en-US", models: ["simba-3.2"] },
  { id: "male-direct-02", display_name: "Male Direct 02", gender: "male", locale: "en-GB", models: ["simba-3.2"] },
  { id: "female-direct-01", display_name: "Female Direct 01", gender: "female", locale: "en-US", models: ["simba-3.2"] },
  { id: "female-direct-02", display_name: "Female Direct 02", gender: "female", locale: "en-GB", models: ["simba-3.2"] },
];
// The eight voices Speechify built for Simba 3.2, shaped like GET /v1/voices/{id}.
const builtForModel: Record<string, any> = {
  wyatt_32: { id: "wyatt_32", display_name: "Wyatt", gender: "male", locale: "en-US", type: "shared", models: [{ name: "simba-3.2", languages: [] }] },
  dominic_32: { id: "dominic_32", display_name: "Dominic", gender: "male", locale: "en-US", type: "shared", models: [{ name: "simba-3.2", languages: [] }] },
  hugh_32: { id: "hugh_32", display_name: "Hugh", gender: "male", locale: "en-GB", type: "shared", models: [{ name: "simba-3.2", languages: [] }] },
  edmund_32: { id: "edmund_32", display_name: "Edmund", gender: "male", locale: "en-GB", type: "shared", models: [{ name: "simba-3.2", languages: [] }] },
  geffen_32: { id: "geffen_32", display_name: "Geffen", gender: "female", locale: "en-US", type: "shared", models: [{ name: "simba-3.2", languages: [] }] },
  harper_32: { id: "harper_32", display_name: "Harper", gender: "female", locale: "en-US", type: "shared", models: [{ name: "simba-3.2", languages: [] }] },
  beatrice_32: { id: "beatrice_32", display_name: "Beatrice", gender: "female", locale: "en-GB", type: "shared", models: [{ name: "simba-3.2", languages: [] }] },
  imogen_32: { id: "imogen_32", display_name: "Imogen", gender: "female", locale: "en-GB", type: "shared", models: [{ name: "simba-3.2", languages: [] }] },
};

let inFlight = 0;
let maxLookupConcurrency = 0;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const headers = (init?.headers || {}) as Record<string, string>;
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  calls.push({ url, method: init?.method || "GET", key: speechify.key, authorization: headers.Authorization, body });

  const single = url.match(/\/v1\/voices\/([^/?]+)$/);
  if (single) {
    inFlight++;
    maxLookupConcurrency = Math.max(maxLookupConcurrency, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 2));
    inFlight--;
    const id = decodeURIComponent(single[1]);
    const forced = speechify.byIdStatus?.[id];
    if (forced) return json(forced, { error: { code: "upstream_failure", message: "try again" } });
    return speechify.byId[id] ? json(200, speechify.byId[id]) : json(404, { error: { code: "not_found", message: "Voice not found" } });
  }
  if (url.includes("/v1/voices")) return json(200, { voices: speechify.listed, has_more: true, next_cursor: "page-2" });
  if (url.endsWith("/audio/speech")) {
    const scripted = speechify.speechReplies?.shift();
    if (scripted) return json(scripted.status, scripted.body);
    return json(200, {
      audio_data: "aGVsbG8=",
      audio_format: "mp3",
      speech_marks: [{ chunks: [{ value: "Hello", start_time: 0, end_time: 250 }] }],
    });
  }
  return json(404, { error: "Unexpected URL" });
}) as typeof fetch;

const lookupsSince = (from: number) => calls.slice(from).filter((call) => /\/v1\/voices\/[^/?]+$/.test(call.url));
const listsSince = (from: number) => calls.slice(from).filter((call) => call.url.includes("/v1/voices?"));
const speechSince = (from: number) => calls.slice(from).filter((call) => call.url.endsWith("/audio/speech"));

try {
  // ── A. The eight are not available to this key: the earlier binding still works.
  speechify = { key: "customer-owned-test-key", listed: genericVoices, byId: {} };
  let mark = calls.length;
  const catalog = await fetchSpeechifyVoiceCatalog("customer-owned-test-key");
  h.eq(catalog.length, genericVoices.length, "browser fetch parses Speechify's real provider catalogue");
  h.eq(lookupsSince(mark).length, SIMBA_32_VOICE_IDS.length, "each built-for-Simba-3.2 voice missing from the first page is looked up once");
  h.eq(maxLookupConcurrency, 1, "voice lookups run one at a time, inside small Speechify plans' limits");

  const generated = await synthesizeSpeechify("Hello there.", "speechify_male_01", { apiKey: "customer-owned-test-key" });
  h.eq(generated.providerVoiceId, "male-direct-01", "without the eight, style profiles still bind to the customer's provider voice");
  h.eq(generated.mimeType, "audio/mpeg", "direct synthesis returns an MP3 blob type");
  h.eq(generated.rawBuffer.byteLength, 5, "provider audio is decoded locally in the browser");
  h.eq(generated.words.length, 1, "direct response retains Speechify word timings");
  h.eq(generated.words[0].text, "Hello", "provider word marks are available to caption sync");
  h.eq(listsSince(mark).length, 1, "the catalogue is cached: synthesis does not fetch the voice list again");

  const sent = speechSince(mark).at(-1)?.body;
  h.eq(sent?.output_format, SPEECHIFY_OUTPUT_FORMAT, "synthesis names Speechify's maximum-fidelity MP3 explicitly");
  h.eq(SPEECHIFY_OUTPUT_FORMAT, "mp3_24000_160", "the explicit format is 160 kbps MP3 at Simba's native 24 kHz");
  h.eq(sent?.audio_format, "mp3", "the MP3 container is still named for Speechify's default path");
  h.eq(sent?.model, "simba-3.2", "synthesis uses Simba 3.2");
  h.eq(sent?.options?.loudness_normalization, true, "loudness normalization is on, so no voice arrives too quiet");
  h.eq(sent?.options?.text_normalization, true, "text normalization stays on");

  const verified = await verifySpeechifyApiKey("customer-owned-test-key");
  h.eq(verified.valid, true, "key check uses the direct Speechify catalogue request");

  // ── B. The eight are reachable by id although the first list page omits them.
  speechify = { key: "key-built-for-model", listed: genericVoices, byId: builtForModel };
  mark = calls.length;
  const wyatt = await synthesizeSpeechify("Hello there.", "speechify_male_01", { apiKey: "key-built-for-model" });
  h.eq(wyatt.providerVoiceId, "wyatt_32", "the Free male style speaks with Wyatt, built for Simba 3.2");
  h.eq(speechSince(mark).at(-1)?.body?.voice_id, "wyatt_32", "the request to Speechify names Wyatt");
  const geffen = await synthesizeSpeechify("Hello there.", "speechify_female_01", { apiKey: "key-built-for-model" });
  h.eq(geffen.providerVoiceId, "geffen_32", "the Free female style speaks with Geffen, built for Simba 3.2");
  const hugh = await synthesizeSpeechify("Hello there.", "speechify_male_09", { apiKey: "key-built-for-model" });
  h.eq(hugh.providerVoiceId, "hugh_32", "the Irish style is spoken by Hugh, as cast");
  h.eq(speechSince(mark).at(-1)?.body?.language, "en-GB", "the request carries the speaking voice's own locale");
  h.eq(speechSince(mark).at(-1)?.body?.input, '<speak><prosody rate="-8%">Hello there.</prosody></speak>', "Irish Authority keeps its own pace, not that of another style Hugh speaks");
  h.eq(speechSince(mark)[0]?.body?.input, "Hello there.", "Warm Conversational is spoken at Wyatt's natural pace");

  // Styles sharing a voice differ by pace: each must keep its own.
  for (const [style, rate] of [
    ["speechify_male_02", "-8%"], ["speechify_male_10", "-12%"], ["speechify_male_03", "-4%"],
    ["speechify_male_07", "-10%"], ["speechify_male_08", "+6%"], ["speechify_female_02", "+5%"],
    ["speechify_female_03", "-5%"], ["speechify_female_08", "-6%"], ["speechify_female_04", "-7%"],
  ] as const) {
    await synthesizeSpeechify("Hello there.", style, { apiKey: "key-built-for-model" });
    h.eq(speechSince(mark).at(-1)?.body?.input, `<speak><prosody rate="${rate}">Hello there.</prosody></speak>`, `${style} is spoken at its own pace (${rate})`);
  }
  const directWyatt = await synthesizeSpeechify("Hello there.", "wyatt_32", { apiKey: "key-built-for-model" });
  h.eq(directWyatt.providerVoiceId, "wyatt_32", "Wyatt picked directly from the directory is used as picked");
  h.eq(speechSince(mark).at(-1)?.body?.input, "Hello there.", "a voice picked directly speaks at the pace of its first (Free) style");
  const cloned = await synthesizeSpeechify("Hello there.", "female-direct-02", { apiKey: "key-built-for-model" });
  h.eq(cloned.providerVoiceId, "female-direct-02", "a voice picked directly from the directory is still used as picked");
  h.eq(listsSince(mark).length, 1, "the looked-up voices are cached with the catalogue");

  // ── B2. When the eight are already on the first page, nothing is looked up.
  speechify = { key: "key-first-page", listed: [...genericVoices, ...Object.values(builtForModel)], byId: {} };
  mark = calls.length;
  const firstPage = await synthesizeSpeechify("Hello there.", "speechify_male_05", { apiKey: "key-first-page" });
  h.eq(firstPage.providerVoiceId, "dominic_32", "Documentary Professional speaks with Dominic, as cast");
  h.eq(lookupsSince(mark).length, 0, "voices already on the list page are not fetched again");

  // ── C. A passing lookup error surfaces and is not cached; the next try recovers.
  speechify = { key: "key-transient", listed: genericVoices, byId: builtForModel, byIdStatus: { hugh_32: 503 } };
  let transientError: unknown = null;
  try {
    await synthesizeSpeechify("Hello there.", "speechify_male_03", { apiKey: "key-transient" });
  } catch (error) {
    transientError = error;
  }
  h.ok(transientError instanceof SpeechifyClientError && transientError.status === 503, "a temporary lookup failure is reported, not quietly re-voiced");
  speechify.byIdStatus = {};
  mark = calls.length;
  const recovered = await synthesizeSpeechify("Hello there.", "speechify_male_03", { apiKey: "key-transient" });
  h.eq(recovered.providerVoiceId, "hugh_32", "after a failed attempt the catalogue is fetched afresh and Hugh is used");
  h.eq(listsSince(mark).length, 1, "the failed catalogue was not cached");

  // ── D. A workspace that refuses output_format still gets narration.
  speechify = {
    key: "key-format-refused",
    listed: genericVoices,
    byId: builtForModel,
    speechReplies: [{ status: 400, body: { error: { code: "validation_failed", message: "Validation failed", fields: { output_format: "unsupported value" } } } }],
  };
  mark = calls.length;
  const fallback = await synthesizeSpeechify("Hello there.", "speechify_female_01", { apiKey: "key-format-refused" });
  const attempts = speechSince(mark);
  h.eq(fallback.providerVoiceId, "geffen_32", "narration is produced after the format is refused");
  h.eq(attempts.length, 2, "exactly one retry follows the refusal");
  h.eq(attempts[1]?.body?.output_format, undefined, "the retry falls back to Speechify's default MP3");
  h.eq(attempts[1]?.body?.options?.loudness_normalization, true, "the retry keeps loudness normalization");

  speechify.speechReplies = [{ status: 400, body: { error: { code: "validation_failed", message: "Validation failed", fields: { input: "too long" } } } }];
  mark = calls.length;
  let otherError: unknown = null;
  try {
    await synthesizeSpeechify("Hello there.", "speechify_female_01", { apiKey: "key-format-refused" });
  } catch (error) {
    otherError = error;
  }
  h.ok(otherError instanceof SpeechifyClientError && otherError.status === 400, "any other 400 is reported to the customer");
  h.eq(speechSince(mark).length, 1, "an unrelated refusal is not retried");

  // ── E. Screens loading together share one catalogue request.
  speechify = { key: "key-shared", listed: genericVoices, byId: builtForModel };
  mark = calls.length;
  const [first, second] = await Promise.all([
    fetchSpeechifyVoiceCatalog("key-shared"),
    fetchSpeechifyVoiceCatalog("key-shared"),
  ]);
  h.eq(listsSince(mark).length, 1, "concurrent catalogue loads make one list request");
  h.eq(lookupsSince(mark).length, SIMBA_32_VOICE_IDS.length, "and one set of voice lookups");
  h.ok(first === second && first.length === genericVoices.length + SIMBA_32_VOICE_IDS.length, "both callers receive the same complete catalogue");

  const aborted = new AbortController();
  aborted.abort();
  speechify = { key: "key-aborted", listed: genericVoices, byId: builtForModel };
  let abortError: unknown = null;
  try {
    await fetchSpeechifyVoiceCatalog("key-aborted", { signal: aborted.signal });
  } catch (error) {
    abortError = error;
  }
  h.ok(abortError instanceof SpeechifyClientError, "an aborted caller still stops with Speechify's timeout error");

  // ── Cached narration is filed under the rendition, so old audio is not replayed.
  h.ok(SPEECHIFY_RENDITION.length > 0, "a narration rendition is defined");
  h.eq(getAudioCacheKey(7, "speechify_male_01", " Hello "), `${SPEECHIFY_RENDITION}_7_speechify_male_01_Hello`, "scene audio cache keys carry the rendition");

  // ── Every request goes straight to Speechify with the customer's key only in the header.
  h.ok(calls.length >= 3, "catalogue, synthesis and key-check requests all run");
  h.ok(calls.every((call) => call.url.startsWith("https://api.speechify.ai/v1/")), "every Speechify request goes directly to the provider host");
  h.ok(calls.every((call) => call.authorization === `Bearer ${call.key}`), "the browser supplies the key only in Speechify's Authorization header");
  h.ok(calls.every((call) => !call.url.includes(call.key) && !JSON.stringify(call.body ?? "").includes(call.key)), "the key never appears in a URL or request body");
  h.ok(calls.some((call) => call.url.endsWith("/audio/speech")), "synthesis posts directly to Speechify audio endpoint");
} finally {
  globalThis.fetch = originalFetch;
}

h.done("speechify direct client");
