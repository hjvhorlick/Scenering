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

/** Fill style used behind a photo that does not reach the frame edge. */
export type SceneBackdropStyle = "transparent" | "blur" | "black" | "colour";

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
  { id: "transparent", name: "Transparent", icon: "◻️" },
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
  backdrop: "transparent",
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
      s.image_backdrop === "black" ||
      s.image_backdrop === "colour" ||
      s.image_backdrop === "blur" ||
      s.image_backdrop === "transparent"
        ? (s.image_backdrop as SceneBackdropStyle)
        : // "Blurred Fill" PROMISES blurred bars — a scene whose fit was
          // auto-suggested as blur_fill (photo picked, no backdrop stored)
          // must default to the blur backdrop, not transparent. Transparent
          // left the raw canvas showing through, which is why 9:16 videos
          // with landscape photos rendered black bars top and bottom.
          fit === "blur_fill"
        ? "blur"
        : "transparent",
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

/* ------------------------- per-scene render caches -----------------------
 *
 * The renderer records the canvas IN REAL TIME, so the smoothness of the
 * exported video is exactly the speed of each frame's paint. The two things
 * that used to be recomputed every frame are brutally expensive:
 *
 *   1. the colour grade — `ctx.filter = "saturate(…) contrast(…)"` on a
 *      full-frame drawImage runs on the CPU and can cost 10-40ms per frame;
 *   2. the blurred backdrop — re-blurring the whole frame (blur(40-75px))
 *      every frame costs tens to hundreds of ms. One such scene turned the
 *      Ken Burns glide into a slideshow and starved the audio encoder.
 *
 * Neither changes during a scene, so both are rendered ONCE into an
 * offscreen canvas and every frame becomes a cheap bitmap copy. Caches are
 * WeakMaps keyed by the image element — dropping the image drops its cache.
 *
 * Safety rails:
 *   - Node/test environments (no DOM) fall back to the direct path.
 *   - Only CORS-clean images (anonymous / data: / blob:) are cached; a
 *     tainted cache canvas would taint the recording canvas and kill the
 *     video capture outright.
 *   - Browsers without ctx.filter support fall back to the direct path,
 *     which is what they were drawing anyway.
 */

const gradeCaches = new WeakMap<object, Map<string, HTMLCanvasElement>>();
const backdropCaches = new WeakMap<object, Map<string, HTMLCanvasElement>>();
/** Per-image cap so a scene reused at several sizes cannot hoard memory. */
const CACHE_ENTRIES_PER_IMAGE = 4;
/** The blurred backdrop is built at a capped internal resolution — behind a
 *  40px+ blur, upscaling from ~1024px is visually identical and ~4× faster. */
const BACKDROP_CACHE_MAX_EDGE = 1024;

function canUseDomCanvas(): boolean {
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

function isCacheSafeImage(img: Drawable): img is HTMLImageElement {
  if (typeof HTMLImageElement === "undefined" || !(img instanceof HTMLImageElement)) return false;
  if (!img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return false;
  const src = img.src || "";
  return img.crossOrigin === "anonymous" || /^(data:|blob:)/i.test(src);
}

function cacheBucket(store: WeakMap<object, Map<string, HTMLCanvasElement>>, img: object) {
  let bucket = store.get(img);
  if (!bucket) {
    bucket = new Map();
    store.set(img, bucket);
  }
  return bucket;
}

function rememberInBucket(bucket: Map<string, HTMLCanvasElement>, key: string, canvas: HTMLCanvasElement) {
  if (bucket.size >= CACHE_ENTRIES_PER_IMAGE) {
    const oldest = bucket.keys().next().value;
    if (oldest !== undefined) bucket.delete(oldest);
  }
  bucket.set(key, canvas);
}

/** ctx.filter must really work for a cache built WITH a filter to be
 *  equivalent — Safari silently keeps "none", so it takes the direct path. */
function filterWorks(ctx: CanvasRenderingContext2D, filter: string): boolean {
  try {
    ctx.filter = filter;
    const applied = ctx.filter !== "none" && ctx.filter !== "";
    return applied;
  } catch {
    return false;
  }
}

/** The scene photo with the project's colour grade baked in — built once,
 *  so per-frame draws skip the CPU-bound ctx.filter path entirely. */
function gradedCopy(img: Drawable, grade: string): HTMLCanvasElement | null {
  if (!canUseDomCanvas() || !isCacheSafeImage(img)) return null;
  const bucket = cacheBucket(gradeCaches, img);
  const hit = bucket.get(grade);
  if (hit) return hit;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const cctx = canvas.getContext("2d");
    if (!cctx) return null;
    if (!filterWorks(cctx, grade)) return null;
    cctx.drawImage(img, 0, 0);
    cctx.filter = "none";
    rememberInBucket(bucket, grade, canvas);
    return canvas;
  } catch {
    return null;
  }
}

/** The complete blurred backdrop (cover copy → blur → grade → dim) rendered
 *  once per scene at a capped resolution. Per frame it is ONE drawImage. */
function blurredBackdrop(
  img: Drawable,
  frameW: number,
  frameH: number,
  f: ResolvedFraming,
  grade: string | null
): HTMLCanvasElement | null {
  if (!canUseDomCanvas() || !isCacheSafeImage(img)) return null;
  const scale = Math.min(1, BACKDROP_CACHE_MAX_EDGE / Math.max(frameW, frameH));
  const cw = Math.max(2, Math.round(frameW * scale));
  const ch = Math.max(2, Math.round(frameH * scale));
  const key = [
    cw, ch, f.backdropBlur, f.backdropZoom, f.backdropDim,
    f.crop.x, f.crop.y, f.crop.w, f.crop.h, grade || "",
  ].join("|");
  const bucket = cacheBucket(backdropCaches, img);
  const hit = bucket.get(key);
  if (hit) return hit;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const cctx = canvas.getContext("2d");
    if (!cctx) return null;
    const radius = (f.backdropBlur * cw) / 1080;
    const blurCss = radius > 0.5 ? `blur(${radius.toFixed(1)}px)` : "";
    const filter = [grade, blurCss].filter(Boolean).join(" ");
    if (filter && !filterWorks(cctx, filter)) return null;
    const bg = placeImage(img, cw, ch, f, {
      mode: "cover",
      motionScale: f.backdropZoom,
      ignoreUserTransform: true,
    });
    cctx.drawImage(img, bg.sx, bg.sy, bg.sw, bg.sh, bg.dx, bg.dy, bg.dw, bg.dh);
    cctx.filter = "none";
    if (f.backdropDim > 0.001) {
      cctx.fillStyle = `rgba(0,0,0,${f.backdropDim})`;
      cctx.fillRect(0, 0, cw, ch);
    }
    rememberInBucket(bucket, key, canvas);
    return canvas;
  } catch {
    return null;
  }
}

/**
 * Pre-builds every cache a scene needs BEFORE the recording starts, so the
 * first frame of a scene costs the same as its hundredth. This is also what
 * forces the browser to fully decode the photo — image decode used to
 * happen lazily on a scene's first draw, which is exactly the hitch that
 * made every effect "jump" at its start.
 */
export function prewarmSceneFrame(
  img: Drawable | null,
  scene: Partial<Scene> | null | undefined,
  frameW: number,
  frameH: number,
  grade?: string | null
): void {
  if (!img) return;
  const f = resolveFraming(scene);
  const g = grade && grade !== "none" ? grade : null;
  if (g) gradedCopy(img, g);
  if (f.fit !== "cover" && f.backdrop === "blur") {
    blurredBackdrop(img, frameW, frameH, f, g);
  }
}

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
  // What sits behind a photo that does not reach the frame edge is decided by
  // exactly one control: the chosen backdrop style. (The old code also let the
  // fit mode override it, so "Show Full" always went black whatever was picked.)
  //   transparent → paint nothing at all: the frame is left untouched, so an
  //                 underlying layer or the video's own background shows through
  //   blur        → a blurred, zoomed copy of the same photo
  //   black       → solid black
  //   colour      → the colour the user picked
  if (gap && f.backdrop !== "transparent") {
    if (f.backdrop === "blur") {
      // FAST PATH: the finished backdrop (blur + grade + dim) was rendered
      // once into a cache — one plain drawImage per frame instead of a
      // full-frame CPU blur. This is what keeps a real-time recording at
      // its frame rate; the per-frame blur made renders drop frames.
      const cached = blurredBackdrop(img, frameW, frameH, f, grade);
      if (cached) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(cached, 0, 0, frameW, frameH);
        ctx.restore();
      } else {
        // Direct path (tests, tainted images, no ctx.filter support): a
        // cover-placed copy of the same photo, pushed out past the frame so
        // the soft blurred edge never shows a transparent seam, then blurred.
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
      }
    } else {
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
    // FAST PATH: draw the pre-graded copy of the photo (grade baked in
    // once) so the per-frame draw never pays the CPU ctx.filter cost.
    const graded = gradedCopy(img, grade);
    if (graded) {
      drawPlaced(ctx, graded as unknown as Drawable, fg, f);
    } else {
      try {
        ctx.filter = grade;
      } catch {
        ctx.filter = "none";
      }
      drawPlaced(ctx, img, fg, f);
      try {
        ctx.filter = "none";
      } catch {}
    }
  } else {
    drawPlaced(ctx, img, fg, f);
  }
  ctx.restore();

  return fg;
}

/* ---------------------------------------------------------------------------
 * Automatic framing — what a freshly chosen photo should look like before the
 * user touches a single control.
 *
 * A photo almost never matches the video frame exactly. Left alone, "cover"
 * crops whatever overflows from the edges, which is right for a mild mismatch
 * and badly wrong for a severe one: a portrait photo in a 16:9 frame loses
 * most of its subject. These helpers decide between the two and pre-compute
 * the centred crop so the scene opens correctly framed.
 * ------------------------------------------------------------------------- */

/**
 * The shape difference past which a crop starts throwing away most of the
 * photo — a 4:3 photo in a 9:16 frame is ≈2.37, a portrait photo in a
 * landscape frame ≈3.16.
 *
 * This NO LONGER decides the automatic framing. A chosen photo is always
 * cropped to fill the frame, edge to edge and top to bottom, because that is
 * what a scene is expected to look like; bars are something the user asks
 * for in Crop & Fit, not something the app imposes. The number survives as
 * the hint behind `suggestFit` and as the threshold the UI uses to warn that
 * a particular photo is losing a lot of itself to the crop.
 */
export const AUTO_CROP_MAX_MISMATCH = 2.4;

/**
 * How different two shapes are, as a factor ≥ 1. Equal shapes give exactly 1,
 * and the result is the same whichever of the two is the wider.
 *
 * Unknown or zero dimensions are treated as "same shape as the frame": with
 * nothing measured, the safest answer is to leave the default framing alone
 * rather than to guess at a crop.
 */
export function aspectMismatch(img: SourceSize, frameW: number, frameH: number): number {
  const iw = Number(img?.naturalWidth);
  const ih = Number(img?.naturalHeight);
  // Nothing measured on either side: report a perfect match so the caller
  // leaves the default framing alone instead of acting on a guess.
  if (!(iw > 0) || !(ih > 0) || !(frameW > 0) || !(frameH > 0)) return 1;
  const imageRatio = iw / ih;
  const frameRatio = frameW / frameH;
  return Math.max(imageRatio / frameRatio, frameRatio / imageRatio, 1);
}

/**
 * The centred source rectangle that makes a photo exactly the frame's shape.
 *
 * Returned in the same normalised 0..1 space as `Scene.image_crop`, so it can
 * be stored on the scene directly. A photo already the right shape gives the
 * full rectangle, never a sliver off the edge.
 */
export function autoCropToFrame(
  img: SourceSize,
  frameW: number,
  frameH: number
): SceneCropRect {
  const iw = Number(img?.naturalWidth);
  const ih = Number(img?.naturalHeight);
  const target = frameW > 0 && frameH > 0 ? frameW / frameH : 0;
  if (!(iw > 0) || !(ih > 0) || !(target > 0)) return { ...DEFAULT_CROP };

  const ratio = iw / ih;
  if (ratio > target) {
    // Too wide: keep the full height and trim the sides evenly.
    const w = (target * ih) / iw;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  if (ratio < target) {
    // Too tall: keep the full width and trim top and bottom evenly.
    const h = iw / target / ih;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  return { ...DEFAULT_CROP };
}

/** Scene fields that frame a newly adopted photo. */
export interface AutoFraming {
  image_fit: SceneFitMode;
  image_crop: SceneCropRect;
  /** Set only for blur_fill, so the bars are the blurred photo, not black. */
  image_backdrop?: SceneBackdropStyle;
}

/**
 * The framing to apply to a photo the moment it is chosen.
 *
 * ALWAYS a crop to the frame. The photo fills the scene edge to edge and top
 * to bottom, with the overflow trimmed evenly from both sides (or both of
 * top and bottom), centred on the middle of the picture.
 *
 * This used to bail out to `blur_fill` past AUTO_CROP_MAX_MISMATCH, which
 * meant that in a vertical project — where every landscape photo is a ≈3.16
 * mismatch — nothing ever filled the frame: every scene opened as a small
 * photo floating between blurred bars, and the user had to fix each one by
 * hand. Filling is the expectation; bars are a deliberate choice, made in
 * Crop & Fit, and nothing here overrides a choice already made there.
 */
export function autoFrame(img: SourceSize, frameW: number, frameH: number): AutoFraming {
  return {
    image_fit: "cover",
    image_crop: autoCropToFrame(img, frameW, frameH),
  };
}

/**
 * True when filling the frame with this photo costs more of it than most
 * people would expect — the cue for the editor to offer "show it whole"
 * rather than to quietly decide that for them.
 */
export function cropLosesALot(img: SourceSize, frameW: number, frameH: number): boolean {
  return aspectMismatch(img, frameW, frameH) > AUTO_CROP_MAX_MISMATCH;
}

/**
 * Load an image purely to learn its dimensions.
 *
 * Resolves null instead of rejecting when the photo cannot be loaded: a
 * broken URL must leave the scene at its default framing, not break the
 * selection the user just made.
 */
export function measureImage(url: string): Promise<SourceSize | null> {
  return new Promise((resolve) => {
    try {
      if (typeof Image === "undefined" || !url) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

/**
 * The fit a newly chosen photo gets: always `cover`, so it fills the frame.
 *
 * Kept as a named function because two screens ask the question, and they
 * must never answer it differently — which is exactly what happened when
 * this returned `blur_fill` on a shape mismatch while the scene editor
 * cropped anyway. Whether the crop is expensive is a separate question, and
 * `cropLosesALot` answers that one.
 */
export function suggestFit(
  _img: SourceSize,
  _frameW: number,
  _frameH: number
): SceneFitMode {
  return "cover";
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

/**
 * Fit a video frame of the given aspect ratio inside a box, preserving shape.
 *
 * The scene cards used to hard-code a column width and a canvas width per
 * aspect ratio, and the two disagreed: at 4:3 the canvas was 300px inside a
 * 288px column (it overflowed), at 9:16 it was 302px inside a 300px box, and
 * at 16:9 a forced min-height left 41px of dead space under the image. Sizing
 * both from one function keeps the preview exactly as big as the frame it
 * represents — no overflow and no padding.
 */
export function fitFrameInBox(
  ratio: string | undefined,
  maxW: number,
  maxH: number
): { w: number; h: number } {
  const frame = frameSizeFor(ratio);
  const scale = Math.min(maxW / frame.w, maxH / frame.h);
  return {
    w: Math.max(1, Math.round(frame.w * scale)),
    h: Math.max(1, Math.round(frame.h * scale)),
  };
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

/**
 * Does this scene have anything to put on screen?
 *
 * Three things can fill a frame: a still image, a video clip, or a flat
 * colour. A scene with none of them is genuinely empty, and the renderer
 * skips it.
 *
 * This exists because that question was previously answered by writing
 * `s.image_url || s.video_url` inline at seven different call sites. Adding
 * the colour backdrop meant finding every one of them — and missing one would
 * silently drop those scenes out of the exported video, which is exactly the
 * bug this function prevents from recurring.
 */
export function sceneHasVisual(scene: {
  image_url?: string | null;
  video_url?: string | null;
  blank_color?: string | null;
}): boolean {
  return Boolean(scene.image_url || scene.video_url || scene.blank_color);
}

/**
 * Is this scene a plain colour with no photo or clip?
 *
 * The renderer branches on this to paint a fill instead of loading and
 * drawing an image.
 */
export function sceneIsBlankColor(scene: {
  image_url?: string | null;
  video_url?: string | null;
  blank_color?: string | null;
}): boolean {
  return Boolean(scene.blank_color && !scene.image_url && !scene.video_url);
}
