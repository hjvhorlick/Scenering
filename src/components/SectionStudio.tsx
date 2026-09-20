import { useEffect, useRef, useState } from "react";
import {
  MOTION_BACKGROUNDS,
  MOTION_BACKGROUNDS_BY_ID,
} from "../data/intro-backgrounds";
import {
  STINGERS,
  TITLE_ANIMATIONS,
  defaultSection,
  sectionSoundUrl,
  type SectionConfig,
  type SectionKind,
} from "../data/intro-outro";
import SectionPreviewCanvas from "./SectionPreviewCanvas";
import type { AspectRatioType } from "../types";

interface Props {
  kind: SectionKind;
  config: SectionConfig | null;
  onChange: (cfg: SectionConfig | null) => void;
  aspectRatio?: AspectRatioType;
  /** the brand logo uploaded in the Logo tab, offered as a one-click choice */
  brandLogoUrl?: string;
}

type Tab = "background" | "text" | "logo" | "sound";

const TABS: { id: Tab; name: string; icon: string }[] = [
  { id: "background", name: "Background", icon: "🎞️" },
  { id: "text", name: "Text", icon: "✍️" },
  { id: "logo", name: "Logo", icon: "🏷️" },
  { id: "sound", name: "Sound", icon: "🔊" },
];

/** small labelled slider */
function Slider({
  label,
  icon,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  icon?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="bg-gray-950/60 border border-gray-800 rounded-lg px-2.5 py-1.5">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-gray-300 flex items-center gap-1.5">
          {icon && <span>{icon}</span>}
          <span className="font-medium">{label}</span>
        </span>
        <span className="font-mono text-[10px] text-amber-300 font-bold">
          {display ?? Math.round(value * 100)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-amber-500 cursor-pointer"
      />
    </div>
  );
}

export default function SectionStudio({ kind, config, onChange, aspectRatio = "16:9", brandLogoUrl }: Props) {
  const isIntro = kind === "intro";
  const cfg = config ?? defaultSection(kind);
  const enabled = Boolean(config?.enabled);

  const [tab, setTab] = useState<Tab>("background");
  const [restartKey, setRestartKey] = useState(0);
  const [playingSound, setPlayingSound] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const soundInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const accent = isIntro ? "amber" : "rose";
  const accentBtn = isIntro
    ? "from-amber-500 to-yellow-500 text-gray-950"
    : "from-rose-600 to-red-600 text-white";

  const update = (patch: Partial<SectionConfig>) => {
    onChange({ ...cfg, ...patch, enabled: true });
  };

  const enable = () => onChange({ ...cfg, enabled: true });
  const disable = () => onChange({ ...cfg, enabled: false });

  const previewSound = (url: string, id: string) => {
    audioRef.current?.pause();
    if (playingSound === id || !url) {
      setPlayingSound(null);
      return;
    }
    const a = new Audio(url);
    a.volume = cfg.volume ?? 0.85;
    a.onended = () => setPlayingSound(null);
    a.play().catch(() => setPlayingSound(null));
    audioRef.current = a;
    setPlayingSound(id);
  };

  const onPickMedia = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    update({
      backgroundKind: file.type.startsWith("video") ? "video" : "image",
      mediaUrl: url,
      mediaName: file.name,
    });
    setRestartKey((k) => k + 1);
  };

  const onPickLogo = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update({ logoEnabled: true, logoUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const onPickSound = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    update({ customSoundUrl: url, customSoundName: file.name });
  };

  const previewAspect =
    aspectRatio === "9:16"
      ? { w: 360, h: 640, cls: "max-h-[420px]" }
      : aspectRatio === "1:1"
      ? { w: 480, h: 480, cls: "max-h-[420px]" }
      : aspectRatio === "4:3"
      ? { w: 560, h: 420, cls: "max-h-[420px]" }
      : { w: 640, h: 360, cls: "" };

  const activeSound = sectionSoundUrl({ ...cfg, enabled: true });

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* ------------------------------ header ------------------------------ */}
      <div
        className={`rounded-xl p-3.5 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md ${
          isIntro
            ? "bg-gradient-to-r from-amber-950/80 via-gray-900 to-amber-950/60 border-amber-500/45"
            : "bg-gradient-to-r from-rose-950/80 via-gray-900 to-rose-950/60 border-rose-500/45"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`text-2xl p-2 rounded-lg border ${
              isIntro
                ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                : "bg-rose-500/20 border-rose-500/40 text-rose-300"
            }`}
          >
            {isIntro ? "🎬" : "🏁"}
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`text-sm font-bold ${isIntro ? "text-amber-200" : "text-rose-200"}`}>
                {isIntro ? "Build Your Intro" : "Build Your Outro"}
              </h3>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold border ${
                  isIntro
                    ? "bg-amber-950 border-amber-600/50 text-amber-300"
                    : "bg-rose-950 border-rose-600/50 text-rose-300"
                }`}
              >
                {isIntro ? "Plays before the script" : "Plays after the script"}
              </span>
            </div>
            <p className="text-xs text-gray-300 mt-0.5 max-w-2xl">
              Pick a moving background (or upload your own clip), type your text, drop your logo on it and choose a
              sound. That&apos;s the whole build — the animation is done for you.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {enabled ? (
            <button
              type="button"
              onClick={disable}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-xs font-semibold"
            >
              ✕ Remove {isIntro ? "Intro" : "Outro"}
            </button>
          ) : (
            <button
              type="button"
              onClick={enable}
              className={`px-4 py-1.5 bg-gradient-to-r ${accentBtn} rounded-lg text-xs font-bold shadow`}
            >
              ➕ Add {isIntro ? "Intro" : "Outro"}
            </button>
          )}
        </div>
      </div>

      {!enabled ? (
        /* -------------------------- empty state -------------------------- */
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {MOTION_BACKGROUNDS.slice(0, 4).map((b) => (
              <div key={b.id} className="rounded-lg overflow-hidden border border-gray-800 bg-black">
                <SectionPreviewCanvas
                  config={{ ...cfg, enabled: true, motionId: b.id, backgroundKind: "motion", title: "", subtitle: "", badge: "", logoEnabled: false }}
                  width={240}
                  height={135}
                  className="w-full h-auto block"
                />
              </div>
            ))}
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-300 font-medium">
              No {isIntro ? "intro" : "outro"} yet
            </p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Add one to open your video with a moment that grabs attention — motion background, your title, your logo
              and a punchy sound.
            </p>
            <button
              type="button"
              onClick={enable}
              className={`mt-4 px-5 py-2 bg-gradient-to-r ${accentBtn} rounded-lg text-sm font-bold shadow`}
            >
              ➕ Add {isIntro ? "Intro" : "Outro"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col xl:flex-row gap-4">
          {/* ------------------------- live preview ------------------------- */}
          <div className="xl:w-[440px] flex-shrink-0 space-y-2.5">
            <div className="bg-black rounded-xl overflow-hidden border border-gray-700 relative shadow-lg">
              <SectionPreviewCanvas
                config={cfg}
                width={previewAspect.w}
                height={previewAspect.h}
                restartKey={`${restartKey}-${cfg.motionId}-${cfg.backgroundKind}-${cfg.titleAnimation}-${cfg.duration}`}
                className={`w-full h-auto block mx-auto ${previewAspect.cls}`}
              />
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur border border-white/10 text-[10px] font-semibold text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live · {cfg.duration.toFixed(1)}s · {aspectRatio}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRestartKey((k) => k + 1)}
                className="flex-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg text-xs font-semibold"
              >
                ↻ Replay
              </button>
              {activeSound && (
                <button
                  type="button"
                  onClick={() => previewSound(activeSound, "active")}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    playingSound === "active"
                      ? "bg-rose-600 border-rose-400 text-white animate-pulse"
                      : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-emerald-300"
                  }`}
                >
                  {playingSound === "active" ? "⏹ Stop" : "▶ Hear Sound"}
                </button>
              )}
            </div>

            <Slider
              label="Section length"
              icon="⏱️"
              value={cfg.duration}
              min={2}
              max={10}
              step={0.5}
              display={`${cfg.duration.toFixed(1)}s`}
              onChange={(v) => update({ duration: v })}
            />
          </div>

          {/* --------------------------- editor ---------------------------- */}
          <div className="flex-1 bg-gray-900/70 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex border-b border-gray-800 bg-gray-950/60">
              {TABS.map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => setTab(tb.id)}
                  className={`flex-1 px-3 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                    tab === tb.id
                      ? `text-white bg-gray-900 border-b-2 ${isIntro ? "border-amber-500" : "border-rose-500"}`
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  <span>{tb.icon}</span>
                  <span>{tb.name}</span>
                </button>
              ))}
            </div>

            <div className="p-4 space-y-3">
              {/* ------------------------ BACKGROUND ------------------------ */}
              {tab === "background" && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-200">Motion backgrounds</span>
                    <button
                      type="button"
                      onClick={() => mediaInputRef.current?.click()}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold"
                    >
                      ⬆ Upload my own video / image
                    </button>
                    <input
                      ref={mediaInputRef}
                      type="file"
                      accept="video/*,image/*"
                      className="hidden"
                      onChange={(e) => onPickMedia(e.target.files?.[0])}
                    />
                  </div>

                  {cfg.backgroundKind !== "motion" && cfg.mediaUrl && (
                    <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-indigo-950/50 border border-indigo-700/60">
                      <span className="text-[11px] text-indigo-200 truncate flex items-center gap-1.5">
                        <span>{cfg.backgroundKind === "video" ? "🎥" : "🖼️"}</span>
                        <span className="truncate">Using your own {cfg.backgroundKind}: {cfg.mediaName || "uploaded file"}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => update({ backgroundKind: "motion", mediaUrl: "", mediaName: undefined })}
                        className="text-[11px] text-gray-300 hover:text-white px-1.5 flex-shrink-0"
                      >
                        ✕ Use motion instead
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {MOTION_BACKGROUNDS.map((b) => {
                      const active = cfg.backgroundKind === "motion" && cfg.motionId === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            update({
                              backgroundKind: "motion",
                              motionId: b.id,
                              colorA: undefined,
                              colorB: undefined,
                            });
                            setRestartKey((k) => k + 1);
                          }}
                          title={b.blurb}
                          className={`rounded-lg overflow-hidden border-2 text-left transition-all ${
                            active
                              ? isIntro
                                ? "border-amber-500 ring-2 ring-amber-500/30"
                                : "border-rose-500 ring-2 ring-rose-500/30"
                              : "border-gray-800 hover:border-gray-600"
                          }`}
                        >
                          <div className="bg-black relative">
                            <SectionPreviewCanvas
                              config={{
                                ...cfg,
                                enabled: true,
                                backgroundKind: "motion",
                                motionId: b.id,
                                colorA: undefined,
                                colorB: undefined,
                                title: "",
                                subtitle: "",
                                badge: "",
                                logoEnabled: false,
                              }}
                              width={200}
                              height={112}
                              className="w-full h-auto block"
                            />
                            {active && (
                              <span
                                className={`absolute top-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-bold text-white ${
                                  isIntro ? "bg-amber-600" : "bg-rose-600"
                                }`}
                              >
                                ✓
                              </span>
                            )}
                          </div>
                          <div className="px-2 py-1.5">
                            <div className="text-[11px] font-bold text-white truncate flex items-center gap-1">
                              <span>{b.icon}</span>
                              <span className="truncate">{b.name}</span>
                            </div>
                            <div className="text-[9px] text-gray-500 truncate">{b.blurb}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {cfg.backgroundKind === "motion" && (
                    <div className="flex items-center gap-3 pt-1 border-t border-gray-800">
                      <span className="text-[11px] text-gray-400">Recolour:</span>
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-300">
                        <input
                          type="color"
                          value={cfg.colorA || MOTION_BACKGROUNDS_BY_ID[cfg.motionId]?.colors[0] || "#f5b820"}
                          onChange={(e) => update({ colorA: e.target.value })}
                          className="w-7 h-7 rounded cursor-pointer bg-transparent border border-gray-700"
                        />
                        Main
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-300">
                        <input
                          type="color"
                          value={cfg.colorB || MOTION_BACKGROUNDS_BY_ID[cfg.motionId]?.colors[1] || "#ff7a18"}
                          onChange={(e) => update({ colorB: e.target.value })}
                          className="w-7 h-7 rounded cursor-pointer bg-transparent border border-gray-700"
                        />
                        Accent
                      </label>
                      {(cfg.colorA || cfg.colorB) && (
                        <button
                          type="button"
                          onClick={() => update({ colorA: undefined, colorB: undefined })}
                          className="text-[11px] text-gray-400 hover:text-white underline ml-auto"
                        >
                          Reset colours
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* --------------------------- TEXT --------------------------- */}
              {tab === "text" && (
                <>
                  <div>
                    <label className="text-[11px] text-gray-400 font-medium block mb-1">Title</label>
                    <input
                      type="text"
                      value={cfg.title}
                      onChange={(e) => update({ title: e.target.value })}
                      placeholder={isIntro ? "YOUR TITLE HERE" : "THANKS FOR WATCHING"}
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-bold placeholder-gray-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-medium block mb-1">Subtitle</label>
                    <input
                      type="text"
                      value={cfg.subtitle}
                      onChange={(e) => update({ subtitle: e.target.value })}
                      placeholder="One supporting line"
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-medium block mb-1">
                      Small badge <span className="text-gray-600">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={cfg.badge}
                      onChange={(e) => update({ badge: e.target.value })}
                      placeholder="e.g. NEW EPISODE"
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] text-gray-400 font-medium block mb-1.5">How the title appears</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {TITLE_ANIMATIONS.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            update({ titleAnimation: a.id });
                            setRestartKey((k) => k + 1);
                          }}
                          title={a.blurb}
                          className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                            cfg.titleAnimation === a.id
                              ? isIntro
                                ? "bg-amber-600 border-amber-400 text-white"
                                : "bg-rose-600 border-rose-400 text-white"
                              : "bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-600"
                          }`}
                        >
                          <span className="mr-1">{a.icon}</span>
                          {a.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Slider
                      label="Text size"
                      icon="🔠"
                      value={cfg.textScale}
                      min={0.5}
                      max={1.8}
                      step={0.05}
                      display={`${Math.round(cfg.textScale * 100)}%`}
                      onChange={(v) => update({ textScale: v })}
                    />
                    <Slider
                      label="Text height"
                      icon="↕️"
                      value={cfg.textY}
                      min={0.25}
                      max={0.88}
                      step={0.01}
                      display={`${Math.round(cfg.textY * 100)}%`}
                      onChange={(v) => update({ textY: v })}
                    />
                  </div>

                  <div className="flex items-center gap-4 pt-1">
                    <label className="flex items-center gap-1.5 text-[11px] text-gray-300">
                      <input
                        type="color"
                        value={cfg.textColor}
                        onChange={(e) => update({ textColor: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer bg-transparent border border-gray-700"
                      />
                      Text colour
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-gray-300">
                      <input
                        type="color"
                        value={cfg.accentColor}
                        onChange={(e) => update({ accentColor: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer bg-transparent border border-gray-700"
                      />
                      Accent colour
                    </label>
                  </div>
                </>
              )}

              {/* --------------------------- LOGO --------------------------- */}
              {tab === "logo" && (
                <>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-gray-200 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cfg.logoEnabled}
                        onChange={(e) => update({ logoEnabled: e.target.checked })}
                        className="accent-amber-500 w-4 h-4"
                      />
                      Show a logo on this section
                    </label>
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold"
                    >
                      ⬆ Upload logo
                    </button>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => onPickLogo(e.target.files?.[0])}
                    />
                  </div>

                  {brandLogoUrl && cfg.logoUrl !== brandLogoUrl && (
                    <button
                      type="button"
                      onClick={() => update({ logoEnabled: true, logoUrl: brandLogoUrl })}
                      className="w-full px-3 py-2 rounded-lg bg-gray-950 border border-gray-700 hover:border-indigo-500 text-[11px] text-gray-300 flex items-center gap-2"
                    >
                      <img src={brandLogoUrl} alt="" className="h-6 w-auto object-contain" />
                      <span>Use my brand logo from the Logo tab</span>
                    </button>
                  )}

                  {cfg.logoUrl ? (
                    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-gray-950 border border-gray-800">
                      <img src={cfg.logoUrl} alt="" className="h-8 w-auto object-contain" />
                      <span className="text-[11px] text-gray-400 flex-1">Logo loaded</span>
                      <button
                        type="button"
                        onClick={() => update({ logoUrl: "" })}
                        className="text-[11px] text-gray-400 hover:text-rose-400"
                      >
                        ✕ Clear
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-500">
                      No logo selected — upload a transparent PNG for the best result.
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Slider
                      label="Size"
                      icon="⬛"
                      value={cfg.logoScale}
                      min={0.4}
                      max={2}
                      step={0.05}
                      display={`${Math.round(cfg.logoScale * 100)}%`}
                      onChange={(v) => update({ logoScale: v })}
                    />
                    <Slider
                      label="Move left / right"
                      icon="↔️"
                      value={cfg.logoX}
                      min={0.1}
                      max={0.9}
                      step={0.01}
                      display={`${Math.round(cfg.logoX * 100)}%`}
                      onChange={(v) => update({ logoX: v })}
                    />
                    <Slider
                      label="Move up / down"
                      icon="↕️"
                      value={cfg.logoY}
                      min={0.08}
                      max={0.8}
                      step={0.01}
                      display={`${Math.round(cfg.logoY * 100)}%`}
                      onChange={(v) => update({ logoY: v })}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-800">
                    <span className="text-[11px] text-gray-400 mr-1">Quick place:</span>
                    {[
                      { n: "Top", x: 0.5, y: 0.16 },
                      { n: "Centre", x: 0.5, y: 0.3 },
                      { n: "Top left", x: 0.16, y: 0.15 },
                      { n: "Top right", x: 0.84, y: 0.15 },
                      { n: "Bottom", x: 0.5, y: 0.84 },
                    ].map((q) => (
                      <button
                        key={q.n}
                        type="button"
                        onClick={() => update({ logoX: q.x, logoY: q.y })}
                        className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-[10px]"
                      >
                        {q.n}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* --------------------------- SOUND -------------------------- */}
              {tab === "sound" && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-200">Attention-grabbing stingers</span>
                    <button
                      type="button"
                      onClick={() => soundInputRef.current?.click()}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold"
                    >
                      ⬆ Upload my own sound
                    </button>
                    <input
                      ref={soundInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => onPickSound(e.target.files?.[0])}
                    />
                  </div>

                  {cfg.customSoundUrl && (
                    <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-indigo-950/50 border border-indigo-700/60">
                      <span className="text-[11px] text-indigo-200 truncate">
                        🎵 Your sound: {cfg.customSoundName || "uploaded audio"}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => previewSound(cfg.customSoundUrl!, "custom")}
                          className="text-[11px] text-emerald-300 hover:text-emerald-200 px-1.5"
                        >
                          {playingSound === "custom" ? "⏹ Stop" : "▶ Test"}
                        </button>
                        <button
                          type="button"
                          onClick={() => update({ customSoundUrl: undefined, customSoundName: undefined })}
                          className="text-[11px] text-gray-300 hover:text-white px-1.5"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {STINGERS.map((s) => {
                      const active = !cfg.customSoundUrl && cfg.stingerId === s.id;
                      return (
                        <div
                          key={s.id}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors ${
                            active
                              ? isIntro
                                ? "bg-amber-950/40 border-amber-600/70"
                                : "bg-rose-950/40 border-rose-600/70"
                              : "bg-gray-950 border-gray-800 hover:border-gray-700"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => update({ stingerId: s.id, customSoundUrl: undefined, customSoundName: undefined })}
                            className="flex-1 flex items-center gap-2 text-left min-w-0"
                          >
                            <span className="text-base flex-shrink-0">{s.icon}</span>
                            <span className="min-w-0">
                              <span className="block text-[12px] font-semibold text-white truncate">{s.name}</span>
                              <span className="block text-[10px] text-gray-500 truncate">{s.blurb}</span>
                            </span>
                          </button>
                          {s.seconds > 0 && (
                            <span className="text-[9px] font-mono text-gray-500 flex-shrink-0">{s.seconds}s</span>
                          )}
                          {s.url && (
                            <button
                              type="button"
                              onClick={() => previewSound(s.url, s.id)}
                              className={`px-2 py-1 rounded text-[10px] font-bold border flex-shrink-0 ${
                                playingSound === s.id
                                  ? "bg-rose-600 border-rose-400 text-white animate-pulse"
                                  : "bg-gray-900 border-gray-700 text-emerald-400 hover:text-emerald-300"
                              }`}
                            >
                              {playingSound === s.id ? "⏹" : "▶"}
                            </button>
                          )}
                          {active && (
                            <span
                              className={`text-[9px] font-bold flex-shrink-0 ${
                                isIntro ? "text-amber-400" : "text-rose-400"
                              }`}
                            >
                              ✓
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <Slider
                    label="Sound volume"
                    icon="🔊"
                    value={cfg.volume}
                    min={0}
                    max={1}
                    step={0.05}
                    display={`${Math.round(cfg.volume * 100)}%`}
                    onChange={(v) => {
                      update({ volume: v });
                      if (audioRef.current) audioRef.current.volume = v;
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
