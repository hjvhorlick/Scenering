import { useEffect, useRef } from "react";
import type { InsertVisualOptions, TimelineInsert } from "../types";
import { getCtaBadgeLayout, paintCtaWithFloatShadow, renderCallToAction } from "../lib/render-effects";

/**
 * The little "image" that sits on every call-to-action option chip.
 *
 * Instead of a flat colour swatch or an emoji stand-in, each option previews the
 * user's own badge with that option applied — the real wording, brand mark,
 * shape, finish and colours — painted by the same renderer the video uses. So
 * choosing a shape or a colour theme is a choice between pictures of what will
 * actually land in the export, and the preview sections always look like the
 * finished button.
 *
 * `patch` is merged over the insert's current visual options, which is how the
 * chip can show "this badge, but square" or "this badge, in these colours".
 */
interface CtaOptionThumbProps {
  item: TimelineInsert;
  /** visual options to apply on top of the insert's own settings */
  patch?: Partial<InsertVisualOptions>;
  /** display size in CSS px (painted at 2x for a crisp chip) */
  width?: number;
  height?: number;
  /** extra scale on top of the fit-to-box size */
  zoom?: number;
}

export default function CtaOptionThumb({
  item,
  patch,
  width = 128,
  height = 56,
  zoom = 1,
}: CtaOptionThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);

    // A miniature of the studio stage the catalog cards use, so every chip reads
    // as "this is the badge on video" rather than a colour sample.
    const stage = ctx.createLinearGradient(0, 0, W * 0.35, H);
    stage.addColorStop(0, "#232c45");
    stage.addColorStop(1, "#0a0e18");
    ctx.fillStyle = stage;
    ctx.fillRect(0, 0, W, H);

    const probe: TimelineInsert = {
      ...item,
      id: `${item.id || item.type}-thumb`,
      presetPosition: "center",
      content: { ...(item.content || {}) },
      visualOptions: { ...(item.visualOptions || {}), ...(patch || {}), rotation: 0 },
    };

    const layout = getCtaBadgeLayout(probe, ctx);
    const fit = Math.min((W * 0.86) / layout.width, (H * 0.52) / layout.height) * zoom;

    ctx.translate(W / 2, H / 2);
    ctx.scale(fit, fit);
    const painted = paintCtaWithFloatShadow(ctx, probe, { settled: true, shadowIntensity: 0.55 });
    if (!painted) {
      renderCallToAction(ctx, probe, 0, 0, 1, 0, { settled: true });
    }
  }, [item, patch, zoom]);

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(width * 2)}
      height={Math.round(height * 2)}
      className="block w-full rounded-md"
      style={{ aspectRatio: `${width} / ${height}` }}
    />
  );
}
