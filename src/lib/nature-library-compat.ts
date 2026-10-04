/**
 * Compatibility map for earlier fallback libraries.
 *
 * The bundled nature library has changed address three times, and a scene
 * saves the URL it was given. Without a map, every project made before a
 * change opens with holes in it.
 *
 *   1. `/nature-library/*.jpg`  — an interim local build that was reverted.
 *   2. `images.unsplash.com/*`  — hotlinked originals, which depend on a
 *                                 third-party CDN being reachable.
 *   3. `/marketing/*.webp`      — the website's artwork, pressed into service
 *                                 as the deck. Those files were never nature
 *                                 photos: the "forest" entry was the Scenering
 *                                 logo and the "night sky" entry a sunlit
 *                                 ancient city.
 *
 * All three now resolve to the photo in `/nature/` that stands for the same
 * subject, so an old scene keeps a sensible picture instead of a dead link —
 * and, in the marketing case, gets the photograph its label always claimed.
 *
 * Display-time only: scene data is never rewritten.
 */

const NATURE = (id: string) => `/nature/${id}-1920.webp`;

const LEGACY_TO_CURRENT: Record<string, string> = {
  // 1. The interim /nature-library/ build.
  "/nature-library/mtn_sunrise.jpg": NATURE("mountain-sunrise"),
  "/nature-library/ocean.jpg": NATURE("serene-ocean"),
  "/nature-library/forest.jpg": NATURE("lush-forest"),
  "/nature-library/sunset.jpg": NATURE("golden-sunset"),
  "/nature-library/lake.jpg": NATURE("mountain-lake"),
  "/nature-library/waterfall.jpg": NATURE("gentle-waterfall"),
  "/nature-library/hills.jpg": NATURE("rolling-hills"),
  "/nature-library/stars.jpg": NATURE("starry-sky"),

  // 2. The hotlinked Unsplash originals.
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80":
    NATURE("mountain-sunrise"),
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80":
    NATURE("serene-ocean"),
  "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=80":
    NATURE("lush-forest"),
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1920&q=80":
    NATURE("golden-sunset"),
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=80":
    NATURE("mountain-lake"),
  "https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=1920&q=80":
    NATURE("gentle-waterfall"),
  "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1920&q=80":
    NATURE("rolling-hills"),
  "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1920&q=80":
    NATURE("starry-sky"),

  // 3. The marketing artwork that stood in for the deck. Only the entries the
  //    deck actually used are mapped — a marketing image chosen anywhere else
  //    is left exactly as it is.
  "/marketing/scene-01-river-dawn-1280.webp": NATURE("mountain-sunrise"),
  "/marketing/scene-05-harbour-1280.webp": NATURE("serene-ocean"),
  "/marketing/hero-showpiece-1024.webp": NATURE("lush-forest"),
  "/marketing/example-travel-1280.webp": NATURE("golden-sunset"),
  "/marketing/search-02-canal-1280.webp": NATURE("mountain-lake"),
  "/marketing/search-01-well-1280.webp": NATURE("gentle-waterfall"),
  "/marketing/search-03-oasis-1280.webp": NATURE("rolling-hills"),
  "/marketing/scene-02-ancient-city-1280.webp": NATURE("starry-sky"),
};

/** A URL from any earlier fallback library → the photo that replaced it. */
export function resolveLegacyLocalImage(url: string): string {
  return LEGACY_TO_CURRENT[String(url || "").trim()] ?? url;
}
