/**
 * Client-side "is this actually a photo?" analysis.
 *
 * Providers cannot be trusted to filter their own catalogues: Wikimedia hosts
 * scans, diagrams and maps as ordinary bitmaps, and even photo libraries serve
 * the occasional black-and-white shot. The user's rule is "only images that
 * are like photos", so every candidate's thumbnail is loaded and measured on
 * a tiny canvas, and anything that reads as artwork rather than photography
 * is dropped before it can reach a scene.
 *
 * The metrics are computed on a 64×36 downscale (fast, and enough signal):
 *
 *   colorFrac    — share of pixels with real chroma (max−min channel spread).
 *                  A grayscale / B&W photograph has ≈0; colour photos are
 *                  typically >0.3. Rejected below 5%.
 *   uniqueColors — count of distinct quantised colours (4 bits/channel).
 *                  Line diagrams, logos and flat illustrations live under ~24;
 *                  photographs have hundreds+.
 *   whiteFrac    — share of near-white pixels. Paper, charts and schematics
 *                  are dominated by it; only rejected when the palette is ALSO
 *                  poor, so snowy landscapes and bright beaches still pass.
 *   blackFrac    — share of near-black pixels. Guards against solid-dark
 *                  diagrams; night and astrophotography keep enough colour
 *                   variety to stay accepted.
 *
 * `classifyPhotoMetrics` is pure and unit-tested; `analyzeImageUrl` is the
 * browser half (thumbnail → canvas → metrics). Images load through the server
 * proxy so the canvas is never tainted by a cross-origin read.
 */



export interface PhotoMetrics {
  colorFrac: number;
  uniqueColors: number;
  whiteFrac: number;
  blackFrac: number;
}

/** Analysis canvas size — small enough to be instant, large enough to see. */
const ANALYSIS_W = 64;
const ANALYSIS_H = 36;

/**
 * The verdict on measured metrics. Thresholds are deliberately conservative:
 * a genuine photograph must never be rejected, so only artwork with
 * unambiguous signatures (no colour, a handful of flat colours, paper-white
 * dominance) is filtered out.
 */
export function classifyPhotoMetrics(m: PhotoMetrics): "photo" | "reject" {
  if (m.uniqueColors < 24) return "reject"; // flat art / logos / line diagrams
  if (m.colorFrac < 0.05) return "reject"; // grayscale / B&W photograph
  if (m.whiteFrac > 0.62 && m.uniqueColors < 220) return "reject"; // charts, schematics, scanned text
  if (m.blackFrac > 0.88 && m.uniqueColors < 220) return "reject"; // solid-dark diagrams
  return "photo";
}

/** Compute the metrics from raw RGBA pixels (any length divisible by 4). */
export function computePhotoMetrics(data: Uint8ClampedArray | Uint8Array): PhotoMetrics {
  const total = Math.floor(data.length / 4) || 1;
  const quantized = new Set<number>();
  let colorPixels = 0;
  let whitePixels = 0;
  let blackPixels = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min >= 24) colorPixels++;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum >= 246) whitePixels++;
    else if (lum <= 10) blackPixels++;
    quantized.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
  }

  return {
    colorFrac: colorPixels / total,
    uniqueColors: quantized.size,
    whiteFrac: whitePixels / total,
    blackFrac: blackPixels / total,
  };
}

/**
 * Loads an image (through the proxy) and decides whether it is a photograph.
 * Never throws: a thumbnail that cannot be loaded or read is treated as
 * unverifiable and rejected, so it cannot sneak into a scene.
 */
export async function analyzeImageUrl(
  url: string,
  opts: { proxy?: (url: string) => string; timeoutMs?: number } = {}
): Promise<boolean> {
  if (typeof document === "undefined") return false;

  // Load directly first (the browser can usually reach the host even when
  // the server cannot), then through the proxy as backup.
  const loadOne = (src: string) =>
    new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok && el.naturalWidth > 0 ? el : null);
      };
      const timer = setTimeout(() => finish(false), opts.timeoutMs ?? 5000);
      el.onload = () => finish(true);
      el.onerror = () => finish(false);
      if (!/^(data|blob):/.test(src)) el.crossOrigin = "anonymous";
      el.src = src;
    });

  let img = await loadOne(url);
  if (!img && opts.proxy) {
    const proxied = opts.proxy(url);
    if (proxied !== url) img = await loadOne(proxied);
  }
  if (!img) return false;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = ANALYSIS_W;
    canvas.height = ANALYSIS_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, ANALYSIS_W, ANALYSIS_H);
    const { data } = ctx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H);
    return classifyPhotoMetrics(computePhotoMetrics(data)) === "photo";
  } catch {
    return false;
  }
}

/** How many candidates a search will verify — bounds proxy traffic. */
export const MAX_ANALYZED = 40;
/** Verification runs this many thumbnails at a time. */
const CONCURRENCY = 8;

/**
 * Filters a candidate pool down to photographic images.
 *
 * Analyses up to `MAX_ANALYZED` thumbnails concurrently (small batches keep
 * the network and the UI tame). If every single one fails to verify — proxy
 * down, canvas blocked — the original pool is returned unchanged: showing
 * something beats showing nothing, and the server-side dimension gate has
 * already run either way.
 */
export async function filterPhotoLikeCandidates<T extends { url: string; thumbnail?: string }>(
  candidates: readonly T[],
  opts: { proxy?: (url: string) => string; maxAnalyzed?: number } = {}
): Promise<T[]> {
  if (typeof document === "undefined" || candidates.length === 0) return [...candidates];

  const limit = Math.min(opts.maxAnalyzed ?? MAX_ANALYZED, candidates.length);
  const toVerify = candidates.slice(0, limit);
  const verdicts = new Map<string, boolean>();

  for (let start = 0; start < toVerify.length; start += CONCURRENCY) {
    const batch = toVerify.slice(start, start + CONCURRENCY);
    await Promise.all(
      batch.map(async (c) => {
        const src = c.thumbnail || c.url;
        verdicts.set(src, await analyzeImageUrl(src, { proxy: opts.proxy }));
      })
    );
  }

  const passed = toVerify.filter((c) => verdicts.get(c.thumbnail || c.url) === true);
  if (passed.length === 0) {
    console.warn("image analysis: no candidate could be verified as a photo — using the unfiltered pool");
    return [...candidates];
  }
  return passed;
}
