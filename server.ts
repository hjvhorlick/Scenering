import express from "express";
import { GoogleGenAI } from "@google/genai";
import { NATURE_FALLBACKS } from "./src/data/nature-fallbacks.ts";
import { sanitizeTextForSpeech } from "./src/lib/speech-sanitizer.ts";
import { parseEdgeWordBoundaries, type WordTiming } from "./src/lib/word-sync.ts";
import { randomBytes } from "node:crypto";
import { env } from "./src/env.ts";
import { audioStore } from "./src/audio-store.ts";
import {
  assertSecurePlatformConfiguration,
  platformFeatureAllowed,
  platformRateLimit,
  registerLemonSqueezyWebhook,
  registerPlatformRoutes,
  requirePlatformUser,
} from "./server/platform.ts";
import {
  pexelsPhotoToCandidate,
  pixabayHitToCandidate,
  pixabayUpgradeUrlTo1920,
  wikimediaInfoToCandidate,
  type StockCandidate,
} from "./src/lib/image-candidates.ts";

/**
 * Fisher–Yates shuffle on a copy. Used so the bundled nature library comes
 * back in a different order on every search instead of in catalogue order.
 */
function shuffleCopy<T>(items: readonly T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = env().GEMINI_API_KEY as string | undefined;
  if (!geminiClient && apiKey) {
    try {
      geminiClient = new GoogleGenAI({ apiKey });
    } catch (e: any) {
      console.warn("Failed to initialize GoogleGenAI client:", e?.message);
    }
  }
  return geminiClient;
}

function pcmToWav(pcmData: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = Buffer.alloc(44 + pcmData.length);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcmData.length, 4);
  buffer.write("WAVE", 8);

  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  buffer.write("data", 36);
  buffer.writeUInt32LE(pcmData.length, 40);
  pcmData.copy(buffer, 44);

  return buffer;
}

function getGeminiVoiceName(voiceId: string): string {
  const v = (voiceId || "").toLowerCase();
  // Deep / Authoritative Male
  if (v.includes("christopher") || v.includes("charon") || v.includes("deep") || v.includes("echo")) return "Charon";
  // Powerful / Dramatic / British / Australian Male
  if (v.includes("ryan") || v.includes("william") || v.includes("fenrir") || v.includes("onyx") || v.includes("fable")) return "Fenrir";
  // Warm Conversational Male
  if (v.includes("guy") || v.includes("puck") || v.includes("alloy") || v.includes("male") || v.includes("david") || v.includes("mark")) return "Puck";
  // Bright / Energetic Female
  if (v.includes("aria") || v.includes("zephyr") || v.includes("nova") || v.includes("bright") || v.includes("vibrant")) return "Zephyr";
  // British / Australian / Melodic Female
  if (v.includes("sonia") || v.includes("natasha") || v.includes("aoede") || v.includes("elegant") || v.includes("soothing")) return "Aoede";
  // Natural / Conversational Female
  if (v.includes("jenny") || v.includes("kore") || v.includes("shimmer") || v.includes("female") || v.includes("zira")) return "Kore";

  const entry = VOICES.find((e) => e.id === v);
  if (entry?.gender === "male") return "Puck";
  if (entry?.gender === "female") return "Kore";

  return "Puck";
}

async function synthesizeGeminiTTS(text: string, voiceId: string): Promise<Buffer> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const voiceName = getGeminiVoiceName(voiceId);
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error("No audio returned from Gemini TTS");
  }

  const pcmBuffer = Buffer.from(base64Audio, "base64");
  return pcmToWav(pcmBuffer, 24000, 1, 16);
}

interface ImageResult extends StockCandidate {}

export const VOICES = [
  // 5 Male Natural Voices (Authentic Human Recordings)
  {
    id: "guy",
    name: "Guy (Warm Storyteller)",
    gender: "male",
    lang: "en-US",
    neural: "en-US-GuyNeural",
    preview: "Warm, natural, conversational American male narrator.",
    mood: "Documentaries, Explainer & Stories",
  },
  {
    id: "christopher",
    name: "Christopher (Deep Cinematic)",
    gender: "male",
    lang: "en-US",
    neural: "en-US-ChristopherNeural",
    preview: "Deep, authoritative, and cinematic American male voice.",
    mood: "Dramatic, Movie Trailers & Motivation",
  },
  {
    id: "ryan",
    name: "Ryan (British Distinguished)",
    gender: "male",
    lang: "en-GB",
    neural: "en-GB-RyanNeural",
    preview: "Articulate, distinguished British RP male narrator.",
    mood: "Education, History & High-End Brands",
  },
  {
    id: "william",
    name: "William (Australian Charismatic)",
    gender: "male",
    lang: "en-AU",
    neural: "en-AU-WilliamMultilingualNeural",
    preview: "Crisp, engaging, and friendly Australian male voice.",
    mood: "Travel, Vlogs & Entertainment",
  },
  {
    id: "brian",
    name: "Brian (Documentary Pro)",
    gender: "male",
    lang: "en-US",
    neural: "en-US-BrianNeural",
    preview: "Smooth, relatable, natural human pacing for narration.",
    mood: "Documentaries, Guides & Professional",
  },

  // 5 Female Natural Voices (Authentic Human Recordings)
  {
    id: "jenny",
    name: "Jenny (Natural Conversational)",
    gender: "female",
    lang: "en-US",
    neural: "en-US-JennyNeural",
    preview: "Clear, friendly, and engaging American female speaker.",
    mood: "Tutorials, Reviews & Lifestyle",
  },
  {
    id: "aria",
    name: "Aria (Energetic Vibrant)",
    gender: "female",
    lang: "en-US",
    neural: "en-US-AriaNeural",
    preview: "Dynamic, bright, and punchy American female voice.",
    mood: "Viral Shorts, Reels & Highlights",
  },
  {
    id: "sonia",
    name: "Sonia (British Elegant)",
    gender: "female",
    lang: "en-GB",
    neural: "en-GB-SoniaNeural",
    preview: "Polished, expressive, and captivating British female narrator.",
    mood: "Audiobooks, Podcasts & Drama",
  },
  {
    id: "natasha",
    name: "Natasha (Gentle Australian)",
    gender: "female",
    lang: "en-AU",
    neural: "en-AU-NatashaMultilingualNeural",
    preview: "Calm, soothing, and resonant Australian female presenter.",
    mood: "Wellness, Nature & Explainer",
  },
  {
    id: "ava",
    name: "Ava (Calm & Serene)",
    gender: "female",
    lang: "en-US",
    neural: "en-US-AvaNeural",
    preview: "Soft, peaceful, and balanced American female tone.",
    mood: "Meditation, Relaxation & Storytelling",
  },

  // 5 Male Narrator Personas (real neural voices
  // tuned to a described delivery)
  {
    id: "storyteller",
    name: "The Storyteller (Deep Resonant Storyteller)",
    gender: "male",
    lang: "en-US",
    neural: "en-US-ChristopherNeural",
    preview: "Deep, warm, unhurried gravelly baritone with wise cinematic resonance.",
    mood: "Documentaries, Storytelling & Brand Films",
  },
  {
    id: "naturalist",
    name: "The Naturalist (Breathy Documentary Legend)",
    gender: "male",
    lang: "en-GB",
    neural: "en-GB-ThomasNeural",
    preview: "Breathy, measured, hushed-awe BBC nature documentary narration.",
    mood: "Nature, Science & Documentary Films",
  },
  {
    id: "titan",
    name: "The Titan (Booming Deep Bass)",
    gender: "male",
    lang: "en-US",
    neural: "en-US-ChristopherNeural",
    preview: "Monumental, booming deep bass baritone with commanding theatrical presence.",
    mood: "Cinematic Openers, Epics & Authority",
  },
  {
    id: "sentinel",
    name: "The Sentinel (Irish Authoritative Baritone)",
    gender: "male",
    lang: "en-IE",
    neural: "en-IE-ConnorNeural",
    preview: "Authoritative Irish male baritone with calm, commanding thriller gravitas.",
    mood: "Thrillers, Motivation & Dramatic Reads",
  },
  {
    id: "firebrand",
    name: "The Firebrand (Energetic Punchy Delivery)",
    gender: "male",
    lang: "en-US",
    neural: "en-US-EricNeural",
    preview: "Punchy, dynamic, sharp cadence with assertive swagger and dramatic intensity.",
    mood: "High-Energy Promos, Reactions & Entertainment",
  },

  // 5 Female Narrator Personas (real neural voices
  // tuned to a described delivery)
  {
    id: "raconteur",
    name: "The Raconteur (Witty & Warm Articulate)",
    gender: "female",
    lang: "en-GB",
    neural: "en-GB-LibbyNeural",
    preview: "Warm, witty, articulate British RP narration with endearing intelligence.",
    mood: "Intelligent Explainers, Drama & Audiobooks",
  },
  {
    id: "sovereign",
    name: "The Sovereign (Stately & Regal Dame)",
    gender: "female",
    lang: "en-GB",
    neural: "en-GB-SoniaNeural",
    preview: "Regal, polished, stately and commanding British dame narration.",
    mood: "Luxury Brands, History & Prestige",
  },
  {
    id: "enigma",
    name: "The Enigma (Sophisticated Narrator)",
    gender: "female",
    lang: "en-AU",
    neural: "en-AU-NatashaNeural",
    preview: "Sophisticated, velvety Australian female narration with ethereal depth.",
    mood: "Art, Culture & Sophisticated Narration",
  },
  {
    id: "investigator",
    name: "The Investigator (Smoky Documentary Authority)",
    gender: "female",
    lang: "en-US",
    neural: "en-US-MichelleNeural",
    preview: "Deep, smoky, grounded and cool American documentary authority.",
    mood: "Documentaries, Science & Investigative",
  },
  {
    id: "confidante",
    name: "The Confidante (Radiant Smiling Warmth)",
    gender: "female",
    lang: "en-US",
    neural: "en-US-EmmaMultilingualNeural",
    preview: "Warm, radiant, smiling conversational American tone with friendly charm.",
    mood: "Conversational Vlogs, Lifestyle & Interviews",
  },
];

export interface RealVoiceProfile {
  id: string;
  name: string;
  gender: "male" | "female";
  locale: string;
  lang: string;
  friendlyName: string;
}

// Resolves any voice identifier to its authentic Microsoft Neural Studio voice
// Ensures Male is strictly Male, and Female is strictly Female
function resolveVoiceShortName(voiceId: string): string {
  const v = (voiceId || "").trim();
  const lower = v.toLowerCase();

  // If already a direct official ShortName like "en-US-GuyNeural" or "en-GB-SoniaNeural"
  if (v.includes("-") && (v.includes("Neural") || v.includes("Online"))) {
    return v;
  }

  // Strip prefix like "browser:" or "web:"
  const clean = lower.replace(/^(browser:|web:)/, "");

  // --- NARRATOR PERSONAS (delivery styles, not impressions) ---
  // Exact ID checks match the test suite contracts
  if (clean === "storyteller") return "en-US-ChristopherNeural";
  if (clean === "naturalist") return "en-GB-ThomasNeural";
  if (clean === "titan") return "en-US-ChristopherNeural";
  if (clean === "sentinel") return "en-IE-ConnorNeural";
  if (clean === "firebrand") return "en-US-EricNeural";
  if (clean === "raconteur") return "en-GB-LibbyNeural";
  if (clean === "sovereign") return "en-GB-SoniaNeural";
  if (clean === "enigma") return "en-AU-NatashaNeural";
  if (clean === "investigator") return "en-US-MichelleNeural";
  if (clean === "confidante") return "en-US-EmmaMultilingualNeural";

  // Projects saved before the personas were renamed still carry the old id.
  const legacy = LEGACY_PERSONA_IDS[clean];
  if (legacy) return PERSONA_PROSODY_CONFIG[legacy].neural;

  // --- MALE VOICES (100% Genuine Male Human Recordings) ---
  if (
    clean === "guy" ||
    clean === "marcus" ||
    clean === "alloy" ||
    clean.includes("david") ||
    clean.includes("mark") ||
    clean.includes("guy")
  ) {
    return "en-US-GuyNeural";
  }
  if (
    clean === "christopher" ||
    clean === "echo" ||
    clean.includes("deep") ||
    clean.includes("christopher")
  ) {
    return "en-US-ChristopherNeural";
  }
  if (
    clean === "ryan" ||
    clean === "arthur" ||
    clean === "fable" ||
    clean.includes("british male") ||
    clean.includes("ryan") ||
    clean.includes("george")
  ) {
    return "en-GB-RyanNeural";
  }
  if (
    clean === "william" ||
    clean === "liam" ||
    clean === "onyx" ||
    clean.includes("australian male") ||
    clean.includes("william")
  ) {
    return "en-AU-WilliamMultilingualNeural";
  }
  if (clean === "andrew" || clean.includes("andrew")) return "en-US-AndrewNeural";
  if (clean === "brian" || clean.includes("brian")) return "en-US-BrianNeural";
  if (clean === "eric" || clean.includes("eric")) return "en-US-EricNeural";
  if (clean === "roger" || clean.includes("roger")) return "en-US-RogerNeural";
  if (clean === "steffan" || clean.includes("steffan")) return "en-US-SteffanNeural";
  if (clean === "thomas" || clean.includes("thomas")) return "en-GB-ThomasNeural";

  // --- FEMALE VOICES (100% Genuine Female Human Recordings) ---
  if (
    clean === "jenny" ||
    clean === "sarah" ||
    clean === "shimmer" ||
    clean.includes("zira") ||
    clean.includes("samantha") ||
    clean.includes("jenny")
  ) {
    return "en-US-JennyNeural";
  }
  if (
    clean === "aria" ||
    clean === "chloe" ||
    clean === "nova" ||
    clean.includes("aria")
  ) {
    return "en-US-AriaNeural";
  }
  if (
    clean === "sonia" ||
    clean === "emma" ||
    clean.includes("british female") ||
    clean.includes("sonia") ||
    clean.includes("hazel") ||
    clean.includes("susan")
  ) {
    return "en-GB-SoniaNeural";
  }
  if (
    clean === "natasha" ||
    clean === "maya" ||
    clean.includes("australian female") ||
    clean.includes("natasha") ||
    clean.includes("catherine")
  ) {
    return "en-AU-NatashaNeural";
  }
  if (clean === "ava" || clean.includes("ava")) return "en-US-AvaNeural";
  if (clean === "michelle" || clean.includes("michelle")) return "en-US-MichelleNeural";
  if (clean === "libby" || clean.includes("libby")) return "en-GB-LibbyNeural";
  if (clean === "maisie" || clean.includes("maisie")) return "en-GB-MaisieNeural";
  if (clean === "clara" || clean.includes("clara")) return "en-CA-ClaraNeural";

  // Strict gender keyword checks
  if (
    clean.includes("female") ||
    clean.includes("woman") ||
    clean.includes("girl") ||
    clean.includes("lady")
  ) {
    return "en-US-JennyNeural";
  }
  if (
    clean.includes("male") ||
    clean.includes("man") ||
    clean.includes("boy")
  ) {
    return "en-US-GuyNeural";
  }

  // Default fallback is American Guy (Male)
  return "en-US-GuyNeural";
}

/**
 * Microsoft's newer "Multilingual" neural voices are markedly more lifelike
 * than the original v1 neural models — better prosody, breathing and sentence
 * stress — so the realistic variant is tried first and the classic one is kept
 * as a fallback for locales where it does not exist.
 */
const REALISTIC_VOICE_UPGRADES: Record<string, string> = {
  "en-US-GuyNeural": "en-US-AndrewMultilingualNeural",
  "en-US-BrianNeural": "en-US-BrianMultilingualNeural",
  "en-US-JennyNeural": "en-US-EmmaMultilingualNeural",
  "en-US-AriaNeural": "en-US-AvaMultilingualNeural",
  "en-US-AvaNeural": "en-US-AvaMultilingualNeural",
  "en-GB-SoniaNeural": "en-GB-SoniaNeural",
  "en-AU-NatashaNeural": "en-AU-NatashaNeural",
};

/**
 * Prosody settings for the ten narrator personas.
 *
 * Each one is a Microsoft neural voice with pitch, rate and volume tuned to a
 * described delivery — a low unhurried rumble, a hushed documentary hush, a
 * bright conversational lilt. They were previously named after actors, which
 * set an expectation the voices do not meet: they are their own voices, and
 * the names now describe how they actually sound.
 */
/**
 * Personas used to be named after actors. Projects and cached audio saved
 * before the rename still reference the old ids, so they keep resolving.
 */
const LEGACY_PERSONA_IDS: Record<string, string> = {
  freeman: "storyteller",
  attenborough: "naturalist",
  jones: "titan",
  neeson: "sentinel",
  jackson: "firebrand",
  thompson: "raconteur",
  mirren: "sovereign",
  blanchett: "enigma",
  weaver: "investigator",
  roberts: "confidante",
};

export const PERSONA_PROSODY_CONFIG: Record<
  string,
  {
    neural: string;
    pitch: string;
    rate: string;
    volume: string;
  }
> = {
  storyteller: {
    neural: "en-US-ChristopherNeural",
    pitch: "-16Hz",
    rate: "-12%",
    volume: "+10%",
  },
  naturalist: {
    neural: "en-GB-ThomasNeural",
    pitch: "+3Hz",
    rate: "-10%",
    volume: "-2%",
  },
  titan: {
    neural: "en-US-ChristopherNeural",
    pitch: "-26Hz",
    rate: "-10%",
    volume: "+15%",
  },
  sentinel: {
    neural: "en-IE-ConnorNeural", // Authentic Irish male voice!
    pitch: "-12Hz",
    rate: "-8%",
    volume: "+5%",
  },
  firebrand: {
    neural: "en-US-EricNeural",
    pitch: "-3Hz",
    rate: "+6%",
    volume: "+15%",
  },
  raconteur: {
    neural: "en-GB-LibbyNeural",
    pitch: "+2Hz",
    rate: "-5%",
    volume: "+2%",
  },
  sovereign: {
    neural: "en-GB-SoniaNeural",
    pitch: "-4Hz",
    rate: "-7%",
    volume: "+5%",
  },
  enigma: {
    neural: "en-AU-NatashaNeural",
    pitch: "-8Hz",
    rate: "-6%",
    volume: "+2%",
  },
  investigator: {
    neural: "en-US-MichelleNeural",
    pitch: "-10Hz",
    rate: "-6%",
    volume: "+5%",
  },
  confidante: {
    neural: "en-US-EmmaMultilingualNeural",
    pitch: "+4Hz",
    rate: "+2%",
    volume: "+2%",
  },
};

/** Audio plus the word-by-word timings the captions are locked to. */
interface SynthResult {
  buffer: Buffer;
  words: WordTiming[];
}

function resolvePersonaConfig(voiceId: string) {
  const clean = (voiceId || "").toLowerCase().replace(/^(browser:|web:)/, "").trim();
  for (const [key, cfg] of Object.entries(PERSONA_PROSODY_CONFIG)) {
    if (clean === key || clean.includes(key)) {
      return cfg;
    }
  }
  const legacy = LEGACY_PERSONA_IDS[clean];
  if (legacy) return PERSONA_PROSODY_CONFIG[legacy];
  return null;
}

function splitTextIntoChunks(text: string, maxLen = 180): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return [clean];

  const sentences = clean.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length <= maxLen) {
      current = (current ? current + " " : "") + sentence;
    } else {
      if (current) chunks.push(current);
      if (sentence.length <= maxLen) {
        current = sentence;
      } else {
        const words = sentence.split(" ");
        let sub = "";
        for (const word of words) {
          if ((sub + " " + word).trim().length <= maxLen) {
            sub = (sub ? sub + " " : "") + word;
          } else {
            if (sub) chunks.push(sub);
            sub = word;
          }
        }
        current = sub;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function getVoiceLanguage(voice: string): string {
  const raw = (voice || "").toLowerCase();
  const v = LEGACY_PERSONA_IDS[raw] ?? raw;
  if (
    v === "ryan" ||
    v === "sonia" ||
    v === "fable" ||
    v === "naturalist" ||
    v === "raconteur" ||
    v === "sovereign" ||
    v.includes("en-gb") ||
    v.includes("british")
  ) {
    return "en-gb";
  }
  if (
    v === "william" ||
    v === "natasha" ||
    v === "onyx" ||
    v === "enigma" ||
    v.includes("en-au") ||
    v.includes("australian")
  ) {
    return "en-au";
  }
  if (v === "sentinel" || v.includes("en-ie") || v.includes("irish")) {
    return "en-ie";
  }
  if (v.includes("en-ca") || v.includes("canadian")) return "en-ca";
  return "en";
}

/**
 * Google Translate's read-aloud endpoint, used when Edge Neural TTS cannot be
 * reached. It only accepts ~200 characters per request, so long narration is
 * split and the MP3 fragments concatenated.
 *
 * This function was REFERENCED but never defined, so every TTS request threw
 * "synthesizeGoogleTTSFallback is not defined" and the whole voiceover feature
 * returned HTTP 500.
 */
async function synthesizeGoogleTTSFallback(text: string, voice: string): Promise<Buffer> {
  const lang = getVoiceLanguage(voice);
  const chunks = splitTextIntoChunks(text, 190);
  const parts: Buffer[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const url =
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob` +
      `&tl=${encodeURIComponent(lang)}&total=${chunks.length}&idx=${i}` +
      `&textlen=${chunks[i].length}&q=${encodeURIComponent(chunks[i])}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
    });
    if (!res.ok) throw new Error(`Google TTS HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) throw new Error("Google TTS returned an empty fragment");
    parts.push(buf);
  }

  const combined = Buffer.concat(parts);
  if (combined.length < 500) throw new Error("Google TTS produced no audio");
  return combined;
}

/**
 * Last-resort silent WAV so a failed synthesis never hangs the client or
 * corrupts the timeline: the scene still occupies its correct duration.
 *
 * Also referenced but never defined — the cause of the HTTP 500.
 * Deliberately silent rather than a tone: a beep in place of narration would
 * be worse than a gap, and the UI reports the failure separately.
 */
function generateFallbackToneBuffer(durationSeconds: number): Buffer {
  const sampleRate = 24000;
  const seconds = Math.max(0.5, Math.min(60, durationSeconds || 2));
  const samples = Math.floor(sampleRate * seconds);
  const pcm = Buffer.alloc(samples * 2); // 16-bit mono, all zeroes = silence
  return pcmToWav(pcm, sampleRate, 1, 16);
}

// In-memory cache for high-fidelity synthesized speech. Scoped to one
// Worker isolate — a cold start or a request landing on a different isolate
// simply re-synthesizes, which is an acceptable cost for a pure performance
// optimization (the content is idempotent).
const ttsAudioCache = new Map<string, { buffer: Buffer; words: WordTiming[] }>();

// Synthesizes high-fidelity speech for the requested voice/persona.
async function synthesizeTTS(text: string, voice: string): Promise<Buffer> {
  const { buffer } = await synthesizeTTSWithSource(text, voice);
  return buffer;
}

/** Which engine produced the audio for the most recent synthesis. */
type TtsSource = "gemini" | "google" | "silent";

/**
 * Same as synthesizeTTS but also reports which engine succeeded, so the API
 * can tell the client when the audio is only a silent placeholder — and
 * carries the per-word timings the captions lock onto.
 *
 * Synthesis waterfall (Workers-compatible, no msedge-tts/websockets):
 *  1. Gemini TTS (GoogleGenAI, fetch-based) — primary. No word-boundary
 *     timing is returned, so `words` is always empty on this path; the
 *     client falls back to its estimated pacing for captions.
 *  2. Google Translate's read-aloud endpoint — used only if Gemini is
 *     unavailable/unconfigured or fails. Also has no word boundaries.
 *  3. A silent WAV sized to the text's estimated spoken duration — last
 *     resort so a failed synthesis never hangs the client or corrupts the
 *     timeline; the UI reports the failure separately.
 */
async function synthesizeTTSWithSource(
  text: string,
  voice: string,
  customEntries?: any[]
): Promise<{ buffer: Buffer; source: TtsSource; words: WordTiming[] }> {
  const cleanText = sanitizeTextForSpeech(text, customEntries);
  const shortName = resolveVoiceShortName(voice);
  const cacheKey = `${shortName}_${cleanText.trim()}`;
  const cached = ttsAudioCache.get(cacheKey);
  if (cached) return { buffer: cached.buffer, source: "gemini", words: cached.words };

  try {
    const buffer = await synthesizeGeminiTTS(cleanText, voice);
    ttsAudioCache.set(cacheKey, { buffer, words: [] });
    return { buffer, source: "gemini", words: [] };
  } catch (err: any) {
    console.warn("Primary Gemini TTS notice:", err?.message);
  }

  try {
    const googleBuf = await synthesizeGoogleTTSFallback(cleanText, voice);
    ttsAudioCache.set(cacheKey, { buffer: googleBuf, words: [] });
    return { buffer: googleBuf, source: "google", words: [] };
  } catch (googleErr: any) {
    console.warn("Google TTS notice:", googleErr?.message);
  }

  const approxDuration = Math.max(2, cleanText.split(/\s+/).filter(Boolean).length / 2.5);
  return { buffer: generateFallbackToneBuffer(approxDuration), source: "silent", words: [] };
}

// --- Pexels ---
/** Pexels' documented ceiling for `per_page`; anything higher is a 400. */
const PEXELS_MAX_PER_PAGE = 80;
/** Pixabay's documented ceiling for `per_page` (minimum is 3). */
const PIXABAY_MAX_PER_PAGE = 200;
/** Wikimedia's ceiling for `list=search` results in one request. */
const WIKIMEDIA_MAX_SEARCH = 100;
/** Wikimedia's ceiling for `titles=` values in one request (anonymous). */
const WIKIMEDIA_MAX_TITLES = 50;
/**
 * How long any one provider request may take. Without this a hung upstream
 * left the studio's spinner turning indefinitely — a search that never
 * answers reads as "image search does nothing".
 */
const PROVIDER_TIMEOUT_MS = 12000;
// Every result is delivered as an exact 1920×1080 (16:9) crop from the
// original file, so nothing is ever upscaled into a 1080p render. Photos
// smaller than Full HD are dropped by the shared candidate mapper.
async function searchPexels(query: string, count: number, customKey?: string): Promise<ImageResult[]> {
  const apiKey = (customKey && customKey.trim()) || env().PEXELS_API_KEY;
  if (!apiKey) return [];

  // Pexels rejects per_page above 80 with a 400, which used to turn every
  // search into an empty result set (the client asks for 100). Clamp to the
  // documented maximum instead of losing the whole response.
  const perPage = Math.min(Math.max(1, count), PEXELS_MAX_PER_PAGE);

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape&size=large`,
      { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }
    );
    if (!res.ok) {
      console.warn(`Pexels search failed (${res.status}) for "${query}"`);
      return [];
    }
    const data = (await res.json()) as any;
    if (!data.photos) return [];

    const candidates = data.photos
      .map(pexelsPhotoToCandidate)
      .filter((c: ImageResult | null): c is ImageResult => c !== null);
    // `size=large` already means ≥24MP, but a photo below Full HD or in the
    // wrong shape is still dropped by the mapper — say so rather than
    // letting the search look silently empty.
    if (candidates.length === 0 && data.photos.length > 0) {
      console.warn(`Pexels returned ${data.photos.length} photos for "${query}", none met the 1920×1080 rule`);
    }
    return candidates;
  } catch (e: any) {
    console.warn(`Pexels search error for "${query}":`, e?.message || e);
    return [];
  }
}

/**
 * Whether Pixabay's CDN will serve the `_1920` variant of a `/get/` URL.
 * Standard API keys omit `fullHDURL`/`imageURL` (their largest field is the
 * 1280px `largeImageURL`), but the Full HD variant of the same CDN URL is
 * often still fetchable. One cheap probe per server process decides; a failed
 * probe means those hits are dropped rather than upscaled.
 */
let pixabay1920Probe: Promise<boolean> | null = null;
function canPixabayServe1920(sampleUrl: string): Promise<boolean> {
  if (!pixabay1920Probe) {
    pixabay1920Probe = (async () => {
      try {
        const res = await fetch(sampleUrl, {
          headers: { Accept: "image/*", Range: "bytes=0-1" },
          redirect: "follow",
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });
        const type = res.headers.get("content-type") || "";
        return res.ok && type.startsWith("image/");
      } catch {
        return false;
      }
    })();
    // Do not cache a failure forever — the network may recover.
    pixabay1920Probe
      .then((ok) => {
        if (!ok) pixabay1920Probe = null;
      })
      .catch(() => {
        pixabay1920Probe = null;
      });
  }
  return pixabay1920Probe;
}

// --- Pixabay ---
// The source must already be ~16:9 and ≥1920×1080 (Pixabay cannot crop), and
// the URL must be able to deliver that size.
async function searchPixabay(query: string, count: number, customKey?: string): Promise<ImageResult[]> {
  const apiKey = (customKey && customKey.trim()) || env().PIXABAY_API_KEY;
  if (!apiKey) return [];

  // Pixabay accepts 3–200 per page and 400s outside that window.
  const perPage = Math.min(Math.max(3, count), PIXABAY_MAX_PER_PAGE);

  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=${perPage}&image_type=photo&orientation=horizontal&min_width=1920&min_height=1080`,
      { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }
    );
    if (!res.ok) {
      console.warn(`Pixabay search failed (${res.status}) for "${query}"`);
      return [];
    }
    const data = (await res.json()) as any;
    if (!data.hits) return [];

    const direct = data.hits
      .map(pixabayHitToCandidate)
      .filter((c: ImageResult | null): c is ImageResult => c !== null);

    // Hits whose only URLs are ≤1280px: recover them through the `_1920`
    // CDN variant when the probe says it works.
    const rest: any[] = data.hits.filter(
      (h: any) => !(h?.fullHDURL || h?.imageURL) && pixabayUpgradeUrlTo1920(h?.largeImageURL || h?.webformatURL || "")
    );
    let recovered: ImageResult[] = [];
    if (rest.length > 0) {
      const sample = pixabayUpgradeUrlTo1920(rest[0].largeImageURL || rest[0].webformatURL)!;
      if (await canPixabayServe1920(sample)) {
        recovered = rest
          .map((h: any) =>
            pixabayHitToCandidate({ ...h, fullHDURL: pixabayUpgradeUrlTo1920(h.largeImageURL || h.webformatURL) })
          )
          .filter((c: ImageResult | null): c is ImageResult => c !== null);
      }
    }
    const all = [...direct, ...recovered];
    if (all.length === 0 && data.hits.length > 0) {
      console.warn(`Pixabay returned ${data.hits.length} hits for "${query}", none met the 16:9 1920×1080 rule`);
    }
    return all;
  } catch (e: any) {
    console.warn(`Pixabay search error for "${query}":`, e?.message || e);
    return [];
  }
}

// --- Wikimedia Commons ---
// Thumbs are requested at 1920px wide; the shared mapper keeps only images
// that are ~16:9 and at least Full HD. Diagrams and B&W scans that survive
// the dimension gate are removed client-side by pixel analysis.
async function searchWikimedia(query: string, count: number): Promise<ImageResult[]> {
  // `list=search` accepts up to 500 titles, but `titles=` is capped at 50
  // values per request for anonymous clients — asking for more is rejected
  // outright ("toomanyvalues"), which used to lose the entire search.
  const srlimit = Math.min(Math.max(1, count), WIKIMEDIA_MAX_SEARCH);
  try {
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=${srlimit}&srsearch=${encodeURIComponent(query + " filetype:bitmap")}&origin=*`;
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": "SceneringApp/1.0 (https://ai.studio)" },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!searchRes.ok) {
      console.warn(`Wikimedia search failed (${searchRes.status}) for "${query}"`);
      return [];
    }
    const searchData = (await searchRes.json()) as any;
    const searchResults = searchData?.query?.search;
    if (!searchResults || searchResults.length === 0) return [];

    const allTitles: string[] = searchResults.map((r: any) => String(r.title));
    const results: ImageResult[] = [];

    for (let start = 0; start < allTitles.length; start += WIKIMEDIA_MAX_TITLES) {
      const titles = allTitles.slice(start, start + WIKIMEDIA_MAX_TITLES).join("|");
      const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1920&titles=${encodeURIComponent(titles)}&origin=*`;
      const imageRes = await fetch(imageInfoUrl, {
        headers: { "User-Agent": "SceneringApp/1.0 (https://ai.studio)" },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      if (!imageRes.ok) {
        console.warn(`Wikimedia imageinfo failed (${imageRes.status}) for "${query}"`);
        continue;
      }
      const imageData = (await imageRes.json()) as any;

      const pages = imageData?.query?.pages;
      if (!pages) continue;

      for (const key of Object.keys(pages)) {
        const page = pages[key];
        const info = page?.imageinfo?.[0];
        if (!info) continue;
        if (info.mime && !info.mime.startsWith("image/")) continue;
        if (info.mime === "image/svg+xml") continue;

        const candidate = wikimediaInfoToCandidate(info);
        if (candidate) results.push(candidate);
      }
    }

    if (results.length === 0 && allTitles.length > 0) {
      console.warn(`Wikimedia returned ${allTitles.length} files for "${query}", none were 16:9 and at least 1920×1080`);
    }
    return results;
  } catch (e: any) {
    console.warn(`Wikimedia search error for "${query}":`, e?.message || e);
    return [];
  }
}

function generatePlaceholder(seedText = "Scene Visual"): string {
  const hue = Math.floor(Math.random() * 360);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:hsl(${hue},50%,25%)"/>
        <stop offset="100%" style="stop-color:hsl(${(hue + 60) % 360},50%,15%)"/>
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#g)"/>
    <text x="640" y="360" fill="rgba(255,255,255,0.7)" font-size="36" text-anchor="middle" font-family="sans-serif">${seedText}</text>
  </svg>`;
}
/**
 * Builds the Express app with every route registered, but does not start
 * listening — `worker.ts` calls `app.listen(PORT)` itself and bridges it to
 * the Worker's fetch handler via `httpServerHandler` from `cloudflare:node`.
 * (On Cloudflare Workers there is no dev-mode Vite middleware and no static
 * file serving here at all: `wrangler.jsonc`'s `assets.run_worker_first`
 * routes only `/api/*` and `/functions/v1/*` into this app; every other path
 * — the SPA shell, hashed JS/CSS bundles, `/public` assets — is served
 * directly by Cloudflare's static assets handler from `./dist/`, configured
 * with `not_found_handling: "single-page-application"` for client-side
 * routing. That mirrors the old production branch's behaviour, just moved
 * out of Express and onto Cloudflare's asset layer.)
 */
export function createApp(): express.Express {
  const app = express();

  // Development-only API request log (DEV_REQUEST_LOG=1): one line per API
  // call with method, path, status and whether a session cookie arrived —
  // for diagnosing embedded-preview cookie behaviour. Never runs in
  // production.
  if (env().NODE_ENV !== "production" && env().DEV_REQUEST_LOG === "1") {
    app.use((req, res, next) => {
      if (!req.path.startsWith("/api/")) return next();
      const hasCookie = /scenering_session=/.test(String(req.headers.cookie || ""));
      res.on("finish", () => console.log(`[api] ${req.method} ${req.path} -> ${res.statusCode} cookie=${hasCookie ? "yes" : "NO"}`));
      next();
    });
  }

  assertSecurePlatformConfiguration();
  app.disable("x-powered-by");
  if (env().TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Framing stays forbidden everywhere except an explicitly opted-in local
    // preview (sandbox/container iframes), which must never be production.
    if (env().NODE_ENV === "production" || env().ALLOW_FRAMING !== "1") {
      res.setHeader("X-Frame-Options", "DENY");
    }
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (env().NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self' https://*.lemonsqueezy.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: data:; connect-src 'self' https://api.pexels.com https://pixabay.com https://commons.wikimedia.org https://*.supabase.co; worker-src 'self' blob:");
    }
    next();
  });
  // Cookie-authenticated state changes are same-origin only. Lemon Squeezy's
  // signed webhook has no browser Origin and remains independently verified.
  app.use((req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method) || req.path === "/api/webhooks/lemonsqueezy") return next();
    const origin = req.get("origin");
    if (!origin) return next();
    let supplied: URL;
    try { supplied = new URL(origin); } catch { return res.status(403).json({ error: "Cross-origin request rejected" }); }
    const configured = env().PUBLIC_APP_URL ? new URL(env().PUBLIC_APP_URL as string).origin : null;
    const requestHost = String(req.get("host") || "").toLowerCase();
    const forwardedHost = env().TRUST_PROXY === "1" ? String(req.get("x-forwarded-host") || "").split(",")[0].trim().toLowerCase() : "";
    const sameHost = supplied.host.toLowerCase() === requestHost || Boolean(forwardedHost && supplied.host.toLowerCase() === forwardedHost);
    if ((configured && origin !== configured) || (!configured && !sameHost)) return res.status(403).json({ error: "Cross-origin request rejected" });
    next();
  });

  // Billing signatures must be verified against the untouched request bytes,
  // so the webhook is registered before the general JSON parser.
  registerLemonSqueezyWebhook(app);
  const standardJson = express.json({ limit: "2mb" });
  app.use((req, res, next) => req.path === "/api/upload-audio" ? next() : standardJson(req, res, next));
  registerPlatformRoutes(app);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Image search handler (supports both /api/image-search and /functions/v1/image-search)
  const handleImageSearch = async (req: express.Request, res: express.Response) => {
    try {
      const query = (req.query.q as string) || "";
      // Up to 100 candidates so the client can pick randomly instead of
      // always receiving (and showing) the identical first-ranked image.
      const count = Math.min(parseInt((req.query.count as string) || "10", 10), 100);
      const customPexelsKey = (req.headers["x-pexels-key"] as string) || undefined;
      const customPixabayKey = (req.headers["x-pixabay-key"] as string) || undefined;

      if (!query.trim()) {
        return res.status(400).json({ error: "Missing query parameter 'q'" });
      }

      // Try Pexels first (with customer's key or env key)
      let results = await searchPexels(query, count, customPexelsKey);

      // Try Pixabay if Pexels returned nothing (with customer's key or env key)
      if (results.length === 0) {
        results = await searchPixabay(query, count, customPixabayKey);
      }

      // Fallback to Wikimedia Commons
      if (results.length === 0) {
        results = await searchWikimedia(query, count);
      }

      // If still nothing, fall back to the bundled nature library.
      //
      // This used to return a single random photo. One image per search meant
      // "replace" had nothing else to hand out and the grid showed the same
      // picture every time — it read as if the library only contained that
      // one mountain. Returning the whole deck in a fresh shuffled order lets
      // the client fill its grid and rotate properly, and the shuffle means
      // no two searches lead with the same photo.
      if (results.length === 0) {
        results = shuffleCopy(NATURE_FALLBACKS).map((bg) => ({
          url: bg.url,
          thumbnail: bg.thumb,
          source: "nature-library",
          width: 1920,
          height: 1080,
        }));
      }

      return res.json({
        images: results,
        query,
        source: results[0]?.source || "none",
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Image search failed" });
    }
  };

  app.get(["/api/image-search", "/functions/v1/image-search"], requirePlatformUser, platformRateLimit("image-search", 120, 3600000), handleImageSearch);

  // Key verification endpoint so customer can test their entered keys
  app.post("/api/verify-keys", requirePlatformUser, platformRateLimit("verify-provider-key", 20, 3600000), async (req: express.Request, res: express.Response) => {
    const { pexelsKey, pixabayKey } = req.body || {};
    const status: {
      pexels?: { valid: boolean; error?: string };
      pixabay?: { valid: boolean; error?: string };
    } = {};

    if (pexelsKey && typeof pexelsKey === "string" && pexelsKey.trim()) {
      const trimmed = pexelsKey.trim();
      if (trimmed.length < 15) {
        status.pexels = {
          valid: false,
          error: "Pexels API key appears too short (expected ~56 characters)",
        };
      } else {
        try {
          const pRes = await fetch("https://api.pexels.com/v1/curated?per_page=1", {
            headers: { Authorization: trimmed },
          });
          status.pexels = {
            valid: pRes.ok,
            error: pRes.ok ? undefined : `Pexels API returned status ${pRes.status}`,
          };
        } catch (e: any) {
          status.pexels = { valid: false, error: e.message || "Failed to connect to Pexels" };
        }
      }
    }

    if (pixabayKey && typeof pixabayKey === "string" && pixabayKey.trim()) {
      try {
        const pRes = await fetch(
          `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey.trim())}&q=nature&per_page=3`
        );
        const data = (await pRes.json().catch(() => null)) as any;
        const isValid = pRes.ok && data && Array.isArray(data.hits);
        status.pixabay = {
          valid: isValid,
          error: isValid ? undefined : (typeof data === "string" ? data : "Invalid Pixabay key"),
        };
      } catch (e: any) {
        status.pixabay = { valid: false, error: e.message || "Failed to connect to Pixabay" };
      }
    }

    return res.json({ status });
  });

  // Proxy only known visual-provider CDNs. An unrestricted fetch proxy would
  // permit SSRF against cloud metadata, internal services, and local files.
  const allowedImageHost = (hostname: string) => [
    "images.pexels.com", "images.pixabay.com", "cdn.pixabay.com", "pixabay.com",
    "upload.wikimedia.org", "commons.wikimedia.org", "images.unsplash.com",
  ].some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
  const checkedImageUrl = (value: string) => {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || !allowedImageHost(parsed.hostname.toLowerCase())) throw new Error("Image host is not allowed");
    return parsed;
  };
  const fetchAllowedImage = async (initial: string) => {
    let current = checkedImageUrl(initial);
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const response = await fetch(current, { headers: { Accept: "image/*", "User-Agent": "Scenering/1.1 image proxy" }, redirect: "manual", signal: AbortSignal.timeout(12000) });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) throw new Error("Unsafe image redirect");
        current = checkedImageUrl(new URL(location, current).toString());
        continue;
      }
      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > 20 * 1024 * 1024) throw new Error("Image is too large");
      return response;
    }
    throw new Error("Too many image redirects");
  };

  // Proxy image handler (supports both /api/proxy-image and /functions/v1/proxy-image)
  const handleProxyImage = async (req: express.Request, res: express.Response) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).json({ error: "Missing url parameter" });
      }

      // Same-origin paths (the bundled nature library under /public) are
      // served from Cloudflare's static assets layer via the ASSETS binding
      // rather than the local filesystem — Workers has no filesystem to
      // read the built `dist/` output from at runtime.
      if (targetUrl.startsWith("/") && !targetUrl.startsWith("//")) {
        const safePath = targetUrl.replace(/\.\.(\/|\\)/g, "").split("?")[0].split("#")[0];
        const assetResponse = await env().ASSETS.fetch(new Request(new URL(safePath, "http://assets.internal/")));
        if (assetResponse.ok) {
          const contentType = assetResponse.headers.get("content-type") || "image/jpeg";
          const arrayBuf = await assetResponse.arrayBuffer();
          res.setHeader("Content-Type", contentType);
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
          res.setHeader("Cache-Control", "public, max-age=86400, immutable");
          return res.send(Buffer.from(arrayBuf));
        }
      }

      const response = await fetchAllowedImage(targetUrl);

      if (!response.ok) {
        res.setHeader("Content-Type", "image/svg+xml");
        return res.send(generatePlaceholder());
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) {
        res.setHeader("Content-Type", "image/svg+xml");
        return res.send(generatePlaceholder());
      }

      const arrayBuf = await response.arrayBuffer();
      if (arrayBuf.byteLength > 20 * 1024 * 1024) return res.status(413).json({ error: "Image is too large" });
      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      return res.send(Buffer.from(arrayBuf));
    } catch {
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      return res.send(generatePlaceholder());
    }
  };

  app.get(["/api/proxy-image", "/functions/v1/proxy-image"], requirePlatformUser, platformRateLimit("image-proxy", 600, 3600000), handleProxyImage);

  // TTS handler (voices on GET without text, synthesis on GET with text or POST)
  /**
   * Sends a synthesis result. Two shapes:
   *  - raw audio bytes (the historic behaviour every existing caller uses)
   *  - `withTimeline`: a JSON envelope carrying the audio (base64) plus the
   *    per-word timings, so the captions can lock onto the voice word-for-word.
   */
  const sendTtsResponse = (
    res: express.Response,
    synthesized: { buffer: Buffer; source: TtsSource; words: WordTiming[] },
    voice: string,
    withTimeline: boolean
  ) => {
    const { buffer: audioBuffer, source, words } = synthesized;
    const isWav = audioBuffer.length > 4 && audioBuffer.subarray(0, 4).toString() === "RIFF";
    const mimeType = isWav ? "audio/wav" : "audio/mpeg";
    res.setHeader("X-TTS-Source", source);
    res.setHeader("X-TTS-Voice", resolveVoiceShortName(voice));
    res.setHeader("Access-Control-Expose-Headers", "X-TTS-Source, X-TTS-Voice");
    // never cache a silent placeholder — the network may recover
    res.setHeader("Cache-Control", source === "silent" ? "no-store" : "public, max-age=3600");
    if (!withTimeline) {
      res.setHeader("Content-Type", mimeType);
      return res.send(audioBuffer);
    }
    res.setHeader("Content-Type", "application/json");
    return res.json({
      audio: audioBuffer.toString("base64"),
      mimeType,
      source,
      voice: resolveVoiceShortName(voice),
      words,
    });
  };

  const basicVoiceAllowed = (req: express.Request, voice: string) => platformFeatureAllowed(req, "advanced_voice") || /(^|[-_])(guy|jenny)(neural)?($|[-_])/i.test(String(voice));
  const entitlementError = (res: express.Response) => res.status(403).json({ error: "This narrator requires SceneFlow or SceneForge.", code: "ENTITLEMENT_REQUIRED", feature: "advanced_voice" });

  const handleTTSGet = async (req: express.Request, res: express.Response) => {
    const text = req.query.text as string | undefined;
    if (!text) {
      // `all=true` used to return msedge-tts's live 300+ voice catalogue;
      // that service isn't reachable from Workers, so the curated VOICES
      // list is the only catalogue now (see the RealVoiceProfile comment
      // above `VOICES`).
      return res.json({
        voices: VOICES,
        allVoicesCount: VOICES.length,
      });
    }
    try {
      const voice = (req.query.voice as string) || "guy";
      if (!basicVoiceAllowed(req, voice)) return entitlementError(res);
      const trimmedText = text.slice(0, 2000);
      const withTimeline = req.query.withTimeline === "1" || req.query.withTimeline === "true";
      const synthesized = await synthesizeTTSWithSource(trimmedText, voice);
      return sendTtsResponse(res, synthesized, voice, withTimeline);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to generate speech" });
    }
  };

  const handleTTSVoices = async (req: express.Request, res: express.Response) => {
    const advanced = platformFeatureAllowed(req, "advanced_voice");
    const curated = advanced ? VOICES : VOICES.filter((voice) => voice.id === "guy" || voice.id === "jenny");
    return res.json({
      curated,
      voices: curated,
      allVoices: [],
      total: curated.length,
    });
  };

  const handleTTSPost = async (req: express.Request, res: express.Response) => {
    try {
      const { text, voice = "guy", customDictionary, withTimeline } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required" });
      }
      if (!basicVoiceAllowed(req, voice)) return entitlementError(res);

      const trimmedText = text.slice(0, 2000);
      const synthesized = await synthesizeTTSWithSource(trimmedText, voice, customDictionary);
      return sendTtsResponse(res, synthesized, voice, withTimeline === true);
    } catch (err: any) {
      console.warn("TTS synthesis error, returning 500:", err.message);
      return res.status(500).json({ error: err.message || "Failed to generate speech" });
    }
  };

  app.get(["/api/tts/voices", "/functions/v1/tts/voices"], requirePlatformUser, platformRateLimit("tts-voices", 120, 3600000), handleTTSVoices);
  app.get(["/api/tts", "/functions/v1/tts"], requirePlatformUser, platformRateLimit("tts-synthesis", 120, 3600000), handleTTSGet);
  app.post(["/api/tts", "/functions/v1/tts"], requirePlatformUser, platformRateLimit("tts-synthesis", 120, 3600000), handleTTSPost);

  // Upload/cache custom imported voice audio. Each item belongs to the
  // authenticated account that uploaded it; storage is R2 (the audio bytes)
  // plus a D1 row (ownership + expiry bookkeeping) via `src/audio-store.ts`.
  // The 24h global expiry sweep runs out-of-band on a Cron Trigger
  // (`audioStore.cleanupExpired()`); the 5-per-user cap is enforced inline
  // by `audioStore.upload()` itself.
  app.post("/api/upload-audio", requirePlatformUser, platformRateLimit("audio-upload", 30, 3600000), express.json({ limit: "50mb" }), async (req, res) => {
    try {
      const { data, filename, mimeType = "audio/mpeg" } = req.body || {};
      if (!data || typeof data !== "string") {
        return res.status(400).json({ error: "Missing audio data" });
      }
      const allowedAudioTypes = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/mp4", "audio/aac"]);
      if (!allowedAudioTypes.has(String(mimeType).toLowerCase())) return res.status(415).json({ error: "Unsupported audio type" });

      const base64Clean = data.includes("base64,") ? data.split("base64,")[1] : data;
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Clean)) return res.status(400).json({ error: "Invalid audio encoding" });
      const approxBytes = Math.floor((base64Clean.length * 3) / 4);
      if (!approxBytes || approxBytes > 20 * 1024 * 1024) return res.status(413).json({ error: "Audio must be no larger than 20 MB" });
      const audioId = "aud_" + randomBytes(18).toString("base64url");
      const ownerId = String((req as any).auth.user.id);

      await audioStore.upload(ownerId, audioId, base64Clean, String(mimeType).toLowerCase());

      return res.json({
        url: `/api/custom-audio/${audioId}`,
        audioId,
        size: approxBytes,
        filename: filename || "imported_voice.mp3",
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || "Failed to process audio" });
    }
  });

  app.get("/api/custom-audio/:id", requirePlatformUser, platformRateLimit("custom-audio", 600, 3600000), async (req, res) => {
    try {
      const audioId = String(req.params.id);
      const ownerId = String((req as any).auth.user.id);
      // audioStore.get() doesn't carry an owner check (it's a thin R2/D1
      // lookup by id), so ownership is verified here against the D1 row
      // before the R2 object is returned.
      const row = await env().DB.prepare("SELECT user_id FROM audio_files WHERE id = ?").bind(audioId).first();
      if (!row || String((row as any).user_id) !== ownerId) {
        return res.status(404).json({ error: "Audio not found" });
      }
      const item = await audioStore.get(audioId);
      if (!item) return res.status(404).json({ error: "Audio not found" });
      const arrayBuf = await new Response(item.body).arrayBuffer();
      res.setHeader("Content-Type", item.mimeType);
      res.setHeader("Cache-Control", "private, no-store");
      return res.send(Buffer.from(arrayBuf));
    } catch (e: any) {
      return res.status(500).json({ error: "Failed to load audio" });
    }
  });

  return app;
}
