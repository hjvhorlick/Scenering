import { useState } from "react";
import type { Scene } from "../types";
import ImageSearchModal from "./ImageSearchModal";

interface SceneEditorProps {
  scene: Scene;
  index: number;
  onUpdate: (sceneId: number, updates: Partial<Scene>) => void;
  onImageSearch: (sceneId: number, query: string) => Promise<{ imageUrl: string; allImages?: string[] } | undefined>;
}

export default function SceneEditor({
  scene,
  index,
  onUpdate,
  onImageSearch,
}: SceneEditorProps) {
  const [editingText, setEditingText] = useState(false);
  const [textValue, setTextValue] = useState(scene.text);
  const [queryValue, setQueryValue] = useState(scene.image_query);
  const [searching, setSearching] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleTextSave = () => {
    onUpdate(scene.id, { text: textValue });
    setEditingText(false);
  };

  // Quick search — auto-assigns first result, no modal
  const handleQuickSearch = async () => {
    setSearching(true);
    setImgError(false);
    try {
      await onImageSearch(scene.id, queryValue);
    } finally {
      setSearching(false);
    }
  };

  // Research button — opens the full search modal with 10 results
  const handleResearch = () => {
    setShowSearchModal(true);
  };

  const handleSelectFromModal = (url: string) => {
    onUpdate(scene.id, { image_url: url });
    setShowSearchModal(false);
  };

  return (
    <div
      className="animate-slide-in bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex flex-col lg:flex-row">
        {/* Image Section */}
        <div className="lg:w-80 flex-shrink-0 relative group">
          {scene.image_url && !imgError ? (
            <div className="relative aspect-video lg:aspect-auto lg:h-full min-h-[180px]">
              <img
                src={scene.image_url}
                alt={`Scene ${index + 1}`}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  onClick={handleResearch}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur rounded-lg text-white text-sm transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Research
                </button>
              </div>
            </div>
          ) : (
            <div className="aspect-video lg:aspect-auto lg:h-full bg-gray-900 flex flex-col items-center justify-center min-h-[180px] gap-3">
              {imgError && (
                <p className="text-xs text-red-400">Image failed to load</p>
              )}
              <button
                onClick={handleQuickSearch}
                disabled={searching}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 rounded-lg text-white text-sm transition-colors flex items-center gap-2"
              >
                {searching ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Fetching...
                  </>
                ) : (
                  <>🔍 Find Image</>
                )}
              </button>
              <button
                onClick={handleResearch}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors underline"
              >
                or browse more images
              </button>
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="flex-1 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Scene {index + 1}
            </span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Duration:</label>
              <select
                value={scene.duration}
                onChange={(e) =>
                  onUpdate(scene.id, { duration: parseInt(e.target.value) })
                }
                className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {[2, 3, 4, 5, 6, 8, 10].map((d) => (
                  <option key={d} value={d}>
                    {d}s
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Scene Text */}
          {editingText ? (
            <div className="space-y-2">
              <textarea
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleTextSave}
                  className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-white text-xs transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingText(false);
                    setTextValue(scene.text);
                  }}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p
              onClick={() => setEditingText(true)}
              className="text-sm text-gray-300 cursor-pointer hover:text-white transition-colors leading-relaxed"
              title="Click to edit"
            >
              {scene.text}
            </p>
          )}

          {/* Image Query + Buttons */}
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <input
                type="text"
                value={queryValue}
                onChange={(e) => setQueryValue(e.target.value)}
                placeholder="Image search query..."
                className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleQuickSearch();
                }}
              />
            </div>
            <button
              onClick={handleQuickSearch}
              disabled={searching}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded-lg text-white text-xs transition-colors whitespace-nowrap"
            >
              {searching ? "..." : "🔍 Quick"}
            </button>
            <button
              onClick={handleResearch}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-xs transition-colors whitespace-nowrap flex items-center gap-1"
              title="Open image search screen with 10 results"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Research
            </button>
          </div>
        </div>
      </div>

      {/* Image Search Modal */}
      {showSearchModal && (
        <ImageSearchModal
          initialQuery={queryValue}
          onClose={() => setShowSearchModal(false)}
          onSelect={handleSelectFromModal}
        />
      )}
    </div>
  );
}
