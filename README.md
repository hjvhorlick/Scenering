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
3. **Voiceover** — pick a voice, generate narration, download the audio.
4. **Captions** — styling and timing.
5. **Video Studio** — the look of the finished video: filters, text templates,
   3D stickers, lower thirds, titles, call-to-action badges, music and sound
   effects, intro and outro.
6. **Render** — preview and export.

## Project layout

```
src/
  components/   React UI, one studio per phase
  lib/          the engines — framing, motion, text art, rendering, filters
  data/         catalogues: templates, filters, voices, caption styles
public/
  sounds/       music and sound effects
  videos/       intro and outro clips
server.ts       Express API: narration, image search, hosts Vite in dev
tests/          the test suite
```

Some `lib` modules are worth knowing about, because they are deliberately the
single source of truth for their job:

- **`scene-framing.ts`** — every image placement in the app. The editor
  preview, the live preview and the exported video all call into it, which is
  what guarantees a photo is never stretched out of shape.
- **`render-effects.ts`** — `getMotionTransform()` drives all camera motion.
- **`text-art.ts`** / **`render-text-template.ts`** — title lettering and the
  29 text templates.
- **`frame-ticker.ts`** — the export's frame pacing. `requestAnimationFrame`
  while the tab is visible (true vsync cadence), a Web Worker timer while it
  is hidden (page timers get throttled to ~1Hz in background tabs), and a
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
