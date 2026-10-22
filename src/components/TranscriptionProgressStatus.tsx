import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TranscriptionProgress } from "../lib/speech-to-text";

const STAGE_LABELS: Record<TranscriptionProgress["stage"], string> = {
  audio: "Preparing audio",
  engine: "Starting engine",
  model: "Loading caption model",
  transcribing: "Transcribing audio",
  done: "Applying captions",
};

/** Compact live copy for the button; the dedicated window carries the detail. */
export function transcriptionButtonLabel(progress: TranscriptionProgress | null): string {
  if (!progress) return "Generating captions…";
  const percent = typeof progress.fraction === "number"
    ? ` ${Math.round(Math.max(0, Math.min(1, progress.fraction)) * 100)}%`
    : "";
  return `${STAGE_LABELS[progress.stage]}${percent}…`;
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

/**
 * A deliberately prominent progress window for a deliberately large process.
 * Local transcription can take several minutes; hiding that under a button
 * makes a healthy run look frozen and invites the customer to restart it.
 */
export default function TranscriptionProgressStatus({
  progress,
  onCancel,
  sourceSeconds = 0,
}: {
  progress: TranscriptionProgress;
  onCancel?: () => void;
  sourceSeconds?: number;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [displayFraction, setDisplayFraction] = useState(0);
  const stageFraction = typeof progress.fraction === "number"
    ? Math.max(0, Math.min(1, progress.fraction))
    : null;

  // The stage fractions are local to each stage. Map them onto one honest,
  // monotonic overall bar while retaining the audio-completed figure below.
  const calculatedOverall = progress.stage === "audio"
    ? (stageFraction ?? 0) * 0.15
    : progress.stage === "engine"
      ? 0.17
      : progress.stage === "model"
        ? 0.2 + (stageFraction ?? 0) * 0.2
        : progress.stage === "transcribing"
          ? 0.4 + (stageFraction ?? 0) * 0.58
          : 1;

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setDisplayFraction((current) => Math.max(current, calculatedOverall));
  }, [calculatedOverall]);

  if (typeof document === "undefined") return null;

  const overallPercent = Math.round(displayFraction * 100);
  const transcribedSeconds = progress.stage === "done"
    ? sourceSeconds
    : progress.stage === "transcribing" && stageFraction !== null
      ? sourceSeconds * stageFraction
      : 0;
  const waitingForFirstWindow = progress.stage === "transcribing" && !(stageFraction && stageFraction > 0);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transcription-progress-title"
    >
      <div className="w-full max-w-xl rounded-2xl border border-indigo-700/60 bg-gray-950 shadow-2xl p-4 sm:p-6 space-y-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-400">
            Large on-device process
          </p>
          <h2 id="transcription-progress-title" className="mt-1 text-lg sm:text-xl font-bold text-white">
            Generating captions from your video
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-300">
            Keep this tab open. Your audio stays on this device while the local caption model works through it in sections. A long video can take several minutes.
          </p>
        </div>

        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label="Caption generation stages">
          {["Prepare", "Load model", "Transcribe", "Apply"].map((label, index) => {
            const mappedStage = progress.stage === "audio"
              ? 0
              : progress.stage === "engine" || progress.stage === "model"
                ? 1
                : progress.stage === "transcribing"
                  ? 2
                  : 3;
            const complete = progress.stage === "done" ? index < 4 : index < mappedStage;
            const active = progress.stage === "done" ? index === 3 : index === mappedStage;
            return (
              <li
                key={label}
                className={`rounded-lg border px-2.5 py-2 text-[10px] font-semibold ${
                  active
                    ? "border-indigo-500 bg-indigo-950/80 text-indigo-200"
                    : complete
                      ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-300"
                      : "border-hairline bg-gray-900/70 text-gray-500"
                }`}
              >
                <span className="mr-1">{complete ? "✓" : index + 1}.</span> {label}
              </li>
            );
          })}
        </ol>

        <div className="space-y-2" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-indigo-200">{STAGE_LABELS[progress.stage]}</span>
            <span className="font-mono text-sm font-bold text-indigo-300">{overallPercent}% overall</span>
          </div>
          <div
            className="relative h-3 overflow-hidden rounded-full bg-gray-800 border border-hairline"
            role="progressbar"
            aria-label="Overall caption generation progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={overallPercent}
          >
            <div
              className="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
              style={{ width: `${overallPercent}%` }}
            />
            {waitingForFirstWindow && (
              <div className="absolute inset-y-0 left-[40%] w-1/4 rounded-full bg-indigo-400 animate-pulse" />
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-gray-300">{progress.message}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-hairline bg-gray-900/70 px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-wide text-gray-500">Elapsed</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-white">{clock(elapsedSeconds)}</p>
          </div>
          <div className="rounded-xl border border-hairline bg-gray-900/70 px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-wide text-gray-500">Audio completed</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-white">
              {sourceSeconds > 0 ? `${clock(transcribedSeconds)} / ${clock(sourceSeconds)}` : "Measuring…"}
            </p>
          </div>
        </div>

        {waitingForFirstWindow && (
          <p className="rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
            The first section usually has the longest pause before the percentage moves. The pulsing bar and elapsed clock show that the process is still active.
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-hairline pt-4">
          <p className="text-[10px] text-gray-500">
            Closing or refreshing this tab cancels the local transcription.
          </p>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-hairline bg-gray-800 hover:bg-gray-700 text-sm font-semibold text-white"
            >
              Cancel transcription
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
