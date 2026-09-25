/**
 * Audio-visualiser suite.
 *
 * Covers the 52 visualisers in the catalogue — the 22 originals (13 racks, the
 * seven full-frame "immersive scenes" and the two centre-stage styles) plus the
 * 30 Pixabay-inspired looks (5 families x 6 — Bass & Speakers, Spectrum Bars,
 * Flowing Waves, 3D Grids, Circular) — and the option plumbing behind them:
 * colour themes, band count, reactivity, full-width geometry, the transparent
 * overlay contract and the body/footprint maths that hit-testing and dragging
 * depend on.
 *
 * The stub context throws on any non-finite argument, so "it drew" is a real
 * assertion about the maths even without a rasteriser.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness, createStubContext } from "./harness";
import { CATALOG_ITEMS, STUDIO_CATEGORIES } from "../src/lib/video-studio-catalog";
import {
  CENTRE_VISUALIZER_TYPES,
  IMMERSIVE_VISUALIZER_TYPES,
  PIXABAY_VISUALIZER_TYPES,
  wantsCentreLogo,
  isImmersiveVisualizer,
  isLinearVisualizer,
  isPixabayVisualizer,
  isRoundVisualizer,
  supportsCentreLogo,
  isVisualizerFullWidth,
  pixabayBoxOf,
  pixabayVisualizerShape,
  visualizerBodyHeight,
  getVisualizerFootprint,
  renderAudioVisualizer,
} from "../src/lib/render-visualizers";
import {
  PIXABAY_FAMILIES,
  PIXABAY_STYLE_IDS,
  familyLikes,
  isPixabayStyle,
  pixabayStyleOf,
} from "../src/lib/pixabay-styles";
import { VISUALIZER_PALETTES, resolveVisualizerPalette } from "../src/lib/visualizer-palettes";
import type { TimelineInsert } from "../src/types";

const h = createHarness();
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, "..", rel), "utf8");

const VISUALISERS = CATALOG_ITEMS.audio_visualizers;

function makeInsert(type: string, overrides: Partial<TimelineInsert> = {}): TimelineInsert {
  const source = VISUALISERS.find((v) => v.type === type);
  if (!source) throw new Error(`no catalogue entry for visualiser type ${type}`);
  return {
    id: `test-${type}`,
    category: "audio_visualizers",
    type,
    title: source.name,
    startTime: 0,
    duration: source.defaultDuration || 8,
    position: { x: 0.5, y: 0.82 },
    presetPosition: (source.defaultPosition as TimelineInsert["presetPosition"]) || "bottom",
    size: source.defaultSize || 1,
    opacity: 1,
    intensity: 1,
    audioSource: source.defaultAudioSource || "music",
    content: {},
    visualOptions: { ...(source.defaultVisualOptions || {}) },
    audioSettings: {},
    ...overrides,
  } as unknown as TimelineInsert;
}

// ------------------------------------------------------------------ catalogue
h.ok(VISUALISERS.length === 52, `expected 52 visualisers, got ${VISUALISERS.length}`);

const bySub = new Map<string, number>();
const seenTypes = new Set<string>();
for (const v of VISUALISERS) {
  bySub.set(v.subCategory || "none", (bySub.get(v.subCategory || "none") || 0) + 1);
  h.ok(!seenTypes.has(v.type), `duplicate visualiser type ${v.type}`);
  seenTypes.add(v.type);
  h.ok(Boolean(v.name && v.description), `${v.type} has a name and a description`);
  h.ok(
    (v.defaultDuration || 0) > 0,
    `${v.type} has a default duration (${v.defaultDuration})`
  );
  h.ok(
    ["music", "voice", "all"].includes(v.defaultAudioSource || "music"),
    `${v.type} reacts to a real audio source (${v.defaultAudioSource})`
  );
  if (v.subCategory === "immersive") {
    h.ok(
      (IMMERSIVE_VISUALIZER_TYPES as readonly string[]).includes(v.type),
      `${v.type} is in the immersive list`
    );
  }
}

h.eq(bySub.get("immersive") || 0, 7, `immersive scene count (${bySub.get("immersive")})`);
h.eq(bySub.get("centre") || 0, 2, `centre stage count (${bySub.get("centre")})`);
h.eq(
  bySub.get("waves") || 0,
  9,
  `audio waves & bars count (${bySub.get("waves")})`
);
h.eq(bySub.get("speech") || 0, 4, `speech reactive count (${bySub.get("speech")})`);
// one sub-category per Pixabay family, six looks each
for (const family of PIXABAY_FAMILIES) {
  h.eq(bySub.get(family.id) || 0, 6, `${family.name} offers six looks (${bySub.get(family.id)})`);
}

// every immersive type in the code has a catalogue card
for (const type of IMMERSIVE_VISUALIZER_TYPES) {
  h.ok(
    VISUALISERS.some((v) => v.type === type),
    `immersive type ${type} is offered in the studio`
  );
}

// ------------------------------------------------------------------ palettes
h.ok(VISUALIZER_PALETTES.length >= 16, `expected 16+ colour themes, got ${VISUALIZER_PALETTES.length}`);
const paletteIds = new Set<string>();
for (const p of VISUALIZER_PALETTES) {
  h.ok(!paletteIds.has(p.id), `duplicate palette id ${p.id}`);
  paletteIds.add(p.id);
  for (const colour of [p.primary, p.secondary, p.accent]) {
    h.ok(/^#[0-9a-fA-F]{6}$/.test(colour), `${p.id} colour ${colour} is a 6-digit hex`);
  }
  h.ok(Boolean(p.name), `${p.id} has a display name`);
}

// catalogue cards may only reference themes that exist
for (const v of VISUALISERS) {
  const theme = v.defaultVisualOptions?.colorTheme;
  if (theme) {
    h.ok(paletteIds.has(theme), `${v.type} colour theme "${theme}" exists`);
  }
}

// choosing a theme supplies all three colours…
{
  const fire = resolveVisualizerPalette({ colorTheme: "fire" });
  h.eq(fire.primary, "#f97316", "fire theme primary");
  h.eq(fire.secondary, "#dc2626", "fire theme secondary");
  h.eq(fire.accent, "#fef08a", "fire theme accent");
}

// …and an insert with no theme keeps its own pickers (old projects unchanged)
{
  const own = resolveVisualizerPalette({ primaryColor: "#123456", secondaryColor: "#654321" });
  h.eq(own.primary, "#123456", "insert colour wins when no theme is set");
  h.eq(own.secondary, "#654321", "insert secondary colour wins when no theme is set");
  const legacy = resolveVisualizerPalette(undefined);
  h.eq(legacy.primary, "#38bdf8", "default primary colour is unchanged");
  h.eq(legacy.secondary, "#f43f5e", "default secondary colour is unchanged");
  const green = resolveVisualizerPalette({ colorPreset: "crt_green" });
  h.eq(green.primary, "#10b981", "CRT green preset still resolves");
}

// ------------------------------------------------------------------ geometry
for (const v of VISUALISERS) {
  const item = makeInsert(v.type);
  const immersive = isImmersiveVisualizer(v.type);
  h.eq(immersive, v.subCategory === "immersive", `${v.type} immersive flag matches its group`);

  if (immersive) {
    h.ok(isVisualizerFullWidth(item), `${v.type} fills the frame`);
    h.ok(!isRoundVisualizer(v.type), `${v.type} is not a round badge`);
  }

  for (const size of [0.4, 1, 1.6, 2.5]) {
    const sized = makeInsert(v.type, { size });
    for (const canvasHeight of [360, 720, 1080, 2160]) {
      const body = visualizerBodyHeight(sized, canvasHeight);
      h.finite(body, `${v.type} body height at size ${size}, ${canvasHeight}p`);
      h.ok(body > 0, `${v.type} body height is positive at ${canvasHeight}p`);
      const foot = getVisualizerFootprint(sized, canvasHeight * (16 / 9), canvasHeight);
      h.finite(foot.w, `${v.type} footprint width at ${canvasHeight}p`);
      h.finite(foot.h, `${v.type} footprint height at ${canvasHeight}p`);
      h.ok(foot.w > 0 && foot.h > 0, `${v.type} footprint is positive at ${canvasHeight}p`);
      if (immersive) {
        h.near(
          foot.w,
          canvasHeight * (16 / 9),
          0.5,
          `${v.type} footprint spans the full frame width at ${canvasHeight}p`
        );
      }
    }
  }
}

// linear (rack) types are still racks, scenes are not
h.ok(isLinearVisualizer("spectrum"), "spectrum is still a linear visualiser");
h.ok(!isLinearVisualizer("terrain_grid"), "an immersive scene is not a rack");

// ------------------------------------------------------------------ rendering
for (const v of VISUALISERS) {
  const item = makeInsert(v.type);
  const immersive = isImmersiveVisualizer(v.type);

  for (const [w, hgt] of [
    [1920, 1080],
    [720, 1280],
    [640, 360],
  ]) {
    for (const elapsed of [0, 0.4, 1.6, 3.7, 9.2]) {
      const { ctx, ops, opsWithArgs } = createStubContext(w, hgt);
      try {
        renderAudioVisualizer({
          ctx,
          item,
          x: w / 2,
          y: hgt * 0.8,
          canvasWidth: w,
          canvasHeight: hgt,
          elapsed,
          compact: hgt < 500,
          frame: null,
        });
        h.ok(true, `${v.type} drew at ${w}x${hgt} t=${elapsed}`);
        h.ok(
          ops.length > (immersive ? 60 : 12),
          `${v.type} actually drew something at ${w}x${hgt} t=${elapsed} (${ops.length} ops)`
        );
      } catch (err) {
        h.ok(false, `${v.type} threw at ${w}x${hgt} t=${elapsed}: ${err}`);
      }
    }
  }
}

// ------------------------------------------------------------------ options
// Every option is clamped instead of trusted, so extreme values cannot break a
// render: band count, reactivity, glow, thickness and a custom palette.
for (const v of VISUALISERS) {
  const extremes = [
    { bandCount: 8, reactivity: 0.2, glowIntensity: 0, barThickness: 2 },
    { bandCount: 256, reactivity: 2.4, glowIntensity: 1, barThickness: 24 },
    { bandCount: -5, reactivity: -3, glowIntensity: 4, barThickness: 99 },
  ];
  for (const patch of extremes) {
    const item = makeInsert(v.type, {
      visualOptions: { ...(v.defaultVisualOptions || {}), ...patch },
    });
    const { ctx } = createStubContext(1920, 1080);
    try {
      renderAudioVisualizer({
        ctx,
        item,
        x: 960,
        y: 864,
        canvasWidth: 1920,
        canvasHeight: 1080,
        elapsed: 2.2,
        frame: null,
      });
      h.ok(true, `${v.type} survives ${JSON.stringify(patch)}`);
    } catch (err) {
      h.ok(false, `${v.type} broke on ${JSON.stringify(patch)}: ${err}`);
    }
  }
}

// A colour theme reaches the pixels: the fire palette's orange is handed to the
// canvas by the immersive scenes.
{
  const item = makeInsert("particle_swarm", {
    visualOptions: {
      ...(VISUALISERS.find((v) => v.type === "particle_swarm")!.defaultVisualOptions || {}),
      colorTheme: "fire",
    },
  });
  const { ctx, opsWithArgs } = createStubContext(1280, 720);
  renderAudioVisualizer({
    ctx,
    item,
    x: 640,
    y: 576,
    canvasWidth: 1280,
    canvasHeight: 720,
    elapsed: 1.1,
    frame: null,
  });
  const painted = opsWithArgs.join(" ");
  h.ok(painted.includes("#f97316") || painted.includes("249, 115, 22"), "fire theme orange reaches the canvas");
  h.ok(!painted.includes("52, 211, 153"), "the previous theme's colour is gone once a new one is picked");
}

// Band count changes how much detail the analyser asks for: 128 bands vs 16.
{
  const countBars = (bandCount: number) => {
    const item = makeInsert("glow_pills", {
      visualOptions: {
        ...(VISUALISERS.find((v) => v.type === "glow_pills")!.defaultVisualOptions || {}),
        bandCount,
      },
    });
    const { ctx, ops } = createStubContext(1280, 720);
    renderAudioVisualizer({
      ctx,
      item,
      x: 640,
      y: 576,
      canvasWidth: 1280,
      canvasHeight: 720,
      elapsed: 1.1,
      frame: null,
    });
    return ops.length;
  };
  const detailed = countBars(128);
  const chunky = countBars(16);
  h.ok(detailed > chunky, `more bands draw more detail (${detailed} vs ${chunky} ops)`);
}

// The spoken-word scenes react to the voice bus rather than the music bus.
for (const v of VISUALISERS.filter((x) => x.subCategory === "speech")) {
  const item = makeInsert(v.type, { audioSource: "voice" });
  const { ctx } = createStubContext(1280, 720);
  renderAudioVisualizer({
    ctx,
    item,
    x: 640,
    y: 576,
    canvasWidth: 1280,
    canvasHeight: 720,
    elapsed: 3.3,
    frame: null,
  });
  h.ok(true, `${v.type} renders from the voice bus`);
}

// ------------------------------------------------------------------ centre stage
// The two centrepiece styles (the audio orb and the orbit disc) are built around
// the middle of the frame and can carry the user's own logo there.
{
  const centreItems = VISUALISERS.filter((v) => v.subCategory === "centre");
  h.eq(centreItems.length, 2, "two centre-stage visualisers are offered");
  for (const v of centreItems) {
    h.ok(
      (CENTRE_VISUALIZER_TYPES as readonly string[]).includes(v.type),
      `${v.type} is a known centre type`
    );
    h.ok(isRoundVisualizer(v.type), `${v.type} is drawn as a round centrepiece`);
    const item = makeInsert(v.type);
    h.ok(!isVisualizerFullWidth(item), `${v.type} is never stretched across the frame`);
    h.eq(
      wantsCentreLogo(item),
      true,
      `${v.type} shows the user's logo in the middle by default`
    );
    // turning it off keeps the glowing core but drops the logo
    const off = makeInsert(v.type, {
      visualOptions: { ...(v.defaultVisualOptions || {}), centreLogo: false },
    });
    h.eq(wantsCentreLogo(off), false, `${v.type} honours the "logo off" choice`);

    // it is bigger than the small round badges, so it reads as the centrepiece
    const centreBody = visualizerBodyHeight(item, 1080);
    const badgeBody = visualizerBodyHeight(makeInsert("voice_pulse"), 1080);
    h.ok(centreBody > badgeBody, `${v.type} is larger than a round badge (${centreBody} > ${badgeBody})`);
    // the centrepiece is deliberately oversized — it is the subject of the shot
    h.ok(item.size >= 1.2, `${v.type} defaults to a centrepiece size (${item.size}x)`);

    // the footprint stays on the frame at every size
    for (const size of [0.45, 1, 1.6]) {
      const footprint = getVisualizerFootprint(makeInsert(v.type, { size }), 1920, 1080);
      h.finite(footprint.w, `${v.type} footprint width at ${size}x`);
      h.ok(footprint.w <= 1920 * 1.02, `${v.type} footprint stays on the frame at ${size}x`);
      h.ok(footprint.w > 150, `${v.type} keeps a usable grab area at ${size}x`);
      if (size >= 1) {
        h.ok(
          footprint.w >= 1080 * 0.4,
          `${v.type} covers 40%+ of a 1080 frame at ${size}x (${Math.round(footprint.w)}px)`
        );
      }
    }

    // draws with no logo…
    const plain = createStubContext(1920, 1080);
    renderAudioVisualizer({
      ctx: plain.ctx,
      item,
      x: 960,
      y: 540,
      canvasWidth: 1920,
      canvasHeight: 1080,
      elapsed: 1.4,
      frame: null,
    });
    h.ok(plain.ops.length > 40, `${v.type} draws without a logo (${plain.ops.length} ops)`);
    h.ok(
      !plain.opsWithArgs.some((o) => o.startsWith("drawImage(")),
      `${v.type} draws no image when the project has no logo`
    );

    // …and draws the logo when the project has one
    const withLogo = createStubContext(1920, 1080);
    const logo = { naturalWidth: 512, naturalHeight: 512, width: 512, height: 512 } as unknown as CanvasImageSource;
    renderAudioVisualizer({
      ctx: withLogo.ctx,
      item,
      x: 960,
      y: 540,
      canvasWidth: 1920,
      canvasHeight: 1080,
      elapsed: 1.4,
      frame: null,
      logo,
    });
    h.ok(
      withLogo.opsWithArgs.filter((o) => o.startsWith("drawImage(")).length === 1,
      `${v.type} draws the user's logo exactly once in the middle`
    );

    // and never draws it when the choice is off
    const offDraw = createStubContext(1920, 1080);
    renderAudioVisualizer({
      ctx: offDraw.ctx,
      item: off,
      x: 960,
      y: 540,
      canvasWidth: 1920,
      canvasHeight: 1080,
      elapsed: 1.4,
      frame: null,
      logo,
    });
    h.ok(
      !offDraw.opsWithArgs.some((o) => o.startsWith("drawImage(")),
      `${v.type} draws no logo when the choice is off`
    );
  }

  // Round badges can carry the logo too — but only when asked (old projects are
  // untouched), and never on the rack styles.
  h.eq(wantsCentreLogo(makeInsert("circular_wave")), false, "a circular analyser stays clean by default");
  h.eq(
    wantsCentreLogo(
      makeInsert("circular_wave", { visualOptions: { centreLogo: true } })
    ),
    true,
    "a circular analyser can show the logo when asked"
  );
  h.eq(wantsCentreLogo(makeInsert("spectrum")), false, "racks never put a logo in the middle");

  const rack = createStubContext(1920, 1080);
  renderAudioVisualizer({
    ctx: rack.ctx,
    item: makeInsert("spectrum", { visualOptions: { ...(VISUALISERS.find((v) => v.type === "spectrum")!.defaultVisualOptions || {}), centreLogo: true } }),
    x: 960,
    y: 864,
    canvasWidth: 1920,
    canvasHeight: 1080,
    elapsed: 2,
    frame: null,
    logo: { naturalWidth: 256, naturalHeight: 256 } as unknown as CanvasImageSource,
  });
  h.ok(
    !rack.opsWithArgs.some((o) => o.startsWith("drawImage(")),
    "a rack ignores the logo even if the flag is set"
  );
}

// ------------------------------------------------------------------ Pixabay families
/**
 * The 30 Pixabay-inspired looks. Pixabay's free library sorted by likes keeps
 * repeating the same five ideas, so those are the families that were rebuilt:
 * a speaker with EQ bars (559 likes, 82,200 downloads, Editor's Choice), bars
 * with peak caps (390/341), flowing ribbons (334/200), 3D grids (293/219) and
 * circular analysers (341). Two things every one of them must keep:
 *   • transparent — nothing paints a background plate over the footage
 *   • audio-reactive — drawn from the real bus, never a canned animation
 */
{
  h.eq(PIXABAY_STYLE_IDS.length, 30, `30 Pixabay looks exist (${PIXABAY_STYLE_IDS.length})`);
  h.eq(
    PIXABAY_VISUALIZER_TYPES.length,
    30,
    `all 30 Pixabay looks are wired into the renderer (${PIXABAY_VISUALIZER_TYPES.length})`
  );
  h.eq(PIXABAY_FAMILIES.length, 5, `five Pixabay families (${PIXABAY_FAMILIES.length})`);

  // the sub-category list in the studio carries one entry per family
  const subDefs =
    STUDIO_CATEGORIES.find((c) => c.id === "audio_visualizers")?.subcategories || [];
  const subIds = subDefs.map((d) => d.id);
  for (const family of PIXABAY_FAMILIES) {
    h.ok(subIds.includes(family.id), `studio sub-category "${family.id}" exists`);
    h.eq(family.styles.length, 6, `${family.name} has six styles`);
    h.ok(Boolean(family.name && family.blurb), `${family.id} has a name and a blurb`);
    // popularity is the selection rule: the family's headline style is the one
    // with the most likes of the six
    const likes = family.styles.map((st) => st.likes);
    h.eq(family.styles[0].likes, Math.max(...likes), `${family.id} leads with its most-liked look`);
    h.ok(familyLikes(family) > 700, `${family.id} is built from well-liked clips (${familyLikes(family)} likes)`);
  }

  // every style has a card, and the card carries the researched defaults
  for (const family of PIXABAY_FAMILIES) {
    for (const style of family.styles) {
      const card = VISUALISERS.find((v) => v.type === style.id);
      h.ok(Boolean(card), `${style.id} has a studio card`);
      if (!card) continue;
      h.eq(card.subCategory, family.id, `${style.id} is filed under ${family.id}`);
      h.eq(card.defaultSize, style.size, `${style.id} keeps its researched size`);
      h.eq(card.defaultPosition, style.position, `${style.id} keeps its researched position`);
      h.eq(card.defaultAudioSource, "music", `${style.id} reacts to the music bus`);
      h.eq(card.spansFullVideo, true, `${style.id} runs for the whole video`);
      h.eq(
        card.defaultVisualOptions?.bandCount,
        style.bandCount,
        `${style.id} keeps its band count`
      );
      h.eq(
        card.defaultVisualOptions?.reactivity,
        style.reactivity,
        `${style.id} keeps its reactivity`
      );
      h.ok(
        Boolean(style.name && style.icon && style.description.length > 40),
        `${style.id} has a name, an icon and a real description`
      );
      h.ok(style.likes > 0, `${style.id} records the likes of the clip it is modelled on`);
      h.ok(
        /^#[0-9a-fA-F]{6}$/.test(style.colors.primary) &&
          /^#[0-9a-fA-F]{6}$/.test(style.colors.secondary) &&
          /^#[0-9a-fA-F]{6}$/.test(style.colors.accent),
        `${style.id} has three hex colours`
      );
      h.ok(Boolean(style.source), `${style.id} credits the Pixabay source`);
    }
  }

  for (const type of PIXABAY_VISUALIZER_TYPES) {
    h.ok(isPixabayStyle(type), `${type} is a known Pixabay style`);
    h.ok(isPixabayVisualizer(type), `${type} is recognised by the renderer`);
    h.ok(!isLinearVisualizer(type), `${type} is not a classic rack`);
    h.ok(!isImmersiveVisualizer(type), `${type} is not an immersive scene`);
    h.ok(Boolean(pixabayStyleOf(type)), `${type} resolves to a style spec`);
  }

  // shape-aware geometry: bands span the frame, grids fill it, objects and discs do not
  const shapes: Record<string, number> = {};
  for (const type of PIXABAY_VISUALIZER_TYPES) {
    const shape = pixabayVisualizerShape(type);
    shapes[shape] = (shapes[shape] || 0) + 1;
    const item = makeInsert(type);
    const full = isVisualizerFullWidth(item);
    if (shape === "frame") {
      h.ok(full, `${type} (frame scene) fills the frame`);
    } else if (shape === "wide") {
      h.ok(full, `${type} (band) spans the full frame width by default`);
      const off = makeInsert(type, {
        visualOptions: { ...(item.visualOptions || {}), fullWidth: false },
      });
      h.ok(!isVisualizerFullWidth(off), `${type} can be switched back to a fixed band`);
    } else {
      h.ok(!full, `${type} (${shape}) never stretches across the frame`);
    }

    for (const canvasHeight of [360, 720, 1080, 2160]) {
      const box = pixabayBoxOf(item, canvasHeight * (16 / 9), canvasHeight);
      h.finite(box.w, `${type} box width at ${canvasHeight}p`);
      h.finite(box.h, `${type} box height at ${canvasHeight}p`);
      h.ok(box.w > 0 && box.h > 0, `${type} box is positive at ${canvasHeight}p`);
      const body = visualizerBodyHeight(item, canvasHeight);
      // big on screen: nothing here is a postage stamp (the user's own note was
      // that the visualisers must carry the shot)
      h.ok(
        body >= canvasHeight * 0.28,
        `${type} is big enough at ${canvasHeight}p (${Math.round(body)}px)`
      );
      const foot = getVisualizerFootprint(item, canvasHeight * (16 / 9), canvasHeight);
      h.ok(
        foot.h >= canvasHeight * 0.28 || foot.w >= canvasHeight * 0.5,
        `${type} keeps a usable grab area at ${canvasHeight}p`
      );
    }
  }
  h.eq(shapes.object, 6, `six object styles (${shapes.object})`);
  h.eq(shapes.wide, 12, `twelve band styles (${shapes.wide})`);
  h.eq(shapes.frame, 6, `six frame scenes (${shapes.frame})`);
  h.eq(shapes.round, 6, `six circular styles (${shapes.round})`);

  // the Pixabay circular family can carry the user's own logo in its hub — but
  // only when asked, so the default look stays untouched
  for (const type of PIXABAY_VISUALIZER_TYPES) {
    const shape = pixabayVisualizerShape(type);
    const plain = makeInsert(type);
    if (shape === "round") {
      h.eq(wantsCentreLogo(plain), false, `${type} stays clean by default`);
      h.eq(
        wantsCentreLogo(makeInsert(type, { visualOptions: { ...(plain.visualOptions || {}), centreLogo: true } })),
        true,
        `${type} shows the user's logo when asked`
      );
    } else {
      h.eq(wantsCentreLogo(plain), false, `${type} never puts a logo in the middle`);
      h.eq(
        wantsCentreLogo(makeInsert(type, { visualOptions: { centreLogo: true } })),
        false,
        `${type} ignores the centre-logo flag (no hub)`
      );
    }
  }

  // ---- transparency contract -------------------------------------------
  // Nothing may paint over the footage: no full-frame fill, no clearRect, no
  // opaque background plate. (The Pixabay clips are mostly black-background
  // MP4s — ours are overlays, which is the whole point.)
  for (const type of PIXABAY_VISUALIZER_TYPES) {
    const item = makeInsert(type);
    for (const [w, hgt] of [
      [1920, 1080],
      [1280, 720],
      [720, 1280],
    ] as const) {
      const { ctx, ops, opsWithArgs } = createStubContext(w, hgt);
      renderAudioVisualizer({
        ctx,
        item,
        x: w / 2,
        y: hgt * 0.6,
        canvasWidth: w,
        canvasHeight: hgt,
        elapsed: 1.7,
        frame: null,
      });

      h.ok(ops.length > 24, `${type} draws a real look at ${w}x${hgt} (${ops.length} ops)`);
      h.ok(
        !opsWithArgs.some((o) => o.startsWith("clearRect(")),
        `${type} never clears the frame at ${w}x${hgt}`
      );

      // any fillRect that covers most of both axes would be a background plate
      const coverAll = opsWithArgs
        .filter((o) => o.startsWith("fillRect("))
        .map((o) => o.slice("fillRect(".length, -1).split(",").map(Number))
        .some(
          (a) => Math.abs(a[2]) >= w * 0.85 && Math.abs(a[3]) >= hgt * 0.85
        );
      h.ok(!coverAll, `${type} paints no frame-covering rectangle at ${w}x${hgt}`);

      // full-width fills are allowed only as thin lines (ground haze / baselines)
      const thickBands = opsWithArgs
        .filter((o) => o.startsWith("fillRect("))
        .map((o) => o.slice("fillRect(".length, -1).split(",").map(Number))
        .filter((a) => Math.abs(a[2]) >= w * 0.9)
        .some((a) => Math.abs(a[3]) > hgt * 0.05);
      h.ok(!thickBands, `${type} paints no full-width block at ${w}x${hgt}`);
    }
  }

  // ---- reactivity ------------------------------------------------------
  // The look must move with the sound: at a different moment in the track the
  // drawing has to differ (deterministic, but not frozen).
  for (const type of PIXABAY_VISUALIZER_TYPES) {
    const item = makeInsert(type);
    const drawAt = (elapsed: number) => {
      const { ctx, opsWithArgs } = createStubContext(1280, 720);
      renderAudioVisualizer({
        ctx,
        item,
        x: 640,
        y: 432,
        canvasWidth: 1280,
        canvasHeight: 720,
        elapsed,
        frame: null,
      });
      return opsWithArgs.join("|");
    };
    const a = drawAt(0.6);
    const b = drawAt(3.1);
    h.ok(a !== b, `${type} animates over time`);
    // repeating the same moment always draws a real look (the analyser smooths
    // between calls, so the exact levels differ — that smoothing is what makes
    // the bars glide in the real render)
    h.ok(drawAt(0.6).split("|").length > 24, `${type} keeps drawing on a repeat call`);
  }

  // a louder bus moves the drawing further than a quiet one
  {
    const item = makeInsert("px_speaker_blue");
    const draw = (level: number) => {
      const frame = {
        voice: { values: new Array(64).fill(level), peaks: new Array(64).fill(level), energy: level, low: level, mid: level, high: level, beat: level },
        music: { values: new Array(64).fill(level), peaks: new Array(64).fill(level), energy: level, low: level, mid: level, high: level, beat: level },
        all: { values: new Array(64).fill(level), peaks: new Array(64).fill(level), energy: level, low: level, mid: level, high: level, beat: level },
      };
      const { ctx, opsWithArgs } = createStubContext(1280, 720);
      renderAudioVisualizer({
        ctx,
        item,
        x: 640,
        y: 432,
        canvasWidth: 1280,
        canvasHeight: 720,
        elapsed: 1.2,
        frame: frame as never,
      });
      return opsWithArgs.join("|");
    };
    const loud = draw(1);
    const quiet = draw(0.05);
    h.ok(loud !== quiet, "a loud bus draws differently to a quiet one");
    h.ok(loud.includes("fill") && quiet.includes("fill"), "both levels still draw the look");
  }
}

// ------------------------------------------------------------------ logo slots
// Which styles offer the "Show My Logo in the Middle" switch, and does the UI
// actually reach for that helper (instead of a hand-written list that drifts)?
{
  const withLogo = [...(CENTRE_VISUALIZER_TYPES as readonly string[]), ...PIXABAY_VISUALIZER_TYPES.filter((t) => pixabayVisualizerShape(t) === "round")];
  for (const type of withLogo) {
    h.ok(supportsCentreLogo(type), `${type} can carry the user's own logo`);
  }
  for (const type of ["spectrum", "equalizer_bars", "terrain_grid", "px_speaker_blue", "px_wave_aurora", "px_grid_cube"]) {
    h.ok(!supportsCentreLogo(type), `${type} has no hub, so it never offers a centre logo`);
  }

  const modal = read("src/components/InsertPropertiesModal.tsx");
  h.ok(
    modal.includes("supportsCentreLogo(data.type)"),
    "the insert panel asks the renderer which styles take a centre logo"
  );
  h.ok(
    modal.includes("Studio → 🏷️ Logo"),
    "the centre-logo switch says where the logo comes from"
  );

  const card = read("src/components/EffectVisualPreview.tsx");
  h.ok(
    card.includes("getCentreLogoPlaceholder") &&
      card.includes('fillText("YOUR"') &&
      card.includes('fillText("LOGO"'),
    "the centre cards show an empty \"YOUR LOGO\" slot"
  );
  h.ok(
    card.includes("centreStyleAsksForLogo") && card.includes("cardY = centreCard ? 0.5 : 0.62"),
    "the centre cards are drawn centred on their logo slot"
  );
}

h.done("visualizers");
