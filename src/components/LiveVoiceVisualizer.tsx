import { useEffect, useMemo, useRef, useState } from "react";
import { getPresetCoords, renderTimelineInsert } from "../lib/render-effects";
import { startPreviewLoop } from "../lib/preview-loop";
import { CATALOG_ITEMS } from "../lib/video-studio-catalog";
import { EMPTY_BUS, AudioFrame } from "../lib/audio-reactive";
import {
  addVoiceListener,
  hasVoiceSignal,
  readVoiceBus,
  resetVoiceSignal,
} from "../lib/voice-monitor";
import type { TimelineInsert } from "../types";
import Icon from "./icons/Icon";

/**
 * The voice, drawn while you listen to it.
 *
 * This is not a decorative waveform: it is the studio's own visualiser
 * renderer (`renderTimelineInsert`, the function that paints the finished
 * video) fed by a live analyser on the narration. What you see here while
 * auditioning a line is what the same visualiser puts on the video, which is
 * why the picker below it is the real catalogue rather than a list of names.
 *
 * Honesty: server voices go through Web Audio and can be measured, so the
 * badge says "Live". Browser speech-synthesis voices expose no audio node at
 * all — nothing in any browser can read them — so the panel says so and keeps
 * still rather than inventing movement.
 */

/** The voice-shaped visualisers, in catalogue order. */
export const VOICE_VISUALIZERS = (CATALOG_ITEMS.audio_visualizers ?? []).filter(
  (item) => item.subCategory === "speech"
);

export const DEFAULT_VOICE_VISUALIZER = "minimal_voice";
const STORAGE_KEY = "scenering_voice_monitor_style";

export function loadVoiceVisualizerChoice(): string {
  if (typeof localStorage === "undefined") return DEFAULT_VOICE_VISUALIZER;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && VOICE_VISUALIZERS.some((v) => v.type === saved)) return saved;
  } catch {}
  return DEFAULT_VOICE_VISUALIZER;
}

export function saveVoiceVisualizerChoice(type: string) {
  try {
    localStorage.setItem(STORAGE_KEY, type);
  } catch {}
}

export default function LiveVoiceVisualizer({
  type = DEFAULT_VOICE_VISUALIZER,
  playing,
  height = 92,
  className = "",
}: {
  /** Which visualiser to draw — a real `audio_visualizers` catalogue type. */
  type?: string;
  /** Is a voice being played right now? */
  playing: boolean;
  height?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [live, setLive] = useState(false);

  const item = useMemo(
    () =>
      (CATALOG_ITEMS.audio_visualizers ?? []).find((entry) => entry.type === type) ||
      VOICE_VISUALIZERS[0] ||
      null,
    [type]
  );

  // Tell the voice player that somebody is listening. Until this runs, voices
  // are played without any Web Audio routing at all.
  useEffect(() => addVoiceListener(), []);

  useEffect(() => {
    if (!playing) {
      resetVoiceSignal();
      setLive(false);
    }
  }, [playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !item) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const insert = {
      id: `voice-monitor-${item.type}`,
      category: item.category,
      type: item.type,
      title: item.name,
      startTime: 0,
      duration: 99999,
      // Monitors are read at a glance, so the visualiser is centred in its
      // panel instead of tucked into the corner it defaults to on video.
      position: { ...getPresetCoords((item.defaultPosition as never) || "center"), y: 0.55 },
      presetPosition: undefined,
      size: item.defaultSize || 1,
      opacity: 1,
      audioSource: "voice",
      content: {},
      visualOptions: item.defaultVisualOptions ? { ...item.defaultVisualOptions } : undefined,
      audioSettings: {},
    } as unknown as TimelineInsert;

    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    let wasLive = false;

    const paintStage = (w: number, h: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      const stage = ctx.createLinearGradient(0, 0, 0, h);
      stage.addColorStop(0, "#0b1020");
      stage.addColorStop(0.6, "#131a2e");
      stage.addColorStop(1, "#070a14");
      ctx.fillStyle = stage;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.55);
      ctx.lineTo(w, h * 0.55);
      ctx.stroke();
    };

    const draw = (now: number) => {
      const w = canvas.width;
      const h = canvas.height;
      paintStage(w, h);

      if (!playing) return;

      const bus = readVoiceBus();
      const signal = hasVoiceSignal();
      if (signal !== wasLive) {
        wasLive = signal;
        setLive(signal);
      }

      // With a real signal the visualiser is driven by the voice. Without one
      // (browser speech synthesis) there is nothing to draw, so nothing moves.
      if (!signal) return;

      const frame: AudioFrame = { voice: bus, music: EMPTY_BUS };
      renderTimelineInsert(
        ctx,
        insert,
        (now - startedAt) / 1000,
        w,
        h,
        Math.max(0.05, bus.level),
        bus.freq,
        frame
      );
    };

    return startPreviewLoop(canvas, draw, { fps: 30 });
  }, [item, playing]);

  if (!item) return null;

  return (
    <div
      className={`relative rounded-xl overflow-hidden border border-hairline bg-gray-950 shadow-inner ${className}`}
      style={{ height }}
    >
      <canvas ref={canvasRef} width={768} height={220} className="w-full h-full object-cover" />

      <div className="absolute top-1.5 left-2 flex items-center gap-1.5">
        <span className="text-[10px] font-medium text-gray-300/90 bg-black/40 rounded-md px-1.5 py-0.5 backdrop-blur-sm">
          <Icon glyph={item.icon} /> {item.name}
        </span>
      </div>

      <div className="absolute bottom-1.5 right-2 flex items-center gap-1.5">
        {playing && live ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">
              Live · same engine as render
            </span>
          </>
        ) : (
          <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">
            {playing ? "No signal to read from this voice" : "Plays with the narration"}
          </span>
        )}
      </div>
    </div>
  );
}
