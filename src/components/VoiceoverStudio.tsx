import { useState, useEffect, useMemo, useRef } from "react";
import StepNav from "./StepNav";
import type { Scene } from "../types";
import { ttsPlayer } from "../lib/tts-player";
import { setCachedSceneAudio, getSharedAudioContext } from "../lib/tts-cache";
import {
  downloadSceneVoiceover,
  downloadAllVoiceovers,
  downloadVoiceSample,
  type BulkDownloadProgress,
} from "../lib/voice-download";

interface VoiceoverStudioProps {
  scenes: Scene[];
  onUpdateScene: (sceneId: number, updates: Partial<Scene>) => void;
  onApplyVoiceToAll: (voiceId: string, speed: number) => void;
  onNavigateToStep?: (step: any) => void;
  selectedVoice?: string;
  onSelectVoice?: (voiceId: string) => void;
}

export interface VoicePreset {
  id: string;
  name: string;
  gender: "male" | "female";
  accent: string;
  tone: string;
  recommendedFor: string;
  sampleText: string;
}

// Exactly 10 High-Quality Natural Speaking Voices (5 Male and 5 Female)
export const STUDIO_VOICE_PRESETS: VoicePreset[] = [
  // 5 Male Natural Voices (Authentic Human Tone)
  {
    id: "guy",
    name: "Guy",
    gender: "male",
    accent: "American (US)",
    tone: "Warm, Natural & Conversational",
    recommendedFor: "Documentaries, Explainers & Engaging Stories",
    sampleText: "Hello! I am Guy, a warm and conversational American male narrator with natural pacing.",
  },
  {
    id: "christopher",
    name: "Christopher",
    gender: "male",
    accent: "American (US)",
    tone: "Authoritative, Deep & Cinematic",
    recommendedFor: "Dramatic Trailers, Movie Promos & Motivation",
    sampleText: "In a world of infinite possibilities, every second shapes destiny. Christopher speaking.",
  },
  {
    id: "ryan",
    name: "Ryan",
    gender: "male",
    accent: "British RP (UK)",
    tone: "Articulate, Sophisticated & Distinguished",
    recommendedFor: "History, Luxury Brands, Architecture & Academia",
    sampleText: "Good day. I am Ryan, offering a refined British voice for sophisticated storytelling.",
  },
  {
    id: "william",
    name: "William",
    gender: "male",
    accent: "Australian (AU)",
    tone: "Crisp, Charismatic & Friendly",
    recommendedFor: "Travel Vlogs, Tech Reviews & Casual Entertainment",
    sampleText: "G'day! William here, bringing an upbeat and charismatic Australian narration to your video.",
  },
  {
    id: "brian",
    name: "Brian",
    gender: "male",
    accent: "American (US)",
    tone: "Smooth, Relatable & Professional",
    recommendedFor: "Educational Guides, How-Tos, Podcasts & Explanations",
    sampleText: "Hi there! I am Brian, providing smooth, trustworthy professional narration for your project.",
  },

  // 5 Female Natural Voices (Authentic Human Tone)
  {
    id: "jenny",
    name: "Jenny",
    gender: "female",
    accent: "American (US)",
    tone: "Clear, Friendly & Engaging",
    recommendedFor: "Tutorials, Product Reviews, Guides & Lifestyle",
    sampleText: "Hello there! I am Jenny, a clear and friendly American female voice for your videos.",
  },
  {
    id: "aria",
    name: "Aria",
    gender: "female",
    accent: "American (US)",
    tone: "Crisp, Dynamic, Bright & Modern",
    recommendedFor: "Viral Shorts, Reels, TikTok Highlights & Tech",
    sampleText: "Hey everyone! Aria here with high-energy, vibrant narration to keep your viewers hooked.",
  },
  {
    id: "sonia",
    name: "Sonia",
    gender: "female",
    accent: "British RP (UK)",
    tone: "Polished, Elegant & Expressive",
    recommendedFor: "Audiobooks, Podcasts, Storytelling & Literature",
    sampleText: "Welcome. I am Sonia, delivering an elegant and expressive British narration with emotional depth.",
  },
  {
    id: "natasha",
    name: "Natasha",
    gender: "female",
    accent: "Australian (AU)",
    tone: "Calm, Soothing & Resonant",
    recommendedFor: "Meditation, Nature Docs, Wellness & Bedtime Stories",
    sampleText: "Take a gentle breath and relax. Natasha here, sharing a calm and soothing Australian voice.",
  },
  {
    id: "ava",
    name: "Ava",
    gender: "female",
    accent: "American (US)",
    tone: "Peaceful, Balanced & Melodic",
    recommendedFor: "Wellness, Relaxation, Ambient Guides & Reflection",
    sampleText: "Hello. I am Ava, offering a gentle, peaceful voice designed to bring balance and clarity.",
  },
];

export default function VoiceoverStudio({
  scenes,
  onUpdateScene,
  onApplyVoiceToAll,
  onNavigateToStep,
  selectedVoice: propSelectedVoice,
  onSelectVoice,
}: VoiceoverStudioProps) {
  const [internalSelectedVoice, setInternalSelectedVoice] = useState("guy");
  const selectedVoice = propSelectedVoice || internalSelectedVoice;

  const handleSelectVoice = (vId: string) => {
    setInternalSelectedVoice(vId);
    if (onSelectVoice) {
      onSelectVoice(vId);
    }
  };

  const [globalSpeed, setGlobalSpeed] = useState(1.0);
  const [playingId, setPlayingId] = useState<string | number | null>(null);
  const [loadingId, setLoadingId] = useState<string | number | null>(null);
  const [activeTab, setActiveTab] = useState<"natural_voices" | "import_tts">("natural_voices");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [generationSuccess, setGenerationSuccess] = useState(false);
  const [showSceneReview, setShowSceneReview] = useState(false);

  // Tab 2: Import Prepared TTS Audio State
  const [importedAudioUrl, setImportedAudioUrl] = useState<string | null>(null);
  const [importedFileName, setImportedFileName] = useState<string>("");
  const [importedAudioDuration, setImportedAudioDuration] = useState<number>(0);
  const [customVoiceLabel, setCustomVoiceLabel] = useState<string>("My Prepared TTS Voice");
  const [importTargetScene, setImportTargetScene] = useState<string>("all");
  const [isImportPlaying, setIsImportPlaying] = useState<boolean>(false);
  const [importSuccessBanner, setImportSuccessBanner] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      ttsPlayer.stop();
    };
  }, []);

  // Filter 10 voices by gender
  const filteredVoices = useMemo(() => {
    if (genderFilter === "all") return STUDIO_VOICE_PRESETS;
    return STUDIO_VOICE_PRESETS.filter((v) => v.gender === genderFilter);
  }, [genderFilter]);

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
      await ttsPlayer.play(text, voiceId, speed, 0.9, id, () => {
        setPlayingId((curr) => (curr === id ? null : curr));
        setLoadingId((curr) => (curr === id ? null : curr));
      });
      setLoadingId(null);
    } catch {
      setPlayingId(null);
      setLoadingId(null);
    }
  };

  // --- Voice download state ---
  const [downloadingId, setDownloadingId] = useState<string | number | null>(null);
  const [bulkDownload, setBulkDownload] = useState<BulkDownloadProgress | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  /** Set when the server reports the audio is a silent placeholder. */
  const [ttsDegraded, setTtsDegraded] = useState(false);

  const announce = (msg: string) => {
    setDownloadNotice(msg);
    setTimeout(() => setDownloadNotice((curr) => (curr === msg ? null : curr)), 6000);
  };

  const handleDownloadScene = async (scene: Scene) => {
    setDownloadingId(scene.id);
    try {
      await downloadSceneVoiceover(scene, selectedVoice, "scene");
      announce(`Downloaded narration for scene ${(scene.order_index ?? 0) + 1}.`);
    } catch (err: any) {
      announce(err?.message || "Could not download that narration.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadAll = async () => {
    if (bulkDownload) return;
    setBulkDownload({ current: 0, total: scenes.length, label: "Starting" });
    try {
      const { saved, failed, silent } = await downloadAllVoiceovers(
        scenes,
        selectedVoice,
        "scenering_project",
        (p) => setBulkDownload(p)
      );
      let msg = `Downloaded ${saved} narration track${saved === 1 ? "" : "s"} as a ZIP.`;
      if (failed) msg += ` ${failed} failed.`;
      if (silent) msg += ` ${silent} are silent placeholders — the speech service was unreachable.`;
      announce(msg);
    } catch (err: any) {
      announce(err?.message || "Could not build the voiceover ZIP.");
    } finally {
      setBulkDownload(null);
    }
  };

  const handleDownloadSample = async (preset: VoicePreset) => {
    setDownloadingId(`sample-${preset.id}`);
    try {
      await downloadVoiceSample(preset.sampleText, preset.id, `${preset.name}_sample`);
      announce(`Saved a sample of ${preset.name}.`);
    } catch (err: any) {
      announce(err?.message || "Could not download that sample.");
    } finally {
      setDownloadingId(null);
    }
  };

  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number; sceneIndex: number } | null>(null);
  const [singleGeneratingId, setSingleGeneratingId] = useState<number | null>(null);

  // Scenes audio stats
  const scenesWithAudioCount = scenes.filter((s) => Boolean(s.audio_url)).length;
  const allScenesHaveSavedAudio = scenes.length > 0 && scenesWithAudioCount === scenes.length;

  const generateVoiceoverForScene = async (scene: Scene, voiceToUse: string): Promise<string | null> => {
    const text = (scene.text || "").trim();
    if (!text) return null;
    const voicePreset = STUDIO_VOICE_PRESETS.find((v) => v.id === voiceToUse);
    const voiceName = voicePreset?.name || voiceToUse;

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: voiceToUse }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.error) detail = body.error;
        } catch {}
        throw new Error(detail);
      }

      // The server tells us which engine produced the audio. "silent" means
      // real speech could not be reached and the buffer is a placeholder, so
      // the user is warned instead of silently shipping a mute video.
      if (res.headers.get("X-TTS-Source") === "silent") setTtsDegraded(true);
      else setTtsDegraded(false);

      const contentType = res.headers.get("Content-Type") || "audio/mpeg";
      const arrayBuf = await res.arrayBuffer();
      const blob = new Blob([arrayBuf], { type: contentType });
      const blobUrl = URL.createObjectURL(blob);

      let spokenDuration = scene.duration || 10;
      try {
        const audioCtx = getSharedAudioContext();
        const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));
        spokenDuration = decoded.duration;
        setCachedSceneAudio(scene.id, voiceToUse, text, {
          audioBuffer: decoded,
          blobUrl,
          duration: decoded.duration,
          voiceId: voiceToUse,
          text,
        });
      } catch {}

      // The scene lasts exactly as long as the voice does (plus a short breath
      // so the cut does not clip the final word). It used to take
      // Math.max(configured, spoken), which left a silent tail on every scene
      // whose narration was shorter than the configured length.
      const BREATH = 0.35;
      const fitted = Math.max(1, Math.round((spokenDuration + BREATH) * 10) / 10);

      onUpdateScene(scene.id, {
        audio_url: blobUrl,
        audio_name: `${voiceName} Narration`,
        voice_id: voiceToUse,
        duration: fitted,
        audio_duration: spokenDuration,
      });

      return blobUrl;
    } catch (err) {
      console.error(`Failed to generate TTS for scene ${scene.id}:`, err);
      return null;
    }
  };

  const handleGenerateAndSaveAllVoiceovers = async (voiceToUse = selectedVoice) => {
    if (isGeneratingAll) return;
    setIsGeneratingAll(true);
    setGenerationSuccess(false);

    onApplyVoiceToAll(voiceToUse, globalSpeed);

    const total = scenes.length;
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      setGenerationProgress({ current: i + 1, total, sceneIndex: i });
      await generateVoiceoverForScene(scene, voiceToUse);
    }

    setIsGeneratingAll(false);
    setGenerationProgress(null);
    setGenerationSuccess(true);
    setTimeout(() => setGenerationSuccess(false), 5000);
  };

  const handleProceedNext = async (targetStep: string = "captions") => {
    // If any scene doesn't have an audio_url yet, or voice was changed, complete generation first!
    const needsGeneration = scenes.some((s) => !s.audio_url || s.voice_id !== selectedVoice);
    if (needsGeneration) {
      await handleGenerateAndSaveAllVoiceovers(selectedVoice);
    }
    if (onNavigateToStep) {
      onNavigateToStep(targetStep);
    }
  };

  const handleGenerateSingleScene = async (scene: Scene) => {
    setSingleGeneratingId(scene.id);
    await generateVoiceoverForScene(scene, scene.voice_id || selectedVoice);
    setSingleGeneratingId(null);
  };

  const handleApplyToAll = () => {
    handleGenerateAndSaveAllVoiceovers(selectedVoice);
  };

  // Get active voice display info
  const activeVoiceInfo = useMemo(() => {
    if (selectedVoice.startsWith("custom:") || selectedVoice.startsWith("import:")) {
      const label = selectedVoice.replace(/^(custom:|import:)/, "");
      return {
        name: label || "Imported Prepared TTS Audio",
        type: "Custom TTS File",
        gender: "Custom Narrator",
        isMale: false,
        badge: "User Audio Track",
      };
    }
    const preset = STUDIO_VOICE_PRESETS.find((p) => p.id === selectedVoice);
    const isMale = preset ? preset.gender === "male" : true;
    return {
      name: preset?.name || selectedVoice,
      type: "Natural Speaking Voice",
      gender: isMale ? "Male Narrator" : "Female Narrator",
      isMale,
      badge: `${isMale ? "👨 Male" : "👩 Female"} • ${preset?.accent || "Natural Voice"}`,
    };
  }, [selectedVoice]);

  const totalWords = scenes.reduce((sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length, 0);
  const estimatedReadingDuration = Math.round((totalWords / (140 * globalSpeed)) * 60);

  // File Upload Handlers for Tab 2
  const handleFileUpload = (file: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImportedAudioUrl(url);
    setImportedFileName(file.name);
    setCustomVoiceLabel(file.name.replace(/\.[^/.]+$/, ""));

    // Detect duration
    const tempAudio = new Audio(url);
    tempAudio.onloadedmetadata = () => {
      setImportedAudioDuration(Math.round(tempAudio.duration));
    };
  };

  const handleApplyImportedAudio = () => {
    if (!importedAudioUrl) return;

    if (importTargetScene === "all") {
      scenes.forEach((s) => {
        onUpdateScene(s.id, {
          audio_url: importedAudioUrl,
          audio_name: customVoiceLabel || importedFileName,
        });
      });
      handleSelectVoice(`custom:${customVoiceLabel || importedFileName}`);
      setImportSuccessBanner(
        `Applied "${customVoiceLabel || importedFileName}" as the global voiceover for all ${scenes.length} scenes!`
      );
    } else {
      const sceneId = parseInt(importTargetScene, 10);
      onUpdateScene(sceneId, {
        audio_url: importedAudioUrl,
        audio_name: customVoiceLabel || importedFileName,
        duration: importedAudioDuration > 0 ? importedAudioDuration : undefined,
      });
      setImportSuccessBanner(
        `Applied "${customVoiceLabel || importedFileName}" to Scene ${
          scenes.findIndex((s) => s.id === sceneId) + 1
        }!`
      );
    }

    setTimeout(() => setImportSuccessBanner(null), 4000);
  };

  const toggleImportPlayback = () => {
    if (!importedAudioUrl || !audioRef.current) return;
    if (isImportPlaying) {
      audioRef.current.pause();
      setIsImportPlaying(false);
    } else {
      ttsPlayer.stop();
      setPlayingId(null);
      audioRef.current.play();
      setIsImportPlaying(true);
    }
  };

  return (
    <div className="max-w-5xl 2xl:max-w-7xl mx-auto w-full space-y-3 sm:space-y-5 animate-fade-in p-1.5 sm:p-0">
      {/* Single Previous / Next control — always at the top of the phase */}
      {onNavigateToStep && (
        <StepNav
          current="voiceover"
          onNavigate={onNavigateToStep}
          onNext={() => handleProceedNext("captions")}
          nextLabel={allScenesHaveSavedAudio ? "Next: Captions" : "Save Voiceovers & Next: Captions"}
          busyLabel={isGeneratingAll ? `Saving voiceovers (${generationProgress?.current || 0}/${scenes.length})…` : undefined}
          note={allScenesHaveSavedAudio ? "narration saved" : "narration not generated yet"}
        />
      )}

      {/* Studio Header Banner */}
      <div className="bg-gradient-to-r from-gray-900 via-indigo-950/40 to-gray-900 border border-indigo-900/40 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 text-xl">
                🎙️
              </span>
              <h2 className="text-xl font-bold text-white">Voiceover Studio</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-700/60 text-emerald-300">
                10 Free Natural Voices Active
              </span>
            </div>
            <p className="text-xs text-gray-300 max-w-xl">
              Select from 10 authentic, natural speaking male & female voices or import your own prepared TTS audio file.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                handlePlayVoicePreview(
                  `Hello! This is a test of the selected ${activeVoiceInfo.gender} voice.`,
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
                  <span>Generating Audio...</span>
                </>
              ) : playingId === "test-global" ? (
                <>
                  <span className="animate-pulse text-amber-400">⏹️</span>
                  <span>Stop Preview</span>
                </>
              ) : (
                <>
                  <span>🔊</span>
                  <span>Test Active Voice</span>
                </>
              )}
            </button>

            <button
              disabled={isGeneratingAll}
              onClick={() => handleGenerateAndSaveAllVoiceovers(selectedVoice)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5"
            >
              {isGeneratingAll ? (
                <>
                  <span className="animate-spin text-sm">⏳</span>
                  <span>Generating Voiceover ({generationProgress?.current || 0}/{scenes.length})...</span>
                </>
              ) : allScenesHaveSavedAudio ? (
                <>
                  <span>✅</span>
                  <span>Voiceovers Saved ({scenesWithAudioCount}/{scenes.length}) • Re-generate</span>
                </>
              ) : (
                <>
                  <span>🎙️</span>
                  <span>Generate & Save Voiceover for All Scenes</span>
                </>
              )}
            </button>

            {/* Download every generated narration track as a ZIP */}
            <button
              type="button"
              disabled={Boolean(bulkDownload) || scenes.length === 0}
              onClick={handleDownloadAll}
              title="Download every scene's narration as audio files in a ZIP"
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5"
            >
              {bulkDownload ? (
                <>
                  <span className="animate-spin text-sm">⏳</span>
                  <span>
                    Packaging ({bulkDownload.current}/{bulkDownload.total})...
                  </span>
                </>
              ) : (
                <>
                  <span>⬇️</span>
                  <span>Download All Voices (ZIP)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* The speech service could not be reached — the audio is a silent
            placeholder, so say so rather than shipping a mute video. */}
        {ttsDegraded && (
          <div className="mt-3 p-3 bg-amber-950/80 border border-amber-600/80 rounded-xl text-amber-200 text-xs flex items-start justify-between gap-3 shadow-lg">
            <span className="flex items-start gap-2 font-medium">
              <span>⚠️</span>
              <span>
                The neural speech service could not be reached, so the generated tracks are
                silent placeholders of the right length. Check the machine's internet
                connection and generate again — no re-editing is needed.
              </span>
            </span>
            <button
              onClick={() => setTtsDegraded(false)}
              className="text-amber-400 hover:text-white text-sm font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {downloadNotice && (
          <div className="mt-3 p-3 bg-gray-900 border border-gray-700 rounded-xl text-gray-200 text-xs flex items-center justify-between gap-3 shadow-lg animate-fade-in">
            <span className="flex items-center gap-2">
              <span>⬇️</span>
              <span>{downloadNotice}</span>
            </span>
            <button
              onClick={() => setDownloadNotice(null)}
              className="text-gray-400 hover:text-white text-sm font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {isGeneratingAll && (
          <div className="mt-3 p-3 bg-indigo-950/90 border border-indigo-500/80 rounded-xl text-indigo-200 text-xs flex items-center justify-between animate-pulse shadow-lg">
            <span className="flex items-center gap-2 font-medium">
              <span className="animate-spin">⏳</span>
              <span>Synthesizing and saving narration for Scene {generationProgress?.current} of {generationProgress?.total}... Please wait.</span>
            </span>
            <span className="font-mono text-xs bg-indigo-900 px-2 py-0.5 rounded text-indigo-200">
              {Math.round(((generationProgress?.current || 1) / (generationProgress?.total || 1)) * 100)}%
            </span>
          </div>
        )}

        {generationSuccess && (
          <div className="mt-3 p-3 bg-emerald-950/80 border border-emerald-600/90 rounded-xl text-emerald-200 text-xs flex items-center justify-between animate-fade-in shadow-lg">
            <span className="flex items-center gap-2 font-medium">
              <span>✅</span> All {scenes.length} scene voiceovers generated & saved with "{activeVoiceInfo.name}" ({activeVoiceInfo.gender})! Voiceovers are pre-saved and ready for Video Studio.
            </span>
            <button onClick={() => setGenerationSuccess(false)} className="text-emerald-400 hover:text-white text-sm font-bold">✕</button>
          </div>
        )}

        {/* Active Voice Info & Attribution Notice Banner */}
        <div className="mt-4 p-3 bg-gray-950/70 rounded-xl border border-indigo-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-base border ${
              activeVoiceInfo.isMale ? "bg-blue-950/60 border-blue-700/60 text-blue-300" : "bg-pink-950/60 border-pink-700/60 text-pink-300"
            }`}>
              {activeVoiceInfo.isMale ? "👨" : "👩"}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">{activeVoiceInfo.name}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                  activeVoiceInfo.isMale ? "bg-blue-900/40 text-blue-300 border-blue-800" : "bg-pink-900/40 text-pink-300 border-pink-800"
                }`}>
                  {activeVoiceInfo.gender}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300 border border-gray-700">
                  {activeVoiceInfo.type}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                📢 <span className="text-indigo-300 font-medium">Attribution Cleared:</span> Included in video description & export credits document.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-right">
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Est. Spoken Time</span>
              <span className="font-mono text-indigo-300 font-semibold">{Math.floor(estimatedReadingDuration / 60)}m {estimatedReadingDuration % 60}s</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Word Count</span>
              <span className="font-mono text-gray-200 font-semibold">{totalWords} words</span>
            </div>
          </div>
        </div>
      </div>

      {/* Exactly 2 Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
        <button
          onClick={() => setActiveTab("natural_voices")}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
            activeTab === "natural_voices"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
              : "bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-800"
          }`}
        >
          <span>🎭</span>
          <span>10 Natural Voices (5 Male • 5 Female)</span>
        </button>

        <button
          onClick={() => setActiveTab("import_tts")}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
            activeTab === "import_tts"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
              : "bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-800"
          }`}
        >
          <span>📁</span>
          <span>Import Prepared TTS File</span>
        </button>
      </div>

      {/* TAB 1: 10 NATURAL SPEAKING VOICES (5 MALE AND 5 FEMALE) */}
      {activeTab === "natural_voices" && (
        <div className="space-y-4">
          <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 shadow-xl space-y-4">
            {/* Toolbar: Gender Filters & Speed Control */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>🎭</span> 10 Natural Speaking Voices
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  5 Male and 5 Female natural speaking imported free voices with realistic human intonation.
                </p>
              </div>

              {/* Gender Filter Buttons */}
              <div className="flex items-center gap-1.5 bg-gray-800 p-1 rounded-xl border border-gray-700">
                <button
                  type="button"
                  onClick={() => setGenderFilter("all")}
                  className={`px-3 py-1 text-xs rounded-lg font-semibold transition-colors ${
                    genderFilter === "all" ? "bg-indigo-600 text-white shadow" : "text-gray-400 hover:text-white"
                  }`}
                >
                  All (10)
                </button>
                <button
                  type="button"
                  onClick={() => setGenderFilter("male")}
                  className={`px-3 py-1 text-xs rounded-lg font-semibold transition-colors flex items-center gap-1 ${
                    genderFilter === "male" ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"
                  }`}
                >
                  <span>👨</span> 5 Male
                </button>
                <button
                  type="button"
                  onClick={() => setGenderFilter("female")}
                  className={`px-3 py-1 text-xs rounded-lg font-semibold transition-colors flex items-center gap-1 ${
                    genderFilter === "female" ? "bg-pink-600 text-white shadow" : "text-gray-400 hover:text-white"
                  }`}
                >
                  <span>👩</span> 5 Female
                </button>
              </div>
            </div>

            {/* Pacing / Speed Slider */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-800/40 p-3 rounded-xl border border-gray-700/60">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300 font-medium">Narration Pacing & Speed:</span>
                <span className="text-xs font-bold text-indigo-400 font-mono">{globalSpeed.toFixed(2)}x</span>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-64">
                <span className="text-[10px] text-gray-400">0.75x</span>
                <input
                  type="range"
                  min="0.75"
                  max="1.5"
                  step="0.05"
                  value={globalSpeed}
                  onChange={(e) => setGlobalSpeed(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 h-1.5 bg-gray-700 rounded-lg cursor-pointer"
                />
                <span className="text-[10px] text-gray-400">1.5x</span>
              </div>
            </div>

            {/* The 10 Voice Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredVoices.map((voice) => {
                const isSelected = selectedVoice === voice.id;
                const isMale = voice.gender === "male";
                const isCurrentPlaying = playingId === voice.id;
                const isCurrentLoading = loadingId === voice.id;

                return (
                  <div
                    key={voice.id}
                    onClick={() => handleSelectVoice(voice.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? isMale
                          ? "bg-blue-950/40 border-blue-500 ring-1 ring-blue-500 shadow-md"
                          : "bg-pink-950/40 border-pink-500 ring-1 ring-pink-500 shadow-md"
                        : "bg-gray-800/40 hover:bg-gray-800/80 border-gray-700/80 text-gray-300"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm border ${
                              isMale
                                ? "bg-blue-950/80 border-blue-700 text-blue-300"
                                : "bg-pink-950/80 border-pink-700 text-pink-300"
                            }`}
                          >
                            {isMale ? "👨" : "👩"}
                          </span>
                          <div>
                            <h4 className="font-bold text-sm text-white">{voice.name}</h4>
                            <span className="text-[10px] text-gray-400 font-medium">{voice.accent}</span>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${
                            isMale
                              ? "bg-blue-950 text-blue-300 border-blue-800"
                              : "bg-pink-950 text-pink-300 border-pink-800"
                          }`}
                        >
                          {isMale ? "MALE" : "FEMALE"}
                        </span>
                      </div>

                      <div className="space-y-1 mb-3 text-xs">
                        <p className="text-gray-300 font-medium">{voice.tone}</p>
                        <p className="text-[11px] text-gray-400">
                          <span className="text-gray-500">Best for: </span>
                          {voice.recommendedFor}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-gray-700/50 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayVoicePreview(voice.sampleText, voice.id, voice.id, globalSpeed);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                          isCurrentPlaying
                            ? "bg-amber-600 text-white animate-pulse"
                            : isCurrentLoading
                            ? "bg-gray-700 text-gray-300"
                            : isMale
                            ? "bg-blue-900/50 hover:bg-blue-800 text-blue-200 border border-blue-700/60"
                            : "bg-pink-900/50 hover:bg-pink-800 text-pink-200 border border-pink-700/60"
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
                            <span>Listen Sample</span>
                          </>
                        )}
                      </button>

                      {/* Save this voice's sample as an audio file */}
                      <button
                        type="button"
                        disabled={downloadingId === `sample-${voice.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadSample(voice);
                        }}
                        title={`Download a sample of ${voice.name}`}
                        className="px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-700/60 border border-gray-700/60 transition-colors"
                      >
                        {downloadingId === `sample-${voice.id}` ? "⏳" : "⬇️"}
                      </button>

                      {isSelected ? (
                        <span className={`text-xs font-bold flex items-center gap-1 ${isMale ? "text-blue-400" : "text-pink-400"}`}>
                          <span>✓</span> Active Voice
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectVoice(voice.id);
                          }}
                          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700/50 transition-colors"
                        >
                          Select
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Compact Spoken Scene Scripts Review */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4">
            <button
              type="button"
              onClick={() => setShowSceneReview(!showSceneReview)}
              className="w-full flex items-center justify-between text-xs font-bold text-gray-300 hover:text-white"
            >
              <span className="flex items-center gap-2">
                <span>📝</span>
                <span>Review Scene Narration Scripts ({scenes.length} Scenes)</span>
              </span>
              <span>{showSceneReview ? "▲ Hide" : "▼ Show"}</span>
            </button>

            {showSceneReview && (
              <div className="mt-3 space-y-2.5 pt-3 border-t border-gray-800">
                {scenes.map((scene, idx) => {
                  const hasSavedAudio = Boolean(scene.audio_url);
                  const isSingleGen = singleGeneratingId === scene.id;

                  return (
                    <div key={scene.id} className="p-3 bg-gray-800/40 rounded-xl border border-gray-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-[11px] font-bold text-indigo-400">Scene {idx + 1} ({scene.duration}s):</span>
                          {hasSavedAudio ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-700 font-semibold flex items-center gap-1">
                              <span>✅</span> Voiceover Saved ({scene.audio_name || "Audio"})
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/70 text-amber-300 border border-amber-800 font-semibold flex items-center gap-1">
                              <span>⏳</span> Pending Generation
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-200">{scene.text || "(No narration text entered)"}</p>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            handlePlayVoicePreview(
                              scene.text,
                              scene.id,
                              scene.audio_url ? `url:${scene.audio_url}` : (scene.voice_id || selectedVoice),
                              globalSpeed
                            )
                          }
                          className="px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg border border-gray-700 flex items-center gap-1 transition-colors"
                        >
                          {playingId === scene.id ? "⏹️ Stop" : "▶ Play Audio"}
                        </button>

                        <button
                          type="button"
                          disabled={isSingleGen || isGeneratingAll}
                          onClick={() => handleGenerateSingleScene(scene)}
                          className="px-2.5 py-1 text-xs bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 disabled:opacity-50 rounded-lg border border-indigo-700 flex items-center gap-1 transition-colors"
                        >
                          {isSingleGen ? (
                            <>
                              <span className="animate-spin text-xs">⏳</span>
                              <span>Generating...</span>
                            </>
                          ) : (
                            <>
                              <span>🎙️</span>
                              <span>{hasSavedAudio ? "Re-generate" : "Generate Audio"}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={downloadingId === scene.id}
                          onClick={() => handleDownloadScene(scene)}
                          title="Download this scene's narration as an audio file"
                          className="px-2.5 py-1 text-xs bg-emerald-900/50 hover:bg-emerald-800 text-emerald-200 disabled:opacity-50 rounded-lg border border-emerald-700/60 flex items-center gap-1 transition-colors"
                        >
                          {downloadingId === scene.id ? (
                            <span className="animate-spin text-xs">⏳</span>
                          ) : (
                            <>
                              <span>⬇️</span>
                              <span>Download</span>
                            </>
                          )}
                        </button>

                        {hasSavedAudio && (
                          <button
                            type="button"
                            title="Clear attached audio"
                            onClick={() => onUpdateScene(scene.id, { audio_url: null, audio_name: undefined })}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: IMPORT PREPARED TTS FILE */}
      {activeTab === "import_tts" && (
        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 shadow-xl space-y-5">
          <div className="border-b border-gray-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>📁</span> Import Prepared TTS Audio File
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Upload your own externally generated or recorded speech file (.mp3, .wav, .m4a, .ogg, .webm) and attach it to your project narration.
            </p>
          </div>

          {importSuccessBanner && (
            <div className="p-3 bg-emerald-950/90 border border-emerald-600 rounded-xl text-emerald-200 text-xs flex items-center justify-between animate-fade-in shadow-lg">
              <span className="flex items-center gap-2 font-medium">
                <span>✅</span> {importSuccessBanner}
              </span>
              <button onClick={() => setImportSuccessBanner(null)} className="text-emerald-400 hover:text-white font-bold">✕</button>
            </div>
          )}

          {/* Drag and Drop Upload Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
            className="border-2 border-dashed border-indigo-700/60 hover:border-indigo-500 rounded-2xl p-8 text-center bg-gray-800/30 hover:bg-gray-800/50 cursor-pointer transition-all space-y-3"
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-2xl mx-auto text-indigo-400">
              📤
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                Click to browse or drag & drop your prepared TTS audio file
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Supports MP3, WAV, M4A, OGG, WebM • High quality speech recordings
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
              className="hidden"
            />
          </div>

          {/* Imported File Review & Assignment Controls */}
          {importedAudioUrl && (
            <div className="bg-gray-800/50 border border-indigo-900/50 rounded-xl p-4 space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-700/60 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-base">
                    🎵
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white line-clamp-1">{importedFileName}</h4>
                    <p className="text-[10px] text-gray-400 font-mono">
                      {importedAudioDuration > 0 ? `Duration: ~${importedAudioDuration} seconds` : "Audio ready"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleImportPlayback}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow"
                  >
                    <span>{isImportPlaying ? "⏸️ Pause" : "▶ Listen Audio"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportedAudioUrl(null);
                      setImportedFileName("");
                    }}
                    className="px-2.5 py-1.5 text-xs text-gray-400 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Hidden audio element for preview */}
              <audio
                ref={audioRef}
                src={importedAudioUrl}
                onEnded={() => setIsImportPlaying(false)}
                className="hidden"
              />

              {/* Assignment Form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] text-gray-400 font-medium block mb-1">
                    Voice Profile Name / Attribution Label:
                  </label>
                  <input
                    type="text"
                    value={customVoiceLabel}
                    onChange={(e) => setCustomVoiceLabel(e.target.value)}
                    placeholder="e.g. My ElevenLabs Adam Voice, Custom TTS Studio..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    This label will be printed in your exported video description credits.
                  </p>
                </div>

                <div>
                  <label className="text-[11px] text-gray-400 font-medium block mb-1">
                    Where to Apply Audio:
                  </label>
                  <select
                    value={importTargetScene}
                    onChange={(e) => setImportTargetScene(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="all">Apply to All Scenes (Global Voiceover)</option>
                    {scenes.map((s, i) => (
                      <option key={s.id} value={s.id.toString()}>
                        Scene {i + 1}: "{s.text ? s.text.slice(0, 30) + "..." : `Scene ${i + 1}`}"
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Select whole video or attach to an individual scene.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleApplyImportedAudio}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2"
                >
                  <span>✨</span>
                  <span>Confirm & Apply Prepared TTS Audio</span>
                </button>
              </div>
            </div>
          )}

          {/* Attribution Notice */}
          <div className="p-3 bg-gray-950/60 rounded-xl border border-gray-800 text-xs text-gray-400 flex items-start gap-2">
            <span className="text-base">📢</span>
            <p>
              <strong className="text-gray-200">Full Video Attribution:</strong> When exporting your video, the attribution document in the Export/Render tab will automatically credit your voice narration with the specified voice profile and licensing terms.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
