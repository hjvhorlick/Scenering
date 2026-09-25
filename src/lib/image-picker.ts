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
