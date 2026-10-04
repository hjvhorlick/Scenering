/**
 * One source of truth for the Scenering watermark in previews and exports.
 * Coordinates are derived from the actual output canvas, not its CSS size, so
 * portrait phone videos retain a visible safe-area inset instead of hugging
 * (or appearing clipped by) the left edge.
 */
export interface WatermarkLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  shadowBlur: number;
  shadowOffsetY: number;
}

const REFERENCE_WIDTH = 1280;
const REFERENCE_HEIGHT = 720;
const BASE_WIDTH = 360; // Deliberately 2× the original 180px watermark.
const LEFT_SAFE_AREA = 96; // Twice the previous 48px inset; keeps phone crops comfortably clear.
const TOP_SAFE_AREA = 20;

export function getWatermarkLayout(
  canvasWidth: number,
  canvasHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  scale = 1
): WatermarkLayout {
  const widthRatio = Math.max(0.01, canvasWidth / REFERENCE_WIDTH);
  const heightRatio = Math.max(0.01, canvasHeight / REFERENCE_HEIGHT);
  const safeScale = Math.max(0.4, Math.min(2, Number.isFinite(scale) ? scale : 1));
  const x = Math.max(12, Math.round(LEFT_SAFE_AREA * widthRatio));
  const y = Math.max(10, Math.round(TOP_SAFE_AREA * heightRatio));
  const requestedWidth = Math.max(40, Math.round(BASE_WIDTH * safeScale * widthRatio));
  // Keep the complete logo inside unusually narrow canvases while preserving
  // the same safe area on both sides.
  const width = Math.max(1, Math.min(requestedWidth, Math.max(1, canvasWidth - x * 2)));
  const ratio = Math.max(1, naturalWidth) / Math.max(1, naturalHeight);
  const height = Math.max(10, Math.round(width / ratio));

  return {
    x,
    y,
    width,
    height,
    shadowBlur: Math.max(2, 8 * widthRatio),
    shadowOffsetY: Math.max(1, 2 * widthRatio),
  };
}
