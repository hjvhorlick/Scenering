import { FREE_SPEECHIFY_VOICE_IDS, STUDIO_VOICE_PRESETS, migrateLegacyVoiceId } from "../data/voice-presets";
import { getStoredApiKeys } from "./api-keys";
import { sanitizeTextForSpeech } from "./speech-sanitizer";
import {
  buildSpeechifyVoiceProfiles,
  parseSpeechifySpeechMarks,
  parseSpeechifyVoices,
  resolveSpeechifyVoiceId,
  type SpeechifyVoice,
  type SpeechifyVoiceProfile,
} from "./speechify";
import type { WordTiming } from "./word-sync";

/** Browser-to-provider requests only: customer keys never pass through Scenering's Worker. */
export const SPEECHIFY_API_BASE = "https://api.speechify.ai/v1";
export const SPEECHIFY_MODEL = "simba-3.2";
const REQUEST_TIMEOUT_MS = 20_000;
const CATALOG_TTL_MS = 10 * 60_000;
const INPUT_LIMIT = 2_000;

export interface SpeechifyAudioResult {
  blob: Blob;
  rawBuffer: ArrayBuffer;
  mimeType: string;
  words: WordTiming[];
  providerVoiceId: string;
}

export interface SpeechifyStudioVoice {
  id: string;
  name: string;
  gender: "male" | "female";
  locale: string;
  accent: string;
  tone: string;
  recommendedFor: string;
  providerVoiceName?: string;
}

export interface SpeechifyDirectoryVoice {
  id: string;
  profileId?: string;
  name: string;
  gender: "male" | "female";
  locale: string;
  lang: string;
  friendlyName: string;
  type?: "shared" | "personal";
}

export class SpeechifyClientError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "SpeechifyClientError";
    this.status = status;
    this.code = code;
  }
}

let cachedCatalog: { fingerprint: string; expiresAt: number; voices: SpeechifyVoice[] } | null = null;

function getApiKey(apiKey?: string): string {
  const key = (apiKey ?? getStoredApiKeys().speechifyKey).trim();
  if (!key) {
    throw new SpeechifyClientError(400, "Add your Speechify API key in API Keys to load voices and create voiceovers.", "SPEECHIFY_KEY_REQUIRED");
  }
  return key;
}

async function fingerprintKey(apiKey: string): Promise<string> {
  try {
    if (!globalThis.crypto?.subtle) return "";
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

function describeProviderError(status: number, payload: any): string {
  if (status === 401) return "Speechify rejected this API key. Check it in API Keys and try again.";
  if (status === 402) return "Speechify requires available account credits or a higher Speechify plan.";
  if (status === 403) return "This Speechify key does not have permission to use the requested voice.";
  if (status === 429) return "Speechify is rate limiting this key. Wait a moment and try again.";
  const detail = typeof payload?.error?.message === "string"
    ? payload.error.message
    : typeof payload?.message === "string"
      ? payload.message
      : "";
  return detail ? `Speechify request failed: ${detail.slice(0, 240)}` : `Speechify request failed (${status}).`;
}

function makeRequestSignal(timeoutMs: number, externalSignal?: AbortSignal): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

function directConnectionError(error: any): SpeechifyClientError {
  if (error?.name === "AbortError") {
    return new SpeechifyClientError(504, "Speechify did not respond in time. Try again.", "timeout");
  }
  // Browsers intentionally hide the details of CORS/preflight failures. Never
  // fall back to Scenering's Worker: that would send the customer's key there.
  return new SpeechifyClientError(
    0,
    "Could not connect directly to Speechify from this browser. Check your connection and whether Speechify permits browser requests (CORS). Scenering does not proxy this key.",
    "direct_connection_failed"
  );
}

async function requestSpeechifyJson(
  url: string,
  apiKey: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
  externalSignal?: AbortSignal
): Promise<any> {
  const request = makeRequestSignal(timeoutMs, externalSignal);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(init.headers || {}),
      },
      signal: request.signal,
    });
  } catch (error: any) {
    throw directConnectionError(error);
  } finally {
    request.dispose();
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof payload?.error?.code === "string" ? payload.error.code : undefined;
    throw new SpeechifyClientError(response.status, describeProviderError(response.status, payload), code);
  }
  return payload;
}

function voicesUrl(limit?: number): string {
  const url = new URL(`${SPEECHIFY_API_BASE}/voices`);
  url.searchParams.set("model", SPEECHIFY_MODEL);
  url.searchParams.set("locale", "en");
  if (limit) url.searchParams.set("limit", String(limit));
  return url.toString();
}

/** Fetch the customer's own Speechify catalogue directly from Speechify. */
export async function fetchSpeechifyVoiceCatalog(apiKey?: string, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<SpeechifyVoice[]> {
  const key = getApiKey(apiKey);
  const fingerprint = await fingerprintKey(key);
  if (fingerprint && cachedCatalog?.fingerprint === fingerprint) {
    if (cachedCatalog.expiresAt > Date.now()) return cachedCatalog.voices;
    cachedCatalog = null;
  }

  const payload = await requestSpeechifyJson(
    voicesUrl(),
    key,
    { method: "GET" },
    options.timeoutMs,
    options.signal
  );
  const voices = parseSpeechifyVoices(payload).filter((voice) => voice.gender === "male" || voice.gender === "female");
  if (voices.length === 0) {
    throw new SpeechifyClientError(502, "Speechify returned no English voices compatible with Simba 3.2.", "empty_voice_catalog");
  }
  if (fingerprint) cachedCatalog = { fingerprint, expiresAt: Date.now() + CATALOG_TTL_MS, voices };
  return voices;
}

/** Validate a key directly with Speechify; it is never included in a Scenering request. */
export async function verifySpeechifyApiKey(apiKey: string): Promise<{ valid: boolean; message: string }> {
  const key = getApiKey(apiKey);
  const payload = await requestSpeechifyJson(voicesUrl(1), key, { method: "GET" });
  if (parseSpeechifyVoices(payload).length === 0) {
    throw new SpeechifyClientError(502, "Speechify returned no compatible voices for this key.", "empty_voice_catalog");
  }
  return { valid: true, message: "Connected! Speechify voice synthesis is ready." };
}

function studioVoicesFromProfiles(profiles: readonly SpeechifyVoiceProfile[]): SpeechifyStudioVoice[] {
  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    gender: profile.gender,
    locale: profile.providerLocale || profile.locale,
    accent: profile.accent,
    tone: profile.tone,
    recommendedFor: profile.recommendedFor,
    providerVoiceName: profile.providerVoiceName,
  }));
}

/** Style profiles bound to this user's Speechify catalogue (or static styles without a key). */
export async function fetchSpeechifyStudioVoices(apiKey?: string): Promise<SpeechifyStudioVoice[]> {
  const key = (apiKey ?? getStoredApiKeys().speechifyKey).trim();
  if (!key) {
    return STUDIO_VOICE_PRESETS.map((voice) => ({ ...voice }));
  }
  const catalog = await fetchSpeechifyVoiceCatalog(key);
  return studioVoicesFromProfiles(buildSpeechifyVoiceProfiles(catalog, STUDIO_VOICE_PRESETS));
}

/** Map provider voices to Scenering profiles and apply the existing Free/VIP directory boundary. */
export function buildSpeechifyVoiceDirectory(
  catalog: readonly SpeechifyVoice[],
  includeAdvancedVoices: boolean
): SpeechifyDirectoryVoice[] {
  const profiles = buildSpeechifyVoiceProfiles(catalog, STUDIO_VOICE_PRESETS);
  const freeProviderIds = new Set(
    profiles
      .filter((profile) => (FREE_SPEECHIFY_VOICE_IDS as readonly string[]).includes(profile.id))
      .map((profile) => profile.providerVoiceId)
      .filter(Boolean)
  );
  const profileIdByProviderVoice = new Map(
    profiles.filter((profile) => profile.providerVoiceId).map((profile) => [profile.providerVoiceId, profile.id])
  );
  return (includeAdvancedVoices ? catalog : catalog.filter((voice) => freeProviderIds.has(voice.id)))
    .map((voice) => ({
      id: voice.id,
      ...(profileIdByProviderVoice.get(voice.id) ? { profileId: profileIdByProviderVoice.get(voice.id) } : {}),
      name: voice.display_name,
      gender: voice.gender as "male" | "female",
      locale: voice.locale,
      lang: voice.locale,
      friendlyName: voice.display_name,
      ...(voice.type ? { type: voice.type } : {}),
    }));
}

/**
 * Speechify's generated audio and word marks are fetched browser-to-provider.
 * The BYOK key is read from this browser's local storage and is never sent to
 * Scenering's API/Worker, including on provider errors or CORS failures.
 */
export async function synthesizeSpeechify(
  text: string,
  requestedVoice: string,
  options: {
    apiKey?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    customDictionary?: any[];
  } = {}
): Promise<SpeechifyAudioResult> {
  const key = getApiKey(options.apiKey);
  const cleanText = sanitizeTextForSpeech(text, options.customDictionary).trim();
  if (!cleanText) throw new SpeechifyClientError(400, "Text is required.", "bad_request");

  const catalog = await fetchSpeechifyVoiceCatalog(key, options);
  const profiles = buildSpeechifyVoiceProfiles(catalog, STUDIO_VOICE_PRESETS);
  const providerVoiceId = resolveSpeechifyVoiceId(requestedVoice, catalog, profiles);
  const providerVoice = catalog.find((voice) => voice.id.toLowerCase() === providerVoiceId.toLowerCase());
  if (!providerVoice) {
    throw new SpeechifyClientError(400, "This voice is not available in your Speechify voice catalogue.", "voice_not_found");
  }

  const normalizedRequested = migrateLegacyVoiceId(requestedVoice);
  const styleProfile = profiles.find((profile) =>
    profile.id.toLowerCase() === normalizedRequested.toLowerCase() ||
    profile.providerVoiceId.toLowerCase() === providerVoiceId.toLowerCase()
  );
  const escaped = cleanText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  const input = styleProfile?.speechifyRate
    ? `<speak><prosody rate="${styleProfile.speechifyRate}">${escaped}</prosody></speak>`
    : escaped;
  if (input.length > INPUT_LIMIT) {
    throw new SpeechifyClientError(413, "Speechify accepts up to 2,000 characters per request. Shorten this scene and try again.", "payload_too_large");
  }

  const payload = await requestSpeechifyJson(
    `${SPEECHIFY_API_BASE}/audio/speech`,
    key,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input,
        voice_id: providerVoiceId,
        model: SPEECHIFY_MODEL,
        audio_format: "mp3",
        language: providerVoice.locale,
        options: { text_normalization: true },
      }),
    },
    options.timeoutMs,
    options.signal
  );

  const audioBase64 = typeof payload?.audio_data === "string" ? payload.audio_data.replace(/^data:[^,]+,/, "") : "";
  if (!audioBase64) throw new SpeechifyClientError(502, "Speechify returned no audio data.", "upstream_failure");
  let binary: string;
  try {
    binary = atob(audioBase64);
  } catch {
    throw new SpeechifyClientError(502, "Speechify returned invalid audio data.", "upstream_failure");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const rawBuffer = bytes.buffer;
  if (rawBuffer.byteLength === 0) throw new SpeechifyClientError(502, "Speechify returned empty audio data.", "upstream_failure");

  const format = typeof payload.audio_format === "string" ? payload.audio_format.toLowerCase() : "mp3";
  const mimeType = format === "wav" ? "audio/wav" : format === "ogg" ? "audio/ogg" : "audio/mpeg";
  return {
    rawBuffer,
    mimeType,
    blob: new Blob([rawBuffer], { type: mimeType }),
    words: parseSpeechifySpeechMarks(payload.speech_marks),
    providerVoiceId,
  };
}
