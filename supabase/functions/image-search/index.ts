import {
  pexelsPhotoToCandidate,
  pixabayHitToCandidate,
  pixabayUpgradeUrlTo1920,
  wikimediaInfoToCandidate,
  type StockCandidate,
} from "../../../src/lib/image-candidates.ts";

/**
 * Image search edge function.
 *
 * Shares its candidate mapping with server.ts (src/lib/image-candidates.ts),
 * so the deployed function and local dev enforce exactly the same rules:
 * only photographic sources, every delivered image 16:9 and ≥1920×1080,
 * never upscaled into a 1080p render. Black-and-white shots and diagrams are
 * removed client-side by pixel analysis after this gate.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ImageResult extends StockCandidate {}

// --- Pexels ---
async function searchPexels(query: string, count: number, customKey?: string | null): Promise<ImageResult[]> {
  const apiKey = (customKey && customKey.trim()) || Deno.env.get("PEXELS_API_KEY");
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape&size=large`,
      { headers: { Authorization: apiKey } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.photos) return [];

    return data.photos
      .map(pexelsPhotoToCandidate)
      .filter((c): c is ImageResult => c !== null);
  } catch {
    return [];
  }
}

/**
 * One cheap probe per isolate decides whether Pixabay's CDN serves the
 * `_1920` variant of `/get/` URLs (standard API keys omit `fullHDURL`).
 */
let pixabay1920Probe: Promise<boolean> | null = null;
function canPixabayServe1920(sampleUrl: string): Promise<boolean> {
  if (!pixabay1920Probe) {
    pixabay1920Probe = (async () => {
      try {
        const res = await fetch(sampleUrl, {
          headers: { Accept: "image/*", Range: "bytes=0-1" },
          redirect: "follow",
        });
        const type = res.headers.get("content-type") || "";
        return res.ok && type.startsWith("image/");
      } catch {
        return false;
      }
    })();
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
async function searchPixabay(query: string, count: number, customKey?: string | null): Promise<ImageResult[]> {
  const apiKey = (customKey && customKey.trim()) || Deno.env.get("PIXABAY_API_KEY");
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=${count}&image_type=photo&orientation=horizontal&min_width=1920&min_height=1080`
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.hits) return [];

    const direct = data.hits
      .map(pixabayHitToCandidate)
      .filter((c): c is ImageResult => c !== null);

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
    return [...direct, ...recovered];
  } catch {
    return [];
  }
}

// --- Wikimedia Commons ---
async function searchWikimedia(query: string, count: number): Promise<ImageResult[]> {
  try {
    // Step 1: search for files
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=${count}&srsearch=${encodeURIComponent(query + " filetype:bitmap")}&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    const searchResults = searchData?.query?.search;
    if (!searchResults || searchResults.length === 0) return [];

    // Step 2: get image URLs and thumbnails for each file (1920px wide)
    const titles = searchResults.map((r: any) => r.title).join("|");
    const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1920&titles=${encodeURIComponent(titles)}&origin=*`;
    const imageRes = await fetch(imageInfoUrl);
    if (!imageRes.ok) return [];
    const imageData = await imageRes.json();

    const pages = imageData?.query?.pages;
    if (!pages) return [];

    const results: ImageResult[] = [];
    for (const key of Object.keys(pages)) {
      const page = pages[key];
      const info = page?.imageinfo?.[0];
      if (!info) continue;
      if (info.mime && !info.mime.startsWith("image/")) continue;
      if (info.mime === "image/svg+xml") continue;

      const candidate = wikimediaInfoToCandidate(info);
      if (candidate) results.push(candidate);
    }

    return results;
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q") || "";
    const count = Math.min(parseInt(url.searchParams.get("count") || "10", 10), 100);
    const customPexelsKey =
      req.headers.get("x-pexels-key") || url.searchParams.get("pexels_key") || undefined;
    const customPixabayKey =
      req.headers.get("x-pixabay-key") || url.searchParams.get("pixabay_key") || undefined;

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Missing query parameter 'q'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try Pexels first
    let results = await searchPexels(query, count, customPexelsKey);

    // If Pexels returned nothing (no key or no results), try Pixabay
    if (results.length === 0) {
      results = await searchPixabay(query, count, customPixabayKey);
    }

    // If still nothing, use Wikimedia as last resort
    if (results.length === 0) {
      results = await searchWikimedia(query, count);
    }

    return new Response(
      JSON.stringify({ images: results, query, source: results[0]?.source || "none" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Image search failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
