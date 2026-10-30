import type { ImageAttribution } from "./image-attribution";
/**
 * Random image selection — single source of truth for "don't always show
 * the same photo".
 *
 * Searches ask the server for up to IMAGE_SEARCH_COUNT candidates (the top
 * ~100 ranked matches) and one is chosen at random, giving every re-search
 * a fresh result instead of always the identical first hit.
 *
 * URLs already used by other scenes in the current project are excluded so
 * an "auto-find all" run gives every scene a different photo. If exclusion
 * empties the pool (a tiny or repeated catalogue), the full pool is used —
 * showing something beats showing nothing.
 */

import { NATURE_FALLBACKS, type NatureBackground } from "../data/nature-fallbacks";
import { scoreCandidateForFrame } from "./image-candidates";
import { matchFallbackPhotos } from "./search-query";

/** How many candidates we ask the server for before picking one at random. */
export const IMAGE_SEARCH_COUNT = 100;

/**
 * The raw upstream URL behind a proxied image URL (`/proxy-image?url=...`).
 * Plain (non-proxied) URLs pass through unchanged.
 */
export function rawImageUrl(url: string, proxyBase = "/image-search"): string {
  try {
    const proxyIdx = url.indexOf("proxy-image?url=");
    if (proxyIdx === -1) return url;
    const qs = url.slice(proxyIdx + "proxy-image?url=".length);
    const [encoded] = qs.split("&");
    return decodeURIComponent(encoded);
  } catch {
    return url;
  }
}

/**
 * Pick up to `n` items from the pool in random order (Fisher–Yates partial
 * shuffle). Asking for n ≥ pool length simply returns a shuffled copy —
 * handy for giving the same list a fresh order on every open.
 */
export function pickRandomSample<T>(pool: readonly T[], n: number, rng: () => number = Math.random): T[] {
  const arr = pool.slice();
  const sample: T[] = [];
  const limit = Math.min(n, arr.length);
  for (let i = 0; i < limit; i++) {
    const j = i + Math.floor(rng() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
    sample.push(arr[i]);
  }
  return sample;
}

/**
 * Pick one URL at random from the pool, preferring URLs that are not in
 * `usedUrls`. `rng` is injectable so tests can run deterministically.
 */
export function pickRandomImageUrl(
  pool: readonly string[],
  usedUrls?: ReadonlySet<string>,
  rng: () => number = Math.random
): string | null {
  const deduped = Array.from(new Set(pool.filter((u) => typeof u === "string" && u.length > 0)));
  if (deduped.length === 0) return null;

  const fresh = usedUrls && usedUrls.size > 0 ? deduped.filter((u) => !usedUrls.has(u)) : deduped;
  const candidates = fresh.length > 0 ? fresh : deduped;
  return candidates[Math.floor(rng() * candidates.length)] ?? null;
}

/* ---------------------------------------------------------------------------
 * Research deck — the pure half of image research.
 *
 * Kept here, next to the random-pick helpers it builds on, and deliberately
 * free of any fetch or import.meta.env so it can be unit-tested in plain
 * Node. The network half lives in ./image-search.
 * ------------------------------------------------------------------------- */

/** A stock-photo candidate as returned by the server. */
export interface ImageCandidate {
  url: string;
  thumbnail: string;
  source: string;
  width?: number;
  height?: number;
  nativeWidth?: number;
  nativeHeight?: number;
  highResUrl?: string;
  attribution?: Omit<ImageAttribution, "imageUrl">;
}

/**
 * The bundled nature deck as search candidates, ranked against a query.
 *
 * This is the floor under image research: with no API keys, no network, or a
 * subject stock libraries simply do not have, the user still gets a usable
 * grid rather than an empty one. Photos that actually match the query lead;
 * when nothing matches, the whole deck is offered in a shuffled order so the
 * fallback does not look like the same frozen nine images every time.
 */
export function fallbackCandidates(
  query: string,
  deck: readonly NatureBackground[] = NATURE_FALLBACKS,
  rng: () => number = Math.random
): ImageCandidate[] {
  const toCandidate = (bg: NatureBackground): ImageCandidate => ({
    url: bg.url,
    thumbnail: bg.thumb,
    source: "nature",
  });

  const matched = matchFallbackPhotos(query, deck);
  if (matched.length > 0) return matched.map(toCandidate);
  return pickRandomSample(deck, deck.length, rng).map(toCandidate);
}

/**
 * How many candidates the inline research block shows at once.
 *
 * Twelve fills a 3-wide phone grid in four tidy rows and a 6-wide desktop
 * grid in two, with no ragged half-row at either end.
 */
export const VISIBLE_CANDIDATES = 12;

/**
 * Every image URL this browser has already put in front of the user, so a
 * re-search or a replace never serves the same photo twice.
 *
 * Bounded: a long editing session cannot grow this without limit. Once the
 * cap is reached the oldest entries are evicted, by which point the upstream
 * pool has moved on anyway.
 */
const MAX_HISTORY = 500;
const shownUrls = new Set<string>();
const shownOrder: string[] = [];

export function rememberShown(url: string): void {
  if (!url || shownUrls.has(url)) return;
  shownUrls.add(url);
  shownOrder.push(url);
  while (shownOrder.length > MAX_HISTORY) {
    const oldest = shownOrder.shift();
    if (oldest) shownUrls.delete(oldest);
  }
}

export function rememberShownAll(urls: readonly string[]): void {
  for (const url of urls) rememberShown(url);
}

export function hasBeenShown(url: string): boolean {
  return shownUrls.has(url);
}

export function resetShownHistory(): void {
  shownUrls.clear();
  shownOrder.length = 0;
}

export function shownHistorySize(): number {
  return shownUrls.size;
}

/** De-duplicate a pool by URL, preserving order. */
function uniqueByUrl(pool: readonly ImageCandidate[]): ImageCandidate[] {
  const seen = new Set<string>();
  const out: ImageCandidate[] = [];
  for (const img of pool) {
    const url = img?.url || "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(img);
  }
  return out;
}

/** Order unseen candidates by frame quality when dimension metadata exists,
 *  then sample from the leading quality tier so selections stay sharp and
 *  well-proportioned without repeating or starving rotation. */
function qualityBiasedSample(
  candidates: readonly ImageCandidate[],
  n: number,
  rng: () => number,
  frameW = 1920,
  frameH = 1080
): ImageCandidate[] {
  if (candidates.length <= n) return pickRandomSample(candidates, candidates.length, rng);
  const hasDimensions = candidates.some(
    (c) => (c.nativeWidth ?? c.width ?? 0) > 0 && (c.nativeHeight ?? c.height ?? 0) > 0
  );
  if (!hasDimensions) return pickRandomSample(candidates, n, rng);

  const ranked = candidates
    .map((item, idx) => ({
      item,
      idx,
      score: scoreCandidateForFrame(
        {
          width: item.width ?? 0,
          height: item.height ?? 0,
          nativeWidth: item.nativeWidth,
          nativeHeight: item.nativeHeight,
        },
        frameW,
        frameH
      ),
    }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx))
    .map((entry) => entry.item);

  const tierSize = Math.min(ranked.length, Math.max(n * 2, Math.ceil(ranked.length * 0.55)));
  return pickRandomSample(ranked.slice(0, tierSize), n, rng);
}

/**
 * Choose `n` candidates, strongly preferring ones never shown before and
 * favouring photos with generous resolution headroom for the target frame.
 *
 * When there are not enough unseen photos to fill the grid — a small result
 * set, or a session that has already seen everything — the remainder is
 * topped up from the already-seen pool rather than leaving empty cells.
 * Showing a repeat beats showing a half-empty grid.
 */
export function selectFreshCandidates(
  pool: readonly ImageCandidate[],
  n: number = VISIBLE_CANDIDATES,
  rng: () => number = Math.random,
  frameSize?: { width: number; height: number }
): ImageCandidate[] {
  const unique = uniqueByUrl(pool);
  const unseen = unique.filter((img) => !shownUrls.has(img.url));
  const fw = frameSize?.width || 1920;
  const fh = frameSize?.height || 1080;

  let chosen: ImageCandidate[];
  if (unseen.length >= n) {
    chosen = qualityBiasedSample(unseen, n, rng, fw, fh);
  } else {
    const remainder = unique.filter((img) => shownUrls.has(img.url));
    chosen = pickRandomSample(unseen, unseen.length, rng).concat(
      qualityBiasedSample(remainder, Math.max(0, n - unseen.length), rng, fw, fh)
    );
  }

  // Recorded here, not by the caller: the "never show the same photo twice"
  // promise has to hold for every caller, including the next research press
  // where the user picked nothing from the previous grid.
  rememberShownAll(chosen.map((c) => c.url));
  return chosen;
}

/**
 * One photo the user has not seen yet, or null when the pool is empty.
 *
 * Backs Replace. It only serves a previously shown photo when the pool holds
 * nothing else — "show me a different one" should mean a different one.
 */
export function pickOneFreshCandidate(
  pool: readonly ImageCandidate[],
  rng: () => number = Math.random,
  frameSize?: { width: number; height: number }
): ImageCandidate | null {
  const unique = uniqueByUrl(pool);
  if (unique.length === 0) return null;

  const unseen = unique.filter((img) => !shownUrls.has(img.url));
  const source = unseen.length > 0 ? unseen : unique;
  const pick = qualityBiasedSample(source, 1, rng, frameSize?.width || 1920, frameSize?.height || 1080)[0] ?? null;

  // Recorded here rather than by the caller. Leaving it to the caller meant a
  // hand-out that was never remembered could be served again on the very
  // next press, so Replace could appear to do nothing.
  if (pick) rememberShown(pick.url);
  return pick;
}
