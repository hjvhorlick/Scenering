import Icon from "./icons/Icon";

interface VoiceoverSwitchProps {
  /** Project-wide narration switch. */
  enabled: boolean;
  onChange: (next: boolean) => void;
  /** Total scenes in the project — used to say what happens when it is off. */
  sceneCount?: number;
  /** Compact form for a step that is not the Voiceover step. */
  compact?: boolean;
  /** Shown under the switch in the compact form. */
  onOpenVoiceover?: () => void;
}

/**
 * The narration on/off switch.
 *
 * Not every video is narrated. A music video, a filmed take or a screen
 * recording carries its own sound and has no script to read, and until now
 * the app assumed a voice for every scene: it synthesised narration nobody
 * asked for, stretched each scene to fit that narration, and held the first
 * frame for two seconds waiting for words that never came.
 *
 * Switching this off means no synthesis, no narration in the preview or the
 * export, and scene lengths that follow the footage instead of a voice. Music,
 * captions, stickers and everything else in the Studio are untouched — this
 * switch is only about the spoken track.
 */
export default function VoiceoverSwitch({
  enabled,
  onChange,
  sceneCount = 0,
  compact = false,
  onOpenVoiceover,
}: VoiceoverSwitchProps) {
  const state = enabled ? "On" : "Off";
  const detail = enabled
    ? sceneCount > 0
      ? `Narrated with the voice you pick below, across all ${sceneCount} ${sceneCount === 1 ? "scene" : "scenes"}.`
      : "Narrated with the voice you pick in the Voiceover step."
    : "No spoken narration anywhere — scene lengths follow your footage and script, not a voice.";

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
          aria-label="Voiceover on or off"
          onClick={() => onChange(!enabled)}
          className={`relative shrink-0 w-12 h-6 rounded-full border transition-colors cursor-pointer ${
            enabled ? "bg-emerald-500 border-emerald-300" : "bg-gray-700 border-hairline"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
              enabled ? "left-[26px]" : "left-0.5"
            }`}
          />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white flex items-center gap-1.5">
              <Icon glyph="🎙️" /> Voiceover
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                enabled
                  ? "bg-emerald-950 border-emerald-600/60 text-emerald-300"
                  : "bg-gray-800 border-hairline text-gray-400"
              }`}
            >
              {state}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{detail}</p>
        </div>
      </div>

      {compact && onOpenVoiceover && (
        <button
          type="button"
          onClick={onOpenVoiceover}
          className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] font-semibold border border-hairline transition-colors"
        >
          Open Voiceover
        </button>
      )}
    </div>
  );
}
