# FastSpring

Everything Scenering needs in order to take money through
[FastSpring](https://www.fastspring.com/), and everything an AI agent working on
this repository needs in order to get FastSpring right.

FastSpring is a **merchant of record**, exactly like Paddle (see `PADDLE.md`).
It sells the subscription, takes the card, calculates and remits the sales tax
in every jurisdiction, handles dunning and refunds, and pays Scenering. The two
can run side by side: each has its own webhook endpoint, the `subscriptions`
and `billing_customers` tables are keyed by provider, and `BILLING_PROVIDER`
chooses which one the app opens by default. Scenering's only jobs are to open a
checkout tagged with the right account, and to believe — nothing else — a
signed webhook that says a subscription changed.

> **Dashboard labels move.** FastSpring renames and rearranges its dashboard
> from time to time. Where this document names a menu, treat it as the shape of
> the thing to look for.

---

## 1. Step-by-step checklist (the exact values to enter)

Work top to bottom; every row names the exact value that goes in this
repository's environment.

### 1.1 Store and storefront

| # | In the FastSpring app | Enter / copy | Into |
|---|---|---|---|
| 1 | **Settings → Store Settings** — create the store (e.g. `scenering`) | Note your store's unique subdomain (e.g. `scenering`) | — |
| 2 | **Checkouts → Popup Checkouts → "Place on your Website"** — copy the `data-storefront` value from the generated script snippet | Storefront path, e.g. `scenering.onfastspring.com/popup-scenering` (testing: `scenering.test.onfastspring.com/popup-scenering`) | `FASTSPRING_STOREFRONT` |
| 3 | On the same popup checkout, open the whitelisted-websites badge | `https://scenering.com` and `https://www.scenering.com` (add `http://localhost:5173` and the preview host while testing) | — |

The storefront path is two parts: the **store subdomain** (`scenering.onfastspring.com`)
and the **Company Sub-Directory Checkout ID** you enter when creating the
popup checkout (Checkouts → Popup Checkouts → Create Popup Checkout) — the
unique ID that becomes the part after the slash (`popup-scenering`, `popup`,
…; no spaces or special characters). Enter `popup-scenering` to match this
runbook; if FastSpring generated a different ID, use it, as long as the
storefront value and the ID agree. The `.test.` in the host selects
FastSpring's test environment — a production
deployment pointed at a `.test.` storefront cannot take a real payment, and the
administration panel warns about it by name.

### 1.2 Products (the four paid subscriptions)

**Store → Products → Create Product**, once per row. The **Product Path** is
the value that matters: it is what checkout puts in the cart and what every
webhook carries back.

| # | Product name | Product path (ID) | Price | Billing | Into |
|---|---|---|---|---|---|
| 1 | SceneFlow Monthly | `sceneflow-monthly` | $19.00 USD | Subscription, every 1 month | `FASTSPRING_SCENEFLOW_MONTHLY_PATH` (only if renamed) |
| 2 | SceneFlow Yearly | `sceneflow-yearly` | $180.00 USD | Subscription, every 1 year | `FASTSPRING_SCENEFLOW_YEARLY_PATH` (only if renamed) |
| 3 | SceneForge Monthly | `sceneforge-monthly` | $39.00 USD | Subscription, every 1 month | `FASTSPRING_SCENEFORGE_MONTHLY_PATH` (only if renamed) |
| 4 | SceneForge Yearly | `sceneforge-yearly` | $372.00 USD | Subscription, every 1 year | `FASTSPRING_SCENEFORGE_YEARLY_PATH` (only if renamed) |

Leave the `FASTSPRING_*_PATH` variables **unset** when the paths match the
table — the defaults are exactly these four strings. Set one only when a
product was created with a different path, and the webhook mapping follows
automatically.

The catalogue prices stay in USD; FastSpring's own localization shows and
charges each visitor's currency at checkout. The prices above must match
`src/config/plans.ts` (`PLAN_CONFIG`), which is the single source of truth the
pricing page prints.

### 1.3 Webhook

**Developer Tools → Webhooks → Add URL** (or Integrations → Webhooks):

| Field | Value |
|---|---|
| URL | `https://scenering.com/api/webhooks/fastspring` (any environment: your domain + `/api/webhooks/fastspring`) |
| HMAC SHA256 Secret | Generate one (a long random string). This is **not** the API password. |
| Events to tick | exactly the six below |

Tick these six subscription events — the endpoint acts on exactly these and
records everything else as ignored:

- `subscription.activated`
- `subscription.updated`
- `subscription.charge.completed`
- `subscription.charge.failed`
- `subscription.canceled`
- `subscription.deactivated`

Put the HMAC SHA256 Secret in `FASTSPRING_WEBHOOK_SECRET`. Every delivery
carries it as `X-FS-Signature`: **HMAC-SHA256 over the raw request body,
base64-encoded**, keyed with the secret. Without the secret set the endpoint
answers `503` rather than trusting the caller; with it, a delivery that does
not verify answers `401`.

Optional but recommended: enable **Webhook Expansion** on the webhook so each
payload carries the full account and product objects (customer email and the
account management URL). Without expansion the handler still matches payments
through the checkout tags, but the customer-facing portal links are blank.

### 1.4 API credentials (optional)

**Developer Tools → API → API Credentials** — create a username/password pair:

| Field | Into |
|---|---|
| API Username | `FASTSPRING_API_USERNAME` |
| API Password | `FASTSPRING_API_PASSWORD` |

Needed for **server-created session checkouts** (`FASTSPRING_CHECKOUT_MODE=session`)
and for **pre-authenticated Account Management links** (the Customer portal
button). Without them the popup checkout still works, and the account links
recorded from the webhooks still open FastSpring's portal, where FastSpring
emails the customer a secure login link.

### 1.5 In this repository

| Requirement | Where |
|---|---|
| `FASTSPRING_STOREFRONT` — storefront path from §1.2 | plain var in `wrangler.jsonc`; `.dev.vars` locally |
| `FASTSPRING_WEBHOOK_SECRET` | secret (`wrangler secret put FASTSPRING_WEBHOOK_SECRET`) |
| `FASTSPRING_API_USERNAME` / `FASTSPRING_API_PASSWORD` | secrets (optional) |
| `BILLING_PROVIDER=fastspring` | plain var, when FastSpring should be the default checkout |
| `FASTSPRING_CHECKOUT_MODE` — `popup` or `session` | optional plain var |
| `FASTSPRING_*_PATH` × 4 | only when a product path was renamed |
| `PUBLIC_APP_URL` | already required |

Then open **Account & Membership → Owner administration** in the app: the
*FastSpring billing* panel is the same checklist in live form — what is set,
what is missing, the webhook URL to paste, the events to tick, and the four
product paths it will recognise.

### 1.6 Go live

1. Create (or switch to) the **live** store; the host loses the `.test.`
   (`scenering.onfastspring.com/popup-scenering`).
2. Update `FASTSPRING_STOREFRONT`, and set `FASTSPRING_WEBHOOK_SECRET` to the
   **live** webhook's secret (test and live stores have separate webhooks and
   separate secrets).
3. Update `FASTSPRING_API_USERNAME` / `FASTSPRING_API_PASSWORD` to the live API
   credentials if you use sessions or portal links.
4. Register the live webhook URL (`https://scenering.com/api/webhooks/fastspring`)
   on the live store and tick the same six events.
5. Complete FastSpring's own seller onboarding (business details, tax, bank) —
   outside the code, and the step most often left to last.
6. Set `BILLING_PROVIDER=fastspring` if FastSpring should be the default
   checkout. Paddle keeps working from the same pages' fallbacks either way.

---

## 2. How a purchase is matched to an account

Exactly one way, and it is the reason the pieces are shaped the way they are:
**`tags`**.

When the app opens checkout — the popup through `sbl.min.js` or a session
created server to server — it attaches two order tags:

```
user_id = <the signed-in Scenering account id>
email   = <the signed-in email address>
```

FastSpring copies order tags onto the subscription it creates and sends them
home on every webhook, and the buyer cannot edit them. The webhook handler then
matches the account by best evidence:

1. `data.tags.user_id` (with `data.tags.email` as the stronger identity when
   the two disagree — FastSpring creates an account from whatever address was
   typed at checkout),
2. `data.tags.email`, then the account's own `account.contact.email`,
3. the `billing_customers` mapping an earlier webhook left behind,
4. any subscription already stored against that FastSpring account id.

A webhook that matches no account is recorded as `unmatched` and grants
nothing. Mapping alone never grants a plan; only a subscription event does.

## 3. Webhook contract

**Endpoint.** `POST /api/webhooks/fastspring` (see `FASTSPRING_WEBHOOK_PATH`
in `server/platform.ts`).

**Signature.** `X-FS-Signature` = `base64(HMAC-SHA256(rawBody, secret))`, the
secret being the webhook's HMAC SHA256 Secret. The body is hashed as the bytes
that arrived — never a re-serialised object — and the comparison is
constant-time. FastSpring signs nothing else: there is no timestamp to check,
so replay protection is the UNIQUE `provider_event_id` in `webhook_events`.
A redelivery of a recorded event id is marked `duplicate` and applied again
only insofar as the stored state says the same thing.

**Envelope.** FastSpring batches events per POST:

```json
{
  "events": [
    {
      "id": "jazYJQw5RSWVR474tU2Obw",
      "live": true,
      "type": "subscription.activated",
      "created": 1426560444800,
      "data": { "id": "sub…", "state": "active", "product": { "product": "sceneflow-monthly" }, "tags": { "user_id": "usr_…", "email": "…" } }
    }
  ]
}
```

A bare single event object is accepted too (handy for replays). Every event id
is recorded in `webhook_events` with the handler's outcome; the six
subscription events are the only ones that change what a member can do.

**What each event does** (`sceneringStatusForFastSpring`):

| Event | Stored status | Access |
|---|---|---|
| `subscription.activated` | `active` (`on_trial` while `state` is `trial`) | plan on |
| `subscription.updated` | from `state` | follows the state |
| `subscription.charge.completed` | `active` | plan on (a renewal succeeded) |
| `subscription.charge.failed` | `past_due` | plan **on** — FastSpring is retrying the card (dunning) |
| `subscription.canceled` | `cancelled` | plan on until the stored end date (deactivation date), then the expiry sweep returns the member to Free |
| `subscription.deactivated` | `expired` | plan **off** — the paid period is over |

`subscriptions`, `billing_customers` and `memberships` are updated from these;
the membership plan is `free`, `sceneflow` or `sceneforge` as mapped from the
product path (§1.2).

## 4. Customer subscription management

FastSpring hosts the customer's own **Account Management** portal (order
history, subscriptions, payment methods). Three places lead there:

- **Customer portal** in the Account window calls `GET|POST /api/billing/portal`,
  which — for a FastSpring member — mints a pre-authenticated link with
  `GET /accounts/{account_id}/authenticate` (valid 24 hours) and lands on the
  Subscriptions tab (`#/subscriptions`). Without the API keys it falls back to
  the customer-facing `account.url` the webhook recorded.
- **Manage or cancel** and **Update payment card** open the stored account
  management URL. In the portal each subscription's **Manage** menu offers
  *Update payment method*, *Cancel subscription*, *Modify subscription* and
  *Generate renewal invoice*; a cancelled subscription can be reactivated
  there until its deactivation date.

Scenering never stores a card and never cancels on the customer's behalf —
FastSpring is the seller.

## 5. Checkout modes

| Mode | `FASTSPRING_CHECKOUT_MODE` | Needs API keys? | What happens |
|---|---|---|---|
| Popup | `popup` (or unset without API keys) | no | The page loads FastSpring's Store Builder Library (`https://sbl.onfastspring.com/sbl/1.0.6/fastspring-builder.min.js`, the snippet whose `data-storefront` is §1.2) and opens the popup with one product in the cart and the account tags on the session. |
| Session | `session` (or unset with API keys) | yes | The server creates the checkout (`POST /sessions`) with the product, the tags and the buyer's email already in it, and redirects to the hosted checkout URL (`https://<storefront host>/session/<id>`). |

Both modes put the same `tags` on the order — that is the whole trick. The
server-side names for the payloads are `mode: "popup"` and `mode: "session"`
from `GET /api/billing/fastspring/checkout/:plan/:interval` (also served,
provider-aware, at `GET /api/billing/checkout/:plan/:interval`).

## 6. Local development and testing

1. `cp .dev.vars.example .dev.vars` and fill in the `FASTSPRING_*` values for
   the **test** store (`scenering.test.onfastspring.com/...`).
2. Point the test store's webhook at your tunnel (ngrok, cloudflared, …):
   `https://<tunnel>/api/webhooks/fastspring`.
3. Buy the test way: FastSpring's test payment details
   (`https://developer.fastspring.com/docs/test-orders/`) work in any `.test.`
   storefront.
4. Or replay a delivery by hand. The suite in `tests/fastspring.test.ts` does
   exactly this: it signs a payload the way FastSpring does and posts it, so
   the same trick works against a local server:

   ```js
   const signature = require("crypto").createHmac("sha256", SECRET)
     .update(Buffer.from(rawBody)).digest("base64"); // header X-FS-Signature
   ```

   Post `{"events":[ … ]}` to `/api/webhooks/fastspring` with that header and
   check `webhook_events` in the administration panel.

## 7. What this repository contains

| Piece | Where |
|---|---|
| Product path defaults and plan mapping | `src/config/fastspring.ts` |
| Signature verification, webhook handler, checkout, portal, checklist | `server/platform.ts` (the FastSpring block) |
| Popup loader for `sbl.min.js` | `src/lib/fastspring.ts` |
| Account window: checkout, portal links, go-live checklist | `src/components/AccountMembershipModal.tsx` |
| CSP (`*.onfastspring.com`, `*.fastspring.com`) and webhook mounting | `server.ts` |
| The owner's setup manual | `src/admin/admin-manual.ts` (Taking payments) |
| End-to-end suite | `tests/fastspring.test.ts` |
