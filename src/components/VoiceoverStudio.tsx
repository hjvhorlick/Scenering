import { useState, useEffect } from "react";
import type { Scene } from "../types";
import { ttsPlayer } from "../lib/tts-player";

interface VoiceoverStudioProps {
  scenes: Scene[];
  onUpdateScene: (sceneId: number, updates: Partial<Scene>) => void;
  onApplyVoiceToAll: (voiceId: string, speed: number) => void;
  onNavigateToStep?: (step: any) => void;
}

interface VoicePreset {
  id: string;
  name: string;
  gender: "male" | "female" | "neutral";
  accent: string;
  tone: string;
  recommendedFor: string;
}

const VOICE_PRESETS: VoicePreset[] = [
  { id: "alloy", name: "Alloy", gender: "neutral", accent: "Neutral American", tone: "Balanced & Direct", recommendedFor: "Documentaries & General" },
  { id: "echo", name: "Echo", gender: "male", accent: "Warm American", tone: "Smooth & Conversational", recommendedFor: "Storytelling & Podcasts" },
  { id: "fable", name: "Fable", gender: "female", accent: "British RP", tone: "Articulate & Expressive", recommendedFor: "Education & History" },
  { id: "onyx", name: "Onyx", gender: "male", accent: "Deep American", tone: "Authoritative & Deep", recommendedFor: "Dramatic & Trailers" },
  { id: "nova", name: "Nova", gender: "female", accent: "Crisp American", tone: "Energetic & Engaging", recommendedFor: "Shorts, Reels & Tech" },
  { id: "shimmer", name: "Shimmer", gender: "female", accent: "Gentle American", tone: "Calm & Resonant", recommendedFor: "Meditation & Wellness" },
];

export default function VoiceoverStudio({
  scenes,
  onUpdateScene,
  onApplyVoiceToAll,
  onNavigateToStep,
}: VoiceoverStudioProps) {
  const [selectedVoice, setSelectedVoice] = useState("alloy");
  const [globalSpeed, setGlobalSpeed] = useState(1.0);
  const [globalPitch, setGlobalPitch] = useState(1.0);
  const [globalVolume, setGlobalVolume] = useState(0.9);
  const [duckingEnabled, setDuckingEnabled] = useState(true);
  const [playingId, setPlayingId] = useState<string | number | null>(null);
  const [loadingId, setLoadingId] = useState<string | number | null>(null);
  const [activeTab, setActiveTab] = useState<"scene_voices" | "dialogue" | "settings">("scene_voices");
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generationSuccess, setGenerationSuccess] = useState(false);

  useEffect(() => {
    return () => {
      ttsPlayer.stop();
    };
  }, []);

  const handlePlayVoicePreview = async (
    text: string,
    id: string | number = "test-global",
    voiceId: string = selectedVoice,
    speed: number = globalSpeed
  ) => {
    if (playingId === id) {
      ttsPlayer.stop();
      setPlayingId(null);
      setLoadingId(null);
      return;
    }

    ttsPlayer.stop();
    setLoadingId(id);
    setPlayingId(id);

    try {
      await ttsPlayer.play(text, voiceId, speed, globalVolume, id, () => {
        setPlayingId((curr) => (curr === id ? null : curr));
        setLoadingId((curr) => (curr === id ? null : curr));
      });
      setLoadingId(null);
    } catch {
      setPlayingId(null);
      setLoadingId(null);
    }
  };

  const stopAllPlayback = () => {
    ttsPlayer.stop();
    setPlayingId(null);
    setLoadingId(null);
  };

  const handleApplyToAll = () => {
    onApplyVoiceToAll(selectedVoice, globalSpeed);
    setGenerationSuccess(true);
    setTimeout(() => setGenerationSuccess(false), 3000);
  };

  const totalWords = scenes.reduce((sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length, 0);
  const estimatedReadingDuration = Math.round((totalWords / (140 * globalSpeed)) * 60);

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 animate-fade-in p-2 sm:p-0">
      {/* Studio Header Banner */}
      <div className="bg-gradient-to-r from-gray-900 via-indigo-950/50 to-gray-900 border border-indigo-900/40 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 text-xl">
                🎙️
              </span>
              <h2 className="text-xl font-bold text-white">Voiceover & Narration Studio</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 border border-emerald-700/60 text-emerald-300">
                Studio Ready
              </span>
            </div>
            <p className="text-xs text-gray-300 max-w-xl">
              Configure natural AI narration, speech speed, voice profiles, and multi-speaker dialogue per scene.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                handlePlayVoicePreview(
                  "Welcome to your video. This is a preview of the selected narration voice.",
                  "test-global",
                  selectedVoice,
                  globalSpeed
                )
              }
              className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 active:bg-gray-900 text-white rounded-xl text-xs font-semibold border border-gray-700 flex items-center gap-2 transition-colors shadow"
            >
              {loadingId === "test-global" ? (
                <>
                  <span className="animate-spin text-indigo-400">⏳</span>
                  <span>Generating Voice...</span>
                </>
              ) : playingId === "test-global" ? (
                <>
                  <span className="animate-pulse text-indigo-400">⏹️</span>
                  <span>Stop Preview</span>
                </>
              ) : (
                <>
                  <span>🔊</span>
                  <span>Test Selected Voice</span>
                </>
              )}
            </button>

            <button
              onClick={handleApplyToAll}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5"
            >
              <span>✨</span>
              <span>Apply Voice to All Scenes</span>
            </button>
          </div>
        </div>

        {generationSuccess && (
          <div className="mt-3 p-2.5 bg-emerald-950/60 border border-emerald-700/80 rounded-xl text-emerald-200 text-xs flex items-center justify-between animate-fade-in">
            <span className="flex items-center gap-2">
              <span>✅</span> Updated all {scenes.length} scenes with "{selectedVoice.toUpperCase()}" narration voice at {globalSpeed}x speed!
            </span>
            <button onClick={() => setGenerationSuccess(false)} className="text-emerald-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Quick Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-800/80 text-xs">
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-gray-800">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Total Words</span>
            <span className="text-base font-bold text-white">{totalWords}</span>
          </div>
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-gray-800">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Est. Voiceover Time</span>
            <span className="text-base font-bold text-indigo-300">{Math.floor(estimatedReadingDuration / 60)}m {estimatedReadingDuration % 60}s</span>
          </div>
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-gray-800">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Active Voice</span>
            <span className="text-base font-bold text-white capitalize">{selectedVoice}</span>
          </div>
          <div className="bg-gray-800/40 p-2.5 rounded-xl border border-gray-800">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Scenes with Voice</span>
            <span className="text-base font-bold text-emerald-400">{scenes.length} / {scenes.length}</span>
          </div>
        </div>
      </div>

      {/* Voice Selection & Global Audio Controls */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>🎭</span> Voice Profiles
          </h3>
          <span className="text-[11px] text-gray-400">Select standard character tone</span>
        </div>

        {/* Voice Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {VOICE_PRESETS.map((v) => {
            const isSelected = selectedVoice === v.id;
            return (
              <div
                key={v.id}
                onClick={() => setSelectedVoice(v.id)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? "bg-indigo-950/60 border-indigo-500 shadow-md shadow-indigo-600/10 ring-1 ring-indigo-500"
                    : "bg-gray-800/50 hover:bg-gray-800 border-gray-700/80 text-gray-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-sm text-white capitalize">{v.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-gray-900 text-indigo-300 border border-gray-700">
                      {v.gender} • {v.accent}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 mb-1">{v.tone}</p>
                  <p className="text-[10px] text-gray-400">Best for: {v.recommendedFor}</p>
                </div>

                <div className="mt-3 pt-2 border-t border-gray-700/50 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayVoicePreview(
                        `Hello! I am ${v.name}. I can narrate your video project with natural clarity.`,
                        `sample-${v.id}`,
                        v.id,
                        globalSpeed
                      );
                    }}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 font-medium"
                  >
                    {loadingId === `sample-${v.id}` ? (
                      <>
                        <span className="animate-spin text-xs">⏳</span>
                        <span>Loading...</span>
                      </>
                    ) : playingId === `sample-${v.id}` ? (
                      <>
                        <span className="animate-pulse text-xs text-amber-400">⏹️</span>
                        <span className="text-amber-300">Stop Sample</span>
                      </>
                    ) : (
                      <>
                        <span>▶</span>
                        <span>Listen Sample</span>
                      </>
                    )}
                  </button>
                  {isSelected && (
                    <span className="text-[10px] font-bold text-indigo-400">✓ Selected</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Audio Tuning Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-gray-800 text-xs">
          <div className="bg-gray-800/40 p-3 rounded-xl border border-gray-700/70">
            <div className="flex justify-between text-gray-300 mb-1 font-medium">
              <span>Narration Speed</span>
              <span className="text-indigo-400 font-bold">{globalSpeed.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.5"
              step="0.05"
              value={globalSpeed}
              onChange={(e) => setGlobalSpeed(parseFloat(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
              <span>0.75x Slow</span>
              <span>1.0x Normal</span>
              <span>1.5x Fast</span>
            </div>
          </div>

          <div className="bg-gray-800/40 p-3 rounded-xl border border-gray-700/70">
            <div className="flex justify-between text-gray-300 mb-1 font-medium">
              <span>Voice Volume</span>
              <span className="text-indigo-400 font-bold">{Math.round(globalVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={globalVolume}
              onChange={(e) => setGlobalVolume(parseFloat(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
              <span>Soft (10%)</span>
              <span>Standard (90%)</span>
              <span>Loud (100%)</span>
            </div>
          </div>

          <div className="bg-gray-800/40 p-3 rounded-xl border border-gray-700/70 flex flex-col justify-between">
            <div>
              <div className="flex justify-between text-gray-300 mb-1 font-medium">
                <span>Music Auto-Ducking</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${duckingEnabled ? "bg-emerald-900/60 text-emerald-300" : "bg-gray-700 text-gray-400"}`}>
                  {duckingEnabled ? "ACTIVE" : "OFF"}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 leading-tight">
                Automatically dips background music volume down while voice narration is speaking.
              </p>
            </div>
            <button
              onClick={() => setDuckingEnabled(!duckingEnabled)}
              className={`w-full py-1 rounded-lg text-xs font-semibold border transition-colors mt-2 ${
                duckingEnabled
                  ? "bg-indigo-600/80 border-indigo-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:text-white"
              }`}
            >
              {duckingEnabled ? "Enabled (Recommended)" : "Disabled"}
            </button>
          </div>
        </div>
      </div>

      {/* Scene-by-Scene Narration List */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>📝</span> Scene Scripts & Individual Voice Settings
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Review or customize the spoken line and voice speed for each specific scene.
            </p>
          </div>
          <button
            onClick={stopAllPlayback}
            className="px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-colors"
          >
            ⏹️ Stop Audio
          </button>
        </div>

        <div className="space-y-3">
          {scenes.map((scene, idx) => {
            const isCurrentPlaying = playingId === scene.id;
            const isCurrentLoading = loadingId === scene.id;
            const currentVoice = scene.voice_id || selectedVoice;
            const currentSpeed = scene.narration_speed || globalSpeed;

            return (
              <div
                key={scene.id}
                className="p-4 bg-gray-800/40 hover:bg-gray-800/70 border border-gray-700/80 rounded-xl transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-white">
                      Scene {idx + 1} Narration
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      (Duration: {scene.duration}s)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Voice selector for this specific scene */}
                    <select
                      value={currentVoice}
                      onChange={(e) => onUpdateScene(scene.id, { voice_id: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-200 capitalize focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {VOICE_PRESETS.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.accent})
                        </option>
                      ))}
                    </select>

                    {/* Speed selector */}
                    <select
                      value={currentSpeed}
                      onChange={(e) => onUpdateScene(scene.id, { narration_speed: parseFloat(e.target.value) })}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="0.85">0.85x</option>
                      <option value="1.0">1.0x</option>
                      <option value="1.15">1.15x</option>
                      <option value="1.25">1.25x</option>
                    </select>

                    {/* Play Scene Audio Button */}
                    <button
                      type="button"
                      onClick={() =>
                        handlePlayVoicePreview(scene.text, scene.id, currentVoice, currentSpeed)
                      }
                      className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                        isCurrentPlaying
                          ? "bg-amber-600 text-white animate-pulse"
                          : isCurrentLoading
                          ? "bg-indigo-800 text-indigo-200"
                          : "bg-indigo-600/80 hover:bg-indigo-600 text-white"
                      }`}
                    >
                      {isCurrentLoading ? (
                        <>
                          <span className="animate-spin text-xs">⏳</span>
                          <span>Loading...</span>
                        </>
                      ) : isCurrentPlaying ? (
                        <>
                          <span>⏹️</span>
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <span>▶</span>
                          <span>Listen</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Spoken Narration Textarea */}
                <div>
                  <textarea
                    rows={2}
                    value={scene.text}
                    onChange={(e) => onUpdateScene(scene.id, { text: e.target.value })}
                    placeholder="Enter spoken narration text..."
                    className="w-full bg-gray-900 border border-gray-700/80 rounded-xl px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation Footer */}
      {onNavigateToStep && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-800">
          <button
            type="button"
            onClick={() => onNavigateToStep("scenes")}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <span>←</span>
            <span>Back to Scenes</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateToStep("captions")}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5"
          >
            <span>Proceed to Captions Studio</span>
            <span>→</span>
          </button>
        </div>
      )}
    </div>
  );
}
