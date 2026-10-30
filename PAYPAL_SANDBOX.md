# PayPal recurring subscriptions — Sandbox only

Scenering subscriptions use PayPal Sandbox for development and testing only. The previous checkout provider has been removed from active runtime, configuration and user-facing flows. The API client is hard-pinned to PayPal Sandbox: **Live mode is refused on every runtime, including production.** Sandbox checkout runs wherever the Sandbox keys are present — a local machine, a Worker Preview, or the deployed `scenering.com` — because refusing it on production made the one host that has a stable public URL unusable for testing the real PayPal Sandbox return and webhook addresses. No Live-mode cutover, deployment, or webhook registration is authorized.

What still cannot happen with Sandbox credentials: no real card is ever charged. A Sandbox checkout can only be completed by a PayPal Sandbox test account, so a visitor on the live site can start one and cannot finish it.

## Scenering plans

Create four recurring subscription plans in the PayPal Sandbox business account. Preserve the existing Scenering USD prices and intervals:

| Scenering plan | PayPal billing frequency | Price |
| --- | --- | ---: |
| SceneFlow monthly | Monthly | USD 19 |
| SceneFlow yearly | Yearly | USD 180 |
| SceneForge monthly | Monthly | USD 39 |
| SceneForge yearly | Yearly | USD 372 |

Set each Sandbox plan ID in the matching server-side variable. **One set-up plan is enough to test with.** A Sandbox is normally brought up one product at a time, so the plans are gated individually: a plan whose ID is unset is simply taken off sale and named in the UI, while the plans that do exist stay purchasable. Only credentials (Client ID, Client Secret, Webhook ID and the public app URL) block checkout for every plan; if no plan ID at all is set, nothing can be sold and every slot is reported as missing.

- `PAYPAL_SCENEFLOW_MONTHLY_PLAN_ID`
- `PAYPAL_SCENEFLOW_YEARLY_PLAN_ID`
- `PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID`
- `PAYPAL_SCENEFORGE_YEARLY_PLAN_ID`

The server chooses the plan ID from the authenticated checkout request. Never accept a PayPal plan ID or user ID supplied by the browser as authoritative. Free remains a Scenering account option, not a PayPal subscription.

## Where to test it

Only one thing decides whether checkout runs: the runtime, not the keys and not the build.

| Target | `NODE_ENV` | Sandbox checkout |
| --- | --- | --- |
| `scenering.com` (deployed, `main`) | `production` | Runs, once the three Sandbox keys are set on the **Production** environment |
| A Worker Preview (any other branch) | `development` | Runs, once the keys are on the Previews base config — but a Preview has no D1, KV or R2 binding, so sign-in works and a checkout cannot finish |
| `wrangler dev` locally | `development` | Runs, from `.dev.vars` |

**Test on `scenering.com`.** It is the only host with a fixed public address, and PayPal needs a fixed address: the return URL and the webhook URL are registered in the PayPal dashboard and must match the host the browser actually came from. A Preview gets a new address every build, so a webhook registered against one is stale the moment the next commit lands.

### What is set where on production

Only one value has to be typed into Cloudflare by hand.

| Value | Where it lives | Why |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID` | `wrangler.jsonc` → `vars` | Published to the browser by design: it initialises the PayPal JS SDK |
| The four `PAYPAL_*_PLAN_ID`s | `wrangler.jsonc` → `vars` | Published by `GET /api/billing/public-config` to render the pricing page |
| `PAYPAL_CLIENT_SECRET` | **Cloudflare secret only** | Server-side only. Never in source control, never in a Vite var, never in the browser |

Set the secret with `npx wrangler secret put PAYPAL_CLIENT_SECRET`, or on the dashboard under **Settings → Variables and Secrets → Production → Type: Secret**.

Production secrets and preview secrets are separate stores. `npx wrangler secret put` configures production only; Worker Previews read the shared Previews base config, so the Sandbox keys have to be set there as well:

```bash
bash scripts/setup-preview-paypal.sh
```

It prompts for the Client ID, the Client Secret and the plan ids, without echoing them, and sets each one on the Previews base config. Set at least the one plan you created — the rest can wait. Then push the branch (or run `npx wrangler preview`) and open:

```
https://<your-preview-host>/api/billing/public-config
```

`checkoutEnabled: true` means the buttons will open the checkout. Everything outstanding is named in that response: `missing` blocks checkout, `unconfiguredPlans` takes those plans off sale, and `warnings` is outstanding but not blocking.

Locally, the same values go in `.dev.vars` (gitignored); `scripts/dev-sandbox-up.sh` writes the file with every name in place.

## Runtime configuration

Set `PAYPAL_ENVIRONMENT=sandbox`, the Sandbox REST app `PAYPAL_CLIENT_ID`, the corresponding `PAYPAL_CLIENT_SECRET`, and at least one plan ID. The Client ID is published at runtime only to load PayPal's official JavaScript SDK. Keep the Client Secret and `PAYPAL_WEBHOOK_ID` in server-side secrets; do not add credentials to Vite variables, source control, browser code, screenshots, or chat. `.dev.vars.example` contains empty placeholders only.

Checkout stays disabled until the Sandbox Client ID, Client Secret, at least one plan ID, and a public app URL are available. The Webhook ID is **not** required to test a checkout: approval is verified by reading the subscription back from PayPal, so the button, the approval flow and activation can all be exercised before any webhook is registered. What the webhook adds is everything that happens afterwards — renewals, cancellations, suspensions and failed payments. Apply `migrations/0008_paypal_billing.sql` to the D1 database the Sandbox host uses. Production is the intended Sandbox host, so it is the database that needs the migration.

Live mode stays refused on production and everywhere else: `PAYPAL_LIVE_DISABLED` is thrown before any request leaves the Worker whenever `PAYPAL_ENVIRONMENT` is not exactly `sandbox`. Setting Live credentials can therefore never open a Live checkout on the live site by accident.

## Webhook — verify the deployment before registering

The implemented backend callback path is `/api/webhooks/paypal`. **Do not paste a guessed or locally inferred URL into PayPal.** First deploy the reviewed Sandbox-capable backend to the intended non-production host, confirm that `PUBLIC_APP_URL` names that exact host, and independently verify that an unauthenticated `POST` reaches the Scenering Worker at that path. With `PAYPAL_WEBHOOK_ID` unset, the verified route should return its explicit “verification is not configured” response (503); a 404, proxy error, or host-routing error means the endpoint is not verified. Do not register the callback until the full public URL and reachable backend have been confirmed.

After verification, register the exact reachable URL in the PayPal **Sandbox** app and subscribe to:

- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.UPDATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `PAYMENT.SALE.COMPLETED`
- `PAYMENT.SALE.DENIED`

When you are ready for that, store the Sandbox webhook ID in `PAYPAL_WEBHOOK_ID`. Until then the checkout still runs and the dashboard reports the webhook as outstanding. Scenering asks PayPal's verification API to validate each delivery before processing it. Event IDs are atomically claimed in D1; duplicate deliveries do not apply lifecycle changes twice, and transient provider errors remain retryable.

## Account association and entitlements

Checkout requires the existing authenticated Scenering session. The Worker creates a random, short-lived checkout intent bound to the session user, selected plan, interval, and server-configured Sandbox plan ID. Only a hash of the random intent token is stored. On approval, the Worker fetches the subscription from PayPal and verifies its ID, plan, intent token, and Scenering user association. Paid access is granted only after verified server state/webhooks; a browser callback never grants entitlements. The account area provides PayPal Sandbox self-service and cancellation controls. Existing historical subscription rows and migration history are retained; no database cleanup or destructive migration is part of this change.

## If the Sandbox buttons do nothing

The gate is the **runtime**, not the build. Paid checkout used to be switched on by Vite's `DEV` flag in the browser, which is false in the bundle that is actually served (`npm run dev` runs `vite build --watch`, and every other host serves a production build), so the buttons were dead on the very Sandbox hosts meant for testing them. The browser now asks the server: `GET /api/billing/public-config` reports `checkoutEnabled`, `sandbox`, `production` and a `missing` list naming every variable that is still unset (names only — never values).

- **Buttons disabled, with a line underneath naming variables** — set them in `.dev.vars` (local) or on the Previews base config (a Worker Preview), then reload the page. The pricing page and the account modal show the same list.
- **"Checkout is disabled on production"** — no longer true, and it was never a safety feature. It was a runtime gate that also removed the only host with a stable public URL. Sandbox checkout now runs on production as soon as the three Sandbox keys are set there; Live mode is what is refused, and it is refused everywhere.
- **Only one plan is set up** — that plan is sold; the others show "has no PayPal Sandbox plan yet — set `PAYPAL_…` to sell this plan" on their card and their button stays disabled. Clear the interval toggle to Monthly or Yearly to see the plan you did create. Nothing else changes.
- **`PAYPAL_WEBHOOK_ID` unset** — not a problem for testing. Checkout runs and approval is verified directly against PayPal; the dashboard lists the webhook under warnings. Register it when you want renewals, cancellations and payment failures to arrive.
- **`checkoutEnabled: true` but the dialog says it could not load PayPal** — the browser could not fetch `https://www.paypal.com/sdk/js`. Check the connection, an ad blocker or a VPN. Press **Try again**; the loader no longer caches a failed load.
- **The approval window opens and then hangs** — the page's opener relationship was severed. Every response now sends `Cross-Origin-Opener-Policy: same-origin-allow-popups`, including production, and so does every static page through `public/_headers`. This was the single most likely cause of "the buttons do nothing": production used to send `same-origin`, which severs `window.opener` exactly as PayPal's window opens. The static marketing pages — including `/pricing` — carried no COOP header at all, because `public/_headers` never had one and the Express middleware only covers responses the Worker builds.
- **The dialog opens behind the account modal or off-screen** — it is rendered into `document.body` through a portal, because the account modal's `backdrop-filter` makes it the containing block for `position: fixed` descendants.
- **A 503 on `POST /api/billing/paypal/create-subscription`** — the response now carries the same `missing` list, naming every variable still unset. Read that list and set exactly those. It no longer depends on which host you are on.
- **A retry is refused with "an existing subscription is already active"** — that is a checkout nobody approved, not a subscription. The `pending` row is written as soon as PayPal returns a subscription id, before approval; it carries no period end, so the expiry sweep never reached it, and it (with its checkout intent, which holds the one-open-checkout-per-account slot) used to block every later attempt for good. Closing the dialog, or simply starting the checkout again, now closes the unapproved row and releases the intent. An approval that completes afterwards in a still-open window is still picked up, because confirmation and the webhook look the subscription up by its PayPal id. A genuinely active or `past_due` subscription still refuses a second purchase.
- **`PUBLIC_APP_URL`** — required in production. Outside production it may be left unset and the host the request arrived on is used as the link origin, which is what makes a preview address testable; the admin dashboard marks such a value *Derived*, because a derived host is not a stable address to register a webhook against.

## Validation before any rollout

Run `npm run typecheck`, `npm run worker:typecheck`, `npm test`, and `npm run build`. Exercise Sandbox cases for successful approval, wrong plan, another user's subscription ID, invalid webhook signature, duplicate and concurrent event delivery, payment failure, suspension, cancellation, expiry, and retry after transient PayPal errors. Do not use Live credentials or deploy a production cutover as part of this work.
