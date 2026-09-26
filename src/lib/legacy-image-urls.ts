/**
 * Legacy image-URL migration.
 *
 * Projects saved before the nature library was bundled locally carry image
 * URLs pointing at images.unsplash.com (either raw or wrapped in the image
 * proxy). Those hosts are unreachable in offline / restricted environments,
 * so a scene the user deliberately selected from the fallback library showed
 * a placeholder in the render while freshly selected scenes showed their
 * photo — the user's final selection must be the one that renders.
 *
 * Every one of those legacy URLs maps 1:1 onto a bundled 1920×1080 file in
 * /nature-library/, so the selection is preserved exactly — only its address
 * is healed. `normalizeSceneImageUrl` recognises both the raw and the proxied
 * form (with or without the later `h=1080` parameter — the photo id is the
 * key, not the query string).
 *
 * Pure and dependency-light (only image-picker's rawImageUrl) so it can be
 * unit-tested in plain Node and run anywhere — the loader, project
 * hydration, everywhere.
 */

import { rawImageUrl } from "./image-picker";

/** Legacy Unsplash photo id → bundled local file (same photo slot). */
const LEGACY_NATURE: Record<string, string> = {
  "photo-1464822759023-fed622ff2c3b": "/nature-library/mtn_sunrise.jpg", // Misty Alpine Sunrise
  "photo-1507525428034-b723cf961d3e": "/nature-library/ocean.jpg", // Calm Turquoise Ocean
  "photo-1448375240586-882707db888b": "/nature-library/forest.jpg", // Lush Sunlit Redwood Forest
  "photo-1506744038136-46273834b3fb": "/nature-library/sunset.jpg", // Radiant Golden Hour Clouds
  "photo-1470071459604-3b5ec3a7fe05": "/nature-library/lake.jpg", // Mirror Reflection Alpine Lake
  "photo-1432405972618-c60b0225b8f9": "/nature-library/waterfall.jpg", // Emerald Cascade Waterfall
  "photo-1500534314209-a25ddb2bd429": "/nature-library/hills.jpg", // Peaceful Misty Rolling Hills
  "photo-1506703719100-a0f3a48c0f86": "/nature-library/stars.jpg", // Deep Cosmos & Night Sky
};

/** Pull the Unsplash photo id out of any unsplash image URL, if present. */
function unsplashPhotoId(url: string): string | null {
  const m = String(url || "").match(/images\.unsplash\.com\/(photo-[a-z0-9-]+)/i);
  return m ? m[1] : null;
}

/**
 * Heals a scene image URL.
 *
 *  - a legacy nature-library URL (raw or proxied) → the bundled local file
 *  - anything else → returned unchanged (local paths, data:, blob:, other
 *    hosts all pass through untouched)
 */
export function normalizeSceneImageUrl(url: string | null | undefined): string {
  const raw = String(url || "").trim();
  if (!raw) return "";

  // Unwrap "/api/proxy-image?url=…" (or the Supabase form) first.
  const inner = raw.includes("proxy-image?url=") ? rawImageUrl(raw) : raw;
  const id = unsplashPhotoId(inner);
  if (id && LEGACY_NATURE[id]) return LEGACY_NATURE[id];

  return raw;
}

/** True when a scene list was changed by a migration pass (for logging). */
export function migrateSceneImageUrls<T extends { image_url?: string | null }>(scenes: readonly T[]): T[] {
  return scenes.map((s) =>
    s && s.image_url && normalizeSceneImageUrl(s.image_url) !== s.image_url
      ? { ...s, image_url: normalizeSceneImageUrl(s.image_url) }
      : s
  );
}
