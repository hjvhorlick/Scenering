import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

interface ImageResult {
  url: string;
  thumbnail: string;
  source: string;
  width: number;
  height: number;
}

const VOICES = [
  { id: "alloy", name: "Alloy (Dynamic Male)", lang: "en-US", preview: "Versatile, clear, and balanced narrative tone." },
  { id: "nova", name: "Nova (Warm Female)", lang: "en-US", preview: "Friendly, enthusiastic, and bright clarity." },
  { id: "echo", name: "Echo (Smooth Male)", lang: "en-US", preview: "Calm, grounded, and modern presenter style." },
  { id: "fable", name: "Fable (British Male)", lang: "en-GB", preview: "Articulate, expressive, and charismatic British accent." },
  { id: "onyx", name: "Onyx (Deep Male)", lang: "en-AU", preview: "Deep, authoritative, and cinematic tone." },
  { id: "shimmer", name: "Shimmer (Expressive Female)", lang: "en-CA", preview: "Rich, polished, and captivating professional voice." },
  { id: "en-US-ChristopherNeural", name: "Christopher (Male)", lang: "en-US", preview: "Classic American narrator." },
  { id: "en-US-AriaNeural", name: "Aria (Female)", lang: "en-US", preview: "Polished American female presenter." },
  { id: "en-GB-RyanNeural", name: "Ryan (British Male)", lang: "en-GB", preview: "Distinguished British narrator." },
  { id: "en-AU-WilliamNeural", name: "William (Australian Male)", lang: "en-AU", preview: "Warm Australian male." },
];

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
  if (v === "fable" || v.includes("en-gb") || v.includes("british") || v.includes("ryan")) return "en-gb";
  if (v === "onyx" || v.includes("en-au") || v.includes("australian") || v.includes("william")) return "en-au";
  if (v === "shimmer" || v.includes("en-ca") || v.includes("canadian")) return "en-ca";
  if (v.includes("en-in") || v.includes("indian")) return "en-in";
  return "en";
}

async function synthesizeTTS(text: string, voice: string): Promise<Buffer> {
  const lang = getVoiceLanguage(voice);
  const chunks = splitTextIntoChunks(text, 180);
  const audioBuffers: Buffer[] = [];

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
      trimmed
    )}&tl=${lang}&client=tw-ob`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      throw new Error(`TTS synthesis returned status ${res.status}`);
    }

    const arrBuf = await res.arrayBuffer();
    audioBuffers.push(Buffer.from(arrBuf));
  }

  if (audioBuffers.length === 0) {
    throw new Error("No speech audio could be generated");
  }

  return Buffer.concat(audioBuffers);
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
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      return res.send(Buffer.from(arrayBuf));
    } catch {
      res.setHeader("Content-Type", "image/svg+xml");
      return res.send(generatePlaceholder());
    }
  };

  app.get("/api/proxy-image", handleProxyImage);
  app.get("/functions/v1/proxy-image", handleProxyImage);

  // TTS handler (voices on GET, synthesis on POST)
  const handleTTSGet = (_req: express.Request, res: express.Response) => {
    return res.json({ voices: VOICES });
  };

  const handleTTSPost = async (req: express.Request, res: express.Response) => {
    try {
      const { text, voice = "alloy" } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required" });
      }

      const trimmedText = text.slice(0, 2000);
      const audioBuffer = await synthesizeTTS(trimmedText, voice);

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(audioBuffer);
    } catch (err: any) {
      console.warn("TTS synthesis error, returning 500:", err.message);
      return res.status(500).json({ error: err.message || "Failed to generate speech" });
    }
  };

  app.get("/api/tts", handleTTSGet);
  app.get("/functions/v1/tts", handleTTSGet);
  app.post("/api/tts", handleTTSPost);
  app.post("/functions/v1/tts", handleTTSPost);

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
