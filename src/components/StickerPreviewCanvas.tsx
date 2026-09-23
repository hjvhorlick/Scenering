import { useEffect, useRef } from "react";
import { computeMotion, applyMotion, type MotionPreset } from "../lib/overlay-motion";
import { drawSticker, resolveStickerId } from "../lib/sticker-3d";

import { startPreviewLoop } from "../lib/preview-loop";
interface StickerPreviewCanvasProps {
  stickerId: string;
  motionPreset?: string;
  motionSpeed?: number;
  motionAmount?: number;
  tint?: string | null;
  glow?: number;
  shadow?: number;
  /** css pixel size of the square preview */
  size?: number;
  /** pause the loop (e.g. off-screen) */
  paused?: boolean;
  /** checkered backdrop makes the drop shadow readable */
  backdrop?: "dark" | "checker" | "none";
  className?: string;
}

/**
 * Renders a sticker exactly the way the video renderer will, on a small
 * looping canvas. Using the same drawSticker/computeMotion pair as the export
 * means the grid button IS the preview — it cannot drift from the real output.
 */
export default function StickerPreviewCanvas({
  stickerId,
  motionPreset,
  motionSpeed = 1,
  motionAmount = 1,
  tint = null,
  glow = 0.35,
  shadow = 0.85,
  size = 96,
  paused = false,
  backdrop = "dark",
  className = "",
}: StickerPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startRef = useRef<number>(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    // the sticker artwork is authored in a ~200px box
    const unit = (size / 210) * dpr;
    const resolved = resolveStickerId(stickerId);
    // loop the motion over 4s so short presets still read as continuous
    const LOOP = 4;

    const draw = (now: number) => {
      const elapsed = ((now - startRef.current) / 1000) % LOOP;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (backdrop === "dark") {
        const g = ctx.createRadialGradient(
          canvas.width / 2,
          canvas.height / 2,
          0,
          canvas.width / 2,
          canvas.height / 2,
          canvas.width * 0.7
        );
        g.addColorStop(0, "#1b2230");
        g.addColorStop(1, "#0a0d14");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (backdrop === "checker") {
        const sq = 8 * dpr;
        for (let y = 0; y < canvas.height; y += sq) {
          for (let x = 0; x < canvas.width; x += sq) {
            ctx.fillStyle = ((x / sq + y / sq) | 0) % 2 === 0 ? "#151b26" : "#1d2431";
            ctx.fillRect(x, y, sq, sq);
          }
        }
      }

      const motion = computeMotion(elapsed, LOOP, {
        preset: (motionPreset as MotionPreset) || "float",
        speed: motionSpeed,
        amount: motionAmount,
        // the thumbnail loops, so replay the pop each cycle
        entrance: true,
      });

      ctx.save();
      // nudged up slightly to leave room for the contact shadow
      ctx.translate(canvas.width / 2, canvas.height / 2 - 4 * dpr);
      ctx.scale(unit, unit);
      applyMotion(ctx, motion);
      drawSticker(ctx, resolved, { motion, time: elapsed, tint, shadow, glow });
      ctx.restore();
    };

    if (paused) {
      // render a single settled frame
      const motion = computeMotion(1.2, LOOP, {
        preset: (motionPreset as MotionPreset) || "float",
        speed: motionSpeed,
        amount: motionAmount,
        entrance: false,
      });
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2 - 4 * dpr);
      ctx.scale(unit, unit);
      applyMotion(ctx, motion);
      drawSticker(ctx, resolved, { motion, time: 1.2, tint, shadow, glow });
      ctx.restore();
    } else {
      startRef.current = performance.now();
      // ~30fps cap + skip painting while off-screen (keeps scrolling smooth
      // on slower machines, even with dozens of sticker cards mounted)
      return startPreviewLoop(canvas, draw, { fps: 30 });
    }

    return undefined;
  }, [stickerId, motionPreset, motionSpeed, motionAmount, tint, glow, shadow, size, paused, backdrop]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className={`rounded-lg ${className}`}
    />
  );
}
