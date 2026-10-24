import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import {
  DEFAULT_REDACTION_RECT,
  MAX_REDACTION_RADIUS,
  MAX_REDACTION_STRENGTH,
  MIN_REDACTION_HEIGHT,
  MIN_REDACTION_WIDTH,
  MIN_REDACTION_STRENGTH,
  REDACTION_HANDLES,
  REDACTION_METHODS,
  clampRedactionRect,
  getRedactionFrame,
  getRedactionHandlePoints,
  hitTestRedactionHandle,
  isHexColor,
  isRedactionMethod,
  moveRedactionRect,
  paintRedaction,
  pointInRedactionFrame,
  redactionLabel,
  resizeRedactionRect,
  resolveRedaction,
  setRedactionScratchFactory,
  shapeRect,
  type RedactionHandle,
  type RedactionRect,
} from "../src/lib/block-out";
import { CATALOG_ITEMS, STUDIO_CATEGORIES, VIDEO_STUDIO_CATEGORIES } from "../src/lib/video-studio-catalog";
import { createCatalogInsert } from "../src/lib/catalog-insert";
import { getInsertBounds } from "../src/lib/render-effects";
import { isPlanCatalogItemIncluded, PLAN_ORDER } from "../src/config/plans";
import type { TimelineInsert } from "../src/types";

/**
 * BLOCK OUT — privacy redaction.
 *
 * These checks cover the three promises the feature makes:
 *
 *   1. the rectangle is a real, clamped rectangle that can be pulled from any
 *      of its eight grips and that lands in the same place at every resolution;
 *   2. it is painted by the same function the export uses, and it paints
 *      *something* opaque even when sampling fails;
 *   3. it reaches the artist from the studio, the properties panel and the
 *      preview without a plan gate, because hiding your own private details is
 *      not a paid creative flourish.
 */

const h = createHarness();

const blockInsert = (over: Partial<TimelineInsert> = {}): TimelineInsert => ({
  id: "b1",
  category: "block_out",
  type: "block_blur",
  title: "Block Out · Blur",
  startTime: 2,
  duration: 8,
  position: { x: 0.5, y: 0.5 },
  size: 1,
  opacity: 1,
  visualOptions: { redactionMethod: "blur", redactionRect: { ...DEFAULT_REDACTION_RECT } },
  ...over,
});

/* ------------------------------------------------------------------ */
/* 1. Geometry                                                         */
/* ------------------------------------------------------------------ */

h.ok(isRedactionMethod("blur") && isRedactionMethod("pixelate") && isRedactionMethod("solid"), "the three methods are recognised");
h.ok(!isRedactionMethod("sparkle") && !isRedactionMethod(null), "anything else is not a method");
h.ok(isHexColor("#000000") && isHexColor("#FFaa33"), "hex colours are accepted");
h.ok(!isHexColor("red") && !isHexColor("#fff") && !isHexColor(""), "loose colour strings are rejected");
h.eq(REDACTION_METHODS.length, 3, "three methods are offered");
h.eq(REDACTION_HANDLES.length, 8, "a block can be pulled from eight places");

const clampCases: { rect: RedactionRect; label: string }[] = [
  { rect: { x: -0.4, y: -3, w: 0.3, h: 0.2 }, label: "left/top off the frame" },
  { rect: { x: 0.95, y: 0.95, w: 0.4, h: 0.4 }, label: "right/bottom off the frame" },
  { rect: { x: 0.2, y: 0.2, w: 4, h: 4 }, label: "bigger than the frame" },
];
for (const entry of clampCases) {
  const clamped = clampRedactionRect(entry.rect);
  h.ok(clamped.x >= 0 && clamped.y >= 0, `${entry.label} keeps the block on screen (x/y)`);
  h.ok(clamped.x + clamped.w <= 1.0001 && clamped.y + clamped.h <= 1.0001, `${entry.label} keeps the block inside the frame (x+w/y+h)`);
  h.ok(clamped.w >= MIN_REDACTION_WIDTH && clamped.h >= MIN_REDACTION_HEIGHT, `${entry.label} keeps a grabbable size`);
}
const nanRect = clampRedactionRect({ x: NaN, y: NaN, w: NaN, h: NaN });
h.ok(Number.isFinite(nanRect.x) && Number.isFinite(nanRect.w), "NaN in a saved project cannot break the rectangle");
h.eq(clampRedactionRect(null).w, DEFAULT_REDACTION_RECT.w, "a missing rectangle falls back to the default bar");

/* --- resizing from every grip ------------------------------------- */
const base: RedactionRect = { x: 0.3, y: 0.4, w: 0.4, h: 0.2 };
const baseRight = base.x + base.w; // 0.7
const baseBottom = base.y + base.h; // 0.6

const expectations: Record<RedactionHandle, (r: RedactionRect) => boolean> = {
  nw: (r) => r.x < base.x && r.y < base.y && Math.abs(r.x + r.w - baseRight) < 1e-9 && Math.abs(r.y + r.h - baseBottom) < 1e-9,
  n: (r) => Math.abs(r.x - base.x) < 1e-9 && Math.abs(r.w - base.w) < 1e-9 && r.y < base.y && Math.abs(r.y + r.h - baseBottom) < 1e-9,
  ne: (r) => r.y < base.y && r.w > base.w && Math.abs(r.x - base.x) < 1e-9 && Math.abs(r.y + r.h - baseBottom) < 1e-9,
  e: (r) => Math.abs(r.x - base.x) < 1e-9 && Math.abs(r.y - base.y) < 1e-9 && r.w > base.w && Math.abs(r.h - base.h) < 1e-9,
  se: (r) => Math.abs(r.x - base.x) < 1e-9 && Math.abs(r.y - base.y) < 1e-9 && r.w > base.w && r.h > base.h,
  s: (r) => Math.abs(r.x - base.x) < 1e-9 && Math.abs(r.w - base.w) < 1e-9 && Math.abs(r.y - base.y) < 1e-9 && r.h > base.h,
  sw: (r) => r.x < base.x && Math.abs(r.y - base.y) < 1e-9 && Math.abs(r.x + r.w - baseRight) < 1e-9 && r.h > base.h,
  w: (r) => r.x < base.x && Math.abs(r.y - base.y) < 1e-9 && Math.abs(r.x + r.w - baseRight) < 1e-9 && Math.abs(r.h - base.h) < 1e-9,
};

/** Pulling the left/top edges outwards means dragging towards the frame edge. */
const growDelta = (handle: RedactionHandle) => ({
  dx: handle.includes("w") ? -0.08 : 0.08,
  dy: handle.includes("n") ? -0.06 : 0.06,
});
const shrinkDelta = (handle: RedactionHandle) => ({
  dx: handle.includes("w") ? 0.05 : -0.05,
  dy: handle.includes("n") ? 0.04 : -0.04,
});

for (const handle of REDACTION_HANDLES) {
  const grow = growDelta(handle);
  const grown = resizeRedactionRect(base, handle, grow.dx, grow.dy);
  h.ok(expectations[handle](grown), `${handle}: only that side moves, the opposite one stays put`);
  const shrink = shrinkDelta(handle);
  const shrunk = resizeRedactionRect(base, handle, shrink.dx, shrink.dy);
  h.ok(shrunk.w >= MIN_REDACTION_WIDTH && shrunk.h >= MIN_REDACTION_HEIGHT, `${handle}: shrinking stops at a grabbable size`);
  h.ok(shrunk.w <= base.w + 1e-9 && shrunk.h <= base.h + 1e-9, `${handle}: shrinking never grows the block`);
}

// A hard drag past the opposite edge flips nothing and keeps the minimum.
for (const handle of REDACTION_HANDLES) {
  const flipped = resizeRedactionRect(base, handle, 1.2, 1.2);
  h.ok(flipped.w > 0 && flipped.h > 0, `${handle}: a drag past the far edge cannot invert the block`);
  h.ok(flipped.x >= -1e-9 && flipped.y >= -1e-9 && flipped.x + flipped.w <= 1.0001 && flipped.y + flipped.h <= 1.0001,
    `${handle}: a hard drag leaves the block on screen`);
}

// Moving keeps the size perfectly and stops at the frame edge.
const moved = moveRedactionRect(base, 0.1, -0.1);
h.near(moved.x, 0.4, 1e-9, "moving right shifts the block");
h.near(moved.y, 0.3, 1e-9, "moving up shifts the block");
h.near(moved.w, base.w, 1e-9, "moving never changes the width");
h.near(moved.h, base.h, 1e-9, "moving never changes the height");
const pinned = moveRedactionRect(base, 9, 9);
h.near(pinned.x, 1 - pinned.w, 1e-9, "the block cannot be pushed off the right edge");
h.near(pinned.y, 1 - pinned.h, 1e-9, "the block cannot be pushed off the bottom edge");

/* --- pixels at any resolution ------------------------------------- */
const at720 = getRedactionFrame(blockInsert(), 1280, 720);
const at1080 = getRedactionFrame(blockInsert(), 1920, 1080);
const at4k = getRedactionFrame(blockInsert(), 3840, 2160);
h.near(at720.x / 1280, at1080.x / 1920, 1e-9, "the block sits at the same place in 720p and 1080p");
h.near(at720.x / 1280, at4k.x / 3840, 1e-9, "the block sits at the same place in 720p and 4K");
h.near(at720.w / 1280, at4k.w / 3840, 1e-9, "the block covers the same fraction of the frame in 4K");
h.near(at720.x, DEFAULT_REDACTION_RECT.x * 1280, 1e-9, "the left edge is the stored fraction times the canvas width");

/* --- eight grips, hit-testable ------------------------------------ */
const points = getRedactionHandlePoints(at720);
h.eq(Object.keys(points).length, 8, "eight grips are placed");
h.near(points.nw.x, at720.x, 1e-9, "north-west grip sits on the left edge");
h.near(points.se.y, at720.y + at720.h, 1e-9, "south-east grip sits on the bottom edge");
h.near(points.n.x, at720.x + at720.w / 2, 1e-9, "north grip sits in the middle of the top edge");
h.near(points.w.y, at720.y + at720.h / 2, 1e-9, "west grip sits in the middle of the left edge");
h.eq(points.nw.cursor, "nwse-resize", "corners carry a diagonal cursor");
h.eq(points.n.cursor, "ns-resize", "top edge carries a vertical cursor");
h.eq(points.e.cursor, "ew-resize", "right edge carries a horizontal cursor");

for (const handle of REDACTION_HANDLES) {
  const p = points[handle];
  h.eq(hitTestRedactionHandle(at720, p.x, p.y, 18), handle, `${handle} grip can be grabbed at its own position`);
  h.eq(hitTestRedactionHandle(at720, p.x + 12, p.y + 12, 18), handle, `${handle} grip has a forgiving radius`);
}
h.eq(hitTestRedactionHandle(at720, at720.x + at720.w / 2 + 40, at720.y + at720.h / 2, 10), null, "empty space is not a grip");
h.ok(pointInRedactionFrame(at720, at720.x + 2, at720.y + 2), "a press inside the block counts");
h.ok(!pointInRedactionFrame(at720, at720.x - 20, at720.y - 20), "a press outside does not");

/* --- bad values never reach the canvas ---------------------------- */
const messy = resolveRedaction(
  blockInsert({
    visualOptions: {
      redactionMethod: "confetti" as unknown as "blur",
      redactionColor: "not-a-colour",
      redactionStrength: Number.NaN,
      redactionRadius: 99,
      redactionRect: { x: -1, y: -1, w: 5, h: -2 },
    },
  })
);
h.eq(messy.method, "blur", "an unknown method falls back to blur");
h.eq(messy.color, "#000000", "an invalid colour falls back to black");
h.finite(messy.strength, "a NaN strength becomes a number");
h.ok(messy.strength >= MIN_REDACTION_STRENGTH && messy.strength <= MAX_REDACTION_STRENGTH, "strength stays in range");
h.ok(messy.radius >= 0 && messy.radius <= MAX_REDACTION_RADIUS, "rounding stays in range");
h.ok(messy.rect.w > 0 && messy.rect.w <= 1, "a nonsense rectangle is repaired");

// A block saved before rectangles existed still lands somewhere sensible.
const legacy = resolveRedaction(blockInsert({ position: { x: 0.2, y: 0.8 }, visualOptions: undefined, size: 1 }));
h.ok(legacy.rect.x < 0.2 && legacy.rect.y < 0.8, "a block with no stored rectangle is placed at its own point");
h.ok(legacy.rect.x >= 0 && legacy.rect.y + legacy.rect.h <= 1.0001, "the derived rectangle is inside the frame");

// The rectangle is the geometry: `size` must not silently move a placed block.
const withSize = getRedactionFrame(blockInsert({ size: 2.4 }), 1280, 720);
h.near(withSize.x, at720.x, 1e-9, "changing size does not move a rectangle that has been placed");
h.near(withSize.w, at720.w, 1e-9, "changing size does not resize a rectangle that has been placed");

h.eq(redactionLabel("blur"), "Block Out · Blur", "the timeline label names the method");
h.eq(redactionLabel("solid", "#ff0000"), "Block Out · #FF0000", "a solid block's label names its colour");

/* ------------------------------------------------------------------ */
/* 2. Painting                                                         */
/* ------------------------------------------------------------------ */

/**
 * A recording stub of the drawing calls paintRedaction() makes. It has no
 * canvas, which is exactly the situation the black-fill fallback exists for.
 */
function recordingContext(withCanvas: boolean) {
  const fills: { style: string; x: number; y: number; w: number; h: number }[] = [];
  let fillStyle = "";
  const ctx = {
    fillStyle,
    canvas: withCanvas ? { width: 1280, height: 720 } : undefined,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    rect() {},
    clip() {},
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ style: ctx.fillStyle, x, y, w, h });
    },
  };
  Object.defineProperty(ctx, "fillStyle", {
    get: () => fillStyle,
    set: (value: string) => {
      fillStyle = value;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
}

const solidPainter = recordingContext(false);
h.ok(
  paintRedaction(solidPainter.ctx, blockInsert({ visualOptions: { redactionMethod: "solid", redactionColor: "#FF0000" } }), 1280, 720),
  "a solid block reports that it painted"
);
h.eq(solidPainter.fills.length, 1, "a solid block paints one rectangle");
h.eq(solidPainter.fills[0].style, "#FF0000", "a solid block uses exactly the chosen colour");
h.near(solidPainter.fills[0].x, at720.x, 1, "the solid block paints where the geometry says");
h.near(solidPainter.fills[0].w, at720.w, 1, "the solid block paints the width the geometry says");

const fallbackPainter = recordingContext(false);
h.ok(
  paintRedaction(fallbackPainter.ctx, blockInsert({ visualOptions: { redactionMethod: "blur" } }), 1280, 720),
  "a blur block reports that it painted"
);
h.ok(fallbackPainter.fills.length >= 1, "a blur block always paints something");
h.eq(fallbackPainter.fills[fallbackPainter.fills.length - 1].style, "#000000", "when the sample cannot be taken the block is filled black — never left transparent");

/* --- blur/pixelate repaint the block's own pixels ------------------ */
/**
 * The sampler must copy the region it covers, not some other part of the
 * frame. A stub scratch surface records the draw calls so that can be checked
 * without a browser.
 */
const sampleCalls: { op: string; args: unknown[] }[] = [];
const makeScratchCanvas = (width: number, height: number) => {
  const scratchCtx = {
    canvas: null as unknown,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
    filter: "none",
    setTransform() {},
    clearRect() {},
    drawImage(...args: unknown[]) {
      sampleCalls.push({ op: "scratch.drawImage", args });
    },
    getContext: () => scratchCtx,
  };
  const scratchCanvas = {
    width,
    height,
    getContext: () => scratchCtx,
  };
  scratchCtx.canvas = scratchCanvas;
  return scratchCanvas as unknown as HTMLCanvasElement;
};

setRedactionScratchFactory(makeScratchCanvas);
const samplerPainter = recordingContext(true);
// the main context also has to accept a drawImage back
const mainDraws: unknown[][] = [];
(samplerPainter.ctx as unknown as { drawImage: (...args: unknown[]) => void }).drawImage = (...args: unknown[]) => {
  mainDraws.push(args);
};
h.ok(
  paintRedaction(samplerPainter.ctx, blockInsert({ visualOptions: { redactionMethod: "blur" } }), 1280, 720),
  "a blur block paints when a scratch surface is available"
);
h.eq(samplerPainter.fills.length, 0, "a blur block never falls back to a solid fill while sampling works");
h.ok(sampleCalls.length >= 1, "the frame is sampled before the block is painted");
// drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
const sampleArgs = sampleCalls[0].args;
h.ok(sampleArgs[0] !== null, "the sample is taken from the frame itself");
h.ok(
  Number(sampleArgs[1]) <= at720.x && Number(sampleArgs[2]) <= at720.y,
  "the sample starts at or just before the block's own top-left corner"
);
h.ok(
  Math.abs(Number(sampleArgs[1]) - at720.x) <= Math.ceil(at720.h) &&
    Math.abs(Number(sampleArgs[2]) - at720.y) <= Math.ceil(at720.h),
  "the sample is the block's own region, padded by at most the blur radius"
);
h.eq(mainDraws.length, 1, "the sampled copy is painted back onto the frame");
h.eq(mainDraws[0].length, 9, "the copy is drawn back with source and destination rectangles");
h.eq(Number(mainDraws[0][5]), Number(sampleArgs[1]), "the copy is painted back where it was taken from (x)");
h.eq(Number(mainDraws[0][6]), Number(sampleArgs[2]), "the copy is painted back where it was taken from (y)");
h.eq(Number(mainDraws[0][8]), Number(sampleArgs[4]), "the copy covers the sampled height");

setRedactionScratchFactory(null);

const zeroPainter = recordingContext(false);
h.ok(!paintRedaction(zeroPainter.ctx, blockInsert(), 0, 0), "a zero-sized frame paints nothing rather than dividing by zero");
h.eq(zeroPainter.fills.length, 0, "a zero-sized frame leaves no stray fill");

/* ------------------------------------------------------------------ */
/* 3. Catalogue, plans and wiring                                      */
/* ------------------------------------------------------------------ */

const shelf = STUDIO_CATEGORIES.find((category) => category.id === "block_out");
h.ok(Boolean(shelf), "Block Out is a Video Studio section");
h.ok(Boolean(VIDEO_STUDIO_CATEGORIES.find((category) => category.id === "block_out")), "Block Out appears in the studio tab bar");
h.eq(shelf?.subcategories?.length, 3, "the section groups blur, pixelate and solid colour");

const items = CATALOG_ITEMS.block_out || [];
h.ok(items.length >= 3, "at least one starting point per method is offered");
const methods = new Set(items.map((item) => item.defaultVisualOptions?.redactionMethod));
h.ok(methods.has("blur"), "a blur preset is offered");
h.ok(methods.has("pixelate"), "a pixelate preset is offered");
h.ok(methods.has("solid"), "a solid-colour preset is offered");
for (const item of items) {
  h.eq(item.category, "block_out", `${item.type} is a block-out insert`);
  const rect = item.defaultVisualOptions?.redactionRect;
  h.ok(Boolean(rect), `${item.type} starts with a rectangle`);
  if (rect) {
    h.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= 1.0001 && rect.y + rect.h <= 1.0001, `${item.type} starts inside the frame`);
    h.ok(rect.w >= MIN_REDACTION_WIDTH && rect.h >= MIN_REDACTION_HEIGHT, `${item.type} starts big enough to grab`);
  }
  h.eq(item.defaultVisualOptions?.floatShadow, false, `${item.type} never asks for a floating shadow`);
  for (const plan of PLAN_ORDER) {
    h.eq(isPlanCatalogItemIncluded(plan, item.category, item.type), true, `${item.type} is available on ${plan} — privacy is not a paid feature`);
  }
}

const created = createCatalogInsert(items[0], { currentPlayheadTime: 12, totalDuration: 60 });
h.eq(created.category, "block_out", "a catalogue block becomes a block-out insert");
h.eq(created.startTime, 12, "the block is placed at the playhead");
h.eq(created.duration, items[0].defaultDuration, "the block gets the preset's length");
h.ok(Boolean(created.visualOptions?.redactionRect), "the insert keeps its rectangle");

/* --- the renderer paints it, and never fades it ------------------- */
const renderEffects = readFileSync("src/lib/render-effects.ts", "utf8");
h.ok(renderEffects.includes('case "block_out":'), "the render switch paints block-outs");
h.ok(renderEffects.includes("paintRedaction(ctx, insert, w, h)"), "the render calls the shared redaction painter");
h.ok(renderEffects.includes("const isRedaction = insert.category === \"block_out\";"), "the renderer knows a block is a redaction");
h.ok(
  /const isRedaction = insert\.category === "block_out";[\s\S]{0,400}?opacity = 1;[\s\S]{0,200}?else \{[\s\S]{0,200}?elapsed < 0\.25/.test(renderEffects),
  "a block is never faded in or out — the fade only runs for other inserts"
);
h.ok(!/FLOAT_SHADOW_CATEGORIES[\s\S]{0,600}?block_out/.test(renderEffects), "a block is not routed through the floating-shadow buffer");

const bounds = getInsertBounds(blockInsert(), 1280, 720);
h.near(bounds.x, at720.x, 1e-9, "hit-testing uses the block's own left edge");
h.near(bounds.y, at720.y, 1e-9, "hit-testing uses the block's own top edge");
h.near(bounds.w, at720.w, 1e-9, "hit-testing uses the block's own width");
h.near(bounds.h, at720.h, 1e-9, "hit-testing uses the block's own height");
h.near(bounds.cx, at720.x + at720.w / 2, 1e-9, "the block's centre is its rectangle's centre");

/* --- the preview moves and resizes it ----------------------------- */
const preview = readFileSync("src/components/VideoPreview.tsx", "utf8");
for (const helper of ["hitTestRedactionHandle", "resizeRedactionRect", "moveRedactionRect", "getRedactionHandlePoints", "pointInRedactionFrame"]) {
  h.ok(preview.includes(helper), `the preview uses ${helper}`);
}
h.ok(preview.includes('sel.category === "block_out"'), "the preview draws block-out selection chrome");
h.ok(preview.includes("drawRedactionSelectionChrome"), "the preview draws the eight grips");
h.ok(preview.includes("startRect"), "dragging starts from the block's stored rectangle");
h.ok(!/snapPosition\([\s\S]{0,120}?redactionRect/.test(preview), "a redaction is never snapped away from the words it hides");

/* --- the studio adds it, the properties panel edits it ------------ */
const studio = readFileSync("src/components/VideoStudio.tsx", "utf8");
h.ok(studio.includes('"block_out"'), "Video Studio mounts the Block Out tab");
h.ok(studio.includes("<BlockOutStudio"), "the Block Out panel is rendered");
h.ok(studio.includes("addBlockOut"), "the panel's add action is wired to the timeline");

const panel = readFileSync("src/components/BlockOutStudio.tsx", "utf8");
h.ok(panel.includes("paintRedaction"), "the studio sample is painted by the real renderer");
h.ok(panel.includes("REDACTION_METHODS"), "the studio offers every method");
h.ok(panel.includes('type="color"'), "the studio offers any colour, not just swatches");

const modal = readFileSync("src/components/InsertPropertiesModal.tsx", "utf8");
h.ok(modal.includes('id="ipm-blockout"'), "the properties editor has a Block Out section");
h.ok(modal.includes('"redactionRect"'), "the properties editor edits the same rectangle the preview drags");
h.ok(modal.includes('updateVisualOptions("redactionMethod"'), "the method can be changed after the block is placed");
h.ok(modal.includes('updateVisualOptions("redactionColor"'), "the colour can be changed after the block is placed");
h.ok(
  /show: !isSoundEffect && !isIntroOutro && !isCallToAction && !isBlockOut/.test(modal),
  "the generic scale/rotation panel is hidden for a block"
);

const timeline = readFileSync("src/components/Timeline.tsx", "utf8");
h.ok(timeline.includes('block_out: "🕶️"'), "a block has its own timeline icon");

/* --- shapes stay inside the frame --------------------------------- */
for (const shape of ["bar", "wide", "box", "tall"]) {
  const rect = shapeRect(shape);
  h.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= 1.0001 && rect.y + rect.h <= 1.0001, `the ${shape} shape fits inside the frame`);
}
h.ok(shapeRect("not-a-shape").w > 0, "an unknown shape falls back to a real rectangle");

h.done("block-out");
