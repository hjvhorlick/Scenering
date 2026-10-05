let _env: any = null;

export function setEnv(e: any) {
  _env = e;
}

export function env(): any {
  if (!_env) {
    throw new Error("Environment not initialized. Ensure the Worker entry point calls setEnv() first.");
  }
  return _env;
}

export type Env = {
  DB: D1Database;
  AUDIO_BUCKET: R2Bucket;
  RATE_LIMITS: KVNamespace;
  ASSETS: Fetcher;
  PUBLIC_APP_URL: string;
  EMAIL_PROVIDER: string;
  SESSION_SECRET: string;
  SCENERING_OWNER_EMAIL: string;
  GEMINI_API_KEY?: string;
  PEXELS_API_KEY?: string;
  PIXABAY_API_KEY?: string;
  // Matches the names already used in .env.example, src/config/plans.ts and
  // server/platform.ts's billing/webhook code — keeping the underscore here
  // means none of that code needs to change.
  LEMON_SQUEEZY_API_KEY?: string;
  LEMON_SQUEEZY_STORE_ID?: string;
  LEMON_SQUEEZY_WEBHOOK_SECRET?: string;
  LEMON_SQUEEZY_SCENEFLOW_MONTHLY_VARIANT_ID?: string;
  LEMON_SQUEEZY_SCENEFLOW_YEARLY_VARIANT_ID?: string;
  LEMON_SQUEEZY_SCENEFORGE_MONTHLY_VARIANT_ID?: string;
  LEMON_SQUEEZY_SCENEFORGE_YEARLY_VARIANT_ID?: string;
  LEMON_SQUEEZY_SCENEFLOW_MONTHLY_CHECKOUT_URL?: string;
  LEMON_SQUEEZY_SCENEFLOW_YEARLY_CHECKOUT_URL?: string;
  LEMON_SQUEEZY_SCENEFORGE_MONTHLY_CHECKOUT_URL?: string;
  LEMON_SQUEEZY_SCENEFORGE_YEARLY_CHECKOUT_URL?: string;
  // server/platform.ts also looks these env names up dynamically
  // (`env()[PLAN_CONFIG[slug].checkoutEnv[interval]]`) — keep the type
  // indexable so that keeps working without per-field plumbing.
  [key: string]: unknown;
};
