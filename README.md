# Scenering

Turn a script into a finished video. Scenering splits your script into scenes,
finds an image for each one, narrates it, lets you style the result in a video
studio, and renders the whole thing out.

## Running it

You need [Node.js](https://nodejs.org) 18 or newer. Then:

```bash
npm install
npm run dev
```

Open **http://localhost:3000**. That is the whole setup — no database, no API
keys, no accounts. Projects are saved in your browser's local storage.

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

To run the production build instead:

```bash
npm run build
npm start
```

Set `PORT` to use a different port (`PORT=8080 npm start`).

## Optional API keys

The app works without any of these. Copy `.env.example` to `.env` and fill in
whichever you want:

| Key | What it adds | Without it |
|---|---|---|
| `GEMINI_API_KEY` | Highest-quality narration | Free Edge voices, then a silent track |
| `PEXELS_API_KEY` | Stock photo search | Wikimedia Commons |
| `PIXABAY_API_KEY` | More stock photos | Wikimedia Commons |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Projects sync across devices | Saved in your browser |

Narration falls back in that order automatically, so it never hard-fails — if
every option is unavailable you get a silent track of the right length and the
video still renders.

Image search has a hard quality gate: only photo-like images are used (no
black-and-white shots, diagrams or flat artwork — thumbnails are analysed
pixel-by-pixel), and every image that reaches a scene is 16:9 and at least
1920×1080, so a 1080p render never upscales its footage.

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
   and reposition (aspect ratio is always preserved), edit the narration.
3. **Voiceover** — pick a voice, generate narration, download the audio. A
   live sound visualiser draws the narration while you listen to it.
4. **Captions** — styling and timing.
5. **Video Studio** — the look of the finished video: filters, text templates,
   3D stickers, lower thirds, titles, call-to-action badges, music and sound
   effects, intro and outro.
6. **Render** — carries out the output choices made in Setup with a frame-exact,
   offline WebCodecs renderer, then places the finished video in the Vault.
   Every frame, narration sample and caption timestamp is generated from the
   timeline rather than wall-clock speed. On a slow machine rendering may take
   longer than the video's duration, but output smoothness and sync are
   unaffected. Browsers without WebCodecs automatically use the compatible
   real-time MediaRecorder renderer. Need another platform's cut? Go back to
   Setup, pick that destination, render again.

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
  MP4/WebM muxer. It renders independently of playback speed; `frame-ticker.ts`
  provides pacing only for the automatic real-time MediaRecorder fallback.
  In that fallback it uses `requestAnimationFrame` while the tab is visible,
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
The strongest of them, "No credits. No tokens. No counter.", is checked
against the code by `tests/marketing.test.ts`: the script is split by
`splitScriptIntoScenes()`, the search terms come from `topic-extract.ts`, the
only model call in `server.ts` asks for audio, and the optional Gemini key is
named on the page rather than hidden.

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
