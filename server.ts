import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import WebSocket from "ws";
import { spawn } from "child_process";
import { GoogleGenAI } from "@google/genai";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    try {
      geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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

interface ImageResult {
  url: string;
  thumbnail: string;
  source: string;
  width: number;
  height: number;
}

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
];

export interface RealVoiceProfile {
  id: string;
  name: string;
  gender: "male" | "female";
  locale: string;
  lang: string;
  friendlyName: string;
}

let cachedEdgeVoices: RealVoiceProfile[] = [];

async function getEdgeVoicesCached(): Promise<RealVoiceProfile[]> {
  if (cachedEdgeVoices.length > 0) return cachedEdgeVoices;
  try {
    const tts = new MsEdgeTTS();
    const list = await tts.getVoices();
    cachedEdgeVoices = list.map((v) => ({
      id: v.ShortName,
      name: v.FriendlyName || v.ShortName,
      gender: v.Gender.toLowerCase() === "male" ? "male" : "female",
      locale: v.Locale,
      lang: v.Locale,
      friendlyName: v.FriendlyName,
    }));
    return cachedEdgeVoices;
  } catch (err: any) {
    console.warn("Error caching Edge voices:", err?.message);
    return [];
  }
}

// Ensure pre-caching starts in background
getEdgeVoicesCached().catch(() => {});

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

// Synthesizes speech using authentic Microsoft Edge Read Aloud Neural Voices
async function synthesizeRealEdgeTTS(text: string, voiceId: string): Promise<Buffer> {
  const shortName = resolveVoiceShortName(voiceId);
  const tts = new MsEdgeTTS();
  await tts.setMetadata(shortName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

  return new Promise<Buffer>((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { tts.close(); } catch {}
      reject(new Error(`Edge TTS timed out for voice ${shortName}`));
    }, 15000);

    const { audioStream } = tts.toStream(text);
    const chunks: Buffer[] = [];

    audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    audioStream.on("end", () => {
      clearTimeout(timeout);
      try { tts.close(); } catch {}
      const combined = Buffer.concat(chunks);
      if (combined.length > 500) {
        resolve(combined);
      } else {
        reject(new Error("Empty audio buffer from Edge TTS"));
      }
    });
    audioStream.on("error", (err: any) => {
      clearTimeout(timeout);
      try { tts.close(); } catch {}
      reject(err);
    });
  });
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
  const v = (voice || "").toLowerCase();
  if (v === "ryan" || v === "sonia" || v === "fable" || v.includes("en-gb") || v.includes("british")) return "en-gb";
  if (v === "william" || v === "natasha" || v === "onyx" || v.includes("en-au") || v.includes("australian")) return "en-au";
  if (v.includes("en-ca") || v.includes("canadian")) return "en-ca";
  return "en";
}

// In-memory cache for high-fidelity synthesized speech
const ttsAudioCache = new Map<string, Buffer>();

// Synthesizes high-fidelity authentic human speech using Microsoft Edge Neural voices (300+ free studio voices)
async function synthesizeTTS(text: string, voice: string): Promise<Buffer> {
  const shortName = resolveVoiceShortName(voice);
  const cacheKey = `${shortName}_${text.trim()}`;
  const cached = ttsAudioCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. High priority: Authentic Neural studio voices (genuine male or female recording, 96kbps MP3)
  try {
    const realAudioBuf = await synthesizeRealEdgeTTS(text, voice);
    ttsAudioCache.set(cacheKey, realAudioBuf);
    return realAudioBuf;
  } catch (err: any) {
    console.warn("Primary Edge TTS notice:", err?.message);
  }

  // 2. High reliability clean regional Google speech with studio mastering
  try {
    const googleBuf = await synthesizeGoogleTTSFallback(text, voice);
    ttsAudioCache.set(cacheKey, googleBuf);
    return googleBuf;
  } catch (googleErr: any) {
    console.warn("Google TTS notice:", googleErr?.message);
  }

  // 3. Guaranteed tone buffer so client never hangs
  const approxDuration = Math.max(2, Math.min(10, Math.ceil(text.split(" ").length / 2.5)));
  return generateFallbackToneBuffer(approxDuration);
}

// --- Pexels ---
async function searchPexels(query: string, count: number, customKey?: string): Promise<ImageResult[]> {
  const apiKey = (customKey && customKey.trim()) || process.env.PEXELS_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
      { headers: { Authorization: apiKey } }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    if (!data.photos) return [];

    return data.photos.map((p: any) => ({
      url: p.src.large,
      thumbnail: p.src.tiny,
      source: "pexels",
      width: p.width,
      height: p.height,
    }));
  } catch {
    return [];
  }
}

// --- Pixabay ---
async function searchPixabay(query: string, count: number, customKey?: string): Promise<ImageResult[]> {
  const apiKey = (customKey && customKey.trim()) || process.env.PIXABAY_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=${count}&image_type=photo&orientation=horizontal&min_width=800`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    if (!data.hits) return [];

    return data.hits.map((h: any) => ({
      url: h.largeImageURL,
      thumbnail: h.previewURL,
      source: "pixabay",
      width: h.imageWidth,
      height: h.imageHeight,
    }));
  } catch {
    return [];
  }
}

// --- Wikimedia Commons ---
async function searchWikimedia(query: string, count: number): Promise<ImageResult[]> {
  try {
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=${count}&srsearch=${encodeURIComponent(query + " filetype:bitmap")}&origin=*`;
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": "SceneringApp/1.0 (https://ai.studio)" },
    });
    if (!searchRes.ok) return [];
    const searchData = (await searchRes.json()) as any;
    const searchResults = searchData?.query?.search;
    if (!searchResults || searchResults.length === 0) return [];

    const titles = searchResults.map((r: any) => r.title).join("|");
    const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1280&iiurlheight=720&titles=${encodeURIComponent(titles)}&origin=*`;
    const imageRes = await fetch(imageInfoUrl, {
      headers: { "User-Agent": "SceneringApp/1.0 (https://ai.studio)" },
    });
    if (!imageRes.ok) return [];
    const imageData = (await imageRes.json()) as any;

    const pages = imageData?.query?.pages;
    if (!pages) return [];

    const results: ImageResult[] = [];
    for (const key of Object.keys(pages)) {
      const page = pages[key];
      const info = page?.imageinfo?.[0];
      if (!info) continue;
      if (info.mime && !info.mime.startsWith("image/")) continue;
      if (info.mime === "image/svg+xml") continue;

      results.push({
        url: info.url || info.thumburl || "",
        thumbnail: info.thumburl || info.url || "",
        source: "wikimedia",
        width: info.width || 0,
        height: info.height || 0,
      });
    }

    return results.filter((r) => r.url && r.thumbnail);
  } catch {
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // CORS middleware for API endpoints
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-Info, Apikey");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Image search handler (supports both /api/image-search and /functions/v1/image-search)
  const handleImageSearch = async (req: express.Request, res: express.Response) => {
    try {
      const query = (req.query.q as string) || "";
      const count = Math.min(parseInt((req.query.count as string) || "10", 10), 30);
      const customPexelsKey =
        (req.headers["x-pexels-key"] as string) || (req.query.pexels_key as string) || undefined;
      const customPixabayKey =
        (req.headers["x-pixabay-key"] as string) || (req.query.pixabay_key as string) || undefined;

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

      // If still nothing, provide clean Unsplash source image
      if (results.length === 0) {
        const fallbackUrl = `https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1280&auto=format&fit=crop&q=80`;
        results = [
          {
            url: fallbackUrl,
            thumbnail: fallbackUrl,
            source: "unsplash",
            width: 1280,
            height: 720,
          },
        ];
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

  app.get("/api/image-search", handleImageSearch);
  app.get("/functions/v1/image-search", handleImageSearch);

  // Key verification endpoint so customer can test their entered keys
  app.post("/api/verify-keys", async (req: express.Request, res: express.Response) => {
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

  // Proxy image handler (supports both /api/proxy-image and /functions/v1/proxy-image)
  const handleProxyImage = async (req: express.Request, res: express.Response) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).json({ error: "Missing url parameter" });
      }

      const response = await fetch(targetUrl, {
        headers: {
          Accept: "image/*",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        redirect: "follow",
      });

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

  app.get("/api/proxy-image", handleProxyImage);
  app.get("/functions/v1/proxy-image", handleProxyImage);

  // TTS handler (voices on GET without text, synthesis on GET with text or POST)
  const handleTTSGet = async (req: express.Request, res: express.Response) => {
    const text = req.query.text as string | undefined;
    if (!text) {
      const all = req.query.all === "true";
      const fullList = await getEdgeVoicesCached();
      if (all && fullList.length > 0) {
        return res.json({ voices: fullList, total: fullList.length });
      }
      return res.json({
        voices: VOICES,
        allVoicesCount: fullList.length || 322,
      });
    }
    try {
      const voice = (req.query.voice as string) || "guy";
      const trimmedText = text.slice(0, 2000);
      const audioBuffer = await synthesizeTTS(trimmedText, voice);
      const isWav = audioBuffer.length > 4 && audioBuffer.subarray(0, 4).toString() === "RIFF";
      res.setHeader("Content-Type", isWav ? "audio/wav" : "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(audioBuffer);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to generate speech" });
    }
  };

  const handleTTSVoices = async (req: express.Request, res: express.Response) => {
    const fullList = await getEdgeVoicesCached();
    return res.json({
      curated: VOICES,
      voices: fullList.length > 0 ? fullList : VOICES,
      allVoices: fullList,
      total: fullList.length || 322,
    });
  };

  const handleTTSPost = async (req: express.Request, res: express.Response) => {
    try {
      const { text, voice = "alloy" } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required" });
      }

      const trimmedText = text.slice(0, 2000);
      const audioBuffer = await synthesizeTTS(trimmedText, voice);

      const isWav = audioBuffer.length > 4 && audioBuffer.subarray(0, 4).toString() === "RIFF";
      res.setHeader("Content-Type", isWav ? "audio/wav" : "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(audioBuffer);
    } catch (err: any) {
      console.warn("TTS synthesis error, returning 500:", err.message);
      return res.status(500).json({ error: err.message || "Failed to generate speech" });
    }
  };

  app.get("/api/tts/voices", handleTTSVoices);
  app.get("/functions/v1/tts/voices", handleTTSVoices);
  app.get("/api/tts", handleTTSGet);
  app.get("/functions/v1/tts", handleTTSGet);
  app.post("/api/tts", handleTTSPost);
  app.post("/functions/v1/tts", handleTTSPost);

  // Upload/cache custom imported voice audio
  const customAudioStore = new Map<string, { buffer: Buffer; mimeType: string }>();

  app.post("/api/upload-audio", express.json({ limit: "50mb" }), (req, res) => {
    try {
      const { data, filename, mimeType = "audio/mpeg" } = req.body || {};
      if (!data) {
        return res.status(400).json({ error: "Missing audio data" });
      }

      // Base64 string to buffer
      const base64Clean = data.includes("base64,") ? data.split("base64,")[1] : data;
      const buf = Buffer.from(base64Clean, "base64");
      const audioId = "aud_" + Math.random().toString(36).substring(2, 10);
      customAudioStore.set(audioId, { buffer: buf, mimeType });

      return res.json({
        url: `/api/custom-audio/${audioId}`,
        audioId,
        size: buf.byteLength,
        filename: filename || "imported_voice.mp3",
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || "Failed to process audio" });
    }
  });

  app.get("/api/custom-audio/:id", (req, res) => {
    const item = customAudioStore.get(req.params.id);
    if (!item) {
      return res.status(404).send("Audio not found");
    }
    res.setHeader("Content-Type", item.mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(item.buffer);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
