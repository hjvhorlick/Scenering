# Changelog

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
