/**
 * The inline research block that appears above a scene card.
 *
 * Twelve candidates at a time, laid out so they always fit the window they
 * are drawn in: three across on a phone, four on a small tablet, six on a
 * desktop. Twelve divides evenly by all three, so the grid never ends on a
 * ragged half-row with empty cells.
 */

import { useEffect, useState } from "react";
import type { ImageCandidate } from "../lib/image-search";
import { proxyImageUrl } from "../lib/image-search";
import Icon, { iconify } from "./icons/Icon";

interface ImageCandidateStripProps {
  candidates: ImageCandidate[];
  loading?: boolean;
  /** URL of the photo the scene is currently using, so it can be ticked. */
  currentUrl?: string;
  onSelect: (candidate: ImageCandidate) => void;
  onClose: () => void;
  /** Fetch another twelve. */
  onMore?: () => void;
  /** The query the photos on screen actually belong to. */
  query?: string;
  /** Run a search for criteria the user typed here. */
  onSearch?: (query: string) => void;
  /** The query the results belong to, when the search had to widen the ask. */
  answeredQuery?: string;
  /** The query the scene's own words produce, offered as a way back. */
  autoQuery?: string;
  /** True while the scene is pinned to a hand-typed query. */
  queryLocked?: boolean;
  /** Drop the hand-typed query and go back to the scene's own words. */
  onUseSceneWords?: () => void;
  /** The search found nothing for the exact words and widened them. */
  broadened?: boolean;
  /** Nothing came back at all, so the bundled deck answered. */
  fromFallbackDeck?: boolean;
}

export default function ImageCandidateStrip({
  candidates,
  loading = false,
  currentUrl,
  onSelect,
  onClose,
  onMore,
  query = "",
  onSearch,
  answeredQuery = "",
  autoQuery = "",
  queryLocked = false,
  onUseSceneWords,
  broadened = false,
  fromFallbackDeck = false,
}: ImageCandidateStripProps) {
  /**
   * What is in the box. It follows the active query when that changes
   * underneath (a Replace, or going back to the scene's words), but never
   * while the user is mid-sentence in it.
   */
  const [draft, setDraft] = useState(query);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(query);
  }, [query, focused]);

  const submit = () => {
    const wanted = draft.trim();
    if (!wanted || !onSearch) return;
    onSearch(wanted);
  };

  return (
    <div className="bg-gray-900/95 border border-indigo-800/50 rounded-xl p-2.5 sm:p-3 shadow-lg">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-indigo-300 truncate">
            <Icon glyph="🖼" /> Research results
          </span>
          <span className="text-[10px] text-gray-500 shrink-0">
            {loading ? "searching…" : `${candidates.length} photos · click to use`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onMore && (
            <button
              type="button"
              onClick={onMore}
              disabled={loading}
              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded-lg text-white text-[11px] font-medium transition-colors"
              title="Search again for a different set of photos"
            >
              {iconify(loading ? "…" : "↻ New set")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-hairline rounded-lg text-gray-300 text-[11px] transition-colors"
            title="Close research results"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Search your own criteria.
          The automatic query comes from the scene's script, which is right
          most of the time and wrong in exactly the cases where the writer
          already knows what they want to see. This is that escape hatch. */}
      {onSearch && (
        <div className="mb-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-[11px] pointer-events-none">
                <Icon glyph="🔍" />
              </span>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Search your own words — e.g. misty harbour at dawn"
                aria-label="Search for photos with your own criteria"
                className="w-full pl-7 pr-2 py-1.5 bg-gray-800/90 border border-hairline rounded-lg text-white text-[11px] placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={loading || draft.trim().length === 0}
              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-white text-[11px] font-semibold transition-colors shrink-0"
              title="Search for photos matching what you typed"
            >
              {loading ? "…" : "Search"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-tight">
            {query && (
              <span className="text-gray-500">
                Showing: <span className="text-gray-300 font-medium">{query}</span>
              </span>
            )}
            {queryLocked && onUseSceneWords && (
              <button
                type="button"
                onClick={onUseSceneWords}
                className="text-indigo-300 hover:text-indigo-200 underline decoration-dotted"
                title={autoQuery ? `Search the scene's own words instead: ${autoQuery}` : undefined}
              >
                use the scene&apos;s words instead
              </button>
            )}
            {broadened && (
              <span className="text-amber-300">
                nothing matched exactly, so the search was widened
                {answeredQuery && answeredQuery !== query ? ` to "${answeredQuery}"` : ""}
              </span>
            )}
            {fromFallbackDeck && (
              <span className="text-emerald-300">
                nothing came back online — these are the bundled photos
              </span>
            )}
          </div>
        </div>
      )}

      {loading && candidates.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-gray-400 text-xs">
          Searching for photos…
        </div>
      ) : candidates.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-center px-4 text-gray-400 text-xs">
          No photos came back for {query ? `"${query}"` : "this scene"}. Try different words
          above, add a Pexels or Pixabay key, or use the Nature Fallback.
        </div>
      ) : (
        <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-6 gap-1.5 sm:gap-2">
          {candidates.map((c, i) => {
            const isCurrent = Boolean(currentUrl && currentUrl === proxyImageUrl(c.url));
            return (
              <button
                key={`${c.url}-${i}`}
                type="button"
                onClick={() => onSelect(c)}
                className={`group relative aspect-video rounded-lg overflow-hidden bg-gray-800 border transition-all ${
                  isCurrent
                    ? "border-emerald-500 ring-1 ring-emerald-500"
                    : "border-transparent hover:border-indigo-500"
                }`}
                title={`Use this photo (${c.source})`}
              >
                <img
                  src={proxyImageUrl(c.thumbnail || c.url)}
                  alt={`Candidate ${i + 1}`}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
                {isCurrent && (
                  <span className="absolute top-0.5 left-0.5 text-[9px] bg-emerald-600 text-white px-1 rounded">
                    now
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
