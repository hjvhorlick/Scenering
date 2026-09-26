/**
 * Compatibility map for the interim local nature library.
 *
 * For a short period the fallback library served bundled local files from
 * /nature-library/. That build was reverted — the library is the original
 * one again — but scenes saved during that period carry /nature-library/
 * paths that no longer exist. This maps each of those paths back to the
 * ORIGINAL library photo it stood in for, so the user's selected images
 * load again — in the editor, the preview and the render.
 *
 * Display-time only: scene data is never rewritten.
 */

const LOCAL_TO_ORIGINAL: Record<string, string> = {
  "/nature-library/mtn_sunrise.jpg":
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80",
  "/nature-library/ocean.jpg":
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80",
  "/nature-library/forest.jpg":
    "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=80",
  "/nature-library/sunset.jpg":
    "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1920&q=80",
  "/nature-library/lake.jpg":
    "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=80",
  "/nature-library/waterfall.jpg":
    "https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=1920&q=80",
  "/nature-library/hills.jpg":
    "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1920&q=80",
  "/nature-library/stars.jpg":
    "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1920&q=80",
};

/** A /nature-library/ path from the interim build → the original photo URL. */
export function resolveLegacyLocalImage(url: string): string {
  return LOCAL_TO_ORIGINAL[String(url || "").trim()] ?? url;
}
