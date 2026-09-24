import { useEffect, useRef, useState } from "react";
import type { AspectRatioType, TimelineInsert } from "../types";
import {
  getCtaPreviewCrop,
  getPresetCoords,
  paintCtaWithFloatShadow,
  renderCallToAction,
} from "../lib/render-effects";

/**
 * Compact WYSIWYG preview of a call-to-action badge.
 *
 * It crops the video frame down to the badge itself, so the box on screen is
 * only as big as the button (plus the room its shadow needs). Painting uses the
 * same renderCallToAction() as the final video render at the project's real
 * resolution, so the badge — wording, brand colours, mark, bevel, shadow,
 * rotation, size — is pixel-for-pixel what lands in the video. The badge is
 * drawn settled (at rest, straight), which is how it reads in the finished
 * video once the short entrance animation has played.
 */

const ASPECT_DIMS: Record<AspectRatioType, { w: number; h: number }> = {
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  "1:1": { w: 1080, h: 1080 },
  "4:3": { w: 960, h: 720 },
};

/** Largest the preview box may be on screen (CSS px) — big enough to read the badge */
const MAX_DISPLAY_WIDTH = 480;
const MAX_DISPLAY_HEIGHT = 160;
const DPR = 2;

type Backdrop = "video" | "dark" | "light";

interface CtaBadgePreviewProps {
  item: TimelineInsert;
  aspectRatio?: AspectRatioType;
  /** Still from the scene the badge sits on, so the preview matches the real frame */
  backgroundImage?: string;
}

export default function CtaBadgePreview({ item, aspectRatio = "16:9", backgroundImage }: CtaBadgePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [backdrop, setBackdrop] = useState<Backdrop>(backgroundImage ? "video" : "dark");
  const [info, setInfo] = useState("");
  const [shape, setShape] = useState("");
  const [oversize, setOversize] = useState(false);

  const dims = ASPECT_DIMS[(aspectRatio || "16:9") as AspectRatioType] || ASPECT_DIMS["16:9"];

  // Load the scene still once (never read back, so a cross-origin image is fine)
  useEffect(() => {
    if (!backgroundImage) {
      setImage(null);
      setBackdrop((prev) => (prev === "video" ? "dark" : prev));
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setImage(null);
    };
    img.src = backgroundImage;
    return () => {
      cancelled = true;
    };
  }, [backgroundImage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = dims.w;
    const H = dims.h;

    // ---------- Geometry: a window just big enough for the badge ----------
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const { cropW, cropH, ox, oy, width: bw, height: bh, widerThanFrame } = getCtaPreviewCrop(item, W, H, ctx);

    const size = item.size || 1;
    const pos = item.presetPosition ? getPresetCoords(item.presetPosition) : item.position || { x: 0.5, y: 0.85 };
    const cx = pos.x * W;
    const cy = pos.y * H;

    canvas.width = Math.round(cropW * DPR);
    canvas.height = Math.round(cropH * DPR);
    // CSS caps how much room the preview takes; the height follows the canvas
    // aspect ratio, so the badge is always shown undistorted and true-size when
    // it fits (a standard pill lands at its real 245px width).
    const fit = Math.min(1, MAX_DISPLAY_WIDTH / cropW, MAX_DISPLAY_HEIGHT / cropH);
    canvas.style.width = `${Math.round(cropW * fit)}px`;
    canvas.style.height = "auto";

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, cropW, cropH);
    ctx.translate(-ox, -oy);

    // ---------- Backdrop: the piece of frame the badge actually sits on ----------
    if (backdrop === "video" && image) {
      const scale = Math.max(W / image.width, H / image.height);
      const dw = image.width * scale;
      const dh = image.height * scale;
      ctx.fillStyle = "#000000";
      ctx.fillRect(ox, oy, cropW, cropH);
      ctx.drawImage(image, (W - dw) / 2, (H - dh) / 2, dw, dh);
      const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = vignette;
      ctx.fillRect(ox, oy, cropW, cropH);
    } else if (backdrop === "light") {
      const lg = ctx.createLinearGradient(ox, oy, ox + cropW, oy + cropH);
      lg.addColorStop(0, "#eef1f6");
      lg.addColorStop(1, "#c3ccd9");
      ctx.fillStyle = lg;
      ctx.fillRect(ox, oy, cropW, cropH);
    } else {
      const dg = ctx.createLinearGradient(ox, oy, ox, oy + cropH);
      dg.addColorStop(0, "#1b2133");
      dg.addColorStop(1, "#0b0e18");
      ctx.fillStyle = dg;
      ctx.fillRect(ox, oy, cropW, cropH);
      const blob = (bx: number, by: number, r: number, a: number) => {
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
        g.addColorStop(0, `rgba(148, 173, 255, ${a})`);
        g.addColorStop(1, "rgba(148, 173, 255, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
      };
      blob(W * 0.22, H * 0.26, Math.max(W, H) * 0.36, 0.22);
      blob(W * 0.78, H * 0.74, Math.max(W, H) * 0.32, 0.16);
    }

    // ---------- The badge itself, drawn by the video renderer ----------
    ctx.save();
    ctx.globalAlpha = item.opacity ?? 1;
    ctx.translate(cx, cy);
    ctx.scale(size, size);
    // Settled draw: full size, dead straight, no entrance pop — so the badge is
    // always visible here and every settings change shows up immediately. The
    // shared painter adds the same soft shadow the video puts underneath it.
        const painted = paintCtaWithFloatShadow(ctx, item, { settled: true });
    if (!painted) {
      renderCallToAction(ctx, item, 0, 0, 1, 0, { settled: true });
    }
    ctx.restore();

    setOversize(widerThanFrame);
    setShape(item.visualOptions?.ctaShape || "pill");
    setInfo(`${Math.round(bw)} × ${Math.round(bh)} px · ${Math.round(size * 100)}%`);
  }, [item, backdrop, image, dims.w, dims.h]);

  const backdropBtn = (id: Backdrop, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setBackdrop(id)}
      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors ${
        backdrop === id
          ? "bg-indigo-600 border-indigo-400 text-white"
          : "bg-gray-900/80 border-gray-700 text-gray-300 hover:bg-gray-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-gray-950 border border-indigo-800/60 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center gap-3">
      {/* Cropped, true-size preview of the badge */}
      <div className="rounded-lg overflow-hidden border border-gray-800 bg-black shrink-0">
        <canvas ref={canvasRef} className="block max-w-full" />
      </div>

      {/* Controls + live numbers */}
      <div className="min-w-0 w-full sm:flex-1 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-indigo-300">👁️ Live preview</span>
          <span className="text-[10px] text-gray-500">as it appears in the video</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {backgroundImage && backdropBtn("video", "Video still")}
          {backdropBtn("dark", "Dark")}
          {backdropBtn("light", "Light")}
        </div>
        <div className="text-[10px] text-gray-400 font-mono truncate">
          {info} · {item.visualOptions?.ctaShape || "pill"}
        </div>
        <div className="text-[10px] text-gray-500 truncate">
          {item.presetPosition ? `position: ${item.presetPosition}` : "custom position"} · opacity{" "}
          {Math.round((item.opacity ?? 1) * 100)}%
          {oversize && <span className="text-amber-400"> · larger than the frame</span>}
        </div>
      </div>
    </div>
  );
}
