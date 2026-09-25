/**
 * The inline research block that appears above a scene card.
 *
 * Twelve candidates at a time, laid out so they always fit the window they
 * are drawn in: three across on a phone, four on a small tablet, six on a
 * desktop. Twelve divides evenly by all three, so the grid never ends on a
 * ragged half-row with empty cells.
 */

import type { ImageCandidate } from "../lib/image-search";
import { proxyImageUrl } from "../lib/image-search";

interface ImageCandidateStripProps {
  candidates: ImageCandidate[];
  loading?: boolean;
  /** URL of the photo the scene is currently using, so it can be ticked. */
  currentUrl?: string;
  onSelect: (candidate: ImageCandidate) => void;
  onClose: () => void;
  /** Fetch another twelve. */
  onMore?: () => void;
}

export default function ImageCandidateStrip({
  candidates,
  loading = false,
  currentUrl,
  onSelect,
  onClose,
  onMore,
}: ImageCandidateStripProps) {
  return (
    <div className="bg-gray-900/95 border border-indigo-800/50 rounded-xl p-2.5 sm:p-3 shadow-lg">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-indigo-300 truncate">
            🖼️ Research results
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
              {loading ? "…" : "↻ New set"}
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

      {loading && candidates.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-gray-400 text-xs">
          Searching for photos…
        </div>
      ) : candidates.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-center px-4 text-gray-400 text-xs">
          No photos came back for this scene. Try adding a Pexels or Pixabay key,
          or use the Nature Fallback.
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
