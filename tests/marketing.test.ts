/**
 * The public website's honesty suite.
 *
 * The marketing site exists to demonstrate the product, which means it can
 * drift into fiction in a way the rest of the app cannot: a number typed into
 * a headline stays there long after the catalogue behind it changed. These
 * checks make that drift a test failure.
 *
 * What is guarded here:
 *   1. asset registry   — every visual declared, described and on disk
 *   2. truthful counts  — the numbers on the page vs the real catalogues
 *   3. visual sources   — only providers the server actually searches
 *   4. labelling        — "Coming soon" where nothing is built yet
 *   5. copy             — no guaranteed views, no viral promises
 *   6. structure        — the page tells the story in the specified order
 *   7. performance      — lazy images, code-split bundles, no heavy imports
 *   8. accessibility    — alt text, reduced motion, keyboard operation
 *   9. routing          — / is the website, /app is the studio
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";

import {
  MARKETING_ASSETS,
  MARKETING_ASSET_GROUPS,
  getAsset,
  type MarketingAssetGroup,
} from "../src/marketing/assets";
import {
  CATALOG_COUNTS,
  EFFECT_CATEGORIES,
  EXAMPLE_VIDEOS,
  LIVE_COUNTS,
  PLANS,
  VISUAL_SOURCES,
  WORKFLOW_STAGES,
  MESSAGES,
  HONESTY,
} from "../src/marketing/product-facts";
import { DEMO_SCENES, DEMO_SEARCH_RESULTS, DEMO_TOTAL_SECONDS } from "../src/marketing/demo-project";
import { normalizePath, routeForPath, sectionForPath, SITE_SECTION_PATHS } from "../src/lib/route";

import { CAPTION_STYLES } from "../src/data/caption-styles";
import { STUDIO_VOICE_PRESETS } from "../src/data/voice-presets";
import { VIDEO_FILTERS, FILTER_GROUPS } from "../src/data/video-filters";
import { TEXT_TEMPLATES } from "../src/data/text-templates";
import { CTA_PLATFORMS, CTA_GROUPS } from "../src/data/cta-library";
import { BACKGROUND_MUSIC_TRACKS, SOUND_LIBRARY } from "../src/data/media-library";
import { STICKER_LIBRARY, STICKER_GROUPS } from "../src/lib/sticker-3d";
import { CATALOG_ITEMS, SCENE_MOTIONS, STUDIO_CATEGORIES } from "../src/lib/video-studio-catalog";
import { TITLE_ANIMATIONS, STINGERS } from "../src/data/intro-outro";
import { TRANSITION_OPTIONS } from "../src/lib/scene-transition";

const h = createHarness();
const ok = h.ok;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const marketingDir = join(repoRoot, "src", "marketing");
const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, acc);
    else acc.push(full);
  }
  return acc;
};
const marketingFiles = collect(marketingDir).map((full) => ({
  name: full.slice(repoRoot.length + 1),
  text: readFileSync(full, "utf8"),
}));
const marketingSource = marketingFiles
  .filter((f) => /\.tsx?$/.test(f.name))
  .map((f) => f.text)
  .join("\n");

/** Source with comments removed — what a visitor can actually read. */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, " ");
const marketingCopy = stripComments(marketingSource);

ok(marketingFiles.length >= 20, `the website is built from ${marketingFiles.length} files`);

/* ------------------------------------------------- 1. asset registry */

const ids = MARKETING_ASSETS.map((a) => a.id);
h.eq(new Set(ids).size, ids.length, "asset ids are unique");

for (const asset of MARKETING_ASSETS) {
  // A wordmark's alt text is the word — everything else has to describe
  // what a visitor would otherwise see.
  const minAlt = asset.status === "brand" ? 4 : 25;
  ok(asset.alt.trim().length >= minAlt, `${asset.id}: alt text describes the visual (${asset.alt.length} chars)`);
  ok(!/^image of|^picture of/i.test(asset.alt), `${asset.id}: alt text does not start with "image of"`);
  ok(asset.width > 0 && asset.height > 0, `${asset.id}: intrinsic size reserves layout space`);
  ok(
    MARKETING_ASSET_GROUPS.includes(asset.group),
    `${asset.id}: belongs to a declared group (${asset.group})`
  );
  ok(Boolean(asset.note && asset.note.length > 5), `${asset.id}: notes what it is / where it is drawn`);

  if (asset.status === "concept" || asset.status === "screenshot" || asset.status === "brand") {
    ok(Boolean(asset.file), `${asset.id}: has a file`);
    for (const width of asset.widths ?? []) {
      const file = join(repoRoot, "public", "marketing", `${asset.file}-${width}.webp`);
      ok(existsSync(file), `${asset.id}: ${asset.file}-${width}.webp exists in public/marketing`);
    }
    ok((asset.widths ?? []).length >= 2, `${asset.id}: ships at least two responsive widths`);
  }
  if (asset.status === "rendered") {
    ok(!asset.file, `${asset.id}: drawn in code, so it has no bitmap`);
  }
}

// Every group named in the specification is represented.
for (const group of [
  "hero",
  "workflow",
  "scenes",
  "visual_research",
  "voice_over",
  "captions",
  "video_studio",
  "effects",
  "free_plan",
  "sceneflow",
  "sceneforge",
  "outputs",
  "examples",
] as MarketingAssetGroup[]) {
  ok(
    MARKETING_ASSETS.some((asset) => asset.group === group),
    `asset group "${group}" has at least one entry`
  );
}

// Nothing references an asset that does not exist.
for (const scene of DEMO_SCENES) {
  ok(Boolean(getAsset(scene.assetId)), `demo scene ${scene.number} points at a registered asset`);
}
for (const example of EXAMPLE_VIDEOS) {
  ok(Boolean(getAsset(example.assetId)), `example "${example.id}" points at a registered asset`);
}
for (const result of DEMO_SEARCH_RESULTS) {
  if (result.assetId) ok(Boolean(getAsset(result.assetId)), `search result "${result.label}" is registered`);
}

// Every optimised file on disk belongs to a registered asset (no orphans).
const publicMarketing = join(repoRoot, "public", "marketing");
if (existsSync(publicMarketing)) {
  const known = new Set(
    MARKETING_ASSETS.flatMap((asset) =>
      asset.file ? (asset.widths ?? []).map((w) => `${asset.file}-${w}.webp`) : []
    )
  );
  // The link-preview card is referenced by index.html, not by the registry.
  known.add("og-card.jpg");
  for (const file of readdirSync(publicMarketing)) {
    ok(known.has(file), `public/marketing/${file} belongs to a registered asset`);
    const bytes = statSync(join(publicMarketing, file)).size;
    ok(bytes < 400 * 1024, `public/marketing/${file} is web-weight (${Math.round(bytes / 1024)} KB)`);
  }
}

/* ----------------------------------------------- 2. truthful counts */

h.eq(LIVE_COUNTS.captionStyles, CAPTION_STYLES.length, "caption style count is live");
h.eq(LIVE_COUNTS.voices, STUDIO_VOICE_PRESETS.length, "narrator count is live");
h.eq(
  LIVE_COUNTS.maleVoices + LIVE_COUNTS.femaleVoices,
  STUDIO_VOICE_PRESETS.length,
  "narrator split adds up"
);
h.eq(LIVE_COUNTS.transitions, TRANSITION_OPTIONS.length, "transition count is live");

// These are written down rather than imported (the catalogues are heavy).
// If a catalogue grows, this is the failure that says "update the website".
h.eq(CATALOG_COUNTS.filters, VIDEO_FILTERS.length, "filter count matches src/data/video-filters.ts");
h.eq(CATALOG_COUNTS.filterGroups, FILTER_GROUPS.length, "filter group count matches");
h.eq(CATALOG_COUNTS.textTemplates, TEXT_TEMPLATES.length, "text template count matches");
h.eq(CATALOG_COUNTS.ctaPlatforms, CTA_PLATFORMS.length, "call-to-action count matches");
h.eq(CATALOG_COUNTS.ctaGroups, CTA_GROUPS.length, "call-to-action group count matches");
h.eq(CATALOG_COUNTS.stickers, STICKER_LIBRARY.length, "sticker count matches");
h.eq(CATALOG_COUNTS.stickerGroups, STICKER_GROUPS.length, "sticker group count matches");
h.eq(CATALOG_COUNTS.musicTracks, BACKGROUND_MUSIC_TRACKS.length, "music track count matches");
h.eq(CATALOG_COUNTS.soundEffects, SOUND_LIBRARY.length, "sound effect count matches");
h.eq(CATALOG_COUNTS.visualisers, CATALOG_ITEMS.audio_visualizers.length, "visualiser count matches");
h.eq(CATALOG_COUNTS.lowerThirds, CATALOG_ITEMS.lower_thirds.length, "lower third count matches");
h.eq(CATALOG_COUNTS.sceneMotions, SCENE_MOTIONS.length, "camera movement count matches");
h.eq(CATALOG_COUNTS.studioCategories, STUDIO_CATEGORIES.length, "studio category count matches");
h.eq(CATALOG_COUNTS.titleAnimations, TITLE_ANIMATIONS.length, "title animation count matches");
h.eq(CATALOG_COUNTS.stingers, STINGERS.length, "stinger count matches");
h.eq(
  CATALOG_COUNTS.introClips,
  readdirSync(join(repoRoot, "public", "videos", "intros")).filter((f) => f.endsWith(".mp4")).length,
  "intro clip count matches public/videos/intros"
);
h.eq(
  CATALOG_COUNTS.outroClips,
  readdirSync(join(repoRoot, "public", "videos", "outros")).filter((f) => f.endsWith(".mp4")).length,
  "outro clip count matches public/videos/outros"
);

/* ---------------------------------------------- 3. visual sources */

const server = read("server.ts");
h.eq(VISUAL_SOURCES.length, 4, "four visual sources are described");
for (const source of VISUAL_SOURCES) {
  const needle =
    source.id === "nature-library" ? "NATURE_FALLBACKS" : source.id === "wikimedia" ? "searchWikimedia" : `search${source.name}`;
  ok(server.includes(needle), `${source.name} is really searched by server.ts (${needle})`);
}
// Search order on the page must be the server's order.
const order = ["searchPexels", "searchPixabay", "searchWikimedia", "NATURE_FALLBACKS"].map((needle) =>
  server.indexOf(needle, server.indexOf("const handleImageSearch"))
);
ok(
  order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])),
  "the website lists the sources in the order the server tries them"
);
// No provider logos are used anywhere.
ok(
  !/pexels\.(png|svg|jpg)|pixabay\.(png|svg|jpg)|wikimedia.*logo/i.test(marketingSource),
  "no provider logos are shipped — names only"
);

/* -------------------------------------------------- 4. labelling */

for (const category of EFFECT_CATEGORIES) {
  for (const item of category.items) {
    ok(item.status === "live" || item.status === "soon", `${item.name}: has an explicit status`);
    if (item.status === "live" && typeof item.count === "number") {
      ok(item.count > 0, `${item.name}: a live feature with a count has a real one`);
    }
  }
}
ok(
  EFFECT_CATEGORIES.some((c) => c.items.some((i) => i.status === "soon")),
  "planned features are marked rather than quietly dropped"
);
ok(
  read("src/marketing/sections/EffectsLibrary.tsx").includes("<ComingSoon />"),
  "the effects section renders the Coming soon badge"
);
ok(
  read("src/marketing/sections/Pricing.tsx").includes("<ComingSoon />"),
  "unreleased plans render the Coming soon badge"
);
ok(
  PLANS.filter((p) => p.availability === "live").length === 1,
  "exactly one plan is presented as available today"
);
h.eq(PLANS[0].id, "free", "the available plan is Free");
for (const plan of PLANS) {
  ok(!/\$|€|£|\d+\s*(?:\/|per)\s*month/i.test(plan.priceLabel + plan.priceNote), `${plan.name}: invents no price`);
}
ok(
  read("src/marketing/sections/Pricing.tsx").includes("HONESTY.planLabel"),
  "the pricing section states that billing is not live"
);
// Demonstration content is labelled as such wherever an example is shown.
for (const section of ["Examples", "BeforeAfter"]) {
  ok(
    read(`src/marketing/sections/${section}.tsx`).includes("HONESTY.demoLabel"),
    `${section} labels its example content`
  );
}

/* ------------------------------------------------------- 5. copy */

const BANNED = [
  "guaranteed",
  "guarantee",
  "go viral",
  "viral video",
  "instant success",
  "overnight",
  "10x your",
  "millions of views",
  "get rich",
];
for (const phrase of BANNED) {
  const hit = new RegExp(phrase, "i").test(marketingCopy);
  ok(!hit, `no exaggerated claim: "${phrase}"`);
}
// The short messages the specification asks for are actually on the page.
for (const key of ["hero", "scenes", "visuals", "voice", "captions", "studio", "render", "control"] as const) {
  ok(MESSAGES[key].length > 8 && MESSAGES[key].endsWith("."), `message "${key}" is a short, finished sentence`);
}
ok(marketingSource.includes("MESSAGES.hero"), "the hero message is used, not retyped");
ok(HONESTY.localNote.includes("own machine"), "the page says where projects live");

/* -------------------------------------------------- 6. structure */

const site = read("src/marketing/MarketingSite.tsx");
const STORY = [
  "Hero",
  "IdeaToVideo",
  "ScenesSection",
  "VisualResearch",
  "VoiceSection",
  "CaptionsSection",
  "VideoStudioSection",
  "EffectsLibrary",
  "BeforeAfter",
  "Control",
  "Examples",
  "Formats",
  "Devices",
  "Sources",
  "Pricing",
  "FinalCta",
];
let cursor = -1;
for (const section of STORY) {
  const at = site.indexOf(`<${section} />`);
  ok(at > cursor, `${section} appears in story order`);
  cursor = at;
}
h.eq(WORKFLOW_STAGES.length, 7, "the workflow has seven stages");
WORKFLOW_STAGES.forEach((stage, index) => {
  h.eq(stage.number, String(index + 1).padStart(2, "0"), `stage ${index + 1} is numbered ${stage.number}`);
  ok(stage.message.length > 10, `stage ${stage.number} carries a message`);
  ok(stage.thought.length > 5, `stage ${stage.number} carries the visitor's thought`);
});
h.eq(EXAMPLE_VIDEOS.length, 8, "eight example categories");
for (const category of [
  "Travel",
  "Education",
  "Inspiration",
  "Storytelling",
  "Business",
  "Training",
  "Information",
  "Social Media",
]) {
  ok(
    EXAMPLE_VIDEOS.some((example) => example.category === category),
    `example category "${category}" is present`
  );
}
// The demonstration project is coherent.
h.eq(DEMO_SCENES.length, 5, "the demonstration project has five scenes");
ok(DEMO_TOTAL_SECONDS > 30 && DEMO_TOTAL_SECONDS < 90, `demo runtime is believable (${DEMO_TOTAL_SECONDS}s)`);
const durations = DEMO_SCENES.map((s) => s.duration);
ok(new Set(durations).size === durations.length, "no two scenes share a duration — there is no fixed interval");
ok(
  DEMO_SCENES.some((scene) => scene.text.includes("Ancient cities developed around reliable sources of water")),
  "the specification's example scene is used verbatim"
);

/* ----------------------------------------------- 7. performance */

const main = read("src/main.tsx");
ok(main.includes("lazy(() => import(\"./marketing/MarketingSite\"))"), "the website is code-split");
ok(main.includes("lazy(() => import(\"./App\"))"), "the studio is code-split");
ok(
  read("src/marketing/components/primitives.tsx").includes('loading={eager ? "eager" : "lazy"}'),
  "images lazy-load unless explicitly eager"
);
ok(
  read("src/marketing/components/primitives.tsx").includes('decoding="async"'),
  "images decode asynchronously"
);
ok(read("src/marketing/components/primitives.tsx").includes("srcSet"), "images ship a srcset");
ok(read("src/marketing/components/primitives.tsx").includes("sizes"), "images ship sizes hints");
// The marketing chunk must not drag the studio's heavy catalogues in with it.
const HEAVY = [
  "lib/sticker-3d",
  "lib/video-studio-catalog",
  "data/media-library",
  "data/cta-library",
  "data/text-templates",
  "data/video-filters",
  "lib/offline-export",
  "lib/render-",
];
for (const { name, text } of marketingFiles) {
  if (!/\.tsx?$/.test(name)) continue;
  for (const heavy of HEAVY) {
    ok(!text.includes(`from "../../${heavy}`) && !text.includes(`from "../${heavy}`), `${name}: does not import ${heavy}`);
  }
}
// Only the marketing entry pulls the stylesheet, so the studio never loads it.
const cssImporters = marketingFiles.filter((f) => f.text.includes('"./marketing.css"') || f.text.includes("marketing.css"));
h.eq(cssImporters.length, 1, "exactly one module imports marketing.css");

/* --------------------------------------------- 8. accessibility */

const css = read("src/marketing/marketing.css");
ok(css.includes("@media (prefers-reduced-motion: reduce)"), "the stylesheet honours reduced motion");
ok(
  /prefers-reduced-motion: reduce\)[\s\S]{0,900}animation-duration: 0\.001ms/.test(css),
  "reduced motion stops animations"
);
ok(
  /\.mkt-stage,\s*\n\s*\.mkt-soft \{\s*\n\s*opacity: 1 !important/.test(css),
  "reduced motion reveals every staged element"
);
ok(read("src/marketing/hooks.ts").includes("usePrefersReducedMotion"), "the motion hook exists");
ok(
  read("src/marketing/hooks.ts").includes("if (reduced) {"),
  "sequences start on their finished state under reduced motion"
);
ok(read("src/marketing/hooks.ts").includes("useRovingTabs"), "tablists support arrow-key navigation");
ok(site.includes("mkt-skip"), "there is a skip link");
ok(site.includes('aria-label="Main"'), "the nav is labelled");
for (const { name, text } of marketingFiles) {
  if (!/sections\/.*\.tsx$/.test(name)) continue;
  ok(/role="tablist"|<Section/.test(text), `${name}: renders a landmark section`);
  ok(!/<img(?![^>]*alt=)/.test(text), `${name}: no <img> without alt`);
}
// every tablist declares an accessible name
const tablists = marketingSource.match(/role="tablist"[^>]*/g) ?? [];
for (const tablist of tablists) {
  ok(/aria-label=/.test(tablist), `tablist is named: ${tablist.slice(0, 60)}`);
}

/* --------------------------------------------------- 9. routing */

h.eq(routeForPath("/"), "site", "/ is the website");
h.eq(routeForPath(""), "site", "empty path is the website");
h.eq(routeForPath("/app"), "studio", "/app is the studio");
h.eq(routeForPath("/app/"), "studio", "/app/ is the studio");
h.eq(routeForPath("/app/project/7"), "studio", "deep studio paths stay in the studio");
h.eq(routeForPath("/pricing"), "site", "marketing paths stay on the website");
h.eq(normalizePath("/Pricing/"), "/pricing", "paths normalise");
h.eq(sectionForPath("/pricing"), "pricing", "/pricing deep-links to the pricing section");
h.eq(sectionForPath("/nope"), null, "unknown paths have no section");
for (const [path, section] of Object.entries(SITE_SECTION_PATHS)) {
  ok(site.includes(`<${section}`) || marketingSource.includes(`id="${section}"`), `${path} points at a real section`);
}
ok(read("src/App.tsx").includes("navigate(SITE_PATH)"), "the studio links back to the website");

h.done("marketing");
