/**
 * Bring-your-own-key narration.
 *
 * Narration is synthesised by Google's Gemini voices, and every ordinary
 * account pays for that with its own free Google AI Studio key rather than
 * with the server's secret. This module is the single place that knows:
 *
 *  - which header carries the customer's key to `/api/tts`
 *  - how the server says "no key was sent" (status, code and header)
 *  - the wording shown to the customer, so the voice studio, the preview
 *    buttons and the API-keys modal all say the same thing
 *
 * The owner administrator is the one exception: the server keeps using its
 * configured GEMINI_API_KEY for that account, so the owner never has to
 * paste a key into their own product.
 */
import { useEffect, useState } from "react";
import { getStoredGeminiKey } from "./api-keys";
import { useSession } from "./session";

/** Where a customer gets a free key, linked from every prompt. */
export const GEMINI_KEY_HELP_URL = "https://aistudio.google.com/app/apikey";

/** Machine-readable marker on the server's "no key" answer. */
export const GEMINI_KEY_REQUIRED_CODE = "GEMINI_KEY_REQUIRED";
/** Same marker as a response header, so callers reading audio bytes (rather
 *  than JSON) can recognise the refusal without parsing a body. */
export const GEMINI_KEY_REQUIRED_HEADER = "X-TTS-Error";
export const GEMINI_KEY_REQUIRED_HEADER_VALUE = "gemini-key-required";

/** The one sentence that explains the whole arrangement. */
export const GEMINI_KEY_PROMPT_TITLE = "Add your free Google key to hear the narrators";
export const GEMINI_KEY_PROMPT_BODY =
  "Narration is spoken by Google's Gemini voices using your own key. A key from Google AI Studio is free and takes about a minute to create — paste it into API Keys and every voice, preview and export works straight away.";
/** Short form for tight spaces (next to a preview button). */
export const GEMINI_KEY_PROMPT_SHORT =
  "Narration needs your own Google key — it is free and takes a minute.";

const KEYS_EVENT = "scenering-api-keys-updated";
const OPEN_MODAL_EVENT = "scenering-open-api-keys";
const KEY_REQUIRED_EVENT = "scenering-gemini-key-required";

/** Opens the API Keys modal from anywhere in the studio. */
export function openApiKeysModal(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_MODAL_EVENT));
}

/** True when the server refused a synthesis because no key was supplied. */
export function isGeminiKeyRequiredResponse(res: Response): boolean {
  return (
    res.status === 400 &&
    res.headers.get(GEMINI_KEY_REQUIRED_HEADER) === GEMINI_KEY_REQUIRED_HEADER_VALUE
  );
}

/** Error thrown by narration helpers when the account has no key saved. */
export class GeminiKeyRequiredError extends Error {
  readonly code = GEMINI_KEY_REQUIRED_CODE;
  constructor(message = GEMINI_KEY_PROMPT_SHORT) {
    super(message);
    this.name = "GeminiKeyRequiredError";
  }
}

export function isGeminiKeyRequiredError(err: unknown): boolean {
  return Boolean(err && (err as { code?: string }).code === GEMINI_KEY_REQUIRED_CODE);
}

/** Server-confirmed "no key" — remembered so every open prompt lights up. */
let serverReportedMissingKey = false;

export function noteGeminiKeyRequired(): void {
  serverReportedMissingKey = true;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(KEY_REQUIRED_EVENT));
}

function clearGeminiKeyRequired(): void {
  serverReportedMissingKey = false;
}

function readStoredKey(): string {
  try {
    return getStoredGeminiKey();
  } catch {
    return "";
  }
}

export function hasStoredGeminiKey(): boolean {
  return Boolean(readStoredKey());
}

export interface NarrationKeyStatus {
  /** Owner administrator — the server's own key is used for this account. */
  isOwner: boolean;
  /** A customer key is saved in this browser. */
  hasKey: boolean;
  /** Show the prompt: an ordinary account with no key saved. */
  needsKey: boolean;
}

/**
 * Live narration-key status for the interface. Updates when the customer
 * saves or clears keys, and when the server reports a request without one.
 */
export function useNarrationKeyStatus(): NarrationKeyStatus {
  const { account } = useSession();
  const isOwner = account?.user.role === "admin";
  const [hasKey, setHasKey] = useState(() => hasStoredGeminiKey());
  const [serverSaysMissing, setServerSaysMissing] = useState(() => serverReportedMissingKey);

  useEffect(() => {
    const sync = () => {
      const present = hasStoredGeminiKey();
      setHasKey(present);
      if (present) clearGeminiKeyRequired();
      setServerSaysMissing(serverReportedMissingKey && !present);
    };
    const flagged = () => setServerSaysMissing(!hasStoredGeminiKey());
    window.addEventListener(KEYS_EVENT, sync);
    window.addEventListener(KEY_REQUIRED_EVENT, flagged);
    return () => {
      window.removeEventListener(KEYS_EVENT, sync);
      window.removeEventListener(KEY_REQUIRED_EVENT, flagged);
    };
  }, []);

  return {
    isOwner: Boolean(isOwner),
    hasKey,
    needsKey: !isOwner && (!hasKey || serverSaysMissing),
  };
}
