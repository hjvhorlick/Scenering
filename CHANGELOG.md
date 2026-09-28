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

## 1.1.0 — Frame-exact export

- Added offline, frame-exact WebCodecs video and audio rendering.
- Added MP4 codec fallbacks and frame-exact WebM rescue.
- Added visible renderer diagnostics and strict frame-exact mode.
- Fixed Ken Burns snap-back and improved motion visibility.
- Enforced one active music bed and exact narration replacement.
