import { migrateLegacyVoiceId } from "../data/voice-presets";

export type PlanSlug = "free" | "sceneflow" | "sceneforge";
export type BillingInterval = "monthly" | "yearly";

export type FeatureKey =
  | "scene_creation" | "visual_research" | "basic_voice" | "advanced_voice" | "dialogue_voice"
  | "basic_captions" | "premium_captions" | "basic_video_studio" | "full_video_studio"
  | "filters" | "text_templates" | "lower_thirds" | "cta" | "advanced_cta" | "stickers"
  | "camera_movements" | "background_music" | "sound_effects" | "sound_visualiser"
  | "voice_echo"
  | "special_effects" | "bulk_workflow" | "priority_processing" | "horizontal_output"
  | "vertical_output" | "final_export";

export interface PlanConfig {
  id: PlanSlug;
  name: string;
  description: string;
  prices: Record<BillingInterval, number>;
  annualMonthlyEquivalent: number;
  annualSaving: number;
  checkoutEnv: Record<BillingInterval, string>;
  variantEnv: Record<BillingInterval, string>;
  limits: {
    /** Null means no Scenering-imposed weekly export-count ceiling. */
    finalExportsPerWeek: number | null;
    shortExportsPerWeek: number | null;
    longExportsPerWeek: number | null;
    maxShortMinutes: number | null;
    maxLongMinutes: number | null;
    projectCapacity: number | null;
    visualResearchCapacity: "standard" | "expanded" | "high";
    voicePresets: number | null;
    captionStyles: number | null;
    backgroundMusicTracks: number | null;
    audioVisualiserStyles: number | null;
  };
  features: Readonly<Record<FeatureKey, boolean>>;
}

const FREE_FEATURES: Record<FeatureKey, boolean> = {
  scene_creation: true, visual_research: true, basic_voice: true, advanced_voice: false,
  dialogue_voice: false, voice_echo: false, basic_captions: true, premium_captions: false, basic_video_studio: true,
  full_video_studio: false, filters: false, text_templates: false, lower_thirds: false, cta: true,
  advanced_cta: false, stickers: false, camera_movements: false, background_music: true,
  sound_effects: false, sound_visualiser: true, special_effects: false, bulk_workflow: false,
  priority_processing: false, horizontal_output: true, vertical_output: true, final_export: true,
};
const PAID_FEATURES: Record<FeatureKey, boolean> = Object.fromEntries(
  Object.keys(FREE_FEATURES).map((key) => [key, true])
) as Record<FeatureKey, boolean>;

/**
 * Single source of truth for public pricing and server authorization.
 * Administrators can override this seed configuration through the plan records
 * described in the database migration; UI components must never duplicate it.
 */
export const PLAN_CONFIG: Readonly<Record<PlanSlug, PlanConfig>> = {
  free: {
    id: "free", name: "Free", description: "Test real creative tools and export two Shorts plus one long video every week — no payment required.",
    prices: { monthly: 0, yearly: 0 }, annualMonthlyEquivalent: 0, annualSaving: 0,
    checkoutEnv: { monthly: "", yearly: "" }, variantEnv: { monthly: "", yearly: "" },
    limits: { finalExportsPerWeek: 3, shortExportsPerWeek: 2, longExportsPerWeek: 1,
      maxShortMinutes: 1, maxLongMinutes: 5, projectCapacity: null, visualResearchCapacity: "standard",
      voicePresets: 2, captionStyles: 2, backgroundMusicTracks: 2, audioVisualiserStyles: 2 },
    features: FREE_FEATURES,
  },
  sceneflow: {
    id: "sceneflow", name: "SceneFlow", description: "All creative features with 15 final video downloads every week.",
    prices: { monthly: 19, yearly: 180 }, annualMonthlyEquivalent: 15, annualSaving: 48,
    checkoutEnv: { monthly: "LEMON_SQUEEZY_SCENEFLOW_MONTHLY_CHECKOUT_URL", yearly: "LEMON_SQUEEZY_SCENEFLOW_YEARLY_CHECKOUT_URL" },
    variantEnv: { monthly: "LEMON_SQUEEZY_SCENEFLOW_MONTHLY_VARIANT_ID", yearly: "LEMON_SQUEEZY_SCENEFLOW_YEARLY_VARIANT_ID" },
    limits: { finalExportsPerWeek: 15, shortExportsPerWeek: null, longExportsPerWeek: null,
      maxShortMinutes: null, maxLongMinutes: null, projectCapacity: null, visualResearchCapacity: "expanded",
      voicePresets: null, captionStyles: null, backgroundMusicTracks: null, audioVisualiserStyles: null },
    features: PAID_FEATURES,
  },
  sceneforge: {
    id: "sceneforge", name: "SceneForge", description: "All creative features with unlimited final downloads, subject to fetched/upstream API service limits.",
    prices: { monthly: 39, yearly: 372 }, annualMonthlyEquivalent: 31, annualSaving: 96,
    checkoutEnv: { monthly: "LEMON_SQUEEZY_SCENEFORGE_MONTHLY_CHECKOUT_URL", yearly: "LEMON_SQUEEZY_SCENEFORGE_YEARLY_CHECKOUT_URL" },
    variantEnv: { monthly: "LEMON_SQUEEZY_SCENEFORGE_MONTHLY_VARIANT_ID", yearly: "LEMON_SQUEEZY_SCENEFORGE_YEARLY_VARIANT_ID" },
    limits: { finalExportsPerWeek: null, shortExportsPerWeek: null, longExportsPerWeek: null,
      maxShortMinutes: null, maxLongMinutes: null, projectCapacity: null, visualResearchCapacity: "high",
      voicePresets: null, captionStyles: null, backgroundMusicTracks: null, audioVisualiserStyles: null },
    features: PAID_FEATURES,
  },
};

export const PLAN_ORDER: readonly PlanSlug[] = ["free", "sceneflow", "sceneforge"];

export function getPlanConfig(slug: string | null | undefined): PlanConfig {
  return PLAN_CONFIG[(slug && slug in PLAN_CONFIG ? slug : "free") as PlanSlug];
}

export function getEntitlements(slug: PlanSlug) { return PLAN_CONFIG[slug]; }
export function canPlanUseFeature(slug: PlanSlug, feature: FeatureKey): boolean { return PLAN_CONFIG[slug].features[feature]; }

export type ExportCreativeManifest = {
  features: FeatureKey[];
  voice: string;
  captionStyle: string;
  backgroundMusic: string[];
  audioVisualisers: string[];
  callsToAction: string[];
};

/**
 * Appended to a call-to-action's type in the export manifest when the creator
 * has restyled it in the button settings.
 *
 * Free includes ONE call to action: the standard animated Subscribe button,
 * as it ships. The settings panel can turn that button into any button at all
 * — another platform, new wording, new colours, a custom logo — and a
 * restyled button is a VIP button no matter which type it started life as.
 * The suffix is how the browser tells the server that happened, so the check
 * below can refuse it by exactly the same route as an unlisted platform.
 */
export const CUSTOMISED_CTA_SUFFIX = ":custom";

const FREE_CATALOG = {
  voices: ["speechify_male_01", "speechify_female_01"],
  captionStyles: ["newsroom_clean", "cinema_classic"],
  backgroundMusic: ["bgm_divider", "bgm_candlepower"],
  audioVisualisers: ["fine_radial_bars", "fine_radial_bars_3d"],
  callsToAction: ["cta_youtube_subscribe"],
} as const;

export function isPlanVoiceIncluded(slug: PlanSlug, voiceId: string): boolean {
  const normalized = migrateLegacyVoiceId(voiceId).toLowerCase();
  return slug !== "free" || FREE_CATALOG.voices.includes(normalized as (typeof FREE_CATALOG.voices)[number]);
}

export function isPlanCaptionIncluded(slug: PlanSlug, styleId: string): boolean {
  return slug !== "free" || FREE_CATALOG.captionStyles.includes(styleId.toLowerCase() as (typeof FREE_CATALOG.captionStyles)[number]);
}

export function isPlanCatalogItemIncluded(slug: PlanSlug, category: string, type: string): boolean {
  if (slug !== "free") return true;
  const normalized = type.toLowerCase();
  if (category === "logo") return true;
  if (category === "call_to_action") return FREE_CATALOG.callsToAction.includes(normalized as (typeof FREE_CATALOG.callsToAction)[number]);
  if (category === "background_music") return FREE_CATALOG.backgroundMusic.includes(normalized as (typeof FREE_CATALOG.backgroundMusic)[number]);
  if (category === "audio_visualizers") return FREE_CATALOG.audioVisualisers.includes(normalized as (typeof FREE_CATALOG.audioVisualisers)[number]);
  return false;
}

/** Shared final-export policy. Preview renders deliberately do not call this. */
export function validateExportCreativeManifest(slug: PlanSlug, manifest: ExportCreativeManifest): string | null {
  const plan = PLAN_CONFIG[slug];
  const deniedFeature = manifest.features.find((feature) => !plan.features[feature]);
  if (deniedFeature) return `${deniedFeature.replace(/_/g, " ")} is not included in ${plan.name}`;
  if (slug !== "free") return null;
  const allowed = (value: string, values: readonly string[]) => values.includes(value.toLowerCase());
  if (!isPlanVoiceIncluded("free", manifest.voice || "speechify_male_01")) return "This voice is outside the Free sample selection";
  if (!allowed(manifest.captionStyle || "newsroom_clean", FREE_CATALOG.captionStyles)) return "This caption style is outside the Free sample selection";
  if (manifest.backgroundMusic.some((value) => !allowed(value, FREE_CATALOG.backgroundMusic))) return "This music track is outside the Free two-track selection";
  if (manifest.audioVisualisers.some((value) => !allowed(value, FREE_CATALOG.audioVisualisers))) return "This audio visualiser is outside the Free sample selection";
  if (manifest.callsToAction.some((value) => !allowed(value, FREE_CATALOG.callsToAction)))
    return "Free final downloads include the standard animated Subscribe button only — other buttons, and buttons restyled in the button settings, are VIP";
  return null;
}
