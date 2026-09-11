import type { CustomerLogoConfig, Scene, TimelineInsert } from "../types";
import { applySceneFilter, getMotionTransform, renderTimelineInsert } from "./render-effects";

export type SubtitleStyle = "karaoke" | "banner" | "minimal" | "yellow";

/**
 * Extra breathing room added after a narration clip before the scene cuts,
 * so the last syllable is never clipped off.
 */
export const NARRATION_TAIL_SECONDS = 0.6;

/** Default amplitude handed to audio-reactive inserts when no real audio is analysed. */
export const DEFAULT_AUDIO_LEVEL = 0.4;

export interface SceneSlot {
  scene: Scene;
  index: number;
  /** Absolute start time in seconds from the beginning of the video. */
  start: number;
  /** Playback length in seconds (scene duration, extended to fit narration). */
  duration: number;
}

/**
 * Turns the ordered scene list into an absolute timeline. A scene is held on
 * screen for at least as long as its narration (plus a short tail) so voice and
 * picture never drift apart.
 */
export function buildSceneTimeline(
  scenes: Scene[],
  narrationDurations?: Map<number, number>
): SceneSlot[] {
  let cursor = 0;
  return scenes.map((scene, index) => {
    const narration = narrationDurations?.get(scene.id) ?? 0;
    const duration =
      narration > 0
        ? Math.max(scene.duration || 1, narration + NARRATION_TAIL_SECONDS)
        : Math.max(0.1, scene.duration || 1);

    const slot: SceneSlot = { scene, index, start: cursor, duration };
    cursor += duration;
    return slot;
  });
}

export function getTimelineDuration(timeline: SceneSlot[]): number {
  return timeline.reduce((sum, slot) => sum + slot.duration, 0);
}

/** Finds the scene visible at a given absolute time (falls back to the last scene). */
export function findSlotAt(timeline: SceneSlot[], time: number): SceneSlot | null {
  if (timeline.length === 0) return null;
  for (let i = 0; i < timeline.length; i++) {
    const slot = timeline[i];
    if (time < slot.start + slot.duration) return slot;
  }
  return timeline[timeline.length - 1];
}

export interface CompositionOptions {
  width: number;
  height: number;
  /** Total length of the composition in seconds. */
  duration: number;
  timeline: SceneSlot[];
  /** Loaded image per scene index (same order as the timeline). */
  images: (HTMLImageElement | null)[];
  inserts?: TimelineInsert[];
  watermark?: HTMLImageElement | null;
  watermarkScale?: number;
  watermarkOpacity?: number;
  customerLogo?: CustomerLogoConfig | null;
  customerLogoImage?: HTMLImageElement | null;
  includeSubtitles?: boolean;
  subtitleStyle?: SubtitleStyle;
  /** Optional 0..1 amplitude at a given time, used by audio-reactive inserts. */
  audioLevelAt?: (time: number) => number;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.rect(x, y, w, h);
}

/**
 * Draws one complete frame of the video at absolute `time`.
 * Used by both the real-time WebM recorder and the offline MP4 encoder so the
 * two export paths stay pixel-identical.
 */
export function drawCompositionFrame(
  ctx: CanvasRenderingContext2D,
  comp: CompositionOptions,
  time: number
): void {
  const { width, height } = comp;
  const slot = findSlotAt(comp.timeline, time);
  if (!slot) return;

  const clampedTime = Math.max(0, Math.min(time, slot.start + slot.duration - 0.0001));
  const progressInScene = Math.max(0, Math.min(1, (clampedTime - slot.start) / slot.duration));

  // --- Background ---
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  // --- Scene image with camera motion ---
  const img = comp.images[slot.index];
  if (img) {
    const { scale, dx, dy } = getMotionTransform(
      slot.scene.motion_effect,
      progressInScene,
      width,
      height
    );
    ctx.drawImage(img, dx, dy, width * scale, height * scale);
  }

  // --- Cinematic colour grade ---
  applySceneFilter(ctx, slot.scene.filter, width, height);

  // --- Scenering watermark (top-left) ---
  const wm = comp.watermark;
  if (wm && wm.complete && (comp.watermarkOpacity ?? 1) > 0) {
    const scaleRatio = width / 1280;
    const wmWidth = 200 * scaleRatio * (comp.watermarkScale ?? 1);
    const wmHeight = (wmWidth * wm.naturalHeight) / wm.naturalWidth;
    const posX = 24 * scaleRatio;
    const posY = 20 * scaleRatio;
    const padX = 10 * scaleRatio;
    const padY = 6 * scaleRatio;
    const rad = 10 * scaleRatio;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, comp.watermarkOpacity ?? 1));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 10 * scaleRatio;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2 * scaleRatio;
    ctx.fillStyle = "rgba(10, 12, 22, 0.78)";
    roundRectPath(ctx, posX - padX, posY - padY, wmWidth + padX * 2, wmHeight + padY * 2, rad);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = Math.max(1, 1 * scaleRatio);
    ctx.stroke();

    ctx.drawImage(wm, posX, posY, wmWidth, wmHeight);
    ctx.restore();
  }

  // --- Customer brand logo (top-right) ---
  const logo = comp.customerLogo;
  const logoImg = comp.customerLogoImage;
  if (logo?.enabled && logo.url && logoImg && logoImg.complete) {
    const scaleRatio = width / 1280;
    const cScale = logo.scale ?? 1.0;
    const cMargin = (logo.margin ?? 20) * scaleRatio;
    const cWidth = Math.round(150 * cScale * scaleRatio);
    const cHeight = (cWidth * logoImg.naturalHeight) / logoImg.naturalWidth;
    const cX = width - cWidth - cMargin;
    const cY = cMargin;
    const cPadX = 8 * scaleRatio;
    const cPadY = 6 * scaleRatio;

    ctx.save();
    ctx.globalAlpha = Math.max(0.1, Math.min(1.0, logo.opacity ?? 1.0));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 8 * scaleRatio;
    ctx.fillStyle = "rgba(10, 12, 22, 0.72)";
    roundRectPath(ctx, cX - cPadX, cY - cPadY, cWidth + cPadX * 2, cHeight + cPadY * 2, 8 * scaleRatio);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = Math.max(1, 1 * scaleRatio);
    ctx.stroke();

    ctx.drawImage(logoImg, cX, cY, cWidth, cHeight);
    ctx.restore();
  }

  // --- Burn-in subtitles ---
  if (comp.includeSubtitles && slot.scene.text) {
    const words = slot.scene.text.split(" ");
    const lines: string[] = [];
    let curLine = "";
    const maxW = width - 180;

    ctx.font = `bold ${Math.round(height * 0.038)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";

    for (const w of words) {
      const test = curLine ? curLine + " " + w : w;
      if (ctx.measureText(test).width > maxW && curLine) {
        lines.push(curLine);
        curLine = w;
      } else {
        curLine = test;
      }
    }
    if (curLine) lines.push(curLine);

    const lh = Math.round(height * 0.052);
    const startY = height - Math.round(height * 0.09) - (lines.length - 1) * lh;
    const style = comp.subtitleStyle ?? "karaoke";

    if (style === "karaoke") {
      lines.forEach((line, i) => {
        const textY = startY + i * lh;
        const textWidth = ctx.measureText(line).width;
        const pillPaddingX = 24;
        const pillPaddingY = 8;

        ctx.fillStyle = "rgba(0,0,0,0.72)";
        roundRectPath(
          ctx,
          width / 2 - textWidth / 2 - pillPaddingX,
          textY - lh * 0.72,
          textWidth + pillPaddingX * 2,
          lh,
          10
        );
        ctx.fill();

        ctx.fillStyle = "#fbbf24";
        ctx.fillText(line, width / 2, textY);
      });
    } else if (style === "banner") {
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(0, startY - lh, width, lh * (lines.length + 0.8));
      ctx.fillStyle = "#ffffff";
      lines.forEach((line, i) => ctx.fillText(line, width / 2, startY + i * lh));
    } else if (style === "yellow") {
      ctx.shadowColor = "rgba(0,0,0,0.95)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#facc15";
      lines.forEach((line, i) => ctx.fillText(line, width / 2, startY + i * lh));
      ctx.shadowColor = "transparent";
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.95)";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#ffffff";
      lines.forEach((line, i) => ctx.fillText(line, width / 2, startY + i * lh));
      ctx.shadowColor = "transparent";
    }
  }

  // --- Timeline inserts & overlays ---
  if (comp.inserts && comp.inserts.length > 0) {
    const level = comp.audioLevelAt ? comp.audioLevelAt(time) : DEFAULT_AUDIO_LEVEL;
    comp.inserts.forEach((insert) => {
      renderTimelineInsert(ctx, insert, clampedTime, width, height, level);
    });
  }
}
