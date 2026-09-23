import { useState, useEffect } from "react";
import { TimelineInsert, CustomerLogoConfig, AspectRatioType } from "../types";
import { CATALOG_ITEMS, CatalogItem, STUDIO_CATEGORIES, StudioCategoryDef } from "../lib/video-studio-catalog";
import {
  toggleSoundPreview,
  stopAllSoundPreviews,
  setSoundPreviewVolume,
  subscribeToAudioPreview,
} from "../data/media-library";
import CustomerLogoSection from "./CustomerLogoSection";
import EffectVisualPreview from "./EffectVisualPreview";
import FiltersStudio from "./FiltersStudio";
import SectionStudio from "./SectionStudio";
import type { VideoFilterConfig } from "../data/video-filters";
import type { SectionConfig } from "../data/intro-outro";

interface VideoStudioProps {
  currentPlayheadTime: number;
  totalDuration?: number;
  onInsertItem: (insert: TimelineInsert) => void;
  onConfigureItem?: (insert: TimelineInsert) => void;
  customerLogo: CustomerLogoConfig;
  onUpdateCustomerLogo: (updates: Partial<CustomerLogoConfig>) => void;
  aspectRatio?: AspectRatioType;
  sampleBackgroundImage?: string;
  /** the single look applied to the entire video */
  videoFilter?: VideoFilterConfig | null;
  onUpdateVideoFilter?: (config: VideoFilterConfig | null) => void;
  /** the intro & outro sections built in this studio */
  introSection?: SectionConfig | null;
  outroSection?: SectionConfig | null;
  onUpdateIntroSection?: (cfg: SectionConfig | null) => void;
  onUpdateOutroSection?: (cfg: SectionConfig | null) => void;
}

export default function VideoStudio({
  currentPlayheadTime,
  totalDuration = 60,
  onInsertItem,
  onConfigureItem,
  customerLogo,
  onUpdateCustomerLogo,
  aspectRatio,
  sampleBackgroundImage,
  videoFilter = null,
  onUpdateVideoFilter,
  introSection = null,
  outroSection = null,
  onUpdateIntroSection,
  onUpdateOutroSection,
}: VideoStudioProps) {
  // Default to the first of the tabs: "logo"
  const [selectedCategory, setSelectedCategory] = useState<string>("logo");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentlyPlayingAudio, setCurrentlyPlayingAudio] = useState<string | null>(null);
  const [studioVolume, setStudioVolume] = useState<number>(0.8);
  const [itemVolumes, setItemVolumes] = useState<Record<string, number>>({});

  useEffect(() => {
    const unsubscribe = subscribeToAudioPreview((url, isPlaying) => {
      setCurrentlyPlayingAudio(isPlaying ? url : null);
    });
    return () => {
      unsubscribe();
      stopAllSoundPreviews();
    };
  }, []);

  const formattedTime = (() => {
    const mins = Math.floor(currentPlayheadTime / 60);
    const secs = Math.floor(currentPlayheadTime % 60);
    const ms = Math.floor((currentPlayheadTime % 1) * 10);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms}`;
  })();

  const createTimelineInsert = (item: CatalogItem): TimelineInsert => {
    // Intros are inserted before script (0.0s), Outros after script (end of timeline)
    let startTime = currentPlayheadTime;
    if (item.category === "intro") {
      startTime = 0.0;
    } else if (item.category === "outro") {
      startTime = Math.max(0, (totalDuration || 60) - item.defaultDuration);
    }

    // Audio visualisers run across the whole video by default: they start at 0
    // and stretch to the end of the timeline instead of a fixed 6-8s window.
    const spansWholeVideo = Boolean(item.spansFullVideo);
    if (spansWholeVideo) {
      startTime = 0;
    }

    const defaultContent = item.defaultContent ? { ...item.defaultContent } : {};
    const logoUrlToUse = defaultContent.logoUrl || (customerLogo?.enabled && customerLogo.url ? customerLogo.url : "/scenering-logo.png");
    const itemVol = itemVolumes[item.type] ?? item.defaultAudioSettings?.volume ?? studioVolume;
    const soundUrl = item.defaultAudioSettings?.soundUrl || (defaultContent as any)?.soundUrl;

    return {
      id: `${item.type}-${Date.now()}`,
      category: item.category,
      type: item.type,
      title: item.name,
      startTime,
      duration: spansWholeVideo
        ? Math.max(1, totalDuration || 60)
        : item.defaultDuration,
      videoUrl: item.videoUrl || defaultContent.videoUrl,
      position: { x: 0.5, y: 0.5 },
      presetPosition: item.defaultPosition || "center",
      size: item.defaultSize || 1.0,
      opacity: 1.0,
      intensity: 1.0,
      audioSource: item.defaultAudioSource || "voice",
      content: {
        ...defaultContent,
        videoUrl: item.videoUrl || defaultContent.videoUrl,
        showLogo: defaultContent.showLogo ?? true,
        includeLogo: defaultContent.includeLogo ?? true,
        logoUrl: logoUrlToUse,
        tensionStyle: defaultContent.tensionStyle || "flare",
        soundUrl: soundUrl || defaultContent.soundUrl,
        soundVolume: itemVol,
      },
      visualOptions: item.defaultVisualOptions
        ? { ...item.defaultVisualOptions, spanFullVideo: spansWholeVideo || undefined }
        : spansWholeVideo
        ? { spanFullVideo: true }
        : undefined,
      audioSettings: item.defaultAudioSettings
        ? {
            ...item.defaultAudioSettings,
            volume: itemVol,
            soundUrl: soundUrl || item.defaultAudioSettings.soundUrl,
            // Normalize legacy loopAudio alias so the loop control + players read one field
            loop:
              item.defaultAudioSettings.loop !== undefined
                ? item.defaultAudioSettings.loop
                : Boolean((item.defaultAudioSettings as { loopAudio?: boolean }).loopAudio),
          }
        : { volume: itemVol, soundUrl },
    };
  };

  const handleAdd = (item: CatalogItem) => {
    const newInsert = createTimelineInsert(item);
    onInsertItem(newInsert);
  };

  const handleConfigure = (item: CatalogItem) => {
    const newInsert = createTimelineInsert(item);
    onInsertItem(newInsert);
    if (onConfigureItem) {
      onConfigureItem(newInsert);
    }
  };

  const handleTestSound = (soundUrl: string, itemVolume?: number) => {
    const vol = itemVolume ?? studioVolume;
    const isPlaying = toggleSoundPreview(soundUrl, vol, (active) => {
      setCurrentlyPlayingAudio(active ? soundUrl : null);
    });
    setCurrentlyPlayingAudio(isPlaying ? soundUrl : null);
  };

  const currentCategoryDef: StudioCategoryDef | undefined = STUDIO_CATEGORIES.find(
    (c) => c.id === selectedCategory
  );

  /** Tabs with their own bespoke editor instead of the generic catalog grid */
  const CUSTOM_TABS = ["logo", "filters", "intro", "outro"];
  const isCustomTab = CUSTOM_TABS.includes(selectedCategory);

  // Filter catalog items
  const itemsForCategory = CATALOG_ITEMS[selectedCategory] || [];
  const filteredItems = itemsForCategory.filter((item) => {
    const matchesSubcategory =
      selectedSubcategory === "all" || item.subCategory === selectedSubcategory;
    const matchesQuery =
      searchQuery === "" ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSubcategory && matchesQuery;
  });

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
      {/* Studio Header Bar */}
      <div className="px-5 py-3.5 bg-gray-900/90 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>🎬</span>
            <span>Video Studio</span>
            <span className="text-xs font-normal text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-800/60">
              Creative Effects & Branding
            </span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Add overlays, callouts, and audio waves at playhead timestamp{" "}
            <span className="font-mono text-amber-300 bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-800/40">
              {formattedTime}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Studio Audio Master Volume Control */}
          <div className="flex items-center gap-2 bg-gray-850 border border-gray-750 px-3 py-1.5 rounded-xl">
            <span className="text-xs text-gray-300 flex items-center gap-1.5 flex-shrink-0">
              <span>🔊</span>
              <span className="hidden sm:inline text-[11px] font-medium text-gray-300">Audio Vol:</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={studioVolume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setStudioVolume(v);
                setSoundPreviewVolume(v);
              }}
              className="w-20 sm:w-28 accent-indigo-500 cursor-pointer"
              title="Adjust Studio sound test volume"
            />
            <span className="font-mono text-xs text-indigo-400 font-bold w-8 text-right">
              {Math.round(studioVolume * 100)}%
            </span>
            {currentlyPlayingAudio && (
              <button
                type="button"
                onClick={() => {
                  stopAllSoundPreviews();
                  setCurrentlyPlayingAudio(null);
                }}
                className="ml-1 px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold animate-pulse flex items-center gap-1"
                title="Stop all playing audio previews"
              >
                <span>⏹️</span>
                <span>Off</span>
              </button>
            )}
          </div>

          {!isCustomTab && (
            <div className="relative w-48 sm:w-56">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search elements..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1.5 text-xs text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 5 Ordered Main Tabs: 1. Logo, 2. Call to action, 3. Stickers, 4. Text Content, 5. Audio visualisers */}
      <div className="t-studio-tabbar bg-gray-900/60 border-b border-gray-800 px-4 pt-2.5 flex gap-1.5 overflow-x-auto no-scrollbar">
        {STUDIO_CATEGORIES.map((cat, idx) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setSelectedCategory(cat.id);
                setSelectedSubcategory("all");
              }}
              className={`t-stab px-4 py-2.5 rounded-t-lg font-semibold text-sm whitespace-nowrap transition-all flex items-center gap-2 border-t border-x ${
                isSelected
                  ? "t-stab-active bg-gray-950 text-white border-gray-700 border-b-2 border-b-transparent shadow-sm"
                  : "bg-gray-900/30 text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/40"
              }`}
            >
              <span className="t-ico text-base">{cat.icon}</span>
              <span>
                {idx + 1}. {cat.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Subcategory Filter Pills (if category has subcategories) */}
      {!isCustomTab && currentCategoryDef?.subcategories && (
        <div className="t-studio-subbar bg-gray-950/70 px-5 py-2 border-b border-gray-800/80 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] text-gray-400 font-medium mr-1">Section:</span>
          {currentCategoryDef.subcategories.map((sub) => {
            const isSubSelected = selectedSubcategory === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => setSelectedSubcategory(sub.id)}
                className={`t-spill px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  isSubSelected
                    ? "t-spill-active bg-indigo-600 text-white shadow-md"
                    : "bg-gray-800/70 text-gray-300 hover:bg-gray-700/80 hover:text-white"
                }`}
              >
                <span className="t-ico">{sub.icon}</span>
                <span>{sub.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Studio Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* 1. LOGO SECTION */}
        {selectedCategory === "logo" && (
          <div className="max-w-3xl 2xl:max-w-5xl mx-auto space-y-3 sm:space-y-4">
            <CustomerLogoSection
              config={customerLogo}
              onChange={onUpdateCustomerLogo}
              aspectRatio={aspectRatio}
              sampleBackgroundImage={sampleBackgroundImage}
            />
          </div>
        )}

        {/* INTRO & OUTRO: build the opening / closing moment (background + text + logo + sound) */}
        {(selectedCategory === "intro" || selectedCategory === "outro") && (
          <SectionStudio
            kind={selectedCategory === "intro" ? "intro" : "outro"}
            config={selectedCategory === "intro" ? introSection : outroSection}
            onChange={(cfg) =>
              selectedCategory === "intro" ? onUpdateIntroSection?.(cfg) : onUpdateOutroSection?.(cfg)
            }
            aspectRatio={aspectRatio}
            brandLogoUrl={customerLogo?.enabled && customerLogo.url ? customerLogo.url : undefined}
          />
        )}

        {/* FILTERS: the one and only place video looks are applied (whole video) */}
        {selectedCategory === "filters" && (
          <FiltersStudio
            value={videoFilter}
            onChange={(cfg) => onUpdateVideoFilter?.(cfg)}
            sampleImage={sampleBackgroundImage}
          />
        )}

        {/* 2 - 10: CALL TO ACTION, INTRO, OUTRO, STICKERS, TEXT CONTENT, AUDIO VISUALISERS, ETC */}
        {!isCustomTab && (
          <div className="space-y-4">
            {/* Contextual Guidance Banner for Background Music */}
            {selectedCategory === "background_music" && (
              <div className="bg-gradient-to-r from-indigo-950/90 via-gray-900 to-purple-950/90 border border-indigo-500/50 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <span className="text-2xl p-2 bg-indigo-500/20 border border-indigo-500/40 rounded-lg text-indigo-300">
                    🎵
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-indigo-200">Calming Royalty-Free Background Music</h3>
                      <span className="text-[10px] bg-indigo-950 border border-indigo-600/50 text-indigo-300 px-2 py-0.5 rounded-full font-mono font-semibold">
                        10 Master Tracks • No Singing
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 mt-0.5">
                      Test any track using the Test / Off buttons and adjust per-track volume sliders. All tracks are pre-cleared for YouTube and commercial distribution with automatic credits.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Contextual Guidance Banner for Sound Effects */}
            {selectedCategory === "sound_effects" && (
              <div className="bg-gradient-to-r from-cyan-950/90 via-gray-900 to-cyan-950/90 border border-cyan-500/50 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <span className="text-2xl p-2 bg-cyan-500/20 border border-cyan-500/40 rounded-lg text-cyan-300">
                    🔊
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-cyan-200">Studio Sound Effects & Foley</h3>
                      <span className="text-[10px] bg-cyan-950 border border-cyan-600/50 text-cyan-300 px-2 py-0.5 rounded-full font-mono font-semibold">
                        Bells • Impacts • UI Chimes
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 mt-0.5">
                      Instant audio testing with volume controls. Place sound effects at your exact playhead position on the timeline to punctuate scene moments.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {filteredItems.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <span className="text-3xl block mb-2">🔍</span>
                <p className="text-sm">No items found for &quot;{searchQuery}&quot;</p>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-2 text-xs text-indigo-400 hover:underline"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredItems.map((item) => {
                  const soundUrl = item.defaultAudioSettings?.soundUrl || (item.defaultContent as any)?.soundUrl;
                  const hasSound = Boolean(soundUrl);
                  const itemVol = itemVolumes[item.type] ?? item.defaultAudioSettings?.volume ?? studioVolume;
                  const isPlaying = Boolean(soundUrl) && currentlyPlayingAudio === soundUrl;

                  return (
                    <div
                      key={item.type}
                      className="group bg-gray-900/70 hover:bg-gray-900 border border-gray-800 hover:border-indigo-500/50 rounded-xl p-4 transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-indigo-950/20"
                    >
                      <div>
                        {/* Visual representation of the effect they will see in the video
                            (audio items intentionally render no preview graphic) */}
                        {item.category !== "background_music" && item.category !== "sound_effects" && (
                          <div className="mb-3">
                            <EffectVisualPreview item={item} />
                          </div>
                        )}

                        {/* Timing and Audio Tags */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] text-indigo-400 font-medium tracking-wide uppercase">
                            {item.subCategory ? item.subCategory.replace("_", " ") : item.category.replace("_", " ")}
                          </span>

                          <div className="flex items-center gap-1.5">
                            {hasSound && soundUrl && (
                              <button
                                type="button"
                                onClick={() => handleTestSound(soundUrl, itemVol)}
                                title={
                                  isPlaying
                                    ? "Turn sound off"
                                    : "Listen to preview sound"
                                }
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-all shadow-sm ${
                                  isPlaying
                                    ? "bg-rose-600 hover:bg-rose-500 border-rose-400 text-white ring-2 ring-rose-400/60 animate-pulse"
                                    : "bg-gray-800 hover:bg-indigo-950 border-gray-700 hover:border-indigo-500 text-emerald-400 hover:text-emerald-300"
                                }`}
                              >
                                <span>{isPlaying ? "⏹️" : "▶️"}</span>
                                <span>
                                  {isPlaying ? "Off" : "Test"}
                                </span>
                              </button>
                            )}
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                item.spansFullVideo
                                  ? "text-emerald-300 bg-emerald-950/60 border border-emerald-800/60"
                                  : "text-gray-400 bg-gray-800/80"
                              }`}
                              title={
                                item.spansFullVideo
                                  ? "Runs for the entire video"
                                  : `Default length ${item.defaultDuration}s`
                              }
                            >
                              {item.spansFullVideo ? "Full video" : `${item.defaultDuration}s`}
                            </span>
                          </div>
                        </div>

                        {/* Sound Volume Slider for items with audio */}
                        {hasSound && soundUrl && (
                          <div className="mb-2 px-2.5 py-1.5 bg-gray-950/90 rounded-lg border border-gray-800 flex items-center justify-between gap-2 shadow-inner">
                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                              <span>🔉</span>
                              <span className="text-[10px] font-medium text-gray-300">Volume:</span>
                            </span>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={itemVol}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  setItemVolumes((prev) => ({ ...prev, [item.type]: v }));
                                  if (isPlaying) {
                                    setSoundPreviewVolume(v);
                                  }
                                }}
                                className="w-20 accent-indigo-500 cursor-pointer"
                                title="Adjust sound volume"
                              />
                              <span className="font-mono text-[10px] text-indigo-400 font-bold w-7 text-right">
                                {Math.round(itemVol * 100)}%
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Title & Description */}
                        <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
                          {item.name}
                        </h4>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-4 pt-3 border-t border-gray-800 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAdd(item)}
                          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm ${
                            item.category === "intro"
                              ? "bg-amber-600 hover:bg-amber-500 text-white"
                              : item.category === "outro"
                              ? "bg-rose-600 hover:bg-rose-500 text-white"
                              : "t-card-cta bg-indigo-600 hover:bg-indigo-500 text-white"
                          }`}
                        >
                          <span>
                            {item.category === "intro"
                              ? "➕ Insert Before Script"
                              : item.category === "outro"
                              ? "➕ Insert After Script"
                              : "➕ Add"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfigure(item)}
                          className="t-card-cta-ghost px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 rounded-lg text-xs transition-colors"
                          title="Customise before placing"
                        >
                          ⚙️ Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
