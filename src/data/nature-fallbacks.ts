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
 * waterfalls and the bundled ones are the floor under it rather than the
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

/**
 * How many bundled photos the drawer puts on screen at once.
 *
 * The deck is deliberately deeper than this: a fixed ten would be the same
 * ten on every project, which is what the drawer looked like before. Ten are
 * drawn from the deck each time it opens, so the shelf stays a tidy size
 * while the library behind it has enough variety to look different on the
 * next open.
 */
export const NATURE_DECK_ON_SCREEN = 10;

/**
 * The bundled nature library.
 *
 * Every entry is a same-origin file under /nature/ at exactly 1920×1080
 * (16:9), with a 640×360 thumbnail beside it — the same shape and resolution
 * rule the stock providers are held to, so a library photo renders at 1080p
 * without upscaling and crops identically to a searched one.
 *
 * Rebuild the files from `assets-src/nature/` with `npm run nature:assets`.
 *
 * These photos must match their own names. An earlier build pointed the deck
 * at the website's marketing artwork: "Lush Sunlit Redwood Forest" served the
 * Scenering logo, "Deep Cosmos & Night Sky" served a sunlit ancient city, and
 * "Mirror Reflection Alpine Lake" was filed under Waterfalls. Nothing in the
 * drawer was what it said it was. If you change a URL here, open the file and
 * look at it.
 */
export const NATURE_FALLBACKS: NatureBackground[] = [
  {
    id: "mountain_sunrise",
    name: "Misty Alpine Sunrise",
    category: "mountains",
    url: "/nature/mountain-sunrise-1920.webp",
    thumb: "/nature/mountain-sunrise-640.webp",
  },
  {
    id: "mountain_lake",
    name: "Mirror Reflection Alpine Lake",
    category: "mountains",
    url: "/nature/mountain-lake-1920.webp",
    thumb: "/nature/mountain-lake-640.webp",
  },
  {
    id: "winter_peaks",
    name: "Snowbound Winter Peaks",
    category: "mountains",
    url: "/nature/winter-peaks-1920.webp",
    thumb: "/nature/winter-peaks-640.webp",
  },
  {
    id: "serene_ocean",
    name: "Calm Turquoise Ocean",
    category: "ocean",
    url: "/nature/serene-ocean-1920.webp",
    thumb: "/nature/serene-ocean-640.webp",
  },
  {
    id: "coastal_cliffs",
    name: "Wild Atlantic Sea Cliffs",
    category: "ocean",
    url: "/nature/coastal-cliffs-1920.webp",
    thumb: "/nature/coastal-cliffs-640.webp",
  },
  {
    id: "tropical_lagoon",
    name: "Turquoise Island Lagoon",
    category: "ocean",
    url: "/nature/tropical-lagoon-1920.webp",
    thumb: "/nature/tropical-lagoon-640.webp",
  },
  {
    id: "lush_forest",
    name: "Lush Sunlit Redwood Forest",
    category: "forest",
    url: "/nature/lush-forest-1920.webp",
    thumb: "/nature/lush-forest-640.webp",
  },
  {
    id: "autumn_forest",
    name: "Golden Autumn Woodland",
    category: "forest",
    url: "/nature/autumn-forest-1920.webp",
    thumb: "/nature/autumn-forest-640.webp",
  },
  {
    id: "bamboo_forest",
    name: "Green Bamboo Grove",
    category: "forest",
    url: "/nature/bamboo-forest-1920.webp",
    thumb: "/nature/bamboo-forest-640.webp",
  },
  {
    id: "golden_sunset",
    name: "Radiant Golden Hour Clouds",
    category: "sky",
    url: "/nature/golden-sunset-1920.webp",
    thumb: "/nature/golden-sunset-640.webp",
  },
  {
    id: "starry_sky",
    name: "Deep Cosmos & Night Sky",
    category: "sky",
    url: "/nature/starry-sky-1920.webp",
    thumb: "/nature/starry-sky-640.webp",
  },
  {
    id: "northern_lights",
    name: "Aurora Over a Still Lake",
    category: "sky",
    url: "/nature/northern-lights-1920.webp",
    thumb: "/nature/northern-lights-640.webp",
  },
  {
    id: "storm_clouds",
    name: "Towering Storm Over the Plains",
    category: "sky",
    url: "/nature/storm-clouds-1920.webp",
    thumb: "/nature/storm-clouds-640.webp",
  },
  {
    id: "gentle_waterfall",
    name: "Emerald Cascade Waterfall",
    category: "waterfall",
    url: "/nature/gentle-waterfall-1920.webp",
    thumb: "/nature/gentle-waterfall-640.webp",
  },
  {
    id: "jungle_falls",
    name: "Tropical Rainforest Falls",
    category: "waterfall",
    url: "/nature/jungle-falls-1920.webp",
    thumb: "/nature/jungle-falls-640.webp",
  },
  {
    id: "canyon_cascade",
    name: "Red Canyon River Cascade",
    category: "waterfall",
    url: "/nature/canyon-cascade-1920.webp",
    thumb: "/nature/canyon-cascade-640.webp",
  },
  {
    id: "rolling_hills",
    name: "Peaceful Misty Rolling Hills",
    category: "peaceful",
    url: "/nature/rolling-hills-1920.webp",
    thumb: "/nature/rolling-hills-640.webp",
  },
  {
    id: "wildflower_meadow",
    name: "Alpine Wildflower Meadow",
    category: "peaceful",
    url: "/nature/wildflower-meadow-1920.webp",
    thumb: "/nature/wildflower-meadow-640.webp",
  },
];
