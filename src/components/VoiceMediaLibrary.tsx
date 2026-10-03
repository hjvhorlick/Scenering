import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomerLogoConfig, InsertCategory, TimelineInsert } from "../types";
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
import {
  CUSTOM_MUSIC_PREFIX,
  CustomMusicError,
  addCustomMusic,
  formatTrackLength,
  getCustomMusicTracks,
  loadCustomMusic,
  removeCustomMusic,
  subscribeToCustomMusic,
  type CustomMusicTrack,
} from "../lib/custom-music";
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

/** One uploaded file, dressed as a catalogue card so it behaves like any other track. */
function customTrackToItem(track: CustomMusicTrack): CatalogItem {
  return {
    type: `bgm_custom_${track.id}`,
    category: "background_music" as InsertCategory,
    subCategory: "my music",
    name: track.name,
    icon: "🎵",
    description: `Your upload • ${formatTrackLength(track.duration)} • Saved in this browser`,
    defaultDuration: Math.max(1, Math.round(track.duration)),
    defaultPosition: "bottom" as const,
    defaultSize: 1.0,
    defaultAudioSettings: {
      soundUrl: `${CUSTOM_MUSIC_PREFIX}${track.id}`,
      soundName: track.name,
      volume: 0.5,
      loop: true,
    },
    defaultContent: {
      primaryText: track.name,
      secondaryText: "Uploaded by you — you are responsible for its licence",
      label: "My music",
    },
  };
}

/** The feel filters above the grid. Built from what is actually in the library. */
const MOOD_LABELS: Record<string, string> = {
  "my music": "My uploads",
  piano: "Soft piano",
  classical: "Classical",
  acoustic: "Acoustic",
  ambient: "Ambient",
  cinematic: "Cinematic",
  electronic: "Electronic",
  upbeat: "Upbeat",
};

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
  const catalogItems = CATALOG_ITEMS.background_music || [];
  const [expanded, setExpanded] = useState(false);
  const [currentlyPlayingAudio, setCurrentlyPlayingAudio] = useState<string | null>(null);
  const [itemVolumes, setItemVolumes] = useState<Record<string, number>>({});
  const [customTracks, setCustomTracks] = useState<CustomMusicTrack[]>(() => getCustomMusicTracks());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [mood, setMood] = useState<string>("all");
  const [query, setQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Uploads live in IndexedDB, so they are read back on every visit.
  useEffect(() => {
    let active = true;
    loadCustomMusic().then((loaded) => {
      if (active) setCustomTracks(loaded);
    });
    const unsubscribe = subscribeToCustomMusic((next) => {
      if (active) setCustomTracks(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const items = useMemo(
    () => [...customTracks.map(customTrackToItem), ...catalogItems],
    [customTracks, catalogItems]
  );

  const moods = useMemo(() => {
    const seen: string[] = [];
    for (const item of items) {
      const key = item.subCategory || "acoustic";
      if (!seen.includes(key)) seen.push(key);
    }
    return seen;
  }, [items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (mood !== "all" && (item.subCategory || "acoustic") !== mood) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        (item.description || "").toLowerCase().includes(needle)
      );
    });
  }, [items, mood, query]);

  // A filter is itself a request to see everything that matches it.
  const narrowed = mood !== "all" || query.trim().length > 0;
  const showAll = expanded || narrowed;
  const shownItems = showAll ? filtered : filtered.slice(0, COLLAPSED_ROW_SIZE);

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

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      let lastName = "";
      for (const file of Array.from(files)) {
        const track = await addCustomMusic(file);
        lastName = track.name;
      }
      setJustAdded(lastName);
      setMood("my music");
      window.setTimeout(() => setJustAdded(null), 6000);
    } catch (err: any) {
      setUploadError(
        err instanceof CustomMusicError ? err.message : err?.message || "That upload did not work."
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveCustom = async (track: CustomMusicTrack) => {
    stopAllSoundPreviews();
    await removeCustomMusic(track.id);
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
            Test a royalty-free instrumental, set its volume, then use one track across the complete video —
            or upload your own music.
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
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white border border-emerald-400/40 text-xs font-semibold transition-colors flex items-center gap-2"
          >
            <Icon glyph="➕" />
            {uploading ? "Adding…" : "Upload your music"}
          </button>
          {!narrowed && (
            <LibraryToggle
              expanded={expanded}
              total={filtered.length}
              onToggle={toggleExpanded}
            />
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus"
        multiple
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
        aria-label="Upload your own background music"
      />

      {uploadError && (
        <p
          role="alert"
          className="mb-3 px-3 py-2 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-200 text-xs"
        >
          {uploadError}
        </p>
      )}
      {justAdded && (
        <p className="mb-3 px-3 py-2 rounded-lg bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs">
          Added “{justAdded}”. It stays in this browser until you remove it — press
          “Use for full video” to put it under your narration.
        </p>
      )}

      {/* Thirty tracks is too many to scan, so the library filters by feel. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="opt-group flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setMood("all")}
            className={`opt-btn text-[11px] ${mood === "all" ? "opt-btn-on" : ""}`}
          >
            All {items.length}
          </button>
          {moods.map((key) => {
            const count = items.filter((i) => (i.subCategory || "acoustic") === key).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMood(key)}
                className={`opt-btn text-[11px] ${mood === key ? "opt-btn-on" : ""}`}
              >
                {MOOD_LABELS[key] || key.replace("_", " ")} {count}
              </button>
            );
          })}
        </div>
        <label className="ml-auto flex items-center gap-2 text-[11px] text-gray-400">
          <Icon glyph="🔍" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tracks"
            className="px-2.5 py-1.5 rounded-lg bg-gray-950 border border-hairline text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-indigo-500"
            aria-label="Search background music"
          />
        </label>
      </div>

      {filtered.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-gray-400 bg-gray-950/60 border border-hairline rounded-xl">
          No track matches that. Clear the filter, or upload your own music.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {shownItems.map((item, index) => {
          const soundUrl = item.defaultAudioSettings?.soundUrl || item.defaultContent?.soundUrl;
          const volume = itemVolumes[item.type] ?? item.defaultAudioSettings?.volume ?? 0.5;
          const playing = Boolean(soundUrl && currentlyPlayingAudio === soundUrl);
          const selected = selectedMusic?.type === item.type;
          const custom = customTracks.find((t) => `bgm_custom_${t.id}` === item.type);

          return (
            <article
              key={item.type}
              className={`${rowVisibility(index, showAll)} group bg-gray-950/75 border ${
                custom ? "border-emerald-700/60" : "border-hairline"
              } hover:border-indigo-500/50 rounded-xl p-3 flex-col shadow-sm transition-colors`}
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
                {custom && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCustom(custom)}
                    className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-rose-900 border border-hairline text-rose-300 text-xs transition-colors"
                    title={`Remove ${custom.name} from this browser`}
                    aria-label={`Remove ${custom.name}`}
                  >
                    <Icon glyph="🗑" />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
