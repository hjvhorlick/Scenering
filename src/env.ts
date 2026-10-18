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
  /* Paddle Billing. Every one of these is a server-side secret or plain var —
     none of them is read by the browser bundle (nothing here is VITE_-prefixed),
     and Paddle.js is not loaded, so no client token is exposed either. See
     PADDLE.md for what each value is and where to get it. */
  /** "sandbox" or "live". Picks the API base URL:
   *  https://sandbox-api.paddle.com or https://api.paddle.com. */
  PADDLE_ENVIRONMENT?: string;
  /** "on" to refuse webhook deliveries from outside the source ranges Paddle
   *  publishes at GET /ips. Off by default: the HMAC signature is what
   *  authenticates a delivery, and the list is fetched rather than stored, so
   *  enabling this adds a runtime dependency on reaching Paddle. Fails open. */
  PADDLE_WEBHOOK_IP_ALLOWLIST?: string;
  /** How long a fetched source-range list is trusted, in milliseconds.
   *  Defaults to 24 hours. */
  PADDLE_IPS_REFRESH_MS?: string;
  /** Secret API key from the Paddle dashboard. Sent as
   *  `Authorization: Bearer` when the server creates a checkout transaction and
   *  when it reads a subscription's management URLs. Sandbox and live keys are
   *  different keys for different accounts. */
  PADDLE_API_KEY?: string;
  /** Webhook secret key shown when a notification destination is created.
   *  HMAC-SHA256 over `ts:rawBody`, compared against the `h1` part of the
   *  `Paddle-Signature` header. */
  PADDLE_WEBHOOK_SECRET?: string;
  /** Paddle price ids (`pri_…`), one per plan per interval. A webhook maps the
   *  purchased price back to a Scenering plan through these. */
  PADDLE_SCENEFLOW_MONTHLY_PRICE_ID?: string;
  PADDLE_SCENEFLOW_YEARLY_PRICE_ID?: string;
  PADDLE_SCENEFORGE_MONTHLY_PRICE_ID?: string;
  PADDLE_SCENEFORGE_YEARLY_PRICE_ID?: string;
  PADDLE_PRICE_ID_SCEENFLOW_MONTHLY?: string;
  PADDLE_PRICE_ID_SCEENFLOW_ANNUAL?: string;
  PADDLE_PRICE_ID_SCEENFORGE_MONTHLY?: string;
  PADDLE_PRICE_ID_SCEENFORGE_ANNUAL?: string;
  /** Approved checkout URLs (Paddle → Account settings → Checkout settings).
   *  Passed as `checkout.url` when the transaction is created, so Paddle hands
   *  back a link that already carries this purchase. */
  PADDLE_SCENEFLOW_MONTHLY_CHECKOUT_URL?: string;
  PADDLE_SCENEFLOW_YEARLY_CHECKOUT_URL?: string;
  PADDLE_SCENEFORGE_MONTHLY_CHECKOUT_URL?: string;
  PADDLE_SCENEFORGE_YEARLY_CHECKOUT_URL?: string;
  /** Client-side token (live_… or test_…) from Paddle → My account →
   *  Settings → Authentication → Client-side tokens. Public by design:
   *  it only opens checkout and previews prices. Served to the browser
   *  by /api/billing/public-config, never baked into the bundle. */
  PADDLE_CLIENT_TOKEN?: string;
  /** "sandbox" or "production" — the value Paddle.js expects, matching
   *  the token's environment. Read, never defaulted: the public-config
   *  endpoint refuses to answer when it is unset, so a misconfigured
   *  deployment cannot quietly open checkout against the wrong account. */
  PADDLE_CLIENT_ENVIRONMENT?: string;
  // server/platform.ts also looks these env names up dynamically
  // (`env()[PLAN_CONFIG[slug].checkoutEnv[interval]]`) — keep the type
  // indexable so that keeps working without per-field plumbing.
  [key: string]: unknown;
};
