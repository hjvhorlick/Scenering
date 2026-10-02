import { useState, useEffect, useCallback } from "react";
import { EDGE_FUNCTION_BASE } from "../lib/supabase";
import { getApiKeysHeaders, getApiKeysQueryParams, getStoredApiKeys } from "../lib/api-keys";
import { pickRandomSample } from "../lib/image-picker";
import { searchImagePoolBroadened, type ImageCandidate } from "../lib/image-search";
import { nextNatureTopics, TOPICS_PER_OPEN } from "../lib/nature-topics";
import ApiKeysModal from "./ApiKeysModal";
import Icon, { iconify } from "./icons/Icon";

interface ImageSearchModalProps {
  initialQuery: string;
  onClose: () => void;
  /**
   * The chosen photo, plus the query that found it. The caller needs the
   * query as well as the URL: a term the user typed here is a deliberate
   * choice and is pinned to the scene, so re-deriving the query from the
   * narration can never silently undo it.
   */
  onSelect: (url: string, query: string) => void;
}

export default function ImageSearchModal({
  initialQuery,
  onClose,
  onSelect,
}: ImageSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [images, setImages] = useState<ImageCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const [keysModalOpen, setKeysModalOpen] = useState(false);
  /**
   * What the photos on screen actually answer, which is not always what was
   * typed: an empty result widens the query (see searchImagePoolBroadened),
   * and the user is told when that happened rather than being left to wonder
   * why the grid does not match their words.
   */
  const [effectiveQuery, setEffectiveQuery] = useState(initialQuery);
  const [broadened, setBroadened] = useState(false);
  const [usedFallbackDeck, setUsedFallbackDeck] = useState(false);
  /**
   * A few subjects to click instead of typing. Drawn once per open from a
   * rotating deck, so two consecutive opens never suggest the same three.
   */
  const [topics] = useState(() => nextNatureTopics(TOPICS_PER_OPEN));
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
      // The shared search keeps only photo-like images (the server has
      // already enforced 16:9 and ≥1920×1080) before anything is shown, and
      // widens the query rather than returning nothing: a long scene
      // sentence rarely matches a stock library word for word.
      const result = await searchImagePoolBroadened(q, { headers, queryParams });
      // Show a random dozen out of the verified candidates: repeating the
      // same search must not serve the identical grid every time.
      setImages(pickRandomSample(result.pool, 12));
      setSource(result.pool[0]?.source || "");
      setEffectiveQuery(result.query);
      setBroadened(result.broadened);
      setUsedFallbackDeck(result.fromFallbackDeck);
      if (result.pool.length === 0) {
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

  /** A suggestion chip fills the box and searches, in one click. */
  const handleTopic = (topic: string) => {
    setQuery(topic);
    void search(topic);
  };

  const handleKeysSaved = () => {
    const k = getStoredApiKeys();
    setHasKeys(Boolean(k.pexelsKey || k.pixabayKey));
    search(query);
  };

  // Same-origin paths (bundled nature library) skip the proxy entirely.
  const proxyUrl = (url: string) =>
    url.startsWith("/") ? url : `${EDGE_FUNCTION_BASE}/proxy-image?url=${encodeURIComponent(url)}`;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="min-h-full flex items-start justify-center p-0 sm:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
      <div
        className="bg-gray-900 border border-hairline rounded-t-2xl sm:rounded-2xl w-full max-w-4xl sm:my-4 overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-hairline flex items-center justify-between gap-4">
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
              className="flex-1 px-4 py-2 bg-gray-800 border border-hairline rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
            className="px-2.5 py-1.5 rounded-lg border border-hairline bg-gray-800 hover:bg-gray-750 text-xs text-gray-300 hover:text-white flex items-center gap-1.5 flex-shrink-0"
            title="Configure personal Pexels & Pixabay API keys"
          >
            <Icon glyph="🔑" />
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

        {/* Suggested subjects — three per open, never the same three twice
            in a row, so the modal is useful before a single word is typed. */}
        {topics.length > 0 && (
          <div className="px-4 py-2 border-b border-hairline flex flex-wrap items-center gap-2 bg-gray-900/20">
            <span className="text-[11px] text-gray-500 flex-shrink-0">Try:</span>
            {topics.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => handleTopic(topic)}
                disabled={loading}
                className="px-2.5 py-1 rounded-full text-[11px] border border-hairline bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white capitalize transition-colors disabled:opacity-50"
              >
                {topic}
              </button>
            ))}
          </div>
        )}

        {/* Source badge & Keys notice */}
        <div className="px-4 py-2 border-b border-hairline flex flex-wrap items-center justify-between gap-2 bg-gray-900/40">
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
            <span>{iconify(hasKeys ? "✓ Using Customer API Key" : "⚡ Want higher resolution photos?")}</span>
            <span className="text-indigo-400 underline">{hasKeys ? "Edit Keys" : "Insert Pexels/Pixabay Key"}</span>
          </button>
        </div>

        {/* Results */}
        <div className="p-4">
          {/* Said plainly, because the grid would otherwise look wrong: these
              photos answer a wider query than the one that was typed. */}
          {!loading && images.length > 0 && (broadened || usedFallbackDeck) && (
            <p className="mb-3 text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-900/50 rounded-lg px-3 py-2">
              {usedFallbackDeck
                ? "Nothing online matched that — showing the built-in nature library instead."
                : `No exact matches, so the search was widened to “${effectiveQuery}”.`}
            </p>
          )}
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
              <div className="text-4xl mb-3"><Icon glyph="🔍" /></div>
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
                  <Icon glyph="🔑" /> Insert Pexels / Pixabay Key
                </button>
              </div>
              <form onSubmit={handleSubmit} className="w-full flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Try another search..."
                  className="flex-1 px-4 py-2 bg-gray-800 border border-hairline rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  onClick={() => onSelect(proxyUrl(img.url), effectiveQuery)}
                  className="group relative aspect-video rounded-lg overflow-hidden border border-transparent hover:border-indigo-500 transition-all bg-gray-800"
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
        <div className="p-3 border-t border-hairline flex items-center justify-between">
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
      </div>

      <ApiKeysModal
        isOpen={keysModalOpen}
        onClose={() => setKeysModalOpen(false)}
        onSaved={handleKeysSaved}
      />
    </div>
  );
}
