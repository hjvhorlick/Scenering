import { PLAN_CONFIG, PLAN_ORDER, type PlanSlug } from "./plans";

/**
 * Public plan catalogue shared by the marketing surfaces and PayPal Sandbox.
 * Prices and benefits come from PLAN_CONFIG; only public PayPal plan IDs are
 * read from server configuration. No provider credentials are exposed here.
 */
export interface Tier {
  id: PlanSlug;
  name: "Free" | "SceneFlow" | "SceneForge";
  description: string;
  features: string[];
  /** PayPal plan IDs are public identifiers only; secrets remain server-side. */
  planId: { monthly: string; yearly: string };
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

export function buildPricingTiers(lookup: (name: string) => string | undefined): Tier[] {
  return PLAN_ORDER.map((slug) => {
    const plan = PLAN_CONFIG[slug];
    return {
      id: slug,
      name: plan.name as Tier["name"],
      description: plan.description,
      features: TIER_FEATURES[slug],
      planId: {
        monthly: slug === "free" ? "" : String(lookup(plan.paypalPlanEnv.monthly) || "").trim(),
        yearly: slug === "free" ? "" : String(lookup(plan.paypalPlanEnv.yearly) || "").trim(),
      },
    };
  });
}
