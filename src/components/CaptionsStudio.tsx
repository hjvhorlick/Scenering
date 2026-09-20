import { useEffect, useRef, useState } from "react";
import StepNav from "./StepNav";
import type { Scene, CaptionsConfig } from "../types";
import { generateSrtSubtitles } from "./RenderView";
import { renderCanvasCaptions } from "../lib/render-captions";
import {
  CAPTION_FONTS,
  CAPTION_STYLES,
  captionFontStack,
  getCaptionFont,
  getCaptionStyle,
  loadCaptionFonts,
  resolveCaptionStyleId,
  type CaptionStyleDef,
} from "../data/caption-styles";

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
  const [mode, setMode] = useState<"karaoke" | "normal">(captionsConfig?.mode || "karaoke");
  const [backgroundStyle, setBackgroundStyle] = useState<"transparent" | "blocked">(
    captionsConfig?.backgroundStyle || "blocked"
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
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadCaptionFonts().then(() => {
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
    ...partial,
  });

  const emitConfigUpdate = (partial: Partial<CaptionsConfig>) => {
    if (onUpdateCaptionsConfig) onUpdateCaptionsConfig(buildConfig(partial));
  };

  const captionPreviewRef = useRef<HTMLCanvasElement | null>(null);

  const activeStyle: CaptionStyleDef = getCaptionStyle(selectedPreset);
  const activeFont = getCaptionFont(fontId || activeStyle.fontId);

  /** Selecting a style applies its whole recipe (font, case, colours, border, shadow) */
  const handleSelectPreset = (style: CaptionStyleDef) => {
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
    emitConfigUpdate({
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
  };

  const handleModeChange = (newMode: "karaoke" | "normal") => {
    setMode(newMode);
    emitConfigUpdate({ mode: newMode });
  };

  const handleBackgroundChange = (newBg: "transparent" | "blocked") => {
    setBackgroundStyle(newBg);
    emitConfigUpdate({ backgroundStyle: newBg });
  };

  const handleApplyToAllScenes = () => {
    scenes.forEach((s) => {
      onUpdateScene(s.id, { burn_caption: burnCaptionsGlobal });
    });
    onApplyStyleToAll(burnCaptionsGlobal);
    emitConfigUpdate({ enabled: burnCaptionsGlobal });
  };

  const handleDownloadSrt = () => {
    const srt = generateSrtSubtitles(scenes);
    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "captions_subtitles.srt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sampleSceneText =
    scenes[0]?.text || "Create stunning short-form videos with automatic animated subtitles.";

  // The preview canvas runs the very same renderer the video uses, so the caption
  // you see here is the caption that gets burned in - no approximations.
  useEffect(() => {
    const canvas = captionPreviewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    // Neutral 16:9 stage so the caption, its border and its shadow are readable
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#243044");
    grad.addColorStop(0.55, "#3c3a46");
    grad.addColorStop(1, "#11141c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#e6ecff";
    const step = 96;
    for (let row = 0; row < h / step; row++) {
      for (let col = 0; col < w / step; col++) {
        ctx.fillRect(col * step + 24, row * step + 20, 54, 9);
      }
    }
    ctx.globalAlpha = 1;

    renderCanvasCaptions(ctx, sampleSceneText, 0.5, buildConfig(), w, h);
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
  ]);

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 animate-fade-in p-2 sm:p-0">
      {/* Single Previous / Next control — always at the top of the phase */}
      {onNavigateToStep && (
        <StepNav current="captions" onNavigate={onNavigateToStep} note="subtitle styling applies to every scene" />
      )}

      {/* Studio Header */}
      <div className="bg-gradient-to-r from-gray-900 via-purple-950/50 to-gray-900 border border-purple-900/40 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 text-xl">
                💬
              </span>
              <h2 className="text-xl font-bold text-white">Captions & Subtitles Studio</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-950 border border-indigo-700/60 text-indigo-300">
                Word-Sync Ready
              </span>
            </div>
            <p className="text-xs text-gray-300 max-w-xl">
              Design eye-catching on-screen caption styles, burn-in subtitles for viral social formats, or export synchronized SRT subtitle files.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadSrt}
              className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold border border-gray-700 flex items-center gap-2 transition-colors shadow"
            >
              <span>📄</span>
              <span>Export .SRT File</span>
            </button>

            <button
              onClick={handleApplyToAllScenes}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5"
            >
              <span>✨</span>
              <span>Apply to All {scenes.length} Scenes</span>
            </button>
          </div>
        </div>

        {/* Global Master Burn-In Switch */}
        <div className="mt-4 pt-4 border-t border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-900/60 p-3 rounded-xl border border-gray-700/50">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="masterBurnToggle"
              checked={burnCaptionsGlobal}
              onChange={(e) => {
                setBurnCaptionsGlobal(e.target.checked);
                emitConfigUpdate({ enabled: e.target.checked });
              }}
              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-gray-800 border-gray-700 cursor-pointer"
            />
            <label htmlFor="masterBurnToggle" className="cursor-pointer">
              <span className="text-xs font-bold text-white block">
                Burn Animated Captions into Video Frames
              </span>
              <span className="text-[11px] text-gray-400">
                When enabled, captions are baked directly onto the output MP4/WebM video stream.
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400">Total Scenes:</span>
            <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-800 text-purple-300 text-xs font-bold">
              {scenes.length} Captions
            </span>
          </div>
        </div>
      </div>

      {/* CORE CAPTION CONTROLS: Mode (Karaoke vs Normal) & Background (Transparent vs Blocked) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Caption Style Mode */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>🎤</span> Caption Playback Style
            </h3>
            <span className="text-[10px] text-purple-400 font-semibold uppercase">
              {mode === "karaoke" ? "Dynamic Sync" : "Clean Subtitle"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleModeChange("karaoke")}
              className={`p-3 rounded-xl border text-left transition-all ${
                mode === "karaoke"
                  ? "bg-purple-950/70 border-purple-500 text-white shadow-md shadow-purple-600/20 ring-1 ring-purple-500"
                  : "bg-gray-800/40 hover:bg-gray-800/80 border-gray-700/80 text-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <span>✨</span>
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
                  : "bg-gray-800/40 hover:bg-gray-800/80 border-gray-700/80 text-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <span>📝</span>
                <span>Normal Mode</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Clean, traditional subtitles showing complete sentences with uniform color.
              </p>
            </button>
          </div>
        </div>

        {/* Caption Background: Transparent vs Blocked */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>🖼️</span> Background Framing
            </h3>
            <span className="text-[10px] text-indigo-400 font-semibold uppercase">
              {backgroundStyle === "transparent" ? "No Box" : "Backdrop Pill"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleBackgroundChange("transparent")}
              className={`p-3 rounded-xl border text-left transition-all ${
                backgroundStyle === "transparent"
                  ? "bg-indigo-950/70 border-indigo-500 text-white shadow-md shadow-indigo-600/20 ring-1 ring-indigo-500"
                  : "bg-gray-800/40 hover:bg-gray-800/80 border-gray-700/80 text-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <span>🔲</span>
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
                  : "bg-gray-800/40 hover:bg-gray-800/80 border-gray-700/80 text-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <span>⬛</span>
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
      <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>👁️</span> Live Caption Preview
          </h3>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="px-2 py-0.5 rounded bg-gray-800 text-indigo-300 border border-gray-700">
              Style: {mode === "karaoke" ? "Karaoke" : "Normal"}
            </span>
            <span className="px-2 py-0.5 rounded bg-gray-800 text-purple-300 border border-gray-700">
              Backdrop: {backgroundStyle}
            </span>
          </div>
        </div>

        <div className="relative w-full aspect-video max-h-[260px] bg-black rounded-xl overflow-hidden border border-gray-700 shadow-inner">
          <canvas
            ref={captionPreviewRef}
            width={1280}
            height={720}
            className="w-full h-full block"
          />
          <div className="absolute top-2 left-3 text-[10px] text-white/70 bg-black/45 px-2 py-0.5 rounded">
            Video stage 16:9 · {activeStyle.name} · {activeFont.family}
          </div>
          <div className="absolute bottom-2 right-3 text-[10px] text-white/50 bg-black/45 px-2 py-0.5 rounded">
            Captions below are rendered by the same engine as the final video
          </div>
        </div>
      </div>

      {/* Caption Style Presets Grid */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>🎨</span> Subtitle Visual Style Presets
          </h3>
          <span className="text-xs text-gray-400">Click to preview style</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CAPTION_STYLES.map((style) => {
            const isSelected = selectedPreset === style.id;
            const styleFont = getCaptionFont(style.fontId);
            return (
              <div
                key={style.id}
                onClick={() => handleSelectPreset(style)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? "bg-purple-950/60 border-purple-500 shadow-md shadow-purple-600/20 ring-1 ring-purple-500"
                    : "bg-gray-800/50 hover:bg-gray-800 border-gray-700/80 text-gray-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-900 text-purple-300 border border-gray-700 shrink-0">
                      {style.category}
                    </span>
                    <span
                      className="text-sm text-white truncate"
                      style={{ fontFamily: captionFontStack(style.fontId), fontWeight: styleFont.weight }}
                      title={styleFont.label}
                    >
                      Aa Bb 123
                    </span>
                  </div>
                  <p
                    className="font-bold text-sm text-white mb-0.5"
                    style={{ fontFamily: captionFontStack(style.fontId), fontWeight: styleFont.weight }}
                  >
                    {style.name}
                  </p>
                  <p className="text-[10px] text-purple-200/70 mb-1.5">{styleFont.family}</p>
                  <p className="text-xs text-gray-400 mb-2 leading-relaxed">{style.description}</p>
                </div>

                <div className="pt-2 border-t border-gray-700/50 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-gray-600"
                      style={{ backgroundColor: style.textColor }}
                      title="Text colour"
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-gray-600"
                      style={{ backgroundColor: style.highlightColor }}
                      title="Active word colour"
                    />
                    <span className="text-[10px] text-gray-500">
                      {style.background === "blocked" ? "backdrop" : "no box"}
                    </span>
                  </div>
                  {isSelected && <span className="text-[10px] font-bold text-purple-400">✓ Active</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom Styling Adjustments */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-gray-800 text-xs">
          {/* Position */}
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-gray-700/70 space-y-1.5">
            <span className="text-gray-400 block font-medium">Placement:</span>
            <div className="grid grid-cols-3 gap-1">
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
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-gray-700/70 space-y-1.5">
            <span className="text-gray-400 block font-medium">Text Scale:</span>
            <div className="grid grid-cols-3 gap-1">
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
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-gray-700/70 space-y-1.5">
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
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-gray-700/70 space-y-1.5">
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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-gray-800 text-xs">
          {/* Font */}
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-gray-700/70 space-y-1.5">
            <span className="text-gray-400 block font-medium">Typeface:</span>
            <select
              value={fontId || activeStyle.fontId}
              onChange={(e) => {
                setFontId(e.target.value);
                emitConfigUpdate({ fontId: e.target.value });
              }}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-purple-500"
              style={{ fontFamily: captionFontStack(fontId || activeStyle.fontId) }}
            >
              {CAPTION_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.family} — {f.label.split("· ")[1]}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500">10 faces: classical → formal → artsy → fun</p>
          </div>

          {/* Border width — hairline by default, thicken as needed */}
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-gray-700/70 space-y-1.5">
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
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-gray-700/70 space-y-1.5">
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
                  shadowOn ? "bg-purple-600 text-white" : "bg-gray-900 text-gray-400 border border-gray-700"
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
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-gray-700/70 space-y-1.5">
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
      <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>📜</span> Scene Subtitles & On/Off Toggles
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
              className="p-3.5 bg-gray-800/40 hover:bg-gray-800/70 border border-gray-700/80 rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
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
                    Duration: {scene.duration}s • {scene.text.split(/\s+/).filter(Boolean).length} words
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
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                  }`}
                >
                  <span>{(scene.burn_caption ?? true) ? "✓ Caption Active" : "✕ Disabled"}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
