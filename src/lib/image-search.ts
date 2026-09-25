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

export {
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
}

/** Build the proxied URL the rest of the app expects for an image. */
export function proxyImageUrl(url: string): string {
  return `${EDGE_FUNCTION_BASE}/proxy-image?url=${encodeURIComponent(url)}`;
}

/**
 * Ask the server for the candidate pool behind a query.
 *
 * Never throws: a failed search must leave the scene's existing photo alone
 * rather than clearing it, so callers get an empty pool and do nothing.
 */
async function fetchPool(
  query: string,
  options: ResearchOptions
): Promise<ImageCandidate[]> {
  const { headers = {}, queryParams = "", signal } = options;
  const q = (query || "").trim();
  if (!q) return [];

  try {
    const res = await fetch(
      `${EDGE_FUNCTION_BASE}/image-search?q=${encodeURIComponent(q)}` +
        `&count=${IMAGE_SEARCH_COUNT}${queryParams}`,
      { headers, signal }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.images) ? (data.images as ImageCandidate[]) : [];
  } catch {
    return [];
  }
}

/**
 * Candidates for the inline research block: a dozen photos, biased hard
 * towards ones never shown before.
 *
 * Everything returned is recorded as shown immediately, so the *next*
 * research — even if the user picks nothing — cannot repeat this set.
 */
export async function researchImages(
  query: string,
  options: ResearchOptions = {}
): Promise<ImageCandidate[]> {
  const pool = await fetchPool(query, options);
  if (pool.length === 0) return [];

  const chosen = selectFreshCandidates(pool, VISIBLE_CANDIDATES);
  rememberShownAll(chosen.map((c) => c.url));
  return chosen;
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
  const pool = await fetchPool(query, options);
  if (pool.length === 0) return null;

  const pick = pickOneFreshCandidate(pool);
  if (pick) rememberShown(pick.url);
  return pick;
}
