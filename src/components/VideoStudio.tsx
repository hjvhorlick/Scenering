import { useState, useEffect } from "react";
import { TimelineInsert, CustomerLogoConfig, AspectRatioType } from "../types";
import {
  CATALOG_ITEMS,
  CatalogItem,
  VIDEO_STUDIO_CATEGORIES,
  StudioCategoryDef,
} from "../lib/video-studio-catalog";
import { createCatalogInsert } from "../lib/catalog-insert";
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
import Icon, { iconify } from "./icons/Icon";
import { getInterfacePlan, useSession } from "../lib/session";
import { isPlanCatalogItemIncluded, type PlanSlug } from "../config/plans";
import VipFeatureBadge, { openMembershipPlans } from "./VipFeatureBadge";

interface VideoStudioProps {
  currentPlayheadTime: number;
  totalDuration?: number;
  onInsertItem: (insert: TimelineInsert) => void;
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
  const { account } = useSession();
  const currentPlan = getInterfacePlan(account);
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

  const createTimelineInsert = (item: CatalogItem): TimelineInsert =>
    createCatalogInsert(item, {
      currentPlayheadTime,
      totalDuration,
      customerLogo,
      volume: itemVolumes[item.type] ?? item.defaultAudioSettings?.volume ?? studioVolume,
    });

  const handleAdd = (item: CatalogItem) => {
    const isVip = !isPlanCatalogItemIncluded(currentPlan, item.category, item.type);
    const newInsert = createTimelineInsert(item);
    onInsertItem(newInsert);
    // Let Free members test the real feature in an unmetered preview, then
    // immediately present the plans required to include it in a final download.
    if (isVip) openMembershipPlans();
  };

  const handleTestSound = (soundUrl: string, itemVolume?: number) => {
    const vol = itemVolume ?? studioVolume;
    const isPlaying = toggleSoundPreview(soundUrl, vol, (active) => {
      setCurrentlyPlayingAudio(active ? soundUrl : null);
    });
    setCurrentlyPlayingAudio(isPlaying ? soundUrl : null);
  };

  const currentCategoryDef: StudioCategoryDef | undefined = VIDEO_STUDIO_CATEGORIES.find(
    (c) => c.id === selectedCategory
  );

  /** Tabs with their own bespoke editor instead of the generic catalog grid */
  const CUSTOM_TABS = ["logo", "filters", "intro", "outro"];
  const isCustomTab = CUSTOM_TABS.includes(selectedCategory);

  /**
   * Bring the newly selected section to the top of the page.
   *
   * The studio's section tabs sit on a long scrolling page, so switching
   * section used to leave the viewport where it was and the new section
   * opened part-way down, below its own heading.
   */
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [selectedCategory]);

  const visibleSubcategories =
    selectedCategory === "audio_visualizers"
      ? [{ id: "advanced", name: "Advanced Engine", icon: "◎" }]
      : currentCategoryDef?.subcategories;

  // Filter catalog items. Video Studio shows the new production visualiser
  // engine only; the legacy catalogue remains available in Voiceover for old
  // projects and backwards-compatible styles.
  const itemsForCategory =
    selectedCategory === "audio_visualizers"
      ? (CATALOG_ITEMS.audio_visualizers || []).filter((item) => item.subCategory === "advanced")
      : CATALOG_ITEMS[selectedCategory] || [];
  const filteredItems = itemsForCategory.filter((item) => {
    const matchesSubcategory =
      selectedCategory === "audio_visualizers" || selectedSubcategory === "all" || item.subCategory === selectedSubcategory;
    const matchesQuery =
      searchQuery === "" ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSubcategory && matchesQuery;
  });

  return (
    <div className="flex flex-col bg-gray-950 text-white rounded-2xl border border-hairline overflow-hidden shadow-lg">
      {/* Studio Header Bar */}
      <div className="px-5 py-3.5 bg-gray-900/90 border-b border-hairline flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Icon glyph="🎬" />
            <span>Video Studio</span>
            <span className="text-xs font-normal text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-800/60">
              Creative Effects & Branding
            </span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Add overlays and callouts at playhead timestamp{" "}
            <span className="font-mono text-amber-300 bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-800/40">
              {formattedTime}
            </span>. Add visual overlays here; background music stays in Voiceover
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Studio Audio Master Volume Control */}
          <div className="flex items-center gap-2 bg-gray-850 border border-hairline px-3 py-1.5 rounded-xl">
            <span className="text-xs text-gray-300 flex items-center gap-1.5 flex-shrink-0">
              <Icon glyph="🔊" />
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
                <Icon glyph="⏹" />
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
                className="w-full bg-gray-800 border border-hairline rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
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

      {/* Video effects, including the Audio Visualiser section, live here; Background Music remains in Voiceover. */}
      <div className="t-studio-tabbar bg-gray-900/60 border-b border-hairline px-4 pt-2.5 flex gap-1.5 overflow-x-auto scrollbar-thin" role="tablist" aria-label="Video Studio sections">
        {VIDEO_STUDIO_CATEGORIES.map((cat, idx) => {
          const isSelected = selectedCategory === cat.id;
          const categoryVip = currentPlan === "free" && ["filters", "intro", "outro", "stickers", "content_cards", "text_templates", "lower_thirds", "sound_effects", "special_effects"].includes(cat.id);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setSelectedCategory(cat.id);
                setSelectedSubcategory(cat.id === "audio_visualizers" ? "advanced" : "all");
              }}
              className={`t-stab opt-btn px-4 py-2.5 rounded-t-lg font-semibold text-sm whitespace-nowrap transition-all flex items-center gap-2 ${cat.id === "intro" ? "opt-btn-amber" : cat.id === "outro" ? "opt-btn-rose" : ""} ${
                isSelected
                  ? "t-stab-active opt-btn-on bg-gray-950 text-white shadow-sm"
                  : "bg-gray-900/30 text-gray-400 hover:text-gray-200 hover:bg-gray-800/40"
              }`}
            >
              <span className="t-ico text-base"><Icon glyph={cat.icon} /></span>
              <span>
                {idx + 1}. {cat.name}
              </span>
              {categoryVip && <VipFeatureBadge compact />}
            </button>
          );
        })}
        <span className="opt-hint ml-auto shrink-0 hidden sm:inline-flex">
          <Icon glyph="👆" />
          <span>pick a section — all its options are listed below</span>
        </span>
      </div>

      {/* Subcategory Filter Pills (if category has subcategories) */}
      {!isCustomTab && visibleSubcategories && (
        <div className="t-studio-subbar bg-gray-950/70 px-5 py-2 border-b border-hairline flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] text-gray-400 font-medium mr-1">Section:</span>
          {visibleSubcategories.map((sub) => {
            const isSubSelected = selectedSubcategory === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => setSelectedSubcategory(sub.id)}
                className={`t-spill opt-btn ${isSubSelected ? "t-spill-active opt-btn-on bg-indigo-600 text-white shadow-md" : "bg-gray-800/70 text-gray-300 hover:bg-gray-700/80 hover:text-white"}`}
              >
                <Icon glyph={sub.icon} />
                <span>{sub.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Studio Body */}
      <div className="p-5">
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
            onChange={(cfg) => {
              selectedCategory === "intro" ? onUpdateIntroSection?.(cfg) : onUpdateOutroSection?.(cfg);
              if (currentPlan === "free") openMembershipPlans();
            }}
            aspectRatio={aspectRatio}
            brandLogoUrl={customerLogo?.enabled && customerLogo.url ? customerLogo.url : undefined}
          />
        )}

        {/* FILTERS: the one and only place video looks are applied (whole video) */}
        {selectedCategory === "filters" && (
          <FiltersStudio
            value={videoFilter}
            onChange={(cfg) => { onUpdateVideoFilter?.(cfg); if (currentPlan === "free") openMembershipPlans(); }}
            sampleImage={sampleBackgroundImage}
          />
        )}

        {/* 2 - 10: CALL TO ACTION, INTRO, OUTRO, STICKERS, TEXT CONTENT, AUDIO VISUALISERS, ETC */}
        {!isCustomTab && (
          <div className="space-y-4">
            {/* Contextual Guidance Banner for the new Audio Visualiser engine */}
            {selectedCategory === "audio_visualizers" && (
              <div className="bg-gradient-to-r from-teal-950/90 via-gray-900 to-amber-950/90 border border-teal-500/50 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <span className="text-2xl p-2 bg-teal-500/20 border border-teal-500/40 rounded-lg text-teal-200" aria-hidden="true"><Icon glyph="◎" /></span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-teal-100">Advanced Audio Visualiser Engine</h3>
                      <span className="text-[10px] bg-amber-950 border border-amber-600/50 text-amber-200 px-2 py-0.5 rounded-full font-mono font-semibold">
                        New · Bars · Waves · Rings · Particles
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 mt-0.5">
                      This tab is intentionally filtered to the new professional engine so it does not look like the old visualiser library. Add radial bars, 3D rings, circular waves, pulse rings, spectrum bars, mirrored bars, waveform scopes or particle rings, then click the block on the timeline and press Edit to tune mapping, attack/release, colour and glow.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Contextual Guidance Banner for Background Music */}
            {selectedCategory === "background_music" && (
              <div className="bg-gradient-to-r from-indigo-950/90 via-gray-900 to-purple-950/90 border border-indigo-500/50 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <span className="text-2xl p-2 bg-indigo-500/20 border border-indigo-500/40 rounded-lg text-indigo-300" aria-hidden="true"><Icon glyph="🎵" /></span>
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
                  <span className="text-2xl p-2 bg-cyan-500/20 border border-cyan-500/40 rounded-lg text-cyan-300" aria-hidden="true"><Icon glyph="🔊" /></span>
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
                <span className="text-3xl block mb-2"><Icon glyph="🔍" /></span>
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
                  const isVip = !isPlanCatalogItemIncluded(currentPlan, item.category, item.type);
                  // Music runs under the whole video from wherever it is
                  // added, so the card says so rather than quoting the
                  // track's own length as if it were a clip at the playhead.
                  const spansWholeVideo = item.spansFullVideo || item.category === "background_music";

                  return (
                    <div
                      key={item.type}
                      className="group bg-gray-900/70 hover:bg-gray-900 border border-hairline hover:border-indigo-500/50 rounded-xl p-4 transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-indigo-950/20"
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
                                    : "bg-gray-800 hover:bg-indigo-950 border-hairline hover:border-indigo-500 text-emerald-400 hover:text-emerald-300"
                                }`}
                              >
                                <span>{iconify(isPlaying ? "⏹️" : "▶️")}</span>
                                <span>
                                  {isPlaying ? "Off" : "Test"}
                                </span>
                              </button>
                            )}
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                spansWholeVideo
                                  ? "text-emerald-300 bg-emerald-950/60 border border-emerald-800/60"
                                  : "text-gray-400 bg-gray-800/80"
                              }`}
                              title={
                                spansWholeVideo
                                  ? "Runs for the entire video"
                                  : `Default length ${item.defaultDuration}s`
                              }
                            >
                              {spansWholeVideo ? "Full video" : `${item.defaultDuration}s`}
                            </span>
                          </div>
                        </div>

                        {/* Sound Volume Slider for items with audio */}
                        {hasSound && soundUrl && (
                          <div className="mb-2 px-2.5 py-1.5 bg-gray-950/90 rounded-lg border border-hairline flex items-center justify-between gap-2 shadow-inner">
                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                              <Icon glyph="🔉" />
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
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
                            {item.name}
                          </h4>
                          {isVip && <VipFeatureBadge />}
                        </div>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-4 pt-3 border-t border-hairline">
                        <button
                          type="button"
                          onClick={() => handleAdd(item)}
                          title={isVip ? "View SceneFlow and SceneForge options" : "Add to the timeline — then click it on the timeline to edit it"}
                          className={`w-full px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm ${
                            item.category === "intro"
                              ? "bg-amber-600 hover:bg-amber-500 text-white"
                              : item.category === "outro"
                              ? "bg-rose-600 hover:bg-rose-500 text-white"
                              : "t-card-cta bg-indigo-600 hover:bg-indigo-500 text-white"
                          }`}
                        >
                          <span>
                            {iconify(
                              item.category === "intro"
                                ? "➕ Insert Before Script"
                                : item.category === "outro"
                                ? "➕ Insert After Script"
                                : isVip
                                ? "✦ Preview · view plans"
                                : "➕ Add",
                            )}
                          </span>
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
