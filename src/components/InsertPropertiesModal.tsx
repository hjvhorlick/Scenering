import { useState, useRef } from "react";
import { TimelineInsert } from "../types";
import { SOUND_LIBRARY, playSoundPreview } from "../data/media-library";

interface InsertPropertiesModalProps {
  insert: TimelineInsert | null;
  isOpen?: boolean;
  totalDuration?: number;
  onUpdate: (updated: TimelineInsert) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function InsertPropertiesModal({
  insert,
  isOpen = true,
  totalDuration = 60,
  onUpdate,
  onDelete,
  onClose,
}: InsertPropertiesModalProps) {
  if (!isOpen || !insert) return null;

  return (
    <InsertPropertiesContent
      key={insert.id}
      insert={insert}
      totalDuration={totalDuration}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onClose={onClose}
    />
  );
}

function InsertPropertiesContent({
  insert,
  totalDuration,
  onUpdate,
  onDelete,
  onClose,
}: {
  insert: TimelineInsert;
  totalDuration: number;
  onUpdate: (updated: TimelineInsert) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const isAudioVisualizer =
    insert.category === "audio_visualizers" ||
    insert.category === "speech_reactive" ||
    insert.category === "meditation" ||
    insert.type.includes("wave") ||
    insert.type.includes("bars") ||
    insert.type.includes("spectrum");

  const isSoundEffect = insert.category === "sound_effects";
  const isContentCard = insert.category === "content_cards" || insert.category === "other_cards";
  const isCallToAction = insert.category === "call_to_action";
  const isSticker = insert.category === "stickers";

  // Initial tab selection based on element type
  const defaultTab = isSoundEffect
    ? "audio"
    : isAudioVisualizer
    ? "visuals"
    : isContentCard
    ? "content"
    : "visuals";

  const [data, setData] = useState<TimelineInsert>({
    ...insert,
    audioSource: insert.audioSource || (isAudioVisualizer ? "voice" : "all"),
    visualOptions: {
      has3DLook: insert.visualOptions?.has3DLook ?? true,
      primaryColor: insert.visualOptions?.primaryColor || "#38BDF8",
      secondaryColor: insert.visualOptions?.secondaryColor || "#F43F5E",
      shadowIntensity: insert.visualOptions?.shadowIntensity ?? 0.8,
      rotation: insert.visualOptions?.rotation ?? 0,
      ...insert.visualOptions,
    },
    audioSettings: {
      soundUrl: insert.audioSettings?.soundUrl,
      soundName: insert.audioSettings?.soundName,
      volume: insert.audioSettings?.volume ?? 0.8,
      muted: insert.audioSettings?.muted ?? false,
      loop: insert.audioSettings?.loop ?? false,
      delay: insert.audioSettings?.delay ?? 0,
      ...insert.audioSettings,
    },
    content: insert.content ? { ...insert.content } : {},
  });

  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [isPlayingTestSound, setIsPlayingTestSound] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleSave = () => {
    if (audioRef.current) audioRef.current.pause();
    onUpdate(data);
    onClose();
  };

  const updateVisualOptions = (field: string, value: any) => {
    setData((prev) => ({
      ...prev,
      visualOptions: {
        ...prev.visualOptions,
        [field]: value,
      },
    }));
  };

  const updateAudioSettings = (field: string, value: any) => {
    setData((prev) => ({
      ...prev,
      audioSettings: {
        ...prev.audioSettings,
        [field]: value,
      },
    }));
  };

  const updateContent = (field: string, value: any) => {
    setData((prev) => ({
      ...prev,
      content: {
        ...prev.content,
        [field]: value,
      },
    }));
  };

  const handleTestSound = (url?: string) => {
    const soundUrl = url || data.audioSettings?.soundUrl;
    if (!soundUrl) return;

    if (isPlayingTestSound && audioRef.current) {
      audioRef.current.pause();
      setIsPlayingTestSound(false);
      return;
    }

    try {
      const vol = data.audioSettings?.volume ?? 0.8;
      const audio = playSoundPreview(soundUrl, vol);
      if (audio) {
        audioRef.current = audio;
        setIsPlayingTestSound(true);
        audio.onended = () => setIsPlayingTestSound(false);
      }
    } catch {
      setIsPlayingTestSound(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-950/60">
          <div className="flex items-center gap-3">
            <span className="text-2xl p-2 bg-gray-800 rounded-xl border border-gray-700">
              {isAudioVisualizer ? "📊" : isSoundEffect ? "🔊" : isCallToAction ? "📣" : "✨"}
            </span>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{data.title}</span>
                <span className="text-[10px] font-mono uppercase bg-indigo-950 text-indigo-300 border border-indigo-800/80 px-2 py-0.5 rounded-full">
                  {isAudioVisualizer
                    ? "Wave Effect"
                    : isSoundEffect
                    ? "Sound Effect"
                    : isCallToAction
                    ? "Call to Action"
                    : "Studio Overlay"}
                </span>
              </h3>
              <p className="text-xs text-gray-400">
                {isAudioVisualizer
                  ? "Adjust size, screen placement, and voiceover reactivity"
                  : isSoundEffect
                  ? "Configure playback volume, loop, and timing"
                  : "Customize appearance, size, position, and optional sound"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Dynamic Contextual Navigation Tabs */}
        <div className="px-6 border-b border-gray-800 flex gap-2 bg-gray-950/40">
          {/* Visual Placement & Sizing (for all visual elements including waves) */}
          {!isSoundEffect && (
            <button
              type="button"
              onClick={() => setActiveTab("visuals")}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "visuals"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>📐</span>
              <span>Position & Size</span>
            </button>
          )}

          {/* Audio Reactivity (Strictly for Wave & Visualizer Effects) */}
          {isAudioVisualizer && (
            <button
              type="button"
              onClick={() => setActiveTab("reactivity")}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "reactivity"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>🎙️</span>
              <span>Audio Reactivity</span>
            </button>
          )}

          {/* Sound Settings (Strictly for Sound FX) */}
          {isSoundEffect && (
            <button
              type="button"
              onClick={() => setActiveTab("audio")}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "audio"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>🔊</span>
              <span>Sound & Volume</span>
            </button>
          )}

          {/* Content Card Text (for Content / CTA cards) */}
          {(isContentCard || isCallToAction) && (
            <button
              type="button"
              onClick={() => setActiveTab("content")}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "content"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>📝</span>
              <span>Text Content</span>
            </button>
          )}

          {/* Optional Attached Sound (for Stickers & CTAs) */}
          {(isSticker || isCallToAction) && (
            <button
              type="button"
              onClick={() => setActiveTab("attached_audio")}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "attached_audio"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>🔔</span>
              <span>Sound FX</span>
            </button>
          )}

          {/* Timing & Timeline Window */}
          <button
            type="button"
            onClick={() => setActiveTab("timing")}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "timing"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            <span>⏱️</span>
            <span>Timing</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-sm">
          {/* TAB: VISUAL POSITION & SIZE */}
          {activeTab === "visuals" && !isSoundEffect && (
            <div className="space-y-4">
              {/* Note for wave effects */}
              {isAudioVisualizer && (
                <div className="bg-indigo-950/50 border border-indigo-800/60 rounded-xl p-3 text-xs text-indigo-200 flex items-start gap-2.5">
                  <span className="text-base">📌</span>
                  <div>
                    <span className="font-semibold text-white">Still Visual Placement:</span>
                    <p className="mt-0.5 text-indigo-300/90 leading-relaxed">
                      This wave effect sits still at your placed screen position without wandering or
                      floating across the screen. You can resize and place it anywhere.
                    </p>
                  </div>
                </div>
              )}

              {/* Size / Scale Slider */}
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-xs text-gray-300">
                  <span className="font-medium text-white flex items-center gap-1.5">
                    <span>🔍</span>
                    <span>Visual Scale / Size</span>
                  </span>
                  <span className="font-mono text-indigo-400 font-bold">
                    {data.size.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  value={data.size}
                  onChange={(e) => setData({ ...data, size: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>Small (0.5x)</span>
                  <span>Normal (1.0x)</span>
                  <span>Large (2.5x)</span>
                </div>
              </div>

              {/* Position Presets */}
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-2.5">
                <label className="text-xs font-medium text-white block">
                  Screen Position Placement:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "top", label: "Top Center" },
                    { id: "center", label: "Center" },
                    { id: "bottom", label: "Bottom Center" },
                    { id: "top-left", label: "Top Left" },
                    { id: "top-right", label: "Top Right" },
                    { id: "bottom-left", label: "Bottom Left" },
                    { id: "bottom-right", label: "Bottom Right" },
                    { id: "left", label: "Left Edge" },
                    { id: "right", label: "Right Edge" },
                  ].map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => setData({ ...data, presetPosition: pos.id as any })}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        data.presetPosition === pos.id
                          ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                          : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750 hover:text-white"
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Visual 3D Styling (for stickers & CTAs) */}
              {(isSticker || isCallToAction) && (
                <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-white block">3D Extruded Depth & Highlights</span>
                      <span className="text-[11px] text-gray-400">Glossy highlights, bevel facets, and ambient depth</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={data.visualOptions?.has3DLook ?? true}
                      onChange={(e) => updateVisualOptions("has3DLook", e.target.checked)}
                      className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                    />
                  </div>

                  <div className="pt-2 border-t border-gray-750 flex items-center justify-between">
                    <span className="text-xs text-gray-300">Opacity:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0.2}
                        max={1.0}
                        step={0.05}
                        value={data.opacity ?? 1.0}
                        onChange={(e) => setData({ ...data, opacity: parseFloat(e.target.value) })}
                        className="w-32 accent-indigo-500 cursor-pointer"
                      />
                      <span className="font-mono text-xs text-gray-300 w-10 text-right">
                        {Math.round((data.opacity ?? 1.0) * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Color Customization for Waves */}
              {isAudioVisualizer && (
                <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-2.5">
                  <label className="text-xs font-medium text-white block">
                    Wave Accent Color:
                  </label>
                  <div className="flex items-center gap-2">
                    {["#818cf8", "#38bdf8", "#ec4899", "#10b981", "#f59e0b", "#ffffff"].map(
                      (color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => updateVisualOptions("primaryColor", color)}
                          className={`w-8 h-8 rounded-full border-2 transition-transform ${
                            data.visualOptions?.primaryColor === color
                              ? "scale-110 border-white shadow-md"
                              : "border-transparent hover:scale-105"
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: AUDIO REACTIVITY (WAVE EFFECTS) */}
          {activeTab === "reactivity" && isAudioVisualizer && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <label className="text-xs font-semibold text-white block">
                  Wave Audio Reactivity Source:
                </label>
                <p className="text-xs text-gray-400">
                  Choose which audio track directly drives the wave frequency animations:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setData({ ...data, audioSource: "voice" })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      data.audioSource === "voice"
                        ? "bg-indigo-950/80 border-indigo-500 shadow-sm"
                        : "bg-gray-800/60 border-gray-700 hover:bg-gray-800 text-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🎙️</span>
                      <span className="text-xs font-bold text-white">Main Voiceover (Default)</span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Connected directly to speech narration. Waves dance when narrator speaks and calm
                      during pauses.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setData({ ...data, audioSource: "music" })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      data.audioSource === "music"
                        ? "bg-indigo-950/80 border-indigo-500 shadow-sm"
                        : "bg-gray-800/60 border-gray-700 hover:bg-gray-800 text-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🎵</span>
                      <span className="text-xs font-bold text-white">Background Music Track</span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Ideal for music videos and ambient tracks with no voiceover. Rhythmic musical
                      energy pulses continuously.
                    </p>
                  </button>
                </div>
              </div>

              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-xs text-gray-300">
                  <span className="font-medium text-white">Reactivity Sensitivity:</span>
                  <span className="font-mono text-indigo-400">
                    {Math.round((data.intensity ?? 1.0) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.4}
                  max={1.8}
                  step={0.1}
                  value={data.intensity ?? 1.0}
                  onChange={(e) => setData({ ...data, intensity: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* TAB: SOUND CONTROLS (PURE SOUND FX) */}
          {activeTab === "audio" && isSoundEffect && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      Sound Volume:
                    </span>
                    <span className="text-[11px] text-gray-400">
                      Adjust sound effect audio gain
                    </span>
                  </div>
                  <span className="font-mono text-indigo-400 font-bold">
                    {Math.round((data.audioSettings?.volume ?? 0.8) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={data.audioSettings?.volume ?? 0.8}
                  onChange={(e) => updateAudioSettings("volume", parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />

                <div className="flex items-center justify-between pt-2 border-t border-gray-750">
                  <label className="text-xs text-gray-300 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={data.audioSettings?.loop ?? false}
                      onChange={(e) => updateAudioSettings("loop", e.target.checked)}
                      className="w-4 h-4 accent-indigo-500 rounded"
                    />
                    <span>Loop Audio continuously</span>
                  </label>

                  <label className="text-xs text-gray-300 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={data.audioSettings?.muted ?? false}
                      onChange={(e) => updateAudioSettings("muted", e.target.checked)}
                      className="w-4 h-4 accent-red-500 rounded"
                    />
                    <span>Mute Sound</span>
                  </label>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleTestSound()}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <span>{isPlayingTestSound ? "⏹️ Stop" : "▶️ Test Play Sound"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: ATTACHED SOUND FX (FOR STICKERS & CTAs) */}
          {activeTab === "attached_audio" && (isSticker || isCallToAction) && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <label className="text-xs font-semibold text-white block">
                  Attached Sound Effect:
                </label>
                <p className="text-xs text-gray-400">
                  Choose a sound effect to play synchronously when this element appears on screen:
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => updateAudioSettings("soundUrl", undefined)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-left ${
                      !data.audioSettings?.soundUrl
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750"
                    }`}
                  >
                    🚫 None (Silent)
                  </button>

                  {SOUND_LIBRARY.slice(0, 8).map((sound) => (
                    <button
                      key={sound.url}
                      type="button"
                      onClick={() => {
                        updateAudioSettings("soundUrl", sound.url);
                        updateAudioSettings("soundName", sound.name);
                        handleTestSound(sound.url);
                      }}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border text-left flex items-center justify-between ${
                        data.audioSettings?.soundUrl === sound.url
                          ? "bg-indigo-600 text-white border-indigo-500"
                          : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750"
                      }`}
                    >
                      <span className="truncate">{sound.name}</span>
                      <span className="text-[10px] opacity-70">🔊</span>
                    </button>
                  ))}
                </div>

                {data.audioSettings?.soundUrl && (
                  <div className="pt-3 border-t border-gray-750 flex items-center justify-between">
                    <span className="text-xs text-gray-300">Sound Volume:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={data.audioSettings?.volume ?? 0.8}
                        onChange={(e) => updateAudioSettings("volume", parseFloat(e.target.value))}
                        className="w-32 accent-indigo-500 cursor-pointer"
                      />
                      <span className="font-mono text-xs text-gray-300 w-10 text-right">
                        {Math.round((data.audioSettings?.volume ?? 0.8) * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: TEXT CONTENT */}
          {activeTab === "content" && (isContentCard || isCallToAction) && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <label className="text-xs font-semibold text-white block">
                  {isCallToAction ? "Call to Action Button Label:" : "Primary Card Text:"}
                </label>
                <input
                  type="text"
                  value={data.content?.primaryText || ""}
                  onChange={(e) => updateContent("primaryText", e.target.value)}
                  placeholder="Enter text..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                />

                {!isCallToAction && (
                  <>
                    <label className="text-xs font-semibold text-white block pt-1">
                      Secondary Text / Subtitle / Citation:
                    </label>
                    <input
                      type="text"
                      value={data.content?.secondaryText || data.content?.author || ""}
                      onChange={(e) => updateContent("secondaryText", e.target.value)}
                      placeholder="Optional author, subtitle, or citation..."
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB: TIMING & TIME WINDOW */}
          {activeTab === "timing" && (
            <div className="space-y-4">
              <div className="bg-gray-800/50 border border-gray-700/80 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-white block mb-1">
                      Start Time (seconds):
                    </label>
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={totalDuration}
                      value={data.startTime}
                      onChange={(e) => setData({ ...data, startTime: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-white block mb-1">
                      Duration (seconds):
                    </label>
                    <input
                      type="number"
                      step={0.5}
                      min={0.5}
                      max={60}
                      value={data.duration}
                      onChange={(e) => setData({ ...data, duration: Math.max(0.5, parseFloat(e.target.value) || 1) })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="pt-2 text-xs text-gray-400 flex items-center gap-2">
                  <span>Display Window:</span>
                  <span className="font-mono text-indigo-300 font-bold">
                    {data.startTime.toFixed(1)}s — {(data.startTime + data.duration).toFixed(1)}s
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between bg-gray-950/70">
          <button
            type="button"
            onClick={() => {
              onDelete(data.id);
              onClose();
            }}
            className="px-3.5 py-2 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 rounded-xl text-xs font-medium transition-colors"
          >
            🗑️ Delete Element
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
