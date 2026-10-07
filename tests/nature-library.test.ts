import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import {
  NATURE_CATEGORIES,
  NATURE_DECK_ON_SCREEN,
  NATURE_FALLBACKS,
  natureBackgroundsFor,
} from "../src/data/nature-fallbacks";
import { resolveLegacyLocalImage } from "../src/lib/nature-library-compat";
import { is16x9Aspect, meetsFullHd } from "../src/lib/image-candidates";

/**
 * The bundled nature library.
 *
 * An earlier build pointed the deck at the website's marketing artwork while
 * keeping the nature names: "Lush Sunlit Redwood Forest" served the Scenering
 * logo, "Deep Cosmos & Night Sky" served a sunlit ancient city, and the
 * alpine-lake photo was filed under Waterfalls. Every check here exists so
 * that cannot happen again silently — the files must live in the library
 * folder, be the right shape and size, and be filed under a category their
 * own name supports.
 */
const h = createHarness();

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicPath = (url: string) => join(repoRoot, "public", url);

/** Width and height from a WebP file header (VP8, VP8L and VP8X forms). */
function webpSize(file: string): { width: number; height: number } | null {
  const buf = readFileSync(file);
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    // Key frame: 3-byte tag, 3-byte start code 9d 01 2a, then 14-bit sizes.
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return { width: (buf.readUIntLE(24, 3) & 0xffffff) + 1, height: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
  }
  return null;
}

// ------------------------------------------------------------- deck contents
h.ok(
  NATURE_FALLBACKS.length >= NATURE_DECK_ON_SCREEN,
  `the library holds at least the ${NATURE_DECK_ON_SCREEN} photos a drawer shows (has ${NATURE_FALLBACKS.length})`
);
h.ok(
  NATURE_FALLBACKS.length > NATURE_DECK_ON_SCREEN,
  "the library is deeper than one screenful, so two opens can differ"
);

const ids = new Set<string>();
const urls = new Set<string>();
for (const bg of NATURE_FALLBACKS) {
  h.ok(!ids.has(bg.id), `${bg.id} is a unique id`);
  ids.add(bg.id);
  h.ok(!urls.has(bg.url), `${bg.id} is a unique photo`);
  urls.add(bg.url);
  h.ok(bg.name.trim().length > 2, `${bg.id} has a readable name`);
}

// ------------------------------------------------- the files are really there
for (const bg of NATURE_FALLBACKS) {
  for (const [label, url, expected] of [
    ["full size", bg.url, { width: 1920, height: 1080 }],
    ["thumbnail", bg.thumb, { width: 640, height: 360 }],
  ] as const) {
    h.ok(url.startsWith("/nature/"), `${bg.id} ${label} is served from the library folder`);
    const file = publicPath(url);
    h.ok(existsSync(file), `${bg.id} ${label} exists in public assets`);
    if (!existsSync(file)) continue;
    h.ok(statSync(file).size > 4096, `${bg.id} ${label} is a real image, not a stub`);
    const size = webpSize(file);
    h.ok(size !== null, `${bg.id} ${label} is a readable WebP`);
    if (!size) continue;
    h.eq(size.width, expected.width, `${bg.id} ${label} is ${expected.width}px wide`);
    h.eq(size.height, expected.height, `${bg.id} ${label} is ${expected.height}px tall`);
    h.ok(is16x9Aspect(size.width, size.height), `${bg.id} ${label} is 16:9`);
  }
  const full = webpSize(publicPath(bg.url));
  if (full) {
    h.ok(
      meetsFullHd(full.width, full.height),
      `${bg.id} renders at 1080p without upscaling — the rule stock photos are held to`
    );
  }
}

// ----------------------------------------- the artwork is not borrowed from elsewhere
for (const bg of NATURE_FALLBACKS) {
  h.ok(
    !bg.url.includes("/marketing/") && !bg.thumb.includes("/marketing/"),
    `${bg.id} is a library photo, not website artwork`
  );
  h.ok(
    !/^https?:/i.test(bg.url),
    `${bg.id} is same-origin, so it still works with no network`
  );
}

// ------------------------------------------- the name agrees with the category
/** Words that justify filing a photo under each criteria. */
const CATEGORY_WORDS: Record<string, string[]> = {
  mountains: ["mountain", "alpine", "peak", "summit", "ridge", "winter", "snow"],
  ocean: ["ocean", "sea", "coast", "cliff", "lagoon", "beach", "island", "shore", "atlantic"],
  forest: ["forest", "woodland", "wood", "tree", "redwood", "bamboo", "grove", "jungle"],
  sky: ["sky", "cloud", "sunset", "cosmos", "star", "aurora", "storm", "night", "hour"],
  waterfall: ["waterfall", "falls", "cascade", "river"],
  peaceful: ["peaceful", "calm", "still", "meadow", "hill", "wildflower"],
};
for (const bg of NATURE_FALLBACKS) {
  const words = CATEGORY_WORDS[bg.category] || [];
  const name = bg.name.toLowerCase();
  h.ok(
    words.some((word) => name.includes(word)),
    `"${bg.name}" is filed under ${bg.category} and its name says so`
  );
  const file = bg.url.toLowerCase();
  h.ok(
    file.includes(bg.id.split("_")[0]) || bg.id.split("_").every((part) => file.includes(part)),
    `${bg.id} points at a file named after itself, not at some other picture`
  );
}

// ------------------------------------------------- every criteria has a floor
for (const cat of NATURE_CATEGORIES) {
  const inCategory = natureBackgroundsFor(cat.id);
  h.ok(inCategory.length > 0, `the ${cat.label} criteria has at least one bundled photo`);
  if (cat.id === "all") {
    h.eq(inCategory.length, NATURE_FALLBACKS.length, "All keeps the whole library");
  } else {
    h.ok(
      inCategory.every((bg) => bg.category === cat.id),
      `the ${cat.label} criteria returns only its own photos`
    );
  }
}

// ------------------------------------------------------- old scenes still open
const legacyUrls = [
  "/nature-library/forest.jpg",
  "/nature-library/stars.jpg",
  "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=80",
  "/marketing/hero-showpiece-1024.webp",
  "/marketing/scene-02-ancient-city-1280.webp",
];
for (const url of legacyUrls) {
  const resolved = resolveLegacyLocalImage(url);
  h.ok(resolved !== url, `a scene saved with ${url} is remapped`);
  h.ok(resolved.startsWith("/nature/"), `${url} now resolves into the bundled library`);
  h.ok(existsSync(publicPath(resolved)), `${url} resolves to a file that exists`);
}
h.eq(
  resolveLegacyLocalImage("/marketing/scene-03-aqueduct-1280.webp"),
  "/marketing/scene-03-aqueduct-1280.webp",
  "marketing artwork the deck never used is left alone"
);
h.eq(
  resolveLegacyLocalImage("https://images.pexels.com/photos/1/a.jpg"),
  "https://images.pexels.com/photos/1/a.jpg",
  "a searched photo passes through untouched"
);

// --------------------------------------------------- the drawer shows ten
const editor = readFileSync(join(repoRoot, "src/components/SceneEditor.tsx"), "utf8");
// Twelve, not ten: the shelf is two across on phones and four across on
// desktop, and twelve divides evenly by both — ten left two empty cells.
h.eq(NATURE_DECK_ON_SCREEN, 12, "the drawer shows twelve bundled photos at a time");
h.ok(
  editor.includes("pickRandomSample(NATURE_FALLBACKS, NATURE_DECK_ON_SCREEN)"),
  "the drawer draws its ten from the whole library, in a fresh order"
);
h.ok(
  editor.includes("natureDeckResults("),
  "an offline search fills the results row from the bundled library"
);
h.ok(
  editor.includes("found.candidates.slice(0, NATURE_DECK_ON_SCREEN)"),
  "a live search shows the same number of fresh photos as bundled ones"
);
h.ok(
  editor.includes('natureOffline ? "Offline library" : "Fresh from search"'),
  "the results row says whether it is live or the bundled library"
);

h.done("nature-library");
