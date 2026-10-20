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
  /* FastSpring Billing — Scenering's Merchant of Record. Server-side secrets
     (FASTSPRING_API_PASSWORD, FASTSPRING_WEBHOOK_SECRET) never leave the
     server; nothing here is VITE_-prefixed or baked into the browser bundle.
     The storefront path is public (it is the `data-storefront` of
     FastSpring's own snippet) and is served at runtime by
     /api/billing/public-config and /api/billing/checkout. See FASTSPRING.md
     for what each value is and where to get it. */
  /** Storefront path from FastSpring → Checkouts → Popup Checkouts →
   *  "Place on your Website" (`data-storefront`), e.g.
   *  `scenering.onfastspring.com/popup-scenering` or
   *  `scenering.test.onfastspring.com/popup-scenering`. The `.test.` in the
   *  host selects FastSpring's test environment. */
  FASTSPRING_STOREFRONT?: string;
  /** API username and password from FastSpring → Developer Tools → API.
   *  Used server to server to create checkout sessions and mint
   *  pre-authenticated Account Management links. */
  FASTSPRING_API_USERNAME?: string;
  FASTSPRING_API_PASSWORD?: string;
  /** The webhook's HMAC SHA256 Secret (FastSpring → Developer Tools →
   *  Webhooks). `X-FS-Signature` is HMAC-SHA256 over the raw request body,
   *  base64-encoded, keyed with this secret. */
  FASTSPRING_WEBHOOK_SECRET?: string;
  /** "popup" to open the Store Builder popup, "session" to redirect to a
   *  server-created session URL. Unset means session when the API keys are
   *  configured and popup otherwise. */
  FASTSPRING_CHECKOUT_MODE?: string;
  /** Product paths for the four paid subscription products, per plan and
   *  interval. Unset means `sceneflow-monthly`, `sceneflow-yearly`,
   *  `sceneforge-monthly`, `sceneforge-yearly`. */
  FASTSPRING_SCENEFLOW_MONTHLY_PATH?: string;
  FASTSPRING_SCENEFLOW_YEARLY_PATH?: string;
  FASTSPRING_SCENEFORGE_MONTHLY_PATH?: string;
  FASTSPRING_SCENEFORGE_YEARLY_PATH?: string;
  // server/platform.ts also looks these env names up dynamically
  // (`env()[PLAN_CONFIG[slug].priceEnv[interval]]`) — keep the type
  // indexable so that keeps working without per-field plumbing.
  [key: string]: unknown;
};
