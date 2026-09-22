import React, { useState, useRef, useEffect } from "react";
import type { Scene } from "../types";
import { ttsPlayer } from "../lib/tts-player";

interface VoiceImportModalProps {
  scene?: Scene;
  targetSceneIndex?: number;
  allScenes?: Scene[];
  isOpen: boolean;
  onClose: () => void;
  onAttachAudio: (sceneId: number, audioUrl: string, audioName: string, durationSec: number) => void;
  onApplyVoiceToAllScenes?: (voiceId: string) => void;
}

export const REAL_STUDIO_VOICES = [
  // Male Profiles
  {
    id: "guy",
    name: "Marcus (American Studio Baritone)",
    gender: "male" as const,
    accent: "American",
    desc: "Warm, natural, conversational studio narrator. Perfect for explainers and documentaries.",
    sampleText: "Welcome to the project. Every scene is crafted with authentic cinematic tone and timing.",
  },
  {
    id: "christopher",
    name: "Christopher (Deep Cinematic Trailer)",
    gender: "male" as const,
    accent: "American",
    desc: "Deep, authoritative, epic movie trailer baritone with commanding resonance.",
    sampleText: "In a world of infinite possibilities, only the boldest visions redefine history.",
  },
  {
    id: "ryan",
    name: "Arthur (British BBC Documentary)",
    gender: "male" as const,
    accent: "British RP",
    desc: "Distinguished, articulate, and erudite narration for premium brands and history.",
    sampleText: "Across the vast landscapes of imagination, elegance and precision illuminate every detail.",
  },
  {
    id: "william",
    name: "Liam (Australian Dynamic Presenter)",
    gender: "male" as const,
    accent: "Australian",
    desc: "Upbeat, energetic, friendly commercial voice for travel and tech stories.",
    sampleText: "G'day! Let's dive straight into the action and create something truly unforgettable.",
  },

  // Female Profiles
  {
    id: "jenny",
    name: "Sarah (American Natural Storyteller)",
    gender: "female" as const,
    accent: "American",
    desc: "Warm, clear, and engaging conversational storytelling with genuine emotion.",
    sampleText: "Every great story starts with a spark of curiosity and a voice that connects directly to the heart.",
  },
  {
    id: "aria",
    name: "Chloe (Modern Bright Presenter)",
    gender: "female" as const,
    accent: "American",
    desc: "Crisp, dynamic, bright, and vibrant voice for modern videos and social media.",
    sampleText: "Hey there! Get ready for an electrifying showcase that will captivate your entire audience.",
  },
  {
    id: "sonia",
    name: "Emma (British Classic Storyteller)",
    gender: "female" as const,
    accent: "British RP",
    desc: "Polished, expressive, and captivating audiobook narration with classical elegance.",
    sampleText: "Chapter one: A journey through timeless elegance, where every spoken word paints an indelible portrait.",
  },
  {
    id: "natasha",
    name: "Maya (Australian Calming Narrator)",
    gender: "female" as const,
    accent: "Australian",
    desc: "Gentle, soothing, resonant, and peaceful voice ideal for wellness and nature.",
    sampleText: "Breathe in deeply, find stillness in the moment, and let the gentle rhythm guide your focus.",
  },
];

export interface RealVoiceItem {
  id: string;
  name: string;
  gender: "male" | "female";
  locale: string;
  lang: string;
  friendlyName: string;
}

export default function VoiceImportModal({
  scene,
  targetSceneIndex = 0,
  allScenes = [],
  isOpen,
  onClose,
  onAttachAudio,
  onApplyVoiceToAllScenes,
}: VoiceImportModalProps) {
  const [activeTab, setActiveTab] = useState<"library" | "all_directory" | "upload" | "record">("library");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(scene?.voice_id || "guy");
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // 300+ Full Free Real Voices from Server
  const [allVoicesList, setAllVoicesList] = useState<RealVoiceItem[]>([]);
  const [loadingVoicesList, setLoadingVoicesList] = useState(false);

  useEffect(() => {
    if (isOpen && allVoicesList.length === 0) {
      setLoadingVoicesList(true);
      fetch("/api/tts/voices?all=true")
        .then((res) => res.json())
        .then((data) => {
          if (data.voices && Array.isArray(data.voices)) {
            setAllVoicesList(data.voices);
          }
        })
        .catch((err) => console.warn("Could not load all voices:", err))
        .finally(() => setLoadingVoicesList(false));
    }
  }, [isOpen, allVoicesList.length]);

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedAudio, setUploadedAudio] = useState<{
    url: string;
    name: string;
    duration: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Microphone Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState<{
    url: string;
    blob: Blob;
    duration: number;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      ttsPlayer.stop();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  // Handle Play Voice Sample
  const handlePlayVoiceSample = async (voiceId: string, sampleText: string) => {
    if (previewPlayingId === voiceId) {
      ttsPlayer.stop();
      setPreviewPlayingId(null);
      return;
    }

    ttsPlayer.stop();
    setPreviewPlayingId(voiceId);
    try {
      await ttsPlayer.play(sampleText, voiceId, 1.0, 1.0, voiceId, () => {
        setPreviewPlayingId(null);
      });
    } catch {
      setPreviewPlayingId(null);
    }
  };

  // Handle File Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const audioUrl = URL.createObjectURL(file);
      const audioObj = new Audio(audioUrl);

      audioObj.onloadedmetadata = () => {
        const duration = Math.round(audioObj.duration * 10) / 10;
        setUploadedAudio({
          url: audioUrl,
          name: file.name,
          duration: duration > 0 ? duration : 5,
        });
        setUploading(false);
      };

      audioObj.onerror = () => {
        setUploadedAudio({
          url: audioUrl,
          name: file.name,
          duration: 5,
        });
        setUploading(false);
      };
    } catch {
      setUploading(false);
    }
  };

  // Start Mic Recording
  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        const duration = Math.max(1, recordingTime);
        setRecordedAudio({ url, blob, duration });
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone access could not be initialized. Please allow microphone permissions.");
    }
  };

  // Stop Mic Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  // Attach selected library voice (synthesizes audio directly and caches it)
  const handleAttachLibraryVoice = async (applyAll = false) => {
    if (!scene && !applyAll) return;
    setLoadingAudio(true);

    try {
      if (applyAll && onApplyVoiceToAllScenes) {
        onApplyVoiceToAllScenes(selectedVoiceId);
        onClose();
        return;
      }

      if (scene) {
        // Fetch synthesized audio to attach directly
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: scene.text, voice: selectedVoiceId }),
        });

        if (res.ok) {
          const blob = await res.blob();
          const audioUrl = URL.createObjectURL(blob);
          const audioObj = new Audio(audioUrl);

          audioObj.onloadedmetadata = () => {
            const dur = Math.ceil(audioObj.duration || scene.duration || 4);
            onAttachAudio(scene.id, audioUrl, `Real Studio Voice (${selectedVoiceId})`, dur);
            setLoadingAudio(false);
            onClose();
          };

          audioObj.onerror = () => {
            onAttachAudio(scene.id, audioUrl, `Real Studio Voice (${selectedVoiceId})`, scene.duration || 4);
            setLoadingAudio(false);
            onClose();
          };
        } else {
          // Fallback: assign voice_id directly
          onAttachAudio(scene.id, "", `Real Studio Voice (${selectedVoiceId})`, scene.duration || 4);
          setLoadingAudio(false);
          onClose();
        }
      }
    } catch {
      setLoadingAudio(false);
      onClose();
    }
  };

  // Attach Uploaded Audio
  const handleAttachUploadedAudio = () => {
    if (!scene || !uploadedAudio) return;
    onAttachAudio(
      scene.id,
      uploadedAudio.url,
      uploadedAudio.name,
      Math.ceil(uploadedAudio.duration)
    );
    onClose();
  };

  // Attach Recorded Audio
  const handleAttachRecordedAudio = () => {
    if (!scene || !recordedAudio) return;
    onAttachAudio(
      scene.id,
      recordedAudio.url,
      `Live Mic Recording (${recordedAudio.duration}s)`,
      Math.ceil(recordedAudio.duration)
    );
    onClose();
  };

  const filteredVoices = REAL_STUDIO_VOICES.filter(
    (v) => genderFilter === "all" || v.gender === genderFilter
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-gray-800 bg-gray-950 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🎙️</span>
              <h2 className="text-lg font-bold text-white">Import Real Quality Voice</h2>
              {scene && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Scene {targetSceneIndex + 1}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Select an authentic studio narrator or import your own recorded real voice audio track.
            </p>
          </div>
          <button
            onClick={() => {
              ttsPlayer.stop();
              onClose();
            }}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 text-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-gray-800 bg-gray-900/90 px-4 pt-2 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("library")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "library"
                ? "bg-gray-800 text-indigo-300 border-t-2 border-indigo-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <span>🎭</span> Studio Real Voices
          </button>
          <button
            onClick={() => setActiveTab("all_directory")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "all_directory"
                ? "bg-gray-800 text-indigo-300 border-t-2 border-indigo-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <span>🌐</span> 300+ Free Real Voices
            {allVoicesList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800">
                {allVoicesList.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("upload")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "upload"
                ? "bg-gray-800 text-indigo-300 border-t-2 border-indigo-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <span>📁</span> Import Audio File
          </button>
          <button
            onClick={() => setActiveTab("record")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "record"
                ? "bg-gray-800 text-indigo-300 border-t-2 border-indigo-500"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <span>🔴</span> Record Live Voice
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: STUDIO REAL VOICES */}
          {activeTab === "library" && (
            <div className="space-y-4">
              {/* Gender Filter Toggle (Preserves user's requested clear separation) */}
              <div className="flex items-center justify-between gap-3 bg-gray-950/60 p-2.5 rounded-xl border border-gray-800">
                <span className="text-xs text-gray-300 font-medium flex items-center gap-1.5">
                  <span>🚻</span> Voice Category:
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setGenderFilter("all")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      genderFilter === "all"
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-white"
                    }`}
                  >
                    All Voices
                  </button>
                  <button
                    onClick={() => setGenderFilter("male")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                      genderFilter === "male"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-blue-300"
                    }`}
                  >
                    👨 Male Voices
                  </button>
                  <button
                    onClick={() => setGenderFilter("female")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                      genderFilter === "female"
                        ? "bg-pink-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-pink-300"
                    }`}
                  >
                    👩 Female Voices
                  </button>
                </div>
              </div>

              {/* Grid of Voices */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredVoices.map((v) => {
                  const isSelected = selectedVoiceId === v.id;
                  const isPlaying = previewPlayingId === v.id;
                  return (
                    <div
                      key={v.id}
                      onClick={() => setSelectedVoiceId(v.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? v.gender === "male"
                            ? "bg-blue-950/40 border-blue-500 ring-1 ring-blue-500"
                            : "bg-pink-950/40 border-pink-500 ring-1 ring-pink-500"
                          : "bg-gray-800/40 hover:bg-gray-800/80 border-gray-700/80 text-gray-300"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-sm text-white flex items-center gap-1.5">
                            <span>{v.gender === "male" ? "👨" : "👩"}</span>
                            <span>{v.name}</span>
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${
                              v.gender === "male"
                                ? "bg-blue-950 text-blue-300 border-blue-800"
                                : "bg-pink-950 text-pink-300 border-pink-800"
                            }`}
                          >
                            {v.accent}
                          </span>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed mb-2">{v.desc}</p>
                      </div>

                      <div className="pt-2 border-t border-gray-700/60 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayVoiceSample(v.id, v.sampleText);
                          }}
                          className={`text-xs font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
                            isPlaying
                              ? "bg-amber-600 text-white"
                              : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                          }`}
                        >
                          <span>{isPlaying ? "⏹️ Stop" : "▶ Listen Sample"}</span>
                        </button>
                        {isSelected && (
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                            <span>✓</span> Selected
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Scene Script preview if attached to a scene */}
              {scene && (
                <div className="bg-gray-950/80 p-3 rounded-xl border border-gray-800 text-xs">
                  <span className="text-gray-400 font-medium block mb-1">
                    Script Text for Scene {targetSceneIndex + 1}:
                  </span>
                  <p className="text-gray-200 italic">"{scene.text}"</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: 300+ FREE REAL VOICES DIRECTORY */}
          {activeTab === "all_directory" && (
            <div className="space-y-4">
              {/* Filter and Search Bar */}
              <div className="flex flex-col sm:flex-row gap-3 bg-gray-950/60 p-3 rounded-xl border border-gray-800">
                {/* Search */}
                <div className="flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search 300+ voices by name, accent or country code (e.g. Guy, Christopher, Jenny, Ryan, US, UK, AU)..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Gender Tabs */}
                <div className="flex gap-1.5 self-start sm:self-auto">
                  <button
                    onClick={() => setGenderFilter("all")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      genderFilter === "all"
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-white"
                    }`}
                  >
                    All ({allVoicesList.length || 322})
                  </button>
                  <button
                    onClick={() => setGenderFilter("male")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                      genderFilter === "male"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-blue-300"
                    }`}
                  >
                    👨 Male ({allVoicesList.filter((v) => v.gender === "male").length || 159})
                  </button>
                  <button
                    onClick={() => setGenderFilter("female")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                      genderFilter === "female"
                        ? "bg-pink-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-pink-300"
                    }`}
                  >
                    👩 Female ({allVoicesList.filter((v) => v.gender === "female").length || 163})
                  </button>
                </div>
              </div>

              {loadingVoicesList ? (
                <div className="p-8 text-center text-xs text-indigo-300 flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span>
                  <span>Loading full library of 300+ free natural voices...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
                  {allVoicesList
                    .filter((v) => {
                      if (genderFilter !== "all" && v.gender !== genderFilter) return false;
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        v.name.toLowerCase().includes(q) ||
                        v.friendlyName.toLowerCase().includes(q) ||
                        v.id.toLowerCase().includes(q) ||
                        v.locale.toLowerCase().includes(q)
                      );
                    })
                    .map((v) => {
                      const isSelected = selectedVoiceId === v.id;
                      const isPlaying = previewPlayingId === v.id;
                      const cleanName = v.friendlyName.replace(/Microsoft |Online \(Natural\)/gi, "").trim();
                      return (
                        <div
                          key={v.id}
                          onClick={() => setSelectedVoiceId(v.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                            isSelected
                              ? v.gender === "male"
                                ? "bg-blue-950/40 border-blue-500 ring-1 ring-blue-500"
                                : "bg-pink-950/40 border-pink-500 ring-1 ring-pink-500"
                              : "bg-gray-800/40 hover:bg-gray-800/80 border-gray-700/80 text-gray-300"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="font-bold text-xs text-white flex items-center gap-1.5 truncate">
                                <span>{v.gender === "male" ? "👨" : "👩"}</span>
                                <span className="truncate">{cleanName}</span>
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold border shrink-0 ${
                                  v.gender === "male"
                                    ? "bg-blue-950 text-blue-300 border-blue-800"
                                    : "bg-pink-950 text-pink-300 border-pink-800"
                                }`}
                              >
                                {v.locale}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-400 font-mono truncate">{v.id}</p>
                          </div>

                          <div className="pt-2 mt-2 border-t border-gray-700/60 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlayVoiceSample(
                                  v.id,
                                  `Hello! This is a natural human speaking test for ${cleanName}.`
                                );
                              }}
                              className={`text-xs font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                                isPlaying
                                  ? "bg-amber-600 text-white"
                                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                              }`}
                            >
                              <span>{isPlaying ? "⏹️ Stop" : "▶ Listen Sample"}</span>
                            </button>
                            {isSelected && (
                              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                                <span>✓</span> Selected
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: IMPORT AUDIO FILE */}
          {activeTab === "upload" && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-gray-950/40 hover:bg-gray-950/80 flex flex-col items-center justify-center gap-3"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                  className="hidden"
                />
                <span className="text-4xl">🎵</span>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">
                    Click to Upload Real Quality Voice Audio
                  </h3>
                  <p className="text-xs text-gray-400">
                    Supports MP3, WAV, M4A, AAC, and OGG formats up to 50MB
                  </p>
                </div>
                <button
                  type="button"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  Browse Audio File
                </button>
              </div>

              {uploading && (
                <div className="p-3 bg-gray-800 rounded-xl text-center text-xs text-indigo-300 animate-pulse">
                  Analyzing and importing audio track...
                </div>
              )}

              {uploadedAudio && (
                <div className="p-4 bg-indigo-950/40 border border-indigo-700/60 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🎧</span>
                    <div>
                      <h4 className="text-xs font-bold text-white">{uploadedAudio.name}</h4>
                      <p className="text-[11px] text-indigo-300">
                        Duration: {uploadedAudio.duration}s • Ready to attach to Scene{" "}
                        {targetSceneIndex + 1}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePlayVoiceSample("uploaded", "url:" + uploadedAudio.url)}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg border border-gray-700"
                    >
                      {previewPlayingId === "uploaded" ? "⏹️ Stop" : "▶ Play"}
                    </button>
                    <button
                      type="button"
                      onClick={handleAttachUploadedAudio}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg"
                    >
                      Attach to Scene
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RECORD LIVE VOICE */}
          {activeTab === "record" && (
            <div className="space-y-4 text-center py-4">
              <div className="max-w-md mx-auto bg-gray-950/70 border border-gray-800 rounded-2xl p-6 space-y-4">
                <span className="text-4xl block">🎙️</span>
                <div>
                  <h3 className="text-base font-bold text-white">Record Real Voice in Studio</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Record your own voice directly through your microphone for Scene{" "}
                    {targetSceneIndex + 1}.
                  </p>
                </div>

                {isRecording ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2 text-red-400 font-mono text-xl font-bold animate-pulse">
                      <span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
                      <span>Recording: {recordingTime}s</span>
                    </div>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg transition-colors"
                    >
                      ⏹️ Stop Recording
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={startRecording}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg transition-colors flex items-center gap-2 mx-auto"
                    >
                      <span>🔴</span> Start Microphone Recording
                    </button>
                  </div>
                )}

                {recordedAudio && !isRecording && (
                  <div className="p-3 bg-gray-900 border border-emerald-700/60 rounded-xl space-y-3 pt-4">
                    <p className="text-xs text-emerald-300 font-semibold">
                      ✅ Recording ready ({recordedAudio.duration}s)!
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handlePlayVoiceSample("recorded", "url:" + recordedAudio.url)
                        }
                        className="px-3.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg border border-gray-700"
                      >
                        {previewPlayingId === "recorded" ? "⏹️ Stop" : "▶ Play Recording"}
                      </button>
                      <button
                        type="button"
                        onClick={handleAttachRecordedAudio}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg"
                      >
                        Attach to Scene {targetSceneIndex + 1}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-950 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                ttsPlayer.stop();
                onClose();
              }}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>

          {(activeTab === "library" || activeTab === "all_directory") && (
            <div className="flex items-center gap-2">
              {allScenes.length > 1 && onApplyVoiceToAllScenes && (
                <button
                  type="button"
                  onClick={() => handleAttachLibraryVoice(true)}
                  disabled={loadingAudio}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-indigo-300 text-xs font-semibold rounded-xl border border-indigo-900/60 transition-colors"
                >
                  Apply to All Scenes
                </button>
              )}

              {scene && (
                <button
                  type="button"
                  onClick={() => handleAttachLibraryVoice(false)}
                  disabled={loadingAudio}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg flex items-center gap-1.5"
                >
                  {loadingAudio ? (
                    <>
                      <span className="animate-spin">⏳</span> Attaching Voice...
                    </>
                  ) : (
                    <>
                      <span>✨</span> Apply to Scene {targetSceneIndex + 1}
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
