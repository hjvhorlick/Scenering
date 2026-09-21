import { useState, useEffect } from "react";
import type { Scene, AspectRatioType } from "../types";
import ImageSearchModal from "./ImageSearchModal";
import SceneFramePreview from "./SceneFramePreview";
import {
  FIT_MODES,
  BACKDROP_STYLES,
  resolveFraming,
  frameSizeFor,
  suggestFit,
  DEFAULT_FRAMING,
} from "../lib/scene-framing";
import { NATURE_FALLBACKS } from "../data/nature-fallbacks";
import { getFilterCss, getPreset, type VideoFilterConfig } from "../data/video-filters";
import {
  countWords,
  getSpokenDurationFromWords,
  calibrateTextToTargetDuration,
  getTargetWordCount,
} from "../lib/duration-utils";

interface SceneEditorProps {
  scene: Scene;
  index: number;
  totalScenes?: number;
  aspectRatio?: AspectRatioType;
  targetDuration?: number;
  onUpdateTargetDuration?: (duration: number) => void;
  onUpdate: (sceneId: number, updates: Partial<Scene>) => void;
  /** project-wide look (applied in Video Studio → Filters); shown here read-only */
  videoFilter?: VideoFilterConfig | null;
  onImageSearch: (sceneId: number, query: string) => Promise<{ imageUrl: string; allImages?: string[] } | undefined>;
  onDelete?: (sceneId: number) => void;
  /** copy this scene's framing to every scene in the project */
  onApplyFramingToAll?: (framing: Partial<Scene>) => void;
}

export default function SceneEditor({
  scene,
  index,
  totalScenes = 1,
  aspectRatio = "16:9",
  targetDuration = 20,
  onUpdateTargetDuration,
  onUpdate,
  videoFilter = null,
  onImageSearch,
  onDelete,
  onApplyFramingToAll,
}: SceneEditorProps) {
  const [textValue, setTextValue] = useState(scene.text);
  const [queryValue, setQueryValue] = useState(scene.image_query);
  const [searching, setSearching] = useState(false);
  const [isPlayingAttachedAudio, setIsPlayingAttachedAudio] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showNatureMenu, setShowNatureMenu] = useState(false);
  const [showCropTools, setShowCropTools] = useState(false);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [cropMode, setCropMode] = useState(false);

  const activeLook = getPreset(videoFilter?.id);
  const lookCss = getFilterCss(videoFilter);

  useEffect(() => {
    setTextValue(scene.text);
  }, [scene.text]);

  const currentSceneDuration = scene.duration || targetDuration;
  const targetWordCount = getTargetWordCount(currentSceneDuration);
  const wordsCount = countWords(textValue);
  const spokenSeconds = getSpokenDurationFromWords(textValue);

  // Set default duration if completely unset or legacy 4s
  useEffect(() => {
    if (!scene.duration || scene.duration === 4) {
      onUpdate(scene.id, { duration: targetDuration });
    }
  }, [scene.id, scene.duration, targetDuration, onUpdate]);

  const handleScriptChange = (newVal: string) => {
    setTextValue(newVal);
    onUpdate(scene.id, { text: newVal });
  };

  // Framing values — resolved through the shared engine so the editor and the
  // renderer always agree on what every setting means.
  const framing = resolveFraming(scene);
  const offsetX = framing.offsetX;
  const offsetY = framing.offsetY;
  const zoom = framing.zoom;
  const fitMode = framing.fit;
  const crop = framing.crop;
  const rotate = framing.rotate;
  const flipH = framing.flipH;
  const flipV = framing.flipV;
  const backdrop = framing.backdrop;
  const backdropBlur = framing.backdropBlur;
  const backdropZoom = framing.backdropZoom;
  const backdropDim = framing.backdropDim;
  const backdropColor = framing.backdropColor;

  /** Crop presets offered as one-click buttons */
  const CROP_SHAPES = [
    { label: "16:9", ratio: 16 / 9 },
    { label: "9:16", ratio: 9 / 16 },
    { label: "1:1", ratio: 1 },
    { label: "4:3", ratio: 4 / 3 },
    { label: "3:2", ratio: 3 / 2 },
  ];

  const normaliseAngle = (a: number) => {
    let v = Math.round(a);
    while (v > 180) v -= 360;
    while (v < -180) v += 360;
    return v;
  };

  const updateCrop = (key: "x" | "y" | "w" | "h", value: number) => {
    const next = { ...crop, [key]: value };
    // keep the window inside the photo
    next.w = Math.max(0.05, Math.min(1, next.w));
    next.h = Math.max(0.05, Math.min(1, next.h));
    next.x = Math.max(0, Math.min(1 - next.w, next.x));
    next.y = Math.max(0, Math.min(1 - next.h, next.y));
    onUpdate(scene.id, { image_crop: next });
  };

  /**
   * Crops the source photo to a target shape, keeping it centred. Works off
   * the photo's real pixel dimensions so the result is a true 16:9 (or
   * whatever) slice rather than a stretched one.
   */
  const cropToRatio = (ratio: number) => {
    const el = new Image();
    el.src = scene.image_url || "";
    const apply = (nw: number, nh: number) => {
      const srcRatio = nw / nh;
      let w = 1;
      let h = 1;
      if (srcRatio > ratio) {
        w = ratio / srcRatio;
      } else {
        h = srcRatio / ratio;
      }
      onUpdate(scene.id, {
        image_crop: { x: (1 - w) / 2, y: (1 - h) / 2, w, h },
      });
    };
    if (el.complete && el.naturalWidth) apply(el.naturalWidth, el.naturalHeight);
    else el.onload = () => apply(el.naturalWidth, el.naturalHeight);
  };

  /** Copies this scene's framing onto every other scene in the project */
  const applyFramingToAll = () => {
    if (!onApplyFramingToAll) return;
    onApplyFramingToAll({
      image_fit: fitMode,
      image_offset_x: offsetX,
      image_offset_y: offsetY,
      image_zoom: zoom,
      image_rotate: rotate,
      image_flip_h: flipH,
      image_flip_v: flipV,
      image_backdrop: backdrop,
      image_backdrop_blur: backdropBlur,
      image_backdrop_zoom: backdropZoom,
      image_backdrop_dim: backdropDim,
      image_backdrop_color: backdropColor,
    });
  };

  // Quick search
  const handleQuickSearch = async () => {
    setSearching(true);
    setImgError(false);
    try {
      await onImageSearch(scene.id, queryValue);
    } finally {
      setSearching(false);
    }
  };

  /**
   * A freshly chosen photo starts unframed. If its shape is a long way from
   * the video frame's, the blurred fill is picked automatically so the user
   * never gets a badly cropped subject by default.
   */
  const adoptImage = (url: string) => {
    const frame = frameSizeFor(aspectRatio);
    const base: Partial<Scene> = {
      image_url: url,
      image_offset_x: 0,
      image_offset_y: 0,
      image_zoom: 1.0,
      image_crop: { x: 0, y: 0, w: 1, h: 1 },
      image_rotate: 0,
      image_flip_h: false,
      image_flip_v: false,
    };
    onUpdate(scene.id, base);
    const probe = new Image();
    probe.onload = () => {
      onUpdate(scene.id, { image_fit: suggestFit(probe, frame.w, frame.h) });
    };
    probe.src = url;
  };

  const handleSelectFromModal = (url: string) => {
    adoptImage(url);
    setShowSearchModal(false);
    setImgError(false);
  };

  const handleSelectNatureFallback = (url: string) => {
    adoptImage(url);
    setShowNatureMenu(false);
    setImgError(false);
  };

  const handleToggleAttachedAudio = () => {
    if (!scene.audio_url) return;
    if (isPlayingAttachedAudio) {
      setIsPlayingAttachedAudio(false);
      return;
    }
    const audio = new Audio(scene.audio_url);
    setIsPlayingAttachedAudio(true);
    audio.play();
    audio.onended = () => setIsPlayingAttachedAudio(false);
    audio.onerror = () => setIsPlayingAttachedAudio(false);
  };

  const setPresetPosition = (x: number, y: number) => {
    onUpdate(scene.id, { image_offset_x: x, image_offset_y: y });
  };

  const handleResetFraming = () => {
    onUpdate(scene.id, {
      image_offset_x: 0,
      image_offset_y: 0,
      image_zoom: 1.0,
      image_fit: "cover",
      image_crop: { x: 0, y: 0, w: 1, h: 1 },
      image_rotate: 0,
      image_flip_h: false,
      image_flip_v: false,
      image_backdrop: DEFAULT_FRAMING.backdrop,
      image_backdrop_blur: DEFAULT_FRAMING.backdropBlur,
      image_backdrop_zoom: DEFAULT_FRAMING.backdropZoom,
      image_backdrop_dim: DEFAULT_FRAMING.backdropDim,
    });
  };

  return (
    <div
      className="animate-slide-in bg-gray-800/60 border border-gray-700/80 rounded-xl overflow-hidden shadow-sm hover:border-gray-600 transition-colors"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex flex-col lg:flex-row">
        {/* Visual Preview with Interactive Framing & Crop (reflects Aspect Ratio from Setup) */}
        <div className={`flex-shrink-0 relative group bg-gray-950 flex flex-col justify-center overflow-hidden min-h-[210px] ${
          aspectRatio === "9:16"
            ? "lg:w-56 w-full"
            : aspectRatio === "1:1"
            ? "lg:w-64 w-full"
            : aspectRatio === "4:3"
            ? "lg:w-72 w-full"
            : "lg:w-80 w-full"
        }`}>
          {/* Active Aspect Ratio Indicator */}
          <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-gray-900/80 backdrop-blur border border-gray-700/80 rounded text-[10px] font-mono text-gray-300 pointer-events-none flex items-center gap-1">
            <span>📐</span>
            <span>{aspectRatio}</span>
          </div>

          {scene.image_url && !imgError ? (
            <div className={`relative w-full overflow-hidden bg-black flex items-center justify-center min-h-[210px] ${
              aspectRatio === "9:16"
                ? "aspect-[9/16] lg:h-[300px]"
                : aspectRatio === "1:1"
                ? "aspect-square lg:h-[240px]"
                : aspectRatio === "4:3"
                ? "aspect-[4/3] lg:h-[230px]"
                : "aspect-video lg:h-full"
            }`}>
              {/* True-to-render thumbnail. This used to be an <img> with CSS
                  object-cover, which did not match the exported frame — the
                  canvas preview below is drawn by the render engine itself. */}
              <SceneFramePreview
                scene={scene}
                aspectRatio={aspectRatio}
                width={aspectRatio === "9:16" ? 170 : aspectRatio === "1:1" ? 240 : 300}
                videoFilter={compareOriginal ? null : videoFilter}
                className="mx-auto"
              />

              {/* Project-wide look badge (configured in Video Studio → Filters) */}
              {activeLook && (
                <div
                  className="absolute bottom-2 left-2 z-10 px-2 py-0.5 bg-gray-950/85 backdrop-blur border rounded text-[10px] font-semibold flex items-center gap-1 shadow-md"
                  style={{ borderColor: `${activeLook.accent}cc`, color: activeLook.accent }}
                  title={`${activeLook.name} — applied to the whole video from Video Studio → Filters`}
                >
                  <span>{activeLook.icon}</span>
                  <span>{activeLook.name}</span>
                </div>
              )}

              {/* Quick Compare Button (Hold to see original) */}
              {activeLook && (
                <button
                  type="button"
                  onMouseDown={() => setCompareOriginal(true)}
                  onMouseUp={() => setCompareOriginal(false)}
                  onMouseLeave={() => setCompareOriginal(false)}
                  onTouchStart={() => setCompareOriginal(true)}
                  onTouchEnd={() => setCompareOriginal(false)}
                  className="absolute bottom-2 right-2 z-10 px-2 py-0.5 bg-gray-900/90 hover:bg-gray-800 text-gray-300 border border-gray-700 rounded text-[10px] font-medium transition-colors shadow-sm select-none"
                  title="Hold to see original unfiltered image"
                >
                  {compareOriginal ? "Showing Original" : "Hold: Original"}
                </button>
              )}

              {/* Hover quick action overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-[2]">
                <button
                  type="button"
                  onClick={() => setShowCropTools((prev) => !prev)}
                  className="px-2.5 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur rounded-lg text-white text-xs transition-colors flex items-center gap-1.5"
                  title="Crop and reposition image"
                >
                  ✂️ Crop & Fit
                </button>
                <button
                  type="button"
                  onClick={() => setShowSearchModal(true)}
                  className="px-2.5 py-1.5 bg-indigo-600/80 hover:bg-indigo-600 backdrop-blur rounded-lg text-white text-xs transition-colors flex items-center gap-1.5"
                  title="Search more photos"
                >
                  🔍 Research
                </button>
              </div>
            </div>
          ) : (
            <div className="aspect-video lg:aspect-auto lg:h-full bg-gray-900/90 flex flex-col items-center justify-center min-h-[210px] p-4 text-center gap-2.5">
              {imgError && <p className="text-xs text-red-400">Image failed to load</p>}
              <button
                type="button"
                onClick={handleQuickSearch}
                disabled={searching}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 rounded-lg text-white text-xs font-medium transition-colors flex items-center gap-2"
              >
                {searching ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Searching...
                  </>
                ) : (
                  <>🔍 Find Image</>
                )}
              </button>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowSearchModal(true)}
                  className="text-indigo-400 hover:text-indigo-300 underline"
                >
                  Research (10)
                </button>
                <span className="text-gray-600">•</span>
                <button
                  type="button"
                  onClick={() => setShowNatureMenu(true)}
                  className="text-emerald-400 hover:text-emerald-300 underline"
                >
                  Nature Fallback
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content & Dedicated Scene / Image Settings Section */}
        <div className="flex-1 p-4 space-y-3.5">
          {/* Header Row: Scene Number + Dialogue Voice + Duration + Delete */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800/80 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <span>Scene {index + 1}</span>
                {totalScenes !== undefined && (
                  <>
                    <span className="text-gray-500 font-normal lowercase text-[11px]">of</span>
                    <span className="px-1.5 py-0.2 rounded bg-indigo-950/90 border border-indigo-700/60 text-indigo-300 font-mono text-[11px] normal-case">
                      {totalScenes} {totalScenes === 1 ? "scene" : "scenes"}
                    </span>
                  </>
                )}
              </span>
              {scene.speaker_name && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 font-medium">
                  {scene.speaker_name}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Attached Voice Track Badge (From Voiceover Studio) */}
              {scene.audio_url && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/90 border border-emerald-600/80 text-emerald-300 text-xs font-medium animate-fade-in shadow-sm">
                  <span>🎙️</span>
                  <span className="truncate max-w-[140px]" title={scene.audio_name || "Saved Voiceover"}>
                    {scene.audio_name || "Voiceover Saved"}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleAttachedAudio}
                    className="hover:text-white px-1 font-bold text-xs"
                    title="Play attached audio track"
                  >
                    {isPlayingAttachedAudio ? "⏹" : "▶"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdate(scene.id, { audio_url: null, audio_name: null })}
                    className="text-gray-400 hover:text-red-400 px-0.5 text-xs font-bold"
                    title="Clear saved audio track"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Scene Duration Badge (configured in Setup) */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-950/80 border border-indigo-700/80 rounded-lg text-xs"
                title={`Scene duration: ${currentSceneDuration}s`}
              >
                <span className="text-indigo-400">⏱️</span>
                <span className="text-white font-mono font-bold">
                  {currentSceneDuration}s
                </span>
              </div>

              {/* Delete Scene Button */}
              {onDelete && totalScenes > 1 && (
                <button
                  type="button"
                  onClick={() => onDelete(scene.id)}
                  className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-950/40 rounded transition-colors"
                  title={`Delete scene ${index + 1}`}
                >
                  🗑️
                </button>
              )}
            </div>
          </div>

          {/* Typable Scene Script Section */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={`scene-script-${scene.id}`} className="font-semibold text-gray-200 flex items-center gap-1.5">
                <span>📝</span>
                <span>Scene Script & Narration</span>
              </label>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-mono ${wordsCount < Math.floor(targetWordCount * 0.88) ? "text-amber-400 font-semibold" : "text-gray-400"}`}>
                  {wordsCount} words • ~{spokenSeconds}s read
                </span>
                {wordsCount < Math.floor(targetWordCount * 0.88) && (
                  <button
                    type="button"
                    onClick={() => {
                      const expanded = calibrateTextToTargetDuration(textValue, currentSceneDuration);
                      setTextValue(expanded);
                      handleScriptChange(expanded);
                    }}
                    className="px-2 py-0.5 bg-amber-950/90 hover:bg-amber-900 border border-amber-500/70 text-amber-200 rounded text-[10px] font-medium transition-colors flex items-center gap-1 shadow-sm"
                    title={`Expand scene to ~${targetWordCount} words to fit ${currentSceneDuration}s duration`}
                  >
                    <span>⚡ Calibrate to {currentSceneDuration}s (~{targetWordCount}w)</span>
                  </button>
                )}
              </div>
            </div>

            <textarea
              id={`scene-script-${scene.id}`}
              value={textValue}
              onChange={(e) => handleScriptChange(e.target.value)}
              rows={3}
              placeholder="Enter the narration script for this scene..."
              className="w-full px-3 py-2 bg-gray-900/90 border border-gray-700 hover:border-gray-600 focus:border-indigo-500 rounded-xl text-white text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y transition-colors font-sans shadow-inner"
            />
          </div>

          {/* Image Settings Toolbar: Researching, Nature Fallback, Crop & Fit, Filters */}
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              {/* Research Input */}
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={queryValue}
                  onChange={(e) => setQueryValue(e.target.value)}
                  placeholder="Search image topic..."
                  className="w-full px-3 py-1.5 bg-gray-700/80 border border-gray-600 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleQuickSearch();
                  }}
                />
              </div>

              {/* Research Action Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleQuickSearch}
                  disabled={searching}
                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded-lg text-white text-xs font-medium transition-colors whitespace-nowrap"
                  title="Instant quick search"
                >
                  {searching ? "..." : "🔍 Quick"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowSearchModal(true)}
                  className="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-xs transition-colors whitespace-nowrap flex items-center gap-1"
                  title="Browse 10 images with filters"
                >
                  <span>🖼️ Research</span>
                </button>

                {/* Nature Fallback Button */}
                <button
                  type="button"
                  onClick={() => setShowNatureMenu((prev) => !prev)}
                  className="px-2.5 py-1.5 bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1"
                  title="Select high-definition verified nature fallback background"
                >
                  <span>🌿 Nature Fallback</span>
                  <span className="text-[10px]">{showNatureMenu ? "▲" : "▼"}</span>
                </button>

                {/* Image Edit & Crop Toggle */}
                <button
                  type="button"
                  onClick={() => setShowCropTools((prev) => !prev)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap flex items-center gap-1 ${
                    showCropTools || (offsetX !== 0 || offsetY !== 0 || zoom !== 1.0)
                      ? "bg-amber-950/70 border-amber-600 text-amber-300"
                      : "bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-200"
                  }`}
                  title="Crop, pan, and move around until it fits"
                >
                  <span>✂️ Crop & Move</span>
                  <span className="text-[10px]">{showCropTools ? "▲" : "▼"}</span>
                </button>
              </div>
            </div>

            {/* NATURE FALLBACK QUICK SELECTION DRAWER */}
            {showNatureMenu && (
              <div className="bg-gray-900/90 border border-emerald-800/60 rounded-xl p-3 space-y-2 animate-fade-in text-xs">
                <div className="flex items-center justify-between border-b border-emerald-900/60 pb-1.5">
                  <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                    <span>🌿</span>
                    <span>High Definition Nature Fallback Library</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowNatureMenu(false)}
                    className="text-gray-400 hover:text-white text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {NATURE_FALLBACKS.map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => handleSelectNatureFallback(bg.url)}
                      className="group relative rounded-lg overflow-hidden border border-gray-700 hover:border-emerald-500 transition-all text-left aspect-video"
                    >
                      <img
                        src={bg.thumb}
                        alt={bg.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-1.5">
                        <span className="text-[10px] text-white font-medium truncate">
                          {bg.name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* IMAGE EDITING: CROP, MOVE, SIZE, ROTATE, FIT — all in one place.
                The preview here is drawn by the same engine as the exported
                video, so nothing is ever squashed and the blurred fill shows
                exactly as it will render. */}
            {showCropTools && (
              <div className="bg-gray-900/95 border border-amber-800/50 rounded-xl p-3 space-y-3 animate-fade-in text-xs">
                <div className="flex items-center justify-between border-b border-gray-800 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-semibold">✂️ Crop, Move & Fit</span>
                    <span className="text-[11px] text-gray-400">
                      Drag the preview to move, scroll to zoom — the image keeps its shape
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowGuides((g) => !g)}
                      className={`text-[11px] px-2 py-0.5 rounded border ${
                        showGuides
                          ? "bg-indigo-950 border-indigo-600 text-indigo-300"
                          : "bg-gray-800 border-gray-700 text-gray-400"
                      }`}
                      title="Rule-of-thirds grid and safe area"
                    >
                      # Guides
                    </button>
                    <button
                      type="button"
                      onClick={handleResetFraming}
                      className="text-[11px] text-gray-400 hover:text-white underline"
                    >
                      Reset Frame
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCropTools(false)}
                      className="text-gray-400 hover:text-white px-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-3">
                  {/* Live, true-to-render preview */}
                  <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                    <SceneFramePreview
                      scene={scene}
                      aspectRatio={aspectRatio}
                      width={aspectRatio === "9:16" ? 150 : 250}
                      videoFilter={videoFilter}
                      interactive
                      cropMode={cropMode}
                      showGuides={showGuides}
                      onChange={(u) => onUpdate(scene.id, u)}
                    />
                    <span className="text-[10px] text-gray-500 text-center max-w-[250px]">
                      Exactly how this scene will render at {aspectRatio}
                    </span>
                  </div>

                  <div className="flex-1 space-y-3">
                    {/* ---- Fit mode: the fix for squashed / cut-off images ---- */}
                    <div className="space-y-1.5">
                      <span className="text-gray-400 text-[11px]">How the image fills the frame:</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {FIT_MODES.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            title={m.blurb}
                            onClick={() => onUpdate(scene.id, { image_fit: m.id })}
                            className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-colors flex flex-col items-center gap-0.5 ${
                              fitMode === m.id
                                ? "bg-amber-950 border-amber-600 text-amber-300"
                                : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                            }`}
                          >
                            <span className="text-sm leading-none">{m.icon}</span>
                            <span>{m.name}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-500 leading-snug">
                        {FIT_MODES.find((m) => m.id === fitMode)?.blurb}
                      </p>
                    </div>

                    {/* ---- Blurred / letterbox backdrop settings ---- */}
                    {fitMode !== "cover" && (
                      <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-gray-400 text-[11px]">Bars filled with:</span>
                          {BACKDROP_STYLES.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => onUpdate(scene.id, { image_backdrop: b.id })}
                              className={`px-2 py-1 rounded text-[11px] font-medium border ${
                                backdrop === b.id
                                  ? "bg-amber-950 border-amber-600 text-amber-300"
                                  : "bg-gray-800 border-gray-700 text-gray-400"
                              }`}
                            >
                              {b.icon} {b.name}
                            </button>
                          ))}
                          {backdrop === "colour" && (
                            <input
                              type="color"
                              value={backdropColor}
                              onChange={(e) => onUpdate(scene.id, { image_backdrop_color: e.target.value })}
                              className="w-8 h-6 rounded border border-gray-600 bg-transparent cursor-pointer"
                            />
                          )}
                        </div>

                        {backdrop === "blur" && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <div className="flex justify-between text-gray-300 mb-0.5">
                                <span>Blur amount:</span>
                                <span className="font-mono text-amber-300">{Math.round(backdropBlur)}px</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={120}
                                step={2}
                                value={backdropBlur}
                                onChange={(e) => onUpdate(scene.id, { image_backdrop_blur: parseInt(e.target.value) })}
                                className="w-full accent-amber-500 cursor-pointer"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-gray-300 mb-0.5">
                                <span>Backdrop zoom:</span>
                                <span className="font-mono text-amber-300">{backdropZoom.toFixed(2)}x</span>
                              </div>
                              <input
                                type="range"
                                min={1}
                                max={2.5}
                                step={0.05}
                                value={backdropZoom}
                                onChange={(e) => onUpdate(scene.id, { image_backdrop_zoom: parseFloat(e.target.value) })}
                                className="w-full accent-amber-500 cursor-pointer"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-gray-300 mb-0.5">
                                <span>Darken backdrop:</span>
                                <span className="font-mono text-amber-300">{Math.round(backdropDim * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={0.9}
                                step={0.05}
                                value={backdropDim}
                                onChange={(e) => onUpdate(scene.id, { image_backdrop_dim: parseFloat(e.target.value) })}
                                className="w-full accent-amber-500 cursor-pointer"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ---- Move & size ---- */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <div className="flex justify-between text-gray-300 mb-1">
                          <span>Move left / right:</span>
                          <span className="font-mono text-amber-300">{offsetX}%</span>
                        </div>
                        <input
                          type="range"
                          min={-50}
                          max={50}
                          step={1}
                          value={offsetX}
                          onChange={(e) => onUpdate(scene.id, { image_offset_x: parseInt(e.target.value) })}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-gray-300 mb-1">
                          <span>Move up / down:</span>
                          <span className="font-mono text-amber-300">{offsetY}%</span>
                        </div>
                        <input
                          type="range"
                          min={-50}
                          max={50}
                          step={1}
                          value={offsetY}
                          onChange={(e) => onUpdate(scene.id, { image_offset_y: parseInt(e.target.value) })}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-gray-300 mb-1">
                          <span>Size / zoom:</span>
                          <span className="font-mono text-amber-300">{zoom.toFixed(2)}x</span>
                        </div>
                        <input
                          type="range"
                          min={0.25}
                          max={4}
                          step={0.05}
                          value={zoom}
                          onChange={(e) => onUpdate(scene.id, { image_zoom: parseFloat(e.target.value) })}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* ---- Crop rectangle ---- */}
                    <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-[11px]">
                          Crop — trim the edges off the source photo
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCropMode((c) => !c)}
                            className={`px-2 py-0.5 rounded text-[11px] border ${
                              cropMode
                                ? "bg-amber-950 border-amber-600 text-amber-300"
                                : "bg-gray-800 border-gray-700 text-gray-400"
                            }`}
                            title="Drag the preview to move the crop window instead of the image"
                          >
                            {cropMode ? "Dragging crop" : "Drag crop"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdate(scene.id, { image_crop: { x: 0, y: 0, w: 1, h: 1 } })}
                            className="text-[11px] text-gray-400 hover:text-white underline"
                          >
                            Clear crop
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {([
                          ["w", "Width", crop.w],
                          ["h", "Height", crop.h],
                          ["x", "Left edge", crop.x],
                          ["y", "Top edge", crop.y],
                        ] as const).map(([key, label, val]) => (
                          <div key={key}>
                            <div className="flex justify-between text-gray-300 mb-0.5">
                              <span>{label}:</span>
                              <span className="font-mono text-amber-300">{Math.round(val * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min={key === "w" || key === "h" ? 0.05 : 0}
                              max={1}
                              step={0.01}
                              value={val}
                              onChange={(e) => updateCrop(key, parseFloat(e.target.value))}
                              className="w-full accent-amber-500 cursor-pointer"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-gray-400 text-[11px]">Crop to shape:</span>
                        {CROP_SHAPES.map((c) => (
                          <button
                            key={c.label}
                            type="button"
                            onClick={() => cropToRatio(c.ratio)}
                            className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-gray-300 text-[11px]"
                            title={`Crop the photo to ${c.label}`}
                          >
                            {c.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => cropToRatio(frameSizeFor(aspectRatio).w / frameSizeFor(aspectRatio).h)}
                          className="px-2 py-0.5 bg-indigo-950 hover:bg-indigo-900 rounded border border-indigo-700 text-indigo-300 text-[11px]"
                        >
                          Match frame ({aspectRatio})
                        </button>
                      </div>
                    </div>

                    {/* ---- Rotate, flip, alignment ---- */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-800">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-gray-400 text-[11px]">Align:</span>
                        {([
                          ["⬆ Top", 0, -25],
                          ["⏺ Centre", 0, 0],
                          ["⬇ Bottom", 0, 25],
                          ["⬅ Left", -25, 0],
                          ["➡ Right", 25, 0],
                        ] as const).map(([label, px, py]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setPresetPosition(px, py)}
                            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-gray-300 text-[11px]"
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-gray-400 text-[11px]">Rotate:</span>
                        <button
                          type="button"
                          onClick={() => onUpdate(scene.id, { image_rotate: normaliseAngle(rotate - 90) })}
                          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-gray-300 text-[11px]"
                        >
                          ↺ 90°
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdate(scene.id, { image_rotate: normaliseAngle(rotate + 90) })}
                          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-gray-300 text-[11px]"
                        >
                          ↻ 90°
                        </button>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          step={1}
                          value={rotate}
                          onChange={(e) => onUpdate(scene.id, { image_rotate: parseInt(e.target.value) })}
                          className="w-24 accent-amber-500 cursor-pointer"
                          title="Fine rotation"
                        />
                        <span className="font-mono text-amber-300 w-10 text-right">{rotate}°</span>
                        <button
                          type="button"
                          onClick={() => onUpdate(scene.id, { image_flip_h: !flipH })}
                          className={`px-2 py-1 rounded border text-[11px] ${
                            flipH ? "bg-amber-950 border-amber-600 text-amber-300" : "bg-gray-800 border-gray-700 text-gray-300"
                          }`}
                        >
                          ⇋ Flip
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdate(scene.id, { image_flip_v: !flipV })}
                          className={`px-2 py-1 rounded border text-[11px] ${
                            flipV ? "bg-amber-950 border-amber-600 text-amber-300" : "bg-gray-800 border-gray-700 text-gray-300"
                          }`}
                        >
                          ⇅ Flip
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={applyFramingToAll}
                      className="w-full px-2 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/70 rounded-lg text-indigo-200 text-[11px] font-medium transition-colors"
                      title="Copy this scene's fit, backdrop, zoom and position to every other scene"
                    >
                      Apply this framing to all scenes
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 10-result Research Modal */}
      {showSearchModal && (
        <ImageSearchModal
          initialQuery={queryValue || scene.text.slice(0, 40)}
          onSelect={handleSelectFromModal}
          onClose={() => setShowSearchModal(false)}
        />
      )}
    </div>
  );
}
