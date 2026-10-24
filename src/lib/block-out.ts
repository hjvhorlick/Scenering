import type { RedactionMethod, TimelineInsert } from "../types";

export type { RedactionMethod };

/**
 * BLOCK OUT — privacy redaction for a finished frame.
 *
 * A block is a rectangle that is painted over the video *after* the scene,
 * its captions and the other overlays, so whatever is underneath it cannot
 * reach the exported file. Three methods are offered because different
 * material needs different answers:
 *
 *   blur      — the picture continues behind the block, just unreadable.
 *   pixelate  — the censored-news mosaic; identical strength, blocky edges.
 *   solid     — an opaque colour (black bar, brand colour, any hex).
 *
 * Two rules shape every number in this file:
 *
 * 1. PRIVACY IS NOT COSMETIC. The block never fades in or out, and if the
 *    sample needed for blur/pixelate cannot be taken for any reason the
 *    rectangle is filled solid black instead. A gap in a redaction is worse
 *    than an ugly one.
 *
 * 2. THE PREVIEW AND THE RENDER ARE THE SAME PICTURE. The rectangle lives in
 *    frame-normalised units (0..1), so the 720p preview, a 1080p export and a
 *    4K export all place the block in exactly the same spot, and the blur is
 *    scaled from the frame, not from a fixed pixel count.
 */

export interface RedactionRect {
  /** left edge, 0..1 of the frame width */
  x: number;
  /** top edge, 0..1 of the frame height */
  y: number;
  /** width, 0..1 of the frame width */
  w: number;
  /** height, 0..1 of the frame height */
  h: number;
}

/** The eight grips a block can be resized from: corners and edge midpoints. */
export type RedactionHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const REDACTION_HANDLES: readonly RedactionHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

export const REDACTION_METHODS: readonly {
  id: RedactionMethod;
  name: string;
  icon: string;
  hint: string;
}[] = [
  { id: "blur", name: "Blur", icon: "🌫️", hint: "Softens the picture until words cannot be read" },
  { id: "pixelate", name: "Pixelate", icon: "🔳", hint: "Mosaic blocks, like a censored news clip" },
  { id: "solid", name: "Solid colour", icon: "🎨", hint: "Covers the area completely — any colour you like" },
];

/** A sensible first block: a wide bar across the middle of the frame. */
export const DEFAULT_REDACTION_RECT: RedactionRect = { x: 0.3, y: 0.42, w: 0.4, h: 0.16 };

/** A block may never be shrunk to nothing — a 1px block hides nothing. */
export const MIN_REDACTION_WIDTH = 0.02;
export const MIN_REDACTION_HEIGHT = 0.02;

export const MIN_REDACTION_STRENGTH = 0.1;
export const MAX_REDACTION_STRENGTH = 1.6;
export const DEFAULT_REDACTION_STRENGTH = 0.6;
export const DEFAULT_REDACTION_COLOR = "#000000";
/** Corner rounding is a fraction of the block's short side, so it scales. */
export const MAX_REDACTION_RADIUS = 0.5;

export function isRedactionMethod(value: unknown): value is RedactionMethod {
  return value === "blur" || value === "pixelate" || value === "solid";
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** Four decimals is sub-pixel at 4K and keeps saved projects tidy. */
const round = (value: number) => Math.round(value * 10000) / 10000;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Clamp a rectangle to the frame and enforce the minimum grabbable size. */
export function clampRedactionRect(
  rect: Partial<RedactionRect> | null | undefined,
  minW: number = MIN_REDACTION_WIDTH,
  minH: number = MIN_REDACTION_HEIGHT
): RedactionRect {
  const source = rect || {};
  const w = clamp(source.w ?? DEFAULT_REDACTION_RECT.w, minW, 1);
  const h = clamp(source.h ?? DEFAULT_REDACTION_RECT.h, minH, 1);
  return {
    x: round(clamp(source.x ?? DEFAULT_REDACTION_RECT.x, 0, 1 - w)),
    y: round(clamp(source.y ?? DEFAULT_REDACTION_RECT.y, 0, 1 - h)),
    w: round(w),
    h: round(h),
  };
}

/**
 * A block with no stored rectangle is placed at the insert's own point, sized
 * from its `size` — so a block dropped from an older project (or a future
 * import) still lands somewhere sensible instead of in the corner.
 */
export function deriveRedactionRect(insert: TimelineInsert): RedactionRect {
  const size = clamp(insert.size ?? 1, 0.2, 4);
  const w = clamp(DEFAULT_REDACTION_RECT.w * size, MIN_REDACTION_WIDTH, 1);
  const h = clamp(DEFAULT_REDACTION_RECT.h * size, MIN_REDACTION_HEIGHT, 1);
  return clampRedactionRect({
    x: (insert.position?.x ?? 0.5) - w / 2,
    y: (insert.position?.y ?? 0.5) - h / 2,
    w,
    h,
  });
}

export interface ResolvedRedaction {
  method: RedactionMethod;
  color: string;
  strength: number;
  /** 0..0.5 of the block's short side */
  radius: number;
  rect: RedactionRect;
}

/** Everything the painter and the preview need, with every value in range. */
export function resolveRedaction(insert: TimelineInsert): ResolvedRedaction {
  const options = insert.visualOptions || {};
  return {
    method: isRedactionMethod(options.redactionMethod) ? options.redactionMethod : "blur",
    color: isHexColor(options.redactionColor) ? options.redactionColor : DEFAULT_REDACTION_COLOR,
    strength: clamp(options.redactionStrength ?? DEFAULT_REDACTION_STRENGTH, MIN_REDACTION_STRENGTH, MAX_REDACTION_STRENGTH),
    radius: clamp(options.redactionRadius ?? 0, 0, MAX_REDACTION_RADIUS),
    rect: options.redactionRect
      ? clampRedactionRect(options.redactionRect)
      : deriveRedactionRect(insert),
  };
}

export interface RedactionFrame {
  /** left edge in canvas pixels */
  x: number;
  /** top edge in canvas pixels */
  y: number;
  /** width in canvas pixels */
  w: number;
  /** height in canvas pixels */
  h: number;
  /** corner radius in canvas pixels */
  radius: number;
  method: RedactionMethod;
  color: string;
  strength: number;
  rect: RedactionRect;
}

/** The rectangle in canvas pixels, measured exactly as it will be painted. */
export function getRedactionFrame(insert: TimelineInsert, canvasW: number, canvasH: number): RedactionFrame {
  const resolved = resolveRedaction(insert);
  const width = Math.max(0, canvasW);
  const height = Math.max(0, canvasH);
  const w = resolved.rect.w * width;
  const h = resolved.rect.h * height;
  return {
    x: resolved.rect.x * width,
    y: resolved.rect.y * height,
    w,
    h,
    radius: Math.min(w, h) * resolved.radius,
    method: resolved.method,
    color: resolved.color,
    strength: resolved.strength,
    rect: resolved.rect,
  };
}

/** Slide the block, keeping all of it inside the frame. */
export function moveRedactionRect(rect: RedactionRect, dx: number, dy: number): RedactionRect {
  return clampRedactionRect({ x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h }, rect.w, rect.h);
}

/**
 * Drag one grip. The opposite edge stays exactly where it was, which is what
 * makes "pull from any side" feel predictable: the block grows towards the
 * pointer instead of jumping around its centre.
 */
export function resizeRedactionRect(
  rect: RedactionRect,
  handle: RedactionHandle,
  dx: number,
  dy: number,
  minW: number = MIN_REDACTION_WIDTH,
  minH: number = MIN_REDACTION_HEIGHT
): RedactionRect {
  let { x, y, w, h } = rect;
  const right = x + w;
  const bottom = y + h;

  if (handle.includes("w")) {
    const nextX = clamp(x + dx, 0, right - minW);
    x = nextX;
    w = right - nextX;
  } else if (handle.includes("e")) {
    w = clamp(w + dx, minW, 1 - x);
  }

  if (handle.includes("n")) {
    const nextY = clamp(y + dy, 0, bottom - minH);
    y = nextY;
    h = bottom - nextY;
  } else if (handle.includes("s")) {
    h = clamp(h + dy, minH, 1 - y);
  }

  // Re-clamping x/y keeps a block dragged from an edge fully on screen.
  return clampRedactionRect({ x, y, w, h }, minW, minH);
}

export interface RedactionHandlePoint {
  x: number;
  y: number;
  cursor: string;
}

/** The eight grip positions, in canvas pixels, with the cursor each one wants. */
export function getRedactionHandlePoints(frame: RedactionFrame): Record<RedactionHandle, RedactionHandlePoint> {
  const { x, y, w, h } = frame;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return {
    nw: { x, y, cursor: "nwse-resize" },
    n: { x: cx, y, cursor: "ns-resize" },
    ne: { x: x + w, y, cursor: "nesw-resize" },
    e: { x: x + w, y: cy, cursor: "ew-resize" },
    se: { x: x + w, y: y + h, cursor: "nwse-resize" },
    s: { x: cx, y: y + h, cursor: "ns-resize" },
    sw: { x, y: y + h, cursor: "nesw-resize" },
    w: { x, y: cy, cursor: "ew-resize" },
  };
}

/** Which grip, if any, the pointer is on (canvas pixels). */
export function hitTestRedactionHandle(
  frame: RedactionFrame,
  px: number,
  py: number,
  tolerancePx = 14
): RedactionHandle | null {
  const points = getRedactionHandlePoints(frame);
  let best: RedactionHandle | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const handle of REDACTION_HANDLES) {
    const point = points[handle];
    const distance = Math.hypot(px - point.x, py - point.y);
    if (distance <= tolerancePx && distance < bestDistance) {
      best = handle;
      bestDistance = distance;
    }
  }
  return best;
}

/** Is the pointer inside the block itself? (canvas pixels) */
export function pointInRedactionFrame(frame: RedactionFrame, px: number, py: number): boolean {
  return px >= frame.x && px <= frame.x + frame.w && py >= frame.y && py <= frame.y + frame.h;
}

/* ------------------------------------------------------------------ */
/* Painting                                                            */
/* ------------------------------------------------------------------ */

/**
 * The sampler works on an ordinary 2D canvas. In the browser that is a
 * <canvas> element; inside a worker it is an OffscreenCanvas, which satisfies
 * the same drawing calls.
 */
type AnyCanvas = HTMLCanvasElement;
type AnyContext = CanvasRenderingContext2D;

/** Scratch surfaces for the sample-and-repaint pass, resized only when needed. */
const scratch: { a: AnyCanvas | null; b: AnyCanvas | null } = { a: null, b: null };

/**
 * How the sampler allocates its scratch surfaces. In the app this is a plain
 * <canvas> (or an OffscreenCanvas in a worker); the hook exists for the same
 * reason render-effects.ts has one — so the redaction can be exercised where
 * there is no DOM, and so a host that renders offscreen can supply its own.
 */
let scratchFactory: ((width: number, height: number) => AnyCanvas | null) | null = null;

export function setRedactionScratchFactory(
  factory: ((width: number, height: number) => AnyCanvas | null) | null
): void {
  scratchFactory = factory;
  scratch.a = null;
  scratch.b = null;
}

function createCanvas(width: number, height: number): AnyCanvas | null {
  if (scratchFactory) return scratchFactory(width, height);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height) as unknown as AnyCanvas;
  }
  return null;
}

function fitCanvas(canvas: AnyCanvas | null, width: number, height: number): AnyCanvas | null {
  if (!canvas) return null;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return canvas;
}

function getScratch(slot: "a" | "b", width: number, height: number): AnyCanvas | null {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (!scratch[slot]) scratch[slot] = createCanvas(w, h);
  return fitCanvas(scratch[slot], w, h);
}

let canvasFilterSupported: boolean | null = null;

/**
 * `ctx.filter` is the cleanest way to soften a repainted sample, but it is not
 * in every browser that can run the app. The sampler below is a blur on its
 * own (it repaints from a fraction of the pixels), so the filter is a bonus —
 * never a requirement.
 */
function supportsCanvasFilter(ctx: AnyContext): boolean {
  if (canvasFilterSupported !== null) return canvasFilterSupported;
  try {
    const before = ctx.filter;
    ctx.filter = "blur(2px)";
    canvasFilterSupported = ctx.filter === "blur(2px)";
    ctx.filter = before;
  } catch {
    canvasFilterSupported = false;
  }
  return canvasFilterSupported;
}

function roundedPath(ctx: AnyContext, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  if (radius <= 0.01) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * How many pixels one surviving detail sample covers.
 *
 * Measured against the block's own height: a block over one line of text must
 * destroy that line, while a block over the whole frame should not be handed a
 * blur radius bigger than the frame. Floored against the frame size so a tiny
 * block on a 4K export still hides what a tiny block on the 720p preview hides.
 */
function redactionCell(blockH: number, frameW: number, frameH: number, strength: number): number {
  const floor = Math.max(3, Math.min(frameW, frameH) / 200);
  // At the default 0.6 a block about one line tall is cut into roughly six
  // rows: a legible mosaic rather than a soft smudge, and nothing of the
  // original letters survives. Pushed to 1.6 the same block becomes three
  // chunky rows; pulled down to 0.1 it is a light haze over whatever is
  // already large and public.
  const wanted = blockH * (0.09 + strength * 0.14);
  return clamp(wanted, floor, Math.max(floor, blockH / 3));
}

/**
 * Repaint the block from a heavily reduced copy of itself. This is the whole
 * redaction for both blur and pixelate; the only difference is whether the
 * upscaled cells are smoothed (blur) or left hard (pixelate).
 */
function paintSampledBlock(
  ctx: AnyContext,
  frame: RedactionFrame,
  x: number,
  y: number,
  blockW: number,
  blockH: number,
  canvasW: number,
  canvasH: number
): boolean {
  const source = (ctx.canvas as unknown as AnyCanvas | null) ?? null;
  if (!source || !(canvasW > 0) || !(canvasH > 0)) return false;

  const cell = redactionCell(blockH, canvasW, canvasH, frame.strength);
  // A blur needs a little of the world outside its own edge, or it smears the
  // frame's transparent boundary into the block and lightens it at the edges.
  const pad = frame.method === "blur" ? Math.ceil(cell * 1.5) : 0;
  const sx = Math.max(0, Math.floor(x - pad));
  const sy = Math.max(0, Math.floor(y - pad));
  const ex = Math.min(canvasW, Math.ceil(x + blockW + pad));
  const ey = Math.min(canvasH, Math.ceil(y + blockH + pad));
  const sampleW = ex - sx;
  const sampleH = ey - sy;
  if (sampleW <= 0 || sampleH <= 0) return false;

  const smallW = Math.max(2, Math.round(sampleW / cell));
  const smallH = Math.max(2, Math.round(sampleH / cell));
  const stageA = getScratch("a", smallW, smallH);
  const actx = stageA ? (stageA.getContext("2d") as AnyContext | null) : null;
  if (!stageA || !actx) return false;

  actx.setTransform(1, 0, 0, 1, 0, 0);
  actx.clearRect(0, 0, stageA.width, stageA.height);
  actx.imageSmoothingEnabled = true;
  actx.imageSmoothingQuality = "high";
  actx.drawImage(source, sx, sy, sampleW, sampleH, 0, 0, stageA.width, stageA.height);

  // Blur gets one more halving, which turns the reduced copy into a smooth
  // gradient instead of a grid of soft squares.
  let paintSource: AnyCanvas = stageA;
  if (frame.method === "blur") {
    const stageB = getScratch("b", Math.max(2, Math.round(stageA.width / 2)), Math.max(2, Math.round(stageA.height / 2)));
    const bctx = stageB ? (stageB.getContext("2d") as AnyContext | null) : null;
    if (stageB && bctx) {
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, stageB.width, stageB.height);
      bctx.imageSmoothingEnabled = true;
      bctx.imageSmoothingQuality = "high";
      bctx.drawImage(stageA, 0, 0, stageA.width, stageA.height, 0, 0, stageB.width, stageB.height);
      paintSource = stageB;
    }
  }

  ctx.save();
  const withFilter = frame.method === "blur" && supportsCanvasFilter(ctx);
  if (withFilter) ctx.filter = `blur(${Math.max(1, cell * 0.4).toFixed(2)}px)`;
  ctx.imageSmoothingEnabled = frame.method === "blur";
  ctx.imageSmoothingQuality = "high";
  // Painted back where it was sampled from, so the block is a distorted copy of
  // exactly the pixels it covers — never an unrelated patch of the frame.
  ctx.drawImage(paintSource, 0, 0, paintSource.width, paintSource.height, sx, sy, sampleW, sampleH);
  ctx.restore();
  return true;
}

/**
 * Paint the block onto a frame. Returns true when something was drawn.
 *
 * The caller is expected to have clipped nothing; this function clips itself
 * to the (rounded) rectangle, so blur samples never spill outside it.
 */
export function paintRedaction(
  ctx: CanvasRenderingContext2D,
  insert: TimelineInsert,
  canvasW: number,
  canvasH: number
): boolean {
  if (!ctx || !(canvasW > 0) || !(canvasH > 0)) return false;
  const frame = getRedactionFrame(insert, canvasW, canvasH);
  const x = Math.round(frame.x);
  const y = Math.round(frame.y);
  const blockW = Math.max(1, Math.round(frame.w));
  const blockH = Math.max(1, Math.round(frame.h));

  ctx.save();
  roundedPath(ctx, x, y, blockW, blockH, frame.radius);
  ctx.clip();

  let painted = false;
  if (frame.method === "solid") {
    ctx.fillStyle = frame.color;
    ctx.fillRect(x, y, blockW, blockH);
    painted = true;
  } else {
    try {
      painted = paintSampledBlock(ctx, frame, x, y, blockW, blockH, canvasW, canvasH);
    } catch {
      painted = false;
    }
  }

  if (!painted) {
    // A redaction that failed to sample must still hide the frame. Black is
    // the one answer that cannot be mistaken for the video showing through.
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, blockW, blockH);
  }

  ctx.restore();
  return true;
}

/** Short label used on the timeline and in lists. */
export function redactionLabel(method: RedactionMethod, color?: string): string {
  if (method === "solid") return `Block Out · ${(color || DEFAULT_REDACTION_COLOR).toUpperCase()}`;
  return `Block Out · ${method === "blur" ? "Blur" : "Pixelate"}`;
}

/** Quick shapes offered in the studio, in frame-normalised units. */
export const REDACTION_SHAPES: readonly {
  id: "bar" | "box" | "wide" | "tall";
  name: string;
  icon: string;
  rect: RedactionRect;
}[] = [
  { id: "bar", name: "Text bar", icon: "▬", rect: { x: 0.26, y: 0.44, w: 0.48, h: 0.12 } },
  { id: "wide", name: "Full-width strip", icon: "═", rect: { x: 0.04, y: 0.44, w: 0.92, h: 0.13 } },
  { id: "box", name: "Box", icon: "▣", rect: { x: 0.33, y: 0.36, w: 0.34, h: 0.28 } },
  { id: "tall", name: "Tall panel", icon: "▮", rect: { x: 0.36, y: 0.14, w: 0.28, h: 0.72 } },
];

export function shapeRect(id: string): RedactionRect {
  const shape = REDACTION_SHAPES.find((entry) => entry.id === id);
  return clampRedactionRect(shape ? { ...shape.rect } : { ...DEFAULT_REDACTION_RECT });
}
