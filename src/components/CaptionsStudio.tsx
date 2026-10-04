import { useEffect, useMemo, useRef, useState } from "react";
import StepNav from "./StepNav";
import type { Scene, CaptionsConfig } from "../types";
import { formatDuration } from "../lib/duration-utils";
import { renderCanvasCaptions, captionBandCenterY } from "../lib/render-captions";
import {
  CAPTION_FONTS,
  CAPTION_STYLES,
  CAPTION_STYLE_ORDER,
  METAL_FINISHES,
  captionFontStack,
  getCaptionFont,
  getCaptionStyle,
  getMetalFinish,
  loadCaptionFonts,
  ensureCaptionFont,
  resolveCaptionStyleId,
  type CaptionStyleCategory,
  type CaptionStyleDef,
  type MetalFinish,
} from "../data/caption-styles";
import CaptionsSwitch from "./CaptionsSwitch";
import Icon, { iconify } from "./icons/Icon";
import { getInterfacePlan, useSession } from "../lib/session";
import { isPlanCaptionIncluded, type PlanSlug } from "../config/plans";
import VipFeatureBadge, { openMembershipPlans } from "./VipFeatureBadge";

interface CaptionsStudioProps {
  scenes: Scene[];
  captionsConfig?: CaptionsConfig;
  onUpdateCaptionsConfig?: (config: CaptionsConfig) => void;
  onUpdateScene: (sceneId: number, updates: Partial<Scene>) => void;
  onApplyStyleToAll: (burn: boolean) => void;
  onNavigateToStep?: (step: any) => void;
}

export type CaptionPresetType = string;

export default function CaptionsStudio({
  scenes,
  captionsConfig,
  onUpdateCaptionsConfig,
  onUpdateScene,
  onApplyStyleToAll,
  onNavigateToStep,
}: CaptionsStudioProps) {
  const { account } = useSession();
  const currentPlan = getInterfacePlan(account);
  const [mode, setMode] = useState<"karaoke" | "normal">(captionsConfig?.mode || "karaoke");
  const [backgroundStyle, setBackgroundStyle] = useState<"transparent" | "blocked">(
    captionsConfig?.backgroundStyle || "transparent"
  );
  const [selectedPreset, setSelectedPreset] = useState<CaptionPresetType>(
    resolveCaptionStyleId(captionsConfig?.preset)
  );
  const [fontId, setFontId] = useState<string>(captionsConfig?.fontId || "");
  const [borderWidth, setBorderWidth] = useState<number>(
    captionsConfig?.borderWidth ?? getCaptionStyle(captionsConfig?.preset).borderWidth
  );
  const [borderColor, setBorderColor] = useState<string>(
    captionsConfig?.borderColor || getCaptionStyle(captionsConfig?.preset).borderColor
  );
  const [shadowOn, setShadowOn] = useState<boolean>(captionsConfig?.shadow ?? true);
  const [shadowStrength, setShadowStrength] = useState<number>(
    captionsConfig?.shadowStrength ?? getCaptionStyle(captionsConfig?.preset).shadowStrength
  );
  const [letterSpacing, setLetterSpacing] = useState<number>(
    captionsConfig?.letterSpacing ?? getCaptionStyle(captionsConfig?.preset).letterSpacing
  );

  // Web fonts must be in before the canvas draws them; loads once, then repaints.
  //
  // Canvas never triggers a font download by itself, so the face currently on
  // the preview is requested explicitly and the canvas repainted when it
  // lands. `ok` is false when the face could not be fetched at all, which is
  // worth saying out loud: silently falling back to Georgia is how a shelf of
  // sixty distinct typefaces ends up looking like three.
  const [fontsReady, setFontsReady] = useState(0);
  const [faceMissing, setFaceMissing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadCaptionFonts().then(() => {
      if (!cancelled) setFontsReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [burnCaptionsGlobal, setBurnCaptionsGlobal] = useState(
    captionsConfig?.enabled !== undefined ? captionsConfig.enabled : true
  );
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">(
    captionsConfig?.fontSize || "medium"
  );
  const [position, setPosition] = useState<"bottom" | "center" | "top">(
    captionsConfig?.position || "bottom"
  );
  const [textUppercase, setTextUppercase] = useState(
    captionsConfig?.uppercase !== undefined ? captionsConfig.uppercase : true
  );
  const [customTextColor, setCustomTextColor] = useState(captionsConfig?.textColor || "#FFFFFF");
  const [customHighlightColor, setCustomHighlightColor] = useState(
    captionsConfig?.highlightColor || "#38BDF8"
  );
  /** Chrome fill. Any style can be given one, not just the metallic presets. */
  const [metal, setMetal] = useState<MetalFinish>(
    captionsConfig?.metal ?? getCaptionStyle(captionsConfig?.preset).metal ?? "none"
  );
  /** Magnification of the close-up preview. */
  const [zoom, setZoom] = useState(3);
  /** Which shelf of the style catalogue is on screen. */
  const [styleFilter, setStyleFilter] = useState<CaptionStyleCategory | "All">("All");

  /**
   * Single source of truth for the caption look. Both the live preview below and
   * the burned-in captions in the video are produced from this exact config, so
   * the preview can never drift from the render.
   */
  const buildConfig = (partial: Partial<CaptionsConfig> = {}): CaptionsConfig => ({
    enabled: burnCaptionsGlobal,
    mode,
    backgroundStyle,
    preset: selectedPreset as any,
    fontSize,
    position,
    uppercase: textUppercase,
    textColor: customTextColor,
    highlightColor: customHighlightColor,
    bgColor: backgroundStyle === "transparent" ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.75)",
    fontId: fontId || undefined,
    fontWeight: undefined,
    letterSpacing,
    borderWidth,
    borderColor,
    shadow: shadowOn,
    shadowStrength,
    shadowOffset: activeStyle.shadowOffset,
    shadowBlur: activeStyle.shadowBlur,
    metal,
    ...partial,
  });

  const emitConfigUpdate = (partial: Partial<CaptionsConfig>) => {
    if (onUpdateCaptionsConfig) onUpdateCaptionsConfig(buildConfig(partial));
  };

  const captionPreviewRef = useRef<HTMLCanvasElement | null>(null);
  /** The close-up: the same frame, magnified, so letter edges can be judged. */
  const captionZoomRef = useRef<HTMLCanvasElement | null>(null);

  const activeStyle: CaptionStyleDef = getCaptionStyle(selectedPreset);
  const activeFont = getCaptionFont(fontId || activeStyle.fontId);
  const metalFinish = getMetalFinish(metal);
  /**
   * The style cards, with the two presets Free includes first so they land
   * side by side on the top row.
   *
   * They used to sit wherever the catalogue happened to put them, which meant
   * the only two styles a Free member can actually export were somewhere down
   * a grid of two dozen cards. Everything else keeps its catalogue order, so
   * the shelves still read the way they were authored.
   */
  const visibleStyles = useMemo(() => {
    const shelf =
      styleFilter === "All"
        ? CAPTION_STYLES
        : CAPTION_STYLES.filter((s) => s.category === styleFilter);
    const free = shelf.filter((s) => isPlanCaptionIncluded("free", s.id));
    if (free.length === 0) return shelf;
    return [...free, ...shelf.filter((s) => !isPlanCaptionIncluded("free", s.id))];
  }, [styleFilter]);

  /** Selecting a style applies its whole recipe (font, case, colours, border, shadow) */
  const handleSelectPreset = (style: CaptionStyleDef) => {
    const isVip = !isPlanCaptionIncluded(currentPlan, style.id);
    setSelectedPreset(style.id);
    setFontId(style.fontId);
    setCustomTextColor(style.textColor);
    setCustomHighlightColor(style.highlightColor);
    setTextUppercase(style.uppercase);
    setBorderWidth(style.borderWidth);
    setBorderColor(style.borderColor);
    setShadowOn(true);
    setShadowStrength(style.shadowStrength);
    setLetterSpacing(style.letterSpacing);
    setBackgroundStyle(style.background);
    // A style's finish is part of its recipe: picking Gold Chrome turns the
    // chrome on, and picking a flat style afterwards turns it off again
    // rather than leaving gold stuck on a typewriter face.
    setMetal(style.metal ?? "none");
    emitConfigUpdate({
      metal: style.metal ?? "none",
      preset: style.id,
      fontId: style.fontId,
      textColor: style.textColor,
      highlightColor: style.highlightColor,
      uppercase: style.uppercase,
      borderWidth: style.borderWidth,
      borderColor: style.borderColor,
      shadow: true,
      shadowStrength: style.shadowStrength,
      letterSpacing: style.letterSpacing,
      shadowOffset: style.shadowOffset,
      shadowBlur: style.shadowBlur,
      backgroundStyle: style.background,
      bgColor: style.background === "transparent" ? "rgba(0,0,0,0)" : style.bgColor,
    });
    if (isVip) openMembershipPlans();
  };

  const handleModeChange = (newMode: "karaoke" | "normal") => {
    setMode(newMode);
    emitConfigUpdate({ mode: newMode });
  };

  const handleBackgroundChange = (newBg: "transparent" | "blocked") => {
    setBackgroundStyle(newBg);
    emitConfigUpdate({ backgroundStyle: newBg });
  };

  /** Scenes switched off one at a time, which the master switch reports. */
  const mutedSceneCount = scenes.filter((s) => (s.burn_caption ?? true) === false).length;

  const turnOnEveryScene = () => {
    scenes.forEach((s) => {
      if ((s.burn_caption ?? true) === false) onUpdateScene(s.id, { burn_caption: true });
    });
  };

  const handleApplyToAllScenes = () => {
    scenes.forEach((s) => {
      onUpdateScene(s.id, { burn_caption: burnCaptionsGlobal });
    });
    onApplyStyleToAll(burnCaptionsGlobal);
    emitConfigUpdate({ enabled: burnCaptionsGlobal });
  };

  const sampleSceneText =
    scenes[0]?.text || "Create stunning short-form videos with automatic animated subtitles.";

  /**
   * The logical frame both previews describe. Everything is drawn in these
   * coordinates and then transformed onto whatever pixels the canvas has, so
   * the two previews are the same frame seen from different distances.
   */
  const FRAME_W = 1280;
  const FRAME_H = 720;

  /** The neutral stage the captions are judged against, in frame coordinates. */
  const paintBackdrop = (ctx: CanvasRenderingContext2D) => {
    const grad = ctx.createLinearGradient(0, 0, FRAME_W, FRAME_H);
    grad.addColorStop(0, "#243044");
    grad.addColorStop(0.55, "#3c3a46");
    grad.addColorStop(1, "#11141c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#e6ecff";
    const step = 96;
    for (let row = 0; row < FRAME_H / step; row++) {
      for (let col = 0; col < FRAME_W / step; col++) {
        ctx.fillRect(col * step + 24, row * step + 20, 54, 9);
      }
    }
    ctx.globalAlpha = 1;
  };

  /**
   * Give a canvas a backing store that matches the pixels it actually
   * occupies on this screen, and return the drawing context.
   *
   * This is the whole reason the captions looked jagged in the studio. The
   * canvas was a fixed 1280x720 bitmap squeezed into a ~460px box, so every
   * glyph was rendered at full size and then resampled down by the browser —
   * a 0.36x downscale, which chews the thin parts of letters and the outline
   * into a crunchy mess no matter how well the renderer drew them. Sizing the
   * bitmap to the real display size (times the device pixel ratio) means the
   * text is rasterised once, at the size it is shown, with no resampling at
   * all. The frame coordinates stay 1280x720 via the transform, so the render
   * is still pixel-for-pixel the same composition as the exported video.
   */
  const prepareCanvas = (canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pxW, pxH);
    return ctx;
  };

  // The preview canvases run the very same renderer the video uses, so the
  // caption you see here is the caption that gets burned in - no
  // approximations.
  const [previewTick, setPreviewTick] = useState(0);

  // Fetch the face the preview is about to draw with, then repaint.
  const previewFontId = fontId || activeStyle.fontId;
  useEffect(() => {
    let cancelled = false;
    setFaceMissing(false);
    void ensureCaptionFont(previewFontId).then((ok) => {
      if (cancelled) return;
      setFaceMissing(!ok);
      setFontsReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [previewFontId]);

  useEffect(() => {
    const config = buildConfig();

    // ---------------------------------------------------- full frame
    const canvas = captionPreviewRef.current;
    if (canvas) {
      const ctx = prepareCanvas(canvas);
      if (ctx) {
        const k = canvas.width / FRAME_W;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        paintBackdrop(ctx);
        renderCanvasCaptions(ctx, sampleSceneText, 0.5, config, FRAME_W, FRAME_H);
      }
    }

    // ---------------------------------------------------- close-up
    // Not a magnified screenshot of the canvas above: the renderer is run a
    // second time through a zoom transform, so the glyphs are rasterised at
    // the magnified size. Blowing up the first canvas would show enlarged
    // pixels, which is the opposite of what a detail view is for.
    const zoomCanvas = captionZoomRef.current;
    if (zoomCanvas) {
      const ctx = prepareCanvas(zoomCanvas);
      if (ctx) {
        const viewW = zoomCanvas.width;
        const viewH = zoomCanvas.height;
        const regionH = FRAME_H / zoom;
        const regionW = regionH * (viewW / viewH);
        const bandY = captionBandCenterY(config, FRAME_H);
        // Clamp so the window never runs off the frame and shows dead space.
        const originX = Math.max(0, Math.min(FRAME_W - regionW, (FRAME_W - regionW) / 2));
        const originY = Math.max(0, Math.min(Math.max(0, FRAME_H - regionH), bandY - regionH / 2));
        const k = viewW / regionW;
        ctx.setTransform(k, 0, 0, k, -originX * k, -originY * k);
        paintBackdrop(ctx);
        renderCanvasCaptions(ctx, sampleSceneText, 0.5, config, FRAME_W, FRAME_H);
      }
    }
  }, [
    sampleSceneText,
    mode,
    backgroundStyle,
    selectedPreset,
    fontSize,
    position,
    textUppercase,
    customTextColor,
    customHighlightColor,
    borderWidth,
    borderColor,
    shadowOn,
    shadowStrength,
    letterSpacing,
    fontId,
    burnCaptionsGlobal,
    fontsReady,
    metal,
    zoom,
    previewTick,
  ]);

  // Repaint when the canvases change size, or a window resize leaves the
  // backing store at the wrong resolution and the jaggedness comes back.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setPreviewTick((n) => n + 1));
    if (captionPreviewRef.current) ro.observe(captionPreviewRef.current);
    if (captionZoomRef.current) ro.observe(captionZoomRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="max-w-5xl 2xl:max-w-7xl mx-auto w-full space-y-3 sm:space-y-6 animate-fade-in p-1.5 sm:p-0">
      {/* Single Previous / Next control — always at the top of the phase */}
      {onNavigateToStep && (
        <StepNav current="captions" onNavigate={onNavigateToStep} note="subtitle styling applies to every scene" />
      )}

      {/* Studio Header */}
      <div className="bg-gradient-to-r from-gray-900 via-purple-950/50 to-gray-900 border border-purple-900/40 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 text-xl" aria-hidden="true"><Icon glyph="💬" /></span>
              <h2 className="text-xl font-bold text-white">Captions & Subtitles Studio</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-950 border border-indigo-700/60 text-indigo-300">
                Word-Sync Ready
              </span>
            </div>
            <p className="text-xs text-gray-300 max-w-xl">
              Design eye-catching on-screen caption styles and burn word-synced subtitles into your video for the social formats that need them.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleApplyToAllScenes}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5"
            >
              <Icon glyph="✨" />
              <span>Apply to All {scenes.length} Scenes</span>
            </button>
          </div>

        </div>

        {/* The captions on/off switch — the first control in the step, above
            everything it governs. There is no second copy of it anywhere else
            in the app: the Voiceover step used to carry a duplicate, which
            meant one setting had two owners and neither screen was obviously
            in charge. It takes effect the moment it is clicked; nothing has
            to be applied afterwards. */}
        <div className="mt-4 pt-4 border-t border-hairline">
          <CaptionsSwitch
            enabled={burnCaptionsGlobal}
            onChange={(next) => {
              setBurnCaptionsGlobal(next);
              emitConfigUpdate({ enabled: next });
            }}
            sceneCount={scenes.length}
            mutedSceneCount={mutedSceneCount}
          />
          {burnCaptionsGlobal && mutedSceneCount > 0 && (
            <button
              type="button"
              onClick={turnOnEveryScene}
              className="mt-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-hairline text-gray-200 text-xs font-semibold transition-colors"
            >
              Turn captions back on for all {scenes.length} scenes
            </button>
          )}
        </div>
      </div>

      {/* CORE CAPTION CONTROLS: Mode (Karaoke vs Normal) & Background (Transparent vs Blocked) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Caption Style Mode */}
        <div className="bg-gray-900/90 border border-hairline rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Icon glyph="🎤" /> Caption Playback Style
            </h3>
            <span className="text-[10px] text-purple-400 font-semibold uppercase">
              {mode === "karaoke" ? "Dynamic Sync" : "Clean Subtitle"}
            </span>
          </div>
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => handleModeChange("karaoke")}
              className={`p-3 rounded-xl border text-left transition-all ${
                mode === "karaoke"
                  ? "bg-purple-950/70 border-purple-500 text-white shadow-md shadow-purple-600/20 ring-1 ring-purple-500"
                  : "bg-gray-800/40 hover:bg-gray-800/80 border-hairline text-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <Icon glyph="✨" />
                <span>Karaoke Mode</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Active word highlights and glows dynamically in sync with narration.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange("normal")}
              className={`p-3 rounded-xl border text-left transition-all ${
                mode === "normal"
                  ? "bg-purple-950/70 border-purple-500 text-white shadow-md shadow-purple-600/20 ring-1 ring-purple-500"
                  : "bg-gray-800/40 hover:bg-gray-800/80 border-hairline text-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <Icon glyph="📝" />
                <span>Normal Mode</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Clean, traditional subtitles showing complete sentences with uniform color.
              </p>
            </button>
          </div>
        </div>

        {/* Caption Background: Transparent vs Blocked */}
        <div className="bg-gray-900/90 border border-hairline rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Icon glyph="🖼" /> Background Framing
            </h3>
            <span className="text-[10px] text-indigo-400 font-semibold uppercase">
              {backgroundStyle === "transparent" ? "No Box" : "Backdrop Pill"}
            </span>
          </div>
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => handleBackgroundChange("transparent")}
              className={`p-3 rounded-xl border text-left transition-all ${
                backgroundStyle === "transparent"
                  ? "bg-indigo-950/70 border-indigo-500 text-white shadow-md shadow-indigo-600/20 ring-1 ring-indigo-500"
                  : "bg-gray-800/40 hover:bg-gray-800/80 border-hairline text-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <Icon glyph="🔲" />
                <span>Transparent</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Pure text with high-contrast outlines and drop-shadows. No background box.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleBackgroundChange("blocked")}
              className={`p-3 rounded-xl border text-left transition-all ${
                backgroundStyle === "blocked"
                  ? "bg-indigo-950/70 border-indigo-500 text-white shadow-md shadow-indigo-600/20 ring-1 ring-indigo-500"
                  : "bg-gray-800/40 hover:bg-gray-800/80 border-hairline text-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <Icon glyph="⬛" />
                <span>Blocked Box</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Translucent dark rounded pill behind text for maximum cinematic legibility.
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Interactive Preview Stage */}
      <div className="bg-gray-900/90 border border-hairline rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Icon glyph="👁" /> Live Caption Preview
          </h3>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="px-2 py-0.5 rounded bg-gray-800 text-indigo-300 border border-hairline">
              Style: {mode === "karaoke" ? "Karaoke" : "Normal"}
            </span>
            <span className="px-2 py-0.5 rounded bg-gray-800 text-purple-300 border border-hairline">
              Backdrop: {backgroundStyle}
            </span>
          </div>
        </div>

        {/* Two stages side by side: the whole frame, and the caption band
            magnified. The close-up is not a zoomed screenshot of the left
            canvas — both are drawn by the renderer at their own resolution,
            so the right-hand one shows real letter edges rather than big
            pixels. Each canvas sizes its own bitmap to the pixels it occupies
            (see prepareCanvas), which is what stops the text being resampled
            and going jagged.

            The stages keep a true 16:9 at every width: capping the WIDTH
            rather than the height is what preserves the ratio — an earlier
            version clamped max-height and the 1280x720 canvas ended up
            squashed into a ~3.5:1 box with every letter stretched. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          {/* ---------------------------------------------- full frame */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-semibold text-gray-300">Full frame</span>
              <span className="text-[10px] text-gray-500">what the viewer sees</span>
            </div>
            <div className="w-full aspect-video relative bg-black rounded-xl overflow-hidden border border-hairline shadow-inner">
              <canvas ref={captionPreviewRef} className="w-full h-full block" />
              <div className="absolute top-2 left-3 text-[10px] text-white/70 bg-black/45 px-2 py-0.5 rounded">
                16:9 · {activeStyle.name} · {activeFont.family}
              </div>
            </div>
          </div>

          {/* ------------------------------------------------- close-up */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <span className="text-[11px] font-semibold text-gray-300">
                Close-up <span className="text-indigo-300">{zoom}&times;</span>
              </span>
              <div className="flex items-center gap-1">
                {[2, 3, 4, 6].map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZoom(z)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                      zoom === z
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-gray-800 border-hairline text-gray-400 hover:text-white"
                    }`}
                    title={`Magnify the caption ${z} times`}
                  >
                    {z}&times;
                  </button>
                ))}
              </div>
            </div>
            <div className="w-full aspect-video relative bg-black rounded-xl overflow-hidden border border-indigo-900/60 shadow-inner">
              <canvas ref={captionZoomRef} className="w-full h-full block" />
              <div className="absolute top-2 left-3 text-[10px] text-white/70 bg-black/45 px-2 py-0.5 rounded">
                Detail · edges, outline and {metalFinish ? metalFinish.label.toLowerCase() : "fill"}
              </div>
            </div>
          </div>
        </div>

        {faceMissing && (
          <p className="text-[11px] text-amber-300 text-center bg-amber-950/30 border border-amber-800/50 rounded-lg px-3 py-1.5">
            <strong>{activeFont.family}</strong> could not be downloaded, so this
            preview is drawing in the fallback typeface and will not look like the
            style promises. Check the connection to fonts.googleapis.com.
          </p>
        )}

        <p className="text-[10px] text-gray-500 text-center">
          Both stages are drawn by the same engine that burns the captions into the
          video — at your screen&apos;s full pixel density, so what looks smooth here
          is smooth in the export.
        </p>
      </div>

      {/* Caption Style Presets Grid */}
      <div className="bg-gray-900/90 border border-hairline rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Icon glyph="🎨" /> Subtitle Visual Style Presets
            <span className="text-[10px] font-normal text-gray-500">
              {CAPTION_STYLES.length} styles · {CAPTION_FONTS.length} typefaces
            </span>
          </h3>
          <span className="text-xs text-gray-400">Click to preview style</span>
        </div>

        {/* Shelves. The catalogue outgrew a single flat grid, and scrolling
            past two dozen cards to find the metallic ones is not browsing. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(["All", ...CAPTION_STYLE_ORDER] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setStyleFilter(cat as CaptionStyleCategory | "All")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                styleFilter === cat
                  ? "bg-purple-600 border-purple-500 text-white"
                  : "bg-gray-800 border-hairline text-gray-300 hover:border-purple-600 hover:text-white"
              }`}
            >
              {cat}
              <span className="ml-1 text-[9px] opacity-60">
                {cat === "All"
                  ? CAPTION_STYLES.length
                  : CAPTION_STYLES.filter((s) => s.category === cat).length}
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleStyles.map((style) => {
            const isSelected = selectedPreset === style.id;
            const isVip = !isPlanCaptionIncluded(currentPlan, style.id);
            const styleFont = getCaptionFont(style.fontId);
            return (
              <div
                key={style.id}
                onClick={() => handleSelectPreset(style)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? "bg-purple-950/60 border-purple-500 shadow-md shadow-purple-600/20 ring-1 ring-purple-500"
                    : "bg-gray-800/50 hover:bg-gray-800 border-hairline text-gray-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-900 text-purple-300 border border-hairline shrink-0">
                      {style.category}
                    </span>
                    <span className="text-[10px] text-gray-500 truncate" title={styleFont.label}>
                      {styleFont.family}
                    </span>
                    {isVip && <VipFeatureBadge compact />}
                  </div>

                  {/* A real specimen, big enough to tell the faces apart.
                      A 12px "Aa Bb 123" made a blackletter, a pixel font and
                      a dripping-paint face all look like the same grey smudge,
                      which is the entire complaint this grid has to answer. */}
                  <div
                    /* Dark GREY, not black. Every caption style is pale
                       lettering carried by a dark outline and a dark drop
                       shadow; on black both of those vanish and the
                       specimen reads as faint text in a hole, which is why
                       the faces were hard to tell apart. Grey gives the
                       outline something to be dark against and lifts the
                       specimen off the card. */
                    className="mb-2 px-2 py-2 rounded-lg border border-white/10 overflow-hidden text-center bg-gradient-to-b from-[#464a52] via-[#383c43] to-[#2e3137] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-8px_18px_rgba(0,0,0,0.28)]"
                    title={styleFont.label}
                  >
                    <span
                      className="block truncate leading-tight"
                      style={{
                        fontFamily: captionFontStack(style.fontId),
                        fontWeight: styleFont.weight,
                        fontSize: style.uppercase ? "19px" : "21px",
                        letterSpacing: `${style.letterSpacing}em`,
                        textTransform: style.uppercase ? "uppercase" : "none",
                        ...(style.metal && style.metal !== "none"
                          ? {
                              backgroundImage: getMetalFinish(style.metal)?.swatch,
                              WebkitBackgroundClip: "text",
                              backgroundClip: "text",
                              color: "transparent",
                            }
                          : { color: style.textColor }),
                      }}
                    >
                      Hear the words
                    </span>
                  </div>
                  <p
                    className="font-bold text-sm mb-0.5"
                    style={
                      style.metal && style.metal !== "none"
                        ? {
                            fontFamily: captionFontStack(style.fontId),
                            fontWeight: styleFont.weight,
                            // The card shows the finish the same way the
                            // renderer does: a ramp, not a flat swatch.
                            backgroundImage: getMetalFinish(style.metal)?.swatch,
                            WebkitBackgroundClip: "text",
                            backgroundClip: "text",
                            color: "transparent",
                          }
                        : {
                            fontFamily: captionFontStack(style.fontId),
                            fontWeight: styleFont.weight,
                            color: "#FFFFFF",
                          }
                    }
                  >
                    {style.name}
                  </p>
                  <p className="text-[10px] text-purple-200/70 mb-1.5">{styleFont.family}</p>
                  <p className="text-xs text-gray-400 mb-2 leading-relaxed">{style.description}</p>
                </div>

                <div className="pt-2 border-t border-hairline flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-hairline"
                      style={{ backgroundColor: style.textColor }}
                      title="Text colour"
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-hairline"
                      style={{ backgroundColor: style.highlightColor }}
                      title="Active word colour"
                    />
                    <span className="text-[10px] text-gray-500">
                      {style.background === "blocked" ? "backdrop" : "no box"}
                    </span>
                    {style.metal && style.metal !== "none" && (
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-hairline"
                        style={{ backgroundImage: getMetalFinish(style.metal)?.swatch }}
                        title={getMetalFinish(style.metal)?.label}
                      />
                    )}
                  </div>
                  {isSelected && <span className="text-[10px] font-bold text-purple-400"><Icon glyph="✓" /> Active</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom Styling Adjustments */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-hairline text-xs">
          {/* Position */}
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-hairline space-y-1.5">
            <span className="text-gray-400 block font-medium">Placement:</span>
            <div className="grid grid-cols-2 xs:grid-cols-3 gap-1">
              {(["top", "center", "bottom"] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => {
                    setPosition(pos);
                    emitConfigUpdate({ position: pos });
                  }}
                  className={`py-1 rounded text-xs capitalize font-medium transition-colors ${
                    position === pos
                      ? "bg-purple-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>

          {/* Size */}
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-hairline space-y-1.5">
            <span className="text-gray-400 block font-medium">Text Scale:</span>
            <div className="grid grid-cols-2 xs:grid-cols-3 gap-1">
              {(["small", "medium", "large"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setFontSize(s);
                    emitConfigUpdate({ fontSize: s });
                  }}
                  className={`py-1 rounded text-xs capitalize font-medium transition-colors ${
                    fontSize === s
                      ? "bg-purple-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Text Casing */}
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-hairline space-y-1.5">
            <span className="text-gray-400 block font-medium">Letter Case:</span>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => {
                  setTextUppercase(true);
                  emitConfigUpdate({ uppercase: true });
                }}
                className={`py-1 rounded text-xs font-medium transition-colors ${
                  textUppercase
                    ? "bg-purple-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                UPPERCASE
              </button>
              <button
                type="button"
                onClick={() => {
                  setTextUppercase(false);
                  emitConfigUpdate({ uppercase: false });
                }}
                className={`py-1 rounded text-xs font-medium transition-colors ${
                  !textUppercase
                    ? "bg-purple-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                Natural Case
              </button>
            </div>
          </div>

          {/* Colors */}
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-hairline space-y-1.5">
            <span className="text-gray-400 block font-medium">Palette:</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400">Text:</span>
                <input
                  type="color"
                  value={customTextColor}
                  onChange={(e) => {
                    setCustomTextColor(e.target.value);
                    emitConfigUpdate({ textColor: e.target.value });
                  }}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                  title="Main text color"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400">Pop:</span>
                <input
                  type="color"
                  value={customHighlightColor}
                  onChange={(e) => {
                    setCustomHighlightColor(e.target.value);
                    emitConfigUpdate({ highlightColor: e.target.value });
                  }}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                  title="Active word highlight color"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Typeface, border and floating shadow */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-hairline text-xs">
          {/* Font */}
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-hairline space-y-1.5">
            <span className="text-gray-400 block font-medium">Typeface:</span>
            <select
              value={fontId || activeStyle.fontId}
              onChange={(e) => {
                setFontId(e.target.value);
                emitConfigUpdate({ fontId: e.target.value });
              }}
              className="w-full bg-gray-900 border border-hairline rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-purple-500"
              style={{ fontFamily: captionFontStack(fontId || activeStyle.fontId) }}
            >
              {CAPTION_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.family} — {f.label.split("· ")[1]}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500">
              {CAPTION_FONTS.length} faces: classical → formal → modern → artsy → fun
            </p>
          </div>

          {/* Metallic finish — available on every style, not just the two
              chrome presets. A flat colour can never look like metal: the
              finish paints a vertical ramp through the letter instead. */}
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-hairline space-y-1.5">
            <span className="text-gray-400 block font-medium">Finish:</span>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => {
                  setMetal("none");
                  emitConfigUpdate({ metal: "none" });
                }}
                className={`py-1 rounded text-[11px] font-medium transition-colors border ${
                  metal === "none"
                    ? "bg-purple-600 border-purple-500 text-white"
                    : "bg-gray-900 border-hairline text-gray-400 hover:text-white"
                }`}
              >
                Flat
              </button>
              {METAL_FINISHES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMetal(m.id);
                    emitConfigUpdate({ metal: m.id });
                  }}
                  className={`py-1 rounded text-[11px] font-semibold capitalize transition-colors border ${
                    metal === m.id
                      ? "border-purple-400 ring-1 ring-purple-400 text-gray-900"
                      : "border-hairline text-gray-900/90 hover:brightness-110"
                  }`}
                  style={{ backgroundImage: m.swatch }}
                  title={m.label}
                >
                  {m.id}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-500">
              {metalFinish
                ? `${metalFinish.label} — bevel, mirror band and a dark edge`
                : "Flat colour from the text colour picker"}
            </p>
          </div>

          {/* Border width — hairline by default, thicken as needed */}
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-hairline space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 font-medium">Border:</span>
              <span className="font-mono text-purple-300">{borderWidth.toFixed(1)} px</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={borderWidth}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setBorderWidth(v);
                emitConfigUpdate({ borderWidth: v });
              }}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-gray-500">Thin = crisp, high = poster outline</span>
              <input
                type="color"
                value={borderColor}
                onChange={(e) => {
                  setBorderColor(e.target.value);
                  emitConfigUpdate({ borderColor: e.target.value });
                }}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 shrink-0"
                title="Border colour"
              />
            </div>
          </div>

          {/* Floating shadow below the captions */}
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-hairline space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 font-medium">Float Shadow:</span>
              <button
                type="button"
                onClick={() => {
                  const next = !shadowOn;
                  setShadowOn(next);
                  emitConfigUpdate({ shadow: next });
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                  shadowOn ? "bg-purple-600 text-white" : "bg-gray-900 text-gray-400 border border-hairline"
                }`}
              >
                {shadowOn ? "ON" : "OFF"}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={shadowStrength}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setShadowStrength(v);
                emitConfigUpdate({ shadowStrength: v });
              }}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <p className="text-[10px] text-gray-500">Shadow falls below so the text floats in frame</p>
          </div>

          {/* Letter spacing */}
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-hairline space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 font-medium">Letter Spacing:</span>
              <span className="font-mono text-purple-300">{letterSpacing.toFixed(2)} em</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.2}
              step={0.005}
              value={letterSpacing}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setLetterSpacing(v);
                emitConfigUpdate({ letterSpacing: v });
              }}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <p className="text-[10px] text-gray-500">Wide tracking suits the formal serifs</p>
          </div>
        </div>
      </div>

      {/* Scene Captions Breakdown */}
      <div className="bg-gray-900/90 border border-hairline rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Icon glyph="📜" /> Scene Subtitles & On/Off Toggles
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Enable or disable caption overlays individually per scene.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {scenes.map((scene, index) => (
            <div
              key={scene.id}
              className="p-3.5 bg-gray-800/40 hover:bg-gray-800/70 border border-hairline rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-start sm:items-center gap-3 flex-1">
                <span className="w-5 h-5 rounded-full bg-purple-600/30 border border-purple-500/40 text-purple-300 font-bold flex items-center justify-center shrink-0">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="text-white font-medium line-clamp-2 leading-relaxed">
                    "{scene.text}"
                  </p>
                  <span className="text-[10px] text-gray-400">
                    Duration: {formatDuration(scene.duration)} • {scene.text.split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => onUpdateScene(scene.id, { burn_caption: !(scene.burn_caption ?? true) })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                    scene.burn_caption ?? true
                      ? "bg-purple-600 border-purple-500 text-white"
                      : "bg-gray-800 border-hairline text-gray-400 hover:text-white"
                  }`}
                >
                  <span>{iconify((scene.burn_caption ?? true) ? "✓ Caption Active" : "✕ Disabled")}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
