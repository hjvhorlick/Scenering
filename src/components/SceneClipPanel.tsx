import { useEffect, useRef, useState } from "react";
import type { Scene } from "../types";
import { addCustomVideo, CUSTOM_VIDEO_PREFIX, isCustomVideoUrl, resolveVideoUrl } from "../lib/custom-video";
import { stripClipAudio } from "../lib/clip-audio-strip";
import { formatStorageBytes } from "../lib/storage-health";
import { VIDEO_UPLOAD_ACCEPT } from "../lib/media-file";
import { sceneUpdatesForVideoFile, videoUploadMessage } from "../lib/scene-clip-attach";
import { sceneDurationForText } from "../lib/duration-utils";
import Icon, { iconify } from "./icons/Icon";
import StorageWarningNote from "./StorageWarningNote";

interface SceneClipPanelProps {
  scene: Scene;
  /** Length the narration needs, in seconds. The clip is trimmed to this. */
  narrationDuration: number;
  /** One-scene project: the clip is the video, so it is never trimmed to the narration. */
  singleScene?: boolean;
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
export default function SceneClipPanel({
  scene,
  narrationDuration,
  singleScene = false,
  onUpdate,
}: SceneClipPanelProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  /**
   * Collapsed unless the scene actually uses a clip. Kept open permanently the
   * panel added a large block of height to every scene card, which is exactly
   * the space pressure this screen suffers from.
   */
  const [expanded, setExpanded] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewTime, setPreviewTime] = useState(0);
  /** 0–100 while a container this browser cannot open is re-wrapped as MP4. */
  const [conversionProgress, setConversionProgress] = useState<number | null>(null);
  /** The clip is usable in this tab, but the browser could not store it. */
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  /** Remove-audio is a two-step, irreversible action, so it has its own state. */
  const [audioRemoval, setAudioRemoval] = useState<"idle" | "confirm" | "working">("idle");
  const [audioProgress, setAudioProgress] = useState<number | null>(null);
  const [audioNote, setAudioNote] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

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

  /**
   * Store the upload and point the scene at it.
   *
   * This used to keep `URL.createObjectURL(file)` in `scene.video_url`,
   * which stopped resolving the moment the page was reloaded — a saved
   * project opened to a clip that would not play. The shared helper puts the
   * file in IndexedDB and returns the stable `custom-video:<id>` address.
   */
  const handlePick = (file: File | undefined) => {
    if (!file) return;
    setLoadError(null);
    setStorageWarning(null);
    setConversionProgress(null);
    void sceneUpdatesForVideoFile(file, scene, narrationDuration, {
      singleScene,
      onProgress: (progress) => setConversionProgress(Math.round(progress * 100)),
      onWarning: setStorageWarning,
    })
      .then((updates) => onUpdate(scene.id, updates))
      .catch((err) => setLoadError(videoUploadMessage(err)))
      .finally(() => setConversionProgress(null));
  };

  /**
   * Take the soundtrack out of the stored file.
   *
   * Muting (above) stops the track being played and changes nothing on disk.
   * This rewrites the clip without an audio track, so the stored upload is
   * genuinely smaller and no player can find the sound again. The picture is
   * copied, not re-encoded, and the new file replaces the old one through the
   * same store as any upload — so the scene keeps a reload-safe address.
   */
  const removeAudioFromFile = async () => {
    if (!scene.video_url || audioRemoval === "working") return;
    setAudioRemoval("working");
    setAudioProgress(null);
    setAudioError(null);
    setAudioNote(null);
    try {
      const stripped = await stripClipAudio(scene.video_url, { onProgress: setAudioProgress });
      if (!stripped.ok) {
        setAudioError(stripped.message);
        setAudioRemoval("idle");
        return;
      }
      const replacedId = scene.video_url.slice(CUSTOM_VIDEO_PREFIX.length);
      const stored = await addCustomVideo(stripped.file, {
        replaceIds: [replacedId],
        allowSessionFallback: true,
      });
      onUpdate(scene.id, {
        video_url: `${CUSTOM_VIDEO_PREFIX}${stored.id}`,
        video_name: stored.name,
        video_duration: stored.duration || scene.video_duration,
        // There is no track left to play; say so in the field every renderer reads.
        video_mute: true,
      });
      if (stored.storageWarning) setStorageWarning(stored.storageWarning);
      setAudioNote(
        stripped.savedBytes > 0
          ? `Audio removed — the stored clip is ${formatStorageBytes(stripped.savedBytes)} smaller.`
          : "Audio removed. The clip now has no soundtrack.",
      );
      setAudioRemoval("idle");
    } catch (err: any) {
      setAudioError(err?.message || "The audio could not be removed from that clip.");
      setAudioRemoval("idle");
    } finally {
      setAudioProgress(null);
    }
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

  // Nothing attached and not being edited: one slim line, not a panel.
  if (!hasClip && !expanded) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={VIDEO_UPLOAD_ACCEPT}
          className="hidden"
          onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; void handlePick(file); }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="px-2 py-1 rounded-lg border border-hairline bg-gray-900/60 text-[11px] text-gray-400 hover:text-white hover:border-indigo-600 transition-colors flex items-center gap-1"
          title="Use a short video clip for this scene instead of a still image — MP4, MOV, WebM, MKV or MTS"
        >
          {conversionProgress !== null ? `Converting ${conversionProgress}%` : <><Icon glyph="🎬" /> Add video clip</>}
        </button>
        {loadError && <span className="text-[10px] text-rose-400">{loadError}</span>}
        {storageWarning && (
          <StorageWarningNote
            message={storageWarning}
            onDismiss={() => setStorageWarning(null)}
            variant="inline"
          />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-hairline bg-gray-950/70 p-2.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Icon glyph="🎬" /> Short video clip
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
            accept={VIDEO_UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; void handlePick(file); }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            {conversionProgress !== null
              ? `Converting ${conversionProgress}%`
              : iconify(hasClip ? "Replace clip" : "➕ Add clip")}
          </button>
          {hasClip && (
            <button
              type="button"
              onClick={removeClip}
              className="px-2.5 py-1.5 bg-gray-800 hover:bg-rose-900 text-gray-300 hover:text-white border border-hairline rounded-lg text-xs transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <p className="text-[11px] text-rose-400">{loadError}</p>
      )}

      {storageWarning && (
        <StorageWarningNote message={storageWarning} onDismiss={() => setStorageWarning(null)} />
      )}

      {!hasClip && (
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Trimmed to the narration length automatically; the clip's own soundtrack is
            muted so the script is what the viewer hears.
          </p>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[11px] text-gray-500 hover:text-white shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {hasClip && (
        <>
          {/*
            THE PREVIEW COMES FIRST, AND IT IS BIG.
            It used to be a 192px thumbnail in the corner of a flex row that
            also held the stats, and trimming a clip on a thumbnail is guesswork:
            the detail you are cutting around — a face, a sign, a frame you want
            to land on — was not visible. It now spans the panel above the trim
            sliders, sized to the clip's own shape up to the panel width and a
            viewport-relative height, so a large preview can never push the
            sliders off the screen on a laptop or a phone.
          */}
          <div className="rounded-lg border border-hairline bg-black p-1">
            <video
              ref={videoRef}
              src={resolveVideoUrl(scene.video_url) || undefined}
              className="block mx-auto w-auto max-w-full max-h-[min(52vh,420px)] xl:max-h-[min(60vh,520px)] rounded"
              muted={muted}
              controls
              playsInline
              onTimeUpdate={(e) => setPreviewTime((e.target as HTMLVideoElement).currentTime)}
              onSeeked={(e) => setPreviewTime((e.target as HTMLVideoElement).currentTime)}
              onError={() => setLoadError("The clip could not be played.")}
            />
          </div>

          {/* What the preview is showing, and what the trim window covers. */}
          <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400 flex-wrap">
            <span className="truncate" title={scene.video_name || ""}>
              {scene.video_name || "clip"}
            </span>
            <span className="font-mono text-gray-500">
              playhead {fmt(previewTime)} · window {fmt(trimStart)}–{fmt(trimEnd)} · {fmt(sourceLength)} source
            </span>
          </div>

          <div
            className={`flex justify-between gap-2 px-2 py-1 rounded-lg border text-[11px] ${
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
              className="w-full px-2 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-semibold transition-colors"
            >
              <Icon glyph="✂" /> Cut clip to fit the narration ({fmt(narrationDuration)})
            </button>
          )}

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
          <div className="rounded-lg border border-hairline bg-gray-900/60 p-2.5 space-y-2">
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

            {/* Removing the track is a different act from muting it: one is a
                switch, the other rewrites the stored file and cannot be undone. */}
            {isCustomVideoUrl(scene.video_url) && (
              <div className="pt-2 border-t border-hairline space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] text-gray-200 font-medium">
                    Remove the audio from the video file
                  </span>
                  {audioRemoval === "idle" && (
                    <button
                      type="button"
                      onClick={() => {
                        setAudioRemoval("confirm");
                        setAudioNote(null);
                        setAudioError(null);
                      }}
                      className="px-2 py-1 rounded-lg border border-rose-800/70 bg-rose-950/40 text-rose-200 hover:bg-rose-900/50 text-[11px] transition-colors flex items-center gap-1"
                    >
                      <Icon glyph="🗑" /> Remove audio
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  Muting keeps the track in the file. Removing takes it out, so the stored clip is
                  smaller and no player can find the sound again — including the caption pass that
                  listens to a clip. That cannot be undone; undoing it means uploading the file again.
                </p>
                {audioRemoval === "confirm" && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-amber-300">Remove it permanently?</span>
                    <button
                      type="button"
                      onClick={() => void removeAudioFromFile()}
                      className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold"
                    >
                      Yes, remove the audio
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudioRemoval("idle")}
                      className="px-2 py-1 rounded-lg border border-hairline bg-gray-900 text-gray-300 hover:text-white text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {audioRemoval === "working" && (
                  <p className="text-[11px] text-indigo-300">
                    Removing the audio…{audioProgress !== null ? ` ${audioProgress}%` : ""}
                  </p>
                )}
                {audioNote && <p className="text-[11px] text-emerald-300">{audioNote}</p>}
                {audioError && <p className="text-[11px] text-rose-400">{audioError}</p>}
              </div>
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
                    : "bg-gray-900 border-hairline text-gray-400 hover:text-white"
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
