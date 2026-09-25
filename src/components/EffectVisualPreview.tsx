import React, { useEffect, useRef } from "react";
import { CatalogItem } from "../lib/video-studio-catalog";
import {
  getCtaBadgeLayout,
  getPresetCoords,
  paintCtaWithFloatShadow,
  renderCallToAction,
  renderTimelineInsert,
} from "../lib/render-effects";
import type { TimelineInsert } from "../types";
import StickerPreviewCanvas from "./StickerPreviewCanvas";
import TemplatePreviewCanvas from "./TemplatePreviewCanvas";
import { wantsCentreLogo } from "../lib/render-visualizers";
import { MOTION_PRESETS_BY_ID } from "../lib/overlay-motion";
import { startPreviewLoop } from "../lib/preview-loop";

interface EffectVisualPreviewProps {
  item: CatalogItem;
}

/**
 * Does this catalogue card belong to a style that puts the user's logo in the
 * middle of itself? Those cards centre the artwork (instead of sitting it low)
 * and show an empty logo slot, so it is obvious where a brand mark lands.
 */
export function centreStyleAsksForLogo(item: CatalogItem): boolean {
  return wantsCentreLogo({
    type: item.type,
    visualOptions: item.defaultVisualOptions,
  } as unknown as TimelineInsert);
}

/**
 * The empty brand slot the centre cards draw: the user's own logo lives there in
 * the video, and until they upload one the card shows the slot rather than a
 * black hole. Drawn once and cached — it is the same picture on every card.
 */
let centreLogoPlaceholder: HTMLCanvasElement | null = null;
function getCentreLogoPlaceholder(width = 256, height = 256): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (centreLogoPlaceholder) return centreLogoPlaceholder;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // dashed rounded frame
  ctx.strokeStyle = "rgba(226, 232, 240, 0.85)";
  ctx.lineWidth = 6;
  ctx.setLineDash([16, 12]);
  const r = 26;
  ctx.beginPath();
  ctx.moveTo(r, 3);
  ctx.lineTo(width - r, 3);
  ctx.quadraticCurveTo(width - 3, 3, width - 3, r);
  ctx.lineTo(width - 3, height - r);
  ctx.quadraticCurveTo(width - 3, height - 3, width - r, height - 3);
  ctx.lineTo(r, height - 3);
  ctx.quadraticCurveTo(3, height - 3, 3, height - r);
  ctx.lineTo(3, r);
  ctx.quadraticCurveTo(3, 3, r, 3);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  // the words
  ctx.fillStyle = "rgba(241, 245, 249, 0.95)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 40px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("YOUR", width / 2, height / 2 - 24);
  ctx.fillText("LOGO", width / 2, height / 2 + 24);
  centreLogoPlaceholder = canvas;
  return canvas;
}

export default function EffectVisualPreview({ item }: EffectVisualPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);

  // Audio visualisers are drawn by the very same renderer the video preview and
  // the final render use, so the card can never show something the video won't.
  useEffect(() => {
    if (item.category !== "audio_visualizers") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // A throwaway timeline insert mirroring what gets added to the timeline
    // Catalogue cards sit the visualiser a little higher than its timeline
    // preset so the bars, their shadow and the floor glow are all visible.
    const preset = item.defaultPosition || "center";
    // Centre-stage styles are built around the middle of the frame (and carry the
    // logo slot), so the card centres them; every other visualiser sits a little
    // higher than its timeline preset so the bars, their shadow and the floor
    // glow are all visible.
    const centreCard = centreStyleAsksForLogo(item);
    const cardY = centreCard ? 0.5 : 0.62;
    const previewInsert = {
      id: `preview-${item.type}`,
      category: item.category,
      type: item.type,
      title: item.name,
      startTime: 0,
      duration: 9999,
      position: { ...getPresetCoords(preset as any), y: cardY },
      presetPosition: undefined,
      size: item.defaultSize || 1,
      opacity: 1,
      audioSource: item.defaultAudioSource || "voice",
      content: {},
      visualOptions: item.defaultVisualOptions ? { ...item.defaultVisualOptions } : undefined,
      audioSettings: {},
    } as unknown as TimelineInsert;

    const startedAt = performance.now();

    const renderLoop = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      // dark studio stage so the glass plate, bars and their shadow are readable
      const stage = ctx.createLinearGradient(0, 0, 0, h);
      stage.addColorStop(0, "#0b1020");
      stage.addColorStop(0.6, "#131a2e");
      stage.addColorStop(1, "#070a14");
      ctx.fillStyle = stage;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.55);
      ctx.lineTo(w, h * 0.55);
      ctx.stroke();

      // No analyser data here: the rhythm engine drives it, exactly like it does
      // whenever a project has no audio loaded yet.
      renderTimelineInsert(
        ctx,
        previewInsert,
        0.4 + (elapsed % 12),
        w,
        h,
        0,
        null,
        null,
        // the card shows *where* the user's logo goes; the real logo is passed in
        // by the preview and the render, never fetched here
        { logo: centreCard ? getCentreLogoPlaceholder() : null }
      );
    };

    // ~30fps is plenty for a thumbnail, and skip painting entirely while the
    // card is scrolled off-screen so a full catalogue grid can't stall scrolling
    return startPreviewLoop(canvas, renderLoop, { fps: 30 });
  }, [item]);


  // Call-to-action cards: one still frame of the real badge, drawn from the
  // card's own default settings. Settled (no entrance, no tilt) so the badge is
  // straight and whole in the thumbnail, exactly as it reads in the video.
  useEffect(() => {
    if (item.category !== "call_to_action") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    const previewInsert = {
      id: `preview-${item.type}`,
      category: item.category,
      type: item.type,
      title: item.name,
      startTime: 0,
      duration: item.defaultDuration || 8,
      presetPosition: "center",
      size: 1,
      opacity: 1,
      content: item.defaultContent ? { ...item.defaultContent } : {},
      visualOptions: item.defaultVisualOptions ? { ...item.defaultVisualOptions } : undefined,
    } as unknown as TimelineInsert;

    // A soft "video still" stage: the badge has to be judged the way it will be
    // seen — sitting on footage with the light and shade of a real frame.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const stage = ctx.createLinearGradient(0, 0, W * 0.4, H);
    stage.addColorStop(0, "#26314d");
    stage.addColorStop(0.5, "#151c30");
    stage.addColorStop(1, "#0a0e18");
    ctx.fillStyle = stage;
    ctx.fillRect(0, 0, W, H);
    const light = ctx.createRadialGradient(W * 0.3, H * 0.22, 0, W * 0.3, H * 0.22, Math.max(W, H) * 0.6);
    light.addColorStop(0, "rgba(255, 255, 255, 0.16)");
    light.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, H);
    const floor = ctx.createLinearGradient(0, H * 0.55, 0, H);
    floor.addColorStop(0, "rgba(0, 0, 0, 0)");
    floor.addColorStop(1, "rgba(0, 0, 0, 0.5)");
    ctx.fillStyle = floor;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);

    // Scale the badge to fill the card without distorting it, then paint it with
    // the same shadow the video puts under it — the raised, floating look.
    const layout = getCtaBadgeLayout(previewInsert, ctx);
    const fit = Math.min((W * 0.82) / layout.width, (H * 0.5) / layout.height);

    ctx.translate(W / 2, H / 2);
    ctx.scale(fit, fit);
    const painted = paintCtaWithFloatShadow(ctx, previewInsert, { settled: true });
    if (!painted) {
      renderCallToAction(ctx, previewInsert, 0, 0, 1, 0, { settled: true });
    }
  }, [item]);

  // If this is an audio visualizer, return the live animated canvas
  if (item.category === "audio_visualizers") {
    return (
      <div className="w-full h-24 rounded-lg bg-gray-950 border border-gray-800 overflow-hidden relative shadow-inner flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={512}
          height={176}
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-1 right-2 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">
            Live · same engine as render
          </span>
        </div>
      </div>
    );
  }

  // ---------------- CALL TO ACTION PREVIEWS (THE REAL BADGE, NOT A STAND-IN) ----------------
  // Every CTA card is painted by renderCallToAction() — the same function the
  // video preview and the final render use — using the badge's own settings
  // (brand colours, shape, style, mark, wording, bevel, raised shadow). So the
  // grid shows the 36 platforms exactly as they will look on the video instead
  // of one generic indigo pill.
  if (item.category === "call_to_action") {
    return (
      <div className="w-full h-24 rounded-lg bg-gray-950 border border-gray-800 overflow-hidden relative shadow-inner flex items-center justify-center">
        <canvas ref={canvasRef} width={512} height={176} className="w-full h-full" />
        <div className="absolute bottom-1 right-2 flex items-center gap-1">
          <span className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">
            Real badge · same engine as render
          </span>
        </div>
      </div>
    );
  }

  // ---------------- STICKERS PREVIEWS (3D RENDERED ON-VIDEO VISUALS) ----------------
  // Stickers preview with the real renderer: the button shows the actual
  // shaded 3D object doing its actual motion, not an emoji stand-in.
  if (item.category === "stickers") {
    const vo = item.defaultVisualOptions || {};
    return (
      <div className="w-full h-24 rounded-lg bg-gradient-to-b from-gray-950 to-gray-900 border border-gray-800 flex items-center justify-center relative overflow-hidden">
        <StickerPreviewCanvas
          stickerId={vo.stickerId || item.type}
          motionPreset={vo.motionPreset}
          motionSpeed={vo.motionSpeed}
          motionAmount={vo.motionAmount}
          glow={vo.stickerGlow}
          shadow={vo.shadowIntensity}
          size={88}
          backdrop="none"
        />
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-gray-300 uppercase tracking-wider bg-gray-950/80 px-2 py-0.5 rounded border border-gray-700/60 whitespace-nowrap">
          {MOTION_PRESETS_BY_ID[vo.motionPreset || ""]?.name || "3D"}
        </span>
      </div>
    );
  }


  // ---------------- 2. INTRO PREVIEWS ----------------
  if (item.category === "intro") {
    if (item.type === "intro_cinematic_gold") {
      return (
        <div className="w-full h-24 rounded-lg bg-gradient-to-r from-amber-950 via-gray-950 to-amber-950 border border-amber-600/40 p-2 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.25)_0%,transparent_70%)] animate-pulse" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.8)] border border-yellow-200/60 mb-1">
              <span className="text-xs font-black text-gray-950">🏷️</span>
            </div>
            <span className="text-[10px] font-black text-amber-300 tracking-widest uppercase drop-shadow">YOUR BRAND</span>
            <span className="text-[8px] text-amber-200/80 font-serif italic">Presents An Original Story</span>
          </div>
          <div className="absolute top-1 left-2 text-[8px] font-mono text-amber-400/80 bg-amber-950/70 px-1.5 py-0.2 rounded border border-amber-700/40">
            🎬 Intro Video
          </div>
        </div>
      );
    }

    if (item.type === "intro_cyber_glitch") {
      return (
        <div className="w-full h-24 rounded-lg bg-gray-950 border border-cyan-500/40 p-2 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,182,212,0.1)_1px,transparent_1px)] bg-[size:100%_4px]" />
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-7 h-7 rounded bg-gray-900 border border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.6)] flex items-center justify-center mb-1">
              <span className="text-xs">⚡</span>
            </div>
            <span className="text-[10px] font-black text-cyan-300 tracking-wider font-mono">CYBERPUNK MEDIA</span>
            <span className="text-[8px] text-pink-400 font-mono">Next-Gen Visuals</span>
          </div>
          <div className="absolute top-1 left-2 text-[8px] font-mono text-cyan-400 bg-cyan-950/70 px-1.5 py-0.2 rounded border border-cyan-700/40">
            🎬 Tech Intro
          </div>
        </div>
      );
    }

    // Generic Intro
    return (
      <div className="w-full h-24 rounded-lg bg-gradient-to-r from-gray-950 via-indigo-950/60 to-gray-950 border border-indigo-500/40 p-2 flex flex-col items-center justify-center relative overflow-hidden group">
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/80 border border-indigo-400 flex items-center justify-center mb-1 shadow-lg">
            <span className="text-xs">🎬</span>
          </div>
          <span className="text-[10px] font-bold text-white tracking-wider">{item.name}</span>
          <span className="text-[8px] text-indigo-300">With Logo Reveal</span>
        </div>
        <div className="absolute top-1 left-2 text-[8px] font-mono text-indigo-400 bg-indigo-950/70 px-1.5 py-0.2 rounded border border-indigo-700/40">
          🎬 Video Intro
        </div>
      </div>
    );
  }

  // ---------------- 3. OUTRO PREVIEWS ----------------
  if (item.category === "outro") {
    if (item.type === "outro_youtube_endscreen") {
      return (
        <div className="w-full h-24 rounded-lg bg-gray-950 border border-red-600/40 p-2 flex items-center justify-between relative overflow-hidden group">
          {/* Watch Next Box 1 */}
          <div className="w-16 h-14 bg-gray-900 border border-gray-700 rounded flex flex-col items-center justify-center text-[8px] text-gray-400 font-mono">
            <span>📺</span>
            <span>NEXT VIDEO</span>
          </div>

          {/* Center Subscribe Circle */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-red-600 border-2 border-white shadow-[0_0_12px_rgba(239,68,68,0.7)] flex items-center justify-center text-xs text-white">
              🏷️
            </div>
            <span className="text-[8px] font-black text-red-400 mt-1">SUBSCRIBE</span>
          </div>

          {/* Watch Next Box 2 */}
          <div className="w-16 h-14 bg-gray-900 border border-gray-700 rounded flex flex-col items-center justify-center text-[8px] text-gray-400 font-mono">
            <span>▶️</span>
            <span>PLAYLIST</span>
          </div>
          <div className="absolute top-1 left-2 text-[8px] font-mono text-red-400 bg-red-950/70 px-1.5 py-0.2 rounded border border-red-700/40">
            🏁 YouTube End-Slate
          </div>
        </div>
      );
    }

    if (item.type === "outro_social_showcase") {
      return (
        <div className="w-full h-24 rounded-lg bg-gray-950 border border-sky-500/40 p-2 flex flex-col items-center justify-center relative overflow-hidden group">
          <span className="text-[10px] font-bold text-sky-300 uppercase tracking-wider mb-1.5">CONNECT WITH US</span>
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-red-900/60 border border-red-500/50 flex items-center justify-center text-[10px]">YT</span>
            <span className="w-6 h-6 rounded-full bg-pink-900/60 border border-pink-500/50 flex items-center justify-center text-[10px]">IG</span>
            <span className="w-6 h-6 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center text-[10px]">X</span>
            <span className="w-6 h-6 rounded-full bg-cyan-900/60 border border-cyan-500/50 flex items-center justify-center text-[10px]">TT</span>
          </div>
          <span className="text-[8px] text-gray-400 mt-1 font-mono">@sceneringstudio</span>
        </div>
      );
    }

    // Generic Outro
    return (
      <div className="w-full h-24 rounded-lg bg-gray-950 border border-indigo-500/40 p-2 flex flex-col items-center justify-center relative overflow-hidden group">
        <div className="relative z-10 flex flex-col items-center text-center">
          <span className="text-sm mb-0.5">🏁</span>
          <span className="text-[10px] font-bold text-white">{item.name}</span>
          <span className="text-[8px] text-gray-400 mt-0.5">End-Screen with Handles & Logo</span>
        </div>
      </div>
    );
  }

  // ---------------- 6. TEXT TEMPLATE & LOWER THIRD PREVIEWS ----------------
  // Rendered with the real template renderer over a mock frame, so the button
  // shows the true plate, transparency, font and slide-in motion.
  if (item.category === "text_templates" || item.category === "lower_thirds") {
    return (
      <div className="w-full rounded-lg overflow-hidden border border-gray-800 bg-gray-950 flex items-center justify-center">
        <TemplatePreviewCanvas
          templateId={(item.defaultVisualOptions?.templateId as string) || item.type}
          content={item.defaultContent as Record<string, string>}
          width={252}
        />
      </div>
    );
  }


  // ---------------- 8. BACKGROUND MUSIC PREVIEWS ----------------
  // Background Music: intentionally NO preview graphic — audio items stay
  // simple (name + description + Test) so users are not confused by a
  // visual effect that is not part of the video.
  if (item.category === "background_music") {
    return null;
  }

  // Filters have their own dedicated studio with live animated previews
  // (see FiltersStudio.tsx) and are never rendered as catalog cards.

  // Sound Effects: intentionally NO preview graphic (see note above).
  if (item.category === "sound_effects") {
    return null;
  }

  // ---------------- BRAND LOGO PREVIEW ----------------
  return (
    <div className="w-full h-24 rounded-lg bg-gray-950 border border-gray-800 p-2 flex items-center justify-center relative overflow-hidden group">
      <div className="relative z-10 flex items-center gap-2 bg-gray-900/90 px-3 py-1.5 rounded-lg border border-gray-700">
        <span className="text-base">🏷️</span>
        <span className="text-xs font-semibold text-gray-200">Official Brand Watermark</span>
      </div>
    </div>
  );
}
