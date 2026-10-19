# Scenering

Turn a script into a finished video. Scenering splits your script into scenes,
finds an image for each one, narrates it, lets you style the result in a video
studio, and renders the whole thing out.

## Running it

You need [Node.js](https://nodejs.org) 18 or newer. Scenering runs on
**Cloudflare Workers** — the API is an Express app bridged into a Worker, with
D1 (accounts, sessions, billing), KV (rate limits), R2 (voice-import uploads)
and a Cron Trigger (upload expiry) behind it. In local development `wrangler
dev` emulates all of those bindings, so no Cloudflare account is needed:

```bash
npm install
npx wrangler d1 migrations apply scenering-db --local   # first run only
npm run dev
```

Open **http://localhost:8787**. Copy `.dev.vars.example` to `.dev.vars` to
configure secrets locally (a session secret is required; media and billing keys
are optional).

There are two front doors on the same server:

| Path   | What it is                                                      |
| ------ | --------------------------------------------------------------- |
| `/`    | the website — what Scenering does, shown rather than described  |
| `/app` | the door: sign in, and the studio loads behind it                |

They remain separate bundles (`src/marketing`, `src/studio`, `src/App`), but
the website is now the application's front page: all three bundles start
loading together. The landing page stays visible while the editor, renderer and
studio styles are prepared in the background, so signing in mounts an already
loaded application instead of beginning a second large download.

### Deploying to Cloudflare

```bash
bash scripts/setup-cloudflare.sh   # creates the D1 database, R2 bucket and KV namespace,
                                   # fills their ids into wrangler.jsonc, applies migrations,
                                   # and prompts for the required secrets
npm run deploy                     # builds the site and deploys Worker + assets + cron trigger
```

The full platform-compatibility audit — every backend function mapped to its
Cloudflare service, measured usage against every platform limit, and the
deployment checklist — is in **[CLOUDFLARE.md](CLOUDFLARE.md)**. Note that the
production deployment should be on the Workers Paid plan: password hashing
(scrypt) needs more than the Free plan's 10 ms CPU ceiling.

## API keys and narration

The top-right **API Keys** modal keeps its three provider fields: Pexels,
Pixabay and Speechify. Your Speechify key is stored in this browser and is sent
directly from the browser to `api.speechify.ai` in the provider authorization
header. It is not sent to Scenering or Cloudflare. Speechify usage and charges
are governed by your Speechify account. If Speechify blocks direct browser
requests (for example, through CORS policy), the app reports that error rather
than proxying your key through Scenering or switching providers, using browser
speech, or inserting a silent track.

The operator may optionally configure stock-image defaults in `.dev.vars` or
Cloudflare Worker secrets (the names match `.env.example`):

| Key | What it adds | Without it |
|---|---|---|
| `PEXELS_API_KEY` | Default stock photo search key | Customer's Pexels key or Wikimedia Commons |
| `PIXABAY_API_KEY` | Default stock photo search key | Customer's Pixabay key or Wikimedia Commons |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Projects sync across devices | Saved in your browser |

Image search has a hard quality gate: only photo-like images are used (no
black-and-white shots, diagrams or flat artwork — thumbnails are analysed
pixel-by-pixel), and every image that reaches a scene is 16:9 and at least
1920×1080, so a 1080p render never upscales its footage.

A search never dead-ends. Scene queries come from the narration, so they are
long and specific and often match nothing; the query is then widened in steps
(filler words out, photography qualifiers out, then just the subject) and the
modal says which query the photos on screen actually answer. If nothing online
matches, the bundled nature library answers instead, ranked against the query.
The modal also offers three subjects to click, drawn from a rotating deck, so
no suggestion comes back until every other one has been shown.

Choosing a photo frames it immediately, and always fills the frame: the photo
is scaled to cover the whole scene and centred, top and bottom included, no
matter how badly its shape differs from the video's. Nothing is letterboxed or
blurred behind unless you ask for it yourself in the scene's framing controls,
and a framing you set by hand is never overwritten. A search term typed by
hand is pinned to the scene, so later edits to the script cannot silently
replace it.

## Billing (Paddle)

Payments are handled entirely by [Paddle](https://www.paddle.com/), which is
the **merchant of record**: it sells the subscription, takes the card, charges
and remits the sales tax, and pays Scenering. Scenering never sees a card
number and stores no payment details of its own — only the subscription's
status, plan, period dates and the two management links Paddle returns.

Everything needed is a server-side secret or variable; nothing is hard-coded,
and nothing billing-related reaches the browser bundle. In production set them
with `wrangler secret put <NAME>`; locally they live in `.dev.vars`. The full
connection runbook — including Paddle's agent skills and MCP servers for AI
editors — is **[PADDLE.md](PADDLE.md)**. The flow:

| Step | Where |
|---|---|
| Customer picks a plan | Account & Membership modal → `GET /api/billing/checkout/:plan/:interval` |
| Server opens checkout | `POST {PADDLE_API}/transactions` with `items[0].price_id` = `PADDLE_<PLAN>_<INTERVAL>_PRICE_ID`, `checkout.url` = `PADDLE_<PLAN>_<INTERVAL>_CHECKOUT_URL`, and `custom_data` = `{ user_id, email, plan, interval }` |
| Browser is handed the link | the `checkout.url` Paddle returns, which already carries that transaction |
| Paddle confirms the purchase | `POST /api/webhooks/paddle`, verified against `PADDLE_WEBHOOK_SECRET` (HMAC-SHA256 of `ts:rawBody`, `Paddle-Signature: ts=…;h1=…`, constant-time compare) |
| Webhook maps the purchase to a plan | `PADDLE_<PLAN>_<INTERVAL>_PRICE_ID`, matched against `data.items[].price.id` |
| Webhook finds the account | `data.custom_data.user_id`; failing that, the Paddle customer id (`ctm_…`) recorded by a `customer.*` webhook |
| Access changes | the account's membership row, which is what every entitlement check reads |

**Connecting Paddle, in order:**

1. Set `PADDLE_ENVIRONMENT` — `sandbox` while testing, `live` when real. They
   are separate Paddle accounts, so every value below exists once per
   environment.
2. Create one product per plan (SceneFlow, SceneForge) with a monthly and a
   yearly **price**; copy each price id (`pri_…`) into the four
   `PADDLE_…_PRICE_ID` secrets.
3. Register an **approved checkout URL** in Paddle (**Account settings →
   Checkout settings**) and copy it into the four `PADDLE_…_CHECKOUT_URL` secrets. Paddle
   only returns a link to send a customer to when the transaction carries one.
4. Copy your secret API key into `PADDLE_API_KEY`. It creates the tagged
   transaction, and reads back a subscription's `management_urls` — the cancel
   and update-card links Paddle deliberately leaves out of its webhooks.
5. In **Paddle → Events → Notifications**, add a destination pointing at
   `<PUBLIC_APP_URL>/api/webhooks/paddle` and subscribe to every event the
   checklist lists: `subscription.activated`, `subscription.created`,
   `subscription.updated`, `subscription.canceled`, `subscription.paused`,
   `subscription.resumed`, `subscription.trialing`, `subscription.past_due`,
   `subscription.imported`, `customer.created` and `customer.updated`.
6. Copy the destination's secret key (`pdl_ntfset_…`) into
   `PADDLE_WEBHOOK_SECRET`. Each destination has its own secret, and it is not
   the same value as the API key (`pdl_sdbx_apikey_…` in sandbox, from
   **Paddle → My account → Settings → Authentication**).
7. Sign in as the owner and open **Account & Membership** → *Owner
   administration* — the go-live checklist names anything still missing, shows
   the exact webhook URL to paste, warns if a production deployment is still
   pointed at sandbox, and lists the last 25 webhooks received with their
   outcome.
8. Buy a plan in **sandbox** with Paddle's test card to see the whole loop work
   end to end. Sandbox deliveries are processed like live ones and labelled
   `sandbox` in the webhook log — use your own email, and revoke the granted
   membership from the administration panel afterwards.

Anything Paddle sends that is not a subscription or customer event is recorded
and ignored rather than acted on, so Paddle is never left retrying — a
transaction event carries a `txn_…` id where this code expects a `sub_…` id,
and `subscription.activated` follows a completed payment within seconds anyway.
Each event is applied once — a redelivery with the same event id is a no-op that
leaves a redelivery mark on the event's log entry — and a delivery whose
signature does not verify is rejected with 401 before it is parsed. An event
that maps to no account or no known price is answered 202 (`unmatched`,
`unknown_price`) rather than 5xx, so Paddle stops retrying an event that could
never succeed.

Access follows Paddle's meaning for each status: `active` and `trialing` grant
the plan, and so does `past_due`, because Paddle's dunning is still retrying the
card and the account window warns the member instead of cutting them off
mid-retry. `paused` and `cancelled` do not — a paused subscription means no
billing and no service, and `cancelled` is terminal.

Cancelling at the end of a period needs no grace logic: Paddle keeps the status
`active` with a `scheduled_change` of `{ action: "cancel", effective_at }` until
that date arrives, so the plan runs for exactly as long as it was paid for and
the account window shows the end date with a **Manage or cancel** link to
Paddle's own cancel page. The stored end date downgrades the account on time even
if the next webhook is never delivered.

Webhooks arrive unordered and are retried, so each subscription stores the
`occurred_at` of the event that last changed it and ignores anything older — a
late renewal cannot resurrect a plan the member cancelled.

`LIVE_MIGRATION.md` covers moving a tested sandbox integration onto a live
Paddle account — most of it is six secret values and a dashboard checklist,
because no price ID or API URL is hard-coded.

Sign in as the owner and open **Account & Membership** to see a go-live
checklist naming every environment variable that is still missing, the exact
webhook URL to paste into Paddle, and the last 25 webhooks received with their
outcome (`processed`, `mapped`, `ignored`, `duplicate`, `unmatched`,
`unknown_price`).

Until the keys are filled in, checkout answers `503 BILLING_NOT_CONFIGURED`
and the webhook answers `503`; nothing else in the app is affected, and the
Free plan works throughout.

## Billing (FastSpring, alongside Paddle)

The same four subscriptions are also sold through
[FastSpring](https://www.fastspring.com/), a second **merchant of record**,
and the two can run side by side. FastSpring sells the subscription, takes
the card, charges and remits the sales tax, and pays Scenering; each provider
keeps its own webhook endpoint (`/api/webhooks/paddle`,
`/api/webhooks/fastspring`), the `subscriptions` and `billing_customers`
tables are keyed by provider, and `BILLING_PROVIDER` picks which checkout the
app opens by default (`paddle` or `fastspring`; unset means the provider with
server credentials configured, Paddle first).

| Step | Where |
|---|---|
| Customer picks a plan | Account & Membership modal → `GET /api/billing/checkout/:plan/:interval` (or the FastSpring-only `GET /api/billing/fastspring/checkout/:plan/:interval`) |
| Server opens checkout | FastSpring popup (`sbl.min.js`, `FASTSPRING_STOREFRONT`) or a server-created session (`POST /sessions` with the product path, the buyer's email and the tags) |
| Tags travel with the order | `tags` = `{ user_id, email }` — the FastSpring half of "which Scenering account paid" |
| FastSpring confirms the purchase | `POST /api/webhooks/fastspring`, verified against `FASTSPRING_WEBHOOK_SECRET` (HMAC-SHA256 of the raw body, base64, in `X-FS-Signature`, constant-time compare) |
| Webhook maps the purchase to a plan | `FASTSPRING_<PLAN>_<INTERVAL>_PATH` (defaults `sceneflow-monthly`, `sceneflow-yearly`, `sceneforge-monthly`, `sceneforge-yearly`), matched against the product path in the payload |
| Webhook finds the account | `data.tags.user_id` / `data.tags.email`; failing that, the account FastSpring created at checkout or the `billing_customers` mapping an earlier webhook left behind |
| Access changes | the account's membership row, exactly as a Paddle purchase does |
| Subscriptions are managed | FastSpring's Account Management portal — *Customer portal*, *Manage or cancel* and *Update payment card* all lead there |

The webhook handles `subscription.activated`, `subscription.updated`,
`subscription.charge.completed`, `subscription.charge.failed`,
`subscription.canceled` and `subscription.deactivated`; every other event is
recorded and ignored. A failed rebill keeps access while FastSpring retries
the card (`past_due`), a cancellation runs to the end of the paid period, and
`deactivated` returns the member to Free. Each event id is recorded in
`webhook_events`, so a redelivery cannot apply twice.

The full connection runbook — the exact values to enter in the FastSpring
dashboard, in order — is **[FASTSPRING.md](FASTSPRING.md)**. The same
checklist lives in the app: **Account & Membership** → *Owner administration*
→ *FastSpring billing*.

## Themes

The app ships with five switchable looks — click the **🎨 Theme** button in
the top-right corner:

| Theme | Feel |
|---|---|
| **Classic Dark** | The original dark panels with thin lines |
| **Apple Light** | Crisp white, sharp borders, clean line icons — fits iPad & iPhone |
| **Fluent 11** | Windows 11 style: darker frosted see-through panels, rounded corners |
| **Neon Pop** | Colourful, fun, chunky 2D depth on deep purple-charcoal |
| **Fairytale Glass** | Frosted glass, pastels, elegant serif type |

The choice is remembered in your browser. Themes are implemented as a CSS
layer (`src/themes.css` for the hand-crafted design language,
`src/themes.generated.css` for the machine-built utility colour matrix) plus
a small registry in `src/lib/themes.ts`. If you add new colour utility
classes to components, regenerate the matrix with `npm run theme:css`.

## How a project flows

1. **Setup** — title, script, aspect ratio, scene length and camera motion.
   The script is split into evenly-sized scenes; each scene's length follows
   its own narration, so there are no silent gaps.
2. **Scenes** — one card per scene. Swap the image, drop in a video clip, crop
   and reposition (aspect ratio is always preserved), edit the narration, and
   pick the transition between scenes from twenty-one options grouped by
   family: dissolves (crossfade, fade to black or white, blur dissolve),
   pushes, covers, wipes, reveals (iris, blinds) and dynamics (zoom in, zoom
   out, whip pan).
3. **Voiceover** — pick a voice, generate narration, download the audio, and
   add full-video music or a production visualiser. A live sound visualiser
   draws the narration while you listen to it. The music library holds 30
   cleared instrumental beds — filter them by feel (soft piano, classical,
   acoustic, ambient, cinematic, electronic, upbeat) or search by name — and
   **Upload your music** puts your own file under the video instead. Uploads
   are kept in this browser and survive a reload; you are responsible for
   their licence, and the credits document says so. Captions can be switched
   on and off from here as well as from the Captions step.
4. **Captions** — styling and timing. One switch turns captions on or off for
   the whole project, and any single scene can be switched off on its own;
   both are obeyed by the live preview and the exported file.
5. **Video Studio** — the look of the finished video: filters, text templates,
   3D stickers, lower thirds, titles, call-to-action badges, sound effects,
   intro and outro.
6. **Render** — carries out the output choices made in Setup with a frame-exact,
   offline WebCodecs renderer, then places the finished video in the Vault.
   Every frame, narration sample and caption timestamp is generated from the
   timeline rather than wall-clock speed. On a slow machine rendering may take
   longer than the video's duration, but output smoothness and sync are
   unaffected. Long Chromium renders stream their growing container into
   protected browser storage with bounded backpressure; decoded photos/video
   decoders are kept to a three-scene window and audio telemetry is packed into
   fixed arrays. The on-screen health panel shows these safeguards, elapsed and
   estimated time, frames, output bytes and background-tab state. Browsers
   without WebCodecs can use the explicit real-time MediaRecorder compatibility
   renderer. Need another platform's cut? Go back to Setup, pick that
   destination, render again.

## Project layout

```
src/
  components/   React UI, one studio per phase
  lib/          the engines — framing, motion, text art, rendering, filters
  data/         catalogues: templates, filters, voices, caption styles
  marketing/    the public website at "/" (see below)
public/
  sounds/       music and sound effects
  videos/       intro and outro clips
  marketing/    optimised website artwork (WebP) + the link-preview card
assets-src/     full-size artwork sources, ignored by git
scripts/        theme CSS generator, website asset optimiser, preview card
server.ts       Express API: narration, image search, hosts Vite in dev
tests/          the test suite
```

Some `lib` modules are worth knowing about, because they are deliberately the
single source of truth for their job:

- **`render-profile.ts`** — the **Master Render Profile**: the one central
  encoding configuration (resolution profiles, frame rate + CFR, H.264/AAC
  MP4 defaults, the platform-aware bitrate ladder, quality presets, keyframe
  interval, file naming, platform compatibility checks and human-readable
  render-failure reports). Platform targets — YouTube, Shorts, TikTok,
  Reels, Facebook, LinkedIn, Pinterest — inherit from it and only override
  what the platform genuinely requires. All output decisions live in
  **Project Setup**: pick a publish destination and Scenering sets the
  canvas, resolution, frame rate and encoding automatically (advanced
  overrides are tucked behind a collapsed panel). The default needs no
  knowledge of encoding: press Render and you get High quality, 1080p,
  30 FPS CFR, H.264 + AAC in a web-optimised MP4.
- **`audio-mastering.ts`** — the optional final-mix stage (on by default):
  a gentle bus compressor and safety limiter so the mix never clips, plus
  voice-priority ducking that eases music down while the narrator speaks.
  Switch it to Manual in Project Setup's advanced overrides and your mix passes through
  untouched.
- **`scene-framing.ts`** — every image placement in the app. The editor
  preview, the live preview and the exported video all call into it, which is
  what guarantees a photo is never stretched out of shape.
- **`render-effects.ts`** — `getMotionTransform()` drives all camera motion.
- **`voice-monitor.ts`** — one shared analyser the voice player routes through,
  so the Voiceover step's visualiser is driven by the real narration. Nothing
  is routed until a visualiser is on screen, and every Web Audio call is
  guarded: if the tap cannot be attached the voice still plays, untapped, and
  the panel says so rather than animating something it cannot hear. Browser
  speech-synthesis voices expose no audio node at all, so they can never be
  measured — the panel is honest about that too.
- **`text-art.ts`** / **`render-text-template.ts`** — title lettering and the
  29 text templates.
- **`offline-export.ts`** — the preferred frame-exact WebCodecs encoder and
  MP4/WebM muxer. `render-output-store.ts` gives it a random-access OPFS target,
  preserving MP4 index patching while draining the growing file to disk with a
  bounded queue; browsers without OPFS retain the piecewise memory fallback.
  `audio-telemetry.ts` packs every analyser frame into contiguous arrays rather
  than retaining thousands of promises and objects. The exporter renders
  independently of playback speed; `frame-ticker.ts` provides pacing only for
  the explicit real-time MediaRecorder fallback. In that fallback it uses
  `requestAnimationFrame` while the tab is visible,
  a Web Worker timer while it is hidden, and a
  watchdog if both stall. This is why the Ken Burns glides instead of
  stuttering in the recorded file.
- **`word-sync.ts`** — word-level caption timing. The TTS engine reports the
  spoken offset of every word; the karaoke highlight follows the voice itself
  rather than an estimate of it.
- **`duration-utils.ts`** — `sceneTimelineDuration()` is the one scene-length
  formula, shared by the live preview and the export so scene cuts, audio
  starts and caption flips land on the same moment in both.
- **`image-candidates.ts`** — the image-search quality gate. Only
  photographic sources pass, and every delivered image is 16:9 and at least
  1920×1080 (Pexels is served as an exact 1920×1080 crop), so nothing is ever
  upscaled into a 1080p render. `image-analysis.ts` adds the visual half:
  black-and-white shots, diagrams and flat artwork are recognised from their
  thumbnails and dropped.

## The website

`src/marketing/` is the page at `/`. It explains the product by rebuilding it:
the scene list, the visual search, the voice picker, the caption styles and
the Video Studio timeline are all live React drawn from the app's own
catalogues, so the moment the app gains a caption style or a transition, the
website shows it.

Four files hold the whole thing together:

- **`product-facts.ts`** — every number, claim and piece of plan packaging on
  the page, in one place. The workflow steps are not written here either:
  they are `PROJECT_PHASES`, the studio's own tab rail, so the page cannot
  advertise a step the app does not have. (It once told a seven-stage story
  against a six-tab app; choosing the visuals belongs to Scenes, because that
  is the tab it happens on.) The counts are imported from the real catalogues
  rather than typed out, the provider order matches `server.ts`, and anything
  that is not built yet is marked `comingSoon`. If a sentence on the website
  makes a promise, it is written here and tested.
- **`assets.ts`** — the artwork registry. Each entry says what the picture is,
  which responsive widths exist and what kind of thing it is (`rendered` for
  live UI, `concept` for our own artwork, `screenshot`/`recording` for the
  real thing, `pending` for a slot that has no file yet and degrades into a
  labelled placeholder). Swapping concept art for a real screen recording is
  an edit to this file, not a redesign.
- **`demo-project.ts`** — the one fictional project ("Where Cities Begin")
  that every mockup on the page renders, which is why the scene list, the
  timeline, the captions and the examples all agree with each other.
- **`marketing.css`** — a self-contained `.mkt-*` design system, imported only
  by `MarketingSite.tsx`. It shares no classes with the studio, so neither
  side can restyle the other — but it is built from the same colours (below).

### One product, one look

The studio ships several themes; **Porcelain** is the default one a new
visitor gets, and the website is painted in it too. The colours live once, in
`src/shared/porcelain.css`, as `--pc-*` custom properties copied from the
theme generator's porcelain palette; `marketing.css` and the sign-in screen
both `@import` that file and define their own variables in terms of it.
`tests/marketing.test.ts` checks the values still match the generator, so the
two halves cannot drift apart.

### The same visualiser on both sides

The Voiceover step draws the narration with `LiveVoiceVisualizer`, which is
`renderTimelineInsert()` — the function that paints the finished video — fed by
the live analyser. Pick a style there and you have already seen what placing it
on the video will look like.

The website shows that same visualiser: the real canvas where it can afford the
catalogue chunk (the voice section and the Video Studio mockup), and a
CSS-only echo of the twenty-band Talking Dot Wave where it cannot (the hero,
the stepper, the transformation strip). There are no invented waveform graphics
left on the page — the varied dot colours come from the renderer's editable
palette, and a test fails if the two presentations drift.

### Real previews, not pictures of previews

The effects on the page are not screenshots. `components/RealEffects.tsx`
mounts the studio's own preview canvases — the sticker renderer, the text
template renderer, the colour grader, the CTA badge, the audio visualiser —
and the website renders live examples with them. The grade on the finished
frames is the string the app's own `getFilterCss()` produces. These are the
only two modules allowed to import the heavy catalogues, they are pulled in
with `React.lazy` when the section scrolls into view, and everything they
name (a filter, a sticker, a lower third, a music bed) is checked against the
real catalogue by the tests.

Artwork pipeline:

```bash
npm run marketing:assets   # assets-src/marketing/*.png → public/marketing/*.webp
npm run marketing:og       # rebuilds the 1200x630 link-preview card
```

The sources in `assets-src/` are deliberately untracked; the optimised WebP
files (a few hundred KB in total) are what ships.

The page keeps to a few rules, and the tests enforce them: nothing is claimed
that the app cannot do, unbuilt ideas are labelled **Coming soon**, mockups
say they are mockups, the sample data is fictional, there are no real people
or customer projects, and there is no "go viral" anywhere.

### The five questions

The band under the hero is five real objections — credits, being on camera,
not wanting to record a voice, whether the pictures are allowed, never having
edited before. Each answers in one true line and links to the section that
explains it, which then flashes so the answer is found rather than hunted.
The narration disclosure is checked against the code by
`tests/marketing.test.ts`: the script is split by `splitScriptIntoScenes()`,
the search terms come from `topic-extract.ts`, and Speechify synthesis uses
the customer-provided key with no alternate-provider or silent-track fallback.

### The door

The website has exactly one way into the editor: **Sign in**, in the
navigation. There are no "try it now" shortcuts sprinkled through the page and
no link back out of the studio; `tests/marketing.test.ts` fails if a second
one appears.

`src/studio/` is that door. There is no account server — Scenering runs
entirely in your browser — so signing in creates a local profile: a name and a
passphrase, hashed with PBKDF2 (SHA-256, 210,000 iterations) via the Web
Crypto API and stored in `localStorage`; the session itself lives in
`sessionStorage` and ends with the tab. The screen says as much, including
that a forgotten passphrase means starting over, and that on a page served
without HTTPS the browser withholds the strong hashing and a weaker fallback
is used. It keeps other people out of your projects on a shared computer; it
is not a security boundary against someone with the machine.

## UI conventions

Three rules keep the interface clean as it grows, and `tests/ui-chrome.test.ts`
enforces all of them by scanning the source:

- **One scroll, no panes.** The page — and each modal — is one long
  document. Never add an inner `overflow-y-auto` pane; the modal overlay is
  the only element allowed to scroll vertically.
- **Hairline borders only.** All dividers are the 1px translucent
  `border-hairline` token (theme color in `tailwind.config.js`, colour
  defined via `--hairline` in `src/index.css`). No `border-2` or solid-gray
  borders.
- **Options look like options.** Tab bars, section pickers and filter pills
  use the `.opt-btn` / `.opt-group` component classes from `src/index.css`;
  the selected one gets `.opt-btn-on`. Editor modals stack every section
  and their “tabs” are jump buttons (`jumpToSection`) that scroll the page
  to the matching heading instead of hiding the other sections.

## Tests

```bash
npm test      # ~135,000 checks, about 3 seconds
npm run verify  # typecheck + tests + production build
```

Each suite in `tests/` is a plain script run with `tsx` — no test-runner
dependency. They share a harness whose stub canvas throws on any non-finite
drawing argument, which is how the geometry gets checked without a real
browser. The suites cover image framing (aspect ratio is never distorted
across every fit/zoom/crop/rotate/flip combination), camera motion (edge-safe
and actually visible), scene splitting and durations, the sticker/template/
filter catalogues, and responsive layout from 320px to 2560px.

Two of them guard the website. `marketing.test.ts` checks that it tells the
truth: every count matches the catalogue it came from, every asset in the
registry has alt text and a file, planned features are labelled, the visual
providers match the server, and a list of banned phrases (guaranteed views,
going viral, rate limits) never appears. `marketing-render.test.ts` builds the
site with esbuild, renders it to HTML with `react-dom/server` and inspects the
markup — one `h1`, every section present and in story order, every image with
alt text, dimensions and a `srcset`, one selected tab per tablist, and no
`undefined` anywhere in the copy.
