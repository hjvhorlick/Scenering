import express from "express";
import { NATURE_FALLBACKS } from "./src/data/nature-fallbacks.ts";
import { randomBytes } from "node:crypto";
import { env } from "./src/env.ts";
import { audioStore } from "./src/audio-store.ts";
import {
  assertSecurePlatformConfiguration,
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

interface ImageResult extends StockCandidate {}

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
