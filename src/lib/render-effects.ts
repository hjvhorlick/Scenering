import { Scene, SceneMotionType, TimelineInsert } from "../types";
import { resolveCtaPlatform, type CtaPlatform } from "../data/cta-library";
import { computeMotion, applyMotion, type MotionPreset } from "./overlay-motion";
import { drawSticker, resolveStickerId, STICKER_BY_ID } from "./sticker-3d";
import { renderTextTemplate, getTextTemplateBounds } from "./render-text-template";
import { AudioFrame, makeAudioFrame } from "./audio-reactive";
import { renderAudioVisualizer, getVisualizerFootprint } from "./render-visualizers";
import { drawSceneImage, drawMediaCover } from "./scene-framing";

// Convert preset position string into normalized (0..1) coordinates
export function getPresetCoords(preset?: TimelineInsert["presetPosition"]): { x: number; y: number } {
  switch (preset) {
    case "top":
      return { x: 0.5, y: 0.15 };
    case "bottom":
      return { x: 0.5, y: 0.82 };
    case "center":
      return { x: 0.5, y: 0.5 };
    case "left":
      return { x: 0.22, y: 0.5 };
    case "right":
      return { x: 0.78, y: 0.5 };
    case "top-left":
      return { x: 0.18, y: 0.15 };
    case "top-right":
      return { x: 0.82, y: 0.15 };
    case "bottom-left":
      return { x: 0.22, y: 0.82 };
    case "bottom-right":
      return { x: 0.82, y: 0.82 };
    default:
      return { x: 0.5, y: 0.5 };
  }
}

/**
 * Camera motion for scene images (the "Ken Burns" setting in Setup, which
 * applies to the whole video).
 *
 * Two rules govern everything here:
 *
 * 1. MOTION MUST BE VISIBLE. The previous Ken Burns drifted 20px across an
 *    entire scene — about 1% of the frame, or roughly one pixel per second.
 *    That reads as a completely static image. Movement is now expressed as a
 *    PERCENTAGE OF THE FRAME rather than in absolute pixels, so it looks the
 *    same at 720p and 4K, and the amounts are large enough to actually see.
 *
 * 2. MOTION MUST NEVER EXPOSE AN EDGE. Panning an image that is only scaled
 *    1.0 slides a blank gap into frame. Every preset that moves therefore
 *    scales up first, and the drift is clamped to the headroom that the
 *    zoom creates: at scale s the image overhangs the frame by (s-1)/2 on
 *    each side, so that is the furthest it may travel.
 */

/** Smooth start and end so moves feel like a camera, not a slide projector. */
function easeInOutSine(p: number): number {
  return -(Math.cos(Math.PI * p) - 1) / 2;
}

/**
 * Largest drift, in pixels, that keeps the frame covered at this scale.
 * A small safety margin absorbs rounding in the framing engine.
 */
function driftHeadroom(size: number, scale: number): number {
  return Math.max(0, (size * (scale - 1)) / 2 - 1);
}

/** Clamp a desired drift to what the current zoom can cover. */
function safeDrift(desired: number, size: number, scale: number): number {
  const limit = driftHeadroom(size, scale);
  return Math.max(-limit, Math.min(limit, desired));
}

// Compute transform for scene movement
export function getMotionTransform(
  motion: SceneMotionType | undefined,
  progress: number,
  w: number,
  h: number
): { scale: number; dx: number; dy: number } {
  // A non-finite progress (a zero-length scene divides by zero upstream) would
  // otherwise propagate NaN into the canvas transform and blank the frame.
  const safeProgress = Number.isFinite(progress) ? progress : 0;
  const p = Math.max(0, Math.min(1, safeProgress));
  const e = easeInOutSine(p);
  // Signed -1..+1 ramp, for moves that travel through centre.
  const centred = e - 0.5;

  const centre = (s: number) => ({
    scale: s,
    dx: -(w * s - w) / 2,
    dy: -(h * s - h) / 2,
  });

  switch (motion) {
    case "slow_zoom": {
      // Gentle but perceptible push: 12% over the scene.
      const s = 1 + e * 0.12;
      return centre(s);
    }
    case "zoom_in": {
      // Decisive cinematic push.
      const s = 1 + e * 0.32;
      return centre(s);
    }
    case "zoom_out": {
      // Wide reveal, pulling back from a tight framing.
      const s = 1.34 - e * 0.30;
      return centre(s);
    }
    case "pan_left": {
      // Travel 60% of the available headroom so the move is obvious while
      // the frame stays covered from first frame to last.
      const s = 1.24;
      const travel = driftHeadroom(w, s) * 1.2;
      const base = centre(s);
      return { ...base, dx: base.dx + safeDrift(-centred * travel, w, s) };
    }
    case "pan_right": {
      const s = 1.24;
      const travel = driftHeadroom(w, s) * 1.2;
      const base = centre(s);
      return { ...base, dx: base.dx + safeDrift(centred * travel, w, s) };
    }
    case "subtle_camera": {
      // Slow breathing drift — restrained, but no longer invisible.
      const s = 1.12;
      const base = centre(s);
      const driftX = Math.sin(p * Math.PI * 2) * w * 0.022;
      const driftY = Math.cos(p * Math.PI * 1.5) * h * 0.018;
      return {
        ...base,
        dx: base.dx + safeDrift(driftX, w, s),
        dy: base.dy + safeDrift(driftY, h, s),
      };
    }
    case "shake": {
      // Handheld tremor that settles as the scene goes on.
      const s = 1.14;
      const base = centre(s);
      const decay = 1 - p * 0.55;
      const amp = w * 0.011 * decay;
      const sx = (Math.sin(p * 190) + Math.cos(p * 143) * 0.6) * amp;
      const sy = (Math.cos(p * 167) + Math.sin(p * 121) * 0.6) * amp * 0.8;
      return {
        ...base,
        dx: base.dx + safeDrift(sx, w, s),
        dy: base.dy + safeDrift(sy, h, s),
      };
    }
    case "pulse": {
      // Rhythmic beat, roughly four pulses per scene. The phase is offset so
      // the very first frames are already moving — sampling exactly on a zero
      // crossing made the effect look dead at the start of a scene.
      const beat = Math.sin(p * Math.PI * 8 + Math.PI * 0.25);
      const s = 1.06 + (beat * 0.5 + 0.5) * 0.10;
      return centre(s);
    }
    case "floating": {
      // Slow weightless drift in a shallow figure of eight.
      const s = 1.16;
      const base = centre(s);
      const floatX = Math.cos(p * Math.PI * 2) * w * 0.028;
      const floatY = Math.sin(p * Math.PI * 4) * h * 0.022;
      return {
        ...base,
        dx: base.dx + safeDrift(floatX, w, s),
        dy: base.dy + safeDrift(floatY, h, s),
      };
    }
    case "none":
      return { scale: 1, dx: 0, dy: 0 };
    case "ken_burns":
    default: {
      // The classic: a steady push combined with a clearly visible diagonal
      // drift. Starts at 1.08 rather than 1.0 so there is headroom to move
      // into from the very first frame.
      const s = 1.08 + e * 0.16;
      const base = centre(s);
      const driftX = centred * w * 0.09;
      const driftY = centred * h * 0.05;
      return {
        ...base,
        dx: base.dx + safeDrift(driftX, w, s),
        dy: base.dy + safeDrift(driftY, h, s),
      };
    }
  }
}

// Apply scene-level filter effects
/* NOTE: per-scene filters were replaced by ONE project-wide video look.
   See src/data/video-filters.ts + src/lib/video-filter-render.ts. */

// Draw a rounded rectangle path helper
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Render a timeline insert onto the canvas
export function renderTimelineInsert(
  ctx: CanvasRenderingContext2D,
  insert: TimelineInsert,
  currentTime: number,
  w: number,
  h: number,
  audioLevel: number = 0.5, // 0 to 1 amplitude level
  freqData?: Uint8Array | number[] | null,
  /** Voice + music analyser buses. When omitted, level/freq are used for both
   *  buses so older call sites keep working unchanged. */
  audioFrame?: AudioFrame | null
) {
  // Check if item is within active time window
  const start = insert.startTime;
  const end = start + insert.duration;
  if (currentTime < start || currentTime > end) return;

  const elapsed = currentTime - start;
  const dur = insert.duration;
  const progress = elapsed / dur;

  // Smooth fade-in (0.2s) and fade-out (0.3s)
  let opacity = 1;
  if (elapsed < 0.25) opacity = elapsed / 0.25;
  if (end - currentTime < 0.3) opacity = Math.max(0, (end - currentTime) / 0.3);
  if (insert.opacity !== undefined) opacity *= insert.opacity;

  ctx.save();
  ctx.globalAlpha = opacity;

  // Position calculation
  const pos = insert.presetPosition ? getPresetCoords(insert.presetPosition) : insert.position;
  const cx = pos.x * w;
  const cy = pos.y * h;
  const size = insert.size || 1.0;

  const frame: AudioFrame =
    audioFrame ||
    makeAudioFrame(
      { level: audioLevel, freq: freqData || null },
      { level: audioLevel, freq: freqData || null }
    );

  const floatScale = Math.max(0.6, Math.min(1.8, size));
  const shadowStrength = Math.max(0, Math.min(1, insert.visualOptions?.shadowIntensity ?? 0.7));

  // Render by category/type (into any target context, offset for the shadow buffer)
  const paintInto = (target: CanvasRenderingContext2D, offsetX: number, offsetY: number) => {
    // NOTE: shadowing the outer ctx here is what routes the drawing into the
    // offscreen shadow buffer when the floating pass runs.
    const ctx = target;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    switch (insert.category) {
    case "call_to_action":
      renderCallToAction(ctx, insert, cx, cy, size, elapsed);
      break;
    case "stickers":
      renderSticker(ctx, insert, cx, cy, size, elapsed);
      break;
    case "content_cards":
    case "other_cards":
    case "text_templates":
    case "lower_thirds":
      // Text cards are data-driven now: plate, border, fonts, colours,
      // transparency and slide-in motion all come from the template style.
      renderTextTemplate(ctx, insert, cx, cy, size, w, elapsed);
      break;
    case "intro":
    case "outro":
      renderIntroOutroCard(ctx, insert, cx, cy, size, w, h, elapsed, progress);
      break;
    case "filters":
      // Filters are no longer timeline inserts — they run across the whole
      // video and are painted by paintVideoFilter() in the draw loop.
      break;
    case "background_music":
    case "sound_effects":
      // Audio tracks handled by media player
      break;
    case "audio_visualizers":
    case "speech_reactive":
    case "meditation":
      renderAudioVisualizer({
        ctx,
        item: insert,
        x: cx,
        y: cy,
        canvasWidth: w,
        canvasHeight: h,
        elapsed,
        frame,
      });
      break;
    case "special_effects":
      renderSpecialEffect(ctx, insert, w, h, elapsed, progress);
      break;
    case "branding":
    case "logo":
      renderBranding(ctx, insert, cx, cy, size);
      break;
    }
    ctx.restore();
  };

  // ---------- Floating shadow pass ----------
  const wantsFloat =
    FLOAT_SHADOW_CATEGORIES[insert.category] === true && insert.visualOptions?.floatShadow !== false;

  if (wantsFloat) {
    // Full-frame buffer: overlays such as full-width wave effects can never be
    // clipped by their own shadow pass.
    const scratch = getFloatScratch(w, h);
    const sctx = scratch ? (scratch.getContext("2d") as CanvasRenderingContext2D | null) : null;

    if (scratch && sctx) {
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, w, h);
      sctx.save();
      mirrorCanvasState(ctx, sctx);
      sctx.globalAlpha = opacity;
      paintInto(sctx, 0, 0);
      sctx.restore();

      // the composite itself starts from a clean slate
      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 1;
      ctx.shadowColor = `rgba(0, 0, 0, ${(0.34 + shadowStrength * 0.42).toFixed(3)})`;
      ctx.shadowBlur = Math.max(5, (11 + shadowStrength * 15) * floatScale);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.max(3, (5 + shadowStrength * 8) * floatScale);
      // paint the overlay once, with its shadow already falling below it
      ctx.drawImage(scratch, 0, 0, w, h, 0, 0, w, h);
      ctx.restore();
      ctx.restore();
      return;
    }
  }

  paintInto(ctx, 0, 0);
  ctx.restore();
}

// ---------------- CALL TO ACTION ----------------
/* ================= CALL-TO-ACTION BADGES ================= */
/**
 * Badge geometry is shared with the preview so drag / resize handles always
 * line up with what is painted on the canvas.
 */
export interface CtaBadgeLayout {
  width: number;
  height: number;
  radius: number;
  shape: "pill" | "round" | "square" | "banner";
  scale: number;
  markRadius: number;
  hasTwoLines: boolean;
}

export function getCtaBadgeLayout(
  item: TimelineInsert,
  ctx?: CanvasRenderingContext2D | null
): CtaBadgeLayout {
  const platform = resolveCtaPlatform(item.type, item.visualOptions?.platform);
  const shape = (item.visualOptions?.ctaShape || platform?.shape || "pill") as CtaBadgeLayout["shape"];
  const scale = item.visualOptions?.badgeScale ?? 1;
  const textScale = item.visualOptions?.textScale ?? 1;
  const primaryText = (item.content?.primaryText || item.title || platform?.primaryText || "Subscribe").toUpperCase();
  const secondaryText = item.content?.secondaryText ?? platform?.secondaryText ?? "";
  const hasTwoLines = Boolean(secondaryText && shape !== "round");

  // Measure with a measuring context when no canvas is available (SSR-safe fallback)
  let textWidth = primaryText.length * 10 * textScale;
  let subWidth = secondaryText.length * 6 * textScale;
  if (ctx) {
    ctx.save();
    ctx.font = `800 ${Math.round(21 * textScale)}px system-ui, -apple-system, sans-serif`;
    textWidth = ctx.measureText(primaryText).width;
    ctx.font = `600 ${Math.round(12 * textScale)}px system-ui, -apple-system, sans-serif`;
    subWidth = secondaryText ? ctx.measureText(secondaryText).width : 0;
    ctx.restore();
  }

  const markRadius = 17 * (item.visualOptions?.iconScale ?? 1);

  if (shape === "round") {
    // Icon-only circular social badge
    const d = 76 * scale;
    return { width: d, height: d, radius: d / 2, shape, scale, markRadius: d * 0.28, hasTwoLines: false };
  }

  const contentWidth = Math.max(textWidth, subWidth);
  const padX = 26;
  const badgeH = (hasTwoLines ? 72 : 60) * scale;
  const width = Math.max(240, Math.min(560, contentWidth + markRadius * 2 + padX * 2)) * scale;
  const radius =
    shape === "pill" ? badgeH / 2 : shape === "square" ? 10 * scale : 18 * scale;

  return {
    width: shape === "banner" ? Math.max(width, 620 * scale) : width,
    height: badgeH,
    radius,
    shape,
    scale,
    markRadius,
    hasTwoLines,
  };
}

/**
 * Tight crop window around a badge, used by the live preview in the edit screen.
 * Returns the window (cropW/cropH at its top-left origin ox/oy, in video pixels)
 * plus the badge's own painted size, so the preview box is only as big as the
 * button and everything else can be measured from it.
 */
export interface CtaPreviewCrop {
  cropW: number;
  cropH: number;
  ox: number;
  oy: number;
  width: number;
  height: number;
  widerThanFrame: boolean;
}

export function getCtaPreviewCrop(
  item: TimelineInsert,
  frameW: number,
  frameH: number,
  ctx?: CanvasRenderingContext2D | null
): CtaPreviewCrop {
  const layout = getCtaBadgeLayout(item, ctx);
  const size = item.size || 1;
  const width = layout.width * size;
  const height = layout.height * size;
  const rot = ((item.visualOptions?.rotation ?? 0) * Math.PI) / 180;
  const rotatedW = Math.abs(width * Math.cos(rot)) + Math.abs(height * Math.sin(rot));
  const rotatedH = Math.abs(height * Math.cos(rot)) + Math.abs(width * Math.sin(rot));
  const elevation = item.visualOptions?.elevation ?? 0.45;
  // The drop shadow is painted inside the scaled context, so its room scales with
  // the badge too — that keeps small badges from sitting in an oversized box.
  const shadowPad = Math.max(8, (10 + elevation * 12) * size + 4);

  const wantedW = Math.ceil(rotatedW + shadowPad * 2);
  const wantedH = Math.ceil(rotatedH + shadowPad * 2);
  const widerThanFrame = wantedW > frameW || wantedH > frameH;
  const cropW = Math.min(wantedW, frameW);
  const cropH = Math.min(wantedH, frameH);

  const pos = item.presetPosition ? getPresetCoords(item.presetPosition) : item.position || { x: 0.5, y: 0.85 };
  const cx = pos.x * frameW;
  const cy = pos.y * frameH;
  // Keep the window inside the frame, so a badge near an edge shows up near an edge.
  // Rounded to whole pixels so the crop lands exactly on video pixels.
  const ox = Math.round(Math.max(0, Math.min(frameW - cropW, cx - cropW / 2)));
  const oy = Math.round(Math.max(0, Math.min(frameH - cropH, cy - cropH / 2)));

  return { cropW, cropH, ox, oy, width, height, widerThanFrame };
}

/** Screen-space bounding box of a badge, used for hit-testing and selection chrome */
export function getInsertBounds(
  item: TimelineInsert,
  w: number,
  h: number,
  ctx?: CanvasRenderingContext2D | null
) {
  const pos = item.presetPosition ? getPresetCoords(item.presetPosition) : item.position;
  const cx = pos.x * w;
  const cy = pos.y * h;
  const size = item.size || 1;
  if (item.category === "call_to_action") {
    const layout = getCtaBadgeLayout(item, ctx);
    const bw = layout.width * size;
    const bh = layout.height * size;
    return { cx, cy, x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
  }
  // Per-category footprint, used for hit-testing and for the floating shadow pass
  let bw = 240 * size;
  let bh = 90 * size;
  switch (item.category) {
    case "stickers":
      bw = 320 * size;
      bh = 320 * size;
      break;
    case "content_cards":
    case "other_cards":
    case "text_templates":
    case "lower_thirds": {
      // real drawn footprint so lower thirds get a tight, grabbable box
      const b = getTextTemplateBounds(item, w);
      bw = b.w;
      bh = b.h;
      // match the on-screen clamp applied by the renderer
      const margin = w * 0.03;
      const minX = bw / 2 + margin;
      const maxX = w - bw / 2 - margin;
      const clamped = maxX > minX ? Math.max(minX, Math.min(maxX, cx)) : w / 2;
      return { cx: clamped, cy, x: clamped - bw / 2, y: cy - bh / 2, w: bw, h: bh };
    }
    case "audio_visualizers":
    case "speech_reactive":
    case "meditation": {
      // Real drawn footprint, so a wall-to-wall bar rack can be grabbed and
      // dragged from anywhere along its length.
      const fp = getVisualizerFootprint(item, w, h);
      bw = fp.w;
      bh = fp.h;
      break;
    }
    case "branding":
    case "logo":
      bw = 420 * size;
      bh = 220 * size;
      break;
    case "intro":
    case "outro":
      bw = w;
      bh = h;
      break;
    default:
      break;
  }
  return { cx, cy, x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}

/* ================= FLOATING SHADOWS FOR OVERLAYS ================= */
/**
 * Overlays (stickers, cards, wave effects, branding, badges) are composited from
 * an offscreen buffer that is drawn once with a soft shadow falling *below* the
 * element. The shadow never doubles the element's own alpha, so translucent
 * overlays stay exactly as designed while gaining depth in the frame.
 */
const FLOAT_SHADOW_CATEGORIES: Record<string, boolean> = {
  stickers: true,
  content_cards: true,
  other_cards: true,
  text_templates: true,
  audio_visualizers: true,
  speech_reactive: true,
  meditation: true,
  branding: true,
  logo: true,
};

/**
 * Mirrors the live canvas state onto the shadow buffer. Some overlays rely on the
 * state left behind on the main context (fill colour, font, line width), so the
 * buffer has to start out identical or the shadowed copy would differ.
 */
function mirrorCanvasState(from: CanvasRenderingContext2D, to: CanvasRenderingContext2D) {
  const simple: Array<keyof CanvasRenderingContext2D> = [
    "lineWidth",
    "lineCap",
    "lineJoin",
    "miterLimit",
    "font",
    "textAlign",
    "textBaseline",
    "globalCompositeOperation",
    "imageSmoothingEnabled",
    "filter",
    "direction",
    "fontKerning",
    "letterSpacing",
  ] as any;
  for (const key of simple) {
    try {
      const value = (from as any)[key];
      if (value !== undefined) (to as any)[key] = value;
    } catch {
      /* property unsupported on this context */
    }
  }
  // Styles can be a colour string or a gradient/pattern bound to the other canvas
  try {
    if (typeof from.fillStyle === "string") to.fillStyle = from.fillStyle;
    if (typeof from.strokeStyle === "string") to.strokeStyle = from.strokeStyle;
    if (typeof from.shadowColor === "string") to.shadowColor = from.shadowColor;
  } catch {
    /* ignore */
  }
}

let floatScratch: any = null;
let floatScratchFactory: ((w: number, h: number) => any) | null = null;

/** Tests / headless renders can supply their own canvas factory */
export function setFloatShadowCanvasFactory(fn: ((w: number, h: number) => any) | null) {
  floatScratchFactory = fn;
  floatScratch = null;
}

function getFloatScratch(w: number, h: number) {
  if (w <= 0 || h <= 0) return null;
  if (!floatScratch) {
    if (floatScratchFactory) floatScratch = floatScratchFactory(w, h);
    else if (typeof document !== "undefined") {
      floatScratch = document.createElement("canvas");
      floatScratch.width = w;
      floatScratch.height = h;
    } else return null;
  }
  if (floatScratch.width < w) floatScratch.width = w;
  if (floatScratch.height < h) floatScratch.height = h;
  return floatScratch;
}

/** Brand marks painted inside the badge circle */
/** Rounded-rect path without opening a new path (so glyphs can be composed) */
function markRoundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number
) {
  const rr = Math.min(rad, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * Draws a short text glyph (monogram, emoji, "in", "f") inside the mark circle.
 * The glyph is scaled down when needed and clipped to the circle so it always
 * sits neatly inside the badge, whatever the user types in the icon field.
 */
function drawFittedMarkText(
  ctx: CanvasRenderingContext2D,
  text: string,
  r: number,
  sizeFactor: number,
  baselineOffset: number,
  family = "system-ui, -apple-system, sans-serif"
) {
  if (!text) return;
  const maxWidth = r * 1.8;
  let fontPx = r * sizeFactor;
  ctx.save();
  ctx.font = `800 ${Math.round(fontPx)}px ${family}`;
  const measured = ctx.measureText(text).width;
  if (measured > maxWidth && measured > 0) {
    fontPx = Math.max(6, fontPx * (maxWidth / measured));
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.02, 0, Math.PI * 2);
  ctx.clip();
  ctx.font = `800 ${Math.round(fontPx)}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, baselineOffset);
  ctx.restore();
}

function drawCtaMark(
  ctx: CanvasRenderingContext2D,
  mark: CtaPlatform["mark"],
  monogram: string,
  cx: number,
  cy: number,
  r: number,
  ink: string
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  switch (mark) {
    case "youtube": {
      // Rounded play tile with the triangle punched out as a path hole (even-odd
      // fill) so the badge face shows through instead of the video behind it.
      const bw = r * 2.0;
      const bh = r * 1.42;
      const rad = bh * 0.3;
      const x = -bw / 2;
      const y = -bh / 2;
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.lineTo(x + bw - rad, y);
      ctx.quadraticCurveTo(x + bw, y, x + bw, y + rad);
      ctx.lineTo(x + bw, y + bh - rad);
      ctx.quadraticCurveTo(x + bw, y + bh, x + bw - rad, y + bh);
      ctx.lineTo(x + rad, y + bh);
      ctx.quadraticCurveTo(x, y + bh, x, y + bh - rad);
      ctx.lineTo(x, y + rad);
      ctx.quadraticCurveTo(x, y, x + rad, y);
      ctx.closePath();
      // play triangle (drawn in the same path, opposite winding not required:
      // the even-odd rule makes it a hole)
      ctx.moveTo(-r * 0.22, -r * 0.42);
      ctx.lineTo(r * 0.45, 0);
      ctx.lineTo(-r * 0.22, r * 0.42);
      ctx.closePath();
      ctx.fill("evenodd");
      break;
    }
    case "instagram": {
      ctx.lineWidth = Math.max(1.6, r * 0.17);
      const s = r * 1.5;
      const rad = s * 0.32;
      ctx.beginPath();
      const x = -s / 2;
      const y = -s / 2;
      ctx.moveTo(x + rad, y);
      ctx.lineTo(x + s - rad, y);
      ctx.quadraticCurveTo(x + s, y, x + s, y + rad);
      ctx.lineTo(x + s, y + s - rad);
      ctx.quadraticCurveTo(x + s, y + s, x + s - rad, y + s);
      ctx.lineTo(x + rad, y + s);
      ctx.quadraticCurveTo(x, y + s, x, y + s - rad);
      ctx.lineTo(x, y + rad);
      ctx.quadraticCurveTo(x, y, x + rad, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 0.34, -s * 0.34, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "tiktok": {
      ctx.lineWidth = Math.max(1.6, r * 0.2);
      ctx.beginPath();
      ctx.moveTo(r * 0.12, -r * 0.75);
      ctx.lineTo(r * 0.12, r * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.12, -r * 0.75);
      ctx.quadraticCurveTo(r * 0.85, -r * 0.7, r * 0.78, -r * 0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-r * 0.18, r * 0.32, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "spotify": {
      ctx.lineWidth = Math.max(1.5, r * 0.16);
      for (let i = 0; i < 3; i++) {
        const yy = -r * 0.28 + i * r * 0.42;
        const spread = r * (0.62 - i * 0.12);
        ctx.beginPath();
        ctx.moveTo(-spread, yy - r * 0.14);
        ctx.quadraticCurveTo(0, yy + r * 0.18, spread, yy - r * 0.14);
        ctx.stroke();
      }
      break;
    }
    case "whatsapp": {
      // White disc with the handset punched out as a path hole, so the handset
      // always takes the badge colour instead of vanishing on light badges.
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      ctx.moveTo(-r * 0.34, -r * 0.36);
      ctx.quadraticCurveTo(-r * 0.5, 0, -r * 0.05, r * 0.42);
      ctx.quadraticCurveTo(r * 0.35, r * 0.62, r * 0.42, r * 0.3);
      ctx.quadraticCurveTo(r * 0.2, r * 0.3, r * 0.05, r * 0.12);
      ctx.quadraticCurveTo(-r * 0.14, -r * 0.06, -r * 0.34, -r * 0.36);
      ctx.closePath();
      ctx.fill("evenodd");
      break;
    }
    case "telegram": {
      // Disc with the paper plane punched out as a path hole
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      ctx.moveTo(-r * 0.45, r * 0.06);
      ctx.lineTo(r * 0.52, -r * 0.42);
      ctx.lineTo(r * 0.2, r * 0.5);
      ctx.lineTo(r * 0.02, r * 0.16);
      ctx.closePath();
      ctx.fill("evenodd");
      break;
    }
    case "snapchat": {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.9);
      ctx.quadraticCurveTo(r * 0.66, -r * 0.9, r * 0.62, -r * 0.1);
      ctx.quadraticCurveTo(r * 0.6, r * 0.25, r * 0.95, r * 0.35);
      ctx.quadraticCurveTo(r * 0.6, r * 0.62, r * 0.2, r * 0.7);
      ctx.quadraticCurveTo(0, r * 0.98, -r * 0.2, r * 0.7);
      ctx.quadraticCurveTo(-r * 0.6, r * 0.62, -r * 0.95, r * 0.35);
      ctx.quadraticCurveTo(-r * 0.6, r * 0.25, -r * 0.62, -r * 0.1);
      ctx.quadraticCurveTo(-r * 0.66, -r * 0.9, 0, -r * 0.9);
      ctx.fill();
      break;
    }
    case "discord": {
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.05, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.beginPath();
      ctx.arc(-r * 0.32, 0, r * 0.16, 0, Math.PI * 2);
      ctx.arc(r * 0.32, 0, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "twitch": {
      // Pixel-shield outline with the two bars punched out as path holes
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.75);
      ctx.lineTo(r * 0.7, -r * 0.75);
      ctx.lineTo(r * 0.7, r * 0.15);
      ctx.lineTo(r * 0.2, r * 0.6);
      ctx.lineTo(-r * 0.2, r * 0.6);
      ctx.lineTo(-r * 0.7, r * 0.1);
      ctx.closePath();
      ctx.rect(-r * 0.36, -r * 0.45, r * 0.16, r * 0.6);
      ctx.rect(r * 0.14, -r * 0.45, r * 0.16, r * 0.6);
      ctx.fill("evenodd");
      break;
    }
    case "pinterest": {
      // Script "P" in badge ink (the circular chip already provides the disc)
      drawFittedMarkText(ctx, "P", r, 1.35, r * 0.06, "Georgia, 'Times New Roman', serif");
      break;
    }
    case "x": {
      ctx.lineWidth = Math.max(2, r * 0.26);
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.5);
      ctx.lineTo(r * 0.5, r * 0.5);
      ctx.moveTo(r * 0.5, -r * 0.5);
      ctx.lineTo(-r * 0.5, r * 0.5);
      ctx.stroke();
      break;
    }
    case "facebook": {
      drawFittedMarkText(ctx, "f", r, 1.7, r * 0.12, "Georgia, serif");
      break;
    }
    case "linkedin": {
      drawFittedMarkText(ctx, "in", r, 1.05, r * 0.06);
      break;
    }
    case "reddit": {
      drawFittedMarkText(ctx, "r/", r, 1.05, r * 0.06);
      break;
    }
    case "messenger": {
      // Speech bubble with the bolt cut out of it
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, -r * 0.55);
      ctx.quadraticCurveTo(-r * 0.95, -r * 0.55, -r * 0.95, -r * 0.3);
      ctx.lineTo(-r * 0.95, r * 0.2);
      ctx.quadraticCurveTo(-r * 0.95, r * 0.45, -r * 0.7, r * 0.45);
      ctx.lineTo(-r * 0.25, r * 0.45);
      ctx.lineTo(-r * 0.6, r * 0.9);
      ctx.lineTo(-r * 0.05, r * 0.45);
      ctx.lineTo(r * 0.7, r * 0.45);
      ctx.quadraticCurveTo(r * 0.95, r * 0.45, r * 0.95, r * 0.2);
      ctx.lineTo(r * 0.95, -r * 0.3);
      ctx.quadraticCurveTo(r * 0.95, -r * 0.55, r * 0.7, -r * 0.55);
      ctx.closePath();
      ctx.moveTo(-r * 0.14, -r * 0.34);
      ctx.lineTo(r * 0.3, -r * 0.06);
      ctx.lineTo(r * 0.02, 0);
      ctx.lineTo(r * 0.22, r * 0.3);
      ctx.lineTo(-r * 0.26, r * 0.02);
      ctx.lineTo(0, -r * 0.04);
      ctx.closePath();
      ctx.fill("evenodd");
      break;
    }
    case "mic": {
      ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.beginPath();
      ctx.moveTo(-r * 0.26, -r * 0.7);
      ctx.lineTo(r * 0.26, -r * 0.7);
      ctx.quadraticCurveTo(r * 0.36, -r * 0.7, r * 0.36, -r * 0.45);
      ctx.lineTo(r * 0.36, r * 0.05);
      ctx.quadraticCurveTo(r * 0.36, r * 0.45, 0, r * 0.45);
      ctx.quadraticCurveTo(-r * 0.36, r * 0.45, -r * 0.36, r * 0.05);
      ctx.lineTo(-r * 0.36, -r * 0.45);
      ctx.quadraticCurveTo(-r * 0.36, -r * 0.7, -r * 0.26, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, r * 0.02, r * 0.62, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, r * 0.62);
      ctx.lineTo(0, r * 0.86);
      ctx.stroke();
      break;
    }
    case "note": {
      ctx.beginPath();
      ctx.ellipse(-r * 0.28, r * 0.42, r * 0.3, r * 0.22, -0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.02, r * 0.42);
      ctx.lineTo(-r * 0.02, -r * 0.62);
      ctx.lineTo(r * 0.52, -r * 0.46);
      ctx.lineTo(r * 0.52, -r * 0.2);
      ctx.lineTo(r * 0.1, -r * 0.32);
      ctx.lineTo(r * 0.1, r * 0.44);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "cloud": {
      ctx.beginPath();
      ctx.arc(-r * 0.34, r * 0.05, r * 0.32, 0, Math.PI * 2);
      ctx.arc(r * 0.04, -r * 0.2, r * 0.42, 0, Math.PI * 2);
      ctx.arc(r * 0.44, r * 0.1, r * 0.28, 0, Math.PI * 2);
      ctx.rect(-r * 0.36, r * 0.02, r * 0.82, r * 0.34);
      ctx.fill();
      break;
    }
    case "cup": {
      ctx.beginPath();
      ctx.moveTo(-r * 0.52, -r * 0.32);
      ctx.lineTo(r * 0.32, -r * 0.32);
      ctx.lineTo(r * 0.2, r * 0.6);
      ctx.quadraticCurveTo(r * 0.14, r * 0.7, 0, r * 0.7);
      ctx.quadraticCurveTo(-r * 0.16, r * 0.7, -r * 0.2, r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.beginPath();
      ctx.arc(r * 0.42, 0, r * 0.26, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.28, -r * 0.52);
      ctx.quadraticCurveTo(-r * 0.1, -r * 0.66, -r * 0.26, -r * 0.84);
      ctx.moveTo(r * 0.04, -r * 0.52);
      ctx.quadraticCurveTo(r * 0.22, -r * 0.66, r * 0.06, -r * 0.84);
      ctx.stroke();
      break;
    }
    case "globe": {
      ctx.lineWidth = Math.max(1.8, r * 0.14);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.34, r * 0.78, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.72, 0);
      ctx.lineTo(r * 0.72, 0);
      ctx.stroke();
      break;
    }
    case "link": {
      ctx.lineWidth = Math.max(2, r * 0.2);
      ctx.beginPath();
      ctx.arc(-r * 0.3, 0, r * 0.34, Math.PI * 0.5, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r * 0.3, 0, r * 0.34, Math.PI * 1.5, Math.PI * 2.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.22, 0);
      ctx.lineTo(r * 0.22, 0);
      ctx.stroke();
      break;
    }
    case "bag": {
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.beginPath();
      markRoundRectPath(ctx, -r * 0.5, -r * 0.12, r, r * 0.72, r * 0.14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -r * 0.12, r * 0.28, Math.PI, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "download": {
      ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.75);
      ctx.lineTo(0, r * 0.02);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.32, -r * 0.22);
      ctx.lineTo(0, r * 0.18);
      ctx.lineTo(r * 0.32, -r * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, r * 0.42);
      ctx.lineTo(-r * 0.6, r * 0.72);
      ctx.lineTo(r * 0.6, r * 0.72);
      ctx.lineTo(r * 0.6, r * 0.42);
      ctx.stroke();
      break;
    }
    case "envelope": {
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.beginPath();
      markRoundRectPath(ctx, -r * 0.7, -r * 0.46, r * 1.4, r * 0.92, r * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.66, -r * 0.4);
      ctx.lineTo(0, r * 0.06);
      ctx.lineTo(r * 0.66, -r * 0.4);
      ctx.stroke();
      break;
    }
    case "calendar": {
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.beginPath();
      markRoundRectPath(ctx, -r * 0.66, -r * 0.56, r * 1.32, r * 1.16, r * 0.14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.66, -r * 0.2);
      ctx.lineTo(r * 0.66, -r * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, -r * 0.72);
      ctx.lineTo(-r * 0.3, -r * 0.42);
      ctx.moveTo(r * 0.3, -r * 0.72);
      ctx.lineTo(r * 0.3, -r * 0.42);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-r * 0.24, r * 0.3, r * 0.1, 0, Math.PI * 2);
      ctx.arc(r * 0.24, r * 0.3, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "gift": {
      ctx.beginPath();
      markRoundRectPath(ctx, -r * 0.58, -r * 0.14, r * 1.16, r * 0.78, r * 0.1);
      ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.beginPath();
      ctx.moveTo(-r * 0.78, -r * 0.26);
      ctx.lineTo(r * 0.78, -r * 0.26);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-r * 0.24, -r * 0.52, r * 0.22, Math.PI * 0.9, Math.PI * 2.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r * 0.24, -r * 0.52, r * 0.22, Math.PI * 0.9, Math.PI * 2.1);
      ctx.stroke();
      break;
    }

    default: {
      // Monogram / emoji icon: always clipped and shrunk to fit the chip so a
      // long custom icon can never spill outside the badge.
      drawFittedMarkText(ctx, monogram, r, 1.25, r * 0.08);
    }
  }
  ctx.restore();
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full || "000000", 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgba(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Redesigned call-to-action badge renderer.
 * The badge sits on a soft plate shadow with a light top bevel and a darker
 * bottom bevel — a slightly raised, clean 2D look.
 */
export function renderCallToAction(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  x: number,
  y: number,
  size: number,
  elapsed: number
) {
  const platform = resolveCtaPlatform(item.type, item.visualOptions?.platform);
  const visual = item.visualOptions || {};
  const primary = visual.primaryColor || platform?.primaryColor || "#6366F1";
  const secondary = visual.secondaryColor || platform?.secondaryColor || primary;
  const shape = (visual.ctaShape || platform?.shape || "pill") as "pill" | "round" | "square" | "banner";
  const style = (visual.ctaStyle || platform?.style || "gradient") as "solid" | "gradient" | "outline" | "glass";

  const primaryText = (item.content?.primaryText || item.title || platform?.primaryText || "Subscribe").toUpperCase();
  const secondaryText =
    item.content?.secondaryText !== undefined ? item.content?.secondaryText || "" : platform?.secondaryText || "";
  // A user-picked icon overrides the platform's brand logo
  const customMark = visual.customMark;
  const monogram = customMark || item.content?.label || platform?.monogram || "★";
  const mark = (customMark ? "monogram" : platform?.mark || "monogram") as CtaPlatform["mark"];
  const elevation = visual.elevation ?? 0.45;
  const textScale = visual.textScale ?? 1;
  const iconScale = visual.iconScale ?? 1;
  const borderWidth = visual.borderWidth ?? 2.5;

  const darkText = platform?.darkText || relativeLuminance(primary) > 0.72;
  const inkColor = visual.textColor || (darkText ? "#111827" : "#FFFFFF");

  const layout = getCtaBadgeLayout(item, ctx);
  const bw = layout.width * size;
  const bh = layout.height * size;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);

  if (visual.rotation) {
    ctx.rotate((visual.rotation * Math.PI) / 180);
  }

  // Shared overlay motion — the same engine the 3D stickers use, so a CTA can
  // swing, bounce or turn to pull the eye. Defaults to the old subtle breath.
  const ctaMotion = computeMotion(elapsed, item.duration, {
    preset: (visual.motionPreset as MotionPreset) || "none",
    speed: visual.motionSpeed,
    amount: visual.motionAmount,
    entrance: visual.motionEntrance,
  });
  if (visual.motionPreset && visual.motionPreset !== "none") {
    applyMotion(ctx, ctaMotion);
  } else {
    // legacy gentle breathing pulse (keeps existing projects looking the same)
    const pulse = 1 + Math.sin(elapsed * 3.2) * 0.012;
    ctx.scale(pulse, pulse);
  }

  const bwU = layout.width; // unscaled (ctx already scaled by size)
  const bhU = layout.height;
  const rad = layout.radius;

  const paintPlate = (fill: string | CanvasGradient | null, stroke?: string, lw = 0) => {
    ctx.beginPath();
    roundRect(ctx, -bwU / 2, -bhU / 2, bwU, bhU, rad);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke && lw > 0) {
      ctx.save();
      ctx.lineWidth = lw;
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.restore();
    }
  };

  // ---------- 1. Raised plate shadow (the "lifted off the video" look) ----------
  if (elevation > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${0.30 + elevation * 0.35})`;
    ctx.shadowBlur = 7 + elevation * 14;
    ctx.shadowOffsetY = 2 + elevation * 5;
    ctx.beginPath();
    roundRect(ctx, -bwU / 2, -bhU / 2, bwU, bhU, rad);
    ctx.fillStyle = style === "outline" || style === "glass" ? rgba("#000000", 0.9) : primary;
    ctx.fill();
    ctx.restore();
  }

  // ---------- 2. Face of the badge ----------
  if (style === "outline") {
    paintPlate(rgba(inkColor, 0.06), primary, borderWidth);
  } else if (style === "glass") {
    paintPlate(rgba("#FFFFFF", 0.16), rgba("#FFFFFF", 0.42), Math.max(1, borderWidth - 1));
    // subtle frost gradient
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, -bwU / 2, -bhU / 2, bwU, bhU, rad);
    ctx.clip();
    const frost = ctx.createLinearGradient(0, -bhU / 2, 0, bhU / 2);
    frost.addColorStop(0, "rgba(255,255,255,0.30)");
    frost.addColorStop(0.55, "rgba(255,255,255,0.06)");
    frost.addColorStop(1, "rgba(0,0,0,0.10)");
    ctx.fillStyle = frost;
    ctx.fillRect(-bwU / 2, -bhU / 2, bwU, bhU);
    ctx.restore();
  } else if (style === "solid") {
    paintPlate(primary);
  } else {
    const grad = ctx.createLinearGradient(0, -bhU / 2, 0, bhU / 2);
    grad.addColorStop(0, primary);
    grad.addColorStop(1, secondary);
    paintPlate(grad);
  }

  // ---------- 3. Bevel: light top edge + darker bottom edge (raised 2D) ----------
  if (style !== "outline") {
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, -bwU / 2, -bhU / 2, bwU, bhU, rad);
    ctx.clip();

    // top highlight
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = Math.max(1, 1.6 * (1 - elevation * 0.3));
    ctx.beginPath();
    roundRect(ctx, -bwU / 2 + 1, -bhU / 2 + 1, bwU - 2, bhU, rad);
    ctx.stroke();

    // bottom shade
    ctx.strokeStyle = rgba("#000000", 0.28);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    roundRect(ctx, -bwU / 2, -bhU / 2 + 2.5, bwU, bhU, rad);
    ctx.stroke();
    ctx.restore();
  }

  // Outer hairline for crispness on any background
  ctx.save();
  ctx.strokeStyle = style === "outline" ? rgba(primary, 0.9) : "rgba(0,0,0,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, -bwU / 2, -bhU / 2, bwU, bhU, rad);
  ctx.stroke();
  ctx.restore();

  // ---------- 4. Brand mark ----------
  const markR = layout.markRadius * iconScale;
  const contentShift = shape === "round" ? 0 : -(bwU / 2) + 20 + markR;
  const markInk = style === "outline" ? primary : darkText ? "#FFFFFF" : "#FFFFFF";

  if (shape === "round") {
    drawCtaMark(ctx, mark, monogram, 0, 0, markR, inkColor);
  } else {
    // Circular chip behind the mark keeps different brand marks visually even
    if (style !== "outline") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(contentShift, 0, markR * 1.16, 0, Math.PI * 2);
      ctx.fillStyle = darkText ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.22)";
      ctx.fill();
      ctx.strokeStyle = darkText ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    drawCtaMark(ctx, mark, monogram, contentShift, 0, markR, style === "outline" ? primary : markInk);
  }

  // ---------- 5. Text ----------
  if (shape !== "round") {
    const textLeft = contentShift + markR + 16;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    ctx.save();
    ctx.shadowColor = darkText ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.45)";
    ctx.shadowBlur = darkText ? 0 : 3;
    ctx.shadowOffsetY = darkText ? 0 : 1;

    if (layout.hasTwoLines) {
      ctx.fillStyle = inkColor;
      ctx.font = `800 ${Math.round(20 * textScale)}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(primaryText, textLeft, -11 * layout.scale);
      ctx.font = `600 ${Math.round(12 * textScale)}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = style === "outline" ? rgba(inkColor, 0.8) : rgba(inkColor, 0.88);
      ctx.fillText(secondaryText, textLeft, 14 * layout.scale);
    } else {
      ctx.fillStyle = inkColor;
      ctx.font = `800 ${Math.round(21 * textScale)}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(primaryText, textLeft, 1);
    }
    ctx.restore();
  }

  ctx.restore();
}

// ---------------- STICKERS ----------------
/**
 * Stickers are drawn as shaded 3D objects (src/lib/sticker-3d.ts) and moved by
 * the shared overlay motion engine (src/lib/overlay-motion.ts), so they spin,
 * bounce and catch the light instead of sitting flat on the frame.
 */
function renderSticker(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  x: number,
  y: number,
  size: number,
  elapsed: number
) {
  const vo = item.visualOptions || {};
  // Projects saved before the 3D rebuild only have the old `type`, so the
  // legacy map resolves them onto the nearest new sticker and the library's
  // own default motion takes over.
  const stickerId = resolveStickerId(vo.stickerId || item.type);
  const def = STICKER_BY_ID[stickerId];

  const motion = computeMotion(elapsed, item.duration, {
    preset: (vo.motionPreset as MotionPreset) || (def?.defaultMotion as MotionPreset) || "float",
    speed: vo.motionSpeed,
    amount: vo.motionAmount,
    entrance: vo.motionEntrance,
  });

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  if (vo.rotation) ctx.rotate((vo.rotation * Math.PI) / 180);
  applyMotion(ctx, motion);

  drawSticker(ctx, stickerId, {
    motion,
    time: elapsed,
    tint: vo.stickerTint ?? vo.primaryColor ?? null,
    shadow: vo.shadowIntensity ?? 0.85,
    glow: vo.stickerGlow ?? 0.35,
  });

  ctx.restore();
}

// ---------------- CONTENT CARDS ----------------
// NOTE: renderContentCard() was removed when text cards became data-driven.
// Every scripture / quote / lower-third / lesson card is now described in
// src/data/text-templates.ts and painted by renderTextTemplate(), so the plate,
// border, fonts, colours, transparency and entrance motion are all adjustable
// per insert instead of hard-coded per design.

// ---------------- INTRO & OUTRO OVERLAYS (FULL-SCREEN TENSION GETTERS & BRANDING) ----------------
const introVideoCache = new Map<string, HTMLVideoElement>();
const introLogoCache = new Map<string, HTMLImageElement>();

function getOrLoadIntroVideo(src: string): HTMLVideoElement | null {
  if (typeof document === "undefined") return null;
  let video = introVideoCache.get(src);
  if (!video) {
    video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = true;
    introVideoCache.set(src, video);
  }
  return video;
}

function getOrLoadIntroLogo(src: string): HTMLImageElement | null {
  if (typeof document === "undefined") return null;
  let img = introLogoCache.get(src);
  if (!img) {
    img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    introLogoCache.set(src, img);
  }
  return img;
}

function renderIntroOutroCard(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  x: number,
  y: number,
  size: number,
  canvasWidth: number,
  canvasHeight: number,
  elapsed: number,
  progress: number
) {
  const content = item.content || {};
  const isIntro = item.category === "intro";
  const primaryColor = item.visualOptions?.primaryColor || (isIntro ? "#eab308" : "#ef4444");
  const secondaryColor = item.visualOptions?.secondaryColor || (isIntro ? "#f59e0b" : "#b91c1c");

  ctx.save();
  // Reset translation to paint full screen canvas coordinates (0, 0, canvasWidth, canvasHeight)
  ctx.translate(-x, -y);

  // 1. VIDEO OR IMAGE FULL-SCREEN BACKGROUND PLAYBACK & SYNCHRONIZATION
  const defaultVideo = isIntro ? "/videos/intros/intro_cinematic_gold.mp4" : "/videos/outros/outro_youtube_subscribe.mp4";
  const mediaSrc = content.imageUrl || content.videoUrl || item.videoUrl || defaultVideo;
  let hasDrawnVideo = false;

  const isImageMedia = Boolean(content.imageUrl && content.imageUrl.trim().length > 0) ||
    /\.(jpeg|jpg|png|webp|gif|svg)($|\?)/i.test(mediaSrc);

  if (isImageMedia) {
    const imgEl = getOrLoadIntroLogo(mediaSrc);
    if (imgEl && (imgEl.complete || imgEl.naturalWidth > 0)) {
      // aspect-correct: an uploaded photo used as an intro/outro backdrop is
      // covered and cropped, never stretched to the frame
      drawMediaCover(ctx, imgEl, imgEl.naturalWidth, imgEl.naturalHeight, 0, 0, canvasWidth, canvasHeight, "cover");
      hasDrawnVideo = true;
    }
  } else {
    const videoEl = getOrLoadIntroVideo(mediaSrc);
    if (videoEl) {
      try {
        // Sync video playback timestamp smoothly with insert elapsed time
        const targetTime = elapsed % (videoEl.duration || 6);
        if (Math.abs(videoEl.currentTime - targetTime) > 0.35) {
          videoEl.currentTime = targetTime;
        }
        // Handle audio volume & mute for customer video clips that might already contain sound
        const isMuted = item.audioSettings?.muted ?? false;
        const vol = item.audioSettings?.volume ?? 0.8;
        videoEl.muted = isMuted;
        videoEl.volume = isMuted ? 0 : Math.max(0, Math.min(1, vol));

        if (videoEl.paused) {
          videoEl.play().catch(() => {});
        }
        if (videoEl.readyState >= 2) {
          drawMediaCover(ctx, videoEl, videoEl.videoWidth, videoEl.videoHeight, 0, 0, canvasWidth, canvasHeight, "cover");
          hasDrawnVideo = true;
        }
      } catch {
        hasDrawnVideo = false;
      }
    }
  }

  // 2. PROCEDURAL HIGH-QUALITY BACKDROP FALLBACK & VIGNETTE
  if (!hasDrawnVideo) {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const bgGrad = ctx.createRadialGradient(
      canvasWidth * 0.5,
      canvasHeight * 0.45,
      canvasWidth * 0.05,
      canvasWidth * 0.5,
      canvasHeight * 0.5,
      canvasWidth * 0.75
    );

    if (item.type.includes("cyber")) {
      bgGrad.addColorStop(0, "rgba(6, 182, 212, 0.45)");
      bgGrad.addColorStop(0.5, "rgba(15, 23, 42, 0.95)");
      bgGrad.addColorStop(1, "rgba(2, 6, 23, 1.0)");
    } else if (item.type.includes("cosmic")) {
      bgGrad.addColorStop(0, "rgba(168, 85, 247, 0.45)");
      bgGrad.addColorStop(0.5, "rgba(24, 12, 48, 0.95)");
      bgGrad.addColorStop(1, "rgba(5, 5, 15, 1.0)");
    } else if (item.type.includes("countdown")) {
      bgGrad.addColorStop(0, "rgba(239, 68, 68, 0.4)");
      bgGrad.addColorStop(0.5, "rgba(40, 10, 15, 0.95)");
      bgGrad.addColorStop(1, "rgba(5, 5, 10, 1.0)");
    } else if (item.type.includes("sunset")) {
      bgGrad.addColorStop(0, "rgba(245, 158, 11, 0.45)");
      bgGrad.addColorStop(0.5, "rgba(45, 18, 10, 0.95)");
      bgGrad.addColorStop(1, "rgba(8, 6, 12, 1.0)");
    } else {
      bgGrad.addColorStop(0, "rgba(234, 179, 8, 0.35)");
      bgGrad.addColorStop(0.5, "rgba(25, 20, 10, 0.95)");
      bgGrad.addColorStop(1, "rgba(6, 6, 10, 1.0)");
    }

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Dynamic floating embers
    for (let i = 0; i < 24; i++) {
      const px = ((i * 137 + elapsed * 35) % canvasWidth);
      const py = (canvasHeight - ((i * 83 + elapsed * 55) % canvasHeight));
      const pr = 1.5 + (i % 3) * 1.5;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor + "55";
      ctx.fill();
    }
  }

  // Dark edge vignette for contrast
  const vigGrad = ctx.createRadialGradient(
    canvasWidth * 0.5,
    canvasHeight * 0.5,
    canvasWidth * 0.3,
    canvasWidth * 0.5,
    canvasHeight * 0.5,
    canvasWidth * 0.72
  );
  vigGrad.addColorStop(0, "rgba(0, 0, 0, 0.0)");
  vigGrad.addColorStop(1, "rgba(0, 0, 0, 0.75)");
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 3. TENSION GETTER SPECIAL EFFECTS
  const tensionStyle = content.tensionStyle || item.tensionStyle || (
    item.type.includes("countdown") ? "countdown" :
    item.type.includes("glitch") ? "glitch" :
    item.type.includes("warp") ? "warp" :
    item.type.includes("aperture") ? "aperture" :
    item.type.includes("pulse") ? "pulse" : "flare"
  );

  if (tensionStyle === "countdown") {
    // 3-2-1 CIRCULAR TENSION GAUGE
    const gaugeR = Math.min(canvasWidth, canvasHeight) * 0.16;
    const gX = canvasWidth * 0.5;
    const gY = canvasHeight * 0.36;
    const remaining = Math.max(1, 3 - Math.floor(progress * 3));
    const subProgress = (progress * 3) % 1.0;

    // Outer track
    ctx.beginPath();
    ctx.arc(gX, gY, gaugeR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 6;
    ctx.stroke();

    // Active glowing arc
    ctx.beginPath();
    ctx.arc(gX, gY, gaugeR, -Math.PI / 2, -Math.PI / 2 + (1 - subProgress) * Math.PI * 2);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Number pulse
    const numScale = 1.0 + (1 - subProgress) * 0.25;
    ctx.save();
    ctx.translate(gX, gY);
    ctx.scale(numScale, numScale);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 64px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 24;
    ctx.fillText(String(remaining), 0, 0);
    ctx.restore();
  } else if (tensionStyle === "glitch") {
    // CYBER CHROMATIC ABERRATION PULSE
    if (Math.sin(elapsed * 18) > 0.4) {
      const sliceCount = 6;
      for (let i = 0; i < sliceCount; i++) {
        const sy = (canvasHeight / sliceCount) * i + (Math.sin(elapsed * 30 + i) * 20);
        const sh = 12 + Math.random() * 24;
        const dx = (Math.sin(elapsed * 25 + i) * 24);
        ctx.fillStyle = i % 2 === 0 ? "rgba(6, 182, 212, 0.25)" : "rgba(236, 72, 153, 0.25)";
        ctx.fillRect(dx, sy, canvasWidth, sh);
      }
    }
    // High-tech corner bracket targets
    const bSize = 36;
    const bPad = 48;
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2.5;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(bPad, bPad + bSize);
    ctx.lineTo(bPad, bPad);
    ctx.lineTo(bPad + bSize, bPad);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(canvasWidth - bPad - bSize, bPad);
    ctx.lineTo(canvasWidth - bPad, bPad);
    ctx.lineTo(canvasWidth - bPad, bPad + bSize);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(bPad, canvasHeight - bPad - bSize);
    ctx.lineTo(bPad, canvasHeight - bPad);
    ctx.lineTo(bPad + bSize, canvasHeight - bPad);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(canvasWidth - bPad - bSize, canvasHeight - bPad);
    ctx.lineTo(canvasWidth - bPad, canvasHeight - bPad);
    ctx.lineTo(canvasWidth - bPad, canvasHeight - bPad - bSize);
    ctx.stroke();
  } else if (tensionStyle === "warp") {
    // COSMIC WARP STARFIELD STREAKS
    const cX = canvasWidth * 0.5;
    const cY = canvasHeight * 0.45;
    const starCount = 38;
    for (let i = 0; i < starCount; i++) {
      const angle = (i / starCount) * Math.PI * 2 + (elapsed * 0.3);
      const dist = ((i * 47 + elapsed * 320) % (canvasWidth * 0.55));
      const sx = cX + Math.cos(angle) * dist;
      const sy = cY + Math.sin(angle) * dist;
      const streakLen = Math.min(45, dist * 0.15);
      const ex = sx + Math.cos(angle) * streakLen;
      const ey = sy + Math.sin(angle) * streakLen;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = "rgba(168, 85, 247, 0.75)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  } else if (tensionStyle === "aperture") {
    // STUDIO CAMERA APERTURE BLADES
    const cX = canvasWidth * 0.5;
    const cY = canvasHeight * 0.38;
    const irisR = Math.min(canvasWidth, canvasHeight) * (0.12 + progress * 0.08);
    const blades = 6;
    ctx.save();
    ctx.translate(cX, cY);
    ctx.rotate(elapsed * 0.8);
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * irisR, Math.sin(a) * irisR);
      ctx.lineTo(Math.cos(a + 0.8) * (irisR * 1.6), Math.sin(a + 0.8) * (irisR * 1.6));
      ctx.strokeStyle = "rgba(56, 189, 248, 0.65)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  } else if (tensionStyle === "pulse") {
    // SHOCKWAVE HEARTBEAT PULSE
    const cX = canvasWidth * 0.5;
    const cY = canvasHeight * 0.38;
    const pulsePhase = (progress * 5) % 1.0;
    const pulseR = Math.min(canvasWidth, canvasHeight) * (0.05 + pulsePhase * 0.35);

    // Glowing expanding shockwave rings
    for (let r = 0; r < 3; r++) {
      const ringOffset = (pulsePhase + r * 0.33) % 1.0;
      const currentR = Math.min(canvasWidth, canvasHeight) * (0.05 + ringOffset * 0.3);
      ctx.beginPath();
      ctx.arc(cX, cY, currentR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${Math.max(0, (1 - ringOffset) * 0.7)})`;
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
  } else {
    // GOLDEN / CINEMATIC HORIZONTAL ANAMORPHIC FLARE
    const flareY = canvasHeight * 0.38;
    const flareGrad = ctx.createLinearGradient(0, flareY, canvasWidth, flareY);
    flareGrad.addColorStop(0, "rgba(234, 179, 8, 0)");
    flareGrad.addColorStop(0.3, "rgba(234, 179, 8, 0.25)");
    flareGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.85)");
    flareGrad.addColorStop(0.7, "rgba(234, 179, 8, 0.25)");
    flareGrad.addColorStop(1, "rgba(234, 179, 8, 0)");

    ctx.fillStyle = flareGrad;
    ctx.fillRect(0, flareY - 3, canvasWidth, 6);

    // Central expanding shockwave ring
    const ringProgress = (progress * 1.6) % 1.0;
    const ringR = ringProgress * (canvasWidth * 0.35);
    ctx.beginPath();
    ctx.arc(canvasWidth * 0.5, flareY, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(234, 179, 8, ${Math.max(0, 1 - ringProgress)})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // 4. LOGO IMAGE RENDERING (CENTERED OR TOP)
  const showLogo = content.showLogo !== false && content.includeLogo !== false;
  const logoUrl = content.logoUrl || "/scenering-logo.png";
  const logoImg = showLogo ? getOrLoadIntroLogo(logoUrl) : null;
  const logoScale = content.logoScale || 1.0;
  const logoPos = content.logoPosition || "center";

  let logoBottomY = canvasHeight * 0.32;

  if (showLogo && logoImg && (logoImg.complete || logoImg.naturalWidth > 0)) {
    const baseLogoWidth = Math.min(240, canvasWidth * 0.28) * logoScale * size;
    const aspect = (logoImg.naturalHeight || 1) / Math.max(1, logoImg.naturalWidth || 1);
    const logoHeight = baseLogoWidth * aspect;

    let lx = canvasWidth * 0.5 - baseLogoWidth * 0.5;
    let ly = logoPos === "top" ? canvasHeight * 0.12 : canvasHeight * 0.28 - logoHeight * 0.5;
    logoBottomY = ly + logoHeight;

    // Glowing halo behind logo
    const halo = ctx.createRadialGradient(
      canvasWidth * 0.5,
      ly + logoHeight * 0.5,
      10,
      canvasWidth * 0.5,
      ly + logoHeight * 0.5,
      baseLogoWidth * 0.8
    );
    halo.addColorStop(0, primaryColor + "44");
    halo.addColorStop(1, "transparent");
    ctx.fillStyle = halo;
    ctx.fillRect(lx - 40, ly - 40, baseLogoWidth + 80, logoHeight + 80);

    // Render crisp logo with drop shadow
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(logoImg, lx, ly, baseLogoWidth, logoHeight);
    ctx.restore();
  }

  // 5. TEXT CONTENT OVERLAYS
  const badgeText = content.badgeText || content.label || (isIntro ? "SPECIAL PRESENTATION" : "OFFICIAL RELEASE");
  const primaryText = content.primaryText || item.title || (isIntro ? "THE ORIGINAL STORY" : "THANKS FOR WATCHING!");
  const secondaryText = content.secondaryText || (isIntro ? "An Original Scenering Production" : "Subscribe and share with your friends");

  // Dynamic layout offsets
  const textCenterY = showLogo && logoPos === "center" ? Math.max(canvasHeight * 0.52, logoBottomY + 36) : canvasHeight * 0.48;

  // Eyebrow / Tension Badge
  if (badgeText) {
    ctx.save();
    ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
    const badgeW = ctx.measureText(badgeText.toUpperCase()).width + 36;
    const badgeH = 28;
    const bX = canvasWidth * 0.5 - badgeW * 0.5;
    const bY = textCenterY - 58;

    roundRect(ctx, bX, bY, badgeW, badgeH, 14);
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = primaryColor + "aa";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText.toUpperCase(), canvasWidth * 0.5, bY + badgeH * 0.5 + 1);
    ctx.restore();
  }

  // Primary Title
  ctx.save();
  const titleFontSize = Math.max(26, Math.min(46, Math.floor(canvasWidth * 0.038))) * size;
  ctx.font = `bold ${titleFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Dramatic drop shadow for 100% legibility on dynamic video frames
  ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "#ffffff";

  wrapText(ctx, primaryText, canvasWidth * 0.5, textCenterY, canvasWidth * 0.82, titleFontSize * 1.25);
  ctx.restore();

  // Secondary Subtitle / Tagline
  if (secondaryText) {
    ctx.save();
    const subFontSize = Math.max(15, Math.min(22, Math.floor(canvasWidth * 0.018))) * size;
    ctx.font = `500 ${subFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = "#e2e8f0";

    wrapText(ctx, secondaryText, canvasWidth * 0.5, textCenterY + 54, canvasWidth * 0.78, subFontSize * 1.35);
    ctx.restore();
  }

  // 6. OUTRO CALL TO ACTION SLATES & SUBSCRIBE BUTTON
  if (!isIntro) {
    const slateW = Math.min(220, canvasWidth * 0.22);
    const slateH = slateW * 0.56;
    const slateY = canvasHeight * 0.74;

    // Watch Next Frame 1 (Left)
    const leftSlateX = canvasWidth * 0.5 - slateW - 18;
    roundRect(ctx, leftSlateX, slateY, slateW, slateH, 12);
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("▶ WATCH NEXT", leftSlateX + slateW * 0.5, slateY + slateH * 0.5);

    // Watch Next Frame 2 (Right)
    const rightSlateX = canvasWidth * 0.5 + 18;
    roundRect(ctx, rightSlateX, slateY, slateW, slateH, 12);
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.fillText("▶ RECENT VIDEO", rightSlateX + slateW * 0.5, slateY + slateH * 0.5);

    // Animated SUBSCRIBE Button in Center
    const btnW = Math.min(210, canvasWidth * 0.24);
    const btnH = 46;
    const btnX = canvasWidth * 0.5 - btnW * 0.5;
    const btnY = canvasHeight * 0.89;

    roundRect(ctx, btnX, btnY, btnW, btnH, 23);
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
    btnGrad.addColorStop(0, "#ef4444");
    btnGrad.addColorStop(1, "#b91c1c");
    ctx.fillStyle = btnGrad;
    ctx.shadowColor = "rgba(239, 68, 68, 0.5)";
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔔 SUBSCRIBE", canvasWidth * 0.5, btnY + btnH * 0.5 + 1);
  }

  ctx.restore();
}

// ---------------- OTHER CARDS ----------------
function renderOtherCard(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  x: number,
  y: number,
  size: number,
  canvasWidth: number
) {
  const content = item.content || {};
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);

  switch (item.type) {
    case "chapter": {
      const cw = Math.min(860, canvasWidth * 0.85);
      const ch = 170;
      roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 16);
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#818cf8";
      ctx.font = "bold 14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(content.label || "CHAPTER", 0, -ch / 2 + 45);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 34px system-ui";
      ctx.fillText(content.primaryText || "The New Beginning", 0, -ch / 2 + 95);
      break;
    }

    case "person": {
      const pw = 360;
      const ph = 80;
      roundRect(ctx, -pw / 2, -ph / 2, pw, ph, 12);
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.strokeStyle = "rgba(99, 102, 241, 0.7)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 19px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(content.primaryText || "Jane Doe", -pw / 2 + 20, -ph / 2 + 32);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px system-ui";
      ctx.fillText(content.secondaryText || "Guest Speaker", -pw / 2 + 20, -ph / 2 + 58);
      break;
    }

    case "location": {
      const lw = 300;
      const lh = 56;
      roundRect(ctx, -lw / 2, -lh / 2, lw, lh, 28);
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 17px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`📍 ${content.primaryText || "Kyoto, Japan"}`, 0, 0);
      break;
    }

    case "stats": {
      const sw = 360;
      const sh = 160;
      roundRect(ctx, -sw / 2, -sh / 2, sw, sh, 18);
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#a5b4fc";
      ctx.font = "bold 56px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(content.number || "84%", 0, -sh / 2 + 65);

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "500 16px system-ui";
      wrapText(ctx, content.primaryText || "Productivity increase reported by customers", 0, -sh / 2 + 105, sw - 40, 22);
      break;
    }

    default: {
      const bw = 400;
      const bh = 90;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 14);
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.fill();

      if (content.label) {
        ctx.fillStyle = "#818cf8";
        ctx.font = "bold 12px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(content.label, 0, -bh / 2 + 28);
      }

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(content.primaryText || item.title, 0, content.label ? 10 : 0);
      break;
    }
  }

  ctx.restore();
}

// ---------------- SPECIAL EFFECTS ----------------
function renderSpecialEffect(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  w: number,
  h: number,
  elapsed: number,
  progress: number
) {
  ctx.save();
  switch (item.type) {
    case "flash":
    case "white_flash": {
      // Rapid decay flash
      const flashAlpha = Math.max(0, 1 - progress * 1.4);
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.85})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "glitch": {
      const sliceCount = 8;
      for (let i = 0; i < sliceCount; i++) {
        const sy = Math.random() * h;
        const sh = 10 + Math.random() * 30;
        const offset = (Math.random() - 0.5) * 25;
        ctx.fillStyle = i % 2 === 0 ? "rgba(255, 0, 80, 0.25)" : "rgba(0, 240, 255, 0.25)";
        ctx.fillRect(offset, sy, w, sh);
      }
      break;
    }

    case "light_leak": {
      const leakGrad = ctx.createRadialGradient(w * 0.8, h * 0.2, 50, w * 0.8, h * 0.2, w * 0.6);
      leakGrad.addColorStop(0, "rgba(255, 140, 40, 0.45)");
      leakGrad.addColorStop(0.5, "rgba(255, 70, 120, 0.2)");
      leakGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = leakGrad;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "rain": {
      ctx.strokeStyle = "rgba(180, 210, 255, 0.35)";
      ctx.lineWidth = 1.5;
      const count = 70;
      for (let i = 0; i < count; i++) {
        const rx = ((i * 37 + elapsed * 600) % w);
        const ry = ((i * 53 + elapsed * 900) % h);
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 8, ry + 25);
        ctx.stroke();
      }
      break;
    }

    case "snow": {
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      const count = 50;
      for (let i = 0; i < count; i++) {
        const sx = ((i * 47 + Math.sin(elapsed + i) * 30) % w);
        const sy = ((i * 71 + elapsed * 80) % h);
        ctx.beginPath();
        ctx.arc(sx, sy, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "vhs":
    case "scan_lines": {
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      for (let y = 0; y < h; y += 4) {
        ctx.fillRect(0, y, w, 1.5);
      }
      // VHS tracking bar
      const barY = (elapsed * 120) % h;
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(0, barY, w, 20);
      break;
    }

    case "bokeh": {
      const orbs = 14;
      for (let i = 0; i < orbs; i++) {
        const ox = (i * 97) % w;
        const oy = ((i * 127 + elapsed * 15) % h);
        const r = 25 + (i % 5) * 12;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 220, 150, ${0.08 + (i % 3) * 0.04})`;
        ctx.fill();
      }
      break;
    }

    case "fog": {
      const fogGrad = ctx.createLinearGradient(0, h * 0.6, 0, h);
      fogGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
      fogGrad.addColorStop(1, "rgba(230, 240, 250, 0.35)");
      ctx.fillStyle = fogGrad;
      ctx.fillRect(0, h * 0.6, w, h * 0.4);
      break;
    }

    default:
      break;
  }
  ctx.restore();
}

// ---------------- BRANDING ----------------
function renderBranding(
  ctx: CanvasRenderingContext2D,
  item: TimelineInsert,
  x: number,
  y: number,
  size: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);

  const text = item.content?.primaryText || "SCENERINGS";
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = "bold 15px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 8;
  ctx.fillText(text, 0, 0);

  ctx.restore();
}

// Helper: Wrap text inside maximum width
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = words[n] + " ";
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
}

/**
 * Standardized High-Precision Image Drawer with Visible Camera Motion (Ken Burns, Zooms, Pans, Shakes)
 * Used across both VideoPreview and RenderView to guarantee identical, cinematic results.
 */
export function drawSceneImageWithMotion(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  scene: Scene,
  progress: number, // 0 to 1
  canvasW: number,
  canvasH: number
) {
  const p = Math.max(0, Math.min(1, progress));
  const motion = scene.motion_effect || "ken_burns";
  // Camera Motion transforms
  let motionScale = 1.0;
  let motionPanX = 0;
  let motionPanY = 0;

  switch (motion) {
    case "zoom_in": {
      // Smooth cinematic push-in from 1.0 to 1.24
      motionScale = 1.0 + p * 0.24;
      break;
    }
    case "zoom_out": {
      // Smooth dramatic pull-out from 1.24 down to 1.02
      motionScale = 1.24 - p * 0.22;
      break;
    }
    case "pan_left": {
      // Zoomed slightly so no black edges, panning smoothly right-to-left
      motionScale = 1.18;
      const travel = canvasW * 0.12;
      motionPanX = (0.5 - p) * travel;
      break;
    }
    case "pan_right": {
      // Zoomed slightly, panning smoothly left-to-right
      motionScale = 1.18;
      const travel = canvasW * 0.12;
      motionPanX = (p - 0.5) * travel;
      break;
    }
    case "shake": {
      // Visible handheld camera shake
      motionScale = 1.14;
      const shakeAmt = (1 - p * 0.3) * (canvasW * 0.018);
      motionPanX = (Math.sin(p * 45) + Math.cos(p * 31)) * shakeAmt;
      motionPanY = (Math.cos(p * 41) + Math.sin(p * 27)) * shakeAmt;
      break;
    }
    case "floating": {
      // Gentle floating dream drift
      motionScale = 1.12;
      motionPanX = Math.sin(p * Math.PI * 2) * (canvasW * 0.025);
      motionPanY = Math.cos(p * Math.PI * 1.5) * (canvasH * 0.025);
      break;
    }
    case "slow_zoom": {
      motionScale = 1.0 + p * 0.10;
      break;
    }
    case "subtle_camera": {
      motionScale = 1.08;
      motionPanX = Math.sin(p * Math.PI * 3) * (canvasW * 0.015);
      motionPanY = Math.cos(p * Math.PI * 2) * (canvasH * 0.015);
      break;
    }
    case "pulse": {
      const beat = Math.sin(p * Math.PI * 8);
      motionScale = 1.04 + Math.max(0, beat) * 0.08;
      break;
    }
    case "none": {
      motionScale = 1.0;
      break;
    }
    case "ken_burns":
    default: {
      // Classic Ken Burns: gentle zoom + subtle diagonal drift
      motionScale = 1.04 + p * 0.14;
      motionPanX = (p - 0.5) * (canvasW * 0.04);
      motionPanY = (0.5 - p) * (canvasH * 0.03);
      break;
    }
  }

  // Placement is delegated to the shared framing engine so this helper, the
  // live preview and the exported video agree, and so crop / rotate / flip /
  // blurred-fill all work here too. The engine centres the photo itself, so
  // only the motion's own pan is handed over.
  drawSceneImage(ctx, img, scene, canvasW, canvasH, {
    motionScale,
    motionDx: motionPanX,
    motionDy: motionPanY,
  });
}

