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
import {
  DEMO_SCENES,
  DEMO_SEARCH_RESULTS,
  DEMO_TIMELINE_EXTRAS,
  DEMO_TOTAL_SECONDS,
} from "../src/marketing/demo-project";
import { normalizePath, routeForPath, sectionForPath, SITE_SECTION_PATHS } from "../src/lib/route";

import { CAPTION_STYLES } from "../src/data/caption-styles";
import { STUDIO_VOICE_PRESETS } from "../src/data/voice-presets";
import { VIDEO_FILTERS, FILTER_GROUPS, getFilterCss, makeFilterConfig } from "../src/data/video-filters";
import { TEXT_TEMPLATES, TEMPLATE_BY_ID } from "../src/data/text-templates";
import { CTA_PLATFORMS, CTA_GROUPS } from "../src/data/cta-library";
import { BACKGROUND_MUSIC_TRACKS, SOUND_LIBRARY } from "../src/data/media-library";
import { STICKER_LIBRARY, STICKER_GROUPS, STICKER_BY_ID } from "../src/lib/sticker-3d";
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

/* ------------------------- 6b. the demonstration names real things */

/*
 * The mockups name a filter, a transition, a music bed, a sound effect, a
 * sticker, a badge and a lower third. Every one of them has to be a real
 * entry in the app's catalogue, under the name the app gives it — otherwise
 * the website is advertising an effect nobody can find.
 */
{
  const extras = DEMO_TIMELINE_EXTRAS;

  const filter = VIDEO_FILTERS.find((f) => f.id === extras.filter.id);
  ok(Boolean(filter), `the demonstration grade "${extras.filter.id}" is a real filter`);
  h.eq(extras.filter.name, filter?.name ?? "", "the grade is named as the app names it");
  h.eq(
    extras.filter.css,
    getFilterCss(makeFilterConfig(extras.filter.id)),
    "the grade shown on the page is the grade the app computes"
  );

  const transition = TRANSITION_OPTIONS.find((t) => t.id === extras.transition.id);
  ok(Boolean(transition), `the demonstration transition "${extras.transition.id}" is real`);
  h.eq(extras.transition.name, transition?.label ?? "", "the transition is named as the app names it");

  const music = BACKGROUND_MUSIC_TRACKS.find((m) => m.id === extras.music.id);
  ok(Boolean(music), `the demonstration music "${extras.music.id}" is real`);
  h.eq(extras.music.name, (music as { name?: string })?.name ?? "", "the music bed is named as the app names it");

  const sfx = SOUND_LIBRARY.find((m) => m.id === extras.soundEffect.id);
  ok(Boolean(sfx), `the demonstration sound effect "${extras.soundEffect.id}" is real`);
  h.eq(extras.soundEffect.name, (sfx as { name?: string })?.name ?? "", "the sound effect is named as the app names it");

  ok(Boolean(STICKER_BY_ID[extras.sticker.id]), `the demonstration sticker "${extras.sticker.id}" is real`);
  h.eq(extras.sticker.name, STICKER_BY_ID[extras.sticker.id]?.name ?? "", "the sticker is named as the app names it");

  ok(Boolean(TEMPLATE_BY_ID[extras.lowerThird.id]), `the demonstration lower third "${extras.lowerThird.id}" is real`);
  h.eq(
    extras.lowerThird.name,
    TEMPLATE_BY_ID[extras.lowerThird.id]?.name ?? "",
    "the lower third is named as the app names it"
  );

  const cta = CTA_PLATFORMS.find((c) => c.id === extras.cta.id);
  ok(Boolean(cta), `the demonstration badge "${extras.cta.id}" is real`);
  h.eq(extras.cta.name, cta?.name ?? "", "the badge is named as the app names it");
}

/* ------------------------------ 6c. one product, one look */

/*
 * The website and the studio are meant to be the same place. The shared
 * token file is the studio's Porcelain theme, Porcelain is what a new visitor
 * gets in the app, and the website's stylesheet must be built from those
 * tokens rather than a palette of its own.
 */
{
  const porcelain = read("src/shared/porcelain.css");
  const marketingCss = read("src/marketing/marketing.css");
  const themes = read("src/lib/themes.ts");
  const bootstrap = read("index.html");

  ok(themes.includes('DEFAULT_THEME: ThemeId = "porcelain"'), "Porcelain is the studio's default theme");
  ok(bootstrap.includes('t = "porcelain"'), "the pre-paint bootstrap defaults to Porcelain too");
  ok(marketingCss.includes('@import "../shared/porcelain.css"'), "the website is built on the shared tokens");
  ok(read("src/studio/sign-in.css").includes('@import "../shared/porcelain.css"'), "so is the sign-in screen");

  // The palette values themselves have to match the theme generator.
  const themeGen = read("scripts/generate-theme-css.mjs");
  const porcelainBlock = themeGen.slice(themeGen.indexOf("porcelain: {"), themeGen.indexOf("porcelain: {") + 1200);
  for (const colour of ["#fffdfa", "#f7f4ef", "#e4dccf", "#33302c", "#2f6fb5", "#245a99"]) {
    ok(porcelainBlock.includes(colour), `${colour} comes from the studio's porcelain palette`);
    ok(porcelain.includes(colour), `${colour} is in the shared token file`);
  }
  // …and the website must not have kept a palette of its own.
  for (const stray of ["#f3f5fb", "#6366f1", "#5257e3", "#0b0e17", "#101427"]) {
    ok(!marketingCss.includes(stray), `the website no longer uses its old colour ${stray}`);
  }
}

/* ------------------------------ 6d. no shortcuts into the studio */

/*
 * The only way in is the sign-in. The website may link to it once, from the
 * navigation; nowhere else on the page may jump into the editor.
 */
{
  const siteFiles = marketingFiles.filter((f) => /\.tsx$/.test(f.name));
  const linkers = siteFiles.filter((f) => f.text.includes("STUDIO_PATH"));
  h.eq(linkers.length, 1, "exactly one module links to the studio");
  h.eq(linkers[0]?.name.split("/").pop(), "MarketingSite.tsx", "…and it is the navigation");
  const nav = read("src/marketing/MarketingSite.tsx");
  h.eq(
    (nav.match(/navigate\(STUDIO_PATH\)/g) || []).length,
    1,
    "the navigation links to the studio exactly once"
  );
  ok(nav.includes("Sign in"), "that link is the sign-in");
  ok(!/Open the studio/.test(marketingSource), "no 'open the studio' shortcuts anywhere on the site");
  // And the studio does not offer a way back in past the door either.
  const app = read("src/App.tsx");
  ok(app.includes("signOut()"), "the studio can be signed out of");
}

/* ----------------------------------------------- 7. performance */

const main = read("src/main.tsx");
ok(main.includes("lazy(() => import(\"./marketing/MarketingSite\"))"), "the website is code-split");
ok(main.includes("lazy(() => import(\"./studio/StudioEntry\"))"), "the studio entry is code-split");
// The editor itself waits behind the sign-in: the door is a few kilobytes,
// the studio is a megabyte, and nobody downloads an editor they cannot open.
const studioEntry = read("src/studio/StudioEntry.tsx");
ok(studioEntry.includes("lazy(() => import(\"../App\"))"), "the studio loads only after sign-in");
ok(studioEntry.includes("useSession"), "the studio entry checks the session");
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
/*
 * The studio's catalogues and renderers are heavy. Exactly two modules are
 * allowed to touch them — the ones that exist to render the real effects on
 * the page — and everything else must reach those two through a dynamic
 * import, so the weight lands in its own chunk instead of the first paint.
 */
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
const REAL_PREVIEW_MODULES = ["RealEffects.tsx", "RealEffectsGallery.tsx"];
for (const { name, text } of marketingFiles) {
  if (!/\.tsx?$/.test(name)) continue;
  if (REAL_PREVIEW_MODULES.some((allowed) => name.endsWith(allowed))) continue;
  for (const heavy of HEAVY) {
    ok(!text.includes(`from "../../${heavy}`) && !text.includes(`from "../${heavy}`), `${name}: does not import ${heavy}`);
  }
  // …and no static import of the heavy preview modules either.
  ok(
    !/^import .*from "[^"]*RealEffects/m.test(text),
    `${name}: reaches the real-effect previews through lazy(), not a static import`
  );
}
// The real-effect modules must actually be the real thing: the studio's own
// preview components, not a lookalike rebuilt for the website.
const realEffects = read("src/marketing/components/RealEffects.tsx");
for (const component of [
  "components/FilterPreviewCanvas",
  "components/StickerPreviewCanvas",
  "components/TemplatePreviewCanvas",
  "components/CtaOptionThumb",
  "components/EffectVisualPreview",
]) {
  ok(realEffects.includes(component), `the website renders effects with the app's ${component}`);
}
// Both entry points into them are lazy.
ok(
  read("src/marketing/sections/EffectsLibrary.tsx").includes("lazy(() => import(\"../components/RealEffectsGallery\"))"),
  "the effects gallery is its own chunk"
);
ok(
  read("src/marketing/sections/VideoStudioSection.tsx").includes("lazy(() =>"),
  "the live visualiser is its own chunk"
);
ok(
  read("src/marketing/sections/VoiceSection.tsx").includes("lazy(() =>"),
  "so is the one in the voice section"
);

/*
 * Voice, honestly. The app draws the narration with a real visualiser now, so
 * the page shows that visualiser rather than a hand-drawn waveform — and where
 * a full canvas would be too heavy (the hero, the stepper, the transformation
 * strip) the stand-in is the CSS echo of the same Minimal Talking Dots, never
 * bars the studio does not draw.
 */
{
  const voice = read("src/marketing/sections/VoiceSection.tsx");
  ok(!voice.includes("<Waveform"), "the voice section draws no invented waveform");
  ok(voice.includes("RealVisualiser"), "…it shows the studio's own visualiser instead");

  const timeline = read("src/marketing/components/TimelineMock.tsx");
  ok(
    !timeline.includes("<Waveform"),
    "the timeline mockup labels its clips the way the studio's timeline does"
  );

  const waveUsers = marketingFiles.filter((f) => f.text.includes("<Waveform"));
  for (const f of waveUsers) {
    ok(
      /variant="dots"/.test(f.text),
      `${f.name}: the remaining stand-in is the talking-dots echo, not bars`
    );
  }
  ok(
    read("src/components/LiveVoiceVisualizer.tsx").includes("renderTimelineInsert("),
    "and the app itself now draws the voice with the render engine"
  );
}
// Only the marketing entry pulls the stylesheet, so the studio never loads it.
const cssImporters = marketingFiles.filter((f) => /^import "\.\/marketing\.css";/m.test(f.text));
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
