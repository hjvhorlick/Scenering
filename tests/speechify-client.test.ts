import { createHarness } from "./harness";
import { fetchSpeechifyVoiceCatalog, synthesizeSpeechify, verifySpeechifyApiKey } from "../src/lib/speechify-client";

const h = createHarness();
const originalFetch = globalThis.fetch;
const calls: Array<{ url: string; init?: RequestInit }> = [];
const providerVoices = [
  { id: "male-direct-01", display_name: "Male Direct 01", gender: "male", locale: "en-US", models: ["simba-3.2"] },
  { id: "male-direct-02", display_name: "Male Direct 02", gender: "male", locale: "en-GB", models: ["simba-3.2"] },
  { id: "female-direct-01", display_name: "Female Direct 01", gender: "female", locale: "en-US", models: ["simba-3.2"] },
  { id: "female-direct-02", display_name: "Female Direct 02", gender: "female", locale: "en-GB", models: ["simba-3.2"] },
];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, init });
  if (url.includes("/voices")) {
    return new Response(JSON.stringify({ voices: providerVoices }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (url.endsWith("/audio/speech")) {
    return new Response(JSON.stringify({
      audio_data: "aGVsbG8=",
      audio_format: "mp3",
      speech_marks: [{ chunks: [{ value: "Hello", start_time: 0, end_time: 250 }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ error: "Unexpected URL" }), { status: 404 });
}) as typeof fetch;

try {
  const catalog = await fetchSpeechifyVoiceCatalog("customer-owned-test-key");
  h.eq(catalog.length, providerVoices.length, "browser fetch parses Speechify's real provider catalogue");

  const generated = await synthesizeSpeechify("Hello there.", "speechify_male_01", { apiKey: "customer-owned-test-key" });
  h.eq(generated.providerVoiceId, "male-direct-01", "style profiles bind to the customer's provider voice");
  h.eq(generated.mimeType, "audio/mpeg", "direct synthesis returns an MP3 blob type");
  h.eq(generated.rawBuffer.byteLength, 5, "provider audio is decoded locally in the browser");
  h.eq(generated.words.length, 1, "direct response retains Speechify word timings");
  h.eq(generated.words[0].text, "Hello", "provider word marks are available to caption sync");

  const verified = await verifySpeechifyApiKey("customer-owned-test-key");
  h.eq(verified.valid, true, "key check uses the direct Speechify catalogue request");

  h.ok(calls.length >= 3, "catalogue, synthesis and key-check requests all run");
  h.ok(calls.every((call) => call.url.startsWith("https://api.speechify.ai/v1/")), "every Speechify request goes directly to the provider host");
  h.ok(calls.every((call) => (call.init?.headers as Record<string, string>)?.Authorization === "Bearer customer-owned-test-key"), "the browser supplies the key only in Speechify's Authorization header");
  h.ok(calls.some((call) => call.url.endsWith("/audio/speech")), "synthesis posts directly to Speechify audio endpoint");
} finally {
  globalThis.fetch = originalFetch;
}

h.done("speechify direct client");
