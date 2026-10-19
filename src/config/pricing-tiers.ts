import { PLAN_CONFIG, PLAN_ORDER, type PlanSlug } from "./plans";

/**
 * One editable row of the pricing page. The names, descriptions and
 * feature lists live here so a plan change is a one-line edit; the
 * Paddle price ids are filled in by the server from the environment
 * (PADDLE_*_PRICE_ID), so prices can be changed in Paddle without a
 * redeploy. An empty priceId means the tier is not sold through
 * Paddle — Free is signed up for, not bought.
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
  PADDLE_SCENEFLOW_MONTHLY_PRICE_ID: [
    "PADDLE_SCENEFLOW_MONTHLY_PRICE_ID",
    "PADDLE_PRICE_ID_SCENEFLOW_MONTHLY",
    "PADDLE_PRICE_ID_SCEENFLOW_MONTHLY",
  ],
  PADDLE_SCENEFLOW_YEARLY_PRICE_ID: [
    "PADDLE_SCENEFLOW_YEARLY_PRICE_ID",
    "PADDLE_SCENEFLOW_ANNUAL_PRICE_ID",
    "PADDLE_PRICE_ID_SCENEFLOW_YEARLY",
    "PADDLE_PRICE_ID_SCENEFLOW_ANNUAL",
    "PADDLE_PRICE_ID_SCEENFLOW_YEARLY",
    "PADDLE_PRICE_ID_SCEENFLOW_ANNUAL",
  ],
  PADDLE_SCENEFORGE_MONTHLY_PRICE_ID: [
    "PADDLE_SCENEFORGE_MONTHLY_PRICE_ID",
    "PADDLE_PRICE_ID_SCENEFORGE_MONTHLY",
    "PADDLE_PRICE_ID_SCEENFORGE_MONTHLY",
  ],
  PADDLE_SCENEFORGE_YEARLY_PRICE_ID: [
    "PADDLE_SCENEFORGE_YEARLY_PRICE_ID",
    "PADDLE_SCENEFORGE_ANNUAL_PRICE_ID",
    "PADDLE_PRICE_ID_SCENEFORGE_YEARLY",
    "PADDLE_PRICE_ID_SCENEFORGE_ANNUAL",
    "PADDLE_PRICE_ID_SCEENFORGE_YEARLY",
    "PADDLE_PRICE_ID_SCEENFORGE_ANNUAL",
  ],
};

export function lookupPriceEnv(lookup: (name: string) => string | undefined, canonicalName: string): string {
  if (!canonicalName) return "";
  const candidates = PRICE_ENV_ALIASES[canonicalName] || [canonicalName];
  for (const key of candidates) {
    const val = String(lookup(key) || "").trim();
    if (val) return val;
  }
  return "";
}

/**
 * Builds the tier list from the plan configuration plus a lookup over
 * the server's environment variables (the Paddle price ids). Kept in
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
