import { useEffect, useRef, useState, useCallback } from "react";
import type { Scene } from "../types";
import {
  drawSceneImage,
  resolveFraming,
  frameSizeFor,
  placeImage,
  sceneIsBlankColor,
} from "../lib/scene-framing";
import { loadSceneImage } from "../lib/scene-image-loader";
import { getFilterCanvas, type VideoFilterConfig } from "../data/video-filters";

interface Props {
  scene: Partial<Scene>;
  aspectRatio?: string;
  /** rendered width in CSS pixels */
  width?: number;
  videoFilter?: VideoFilterConfig | null;
  /** drag the photo around directly on the preview */
  interactive?: boolean;
  /** show the crop rectangle handles instead of pan/zoom dragging */
  cropMode?: boolean;
  /** show the thirds grid and frame edges */
  showGuides?: boolean;
  onChange?: (updates: Partial<Scene>) => void;
  className?: string;
}

/**
 * Renders a scene photo with the SAME code the video export uses
 * (src/lib/scene-framing.ts), so what the user frames here is exactly what
 * ends up in the rendered file — including the blurred TikTok-style bars.
 */
export default function SceneFramePreview({
  scene,
  aspectRatio = "16:9",
  width = 320,
  videoFilter = null,
  interactive = false,
  cropMode = false,
  showGuides = false,
  onChange,
  className = "",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dragging, setDragging] = useState<null | "move" | "crop">(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const frame = frameSizeFor(aspectRatio);
  const height = Math.round((width * frame.h) / frame.w);
  const url = scene.image_url || "";

  useEffect(() => {
    setLoaded(false);
    if (!url) {
      imgRef.current = null;
      return;
    }
    let cancelled = false;
    // Same shared loader as the preview and the render, so this thumbnail
    // shows exactly the image those two will show.
    loadSceneImage(url, 0, { fallback: "none" }).then((res) => {
      if (cancelled) return;
      imgRef.current = res?.img ?? null;
      setLoaded(Boolean(res));
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#05070C";
    ctx.fillRect(0, 0, w, h);

    // A plain-colour scene has no photo to load, so paint its colour instead
    // of leaving the dark placeholder. Without this the scene looked empty in
    // every preview even though the colour was set and would render.
    if (sceneIsBlankColor(scene) && scene.blank_color) {
      ctx.fillStyle = scene.blank_color;
      ctx.fillRect(0, 0, w, h);
    }

    const img = imgRef.current;
    if (img && img.naturalWidth > 0) {
      drawSceneImage(ctx, img, scene, w, h, {
        filter: getFilterCanvas(videoFilter, w),
      });
    }

    if (showGuides) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = Math.max(1, dpr);
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo((w * i) / 3, 0);
        ctx.lineTo((w * i) / 3, h);
        ctx.moveTo(0, (h * i) / 3);
        ctx.lineTo(w, (h * i) / 3);
        ctx.stroke();
      }
      // safe area for captions and overlays
      ctx.strokeStyle = "rgba(99,102,241,0.45)";
      ctx.setLineDash([6 * dpr, 6 * dpr]);
      ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
      ctx.restore();
    }

    // outline the uncovered region so the user can see where bars will appear
    if (img && img.naturalWidth > 0) {
      const f = resolveFraming(scene);
      if (f.fit !== "cover") {
        const p = placeImage(img, w, h, f, { mode: "contain" });
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.lineWidth = Math.max(1, dpr);
        ctx.strokeRect(p.dx, p.dy, p.dw, p.dh);
        ctx.restore();
      }
    }
  }, [scene, width, height, videoFilter, showGuides, loaded]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ------------------------------------------------------------ interaction
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive || !onChange) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const f = resolveFraming(scene);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: cropMode ? f.crop.x : f.offsetX,
      oy: cropMode ? f.crop.y : f.offsetY,
    };
    setDragging(cropMode ? "crop" : "move");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d || !onChange) return;
    const dx = (e.clientX - d.x) / width;
    const dy = (e.clientY - d.y) / height;
    const f = resolveFraming(scene);
    if (cropMode) {
      const nx = Math.max(0, Math.min(1 - f.crop.w, d.ox - dx * f.crop.w * 2));
      const ny = Math.max(0, Math.min(1 - f.crop.h, d.oy - dy * f.crop.h * 2));
      onChange({ image_crop: { ...f.crop, x: nx, y: ny } });
    } else {
      onChange({
        image_offset_x: Math.round(Math.max(-50, Math.min(50, d.ox + dx * 100))),
        image_offset_y: Math.round(Math.max(-50, Math.min(50, d.oy + dy * 100))),
      });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(null);
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!interactive || !onChange) return;
    const f = resolveFraming(scene);
    const next = Math.max(0.25, Math.min(4, f.zoom * (e.deltaY > 0 ? 0.94 : 1.06)));
    onChange({ image_zoom: Math.round(next * 100) / 100 });
  };

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      <canvas
        ref={canvasRef}
        style={{ width, height }}
        className={`rounded-lg block bg-black ${
          interactive ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      />
      {!url && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-500 pointer-events-none">
          No image yet
        </div>
      )}
      {url && !loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-500 pointer-events-none">
          Loading…
        </div>
      )}
    </div>
  );
}
