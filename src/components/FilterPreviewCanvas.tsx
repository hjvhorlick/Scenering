import { useEffect, useRef } from "react";
import { getFilterCanvas, type VideoFilterConfig } from "../data/video-filters";
import { paintVideoFilter } from "../lib/video-filter-render";

/* A synthetic "scene" is painted whenever no real project image is available,
   so every filter example still shows a believable photo-like frame. */
function paintSampleScene(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  sky.addColorStop(0, "#1e3a8a");
  sky.addColorStop(0.45, "#60a5fa");
  sky.addColorStop(1, "#fcd9a8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // sun
  const sun = ctx.createRadialGradient(w * 0.74, h * 0.34, 0, w * 0.74, h * 0.34, w * 0.26);
  sun.addColorStop(0, "rgba(255,247,210,1)");
  sun.addColorStop(0.35, "rgba(255,214,130,0.75)");
  sun.addColorStop(1, "rgba(255,190,110,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  // far hills
  ctx.fillStyle = "#3f6f5f";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.68);
  ctx.quadraticCurveTo(w * 0.22, h * 0.5, w * 0.44, h * 0.66);
  ctx.quadraticCurveTo(w * 0.66, h * 0.82, w, h * 0.6);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // near hills
  ctx.fillStyle = "#1f3b30";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.82);
  ctx.quadraticCurveTo(w * 0.3, h * 0.68, w * 0.58, h * 0.85);
  ctx.quadraticCurveTo(w * 0.8, h * 0.96, w, h * 0.8);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // tree silhouettes for contrast detail
  ctx.fillStyle = "#0d1f19";
  for (let i = 0; i < 5; i++) {
    const x = w * (0.06 + i * 0.09);
    const th = h * (0.16 + (i % 3) * 0.05);
    ctx.beginPath();
    ctx.moveTo(x, h * 0.86);
    ctx.lineTo(x + w * 0.018, h * 0.86 - th);
    ctx.lineTo(x + w * 0.036, h * 0.86);
    ctx.closePath();
    ctx.fill();
  }

  // highlight streak (gives grades something bright to bite into)
  const streak = ctx.createLinearGradient(0, h * 0.62, w, h * 0.72);
  streak.addColorStop(0, "rgba(255,255,255,0)");
  streak.addColorStop(0.5, "rgba(255,240,210,0.35)");
  streak.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = streak;
  ctx.fillRect(0, h * 0.58, w, h * 0.16);
}

interface Props {
  config: VideoFilterConfig | null;
  /** real project frame to grade; falls back to the synthetic scene */
  imageUrl?: string;
  /** show the untouched frame instead (for before/after comparison) */
  showOriginal?: boolean;
  className?: string;
  /** internal render size — small for grid thumbs, large for the main preview */
  width?: number;
  height?: number;
  /** pause the animation loop (offscreen cards) */
  paused?: boolean;
}

export default function FilterPreviewCanvas({
  config,
  imageUrl,
  showOriginal = false,
  className = "",
  width = 320,
  height = 180,
  paused = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(performance.now());
  const stateRef = useRef({ config, showOriginal, paused });

  stateRef.current = { config, showOriginal, paused };

  useEffect(() => {
    if (!imageUrl) {
      imgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
    };
    img.onerror = () => {
      imgRef.current = null;
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastPaint = 0;

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      // thumbnails animate at ~24fps to keep a full grid cheap
      if (now - lastPaint < 41) return;
      lastPaint = now;

      const { config: cfg, showOriginal: orig, paused: isPaused } = stateRef.current;
      const t = isPaused ? 1.2 : (now - startRef.current) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);

      // 1. base frame, with the colour grade baked into the pixels
      ctx.save();
      if (!orig && cfg) {
        const grade = getFilterCanvas(cfg, w);
        if (grade && grade !== "none") ctx.filter = grade;
      }
      const img = imgRef.current;
      if (img && img.naturalWidth > 0) {
        const ir = img.naturalWidth / img.naturalHeight;
        const cr = w / h;
        let dw = w;
        let dh = h;
        if (ir > cr) {
          dh = h;
          dw = h * ir;
        } else {
          dw = w;
          dh = w / ir;
        }
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      } else {
        paintSampleScene(ctx, w, h);
      }
      ctx.restore();
      ctx.filter = "none";

      // 2. animated atmosphere layers
      if (!orig && cfg) paintVideoFilter(ctx, cfg, w, h, t);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height]);

  return <canvas ref={canvasRef} className={className} />;
}
