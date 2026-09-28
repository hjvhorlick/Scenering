# Changelog

## Unreleased — The website

- Added the public website at `/`: the workflow from idea to finished video,
  shown with live, interactive mockups built from the app's own catalogues.
- Split the app into two lazily loaded halves — `/` (website) and `/app`
  (studio) — so neither downloads the other's code or stylesheets.
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
  driven by an analyser on the real narration, with the catalogue's four
  voice-shaped styles to choose from. Voices are only routed through Web Audio
  while the panel is on screen, and it holds still rather than animating when
  there is no signal to read.
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
  the real canvas where the page can afford it, a CSS echo of Minimal Talking
  Dots in the light-weight artwork.

## 1.1.0 — Frame-exact export

- Added offline, frame-exact WebCodecs video and audio rendering.
- Added MP4 codec fallbacks and frame-exact WebM rescue.
- Added visible renderer diagnostics and strict frame-exact mode.
- Fixed Ken Burns snap-back and improved motion visibility.
- Enforced one active music bed and exact narration replacement.
