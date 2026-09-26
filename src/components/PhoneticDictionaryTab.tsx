import React, { useState, useEffect, useMemo } from "react";
import type { Scene } from "../types";
import {
  getAllActivePhoneticEntries,
  getCustomPhoneticDictionary,
  setCustomPhoneticWord,
  removeCustomPhoneticWord,
  resetCustomPhoneticDictionary,
  saveCustomPhoneticDictionary,
  type PhoneticEntry,
  BUILT_IN_PHONETIC_ENTRIES,
} from "../lib/phonetic-dictionary";
import {
  normalizeNarrationScript,
  type NormalizationResult,
} from "../lib/speech-sanitizer";
import { ttsPlayer } from "../lib/tts-player";

interface PhoneticDictionaryTabProps {
  scenes: Scene[];
  selectedVoice: string;
}

const SAMPLE_SCRIPTS = [
  {
    label: "Scripture Citations (Hyphens to 'to')",
    text: "Read John 3:16-18 and Romans 8:28-39 w/ great care.",
  },
  {
    label: "Numbered Bible Books & Verses",
    text: "According to 1 Cor. 13:4-8 and 1 John 4:7-12, love never fails.",
  },
  {
    label: "Ancient & Biblical Names",
    text: "Nebuchadnezzar and Melchizedek met near Gethsemane shouting Hallelujah!",
  },
  {
    label: "Script Characters & Stage Cues",
    text: "NARRATOR (V.O.): Behold the dawn [sighs]. The journey has begun (pause).",
  },
  {
    label: "Roman Numerals in Titles & Chapters",
    text: "King Henry VIII visited during Chapter IV of World War II.",
  },
  {
    label: "Currencies, Percentages & Symbols",
    text: "The budget was $250 with 85% saved, discounted by 1/2.",
  },
];

export default function PhoneticDictionaryTab({
  scenes,
  selectedVoice,
}: PhoneticDictionaryTabProps) {
  // Test Input & Diagnostic State
  const [testInput, setTestInput] = useState<string>(
    "NARRATOR: In John 3:16-18, Melchizedek praised Yahweh saying Hallelujah! [pause] King Henry VIII read Chapter IV."
  );
  const [testResult, setTestResult] = useState<NormalizationResult | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [playingWordId, setPlayingWordId] = useState<string | null>(null);

  // Dictionary management state
  const [customEntries, setCustomEntries] = useState<PhoneticEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [newSpokenAs, setNewSpokenAs] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Load custom entries on mount & when updated
  const refreshCustomEntries = () => {
    setCustomEntries(getCustomPhoneticDictionary());
  };

  useEffect(() => {
    refreshCustomEntries();
    const handleUpdate = () => refreshCustomEntries();
    window.addEventListener("scenering-phonetic-dictionary-updated", handleUpdate);
    return () => {
      window.removeEventListener("scenering-phonetic-dictionary-updated", handleUpdate);
    };
  }, []);

  // Run normalization whenever testInput or customEntries change
  useEffect(() => {
    const result = normalizeNarrationScript(testInput, { customEntries });
    setTestResult(result);
  }, [testInput, customEntries]);

  // All combined entries
  const allEntries = useMemo(() => {
    return getAllActivePhoneticEntries(customEntries);
  }, [customEntries]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return allEntries.filter((item) => {
      const matchCat =
        selectedCategory === "all" ||
        (selectedCategory === "custom" && item.category === "custom") ||
        item.category === selectedCategory;

      if (!matchCat) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        item.word.toLowerCase().includes(q) ||
        item.spokenAs.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
    });
  }, [allEntries, selectedCategory, searchQuery]);

  // Playback handlers
  const handlePlayNormalizedText = async () => {
    if (!testResult?.spokenText) return;
    if (isPlayingAudio) {
      ttsPlayer.stop();
      setIsPlayingAudio(false);
      return;
    }

    try {
      setIsPlayingAudio(true);
      await ttsPlayer.play(
        testResult.spokenText,
        selectedVoice,
        1.0,
        1.0,
        "phonetic-preview-text",
        () => {
          setIsPlayingAudio(false);
        }
      );
    } catch (e) {
      console.warn("Playback error:", e);
      setIsPlayingAudio(false);
    }
  };

  const handlePlaySingleWord = async (entry: PhoneticEntry) => {
    if (playingWordId === entry.id) {
      ttsPlayer.stop();
      setPlayingWordId(null);
      return;
    }

    try {
      setPlayingWordId(entry.id);
      await ttsPlayer.play(
        entry.spokenAs,
        selectedVoice,
        1.0,
        1.0,
        `phonetic-word-${entry.id}`,
        () => {
          setPlayingWordId(null);
        }
      );
    } catch (e) {
      console.warn("Word playback error:", e);
      setPlayingWordId(null);
    }
  };

  // Add / Edit submission
  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newWord.trim()) {
      setFormError("Original script word or phrase is required.");
      return;
    }
    if (!newSpokenAs.trim()) {
      setFormError("Spoken phonetic pronunciation is required.");
      return;
    }

    try {
      setCustomPhoneticWord(newWord.trim(), newSpokenAs.trim(), newDescription.trim());
      refreshCustomEntries();
      setNewWord("");
      setNewSpokenAs("");
      setNewDescription("");
      setIsAddingNew(false);
      setEditingId(null);
      setFeedbackMessage(`Saved pronunciation for "${newWord.trim()}"!`);
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (err: any) {
      setFormError(err.message || "Failed to save entry.");
    }
  };

  const handleStartEdit = (entry: PhoneticEntry) => {
    setEditingId(entry.id);
    setNewWord(entry.word);
    setNewSpokenAs(entry.spokenAs);
    setNewDescription(entry.description || "");
    setIsAddingNew(true);
  };

  const handleDeleteEntry = (id: string, word: string) => {
    if (window.confirm(`Remove custom pronunciation for "${word}"?`)) {
      removeCustomPhoneticWord(id);
      refreshCustomEntries();
      setFeedbackMessage(`Removed pronunciation for "${word}".`);
      setTimeout(() => setFeedbackMessage(null), 3000);
    }
  };

  const handleResetDefaults = () => {
    if (
      window.confirm(
        "Are you sure you want to clear all custom phonetic entries and restore default settings?"
      )
    ) {
      resetCustomPhoneticDictionary();
      refreshCustomEntries();
      setFeedbackMessage("Reset custom pronunciations to defaults.");
      setTimeout(() => setFeedbackMessage(null), 3000);
    }
  };

  const handleExportJSON = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(customEntries, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "scenering-phonetic-dictionary.json");
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          saveCustomPhoneticDictionary(parsed);
          refreshCustomEntries();
          setFeedbackMessage(`Imported ${parsed.length} phonetic entries successfully!`);
          setTimeout(() => setFeedbackMessage(null), 3500);
        } else {
          alert("Invalid JSON format: expected an array of phonetic entries.");
        }
      } catch (err: any) {
        alert("Failed to parse JSON file: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950/80 via-purple-950/60 to-gray-900 border border-indigo-800/50 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-2">
              <span>🗣️</span> Narration Normalization Engine
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Phonetic Dictionary &amp; Script Normalization
            </h2>
            <p className="text-sm text-gray-300 max-w-3xl mt-1">
              Ensures authentic human pronunciation of script characters, scriptural citations
              (converting &apos;–&apos; to &apos;to&apos; for verses), Roman numerals, abbreviations,
              and ancient/biblical names before audio synthesis.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="text-xs bg-indigo-900/60 border border-indigo-700/60 px-3 py-1.5 rounded-lg text-indigo-200 font-mono">
              {BUILT_IN_PHONETIC_ENTRIES.length} Built-in
            </span>
            <span className="text-xs bg-purple-900/60 border border-purple-700/60 px-3 py-1.5 rounded-lg text-purple-200 font-mono">
              {customEntries.length} Custom
            </span>
          </div>
        </div>

        {feedbackMessage && (
          <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs font-medium flex items-center gap-2 animate-fadeIn">
            <span>✅</span> {feedbackMessage}
          </div>
        )}
      </div>

      {/* SECTION 1: Interactive Live Normalizer & Audio Tester */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🧪</span> Live Script Normalization Tester
            </h3>
            <p className="text-xs text-gray-400">
              Type or select text below to verify how citations, symbols, and phonetic rules transform into spoken prose.
            </p>
          </div>

          {/* Quick Scene Selector */}
          {scenes.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 whitespace-nowrap">Load Scene:</span>
              <select
                onChange={(e) => {
                  const idx = parseInt(e.target.value, 10);
                  if (!isNaN(idx) && scenes[idx]?.text) {
                    setTestInput(scenes[idx].text);
                  }
                }}
                className="bg-gray-800 text-xs text-white border border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                defaultValue=""
              >
                <option value="" disabled>
                  Choose a project scene...
                </option>
                {scenes.map((sc, i) => (
                  <option key={sc.id} value={i}>
                    Scene {i + 1}: {sc.text?.slice(0, 35)}...
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Quick Sample Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">
            Samples:
          </span>
          {SAMPLE_SCRIPTS.map((sample, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setTestInput(sample.text)}
              className="text-xs px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700/60 transition-colors"
            >
              {sample.label}
            </button>
          ))}
        </div>

        {/* Input & Output Side-by-Side or Stacked */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-300 flex items-center justify-between">
              <span>Original Script Input</span>
              <span className="text-[11px] text-gray-500">{testInput.length} chars</span>
            </label>
            <textarea
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              rows={4}
              placeholder="Paste or type script text to preview spoken pronunciation..."
              className="w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-sans"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                <span>🔊</span> Spoken Normalization (Spoken By TTS)
              </label>
              <button
                type="button"
                onClick={handlePlayNormalizedText}
                disabled={!testResult?.spokenText}
                className={`text-xs px-3 py-1 rounded-lg font-medium flex items-center gap-1.5 transition-all shadow-md ${
                  isPlayingAudio
                    ? "bg-amber-600 hover:bg-amber-500 text-white animate-pulse"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                } disabled:opacity-50`}
              >
                <span>{isPlayingAudio ? "⏹️ Stop" : "▶️ Listen"}</span>
                <span>({selectedVoice})</span>
              </button>
            </div>
            <div className="w-full min-h-[96px] bg-indigo-950/30 border border-indigo-800/40 rounded-xl p-3 text-sm text-indigo-100 font-sans leading-relaxed">
              {testResult?.spokenText || <span className="text-gray-500 italic">No output</span>}
            </div>
          </div>
        </div>

        {/* Step-by-step Transformation Diagnostics */}
        {testResult && testResult.steps.length > 0 && (
          <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3.5 space-y-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
              Applied Pipeline Normalization Rules:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {testResult.steps.map((st, i) => (
                <div
                  key={i}
                  className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                    st.changed
                      ? "bg-indigo-950/50 border-indigo-600/60 text-indigo-200"
                      : "bg-gray-900/40 border-gray-800 text-gray-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-semibold text-gray-200">{st.step}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                        st.changed ? "bg-indigo-800 text-white" : "bg-gray-800 text-gray-500"
                      }`}
                    >
                      {st.changed ? "Applied" : "Unchanged"}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-tight">{st.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: Phonetic Pronunciation Lexicon & Custom Words */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>📖</span> Phonetic Pronunciation Lexicon
            </h3>
            <p className="text-xs text-gray-400">
              Browse standard pronunciations or add custom phonetic replacements for characters, places, and brands.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAddingNew(!isAddingNew);
                setEditingId(null);
                setNewWord("");
                setNewSpokenAs("");
                setNewDescription("");
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 transition-colors shadow-md"
            >
              <span>{isAddingNew ? "✖ Cancel" : "➕ Add Custom Word"}</span>
            </button>

            <button
              type="button"
              onClick={handleExportJSON}
              disabled={customEntries.length === 0}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors disabled:opacity-50"
              title="Export custom phonetic dictionary"
            >
              Export JSON
            </button>

            <label className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors cursor-pointer">
              Import JSON
              <input
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
            </label>

            {customEntries.length > 0 && (
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800/60 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Add / Edit Form Modal or Inline Form */}
        {isAddingNew && (
          <form
            onSubmit={handleSaveEntry}
            className="p-4 bg-gray-950 border border-indigo-700/60 rounded-xl space-y-3 animate-fadeIn"
          >
            <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
              {editingId ? "Edit Custom Pronunciation" : "Add Custom Pronunciation"}
            </h4>

            {formError && (
              <div className="text-xs p-2 rounded bg-red-950 border border-red-700 text-red-200">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-300 font-medium block mb-1">
                  Original Script Word / Character Name:
                </label>
                <input
                  type="text"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  placeholder="e.g. Scenering, Melchizedek, C.S. Lewis"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-gray-300 font-medium block mb-1">
                  Spoken Phonetic Replacement:
                </label>
                <input
                  type="text"
                  value={newSpokenAs}
                  onChange={(e) => setNewSpokenAs(e.target.value)}
                  placeholder="e.g. Scene-ring, Mel-kiz-eh-dek, Cee Ess Lewis"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-300 font-medium block mb-1">
                Description / Context (Optional):
              </label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="e.g. Brand title, character name in scene 3"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsAddingNew(false);
                  setEditingId(null);
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="text-xs px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow"
              >
                {editingId ? "Update Pronunciation" : "Save Pronunciation"}
              </button>
            </div>
          </form>
        )}

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search words or pronunciations..."
              className="w-full bg-gray-950 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <span className="absolute left-2.5 top-2 text-xs text-gray-500">🔍</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {[
              { id: "all", label: "All" },
              { id: "scriptural", label: "Scriptural Names" },
              { id: "theological", label: "Theological" },
              { id: "classical", label: "Classical / History" },
              { id: "script_cues", label: "Script Cues" },
              { id: "custom", label: `Custom (${customEntries.length})` },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  selectedCategory === cat.id
                    ? "bg-indigo-600 border-indigo-500 text-white font-semibold"
                    : "bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-750"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Entries Table / List */}
        <div className="border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-950 text-gray-400 font-semibold sticky top-0 z-10 border-b border-gray-800">
                <tr>
                  <th className="py-2.5 px-3">Script Word / Citation</th>
                  <th className="py-2.5 px-3">Spoken Phonetic Pronunciation</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Description / Context</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 bg-gray-900/40">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      No phonetic entries found matching &ldquo;{searchQuery}&rdquo;.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => {
                    const isCustom = entry.category === "custom";
                    const isWordPlaying = playingWordId === entry.id;

                    return (
                      <tr key={entry.id} className="hover:bg-gray-800/50 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-white">
                          {entry.word}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-indigo-300">
                          {entry.spokenAs}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              isCustom
                                ? "bg-purple-950 text-purple-300 border border-purple-800"
                                : "bg-gray-800 text-gray-400 border border-gray-700"
                            }`}
                          >
                            {entry.category.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-gray-400">
                          {entry.description || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePlaySingleWord(entry)}
                              className={`p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors ${
                                isWordPlaying ? "text-amber-400 animate-pulse" : ""
                              }`}
                              title={`Listen to "${entry.spokenAs}"`}
                            >
                              {isWordPlaying ? "⏹️" : "🔊"}
                            </button>

                            {isCustom && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(entry)}
                                  className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
                                  title="Edit custom entry"
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEntry(entry.id, entry.word)}
                                  className="p-1 rounded hover:bg-red-950 text-gray-400 hover:text-red-300"
                                  title="Delete custom entry"
                                >
                                  🗑️
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Note */}
        <p className="text-[11px] text-gray-500 italic">
          💡 The phonetic dictionary and text normalization pipeline are automatically applied
          to all scene voiceovers, video previews, and exported renders without requiring manual edits to your scene script cards.
        </p>
      </div>
    </div>
  );
}
