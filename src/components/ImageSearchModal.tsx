import { useState, useEffect, useCallback } from "react";
import { EDGE_FUNCTION_BASE } from "../lib/supabase";
import { getApiKeysHeaders, getApiKeysQueryParams, getStoredApiKeys } from "../lib/api-keys";
import ApiKeysModal from "./ApiKeysModal";

interface ImageResult {
  url: string;
  thumbnail: string;
  source: string;
  width: number;
  height: number;
}

interface ImageSearchModalProps {
  initialQuery: string;
  onClose: () => void;
  onSelect: (url: string) => void;
}

export default function ImageSearchModal({
  initialQuery,
  onClose,
  onSelect,
}: ImageSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [images, setImages] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const [keysModalOpen, setKeysModalOpen] = useState(false);
  const [hasKeys, setHasKeys] = useState(() => {
    const k = getStoredApiKeys();
    return Boolean(k.pexelsKey || k.pixabayKey);
  });

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError("");
    setImages([]);

    try {
      const headers = getApiKeysHeaders();
      const queryParams = getApiKeysQueryParams();
      const res = await fetch(
        `${EDGE_FUNCTION_BASE}/image-search?q=${encodeURIComponent(q)}&count=12${queryParams}`,
        { headers }
      );
      if (!res.ok) {
        throw new Error(`Search failed (${res.status})`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setImages(data.images || []);
      setSource(data.source || "");
      if (!data.images || data.images.length === 0) {
        setError("No images found. Try a different search term or add your Pexels/Pixabay API key.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-search on open with the initial query
  useEffect(() => {
    search(initialQuery);
  }, [initialQuery, search]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search(query);
  };

  const handleKeysSaved = () => {
    const k = getStoredApiKeys();
    setHasKeys(Boolean(k.pexelsKey || k.pixabayKey));
    search(query);
  };

  const proxyUrl = (url: string) =>
    `${EDGE_FUNCTION_BASE}/proxy-image?url=${encodeURIComponent(url)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 flex-shrink-0">
            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Image Search
          </h2>

          {/* Search bar */}
          <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for images..."
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded-lg text-white text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Searching...
                </>
              ) : (
                "Search"
              )}
            </button>
          </form>

          <button
            onClick={() => setKeysModalOpen(true)}
            className="px-2.5 py-1.5 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-750 text-xs text-gray-300 hover:text-white flex items-center gap-1.5 flex-shrink-0"
            title="Configure personal Pexels & Pixabay API keys"
          >
            <span>🔑</span>
            <span className="hidden sm:inline">API Keys</span>
            {hasKeys && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>

          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Source badge & Keys notice */}
        <div className="px-4 py-2 border-b border-gray-800/50 flex flex-wrap items-center justify-between gap-2 bg-gray-900/40">
          <div className="flex items-center gap-2">
            {source && source !== "none" ? (
              <span className="text-xs text-gray-400">
                Source: <span className="text-indigo-300 font-medium capitalize">{source}</span> · {images.length} results
              </span>
            ) : (
              <span className="text-xs text-gray-500">Stock & Open Image Search</span>
            )}
          </div>

          <button
            onClick={() => setKeysModalOpen(true)}
            className="text-[11px] text-gray-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
          >
            <span>{hasKeys ? "✓ Using Customer API Key" : "⚡ Want higher resolution photos?"}</span>
            <span className="text-indigo-400 underline">{hasKeys ? "Edit Keys" : "Insert Pexels/Pixabay Key"}</span>
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <svg className="animate-spin h-10 w-10 text-indigo-400 mb-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-gray-400 text-sm">Searching for images...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-gray-300 text-sm font-medium mb-1">{error}</p>
              <p className="text-xs text-gray-500 mb-5">
                Pexels and Pixabay offer millions of free stock photos. You can insert your customer API key to unlock them.
              </p>
              <div className="flex gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => setKeysModalOpen(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-xs font-medium flex items-center gap-1.5"
                >
                  <span>🔑</span> Insert Pexels / Pixabay Key
                </button>
              </div>
              <form onSubmit={handleSubmit} className="w-full flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Try another search..."
                  className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm font-medium"
                >
                  Search
                </button>
              </form>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => onSelect(proxyUrl(img.url))}
                  className="group relative aspect-video rounded-lg overflow-hidden border-2 border-transparent hover:border-indigo-500 transition-all bg-gray-800"
                >
                  <img
                    src={proxyUrl(img.thumbnail)}
                    alt={`Result ${i + 1}`}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium bg-indigo-600 px-3 py-1.5 rounded-lg">
                      Select
                    </span>
                  </div>
                  <span className="absolute bottom-1 right-1 text-[9px] bg-black/60 text-gray-300 px-1.5 py-0.5 rounded capitalize">
                    {img.source}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-800 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Click an image to use it, or search for something different above.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      <ApiKeysModal
        isOpen={keysModalOpen}
        onClose={() => setKeysModalOpen(false)}
        onSaved={handleKeysSaved}
      />
    </div>
  );
}
