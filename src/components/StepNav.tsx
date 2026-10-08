import Icon from "./icons/Icon";
import {
  PROJECT_PHASES,
  getPhase,
  phaseIndex,
  type ProjectPhase,
  type ProjectPhaseDef,
} from "../lib/phase-gate";

export { PROJECT_PHASES, getPhase };
export type { ProjectPhase, ProjectPhaseDef };

/**
 * The phase list and every rule about moving between phases live in
 * src/lib/phase-gate.ts — see the note there for the ordered gate the owner
 * asked for (Next commits a section, going back locks the ones after it).
 * This file is only the control.
 */

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
  const index = phaseIndex(current);
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
            className="t-btn-hero-ghost opt-btn w-full sm:w-auto"
            title={`Go back to ${prevPhase.phase}`}
          >
            <Icon glyph="←" />
            <span>Previous: {prevPhase.phase}</span>
          </button>
        ) : (
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-gray-500 px-1">
            <Icon glyph="🏁" />
            <span>First phase</span>
          </span>
        )}
      </div>

      {/* Current phase + guidance */}
      <div className="flex-1 min-w-0 text-center sm:text-left">
        <p className="text-[11px] text-gray-400 truncate">
          <span className="text-gray-300 font-semibold">
            <Icon glyph={getPhase(current).icon} /> {getPhase(current).phase}
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
            className="t-btn-hero t-hero-pulse w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            title={`Continue to ${nextPhase.phase}: ${nextPhase.purpose}`}
          >
            {busy ? (
              <>
                <span className="t-ico animate-spin"><Icon glyph="⏳" /></span>
                <span>{busyLabel}</span>
              </>
            ) : (
              <>
                <span>{nextLabel || `Next: ${nextPhase.phase}`}</span>
                <span className="t-hero-arrow"><Icon glyph="→" /></span>
              </>
            )}
          </button>
        ) : (
          <span className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-300 px-1">
            <Icon glyph="✅" />
            <span>Final phase — render & download</span>
          </span>
        )}
      </div>
    </div>
  );
}
