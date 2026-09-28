/**
 * Marketing asset registry — the single place the public website looks up a
 * visual.
 *
 * WHY THIS EXISTS
 * ---------------
 * Most of what the website shows is the product interface, drawn in code from
 * the same catalogues the application uses (see product-facts.ts). The rest is
 * photography: the stills a demonstration project would have found through
 * image search, and posters for the example videos.
 *
 * Every one of those visuals is registered here with its dimensions, alt text
 * and — importantly — its *status*:
 *
 *   "brand"       the product's own mark
 *   "rendered"    drawn live by a React component from real app data
 *   "concept"     original artwork made for the website, standing in for
 *                 something the application will later show for real
 *   "screenshot"  a genuine capture of the application
 *   "recording"   a genuine screen recording of the application
 *   "pending"     registered, artwork not in the repository yet — the site
 *                 renders a labelled placeholder instead of a broken image
 *
 * Swapping conceptual artwork for a real screenshot is therefore a data edit:
 * drop the file in `assets-src/marketing/`, run `npm run marketing:assets`,
 * change `status` to "screenshot". No section has to be redesigned.
 *
 * FILE NAMING
 * -----------
 * `file: "scene-01-river-dawn"` resolves to
 *   /marketing/scene-01-river-dawn-640.webp   (phones, thumbnails)
 *   /marketing/scene-01-river-dawn-1280.webp  (everything else)
 * built by scripts/optimize-marketing-assets.mjs.
 */

/** The groups named in the website specification. */
export type MarketingAssetGroup =
  | "hero"
  | "workflow"
  | "scenes"
  | "visual_research"
  | "voice_over"
  | "captions"
  | "video_studio"
  | "effects"
  | "free_plan"
  | "sceneflow"
  | "sceneforge"
  | "outputs"
  | "examples";

export const MARKETING_ASSET_GROUPS: MarketingAssetGroup[] = [
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
];

export type AssetStatus = "rendered" | "concept" | "screenshot" | "recording" | "pending" | "brand";

export interface MarketingAsset {
  id: string;
  group: MarketingAssetGroup;
  /** Basename in public/marketing (omit for "rendered" entries). */
  file?: string;
  /** Widths actually encoded for `file`. */
  widths?: number[];
  /** Intrinsic size of the artwork — reserves layout space, no CLS. */
  width: number;
  height: number;
  /** Always required: the website must be usable with images switched off. */
  alt: string;
  status: AssetStatus;
  /**
   * For "rendered" entries: the component that draws it, so a future
   * screenshot swap is obvious. For photography: what the still depicts.
   */
  note?: string;
  /**
   * Optional muted demonstration clip. When present the site prefers it over
   * the still, lazily and without sound; nothing depends on playback.
   */
  video?: { src: string; poster?: string };
}

/** 16:9 artwork as generated. */
const W = 1376;
const H = 768;
const PHOTO_WIDTHS = [640, 1280];

const photo = (
  id: string,
  group: MarketingAssetGroup,
  file: string,
  alt: string,
  note: string
): MarketingAsset => ({
  id,
  group,
  file,
  widths: PHOTO_WIDTHS,
  width: W,
  height: H,
  alt,
  status: "concept",
  note,
});

const rendered = (
  id: string,
  group: MarketingAssetGroup,
  alt: string,
  note: string
): MarketingAsset => ({
  id,
  group,
  width: W,
  height: H,
  alt,
  status: "rendered",
  note,
});

const pending = (
  id: string,
  group: MarketingAssetGroup,
  alt: string,
  note: string
): MarketingAsset => ({
  id,
  group,
  width: W,
  height: H,
  alt,
  status: "pending",
  note,
});

export const MARKETING_ASSETS: MarketingAsset[] = [
  // --------------------------------------------------------------- brand
  {
    id: "brand.showpiece",
    group: "hero",
    file: "hero-showpiece",
    widths: [1024, 512],
    width: 1024,
    height: 1024,
    alt:
      "The Scenering wordmark under a gold ring, surrounded by the pieces of a video: " +
      "four landscape photographs fanned out like dealt cards, a clapperboard, a player " +
      "panel with a play button, a strip of film carrying more photographs, and a " +
      "microphone beside a bank of audio level bars.",
    status: "concept",
    note: "Key art for the top of the page — the parts of a finished video, drawn as one object",
  },
  {
    id: "brand.mark",
    group: "hero",
    file: "mark-scenering",
    widths: [120, 240],
    width: 480,
    height: 152,
    alt: "Scenering",
    status: "brand",
    note: "The product wordmark, encoded small for the website (the studio uses the full-size PNG)",
  },

  // ---------------------------------------------------------------- hero
  rendered(
    "hero.workspace",
    "hero",
    "The Scenering workspace: a script on the left, five scene cards with thumbnails and durations in the middle, a narration waveform, captions and a timeline below, and the finished video previewing on the right.",
    "Drawn by marketing/sections/Hero.tsx from the demo project"
  ),
  rendered(
    "hero.transformation",
    "hero",
    "One scene turning from a line of script into a visual, a narration waveform, a caption and a finished shot.",
    "Drawn by marketing/components/SceneTransformation.tsx"
  ),

  // ------------------------------------------------------------ workflow
  rendered(
    "workflow.stage_panels",
    "workflow",
    "The six steps of the Scenering workflow — script, scenes and their visuals, voice over, captions, Video Studio and render — each with its own interface panel.",
    "Drawn by marketing/sections/IdeaToVideo.tsx"
  ),

  // -------------------------------------------------------------- scenes
  rendered(
    "scenes.board",
    "scenes",
    "The Scenes screen: one card per scene with its script text, chosen visual, duration, narration state and a Replace control.",
    "Drawn by marketing/sections/ScenesSection.tsx"
  ),
  photo(
    "scene.01",
    "scenes",
    "scene-01-river-dawn",
    "A wide river winding through a green valley at dawn, mist lying over the water.",
    "Scene 01 still of the demonstration project"
  ),
  photo(
    "scene.02",
    "scenes",
    "scene-04-irrigation",
    "Terraced hillside fields fed by stone irrigation channels in morning light.",
    "Scene 02 still of the demonstration project"
  ),
  photo(
    "scene.03",
    "scenes",
    "scene-03-aqueduct",
    "A tall stone aqueduct carrying water across a dry valley under a clear sky.",
    "Scene 03 still of the demonstration project"
  ),
  photo(
    "scene.04",
    "scenes",
    "scene-02-ancient-city",
    "Ancient stone ruins on a riverbank lit by late afternoon sun.",
    "Scene 04 still of the demonstration project"
  ),
  photo(
    "scene.05",
    "scenes",
    "scene-05-harbour",
    "An old stone harbour town at golden hour with small boats along the quay.",
    "Scene 05 still of the demonstration project"
  ),

  // ----------------------------------------------------- visual research
  rendered(
    "visual_research.flow",
    "visual_research",
    "The visual research flow: scene topic, search, ranked results, the selected visual and the scene preview.",
    "Drawn by marketing/sections/VisualResearch.tsx"
  ),
  photo(
    "search.well",
    "visual_research",
    "search-01-well",
    "An ancient stone well in a sunlit courtyard with a clay water jar beside it.",
    "Search result still"
  ),
  photo(
    "search.canal",
    "visual_research",
    "search-02-canal",
    "A narrow historic canal of clear water running between old stone buildings.",
    "Search result still"
  ),
  photo(
    "search.oasis",
    "visual_research",
    "search-03-oasis",
    "A desert oasis: palm trees around a still pool with dunes behind.",
    "Search result still"
  ),

  // ----------------------------------------------------------- voice over
  rendered(
    "voice_over.panel",
    "voice_over",
    "The Voiceover screen: a narrator picker, per-scene narration text, a waveform and the generated duration.",
    "Drawn by marketing/sections/VoiceSection.tsx from the real voice catalogue"
  ),

  // -------------------------------------------------------------- captions
  rendered(
    "captions.styles",
    "captions",
    "Caption styles previewed on a frame: classical, formal, modern, artsy and fun looks.",
    "Drawn by marketing/sections/CaptionsSection.tsx from src/data/caption-styles.ts"
  ),

  // ---------------------------------------------------------- video studio
  rendered(
    "video_studio.timeline",
    "video_studio",
    "The Video Studio: video preview above a timeline with scene, narration, music, sound effect, caption and effect tracks.",
    "Drawn by marketing/sections/VideoStudioSection.tsx"
  ),

  // -------------------------------------------------------------- effects
  rendered(
    "effects.library",
    "effects",
    "The effects library grouped into branding, engagement, text, motion, visual and audio categories.",
    "Drawn by marketing/sections/EffectsLibrary.tsx from the studio catalogue"
  ),

  // ----------------------------------------------------------------- plans
  rendered(
    "free_plan.workspace",
    "free_plan",
    "The Free workspace: the complete script-to-export workflow with the basic voice, caption and studio sets.",
    "Drawn by marketing/sections/Pricing.tsx"
  ),
  rendered(
    "sceneflow.workspace",
    "sceneflow",
    "The SceneFlow workspace: the Free workflow plus the full voice, caption, effect and music libraries.",
    "Drawn by marketing/sections/Pricing.tsx"
  ),
  rendered(
    "sceneforge.workspace",
    "sceneforge",
    "The SceneForge workspace: SceneFlow plus high-volume batch rendering and priority processing.",
    "Drawn by marketing/sections/Pricing.tsx"
  ),

  // --------------------------------------------------------------- outputs
  rendered(
    "outputs.formats",
    "outputs",
    "The same project framed for a 16:9 widescreen upload and for a 9:16 vertical upload.",
    "Drawn by marketing/sections/Formats.tsx"
  ),
  rendered(
    "outputs.devices",
    "outputs",
    "Scenering shown on a desktop screen, a tablet and a phone.",
    "Drawn by marketing/sections/Devices.tsx"
  ),

  // -------------------------------------------------------------- examples
  photo(
    "example.travel",
    "examples",
    "example-travel",
    "A winding coastal road along sea cliffs above turquoise water, seen from the air.",
    "Example video poster — travel"
  ),
  photo(
    "example.education",
    "examples",
    "example-education",
    "A tidy desk seen from above with an open notebook, a globe, pencils and a brass compass.",
    "Example video poster — education"
  ),
  pending(
    "example.inspiration",
    "examples",
    "Sunrise over a mountain ridge rising above a sea of cloud.",
    "Example video poster — inspiration"
  ),
  pending(
    "example.storytelling",
    "examples",
    "A lantern-lit forest path at dusk with mist between the trees.",
    "Example video poster — storytelling"
  ),
  pending(
    "example.business",
    "examples",
    "A modern glass office district photographed from above at blue hour.",
    "Example video poster — business"
  ),
  pending(
    "example.training",
    "examples",
    "A workshop bench from above with hand tools neatly arranged on pale wood.",
    "Example video poster — training"
  ),
  pending(
    "example.information",
    "examples",
    "A city grid at night from high above, street lights drawing bright lines.",
    "Example video poster — information"
  ),
  pending(
    "example.social",
    "examples",
    "A phone lying on a pastel desk beside a coffee cup, shot from above.",
    "Example video poster — social media"
  ),
];

const BY_ID = new Map(MARKETING_ASSETS.map((asset) => [asset.id, asset]));

export function getAsset(id: string): MarketingAsset | undefined {
  return BY_ID.get(id);
}

export function assetsInGroup(group: MarketingAssetGroup): MarketingAsset[] {
  return MARKETING_ASSETS.filter((asset) => asset.group === group);
}

/** Public URL for one encoded width. */
export function assetSrc(asset: MarketingAsset, width: number): string {
  return `/marketing/${asset.file}-${width}.webp`;
}

/**
 * The plain `src`, for a browser that ignores `srcset`.
 *
 * It has to name a width the asset was actually encoded at — most are
 * 640/1280, but the wordmark is 120/240 and the key art is 512/1024, and
 * asking for a 640 of either is a request for a file that does not exist.
 * Picks whichever encoded width is closest to the one wanted.
 */
export function assetSrcNear(asset: MarketingAsset, wanted: number): string {
  const widths = asset.widths ?? PHOTO_WIDTHS;
  const closest = widths.reduce((best, w) =>
    Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best,
  );
  return assetSrc(asset, closest);
}

/** `srcset` across every encoded width. */
export function assetSrcSet(asset: MarketingAsset): string {
  return (asset.widths ?? PHOTO_WIDTHS).map((w) => `${assetSrc(asset, w)} ${w}w`).join(", ");
}

/** True when there is a file on disk to show. */
export function assetHasArtwork(asset: MarketingAsset | undefined): asset is MarketingAsset {
  return Boolean(asset?.file);
}
