import type { EditorStep } from "../types";

/**
 * Single source of truth for the project phases.
 * Order matters — the header tabs and the Previous / Next controls on every
 * screen are generated from this list.
 */
export type ProjectPhase = "setup" | "scenes" | "voiceover" | "captions" | "studio" | "render";

export interface ProjectPhaseDef {
  id: ProjectPhase;
  /** Short label used in the header tabs */
  tab: string;
  /** Full phase name used by the Previous / Next buttons */
  phase: string;
  icon: string;
  /** What the user does in this phase — shown as the Next button hint */
  purpose: string;
  /** Editor step to activate (setup is handled by the setup view) */
  editorStep: EditorStep;
}

export const PROJECT_PHASES: ProjectPhaseDef[] = [
  {
    id: "setup",
    tab: "Setup",
    phase: "Project Setup",
    icon: "⚙️",
    purpose: "Choose the project, write the script and set the format",
    editorStep: "scenes",
  },
  {
    id: "scenes",
    tab: "Scenes",
    phase: "Scenes",
    icon: "📝",
    purpose: "Configure each scene's image, filter, motion and caption overlay",
    editorStep: "scenes",
  },
  {
    id: "voiceover",
    tab: "Voiceover",
    phase: "Voiceover",
    icon: "🎙️",
    purpose: "Pick the narrator voice and generate narration audio",
    editorStep: "voiceover",
  },
  {
    id: "captions",
    tab: "Captions",
    phase: "Captions",
    icon: "💬",
    purpose: "Style the on-screen subtitles and burn-in captions",
    editorStep: "captions",
  },
  {
    id: "studio",
    tab: "Studio",
    phase: "Video Studio & Timeline",
    icon: "🎬",
    purpose: "Add intros, music, sound effects, stickers and overlays",
    editorStep: "studio",
  },
  {
    id: "render",
    tab: "Render",
    phase: "Render & Export",
    icon: "🚀",
    purpose: "Render the finished video and download it",
    editorStep: "render",
  },
];

export const getPhase = (id: ProjectPhase) =>
  PROJECT_PHASES.find((p) => p.id === id) || PROJECT_PHASES[0];

interface StepNavProps {
  current: ProjectPhase;
  /** Plain navigation — used by the Previous button and by Next when no override is given */
  onNavigate: (phase: ProjectPhase) => void;
  /** Optional custom action for the Next button (e.g. save before continuing) */
  onNext?: () => void;
  /** Custom Next label, e.g. "Save Voiceovers & Continue" */
  nextLabel?: string;
  nextDisabled?: boolean;
  /** Shows a spinner-style label while the custom action runs */
  busyLabel?: string;
  /** Small helper text shown between the two buttons */
  note?: string;
}

/**
 * The one and only Previous / Next control for a phase.
 * Rendered at the TOP of every section; each phase has exactly one such control.
 */
export default function StepNav({
  current,
  onNavigate,
  onNext,
  nextLabel,
  nextDisabled = false,
  busyLabel,
  note,
}: StepNavProps) {
  const index = PROJECT_PHASES.findIndex((p) => p.id === current);
  const prevPhase = index > 0 ? PROJECT_PHASES[index - 1] : null;
  const nextPhase = index >= 0 && index < PROJECT_PHASES.length - 1 ? PROJECT_PHASES[index + 1] : null;
  const busy = Boolean(busyLabel);

  return (
    <div className="bg-gray-900/80 border border-hairline rounded-2xl px-3 py-2.5 sm:px-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-2.5">
      {/* Previous phase */}
      <div className="flex-shrink-0">
        {prevPhase ? (
          <button
            type="button"
            onClick={() => onNavigate(prevPhase.id)}
            className="opt-btn w-full sm:w-auto"
            title={`Go back to ${prevPhase.phase}`}
          >
            <span>←</span>
            <span>Previous: {prevPhase.phase}</span>
          </button>
        ) : (
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-gray-500 px-1">
            <span>🏁</span>
            <span>First phase</span>
          </span>
        )}
      </div>

      {/* Current phase + guidance */}
      <div className="flex-1 min-w-0 text-center sm:text-left">
        <p className="text-[11px] text-gray-400 truncate">
          <span className="text-gray-300 font-semibold">
            {getPhase(current).icon} {getPhase(current).phase}
          </span>
          {note ? <span className="text-gray-500"> — {note}</span> : null}
        </p>
      </div>

      {/* Next phase */}
      <div className="flex-shrink-0">
        {nextPhase ? (
          <button
            type="button"
            disabled={nextDisabled || busy}
            onClick={() => (onNext ? onNext() : onNavigate(nextPhase.id))}
            className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
            title={`Continue to ${nextPhase.phase}: ${nextPhase.purpose}`}
          >
            {busy ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>{busyLabel}</span>
              </>
            ) : (
              <>
                <span>{nextLabel || `Next: ${nextPhase.phase}`}</span>
                <span>→</span>
              </>
            )}
          </button>
        ) : (
          <span className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-300 px-1">
            <span>✅</span>
            <span>Final phase — render & download</span>
          </span>
        )}
      </div>
    </div>
  );
}
