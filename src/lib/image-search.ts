/**
 * Image research — the network half.
 *
 * The pure selection logic (which photos to show, and never showing the same
 * one twice) lives in ./image-picker, where it can be unit-tested without a
 * browser or a server. This module only does the fetching, the proxying and
 * the wiring between them.
 *
 * The server already returns up to 100 ranked candidates per query; the work
 * here is choosing a good dozen from that pool and remembering what has been
 * shown so a second search looks genuinely different.
 */

import { EDGE_FUNCTION_BASE } from "./supabase";
import {
  IMAGE_SEARCH_COUNT,
  selectFreshCandidates,
  pickOneFreshCandidate,
  rememberShown,
  rememberShownAll,
  VISIBLE_CANDIDATES,
  type ImageCandidate,
} from "./image-picker";
import { fallbackCandidates } from "./image-picker";
import { broadenQuery } from "./search-query";
import { filterPhotoLikeCandidates } from "./image-analysis";

/**
 * How many progressively wider queries a single search may try.
 *
 * Four covers the useful ladder (exact, no filler, no qualifiers, subject
 * only) while bounding the worst case to four round-trips.
 */
export const MAX_BROADENING_STEPS = 4;

/** Keep fetched pools around for a session so replace/research reuses providers' results. */
const POOL_CACHE_TTL_MS = 10 * 60_000;
const EMPTY_POOL_CACHE_TTL_MS = 3 * 60_000;
const MAX_POOL_CACHE_ENTRIES = 32;
const poolCache = new Map<string, { expiresAt: number; pool: ImageCandidate[] }>();
const poolRequests = new Map<string, Promise<ImageCandidate[]>>();

function poolCacheKey(query: string, options: ResearchOptions): string {
  const headers = Object.entries(options.headers || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([
    query.trim().toLocaleLowerCase(),
    options.frameWidth ? Math.round(options.frameWidth) : 0,
    options.frameHeight ? Math.round(options.frameHeight) : 0,
    headers,
    options.queryParams || "",
  ]);
}

function readCachedPool(key: string): ImageCandidate[] | null {
  const entry = poolCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    poolCache.delete(key);
    return null;
  }
  poolCache.delete(key);
  poolCache.set(key, entry);
  return entry.pool.map((candidate) => ({ ...candidate }));
}

function rememberPool(key: string, pool: ImageCandidate[]): void {
  poolCache.delete(key);
  poolCache.set(key, {
    pool: pool.map((candidate) => ({ ...candidate })),
    expiresAt: Date.now() + (pool.length ? POOL_CACHE_TTL_MS : EMPTY_POOL_CACHE_TTL_MS),
  });
  while (poolCache.size > MAX_POOL_CACHE_ENTRIES) {
    const oldest = poolCache.keys().next().value;
    if (oldest === undefined) break;
    poolCache.delete(oldest);
  }
}

/** Clear the bounded in-memory search pool (useful after changing provider keys). */
export function clearImageSearchPoolCache(): void {
  poolCache.clear();
  poolRequests.clear();
}

export {
  fallbackCandidates,
  VISIBLE_CANDIDATES,
  selectFreshCandidates,
  pickOneFreshCandidate,
  rememberShown,
  rememberShownAll,
  hasBeenShown,
  resetShownHistory,
  shownHistorySize,
  type ImageCandidate,
} from "./image-picker";

export interface ResearchOptions {
  /** Pexels/Pixabay headers from the saved customer keys. */
  headers?: Record<string, string>;
  /** Pexels/Pixabay query params from the saved customer keys. */
  queryParams?: string;
  /** Abort a superseded search so a fast double-click cannot race. */
  signal?: AbortSignal;
  /** Target output frame dimensions so candidates are ranked for minimal crop/upscale. */
  frameWidth?: number;
  frameHeight?: number;
}

/** Build the proxied URL the rest of the app expects for an image.
 *  Same-origin paths (the bundled nature library) are returned untouched —
 *  they are served straight from /public and never need the proxy. */
export function proxyImageUrl(url: string): string {
  if (url.startsWith("/")) return url;
  return `${EDGE_FUNCTION_BASE}/proxy-image?url=${encodeURIComponent(url)}`;
}

/**
 * Ask the server for the candidate pool behind a query.
 *
 * Never throws: a failed search must leave the scene's existing photo alone
 * rather than clearing it, so callers get an empty pool and do nothing.
 */
async function fetchPoolUncached(
  query: string,
  options: ResearchOptions
): Promise<ImageCandidate[]> {
  const { headers = {}, queryParams = "", signal, frameWidth, frameHeight } = options;
  const q = (query || "").trim();
  if (!q) return [];

  const frameSuffix =
    frameWidth && frameHeight
      ? `&frameW=${Math.round(frameWidth)}&frameH=${Math.round(frameHeight)}`
      : "";

  try {
    const res = await fetch(
      `${EDGE_FUNCTION_BASE}/image-search?q=${encodeURIComponent(q)}` +
        `&count=${IMAGE_SEARCH_COUNT}${frameSuffix}${queryParams}`,
      { headers, signal }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.images) ? (data.images as ImageCandidate[]) : [];
  } catch {
    return [];
  }
}

async function fetchPool(query: string, options: ResearchOptions): Promise<ImageCandidate[]> {
  // A caller-owned AbortSignal is never shared with another caller or cached,
  // so cancelling one modal search cannot cancel the pool for other consumers.
  if (options.signal) return fetchPoolUncached(query, options);

  const key = poolCacheKey(query, options);
  const cached = readCachedPool(key);
  if (cached) return cached;

  const pending = poolRequests.get(key);
  if (pending) return (await pending).map((candidate) => ({ ...candidate }));

  const request = fetchPoolUncached(query, options).then((pool) => {
    rememberPool(key, pool);
    return pool;
  }).finally(() => {
    if (poolRequests.get(key) === request) poolRequests.delete(key);
  });
  poolRequests.set(key, request);
  return (await request).map((candidate) => ({ ...candidate }));
}

/**
 * Ask the server for the candidate pool behind a query, then keep only the
 * images that are genuinely photographic.
 *
 * The server already enforces the hard rules (16:9, ≥1920×1080); this half
 * adds the visual check — black-and-white shots, diagrams, scans and flat
 * artwork are recognised from their thumbnails and dropped, so nothing but
 * photo-like pictures can reach a scene.
 */
export async function searchImagePool(
  query: string,
  options: ResearchOptions = {}
): Promise<ImageCandidate[]> {
  const pool = await fetchPool(query, options);
  if (pool.length === 0) return [];

  // Pexels and Pixabay are photo-only stock libraries and already enforce the
  // resolution/aspect gate server-side. Avoid loading/analyzing dozens of
  // thumbnails for these sources; reserve pixel probing for Wikimedia or
  // future mixed-content providers.
  if (pool.every((candidate) => ["pexels", "pixabay", "nature-library", "nature"].includes(candidate.source))) {
    return pool;
  }
  return filterPhotoLikeCandidates(pool, { proxy: proxyImageUrl, targetAccepted: VISIBLE_CANDIDATES });
}

/** The outcome of a broadened search, including how it was reached. */
export interface BroadenedPool {
  /** The candidates found. Empty only when even the deck is empty. */
  pool: ImageCandidate[];
  /** The query that actually produced the pool. */
  query: string;
  /** True when `query` is a widened form of the one that was asked for. */
  broadened: boolean;
  /** True when the bundled nature deck answered instead of the network. */
  fromFallbackDeck: boolean;
}

/**
 * Search, and keep widening the query until something comes back.
 *
 * The exact query is always tried first, so a search that works is never
 * second-guessed. Only when it comes back empty is the ladder from
 * `broadenQuery` walked — filler words out, qualifiers out, then just the
 * subject — and if the network has nothing for any of them the bundled
 * nature deck answers instead. The caller therefore never has to render an
 * empty grid, and `broadened` / `fromFallbackDeck` let it say honestly which
 * query the photos on screen actually belong to.
 */
export async function searchImagePoolBroadened(
  query: string,
  options: ResearchOptions = {}
): Promise<BroadenedPool> {
  const asked = (query || "").trim();
  const ladder = broadenQuery(asked, MAX_BROADENING_STEPS);

  for (const step of ladder) {
    const pool = await searchImagePool(step, options);
    if (pool.length > 0) {
      return { pool, query: step, broadened: step !== asked, fromFallbackDeck: false };
    }
    // An aborted search must not cascade into four more requests.
    if (options.signal?.aborted) break;
  }

  return {
    pool: fallbackCandidates(asked),
    query: asked,
    broadened: false,
    fromFallbackDeck: true,
  };
}

/** A research run, including which query actually answered it. */
export interface ResearchResult {
  /** The dozen photos to show. */
  candidates: ImageCandidate[];
  /** The query that actually produced them. */
  query: string;
  /** True when `query` is a widened form of the one that was asked for. */
  broadened: boolean;
  /** True when the bundled nature deck answered instead of the network. */
  fromFallbackDeck: boolean;
}

/**
 * Candidates for the inline research block: a dozen photos, biased hard
 * towards ones never shown before.
 *
 * Everything returned is recorded as shown immediately, so the *next*
 * research — even if the user picks nothing — cannot repeat this set.
 *
 * This is the full form, which also reports WHICH query the photos belong to.
 * The research block needs that: when someone types their own criteria and
 * the grid quietly answers a widened version of it, saying so is the
 * difference between "this search is broken" and "there was nothing for that,
 * so here is the nearest thing".
 */
export async function researchImagesDetailed(
  query: string,
  options: ResearchOptions = {}
): Promise<ResearchResult> {
  const asked = (query || "").trim();
  const { pool, query: answered, broadened, fromFallbackDeck } =
    await searchImagePoolBroadened(asked, options);
  if (pool.length === 0) {
    return { candidates: [], query: asked, broadened: false, fromFallbackDeck: false };
  }

  const chosen = selectFreshCandidates(pool, VISIBLE_CANDIDATES);
  rememberShownAll(chosen.map((c) => c.url));
  return { candidates: chosen, query: answered, broadened, fromFallbackDeck };
}

/** The same research, for callers that only want the photos. */
export async function researchImages(
  query: string,
  options: ResearchOptions = {}
): Promise<ImageCandidate[]> {
  const { candidates } = await researchImagesDetailed(query, options);
  return candidates;
}

/**
 * A single photo the user has not seen, for the Replace button.
 * Returns null when the search produced nothing, so the caller can fall back
 * to its previous behaviour instead of blanking the scene.
 */
export async function replaceImage(
  query: string,
  options: ResearchOptions = {}
): Promise<ImageCandidate | null> {
  const { pool } = await searchImagePoolBroadened(query, options);
  if (pool.length === 0) return null;

  const pick = pickOneFreshCandidate(pool);
  if (pick) rememberShown(pick.url);
  return pick;
}
