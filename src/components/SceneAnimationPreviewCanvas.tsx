import { useEffect, useMemo, useRef, useState } from "react";
import type { AspectRatioType, Scene } from "../types";
import { drawSceneImage, frameSizeFor, sceneIsBlankColor } from "../lib/scene-framing";
import { loadSceneImage } from "../lib/scene-image-loader";
import { getFilterCanvas, type VideoFilterConfig } from "../data/video-filters";
import {
  getSceneCameraTransform,
  renderSceneAnimationEffects,
  resolveSceneAnimation,
} from "../lib/scene-animation";
import { startPreviewLoop } from "../lib/preview-loop";

interface SceneAnimationPreviewCanvasProps {
  scene: Scene;
  aspectRatio?: AspectRatioType;
  videoFilter?: VideoFilterConfig | null;
  width?: number;
  className?: string;
}

/**
 * A single-scene animation preview: same still, same per-scene camera motion
 * and same procedural effect stack that the full preview/export uses.
 */
export default function SceneAnimationPreviewCanvas({
  scene,
  aspectRatio = "16:9",
  videoFilter = null,
  width = 520,
  className = "",
}: SceneAnimationPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  const frame = useMemo(() => frameSizeFor(aspectRatio), [aspectRatio]);
  const height = Math.round((width * frame.h) / frame.w);
  const duration = Math.max(2, scene.duration || 8);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    imgRef.current = null;
    if (!scene.image_url) {
      setLoaded(sceneIsBlankColor(scene));
      return;
    }
    loadSceneImage(scene.image_url, scene.order_index || 0, { fallback: "none" }).then((res) => {
      if (cancelled) return;
      imgRef.current = res?.img ?? null;
      setLoaded(Boolean(res));
    });
    return () => {
      cancelled = true;
    };
  }, [scene.image_url, scene.order_index, scene.blank_color]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(width * dpr);
    const ch = Math.round(height * dpr);
    canvas.width = cw;
    canvas.height = ch;

    const started = performance.now();
    const draw = (now: number) => {
      const elapsed = ((now - started) / 1000) % duration;
      const progress = elapsed / duration;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = "#05070c";
      ctx.fillRect(0, 0, cw, ch);

      if (sceneIsBlankColor(scene) && scene.blank_color) {
        ctx.fillStyle = scene.blank_color;
        ctx.fillRect(0, 0, cw, ch);
      }

      const img = imgRef.current;
      if (img && img.naturalWidth > 0) {
        const { scale, dx, dy } = getSceneCameraTransform(scene, true, progress, cw, ch, scene.order_index || 0);
        drawSceneImage(ctx, img, scene, cw, ch, {
          motionScale: scale,
          motionDx: dx + (cw * scale - cw) / 2,
          motionDy: dy + (ch * scale - ch) / 2,
          filter: getFilterCanvas(videoFilter, cw),
        });
      }

      renderSceneAnimationEffects(ctx, scene, cw, ch, elapsed, progress, { enabled: true });
    };

    draw(performance.now());
    return startPreviewLoop(canvas, draw, { fps: 24 });
  }, [scene, width, height, duration, videoFilter]);

  const count = resolveSceneAnimation(scene.animation).effects?.filter((e) => e.enabled !== false).length || 0;

  return (
    <div className={`relative overflow-hidden rounded-xl border border-hairline bg-black ${className}`} style={{ width, height }}>
      <canvas ref={canvasRef} style={{ width, height }} className="block rounded-xl" />
      {!loaded && !sceneIsBlankColor(scene) && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-400 bg-black/40">
          Loading scene image…
        </div>
      )}
      <div className="absolute left-2 bottom-2 px-2 py-1 rounded-lg bg-gray-950/80 border border-white/10 text-[10px] text-gray-200 backdrop-blur">
        Previewing {count} environmental {count === 1 ? "effect" : "effects"} + per-scene camera
      </div>
    </div>
  );
}
