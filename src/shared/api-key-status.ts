import { useEffect, useState } from "react";
import { getStoredApiKeys } from "../lib/api-keys";

/**
 * Whether this browser has its own provider keys (Pexels, Pixabay, Speechify)
 * saved.
 *
 * The keys live in localStorage, per browser, and never reach the server except
 * to be verified — so "do I have keys?" is a question only the browser can
 * answer, and it is answered the same way everywhere it is asked. Two places ask
 * now that the studio's top bar no longer carries a key button: the corner menu
 * (which shows Set / Not set beside the entry) and the account panel (which
 * offers to add or replace them).
 *
 * The answer is kept current from the same event `src/lib/api-keys.ts` fires
 * when keys are saved or cleared, plus the browser's own `storage` event, so
 * saving keys in one tab updates the label in another.
 */
export function apiKeysConfigured(): boolean {
  const keys = getStoredApiKeys();
  return Boolean(keys.pexelsKey || keys.pixabayKey || keys.speechifyKey);
}

export function useApiKeysConfigured(): boolean {
  const [configured, setConfigured] = useState(apiKeysConfigured);
  useEffect(() => {
    const refresh = () => setConfigured(apiKeysConfigured());
    refresh();
    window.addEventListener("scenering-api-keys-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("scenering-api-keys-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return configured;
}
