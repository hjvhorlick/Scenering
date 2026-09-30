/**
 * The demonstration project.
 *
 * Every interface on the public website is filled with this one fictional
 * project, so a visitor scrolling the page follows a single story instead of
 * a dozen unrelated screenshots: a short faceless documentary about why old
 * cities sit where they sit.
 *
 * It is invented content. No customer data, no real project, no claim that
 * anybody published it — the page labels it as a demonstration wherever it
 * could be mistaken for a case study.
 */
import { CAPTION_STYLES } from "../data/caption-styles";
import { STUDIO_VOICE_PRESETS } from "../data/voice-presets";

export interface DemoScene {
  /** "01" … "05" */
  number: string;
  /** The line of script this scene covers. */
  text: string;
  /** What the narrator says (the same words here — Scenering lets them differ). */
  caption: string;
  /** Seconds, as generated from the narration. */
  duration: number;
  /** Registry id of the still that was chosen for this scene. */
  assetId: string;
  /** The search this scene's words produced. */
  query: string;
  /** Which configured source the still came from. */
  source: string;
  /** Camera movement chosen for the scene. */
  motion: string;
}

export const DEMO_PROJECT = {
  title: "Where Cities Begin",
  format: "16:9" as const,
  resolution: "1080p",
  fps: 30,
  pacing: "Scene length follows narration",
  script: [
    "Long before maps or borders, people were already choosing where to live.",
    "A river meant drinking water, transport, and fields that could be planted twice.",
    "When the river was not enough, people built for it — wells, channels and aqueducts.",
    "Ancient cities developed around reliable sources of water.",
    "Look at a map of the oldest cities in the world, and you are looking at a map of water.",
  ],
};

export const DEMO_SCENES: DemoScene[] = [
  {
    number: "01",
    text: "Long before maps or borders, people were already choosing where to live.",
    caption: "Long before maps, people chose where to live.",
    duration: 9.6,
    assetId: "scene.01",
    query: "river valley dawn mist aerial",
    source: "Pexels",
    motion: "Slow zoom",
  },
  {
    number: "02",
    text: "A river meant drinking water, transport, and fields that could be planted twice.",
    caption: "A river meant water, transport and food.",
    duration: 11.2,
    assetId: "scene.02",
    query: "terraced fields irrigation channels",
    source: "Pexels",
    motion: "Pan right",
  },
  {
    number: "03",
    text: "When the river was not enough, people built for it — wells, channels and aqueducts.",
    caption: "When the river ran short, they built for it.",
    duration: 8.8,
    assetId: "scene.03",
    query: "ancient stone aqueduct arches valley",
    source: "Wikimedia Commons",
    motion: "Ken Burns",
  },
  {
    number: "04",
    text: "Ancient cities developed around reliable sources of water.",
    caption: "Reliable water shaped early settlements.",
    duration: 7.4,
    assetId: "scene.04",
    query: "ancient city ruins riverbank",
    source: "Pexels",
    motion: "Slow zoom",
  },
  {
    number: "05",
    text: "Look at a map of the oldest cities in the world, and you are looking at a map of water.",
    caption: "A map of old cities is a map of water.",
    duration: 10.5,
    assetId: "scene.05",
    query: "old harbour town golden hour",
    source: "Pixabay",
    motion: "Pan left",
  },
];

export const DEMO_TOTAL_SECONDS = DEMO_SCENES.reduce((sum, scene) => sum + scene.duration, 0);

/** mm:ss for a duration in seconds. */
export function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The narrator the demonstration project uses — a real entry in the catalogue. */
export const DEMO_VOICE =
  STUDIO_VOICE_PRESETS.find((voice) => voice.id === "ryan") ?? STUDIO_VOICE_PRESETS[0];

/** A second narrator, for the two-person dialogue example (spec §10). */
export const DEMO_SECOND_VOICE =
  STUDIO_VOICE_PRESETS.find((voice) => voice.id === "aria") ??
  STUDIO_VOICE_PRESETS.find((voice) => voice.gender === "female") ??
  STUDIO_VOICE_PRESETS[1];

/** The caption style the demonstration project uses. */
export const DEMO_CAPTION_STYLE =
  CAPTION_STYLES.find((style) => style.id === "newsroom_clean") ?? CAPTION_STYLES[0];

/**
 * What scene 03's search returned. Three results have artwork; the rest are
 * drawn as ranked slots, which is also what the studio shows while thumbnails
 * are still loading.
 */
export interface DemoSearchResult {
  assetId?: string;
  label: string;
  size: string;
  source: string;
  /** Passed the photographic / 16:9 / ≥1920×1080 gate. */
  accepted: boolean;
  /** Why it was rejected, if it was. */
  reason?: string;
  selected?: boolean;
}

export const DEMO_SEARCH_RESULTS: DemoSearchResult[] = [
  { assetId: "scene.03", label: "Aqueduct across a dry valley", size: "3840 × 2160", source: "Wikimedia Commons", accepted: true, selected: true },
  { assetId: "search.canal", label: "Stone canal between buildings", size: "2400 × 1350", source: "Pexels", accepted: true },
  { assetId: "search.well", label: "Well in a sunlit courtyard", size: "1920 × 1080", source: "Pexels", accepted: true },
  { assetId: "search.oasis", label: "Oasis pool and palms", size: "2048 × 1152", source: "Pixabay", accepted: true },
  { label: "Aqueduct diagram", size: "1400 × 900", source: "Wikimedia Commons", accepted: false, reason: "Not photographic" },
  { label: "Arches, portrait crop", size: "1080 × 1350", source: "Pixabay", accepted: false, reason: "Wrong shape for 16:9" },
];

/** The dialogue example shown on the voice section. */
export const DEMO_DIALOGUE: { speaker: string; voiceId: string; line: string; seconds: number }[] = [
  { speaker: "Narrator", voiceId: DEMO_VOICE.id, line: "So the city did not choose the river.", seconds: 3.1 },
  { speaker: "Second voice", voiceId: DEMO_SECOND_VOICE.id, line: "The river chose the city.", seconds: 2.4 },
];

/**
 * Music and effect entries on the demonstration timeline.
 *
 * Every `id` here is a real entry in the app's catalogues and every `name` is
 * that entry's real name — `tests/marketing.test.ts` looks each one up and
 * fails if the website starts advertising an effect the studio does not have.
 * The ids are also what the live previews render, so the page shows the
 * actual sticker, badge and grade named here.
 */
export const DEMO_TIMELINE_EXTRAS = {
  music: { id: "gentle_reflection", name: "Gentle Reflection", detail: "Ducked under narration" },
  soundEffect: { id: "ting", name: "Ting Bell Chime", at: 18.4 },
  cta: { id: "youtube_subscribe", name: "YouTube — Subscribe", from: 38, to: 46 },
  sticker: { id: "arrow", name: "Pointer", from: 12, to: 16 },
  lowerThird: { id: "lt_broadcast_bar", name: "Broadcast Bar", from: 1.5, to: 6 },
  filter: {
    id: "golden_hour",
    name: "Golden Hour Glow",
    /**
     * The grade itself, as the app computes it. Copied rather than imported
     * so the website's first paint does not carry the filter catalogue;
     * `tests/marketing.test.ts` checks it against getFilterCss() and fails if
     * the preset is ever retuned.
     */
    css: "sepia(0.432) saturate(1.600) contrast(1.216) brightness(1.072) hue-rotate(-6.3deg)",
  },
  transition: { id: "crossfade", name: "Crossfade" },
};
