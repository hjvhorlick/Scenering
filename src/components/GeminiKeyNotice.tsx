import {
  GEMINI_KEY_HELP_URL,
  GEMINI_KEY_PROMPT_BODY,
  GEMINI_KEY_PROMPT_SHORT,
  GEMINI_KEY_PROMPT_TITLE,
  openApiKeysModal,
  useNarrationKeyStatus,
} from "../lib/gemini-narration";
import Icon from "./icons/Icon";

/**
 * "Add your free Google key" — the one prompt a customer sees when narration
 * has nowhere to come from.
 *
 * Narration is bring-your-own-key, so an account with no key saved gets this
 * explanation rather than a failed request or a substitute voice nobody
 * chose. It explains the cost (none), the effort (about a minute), links
 * straight to Google AI Studio and opens the API Keys modal where the key is
 * pasted.
 *
 * Both components answer to the live key status themselves and render
 * nothing at all for the owner administrator (whose narration uses the
 * server's own key) or for anyone who has already saved one.
 */

function HelpLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={GEMINI_KEY_HELP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`underline underline-offset-2 hover:text-white inline-flex items-center gap-1 ${className}`}
    >
      Get a free key at Google AI Studio
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </a>
  );
}

/** Full explanation — used at the top of the Voiceover Studio. */
export default function GeminiKeyNotice({ className = "" }: { className?: string }) {
  const { needsKey } = useNarrationKeyStatus();
  if (!needsKey) return null;

  return (
    <div
      className={`rounded-2xl border border-amber-600/70 bg-amber-950/70 p-4 text-xs text-amber-100 leading-relaxed shadow-lg ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-base leading-none mt-0.5" aria-hidden="true">
          <Icon glyph="🔑" />
        </span>
        <div className="flex-1 space-y-2">
          <p className="text-sm font-semibold text-white">{GEMINI_KEY_PROMPT_TITLE}</p>
          <p>{GEMINI_KEY_PROMPT_BODY}</p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={openApiKeysModal}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-bold transition-colors"
            >
              Open API Keys
            </button>
            <HelpLink className="text-amber-200" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** One-line version — sits beside a preview or play button. */
export function GeminiKeyHint({ className = "" }: { className?: string }) {
  const { needsKey } = useNarrationKeyStatus();
  if (!needsKey) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-amber-600/60 bg-amber-950/60 px-3 py-2 text-[11px] text-amber-100 ${className}`}
    >
      <span aria-hidden="true">
        <Icon glyph="🔑" />
      </span>
      <span>{GEMINI_KEY_PROMPT_SHORT}</span>
      <button
        type="button"
        onClick={openApiKeysModal}
        className="px-2 py-0.5 rounded-md bg-amber-500 hover:bg-amber-400 text-amber-950 text-[11px] font-bold transition-colors"
      >
        Add key
      </button>
      <HelpLink className="text-amber-200" />
    </div>
  );
}
