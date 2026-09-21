import { useState, useEffect, useRef } from "react";
import type { Scene, AspectRatioType } from "../types";
import ImageSearchModal from "./ImageSearchModal";
import { NATURE_FALLBACKS } from "../data/nature-fallbacks";
import { REAL_FILTER_PRESETS, getFilterPreset, type FilterPreset } from "../data/filters-library";
import { stopAllSoundPreviews } from "../data/media-library";
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
  onImageSearch: (sceneId: number, query: string) => Promise<{ imageUrl: string; allImages?: string[] } | undefined>;
  onDelete?: (sceneId: number) => void;
}

export default function SceneEditor({
  scene,
  index,
  totalScenes = 1,
  aspectRatio = "16:9",
  targetDuration = 20,
  onUpdateTargetDuration,
  onUpdate,
  onImageSearch,
  onDelete,
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

  const currentFilter = getFilterPreset(scene.filter);

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

  // Framing values
  const offsetX = scene.image_offset_x ?? 0; // -50 to 50%
  const offsetY = scene.image_offset_y ?? 0; // -50 to 50%
  const zoom = scene.image_zoom ?? 1.0;      // 1.0 to 2.5x
  const fitMode = scene.image_fit ?? "cover";

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

  const handleSelectFromModal = (url: string) => {
    onUpdate(scene.id, { image_url: url, image_offset_x: 0, image_offset_y: 0, image_zoom: 1.0 });
    setShowSearchModal(false);
    setImgError(false);
  };

  const handleSelectNatureFallback = (url: string) => {
    onUpdate(scene.id, { image_url: url, image_offset_x: 0, image_offset_y: 0, image_zoom: 1.0 });
    setShowNatureMenu(false);
    setImgError(false);
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleToggleAttachedAudio = () => {
    if (!scene.audio_url) return;
    if (isPlayingAttachedAudio) {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch {}
        audioRef.current = null;
      }
      setIsPlayingAttachedAudio(false);
      return;
    }

    stopAllSoundPreviews();

    try {
      const audio = new Audio(scene.audio_url);
      audio.loop = false;
      audioRef.current = audio;
      setIsPlayingAttachedAudio(true);
      audio.play().catch(() => {
        setIsPlayingAttachedAudio(false);
        audioRef.current = null;
      });
      audio.onended = () => {
        setIsPlayingAttachedAudio(false);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setIsPlayingAttachedAudio(false);
        audioRef.current = null;
      };
    } catch {
      setIsPlayingAttachedAudio(false);
      audioRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {}
      }
    };
  }, []);

  const setPresetPosition = (x: number, y: number) => {
    onUpdate(scene.id, { image_offset_x: x, image_offset_y: y });
  };

  const handleResetFraming = () => {
    onUpdate(scene.id, {
      image_offset_x: 0,
      image_offset_y: 0,
      image_zoom: 1.0,
      image_fit: "cover",
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
              <img
                src={scene.image_url}
                alt={`Scene ${index + 1}`}
                className={`transition-all duration-150 ${
                  fitMode === "contain" ? "object-contain max-h-full" : "w-full h-full object-cover"
                }`}
                style={{
                  transform: `translate(${offsetX}%, ${offsetY}%) scale(${zoom})`,
                  transformOrigin: "center center",
                  filter: compareOriginal ? "none" : currentFilter.cssFilter,
                }}
                onError={() => setImgError(true)}
              />

              {/* Realistic SVG Filter Texture / Lighting Overlay */}
              {!compareOriginal && currentFilter.overlayUrl && (
                <img
                  src={currentFilter.overlayUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300 z-[1]"
                  style={{
                    mixBlendMode: currentFilter.blendMode || "screen",
                    opacity: currentFilter.overlayOpacity ?? 0.85,
                  }}
                />
              )}

              {/* Active Filter Pill Badge */}
              {scene.filter && scene.filter !== "none" && (
                <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 bg-gray-950/85 backdrop-blur border border-purple-500/80 rounded text-[10px] font-semibold text-purple-200 flex items-center gap-1 shadow-md">
                  <span>{currentFilter.icon}</span>
                  <span>{currentFilter.name}</span>
                </div>
              )}

              {/* Quick Compare Button (Hold to see original) */}
              {scene.filter && scene.filter !== "none" && (
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

            {/* IMAGE EDITING: CROP, MOVE AROUND, PAN & ZOOM TILL IT FITS */}
            {showCropTools && (
              <div className="bg-gray-900/95 border border-amber-800/50 rounded-xl p-3 space-y-3 animate-fade-in text-xs">
                <div className="flex items-center justify-between border-b border-gray-800 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-semibold">
                      ✂️ Image Framing & Positioning
                    </span>
                    <span className="text-[11px] text-gray-400">
                      Crop, zoom, and move image until it fits the frame perfectly
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Pan X Slider */}
                  <div>
                    <div className="flex justify-between text-gray-300 mb-1">
                      <span>Horizontal Pan (X):</span>
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
                    <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                      <span>Left (-50%)</span>
                      <span>Center</span>
                      <span>Right (+50%)</span>
                    </div>
                  </div>

                  {/* Pan Y Slider */}
                  <div>
                    <div className="flex justify-between text-gray-300 mb-1">
                      <span>Vertical Pan (Y):</span>
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
                    <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                      <span>Top (-50%)</span>
                      <span>Center</span>
                      <span>Bottom (+50%)</span>
                    </div>
                  </div>

                  {/* Zoom / Scale Slider */}
                  <div>
                    <div className="flex justify-between text-gray-300 mb-1">
                      <span>Scale / Zoom:</span>
                      <span className="font-mono text-amber-300">{zoom.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={1.0}
                      max={2.5}
                      step={0.05}
                      value={zoom}
                      onChange={(e) => onUpdate(scene.id, { image_zoom: parseFloat(e.target.value) })}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                      <span>1.0x (Standard)</span>
                      <span>1.75x</span>
                      <span>2.5x (Close-up)</span>
                    </div>
                  </div>
                </div>

                {/* Quick Alignment Presets + Fit Mode */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-800">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400 text-[11px]">Quick Alignment:</span>
                    <button
                      type="button"
                      onClick={() => setPresetPosition(0, -25)}
                      className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-gray-300 text-[11px]"
                    >
                      ⬆ Top
                    </button>
                    <button
                      type="button"
                      onClick={() => setPresetPosition(0, 0)}
                      className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-gray-300 text-[11px]"
                    >
                      ⏺ Center
                    </button>
                    <button
                      type="button"
                      onClick={() => setPresetPosition(0, 25)}
                      className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-gray-300 text-[11px]"
                    >
                      ⬇ Bottom
                    </button>
                    <button
                      type="button"
                      onClick={() => setPresetPosition(-25, 0)}
                      className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-gray-300 text-[11px]"
                    >
                      ⬅ Left
                    </button>
                    <button
                      type="button"
                      onClick={() => setPresetPosition(25, 0)}
                      className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-gray-300 text-[11px]"
                    >
                      ➡ Right
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400 text-[11px]">Fit Mode:</span>
                    <button
                      type="button"
                      onClick={() => onUpdate(scene.id, { image_fit: "cover" })}
                      className={`px-2 py-1 rounded text-[11px] font-medium border ${
                        fitMode === "cover"
                          ? "bg-amber-950 border-amber-600 text-amber-300"
                          : "bg-gray-800 border-gray-700 text-gray-400"
                      }`}
                    >
                      Fill Frame (Cover)
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdate(scene.id, { image_fit: "contain" })}
                      className={`px-2 py-1 rounded text-[11px] font-medium border ${
                        fitMode === "contain"
                          ? "bg-amber-950 border-amber-600 text-amber-300"
                          : "bg-gray-800 border-gray-700 text-gray-400"
                      }`}
                    >
                      Show Full (Contain)
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
