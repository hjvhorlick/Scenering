let _env: any = null;

export function setEnv(e: any) {
  _env = e;
}

export function env(): any {
  if (!_env) {
    if (typeof process !== "undefined" && process.env) {
      return process.env;
    }
    throw new Error("Environment not initialized. Ensure the Worker entry point calls setEnv() first.");
  }
  return _env;
}

// Fallback types for when @cloudflare/workers-types is not in the compilation unit (e.g. client tsconfig)
type WorkerD1Database = typeof globalThis extends { D1Database: infer T } ? T : any;
type WorkerKVNamespace = typeof globalThis extends { KVNamespace: infer T } ? T : any;
type WorkerR2Bucket = typeof globalThis extends { R2Bucket: infer T } ? T : any;
type WorkerFetcher = typeof globalThis extends { Fetcher: infer T } ? T : any;

export type Env = {
  DB: WorkerD1Database;
  RATE_LIMITS: WorkerKVNamespace;
  AUDIO_BUCKET?: WorkerR2Bucket;
  ASSETS: WorkerFetcher;
  PUBLIC_APP_URL: string;
  EMAIL_PROVIDER: string;
  RESEND_API_KEY?: string;
  SESSION_SECRET: string;
  SCENERING_OWNER_EMAIL: string;
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
