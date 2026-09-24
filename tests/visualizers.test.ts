/**
 * Audio-visualiser suite.
 *
 * Covers the 20 visualisers in the catalogue — the 13 originals plus the seven
 * full-frame "immersive scenes" (terrain, starfield, glow pills, particle swarm,
 * lava lamp, jellyfish, ring of fire) — and the option plumbing behind them:
 * colour themes, band count, reactivity, full-width geometry and the body/foot
 * print maths that hit-testing and dragging depend on.
 *
 * The stub context throws on any non-finite argument, so "it drew" is a real
 * assertion about the maths even without a rasteriser.
 */
import { createHarness, createStubContext } from "./harness";
import { CATALOG_ITEMS } from "../src/lib/video-studio-catalog";
import {
  CENTRE_VISUALIZER_TYPES,
  IMMERSIVE_VISUALIZER_TYPES,
  wantsCentreLogo,
  isImmersiveVisualizer,
  isLinearVisualizer,
  isRoundVisualizer,
  isVisualizerFullWidth,
  visualizerBodyHeight,
  getVisualizerFootprint,
  renderAudioVisualizer,
} from "../src/lib/render-visualizers";
import { VISUALIZER_PALETTES, resolveVisualizerPalette } from "../src/lib/visualizer-palettes";
import type { TimelineInsert } from "../src/types";

const h = createHarness();

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
h.ok(VISUALISERS.length === 22, `expected 22 visualisers, got ${VISUALISERS.length}`);

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

    // the footprint stays on the frame at every size
    for (const size of [0.45, 1, 1.6]) {
      const footprint = getVisualizerFootprint(makeInsert(v.type, { size }), 1920, 1080);
      h.finite(footprint.w, `${v.type} footprint width at ${size}x`);
      h.ok(footprint.w <= 1920 * 1.02, `${v.type} footprint stays on the frame at ${size}x`);
      h.ok(footprint.w > 150, `${v.type} keeps a usable grab area at ${size}x`);
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

h.done("visualizers");
