# Changelog

## Unreleased — the three-slot Vault, engineered for five, and the fifteen-minute guarantee

- **The Vault keeps THREE finished videos — the designer's rule — and the
  machinery behind it is engineered and tested for FIVE.** The design was
  proven at five before the rule was tightened, so the capacity stays in the
  code as a safety envelope rather than an allowance:
  `MAX_VAULT_RENDERS = 3` is what a customer gets (the Vault panel reads it,
  so the copy says "3 slots"), and `VAULT_CAPACITY_RENDERS = 5` is what every
  deadline, prune and storage check is sized for. A vault that ever holds five
  — an older build, a restored browser profile — is pruned back to three on
  its next save or the first time the render screen opens, keeping the newest
  rows (`vaultSlotsToDrop()`, `enforceVaultRule()`), instead of corrupting or
  losing entries.
- **A fifteen-minute render can fill any slot.** Every finishing deadline is
  sized for the longest video the engine is built for, at the capacity
  envelope — not for a one-minute Short:
  - **The oldest slot is freed BEFORE the new file is written**, so the disk
    never has to hold one render more than the Vault's capacity.
  - **Vault deadlines scale with the file** (`vaultRequestTimeoutMs`): 90 s
    floor, 8 MB/s, 20 min cap, so committing a 1.1 GB 1080p or 3.8 GB 4K
    fifteen-minute render gets minutes instead of a fixed 90 seconds. The
    render screen's outer budget (`vaultCommitTimeoutMs`) is always slightly
    larger, so the inner transaction aborts cleanly first.
  - **The offline audio mix is bounded by the video's length**
    (`audioMixTimeoutMs`, ≈8½ minutes at fifteen minutes) instead of being
    unbounded, and it now reports the percentage it has reached.
  - **The MP4 fast-start reservation is a named, tested formula**
    (`muxChunkReservation`): fifteen minutes at 24/25/30/60 fps always
    reserves room for all 27,000 frames and 42,188 AAC packets.
  - **The stall watchdog cannot kill a healthy long render.** A phase may keep
    it quiet only when that phase carries its own deadline — the rule is
    written on `withProgressTicker`, so bounded-but-slow is never treated as
    hung, while a genuinely stopped step still is.
- **Image quality is untouched by any of this.** The bitrate ladder,
  resolution and frame rate still come only from the Master Render Profile: a
  fifteen-minute render is encoded with exactly the same 1080p/4K bitrates as
  a fifteen-second one, pinned by `tests/render-longform.test.ts`.
- **The storage gate names the Vault** when it refuses a render, because
  finished videos are usually the largest thing a customer can clear.

## Unreleased — a render can no longer stall at the packaging step

- **Fixed: a render that had encoded every frame could sit on "Package" for
  ever, with no error, no working Cancel and no file — and the finished video
  was then lost.** This is the failure reported after a second short render,
  run straight after a first one that had already finished and been
  downloaded: every frame done, then nothing past 95%. The whole stretch
  between the last frame and the Vault was a set of unbounded waits, and any
  one of them wedging produced the same silent hang. See
  **[RENDER_STALLS.md](RENDER_STALLS.md)** for the full investigation.
  - **`src/lib/render-guard.ts` (new).** `withTimeout()`, `drainEncoderQueue()`
    and `withProgressTicker()` turn a browser-internal wait that stops moving
    into a named `RenderTimeoutError` instead of a promise that never settles.
    Every finishing step now has a deadline: the encoders' own flush
    (`120 s`), the OPFS disk drain (`120 s`), closing and handing over the
    staging file (`60 s`), reading the file back for verification (`60 s`) and
    the Vault commit (`150 s`). An encoder queue that stops draining is
    declared wedged after `60 s` — a queue that keeps moving, however slowly,
    is never mistaken for a stall.
  - **Cancel now works after the frames are done.** `OfflineExporter.abort()`
    stops the encoder flush, the disk drain and the hand-over immediately; the
    old flag was only read between frames, which is exactly when nobody needs
    to press Cancel.
  - **A stall never falls back to real-time recording.** A deadline that
    expires is not a codec mismatch, so it is reported, not answered with a
    full MediaRecorder re-encode that would take as long as the video is.
  - **The Vault can no longer hang the render.** IndexedDB opens time out
    after `15 s` and every transaction after `90 s` (both abort cleanly), a
    `versionchange` closes the connection instead of blocking a newer one, and
    a timed-out commit still leaves the finished file downloadable with the
    existing "download this video before closing the tab" message.
  - **A six-minute stall watchdog** ends any render that stops reporting
    progress for any other reason (image decode, clip seek, the offline audio
    mix), with a sentence explaining it — instead of a spinner plus a
    before-unload prompt that would not let the customer close the tab.
  - **Consecutive renders no longer accumulate.** The previous finished video
    is released (app state, render-screen state and its object URL) the moment
    a new render is authorised, abandoned `.part` staging files older than 30
    minutes are swept before a render starts, a second encoder can never be
    created while a job is live, and the MP4 fast-start chunk reservation has
    real headroom (`+8` video, `+64` audio) so it can never trip the muxer's
    hard cap at the packaging step.
  - **The start lock can no longer be lost.** A failed `loadCustomVideos()`, a
    watermark image that never answers (`15 s` deadline), or a missing render
    canvas used to return without clearing the preparation flag, leaving the
    Render button permanently dead until a reload; all three now release it.
  - **`describeRenderFailure()`** reports a stall as
    "The render stalled while finishing the file", says the frames themselves
    were fine, and suggests clearing Vault space before retrying.
  - **Tests:** `tests/render-guard.test.ts` (deadlines, queue draining,
    cancellation, no unhandled rejections, a stuck OPFS writer) and new
    failure-description and pipeline-order checks in
    `tests/render-profile.test.ts` and `tests/render-quality-speed.test.ts`.

## Unreleased — true-resolution rendering, source photo selection, voice clarity & verified exports

- **Imported photos are never pre-cut and fill the frame by default.** A
  chosen photo lands in the scene exactly as imported — original resolution,
  original shape, every pixel, crop `{x:0, y:0, w:1, h:1}` — so no
  frame-shaped crop is ever baked in. Its default fit is `cover` ("Fill
  Frame"): the photo is scaled by a single factor, never stretched, until it
  fills the frame — in a `9:16` project it touches the top and bottom edges
  (the overflowing sides are clipped), and in `16:9` it always fits. Because
  nothing is baked in, the photo can be re-cropped at any time in Crop & Fit,
  and Reset framing returns a scene to this default.
- **Improved: source-image selection, rendering fidelity, encoder bitrate,
  caption sharpness, motion cadence, vocal clarity, and post-render validation.**
  - **Source-image selection (`image-candidates.ts`, `image-picker.ts`,
    `server.ts`, `scene-image-loader.ts`).** Candidate mappers record native
    dimensions and high-resolution variants across Pexels, Pixabay and Wikimedia
    Commons, reject extreme aspect-mismatch photos (`> 2.25×` vs `16:9`) before
    selection, rank candidates by resolution headroom and frame aspect fit, and
    upgrade saved stock URLs at render time (`2560×1440` / `3840×2160` `q=92` on
    Pexels, `2560px` / `3840px` on Wikimedia, `_1920` on legacy Pixabay URLs)
    when zoom, `9:16` framing, `2K` or `4K` output needs additional pixels.
  - **True output resolution & high-quality scaling (`VideoPreview.tsx`,
    `offline-export.ts`, `scene-framing.ts`, `render-section.ts`,
    `RenderView.tsx`).** `VideoPreview` renders onto Full HD (`1920×1080`,
    `1080×1920`, `1080×1080`, `1440×1080`) RGBX surfaces; `OfflineExporter`
    sets explicit `displayWidth`/`displayHeight`, checks canvas dimensions on
    every encoded frame, and selects H.264 levels up to `5.2`; `scene-framing`
    uses progressive `2×` mip downsampling and `imageSmoothingQuality = "high"`
    to prevent stair-stepped edges on multi-megapixel photos.
  - **Quality-oriented bitrate & colour fidelity (`render-profile.ts`,
    `offline-export.ts`, `render-effects.ts`, `visualizer-materials.ts`).**
    Above `1080p`, video bitrate scales with pixel count (`0.88` exponent —
    `~16.6 Mbps` at `2K30` High, `~33.9–40.6 Mbps` at `4K30` High/Maximum) with
    variable-bitrate probing and `bt709` colour primaries; audio visualizers
    render directly onto the destination canvas so additive bloom stays bright
    and un-blurred.
  - **Sharp captions & smooth motion (`render-captions.ts`, `frame-ticker.ts`).**
    Captions render at final output resolution with `geometricPrecision`, a
    `>= 600` weight floor, portrait-aware safe margins (`9:16`), automatic
    single-word width fitting, and two-pass shadow/outline separation so dark
    drop shadows never bleed across bright active karaoke fills; `frame-ticker`
    uses a phase-locked `nextDueAt` deadline accumulator for steady cadence
    across `60`/`75`/`120`/`144 Hz` displays.
  - **Vocal clarity & backend responsiveness (`audio-mastering.ts`, `db.ts`,
    `server/platform.ts`, `server/workspace.ts`, `server.ts`).** Automatic
    mastering applies a four-band vocal clarity EQ, isolated vocal compression,
    `2.8 kHz` music speech-pocket EQ, and `35 ms` lookahead voice ducking;
    authenticated API paths run hot reads in parallel, avoid full-table grant
    sweeps and redundant DDL checks, and serve `ETag`/`304` responses on custom
    audio and stock search endpoints.
  - **Post-export validation (`export-validator.ts`, `RenderView.tsx`).** Every
    finished render is checked for non-empty container payload, exact output
    dimensions, frame count/rate cadence, video duration, and audio-video
    synchronisation (`<= 140 ms`) before saving to the Vault or presenting the
    download.

## Unreleased — production sign-in never waits for a migration

- **Fixed: the `PRAGMA`-based schema gate and unisolated entitlement reads that
  took `POST /api/auth/login` down on `scenering.com`.** PR #74 put
  `checkDatabaseSchema()` in front of every `/api/*` request and inspected D1
  with `PRAGMA table_info(sessions)` / `PRAGMA table_info(workspace_documents)`
  with no `try/catch` in `worker.ts`. On hosted D1 those statements either
  throw (`SQLITE_AUTH`) or return empty `results`, so sign-in answered an
  opaque `500`/`1101` — or a false `503 SCHEMA_OUT_OF_DATE` — before Express
  ever ran. Fixes:
  - No `PRAGMA` executes in Worker runtime code, and the global `/api/*` 503
    blocker is removed from `worker.ts` and `server/platform.ts`.
    `ensureDevicesAndWorkspaceSchema()` inspects
    `SELECT name, sql FROM sqlite_master` instead, heals `0007` on the auth and
    workspace paths, and aligns `d1_migrations` once the columns exist.
  - `db.createSession()` retries after healing and finally falls back to the
    five pre-0007 columns; `db.listActiveSessionsForUser()` falls back to
    `ORDER BY created_at`; `db.touchSession()` is non-fatal.
  - Entitlement and usage reads (`findActiveSubscriptionByUserId`,
    `findMembershipByUserId`, `findAndSweepActiveComplimentaryGrant`,
    `sweepUserSubscriptionExpiry`, `listUsageSince`, device eviction) are
    individually `.catch()`-isolated and logged, so a drifted `subscriptions`,
    `billing_customers`, `complimentary_grants` or `usage_records` table
    degrades the plan answer instead of failing sign-in. The verified
    `SCENERING_OWNER_EMAIL` administrator still resolves to `admin` +
    `sceneforge`.
  - `signIn()` clears a stale `"signed-out"` preview token when production
    sends no bridge token, and `server.ts` ends with a 4-argument Express error
    middleware that answers JSON `{ error, code: "INTERNAL_ERROR" }` instead of
    an HTML error page.
  - `tests/schema-drift.test.ts` and `tests/production-auth.test.ts` cover a
    PRAGMA-refusing D1, a pre-0007 database, a refused `ALTER TABLE sessions`,
    and dropped or throwing entitlement tables.

## Unreleased — a deployment can no longer outrun its database

- **Fixed: sign-in answered 500 when the Worker moved ahead of its D1 schema,
  and the migration ledger had drifted behind the live tables.** `POST
  /api/auth/login` failed with an unexplained HTTP `500` and locked production
  out because `db.createSession()` inserted `sessions(device_id, device_label,
  platform, last_seen_at)` — columns added by
  `migrations/0007_devices_workspace.sql` — before `0007` had been applied to
  `scenering-db`. Running `wrangler d1 migrations apply --remote` to catch up
  then failed partway too: production's `d1_migrations` ledger only recorded
  `0001` and `0002`, while `0003`–`0006` had already been applied to the schema
  by hand and by first-use table helpers without updating the ledger. Wrangler
  re-ran `0003`–`0005` cleanly (they are idempotent), recorded them, and stopped
  dead on `0006_billing.sql` with `no such column: provider_variant_id`, because
  that column had already been renamed to `provider_price_id` in the live
  `subscriptions` table. Production `scenering-db` and `d1_migrations` are now
  aligned through `0007`, `/api/workspace` is mounted in `server.ts`, and four
  code-side guards stop this happening again:
  - **Sign-in no longer depends on a schema gate — the schema repairs
    itself.** An earlier revision of this entry answered `503`
    (`SCHEMA_OUT_OF_DATE`) for every `/api/*` request when `0007` looked
    unapplied, using `PRAGMA table_info`. On hosted D1 a `PRAGMA` through a
    Worker binding either throws an authorisation error (an unhandled `500`
    before Express ran) or returns no rows — so a healthy database was
    reported as broken, and even genuine drift locked the owner out of signing
    in. The gate is gone from `worker.ts` and `server/platform.ts`. In its
    place `ensureDevicesAndWorkspaceSchema()` (once per isolate, cached only
    after it succeeds) reads `sqlite_master` — never `PRAGMA` — adds the
    missing `sessions` device columns and `workspace_documents` table, and
    records `0007_devices_workspace.sql` in `d1_migrations` so the ledger stops
    drifting. `src/db.ts` adds core-column fallbacks (`createSession`,
    `listActiveSessionsForUser`, non-fatal `touchSession`) so sign-in and
    session restore answer `200` even when those columns cannot be added.
  - **Session database failures are logged instead of looking like "signed
    out".** `db.touchSession()`, `db.listActiveSessionsForUser()` and the
    browser's `refreshSession()` keep their graceful fallbacks, so an auxiliary
    read or timestamp update never drops a valid session, while logging every
    non-`401` error so a broken schema is visible in Workers Logs and the
    browser console.
  - **`npm run deploy` refuses to deploy while migrations are pending.**
    `scripts/check-deploy-config.mjs --remote` queries
    `wrangler d1 migrations list scenering-db --remote` before building or
    uploading the Worker and aborts with the pending filenames and apply
    command whenever production D1 is behind `./migrations`.
  - **Unmigrated column references cannot pass the test gate.**
    `tests/schema-drift.test.ts` builds the column set produced by
    `migrations/*.sql` and fails if `src/db.ts` reads or writes any table or
    column no migration creates.

## Unreleased — the new voice replaces the old one

- **Fixed: a piece of the previous voice could still be heard at the end of a
  re-narrated video.** Changing the narrator and generating the new voiceover
  left the old file attached to the scenes until each one was overwritten, and
  nothing removed it from the caches behind the scenes. Any path that reached
  the picture before that overwrite — a render opened from another phase, a
  scene whose synthesis failed or timed out, a project whose saved voice
  arrived from another device, a scene that had since been emptied — found the
  old narration still attached and played it. With a shorter new voice the
  leftover fitted into the last scene, so the video ended on a fragment of the
  voice it was supposed to have replaced. Three rules now make that
  impossible:
  - **A cached file only counts as a scene's narration while it was made for
    that scene's current narrator and current words.** Anything else is
    ignored — whatever pointer on the scene still refers to it — instead of
    being replayed under the new voice.
  - **Choosing a different narrator retires the files made with the old one
    immediately.** The scene is detached from the old audio and stamped with
    the narrator it should now use, so the preview, the per-scene player and
    the renderer either generate the new line or leave the scene silent until
    it is generated. The old recording is not destroyed on the spot: it stays
    in the voiceover cache, so choosing the previous narrator again before
    anything was generated re-attaches it for free. Prepared files — your own
    imported recordings — are an explicit per-scene choice and are never
    retired.
  - **Generating a scene files the new narration as a replacement.** Every
    copy of that scene's previous narration is removed first — memory, the
    object-URL index and the durable IndexedDB copy — and the old object URL
    is released. Nothing of the previous voice is left for a later step to
    find.
  - **A line can never sound longer than its own scene.** Narration used to be
    scheduled whole, so a file left over from a longer voice ran on over the
    next scene, and at the end of the video past the last frame. Each line is
    now limited to its scene's window in the export (both the frame-exact and
    compatibility renderers) and in the live preview, closing on the same
    short fade as a stop rather than a cut.

## Unreleased — one membership, every device

- **Projects follow the member to every device.** A project used to live only
  in the browser that made it: a second computer opened an empty studio, and
  each machine could render and download on its own. The studio still writes
  to `localStorage` synchronously (so editing stays instant and works offline),
  but a background sync now mirrors the project list, the scenes and every
  per-project document — settings, inserts, scene metadata, commit history,
  section memory and setup drafts — to a server-side workspace per account, and
  back down to the other devices. Collections merge item by item, so a project
  created on a laptop and one created on a phone both survive; edits are
  revision-checked; deletes are tombstones; nothing over 900 KB (an embedded
  image) is carried. Provider API keys, the session token and this browser's
  identity never leave the browser.
- **A plan's device count is a benefit, and it is enforced.** Free allows one
  signed-in device, SceneFlow two, SceneForge five — a phone counts like any
  other device. Opening one more signs out the device that has been idle
  longest, and the account panel lists every device with "This device" marked.
  Signing in again on the same browser is still one device.
- **Production is the default.** A server with no `NODE_ENV` — or an
  unexpected value — is now treated as production. Before, one missing
  variable turned every development shortcut on for the live site.
- **Verification and reset links are no longer returned by a production
  server.** The registration response carried a working verification link, so
  an account could be verified without reading the mailbox; the reset link was
  returned on a test storefront and when mail delivery failed. In production
  the emailed link is the only route.
- **The legacy export endpoint is retired.** `POST /api/usage/final-export`
  recorded an export from a client-supplied duration and format without the
  creative-manifest policy, the length ceilings or a reservation. It now
  answers 410.
- **Export completion is atomic and time-bound.** A reservation completes
  once, only inside its two-hour window, and the remaining allowance is
  re-checked against the week the usage row lands in — so a batch of
  reservations opened while one export was left can no longer all be spent.
- **`SESSION_SECRET` is the name that works.** `SCENERING_AUTH_SECRET` is kept
  only as a legacy alias; the local dev script and `.dev.vars.example` now set
  the real one, plus `NODE_ENV=development`.

## Unreleased — your own video, start to finish, with its sound and its captions

- **The middle of a round visualiser is now a choice, and the logo has its own
  size.** Every circular style offers three middles — **My logo**, **Glowing
  orb** or **Nothing** — instead of a single on/off box. "My logo" is the brand
  mark from Studio → 🏷️ Logo, and falls back to the glowing orb when the project
  has no logo yet; "Nothing" leaves the ring and its bars standing alone, with
  no hub of any kind. Two sliders sit under the choice: **Middle size** (the
  orb, and the logo with it) and **Logo size**, which sizes the logo inside the
  middle so a wide wordmark and a square icon can each fill the hub. Projects
  saved before this read exactly as they did: the old checkbox is translated,
  never rewritten.
- **The visualisers now look like the things they are named after, and the
  panel stopped asking twenty questions.** The Audio Visualiser settings were a
  wall of engineering dials, and several of them changed nothing on screen.
  - **Glass is glass now: clear, crisp, and adjustable.** The panes were milky
    and soft because the shape itself carried a heavy blur. The body is now
    genuinely transparent (the footage shows through it), the rim is a sharp
    hairline, and the reflection is a thin, bright band — no blur on the shape.
    **Glass transparency** controls how much of the video survives under it and
    **Sandblast** moves the same pane from crystal clear to frosted glass.
  - **Chrome is the only metal.** A new polished-chrome material paints bright
    specular bands over a dark reflection, and the metal looks (silver and gold
    glitter, the silver mirror spectrum) now ship with it. There is no matte or
    "dull metal" option to stumble into.
  - **The light from below is visible.** It used to be a faint ellipse that
    disappeared under the footage. It is now an additive pool with a white-hot
    core and a short shaft of light climbing out of it, with one
    **Light from below** slider behind it.
  - **Bloom is a bloom.** Instead of a dim shadow, three layered haloes are
    painted *around* the shape with additive light, so the edges stay sharp
    while the glow is unmistakable — and the slider is perceptual, so a third of
    the way up is already clearly visible.
  - **Smoke behaves like gas.** A puff used to be a single radial ball. It is
    now four overlapping, elongated lobes that wander, drift and stretch on
    their own slow paths, with **Cloud size** and **Cloud softness** controls.
  - **Three colours that all show up.** Changing a picker now switches the
    insert to custom colours (the second colour block wrote the colour but left
    the old theme in charge, so it did nothing). The highlight colour is mixed
    into the loudest bars instead of being blended away, so main, second and
    highlight colours are each visible on different parts of the same shape.
  - **Fewer, clearer settings.** The colour section appears once, with eight
    understandable themes instead of nineteen chips, a dead "Reactivity
    Sensitivity" slider and a second set of swatches are gone, and the technical
    knobs (frequency mapping, FFT size, min/max frequency, attack, release,
    smoothing, gap, radius, height) are folded into an optional **Advanced wave
    settings** disclosure. Everything a first-time creator needs — detail,
    thickness, reaction, material, glass finish, light, bloom, effect size and
    density — stays on the main panel.

- **Fixed: narration went silent on a video made from your own footage — in
  the preview and in the export.** A project whose picture is an uploaded clip
  (or an uploaded song) was treated as though it could never be narrated: an
  effect in the Studio wrote `voiceover_enabled: false` back to the project on
  load and the narration switch in the Voiceover step was disabled, so a
  creator who wanted their script read over their own take heard nothing and
  had no way to ask for it. The saves were never the problem — every scene
  still held its narration and its audio; nothing would play them. Turning the
  switch on now stores exactly what was chosen, and the preview and the
  exported file both read that same switch and the same "is there anything to
  say" rule, so they cannot disagree. The default is unchanged: a project
  created from source media still starts with narration off, so a music video
  is never given a voice it never asked for. If your project was saved while
  the switch was locked, turn narration back on once in the Voiceover step; it
  stays on.

- **The clip settings can now remove the audio from the video, not just mute
  it.** Mute is a playback switch: the track stays inside the stored file,
  still taking space and still there for any player or caption pass. The new
  **Remove audio** action in the same panel (scene editor → Short video clip →
  Clip sound) rewrites the stored upload without a soundtrack. The picture is
  packet-copied rather than re-encoded, so the clip is unchanged visually and
  the rewrite takes a fraction of its duration; the smaller file replaces the
  old upload through the normal store, so the reload-safe address and the
  storage-quota handling are the same as any upload. The panel reports how much
  smaller the clip became, asks once before doing it (it cannot be undone), and
  offers mute instead where rewriting is impossible — a clip streamed from a
  web address, or a file whose codec cannot be re-wrapped without re-encoding.
- **The clip trim panel has a preview you can actually see.** Its video was a
  192px thumbnail in the corner of a row shared with the stats, which made
  trimming guesswork — the detail you are cutting around was not visible. The
  preview now sits **above** the trim sliders at the panel's full width (up to
  ~750px wide on a laptop, ~920px on a wide screen), capped only by a
  viewport-relative height so the sliders stay on screen. It also reports the
  playhead and the trim window underneath (`playhead 0:04.1 · window
  0:02.0–0:12.0 · 0:20.0 source`) and updates as a slider is dragged.
- **A full device now says so, and offers the space back.** Chromium's
  `Failed to write blobs (IOError)` is what a full disk looks like from inside
  the browser, and it was being reported as a problem with the video. When the
  allowance shows the file will not fit — or a 90% full origin — the message
  now states plainly that the device is out of storage and that the video and
  its format are fine. It also carries a **Free up space** button that clears
  only what can be proven unused: uploaded clips no saved project references
  and `.part` render files left behind by renders that were cancelled or lost
  with their tab (the invisible ones — they can be gigabytes). Finished
  renders, voiceovers and anything a project uses are never touched; the note
  shows what the site is using, how much of it is Vault renders, and says that
  deleting ones already downloaded frees the most. The brief "using 1.4 GB of
  2.0 GB" line appears beside the warning, and the cleanup reports exactly
  what it freed before inviting a retry.
- **Fixed: a good clip was refused because the browser's storage said no.**
  Chromium reports a refused IndexedDB blob write as
  `Failed to write blobs (IOError)` — a message containing neither "quota" nor
  "space" — so the upload skipped the reclaim-and-retry path entirely and told
  the customer the video could not be kept. Three changes: that message is now
  recognised as a capacity failure; unreferenced uploads are cleared *before*
  the write when `navigator.storage.estimate()` already shows the file will not
  fit; and if the blob journal still refuses, the same bytes are stored inline
  instead (under 200 MB), which bypasses it. A scene upload now also keeps the
  clip for the current tab, with an on-screen warning, when nothing else works
  — that fallback was always described in the message but was never actually
  granted to the Scenes screen, so the sentence promised something the code
  then threw away.
- **Fixed: good videos were refused as the wrong format.** The Scenes screen's
  Upload Video button — and the clip panel, and the intro/outro background —
  ran a decode probe that could fail on perfectly ordinary files. It read a
  `<video>` element that was never in the document, which is the exact quirk
  `scene-clip.ts` already works around for Safari and mobile: a detached
  element is not loaded there, so an iPhone MP4 waited out the 20-second limit
  and came back as "could not be played". It also read `videoWidth` the moment
  `loadedmetadata` fired, which is still 0 in some browsers, and treated one
  failed end-seek as proof that a recorder WebM had no length. The probe now
  mounts the element, waits for `loadeddata`, retries the seek, and — when the
  element is merely slow — reads the duration and frame size from the container
  instead of refusing the file.
- **MKV, MTS and MPEG-TS uploads now work.** They used to be refused with "web
  browsers cannot play ... directly", even though the picture inside is usually
  ordinary H.264 and the app can do the conversion itself. The file is
  re-wrapped as MP4 (H.264 + AAC) on upload by mediabunny — loaded on demand,
  packet-copied when the codecs already match — with WebM as the fallback for
  browsers without an H.264 encoder. The scene buttons show "Converting 42%"
  instead of appearing frozen. AVI, WMV and FLV are still refused (nothing here
  can demux them), and still say so.
- **A refusal names the codec.** "MP4 (H.264), MOV and WebM are supported" was
  shown even to someone uploading an MP4, because the file held HEVC (H.265) or
  ProRes, which this browser cannot decode. The message now says exactly that,
  names the export that works, and for HEVC points iPhone users at Settings →
  Camera → Formats → Most Compatible.
- **Fixed: an uploaded video was cut short.** Creating a one-scene project from
  footage set the scene's length correctly, but three later actions re-timed
  every scene from its WORD COUNT alone, which knows nothing about footage:
  Setup's Continue (`handleUpdateSceneDuration`), the 10/20/30 cards
  (`handleCalibrateScenesWordCount`) and Fit scenes to speech
  (`fitDurationToText("")`, three seconds). A music video has no words, so the
  first trip back through Setup cut it to the project's 20-second target. One
  rule now decides how long a scene holds — `sceneDurationForScene` in
  `duration-utils.ts` — and every re-timing path asks it: footage decides in a
  one-scene project, the words decide everywhere else, so split-scene projects
  behave exactly as they did. `sceneTimelineDuration` gained the same floor, so
  a narration switched back on can never shorten the picture either.
- **One scene has no 10/20/30 target at all.** The target length is a rule
  about how long a SPOKEN scene should be, so it does not apply to a one-scene
  project: there the length is the footage's, or the time the script takes to
  read. The duration cards are no longer offered in that mode — the panel shows
  the actual length instead, with one click back to splitting the script — and
  starting a one-scene project passes the footage's length rather than
  `selectedDuration || 20`, which is what still stamped a 3-minute upload back
  down to 20 seconds on the way in.
- **An imported music file asks how it should be used.** Uploading a track now
  asks: *loop it across the video*, or *use the file's own length*. The answer
  is stored on the upload itself (`setCustomMusicLoop`), so a saved project
  comes back with it and the card can change it later. Choosing the file's
  length builds a bed that is exactly as long as the file and plays once,
  instead of being stretched across the whole video and repeated. This also
  fixed the audio plan, which ran every music bed to the end of the video
  regardless of its own length — a play-once track was scheduled for the whole
  timeline and only stopped because the buffer ran out.
- **Fixed: a narration from an earlier script survived a transcript.** The
  gate that stops captions being read aloud only covered the speech engine.
  `resolveSceneAudioBuffer` runs first and reads `scene.audio_url` — the track a
  narration generated for an EARLIER script left behind — and installing a
  transcript does not clear it. So a scene that once had narration and was then
  transcribed still played the old voice over the song the captions came from.
  A caption-only scene is now skipped before its saved narration is resolved,
  and its caption clock follows the picture instead of an estimated reading of
  words that are only ever drawn.
- **A music video built from stills can now get its captions.** The Captions
  step only offered to transcribe a scene with footage attached — the gate was
  `sceneHasClip`, which is just `Boolean(scene.video_url)`. So a video made from
  a music file and a few images had no way to make captions at all, even though
  the transcriber reads any audio address and never cared what kind of file it
  was. `projectMusicBed` now finds the project's music track using the same
  last-selection-wins rule as `buildInsertAudioPlan`, so the words are always
  transcribed from the audio the finished video actually plays, and the button
  names what it is listening to.
- **Fixed: captions were read aloud over the sound they came from.** A
  transcript writes the words it heard into `scene.text`, because that is the
  field the caption renderer reads. Voiceover defaults to ON and the renderer
  speaks whatever it finds in `scene.text` — so captioning a music video and
  then switching narration back on put a synthesised voice reading the lyrics
  over the song. The soundtrack was never removed or replaced; a second voice
  was simply laid on top of it. `caption_source` already recorded where the
  words came from and nothing ever read it. `narratableText` now does: words
  that came out of the picture are captions and are never spoken, words the
  creator wrote are narrated exactly as before.
- **A video with nothing spoken no longer opens on a silent held frame.** The
  two-second lead-in exists to hold the first image until the first words. It
  was keyed to the voiceover SWITCH rather than to whether anything would be
  said, so a captioned music video opened on two seconds of frozen silence
  before the song started. The renderer, the timeline readout and the live
  preview now all ask one question — `projectHasNarration` — so the export and
  the preview open on the same frame.
- **Choosing "use the file's length" now says what it costs.** The video is
  never cut to fit a track, so a track shorter than the video leaves its tail
  with no music, and a track longer than the video simply is not all heard. Both
  are fine choices, but they were only discoverable in the finished file. The
  button now states it at the moment of the question — *"Your video is 3:07, so
  the last 1:37 would play with no music."* — computed by
  `playOnceConsequence` in `custom-music.ts`, and quiet when the two lengths are
  within a second of each other.
- **Fixed: whole-video overlays vanished two seconds before the end.** The
  renderer holds the first frame for the narration lead-in before the first
  words, so the exported file is two seconds longer than the sum of the scene
  durations. `App.estimatedTotalDuration` omitted that hold. It was more than a
  short readout: whole-video media is stretched to that same number, and
  `renderTimelineInsert` stops drawing once time passes
  `startTime + duration` — so a full-video visualiser disappeared two seconds
  before the end of its own video, and the timeline disagreed with the file.
  The timeline now adds the same lead-in, with the same rule and the same
  arguments the renderer uses, so the two agree with and without an intro or
  outro. Music beds were unaffected: `buildInsertAudioPlan` pins an
  `entire_video` bed to the renderer's own total, not to the insert's stored
  length.
- **Fixed: saving the script stored the wrong project length.** Rebuilding the
  scenes from the script also writes the project row's `default_duration`, and
  it wrote the 10/20/30 target unconditionally. In a one-scene project whose
  only scene was three minutes of footage, that saved a row claiming twenty
  seconds — and the next reload read the claim back as the project's target
  length. It now stores the length the scene actually got.
- **Fixed: a clip attached later was still trimmed to the narration.** The
  scene editor's Upload Video button and the clip panel both go through
  `sceneUpdatesForVideoFile`, which trimmed the file to the narration window
  and looped it when it was shorter. That is right for a script scene, where a
  clip is decoration behind a voice, and wrong in a one-scene project, where
  the footage is the whole video. Both callers now pass the one-scene flag, and
  there the whole file is used, it plays once, and its own sound is kept.
- **The project's own length is the footage's length.** A project created from
  an upload is stored at the clip's measured duration (`default_duration` and
  the `scene_duration` setting) rather than the 10/20/30 target that was
  showing, and the trim window is the whole file, so nothing is trimmed away.
- **The original sound is a real choice, and it reaches the file.** Setup now
  offers "Keep the original sound" or "Remove it" beside the upload, stored as
  the scene's own `video_mute` — the field the clip panel has always used, so
  the two can never disagree. It was a switch with nothing behind it until now:
  the renderer draws a clip by SEEKING a hidden video element, and a seeked
  element makes no noise, so the exported file had no soundtrack at all. New
  `src/lib/clip-audio.ts` decodes the clip's audio track and schedules it on the
  timeline to the sample, in both the frame-exact renderer and the
  compatibility fallback, on the music bus so narration ducks it automatically.
  Removing the sound produces no track at all, not a silent one, and a track
  this browser cannot decode is reported on the render screen instead of
  exporting silence quietly.
- **Captions from the video's own audio.** Whisper (open source) runs on the
  customer's own device through Transformers.js and times every word; the words
  become the scene's caption text and their timings drive the existing karaoke
  highlight, so the Captions step styles them and the scene text editor
  corrects them with no new machinery. **It costs nothing**: no API key, no
  account, no per-minute charge, and the audio never leaves the browser. What it
  does cost is about 40 MB the first time (engine plus a quantised model,
  fetched from jsDelivr and the Hugging Face hub, then cached) and roughly
  real-time CPU. The engine is loaded on demand from a pinned version rather
  than added to `package.json`, because its `onnxruntime-node` and `sharp`
  install scripts download native binaries and would make `npm install` fail for
  anyone without those hosts reachable; the main bundle does not grow. The CSP
  allows `cdn.jsdelivr.net`, `huggingface.co` (weights, not script) and
  `'wasm-unsafe-eval'` for the ONNX runtime.
- **Captions survive the sound being removed.** Transcription reads the uploaded
  file, never the rendered audio, so taking the original sound out of the final
  video does not take the words with it.
- **An SRT or VTT file works too** (`src/lib/caption-file.ts`), for a creator who
  already has the words: it lands in the same fields, so it is styled and burned
  in by the same code. Both routes are in the Captions step, on scenes that have
  footage.
- **Caption timing is exact for footage.** A provider's word marks start when the
  speech starts, which is after the opening hold; a transcript's are the
  footage's own, which start with the scene. The preview and the export both
  choose the right clock, so a caption cannot land a lead-in late.
- New suite `tests/one-scene-upload.test.ts` (110 checks) pins the duration rule,
  the render's own scheduled length, the audio plan in both pipelines, the
  transcript and caption-file conversions, and the cost and privacy claims.

## Unreleased — a shorter studio header

- The studio's phase tabs now share the wordmark's row on desktop instead of
  wrapping onto their own line. Removed the full-width project-title row and
  the redundant “create or select a project to unlock steps 2–6” note at the
  end of the phase menu; the project name remains available in Setup and in
  the browser tab title. The optional social strip and scene-count badge are
  reserved for ultrawide screens so they cannot force the working tabs onto a
  new header row. This returns the saved header height to the editing area.
- **The theme picker is clear of the fixed corner menu button.** The studio
  header's `pr-[var(--sc-corner-reserve)]` is an arbitrary value, so it
  compiled into the base utilities — and the `sm:px-4` shorthand that follows
  it in the sheet (same specificity, later rule) reset `padding-right` to 16px
  on every screen 640px and wider. The reserved 152px slot never applied on a
  desktop, so the picker sat 40px from the window edge, underneath the ~140px
  menu button, with only its left end sticking out. The header now sets
  `px-2 sm:pl-4` and lets the reserve own the right padding at every width, and
  the picker keeps a further 48px margin (`mr-12`) between itself and the
  button.

## Unreleased — FastSpring merchant-of-record billing

- **FastSpring is the sole merchant of record.** All four subscriptions
  ($19/$180 SceneFlow, $39/$372 SceneForge) sell through FastSpring's popup
  storefront (`sbl.min.js`) or a server-created session checkout, with the
  signed-in account's `user_id` and `email` riding every order as FastSpring
  `tags` — so each `subscription.*` webhook maps a payment back to the right
  Scenering account and grants `sceneflow` or `sceneforge` on the
  `memberships` row. `POST /api/webhooks/fastspring` verifies `X-FS-Signature`
  (base64 HMAC-SHA256 over the raw body, constant-time), records every event
  id in `webhook_events` for replay protection, and handles
  `subscription.activated`, `subscription.updated`,
  `subscription.charge.completed`, `subscription.charge.failed`,
  `subscription.canceled` and `subscription.deactivated`. The Account window
  provides FastSpring's Account Management links (cancel, update card,
  customer portal), the owner's checklist displays the *FastSpring billing*
  panel, the CSP allows `*.onfastspring.com` and `*.fastspring.com`, and
  `FASTSPRING.md` is the step-by-step dashboard runbook. FastSpring's
  `canceled` is "will not renew" rather than terminal, so a cancelled
  subscription keeps its plan until the paid period ends.
- **Localized prices on every plan surface come from FastSpring's Store
  Builder Library (`sbl.min.js`).** When `FASTSPRING_STOREFRONT` is set, the
  pricing page, homepage pricing cards, Setup Studio plan cards and the
  Account & Membership modal display the visitor's localized price and currency
  returned by FastSpring, falling back cleanly to the USD base price until
  FastSpring responds.
- **A public Refund and Cancellation Policy at `/refunds`.** `/refunds` covers
  how to cancel, what is not refunded automatically, how to request a refund,
  that FastSpring holds and returns the money as merchant of record,
  digital-content cooling-off, statutory rights and chargebacks; the Terms
  point at it, and it is linked from the public footer, the in-app corner
  menu, the legal cross-links and the sitemap.
- **The admin Manual includes a Taking payments topic** with the exact values
  to enter in the FastSpring dashboard (storefront path, the four product
  paths, the webhook URL and its HMAC secret, the six events to tick) and what
  to check when a payment did not grant access.
- Migration `0006_billing.sql` renames `subscriptions.provider_variant_id` to
  `provider_price_id`, adds `provider_event_occurred_at` and the
  `billing_customers` table, and sets the provider default to `fastspring`.

## Unreleased — The Email Centre: marketing email members actually asked for

- **Admins can now write and send marketing email without leaving the app.**
  A new Email Centre (admin corner-menu button → `/admin/email-centre`)
  covers the whole loop: HTML templates with a live variable picker
  (`{{first_name}}`, `{{display_name}}`, `{{email}}`, `{{unsubscribe_url}}`,
  `{{preferences_url}}`, `{{current_year}}`), campaigns on seven audience
  types (all consented, free plan, paid plan, registration date range,
  training step, hand-picked, test recipient), a preview of the rendered
  mail, a tagged test send, and delivery history per campaign.
- **Consent is the front door, not a checkbox at the bottom.** Campaigns
  resolve their audience, then remove anyone who hasn't ticked marketing
  consent — every send carries a per-recipient unsubscribe link and a
  preferences link, both signed, and the new public
  `/email-preferences` and `/unsubscribe` pages act on them without a
  login. The Account & Membership modal shows the same consent switch, so
  opting out never requires finding an old email.
- **Sends are queued, never one long request.** A campaign write its
  recipients as delivery rows in D1, and a new five-minute Cron Trigger
  drains them twenty at a time — a send to the whole member base can't
  blow a Worker invocation's subrequest budget, and a crashed batch simply
  resumes on the next tick. Sending twice is answered 409, a scheduled
  campaign can be cancelled up to the minute it fires, and the per-tick
  budget bounds the worst case even when several campaigns are mid-send.
- **Campaigns can be scheduled up to 180 days ahead** — saved as a draft
  or dated, started automatically by the same queue, and shown on the
  dashboard as draft / scheduled / sending / completed / failed /
  cancelled with recipient, sent and failed counts.
- **Delivery history is honest by default and precise when wired.**
  Without any setup a delivery is recorded as sent when the provider
  accepts it; add the optional `RESEND_WEBHOOK_SECRET` and point Resend's
  webhook at `/api/webhooks/resend` (HMAC-verified on raw bytes, like the
  billing webhook), and delivered, bounced and complained events land
  against the individual delivery rows. `EMAIL_REPLY_TO` now sets a
  Reply-To on all outbound mail.
- Local development prints every campaign mail — headers, both bodies,
  the unsubscribe tokens — to the wrangler output via
  `EMAIL_PROVIDER=console`, and the queue can be fired on demand with
  wrangler's local scheduled trigger.

## Unreleased — Images that arrive framed, honest VIP exports, and a Fairy shelf

- **Speechify BYOK narration replaces the old TTS providers.** The existing API
  Keys modal stores the customer's Speechify key in the browser and requests
  audio and voice catalogues directly from Speechify; the key is not sent to
  Scenering or Cloudflare. The voice picker has exactly ten male and ten female
  Speechify-bound style profiles, with one Free voice first in each group.
  Preview/export failures are surfaced; no alternate speech provider, browser
  voice or silent audio placeholder is substituted.
- **Fixed: Cloudflare deploys failed with `KV namespace '…' is not valid
  [10042]`.** `wrangler.jsonc` still carried placeholder resource ids — PR
  #35's placeholder round-trip had reverted the real KV namespace id, and the
  D1 database id had never been committed at all. Both bindings now carry
  their real ids (the KV id restored from commit 4d28fea, the D1 id from the
  dashboard), `npm run deploy` first runs a guard that fails fast with
  instructions instead of the API's cryptic error, and the setup script no
  longer prompts for ids it can look up (or tries to re-create a KV namespace
  that is already configured).

- **Fixed: image search returned nothing from Pexels.** The request asked for
  `per_page=100`; the documented maximum is 80 and anything above it is
  rejected outright, so every Pexels search failed with a 400 and fell
  through to the other providers in silence. The value is clamped, Wikimedia
  `titles` are batched at 50, and a failed provider now logs why instead of
  looking like "no results".
- **Choosing a photo lands it in the scene, already framed.** Auto-framing
  always fills the frame, top and bottom, however badly the photo and the
  video disagree in shape. The old rule — a portrait photo in a landscape
  video is shown whole over a blurred copy of itself — is gone; blur fill is
  now only ever something you pick by hand, and a framing you set yourself is
  never overwritten.
- **The Nature Fallback deck is a real library again**: 18 photographs
  bundled as 1920/640 WebP pairs, ranked against the query, so a search that
  matches nothing online still answers with something usable.
- **Each scene can take its own image or video upload.** Uploads are stored
  as `custom-image:` and `custom-video:` references backed by IndexedDB, not
  `blob:` URLs, so a project still has its media after a reload.
- **VIP effects can be previewed but can never reach a render.** Every export
  that writes a file, drafts included, is produced from
  `stripVipFromExport`, and the warning is shown as the render starts rather
  than discovered afterwards. A VIP narration voice or caption preset blocks
  only a final download, and links to the step that fixes it.
- **The membership tiers are correct**: Voice Echo is VIP, only the standard
  Subscribe button is free, and anything built in the settings section is
  VIP. The VIP mark is now a flame (`.vip-flame`) — the icons only.
- **New Fairy animation category**: floating bubbles, gold and silver glitter
  swirls and twirls, circle smoke rings, falling stars, and sun flares
  entering from any corner, edge, a rotating sweep or at random. Three
  presets to start from. All of it drawn procedurally, so it ships no assets
  and recolours with the existing chrome and neon palettes.
- **Rows that are wider than their panel now say so.** `ScrollStrip` gives
  the preset and sub-section rows arrow buttons, a fade on whichever edge
  hides more content, and a visible slider — they used to run off the side
  with the scrollbar hidden, which told the reader nothing was missing.
- **Lemon Squeezy is ready to switch on with nothing but `.env` entries.**
  Cancelling or a failed payment keeps the plan until the period that was
  paid for actually ends, with the stored end date as a backstop if the
  expiry webhook never arrives. The hosted portal and update-card links are
  kept, so a customer can cancel without writing to support. Events that are
  not subscription events are recorded and ignored rather than guessed at —
  an order id is not a subscription id. The owner gets a go-live checklist
  naming every missing variable, the webhook URL to register, and the last 25
  webhooks received.
- Smaller things: the captions on/off switch has one owner again (the
  Captions studio), the SRT export and the preview Download button are gone,
  voices are listed as male and female columns led by the free voice, the two
  free caption styles lead their grid, caption specimens sit on dark grey so
  they are legible, the corner menu shows the real wordmark, and the studio's
  project title stops being truncated once there is room for it.

## Unreleased — Intro and outro previews keep their shape in 9:16

- **Fixed: the intro and outro previews were squashed in portrait projects.**
  The live stage was given `w-full` and `max-h-[420px]` at the same time: the
  width was pinned to the 440px column while the height was clamped at 420, so
  a 360x640 portrait canvas was painted into a 440x420 landscape box. A canvas
  defaults to `object-fit: fill`, so it distorted rather than letterboxed.
  16:9 was the one shape with no clamp — which is exactly why it was the one
  shape that looked right. The cap is now on the **width**, derived from the
  same height budget, so `h-auto` keeps the true ratio: 9:16 draws 236x420
  instead of 440x420.
- **The choice thumbnails now preview in the project's own shape.** Every
  motion background was previewed in a fixed 16:9 card whatever the project
  was, so a portrait intro was chosen from landscape thumbnails. Portrait
  projects get portrait thumbnails, square gets square.
- The preview canvas carries `object-contain` as a backstop, so if a box and
  its backing store ever disagree again the cost is a black bar rather than a
  stretched picture.
- The geometry moved out of the JSX into `src/lib/section-preview-size.ts`
  and is covered by the responsive suite, which now checks the aspect, the
  height budget and that no height clamp ever sits beside an explicit width.
  It immediately caught a 560px cap sitting uselessly inside a 440px column.

## Unreleased — Strange typefaces, and the bug that made them all look alike

- **Fixed: half the caption typefaces were never actually downloaded.**
  `index.html` carries a `<link data-caption-fonts>` listing the original ten
  families, and the runtime loader skipped its own work whenever it found a
  link with that attribute — so every face added to the library after that
  link was written fell back to Georgia, Arial or Impact. That is why most of
  the styles looked the same. The runtime loader now uses its own marker, and
  the stylesheet URLs are **generated from the font library itself**, so a
  face cannot be added to the catalogue and forgotten in the request ever
  again.
- **Fixed: fonts were requested at the wrong weight.** A family with no weight
  axis in the URL is served at 400 only, so a style declaring 700 got a
  faux-bold smear of the regular face. Each family now asks for exactly the
  weights its styles use.
- **Fixed: canvas never pulled a web font in.** Unlike text in the page,
  canvas drawing does not trigger a font download, so a face nothing else on
  screen was using would be drawn in the fallback. The Captions studio, the
  video preview and the renderer now each request the face they are about to
  draw with, and the export waits for it.
- **When a typeface genuinely cannot be fetched, the studio says so**, naming
  it, instead of quietly drawing in Georgia and leaving you to wonder why the
  style looks nothing like its card.
- **34 strange and artistic typefaces, on their own Strange shelf.** Melted
  (Rubik Puddles), Scorched (Rubik Burned), Glitch Signal (Rubik Glitch), Wet
  Paint, Moonrock, Beastly, Isometric Block, Circuit Maze, Worn Stencil,
  Shadow Block and Inline Sign (Bungee), Creep Show, Blood Drip, Metal Band,
  Old Gothic blackletter, Full Speed, Line Art (Megrim), Bulb Marquee
  (Codystar), Spray Stencil, Pixel Screen, Green Terminal (VT323), Mono Art,
  Pencil Sketch, Graffiti Tag, Rough Hand, Tall Thin Hand, Festival Poster,
  Blobby, Cartoon Fat, Soft Relief, Wild West, Skeleton Key, Grunge Spray and
  Audio Wide. Most carry little or no outline on purpose — an outline fills in
  the gaps that make a maze, a bulb marquee or a sketch legible as what it is.
  **61 styles across 58 typefaces** in total.
- **The style cards now show a real specimen.** A 12px "Aa Bb 123" made a
  blackletter, a pixel font and a dripping-paint face all look like the same
  grey smudge. Each card now sets a full line in its own face, at its own
  size, case, letter-spacing, colour and metal finish.
- Fonts load lazily: the stylesheets come in as CSS and the browser fetches a
  face when something uses it, rather than pulling sixty families down on
  arrival.

## Unreleased — Smoother captions, a close-up preview, and chrome

- **A second preview, magnified, beside the first.** The Captions studio now
  shows the full frame and a close-up of the caption band side by side, at
  2x, 3x, 4x or 6x. The close-up is not a blown-up screenshot of the frame
  next to it — the renderer is run a second time through a zoom transform, so
  the letters are drawn at the magnified size and you are looking at real
  edges rather than enlarged pixels. It follows the caption automatically when
  you move it to the top or the centre.
- **The preview is no longer jagged.** It was a fixed 1280x720 bitmap squeezed
  into a 460-pixel box: every glyph was rasterised at full size and then
  resampled down by 0.36x, which chews the thin strokes of letters and the
  outline into a crunchy mess however well they were drawn. Both stages now
  size their bitmap to the pixels they actually occupy, at your screen's
  device pixel ratio, so the text is rasterised once at the size it is shown
  and never resampled.
- **The captions themselves are drawn better, everywhere — preview and
  export.** Outline corners and ends are rounded instead of throwing mitre
  spikes off every diagonal; the outline is stroked at double width beneath
  the fill, so it no longer eats into the letter and clog the counters of a,
  e and o; text is asked for precise glyph placement; and baselines, line
  starts and the backdrop bar are snapped to whole pixels, because a caption
  sitting on a half pixel is smeared across two rows of them.
- **Fixed: turning the border down to 0 silently turned the drop shadow off.**
  The shadow was cast by the outline stroke, so with no outline there was
  nothing to cast it and the captions lost the one thing holding them off a
  busy background.
- **Fixed: the letter-spacing slider did nothing.** It was in the config and on
  screen, but the renderer never read it.
- **Gold and silver chrome.** Four metallic presets — Gold Chrome, Engraved
  Gold, Silver Chrome and Titanium Edge — and a Finish control that puts
  either metal on *any* style. A metal letter is not one colour: it is a
  vertical ramp from a bright top bevel through the body colour to a dark
  underside, with a mirror band where the surface turns over and bounce light
  along the bottom, all inside a dark edge. The word being spoken catches an
  extra band of light across its middle.
- **From 10 caption styles to 27, and from 10 typefaces to 24.** New faces
  include Playfair Display, Libre Baskerville, Great Vibes, Oswald,
  Montserrat, Bebas Neue, Archivo Black, Orbitron, Righteous, Lobster,
  Pacifico, Special Elite, Press Start 2P and Fredoka. New looks span
  Editorial Headline, Quiet Book, Royal Script, Condensed Report, Geometric
  Bold, Tall Caps, Techno Grid, Deco Glow, Sign Painter, Surf Script,
  Typewriter Note, Arcade Pixel and Chunky Round. The catalogue gained a
  Metallic shelf and category filters, because two dozen cards in one flat
  grid is a scroll, not a choice.

## Unreleased — Search photos by your own criteria

- **The research block has a search box.** Until now the only way to change
  which photos a scene was offered was to edit the narration, because the
  query was derived from the script. You can now type what you want to see —
  "misty harbour at dawn" — and press Enter. The words are pinned to the
  scene, so a later script edit cannot quietly throw them away, and a one-line
  link puts the scene's own words back when you want them.
- **The block says which query it answered.** An exact search that finds
  nothing is widened automatically; it now tells you it did that and what it
  widened to, instead of silently returning photos of something else. It also
  says when nothing came back online and the bundled deck answered.
- **Nature Fallback now searches.** It used to be nine bundled photos, the
  same nine on every project, with no way to ask for a kind. It has criteria
  chips — Mountains, Ocean, Forest, Sky & space, Waterfalls, Peaceful, All —
  and choosing one runs a real search for it, so the drawer fills with photos
  you have not seen before. "New photos" asks again for more of the same
  criteria. The bundled deck stays underneath as the floor: with no API key
  and no network you still get a usable grid, and the drawer says so rather
  than passing the bundled photos off as fresh results.

## Unreleased — One-scene projects, your own footage, and a voiceover switch

- **Added "One Scene" beside the 10/20/30-second scene lengths.** The script
  is not chopped up at all: the whole thing becomes a single scene and a
  single continuous shot. Captions, music, stickers and everything else in the
  Studio behave exactly as they do on a multi-scene project — there is simply
  one scene to hang them on.
- **A one-scene project can start from your own video.** Pick One Scene and
  Setup offers two routes: make the video from the script, or upload footage
  and use it as the scene. The upload is kept in the browser's own storage and
  the scene records a stable `custom-video:<id>` address, so the project still
  plays the clip after a reload — a `blob:` URL would have died with the page.
  The clip keeps its own soundtrack, and can be trimmed, muted or swapped in
  the Scenes step like any other clip. A music video needs no script at all:
  with footage attached, Setup lets you start with the script box empty.
- **The single scene lasts as long as it really is.** Normal scenes are capped
  at 1.6× their target so a 20-second scene cannot quietly become a minute. A
  one-scene project has no target to be capped against, so the scene runs for
  as long as the words take to say — or, with footage attached, for exactly as
  long as the footage.
- **Added a voiceover on/off switch**, in Setup next to the one-scene choice
  and at the top of the Voiceover step. Off means no narration is synthesised,
  previewed, rendered or waited for: no TTS calls, no spoken track in the
  export, no two-second opening hold waiting for words that never come, and
  scene lengths that follow the footage instead of a voice. Uploading footage
  switches it off automatically and says so, because that footage has its own
  sound. Background music, captions and the whole Video Studio are untouched.
- The opening hold is now one shared rule (`narrationLeadIn`) read by both the
  live preview and the renderer, instead of a private copy in each — they
  could previously have drifted apart on the first cut.
- **Fixed: re-splitting a script into fewer scenes left the old scenes behind.**
  They survived in storage and came back on the next reload, so the project you
  saved was not the project you got back. Most visible when switching an
  existing project to One Scene, where a dozen scenes become one.
- Added `tests/single-scene.test.ts` — 88 checks over the splitter, the scene
  length rules, the upload store, the lead-in and every surface the voiceover
  switch has to reach.

## Unreleased — Editing happens at the timeline

- **Timeline blocks no longer hide each other.** Every effect was drawn on its
  lane's centre line, so a full-length music bed, visualiser or logo painted
  straight over the stickers and cards underneath it — the hidden ones could
  not even be clicked. Blocks are now packed into sub-rows: anything that does
  not collide keeps sharing a row, so a sparse timeline is exactly as tall as
  before and only a genuine overlap costs height. The packing is measured in
  pixels rather than seconds, because a 0.2s effect is still drawn 26px wide;
  zooming in spreads blocks apart and the stack collapses on its own.
- **The timeline stays compact.** A lane grows to a ceiling (74px collapsed,
  96px expanded) and then thins its rows instead of growing further. Rows
  below 17px drop their title and become a colour chip with the icon, and no
  row ever goes under 10px, so nothing is hidden at any density. New logic in
  `src/lib/timeline-stacking.ts`, covered by `tests/timeline-stacking.test.ts`.
- **The Edit button under the timeline is now the obvious thing to press.** It
  was a 10px ghost button wedged between the selection label and Delete; it is
  now a solid primary CTA reading "Edit this effect".
- **Removed the Edit button from every Video Studio card.** Adding a feature
  and configuring it were two buttons doing almost the same thing. The
  catalogue now only adds — full width, one action — and because adding
  selects the new block, its Edit button appears under the timeline straight
  away. Editing a feature means clicking it on the timeline, which is also the
  only way to edit the second, third or fourth copy of one.

## Unreleased — Music, uploads and the captions switch

- Grew the background music library from 12 tracks to **30**. Eighteen tracks
  were added, mostly the emotional soft-piano end of the Chris Zabriskie
  catalogue from the YouTube Audio Library (CC BY 4.0) — *Cylinder Five / Six
  / Eight*, *The Temperature of the Air on the Bow of the Kaleetan*, *John
  Stockton Slow Drag*, *I Need to Start Writing Things Down* and more — plus
  two public-domain classical piano pieces (*Clair de Lune*, *Gymnopédie No.
  1*), an acoustic-guitar bed and two CC0 instrumentals. Every title, artist
  and length was read from the audio file itself rather than typed from
  memory.
- **Fixed three wrong music credits.** Two Alexander Nakarada tracks and one
  more were credited to Kevin MacLeod, and the app pastes that credit into the
  creator's video description — an attribution breach of the very licence the
  track is used under. Also corrected six durations, one of which claimed 8:38
  for a 3:29 file, which skewed the loop and fade maths.
- **The music actually on the timeline now reaches the credits document.** A
  bed chosen in the Voiceover step was never named in the generated credits,
  so a creator using a CC BY track could publish without the attribution the
  licence requires.
- Added **your own background music**: upload a file in the Voiceover step,
  preview it, set its volume and use it across the video. Uploads are kept in
  IndexedDB and addressed as `custom-music:<id>`, so a saved project still
  plays them after a reload — a `blob:` URL would not survive the page. The
  credits document says plainly that an uploaded track is yours to clear.
- Added mood filters and a search box to the music section, because thirty
  cards are too many to scan.
- **Captions can now actually be switched off.** The per-scene "Caption
  Active / Disabled" button had no effect: both the live preview and the
  renderer ignored it and burned the captions in anyway. Both now honour it.
  The project-wide switch is a real on/off switch shown in the Captions step
  *and* in Voiceover, it reports how many scenes are individually off, and it
  takes effect immediately instead of waiting for "Apply to All".
- Added `tests/music-library.test.ts`, which checks every track has its file
  on disk, a unique id, a licence and a credit line that names its own author
  — and that nothing claims to be from the YouTube Audio Library unless it is.

## Unreleased — The website

- Added the public website at `/`: the workflow from idea to finished video,
  shown with live, interactive mockups built from the app's own catalogues.
- Kept `/` (website) and `/app` (studio) as separate render surfaces, but made
  the website the application's front page: the sign-in door and studio bundle
  now prepare alongside the landing page, so a successful sign-in mounts the
  already-loaded editor instead of starting a second large download.
- Added `src/marketing/product-facts.ts` as the single source of every number
  and claim on the page, and `src/marketing/assets.ts` as the artwork registry
  that lets concept art be swapped for real screenshots without a redesign.
- Added the website artwork pipeline (`npm run marketing:assets`) and the
  link-preview card (`npm run marketing:og`).
- Added two test suites: one that checks the website tells the truth, one that
  renders it to HTML and inspects the markup.
- Made **Porcelain** the default theme and moved its palette into
  `src/shared/porcelain.css`, so the website, the sign-in screen and the
  studio are all the same colours.
- Put the studio behind a local sign-in (`/app`): a name and a passphrase
  hashed with PBKDF2 in the browser, no account server, session ends with the
  tab. The navigation's "Sign in" is now the only route into the editor.
- The website's effects are rendered by the studio's own preview canvases —
  real stickers, text templates, colour grades, CTA badges and audio
  visualisers — loaded on demand when the section scrolls into view.
- Added a live sound visualiser to the Voiceover step: the render engine,
  driven by an analyser on the real narration. Voices are only routed through
  Web Audio while the panel is on screen, and it shows an honest sample when
  there is no readable signal.
- Moved the visualiser and full-video music libraries into Voiceover. Their
  Show/Hide controls sit at the top, music cards no longer carry decorative
  artwork, and visualiser cards use still frames from the production renderer.
- Curated repeated visualiser silhouettes out of the picker while retaining
  their renderers for saved projects. Glow Pills remains unchanged; the centre
  ring now uses filled outward-growing bars, and Talking Dot Wave now has 20
  colour-editable, differently sized audio bands.
- The website now tells a six-step story, not seven: `WORKFLOW_STAGES` is
  derived from the studio's own `PROJECT_PHASES`, so the page can no longer
  promise a tab the app does not have. Finding the visuals is part of Scenes,
  where it happens; the visuals section of the page is unchanged.
- Added "The five things people ask first" under the hero: credits, being on
  camera, your own voice, picture rights and never having edited before. Each
  one answers in a line and jumps to the section that explains it.
- Added "No credits. No tokens. No counter." — why nothing is metered, with
  the one optional exception (a Gemini key for narration) stated plainly
  rather than hidden. The tests check the claim against the code.
- Replaced the website's hand-drawn waveform graphics with that visualiser —
  the real canvas where the page can afford it, a CSS echo of the twenty-band
  Talking Dot Wave in the light-weight artwork.
- Rebuilt long-render output around an OPFS-backed random-access stream where
  the browser supports it. MP4/WebM bytes are drained to protected browser
  storage with bounded backpressure instead of retaining the complete growing
  file in JavaScript memory; a capacity preflight fails early and clearly.
- Replaced one retained Promise and several analyser objects per video frame
  with a bounded rolling audio-suspension window and compact packed telemetry.
- Bounded decoded visual memory to the previous/current/next scenes and release
  old photo caches and video decoders as the render advances.
- Added the long-render health dashboard: named stages, elapsed/estimated time,
  frame and output counters, storage/asset/audio safety indicators, background
  tab state and a screen wake lock. Reloading during a render now warns first.

## 1.1.0 — Frame-exact export

- Added offline, frame-exact WebCodecs video and audio rendering.
- Added MP4 codec fallbacks and frame-exact WebM rescue.
- Added visible renderer diagnostics and strict frame-exact mode.
- Fixed Ken Burns snap-back and improved motion visibility.
- Enforced one active music bed and exact narration replacement.
