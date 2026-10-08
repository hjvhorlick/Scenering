import React, { useState, useRef, useEffect } from "react";
import type { Scene } from "../types";
import { ttsPlayer } from "../lib/tts-player";
import { getStoredApiKeys } from "../lib/api-keys";
import { STUDIO_VOICE_PRESETS, migrateLegacyVoiceId } from "../data/voice-presets";
import { isPlanVoiceIncluded } from "../config/plans";
import { getInterfacePlan, useSession } from "../lib/session";
import { buildSpeechifyVoiceDirectory, fetchSpeechifyVoiceCatalog, synthesizeSpeechify } from "../lib/speechify-client";
import Icon, { iconify } from "./icons/Icon";

interface VoiceImportModalProps {
  scene?: Scene;
  targetSceneIndex?: number;
  allScenes?: Scene[];
  isOpen: boolean;
  onClose: () => void;
  onAttachAudio: (sceneId: number, audioUrl: string, audioName: string, durationSec: number) => void;
  onApplyVoiceToAllScenes?: (voiceId: string) => void;
}

export const REAL_STUDIO_VOICES = STUDIO_VOICE_PRESETS.map((voice) => ({
  id: voice.id,
  name: voice.name,
  gender: voice.gender,
  accent: voice.accent,
  desc: `${voice.tone}. ${voice.recommendedFor}.`,
  sampleText: voice.sampleText,
}));

export interface RealVoiceItem {
  /** Provider ID used for search/display; profileId routes through the plan-aware curated binding when available. */
  id: string;
  profileId?: string;
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
  const { account } = useSession();
  const currentPlan = getInterfacePlan(account);
  const canBrowseAdvancedVoices = isPlanVoiceIncluded(currentPlan, "speechify_male_02");
  const [activeTab, setActiveTab] = useState<"library" | "all_directory" | "upload" | "record">("library");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(migrateLegacyVoiceId(scene?.voice_id) || "speechify_male_01");
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // The customer-owned Speechify key is used only for browser-to-Speechify
  // requests; it is never attached to a Scenering/Cloudflare request.
  const [allVoicesList, setAllVoicesList] = useState<RealVoiceItem[]>([]);
  const [loadingVoicesList, setLoadingVoicesList] = useState(false);
  const [voiceDirectoryError, setVoiceDirectoryError] = useState<string | null>(null);
  const [hasSpeechifyKey, setHasSpeechifyKey] = useState(() => Boolean(getStoredApiKeys().speechifyKey));

  useEffect(() => {
    if (!isOpen) return;
    setSelectedVoiceId(migrateLegacyVoiceId(scene?.voice_id) || "speechify_male_01");
    setAttachmentError(null);
  }, [isOpen, scene?.voice_id]);

  useEffect(() => {
    const refreshProviderKey = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const nextKey = typeof detail?.speechifyKey === "string"
        ? detail.speechifyKey.trim()
        : getStoredApiKeys().speechifyKey;
      setHasSpeechifyKey(Boolean(nextKey));
      setAllVoicesList([]);
      setVoiceDirectoryError(null);
    };
    window.addEventListener("scenering-api-keys-updated", refreshProviderKey);
    return () => window.removeEventListener("scenering-api-keys-updated", refreshProviderKey);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (!hasSpeechifyKey) {
      setAllVoicesList([]);
      setLoadingVoicesList(false);
      setVoiceDirectoryError(null);
      return;
    }
    if (allVoicesList.length > 0) return;

    let active = true;
    setLoadingVoicesList(true);
    setVoiceDirectoryError(null);
    fetchSpeechifyVoiceCatalog()
      .then((catalog) => buildSpeechifyVoiceDirectory(catalog, canBrowseAdvancedVoices))
      .then((voices) => {
        if (active) setAllVoicesList(voices);
      })
      .catch((error: any) => {
        if (!active) return;
        console.warn("Could not load Speechify voices directly:", error);
        setVoiceDirectoryError(error?.message || "Could not load Speechify voices.");
      })
      .finally(() => {
        if (active) setLoadingVoicesList(false);
      });
    return () => { active = false; };
  }, [isOpen, allVoicesList.length, hasSpeechifyKey, canBrowseAdvancedVoices]);

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
    } catch (error: any) {
      setPreviewPlayingId(null);
      setAttachmentError(error?.message || "Speechify voice preview failed. Check the key in API Keys.");
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

  // Attach a selected Speechify voice to the scene. Errors are surfaced in
  // this modal; a failed request must never leave a blank/placeholder track.
  const handleAttachLibraryVoice = async (applyAll = false) => {
    if (!scene && !applyAll) return;
    setLoadingAudio(true);
    setAttachmentError(null);

    try {
      if (applyAll && onApplyVoiceToAllScenes) {
        onApplyVoiceToAllScenes(selectedVoiceId);
        setLoadingAudio(false);
        onClose();
        return;
      }

      if (scene) {
        const synthesized = await synthesizeSpeechify(scene.text || "", selectedVoiceId);
        const audioUrl = URL.createObjectURL(synthesized.blob);
        const audioObj = new Audio(audioUrl);
        audioObj.onloadedmetadata = () => {
          const duration = Math.ceil(audioObj.duration || scene.duration || 4);
          onAttachAudio(scene.id, audioUrl, `Speechify Voice (${selectedVoiceId})`, duration);
          setLoadingAudio(false);
          onClose();
        };
        audioObj.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          setLoadingAudio(false);
          setAttachmentError("The Speechify audio could not be decoded by this browser.");
        };
      }
    } catch (error: any) {
      setLoadingAudio(false);
      setAttachmentError(error?.message || "Could not attach this Speechify voice.");
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="min-h-full flex items-start justify-center p-0 sm:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            ttsPlayer.stop();
            onClose();
          }
        }}
      >
      <div className="bg-gray-900 border border-hairline rounded-t-2xl sm:rounded-2xl w-full max-w-3xl overflow-hidden shadow-xl sm:my-4">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-hairline bg-gray-950 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl"><Icon glyph="🎙" /></span>
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
        <div className="flex flex-wrap border-b border-hairline bg-gray-900/90 px-4 py-2 gap-2 overflow-x-auto no-scrollbar" role="tablist" aria-label="Voice import sections">
          <button
            onClick={() => setActiveTab("library")}
            className={`opt-btn ${activeTab === "library" ? "opt-btn-on" : ""}`}
          >
            <Icon glyph="🎭" /> Studio Real Voices
          </button>
          <button
            onClick={() => setActiveTab("all_directory")}
            className={`opt-btn ${activeTab === "all_directory" ? "opt-btn-on" : ""}`}
          >
            <Icon glyph="🌐" /> {hasSpeechifyKey ? "Speechify Voice Library" : "More Voices"}
            {allVoicesList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800">
                {allVoicesList.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("upload")}
            className={`opt-btn ${activeTab === "upload" ? "opt-btn-on" : ""}`}
          >
            <Icon glyph="📁" /> Import Audio File
          </button>
          <button
            onClick={() => setActiveTab("record")}
            className={`opt-btn ${activeTab === "record" ? "opt-btn-on" : ""}`}
          >
            <Icon glyph="🔴" /> Record Live Voice
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4">
          {attachmentError && (
            <div role="alert" className="p-3 bg-amber-950/70 border border-amber-700/70 rounded-xl text-xs text-amber-200">
              {attachmentError}
            </div>
          )}
          {activeTab === "all_directory" && voiceDirectoryError && (
            <div role="alert" className="p-3 bg-amber-950/70 border border-amber-700/70 rounded-xl text-xs text-amber-200">
              {voiceDirectoryError}
            </div>
          )}
          {/* TAB 1: STUDIO REAL VOICES */}
          {activeTab === "library" && (
            <div className="space-y-4">
              {/* Gender Filter Toggle (Preserves user's requested clear separation) */}
              <div className="flex items-center justify-between gap-3 bg-gray-950/60 p-2.5 rounded-xl border border-hairline">
                <span className="text-xs text-gray-300 font-medium flex items-center gap-1.5">
                  <Icon glyph="🚻" /> Voice Category:
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
                    <Icon glyph="👨" /> Male Voices
                  </button>
                  <button
                    onClick={() => setGenderFilter("female")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                      genderFilter === "female"
                        ? "bg-pink-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-pink-300"
                    }`}
                  >
                    <Icon glyph="👩" /> Female Voices
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
                          : "bg-gray-800/40 hover:bg-gray-800/80 border-hairline text-gray-300"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-sm text-white flex items-center gap-1.5">
                            <span>{iconify(v.gender === "male" ? "👨" : "👩")}</span>
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

                      <div className="pt-2 border-t border-hairline flex items-center justify-between">
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
                          <span>{iconify(isPlaying ? "⏹️ Stop" : "▶ Listen Sample")}</span>
                        </button>
                        {isSelected && (
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                            <Icon glyph="✓" /> Selected
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Scene Script preview if attached to a scene */}
              {scene && (
                <div className="bg-gray-950/80 p-3 rounded-xl border border-hairline text-xs">
                  <span className="text-gray-400 font-medium block mb-1">
                    Script Text for Scene {targetSceneIndex + 1}:
                  </span>
                  <p className="text-gray-200 italic">"{scene.text}"</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PROVIDER VOICE DIRECTORY */}
          {activeTab === "all_directory" && (
            <div className="space-y-4">
              {/* Filter and Search Bar */}
              <div className="flex flex-col sm:flex-row gap-3 bg-gray-950/60 p-3 rounded-xl border border-hairline">
                {/* Search */}
                <div className="flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={hasSpeechifyKey ? "Search Speechify voices by name, ID, or locale..." : "Search available voices by name, ID, or locale..."}
                    className="w-full bg-gray-900 border border-hairline rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                    All ({allVoicesList.length})
                  </button>
                  <button
                    onClick={() => setGenderFilter("male")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                      genderFilter === "male"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-blue-300"
                    }`}
                  >
                    <Icon glyph="👨" /> Male ({allVoicesList.filter((v) => v.gender === "male").length})
                  </button>
                  <button
                    onClick={() => setGenderFilter("female")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                      genderFilter === "female"
                        ? "bg-pink-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-pink-300"
                    }`}
                  >
                    <Icon glyph="👩" /> Female ({allVoicesList.filter((v) => v.gender === "female").length})
                  </button>
                </div>
              </div>

              {!hasSpeechifyKey && (
                <div className="p-3 bg-indigo-950/50 border border-indigo-800/60 rounded-xl text-xs text-indigo-200">
                  Add your Speechify API key in the top-right API Keys modal to browse the voice library and synthesize previews.
                </div>
              )}

              {loadingVoicesList ? (
                <div className="p-8 text-center text-xs text-indigo-300 flex items-center justify-center gap-2">
                  <span className="animate-spin"><Icon glyph="⏳" /></span>
                  <span>{hasSpeechifyKey ? "Loading Speechify voice library..." : "Loading available voices..."}</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                      const voiceSelectionId = v.profileId || v.id;
                      const isSelected = selectedVoiceId === voiceSelectionId || selectedVoiceId === v.id;
                      const isPlaying = previewPlayingId === voiceSelectionId;
                      const cleanName = v.friendlyName.trim();
                      return (
                        <div
                          key={v.id}
                          onClick={() => setSelectedVoiceId(voiceSelectionId)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                            isSelected
                              ? v.gender === "male"
                                ? "bg-blue-950/40 border-blue-500 ring-1 ring-blue-500"
                                : "bg-pink-950/40 border-pink-500 ring-1 ring-pink-500"
                              : "bg-gray-800/40 hover:bg-gray-800/80 border-hairline text-gray-300"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="font-bold text-xs text-white flex items-center gap-1.5 truncate">
                                <span>{iconify(v.gender === "male" ? "👨" : "👩")}</span>
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

                          <div className="pt-2 mt-2 border-t border-hairline flex items-center justify-between">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlayVoiceSample(
                                  voiceSelectionId,
                                  `Hello! This is a Speechify voice sample for ${cleanName}.`
                                );
                              }}
                              className={`text-xs font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                                isPlaying
                                  ? "bg-amber-600 text-white"
                                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                              }`}
                            >
                              <span>{iconify(isPlaying ? "⏹️ Stop" : "▶ Listen Sample")}</span>
                            </button>
                            {isSelected && (
                              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                                <Icon glyph="✓" /> Selected
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
                className="border border-dashed border-hairline hover:border-indigo-500 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-gray-950/40 hover:bg-gray-950/80 flex flex-col items-center justify-center gap-3"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                  className="hidden"
                />
                <span className="text-4xl"><Icon glyph="🎵" /></span>
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
                    <span className="text-2xl"><Icon glyph="🎧" /></span>
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
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg border border-hairline"
                    >
                      {iconify(previewPlayingId === "uploaded" ? "⏹️ Stop" : "▶ Play")}
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
              <div className="max-w-md mx-auto bg-gray-950/70 border border-hairline rounded-2xl p-6 space-y-4">
                <span className="text-4xl block"><Icon glyph="🎙" /></span>
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
                      <Icon glyph="⏹" /> Stop Recording
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={startRecording}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg transition-colors flex items-center gap-2 mx-auto"
                    >
                      <Icon glyph="🔴" /> Start Microphone Recording
                    </button>
                  </div>
                )}

                {recordedAudio && !isRecording && (
                  <div className="p-3 bg-gray-900 border border-emerald-700/60 rounded-xl space-y-3 pt-4">
                    <p className="text-xs text-emerald-300 font-semibold">
                      <Icon glyph="✅" /> Recording ready ({recordedAudio.duration}s)!
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handlePlayVoiceSample("recorded", "url:" + recordedAudio.url)
                        }
                        className="px-3.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg border border-hairline"
                      >
                        {iconify(previewPlayingId === "recorded" ? "⏹️ Stop" : "▶ Play Recording")}
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
        <div className="p-4 border-t border-hairline bg-gray-950 flex flex-wrap items-center justify-between gap-3">
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
                      <span className="animate-spin"><Icon glyph="⏳" /></span> Attaching Voice...
                    </>
                  ) : (
                    <>
                      <Icon glyph="✨" /> Apply to Scene {targetSceneIndex + 1}
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
