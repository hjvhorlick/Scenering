import { httpServerHandler } from "cloudflare:node";
import { createApp } from "./server";
import { setEnv } from "./src/env";
import type { Env } from "./src/env";
import { audioStore } from "./src/audio-store";

// Express has no native `fetch(Request): Response` interface — it only
// understands Node's `(req: IncomingMessage, res: ServerResponse)` pair.
// `httpServerHandler` (from `cloudflare:node`) is Cloudflare's supported
// bridge: it runs the Express app as a real `http.Server` inside the
// Worker and translates Fetch `Request`/`Response` objects to and from it.
// Requires the `nodejs_compat` compatibility flag (compatibility_date
// 2024-09-23+) — see wrangler.jsonc.
const PORT = 8080;

// Built lazily, on the first request, rather than at module scope: `env()`
// throws until `setEnv()` has run, and `createApp()` (via server/platform.ts)
// may read env-derived config (session secret, etc.) while wiring up routes.
// Module-scope code runs once per isolate at cold start, before any `env`
// is available, so the app must not be constructed until after `setEnv`.
let nodeHandler: ReturnType<typeof httpServerHandler> | null = null;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Bindings (D1/R2/KV) and vars/secrets are only reachable as the `env`
    // argument here, not via `process.env`. Stash them so every module in
    // the app (server.ts, server/platform.ts, ...) can read them through
    // `env()` instead of threading `env` through every function call.
    setEnv(env);

    if (!nodeHandler) {
      const app = createApp();
      app.listen(PORT);
      nodeHandler = httpServerHandler({ port: PORT });
    }

    return nodeHandler.fetch!(request as any, env, ctx);
  },

  // Cron Trigger (see wrangler.jsonc's `triggers.crons`): sweeps custom
  // voice-import uploads whose 24h retention window has passed — the R2
  // object and its D1 bookkeeping row. This is the only expiry path for
  // that storage; there is no per-request sweep on Workers the way the old
  // JSON-file server had one.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    setEnv(env);
    ctx.waitUntil(audioStore.cleanupExpired());
  },
} satisfies ExportedHandler<Env>;
