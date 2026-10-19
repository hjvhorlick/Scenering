# Moving Scenering from Paddle sandbox to Paddle live

This is the sandbox → live migration for Scenering specifically: what is already
done, what is left, and exactly where each remaining thing happens.

**What this step is not.** It gets the live account and the code ready. It does
not start account verification and it does not take a live payment — those are
the next two steps ("Verify your account", then "Test and go live"). Pointing the
code at live does not mean you can sell: **live Checkout will not run until your
domains are approved**, so do not open a live build to real customers yet. Verify
locally or in staging.

Nothing here deletes anything. Live entities may already have real customers,
subscriptions and payment history attached, so the migration is additive and
code-side only — see **§8 Guardrails** before touching the dashboard.

---

## 0. Audit: what is already in place

Checked against the repository at the time of writing.

### Already done — do not redo

| Item | Where | Note |
|---|---|---|
| Environment switching | `server/platform.ts` `PADDLE_API_BASE_URLS[paddleEnvironment()]` + `/api/billing/public-config` | `PADDLE_ENVIRONMENT=live` selects `https://api.paddle.com` and pairs with `PADDLE_CLIENT_ENVIRONMENT=production` + a `live_`-prefixed `PADDLE_CLIENT_TOKEN`. There is **no hard-coded sandbox URL or token to find and replace**. |
| Pricing page & overlay checkout (`@paddle/paddle-js`) | `src/lib/paddle.ts`, `src/lib/use-localized-prices.ts`, `src/marketing/PublicPage.tsx` | `Paddle.PricePreview()` fetches country-localized `formattedTotals.total` (server reads `CF-IPCountry` / `x-vercel-ip-country` or omits country so Paddle auto-detects from IP), and `Paddle.Checkout.open()` opens a one-page overlay (`displayMode: 'overlay'`, `variant: 'one-page'`) redirecting to `/welcome`. |
| Price IDs are not in code | `PADDLE_<PLAN>_<INTERVAL>_PRICE_ID` × 4 | A grep of `src/`, `server/` and `server.ts` for `pri_`/`prd_`/`pdc_` literals returns nothing. The "swap every price ID" step is **four secret values**, not a code change — there is no pricing-page, upgrade/downgrade or lifecycle code to edit. |
| Checkout URLs are not in code | `PADDLE_<PLAN>_<INTERVAL>_CHECKOUT_URL` × 4 | Same story. |
| Sandbox-in-production warning | `billingConfiguration().sandboxInProduction` | The owner panel warns if a production deployment is still pointed at sandbox. |
| Signature verification | `verifyPaddleSignature` | HMAC-SHA256 over `ts:rawBody`, timing-safe, `event_id` unique. Environment-independent. |
| Event ordering guard | `provider_event_occurred_at` | Out-of-order live redeliveries cannot undo newer state. |
| Refund & cancellation policy | `/refunds` | **Added as part of this work** — it did not exist before, and Paddle verification looks for it. |
| Source-IP allowlist | `PADDLE_WEBHOOK_IP_ALLOWLIST` | **Added as part of this work.** Fetches `GET /ips` at runtime, off by default. See §6. |

### Outstanding — only you can do these

Everything below needs either your Paddle dashboard or your Cloudflare account.
An AI agent working in this repository cannot reach `api.paddle.com`, your Paddle
account, or `scenering.com`, and has no MCP connection to either environment.

---

## 1. The mapping table

Fill this in as you go. Nothing in the code needs it — the code reads env vars —
but you need it to check that live matches sandbox, and to reverse the change if
you have to.

| | Sandbox | Live |
|---|---|---|
| SceneFlow monthly price | `pri_…` | `pri_…` |
| SceneFlow yearly price | `pri_…` | `pri_…` |
| SceneForge monthly price | `pri_…` | `pri_…` |
| SceneForge yearly price | `pri_…` | `pri_…` |
| Approved checkout URL (SceneFlow monthly) | | |
| Approved checkout URL (SceneFlow yearly) | | |
| Approved checkout URL (SceneForge monthly) | | |
| Approved checkout URL (SceneForge yearly) | | |
| API key | `pdl_sdbx_apikey_…` | |
| Notification destination ID | `ntfset_…` | |
| Webhook secret | `pdl_ntfset_…` | `pdl_ntfset_…` |

Do not put real values in this file — it is committed. Keep them in Cloudflare
secrets and, locally, in `.dev.vars` (gitignored).

---

## 2. Recreate the catalog in live

Create these in your **live** account. Mirror whatever you tested in sandbox
exactly — tax category, billing interval, currency — so the thing you verified is
the thing you ship.

| Product | Interval | Price the site advertises | Paddle unit price |
|---|---|---|---|
| SceneFlow | monthly | $19/month | `1900` (minor units) |
| SceneFlow | yearly | $180/year — shown as "$15/month equivalent, saves $48" | `18000` |
| SceneForge | monthly | $39/month | `3900` |
| SceneForge | yearly | $372/year — shown as "$31/month equivalent, saves $96" | `37200` |

The Free plan needs no product or price; it is granted locally.

Prices are the single source of truth in `src/config/plans.ts`, and the Terms
page repeats them. **If you set a different amount in live, the site and your
catalog disagree** — which is a verification check (see §7). Either change the
Paddle price to match, or change `src/config/plans.ts` and the Terms table
together.

Each price must be **recurring** (month / year), not one-off. These are
subscriptions.

Skip any sandbox test or junk items — they should not be recreated.

---

## 3. Credentials

**Live API key** — create it in the dashboard under **Paddle → My account →
Settings → Authentication**. The server uses it for exactly two calls:
`POST /transactions` and `GET /subscriptions/{id}`, so a live key can be narrow.
Never commit it.

**Live notification destination** — create one under **Paddle → Events →
Notifications**, pointing at:

```
https://<your-live-domain>/api/webhooks/paddle
```

Sandbox and live must be **separate destinations**, each with its own secret.
Subscribe it to all eleven events:

```
subscription.activated   subscription.created     subscription.updated
subscription.canceled    subscription.paused      subscription.resumed
subscription.trialing    subscription.past_due    subscription.imported
customer.created         customer.updated
```

Copy the destination's secret key (`pdl_ntfset_…`) immediately — it is shown
once and cannot be retrieved again.

> If a live destination **already exists, reuse it**. Do not delete and recreate
> it: recreating rotates `endpoint_secret_key` and silently breaks signature
> verification for every future delivery. See §8.

**Live client-side token** — create one in the live Paddle dashboard under
**Developer tools → Authentication → Client-side tokens** (it starts with
`live_`) and set it as `PADDLE_CLIENT_TOKEN` alongside
`PADDLE_CLIENT_ENVIRONMENT=production`.

---

## 4. Switch the code over

This is the whole code-side migration.

```bash
# The four live price IDs
wrangler secret put PADDLE_SCENEFLOW_MONTHLY_PRICE_ID
wrangler secret put PADDLE_SCENEFLOW_YEARLY_PRICE_ID
wrangler secret put PADDLE_SCENEFORGE_MONTHLY_PRICE_ID
wrangler secret put PADDLE_SCENEFORGE_YEARLY_PRICE_ID

# The four live approved checkout URLs
wrangler secret put PADDLE_SCENEFLOW_MONTHLY_CHECKOUT_URL
wrangler secret put PADDLE_SCENEFLOW_YEARLY_CHECKOUT_URL
wrangler secret put PADDLE_SCENEFORGE_MONTHLY_CHECKOUT_URL
wrangler secret put PADDLE_SCENEFORGE_YEARLY_CHECKOUT_URL

# The live credentials
wrangler secret put PADDLE_API_KEY
wrangler secret put PADDLE_WEBHOOK_SECRET
wrangler secret put PADDLE_CLIENT_TOKEN
```

`wrangler.jsonc` already sets the live environment vars:

```jsonc
"PADDLE_ENVIRONMENT": "live",
"PADDLE_CLIENT_ENVIRONMENT": "production"
```

Redeploy once your secrets are set. That moves the API base URL to
`https://api.paddle.com` and configures Paddle.js for `production`.

**Apply the migration to the live database** if it has not been applied already:

```bash
wrangler d1 migrations apply scenering-db --remote
```

**Then check, before you trust it:**

1. Sign in as the owner → **Account & Membership** → the Paddle billing panel.
   It lists every requirement and whether it is set. `sandboxInProduction` should
   now be false.
2. The panel's "last webhooks received" should show a live delivery after you
   make a test purchase.
3. Confirm the environment shown in the panel says **live**.

To go back to sandbox, reverse the ten secret values and set
`PADDLE_ENVIRONMENT=sandbox`. No code change either way — which is the point.

---

## 5. Finish configuring the live account

All of these are dashboard-only. Do them via your editor's `paddle-live` MCP
server where it supports them; otherwise the paths are below.

| Task | Where | Note |
|---|---|---|
| Enable payment methods | **Checkout → Checkout configuration → Payment methods** | Turn on the ones you actually want to accept. |
| Set the default payment link | **Checkout → Checkout configuration** | **Dashboard only — an agent should not attempt this.** It must be a real, approved domain, not `localhost`, or live checkouts fail. |
| Submit domains for approval | **My account → Settings → Website approval** | **Do this early.** Sandbox approves domains automatically; live does not, and Checkout will not run on live until a domain is approved. Submitting now lets approval process while you verify. |
| Add bank details | **Business account → Payouts → Payout settings** | Needed to be paid. |
| Business/tax onboarding | **My account → Settings** | Paddle is the merchant of record and will not switch a live account on until its own onboarding is complete. |

---

## 6. Webhook source-IP allowlist

Paddle publishes the ranges its deliveries come from at `GET /ips`
(`data.ipv4_cidrs`, as `/32` CIDRs). This is implemented and **off by default**:

```bash
wrangler secret put PADDLE_WEBHOOK_IP_ALLOWLIST   # value: on
```

How it behaves, and why:

- The ranges are **fetched at runtime and cached for 24 hours**
  (`PADDLE_IPS_REFRESH_MS`), never hard-coded — Paddle can change them, and a
  stale list written into source is how genuine payments start getting refused.
- A delivery from outside the ranges is refused with **403 before its body is
  parsed**.
- It **fails open**: if `/ips` cannot be fetched, deliveries are accepted on
  their signature and a warning is logged. Dropping a real payment because *we*
  could not reach Paddle is the worse failure.
- **Signature verification is never skipped**, allowed IP or not. That is what
  makes failing open safe — the allowlist is noise reduction and defence in
  depth, not the authentication.

**A better place for this may be the Cloudflare edge.** A WAF/firewall rule on
the `/api/webhooks/paddle` path rejects unwanted traffic before it reaches the
Worker at all, cannot be broken by a failed fetch inside your code, and does not
spend Worker subrequests. If you would rather do it there, leave
`PADDLE_WEBHOOK_IP_ALLOWLIST` off and build the rule from the same `GET /ips`
response. Either way, do not paste a fixed IP list into a rule and forget it.

---

## 7. Pre-verification readiness

What a reviewer will look at, and where Scenering stands.

| Check | Status | Detail |
|---|---|---|
| Public Terms | ✅ | `/terms` — includes governing law (South Africa), liability cap, billing and cancellation |
| Public Privacy Policy | ✅ | `/privacy` |
| Public Refund / Cancellation Policy | ✅ **added** | `/refunds` — how to cancel, what is not refunded automatically, how to request one, who returns the money, digital-content cooling-off, statutory rights, chargebacks. Linked from the public footer, the in-app corner menu and the sitemap. |
| Cookie policy | ✅ | `/cookies` |
| Clear description of the product | ✅ | Homepage and footer: "Turn ideas, scripts and audio into polished faceless videos while keeping meaningful creative control." |
| Contact reachable in ≤2 clicks | ✅ | `/contact` is linked from the public footer and the nav — one click from the homepage |
| Site pricing matches the live catalog | ❓ **you must check** | Site says Free $0 · SceneFlow $19/mo, $180/yr · SceneForge $39/mo, $372/yr. Compare against what you actually created in §2. |
| Every checkout domain resolves and serves the real product | ❓ **you must check** | Cannot be verified from a sandbox with no outbound access to your domain. Confirm it is not parked, 404 or a placeholder — and that it is the domain you submitted for approval in §5. |
| Legal pages return 200, not a redirect to a generic page | ❓ **you must check** | `/privacy`, `/terms`, `/cookies`, `/refunds` on the live domain |

The Terms already carried one sentence on refunds ("considered case by case"),
so the owner manual's reference to them was accurate. What was missing was a page
to send a reviewer or a customer to; `/refunds` is that page, and the Terms now
point at it.

These are common verification checks, not a published checklist — confirm the
current requirements against Paddle's own verification guidance rather than
treating any single item as definitively required.

**Deferred: Paddle Retain (`pwCustomer`).** Retain needs Paddle.js on the page,
which means changing checkout from a redirect to an overlay, adding
`script-src https://cdn.paddle.com` and `frame-src https://*.paddle.com` to the
CSP, and storing a client-side token. It is churn-reduction tooling, not a
verification requirement. Do it after verification, as its own change, so a
working checkout is not being rewritten at the same time as the account is being
reviewed.

---

## 8. Guardrails — this is a live account

Migration is **additive and code-side**. Never delete, archive, deactivate or
recreate a live entity, and never do so as "cleanup".

- **The live notification destination and its signing secret.** Never delete or
  recreate one that already exists — recreating rotates `endpoint_secret_key` and
  silently breaks verification of every future delivery, which looks exactly like
  "Paddle stopped sending". If one exists, **reuse it**; create one only if none
  exists.
- **Live products, prices and discounts** — especially any with active
  subscriptions. A price is immutable once used; "fixing" a wrong price means
  creating a **new** one and pointing the env var at it. Never edit or delete the
  old one, and never reuse its ID.
- **Live customers, subscriptions and transactions**, and the rows mirrored into
  `subscriptions` / `billing_customers`.
- **The sandbox account.** It is the source of truth for this migration and the
  only place a mistake is free. Do not delete or modify anything in it, and do
  not "clean up sandbox" afterwards.

If a genuine fix would require deleting or recreating any live entity: **stop**,
name the entity and the exact change, and decide deliberately. Prefer
update-in-place. Default to leave-and-ask.

---

## Related

- `PADDLE.md` — the connection runbook: what the integration needs, the webhook
  contract, access rules, sandbox vs live, AI agent tooling.
- `.agents/skills/` — Paddle's own agent skills, vendored, including
  `paddle-catalog-setup` and `paddle-sandbox-testing`.
- `CLOUDFLARE.md` — deploying, secrets, D1 migrations.
