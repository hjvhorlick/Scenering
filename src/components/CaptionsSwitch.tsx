import Icon from "./icons/Icon";

interface CaptionsSwitchProps {
  /** Project-wide captions switch (`captionsConfig.enabled`). */
  enabled: boolean;
  onChange: (next: boolean) => void;
  /** Total scenes in the project. */
  sceneCount: number;
  /** How many of those have been switched off one at a time. */
  mutedSceneCount?: number;
  /** Compact form for a step that is not the Captions step. */
  compact?: boolean;
  /** Shown under the switch in the compact form. */
  onOpenCaptions?: () => void;
}

/**
 * The captions on/off switch.
 *
 * One control, used in two places — the Captions step and the Voiceover step —
 * so wherever a creator happens to be, captions are one click from off and the
 * switch always reads the same way. Flipping it takes effect immediately in the
 * live preview and in the exported file; nothing has to be "applied" afterwards.
 */
export default function CaptionsSwitch({
  enabled,
  onChange,
  sceneCount,
  mutedSceneCount = 0,
  compact = false,
  onOpenCaptions,
}: CaptionsSwitchProps) {
  const state = enabled ? "On" : "Off";
  const detail = !enabled
    ? "No captions in the preview or the exported video."
    : mutedSceneCount > 0
      ? `Burned into ${sceneCount - mutedSceneCount} of ${sceneCount} scenes — ${mutedSceneCount} switched off individually.`
      : `Burned into all ${sceneCount} ${sceneCount === 1 ? "scene" : "scenes"}.`;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline ${
        enabled ? "bg-emerald-950/40" : "bg-gray-900/60"
      } ${compact ? "px-3 py-2.5" : "p-3"}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Captions on or off"
          onClick={() => onChange(!enabled)}
          className={`relative shrink-0 w-12 h-6 rounded-full border transition-colors cursor-pointer ${
            enabled
              ? "bg-emerald-500 border-emerald-300"
              : "bg-gray-700 border-hairline"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
              enabled ? "left-[26px]" : "left-1"
            }`}
          />
        </button>
        <div className="min-w-0">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Icon glyph="💬" /> Captions {state}
          </span>
          <span className="text-[11px] text-gray-400 block">{detail}</span>
        </div>
      </div>

      {compact && onOpenCaptions && (
        <button
          type="button"
          onClick={onOpenCaptions}
          className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-hairline text-gray-200 text-xs font-semibold transition-colors"
        >
          Style captions
        </button>
      )}
    </div>
  );
}
