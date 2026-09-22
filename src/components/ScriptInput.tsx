import { useState } from "react";
import { countWords, countScenesFromScript } from "../lib/duration-utils";

interface ScriptInputProps {
  onSubmit: (title: string, script: string) => void;
  loading: boolean;
  onOpenApiKeys?: () => void;
}

export default function ScriptInput({ onSubmit, loading, onOpenApiKeys }: ScriptInputProps) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");

  const wordsCount = countWords(script);
  const estimatedReadSec = Math.round((wordsCount / 2.5) * 10) / 10;
  // Scenes are produced by flattening the script into one continuous string
  // and slicing it into ~50-word chunks (20s default).
  const detectedScenes = countScenesFromScript(script, 20);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && script.trim()) {
      onSubmit(title.trim(), script.trim());
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1.5 text-white">Create New Video Project</h2>
          <p className="text-gray-400 text-sm">
            Enter your screenplay script or narration. It is flattened into one continuous script and split automatically into even ~50-word scenes (~20 seconds each).
          </p>
      </div>

      {/* Customer API Keys Notice */}
      {onOpenApiKeys && (
        <div className="p-3.5 bg-gray-900 border border-hairline rounded-xl flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔑</span>
            <div>
              <p className="text-xs font-semibold text-gray-200">Customer Stock Footage Keys (Optional)</p>
              <p className="text-[11px] text-gray-400">
                Add personal Pexels and Pixabay keys for live HD stock footage search.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenApiKeys}
            className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
          >
            Insert Keys
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">
            Project Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My Amazing Video"
            className="w-full px-4 py-3 bg-gray-800 border border-hairline rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="script" className="block text-sm font-medium text-gray-300">
              Script Narration
              <span className="text-gray-500 font-normal ml-2">
                (auto-split into ~50-word scenes)
              </span>
            </label>
            <span className="text-xs font-mono text-gray-400">
              {wordsCount} words • ~{estimatedReadSec}s total read
            </span>
          </div>
          <textarea
            id="script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={`Paste your full script below. It will be split automatically into ~50-word scenes (~20 seconds each) — line breaks and blank lines are ignored.`}
            rows={10}
            className="w-full px-4 py-3 bg-gray-800 border border-hairline rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-y font-mono text-sm leading-relaxed"
            required
          />
          <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
            <span>{detectedScenes} scene(s) detected</span>
            <span>Configure scene lengths in Setup (10s, 20s, or 30s)</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !title.trim() || !script.trim()}
          className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Generating Scenes...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Scenes
            </>
          )}
        </button>
      </form>
    </div>
  );
}
