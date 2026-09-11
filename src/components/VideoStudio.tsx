import { useState } from "react";
import { TimelineInsert, CustomerLogoConfig } from "../types";
import { CATALOG_ITEMS, CatalogItem, STUDIO_CATEGORIES, StudioCategoryDef } from "../lib/video-studio-catalog";
import { playSoundPreview } from "../data/media-library";
import CustomerLogoSection from "./CustomerLogoSection";

interface VideoStudioProps {
  currentPlayheadTime: number;
  onInsertItem: (insert: TimelineInsert) => void;
  onConfigureItem?: (insert: TimelineInsert) => void;
  customerLogo: CustomerLogoConfig;
  onUpdateCustomerLogo: (updates: Partial<CustomerLogoConfig>) => void;
}

export default function VideoStudio({
  currentPlayheadTime,
  onInsertItem,
  onConfigureItem,
  customerLogo,
  onUpdateCustomerLogo,
}: VideoStudioProps) {
  // Default to the first of the 5 requested tabs: "logo"
  const [selectedCategory, setSelectedCategory] = useState<string>("logo");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentlyPlayingAudio, setCurrentlyPlayingAudio] = useState<string | null>(null);

  const formattedTime = (() => {
    const mins = Math.floor(currentPlayheadTime / 60);
    const secs = Math.floor(currentPlayheadTime % 60);
    const ms = Math.floor((currentPlayheadTime % 1) * 10);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms}`;
  })();

  const createTimelineInsert = (item: CatalogItem): TimelineInsert => {
    return {
      id: `${item.type}-${Date.now()}`,
      category: item.category,
      type: item.type,
      title: item.name,
      startTime: currentPlayheadTime,
      duration: item.defaultDuration,
      position: { x: 0.5, y: 0.5 },
      presetPosition: item.defaultPosition || "center",
      size: item.defaultSize || 1.0,
      opacity: 1.0,
      intensity: 1.0,
      audioSource: item.defaultAudioSource || "voice",
      content: item.defaultContent ? { ...item.defaultContent } : undefined,
      visualOptions: item.defaultVisualOptions ? { ...item.defaultVisualOptions } : undefined,
      audioSettings: item.defaultAudioSettings ? { ...item.defaultAudioSettings } : undefined,
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

  const handleTestSound = (soundUrl: string) => {
    if (currentlyPlayingAudio === soundUrl) {
      setCurrentlyPlayingAudio(null);
      return;
    }
    setCurrentlyPlayingAudio(soundUrl);
    playSoundPreview(soundUrl);
    setTimeout(() => {
      setCurrentlyPlayingAudio(null);
    }, 2500);
  };

  const currentCategoryDef: StudioCategoryDef | undefined = STUDIO_CATEGORIES.find(
    (c) => c.id === selectedCategory
  );

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

        {selectedCategory !== "logo" && (
          <div className="relative w-56">
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

      {/* 5 Ordered Main Tabs: 1. Logo, 2. Call to action, 3. Stickers, 4. Text Content, 5. Audio visualisers */}
      <div className="bg-gray-900/60 border-b border-gray-800 px-4 pt-2.5 flex gap-1.5 overflow-x-auto no-scrollbar">
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
              className={`px-3.5 py-2 rounded-t-lg font-medium text-xs whitespace-nowrap transition-all flex items-center gap-2 border-t border-x ${
                isSelected
                  ? "bg-gray-950 text-white border-gray-700 border-b-2 border-b-transparent shadow-sm"
                  : "bg-gray-900/30 text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/40"
              }`}
            >
              <span className="text-sm">{cat.icon}</span>
              <span>
                {idx + 1}. {cat.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Subcategory Filter Pills (if category has subcategories) */}
      {selectedCategory !== "logo" && currentCategoryDef?.subcategories && (
        <div className="bg-gray-950/70 px-5 py-2 border-b border-gray-800/80 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] text-gray-400 font-medium mr-1">Section:</span>
          {currentCategoryDef.subcategories.map((sub) => {
            const isSubSelected = selectedSubcategory === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => setSelectedSubcategory(sub.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  isSubSelected
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-gray-800/70 text-gray-300 hover:bg-gray-700/80 hover:text-white"
                }`}
              >
                <span>{sub.icon}</span>
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
          <div className="max-w-3xl mx-auto space-y-4">
            <CustomerLogoSection
              config={customerLogo}
              onChange={onUpdateCustomerLogo}
            />
          </div>
        )}

        {/* 2 - 5: CALL TO ACTION, STICKERS, TEXT CONTENT, AUDIO VISUALISERS */}
        {selectedCategory !== "logo" && (
          <div>
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
                  const hasSound = Boolean(item.defaultAudioSettings?.soundUrl);

                  return (
                    <div
                      key={item.type}
                      className="group bg-gray-900/70 hover:bg-gray-900 border border-gray-800 hover:border-indigo-500/50 rounded-xl p-4 transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-indigo-950/20"
                    >
                      <div>
                        {/* Header: Icon & Category Tag */}
                        <div className="flex items-start justify-between mb-2.5">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-800 to-gray-850 flex items-center justify-center text-2xl border border-gray-700/60 shadow-inner group-hover:scale-105 transition-transform">
                            {item.icon}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {hasSound && (
                              <button
                                type="button"
                                onClick={() =>
                                  item.defaultAudioSettings?.soundUrl &&
                                  handleTestSound(item.defaultAudioSettings.soundUrl)
                                }
                                title="Listen to attached sound"
                                className={`px-2 py-0.5 rounded text-[11px] font-medium border flex items-center gap-1 transition-colors ${
                                  currentlyPlayingAudio === item.defaultAudioSettings?.soundUrl
                                    ? "bg-emerald-950 border-emerald-500 text-emerald-300 animate-pulse"
                                    : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                                }`}
                              >
                                <span>🔊</span>
                                <span>Sound</span>
                              </button>
                            )}
                            <span className="text-[10px] text-gray-400 font-mono bg-gray-800/80 px-1.5 py-0.5 rounded">
                              {item.defaultDuration}s
                            </span>
                          </div>
                        </div>

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
                          className="flex-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <span>➕ Add</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfigure(item)}
                          className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 rounded-lg text-xs transition-colors"
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
