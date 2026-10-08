import type { PlanSlug } from "../config/plans";
import { getWatermarkLayout } from "./watermark-layout";

/**
 * Product-branding policy for the locally rendered video.
 *
 * A missing or unresolved membership is deliberately treated as Free. That
 * makes the safe/default state branded until the client has a confirmed paid
 * plan, and keeps this decision outside every creator-controlled setting.
 */
export function planRequiresSceneringWatermark(plan: PlanSlug | null | undefined): boolean {
  return plan !== "sceneflow" && plan !== "sceneforge";
}

/**
 * Paint the fixed Scenering mark as the final product-branding layer.
 *
 * This is intentionally not parameterised with opacity, scale, or position:
 * those are not creator preferences on the Free plan. Callers decide whether
 * the active plan requires the mark, then this function gives preview and
 * export exactly the same safe-area placement.
 */
export function drawSceneringWatermark(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  width: number,
  height: number,
): boolean {
  if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

  const watermark = getWatermarkLayout(width, height, image.naturalWidth, image.naturalHeight);
  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
    ctx.shadowBlur = watermark.shadowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = watermark.shadowOffsetY;
    ctx.drawImage(image, watermark.x, watermark.y, watermark.width, watermark.height);
    return true;
  } finally {
    ctx.restore();
  }
}
