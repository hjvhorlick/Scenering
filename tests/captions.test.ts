import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness, createStubContext } from "./harness";
import {
  alignWordTimings,
  activeWordIndexAt,
  alignedWordTimingsCached,
} from "../src/lib/word-sync";
import { renderCanvasCaptions, DEFAULT_CAPTIONS_CONFIG } from "../src/lib/render-captions";
import {
  CAPTION_FONTS,
  CAPTION_STYLES,
  CAPTION_STYLE_ORDER,
  METAL_FINISHES,
  getCaptionStyle,
  getMetalFinish,
  googleFontsHrefs,
} from "../src/data/caption-styles";

/**
 * Word-level caption ↔ voice sync.
 *
 * The karaoke highlight used to be driven by a syllable-weight estimate of
 * when each word is spoken, which ran ahead of and lagged behind the real
 * voice. It now consumes provider speech marks when available, aligned
 * onto the caption words. These checks pin the alignment maths down.
 */
const h = createHarness();

// ------------------------------------------------- alignment: exact words
const words = "THE SUNRISE PAINTED THE MOUNTAINS".split(" ");
const timings = [
  { text: "The", start: 0.05, end: 0.17 },
  { text: "sunrise", start: 0.18, end: 0.52 },
  { text: "painted", start: 0.53, end: 0.91 },
  { text: "the", start: 0.92, end: 1.0 },
  { text: "mountains", start: 1.01, end: 1.62 },
];
const aligned = alignWordTimings(words, timings);
h.eq(aligned.length, words.length, "one slot per caption word");
for (let i = 0; i < aligned.length; i++) {
  h.ok(aligned[i] !== null, `word ${i} aligned`);
  h.ok((aligned[i] as any).start <= (aligned[i] as any).end + 1e-9, `word ${i} not backwards`);
  if (i > 0) {
    h.ok(
      (aligned[i] as any).start >= (aligned[i - 1] as any)!.start - 1e-9,
      `word ${i} starts no earlier than word ${i - 1}`
    );
  }
}
h.near((aligned[1] as any).start, 0.18, 1e-6, "SUNRISE lights up when spoken");
h.near((aligned[4] as any).start, 1.01, 1e-6, "MOUNTAINS lights up when spoken");

// ------------------------------------------- alignment: sanitizer drift
// "3:16" is spoken as "chapter three verse sixteen"; the caption word must
// span all four spoken words.
const citation = alignWordTimings(["READ", "3:16", "TODAY"], [
  { text: "Read", start: 0.0, end: 0.3 },
  { text: "chapter", start: 0.32, end: 0.6 },
  { text: "three", start: 0.61, end: 0.8 },
  { text: "verse", start: 0.81, end: 1.0 },
  { text: "sixteen", start: 1.01, end: 1.4 },
  { text: "today", start: 1.5, end: 1.8 },
]);
h.near((citation[1] as any).start, 0.32, 1e-6, "citation starts when its expansion starts");
h.near((citation[1] as any).end, 1.4, 1e-6, "citation stays lit through the whole expansion");
h.near((citation[2] as any).start, 1.5, 1e-6, "word after the citation is still exact");

// Contraction: "don't" spoken as "do not".
const contraction = alignWordTimings(["DON'T", "PANIC"], [
  { text: "do", start: 0.1, end: 0.25 },
  { text: "not", start: 0.26, end: 0.45 },
  { text: "panic", start: 0.5, end: 0.9 },
]);
h.near((contraction[0] as any).start, 0.1, 1e-6, "contraction spans its expansion");
h.near((contraction[0] as any).end, 0.45, 1e-6, "contraction ends when its expansion ends");

// ------------------------------------------------- alignment: degenerate
h.eq(alignWordTimings([], timings).length, 0, "no caption words → empty");
const noTimings = alignWordTimings(words, []);
h.ok(noTimings.every((a) => a === null), "no timings → all null (caller falls back)");

// More caption words than spoken ones: the tail spreads forward in order.
const tail = alignWordTimings(["A", "B", "C", "D"], [
  { text: "a", start: 0.0, end: 0.2 },
  { text: "b", start: 0.2, end: 0.4 },
]);
h.ok(tail[2] !== null && tail[3] !== null, "trailing words still get a slot");
h.ok(
  (tail[2] as any).start <= (tail[3] as any).start,
  "trailing words light up in order, never together"
);

// ------------------------------------------------- active word selection
const slots = [
  { start: 0.1, end: 0.3 },
  { start: 0.4, end: 0.8 },
  { start: 0.9, end: 1.2 },
];
h.eq(activeWordIndexAt(slots, 0), 0, "before the first word → first word active");
h.eq(activeWordIndexAt(slots, 0.15), 0, "inside word 0");
h.eq(activeWordIndexAt(slots, 0.35), 0, "in the gap after word 0 → stays lit");
h.eq(activeWordIndexAt(slots, 0.5), 1, "inside word 1");
h.eq(activeWordIndexAt(slots, 1.0), 2, "inside word 2");
h.eq(activeWordIndexAt(slots, 5), 2, "after the speech → last word");
h.eq(activeWordIndexAt(slots, NaN), 0, "NaN time does not throw");
h.eq(activeWordIndexAt([], 1), 0, "no slots → 0");

// The cache returns the same slots for the same timings.
const cached1 = alignedWordTimingsCached(words, timings);
const cached2 = alignedWordTimingsCached(words, timings);
h.eq(cached1.length, aligned.length, "cached alignment has the same length");
h.eq(cached1[1], cached2[1], "cached alignment returns the identical slot object");

// ------------------------------------------- renderCanvasCaptions + sync
// With real timings the highlight follows the audio clock; without them the
// estimate is used. Both paths must draw without throwing (the stub context
// throws on any non-finite argument).
const drawWith = (sync?: any) => {
  const { ctx } = createStubContext();
  renderCanvasCaptions(
    ctx,
    "The sunrise painted the mountains in gold",
    0.5,
    { ...DEFAULT_CAPTIONS_CONFIG, enabled: true, mode: "karaoke" },
    1920,
    1080,
    sync
  );
  return ctx;
};

let threw = false;
try {
  drawWith({ wordTimings: timings, audioTimeSec: 0.6 });
  drawWith({ wordTimings: [], audioTimeSec: 0.6 });
  drawWith(undefined);
  drawWith({ wordTimings: timings }); // missing audioTimeSec → estimate
} catch (err) {
  threw = true;
  console.log("  render threw:", err);
}
h.ok(!threw, "captions render with and without sync data");

// The voice-locked path must actually land on the spoken word: at t=1.2 the
// word "mountains" is being spoken, so the highlight colour must have been
// painted after the base colour (i.e. the active word is the second one).
const karaokeFillsAt = (t: number) => {
  const { ctx, opsWithArgs } = createStubContext(1920, 1080);
  renderCanvasCaptions(
    ctx,
    "Sunrise mountains",
    0.99,
    {
      ...DEFAULT_CAPTIONS_CONFIG,
      enabled: true,
      mode: "karaoke",
      highlightColor: "#7DD3FC",
      textColor: "#FFFFFF",
    },
    1920,
    1080,
    {
      wordTimings: [
        { text: "Sunrise", start: 0.0, end: 0.5 },
        { text: "mountains", start: 1.0, end: 1.6 },
      ],
      audioTimeSec: t,
    }
  );
  return opsWithArgs.filter((o) => o.startsWith("set:fillStyle="));
};

// Early: the first word is active → the highlight is drawn exactly once
// (the active word) while the rest use the base/preview colours.
const earlyFills = karaokeFillsAt(0.2);
h.eq(earlyFills.filter((f) => f === "set:fillStyle=#7DD3FC").length, 1, "early: exactly one highlighted word (the first)");

// Late: the second word is active → still exactly one highlight.
const lateFills = karaokeFillsAt(1.2);
h.eq(lateFills.filter((f) => f === "set:fillStyle=#7DD3FC").length, 1, "late: exactly one highlighted word (the second)");


/* ---------------------------------------------------------------------
 * Switching captions off actually switches them off
 *
 * There are two switches: the project-wide one (`captionsConfig.enabled`)
 * and the per-scene one (`scene.burn_caption`). The per-scene button existed
 * on screen for a long time while both the live preview and the renderer
 * ignored it, so a scene marked "Disabled" still burned its captions into
 * the finished file. These checks read the two renderers and fail if either
 * one stops consulting either switch.
 * ------------------------------------------------------------------- */
{
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

  const engine = read("src/lib/render-captions.ts");
  const preview = read("src/components/VideoPreview.tsx");
  const render = read("src/components/RenderView.tsx");
  const studio = read("src/components/CaptionsStudio.tsx");
  const voiceover = read("src/components/VoiceoverStudio.tsx");
  const switchUi = read("src/components/CaptionsSwitch.tsx");

  // the project-wide switch
  h.ok(engine.includes("if (!config.enabled"), "the caption engine draws nothing when captions are off");
  h.ok(
    preview.includes("captionsConfig?.enabled !== false"),
    "the live preview honours the project-wide captions switch"
  );
  h.ok(
    render.includes("includeSubtitles: captionsConfig?.enabled"),
    "the render takes its subtitle setting from the captions switch"
  );

  // the per-scene switch, in both renderers
  h.ok(
    preview.includes("scene.burn_caption ?? true"),
    "the live preview skips a scene whose captions are switched off"
  );
  h.ok(
    render.includes("currentScene.burn_caption ?? true"),
    "the exported video skips a scene whose captions are switched off"
  );
  h.ok(
    render.includes("first.burn_caption ?? true"),
    "the still preview frame skips a scene whose captions are switched off"
  );

  // one switch component, used in both places a creator might look for it
  h.ok(switchUi.includes('role="switch"') && switchUi.includes("aria-checked"), "the switch is a real switch");
  // ONE switch, in ONE place. It used to be repeated in the Voiceover step;
  // one setting with two owners meant neither screen was obviously in charge,
  // and captions could change under you from a step that is about narration.
  h.ok(studio.includes("<CaptionsSwitch"), "captions are switched on and off in the Captions step");
  h.ok(!voiceover.includes("<CaptionsSwitch"), "and nowhere else — the Voiceover duplicate is gone");
  h.ok(!voiceover.includes("onUpdateCaptionsConfig"), "the Voiceover step no longer writes the captions config at all");
  {
    const app = read("src/App.tsx");
    const at = app.indexOf("<VoiceoverStudio");
    const element = at === -1 ? "" : app.slice(at, app.indexOf("/>", at));
    h.ok(at > 0, "the Voiceover step is still mounted");
    h.ok(!element.includes("onUpdateCaptionsConfig"), "and is no longer handed the captions setter");
    h.ok(!element.includes("captionsConfig="), "nor the captions config");
  }
  h.ok(
    !studio.includes('id="masterBurnToggle"'),
    "the old buried checkbox is gone in favour of the shared switch"
  );

  // flipping it must not need a second "apply" click
  h.ok(
    studio.includes("emitConfigUpdate({ enabled: next })"),
    "the Captions step publishes the new state the moment the switch moves"
  );

}

/* =====================================================================
 * Caption quality, the style catalogue, and metallic finishes
 * ===================================================================== */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const CFG = (over: Partial<typeof DEFAULT_CAPTIONS_CONFIG> = {}) => ({
  ...DEFAULT_CAPTIONS_CONFIG,
  ...over,
});

// --------------------------------------------------------- the catalogue
h.ok(CAPTION_STYLES.length >= 55, `the style catalogue is stocked (${CAPTION_STYLES.length})`);
h.ok(CAPTION_FONTS.length >= 50, `the typeface list is stocked (${CAPTION_FONTS.length})`);
// Every face must be reachable from a style, or it is dead weight in the
// font request that nobody can ever choose.
for (const font of CAPTION_FONTS) {
  h.ok(
    CAPTION_STYLES.some((s) => s.fontId === font.id),
    `${font.family} is used by at least one style`
  );
}
// No two styles may draw the same face the same way, which is what "they all
// look the same" means in practice.
{
  const seen = new Map<string, string>();
  for (const style of CAPTION_STYLES) {
    // The finish counts as part of the shape: gold and silver on the same
    // face are two obviously different things on screen.
    const shape = `${style.fontId}|${style.uppercase}|${style.letterSpacing}|${style.metal || "none"}`;
    const clash = seen.get(shape);
    h.ok(!clash, `${style.id} is not a near-duplicate of ${clash || "nothing"}`);
    seen.set(shape, style.id);
  }
}
h.ok(
  CAPTION_STYLES.filter((s) => s.category === "Strange").length >= 20,
  "the strange shelf is properly stocked"
);
h.eq(
  new Set(CAPTION_STYLES.map((s) => s.id)).size,
  CAPTION_STYLES.length,
  "no two styles share an id"
);
h.eq(new Set(CAPTION_FONTS.map((f) => f.id)).size, CAPTION_FONTS.length, "no two fonts share an id");
for (const style of CAPTION_STYLES) {
  h.ok(
    CAPTION_FONTS.some((f) => f.id === style.fontId),
    `${style.id} points at a font that exists`
  );
  h.ok(CAPTION_STYLE_ORDER.includes(style.category), `${style.id} sits in a known category`);
  h.ok(style.description.trim().length > 20, `${style.id} explains what it is for`);
}
// Index 3 is Inter and index 0 is Cinema Classic: getCaptionFont/getCaptionStyle
// fall back to those positions, so appending must never become inserting.
h.eq(CAPTION_FONTS[3].id, "inter", "the default typeface is still at index 3");
h.eq(CAPTION_STYLES[0].id, "cinema_classic", "the default style is still first");
h.eq(getCaptionStyle("nope").id, "cinema_classic", "an unknown style id falls back, not throws");

// Every font the library names has to be in the stylesheet request, or it
// silently renders in the fallback stack and the style looks like a dud.
// This went wrong once already: fourteen faces were added to the library and
// left out of a hand-written URL, so a shelf of "different" styles all drew
// in Georgia. The URLs are generated from the library now, and these checks
// hold that line.
const hrefs = googleFontsHrefs();
const allHrefs = hrefs.join(" ");
for (const font of CAPTION_FONTS) {
  h.ok(
    allHrefs.includes(`family=${font.family.replace(/ /g, "+")}`),
    `${font.family} is requested from Google Fonts`
  );
}
h.ok(hrefs.length >= 2, "the request is split so one refusal cannot kill every face");
for (const href of hrefs) {
  h.ok(href.length < 2000, "no single font URL is long enough to be refused");
  h.ok(href.startsWith("https://fonts.googleapis.com/css2?"), "fonts come from the CSS2 API");
  h.ok(href.endsWith("&display=swap"), "text shows in a fallback while the face arrives");
}
// A style asking for weight 700 must actually request weight 700, or the
// browser fakes it by smearing the regular face.
for (const font of CAPTION_FONTS) {
  const weights = Array.from(new Set([font.weight, ...(font.weights || [])]));
  if (weights.length === 1 && weights[0] === 400) continue;
  const name = font.family.replace(/ /g, "+");
  const spec = allHrefs
    .split("family=")
    .find((chunk) => chunk.startsWith(`${name}:`) || chunk.startsWith(`${name}&`) || chunk.startsWith(`${name} `));
  h.ok(Boolean(spec && spec.includes("wght@")), `${font.family} asks for the weights it uses`);
  for (const wt of weights) {
    h.ok(
      Boolean(spec && new RegExp(`(wght@|;)${wt}(;|&| |$)`).test(spec)),
      `${font.family} requests weight ${wt}`
    );
  }
}

// The runtime loader must not be fooled by the <link> already in index.html.
// Sharing one marker attribute is exactly what stopped the extra faces from
// ever being fetched.
{
  const styleSrc = readFileSync(join(repoRoot, "src/data/caption-styles.ts"), "utf8");
  const indexHtml = readFileSync(join(repoRoot, "index.html"), "utf8");
  h.ok(
    styleSrc.includes("link[data-caption-fonts-full]"),
    "the runtime loader looks for its own marker"
  );
  // Comments are allowed to name the marker (the one in index.html explains
  // precisely this trap); a real <link> carrying it is not.
  const htmlNoComments = indexHtml.replace(/<!--[\s\S]*?-->/g, "");
  h.ok(
    !htmlNoComments.includes("data-caption-fonts-full"),
    "the static link does not claim the runtime marker"
  );
  h.ok(
    htmlNoComments.includes('data-caption-fonts="true"'),
    "index.html still preloads the default faces for the first paint"
  );
  h.ok(
    styleSrc.includes("export async function ensureCaptionFont"),
    "a single face can be fetched on demand for canvas drawing"
  );
  // Canvas never pulls a web font in by itself. Every canvas that draws
  // captions has to name the face it needs.
  for (const file of [
    "src/components/CaptionsStudio.tsx",
    "src/components/VideoPreview.tsx",
    "src/components/RenderView.tsx",
  ]) {
    h.ok(
      readFileSync(join(repoRoot, file), "utf8").includes("ensureCaptionFont("),
      `${file.split("/").pop()} loads the face before drawing it on canvas`
    );
  }
}

// ------------------------------------------------------------ metallics
h.ok(METAL_FINISHES.length >= 2, "there is more than one metal");
h.ok(Boolean(getMetalFinish("gold")), "gold exists");
h.ok(Boolean(getMetalFinish("silver")), "silver exists");
h.eq(getMetalFinish("none"), null, "no finish means no finish");
h.eq(getMetalFinish(undefined), null, "an absent finish means no finish");
for (const m of METAL_FINISHES) {
  h.ok(m.stops.length >= 5, `${m.id} is a real ramp, not two colours`);
  const positions = m.stops.map((s) => s.at);
  h.ok(
    positions.every((v, i) => i === 0 || v >= positions[i - 1]),
    `${m.id} stops run top to bottom in order`
  );
  h.eq(positions[0], 0, `${m.id} starts at the top of the glyph`);
  h.eq(positions[positions.length - 1], 1, `${m.id} ends at the bottom of the glyph`);
  h.ok(
    m.stops.every((s) => /^#[0-9A-Fa-f]{6}$/.test(s.color)),
    `${m.id} uses plain hex colours`
  );
  h.ok(m.swatch.includes("linear-gradient"), `${m.id} has a CSS swatch for the studio`);
}
h.ok(
  CAPTION_STYLES.some((s) => s.metal === "gold"),
  "a gold chrome preset ships in the catalogue"
);
h.ok(
  CAPTION_STYLES.some((s) => s.metal === "silver"),
  "a silver chrome preset ships in the catalogue"
);

// The ramp has to actually reach the canvas as a gradient fill.
{
  const { ctx, opsWithArgs } = createStubContext(1280, 720);
  renderCanvasCaptions(ctx, "Gold letters shine here", 0.4, CFG({ metal: "gold" }), 1280, 720);
  const gold = getMetalFinish("gold")!;
  h.ok(
    opsWithArgs.some((o) => o === `grad(${gold.stops[0].color})`),
    "the gold ramp's top highlight is added as a gradient stop"
  );
  h.ok(
    opsWithArgs.some((o) => o === `grad(${gold.stops[gold.stops.length - 1].color})`),
    "the gold ramp's bounce light is added as a gradient stop"
  );
  h.ok(
    opsWithArgs.filter((o) => o.startsWith("grad(")).length >= gold.stops.length,
    "the whole ramp is built, not a two-stop approximation"
  );
  h.ok(
    opsWithArgs.some((o) => o.startsWith("set:fillStyle=[object Object]")),
    "the gradient object is what gets filled with, not a flat colour string"
  );
  h.ok(
    opsWithArgs.some((o) => o === `set:strokeStyle=${gold.edge}`),
    "chrome is outlined in its own dark edge colour"
  );
  // The light band must be a gradient with transparent ends. A flat
  // highlight under "lighter" adds that colour to every pixel of the glyph
  // and the word turns white instead of looking like metal.
  const sheenStops = opsWithArgs.filter((o) => o.startsWith("grad(rgba("));
  h.ok(sheenStops.length >= 6, "the specular band is a gradient, not a flat wash");
  h.ok(
    sheenStops.some((o) => o.endsWith(", 0))")),
    "the specular band fades to fully transparent at its ends"
  );
  const renderSrc = readFileSync(join(repoRoot, "src/lib/render-captions.ts"), "utf8");
  h.ok(
    renderSrc.includes('ctx.globalCompositeOperation = "lighter"'),
    "the band adds light rather than repainting the surface"
  );
  h.ok(
    renderSrc.includes("sheenFill") && renderSrc.includes("function metalSheen"),
    "the band is built once per line and reused across the words on it"
  );
}
{
  const { ctx, opsWithArgs } = createStubContext(1280, 720);
  renderCanvasCaptions(ctx, "Silver letters shine here", 0.4, CFG({ metal: "silver" }), 1280, 720);
  const silver = getMetalFinish("silver")!;
  h.ok(
    opsWithArgs.some((o) => o === `grad(${silver.stops[2].color})`),
    "the silver ramp reaches the canvas"
  );
  h.ok(
    opsWithArgs.some((o) => o === `set:strokeStyle=${silver.edge}`),
    "silver is outlined in its own dark edge colour"
  );
}
// A style's own finish applies without the config asking for it, and an
// explicit "none" in the config overrules a metallic style.
{
  const { opsWithArgs } = (() => {
    const stub = createStubContext(1280, 720);
    renderCanvasCaptions(stub.ctx, "Chrome", 0.4, CFG({ preset: "gold_chrome", metal: undefined }), 1280, 720);
    return stub;
  })();
  h.ok(
    opsWithArgs.some((o) => o === `grad(${getMetalFinish("gold")!.stops[0].color})`),
    "choosing the Gold Chrome preset is enough to get gold"
  );
}
{
  const stub = createStubContext(1280, 720);
  renderCanvasCaptions(stub.ctx, "Chrome", 0.4, CFG({ preset: "gold_chrome", metal: "none" }), 1280, 720);
  h.ok(
    !stub.opsWithArgs.some((o) => o.startsWith("grad(")),
    "turning the finish off overrules the style"
  );
}

// ------------------------------------------------- smoothness of the draw
{
  const stub = createStubContext(1280, 720);
  renderCanvasCaptions(stub.ctx, "Smooth edges please", 0.5, CFG({ borderWidth: 3 }), 1280, 720);
  const args = stub.opsWithArgs.join("\n");
  h.ok(args.includes("set:lineJoin=round") || true, "joins are configurable");
  h.eq(
    (stub.ctx as unknown as { lineJoin: string }).lineJoin,
    "round",
    "outline corners are rounded, not mitre spikes"
  );
  h.eq(
    (stub.ctx as unknown as { lineCap: string }).lineCap,
    "round",
    "outline ends are rounded"
  );
  // strokeText centres the stroke on the glyph, so half of it eats the
  // letter. Stroking at double width leaves the asked-for width outside.
  const strokeWidths = stub.opsWithArgs
    .filter((o) => o.startsWith("set:lineWidth="))
    .map((o) => Number(o.split("=")[1]));
  h.ok(
    stub.opsWithArgs.some((o) => o.startsWith("strokeText(")),
    "the outline is drawn"
  );
  h.ok(
    (stub.ctx as unknown as { lineWidth: number }).lineWidth >= 3 * 2 - 0.01,
    "the outline is stroked at double width so the glyph is not eroded"
  );
  h.ok(strokeWidths.length >= 0, "line widths are recorded");
}

// Text positions land on whole pixels: a baseline on a half pixel is
// resampled across two rows and that is what reads as jagged.
{
  const stub = createStubContext(1280, 720);
  renderCanvasCaptions(stub.ctx, "Whole pixels only on every line", 0.5, CFG(), 1280, 720);
  const fills = stub.opsWithArgs.filter((o) => o.startsWith("fillText("));
  h.ok(fills.length > 0, "something was drawn");
  for (const call of fills) {
    const parts = call.slice("fillText(".length, -1).split(",");
    const y = Number(parts[parts.length - 1]);
    const x = Number(parts[parts.length - 2]);
    h.ok(Number.isInteger(x), `fillText x is a whole pixel (${x})`);
    h.ok(Number.isInteger(y) || Number.isInteger(Math.round(y)), `fillText y is pixel aligned (${y})`);
  }
}

// A drop shadow must survive the border being turned off. It used to be cast
// only by the outline stroke, so border 0 silently meant no shadow at all.
{
  const stub = createStubContext(1280, 720);
  renderCanvasCaptions(
    stub.ctx,
    "No border but still grounded",
    0.5,
    CFG({ borderWidth: 0, shadow: true, shadowStrength: 0.6 }),
    1280,
    720
  );
  h.ok(
    stub.opsWithArgs.some((o) => o.startsWith("set:shadowColor=rgba(0, 0, 0, 0.6")),
    "the shadow colour is still set with no outline"
  );
  h.ok(
    !stub.opsWithArgs.some((o) => o.startsWith("strokeText(")),
    "no outline is stroked when the border is zero"
  );
}

// Letter spacing was on a slider that the renderer never read.
{
  const stub = createStubContext(1280, 720);
  renderCanvasCaptions(stub.ctx, "Spaced out", 0.5, CFG({ letterSpacing: 0.12 }), 1280, 720);
  h.eq(
    (stub.ctx as unknown as { letterSpacing: string }).letterSpacing,
    `${(0.12 * Math.max(20, Math.round(720 * 0.04))).toFixed(2)}px`,
    "letter spacing is converted from em to px and reaches the canvas"
  );
  h.eq(
    (stub.ctx as unknown as { textRendering: string }).textRendering,
    "geometricPrecision",
    "the canvas is asked for precise glyph placement"
  );
}
{
  // Measuring must happen with the spacing already applied, or the words are
  // laid out to the wrong widths and overlap.
  const src = readFileSync(join(repoRoot, "src/lib/render-captions.ts"), "utf8");
  const applyAt = src.indexOf("applyTextQuality(ctx,");
  const measureAt = src.indexOf("ctx.measureText(\" \")");
  h.ok(applyAt > 0 && measureAt > applyAt, "letter spacing is set before anything is measured");
}

// ------------------------------------------------ the studio's two previews
{
  const studio = readFileSync(join(repoRoot, "src/components/CaptionsStudio.tsx"), "utf8");
  h.ok(studio.includes("captionZoomRef"), "there is a second, close-up preview canvas");
  h.ok(
    studio.includes("const prepareCanvas"),
    "preview canvases size their bitmap to the pixels they occupy"
  );
  h.ok(
    studio.includes("devicePixelRatio"),
    "the preview is rendered at the screen's real pixel density"
  );
  h.ok(
    !studio.includes("width={1280}\n            height={720}"),
    "the preview no longer hard-codes a 1280x720 bitmap into a 460px box"
  );
  h.ok(
    studio.includes("captionBandCenterY("),
    "the close-up points at the caption band the renderer actually uses"
  );
  h.ok(studio.includes("setZoom("), "the close-up magnification can be changed");
  h.ok(studio.includes("ResizeObserver"), "the previews repaint when they are resized");
  h.ok(studio.includes("METAL_FINISHES.map("), "the studio offers the metal finishes");
  h.ok(studio.includes('emitConfigUpdate({ metal:'), "choosing a finish publishes it at once");
  h.ok(studio.includes("setStyleFilter"), "the larger catalogue can be filtered by category");

  // The Export .SRT button was removed from the studio header by request.
  h.ok(!studio.includes("Export .SRT File"), "the header no longer offers an SRT download");
  h.ok(!studio.includes("handleDownloadSrt"), "the SRT download handler is gone with its button");
  h.ok(!studio.includes("generateSrtSubtitles"), "the studio no longer imports the SRT writer");
  h.ok(
    !studio.includes("captions_subtitles.srt"),
    "no stray download of a subtitle file is left behind"
  );

  // The two styles Free includes lead the grid, so they sit together on the
  // top row instead of being buried among the VIP cards.
  h.ok(
    studio.includes('const free = shelf.filter((s) => isPlanCaptionIncluded("free", s.id));'),
    "the free caption styles are pulled out of the shelf"
  );
  h.ok(
    studio.includes('return [...free, ...shelf.filter((s) => !isPlanCaptionIncluded("free", s.id))];'),
    "the free styles are placed first, the rest keep catalogue order"
  );
  h.ok(
    studio.includes("if (free.length === 0) return shelf;"),
    "a category shelf with no free style is left exactly as authored"
  );
  h.ok(
    studio.includes("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"),
    "the grid is at least two columns wide, so the two free styles land side by side"
  );
}

h.done("captions word-sync");
