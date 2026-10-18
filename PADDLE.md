# Paddle

Everything Scenering needs in order to take money through
[Paddle](https://www.paddle.com/), and everything an AI agent working on this
repository needs in order to get Paddle right.

Paddle is the **merchant of record**. It sells the subscription, takes the card,
calculates and remits the sales tax in every jurisdiction, handles dunning and
refunds, and pays Scenering. Scenering's only jobs are to open a checkout that
is tagged with the right account, and to believe — nothing else — a signed
webhook that says a subscription changed.

> **Dashboard labels move.** Paddle renames and rearranges its dashboard fairly
> often, and the sandbox and live dashboards are not always identical. Where
> this document names a menu, treat it as the shape of the thing to look for,
> and confirm the current wording against the docs MCP server below — that is
> exactly what it is for.

---

## 1. Requirements checklist

### 1.1 In the Paddle dashboard

| # | Requirement | Why the app needs it |
|---|---|---|
| 1 | **A Paddle account, approved and live-ready** (or a sandbox account to start with) | Sandbox and live are *separate accounts* with separate keys, separate catalogue ids and separate webhook destinations. Everything below exists once per environment. |
| 2 | **Two products** — `SceneFlow` and `SceneForge` | One product per plan, so the catalogue matches the pricing page. |
| 3 | **Four prices** — each product with a monthly and a yearly price, matching `src/config/plans.ts` (`$19`/`$180` and `$39`/`$372`) | Each price id (`pri_…`) is how a webhook is mapped back to a plan *and* an interval. A missing or wrong id means money is taken and no access is granted. The catalogue prices stay in USD; with automatic currency conversion enabled (**My account → Settings → Currencies**, select all) Paddle converts them into each visitor's own currency for both display and checkout. |
| 4 | **A recurring billing cycle on every price** (month / year) | These are subscriptions, not one-off payments. A one-off price produces a transaction with no subscription, and no subscription means no webhook this server acts on. |
| 5 | **An approved checkout URL** registered in Paddle's checkout settings (Account settings → Checkout settings) | The server passes it as `checkout.url` when it creates a transaction. Paddle returns a payment link *only* when the transaction carries an approved URL; without one, checkout answers `503 BILLING_NOT_CONFIGURED`. |
| 6 | **A secret API key** — sandbox keys look like `pdl_sdbx_apikey_…`, created under **Paddle → My account → Settings → Authentication** | Two server-side calls need it: `POST /transactions` to open a tagged checkout, and `GET /subscriptions/{id}` to read back the management links (below). |
| 7 | **A notification destination (webhook)** pointing at `<PUBLIC_APP_URL>/api/webhooks/paddle` | The only thing that changes what a member can do. |
| 8 | **Subscriptions to the eleven events in §3** | Paddle sends only what you ask for. A missing event is a payment that never grants access. |
| 9 | **The webhook's secret key** (`pdl_ntfset_…`) | Verifies `Paddle-Signature`. Each notification destination has its *own* secret, and it is not the same value as the API key — mixing them, or mixing a sandbox secret with a live destination, makes every delivery fail verification. Without it the endpoint answers `503` rather than trusting the caller. |
| 10 | **A public HTTPS origin** (`PUBLIC_APP_URL`) | Paddle will not deliver to `localhost`, and the app refuses a non-HTTPS checkout in production. For local development use a tunnel (see §7). |
| 11 | **Tax and payout settings completed** | Paddle is the merchant of record, so it will not switch a live account on until its own onboarding (business details, tax, bank) is finished. This is outside the code, and it is the step most often left to last. |
| 12 | **A client-side token** (`live_…` / `test_…`) from **Paddle → My account → Settings → Authentication → Client-side tokens** | Every price display loads Paddle.js with it — the home-page pricing section, the public pricing page and the in-app plan cards all share `useLocalizedPlanPrices` (`src/lib/use-localized-prices.ts`) on top of `Paddle.PricePreview()` for country-localized prices, and the pricing page also calls `Paddle.Checkout.open()` for the one-page overlay checkout. It is public by design and cannot create transactions on its own — never substitute the secret API key here. |
| 13 | **Default payment link** set under **Paddle → Checkout → Checkout configuration** | Dashboard-only; no API for it. Without it the overlay checkout fails with a generic "something went wrong". Sandbox accepts `https://localhost/`; live must be a real, approved domain. |

**Permissions on the API key.** The server itself only calls
`POST /transactions` and `GET /subscriptions/{id}`, so a **live** key can be
narrow. A **sandbox** key is worth making broader, because the MCP server and the
agent skills use it to build prices, simulate webhooks and replay failed
notifications without anybody asking for a second key:

`product.write`, `price.write`, `customer.read`, `subscription.write`,
`transaction.read`, `customer_portal_session.write`, `client_token.write`,
`notification_setting.write`, `notification.write`,
`notification_simulation.write` — each `write` already includes `read`.

### 1.2 In this repository

| Requirement | Where |
|---|---|
| `PADDLE_ENVIRONMENT` — `sandbox` or `live` | plain var in `wrangler.jsonc`; `.dev.vars` locally |
| `PADDLE_API_KEY` | secret (`wrangler secret put PADDLE_API_KEY`) |
| `PADDLE_WEBHOOK_SECRET` | secret |
| `PADDLE_<PLAN>_<INTERVAL>_PRICE_ID` × 4 | secrets |
| `PADDLE_<PLAN>_<INTERVAL>_CHECKOUT_URL` × 4 | secrets |
| `PADDLE_CLIENT_TOKEN` | plain var (`wrangler var put PADDLE_CLIENT_TOKEN`) |
| `PADDLE_CLIENT_ENVIRONMENT` — `sandbox` or `production` | plain var |
| `PUBLIC_APP_URL` | plain var in `wrangler.jsonc` |
| Migration `0006_paddle.sql` applied | `wrangler d1 migrations apply scenering-db --remote` |

`<PLAN>` is `SCENEFLOW` or `SCENEFORGE`; `<INTERVAL>` is `MONTHLY` or `YEARLY`.
The names are declared once, in `src/config/plans.ts`, and read dynamically —
`src/env.ts` documents them, `.env.example` explains them, and
`scripts/setup-cloudflare.sh` prompts for them.

**The client-side token is the one billing value that reaches the
browser** — by design. It is served at runtime by
`GET /api/billing/public-config` (along with the environment, the
visitor's country and the tier price ids), never baked into the
bundle, and it can only open checkout and preview prices. The secret
API key never leaves the server, and no `VITE_`-prefixed Paddle
variable exists. That endpoint fails loudly — `503
PADDLE_CLIENT_NOT_CONFIGURED` — unless both client variables are set,
so a misconfigured deployment cannot quietly open checkout against
the wrong Paddle account.

---

## 2. How a purchase is matched to an account

This is the part that has no second chance, so it is worth stating plainly.

1. A member picks a plan in **Account & Membership**. The browser calls
   `GET /api/billing/checkout/:plan/:interval` with its session cookie.
2. The server — not the browser — calls `POST /transactions` with:

   ```json
   {
     "items": [{ "price_id": "pri_…", "quantity": 1 }],
     "custom_data": { "user_id": "usr_…", "email": "…", "plan": "sceneflow", "interval": "monthly" },
     "checkout": { "url": "https://<approved checkout url>" }
   }
   ```

3. Paddle returns `data.checkout.url`: the approved URL with that transaction
   bound to it. The server hands *that* link to the browser.
4. `custom_data` is now part of Paddle's signed record of the transaction.
   Paddle copies it onto the subscription it creates when the payment succeeds,
   and sends it home on **every** webhook for that subscription.

Because `custom_data` is set by the party that authenticated the member, and
signed by Paddle, the person paying cannot change it to somebody else's account
id — which is why it is safe to grant a plan on the strength of it. A link
built in the browser could be edited; this cannot.

**The public pricing page takes the other path.** `/pricing` previews prices
with `Paddle.PricePreview()` and opens the checkout itself with
`Paddle.Checkout.open()` (overlay, one-page variant), so no server-side
transaction — and no `custom_data` — exists for those purchases. The signed-in
member's email is prefilled into the checkout, which is what makes fallback
matching 1 below work for them: `customer.created` fires for the buyer, the
server maps the Paddle customer to the account with the same email, and the
subscription events that follow inherit that mapping. A visitor who checks out
signed out still buys fine; the subscription simply stays unmatched until a
customer event carries a known email. The in-app upgrade panel keeps using the
server-created, `custom_data`-tagged checkout above.

**Price display is localized everywhere, from the one preview.** Whichever
checkout path a purchase takes, the *price shown* comes from the same place:
`useLocalizedPlanPrices` (`src/lib/use-localized-prices.ts`) loads the public
config once per page, previews every price at both intervals for the visitor's
country, and hands each surface Paddle's formatted total (local currency, tax
included) plus a yearly-saving line computed from Paddle's raw totals. The
home-page pricing section, `/pricing`, the Setup plan cards and the membership
window all read from it, so the figure a visitor first sees is the figure the
checkout charges. Only before Paddle answers — or when it is not configured —
does a surface fall back to the USD base price from `src/config/plans.ts`,
labelled "USD" (see `formatBasePrice` in `src/lib/localized-prices.ts`).
Static copy that cannot know the reader's country (the Terms table, emails,
SEO offers) quotes that USD base price and says so. What currency a customer
*pays* in is Paddle's automatic conversion setting; what currency Paddle
*pays out* in is a separate Transfer Preferences choice (ZAR is a supported
payout currency) — neither requires changing the USD catalogue prices.

**Two fallbacks**, for subscriptions that arrive with no `custom_data` — an
imported subscription, one created by hand in the dashboard, a checkout link
shared without the app, or an overlay checkout from the pricing page:

- `customer.created` / `customer.updated` are the only Paddle webhooks that
  carry an email address. When one arrives, the server stores
  `ctm_… → account` in `billing_customers`. A later `subscription.*` webhook
  carries the customer id, and is matched through that row.
- Failing that, any subscription already stored against the same customer id.

A mapping alone never grants a plan. Only a subscription event does. If none of
the three resolve, the webhook is answered `202 unmatched` — recorded, visible
in the owner's webhook log, and never retried into oblivion.

---

## 3. Webhook contract

**Endpoint:** `POST /api/webhooks/paddle` — mounted before the JSON parser, so
the body arrives as untouched bytes.

**Subscribe to these eleven events** (Paddle → **Events → Notifications** →
your destination):

| Event | Effect |
|---|---|
| `subscription.activated` | access granted → `active` |
| `subscription.created` | status from the payload |
| `subscription.updated` | status from the payload; also carries a scheduled cancel/pause |
| `subscription.canceled` | access ends (→ `cancelled`) |
| `subscription.paused` | keeps the plan to the end of the paid period |
| `subscription.resumed` | → `active` |
| `subscription.trialing` | counts as paid access → `on_trial` |
| `subscription.past_due` | dunning window; keeps the plan while the period runs |
| `subscription.imported` | status from the payload |
| `customer.created` | maps `ctm_…` to an account; grants nothing |
| `customer.updated` | as above |

Everything else Paddle sends — `transaction.*`, `adjustment.*`, `discount.*`,
`payment_method.*`, `payout.*` — is **recorded and ignored**. A transaction
event carries a `txn_…` id where this code expects a `sub_…` id, and treating
one as the other would create a subscription row no later event could ever
update. Ignoring `transaction.completed` costs nothing: `subscription.activated`
follows it within seconds.

**Signature.** The header is `Paddle-Signature: ts=<unix seconds>;h1=<hex>`:

```
signed string = `${ts}:${rawBody}`
digest        = HMAC-SHA256(signed string, PADDLE_WEBHOOK_SECRET)  → hex
```

Implemented in `verifyPaddleSignature` (`server/platform.ts`). Notes:

- The **raw bytes** are hashed. A re-serialised object will not match, which is
  why the route uses `express.raw(...)` and is mounted before `express.json()`.
- The comparison is `timingSafeEqual`. Paddle's own SDK uses a plain `===` on
  the hex; this does not.
- The `h1` hex is accepted in either case.
- `ts` must be within `PADDLE_SIGNATURE_MAX_AGE_SECONDS` (300 s) of this
  server's clock, in either direction. Paddle's SDK allows five seconds, which
  rejects genuine deliveries whenever two clocks disagree by more than that.
  The real replay defence is the `UNIQUE provider_event_id` in `webhook_events`
  — every event is applied exactly once, and a redelivery leaves a mark on the
  original log row.
- Absent, malformed, stale and wrong signatures all answer **401** alike.
  Telling them apart would tell an attacker which part they had got right.

**Responses.**

| Status | Meaning |
|---|---|
| `200 processed` | a subscription event changed a membership |
| `200 mapped` | a customer event recorded a `ctm_…` → account mapping |
| `200 ignored` | not an event this server acts on |
| `200 duplicate` | that `event_id` was already applied |
| `200 stale` | an older event arrived after a newer one was already applied |
| `202 unmatched` | no Scenering account matched; Paddle should stop retrying |
| `202 unknown_price` | the price id is not one of the four configured |
| `400` | signed, but not parseable / not a Paddle event |
| `401` | signature did not verify |
| `503` | `PADDLE_WEBHOOK_SECRET` is not set |

`202` rather than `5xx` for the two "could never succeed" cases is deliberate:
Paddle retries a 5xx, and retrying an event that maps to nothing is noise that
hides a real problem.

**Two things Paddle's webhooks do *not* carry**, both handled explicitly:

- **`management_urls`** (cancel / update card) exist only on the API's
  subscription object, never in a notification. So they are read back with
  `GET /subscriptions/{id}` and stored, which is what makes **Manage or cancel**
  and **Update payment card** work from the account window. If that call fails,
  the plan change still lands and the buttons simply do not appear — losing a
  link must never lose a payment.
- **Card brand and last four.** Not sent on subscription webhooks, so those
  columns stay empty and the account window hides the line.

**Customer portal (self-service).** `management_urls` gives two direct links:
cancel, and update card. Paddle also hosts a full **customer portal** — invoices,
payment history, address and tax details, plan changes — reached by minting a
session with `POST /customers/{customer_id}/portal-sessions`
(`customerPortalSessions.create`), which needs the
`customer_portal_session.write` permission and the `customer_id` this server
stores in `billing_customers` and `subscriptions`. `POST /api/billing/portal`
verifies the signed-in session first, resolves the member's `customer_id` and
`subscription_ids` strictly server-side, mints a fresh portal session, and
returns `{ url: urls.general.overview }` (`no-store`) for the **Customer portal**
button in **Account & Membership**.

**Delivery, retries and ordering.** The handler is built around Paddle's actual
delivery contract, not an assumed one:

- Only a **2xx within five seconds** counts as delivered. A 3xx redirect, a 4xx,
  a 5xx or a timeout all retry on the same budget — sandbox retries three times
  over about fifteen minutes, production about sixty times over three days.
- Every retry carries the **same `event_id`**, so the `UNIQUE` constraint turns
  the whole retry budget into one `duplicate` log row.
- There is **no ordering guarantee**: renewals, cancellations, reactivations and
  card updates can arrive interleaved. That is why `subscriptions` stores
  `provider_event_occurred_at` and the handler discards an event older than the
  one already applied (logged as `stale`) — without that, a late-arriving
  renewal can resurrect a plan the member cancelled.
- Redirects are not followed, so the destination URL must answer `200` itself.
- A failed notification can be replayed for roughly ninety days from **Paddle →
  Events → Notifications** (`Retry`), or with `notifications.replay("ntf_…")`.
  To backfill everything missed while the endpoint was down, page
  `GET /events` with `from`/`to` and fetch each one. If the host is
  IP-restricted, Paddle publishes its source ranges at `GET /ips`, which a
  scheduled job can pin.

**Source-IP allowlist (optional, off by default).** Paddle publishes the ranges
its deliveries come from at `GET /ips` (`data.ipv4_cidrs`, as `/32` CIDRs).
Setting `PADDLE_WEBHOOK_IP_ALLOWLIST=on` makes the handler fetch that list —
cached for 24 hours via `PADDLE_IPS_REFRESH_MS`, never hard-coded, because Paddle
can change it — and refuse a delivery from outside it with **403** before the body
is parsed. It **fails open**: if `/ips` cannot be reached, deliveries are accepted
on their signature and a warning is logged, because dropping a real payment over
our own transient network failure is worse than accepting something the signature
check is about to judge anyway. Signature verification is never skipped, allowed
IP or not. A Cloudflare WAF rule on `/api/webhooks/paddle` is a reasonable
alternative: it rejects traffic before the Worker, and cannot be broken by a
failed fetch inside the app.

**Testing without waiting for a billing cycle.** **Paddle → Events →
Simulations** posts test `subscription.*` events — creation, renewal, pause,
resume, cancellation — at a destination of your choice. Simulated events get one
attempt only and do not appear in the notification log, so they are safe to fire
at a shared sandbox URL. Set a destination's *Usage type* to **Both** while
developing (it then receives real sandbox transactions *and* simulator events),
and **Platform** in production (`traffic_source: "all"`).

---

## 4. Access rules

Access follows Paddle's own meaning for each status, because each one carries
different billing consequences:

| Paddle status | Stored as | Plan | Why |
|---|---|---|---|
| `active` | `active` | **granted** | billing normally |
| `trialing` | `on_trial` | **granted** | trial running, first invoice still ahead |
| `past_due` | `past_due` | **granted** | Paddle's dunning is retrying the card, so the member is almost certainly still entitled. Taking the plan away mid-retry turns a temporary card problem into a lost customer — the account window warns them instead. |
| `paused` | `paused` | **not granted** | a paused subscription means no billing *and* no service |
| `canceled` | `cancelled` | **not granted** | terminal: the subscription has already ended |

The gate is therefore `["active", "on_trial", "past_due"].includes(status)`.

**"Will not renew, but still paid up" is a different case, and it does not need
a grace period.** When a member cancels at the end of their period, Paddle keeps
the status at `active` (or `trialing`/`past_due`) and adds a
`scheduled_change` of `{ action: "cancel", effective_at }`. The status only flips
to `canceled` when that date arrives — so access continues for exactly as long as
it was paid for, with no local grace logic to get wrong. That pair is what
`cancel_at_period_end` and `expires_at` store, and what the account window shows
as "your plan ends on …". Cancellation that takes effect immediately sets
`canceled_at` to the moment it stopped, and access ends at once.

A member with a scheduled cancellation can change their mind: cancelling the
scheduled change leaves the status untouched and access uninterrupted.

**The backstop:** `sweepUserSubscriptionExpiry` runs on the authenticated
request path and downgrades a non-active subscription whose stored end date has
passed. A webhook that is never delivered therefore cannot leave a paid plan
switched on forever.

`canceled` is Paddle's spelling and `cancelled` this codebase's. The
translation happens once, in `sceneringStatusForPaddle`, so every comparison
downstream stays on one vocabulary. An unrecognised status is stored as-is
rather than defaulted to one that grants access.

---

## 5. Sandbox and live

| | Sandbox | Live |
|---|---|---|
| `PADDLE_ENVIRONMENT` | `sandbox` (also the default, so a typo can never point production traffic at the live API) | `live` |
| API base URL | `https://sandbox-api.paddle.com` | `https://api.paddle.com` |
| Dashboard | sandbox-vendors.paddle.com | vendors.paddle.com |
| Account, keys, price ids, webhook destination | **separate** | **separate** |

`wrangler.jsonc` ships with `"PADDLE_ENVIRONMENT": "sandbox"`. Switching to live
means setting the four live secrets **and** flipping that var — the owner's
billing checklist shows which environment is configured, and raises a visible
warning when a production deployment is still pointed at sandbox (a site that
looks configured and can take no real money).

Test a sandbox purchase with Paddle's test card. Sandbox deliveries are
processed exactly like live ones and labelled `sandbox` in the webhook log;
revoke the granted membership from the administration panel afterwards.

---

## 6. AI agent tooling

### 6.1 Paddle's agent skills — already installed

Agent skills are the standardised way to give an AI agent instructions on how to
integrate a product. Paddle publishes their own, and they are **vendored into
this repository**, so any agent opening it reads Paddle's current guidance
instead of guessing from training data:

| Location | Read by |
|---|---|
| `.agents/skills/` | Cursor, Codex, GitHub Copilot, Zed, Amp, Replit and other universal-format tools |
| `.claude/skills/` | Claude Code |

Eleven skills — `paddle-webhooks`, `paddle-subscription-sync`,
`paddle-catalog-setup`, `paddle-checkout-web`, `paddle-customer-portal`,
`paddle-subscription-cancel`, `paddle-subscription-update`,
`paddle-billing-history`, `paddle-pricing-pages`, `paddle-sandbox-testing`,
`paddle-usage-based-billing` — copied unmodified from
[`paddlehq/paddle-agent-skills`](https://github.com/paddlehq/paddle-agent-skills)
at commit `70cb70d`, Apache-2.0, with the upstream licence text kept beside them
(`LICENSE.paddle-agent-skills`). `.agents/skills/README.md` records the
provenance and what each one covers.

**Refreshing them.** From a machine that can reach both npm and
`developer.paddle.com`:

```bash
npx skills add https://developer.paddle.com/
```

The `skills` CLI ([vercel-labs/skills](https://github.com/vercel-labs/skills))
reads Paddle's discovery index and writes the same directories, so it updates in
place rather than duplicating — each skill folder is named after its frontmatter
`name` (`paddle-webhooks`), which is what the CLI uses. `npx skills ls` lists
what is installed.

If npm cannot resolve `registry.npmjs.org` (`EAI_AGAIN`), skip the CLI — it is
only a downloader, and the skills are on GitHub:

```bash
git clone --depth 1 https://github.com/paddlehq/paddle-agent-skills.git /tmp/pas
```

Then copy `skills/` across, renaming each directory to its frontmatter name, and
update the commit reference in `.agents/skills/README.md`.

**Their examples are Next.js + Supabase.** Scenering is Express on a Cloudflare
Worker with D1, so the *patterns* transfer and the code does not.
`server/platform.ts` implements the same contract by hand; where this
integration deliberately differs, the reason is written down here.

### 6.2 Paddle MCP servers

The MCP servers let an agent interact with a real Paddle account: create data,
verify the account is wired up correctly, and read the current documentation
instead of relying on stale training data. The docs server in particular is what
makes an agent able to troubleshoot a webhook rather than guess at one.

| Environment | Name | Type | URL | Authentication |
|---|---|---|---|---|
| Sandbox | `paddle-sandbox` | http | `https://sandbox-mcp.paddle.com/mcp` | API key |
| Live | `paddle-live` | http | `https://mcp.paddle.com/mcp` | OAuth |
| Docs | `paddle-docs` | http | `https://paddlehq.mcp.kapa.ai` | Google or GitHub sign-in |

Full setup instructions for Cursor, VS Code, Mistral Vibe and others:
<https://developer.paddle.com/sdks/ai/paddle-mcp/>

**Already committed here**, so any of these editors picks them up on opening the
repository:

| File | Editor |
|---|---|
| `.mcp.json` | Claude Code (project scope) |
| `.cursor/mcp.json` | Cursor |
| `.vscode/mcp.json` | VS Code (GitHub Copilot) |

All three declare the same three servers over HTTP with no secret in the file.
Authentication is completed by the editor on first connect: the docs server asks
you to sign in with Google or GitHub, `paddle-live` runs an OAuth flow, and
`paddle-sandbox` wants a sandbox API key — enter that in your editor's MCP
settings UI, where secrets belong.

**Never commit an API key into these files.** A Paddle API key can create and
refund real transactions; the repository is not a secret store. The application's
own keys live in Cloudflare (`wrangler secret put`) and locally in `.dev.vars`,
which is gitignored.

An editor not covered above takes the same three name/type/URL triples through
its own MCP settings screen.

### 6.3 Ground truth used for this integration

Behavioural ground truth — the retry budget, the lack of an ordering guarantee,
the meaning of each subscription status, the dashboard paths, the key prefixes —
comes from Paddle's own agent skills, vendored at `.agents/skills/` and cited
inline above. Where a skill's example is Next.js + Supabase, the pattern was
followed and the code was not.

The payload and endpoint shapes in this document and in `server/platform.ts`
were taken from Paddle's own TypeScript definitions in
[`@paddle/paddle-node-sdk`](https://www.npmjs.com/package/@paddle/paddle-node-sdk)
(v3.10.0) — `ISubscriptionNotificationResponse`, `ITransactionNotificationResponse`,
`ICustomerNotificationResponse`, `CreateTransactionRequestBody`,
`ISubscriptionManagementResponse`, the `EventName` enum, `Environment` and
`WebhooksValidator`. The SDK is **not** a dependency: this server runs on
Cloudflare Workers and hand-rolls the two API calls and the signature check,
which keeps the billing path as small and as readable as the rest of
`server/platform.ts`. Consult it again whenever Paddle changes shape.

---

## 7. Local development

`wrangler dev` reads `.dev.vars`, so put sandbox values there:

```bash
cp .dev.vars.example .dev.vars   # then fill in the Paddle block
npm run dev
```

Paddle cannot reach `http://localhost:8787`. To exercise the real webhook loop
locally, tunnel a public HTTPS origin to it and register that as the sandbox
notification destination:

```bash
npx cloudflared tunnel --url http://localhost:8787
```

Set `PUBLIC_APP_URL` to the tunnel's HTTPS origin so the owner's checklist shows
the URL to paste. Alternatively use the sandbox MCP server (or Paddle's
notification simulator) to send events to the tunnelled origin directly.

To check the wiring without Paddle at all, run the billing suite — it fakes the
Paddle API and signs its own webhooks:

```bash
npx tsx tests/billing.test.ts
```

---

> **Already in sandbox and moving to live?** `LIVE_MIGRATION.md` is the
> sandbox → live runbook: what is already done in this codebase, the exact six
> secrets to change, the dashboard steps, and the pre-verification readiness
> checklist.

## 8. Going live, in order

1. Complete Paddle's own onboarding (business, tax, payout) on the **live**
   account. Nothing works until Paddle has switched it on.
2. Create the two products and four prices on live; copy the live `pri_…` ids.
3. Register the live approved checkout URL; copy it four times.
4. Set the **default payment link** under **Paddle → Checkout → Checkout
   configuration** to the live checkout page (dashboard-only; live must be a
   real approved domain, not localhost).
5. Create the live **client-side token** (Authentication → Client-side tokens).
6. `wrangler secret put` the live `PADDLE_API_KEY`, the four price ids, the four
   checkout URLs and the live `PADDLE_WEBHOOK_SECRET`.
7. `wrangler var put PADDLE_CLIENT_TOKEN` (the `live_…` token) and
   `PADDLE_CLIENT_ENVIRONMENT=production`. The pricing page's endpoint refuses
   to answer until both are set — that is the loud failure, not a bug.
8. Add the live notification destination →
   `https://<your-domain>/api/webhooks/paddle`, subscribed to all eleven events.
9. Set `"PADDLE_ENVIRONMENT": "live"` in `wrangler.jsonc`; deploy.
10. `wrangler d1 migrations apply scenering-db --remote` (applies `0006_paddle`).
11. Sign in as the owner → **Account & Membership** → *Owner administration*.
   **Paddle billing** must read *Ready to take payments*, name the environment
   as live, and show the webhook URL you registered.
12. Open `/pricing` signed out: prices appear localized, and Subscribe opens
    the one-page overlay — on live, confirm it opens and shows the right
    prices without completing a payment (live transactions cannot complete
    until verification passes and domains are approved).
13. Buy a plan for real, with a card you can refund, and watch the webhook log
    show `processed` and the account move to the plan you bought.

If any migration of a subscription ever needs to be undone by hand, the
administration panel grants and revokes complimentary membership, which changes
access without creating a charge or touching the Paddle subscription.
