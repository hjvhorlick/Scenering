import { useMemo, useState } from "react";
import {
  CONTROL_META,
  FILTER_GROUPS,
  VIDEO_FILTERS,
  defaultSettingsFor,
  getPreset,
  resolveSettings,
  type FilterControlKey,
  type FilterGroupId,
  type VideoFilterConfig,
  type VideoFilterSettings,
} from "../data/video-filters";
import FilterPreviewCanvas from "./FilterPreviewCanvas";

interface FiltersStudioProps {
  /** the single filter running across the whole video (null = none) */
  value: VideoFilterConfig | null;
  onChange: (config: VideoFilterConfig | null) => void;
  /** a real frame from the project so previews show the user's own footage */
  sampleImage?: string;
}

export default function FiltersStudio({ value, onChange, sampleImage }: FiltersStudioProps) {
  const [group, setGroup] = useState<FilterGroupId | "all">("all");
  const [query, setQuery] = useState("");
  const [compare, setCompare] = useState(false);
  const [showSettings, setShowSettings] = useState(true);

  const activePreset = getPreset(value?.id);
  const activeSettings: VideoFilterSettings | null = activePreset
    ? resolveSettings(activePreset, value?.settings)
    : null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VIDEO_FILTERS.filter((f) => {
      const inGroup = group === "all" || f.group === group;
      const matches =
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.tagline.toLowerCase().includes(q) ||
        f.group.includes(q);
      return inGroup && matches;
    });
  }, [group, query]);

  const apply = (id: string) => {
    if (value?.id === id) {
      onChange(null); // clicking the active filter turns it off
      return;
    }
    const preset = getPreset(id);
    if (!preset) return;
    onChange({ id, settings: defaultSettingsFor(preset) });
  };

  const setSetting = (key: FilterControlKey, v: number) => {
    if (!value || !activePreset) return;
    onChange({
      id: value.id,
      settings: { ...resolveSettings(activePreset, value.settings), [key]: v },
    });
  };

  const resetSettings = () => {
    if (!value || !activePreset) return;
    onChange({ id: value.id, settings: defaultSettingsFor(activePreset) });
  };

  return (
    <div className="space-y-4">
      {/* ---------------- Banner ---------------- */}
      <div className="bg-gradient-to-r from-fuchsia-950/80 via-gray-900 to-amber-950/70 border border-fuchsia-500/40 rounded-xl p-3.5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <span className="text-2xl p-2 bg-fuchsia-500/20 border border-fuchsia-500/40 rounded-lg text-fuchsia-200">
            🎨
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-fuchsia-100">Video Look & Atmosphere Filters</h3>
              <span className="text-[10px] bg-fuchsia-950 border border-fuchsia-600/50 text-fuchsia-200 px-2 py-0.5 rounded-full font-mono font-semibold">
                Runs across the whole video
              </span>
              <span className="text-[10px] bg-gray-900 border border-hairline text-gray-300 px-2 py-0.5 rounded-full font-mono">
                {VIDEO_FILTERS.length} looks
              </span>
            </div>
            <p className="text-xs text-gray-300 mt-0.5 max-w-3xl">
              One click applies the look to <strong className="text-white">every scene</strong>, just like your
              background music. Each filter is a real colour grade plus animated atmosphere — dust, mist, sun flare,
              grain, light leaks — so still photos gain movement. Tune every look with the sliders below.
            </p>
          </div>
        </div>

        {value && activePreset && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onMouseDown={() => setCompare(true)}
              onMouseUp={() => setCompare(false)}
              onMouseLeave={() => setCompare(false)}
              onTouchStart={() => setCompare(true)}
              onTouchEnd={() => setCompare(false)}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-hairline text-gray-200 rounded-lg text-xs font-medium select-none"
              title="Hold to see the video without the filter"
            >
              {compare ? "👁 Showing Original" : "👁 Hold: Original"}
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold"
            >
              ✕ Remove Filter
            </button>
          </div>
        )}
      </div>

      {/* ---------------- Active filter + live settings ---------------- */}
      {value && activePreset && activeSettings && (
        <div className="bg-gray-900/80 border border-hairline rounded-2xl overflow-hidden shadow-lg">
          <div className="flex flex-col xl:flex-row">
            {/* big live preview */}
            <div className="xl:w-[420px] flex-shrink-0 bg-black relative">
              <FilterPreviewCanvas
                config={value}
                imageUrl={sampleImage}
                showOriginal={compare}
                width={640}
                height={360}
                className="w-full h-auto block"
              />
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur border border-white/10 text-[10px] font-semibold text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {compare ? "Original (no filter)" : "Live preview · all scenes"}
              </div>
              {!sampleImage && (
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[9px] text-gray-300 border border-white/10">
                  Demo frame — add scene images to preview your own
                </div>
              )}
            </div>

            {/* settings */}
            <div className="flex-1 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{activePreset.icon}</span>
                    <h4 className="text-base font-bold text-white">{activePreset.name}</h4>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold border"
                      style={{
                        color: activePreset.accent,
                        borderColor: `${activePreset.accent}66`,
                        background: `${activePreset.accent}1a`,
                      }}
                    >
                      Active on all scenes
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{activePreset.tagline}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={resetSettings}
                    className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-hairline text-gray-300 rounded-lg text-[11px]"
                  >
                    ↺ Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSettings((v) => !v)}
                    className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-hairline text-gray-300 rounded-lg text-[11px]"
                  >
                    {showSettings ? "▲ Hide" : "▼ Settings"}
                  </button>
                </div>
              </div>

              {showSettings && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 pt-1">
                  {activePreset.controls.map((key) => {
                    const meta = CONTROL_META[key];
                    const v = activeSettings[key];
                    return (
                      <div key={key} className="bg-gray-950/60 border border-hairline rounded-lg px-2.5 py-1.5">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-gray-300 flex items-center gap-1.5" title={meta.hint}>
                            <span>{meta.icon}</span>
                            <span className="font-medium">{meta.label}</span>
                          </span>
                          <span className="font-mono text-[10px] text-fuchsia-300 font-bold">
                            {key === "warmth"
                              ? `${v > 0 ? "+" : ""}${Math.round(v * 100)}`
                              : Math.round(v * 100)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={meta.min}
                          max={meta.max}
                          step={meta.step}
                          value={v}
                          onChange={(e) => setSetting(key, parseFloat(e.target.value))}
                          className="w-full accent-fuchsia-500 cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Group tabs ---------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setGroup("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
            group === "all"
              ? "bg-fuchsia-600 border-fuchsia-400 text-white shadow"
              : "bg-gray-900 border-hairline text-gray-300 hover:text-white hover:bg-gray-800"
          }`}
        >
          <span>🎞️</span>
          <span>All Looks ({VIDEO_FILTERS.length})</span>
        </button>
        {FILTER_GROUPS.map((g) => {
          const count = VIDEO_FILTERS.filter((f) => f.group === g.id).length;
          const selected = group === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(g.id)}
              title={g.blurb}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                selected
                  ? "bg-fuchsia-600 border-fuchsia-400 text-white shadow"
                  : "bg-gray-900 border-hairline text-gray-300 hover:text-white hover:bg-gray-800"
              }`}
            >
              <span>{g.icon}</span>
              <span>
                {g.name} ({count})
              </span>
            </button>
          );
        })}

        <div className="relative ml-auto w-44">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search looks..."
            className="w-full bg-gray-900 border border-hairline rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-fuchsia-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1.5 text-xs text-gray-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {group !== "all" && (
        <p className="text-[11px] text-gray-400 -mt-1">
          {FILTER_GROUPS.find((g) => g.id === group)?.blurb}
        </p>
      )}

      {/* ---------------- Filter buttons with example images ---------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {visible.map((f) => {
          const isActive = value?.id === f.id;
          const cardConfig: VideoFilterConfig = { id: f.id, settings: defaultSettingsFor(f) };
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => apply(f.id)}
              className={`group text-left rounded-xl overflow-hidden border transition-all duration-200 bg-gray-900/70 hover:bg-gray-900 shadow-sm ${
                isActive
                  ? "border-fuchsia-500 ring-2 ring-fuchsia-500/40 shadow-fuchsia-900/30"
                  : "border-hairline hover:border-hairline"
              }`}
              title={`${f.name} — ${f.tagline}`}
            >
              {/* animated example image */}
              <div className="relative bg-black">
                <FilterPreviewCanvas
                  config={cardConfig}
                  imageUrl={sampleImage}
                  width={320}
                  height={180}
                  className="w-full h-auto block"
                />
                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur text-[9px] font-semibold text-white border border-white/10 flex items-center gap-1">
                  <span>{f.icon}</span>
                  <span>{FILTER_GROUPS.find((g) => g.id === f.group)?.name}</span>
                </div>
                {isActive && (
                  <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-fuchsia-600 text-[9px] font-bold text-white shadow">
                    ✓ ACTIVE
                  </div>
                )}
                <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-lg bg-white/15 backdrop-blur border border-white/25 text-white text-xs font-bold">
                    {isActive ? "Click to remove" : "Apply to whole video"}
                  </span>
                </div>
              </div>

              <div className="p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4
                    className={`text-[13px] font-bold truncate ${
                      isActive ? "text-fuchsia-300" : "text-white group-hover:text-fuchsia-200"
                    }`}
                  >
                    {f.name}
                  </h4>
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white/20"
                    style={{ background: f.accent }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5 leading-snug line-clamp-2">{f.tagline}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {f.controls.slice(0, 4).map((c) => (
                    <span
                      key={c}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-gray-950/80 border border-hairline text-gray-400"
                    >
                      {CONTROL_META[c].icon} {CONTROL_META[c].label}
                    </span>
                  ))}
                  {f.controls.length > 4 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-950/80 border border-hairline text-gray-500">
                      +{f.controls.length - 4}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div className="text-center py-14 text-gray-400">
          <span className="text-3xl block mb-2">🔍</span>
          <p className="text-sm">No looks match &quot;{query}&quot;</p>
          <button type="button" onClick={() => setQuery("")} className="mt-2 text-xs text-fuchsia-400 hover:underline">
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}
