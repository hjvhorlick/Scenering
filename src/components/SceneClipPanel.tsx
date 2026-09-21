import { useEffect, useRef, useState } from "react";
import type { Scene } from "../types";
import { sceneDurationForText } from "../lib/duration-utils";

interface SceneClipPanelProps {
  scene: Scene;
  /** Length the narration needs, in seconds. The clip is trimmed to this. */
  narrationDuration: number;
  onUpdate: (sceneId: number, updates: Partial<Scene>) => void;
}

function fmt(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, "0")}`;
}

/**
 * Attach a short video clip to a scene, choose whether its own soundtrack is
 * heard, and trim it to the length the narration needs.
 *
 * Two rules drive the defaults here:
 *  - a normal script scene mutes the clip so the narration is never fought
 *    with by the clip's own audio;
 *  - an INSERTED scene keeps its own audio, because that clip is the content.
 */
export default function SceneClipPanel({ scene, narrationDuration, onUpdate }: SceneClipPanelProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewTime, setPreviewTime] = useState(0);

  const isInserted = Boolean(scene.is_inserted);
  const hasClip = Boolean(scene.video_url);
  const sourceLength = scene.video_duration || 0;
  const trimStart = scene.video_trim_start ?? 0;
  const trimEnd = scene.video_trim_end ?? (sourceLength || narrationDuration);
  const trimmedLength = Math.max(0, trimEnd - trimStart);
  const fitMode = scene.video_fit_mode || "trim";
  // Inserted scenes default to keeping their own audio; script scenes mute.
  const muted = scene.video_mute ?? !isInserted;

  useEffect(() => {
    setLoadError(null);
  }, [scene.video_url]);

  const handlePick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setLoadError("That file is not a video.");
      return;
    }
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      const full = Number.isFinite(probe.duration) ? probe.duration : narrationDuration;
      // Trim to the narration window straight away so the scene is never
      // longer than what is actually being said.
      const end = Math.min(full, narrationDuration);
      onUpdate(scene.id, {
        video_url: url,
        video_name: file.name,
        video_duration: full,
        video_trim_start: 0,
        video_trim_end: end,
        video_mute: !isInserted,
        video_volume: scene.video_volume ?? 0.8,
        video_fit_mode: full < narrationDuration ? "loop" : "trim",
      });
    };
    probe.onerror = () => setLoadError("Could not read that video file.");
    probe.src = url;
  };

  const setTrim = (start: number, end: number) => {
    const s = Math.max(0, Math.min(start, (sourceLength || end) - 0.2));
    const e = Math.max(s + 0.2, Math.min(end, sourceLength || end));
    onUpdate(scene.id, { video_trim_start: s, video_trim_end: e });
    if (videoRef.current) videoRef.current.currentTime = s;
  };

  const fitToNarration = () => {
    const target = narrationDuration;
    if (!sourceLength) return;
    if (sourceLength <= target) {
      // Clip is shorter than the words: loop it rather than leave dead frames.
      onUpdate(scene.id, {
        video_trim_start: 0,
        video_trim_end: sourceLength,
        video_fit_mode: "loop",
      });
      return;
    }
    // Keep the middle of the clip, which is usually the interesting part.
    const centre = trimStart + trimmedLength / 2;
    let start = centre - target / 2;
    start = Math.max(0, Math.min(start, sourceLength - target));
    onUpdate(scene.id, {
      video_trim_start: start,
      video_trim_end: start + target,
      video_fit_mode: "trim",
    });
  };

  const removeClip = () => {
    onUpdate(scene.id, {
      video_url: null,
      video_name: null,
      video_duration: undefined,
      video_trim_start: undefined,
      video_trim_end: undefined,
    });
  };

  const lengthMatches = Math.abs(trimmedLength - narrationDuration) < 0.25;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white flex items-center gap-1.5">
            🎬 Short video clip
          </span>
          {isInserted && (
            <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-700/60 text-[10px] font-semibold">
              Inserted scene
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => handlePick(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            {hasClip ? "Replace clip" : "➕ Add clip"}
          </button>
          {hasClip && (
            <button
              type="button"
              onClick={removeClip}
              className="px-2.5 py-1.5 bg-gray-800 hover:bg-rose-900 text-gray-300 hover:text-white border border-gray-700 rounded-lg text-xs transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <p className="text-[11px] text-rose-400">{loadError}</p>
      )}

      {!hasClip && (
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Drop in a short clip to use instead of the still image for this scene. It is
          automatically trimmed to the narration length, and its own soundtrack is muted so
          the script is what the viewer hears.
        </p>
      )}

      {hasClip && (
        <>
          <div className="flex gap-3 flex-col sm:flex-row">
            <video
              ref={videoRef}
              src={scene.video_url || undefined}
              className="w-full sm:w-48 rounded-lg border border-gray-800 bg-black"
              muted={muted}
              controls
              onTimeUpdate={(e) => setPreviewTime((e.target as HTMLVideoElement).currentTime)}
              onError={() => setLoadError("The clip could not be played.")}
            />
            <div className="flex-1 space-y-2 text-[11px] text-gray-400">
              <div className="flex justify-between gap-2">
                <span className="truncate" title={scene.video_name || ""}>
                  {scene.video_name || "clip"}
                </span>
                <span className="font-mono text-gray-500">{fmt(sourceLength)} source</span>
              </div>

              <div
                className={`flex justify-between gap-2 px-2 py-1 rounded-lg border ${
                  lengthMatches
                    ? "bg-emerald-950/50 border-emerald-800/60 text-emerald-300"
                    : "bg-amber-950/40 border-amber-800/60 text-amber-300"
                }`}
              >
                <span>Trimmed: {fmt(trimmedLength)}</span>
                <span>Narration: {fmt(narrationDuration)}</span>
              </div>

              {!lengthMatches && (
                <button
                  type="button"
                  onClick={fitToNarration}
                  className="w-full px-2 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-semibold transition-colors"
                >
                  ✂️ Cut clip to fit the narration ({fmt(narrationDuration)})
                </button>
              )}
            </div>
          </div>

          {/* Trim controls */}
          <div className="space-y-2">
            <label className="block text-[11px] text-gray-400">
              <span className="flex justify-between">
                <span>Trim start</span>
                <span className="font-mono text-gray-300">{fmt(trimStart)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0.2, sourceLength)}
                step={0.1}
                value={trimStart}
                onChange={(e) => setTrim(parseFloat(e.target.value), trimEnd)}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </label>
            <label className="block text-[11px] text-gray-400">
              <span className="flex justify-between">
                <span>Trim end</span>
                <span className="font-mono text-gray-300">{fmt(trimEnd)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0.2, sourceLength)}
                step={0.1}
                value={trimEnd}
                onChange={(e) => setTrim(trimStart, parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </label>
          </div>

          {/* Audio handling */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-2.5 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={muted}
                onChange={(e) => onUpdate(scene.id, { video_mute: e.target.checked })}
                className="mt-0.5 accent-indigo-500"
              />
              <span className="text-[11px] leading-relaxed">
                <span className="text-gray-200 font-medium">
                  Mute the clip and use this scene's script narration
                </span>
                <span className="block text-gray-500">
                  {isInserted
                    ? "This is an inserted scene, so its own soundtrack is kept by default."
                    : "Recommended: the clip's own sound would otherwise talk over the narration."}
                </span>
              </span>
            </label>

            {!muted && (
              <label className="block text-[11px] text-gray-400">
                <span className="flex justify-between">
                  <span>Clip volume</span>
                  <span className="font-mono text-gray-300">
                    {Math.round((scene.video_volume ?? 0.8) * 100)}%
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={scene.video_volume ?? 0.8}
                  onChange={(e) =>
                    onUpdate(scene.id, { video_volume: parseFloat(e.target.value) })
                  }
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </label>
            )}
          </div>

          {/* What to do when the clip is shorter than the narration */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-gray-500 mr-1">If the clip is short:</span>
            {(
              [
                ["trim", "Hold last frame"],
                ["loop", "Loop the clip"],
                ["slow", "Slow it down"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onUpdate(scene.id, { video_fit_mode: mode })}
                className={`px-2 py-1 rounded-lg text-[11px] border transition-colors ${
                  fitMode === mode
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-gray-900 border-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
