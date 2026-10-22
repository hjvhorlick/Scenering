/**
 * Stock-photo candidate mapping — the quality gate for image search.
 *
 * The user-facing rule is short and absolute: **only photographic images,
 * every one of them 16:9 and 1080p (≥1920×1080)**. The old pipeline served
 * Pexels' 940px `large` variant (upscaled — and therefore softened — at every
 * 1080p render) and let any aspect ratio, grayscale scan or line diagram
 * through.
 *
 * Each provider maps through this module before it ever reaches the client:
 *
 *   Pexels     — dimension floor only (the CDN crops to exactly 1920×1080 via
 *                `w=1920&h=1080&fit=crop`, so the delivered file is always
 *                precisely 16:9 Full HD, never upscaled).
 *   Pixabay    — aspect + dimension floor; prefers `fullHDURL` / `imageURL`
 *                (1280px `largeImageURL` cannot honour 1080p and is dropped).
 *   Wikimedia  — aspect + dimension floor; the thumb is requested at 1920px
 *                wide and a small 320px variant is derived for fast grid
 *                display and client-side photo analysis.
 *
 * Pure, dependency-free and shared verbatim by server.ts and the Supabase
 * edge function, so local dev and deployed production filter identically.
 */

export interface StockCandidate {
  url: string;
  thumbnail: string;
  source: string;
  width: number;
  height: number;
  /** Original uncropped camera dimensions when reported by the provider. */
  nativeWidth?: number;
  nativeHeight?: number;
  /** Optional higher-resolution master URL when available (e.g. >1080p export). */
  highResUrl?: string;
}

/** Every delivered image must be at least Full HD. */
export const PHOTO_MIN_WIDTH = 1920;
export const PHOTO_MIN_HEIGHT = 1080;

/**
 * Maximum aspect-ratio mismatch accepted for server-cropped Pexels sources.
 * Allows standard 16:9 (1.0), 3:2 (1.19), and 4:3 (1.33) camera originals while
 * rejecting extreme portrait or panoramic slivers that lose >55% to cropping.
 */
export const MAX_SOURCE_ASPECT_MISMATCH = 2.25;

/**
 * How far an image's aspect may sit from 16:9 and still count. ±0.06 covers
 * 1.718–1.838: near enough that the framing engine's cover crop (≤3%) is
 * invisible, while genuine 3:2 (1.5), 4:3 and portrait sources are excluded.
 */
export const ASPECT_16_9 = 16 / 9;
export const ASPECT_TOLERANCE = 0.06;

/** True when width/height are a ~16:9 landscape shape. */
export function is16x9Aspect(w?: number, h?: number): boolean {
  if (!Number.isFinite(w) || !Number.isFinite(h) || !w || !h) return false;
  const ratio = w / h;
  return ratio >= ASPECT_16_9 - ASPECT_TOLERANCE && ratio <= ASPECT_16_9 + ASPECT_TOLERANCE;
}

/** True when the image is at least 1920×1080 (no upscaling at 1080p, ever). */
export function meetsFullHd(w?: number, h?: number): boolean {
  return (w || 0) >= PHOTO_MIN_WIDTH && (h || 0) >= PHOTO_MIN_HEIGHT;
}

/** The full gate for providers whose files cannot be cropped server-side. */
export function isUsableStockDimensions(w?: number, h?: number): boolean {
  return is16x9Aspect(w, h) && meetsFullHd(w, h);
}

/**
 * Score how cleanly a stock candidate fills `frameW × frameH` (including ~1.44×
 * Ken Burns camera headroom) without enlargement or excessive cropping.
 */
export function scoreCandidateForFrame(
  candidate: Pick<StockCandidate, "width" | "height" | "nativeWidth" | "nativeHeight">,
  frameW = PHOTO_MIN_WIDTH,
  frameH = PHOTO_MIN_HEIGHT
): number {
  const srcW = Number(candidate.nativeWidth || candidate.width) || 0;
  const srcH = Number(candidate.nativeHeight || candidate.height) || 0;
  const targetW = Math.max(1, frameW);
  const targetH = Math.max(1, frameH);
  if (srcW <= 0 || srcH <= 0) return 0;

  const srcRatio = srcW / srcH;
  const targetRatio = targetW / targetH;
  const mismatch = Math.max(srcRatio / targetRatio, targetRatio / srcRatio, 1);

  // Effective pixels remaining AFTER cropping `srcW × srcH` to `targetRatio`:
  const croppedW = srcRatio > targetRatio ? srcH * targetRatio : srcW;
  const croppedH = srcRatio > targetRatio ? srcH : srcW / targetRatio;

  // Ideal pixel coverage includes 1.44× Ken Burns zoom headroom on both axes.
  const idealW = targetW * 1.44;
  const idealH = targetH * 1.44;
  const scaleCoverage = Math.min(croppedW / idealW, croppedH / idealH);
  // 0..65 points for resolution coverage (50 at 1.0× frame, 65 at ≥1.44× headroom)
  const resolutionScore = Math.min(65, Math.max(0, scaleCoverage * 52));
  // 0..35 points for aspect match (35 when exact shape, tapering down as crop waste grows)
  const aspectScore = 35 / Math.pow(mismatch, 1.35);

  return Math.round((resolutionScore + aspectScore) * 100) / 100;
}

/**
 * Stable descending sort of candidates by frame fitness (resolution headroom +
 * minimal crop loss) so higher-grade sources sit at the front of the pool.
 */
export function rankCandidatesForFrame<
  T extends Pick<StockCandidate, "width" | "height" | "nativeWidth" | "nativeHeight">
>(candidates: readonly T[], frameW = PHOTO_MIN_WIDTH, frameH = PHOTO_MIN_HEIGHT): T[] {
  return candidates
    .map((item, idx) => ({ item, idx, score: scoreCandidateForFrame(item, frameW, frameH) }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx))
    .map((entry) => entry.item);
}

/* ------------------------------------------------------------------ Pexels */

/**
 * Pexels photos can be served as an exact 1920×1080 crop by their CDN, so the
 * source must be at least Full HD and reasonably landscape-proportioned so the
 * CDN crop never discards most of the composition.
 */
export function pexelsPhotoToCandidate(p: any): StockCandidate | null {
  const w = Number(p?.width);
  const h = Number(p?.height);
  if (!meetsFullHd(w, h)) return null;
  const ratio = w / h;
  const mismatch = Math.max(ratio / ASPECT_16_9, ASPECT_16_9 / ratio, 1);
  if (mismatch > MAX_SOURCE_ASPECT_MISMATCH) return null;

  const base = String(p?.src?.original || "").split("?")[0];
  if (!/^https?:\/\//i.test(base)) return null;

  return {
    url: `${base}?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop`,
    thumbnail: `${base}?auto=compress&cs=tinysrgb&w=480&h=270&fit=crop`,
    source: "pexels",
    width: 1920,
    height: 1080,
    nativeWidth: w,
    nativeHeight: h,
  };
}

/* ----------------------------------------------------------------- Pixabay */

/**
 * Pixabay has no server-side cropping, so the source itself must already be
 * ~16:9 and Full HD, and the URL must be able to deliver that size:
 * `fullHDURL` (≤1920px) or `imageURL` (original). A standard API key exposes
 * neither — those hits cannot meet the 1080p rule and are dropped rather than
 * upscaled. `pixabayUpgradeUrlTo1920` recovers them when the CDN allows it.
 */
export function pixabayHitToCandidate(h: any): StockCandidate | null {
  const w = Number(h?.imageWidth);
  const hh = Number(h?.imageHeight);
  if (!isUsableStockDimensions(w, hh)) return null;

  const fullHd = String(h?.fullHDURL || "").trim();
  const original = String(h?.imageURL || "").trim();
  const url = fullHd || original;
  if (!/^https?:\/\//i.test(url)) return null;

  // fullHDURL scales the longest side to 1920; report the served size.
  const longest = Math.max(w, hh);
  const scale = fullHd && longest > 1920 ? 1920 / longest : 1;
  const servedW = Math.round(w * scale);
  const servedH = Math.round(hh * scale);

  return {
    url,
    thumbnail: String(h?.previewURL || url),
    source: "pixabay",
    width: servedW,
    height: servedH,
    nativeWidth: w,
    nativeHeight: hh,
    ...(original && original !== url && longest > 1920 ? { highResUrl: original } : {}),
  };
}

/**
 * Pixabay `/get/` URLs end in `_<size>.<ext>` (e.g. `..._640.jpg`,
 * `..._1280.jpg`). Swapping the suffix for `_1920` yields the Full HD variant
 * — the same file `fullHDURL` would point at on full-access keys.
 * Returns null when the URL does not match the pattern.
 */
export function pixabayUpgradeUrlTo1920(url: string): string | null {
  const m = String(url || "").match(/^(.*_)(640|1280)(\.[a-zA-Z0-9]+)(?:\?.*)?$/);
  return m ? `${m[1]}1920${m[3]}` : null;
}

/* --------------------------------------------------------------- Wikimedia */

/**
 * Wikimedia thumbnail URLs embed the width as `.../<w>px-Name.jpg`; swapping
 * the number yields that width's variant. Used to derive a small, fast
 * thumbnail from the 1920px one the API requested.
 */
export function wikimediaThumbAtWidth(thumbUrl: string, width: number): string {
  const w = Math.max(40, Math.round(width));
  return String(thumbUrl || "").replace(/\/(\d+)px-/, `/${w}px-`);
}

/**
 * A Wikimedia imageinfo record → candidate. The caller must request the image
 * info with `iiurlwidth=1920`; the thumb is only ≥1920 wide when the original
 * is, which is exactly the Full HD floor.
 */
export function wikimediaInfoToCandidate(info: any): StockCandidate | null {
  const w = Number(info?.width);
  const h = Number(info?.height);
  if (!isUsableStockDimensions(w, h)) return null;

  const thumb = String(info?.thumburl || "").trim();
  const original = String(info?.url || "").trim();
  const url = thumb || original;
  if (!/^https?:\/\//i.test(url)) return null;

  const thumbW = Number(info?.thumbwidth) || w;
  const servedW = Math.min(1920, Math.max(PHOTO_MIN_WIDTH, Math.min(w, thumbW)));
  const servedH = Math.round((servedW * h) / w);

  return {
    url,
    thumbnail: thumb ? wikimediaThumbAtWidth(thumb, 320) : url,
    source: "wikimedia",
    width: servedW,
    height: servedH,
    nativeWidth: w,
    nativeHeight: h,
  };
}

/**
 * Upgrades a saved 16:9 stock CDN URL to a higher-resolution, lower-compression
 * 16:9 master of the exact same composition when the render needs zoom/crop
 * headroom. Returns null when no safe same-aspect upgrade exists.
 */
export function upgradeStockUrlForRender(
  rawUrl: string,
  minWidth = 0,
  minHeight = 0
): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    // Pixabay CDN: if a legacy _640 or _1280 URL was saved on a scene, lift it
    // to the Full HD _1920 variant so it is never upscaled at render time.
    if (host === "pixabay.com" || host.endsWith(".pixabay.com")) {
      return pixabayUpgradeUrlTo1920(rawUrl);
    }

    const neededH = Math.max(minHeight, Math.ceil((minWidth * 9) / 16));
    if (!(neededH > PHOTO_MIN_HEIGHT)) return null;
    const targetH = neededH <= 1440 ? 1440 : 2160;
    const targetW = targetH === 1440 ? 2560 : 3840;

    // Pexels Imgix CDN: preserve exact 16:9 fit=crop composition while lifting
    // resolution and replacing aggressive auto=compress with clean q=92 JPEG.
    if (
      (host === "images.pexels.com" || host.endsWith(".pexels.com")) &&
      parsed.searchParams.get("fit") === "crop"
    ) {
      const curW = Number(parsed.searchParams.get("w") || 0);
      const curH = Number(parsed.searchParams.get("h") || 0);
      if (curW > 0 && curH > 0 && Math.abs(curW / curH - ASPECT_16_9) < 0.05 && curW < targetW) {
        const base = `${parsed.origin}${parsed.pathname}`;
        return `${base}?cs=tinysrgb&q=92&w=${targetW}&h=${targetH}&fit=crop`;
      }
    }

    // Wikimedia Commons thumb URLs (/1920px-Filename.jpg): request a wider
    // thumb of the exact same source file; if the original upload is smaller
    // than targetW, the caller's fallback chain drops straight back to 1920px.
    if (host === "upload.wikimedia.org") {
      const match = parsed.pathname.match(/\/(\d+)px-([^/]+)$/);
      if (match) {
        const curW = Number(match[1]);
        if (curW > 0 && curW < targetW) {
          parsed.pathname = parsed.pathname.replace(/\/\d+px-([^/]+)$/, `/${targetW}px-$1`);
          return parsed.toString();
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}
