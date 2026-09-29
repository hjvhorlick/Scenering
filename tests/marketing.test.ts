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
import {
  DEMO_SCENES,
  DEMO_SEARCH_RESULTS,
  DEMO_TIMELINE_EXTRAS,
  DEMO_TOTAL_SECONDS,
} from "../src/marketing/demo-project";
import { normalizePath, routeForPath, sectionForPath, SITE_SECTION_PATHS } from "../src/lib/route";

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

/* ------------------------- 6a. the five questions, and the answer to the first */

/*
 * The band at the top of the page is a table of contents for doubts, so every
 * question has to land somewhere that actually answers it, and the one-line
 * answers have to be true on their own — most visitors will never click.
 */
{
  h.eq(COMMON_QUESTIONS.length, 5, "five questions, as many as anyone reads");

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
    server.includes("process.env.GEMINI_API_KEY"),
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
ok(
  main.includes('const marketingModule = import("./marketing/MarketingSite")'),
  "the website starts loading as soon as the product boots"
);
ok(
  main.includes('const studioEntryModule = import("./studio/StudioEntry")'),
  "the sign-in door starts loading beside the website"
);
ok(main.includes("preloadStudio()"), "the full studio starts preparing beside the front page");
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
  signInDoor.includes("await preloadStudio()") &&
    signInDoor.indexOf("await preloadStudio()") < signInDoor.indexOf("await signIn(passphrase)"),
  "the existing-profile session opens only after studio preparation wins the final race"
);
ok(
  signInDoor.lastIndexOf("await preloadStudio()") >= 0 &&
    signInDoor.lastIndexOf("await preloadStudio()") < signInDoor.indexOf("await createProfile(name, passphrase)"),
  "first-time setup also opens only when the prepared studio can mount"
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
ok(read("src/App.tsx").includes("navigate(SITE_PATH)"), "the studio links back to the website");

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
const menuHiddenWide = rules.some(
  (r) => r.selector.includes(".mkt-nav-menu") && r.responsive && /display:\s*none/.test(r.body),
);
ok(menuHiddenWide, "the small-screen menu gets out of the way once the rail fits");
ok(site.includes("mkt-nav-panel"), "small screens get a section menu");
ok(site.includes("aria-expanded={menuOpen}"), "the menu reports its state");
ok(site.includes('aria-controls="mkt-nav-panel"'), "the toggle points at the panel it opens");
ok(/Escape/.test(site) && /setMenuOpen\(false\)/.test(site), "Escape closes the menu");
// The panel is the rail: same links, no shorter list for phones.
ok(/NAV\.map\([\s\S]{0,400}mkt-nav-panel-link/.test(site), "the menu lists every section the rail does");

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

h.done("marketing");
