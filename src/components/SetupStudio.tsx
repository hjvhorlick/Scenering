import { useState, useEffect } from "react";
import type { AspectRatioType, PacingModeType, Project, ResolutionType, Scene } from "../types";
import { CALIBRATED_SAMPLES, type CalibratedSample } from "../data/calibrated-samples";
import {
  DURATION_OPTIONS,
  type DurationOption,
  getTargetWordCount,
  countWords,
  calibrateTextToTargetDuration,
} from "../lib/duration-utils";

interface SetupStudioProps {
  project: Project | null;
  scenes: Scene[];
  aspectRatio: AspectRatioType;
  resolution: ResolutionType;
  pacingMode?: PacingModeType;
  sceneDuration?: number;
  motionStyle?: string;
  onUpdateTitle: (title: string) => void;
  onUpdateScript: (script: string, regenerateScenes?: boolean, overrideDuration?: number) => void;
  onUpdateAspectRatio: (ratio: AspectRatioType) => void;
  onUpdateResolution: (resolution: ResolutionType) => void;
  onUpdatePacingMode?: (mode: PacingModeType) => void;
  onUpdateSceneDuration?: (duration: number) => void;
  onCalibrateScenesWordCount?: (targetSeconds: number) => void;
  onFitScenesToSpeech?: () => void;
  onUpdateMotionStyle?: (style: string) => void;
  onNavigateToStep: (step: "scenes") => void;
}

export default function SetupStudio({
  project,
  scenes,
  aspectRatio,
  resolution = "1080p",
  pacingMode = "auto_speech",
  sceneDuration = 20,
  motionStyle = "dynamic",
  onUpdateTitle,
  onUpdateScript,
  onUpdateAspectRatio,
  onUpdateResolution,
  onUpdatePacingMode,
  onUpdateSceneDuration,
  onCalibrateScenesWordCount,
  onFitScenesToSpeech,
  onUpdateMotionStyle,
  onNavigateToStep,
}: SetupStudioProps) {
  const [title, setTitle] = useState(project?.title || "");
  const [script, setScript] = useState(() => {
    if (project?.script && project.script.trim().length > 0) {
      return project.script;
    }
    if (scenes && scenes.length > 0 && scenes[0]?.project_id === project?.id) {
      return scenes.map((s) => s.text).join("\n\n");
    }
    return "";
  });
  const [selectedDuration, setSelectedDuration] = useState<DurationOption>(
    () => (sceneDuration as DurationOption) || 20
  );
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (sceneDuration && [10, 20, 30].includes(sceneDuration)) {
      setSelectedDuration(sceneDuration as DurationOption);
    }
  }, [sceneDuration]);

  // Strict isolation: When project ID or project changes, ensure title & script match this specific project only
  useEffect(() => {
    setTitle(project?.title || "");
    if (project?.script && project.script.trim().length > 0) {
      setScript(project.script);
    } else if (scenes && scenes.length > 0 && scenes[0]?.project_id === project?.id) {
      setScript(scenes.map((s) => s.text).join("\n\n"));
    } else {
      setScript("");
    }
  }, [project?.id, project?.title, project?.script, scenes]);

  const activeDuration = selectedDuration;
  const targetWordsPerScene = getTargetWordCount(activeDuration);

  const SCRIPT_SPLIT_REGEX = /\n\s*\n+|\n+(?=(?:Scene\s*\d+|\[Scene\s*\d+\]|\d+[\.\)]\s))/i;

  const wordsCount = countWords(script);
  // Average speaking pace: 2.5 words per second
  const estimatedReadingSec = Math.round((wordsCount / 2.5) * 10) / 10;
  const detectedScenesCount = script.split(SCRIPT_SPLIT_REGEX).filter((s) => s.trim()).length;

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    onUpdateTitle(newTitle);
  };

  const handleLoadSample = (sample: CalibratedSample) => {
    const durScript =
      sample.scripts[activeDuration] ||
      sample.scripts[20] ||
      sample.scripts[10] ||
      Object.values(sample.scripts)[0] ||
      "";
    setTitle(sample.title);
    setScript(durScript);
    onUpdateTitle(sample.title);
    onUpdateScript(durScript, true, activeDuration);
    showNotice(`Loaded sample: "${sample.title}" calibrated for ${activeDuration}s (~${targetWordsPerScene} words/scene).`);
  };

  const handleFormatScriptToTargetDuration = () => {
    const currentScriptText = script.trim() || scenes.map((s) => s.text).join("\n\n");
    if (!currentScriptText) return;
    const paragraphs = currentScriptText
      .split(SCRIPT_SPLIT_REGEX)
      .map((s) => s.trim())
      .filter(Boolean);

    const cleanScript = paragraphs.join("\n\n");
    setScript(cleanScript);
    onUpdateScript(cleanScript, true, activeDuration);
    showNotice(`Formatted script into ${paragraphs.length} scenes (${activeDuration}s duration each)!`);
  };

  const handleApplyScript = (regenerate: boolean) => {
    if (!script.trim()) return;
    onUpdateScript(script.trim(), regenerate, activeDuration);
    showNotice(
      regenerate
        ? `Re-generated ${detectedScenesCount} scenes from script!`
        : "Script updated successfully!"
    );
  };

  const handleSelectDuration = (seconds: DurationOption) => {
    setSelectedDuration(seconds);
    onUpdateSceneDuration?.(seconds);
    onCalibrateScenesWordCount?.(seconds);

    // Update script scenes duration without mutating user text
    const currentScriptText = script.trim();
    if (currentScriptText) {
      onUpdateScript(currentScriptText, true, seconds);
    }

    const words = getTargetWordCount(seconds);
    showNotice(`Scene duration set to ${seconds}s (~${words} target words/scene) for all scenes!`);
  };

  const handleProceedToScenes = () => {
    const durToApply = selectedDuration || activeDuration || 20;

    // 1. Ensure project title is saved
    if (title.trim()) {
      onUpdateTitle(title.trim());
    }

    // 2. The chosen duration action is performed before entering the scene editor
    onUpdateSceneDuration?.(durToApply);

    // 3. Keep the user's exact script without appending any filler sentences
    const currentScriptText = script.trim();
    if (currentScriptText) {
      onUpdateScript(currentScriptText, true, durToApply);
    } else {
      onCalibrateScenesWordCount?.(durToApply);
    }

    // 4. Navigate to scene editor
    onNavigateToStep("scenes");
  };

  const showNotice = (msg: string) => {
    setAppliedNotice(msg);
    setTimeout(() => setAppliedNotice(null), 3500);
  };

  const aspectRatios: {
    id: AspectRatioType;
    label: string;
    sublabel: string;
    boxClass: string;
  }[] = [
    {
      id: "16:9",
      label: "16:9 Landscape",
      sublabel: "YouTube / Desktop / TV",
      boxClass: "w-9 h-5",
    },
    {
      id: "9:16",
      label: "9:16 Vertical",
      sublabel: "Shorts / TikTok / Reels",
      boxClass: "w-5 h-9",
    },
    {
      id: "1:1",
      label: "1:1 Square",
      sublabel: "Instagram / Feed Post",
      boxClass: "w-7 h-7",
    },
    {
      id: "4:3",
      label: "4:3 Classic",
      sublabel: "Standard / Presentation",
      boxClass: "w-8 h-6",
    },
  ];

  // Resolutions with computed dimensions per aspect ratio
  const getResolutionDimensions = (ratio: AspectRatioType, res: ResolutionType): string => {
    if (ratio === "16:9") {
      if (res === "720p") return "1280 × 720";
      if (res === "1080p") return "1920 × 1080";
      if (res === "2k") return "2560 × 1440";
      if (res === "4k") return "3840 × 2160";
    }
    if (ratio === "9:16") {
      if (res === "720p") return "720 × 1280";
      if (res === "1080p") return "1080 × 1920";
      if (res === "2k") return "1440 × 2560";
      if (res === "4k") return "2160 × 3840";
    }
    if (ratio === "1:1") {
      if (res === "720p") return "720 × 720";
      if (res === "1080p") return "1080 × 1080";
      if (res === "2k") return "1440 × 1440";
      if (res === "4k") return "2160 × 2160";
    }
    if (ratio === "4:3") {
      if (res === "720p") return "960 × 720";
      if (res === "1080p") return "1440 × 1080";
      if (res === "2k") return "1920 × 1440";
      if (res === "4k") return "2880 × 2160";
    }
    return "1920 × 1080";
  };

  const resolutions: {
    id: ResolutionType;
    name: string;
    tier: string;
    badge: string;
    description: string;
  }[] = [
    {
      id: "720p",
      name: "720p HD",
      tier: "Standard Definition",
      badge: "Fast & Light",
      description: "Quick rendering, lightweight file size",
    },
    {
      id: "1080p",
      name: "1080p Full HD",
      tier: "High Definition",
      badge: "Recommended",
      description: "Crisp YouTube & social media standard",
    },
    {
      id: "2k",
      name: "2K QHD",
      tier: "Quad High Definition",
      badge: "Creator Pro",
      description: "Ultra-sharp detail for high-DPI displays",
    },
    {
      id: "4k",
      name: "4K Ultra HD",
      tier: "Ultra High Definition",
      badge: "Cinema Master",
      description: "Maximum cinematic fidelity and master export",
    },
  ];

  const motionOptions = [
    { id: "dynamic", label: "🔀 Dynamic Variety", desc: "Rotates Ken Burns, Zoom, Pan & Shake per scene" },
    { id: "ken_burns", label: "🔍 Gentle Ken Burns", desc: "Documentary slow drift and cinematic push" },
    { id: "zoom_in", label: "➕ Cinematic Zoom In", desc: "Slow immersive forward push" },
    { id: "zoom_out", label: "➖ Dramatic Zoom Out", desc: "Slow wide reveal effect" },
    { id: "pan", label: "↔️ Smooth Camera Pan", desc: "Horizontal sliding panoramic movement" },
    { id: "shake", label: "📳 Handheld Shake", desc: "Organic documentary subtle handheld tremor" },
    { id: "none", label: "⏹️ Static (No Motion)", desc: "Still frame without camera motion" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="p-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl text-lg">
              ⚙️
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">Project Setup & Script</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-950 border border-indigo-700/60 text-indigo-300">
              Unlimited Scenes Enabled
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
            Configure project title, screenplay script, target scene pacing, and canvas aspect ratio. Changes take effect instantly in all previews and renders.
          </p>
        </div>

        <button
          onClick={handleProceedToScenes}
          className="self-start sm:self-auto px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 shrink-0"
        >
          <span>Proceed to Scenes ({scenes.length})</span>
          <span>→</span>
        </button>
      </div>

      {appliedNotice && (
        <div className="p-3.5 bg-emerald-950/80 border border-emerald-700/80 rounded-xl text-emerald-200 text-xs flex items-center justify-between shadow-lg">
          <span className="flex items-center gap-2">
            <span>✅</span>
            <span className="font-medium">{appliedNotice}</span>
          </span>
          <button
            onClick={() => setAppliedNotice(null)}
            className="text-emerald-400 hover:text-white text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Form Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left / Main Column: Title & Script Input */}
        <div className="lg:col-span-8 space-y-6">
          {/* Project Title Card */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 shadow-lg space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="project-title" className="text-xs font-semibold text-gray-200 flex items-center gap-2">
                <span>🏷️</span> Project Title
              </label>
              <span className="text-[11px] text-gray-500">{title.length} chars</span>
            </div>
            <input
              id="project-title"
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Wonders of the Deep Ocean"
              className="w-full px-4 py-3 bg-gray-800/90 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-inner"
            />
            <p className="text-[11px] text-gray-400">
              Used in the video title banner, exported filenames, and attribution documents.
            </p>
          </div>

          {/* Script Input Card */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-3">
              <div>
                <label htmlFor="screenplay-script" className="text-xs font-semibold text-white flex items-center gap-2">
                  <span>📝</span> Screenplay Script & Narration
                </label>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Separate paragraphs with blank lines. There is no limit on the number of scenes.
                </p>
              </div>

              {/* Live Script Stats */}
              <div className="flex items-center gap-2 bg-gray-800/80 px-3 py-1.5 rounded-lg border border-gray-700 text-[11px]">
                <span className="text-indigo-300 font-semibold">{detectedScenesCount} Scenes</span>
                <span className="text-gray-500">•</span>
                <span className="text-gray-300">{wordsCount} Words</span>
                <span className="text-gray-500">•</span>
                <span className="text-amber-300 font-medium">~{estimatedReadingSec}s Speech</span>
              </div>
            </div>

            {/* Quick Sample Presets Calibrated to Duration */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-gray-400">
                  Try a sample script (calibrated for {activeDuration}s / ~{targetWordsPerScene} words per scene):
                </span>
                <button
                  type="button"
                  onClick={handleFormatScriptToTargetDuration}
                  className="px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900/90 text-indigo-300 border border-indigo-700/60 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 shadow-sm"
                  title={`Calibrate each paragraph in your script to ~${targetWordsPerScene} words so each lasts ${activeDuration}s`}
                >
                  <span>✨</span>
                  <span>Calibrate Script to {activeDuration}s Scenes (~{targetWordsPerScene}w)</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {CALIBRATED_SAMPLES.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => handleLoadSample(s)}
                    className="px-2.5 py-1 bg-gray-800/90 hover:bg-gray-750 text-gray-300 hover:text-white rounded-lg text-xs border border-gray-700/80 transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <span>📜</span>
                    <span>{s.title}</span>
                    <span className="text-[10px] text-indigo-400 font-mono font-medium">({activeDuration}s pace)</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <div>
              <textarea
                id="screenplay-script"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={11}
                placeholder={`Scene 1: Type ~${targetWordsPerScene} words to last ${activeDuration} seconds when read aloud...\n\nScene 2: Type another ~${targetWordsPerScene} words for the second scene...\n\nScene 3: Each paragraph becomes a separate scene.`}
                className="w-full px-4 py-3.5 bg-gray-800/90 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-y font-mono text-xs leading-relaxed shadow-inner"
              />
            </div>

            {/* Action buttons for script */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
                <span>💡</span>
                <span>Each paragraph is converted into a scene calibrated for {activeDuration}s (~{targetWordsPerScene} words).</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyScript(false)}
                  className="px-3.5 py-2 bg-gray-800 hover:bg-gray-750 text-gray-200 hover:text-white rounded-xl text-xs font-semibold border border-gray-700 transition-colors shadow"
                >
                  Save Script Text
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyScript(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                >
                  <span>⚡ Re-Generate All Scenes</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Timing, Aspect Ratio, Resolution & Camera Motion */}
        <div className="lg:col-span-4 space-y-6">
          {/* 1. Scene Duration Options (10s, 20s, 30s) */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-white flex items-center gap-2">
                  <span>⏱️</span> Scene Duration
                </label>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Select target length for each scene.
                </p>
              </div>
              <span className="px-2.5 py-0.5 bg-indigo-950/90 text-indigo-300 border border-indigo-700/60 rounded-full text-[10px] font-bold">
                {activeDuration}s Active
              </span>
            </div>

            {/* 3 Buttons: 10s, 20s, 30s */}
            <div className="space-y-2.5">
              {DURATION_OPTIONS.map((opt) => {
                const isSelected = activeDuration === opt.seconds;
                return (
                  <button
                    key={opt.seconds}
                    type="button"
                    onClick={() => handleSelectDuration(opt.seconds)}
                    className={`w-full p-3.5 rounded-xl border text-left transition-all relative flex items-center justify-between gap-3 ${
                      isSelected
                        ? "bg-indigo-950/80 border-indigo-500 text-white shadow-md ring-1 ring-indigo-400"
                        : "bg-gray-800/80 border-gray-700/80 text-gray-300 hover:bg-gray-750 hover:text-white"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{opt.label}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          isSelected ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-300"
                        }`}>
                          ~{opt.targetWords} Words / Scene
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {opt.description}
                      </p>
                    </div>

                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      isSelected ? "border-indigo-400 bg-indigo-600" : "border-gray-600"
                    }`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Aspect Ratio Card (Dedicated Section) */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div>
              <label className="text-xs font-semibold text-white flex items-center gap-2">
                <span>📐</span> Aspect Ratio
              </label>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Target display format & canvas orientation.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {aspectRatios.map((r) => {
                const isActive = aspectRatio === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      onUpdateAspectRatio(r.id);
                      showNotice(`Switched aspect ratio to ${r.label}`);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between min-h-[82px] ${
                      isActive
                        ? "bg-indigo-950/80 border-indigo-500 text-white shadow-md ring-1 ring-indigo-400"
                        : "bg-gray-800/80 border-gray-700/80 text-gray-300 hover:bg-gray-750 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className={`rounded border-2 ${
                          isActive
                            ? "border-indigo-400 bg-indigo-600/30"
                            : "border-gray-500 bg-gray-700/40"
                        } ${r.boxClass}`}
                      />
                      {isActive && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold leading-tight">{r.label}</div>
                      <div className="text-[9px] text-indigo-400/90 truncate mt-0.5">{r.sublabel}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Output Resolution Card (Dedicated Section with 720p, 1080p, 2k, 4k) */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-white flex items-center gap-2">
                  <span>📺</span> Video Resolution
                </label>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Output pixel density: 720p, 1080p, 2K, and 4K.
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-800 text-indigo-300 border border-gray-700">
                {getResolutionDimensions(aspectRatio, resolution)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {resolutions.map((res) => {
                const isActive = resolution === res.id;
                const dimension = getResolutionDimensions(aspectRatio, res.id);
                return (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => {
                      onUpdateResolution(res.id);
                      showNotice(`Selected resolution: ${res.name} (${dimension})`);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                      isActive
                        ? "bg-indigo-950/80 border-indigo-500 text-white shadow-md ring-1 ring-indigo-400"
                        : "bg-gray-800/80 border-gray-700/80 text-gray-300 hover:bg-gray-750 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white">{res.name}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                          isActive
                            ? "bg-indigo-500 text-white"
                            : "bg-gray-700 text-gray-300"
                        }`}
                      >
                        {res.badge}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-indigo-300 mb-1">{dimension}</div>
                    <div className="text-[9px] text-gray-400 leading-tight">{res.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Global Ken Burns & Camera Motion Card */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div>
              <label className="text-xs font-semibold text-white flex items-center gap-2">
                <span>🎥</span> Global Ken Burns & Motion
              </label>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Apply cinematic camera panning, zooming and drift.
              </p>
            </div>

            <div className="space-y-1.5">
              {motionOptions.map((opt) => {
                const isSelected = motionStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onUpdateMotionStyle?.(opt.id);
                      showNotice(`Updated global motion style to ${opt.label}`);
                    }}
                    className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                      isSelected
                        ? "bg-indigo-950/80 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-400"
                        : "bg-gray-800/60 border-gray-700/60 text-gray-300 hover:bg-gray-750 hover:text-white"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">{opt.label}</div>
                      <div className="text-[10px] text-gray-400">{opt.desc}</div>
                    </div>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {onUpdateMotionStyle && (
              <button
                type="button"
                onClick={() => {
                  onUpdateMotionStyle(motionStyle);
                  showNotice(`Applied "${motionStyle}" motion style across all ${scenes.length} scene(s)!`);
                }}
                className="w-full py-2 px-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-xs font-semibold text-gray-200 hover:text-white transition-all text-center flex items-center justify-center gap-1.5"
              >
                <span>🔄</span> Apply Motion Style to All Scenes
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pricing Plans Filler Section (Non-functional as requested, clean and visually polished) */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-950/80 border border-indigo-700/60 text-indigo-300">
            <span>💎</span> Pricing & Studio Plans
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight">
            Flexible Plans for Every Video Creator
          </h3>
          <p className="text-xs text-gray-400">
            Create high-impact AI narrated videos with 3D audio-reactive visualizers, dynamic captions, and cinematic motion.
          </p>
        </div>

        {/* 3-Tier Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
          {/* Tier 1: Free Starter */}
          <div className="bg-gray-800/60 border border-gray-700/80 rounded-2xl p-5 flex flex-col justify-between hover:border-gray-600 transition-all shadow-md">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Free Starter</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 border border-emerald-700/60 text-emerald-300">
                  Current Plan
                </span>
              </div>

              <div>
                <div className="text-2xl font-extrabold text-white">$0</div>
                <div className="text-[11px] text-gray-400">Free forever • No credit card</div>
              </div>

              <ul className="space-y-2 text-xs text-gray-300 pt-2 border-t border-gray-700/60">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Unlimited scenes & scripts
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> 1080p Full HD rendering
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> 10+ Neural voiceover actors
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Full 3D audio visualizer suite
                </li>
                <li className="flex items-center gap-2 text-gray-400">
                  <span className="text-gray-500 font-bold">•</span> Standard Scenering watermark
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <button
                type="button"
                disabled
                className="w-full py-2.5 px-4 rounded-xl bg-gray-700/60 text-gray-300 text-xs font-semibold cursor-default text-center border border-gray-600/60"
              >
                Active Workspace
              </button>
            </div>
          </div>

          {/* Tier 2: Creator Studio (Featured) */}
          <div className="bg-gradient-to-b from-indigo-950/60 to-purple-950/40 border-2 border-indigo-500 rounded-2xl p-5 flex flex-col justify-between relative shadow-xl transform md:-translate-y-1 transition-all">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-[10px] rounded-full shadow tracking-wide uppercase">
              Most Popular
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Creator Studio</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-900 border border-indigo-600/60 text-indigo-200">
                  Coming Soon
                </span>
              </div>

              <div>
                <div className="text-2xl font-extrabold text-white flex items-baseline gap-1">
                  <span>$19</span>
                  <span className="text-xs font-normal text-gray-400">/ month</span>
                </div>
                <div className="text-[11px] text-indigo-300">Ideal for YouTubers & content creators</div>
              </div>

              <ul className="space-y-2 text-xs text-gray-200 pt-2 border-t border-indigo-800/40">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Watermark removal included
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Custom customer brand logo embedding
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> High-speed priority cloud rendering
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> All 20+ multi-accent neural voices
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Commercial monetization rights
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <button
                type="button"
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold hover:from-indigo-500 hover:to-purple-500 transition-all shadow-md text-center"
              >
                Upgrade to Creator (Preview)
              </button>
            </div>
          </div>

          {/* Tier 3: Pro Agency */}
          <div className="bg-gray-800/60 border border-gray-700/80 rounded-2xl p-5 flex flex-col justify-between hover:border-gray-600 transition-all shadow-md">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Pro Agency</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 border border-purple-700/60 text-purple-300">
                  Coming Soon
                </span>
              </div>

              <div>
                <div className="text-2xl font-extrabold text-white flex items-baseline gap-1">
                  <span>$49</span>
                  <span className="text-xs font-normal text-gray-400">/ month</span>
                </div>
                <div className="text-[11px] text-gray-400">For agencies & high-volume production</div>
              </div>

              <ul className="space-y-2 text-xs text-gray-300 pt-2 border-t border-gray-700/60">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> 4K Ultra-HD 60 FPS exporting
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Multi-speaker dialogue auto-splitting
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Unlimited custom audio SFX upload
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Dedicated fast rendering queue
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> White-label video agency export
                </li>
              </ul>
            </div>

            <div className="pt-6">
              <button
                type="button"
                className="w-full py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-750 text-white text-xs font-bold transition-all border border-gray-700 shadow text-center"
              >
                Upgrade to Pro (Preview)
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-500">
          ℹ️ Billing is currently in preview mode. All studio tools, 3D visualizers, voice actors, and unlimited scenes are unlocked for testing.
        </p>
      </div>

      {/* Bottom Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-800">
        <span className="text-xs text-gray-400">
          {scenes.length} scene(s) currently configured in this project.
        </span>

        <button
          onClick={handleProceedToScenes}
          className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
        >
          <span>Next: Configure Scene Visuals</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
