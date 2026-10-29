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
  /** Optional Reply-To for outbound mail (transactional and marketing). */
  EMAIL_REPLY_TO?: string;
  /** Optional default for the owner's inbox address (the Email Centre
   *  settings take over once saved). Defaults to vincent@scenering.com. */
  INBOX_ADDRESS?: string;
  /** Optional Resend delivery-webhook signing secret (whsec_...). */
  RESEND_WEBHOOK_SECRET?: string;
  SESSION_SECRET: string;
  SCENERING_OWNER_EMAIL: string;
  PEXELS_API_KEY?: string;
  PIXABAY_API_KEY?: string;
  /** PayPal subscription development is restricted to the Sandbox API host. */
  PAYPAL_ENVIRONMENT?: "sandbox";
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_WEBHOOK_ID?: string;
  /** Preview-only opt-in for a single Sandbox checkout plan; ignored in production. */
  PAYPAL_PREVIEW_SINGLE_PLAN_MODE?: string;
  PAYPAL_SCENEFLOW_MONTHLY_PLAN_ID?: string;
  PAYPAL_SCENEFLOW_YEARLY_PLAN_ID?: string;
  PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID?: string;
  PAYPAL_SCENEFORGE_YEARLY_PLAN_ID?: string;
  // Plan IDs are selected from PLAN_CONFIG by the server.
  [key: string]: unknown;
};
