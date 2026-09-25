import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Scene, TimelineInsert } from "../types";
import { calculateDynamicDuration } from "../lib/duration-utils";

interface TimelineProps {
  scenes: Scene[];
  inserts: TimelineInsert[];
  currentTime: number;
  totalDuration?: number;
  isPlaying?: boolean;
  selectedInsertId?: string;
  onSeek: (time: number) => void;
  onTogglePlay?: () => void;
  onSelectInsert: (insert: TimelineInsert) => void;
  onDeleteInsert: (id: string) => void;
  onUpdateInsert?: (updated: TimelineInsert) => void;
  onEditInsertDetails?: (insert: TimelineInsert) => void;
  /** Clicking a scene block jumps to the Scenes phase with this scene focused */
  onEditScene?: (scene: Scene, index: number) => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms}`;
}

function formatTick(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const secsStr = Number.isInteger(secs) ? secs.toString().padStart(2, "0") : secs.toFixed(1).padStart(3, "0");
  return `${mins}:${secsStr}`;
}

/* ------------------------------------------------------------------ */
/*  Lane layout constants (px) — must match the CSS heights below      */
/* ------------------------------------------------------------------ */
const RULER_H = 22;
const SCENES_H_COMPACT = 54;
const SCENES_H_EXPANDED = 74;
const OVERLAY_H = 34;
const LANE_H = 40;

/** Categories that live on the Sound layer */
const SOUND_CATEGORIES = new Set(["background_music", "sound_effects", "meditation"]);

const CATEGORY_ICON: Record<string, string> = {
  logo: "🏷️",
  call_to_action: "📣",
  stickers: "✨",
  content_cards: "📋",
  text_templates: "📜",
  lower_thirds: "👤",
  audio_visualizers: "📊",
  speech_reactive: "🎙️",
  special_effects: "⚡",
  branding: "🏷️",
  other_cards: "🪪",
  background_music: "🎵",
  sound_effects: "🔊",
  meditation: "🧘",
  filters: "🎨",
};

function categoryBadgeClass(category: string): string {
  switch (category) {
    case "stickers":
      return "bg-pink-600/90 border-pink-400 text-pink-100";
    case "content_cards":
    case "text_templates":
      return "bg-amber-600/90 border-amber-400 text-amber-100";
    case "lower_thirds":
      return "bg-violet-600/90 border-violet-400 text-violet-100";
    case "audio_visualizers":
    case "speech_reactive":
      return "bg-cyan-600/90 border-cyan-400 text-cyan-100";
    case "special_effects":
      return "bg-emerald-600/90 border-emerald-400 text-emerald-100";
    case "background_music":
      return "bg-teal-600/90 border-teal-400 text-teal-100";
    case "sound_effects":
      return "bg-orange-600/90 border-orange-400 text-orange-100";
    case "meditation":
      return "bg-teal-600/90 border-teal-400 text-teal-100";
    default:
      return "bg-indigo-600/90 border-indigo-400 text-indigo-100";
  }
}

interface DragState {
  id: string;
  mode: "move" | "start" | "end";
  pointerStartX: number;
  origStart: number;
  origDuration: number;
  moved: boolean;
}

const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8, 12];
const LS_EXPANDED = "scenering_timeline_expanded";
const LS_ZOOM = "scenering_timeline_zoom";

export default function Timeline({
  scenes,
  inserts,
  currentTime,
  totalDuration,
  isPlaying = false,
  selectedInsertId,
  onSeek,
  onTogglePlay,
  onSelectInsert,
  onDeleteInsert,
  onUpdateInsert,
  onEditInsertDetails,
  onEditScene,
}: TimelineProps) {
  /* ---------------- state ---------------- */
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_EXPANDED) === "1";
    } catch {
      return false;
    }
  });
  const [zoom, setZoom] = useState<number>(() => {
    try {
      const z = Number(localStorage.getItem(LS_ZOOM));
      return z >= 1 && z <= 12 ? z : 1;
    } catch {
      return 1;
    }
  });
  const [viewportW, setViewportW] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(LS_EXPANDED, expanded ? "1" : "0");
    } catch {}
  }, [expanded]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_ZOOM, String(zoom));
    } catch {}
  }, [zoom]);

  /* ---------------- durations ---------------- */
  const getSceneDuration = (s: Scene) => s.duration || calculateDynamicDuration(s.text, s.audio_duration);
  const scriptDuration = scenes.reduce((acc, s) => acc + getSceneDuration(s), 0);

  const introInsert = inserts.find((ins) => ins.category === "intro");
  const outroInsert = inserts.find((ins) => ins.category === "outro");
  const introDuration = introInsert ? introInsert.duration : 0;
  const outroDuration = outroInsert ? outroInsert.duration : 0;

  const calculatedTotal = totalDuration || introDuration + scriptDuration + outroDuration;
  const safeTotalDuration = Math.max(1, calculatedTotal);
  const selectedInsert = inserts.find((ins) => ins.id === selectedInsertId) || null;

  /* ---------------- geometry ---------------- */
  // Measure the scroll viewport so timeline geometry is pixel-exact.
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const update = () => setViewportW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const basePxPerSec = viewportW > 0 ? viewportW / safeTotalDuration : 10;
  const pxPerSec = basePxPerSec * zoom;
  const innerWidthPx = Math.max(1, safeTotalDuration * pxPerSec);
  const timeToPx = (t: number) => t * pxPerSec;
  const pxToTime = (px: number) => px / pxPerSec;
  const viewportDuration = viewportW > 0 ? viewportW / pxPerSec : safeTotalDuration;

  /* ---------------- scrolling helpers ---------------- */
  const ensureTimeVisible = (t: number) => {
    const el = scrollRef.current;
    if (!el || viewportW <= 0) return;
    const px = timeToPx(t);
    if (px < el.scrollLeft + 32 || px > el.scrollLeft + viewportW - 60) {
      el.scrollLeft = Math.max(0, px - viewportW / 2);
    }
  };

  const seekAndShow = (t: number) => {
    const clamped = Math.max(0, Math.min(safeTotalDuration, t));
    onSeek(clamped);
    ensureTimeVisible(clamped);
  };

  /** ◀ ▶ side arrows: step a chunk of the visible window (zoom-aware) */
  const sideStep = Math.max(0.5, viewportDuration * 0.25);

  /**
   * Live mirror of the values the wheel handler and zoom math need. The wheel
   * listener attaches ONCE and reads through this ref, so playhead updates
   * during playback don't churn listener registration.
   */
  const live = useRef({ zoom, pxPerSec, currentTime, viewportW, safeTotalDuration });
  live.current = { zoom, pxPerSec, currentTime, viewportW, safeTotalDuration };

  const applyZoom = (z: number, anchorTime?: number, anchorViewportX?: number) => {
    const clamped = Math.max(1, Math.min(12, z));
    const el = scrollRef.current;
    const s = live.current;
    setZoom(clamped);
    if (el && s.viewportW > 0) {
      // Keep an anchor point stable across the zoom (playhead for buttons,
      // cursor position for ctrl+wheel)
      const anchor = anchorTime ?? s.currentTime;
      const vpX = anchorViewportX ?? s.viewportW / 2;
      requestAnimationFrame(() => {
        const newPps = (s.viewportW / s.safeTotalDuration) * clamped;
        el.scrollLeft = Math.max(0, anchor * newPps - vpX);
      });
    }
  };

  const zoomStep = (dir: 1 | -1) => {
    const idx = ZOOM_STEPS.findIndex((s) => Math.abs(s - zoom) < 0.01);
    const cur = idx >= 0 ? idx : ZOOM_STEPS.reduce((best, s, i) => (Math.abs(s - zoom) < Math.abs(ZOOM_STEPS[best] - zoom) ? i : best), 0);
    const next = Math.max(0, Math.min(ZOOM_STEPS.length - 1, cur + dir));
    applyZoom(ZOOM_STEPS[next]);
  };

  // Ctrl/Cmd + wheel zooms around the cursor; plain wheel scrolls sideways.
  // Attached once — reads current values through the `live` ref.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const s = live.current;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const anchorTime = (el.scrollLeft + cursorX) / s.pxPerSec;
        const factor = e.deltaY < 0 ? 1.25 : 0.8;
        applyZoom(s.zoom * factor, anchorTime, cursorX);
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- ruler ticks ---------------- */
  const TICK_STEPS = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const tickStep = TICK_STEPS.find((s) => s * pxPerSec >= 72) ?? 600;
  const ticks: number[] = [];
  for (let t = 0; t <= safeTotalDuration + 1e-6; t += tickStep) {
    ticks.push(Math.round(t * 100) / 100);
  }

  /* ---------------- scrubbing (ruler & lane backgrounds) ---------------- */
  const scrubFromClientX = (clientX: number) => {
    if (!innerRef.current) return;
    const rect = innerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    onSeek(Math.max(0, Math.min(safeTotalDuration, pxToTime(x))));
  };

  const startScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsScrubbing(true);
    scrubFromClientX(e.clientX);
    const onMove = (ev: PointerEvent) => scrubFromClientX(ev.clientX);
    const onUp = () => {
      setIsScrubbing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /* ---------------- drag move / stretch on effect blocks ---------------- */
  const beginDrag = (e: React.PointerEvent, item: TimelineInsert, mode: DragState["mode"]) => {
    if (!onUpdateInsert || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      id: item.id,
      mode,
      pointerStartX: e.clientX,
      origStart: item.startTime,
      origDuration: item.duration,
      moved: false,
    };
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.pointerStartX;
      if (!d.moved && Math.abs(dx) < 4) return;
      if (!d.moved) {
        d.moved = true;
        setDraggingId(d.id);
        onSelectInsert(item);
      }
      const dt = dx / pxPerSec;
      const snap = (v: number) => Math.round(v * 10) / 10;
      const minDur = 0.3;

      if (d.mode === "move") {
        const maxStart = Math.max(0, safeTotalDuration - d.origDuration);
        const next = Math.max(0, Math.min(maxStart, snap(d.origStart + dt)));
        onUpdateInsert({ ...item, startTime: next });
      } else if (d.mode === "end") {
        const maxDur = safeTotalDuration - item.startTime;
        const next = Math.max(minDur, Math.min(maxDur, snap(d.origDuration + dt)));
        onUpdateInsert({ ...item, duration: next });
      } else {
        // "start" handle: shift start, keep the end fixed
        const end = Math.min(safeTotalDuration, d.origStart + d.origDuration);
        let nextStart = Math.max(0, Math.min(end - minDur, snap(d.origStart + dt)));
        onUpdateInsert({ ...item, startTime: nextStart, duration: Math.max(minDur, snap(end - nextStart)) });
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDraggingId(null);
      if (d?.moved) {
        // Swallow the click that follows a drag so it doesn't re-select
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 60);
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /* ---------------- scene / structure blocks ---------------- */
  interface TrackBlock {
    type: "intro" | "scene" | "outro";
    id: string;
    index?: number;
    title: string;
    description: string;
    start: number;
    duration: number;
    insert?: TimelineInsert;
    scene?: Scene;
  }

  const allBlocks: TrackBlock[] = [];
  let accumulatedTime = 0;

  if (introInsert) {
    allBlocks.push({
      type: "intro",
      id: introInsert.id,
      title: "🎬 Intro",
      description: introInsert.title || "Full Screen Intro Video / Image",
      start: 0,
      duration: introInsert.duration,
      insert: introInsert,
    });
    accumulatedTime += introInsert.duration;
  }

  scenes.forEach((s, idx) => {
    const start = accumulatedTime;
    const dur = getSceneDuration(s);
    accumulatedTime += dur;
    allBlocks.push({
      type: "scene",
      id: `scene-${s.id}`,
      index: idx,
      title: `Scene ${idx + 1}`,
      description: s.text,
      start,
      duration: dur,
      scene: s,
    });
  });

  if (outroInsert) {
    const dur = outroInsert.duration;
    allBlocks.push({
      type: "outro",
      id: outroInsert.id,
      title: "🏁 Outro",
      description: outroInsert.title || "Full Screen Outro Video / Image",
      start: accumulatedTime,
      duration: dur,
      insert: outroInsert,
    });
  }

  /* ---------------- overlay inserts split into layers ---------------- */
  const overlayInserts = inserts.filter((ins) => ins.category !== "intro" && ins.category !== "outro");
  const visualInserts = overlayInserts.filter((ins) => !SOUND_CATEGORIES.has(ins.category));
  const soundInserts = overlayInserts.filter((ins) => SOUND_CATEGORIES.has(ins.category));

  /* ---------------- shared effect-block renderer ---------------- */
  const renderEffectBlock = (item: TimelineInsert, compact: boolean) => {
    const clampedStart = Math.max(0, Math.min(item.startTime, safeTotalDuration - 0.2));
    const clampedDuration = Math.max(0.2, Math.min(item.duration, safeTotalDuration - clampedStart));
    const left = timeToPx(clampedStart);
    const width = Math.max(26, clampedDuration * pxPerSec);
    const isActive = currentTime >= clampedStart && currentTime <= clampedStart + clampedDuration;
    const isSelected = selectedInsertId === item.id;
    const isDragging = draggingId === item.id;
    const badgeColor = categoryBadgeClass(item.category);
    const icon = CATEGORY_ICON[item.category] || "🎬";
    const editable = Boolean(onUpdateInsert);

    return (
      <div
        key={item.id}
        onPointerDown={(e) => beginDrag(e, item, "move")}
        onClick={(e) => {
          e.stopPropagation();
          if (suppressClickRef.current) return;
          onSelectInsert(item);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!suppressClickRef.current) onEditInsertDetails?.(item);
        }}
        style={{ left, width, touchAction: "none" }}
        className={`absolute top-1/2 -translate-y-1/2 ${compact ? "h-6" : "h-7"} rounded-md border text-[10px] font-medium flex items-center px-0 shadow group/blk select-none ${badgeColor} ${
          editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
        } ${
          isDragging
            ? "ring-2 ring-yellow-300 z-30 brightness-110 shadow-xl"
            : isSelected
            ? "ring-2 ring-yellow-400 z-20 brightness-110"
            : isActive
            ? "ring-1 ring-white/80 z-10"
            : "opacity-90 hover:opacity-100"
        }`}
        title={`${item.title} (${clampedStart.toFixed(1)}s – ${(clampedStart + clampedDuration).toFixed(1)}s)\nDrag to move · drag the edge grips to stretch · double-click to edit`}
      >
        {/* left stretch grip */}
        {editable && (
          <div
            onPointerDown={(e) => beginDrag(e, item, "start")}
            className="h-full w-2.5 flex-shrink-0 cursor-ew-resize flex items-center justify-center rounded-l-md hover:bg-white/25"
            style={{ touchAction: "none" }}
            title="Drag to stretch the start"
          >
            <span className="block w-0.5 h-3 rounded-full bg-white/50" />
          </div>
        )}

        <span className="flex items-center gap-1 min-w-0 flex-1 px-0.5 pointer-events-none">
          <span className="t-ico flex-shrink-0">{icon}</span>
          {width > 46 && <span className="truncate">{item.title}</span>}
        </span>

        {/* quick actions — visible on hover or when selected */}
        {!isDragging && (
          <div
            className={`flex items-center gap-0.5 flex-shrink-0 pr-0.5 ${isSelected ? "" : "hidden group-hover/blk:flex"}`}
          >
            {onEditInsertDetails && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditInsertDetails(item);
                }}
                className="hover:text-yellow-200 text-[10px] opacity-75 hover:opacity-100 pointer-events-auto"
                title="Edit properties"
              >
                ✏️
              </button>
            )}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteInsert(item.id);
              }}
              className="w-4 h-4 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center text-[10px] font-bold transition-colors shadow-sm pointer-events-auto"
              title="Delete effect from timeline"
            >
              ✕
            </button>
          </div>
        )}

        {/* right stretch grip */}
        {editable && (
          <div
            onPointerDown={(e) => beginDrag(e, item, "end")}
            className="h-full w-2.5 flex-shrink-0 cursor-ew-resize flex items-center justify-center rounded-r-md hover:bg-white/25 ml-auto"
            style={{ touchAction: "none" }}
            title="Drag to stretch the end"
          >
            <span className="block w-0.5 h-3 rounded-full bg-white/50" />
          </div>
        )}
      </div>
    );
  };

  /* ---------------- lane label chip (pinned to viewport left) ----------------
     Positioned over the scroll viewport's left edge: 38px for the ◀ arrow +
     gap, then a small inset so it never covers the arrow button. */
  const laneChip = (top: number, label: string, icon: string) => (
    <div
      className="absolute z-30 pointer-events-none flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-950/85 border border-hairline text-[9px] font-bold uppercase tracking-wider text-gray-300 shadow"
      style={{ top, left: 42 }}
    >
      <span className="t-ico">{icon}</span>
      <span>{label}</span>
    </div>
  );

  const scenesHeight = expanded ? SCENES_H_EXPANDED : SCENES_H_COMPACT;
  const rulerTop = 0;
  const scenesTop = rulerTop + RULER_H;
  const overlayTop = scenesTop + scenesHeight;
  const visualTop = overlayTop;
  const soundTop = visualTop + LANE_H;
  const tracksHeight = expanded
    ? soundTop + LANE_H
    : overlayTop + OVERLAY_H;

  const playheadX = timeToPx(Math.max(0, Math.min(safeTotalDuration, currentTime)));

  return (
    <div className="bg-gray-900/90 border border-hairline rounded-xl p-3.5 space-y-3 shadow-lg select-none">
      {/* ============ Header: transport + zoom + expand ============ */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePlay}
            className="t-btn-hero w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-colors shadow"
            title={isPlaying ? "Pause Preview" : "Play Preview"}
          >
            {isPlaying ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* step back / forward */}
          <button
            onClick={() => seekAndShow(currentTime - 1)}
            className="t-btn-hero-ghost w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm flex items-center justify-center transition-colors"
            title="Step back 1 second"
          >
            ◀
          </button>
          <button
            onClick={() => seekAndShow(currentTime + 1)}
            className="t-btn-hero-ghost w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm flex items-center justify-center transition-colors"
            title="Step forward 1 second"
          >
            ▶
          </button>

          <div className="flex items-baseline gap-1.5 font-mono text-xs">
            <span className="text-white font-bold">{formatTime(currentTime)}</span>
            <span className="text-gray-500">/</span>
            <span className="text-gray-400">{formatTime(safeTotalDuration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom: stretch / shrink the timeline for more or less detail */}
          <div className="flex items-center gap-1.5 bg-gray-800/70 border border-hairline rounded-lg px-2 py-1" title="Timeline zoom — more or less detail (Ctrl+scroll works too)">
            <button
              type="button"
              onClick={() => zoomStep(-1)}
              disabled={zoom <= 1}
              className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 text-xs font-bold flex items-center justify-center"
              title="Zoom out (shrink timeline)"
            >
              −
            </button>
            <input
              type="range"
              min={0}
              max={ZOOM_STEPS.length - 1}
              step={1}
              value={Math.max(
                0,
                ZOOM_STEPS.reduce(
                  (best, s, i) => (Math.abs(s - zoom) < Math.abs(ZOOM_STEPS[best] - zoom) ? i : best),
                  0
                )
              )}
              onChange={(e) => applyZoom(ZOOM_STEPS[Number(e.target.value)])}
              className="w-20 sm:w-28 accent-indigo-500 cursor-pointer"
              title="Timeline zoom level"
            />
            <button
              type="button"
              onClick={() => zoomStep(1)}
              disabled={zoom >= 12}
              className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 text-xs font-bold flex items-center justify-center"
              title="Zoom in (stretch timeline)"
            >
              +
            </button>
            <span className="font-mono text-[10px] text-indigo-300 w-9 text-right">{Math.round(zoom * 100)}%</span>
            {zoom > 1 && (
              <button
                type="button"
                onClick={() => applyZoom(1)}
                className="px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-[10px] font-semibold"
                title="Fit the whole video"
              >
                Fit
              </button>
            )}
          </div>

          {/* Expand / contract layers */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="t-btn-hero-ghost px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-hairline text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title={expanded ? "Contract to a single compact view" : "Expand to show the Visual FX and Sound layers"}
          >
            <span className={`inline-block transition-transform duration-200 ${expanded ? "" : "rotate-180"}`}>▲</span>
            <span className="hidden sm:inline">{expanded ? "Contract" : "Expand"}</span>
          </button>
        </div>
      </div>

      {/* ============ Track area with ◀ ▶ arrows on both sides ============ */}
      <div className="relative">
        <div className="flex items-stretch gap-1.5">
          {/* left arrow */}
          <button
            type="button"
            onClick={() => seekAndShow(currentTime - sideStep)}
            className="t-btn-hero-ghost w-8 rounded-lg bg-gray-800/80 hover:bg-gray-700 border border-hairline text-gray-200 text-sm font-bold flex items-center justify-center transition-colors flex-shrink-0"
            title={`Back ${sideStep.toFixed(1)}s in the video`}
          >
            ‹
          </button>

          {/* scrolling track viewport */}
          <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden rounded-lg border border-hairline bg-gray-950 no-scrollbar">
            <div ref={innerRef} className="relative" style={{ width: innerWidthPx, height: tracksHeight }}>
              {/* ---- time ruler ---- */}
              <div
                className="absolute inset-x-0 border-b border-hairline cursor-ew-resize"
                style={{ top: rulerTop, height: RULER_H }}
                onPointerDown={startScrub}
              >
                {ticks.map((t) => (
                  <div key={t} className="absolute top-0 bottom-0 border-l border-hairline" style={{ left: timeToPx(t) }}>
                    <span className="absolute left-1 top-0.5 text-[8px] font-mono text-gray-500 whitespace-nowrap">
                      {formatTick(t)}
                    </span>
                  </div>
                ))}
              </div>

              {/* ---- scenes lane ---- */}
              <div
                className="absolute inset-x-0 border-b border-hairline"
                style={{ top: scenesTop, height: scenesHeight }}
                onPointerDown={startScrub}
              >
                {allBlocks.map((block) => {
                  const isCurrent = currentTime >= block.start && currentTime < block.start + block.duration;
                  const isIntro = block.type === "intro";
                  const isOutro = block.type === "outro";
                  const isSelected = block.insert && selectedInsertId === block.insert.id;
                  const left = timeToPx(block.start);
                  const width = Math.max(block.type === "scene" ? 34 : 30, block.duration * pxPerSec);
                  const sceneThumb = block.scene?.image_url;
                  const sceneHasVideo = Boolean(block.scene?.video_url);

                  return (
                    <div
                      key={block.id}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSeek(block.start);
                        if (block.insert) {
                          onSelectInsert(block.insert);
                        } else if (block.scene && onEditScene) {
                          // Scenes open their own editor frame in the Scenes phase
                          onEditScene(block.scene, block.index ?? 0);
                        }
                      }}
                      onDoubleClick={(e) => {
                        if (block.insert) {
                          e.stopPropagation();
                          onEditInsertDetails?.(block.insert);
                        }
                      }}
                      style={{ left, width }}
                      className={`absolute top-1 bottom-1 rounded-md border overflow-hidden transition-all flex ${
                        isIntro
                          ? isCurrent
                            ? "bg-amber-950/70 border-amber-400 ring-1 ring-amber-400 z-10"
                            : isSelected
                            ? "bg-amber-950/50 border-amber-400"
                            : "bg-amber-950/30 hover:bg-amber-950/50 border-amber-700/60"
                          : isOutro
                          ? isCurrent
                            ? "bg-rose-950/70 border-rose-500 ring-1 ring-rose-400 z-10"
                            : isSelected
                            ? "bg-rose-950/50 border-rose-400"
                            : "bg-rose-950/30 hover:bg-rose-950/50 border-rose-700/60"
                          : isCurrent
                          ? "bg-indigo-950/60 border-indigo-500/80 z-10"
                          : "bg-gray-900/50 hover:bg-gray-900/80 border-hairline hover:border-indigo-500/50"
                      } ${block.scene && onEditScene ? "cursor-pointer" : "cursor-pointer"}`}
                      title={
                        isIntro
                          ? "Intro: full-screen opening. Click to select, double-click to configure."
                          : isOutro
                          ? "Outro: full-screen closing. Click to select, double-click to configure."
                          : `Scene ${(block.index ?? 0) + 1} — click to open it in the Scenes editor`
                      }
                    >
                      {/* thumbnail preview */}
                      {expanded && (
                        <div className="w-12 flex-shrink-0 bg-black/50 border-r border-black/40 flex items-center justify-center overflow-hidden">
                          {sceneThumb ? (
                            <img src={sceneThumb} alt="" className="w-full h-full object-cover" draggable={false} />
                          ) : sceneHasVideo ? (
                            <span className="text-sm" title="Video clip">🎞️</span>
                          ) : isIntro ? (
                            <span className="text-sm">🎬</span>
                          ) : isOutro ? (
                            <span className="text-sm">🏁</span>
                          ) : (
                            <span className="text-[9px] text-gray-600">img</span>
                          )}
                        </div>
                      )}

                      <div className="flex-1 min-w-0 px-1.5 py-1 flex flex-col justify-center pointer-events-none">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-[10px] font-bold truncate flex items-center gap-1 ${
                              isIntro ? "text-amber-300" : isOutro ? "text-rose-300" : "text-gray-200"
                            }`}
                          >
                            {block.type === "scene" && <span className="t-ico">✏️</span>}
                            {block.title}
                          </span>
                          {width > 74 && (
                            <span
                              className={`text-[8px] font-mono flex-shrink-0 ${
                                isIntro ? "text-amber-400" : isOutro ? "text-rose-400" : "text-gray-500"
                              }`}
                            >
                              {Math.round(block.duration * 10) / 10}s
                            </span>
                          )}
                        </div>
                        {expanded && width > 90 && (
                          <p className="text-[8px] text-gray-500 truncate mt-0.5">
                            {block.scene && !sceneThumb && !sceneHasVideo ? "no image yet · " : ""}
                            {block.type === "scene" ? "click to edit frame & options" : block.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ---- compact: single combined overlay lane ---- */}
              {!expanded && (
                <div
                  className="absolute inset-x-0"
                  style={{ top: overlayTop, height: OVERLAY_H }}
                  onPointerDown={startScrub}
                >
                  {overlayInserts.map((item) => renderEffectBlock(item, true))}
                </div>
              )}

              {/* ---- expanded: Visual FX layer ---- */}
              {expanded && (
                <div
                  className="absolute inset-x-0 border-b border-hairline bg-gray-900/20"
                  style={{ top: visualTop, height: LANE_H }}
                  onPointerDown={startScrub}
                >
                  {visualInserts.length === 0 && (
                    <div className="absolute left-24 top-1/2 -translate-y-1/2 text-[9px] text-gray-600 italic">
                      No visual effects yet — add stickers, text, visualisers…
                    </div>
                  )}
                  {visualInserts.map((item) => renderEffectBlock(item, false))}
                </div>
              )}

              {/* ---- expanded: Sound layer ---- */}
              {expanded && (
                <div
                  className="absolute inset-x-0 bg-teal-950/10"
                  style={{ top: soundTop, height: LANE_H }}
                  onPointerDown={startScrub}
                >
                  {soundInserts.length === 0 && (
                    <div className="absolute left-24 top-1/2 -translate-y-1/2 text-[9px] text-gray-600 italic">
                      No sounds yet — add music or sound effects…
                    </div>
                  )}
                  {soundInserts.map((item) => renderEffectBlock(item, false))}
                </div>
              )}

              {/* ---- playhead ---- */}
              <div
                style={{ left: playheadX }}
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.8)]"
              >
                <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 bg-red-500 rounded-full border border-white shadow" />
              </div>
            </div>
          </div>

          {/* right arrow */}
          <button
            type="button"
            onClick={() => seekAndShow(currentTime + sideStep)}
            className="t-btn-hero-ghost w-8 rounded-lg bg-gray-800/80 hover:bg-gray-700 border border-hairline text-gray-200 text-sm font-bold flex items-center justify-center transition-colors flex-shrink-0"
            title={`Forward ${sideStep.toFixed(1)}s in the video`}
          >
            ›
          </button>
        </div>

        {/* pinned lane labels (visible while scrolling horizontally) */}
        {expanded && laneChip(visualTop + 4, "Visual FX", "🎞️")}
        {expanded && laneChip(soundTop + 4, "Sound", "🔊")}
        {expanded && laneChip(scenesTop + 4, "Scenes", "📝")}
      </div>

      {/* ============ footer: selection info / hints ============ */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
        <div>
          {selectedInsert ? (
            <div className="flex flex-wrap items-center gap-2 bg-indigo-950/60 border border-indigo-700/60 px-2.5 py-1 rounded-lg">
              <span className="text-yellow-400 font-semibold flex items-center gap-1">
                <span className="t-ico">{CATEGORY_ICON[selectedInsert.category] || "🎬"}</span>
                Selected: {selectedInsert.title}
              </span>
              <span className="text-gray-400 font-mono text-[10px]">
                ({selectedInsert.startTime.toFixed(1)}s – {(selectedInsert.startTime + selectedInsert.duration).toFixed(1)}s)
              </span>
              {onEditInsertDetails && (
                <button
                  type="button"
                  onClick={() => onEditInsertDetails(selectedInsert)}
                  className="t-card-cta-ghost px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-yellow-300 text-[10px] font-medium border border-hairline ml-1"
                >
                  ✏️ Edit
                </button>
              )}
              <button
                type="button"
                onClick={() => onDeleteInsert(selectedInsert.id)}
                className="px-2 py-0.5 rounded bg-red-950 hover:bg-red-800 text-red-200 text-[10px] font-medium border border-red-700/70"
              >
                🗑️ Delete Effect
              </button>
            </div>
          ) : inserts.length === 0 ? (
            <span className="text-gray-500">
              No inserts yet. Pick an effect from Video Studio below to place it at the red playhead line!
            </span>
          ) : (
            <span className="text-gray-400">
              {overlayInserts.length} effect{overlayInserts.length === 1 ? "" : "s"} on the timeline
              {expanded ? ` · ${visualInserts.length} visual · ${soundInserts.length} sound` : ""}.
              Drag to move, pull the edge grips to stretch, click a scene to edit it.
            </span>
          )}
        </div>
        <div className="font-mono text-[10px] text-gray-400 flex items-center gap-3">
          <span>
            Playhead: <span className="text-amber-300 font-bold">{formatTime(currentTime)}</span>
          </span>
          {isPlaying && <span className="text-emerald-300 font-bold animate-pulse">▶ playing</span>}
        </div>
      </div>
    </div>
  );
}
