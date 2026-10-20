import { FASTSPRING_DEFAULT_PRODUCT_PATHS, FASTSPRING_PRODUCT_PATH_ENV } from "./fastspring";
import { PLAN_CONFIG, PLAN_ORDER, type PlanSlug } from "./plans";

/**
 * One editable row of the pricing page. The names, descriptions and
 * feature lists live here so a plan change is a one-line edit; the
 * FastSpring product paths are filled in from the environment
 * (FASTSPRING_*_PATH) or their canonical defaults (`sceneflow-monthly`,
 * `sceneflow-yearly`, `sceneforge-monthly`, `sceneforge-yearly`). An empty
 * priceId means the tier is not sold through FastSpring — Free is signed up
 * for, not bought.
 */
export interface Tier {
  id: PlanSlug;
  name: "Free" | "SceneFlow" | "SceneForge";
  description: string;
  features: string[];
  priceId: { month: string; year: string };
}

export const TIER_FEATURES: Record<PlanSlug, string[]> = {
  free: [
    "2 × 1-minute Shorts each week",
    "1 × 5-minute long video each week",
    "2 voice presets and 2 caption styles",
    "Sample audio visualisers and 2 music tracks",
    "Animated Subscribe call to action",
  ],
  sceneflow: [
    "15 final video downloads each week",
    "All available voices and caption styles",
    "All Video Studio creative tools",
    "Expanded visual research",
    "Unlimited preview corrections",
  ],
  sceneforge: [
    "Unlimited final downloads, subject to fetched/upstream API service limits",
    "All available voices and caption styles",
    "All Video Studio creative tools",
    "High-capacity visual research",
    "Unlimited preview corrections",
  ],
};

export const PRICE_ENV_ALIASES: Record<string, readonly string[]> = {
  FASTSPRING_SCENEFLOW_MONTHLY_PATH: [
    "FASTSPRING_SCENEFLOW_MONTHLY_PATH",
  ],
  FASTSPRING_SCENEFLOW_YEARLY_PATH: [
    "FASTSPRING_SCENEFLOW_YEARLY_PATH",
    "FASTSPRING_SCENEFLOW_ANNUAL_PATH",
  ],
  FASTSPRING_SCENEFORGE_MONTHLY_PATH: [
    "FASTSPRING_SCENEFORGE_MONTHLY_PATH",
  ],
  FASTSPRING_SCENEFORGE_YEARLY_PATH: [
    "FASTSPRING_SCENEFORGE_YEARLY_PATH",
    "FASTSPRING_SCENEFORGE_ANNUAL_PATH",
  ],
};

export function lookupPriceEnv(lookup: (name: string) => string | undefined, canonicalName: string): string {
  if (!canonicalName) return "";
  const candidates = PRICE_ENV_ALIASES[canonicalName] || [canonicalName];
  for (const key of candidates) {
    const val = String(lookup(key) || "").trim();
    if (val) return val;
  }
  for (const slug of ["sceneflow", "sceneforge"] as const) {
    for (const interval of ["monthly", "yearly"] as const) {
      if (FASTSPRING_PRODUCT_PATH_ENV[slug][interval] === canonicalName) {
        return FASTSPRING_DEFAULT_PRODUCT_PATHS[slug][interval];
      }
    }
  }
  return "";
}

/**
 * Builds the tier list from the plan configuration plus a lookup over
 * the server's environment variables (the FastSpring product paths). Kept in
 * one place so the marketing page, the API response and the billing
 * code all describe the same three tiers.
 */
export function buildPricingTiers(lookup: (name: string) => string | undefined): Tier[] {
  return PLAN_ORDER.map((slug) => {
    const plan = PLAN_CONFIG[slug];
    return {
      id: slug,
      name: plan.name as Tier["name"],
      description: plan.description,
      features: TIER_FEATURES[slug],
      priceId: {
        month: lookupPriceEnv(lookup, plan.priceEnv.monthly),
        year: lookupPriceEnv(lookup, plan.priceEnv.yearly),
      },
    };
  });
}
