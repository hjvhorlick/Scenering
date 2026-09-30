import { useEffect, useState } from "react";
import type { CustomerLogoConfig, TimelineInsert } from "../types";
import {
  CATALOG_ITEMS,
  type CatalogItem,
} from "../lib/video-studio-catalog";
import { createCatalogInsert } from "../lib/catalog-insert";
import {
  setSoundPreviewVolume,
  stopAllSoundPreviews,
  subscribeToAudioPreview,
  toggleSoundPreview,
} from "../data/media-library";
import Icon, { iconify } from "./icons/Icon";

const COLLAPSED_ROW_SIZE = 4;

interface LibraryActions {
  totalDuration: number;
  customerLogo: CustomerLogoConfig;
  inserts: TimelineInsert[];
  onInsertItem: (insert: TimelineInsert) => void;
  onConfigureItem?: (insert: TimelineInsert) => void;
}

function rowVisibility(index: number, expanded: boolean): string {
  if (expanded || index === 0) return "flex";
  if (index === 1) return "hidden sm:flex";
  if (index === 2) return "hidden lg:flex";
  if (index === 3) return "hidden xl:flex";
  return "hidden";
}

function LibraryToggle({
  expanded,
  total,
  onToggle,
}: {
  expanded: boolean;
  total: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="px-3.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-hairline text-xs font-semibold text-gray-200 hover:text-white transition-colors flex items-center gap-2"
    >
      <Icon glyph={expanded ? "▲" : "▾"} />
      {expanded ? "Hide" : `Show all ${total}`}
    </button>
  );
}

function makeFullVideoInsert(
  item: CatalogItem,
  actions: LibraryActions,
  volume?: number
): TimelineInsert {
  return createCatalogInsert(item, {
    totalDuration: actions.totalDuration,
    customerLogo: actions.customerLogo,
    volume,
    forceFullVideo: true,
  });
}

/** Full-video background tracks for the Voiceover step. */
export function BackgroundMusicLibrary({
  totalDuration,
  customerLogo,
  inserts,
  onInsertItem,
  onConfigureItem,
}: LibraryActions) {
  const actions: LibraryActions = {
    totalDuration,
    customerLogo,
    inserts,
    onInsertItem,
    onConfigureItem,
  };
  const items = CATALOG_ITEMS.background_music || [];
  const [expanded, setExpanded] = useState(false);
  const [currentlyPlayingAudio, setCurrentlyPlayingAudio] = useState<string | null>(null);
  const [itemVolumes, setItemVolumes] = useState<Record<string, number>>({});
  const shownItems = expanded ? items : items.slice(0, COLLAPSED_ROW_SIZE);

  let selectedMusic: TimelineInsert | undefined;
  for (let index = inserts.length - 1; index >= 0; index -= 1) {
    if (inserts[index].category === "background_music") {
      selectedMusic = inserts[index];
      break;
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeToAudioPreview((url, isPlaying) => {
      setCurrentlyPlayingAudio(isPlaying ? url : null);
    });
    return () => {
      unsubscribe();
      stopAllSoundPreviews();
    };
  }, []);

  const toggleExpanded = () => setExpanded((current) => !current);

  const makeInsert = (item: CatalogItem) =>
    makeFullVideoInsert(item, actions, itemVolumes[item.type] ?? item.defaultAudioSettings?.volume ?? 0.5);

  const choose = (item: CatalogItem, configure = false) => {
    stopAllSoundPreviews();
    if (configure && selectedMusic?.type === item.type) {
      onConfigureItem?.(selectedMusic);
      return;
    }
    const insert = makeInsert(item);
    onInsertItem(insert);
    if (configure) onConfigureItem?.(insert);
  };

  return (
    <section
      className="p-5 rounded-2xl bg-gray-900/80 border border-hairline"
      aria-labelledby="background-music-library-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 id="background-music-library-heading" className="text-sm font-semibold text-gray-100 flex items-center gap-2">
            <Icon glyph="🎵" /> Background Music
            <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950/70 border border-indigo-800/60 px-2 py-0.5 rounded-full">
              {items.length} tracks
            </span>
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Test a royalty-free instrumental, set its volume, then use one track across the complete video.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {currentlyPlayingAudio && (
            <button
              type="button"
              onClick={stopAllSoundPreviews}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold animate-pulse"
            >
              <Icon glyph="⏹" /> Stop preview
            </button>
          )}
          <LibraryToggle
            expanded={expanded}
            total={items.length}
            onToggle={toggleExpanded}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {shownItems.map((item, index) => {
          const soundUrl = item.defaultAudioSettings?.soundUrl || item.defaultContent?.soundUrl;
          const volume = itemVolumes[item.type] ?? item.defaultAudioSettings?.volume ?? 0.5;
          const playing = Boolean(soundUrl && currentlyPlayingAudio === soundUrl);
          const selected = selectedMusic?.type === item.type;

          return (
            <article
              key={item.type}
              className={`${rowVisibility(index, expanded)} group bg-gray-950/75 border border-hairline hover:border-indigo-500/50 rounded-xl p-3 flex-col shadow-sm transition-colors`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] text-indigo-300 font-semibold tracking-wide uppercase">
                  {(item.subCategory || "instrumental").replace("_", " ")}
                </span>
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded">
                  Full video
                </span>
              </div>
              <h4 className="text-sm font-semibold text-white group-hover:text-indigo-200 transition-colors">
                {item.name}
              </h4>
              <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed min-h-[2.5rem]">
                {item.description}
              </p>

              <div className="mt-3 px-2.5 py-2 bg-gray-900 rounded-lg border border-hairline space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={!soundUrl}
                    onClick={() => {
                      if (!soundUrl) return;
                      const active = toggleSoundPreview(soundUrl, volume);
                      setCurrentlyPlayingAudio(active ? soundUrl : null);
                    }}
                    className={`px-2.5 py-1 rounded-md border text-[11px] font-bold transition-colors ${
                      playing
                        ? "bg-rose-600 border-rose-400 text-white animate-pulse"
                        : "bg-gray-800 hover:bg-indigo-950 border-hairline text-emerald-300"
                    }`}
                  >
                    {iconify(playing ? "⏹ Off" : "▶ Test")}
                  </button>
                  <span className="font-mono text-[10px] font-bold text-indigo-300">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
                <label className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span><Icon glyph="🔉" /> Volume</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(event) => {
                      const nextVolume = Number(event.target.value);
                      setItemVolumes((current) => ({ ...current, [item.type]: nextVolume }));
                      if (playing) setSoundPreviewVolume(nextVolume);
                    }}
                    className="min-w-0 flex-1 accent-indigo-500 cursor-pointer"
                    aria-label={`${item.name} preview volume`}
                  />
                </label>
              </div>

              <div className="mt-3 pt-3 border-t border-hairline flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => choose(item)}
                  disabled={selected}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    selected
                      ? "bg-emerald-950 border border-emerald-700 text-emerald-300 cursor-default"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white"
                  }`}
                >
                  {selected ? "Selected for video" : selectedMusic ? "Replace music" : "Use for full video"}
                </button>
                <button
                  type="button"
                  onClick={() => choose(item, true)}
                  className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-hairline text-gray-200 text-xs transition-colors"
                  title="Use and customise this track"
                >
                  <Icon glyph="⚙" /> Edit
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
