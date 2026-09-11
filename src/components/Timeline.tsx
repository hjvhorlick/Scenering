import React, { useRef, useState } from "react";
import { Scene, TimelineInsert } from "../types";

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

  const calculatedTotal = totalDuration || scenes.reduce((acc, s) => acc + (s.duration || 4), 0);
  const safeTotalDuration = Math.max(1, calculatedTotal);
  const progressRatio = Math.min(1, Math.max(0, currentTime / safeTotalDuration));

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

  // Calculate cumulative scene time boundaries
  let accumulatedTime = 0;
  const sceneBlocks = scenes.map((s, idx) => {
    const start = accumulatedTime;
    const dur = s.duration;
    accumulatedTime += dur;
    return {
      scene: s,
      index: idx,
      start,
      duration: dur,
      leftPct: (start / safeTotalDuration) * 100,
      widthPct: (dur / safeTotalDuration) * 100,
    };
  });

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
        {/* Scene Blocks Layer */}
        <div className="absolute inset-0 flex">
          {sceneBlocks.map((block) => (
            <div
              key={block.scene.id}
              style={{ width: `${block.widthPct}%` }}
              className={`h-full border-r border-gray-800/80 px-2 py-1.5 flex flex-col justify-between overflow-hidden transition-colors ${
                currentTime >= block.start && currentTime < block.start + block.duration
                  ? "bg-indigo-950/30"
                  : "bg-gray-900/40 hover:bg-gray-900/60"
              }`}
            >
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-gray-300 truncate">
                  Scene {block.index + 1}
                </span>
                <span className="text-gray-500 text-[9px] font-mono">
                  {block.duration}s
                </span>
              </div>
              <p className="text-[9px] text-gray-400 truncate opacity-70">
                {block.scene.text}
              </p>
            </div>
          ))}
        </div>

        {/* Timeline Inserts Layer */}
        <div className="absolute top-7 inset-x-0 bottom-1 flex items-center pointer-events-none px-1">
          {inserts.map((item) => {
            const leftPct = (item.startTime / safeTotalDuration) * 100;
            const widthPct = Math.max(3, (item.duration / safeTotalDuration) * 100);
            const isActive = currentTime >= item.startTime && currentTime <= item.startTime + item.duration;

            let badgeColor = "bg-indigo-600/90 border-indigo-400 text-indigo-100";
            if (item.category === "stickers") badgeColor = "bg-pink-600/90 border-pink-400 text-pink-100";
            if (item.category === "content_cards") badgeColor = "bg-amber-600/90 border-amber-400 text-amber-100";
            if (item.category === "audio_visualizers" || item.category === "speech_reactive") badgeColor = "bg-cyan-600/90 border-cyan-400 text-cyan-100";
            if (item.category === "special_effects") badgeColor = "bg-emerald-600/90 border-emerald-400 text-emerald-100";

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
                className={`absolute pointer-events-auto h-6 rounded-md border text-[10px] font-medium flex items-center justify-between px-1.5 cursor-pointer shadow transition-all hover:scale-105 ${badgeColor} ${
                  isSelected
                    ? "ring-2 ring-yellow-400 ring-offset-1 ring-offset-gray-950 scale-105 z-10 brightness-110"
                    : isActive
                    ? "ring-2 ring-white ring-offset-1 ring-offset-gray-950 scale-102"
                    : "opacity-85"
                }`}
                title={`${item.title} (${item.startTime.toFixed(1)}s - ${(item.startTime + item.duration).toFixed(1)}s) — Click to select, double-click to edit`}
              >
                <span className="truncate pr-1">{item.title}</span>
                <div className="flex items-center gap-1">
                  {onEditInsertDetails && (
                    <button
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
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteInsert(item.id);
                    }}
                    className="hover:text-red-300 text-xs opacity-75 hover:opacity-100"
                    title="Delete insert"
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
      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <div>
          {inserts.length === 0 ? (
            <span>No inserts yet. Pick an effect from Video Studio below to insert at the red playhead line!</span>
          ) : (
            <span>{inserts.length} element{inserts.length === 1 ? "" : "s"} on timeline. Click any badge to customize.</span>
          )}
        </div>
        <div className="font-mono text-[10px]">
          Target: {formatTime(currentTime)}
        </div>
      </div>
    </div>
  );
}
