/**
 * Scene image framing — the single source of truth for how a scene photo is
 * placed inside the video frame.
 *
 * Before this module each render path did its own arithmetic and the export
 * path multiplied the canvas width and height by the motion scale, which
 * stretched every photo to the canvas aspect ratio (squashed from the sides on
 * 16:9, squashed from the top on 9:16). Everything now goes through
 * `drawSceneImage`, which never distorts: the drawn width and height always
 * keep the source aspect ratio.
 *
 * Fit modes
 *  - "cover"      fill the frame, crop the overflow (default)
 *  - "contain"    show the whole photo, letterbox the remainder
 *  - "blur_fill"  show the whole photo, and fill the empty bars with a
 *                 blurred, zoomed copy of the same photo — the TikTok /
 *                 Reels / Shorts look. Works for the top-and-bottom bars of a
 *                 vertical video and for the side bars of a landscape one.
 */

import type { Scene, SceneMotionType } from "../types";

export type SceneFitMode = "cover" | "contain" | "blur_fill";

/** Fill style used behind a "contain" photo. */
export type SceneBackdropStyle = "blur" | "black" | "colour";

export interface SceneCropRect {
  /** normalised 0..1 source rectangle */
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DEFAULT_CROP: SceneCropRect = { x: 0, y: 0, w: 1, h: 1 };

export const FIT_MODES: { id: SceneFitMode; name: string; icon: string; blurb: string }[] = [
  {
    id: "cover",
    name: "Fill Frame",
    icon: "⬛",
    blurb: "Fills the whole frame and crops the overflow. Nothing is stretched.",
  },
  {
    id: "contain",
    name: "Show Full",
    icon: "🔲",
    blurb: "Shows the complete photo with plain bars where it does not reach.",
  },
  {
    id: "blur_fill",
    name: "Blurred Fill",
    icon: "🌫️",
    blurb: "Shows the complete photo and fills the bars with a blurred copy of it — the TikTok look.",
  },
];

export const BACKDROP_STYLES: { id: SceneBackdropStyle; name: string; icon: string }[] = [
  { id: "blur", name: "Blurred photo", icon: "🌫️" },
  { id: "black", name: "Solid black", icon: "⬛" },
  { id: "colour", name: "Chosen colour", icon: "🎨" },
];

/** Everything the framing engine needs, with every value resolved. */
export interface ResolvedFraming {
  fit: SceneFitMode;
  crop: SceneCropRect;
  offsetX: number; // -50..50 (% of frame)
  offsetY: number;
  zoom: number; // 1..4
  rotate: number; // degrees, -180..180
  flipH: boolean;
  flipV: boolean;
  backdrop: SceneBackdropStyle;
  backdropBlur: number; // px at a 1080-wide frame
  backdropZoom: number; // how far the blurred copy is pushed past the frame
  backdropDim: number; // 0..1, how much black is laid over the backdrop
  backdropColor: string;
}

export const DEFAULT_FRAMING: ResolvedFraming = {
  fit: "cover",
  crop: DEFAULT_CROP,
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
  rotate: 0,
  flipH: false,
  flipV: false,
  backdrop: "blur",
  backdropBlur: 42,
  backdropZoom: 1.25,
  backdropDim: 0.25,
  backdropColor: "#000000",
};

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Reads the framing off a scene, filling in every default and repairing any
 * legacy or out-of-range value so the renderers can never divide by zero.
 */
export function resolveFraming(scene: Partial<Scene> | null | undefined): ResolvedFraming {
  const s = (scene || {}) as Record<string, unknown>;
  const rawFit = s.image_fit as string | undefined;
  const fit: SceneFitMode =
    rawFit === "contain" || rawFit === "blur_fill" || rawFit === "cover" ? rawFit : "cover";

  const rawCrop = s.image_crop as Partial<SceneCropRect> | undefined;
  let crop = DEFAULT_CROP;
  if (rawCrop && typeof rawCrop === "object") {
    const w = clamp(Number(rawCrop.w ?? 1), 0.05, 1);
    const h = clamp(Number(rawCrop.h ?? 1), 0.05, 1);
    crop = {
      w,
      h,
      x: clamp(Number(rawCrop.x ?? 0), 0, 1 - w),
      y: clamp(Number(rawCrop.y ?? 0), 0, 1 - h),
    };
  }

  return {
    fit,
    crop,
    offsetX: clamp(Number(s.image_offset_x ?? 0), -50, 50),
    offsetY: clamp(Number(s.image_offset_y ?? 0), -50, 50),
    zoom: clamp(Number(s.image_zoom ?? 1), 0.25, 4),
    rotate: clamp(Number(s.image_rotate ?? 0), -180, 180),
    flipH: Boolean(s.image_flip_h),
    flipV: Boolean(s.image_flip_v),
    backdrop:
      s.image_backdrop === "black" || s.image_backdrop === "colour" || s.image_backdrop === "blur"
        ? (s.image_backdrop as SceneBackdropStyle)
        : "blur",
    backdropBlur: clamp(Number(s.image_backdrop_blur ?? 42), 0, 120),
    backdropZoom: clamp(Number(s.image_backdrop_zoom ?? 1.25), 1, 2.5),
    backdropDim: clamp(Number(s.image_backdrop_dim ?? 0.25), 0, 0.9),
    backdropColor:
      typeof s.image_backdrop_color === "string" ? (s.image_backdrop_color as string) : "#000000",
  };
}

export interface SourceSize {
  naturalWidth: number;
  naturalHeight: number;
}

/** The pixel rectangle of the source that will be sampled. */
export function sourceRect(
  img: SourceSize,
  crop: SceneCropRect
): { sx: number; sy: number; sw: number; sh: number } {
  const nw = Math.max(1, img.naturalWidth || 1);
  const nh = Math.max(1, img.naturalHeight || 1);
  return {
    sx: crop.x * nw,
    sy: crop.y * nh,
    sw: Math.max(1, crop.w * nw),
    sh: Math.max(1, crop.h * nh),
  };
}

export interface PlacedImage {
  /** source rectangle */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** destination rectangle — ALWAYS the source aspect ratio, never squashed */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * Works out where the photo goes. `mode` is the base fit used for the
 * foreground: "cover" grows the photo until it covers the frame, anything else
 * shrinks it until the whole photo is visible.
 *
 * The returned `dw / dh` is always exactly `sw / sh`, so no image can ever come
 * out stretched — that is the whole point of this function.
 */
export function placeImage(
  img: SourceSize,
  frameW: number,
  frameH: number,
  f: ResolvedFraming,
  opts: {
    mode?: "cover" | "contain";
    /** extra scale from the camera motion */
    motionScale?: number;
    motionDx?: number;
    motionDy?: number;
    /** ignore the user's pan/zoom (used for the blurred backdrop) */
    ignoreUserTransform?: boolean;
  } = {}
): PlacedImage {
  const mode = opts.mode || (f.fit === "cover" ? "cover" : "contain");
  const { sx, sy, sw, sh } = sourceRect(img, f.crop);

  // Rotating by a quarter turn swaps which dimension has to reach the frame.
  const quarter = Math.abs(((f.rotate % 180) + 180) % 180 - 90) < 45;
  const fitW = quarter ? frameH : frameW;
  const fitH = quarter ? frameW : frameH;

  const srcRatio = sw / sh;
  const fitRatio = fitW / fitH;

  let baseW: number;
  let baseH: number;
  if (mode === "cover" ? srcRatio > fitRatio : srcRatio < fitRatio) {
    baseH = fitH;
    baseW = fitH * srcRatio;
  } else {
    baseW = fitW;
    baseH = fitW / srcRatio;
  }

  const userZoom = opts.ignoreUserTransform ? 1 : f.zoom;
  const scale = userZoom * (opts.motionScale ?? 1);
  const dw = baseW * scale;
  const dh = baseH * scale;

  const panX = opts.ignoreUserTransform ? 0 : (f.offsetX / 100) * frameW;
  const panY = opts.ignoreUserTransform ? 0 : (f.offsetY / 100) * frameH;

  const cx = frameW / 2 + panX + (opts.motionDx ?? 0);
  const cy = frameH / 2 + panY + (opts.motionDy ?? 0);

  return { sx, sy, sw, sh, dx: cx - dw / 2, dy: cy - dh / 2, dw, dh };
}

/** True when the placed photo leaves any part of the frame uncovered. */
export function leavesGap(p: PlacedImage, frameW: number, frameH: number): boolean {
  return p.dx > 0.5 || p.dy > 0.5 || p.dx + p.dw < frameW - 0.5 || p.dy + p.dh < frameH - 0.5;
}

type Drawable = CanvasImageSource & SourceSize;

function drawPlaced(
  ctx: CanvasRenderingContext2D,
  img: Drawable,
  p: PlacedImage,
  f: ResolvedFraming
) {
  const needsTransform = f.rotate !== 0 || f.flipH || f.flipV;
  if (!needsTransform) {
    ctx.drawImage(img, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
    return;
  }
  const cx = p.dx + p.dw / 2;
  const cy = p.dy + p.dh / 2;
  ctx.save();
  ctx.translate(cx, cy);
  if (f.rotate) ctx.rotate((f.rotate * Math.PI) / 180);
  ctx.scale(f.flipH ? -1 : 1, f.flipV ? -1 : 1);
  ctx.drawImage(img, p.sx, p.sy, p.sw, p.sh, -p.dw / 2, -p.dh / 2, p.dw, p.dh);
  ctx.restore();
}

export interface DrawSceneImageOptions {
  /** extra scale/offset from the camera motion preset */
  motionScale?: number;
  motionDx?: number;
  motionDy?: number;
  /** CSS filter string for the project-wide colour grade */
  filter?: string | null;
  /** scratch canvas factory — lets the export path reuse one buffer */
  makeCanvas?: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas | null;
}

/**
 * Draws a scene photo into the frame. Never distorts the image.
 *
 * Draw order for "blur_fill": blurred backdrop copy → optional dim → the
 * complete photo on top. Both preview and export call this, so the blurred
 * bars appear in the rendered video exactly as they do on screen.
 */
export function drawSceneImage(
  ctx: CanvasRenderingContext2D,
  img: Drawable,
  scene: Partial<Scene> | null | undefined,
  frameW: number,
  frameH: number,
  opts: DrawSceneImageOptions = {}
): PlacedImage {
  const f = resolveFraming(scene);
  const grade = opts.filter && opts.filter !== "none" ? opts.filter : null;

  const fg = placeImage(img, frameW, frameH, f, {
    mode: f.fit === "cover" ? "cover" : "contain",
    motionScale: opts.motionScale,
    motionDx: opts.motionDx,
    motionDy: opts.motionDy,
  });

  const gap = leavesGap(fg, frameW, frameH);

  // ---------------------------------------------------------------- backdrop
  if (gap) {
    if (f.backdrop === "black" || f.fit === "contain") {
      ctx.save();
      ctx.fillStyle = f.backdrop === "colour" ? f.backdropColor : "#000000";
      ctx.fillRect(0, 0, frameW, frameH);
      ctx.restore();
    }

    if (f.fit === "blur_fill" && f.backdrop === "blur") {
      // A cover-placed copy of the same photo, pushed out past the frame so the
      // soft blurred edge never shows a transparent seam, then blurred.
      const bg = placeImage(img, frameW, frameH, f, {
        mode: "cover",
        motionScale: (opts.motionScale ?? 1) * f.backdropZoom,
        ignoreUserTransform: true,
      });
      // blur radius scales with the frame so 1080p and 4K look the same
      const radius = (f.backdropBlur * frameW) / 1080;
      const blurCss = radius > 0.5 ? `blur(${radius.toFixed(1)}px)` : "";
      ctx.save();
      try {
        ctx.filter = [grade, blurCss].filter(Boolean).join(" ") || "none";
      } catch {
        ctx.filter = "none";
      }
      // the backdrop is not rotated or flipped — it is only wallpaper
      ctx.drawImage(img, bg.sx, bg.sy, bg.sw, bg.sh, bg.dx, bg.dy, bg.dw, bg.dh);
      try {
        ctx.filter = "none";
      } catch {}
      if (f.backdropDim > 0.001) {
        ctx.fillStyle = `rgba(0,0,0,${f.backdropDim})`;
        ctx.fillRect(0, 0, frameW, frameH);
      }
      ctx.restore();
    } else if (f.fit === "blur_fill" || f.backdrop === "colour") {
      ctx.save();
      ctx.fillStyle = f.backdrop === "colour" ? f.backdropColor : "#000000";
      ctx.fillRect(0, 0, frameW, frameH);
      ctx.restore();
    }
  }

  // -------------------------------------------------------------- foreground
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (grade) {
    try {
      ctx.filter = grade;
    } catch {
      ctx.filter = "none";
    }
  }
  drawPlaced(ctx, img, fg, f);
  try {
    ctx.filter = "none";
  } catch {}
  ctx.restore();

  return fg;
}

/**
 * A sensible fit for a photo the user has just picked, given the frame shape.
 * A portrait photo in a landscape frame (or the reverse) would lose most of
 * itself to a crop, so those default to the blurred fill instead.
 */
export function suggestFit(
  img: SourceSize,
  frameW: number,
  frameH: number
): SceneFitMode {
  const ir = (img.naturalWidth || 1) / (img.naturalHeight || 1);
  const fr = frameW / Math.max(1, frameH);
  const mismatch = ir > fr ? ir / fr : fr / ir;
  return mismatch > 1.35 ? "blur_fill" : "cover";
}

/** Frame pixel size for an aspect-ratio id, used by the editor previews. */
export function frameSizeFor(ratio: string | undefined): { w: number; h: number } {
  switch (ratio) {
    case "9:16":
      return { w: 1080, h: 1920 };
    case "1:1":
      return { w: 1080, h: 1080 };
    case "4:3":
      return { w: 1440, h: 1080 };
    default:
      return { w: 1920, h: 1080 };
  }
}

/** Re-exported so callers only need one import. */
export type { SceneMotionType };

/**
 * Aspect-correct cover draw for any media element (intro/outro backgrounds,
 * uploaded clips, badge art). Fills the box, crops the overflow, never
 * stretches. Optionally fills the gap with a blurred copy the way scenes do.
 */
export function drawMediaCover(
  ctx: CanvasRenderingContext2D,
  el: CanvasImageSource,
  nw: number,
  nh: number,
  x: number,
  y: number,
  w: number,
  h: number,
  mode: "cover" | "contain" | "blur_fill" = "cover"
): void {
  if (!nw || !nh || !w || !h) return;
  const ir = nw / nh;
  const br = w / h;
  const fit = mode === "cover" ? ir > br : ir < br;
  let dw: number;
  let dh: number;
  if (fit) {
    dh = h;
    dw = h * ir;
  } else {
    dw = w;
    dh = w / ir;
  }

  if (mode === "blur_fill" && (dw < w - 0.5 || dh < h - 0.5)) {
    let bw: number;
    let bh: number;
    if (ir > br) {
      bw = h * ir;
      bh = h;
    } else {
      bw = w;
      bh = w / ir;
    }
    const push = 1.2;
    bw *= push;
    bh *= push;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    try {
      ctx.filter = `blur(${Math.max(8, (w / 1080) * 42).toFixed(1)}px)`;
    } catch {}
    ctx.drawImage(el, x + (w - bw) / 2, y + (h - bh) / 2, bw, bh);
    try {
      ctx.filter = "none";
    } catch {}
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}
