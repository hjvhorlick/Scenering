# Scenering on Cloudflare — Platform Compatibility Report

*Last verified 2026-10-06 against the current Cloudflare Workers documentation,
and executed end to end under the real workerd runtime (`wrangler dev`) with
every backend route exercised. See “Verification” at the bottom for the exact
matrix.*

**Verdict: the application is 100% Cloudflare-native.** It deploys as **one
Worker** (the Express API, bridged via `cloudflare:node`), **one static-asset
set** (`dist/`, served by Cloudflare's asset layer), **one D1 database**, **one
KV namespace**, **one R2 bucket** and **two Cron Triggers** (an hourly sweep
and a five-minute email-queue drain). Nothing needs
a Node.js server, a container, or any other host.

> **One plan requirement:** run it on the **Workers Paid** plan ($5/month).
> Password hashing (`scryptSync`) costs ~50–100 ms of CPU per register/login,
> and the Free plan caps CPU at **10 ms per invocation** — sign-up and sign-in
> would be killed with `Error 1102` under load. Paid allows 30 s (default) up
> to 5 min. Everything else on this page fits either plan.

---

## Branch previews

Workers Builds runs `npx wrangler preview` for every branch other than `main`
(there is no setting that turns this off). Wrangler 4.147+ requires a top-level
`previews` block for that command; without it the build stops with **“Your
Wrangler configuration is missing a `previews` block”** and suggests the block
to add.

Two things about that block are easy to get wrong, and both show up as a red
**Workers Builds** check on the branch while `main` stays green:

1. **The block must exist**, even when it is empty — a Previews-only setting,
   not a production one. `wrangler deploy` on `main` ignores it entirely.
2. **Every storage binding inside it must name a real resource.** A placeholder
   such as `SCENERING_D1_PREVIEW_ID_PLACEHOLDER` passes Wrangler's config check
   (it only rejects the literal `<REPLACE_ME>` it generates) and then fails when
   the preview is uploaded, so the build goes red anyway. Do not commit a
   preview id you have not created.

`wrangler.jsonc` therefore ships with a `previews` block that carries only
preview-safe vars (`EMAIL_PROVIDER=console`, no live storefront) and no storage
bindings. That is enough for `wrangler preview` to run:
a preview serves the site and `/api/health`, rate limiting fails open without
KV, and the database-backed routes answer with errors until storage exists.

To give previews their own database, sign in to Cloudflare and run these once
from the repository root:

```bash
bash scripts/setup-preview-resources.sh
npx wrangler preview base-config secret put SESSION_SECRET
```

The setup script creates `scenering-db-preview`, `rate-limits-preview`, and
`scenering-audio-preview`, applies the D1 migrations to the preview database,
and writes the three bindings between the `// setup-preview-resources:bindings`
markers inside the `previews` block — it never touches production bindings, and
re-running it is safe. Commit the resulting `wrangler.jsonc`; Workers Builds
reads the file from the branch, so previews only pick the storage up once the
change is on `main`. Keep the preview session secret separate from production;
it is set on the shared Previews base config, which every Preview inherits.

`tests/deploy-config.test.ts` guards all of this: the block is present, it
contains no placeholder ids, any storage it does carry is isolated from
production, and preview vars stay preview-safe. The production deploy-config
check still ignores `previews`, because previews are not part of a production
deploy.

## 1. How every backend function maps to Cloudflare

| Application function | Code | Cloudflare service | Status |
| --- | --- | --- | --- |
| Express 5 API (auth, billing, contact, admin, entitlements, usage, media) | `server.ts`, `server/platform.ts` | **Workers** — `httpServerHandler` from `cloudflare:node` runs the unmodified Express app inside the Worker (`worker.ts`) | ✅ verified |
| Accounts, sessions, verification/reset tokens, memberships, subscriptions, usage records, export reservations, complimentary grants/codes, webhook log, billing events, contacts, email preferences, admin settings | `src/db.ts` + `migrations/0001_init.sql` | **D1** (binding `DB`), applied with `wrangler d1 migrations apply` | ✅ verified |
| Rate limiting (all 25 limits) | `src/rate-limiter.ts` | **Workers KV** (binding `RATE_LIMITS`) | ✅ verified (see §3) |
| Custom voice-import uploads (≤ 20 MB each, 5 per user, 24 h retention) | `src/audio-store.ts`, `server.ts` | **R2** (binding `AUDIO_BUCKET`) for bytes + D1 for bookkeeping | ✅ verified |
| 24 h expiry sweep for those uploads | `worker.ts` `scheduled` handler | **Cron Trigger** — hourly, `triggers.crons` in `wrangler.jsonc` | ✅ verified |
| SPA shell + hashed bundles + `/sounds`, `/videos`, `/nature`, `/marketing` (221 MB, 151 files) | Vite build → `dist/` | **Workers Static Assets** with `single-page-application` fallback | ✅ verified |
| Bundled nature library from inside the API | `server.ts` proxy route | **`ASSETS` binding** (`env.ASSETS.fetch`) — no filesystem on Workers | ✅ verified |
| Narration (TTS) | Browser (`src/lib/speechify-client.ts`) | Direct browser `fetch` to Speechify; the customer's key never reaches the Worker | ✅ No Worker proxy; Simba 3.2 audio and speech marks; errors are surfaced with no alternate-provider or silent-audio fallback |
| Image search (Pexels / Pixabay / Wikimedia) | `server.ts` | Outbound `fetch` with 12 s timeouts + provider clamps | ✅ verified (nature-library fallback when no keys) |
| Email | `server/email.ts` | Resend HTTPS API in production (`EMAIL_PROVIDER=resend`, authenticated by the `RESEND_API_KEY` secret); `console` remains available for local development. SMTP is not available from Workers | ✅ |
| Email Centre — templates, consented audiences, campaigns, delivery history, unsubscribe/preferences pages | `server/email-centre.ts` | **D1** (templates/campaigns/deliveries, `migrations/0002_email_centre.sql`) + the Resend provider above. Large sends are queued as D1 delivery rows and drained **20 at a time by the five-minute Cron Trigger** (never one long request); delivery outcomes recorded from **Resend's webhook** at `/api/webhooks/resend` (HMAC-verified raw bytes, optional) | ✅ verified |
| Email Centre inbox — contact-form messages and email to the owner's address (vincent@scenering.com), answered from `/admin` → Inbox, with attachments, saved replies and owner alerts | `server/inbox.ts`, `server/inbox-core.ts`, `server/inbox-settings.ts`, `src/inbox-db.ts` | **Email Routing** → the Worker's `email()` handler (`worker.ts`) for incoming mail; **D1** (`migrations/0003_inbox.sql`, which the Worker also creates itself on first use); **R2** (`AUDIO_BUCKET`, `inbox/` prefix) for attachments; replies go out through the Resend provider above | ✅ verified locally (wrangler `/cdn-cgi/handler/email`); needs the one-time Email Routing setup in step 8 |
| Email Centre members and gift codes — the member list with plans and videos, free time given to one member, and shareable gift codes with their results (`/admin` → Members, Gifts) | `server/members.ts`, `server/gift-codes.ts`, `src/members-db.ts`, `src/gifts-db.ts` | **D1** (`migrations/0004_gift_codes.sql`, which the Worker also creates itself on first use); a used gift code is an ordinary complimentary grant, redeemed through the existing `/api/complimentary-codes/redeem` | ✅ verified locally |
| Email Centre programmes — emails that go out by themselves to each member at their own moment (after joining, before a gift ends) (`/admin` → Programmes) | `server/programs.ts`, `src/programs-db.ts` | **D1** (`migrations/0005_programs.sql`, created by the Worker on first use); run by the **five-minute Cron Trigger** after the campaign queue, at most 10 emails per run, through the Resend provider above | ✅ verified locally (wrangler `/cdn-cgi/handler/scheduled`) |
| Billing webhooks | `server/platform.ts` | Inbound HTTPS at `/api/webhooks/fastspring`, `X-FS-Signature` (HMAC-SHA256 base64 of `rawBody`) verified against raw bytes; outbound to `api.fastspring.com` for optional session checkouts and pre-authenticated Account Management links | ✅ verified (503/401 paths) |
| Scheduled email link expiry, token expiry | `src/db.ts` | D1, ISO-8601 comparisons (fixed — see §4) | ✅ verified |

The Express bridge is Cloudflare's supported path for Node frameworks: the
`node:http` **server** APIs (used by Express) run natively in workerd under
`nodejs_compat` with a compatibility date of **2025-08-15 or later** (this app
uses `2026-10-01`). `worker.ts` calls `app.listen(PORT)` — the port is a
routing key, not a socket — and `httpServerHandler({ port })` bridges Workers
requests into it. Docs: [Node.js HTTP on
Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/),
[Express on Workers announcement](https://blog.cloudflare.com/bringing-node-js-http-servers-to-cloudflare-workers/).

### Request routing (`assets.run_worker_first`)

```
browser ──▶ /api/* , /functions/v1/* , /robots.txt , /sitemap.xml ──▶ Worker (Express)
       └──▶ everything else ──▶ static assets from dist/ ──▶ miss? ──▶ index.html (SPA)
```

`/robots.txt` and `/sitemap.xml` **must** stay in `run_worker_first`: with the
SPA fallback they would otherwise be answered with `index.html` (HTTP 200,
`text/html`) and disappear from crawlers. The legacy `/functions/v1/*` paths
are kept routable for clients saved before the migration.

---

## 2. Limits audit — measured usage vs. platform ceilings

Figures from the Workers docs
([limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[KV writes](https://developers.cloudflare.com/kv/api/write-key-value-pairs/),
[R2 uploads](https://developers.cloudflare.com/r2/objects/upload-objects/)).

| Limit | Free plan | Paid plan | This app | Margin |
| --- | --- | --- | --- | --- |
| Worker size (uncompressed) | 64 MiB | 64 MiB | **2.2 MiB** (`wrangler deploy --dry-run`) | ~29× |
| Static asset files / version | 20,000 | 100,000 | **177** (build output) | ~113× |
| Static asset file size | 25 MiB | 25 MiB | **15.0 MiB** (`clair_de_lune.ogg`) | 1.7× |
| Static asset total size | — (per-file only) | — | 221 MB | ✅ |
| Memory per isolate | 128 MB | 128 MB | peak ≈ 50 MB transient (20 MB upload decode: ~27 MB JSON body + 20 MB buffer) | ~2.5× |
| CPU per HTTP request | **10 ms** | 30 s (→ 5 min) | scrypt ≈ 50–100 ms on register/login; typical API ≈ 1–5 ms | **Paid plan required** |
| CPU per cron trigger | 10 ms | 30 s (< 1 h interval) | sweep is I/O-bound (D1/R2 round trips); loop cost trivial | ✅ |
| Subrequests / invocation | 50 | 10,000 | worst case ≈ 6 (image search: 3 providers + Wikimedia batching); admin overview now **~10 total** (was ~10 × user count — see §4); an email-queue cron tick sends at most 20 + its D1 updates (per-tick budget) | ✅ |
| Simultaneous open connections | 6 | 6 | ≤ 4 concurrent D1 reads per request (`accountPayload`); admin overview now reads in one bounded batch | ✅ |
| Request body size | 100 MB (Cloudflare Free/Pro zone) | 200 MB (Business) | largest accepted upload ≈ 27 MB JSON (20 MB audio, base64) | ~3.7× |
| Response body size | no enforced limit | no enforced limit | TTS WAV ≤ ~7 MB (2,000 chars) | ✅ |
| Daily requests | 100,000/day | unlimited | — | plan-dependent |
| Cron triggers / account | 5 | 250 | **2** (hourly audio sweep + 5-min email queue) | ✅ |
| Env vars (secrets+vars) / Worker | 64 | 128 | **~25** (see `.dev.vars.example`) | ✅ |
| Env var size | 5 KB | 5 KB | longest is a checkout URL | ✅ |
| D1 database size | 500 MB | 10 GB | rows are small text; webhook payload is a trimmed JSON blob | ✅ |
| D1 queries / invocation | 50 (shared subrequest budget) | 1,000 | audited — every request path issues single-digit queries; admin overview ~10 | ✅ |
| D1 SQL statement length | 100 KB | 100 KB | longest statement ≈ 300 bytes | ✅ |
| D1 bound parameters / query | 100 | 100 | max used: 22 (subscription insert) | 4.5× |
| D1 string/row size | 2 MB | 2 MB | largest: contact message ≤ 10 KB, creative manifest ≤ ~10 KB | ✅ |
| D1 query duration | 30 s | 30 s | all queries are indexed point lookups / small scans | ✅ |
| KV writes to same key | **1 / second** | 1 / second | rate-limit counters — **handled** (see §3) | ✅ after fix |
| KV minimum TTL | 60 s | 60 s | all windows ≥ 900 s; shorter clamped to 60 | ✅ |
| KV value size | 25 MiB | 25 MiB | ≤ 4-digit counters | ✅ |
| R2 single `put()` | practical ~100 MB, max 5 GiB | same | 20 MB cap per upload (enforced in code) | ✅ |
| R2 object count | — | — | ≤ 5 per user, 24 h retention | ✅ |
| Startup time | 1 s | 1 s | Express app is built lazily on first request; measured cold start ≈ 0.5 s | ✅ |

Two subtleties worth knowing:

- **D1 queries count as subrequests.** Any endpoint that loops over users
  multiplying queries can break the free plan's 50-cap. The admin overview was
  the only such endpoint and has been rewritten (§4).
- **Six simultaneous connections** cap *concurrent* D1/KV/fetch calls per
  invocation. Exceeding it queues (it does not error), but it adds latency —
  another reason the overview was batched.

---

## 3. Rate limiting on KV — the trade-offs, stated plainly

Workers KV is an eventually consistent, globally replicated store with **at
most one write per second per key**. A naive counter (read, +1, write) breaks
in two ways under real traffic:

1. a burst on one endpoint (an image grid loading 20 thumbnails through
   `/api/proxy-image` in a second) exceeds the per-key write rate and KV
   returns 429 — which used to surface as an application **500**;
2. a read-modify-write race can under-count across isolates/locations.

`src/rate-limiter.ts` now:

- **spaces writes** to a given key ≥ 1 s apart per isolate, so bursts never
  hit the per-key write limit (the counter slightly under-counts instead);
- **fails open** on any KV error — rate limiting here is abuse mitigation, not
  a security boundary (the security-relevant accounting — final exports —
  lives in strongly consistent D1);
- **clamps TTLs** up to KV's 60-second minimum.

Residual, accepted behaviour (documented in code): counters are eventually
consistent, so a limit can be exceeded by a few requests when traffic spans
locations. If exact, global limits ever become a requirement, the right
Cloudflare primitive is a **Durable Object** per subject (or the experimental
[rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
whose windows are only 10 s / 60 s and therefore cannot express this app's
15-minute and hourly windows).

## 4. What this compatibility pass fixed

Each item below was a real failure mode found by auditing code against the
platform's documented behaviour, then re-verified under `wrangler dev`:

1. **The Cron Trigger was never configured.** `worker.ts` exports a
   `scheduled` handler whose comment says “see wrangler.jsonc's
   `triggers.crons`” — but no `triggers` block existed, so the 24 h audio
   sweep would never have run and R2/D1 would have filled with expired
   uploads forever. Added `"triggers": { "crons": ["0 * * * *"] }`.
2. **`/robots.txt` and `/sitemap.xml` were unreachable.** With
   `not_found_handling: "single-page-application"`, every non-asset path is
   answered with the SPA shell, so both Express routes were shadowed and
   crawlers would have received HTML. Both paths now run the Worker first.
3. **Legacy `/functions/v1/*` API paths were unreachable** for the same
   reason. Kept routable for pre-migration clients.
4. **KV rate-limit writes could 500 under bursts** (§3). Rewritten with
   write-spacing + fail-open + TTL clamping.
5. **Timestamp comparisons in D1 were wrong on the same UTC day.** Every
   “is this expired?” query compared stored ISO-8601 strings
   (`…T…Z`) against SQLite's `datetime('now')`
   (`… …`); on the same day the ISO string always sorts greater, so a
   1-hour password-reset token created at 10:00 was still accepted at 23:59,
   and expired sessions/verification tokens/grants/reservations lingered up
   to 24 h. All comparisons now bind a real UTC ISO string.
6. **The audio-expiry sweep had the same comparison bug** (`created_at <
   datetime('now', '-24 hours')`) — cleanup was delayed by up to a day. Now a
   bound ISO cutoff.
7. **The admin overview issued ~8–10 D1 queries per user, all concurrently** —
   over the free plan's 50-subrequest cap at ~6 users, and stalled on the
   6-connection limit long before that. Rewritten to a fixed ~10 queries with
   in-memory per-user assembly; response shape unchanged.
8. **Subscription and complimentary-grant API payloads left the server in the
   wrong case.** The D1 migration's row mappers return camelCase
   (`billingInterval`, `endsAt`), but the account modal — and the client
   generally — reads the API's snake_case contract (`billing_interval`,
   `ends_at`), so “Manage or cancel”, renewal dates and card details would
   never render, and redeemed-grant banners showed `Invalid Date`. Added
   explicit wire serializers (`apiSubscription`, `apiGrant`) at every
   endpoint that returns them.
9. **20 MB uploads decoded base64 character-by-character**
   (`Uint8Array.from(atob(...), c => c.charCodeAt(0))`) — hundreds of ms of
   CPU and several transient copies against the 10 ms/30 s CPU budget and the
   128 MB ceiling. Now `Buffer.from(base64, "base64")` (the module is
   server-only).
10. **`scripts/setup-cloudflare.sh` had a broken placeholder contract** — the
    KV `sed` targeted a placeholder the config file never contained, so the
    KV binding could silently point at the wrong namespace. Placeholders are
    now distinct per resource, the script is idempotent, applies migrations
    remotely *and* locally, and no longer swallows errors silently.
11. **The test suites for billing and social links had been broken by the
    migration** (they import the platform, which now needs D1/KV/R2
    bindings). A test-only bindings shim (`tests/platform-env.ts`) now runs
    the genuine `db.ts` SQL on Node's built-in SQLite against the real
    migration, so those behavioural suites exercise the same code the Worker
    runs. Stale source-text assertions were re-pinned to the current
    implementation. **All 48 suites pass**, including a new suite covering
    the KV-specific rate-limiter behaviours.
12. **`verify` now checks the Worker**, not just the client: both TypeScript
    projects, the tests, the production build, and a `wrangler deploy
    --dry-run` (which validates the bundle, bindings and config).

## 5. Residual notes (no action needed, by design)

- **Email sending** uses Resend's HTTPS API in production
  (`EMAIL_PROVIDER=resend`) and requires the server-side `RESEND_API_KEY`
  secret. Local development can select `console` to print verification/reset
  links without sending mail. Account and opt-in update messages use a shared,
  responsive Scenering HTML layout with inline styles and a plain-text fallback;
  verification and password-reset links are escaped and retain their one-time,
  expiring behavior.
- **`accountPayload` runs 4 D1 queries concurrently** (well within the 6-connection
  limit). A further micro-batch would save ~2 round trips per `/api/account`
  call; left alone deliberately to keep the diff small.
- **`Express + nodejs_compat` bridge limitations** (from Cloudflare's docs):
  no trailers, early hints or 1xx responses; TLS-specific server options are
  ignored; the http Agent is a no-op. None are used by this app.
- **Speechify Simba 3.2** is called directly from the customer's browser to
  `api.speechify.ai`. The Speechify key is read from this browser's local
  storage and is never sent to the Scenering API or Cloudflare Worker. The
  Worker has no Speechify key header or synthesis route. If Speechify refuses
  direct browser access (for example, due to CORS), the app reports that
  failure; it does not proxy the key or fall back to another provider or silent audio.
- **KV eventual consistency** (§3) — accepted for abuse mitigation.

## 6. Deploying

```bash
npm install
bash scripts/setup-cloudflare.sh   # creates D1 + R2 + KV, fills wrangler.jsonc, sets secrets
npm run deploy                     # vite build → wrangler deploy (assets + worker + cron)
```

`npm run deploy` and `npm run deploy:check` first run
`scripts/check-deploy-config.mjs`, which fails fast — locally, with an
actionable message — while `wrangler.jsonc` still contains
`SCENERING_*_PLACEHOLDER` resource ids or malformed binding ids. Without the
guard, a placeholder config only fails remotely, as the API's cryptic
`KV namespace '…' is not valid [10042]`.

Then:

1. **Custom domain** — in the Cloudflare dashboard, attach the zone (e.g.
   `scenering.com`) and add a Worker *Custom Domain* or route for it.
2. **`PUBLIC_APP_URL`** — set to the production origin (it is a plain var in
   `wrangler.jsonc`; override with `wrangler secret` if you prefer). It drives
   absolute links (verification emails, sitemap, webhook URL) and production
   origin checks.
3. **`SESSION_SECRET`** — ≥ 32 chars; production refuses to boot without it
   (the setup script generates one).
4. **`SCENERING_OWNER_EMAIL`** — the one address that receives the
   owner-admin role and SceneForge access at sign-in.
5. **FastSpring** — the full connection runbook is **[FASTSPRING.md](FASTSPRING.md)**;
   the shape of it:
   1. In FastSpring: create a popup storefront (`popup-scenering`) and set
      `"FASTSPRING_STOREFRONT"` in `wrangler.jsonc` (e.g.
      `scenering.test.onfastspring.com/popup-scenering` while testing,
      `scenering.onfastspring.com/popup-scenering` for live orders).
   2. Create the four subscription products (`sceneflow-monthly`,
      `sceneflow-yearly`, `sceneforge-monthly`, `sceneforge-yearly`).
   3. FastSpring → Developer Tools → Webhooks → add a URL webhook pointing at
      `https://<your-domain>/api/webhooks/fastspring`; subscribe to the six
      subscription events (`subscription.activated`, `subscription.updated`,
      `subscription.charge.completed`, `subscription.charge.failed`,
      `subscription.canceled`, `subscription.deactivated`); copy the HMAC
      SHA256 Secret into `FASTSPRING_WEBHOOK_SECRET`.
   4. (Optional) Set `FASTSPRING_API_USERNAME` and `FASTSPRING_API_PASSWORD`
      with `wrangler secret put` if you want server-created `/sessions`
      checkouts and pre-authenticated Account Management URLs.
   5. Sign in as the owner → **Account & Membership** — the go-live checklist
      must report ready, and shows the storefront environment, the exact
      webhook URL and the last 25 deliveries with their outcome. It warns out
      loud if a production deployment is still pointed at a `.test.` storefront.
6. **Resend** — campaign sends from the Email Centre use the same provider as
   transactional mail: set the `RESEND_API_KEY` secret
   (`EMAIL_PROVIDER=resend` is already the default var). Optional: set
   `EMAIL_REPLY_TO` for a Reply-To override, and to record real delivery
   outcomes in campaign history, add a Resend webhook pointing at
   `https://<your-domain>/api/webhooks/resend` (the `delivered`, `bounced`,
   `complained` and `failed` events: a spam complaint counts as an
   unsubscribe, and inbox replies show their delivery state) and
   copy its signing secret into `RESEND_WEBHOOK_SECRET`. The scheduled-send
   queue drains on the five-minute Cron Trigger — no further wiring needed.
7. **Migrations** — `wrangler d1 migrations apply scenering-db --remote`
   (`0007_devices_workspace.sql` adds the per-device session columns and the
   `workspace_documents` table that keeps a member's projects in step across
   devices; without it the device limits cannot be enforced and nothing syncs)
   (the setup script does this; re-run after adding a migration).
8. **`NODE_ENV`** — already `production` in `wrangler.jsonc`. Leave it. Every
   development affordance (inline verification/reset links, auto-owner
   sessions, sandbox provisioning) is gated on an explicit `development`/`test`,
   and the runtime treats an unset value as production.
9. **Inbox email (vincent@scenering.com)** — one-time setup in the dashboard:
   **Compute → Email Service → Email Routing → Onboard Domain**, choose
   `scenering.com` (Cloudflare adds the MX, SPF and DKIM records; they do not
   clash with Resend's records, which live on the `send` subdomain).
   **Destination Addresses**: add the owner's own mailbox and click the
   verification link (copies of incoming email are forwarded there).
   **Routing Rules → Create routing rule**: pattern `vincent`, action
   **Send to a Worker**, Worker `scenering`. Create one more rule the same way
   for each other address kept in **Email settings → Other addresses**
   (`support`, `hello` and `billing` out of the box); replies can be sent from
   any of them straight away, but customers' email to one only arrives once its
   rule exists. Test from a different account
   than the copy destination; the message appears in `/admin` → Inbox, whose
   **Connect address** panel shows the live status. Then switch on "Replies to
   automatic Scenering emails" in **Email settings**, and fill in the business
   address and phone shown in every marketing email footer. Recommended: a
   DMARC record, `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:vincent@scenering.com`.
   The inbox tables (migration 0003) are created by the Worker on first use,
   so the contact form keeps working before step 7 is re-run; running it
   afterwards records 0003 as applied (every statement is idempotent). The
   same goes for the gift-code table (0004) and the programme tables (0005).

Local development:

```bash
npm run dev          # vite build --watch + wrangler dev on http://localhost:8787
npx wrangler d1 migrations apply scenering-db --local   # first run only
```

`.dev.vars` (copied from `.dev.vars.example`, gitignored) holds local secrets.
Neither cron fires automatically under `wrangler dev` — trigger them manually:

```bash
curl http://localhost:8787/cdn-cgi/local/scheduled                                  # hourly audio sweep
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=*/5%20*%20*%20*%20*"       # email campaign queue
```

## 7. Verification performed for this report

- `npm run verify` — both tsconfigs, **50/50 test suites** (the Email Centre
  suite alone is 125 checks), production build, `wrangler deploy --dry-run`
  (bundle 2.2 MiB, 177 assets, all bindings resolved).
- Full endpoint matrix against the real workerd runtime (`wrangler dev`,
  2026-10-05): health · SPA shell + fallback · robots.txt · sitemap.xml ·
  static assets · register (scrypt under workerd) · verify-email · login ·
  cookie session · account · entitlements · export check/reserve/complete with
  plan enforcement · contact · social links · image search (provider
  waterfall → nature fallback) · TTS voices (Speechify-key authenticated and
  plan-filtered) · TTS synthesis (explicit upstream/error paths, no audio fallback) · image proxy (ASSETS binding, host
  allowlist, blocked-host placeholder) · audio upload (R2 write + D1 row) ·
  audio read-back + ownership 401 · webhook 503/401 paths · rate-limit 429 ·
  **20-request same-second burst with zero failures** · admin overview
  (bulk-read shape) · owner role grant · origin enforcement 403 · legacy
  `/functions/v1/*` routes · manual cron trigger.
- **FastSpring connection matrix** against the same runtime with `FASTSPRING_*`
  configured and FastSpring's API faked at the `fetch` boundary: popup and
  session checkout responses (storefront, product path, `tags` carrying the
  account id and email), the `X-FS-Signature` contract (valid / wrong secret /
  missing / tampered body / non-JSON), account-event mapping and the
  `billing_customers` fallback it enables, the full subscription lifecycle and
  the paid-period rules for `canceled` / `past_due` / `trialing` / `deactivated`,
  Account Management links, duplicate redelivery no-ops + log marks, 202s for
  unmatchable events and unknown product paths, and the owner's go-live
  checklist reporting ready with the exact webhook URL.
- **Email Centre (2026-10-06)** against the same runtime with seeded local
  D1: dashboard stats · template CRUD (create, edit, duplicate, archive,
  per-audience preview with `{{first_name}}`/`{{display_name}}`
  substitution and the XSS guard) · audience resolution across all seven
  audience types with consent filtering · test sends (tagged
  `campaign-test:<id>`, `[Test]` subject prefix, no delivery rows) ·
  campaign send to completion (6/6), including per-recipient unsubscribe
  tokens in both HTML and plain text · the queued path: a 28-recipient
  campaign drains 20 per invocation and finishes on the next tick, with
  double-send answered 409 · scheduling (future-dated campaigns stay
  scheduled; the queue starts them via the manual cron trigger) ·
  unsubscribe link → preference flip, and the Resend webhook's
  signature/replay contract.

Documentation referenced: [Workers
limits](https://developers.cloudflare.com/workers/platform/limits/) ·
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/) ·
[KV write limits (1 write/s/key, 60 s min
TTL)](https://developers.cloudflare.com/kv/api/write-key-value-pairs/) ·
[R2 upload limits](https://developers.cloudflare.com/r2/objects/upload-objects/) ·
[Node.js HTTP on
Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/) ·
[Static assets / `run_worker_first`](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) ·
[Cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) ·
[Rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
