import { useEffect, useRef, useState } from "react";
import type { SceneMotionType } from "../types";
import { getMotionTransform } from "../lib/render-effects";
import { startPreviewLoop } from "../lib/preview-loop";

interface MotionPreviewCanvasProps {
  /** Fill the parent's width instead of using a fixed CSS size. */
  responsive?: boolean;
  /** The motion applied to the sample image. */
  motion: SceneMotionType;
  /** Optional real scene image; a drawn stand-in is used when absent. */
  imageUrl?: string | null;
  /** Seconds for one pass of the effect, matching a real scene. */
  cycleSeconds?: number;
  width?: number;
  height?: number;
  /** Pause the animation (e.g. when the card is not selected). */
  paused?: boolean;
  className?: string;
}

/**
 * A small looping canvas that shows exactly what a camera-motion preset does,
 * using the same getMotionTransform() the preview and the export use. The
 * Setup screen previously offered these presets as text-only buttons, so there
 * was no way to tell whether the motion worked, or how strong it was.
 */
export default function MotionPreviewCanvas({
  motion,
  imageUrl,
  cycleSeconds = 6,
  width = 320,
  height = 180,
  paused = false,
  responsive = false,
  className = "",
}: MotionPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /** Measured CSS width when responsive; falls back to the width prop. */
  const [boxW, setBoxW] = useState(width);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const startRef = useRef<number>(performance.now());

  // Load the sample image, if one was given.
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
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl]);

  // Track the container width so the preview scales with the viewport rather
  // than overflowing a narrow phone screen.
  useEffect(() => {
    if (!responsive) {
      setBoxW(width);
      return;
    }
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) setBoxW(Math.round(w));
    });
    ro.observe(el);
    setBoxW(Math.round(el.getBoundingClientRect().width) || width);
    return () => ro.disconnect();
  }, [responsive, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = responsive ? Math.max(1, boxW) : width;
    const cssH = responsive ? Math.max(1, Math.round((cssW * height) / width)) : height;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const w = canvas.width;
    const h = canvas.height;

    /**
     * A stand-in "photograph" with plenty of structure — a horizon, a sun, hills
     * and a grid — so the movement is unmistakable even without a real image.
     */
    const drawStandIn = (c: CanvasRenderingContext2D, iw: number, ih: number) => {
      const sky = c.createLinearGradient(0, 0, 0, ih * 0.62);
      sky.addColorStop(0, "#1e3a8a");
      sky.addColorStop(0.55, "#7c3aed");
      sky.addColorStop(1, "#f97316");
      c.fillStyle = sky;
      c.fillRect(0, 0, iw, ih * 0.62);

      c.fillStyle = "#fbbf24";
      c.beginPath();
      c.arc(iw * 0.72, ih * 0.3, Math.min(iw, ih) * 0.09, 0, Math.PI * 2);
      c.fill();

      // Distant hills
      c.fillStyle = "#4c1d95";
      c.beginPath();
      c.moveTo(0, ih * 0.62);
      for (let x = 0; x <= iw; x += iw / 24) {
        c.lineTo(x, ih * 0.62 - Math.sin(x / (iw / 7)) * ih * 0.07 - ih * 0.03);
      }
      c.lineTo(iw, ih * 0.62);
      c.closePath();
      c.fill();

      // Ground
      c.fillStyle = "#064e3b";
      c.fillRect(0, ih * 0.62, iw, ih * 0.38);

      // Grid on the ground gives the eye something to track during pans
      c.strokeStyle = "rgba(255,255,255,0.22)";
      c.lineWidth = Math.max(1, iw / 400);
      for (let i = 0; i <= 16; i++) {
        const x = (i / 16) * iw;
        c.beginPath();
        c.moveTo(x, ih * 0.62);
        c.lineTo(iw / 2 + (x - iw / 2) * 2.2, ih);
        c.stroke();
      }
      for (let i = 1; i <= 6; i++) {
        const y = ih * 0.62 + Math.pow(i / 6, 2) * ih * 0.38;
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(iw, y);
        c.stroke();
      }

      // Corner markers make drift at the edges obvious
      c.fillStyle = "rgba(255,255,255,0.85)";
      const m = Math.min(iw, ih) * 0.05;
      for (const [cx, cy] of [
        [m, m],
        [iw - m, m],
        [m, ih - m],
        [iw - m, ih - m],
      ]) {
        c.beginPath();
        c.arc(cx, cy, m * 0.35, 0, Math.PI * 2);
        c.fill();
      }
    };

    // Build the sample once into an offscreen canvas.
    const sample = document.createElement("canvas");
    sample.width = Math.round(w * 1.6);
    sample.height = Math.round(h * 1.6);
    const sctx = sample.getContext("2d");

    const paintSample = () => {
      if (!sctx) return;
      sctx.clearRect(0, 0, sample.width, sample.height);
      const img = imgRef.current;
      if (img && img.complete && img.naturalWidth > 0) {
        // Cover the sample canvas without distorting the photo.
        const scale = Math.max(sample.width / img.naturalWidth, sample.height / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        sctx.drawImage(img, (sample.width - dw) / 2, (sample.height - dh) / 2, dw, dh);
      } else {
        drawStandIn(sctx, sample.width, sample.height);
      }
    };
    paintSample();

    const frame = () => {
      const elapsed = (performance.now() - startRef.current) / 1000;
      const p = (elapsed % cycleSeconds) / cycleSeconds;

      // Refresh the sample if the real image arrived after first paint.
      if (imgRef.current && imgRef.current.complete) paintSample();

      const { scale, dx, dy } = getMotionTransform(motion, p, w, h);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      // Same convention the renderers use: dx/dy already account for the
      // centring of the scaled image.
      ctx.translate(dx + (w * scale - w) / 2, dy + (h * scale - h) / 2);
      ctx.drawImage(sample, -(w * scale - w) / 2, -(h * scale - h) / 2, w * scale, h * scale);
      ctx.restore();
    };

    if (paused) {
      // Draw a single representative frame rather than animating.
      const { scale, dx, dy } = getMotionTransform(motion, 0.5, w, h);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(dx + (w * scale - w) / 2, dy + (h * scale - h) / 2);
      ctx.drawImage(sample, -(w * scale - w) / 2, -(h * scale - h) / 2, w * scale, h * scale);
      ctx.restore();
    } else {
      startRef.current = performance.now();
      // capped fps + no painting while the preview is scrolled away
      return startPreviewLoop(canvas, frame, { fps: 24 });
    }

    return undefined;
  }, [motion, cycleSeconds, width, height, paused, imageUrl, responsive, boxW]);

  if (responsive) {
    const cssH = Math.max(1, Math.round((Math.max(1, boxW) * height) / width));
    return (
      <div ref={wrapRef} className="w-full">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: cssH }}
          className={`rounded-lg bg-black ${className}`}
        />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className={`rounded-lg bg-black ${className}`}
    />
  );
}
