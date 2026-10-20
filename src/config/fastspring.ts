import { PLAN_CONFIG, PLAN_ORDER, type BillingInterval, type PlanSlug } from "./plans";

/**
 * FastSpring product paths — the four paid subscription products.
 *
 * A FastSpring product path is the identifier that appears in checkout
 * payloads and in every `subscription.*` webhook, so it is how a payment is
 * mapped back to a Scenering plan *and* interval. The defaults below match the
 * products created in the FastSpring app (`sceneflow-monthly`,
 * `sceneflow-yearly`, `sceneforge-monthly`, `sceneforge-yearly`); each one can
 * be renamed with an environment variable without a redeploy, matching the
 * FastSpring product paths in `src/config/pricing-tiers.ts`.
 *
 * Shared by the server (webhook mapping, checkout payloads) and the tests, so
 * the two can never disagree about which product is which plan.
 */

/** Environment variable holding the product path, per plan and interval. */
export const FASTSPRING_PRODUCT_PATH_ENV: Record<Exclude<PlanSlug, "free">, Record<BillingInterval, string>> = {
  sceneflow: {
    monthly: "FASTSPRING_SCENEFLOW_MONTHLY_PATH",
    yearly: "FASTSPRING_SCENEFLOW_YEARLY_PATH",
  },
  sceneforge: {
    monthly: "FASTSPRING_SCENEFORGE_MONTHLY_PATH",
    yearly: "FASTSPRING_SCENEFORGE_YEARLY_PATH",
  },
};

/** The product paths as created in the FastSpring app unless overridden. */
export const FASTSPRING_DEFAULT_PRODUCT_PATHS: Record<Exclude<PlanSlug, "free">, Record<BillingInterval, string>> = {
  sceneflow: { monthly: "sceneflow-monthly", yearly: "sceneflow-yearly" },
  sceneforge: { monthly: "sceneforge-monthly", yearly: "sceneforge-yearly" },
};

/** One row per sellable product: which plan and interval a path is. */
export interface FastSpringProductMapping {
  plan: Exclude<PlanSlug, "free">;
  interval: BillingInterval;
  path: string;
  /** The environment variable an operator would set to rename the path. */
  pathEnv: string;
  /** True when the path came from the environment rather than the default. */
  fromEnvironment: boolean;
}

/**
 * The effective product path for one plan and interval: whatever the
 * environment names, or the default `sceneflow-monthly`-style path.
 */
export function fastspringProductPath(
  lookup: (name: string) => string | undefined,
  plan: Exclude<PlanSlug, "free">,
  interval: BillingInterval,
): string {
  const configured = String(lookup(FASTSPRING_PRODUCT_PATH_ENV[plan][interval]) || "").trim();
  return configured || FASTSPRING_DEFAULT_PRODUCT_PATHS[plan][interval];
}

/**
 * Every sellable product, in plan order. Exactly one path per plan and
 * interval — a path configured for two products keeps its first mapping, so
 * a copy-paste mistake cannot make one purchase count twice.
 */
export function fastspringProductMappings(lookup: (name: string) => string | undefined): FastSpringProductMapping[] {
  const seen = new Set<string>();
  const rows: FastSpringProductMapping[] = [];
  for (const plan of PLAN_ORDER.slice(1) as Exclude<PlanSlug, "free">[]) {
    for (const interval of ["monthly", "yearly"] as const) {
      const pathEnv = FASTSPRING_PRODUCT_PATH_ENV[plan][interval];
      const configured = String(lookup(pathEnv) || "").trim();
      const path = configured || FASTSPRING_DEFAULT_PRODUCT_PATHS[plan][interval];
      if (seen.has(path)) continue;
      seen.add(path);
      rows.push({ plan, interval, path, fromEnvironment: Boolean(configured), pathEnv });
    }
  }
  return rows;
}

/**
 * Which Scenering plan and interval a FastSpring product path is. The paths
 * are configuration rather than code, so a product renamed in the FastSpring
 * app becomes a purchasable plan here by setting one variable.
 */
export function planForFastSpringProduct(
  productPath: string,
  lookup: (name: string) => string | undefined,
): { plan: Exclude<PlanSlug, "free">; interval: BillingInterval } | null {
  const wanted = String(productPath || "").trim();
  if (!wanted) return null;
  for (const row of fastspringProductMappings(lookup)) {
    if (row.path === wanted) return { plan: row.plan, interval: row.interval };
  }
  return null;
}

/**
 * The `tags` FastSpring carries through checkout onto every webhook — the
 * FastSpring half of "which Scenering account paid". The server sets these
 * when it opens checkout (popup or session); the buyer cannot edit them.
 */
export function fastspringCheckoutTags(userId: string, email: string): Record<string, string> {
  return { user_id: String(userId || ""), email: String(email || "").trim().toLowerCase() };
}

/** Plan display names for checklists and admin screens. */
export function fastspringPlanName(plan: Exclude<PlanSlug, "free">): string {
  return PLAN_CONFIG[plan].name;
}
