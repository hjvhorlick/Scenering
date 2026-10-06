/**
 * What the website is allowed to say.
 *
 * The public site demonstrates the product, so every number and every feature
 * claim on it has to come from the application rather than from a copywriter.
 * Two mechanisms keep that true:
 *
 *  1. Light catalogues are imported directly (caption styles, narrators,
 *     transitions). If the app gains a caption style the website says so the
 *     same day.
 *
 *  2. Heavy catalogues — the sticker meshes, the studio catalogue, the filter
 *     presets — are *not* imported, because pulling a renderer into the
 *     marketing bundle to count its entries is a poor trade. Their counts are
 *     written out below and `tests/marketing.test.ts` asserts every one of
 *     them against the real catalogue. Add a sticker, the suite fails until
 *     the number here is updated.
 *
 * Anything not implemented yet is marked `status: "soon"` and renders with a
 * "Coming soon" badge. Nothing on the website may claim more than this file.
 */
import { CAPTION_STYLES } from "../data/caption-styles";
import { STUDIO_VOICE_PRESETS } from "../data/voice-presets";
import { TRANSITION_OPTIONS } from "../lib/scene-transition";
import { PROJECT_PHASES } from "../components/StepNav";
import { NATURE_FALLBACKS } from "../data/nature-fallbacks";

/* ------------------------------------------------------------------ counts */

/** Counted live from the catalogues the studio itself renders. */
export const LIVE_COUNTS = {
  captionStyles: CAPTION_STYLES.length,
  captionCategories: new Set(CAPTION_STYLES.map((s) => s.category)).size,
  voices: STUDIO_VOICE_PRESETS.length,
  maleVoices: STUDIO_VOICE_PRESETS.filter((v) => v.gender === "male").length,
  femaleVoices: STUDIO_VOICE_PRESETS.filter((v) => v.gender === "female").length,
  transitions: TRANSITION_OPTIONS.length,
} as const;

/**
 * Counted from catalogues that are too heavy to import here.
 * tests/marketing.test.ts proves each of these against the real module.
 */
export const CATALOG_COUNTS = {
  /** src/data/video-filters.ts → VIDEO_FILTERS / FILTER_GROUPS */
  filters: 26,
  filterGroups: 5,
  /** src/data/text-templates.ts → TEXT_TEMPLATES */
  textTemplates: 31,
  /** src/lib/video-studio-catalog.ts → CATALOG_ITEMS.lower_thirds */
  lowerThirds: 6,
  /** src/data/cta-library.ts → CTA_PLATFORMS / CTA_GROUPS */
  ctaPlatforms: 36,
  ctaGroups: 6,
  /** src/lib/sticker-3d.ts → STICKER_LIBRARY / STICKER_GROUPS */
  stickers: 34,
  stickerGroups: 5,
  /** src/data/media-library.ts → BACKGROUND_MUSIC_TRACKS / SOUND_LIBRARY */
  musicTracks: 30,
  soundEffects: 12,
  /** src/lib/video-studio-catalog.ts → CATALOG_ITEMS.audio_visualizers */
  visualisers: 52,
  /** src/lib/video-studio-catalog.ts → SCENE_MOTIONS */
  sceneMotions: 5,
  /** src/lib/video-studio-catalog.ts → STUDIO_CATEGORIES */
  studioCategories: 11,
  /** public/videos/intros + public/videos/outros */
  introClips: 5,
  outroClips: 5,
  /** src/data/intro-outro.ts → TITLE_ANIMATIONS / STINGERS */
  titleAnimations: 6,
  stingers: 7,
} as const;

/* ---------------------------------------------------------------- workflow */

export interface WorkflowStage {
  /** The tab this step is called in the application. */
  appTab: string;
  id: string;
  /** "01" … "06" — one per phase the studio has. */
  number: string;
  name: string;
  /** The one-line marketing message for this stage. */
  message: string;
  /** What actually happens, in plain language. */
  body: string;
  /** The visitor's thought at this point in the story (spec §34). */
  thought: string;
}

/**
 * The copy for each step, keyed by the app's own phase id.
 *
 * The list itself is not written here — it is `PROJECT_PHASES`, the rail the
 * studio actually shows. That way the website can never advertise a step the
 * app does not have, which is exactly what happened when the page told a
 * seven-stage story against a six-tab application. Finding the visuals is
 * part of Scenes, because that is where you do it.
 */
const STAGE_COPY: Record<string, Omit<WorkflowStage, "id" | "number" | "appTab">> = {
  setup: {
    name: "Script",
    message: "Start with what you want to say.",
    body: "Paste or write your script, name the project and choose the format. Nothing else is required to begin.",
    thought: "Here is my content.",
  },
  scenes: {
    name: "Scenes & visuals",
    message: "Turn your script into scenes.",
    body: "The script is divided into scenes that follow the narration, so each one lasts as long as its own line takes to say. Every scene then gets a search built from its own words — and any picture you do not like can be replaced.",
    thought: "Scenering understands the structure, and finds the pictures.",
  },
  voiceover: {
    name: "Voice Over",
    message: "Give every scene a voice.",
    body: `Choose from ${LIVE_COUNTS.voices} narrators, preview a line, then narrate the whole project. Scene lengths follow the narration that is generated.`,
    thought: "Now it can speak.",
  },
  captions: {
    name: "Captions",
    message: "Add captions that match your style.",
    body: `${LIVE_COUNTS.captionStyles} caption styles across ${LIVE_COUNTS.captionCategories} families, word-by-word or line-by-line, with your own colours if you want them.`,
    thought: "Now viewers can follow it.",
  },
  studio: {
    name: "Video Studio",
    message: "Finish your video in Video Studio.",
    body: "Timeline, filters, music, sound effects, stickers, text templates, lower thirds, calls to action, intro and outro — arranged against the scenes you already have.",
    thought: "Now I can make it my own.",
  },
  render: {
    name: "Render",
    message: "Preview. Adjust. Perfect. Export.",
    body: "A frame-exact offline render writes the file, using the output settings chosen in Setup, and puts the finished video in your Vault.",
    thought: "Now I have a video.",
  },
};

/**
 * The workflow, numbered — one entry per phase the studio really has, in the
 * studio's own order. `tests/marketing.test.ts` fails if the two lists ever
 * disagree.
 */
export const WORKFLOW_STAGES: WorkflowStage[] = PROJECT_PHASES.map((phase, index) => ({
  id: phase.id,
  number: String(index + 1).padStart(2, "0"),
  appTab: phase.tab,
  ...STAGE_COPY[phase.id],
}));

/* ---------------------------------------------------------- visual sources */

export interface VisualSource {
  id: string;
  name: string;
  /** How the app reaches it. */
  access: "key" | "open" | "bundled";
  /** Search order description. */
  role: string;
  /** Shown in the "connect your sources" card. */
  setup: string;
}

/**
 * The providers server.ts actually searches, in the order it searches them.
 * Keep this in step with `handleImageSearch` — tests/marketing.test.ts checks
 * that every id named here appears in the server's search chain.
 */
export const VISUAL_SOURCES: VisualSource[] = [
  {
    id: "pexels",
    name: "Pexels",
    access: "key",
    role: "Searched first when connected",
    setup: "Add your key in Setup",
  },
  {
    id: "pixabay",
    name: "Pixabay",
    access: "key",
    role: "Searched next when connected",
    setup: "Add your key in Setup",
  },
  {
    id: "wikimedia",
    name: "Wikimedia Commons",
    access: "open",
    role: "Always available, no key needed",
    setup: "Connected out of the box",
  },
  {
    id: "nature-library",
    name: `Built-in library (${NATURE_FALLBACKS.length} photographs)`,
    access: "bundled",
    role: "Offline fallback so a scene is never empty",
    setup: "Ships with the app",
  },
];

/** How a search becomes one downloaded picture (spec §20). */
export const SEARCH_POLICY: { step: string; detail: string }[] = [
  { step: "Search", detail: "A query is built from the words of that scene." },
  { step: "Evaluate", detail: "Results are checked: photographic, 16:9, at least 1920×1080." },
  { step: "Select", detail: "One suitable result is chosen; the rest stay as alternatives." },
  { step: "Use", detail: "Only the selected visual is downloaded into the project." },
];

/** How a narrated scene is produced, in order (README). */
export const NARRATION_CHAIN: { name: string; detail: string }[] = [
  {
    name: "Your own free Google key",
    detail: "One key from Google AI Studio, free and about a minute to create, pasted into API Keys",
  },
  {
    name: "Gemini narration",
    detail: "Every narrator is a Gemini neural voice, spoken with your key — Scenering never meters it",
  },
  { name: "Silent track", detail: "Exact scene length, so the video still renders if speech cannot be reached" },
];

/* ------------------------------------------------------------- effects map */

export type FeatureStatus = "live" | "soon";

export interface EffectItem {
  name: string;
  /** Count shown next to the name, when there is a catalogue behind it. */
  count?: number;
  status: FeatureStatus;
  detail: string;
}

export interface EffectCategory {
  id: string;
  name: string;
  blurb: string;
  items: EffectItem[];
}

export const EFFECT_CATEGORIES: EffectCategory[] = [
  {
    id: "branding",
    name: "Branding",
    blurb: "Make it yours before the first word.",
    items: [
      { name: "Logo", status: "live", detail: "Placed, scaled and faded over the whole video" },
      { name: "Intro", count: CATALOG_COUNTS.introClips, status: "live", detail: "Title cards over built-in intro clips" },
      { name: "Outro", count: CATALOG_COUNTS.outroClips, status: "live", detail: "Closing cards with title animations" },
      { name: "Brand kits", status: "soon", detail: "Saved colour, type and logo sets reused across projects" },
    ],
  },
  {
    id: "engagement",
    name: "Engagement",
    blurb: "Ask for the follow without leaving the timeline.",
    items: [
      { name: "Subscribe · Follow · Like", count: CATALOG_COUNTS.ctaPlatforms, status: "live", detail: `Call-to-action badges across ${CATALOG_COUNTS.ctaGroups} platform groups` },
      { name: "Stickers", count: CATALOG_COUNTS.stickers, status: "live", detail: `Raised 3D stickers in ${CATALOG_COUNTS.stickerGroups} groups` },
      { name: "End screens", status: "soon", detail: "Multi-card closing screens with linked thumbnails" },
    ],
  },
  {
    id: "text",
    name: "Text",
    blurb: "Say it on screen as well as out loud.",
    items: [
      { name: "Text templates", count: CATALOG_COUNTS.textTemplates, status: "live", detail: "Animated titles, statements and list cards" },
      { name: "Lower thirds", count: CATALOG_COUNTS.lowerThirds, status: "live", detail: "Name and topic bars that slide in and out" },
      { name: "Script & quote cards", status: "live", detail: "Full-frame cards for a line worth holding on" },
    ],
  },
  {
    id: "motion",
    name: "Motion",
    blurb: "Stills that move like footage.",
    items: [
      { name: "Camera movement", count: CATALOG_COUNTS.sceneMotions, status: "live", detail: "Per-scene motion styles, including none" },
      { name: "Zoom", status: "live", detail: "Slow push and Ken Burns drift" },
      { name: "Pan", status: "live", detail: "Left and right travel across the frame" },
      { name: "Motion keyframes", status: "soon", detail: "Hand-placed start and end framing per scene" },
    ],
  },
  {
    id: "visual",
    name: "Visual",
    blurb: "One consistent look across the whole video.",
    items: [
      { name: "Filters", count: CATALOG_COUNTS.filters, status: "live", detail: `Graded looks in ${CATALOG_COUNTS.filterGroups} families, applied to every scene` },
      { name: "Transitions", count: LIVE_COUNTS.transitions, status: "live", detail: "Between every scene, chosen once" },
      { name: "Special effects", count: CATALOG_COUNTS.stingers, status: "live", detail: "Stingers and tension effects on intro and outro" },
    ],
  },
  {
    id: "audio",
    name: "Audio",
    blurb: "Sound is half of the video.",
    items: [
      { name: "Background music", count: CATALOG_COUNTS.musicTracks, status: "live", detail: "One bed across the video, ducked under narration" },
      { name: "Sound effects", count: CATALOG_COUNTS.soundEffects, status: "live", detail: "Dropped on the timeline where you want them" },
      { name: "Sound visualiser", count: CATALOG_COUNTS.visualisers, status: "live", detail: "Audio-reactive overlays drawn from the real track" },
      { name: "Voice cloning", status: "soon", detail: "Narration in your own recorded voice" },
    ],
  },
];

/* ------------------------------------------------------------------- plans */

export type PlanId = "free" | "sceneflow" | "sceneforge";

export interface PlanDef {
  id: PlanId;
  name: string;
  tagline: string;
  /** Deliberately not a price: the hosted plans are not on sale yet. */
  priceLabel: string;
  priceNote: string;
  /** Headline inclusions shown on the card. */
  includes: string[];
  /** What the interactive workspace reveals for this plan. */
  workspace: {
    voices: string;
    captions: string;
    studio: string[];
    exports: string;
  };
  availability: FeatureStatus;
}

/**
 * Plan packaging for the hosted service.
 *
 * IMPORTANT, and stated on the page itself: accounts and billing are not live.
 * Running Scenering yourself today gives you the whole workflow. These tiers
 * describe how the hosted service will be packaged, which is a business
 * decision that lives in this one file — edit here, the section follows.
 */
export const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    tagline: "The complete workflow, start to finished file.",
    priceLabel: "Free",
    priceNote: "The whole route from script to exported video",
    includes: [
      "Script → scenes → visuals → voice → captions → studio → export",
      "Starter narrators",
      "Basic caption styles",
      "Basic Video Studio: logo, text, calls to action",
      "Export 16:9 and 9:16",
    ],
    workspace: {
      voices: "Starter narrators",
      captions: "Basic caption styles",
      studio: ["Logo", "Text templates", "Call to action", "Camera movement"],
      exports: "Standard exports",
    },
    availability: "live",
  },
  {
    id: "sceneflow",
    name: "SceneFlow",
    tagline: "Everything in Free, plus the full creative library.",
    priceLabel: "Planned",
    priceNote: "Pricing announced when accounts open",
    includes: [
      "Everything in Free",
      `All ${LIVE_COUNTS.voices} narrators`,
      `All ${LIVE_COUNTS.captionStyles} caption styles`,
      "Full Video Studio and advanced effects",
      "Music, sound effects and sound visualisers",
      "More exports",
    ],
    workspace: {
      voices: `All ${LIVE_COUNTS.voices} narrators`,
      captions: `All ${LIVE_COUNTS.captionStyles} caption styles`,
      studio: [
        "Logo",
        "Text templates",
        "Call to action",
        "Camera movement",
        "Stickers",
        "Lower thirds",
        "Filters",
        "Music",
        "Sound effects",
        "Sound visualiser",
        "Intro & outro",
      ],
      exports: "More exports",
    },
    availability: "soon",
  },
  {
    id: "sceneforge",
    name: "SceneForge",
    tagline: "Everything in SceneFlow, built for volume.",
    priceLabel: "Planned",
    priceNote: "Pricing announced when accounts open",
    includes: [
      "Everything in SceneFlow",
      "Higher capacity",
      "High-volume workflows",
      "Priority processing",
      "Expanded production capabilities",
    ],
    workspace: {
      voices: `All ${LIVE_COUNTS.voices} narrators`,
      captions: `All ${LIVE_COUNTS.captionStyles} caption styles`,
      studio: [
        "Logo",
        "Text templates",
        "Call to action",
        "Camera movement",
        "Stickers",
        "Lower thirds",
        "Filters",
        "Music",
        "Sound effects",
        "Sound visualiser",
        "Intro & outro",
        "Batch queue",
        "Priority render",
      ],
      exports: "High-volume exports",
    },
    availability: "soon",
  },
];

/* ---------------------------------------------------------------- examples */

export interface ExampleVideo {
  id: string;
  category: string;
  title: string;
  /** Fictional script line the example would open with. */
  line: string;
  format: "16:9" | "9:16";
  duration: string;
  scenes: number;
  assetId: string;
}

/**
 * Fictional projects made to demonstrate the workflow. Every one is faceless,
 * every one is labelled on the page as a demonstration — none of these are
 * customer videos.
 */
export const EXAMPLE_VIDEOS: ExampleVideo[] = [
  {
    id: "travel",
    category: "Travel",
    title: "Roads That Follow the Coast",
    line: "Some roads were built for speed. This one was built for the view.",
    format: "16:9",
    duration: "2:40",
    scenes: 9,
    assetId: "example.travel",
  },
  {
    id: "education",
    category: "Education",
    title: "How Maps Learned to Lie",
    line: "Every flat map of a round world has to give something up.",
    format: "16:9",
    duration: "4:05",
    scenes: 14,
    assetId: "example.education",
  },
  {
    id: "inspiration",
    category: "Inspiration",
    title: "Before the Sun Clears the Ridge",
    line: "The quietest hour of the day is the one nobody competes for.",
    format: "9:16",
    duration: "0:48",
    scenes: 5,
    assetId: "example.inspiration",
  },
  {
    id: "storytelling",
    category: "Storytelling",
    title: "The Lantern Path",
    line: "The village kept one light burning on the forest road. Nobody agreed on why.",
    format: "16:9",
    duration: "3:20",
    scenes: 11,
    assetId: "example.storytelling",
  },
  {
    id: "business",
    category: "Business",
    title: "What Our Team Actually Does",
    line: "Three minutes on how the work gets from a question to a decision.",
    format: "16:9",
    duration: "2:10",
    scenes: 8,
    assetId: "example.business",
  },
  {
    id: "training",
    category: "Training",
    title: "Set Up the Bench Safely",
    line: "Before the first cut, five things need to be true.",
    format: "16:9",
    duration: "5:30",
    scenes: 18,
    assetId: "example.training",
  },
  {
    id: "information",
    category: "Information",
    title: "Why Cities Glow From Orbit",
    line: "From above, a city is mostly a diagram of where people drive.",
    format: "16:9",
    duration: "3:55",
    scenes: 13,
    assetId: "example.information",
  },
  {
    id: "social",
    category: "Social Media",
    title: "Three Water Facts in Forty Seconds",
    line: "You have used more water today than you think. Here is where it went.",
    format: "9:16",
    duration: "0:40",
    scenes: 4,
    assetId: "example.social",
  },
];

/* ----------------------------------------------------------------- control */

/** Spec §18 — automatic does not mean uncontrollable. */
export const CONTROL_POINTS: { label: string; detail: string }[] = [
  { label: "Change scenes", detail: "Split, merge, reorder or delete any scene." },
  { label: "Edit scene text", detail: "Rewrite the line; the timing follows the new narration." },
  { label: "Replace visuals", detail: "Search again, pick another result or drop in your own file." },
  { label: "Change voices", detail: `Any of ${LIVE_COUNTS.voices} narrators, for one scene or all of them.` },
  { label: "Change captions", detail: "Style, size, position, colours, word-by-word or line-by-line." },
  { label: "Adjust sound", detail: "Music level, ducking, effects and narration ambience." },
  { label: "Change effects", detail: "Filters, motion, transitions, intro and outro." },
  { label: "Render again", detail: "Preview and re-render as often as you like; nothing is one-shot." },
];

/* ---------------------------------------------------------------- messages */

/** Spec §33 — short, plain, no guarantees. */
export const MESSAGES = {
  hero: "Create videos from your ideas.",
  heroSub:
    "A script or an audio file becomes scenes, researched visuals, narration, captions and a finished file \u2014 and every step stays yours to change.",
  scenes: "Turn your script into scenes.",
  visuals: "Find visuals that fit the story.",
  voice: "Give every scene a voice.",
  captions: "Add captions that match your style.",
  studio: "Finish your video in Video Studio.",
  render: "Preview. Adjust. Perfect. Export.",
  control: "You stay in control.",
} as const;

/* ------------------------------------------------- the first five worries */

export interface CommonQuestion {
  id: string;
  /** The worry in the visitor's own words. */
  question: string;
  /** One true sentence. The page must not need the click to be reassuring. */
  answer: string;
  /** The id of the section that explains it properly. */
  section: string;
  /** What the link promises. */
  cue: string;
}

/**
 * What people want to know before they will read anything else.
 *
 * Each one is a real objection, answered in one line here and properly by the
 * section it points at — so the band at the top of the page is a table of
 * contents for doubts rather than a list of features. `tests/marketing.test.ts`
 * checks that every `section` is a section the page actually renders.
 */
export const COMMON_QUESTIONS: CommonQuestion[] = [
  {
    id: "credits",
    question: "Will this cost me credits or tokens?",
    answer:
      "No. Nothing in Scenering is metered — there is no balance to top up, no cost per video and no word count.",
    section: "no-meter",
    cue: "Why there is no meter",
  },
  {
    id: "face",
    question: "Do I have to show my face?",
    answer:
      "No. Every video Scenering makes is faceless: real footage, a narrator and captions. You are never on camera.",
    section: "examples",
    cue: `See ${EXAMPLE_VIDEOS.length} examples`,
  },
  {
    id: "voice",
    question: "I don't want to record my own voice.",
    answer: `You don't have to. Choose one of ${LIVE_COUNTS.voices} narrators, hear it read your line, then narrate the whole project.`,
    section: "voice",
    cue: "Hear the narrators",
  },
  {
    id: "pictures",
    question: "Where do the pictures come from — may I use them?",
    answer:
      "From free photo libraries: Pexels, Pixabay and Wikimedia Commons. Every library your video used is listed in an attribution document that downloads with it.",
    section: "sources",
    cue: "See the sources",
  },
  {
    id: "editing",
    question: "I have never edited a video.",
    answer: `You work through ${WORKFLOW_STAGES.length} steps and the first version is made for you. Change what you want; leave the rest.`,
    section: "workflow",
    cue: "Walk through it",
  },
];

/* ------------------------------------------------------------- no metering */

/**
 * Why there is no counter — the honest version.
 *
 * Every line here is a statement about the code, and the tests check the code
 * still matches: the script is divided by `splitScriptIntoScenes()`, the search
 * terms come from `topic-extract.ts` (which says in its own header that no NLP
 * model is available), the pictures are photographs fetched from stock
 * libraries, and the render runs on the visitor's own machine.
 *
 * What we must NOT say is "no AI anywhere": the narrators are neural
 * text-to-speech spoken by Gemini, using the customer's own free Google AI
 * Studio key. That is speech synthesis, not a model writing the video, and
 * it is spelled out rather than hidden.
 */
export const NO_METER = {
  message: "No credits. No tokens. No counter.",
  lead:
    "There is no language model at the centre of Scenering — nothing writes your script or invents your pictures, so there is nothing to meter.",
  points: [
    {
      label: "Your script stays your script",
      detail:
        "It is divided into scenes by counting words and respecting sentence endings. Nothing rewrites it.",
    },
    {
      label: "The pictures are photographs",
      detail:
        "Search terms come from the scene's own nouns and names, and real photographs are fetched from free libraries.",
    },
    {
      label: "The narration uses your own free Google key",
      detail:
        "The narrators are neural text-to-speech voices spoken with your own Google AI Studio key — free to create, and never metered by Scenering.",
    },
    {
      label: "The video is made on your machine",
      detail:
        "The render runs in your browser, frame by frame — no queue, no upload, no per-minute charge.",
    },
  ],
  caveat:
    "One exception, stated plainly: the voices are Google's Gemini narrators, and they speak with your own free Google AI Studio key — a key takes about a minute to get, costs nothing, and Scenering never charges or counts against it. That is text-to-speech, not a model writing your video, and everything else here — the scenes, the photographs, the render — works without any key at all.",
} as const;

/** Honest, repeated everywhere it matters. */
export const HONESTY = {
  demoLabel: "Example created for demonstration",
  conceptLabel: "Interface shown with example project data",
  planLabel: "Paid checkout requires configured Lemon Squeezy credentials",
  localNote:
    "Your account controls membership while project media and frame-exact rendering remain in your browser. Preview renders do not use final-export allowance.",
} as const;
