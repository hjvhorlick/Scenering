import { httpServerHandler } from "cloudflare:node";
import { createApp } from "./server";
import { redactDiagnosticError } from "./server/platform.ts";
import { setEnv } from "./src/env";
import type { Env } from "./src/env";
import { audioStore } from "./src/audio-store";
import { processEmailCampaignQueue } from "./server/email-centre.ts";
import { processEmailPrograms } from "./server/programs.ts";
import { handleInboundEmail } from "./server/inbox-core.ts";

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

    try {
      if (!nodeHandler) {
        const app = createApp();
        app.listen(PORT);
        nodeHandler = httpServerHandler({ port: PORT });
      }

      return await nodeHandler.fetch!(request as any, env, ctx);
    } catch (err) {
      nodeHandler = null;
      console.error(`[worker:error] ${redactDiagnosticError(err)}`);
      return new Response(
        JSON.stringify({
          error: "Service temporarily unavailable. Please try again shortly.",
          code: "WORKER_UNAVAILABLE",
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }
  },

  // Cron Triggers (see wrangler.jsonc's `triggers.crons`):
  //  - "0 * * * *"    sweeps custom voice-import uploads whose 24h
  //                    retention window has passed — the R2 object and its
  //                    D1 bookkeeping row. The only expiry path for that
  //                    storage; there is no per-request sweep on Workers
  //                    the way the old JSON-file server had one.
  //  - "*/5 * * * *"  drains the Email Centre's campaign queue: starts
  //                    scheduled campaigns whose time has arrived and sends
  //                    the next bounded batch of any campaign mid-send.
  //                    Large campaigns are therefore never pushed through
  //                    one long synchronous request — they are queued in D1
  //                    (email_deliveries rows) and drained a batch at a
  //                    time, inside each cron tick's limits. Then the
  //                    switched-on email programmes: new members are added
  //                    and the emails that are due go out, a few per tick
  //                    (server/programs.ts). One after the other, so a tick
  //                    never runs both at once.
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    setEnv(env);
    if (event.cron === "*/5 * * * *") {
      ctx.waitUntil(processEmailCampaignQueue().then(() => processEmailPrograms()));
      return;
    }
    ctx.waitUntil(audioStore.cleanupExpired());
  },

  // Email Routing: mail sent to the owner's Scenering address (for example
  // vincent@scenering.com) arrives here when the address's routing rule
  // is "Send to a Worker" → scenering. The message is stored in the Email
  // Centre inbox and a copy is forwarded to the owner's own mailbox; see
  // server/inbox-core.ts. Throwing tells the sending server delivery
  // failed, which only happens if the message could be neither stored nor
  // forwarded.
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    setEnv(env);
    await handleInboundEmail(message);
  },
} satisfies ExportedHandler<Env>;
