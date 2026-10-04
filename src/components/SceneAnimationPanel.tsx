import { useMemo, useState } from "react";
import type { AspectRatioType, Scene, SceneAnimationConfig, SceneAnimationEffect, SceneAnimationRegion, SceneMotionType } from "../types";
import type { VideoFilterConfig } from "../data/video-filters";
import Icon, { iconify } from "./icons/Icon";
import ScrollStrip from "./ScrollStrip";
import SceneAnimationPreviewCanvas from "./SceneAnimationPreviewCanvas";
import {
  EFFECT_BY_TYPE,
  SCENE_ANIMATION_CAMERA_OPTIONS,
  SCENE_ANIMATION_CATEGORIES,
  SCENE_ANIMATION_COLOR_PALETTES,
  SCENE_ANIMATION_LIBRARY_SECTIONS,
  SCENE_ANIMATION_PRESETS,
  applySceneAnimationPreset,
  countEnabledSceneAnimationItems,
  effectDefaults,
  getSmartSceneAnimationSuggestions,
  resolveSceneAnimation,
} from "../lib/scene-animation";

interface SceneAnimationPanelProps {
  scene: Scene;
  aspectRatio?: AspectRatioType;
  videoFilter?: VideoFilterConfig | null;
  onUpdate: (sceneId: number, updates: Partial<Scene>) => void;
}

function labelForValue(value: number, low = "Low", mid = "Medium", high = "High") {
  if (value < 0.34) return low;
  if (value < 0.67) return mid;
  return high;
}

function SliderControl({
  label,
  value,
  onChange,
  low,
  high,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  low?: string;
  high?: string;
}) {
  const v = Number.isFinite(value) ? value : 0.5;
  return (
    <label className="block min-w-0">
      <div className="flex items-center justify-between gap-2 text-[10px] mb-0.5">
        <span className="text-gray-400">{label}</span>
        <span className="text-indigo-300 font-mono">{labelForValue(v, low || "Low", "Medium", high || "High")}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(v * 100)}
        onChange={(e) => onChange(parseInt(e.target.value, 10) / 100)}
        className="w-full accent-indigo-500 cursor-pointer"
      />
    </label>
  );
}

function clampPercent(n: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

export default function SceneAnimationPanel({
  scene,
  aspectRatio = "16:9",
  videoFilter = null,
  onUpdate,
}: SceneAnimationPanelProps) {
  const animation = resolveSceneAnimation(scene.animation);
  const enabledEffects = animation.effects?.filter((effect) => effect.enabled !== false) || [];
  const firstSection = SCENE_ANIMATION_LIBRARY_SECTIONS[0];
  const [activeSectionId, setActiveSectionId] = useState(firstSection.id);
  const [activeGroupId, setActiveGroupId] = useState(firstSection.groups[0]?.id || "");
  const [advancedEffectId, setAdvancedEffectId] = useState<string | null>(null);

  const suggestions = useMemo(() => getSmartSceneAnimationSuggestions(scene), [scene.text, scene.image_query]);

  const commit = (next: SceneAnimationConfig) => {
    onUpdate(scene.id, { animation: next });
  };

  const updateCamera = (patch: Partial<NonNullable<SceneAnimationConfig["camera"]>>) => {
    commit({
      ...animation,
      enabled: true,
      camera: {
        ...animation.camera!,
        ...patch,
      },
      effects: animation.effects || [],
    });
  };

  const updateEffect = (effectId: string, patch: Partial<SceneAnimationEffect>) => {
    commit({
      ...animation,
      effects: (animation.effects || []).map((effect) =>
        effect.id === effectId
          ? {
              ...effect,
              ...patch,
              region: patch.region ? { ...patch.region } : effect.region,
              origin: patch.origin ? { ...patch.origin } : effect.origin,
            }
          : effect
      ),
    });
  };

  const toggleEffect = (type: string) => {
    const existing = (animation.effects || []).find((effect) => effect.type === type);
    if (existing) {
      updateEffect(existing.id, { enabled: existing.enabled === false });
      return;
    }
    commit({
      ...animation,
      enabled: true,
      effects: [...(animation.effects || []), effectDefaults(type)],
    });
  };

  const addEffect = (type: string) => {
    const existing = (animation.effects || []).find((effect) => effect.type === type);
    if (existing) {
      updateEffect(existing.id, { enabled: true });
      return;
    }
    commit({
      ...animation,
      enabled: true,
      effects: [...(animation.effects || []), effectDefaults(type)],
    });
  };

  const removeEffect = (effectId: string) => {
    commit({
      ...animation,
      effects: (animation.effects || []).map((effect) =>
        effect.id === effectId ? { ...effect, enabled: false } : effect
      ),
    });
    if (advancedEffectId === effectId) setAdvancedEffectId(null);
  };

  const applyPreset = (presetId: string) => {
    commit(applySceneAnimationPreset(animation, presetId));
  };

  const activeSection =
    SCENE_ANIMATION_LIBRARY_SECTIONS.find((section) => section.id === activeSectionId) || firstSection;
  const activeGroup =
    activeSection.groups.find((group) => group.id === activeGroupId) || activeSection.groups[0];
  const activeDefs = (activeGroup?.effects || [])
    .map((type) => EFFECT_BY_TYPE.get(type))
    .filter((def): def is NonNullable<typeof def> => Boolean(def));
  const activePresets = (activeGroup?.presetIds || [])
    .map((id) => SCENE_ANIMATION_PRESETS.find((preset) => preset.id === id))
    .filter((preset): preset is NonNullable<typeof preset> => Boolean(preset));
  const activeCount = countEnabledSceneAnimationItems(animation);

  return (
    <div className="mt-2.5 bg-gray-950/80 border border-indigo-800/60 rounded-xl overflow-hidden animate-fade-in shadow-inner">
      <div className="p-3 border-b border-indigo-900/60 bg-gradient-to-r from-indigo-950/70 to-purple-950/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center">
              <Icon glyph="🎬" />
            </span>
            <div>
              <h4 className="text-sm font-bold text-white">Scene Animation</h4>
              <p className="text-[11px] text-indigo-200/80">
                Turn this still image into a living scene with stacked camera, weather, nature, water and light layers.
              </p>
            </div>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-lg bg-gray-900/80 border border-indigo-700/60 text-[11px] text-indigo-200 font-semibold self-start lg:self-center">
          ✨ Animation: {activeCount === 0 ? "OFF for this scene" : `${activeCount} layer${activeCount === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="p-3 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-3">
          <div className="space-y-3">
            {/* Camera / Motion */}
            <section className="bg-gray-900/70 border border-hairline rounded-xl p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Icon glyph="🎥" /> Camera / Motion
                  </h5>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Existing Ken Burns movement is reused here, but controlled per scene while Scene Animation Effects is ON.
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/70 shrink-0">
                  Per-scene
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {SCENE_ANIMATION_CAMERA_OPTIONS.map((opt) => {
                  const selected = animation.camera?.motion === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateCamera({ motion: opt.id as SceneMotionType })}
                      className={`px-2.5 py-2 rounded-lg border text-left transition-all ${
                        selected
                          ? "bg-indigo-600 border-indigo-400 text-white shadow"
                          : "bg-gray-800/80 border-hairline text-gray-300 hover:bg-gray-750 hover:text-white"
                      }`}
                      title={opt.description}
                    >
                      <div className="text-[11px] font-bold flex items-center gap-1.5">
                        <Icon glyph={opt.icon} /> {opt.label}
                      </div>
                      <div className="text-[9px] text-gray-400 leading-tight mt-0.5 line-clamp-2">{opt.description}</div>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <SliderControl
                  label="Intensity"
                  value={animation.camera?.intensity ?? 0.55}
                  onChange={(value) => updateCamera({ intensity: value })}
                  low="Subtle"
                  high="Strong"
                />
                <SliderControl
                  label="Speed"
                  value={animation.camera?.speed ?? 0.45}
                  onChange={(value) => updateCamera({ speed: value })}
                  low="Slow"
                  high="Fast"
                />
              </div>
            </section>

            {/* Quick presets */}
            <section className="bg-gray-900/70 border border-hairline rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Icon glyph="⚡" /> Quick Presets
                  </h5>
                  <p className="text-[10px] text-gray-500">Presets add multiple layers. You can change every layer after applying.</p>
                </div>
              </div>
              {/* The preset cards are wider than the panel and there are
                  twenty of them, so the row gets a real slider: arrows, edge
                  fades and a visible bar. It used to run off the side with
                  the scrollbar hidden, which left most of the presets
                  invisible unless you happened to flick a trackpad. */}
              <ScrollStrip label="Quick presets" className="gap-1.5">
                {SCENE_ANIMATION_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className="shrink-0 w-[150px] px-2.5 py-2 rounded-lg bg-gray-800/90 hover:bg-indigo-950/80 border border-hairline hover:border-indigo-600 text-left transition-all"
                    title={preset.description}
                  >
                    <div className="text-[11px] font-bold text-white flex items-center gap-1">
                      <Icon glyph={preset.icon} /> {preset.label}
                    </div>
                    <div className="text-[9px] text-gray-400 leading-tight mt-0.5 line-clamp-2">{preset.description}</div>
                  </button>
                ))}
              </ScrollStrip>
            </section>

            {/* Smart suggestions */}
            <section className="bg-gray-900/70 border border-hairline rounded-xl p-3 space-y-2">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Icon glyph="🧠" /> Smart Suggestions
              </h5>
              <p className="text-[10px] text-gray-500">
                Suggestions are based on scene text/image topic only; Scenering never changes the image without your click.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((type) => {
                  const def = EFFECT_BY_TYPE.get(type);
                  if (!def) {
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => updateCamera({ motion: "cinematic_drift" })}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-950/70 border border-indigo-700/60 text-indigo-200 text-[11px] font-semibold"
                      >
                        🎥 Cinematic Drift
                      </button>
                    );
                  }
                  const active = enabledEffects.some((effect) => effect.type === type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => addEffect(type)}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 ${
                        active
                          ? "bg-emerald-950/80 border-emerald-600 text-emerald-200"
                          : "bg-gray-800 border-hairline text-gray-300 hover:text-white hover:bg-gray-750"
                      }`}
                    >
                      <Icon glyph={def.icon} /> {def.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Live preview */}
          <div className="bg-gray-900/70 border border-hairline rounded-xl p-3 space-y-2 h-fit">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Icon glyph="▶" /> Preview Animation
                </h5>
                <p className="text-[10px] text-gray-500">Scene image, duration, camera and effects.</p>
              </div>
            </div>
            <div className="w-full overflow-x-auto">
              <SceneAnimationPreviewCanvas
                scene={scene}
                aspectRatio={aspectRatio}
                videoFilter={videoFilter}
                width={aspectRatio === "9:16" ? 190 : 240}
              />
            </div>
          </div>
        </div>

        {/* Beginner-friendly section browser */}
        <section className="bg-gray-900/70 border border-hairline rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Icon glyph="🧭" /> Animation Sections
              </h5>
              <p className="text-[10px] text-gray-500">
                Start with a creative world, then choose a smaller sub-section. Every element still stacks and renders together.
              </p>
            </div>
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded bg-gray-950 border border-hairline text-[10px] text-gray-400">
              {activeSection.label} → {activeGroup?.label}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
            {SCENE_ANIMATION_LIBRARY_SECTIONS.map((section) => {
              const active = activeSection.id === section.id;
              const effectTypes = new Set(section.groups.flatMap((group) => group.effects));
              const count = enabledEffects.filter((effect) => effectTypes.has(effect.type)).length;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => {
                    setActiveSectionId(section.id);
                    setActiveGroupId(section.groups[0]?.id || "");
                  }}
                  className={`p-2 rounded-xl border text-left transition-all min-h-[62px] ${
                    active
                      ? "bg-indigo-600 border-indigo-400 text-white shadow"
                      : "bg-gray-800/80 border-hairline text-gray-300 hover:bg-gray-750 hover:text-white"
                  }`}
                  title={section.description}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm"><Icon glyph={section.icon} /></span>
                    {count > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[9px] font-bold">{count}</span>}
                  </div>
                  <div className="text-[11px] font-bold mt-1 leading-tight">{section.label}</div>
                  <div className="text-[9px] text-gray-400 leading-tight line-clamp-1">{section.description}</div>
                </button>
              );
            })}
          </div>

          <ScrollStrip label="Sub-sections" className="gap-1.5">
            {activeSection.groups.map((group) => {
              const active = activeGroup?.id === group.id;
              const effectTypes = new Set(group.effects);
              const count = enabledEffects.filter((effect) => effectTypes.has(effect.type)).length;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroupId(group.id)}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border whitespace-nowrap flex items-center gap-1.5 ${
                    active
                      ? "bg-purple-600 border-purple-400 text-white"
                      : "bg-gray-800 border-hairline text-gray-300 hover:text-white hover:bg-gray-750"
                  }`}
                  title={group.description}
                >
                  <Icon glyph={group.icon} /> {group.label}
                  {count > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[9px]">{count}</span>}
                </button>
              );
            })}
          </ScrollStrip>

          <div className="bg-gray-950/50 border border-hairline rounded-xl p-2.5 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Icon glyph={activeGroup?.icon || activeSection.icon} /> {activeGroup?.label || activeSection.label}
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">{activeGroup?.description || activeSection.description}</p>
              </div>
              {activePresets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {activePresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className="px-2 py-1 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/70 text-indigo-200 text-[10px] font-semibold flex items-center gap-1"
                      title={preset.description}
                    >
                      <Icon glyph={preset.icon} /> Apply {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeDefs.map((def) => {
                const active = enabledEffects.some((effect) => effect.type === def.type);
                return (
                  <button
                    key={def.type}
                    type="button"
                    onClick={() => toggleEffect(def.type)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      active
                        ? "bg-emerald-950/70 border-emerald-500 text-white shadow-sm"
                        : "bg-gray-800/70 border-hairline text-gray-300 hover:bg-gray-750 hover:text-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold flex items-center gap-1.5">
                          <Icon glyph={def.icon} /> {def.label}
                        </div>
                        <p className="text-[10px] text-gray-400 leading-tight mt-0.5 line-clamp-2">{def.description}</p>
                      </div>
                      <span className={`w-4 h-4 mt-0.5 rounded-full border flex items-center justify-center shrink-0 ${active ? "bg-emerald-500 border-emerald-400" : "border-hairline"}`}>
                        {active && <span className="text-[9px]">✓</span>}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Enabled effect stack */}
        <section className="bg-gray-900/70 border border-hairline rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Icon glyph="🧱" /> Active Effect Stack
              </h5>
              <p className="text-[10px] text-gray-500">Independent layers are composited over the camera-moved base image.</p>
            </div>
            {enabledEffects.length > 0 && (
              <button
                type="button"
                onClick={() => commit({ ...animation, effects: (animation.effects || []).map((effect) => ({ ...effect, enabled: false })) })}
                className="text-[11px] text-rose-300 hover:text-rose-200 underline"
              >
                Disable all effects
              </button>
            )}
          </div>

          {enabledEffects.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-hairline text-center text-xs text-gray-400 bg-gray-950/50">
              No environmental effects yet. Add one from the library above, apply a preset, or use a smart suggestion.
            </div>
          ) : (
            <div className="space-y-2">
              {enabledEffects.map((effect) => {
                const def = EFFECT_BY_TYPE.get(effect.type);
                if (!def) return null;
                const advancedOpen = advancedEffectId === effect.id;
                const region = effect.region || def.defaults?.region || { x: 0, y: 0, w: 1, h: 1 };
                const origin = effect.origin || def.defaults?.origin || { x: 0.5, y: 0.6 };
                const palette = SCENE_ANIMATION_COLOR_PALETTES.find((p) => p.id === (effect.colorPalette || "natural"));
                const metallic = Boolean(palette?.metallic);

                return (
                  <div key={effect.id} className="bg-gray-950/70 border border-hairline rounded-xl p-3 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Icon glyph={def.icon} /> {def.label}
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-hairline">
                            {SCENE_ANIMATION_CATEGORIES.find((c) => c.id === def.category)?.label}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5">{def.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAdvancedEffectId(advancedOpen ? null : effect.id)}
                          className={`px-2 py-1 rounded border text-[10px] font-semibold ${
                            advancedOpen ? "bg-indigo-950 border-indigo-600 text-indigo-200" : "bg-gray-800 border-hairline text-gray-300"
                          }`}
                        >
                          {iconify(advancedOpen ? "▾ Advanced" : "▸ Advanced")}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeEffect(effect.id)}
                          className="px-2 py-1 rounded border border-rose-900/70 bg-rose-950/40 text-rose-300 hover:text-rose-200 text-[10px] font-semibold"
                        >
                          Disable
                        </button>
                      </div>
                    </div>

                    {def.variants && def.variants.length > 0 && (
                      <label className="block">
                        <span className="text-[10px] text-gray-400">Variant</span>
                        <select
                          value={effect.variant || def.defaults?.variant || def.variants[0].id}
                          onChange={(e) => updateEffect(effect.id, { variant: e.target.value })}
                          className="mt-1 w-full bg-gray-900 border border-hairline rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {def.variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>{variant.label}</option>
                          ))}
                        </select>
                      </label>
                    )}

                    <div className="rounded-xl border border-hairline bg-gray-900/60 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-bold text-white flex items-center gap-1.5">
                            <Icon glyph="🌈" /> Colour, transparency & glow
                          </div>
                          <p className="text-[9px] text-gray-500 leading-tight">Chrome gold/silver, neon colour, transparency, bloom, afterglow and tails render in preview and export.</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                        <label className="block min-w-0">
                          <span className="text-[10px] text-gray-400">Colour style</span>
                          <select
                            value={effect.colorPalette || "natural"}
                            onChange={(e) => updateEffect(effect.id, { colorPalette: e.target.value as SceneAnimationEffect["colorPalette"] })}
                            className="mt-1 w-full bg-gray-950 border border-hairline rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            {SCENE_ANIMATION_COLOR_PALETTES.map((palette) => (
                              <option key={palette.id} value={palette.id}>{palette.label}</option>
                            ))}
                          </select>
                          <div className="mt-1 flex gap-1 overflow-hidden rounded-full border border-hairline bg-gray-950 p-0.5">
                            {SCENE_ANIMATION_COLOR_PALETTES.filter((palette) => palette.id !== "natural").slice(0, 7).map((palette) => (
                              <button
                                key={palette.id}
                                type="button"
                                onClick={() => updateEffect(effect.id, { colorPalette: palette.id })}
                                title={palette.description}
                                className={`h-3 flex-1 rounded-full border ${effect.colorPalette === palette.id ? "border-white" : "border-transparent"}`}
                                style={{ background: palette.swatch }}
                              />
                            ))}
                          </div>
                        </label>
                        <SliderControl
                          label="Transparency"
                          value={effect.opacity ?? def.defaults?.opacity ?? 0.45}
                          low="Clear"
                          high="Solid"
                          onChange={(value) => updateEffect(effect.id, { opacity: value })}
                        />
                        <SliderControl
                          label="Bloom"
                          value={effect.bloom ?? 0}
                          low="Off"
                          high="Bright"
                          onChange={(value) => updateEffect(effect.id, { bloom: value })}
                        />
                        <SliderControl
                          label="Afterglow"
                          value={effect.afterglow ?? 0}
                          low="None"
                          high="Halo"
                          onChange={(value) => updateEffect(effect.id, { afterglow: value })}
                        />
                        <SliderControl
                          label="Tails"
                          value={effect.trail ?? 0}
                          low="None"
                          high="Long"
                          onChange={(value) => updateEffect(effect.id, { trail: value })}
                        />
                        <SliderControl
                          label={metallic ? "Chrome shine" : "Shine"}
                          value={effect.shine ?? (metallic ? 0.72 : 0)}
                          low="Matte"
                          high="Mirror"
                          onChange={(value) => updateEffect(effect.id, { shine: value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {def.controls.includes("intensity") && (
                        <SliderControl label="Intensity" value={effect.intensity ?? 0.45} onChange={(value) => updateEffect(effect.id, { intensity: value })} />
                      )}
                      {def.controls.includes("amount") && (
                        <SliderControl label="Amount" value={effect.amount ?? 0.35} onChange={(value) => updateEffect(effect.id, { amount: value })} />
                      )}
                      {def.controls.includes("density") && (
                        <SliderControl label="Density" value={effect.density ?? 0.35} onChange={(value) => updateEffect(effect.id, { density: value })} />
                      )}
                      {def.controls.includes("speed") && (
                        <SliderControl label="Speed" value={effect.speed ?? 0.35} low="Slow" high="Fast" onChange={(value) => updateEffect(effect.id, { speed: value })} />
                      )}
                      {def.controls.includes("size") && (
                        <SliderControl label="Size" value={effect.size ?? 0.35} low="Small" high="Large" onChange={(value) => updateEffect(effect.id, { size: value })} />
                      )}
                    </div>

                    {def.controls.includes("direction") && (
                      <div>
                        <span className="text-[10px] text-gray-400">Direction</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {(["left", "right", "up", "down", "up-left", "up-right", "down-left", "down-right"] as const).map((dir) => (
                            <button
                              key={dir}
                              type="button"
                              onClick={() => updateEffect(effect.id, { direction: dir })}
                              className={`px-2 py-1 rounded text-[10px] border capitalize ${
                                (effect.direction || def.defaults?.direction) === dir
                                  ? "bg-indigo-600 border-indigo-400 text-white"
                                  : "bg-gray-800 border-hairline text-gray-300"
                              }`}
                            >
                              {dir.replace("-", " ")}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {advancedOpen && (
                      <div className="border-t border-hairline pt-3 space-y-3">
                        <p className="text-[10px] text-gray-500 leading-relaxed">
                          Region and origin controls are normalized to the scene frame. Use them to keep water effects near water, birds in the sky, or steam above a cup.
                        </p>
                        {def.controls.includes("origin") && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <SliderControl
                              label="Origin X"
                              value={origin.x}
                              low="Left"
                              high="Right"
                              onChange={(value) => updateEffect(effect.id, { origin: { ...origin, x: value } })}
                            />
                            <SliderControl
                              label="Origin Y"
                              value={origin.y}
                              low="Top"
                              high="Bottom"
                              onChange={(value) => updateEffect(effect.id, { origin: { ...origin, y: value } })}
                            />
                          </div>
                        )}
                        {def.controls.includes("region") && (
                          <RegionControls
                            region={region}
                            onChange={(patch) => updateEffect(effect.id, { region: { ...region, ...patch } })}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RegionControls({
  region,
  onChange,
}: {
  region: SceneAnimationRegion;
  onChange: (patch: Partial<SceneAnimationRegion>) => void;
}) {
  const r = {
    x: clampPercent(region.x),
    y: clampPercent(region.y),
    w: clampPercent(region.w, 0.05, 1),
    h: clampPercent(region.h, 0.05, 1),
  };
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold text-gray-300">Effect region</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SliderControl label="Left" value={r.x} low="Left" high="Right" onChange={(value) => onChange({ x: Math.min(value, 1 - r.w) })} />
        <SliderControl label="Top" value={r.y} low="Top" high="Bottom" onChange={(value) => onChange({ y: Math.min(value, 1 - r.h) })} />
        <SliderControl label="Width" value={r.w} low="Narrow" high="Wide" onChange={(value) => onChange({ w: Math.max(0.05, Math.min(1 - r.x, value)) })} />
        <SliderControl label="Height" value={r.h} low="Short" high="Tall" onChange={(value) => onChange({ h: Math.max(0.05, Math.min(1 - r.y, value)) })} />
      </div>
      <div className="relative h-16 rounded-lg border border-hairline bg-gradient-to-b from-slate-800 to-slate-950 overflow-hidden">
        <div
          className="absolute border border-indigo-400/90 bg-indigo-500/20 rounded-sm"
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.w * 100}%`,
            height: `${r.h * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
