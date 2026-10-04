# Changelog

## Unreleased — Images that arrive framed, honest VIP exports, and a Fairy shelf

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
