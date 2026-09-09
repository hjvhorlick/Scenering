"use client";

import { useState } from "react";
import type { Scene } from "@/types";

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
  const [queryValue, setQueryValue] = useState(scene.imageQuery);
  const [searching, setSearching] = useState(false);
  const [imageOptions, setImageOptions] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleTextSave = () => {
    onUpdate(scene.id, { text: textValue });
    setEditingText(false);
  };

  const handleSearch = async () => {
    setSearching(true);
    setImgError(false);
    try {
      const result = await onImageSearch(scene.id, queryValue);
      if (result?.allImages && result.allImages.length > 1) {
        setImageOptions(result.allImages);
        setShowPicker(true);
      }
    } finally {
      setSearching(false);
    }
  };

  const handlePickImage = (url: string) => {
    onUpdate(scene.id, { imageUrl: url });
    setShowPicker(false);
  };

  return (
    <div
      className="animate-slide-in bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex flex-col lg:flex-row">
        {/* Image Section */}
        <div className="lg:w-80 flex-shrink-0 relative group">
          {scene.imageUrl && !imgError ? (
            <div className="relative aspect-video lg:aspect-auto lg:h-full min-h-[180px]">
              <img
                src={scene.imageUrl}
                alt={`Scene ${index + 1}`}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur rounded-lg text-white text-sm transition-colors"
                >
                  🔄 New Image
                </button>
                {imageOptions.length > 1 && (
                  <button
                    onClick={() => setShowPicker(true)}
                    className="px-3 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur rounded-lg text-white text-sm transition-colors"
                  >
                    🖼️ Pick Another
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="aspect-video lg:aspect-auto lg:h-full bg-gray-900 flex flex-col items-center justify-center min-h-[180px] gap-3">
              {imgError && (
                <p className="text-xs text-red-400">Image failed to load</p>
              )}
              <button
                onClick={handleSearch}
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

          {/* Image Query */}
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <input
                type="text"
                value={queryValue}
                onChange={(e) => setQueryValue(e.target.value)}
                placeholder="Image search query..."
                className="w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded-lg text-white text-xs transition-colors whitespace-nowrap"
            >
              {searching ? "..." : "🔍 Search"}
            </button>
          </div>
        </div>
      </div>

      {/* Image Picker Modal */}
      {showPicker && imageOptions.length > 0 && (
        <div className="border-t border-gray-700 p-4 bg-gray-900/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Choose an image
            </h4>
            <button
              onClick={() => setShowPicker(false)}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              ✕ Close
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {imageOptions.map((url, i) => (
              <button
                key={i}
                onClick={() => handlePickImage(url)}
                className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all hover:border-indigo-500 ${
                  scene.imageUrl === url ? "border-indigo-500" : "border-transparent"
                }`}
              >
                <img
                  src={url}
                  alt={`Option ${i + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {scene.imageUrl === url && (
                  <div className="absolute inset-0 bg-indigo-600/30 flex items-center justify-center">
                    <span className="text-white text-lg">✓</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
