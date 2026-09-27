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
}

/** Every delivered image must be at least Full HD. */
export const PHOTO_MIN_WIDTH = 1920;
export const PHOTO_MIN_HEIGHT = 1080;

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

/* ------------------------------------------------------------------ Pexels */

/**
 * Pexels photos can be served as an exact 1920×1080 crop by their CDN, so the
 * only requirement on the source is that the crop never has to *up*scale:
 * both source dimensions must already be ≥ the target.
 */
export function pexelsPhotoToCandidate(p: any): StockCandidate | null {
  const w = Number(p?.width);
  const h = Number(p?.height);
  if (!meetsFullHd(w, h)) return null;

  const base = String(p?.src?.original || "").split("?")[0];
  if (!/^https?:\/\//i.test(base)) return null;

  return {
    url: `${base}?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop`,
    thumbnail: `${base}?auto=compress&cs=tinysrgb&w=480&h=270&fit=crop`,
    source: "pexels",
    width: 1920,
    height: 1080,
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

  const url = String(h?.fullHDURL || h?.imageURL || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;

  // fullHDURL scales the longest side to 1920; report the served size.
  const longest = Math.max(w, hh);
  const scale = longest > 1920 ? 1920 / longest : 1;
  const servedW = Math.round(w * scale);
  const servedH = Math.round(hh * scale);

  return {
    url,
    thumbnail: String(h?.previewURL || url),
    source: "pixabay",
    width: servedW,
    height: servedH,
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
  };
}
