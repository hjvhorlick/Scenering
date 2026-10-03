export type NatureCategory =
  | "mountains"
  | "ocean"
  | "forest"
  | "sky"
  | "waterfall"
  | "peaceful";

export interface NatureBackground {
  id: string;
  name: string;
  category: NatureCategory;
  url: string;
  thumb: string;
}

/**
 * The criteria you can pick in the Nature Fallback drawer.
 *
 * Each one is two things at once: a filter over the bundled deck below, and a
 * real search query. Choosing "Waterfalls" used to show only the two bundled
 * waterfall photos and nothing else, forever — the same two on every project.
 * It now also searches for that criteria, so the drawer fills with fresh
 * waterfalls and the bundled pair are the floor under it rather than the
 * whole offering.
 *
 * The queries are deliberately plain nouns. The search ladder in
 * `broadenQuery` widens from there if a term comes back empty, and plain
 * nouns are what the stock libraries index best.
 */
export interface NatureCategoryDef {
  id: NatureCategory | "all";
  label: string;
  /** What the live search asks for when this criteria is chosen. */
  query: string;
}

export const NATURE_CATEGORIES: NatureCategoryDef[] = [
  { id: "all", label: "All nature", query: "nature landscape" },
  { id: "mountains", label: "Mountains", query: "mountain landscape" },
  { id: "ocean", label: "Ocean", query: "ocean waves sea" },
  { id: "forest", label: "Forest", query: "forest trees" },
  { id: "sky", label: "Sky & space", query: "sky clouds sunset" },
  { id: "waterfall", label: "Waterfalls", query: "waterfall river" },
  { id: "peaceful", label: "Peaceful", query: "peaceful calm landscape" },
];

/** The search query behind a criteria, falling back to a sane default. */
export function natureCategoryQuery(id: NatureCategory | "all"): string {
  return NATURE_CATEGORIES.find((c) => c.id === id)?.query || "nature landscape";
}

/** The bundled photos for a criteria. "all" keeps the whole deck. */
export function natureBackgroundsFor(
  id: NatureCategory | "all",
  deck: NatureBackground[] = NATURE_FALLBACKS
): NatureBackground[] {
  return id === "all" ? [...deck] : deck.filter((bg) => bg.category === id);
}

export const NATURE_FALLBACKS: NatureBackground[] = [
  {
    id: "mountain_sunrise",
    name: "Misty Alpine Sunrise",
    category: "mountains",
    url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&h=1080&q=80",
    thumb: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=480&h=270&q=60",
  },
  {
    id: "serene_ocean",
    name: "Calm Turquoise Ocean",
    category: "ocean",
    url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&h=1080&q=80",
    thumb: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=480&h=270&q=60",
  },
  {
    id: "lush_forest",
    name: "Lush Sunlit Redwood Forest",
    category: "forest",
    url: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&h=1080&q=80",
    thumb: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=480&h=270&q=60",
  },
  {
    id: "golden_sunset",
    name: "Radiant Golden Hour Clouds",
    category: "sky",
    url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1920&h=1080&q=80",
    thumb: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=480&h=270&q=60",
  },
  {
    id: "mountain_lake",
    name: "Mirror Reflection Alpine Lake",
    category: "waterfall",
    url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&h=1080&q=80",
    thumb: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=480&h=270&q=60",
  },
  {
    id: "gentle_waterfall",
    name: "Emerald Cascade Waterfall",
    category: "waterfall",
    url: "https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=1920&h=1080&q=80",
    thumb: "https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=480&h=270&q=60",
  },
  {
    id: "rolling_hills",
    name: "Peaceful Misty Rolling Hills",
    category: "peaceful",
    url: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1920&h=1080&q=80",
    thumb: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=480&h=270&q=60",
  },
  {
    id: "starry_sky",
    name: "Deep Cosmos & Night Sky",
    category: "sky",
    url: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1920&h=1080&q=80",
    thumb: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=480&h=270&q=60",
  },
];
