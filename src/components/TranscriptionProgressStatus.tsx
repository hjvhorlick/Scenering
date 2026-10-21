import type { TranscriptionProgress } from "../lib/speech-to-text";

const STAGE_LABELS: Record<TranscriptionProgress["stage"], string> = {
  audio: "Preparing audio",
  engine: "Starting engine",
  model: "Loading Whisper",
  transcribing: "Transcribing",
  done: "Complete",
};

/** Compact live copy for the button; the card below carries the full detail. */
export function transcriptionButtonLabel(progress: TranscriptionProgress | null): string {
  if (!progress) return "Generating captions…";
  const percent = typeof progress.fraction === "number"
    ? ` ${Math.round(Math.max(0, Math.min(1, progress.fraction)) * 100)}%`
    : "";
  return `${STAGE_LABELS[progress.stage]}${percent}…`;
}

/** A visible, repainting status card shared by Setup and Captions. */
export default function TranscriptionProgressStatus({
  progress,
}: {
  progress: TranscriptionProgress;
}) {
  const fraction = typeof progress.fraction === "number"
    ? Math.max(0, Math.min(1, progress.fraction))
    : null;
  const percent = fraction === null ? null : Math.round(fraction * 100);

  return (
    <div
      className="mt-2 rounded-lg border border-indigo-700/60 bg-indigo-950/40 px-3 py-2.5 space-y-2"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="font-bold text-indigo-200">{STAGE_LABELS[progress.stage]}</span>
        <span className="font-mono text-indigo-300">
          {percent === null ? "Working…" : `${percent}%`}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-gray-800 border border-hairline"
        role="progressbar"
        aria-label={STAGE_LABELS[progress.stage]}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
      >
        {fraction === null ? (
          <div className="h-full w-1/3 rounded-full bg-indigo-400 animate-pulse" />
        ) : (
          <div
            className="h-full rounded-full bg-indigo-400 transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
      <p className="text-[10px] leading-relaxed text-gray-300">{progress.message}</p>
      {progress.stage === "transcribing" && (
        <p className="text-[9px] text-gray-500">
          Whisper is isolated from the page in a background worker. The Cancel button remains responsive.
        </p>
      )}
    </div>
  );
}
