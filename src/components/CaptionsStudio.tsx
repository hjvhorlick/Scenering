import { useState } from "react";
import type { Scene } from "../types";
import { generateSrtSubtitles } from "./RenderView";

interface CaptionsStudioProps {
  scenes: Scene[];
  onUpdateScene: (sceneId: number, updates: Partial<Scene>) => void;
  onApplyStyleToAll: (burn: boolean) => void;
  onNavigateToStep?: (step: any) => void;
}

export type CaptionPresetType = "word_pop" | "karaoke" | "classic_box" | "yellow_outline" | "minimal";

interface CaptionPreset {
  id: CaptionPresetType;
  name: string;
  badge: string;
  description: string;
  textColor: string;
  highlightColor: string;
  bgColor: string;
  stroke: boolean;
  uppercase: boolean;
}

const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: "word_pop",
    name: "Social Pop (Reels / TikTok)",
    badge: "🔥 Trending",
    description: "Punchy, dynamic high-impact font with bold colored active word punch.",
    textColor: "#FFFFFF",
    highlightColor: "#38BDF8",
    bgColor: "rgba(0, 0, 0, 0.75)",
    stroke: true,
    uppercase: true,
  },
  {
    id: "yellow_outline",
    name: "Cyber Yellow Beast",
    badge: "⚡ High Retention",
    description: "Eye-catching vibrant yellow text with thick black outline for maximum contrast.",
    textColor: "#FACC15",
    highlightColor: "#FFFFFF",
    bgColor: "rgba(0, 0, 0, 0)",
    stroke: true,
    uppercase: true,
  },
  {
    id: "karaoke",
    name: "Karaoke Neon Glow",
    badge: "✨ Glowing",
    description: "Luminous neon cyan and magenta text that glows as each sentence is narrated.",
    textColor: "#E0F2FE",
    highlightColor: "#A855F7",
    bgColor: "rgba(15, 23, 42, 0.8)",
    stroke: false,
    uppercase: false,
  },
  {
    id: "classic_box",
    name: "Classic Subtitle Bar",
    badge: "🎬 Cinema",
    description: "Traditional cinema black translucent backdrop pill with crisp white text.",
    textColor: "#FFFFFF",
    highlightColor: "#F3F4F6",
    bgColor: "rgba(0, 0, 0, 0.85)",
    stroke: false,
    uppercase: false,
  },
  {
    id: "minimal",
    name: "Minimalist Clean",
    badge: "🌿 Elegant",
    description: "Subtle, unboxed typography with drop shadow for understated documentaries.",
    textColor: "#F8FAFC",
    highlightColor: "#E2E8F0",
    bgColor: "rgba(0, 0, 0, 0)",
    stroke: false,
    uppercase: false,
  },
];

export default function CaptionsStudio({
  scenes,
  onUpdateScene,
  onApplyStyleToAll,
  onNavigateToStep,
}: CaptionsStudioProps) {
  const [selectedPreset, setSelectedPreset] = useState<CaptionPresetType>("word_pop");
  const [burnCaptionsGlobal, setBurnCaptionsGlobal] = useState(true);
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">("medium");
  const [position, setPosition] = useState<"bottom" | "center" | "top">("bottom");
  const [textUppercase, setTextUppercase] = useState(true);
  const [customTextColor, setCustomTextColor] = useState("#FFFFFF");
  const [customHighlightColor, setCustomHighlightColor] = useState("#38BDF8");
  const [copiedNotification, setCopiedNotification] = useState(false);

  const activePresetConfig = CAPTION_PRESETS.find((p) => p.id === selectedPreset) || CAPTION_PRESETS[0];

  const handleSelectPreset = (p: CaptionPreset) => {
    setSelectedPreset(p.id);
    setCustomTextColor(p.textColor);
    setCustomHighlightColor(p.highlightColor);
    setTextUppercase(p.uppercase);
  };

  const handleApplyToAllScenes = () => {
    scenes.forEach((s) => {
      onUpdateScene(s.id, { burn_caption: burnCaptionsGlobal });
    });
    onApplyStyleToAll(burnCaptionsGlobal);
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

  const sampleSceneText = scenes[0]?.text || "Create stunning short-form videos with automatic animated subtitles.";

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 animate-fade-in p-2 sm:p-0">
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
              onChange={(e) => setBurnCaptionsGlobal(e.target.checked)}
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

      {/* Real-time Interactive Preview Stage */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>👁️</span> Live Caption Preview
          </h3>
          <span className="text-[10px] text-gray-400">Simulating video frame</span>
        </div>

        <div className="relative w-full aspect-video max-h-[260px] bg-gradient-to-b from-gray-950 via-gray-900 to-black rounded-xl overflow-hidden border border-gray-700 flex flex-col items-center justify-between p-4 shadow-inner">
          {/* Mock Video Canvas Backdrop */}
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:16px_16px]" />

          <div className="w-full flex justify-between items-center text-[10px] text-gray-500 z-10">
            <span>Video Stage: 16:9 HD</span>
            <span className="px-2 py-0.5 rounded bg-gray-800 text-indigo-300">Style: {activePresetConfig.name}</span>
          </div>

          {/* Caption Rendering Box */}
          <div
            className={`z-10 text-center transition-all ${
              position === "top"
                ? "self-start mt-4"
                : position === "center"
                ? "self-center"
                : "self-end mb-4"
            }`}
          >
            <div
              className="inline-block px-4 py-2 rounded-xl transition-all shadow-2xl backdrop-blur-sm"
              style={{
                backgroundColor: activePresetConfig.bgColor,
              }}
            >
              <p
                className={`font-black tracking-tight leading-snug transition-all ${
                  textUppercase ? "uppercase" : ""
                } ${
                  fontSize === "small"
                    ? "text-sm sm:text-base"
                    : fontSize === "large"
                    ? "text-xl sm:text-2xl"
                    : "text-base sm:text-lg"
                }`}
                style={{
                  color: customTextColor,
                  textShadow: activePresetConfig.stroke
                    ? "2px 2px 0px #000000, -2px -2px 0px #000000, 2px -2px 0px #000000, -2px 2px 0px #000000"
                    : "0px 2px 8px rgba(0,0,0,0.8)",
                }}
              >
                {sampleSceneText.split(" ").slice(0, 8).map((word, i) => (
                  <span
                    key={i}
                    className="inline-block mx-1 transition-transform"
                    style={{
                      color: i === 2 ? customHighlightColor : customTextColor,
                      transform: i === 2 ? "scale(1.1)" : "scale(1.0)",
                    }}
                  >
                    {word}
                  </span>
                ))}
              </p>
            </div>
          </div>

          <div className="w-full text-center text-[10px] text-gray-500 z-10">
            Previewing active word pop highlight in real-time
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
          {CAPTION_PRESETS.map((p) => {
            const isSelected = selectedPreset === p.id;
            return (
              <div
                key={p.id}
                onClick={() => handleSelectPreset(p)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? "bg-purple-950/60 border-purple-500 shadow-md shadow-purple-600/20 ring-1 ring-purple-500"
                    : "bg-gray-800/50 hover:bg-gray-800 border-gray-700/80 text-gray-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-white">{p.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-900 text-purple-300 border border-gray-700">
                      {p.badge}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2 leading-relaxed">{p.description}</p>
                </div>

                <div className="pt-2 border-t border-gray-700/50 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-gray-600"
                      style={{ backgroundColor: p.textColor }}
                      title="Primary text color"
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-gray-600"
                      style={{ backgroundColor: p.highlightColor }}
                      title="Active highlight color"
                    />
                  </div>
                  {isSelected && (
                    <span className="text-[10px] font-bold text-purple-400">✓ Active Preset</span>
                  )}
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
                  onClick={() => setPosition(pos)}
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
                  onClick={() => setFontSize(s)}
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
                onClick={() => setTextUppercase(true)}
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
                onClick={() => setTextUppercase(false)}
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
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={customTextColor}
                  onChange={(e) => setCustomTextColor(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                />
                <span className="text-[10px] text-gray-400">Text</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={customHighlightColor}
                  onChange={(e) => setCustomHighlightColor(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                />
                <span className="text-[10px] text-gray-400">Pop</span>
              </div>
            </div>
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

      {/* Navigation Footer */}
      {onNavigateToStep && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-800">
          <button
            type="button"
            onClick={() => onNavigateToStep("voiceover")}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <span>←</span>
            <span>Back to Voiceover</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateToStep("studio")}
            className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5"
          >
            <span>Proceed to Video Studio & Timeline</span>
            <span>→</span>
          </button>
        </div>
      )}
    </div>
  );
}
