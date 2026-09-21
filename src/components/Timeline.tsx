import React, { useRef, useState } from "react";
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
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms}`;
}

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
  onEditInsertDetails,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const getSceneDuration = (s: Scene) => s.duration || calculateDynamicDuration(s.text, s.audio_duration);
  const scriptDuration = scenes.reduce((acc, s) => acc + getSceneDuration(s), 0);

  const introInsert = inserts.find((ins) => ins.category === "intro");
  const outroInsert = inserts.find((ins) => ins.category === "outro");
  const introDuration = introInsert ? introInsert.duration : 0;
  const outroDuration = outroInsert ? outroInsert.duration : 0;

  const calculatedTotal = totalDuration || (introDuration + scriptDuration + outroDuration);
  const safeTotalDuration = Math.max(1, calculatedTotal);
  const progressRatio = Math.min(1, Math.max(0, currentTime / safeTotalDuration));
  const selectedInsert = inserts.find((ins) => ins.id === selectedInsertId) || null;

  // Handle scrubber click or drag
  const handleScrub = (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * safeTotalDuration);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    handleScrub(e);

    const onMouseMove = (moveEvent: MouseEvent) => {
      handleScrub(moveEvent);
    };

    const onMouseUp = () => {
      setIsScrubbing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Calculate cumulative timeline scene blocks including Intro at beginning and Outro at end
  let accumulatedTime = 0;
  
  const allBlocks: Array<{
    type: "intro" | "scene" | "outro";
    id: string;
    index?: number;
    title: string;
    description: string;
    start: number;
    duration: number;
    leftPct: number;
    widthPct: number;
    insert?: TimelineInsert;
    scene?: Scene;
  }> = [];

  // 1. Intro block if present
  if (introInsert) {
    const dur = introInsert.duration;
    allBlocks.push({
      type: "intro",
      id: introInsert.id,
      title: "🎬 Intro Scene",
      description: introInsert.title || "Full Screen Intro Video / Image",
      start: 0,
      duration: dur,
      leftPct: 0,
      widthPct: (dur / safeTotalDuration) * 100,
      insert: introInsert,
    });
    accumulatedTime += dur;
  }

  // 2. Script scenes
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
      leftPct: (start / safeTotalDuration) * 100,
      widthPct: (dur / safeTotalDuration) * 100,
      scene: s,
    });
  });

  // 3. Outro block if present
  if (outroInsert) {
    const dur = outroInsert.duration;
    const start = accumulatedTime;
    allBlocks.push({
      type: "outro",
      id: outroInsert.id,
      title: "🏁 Outro Scene",
      description: outroInsert.title || "Full Screen Outro Video / Image",
      start,
      duration: dur,
      leftPct: (start / safeTotalDuration) * 100,
      widthPct: (dur / safeTotalDuration) * 100,
      insert: outroInsert,
    });
    accumulatedTime += dur;
  }

  // Overlay inserts (stickers, text cards, visualizers, SFX) excluding full-screen intro/outro scenes
  const overlayInserts = inserts.filter(
    (ins) => ins.category !== "intro" && ins.category !== "outro"
  );

  return (
    <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-3.5 space-y-3 shadow-lg select-none">
      {/* Playhead Top Controls Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onTogglePlay}
            className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-colors shadow"
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

          <button
            onClick={() => onSeek(Math.max(0, currentTime - 1))}
            className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs flex items-center justify-center transition-colors"
            title="Step Back 1s"
          >
            -1s
          </button>
          <button
            onClick={() => onSeek(Math.min(safeTotalDuration, currentTime + 1))}
            className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs flex items-center justify-center transition-colors"
            title="Step Forward 1s"
          >
            +1s
          </button>

          <div className="flex items-baseline gap-1.5 font-mono text-xs">
            <span className="text-white font-bold">{formatTime(currentTime)}</span>
            <span className="text-gray-500">/</span>
            <span className="text-gray-400">{formatTime(safeTotalDuration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span>Playhead Timeline</span>
        </div>
      </div>

      {/* Main Timeline Scrubber Area */}
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        className="relative h-20 bg-gray-950 border border-gray-800 rounded-lg overflow-hidden cursor-pointer group"
      >
        {/* Scene Blocks Layer (Intro + Script Scenes + Outro) */}
        <div className="absolute inset-0 flex">
          {allBlocks.map((block) => {
            const isCurrent = currentTime >= block.start && currentTime < block.start + block.duration;
            const isIntro = block.type === "intro";
            const isOutro = block.type === "outro";
            const isSelected = block.insert && selectedInsertId === block.insert.id;

            return (
              <div
                key={block.id}
                onClick={(e) => {
                  if (block.insert) {
                    e.stopPropagation();
                    onSeek(block.start);
                    onSelectInsert(block.insert);
                  }
                }}
                onDoubleClick={(e) => {
                  if (block.insert) {
                    e.stopPropagation();
                    onEditInsertDetails?.(block.insert);
                  }
                }}
                style={{ width: `${block.widthPct}%` }}
                className={`h-full border-r px-2 py-1.5 flex flex-col justify-between overflow-hidden transition-all select-none ${
                  isIntro
                    ? isCurrent
                      ? "bg-amber-950/70 border-amber-500/80 ring-2 ring-amber-400 inset-0 z-10"
                      : isSelected
                      ? "bg-amber-950/50 border-amber-400"
                      : "bg-amber-950/30 hover:bg-amber-950/50 border-amber-700/60"
                    : isOutro
                    ? isCurrent
                      ? "bg-rose-950/70 border-rose-500/80 ring-2 ring-rose-400 inset-0 z-10"
                      : isSelected
                      ? "bg-rose-950/50 border-rose-400"
                      : "bg-rose-950/30 hover:bg-rose-950/50 border-rose-700/60"
                    : isCurrent
                    ? "bg-indigo-950/50 border-indigo-500/60"
                    : "bg-gray-900/40 hover:bg-gray-900/60 border-gray-800/80"
                }`}
                title={
                  isIntro
                    ? "Intro Scene: Full-screen video/image insert (No captions or speech voiceover). Click to select & configure."
                    : isOutro
                    ? "Outro Scene: Full-screen video/image insert (No captions or speech voiceover). Click to select & configure."
                    : `Scene ${(block.index ?? 0) + 1}`
                }
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span
                    className={`font-bold truncate flex items-center gap-1 ${
                      isIntro
                        ? "text-amber-300"
                        : isOutro
                        ? "text-rose-300"
                        : "text-gray-300"
                    }`}
                  >
                    <span>{block.title}</span>
                    {(isIntro || isOutro) && (
                      <span className="text-[8px] uppercase tracking-wider px-1 rounded bg-black/40 text-gray-300 font-mono">
                        Full Screen
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-[9px] font-mono ${
                      isIntro
                        ? "text-amber-400"
                        : isOutro
                        ? "text-rose-400"
                        : "text-gray-500"
                    }`}
                  >
                    {block.duration}s
                  </span>
                </div>
                <p
                  className={`text-[9px] truncate ${
                    isIntro
                      ? "text-amber-200/80 font-medium"
                      : isOutro
                      ? "text-rose-200/80 font-medium"
                      : "text-gray-400 opacity-70"
                  }`}
                >
                  {isIntro || isOutro
                    ? `${block.description} · [No Captions / Voice]`
                    : block.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Timeline Overlay Inserts Layer (Stickers, Text Cards, Visualizers, SFX) */}
        <div className="absolute top-7 inset-x-0 bottom-1 flex items-center pointer-events-none px-1">
          {overlayInserts.map((item) => {
            // Strictly clamp insert start and duration so it never runs over the end of the video
            const clampedStart = Math.min(item.startTime, Math.max(0, safeTotalDuration - 0.2));
            const clampedDuration = Math.min(item.duration, Math.max(0.2, safeTotalDuration - clampedStart));
            const leftPct = (clampedStart / safeTotalDuration) * 100;
            const widthPct = Math.min(100 - leftPct, Math.max(4, (clampedDuration / safeTotalDuration) * 100));
            const isActive = currentTime >= clampedStart && currentTime <= clampedStart + clampedDuration;

            let badgeColor = "bg-indigo-600/90 border-indigo-400 text-indigo-100";
            if (item.category === "stickers") badgeColor = "bg-pink-600/90 border-pink-400 text-pink-100";
            else if (item.category === "content_cards" || item.category === "text_templates") badgeColor = "bg-amber-600/90 border-amber-400 text-amber-100";
            else if (item.category === "lower_thirds") badgeColor = "bg-violet-600/90 border-violet-400 text-violet-100";
            else if (item.category === "audio_visualizers" || item.category === "speech_reactive") badgeColor = "bg-cyan-600/90 border-cyan-400 text-cyan-100";
            else if (item.category === "special_effects") badgeColor = "bg-emerald-600/90 border-emerald-400 text-emerald-100";

            const isSelected = selectedInsertId === item.id;

            return (
              <div
                key={item.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectInsert(item);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onEditInsertDetails?.(item);
                }}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                className={`absolute pointer-events-auto h-6 min-w-[56px] rounded-md border text-[10px] font-medium flex items-center justify-between px-1.5 cursor-pointer shadow transition-all hover:scale-102 ${badgeColor} ${
                  isSelected
                    ? "ring-2 ring-yellow-400 ring-offset-1 ring-offset-gray-950 scale-105 z-20 brightness-110"
                    : isActive
                    ? "ring-2 ring-white ring-offset-1 ring-offset-gray-950 scale-102 z-10"
                    : "opacity-90"
                }`}
                title={`${item.title} (${clampedStart.toFixed(1)}s - ${(clampedStart + clampedDuration).toFixed(1)}s) — Click to select, double-click to edit`}
              >
                <span className="truncate pr-1 select-none">{item.title}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {onEditInsertDetails && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditInsertDetails(item);
                      }}
                      className="hover:text-yellow-200 text-[10px] opacity-75 hover:opacity-100"
                      title="Edit properties"
                    >
                      ✏️
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onDeleteInsert(item.id);
                    }}
                    className="w-4 h-4 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center text-[10px] font-bold transition-colors shadow-sm"
                    title="Delete effect from timeline"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Playhead Vertical Cursor */}
        <div
          style={{ left: `${progressRatio * 100}%` }}
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.8)]"
        >
          {/* Cursor Head Knob */}
          <div className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white shadow" />
        </div>
      </div>

      {/* Inserts count & quick note */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
        <div>
          {selectedInsert ? (
            <div className="flex items-center gap-2 bg-indigo-950/60 border border-indigo-700/60 px-2.5 py-1 rounded-lg">
              <span className="text-yellow-400 font-semibold">Selected: {selectedInsert.title}</span>
              <span className="text-gray-400 font-mono text-[10px]">
                ({selectedInsert.startTime.toFixed(1)}s - {(selectedInsert.startTime + selectedInsert.duration).toFixed(1)}s)
              </span>
              {onEditInsertDetails && (
                <button
                  type="button"
                  onClick={() => onEditInsertDetails(selectedInsert)}
                  className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-yellow-300 text-[10px] font-medium border border-gray-700 ml-1"
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
            <span className="text-gray-500">No inserts yet. Pick an effect from Video Studio below to insert at the red playhead line!</span>
          ) : (
            <span className="text-gray-400">{inserts.length} element{inserts.length === 1 ? "" : "s"} on timeline. Click any badge to customize or delete.</span>
          )}
        </div>
        <div className="font-mono text-[10px] text-gray-400">
          Playhead: <span className="text-amber-300 font-bold">{formatTime(currentTime)}</span>
        </div>
      </div>
    </div>
  );
}
