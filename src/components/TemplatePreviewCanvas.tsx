import { useEffect, useRef } from "react";
import { renderTextTemplate } from "../lib/render-text-template";
import type { TimelineInsert } from "../types";
import type { TextTemplateStyle } from "../data/text-templates";
import { startPreviewLoop } from "../lib/preview-loop";

interface TemplatePreviewCanvasProps {
  templateId: string;
  content?: Record<string, string>;
  styleOverrides?: Partial<TextTemplateStyle> | null;
  /** css width of the preview; height follows the 16:9 frame */
  width?: number;
  /** replay the entrance on a loop so slide-ins are visible in the grid */
  loop?: boolean;
  /** freeze on the settled frame */
  paused?: boolean;
  className?: string;
}

/**
 * Draws a text template with the very same renderer the video uses, over a
 * stand-in "video" backdrop so background transparency is actually visible.
 */
export default function TemplatePreviewCanvas({
  templateId,
  content,
  styleOverrides,
  width = 260,
  loop = true,
  paused = false,
  className = "",
}: TemplatePreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const height = Math.round((width * 9) / 16);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    // The renderer lays cards out for a full-size frame; scale that down.
    const FRAME_W = 1280;
    const scale = (width * dpr) / FRAME_W;

    const LOOP = 4.5;
    const DURATION = 4.5;

    const insert: TimelineInsert = {
      id: "preview",
      category: "text_templates",
      type: templateId,
      title: templateId,
      startTime: 0,
      duration: DURATION,
      position: { x: 0.5, y: 0.5 },
      size: 1,
      opacity: 1,
      content: (content || {}) as TimelineInsert["content"],
      visualOptions: {
        templateId,
        ...(styleOverrides ? { templateStyle: styleOverrides as Record<string, unknown> } : {}),
      },
    };

    /** A mock frame behind the card, so transparency reads truthfully. */
    const paintBackdrop = () => {
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, "#2b3a52");
      g.addColorStop(0.5, "#4a5f7e");
      g.addColorStop(1, "#1d2735");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // a few soft shapes so a transparent plate visibly sits over "footage"
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#cfe0ff";
      ctx.beginPath();
      ctx.arc(canvas.width * 0.2, canvas.height * 0.3, canvas.width * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(canvas.width * 0.82, canvas.height * 0.72, canvas.width * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = "#ffe9b0";
      ctx.fillRect(canvas.width * 0.42, 0, canvas.width * 0.1, canvas.height);
      ctx.restore();
    };

    // in the scaled coordinate space the frame is FRAME_W wide and this tall
    const frameH = (height * dpr) / scale;

    const frame = (elapsed: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      paintBackdrop();
      ctx.save();
      ctx.scale(scale, scale);
      try {
        renderTextTemplate(ctx, insert, FRAME_W / 2, frameH / 2, 1, FRAME_W, elapsed);
      } catch {
        /* a malformed style should never break the grid */
      }
      ctx.restore();
    };

    if (paused || !loop) {
      frame(1.6);
      return;
    }

    const start = performance.now();
    // ~30fps cap + skip painting while off-screen
    return startPreviewLoop(canvas, (now) => frame((((now - start) / 1000) % LOOP)), { fps: 30 });
  }, [templateId, content, styleOverrides, width, loop, paused]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height: Math.round((width * 9) / 16) }}
      className={`rounded-lg ${className}`}
    />
  );
}
