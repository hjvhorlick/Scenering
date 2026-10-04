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
    url: "/marketing/scene-01-river-dawn-1280.webp",
    thumb: "/marketing/scene-01-river-dawn-640.webp",
  },
  {
    id: "serene_ocean",
    name: "Calm Turquoise Ocean",
    category: "ocean",
    url: "/marketing/scene-05-harbour-1280.webp",
    thumb: "/marketing/scene-05-harbour-640.webp",
  },
  {
    id: "lush_forest",
    name: "Lush Sunlit Redwood Forest",
    category: "forest",
    url: "/marketing/hero-showpiece-1024.webp",
    thumb: "/marketing/hero-showpiece-512.webp",
  },
  {
    id: "golden_sunset",
    name: "Radiant Golden Hour Clouds",
    category: "sky",
    url: "/marketing/example-travel-1280.webp",
    thumb: "/marketing/example-travel-640.webp",
  },
  {
    id: "mountain_lake",
    name: "Mirror Reflection Alpine Lake",
    category: "waterfall",
    url: "/marketing/search-02-canal-1280.webp",
    thumb: "/marketing/search-02-canal-640.webp",
  },
  {
    id: "gentle_waterfall",
    name: "Emerald Cascade Waterfall",
    category: "waterfall",
    url: "/marketing/search-01-well-1280.webp",
    thumb: "/marketing/search-01-well-640.webp",
  },
  {
    id: "rolling_hills",
    name: "Peaceful Misty Rolling Hills",
    category: "peaceful",
    url: "/marketing/search-03-oasis-1280.webp",
    thumb: "/marketing/search-03-oasis-640.webp",
  },
  {
    id: "starry_sky",
    name: "Deep Cosmos & Night Sky",
    category: "sky",
    url: "/marketing/scene-02-ancient-city-1280.webp",
    thumb: "/marketing/scene-02-ancient-city-640.webp",
  },
];
