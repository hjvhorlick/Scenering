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
import { COMMON_QUESTIONS, NO_METER } from "../src/marketing/product-facts";
import { DEVICE_PERFORMANCE } from "../src/marketing/device-guidance";
import {
  DEMO_SCENES,
  DEMO_SEARCH_RESULTS,
  DEMO_TIMELINE_EXTRAS,
  DEMO_TOTAL_SECONDS,
} from "../src/marketing/demo-project";
import { normalizePath, routeForPath, sectionForPath, SITE_SECTIONS, SITE_SECTION_PATHS } from "../src/lib/route";

import { CAPTION_STYLES } from "../src/data/caption-styles";
import { PROJECT_PHASES } from "../src/components/StepNav";
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
const pricingSource = read("src/marketing/sections/Pricing.tsx");
ok(pricingSource.includes("PLAN_CONFIG") && pricingSource.includes("PLAN_ORDER"), "pricing uses the central plan configuration");
ok(pricingSource.includes('href="/register"') || pricingSource.includes('"/register"'), "Free has a working registration entry point");
ok(read("src/config/plans.ts").includes('name: "SceneFlow"'), "SceneFlow is configured");
ok(read("src/config/plans.ts").includes('name: "SceneForge"'), "SceneForge is configured");
ok(read("src/config/plans.ts").includes('prices: { monthly: 19, yearly: 180 }'), "SceneFlow prices are exact");
ok(read("src/config/plans.ts").includes('prices: { monthly: 39, yearly: 372 }'), "SceneForge prices are exact");
const setupSource = read("src/components/SetupStudio.tsx");
ok(setupSource.includes("PLAN_CONFIG") && setupSource.includes("PLAN_ORDER"), "Setup membership cards use central plan configuration");
ok(setupSource.includes("scenering-open-account"), "Setup plan actions open functional membership management");
for (const obsoletePlan of ["Free Starter", "Creator Studio", "Pro Agency"]) ok(!setupSource.includes(obsoletePlan), `Setup removes obsolete ${obsoletePlan} plan`);
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
ok(HONESTY.localNote.includes("Preview renders do not use final-export allowance"), "the page explains preview usage honestly");

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
/*
 * The workflow the page tells is the workflow the app has — one step per
 * phase, in the phase rail's own order. Finding the visuals lives inside
 * Scenes because that is the tab it happens on; a page that numbered it
 * separately would be promising a seventh screen that does not exist.
 */
h.eq(
  WORKFLOW_STAGES.map((s) => s.id).join(","),
  PROJECT_PHASES.map((p) => p.id).join(","),
  "the website's steps are the studio's phases, in order"
);
WORKFLOW_STAGES.forEach((stage, index) => {
  h.eq(stage.number, String(index + 1).padStart(2, "0"), `stage ${index + 1} is numbered ${stage.number}`);
  h.eq(stage.appTab, PROJECT_PHASES[index].tab, `step ${stage.number} names its tab in the app`);
  ok(stage.message.length > 10, `stage ${stage.number} carries a message`);
  ok(stage.thought.length > 5, `stage ${stage.number} carries the visitor's thought`);
});
// The visuals story survives the merge: it is still a section of its own and
// still carries its required line.
ok(MESSAGES.visuals === "Find visuals that fit the story.", "the visuals line is still said");
ok(
  read("src/marketing/sections/VisualResearch.tsx").includes("MESSAGES.visuals"),
  "…by the visuals section"
);
ok(
  WORKFLOW_STAGES[1].body.toLowerCase().includes("search"),
  "…and the Scenes step says the searching happens there"
);
// Nothing may still claim a seventh stage.
for (const { name, text } of marketingFiles) {
  ok(
    !/seven stages|7 stages|Seven stages/.test(text),
    `${name}: no seventh stage is promised`
  );
}
// The hero's chips are the same six phases.
{
  const hero = read("src/marketing/sections/Hero.tsx");
  const ids = [...hero.matchAll(/\{ id: "([a-z]+)", label: "[^"]+", phase: "([a-z]+)" \}/g)];
  h.eq(ids.length, PROJECT_PHASES.length, "the hero has one chip per phase");
  ids.forEach(([, id, phase], index) => {
    h.eq(id, PROJECT_PHASES[index].id, `hero chip ${index + 1} is the ${PROJECT_PHASES[index].id} phase`);
    h.eq(phase, PROJECT_PHASES[index].id, `hero chip ${index + 1} opens the frame on its own tab`);
  });
}
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

/* ------------------------- 6a. the six questions, including device performance */

/*
 * The band at the top of the page is a table of contents for doubts, so every
 * question has to land somewhere that actually answers it, and the one-line
 * answers have to be true on their own — most visitors will never click.
 */
{
  h.eq(COMMON_QUESTIONS.length, 6, "six questions cover the core first-time concerns");

  const siteSource = read("src/marketing/MarketingSite.tsx");
  const renderedIds = new Set<string>();
  for (const { name, text } of marketingFiles) {
    if (!/sections\/.*\.tsx$/.test(name)) continue;
    for (const match of text.matchAll(/<Section id="([^"]+)"/g)) renderedIds.add(match[1]);
  }
  renderedIds.add("workflow");

  for (const q of COMMON_QUESTIONS) {
    ok(q.question.trim().endsWith("?") || q.question.trim().endsWith("."), `"${q.id}" is asked the way a person would say it`);
    ok(q.answer.length > 40, `"${q.id}" is answered, not teased`);
    ok(renderedIds.has(q.section), `"${q.id}" points at #${q.section}, a section the page renders`);
    ok(q.cue.length > 0, `"${q.id}" says where it goes`);
  }

  const computerQuestion = COMMON_QUESTIONS.find((q) => q.id === "computer");
  h.eq(computerQuestion?.section, "devices", "computer question lands on the device guidance");
  ok(computerQuestion?.answer.includes("2-core Celeron with 4 GB RAM") ?? false, "computer question names the tested low-spec system");
  ok(computerQuestion?.answer.includes("faster modern PC") ?? false, "computer question recommends faster hardware for smoother work");
  const deviceSection = read("src/marketing/sections/Devices.tsx");
  ok(deviceSection.includes("DEVICE_PERFORMANCE.testedSystem"), "device section publishes the tested-system guidance");
  ok(deviceSection.includes("DEVICE_PERFORMANCE.persistentRender"), "device section explains persistent rendering");
  ok(deviceSection.includes("DEVICE_PERFORMANCE.recommendation"), "device section gives the modern-PC recommendation");
  ok(DEVICE_PERFORMANCE.lowerSpecExpectation.includes("may struggle with demanding projects"), "shared guidance honestly qualifies demanding work on modest hardware");

  // The jump has to work without the script, and must not steal modified clicks.
  const questions = read("src/marketing/sections/Questions.tsx");
  ok(questions.includes('href={`#${item.section}`}'), "each question is a real anchor");
  ok(questions.includes("event.metaKey || event.ctrlKey"), "open-in-new-tab still works");
  ok(questions.includes("prefers-reduced-motion"), "the jump honours reduced motion");

  ok(siteSource.includes("<Questions />"), "the band is on the page");
  ok(
    siteSource.indexOf("<Questions />") < siteSource.indexOf("<IdeaToVideo />"),
    "…directly under the hero, before anything is explained"
  );
}

/*
 * "No credits. No tokens. No counter." is the strongest claim on the site, so
 * it is checked against the code rather than trusted. If Scenering ever grows
 * a language model that writes or draws for the user, these fail.
 */
{
  const server = read("server.ts");
  const splitter = read("src/lib/duration-utils.ts");
  const topics = read("src/lib/topic-extract.ts");

  ok(
    splitter.includes("export function splitScriptIntoScenes"),
    "the script is still divided arithmetically"
  );
  ok(
    topics.includes("No NLP model is available"),
    "search terms are still extracted structurally, not by a model"
  );

  // The only model call in the whole server is speech synthesis…
  const generateCalls = (server.match(/generateContent\(/g) || []).length;
  h.eq(generateCalls, 1, "the server makes exactly one model call");
  const call = server.slice(server.indexOf("generateContent("), server.indexOf("generateContent(") + 400);
  ok(call.includes('responseModalities: ["AUDIO"]'), "…and it asks for audio, not words");
  ok(
    server.includes("synthesizeGeminiTTS"),
    "…inside the text-to-speech path"
  );
  // …and it is optional.
  ok(
    server.includes("env().GEMINI_API_KEY"),
    "that voice needs a key the operator supplies"
  );
  ok(
    NO_METER.caveat.includes("Gemini"),
    "the page names that exception instead of hiding it"
  );
  ok(
    NO_METER.caveat.includes("works fully without it"),
    "…and says the app does not need it"
  );

  // The claim must not overreach into "no AI at all" — the narrators are
  // neural voices and the page says so.
  const noMeterSource = JSON.stringify(NO_METER);
  ok(
    noMeterSource.includes("neural text-to-speech"),
    "the narration is described as what it is"
  );
  ok(!/no AI\b/i.test(noMeterSource), "the page never claims there is no AI anywhere");

  ok(
    read("src/marketing/sections/NoMeter.tsx").includes('<Section id="no-meter"'),
    "the answer has a section of its own to jump to"
  );
}

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
  const corner = read("src/shared/SiteCornerMenu.tsx");
  ok(corner.includes('go("/login")'), "the shared corner menu has an explicit Login entry");
  ok(corner.includes('go("/register")'), "the shared corner menu has an explicit Get Started entry");
  ok(corner.includes("Login") && corner.includes("Get Started Free"), "the account calls to action are named clearly");
  ok(corner.includes("signedIn") && corner.includes("Open Studio"), "the studio shortcut is shown only for authenticated customers");
  ok(corner.includes("await signOut()"), "the shared application menu can sign out");
  ok(read("src/App.tsx").includes("<SiteCornerMenu />"), "the signed-in studio mounts the same corner menu");
  ok(read("src/studio/SignIn.tsx").includes("<SiteCornerMenu />"), "login and registration mount the same corner menu");
}

/* ----------------------------------------------- 7. performance */

const main = read("src/main.tsx");
ok(
  main.includes('lazy(() => import("./marketing/MarketingSite"))'),
  "the public website is a separate lazy bundle"
);
ok(
  main.includes('lazy(() => import("./studio/StudioEntry"))'),
  "the account and studio entry is a separate lazy bundle"
);
ok(main.includes('routeForPath(window.location.pathname) === "studio"'), "the heavy studio is preloaded only on account or studio routes");
ok(
  main.includes('document.documentElement.setAttribute("data-mkt", "1")'),
  "the front page claims its scoped styles before the background studio CSS can paint"
);

// The editor stays behind authentication, but its one shared request begins on
// the landing page and StudioEntry can synchronously take the prepared module.
const studioLoader = read("src/studio/studio-loader.ts");
const studioEntry = read("src/studio/StudioEntry.tsx");
ok(studioLoader.includes('import("../App")'), "the warm-up request contains the real studio");
ok(
  studioLoader.includes("if (studioRequest) return studioRequest"),
  "the front page and sign-in reuse one studio download"
);
ok(
  studioEntry.includes("getPreloadedStudio()") && studioEntry.includes("<LoadedStudio />"),
  "sign-in mounts the already-prepared studio without a second lazy boundary"
);
const signInDoor = read("src/studio/SignIn.tsx");
ok(
  signInDoor.includes("await preloadStudio()") && signInDoor.includes("await signIn(email, password)"),
  "login prepares the studio before opening the authenticated session"
);
ok(
  signInDoor.includes("registerAccount(displayName, email, password, marketingConsent)"),
  "registration creates a server-backed account with separate marketing consent"
);
ok(studioEntry.includes("useSession"), "the prepared studio still stays behind the session check");
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
 * strip) the stand-in is the CSS echo of the same twenty-band Talking Dot Wave,
 * never bars the studio does not draw.
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
    read("src/components/VideoStudio.tsx").includes("Advanced Audio Visualiser Engine") &&
      read("src/lib/render-visualizers.ts").includes('case "minimal_voice"'),
    "and the app keeps real voice visualisers in the render engine and dedicated Video Studio section"
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
  // Either the shared <Section> wrapper, a tablist, or a plain <section>
  // element carrying an accessible name — all three are real landmarks. The
  // full-bleed key-art band is the third kind.
  const landmark =
    /<Section/.test(text) ||
    /role="tablist"/.test(text) ||
    /<section[^>]*aria-label(?:ledby)?=/.test(text);
  ok(landmark, `${name}: renders a landmark section`);
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
ok(read("src/shared/SiteCornerMenu.tsx").includes('["/", "Home"]'), "the shared app menu links back to the website");

/* ------------------------------------------ 9b. caption specimens ----- */

/* Every style in the catalogue is pale lettering carried by a dark outline
   and a dark shadow. Set on black, both disappear and the specimen is a
   faint smudge; the strip behind it has to be grey enough for the outline
   to register and dark enough for white text to stay crisp. */
{
  const stage = css.slice(css.indexOf(".mkt-capstage {"), css.indexOf(".mkt-capstage {") + 700);
  const greys = [...stage.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => m[1]);
  ok(greys.length >= 2, "the caption strip has a background");
  // WCAG relative luminance: sRGB channels linearised, then weighted.
  const chan = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = (hex: string) =>
    0.2126 * chan(parseInt(hex.slice(0, 2), 16) / 255) +
    0.7152 * chan(parseInt(hex.slice(2, 4), 16) / 255) +
    0.0722 * chan(parseInt(hex.slice(4, 6), 16) / 255);
  const darkest = Math.min(...greys.map(lum));
  const lightest = Math.max(...greys.map(lum));
  ok(darkest > 0.015, `the caption strip is grey, not black (darkest stop ${darkest.toFixed(3)})`);
  ok(lightest < 0.2, `and still dark enough for white captions (lightest stop ${lightest.toFixed(3)})`);
  // White text on the lightest stop must still clear WCAG AA for body text.
  const contrast = (1.05) / (lightest + 0.05);
  ok(contrast >= 7, `white caption text keeps ${contrast.toFixed(1)}:1 contrast on the strip`);

  // The studio's own specimen box made the same mistake and gets the same
  // treatment, so a style looks the same in both places.
  const studio = read("src/components/CaptionsStudio.tsx");
  ok(!/rounded-lg bg-black\/40 border border-hairline overflow-hidden text-center/.test(studio), "the studio specimen box is no longer set on black");
  ok(/from-\[#4[0-9a-f]{5}\]/.test(studio), "the studio specimen box is set on dark grey");
}

/* --------------------------------------------------- 10. responsive */

/* The page is long and most of it will be read on a phone. These checks are
   about one failure mode: something wider than the screen, which turns the
   whole document into a horizontal scroll. They read the stylesheet rather
   than a browser, so they run everywhere. */

// Mobile-first: every breakpoint adds to a small-screen base, never the
// reverse. A single max-width query would mean the base layer is a desktop
// layout being walked back, which is where overflow comes from.
const queries = css.match(/@media[^{]+/g) ?? [];
ok(queries.length > 0, `the stylesheet has ${queries.length} media queries`);
for (const query of queries) {
  const feature = query.replace(/\s+/g, " ").trim();
  ok(
    !/max-width:\s*\d/.test(feature) || /print|prefers-/.test(feature),
    `mobile-first (min-width only): ${feature}`,
  );
}

/* Walk the base layer — every rule outside a min-width query — and budget it
   against the narrowest phone we support. */
const PHONE = 320;
type Rule = { selector: string; body: string; responsive: boolean };
const rules: Rule[] = [];
{
  let index = 0;
  let mediaEnd = -1;
  while (index < css.length) {
    const open = css.indexOf("{", index);
    if (open < 0) break;
    const head = css.slice(index, open).split("\n").pop()!.trim();
    if (head.startsWith("@media") && /min-width/.test(head)) {
      let depth = 1;
      let scan = open + 1;
      while (scan < css.length && depth > 0) {
        if (css[scan] === "{") depth += 1;
        else if (css[scan] === "}") depth -= 1;
        scan += 1;
      }
      mediaEnd = scan;
      index = open + 1;
      continue;
    }
    if (head.startsWith("@")) {
      let depth = 1;
      let scan = open + 1;
      while (scan < css.length && depth > 0) {
        if (css[scan] === "{") depth += 1;
        else if (css[scan] === "}") depth -= 1;
        scan += 1;
      }
      index = scan;
      continue;
    }
    const close = css.indexOf("}", open);
    if (close < 0) break;
    rules.push({ selector: head, body: css.slice(open + 1, close), responsive: open < mediaEnd });
    index = close + 1;
  }
}
ok(rules.length > 150, `${rules.length} rules parsed out of the stylesheet`);

for (const rule of rules.filter((r) => !r.responsive)) {
  const width = rule.body.match(/(?:^|[;\s])width:\s*(\d+)px/);
  if (width && Number(width[1]) >= 200) {
    ok(/max-width:\s*100%/.test(rule.body), `${rule.selector}: ${width[1]}px wide, capped at 100%`);
  }
  const floor = rule.body.match(/(?:^|[;\s])min-width:\s*(\d+)px/);
  ok(!floor || Number(floor[1]) < PHONE, `${rule.selector}: no min-width past a ${PHONE}px screen`);
  const columns = rule.body.match(/grid-template-columns:\s*([^;]+)/);
  if (columns) {
    const fixed = [...columns[1].matchAll(/(\d+)px/g)].reduce((sum, m) => sum + Number(m[1]), 0);
    ok(fixed < 260, `${rule.selector}: grid columns are not ${fixed}px of fixed track`);
  }
}

// 100vw ignores the scrollbar on desktop and overflows by its width.
ok(!/width:\s*100vw/.test(css), "nothing is sized to 100vw");

// Anything that lays children out in a fixed-size row has to be allowed to
// either wrap or scroll, or it pushes the page sideways.
for (const strip of [".mkt-strip", ".mkt-optrow"]) {
  const rule = rules.find((r) => r.selector.split(",").some((s) => s.trim() === strip) && !r.responsive);
  ok(!!rule && /overflow-x:\s*auto/.test(rule.body), `${strip} scrolls sideways instead of overflowing`);
}

/* The desktop link rail is hidden below 1000px. Something has to take its
   place, or a phone gets a wordmark, a Sign in button, and twenty screens of
   scrolling with no way to jump. */
const railHidden = rules.some(
  (r) => r.selector.includes(".mkt-nav-links") && !r.responsive && /display:\s*none/.test(r.body),
);
ok(railHidden, "the wide link rail is hidden on small screens");
const cornerMenu = read("src/shared/SiteCornerMenu.tsx");
ok(site.includes("<SiteCornerMenu />"), "the landing page mounts the shared corner menu");
ok(cornerMenu.includes("aria-expanded={open}"), "the shared menu reports its state");
ok(cornerMenu.includes('aria-controls="sc-corner-panel"'), "the toggle points at the panel it opens");
ok(/Escape/.test(cornerMenu) && /setOpen\(false\)/.test(cornerMenu), "Escape closes the shared menu");
ok(cornerMenu.includes("PRODUCT_LINKS.map"), "the corner menu lists every public product page");
ok(cornerMenu.includes("Account, membership & billing"), "the same menu exposes account and billing inside the app");

/* The menu's section shortcuts.
 *
 * The menu used to name the parts of the product and then link each one to a
 * separate marketing page, so "Captions" never took anyone to the captions
 * area of the front page. Every shortcut now addresses a real section id, and
 * the front page scrolls to it on navigation as well as on a cold load. */
{
  ok(cornerMenu.includes("SITE_SECTIONS.map"), "the menu builds its shortcuts from the one section list");
  ok(cornerMenu.includes("goToSection(section.id)"), "a shortcut goes to the section, not to another page");
  ok(cornerMenu.includes("Jump to a section"), "the shortcut group says what it is");

  const renderedIds = new Set<string>();
  for (const { name, text } of marketingFiles) {
    if (!/sections\/.*\.tsx$/.test(name)) continue;
    for (const match of text.matchAll(/<Section id="([^"]+)"/g)) renderedIds.add(match[1]);
  }
  for (const match of site.matchAll(/<section className="mkt-section" id="([^"]+)"/g)) renderedIds.add(match[1]);

  ok(SITE_SECTIONS.length >= 8, `${SITE_SECTIONS.length} areas of the front page are reachable from the menu`);
  for (const section of SITE_SECTIONS) {
    ok(renderedIds.has(section.id), `menu shortcut "${section.label}" points at #${section.id}, which the page renders`);
    ok(section.label.trim().length > 2, `menu shortcut #${section.id} is named for a human`);
    h.eq(sectionForPath(section.path), section.id, `${section.path} deep-links to #${section.id}`);
  }
  const labels = SITE_SECTIONS.map((entry) => entry.label);
  h.eq(new Set(labels).size, labels.length, "no two shortcuts carry the same name");

  // The scroll has to survive client-side navigation: the shortcut changes
  // the path without a reload, so a one-shot mount effect would do nothing.
  ok(site.includes('window.addEventListener("popstate", jump)'), "the front page re-scrolls when the path changes");
  ok(site.includes("scrollToSection(section)"), "…using the shared helper the question band uses");
  const route = read("src/lib/route.ts");
  ok(route.includes("prefers-reduced-motion"), "the shared scroll honours reduced motion");
  ok(route.includes("is-answering"), "…and flashes the area so the eye lands on it");
}

/* Back to top. */
const totop = read("src/marketing/components/BackToTop.tsx");
ok(site.includes("<BackToTop />"), "the page mounts a back-to-top control");
ok(/Back to the top/.test(totop), "back-to-top has an accessible name");
ok(/prefers-reduced-motion/.test(totop), "back-to-top honours reduced motion");
ok(/tabIndex={shown \? 0 : -1}/.test(totop), "back-to-top leaves the tab order while hidden");
ok(/getElementById\("main"\)\?\.focus/.test(totop), "back-to-top moves focus, not just the scroll position");
ok(/passive: true/.test(totop), "the scroll listener is passive");
const totopRule = rules.find((r) => r.selector.trim() === ".mkt-totop");
ok(!!totopRule && /position:\s*fixed/.test(totopRule.body), "back-to-top is pinned to the viewport");
ok(!!totopRule && /min-height:\s*44px/.test(totopRule.body), "back-to-top is a 44px touch target");
ok(!!totopRule && /env\(safe-area-inset-bottom/.test(totopRule.body), "back-to-top clears the phone home bar");
ok(/\.mkt-totop:focus-visible/.test(css), "back-to-top shows a focus ring");

/* Images tell the browser how much of the screen they will take, so a phone
   downloads a phone-sized file. */
const imgSizes = marketingSource.match(/sizes="[^"]+"/g) ?? [];
ok(imgSizes.length >= 10, `${imgSizes.length} images declare their layout width`);
for (const size of imgSizes) {
  const value = size.slice(7, -1);
  // Two honest shapes: an element that grows with the screen ends in a
  // viewport-relative fallback, and a fixed thumbnail states its one width.
  // A fixed width only has to fit the narrowest phone.
  if (/vw/.test(value)) {
    ok(/\d+vw\s*$/.test(value), `sizes ends in a viewport-relative fallback: ${value}`);
  } else {
    const fixed = Number(value.match(/^(\d+)px$/)?.[1] ?? NaN);
    ok(fixed > 0 && fixed < PHONE, `fixed thumbnail fits a ${PHONE}px screen: ${value}`);
  }
}

/* The corner menu's panel head carries the real wordmark, not a letter tile.
   It is the same artwork the front page uses, at both encoded widths. */
{
  const cornerMenu = read("src/shared/SiteCornerMenu.tsx");
  const cornerCss = read("src/shared/site-corner-menu.css");
  h.ok(
    cornerMenu.includes('src="/marketing/mark-scenering-240.webp"'),
    "the menu head shows the Scenering wordmark"
  );
  h.ok(
    cornerMenu.includes('srcSet="/marketing/mark-scenering-120.webp 120w, /marketing/mark-scenering-240.webp 240w"'),
    "the wordmark is offered at both encoded widths"
  );
  h.ok(cornerMenu.includes('alt="Scenering"'), "the wordmark names itself for screen readers");
  h.ok(
    cornerMenu.includes("width={240}") && cornerMenu.includes("height={76}"),
    "the wordmark declares its intrinsic size, so the panel does not jump as it loads"
  );
  h.ok(!cornerMenu.includes("sc-corner-mark"), "the old letter tile is gone");
  h.ok(!cornerCss.includes(".sc-corner-mark"), "the letter tile's styles went with it");
  h.ok(cornerCss.includes(".sc-corner-logo"), "the wordmark is sized by the menu stylesheet");
  for (const width of [120, 240]) {
    h.ok(
      existsSync(join(repoRoot, `public/marketing/mark-scenering-${width}.webp`)),
      `mark-scenering-${width}.webp is on disk for the menu`
    );
  }
}

h.done("marketing");
