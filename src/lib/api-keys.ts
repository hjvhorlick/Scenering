export interface CustomerApiKeys {
  pexelsKey: string;
  pixabayKey: string;
  speechifyKey: string;
}

const STORAGE_KEY = "scenering_customer_api_keys";

export function getStoredApiKeys(): CustomerApiKeys {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { pexelsKey: "", pixabayKey: "", speechifyKey: "" };
    const parsed = JSON.parse(raw);
    return {
      pexelsKey: typeof parsed.pexelsKey === "string" ? parsed.pexelsKey.trim() : "",
      pixabayKey: typeof parsed.pixabayKey === "string" ? parsed.pixabayKey.trim() : "",
      speechifyKey: typeof parsed.speechifyKey === "string" ? parsed.speechifyKey.trim() : "",
    };
  } catch {
    return { pexelsKey: "", pixabayKey: "", speechifyKey: "" };
  }
}

export function saveStoredApiKeys(keys: CustomerApiKeys): void {
  try {
    const cleaned: CustomerApiKeys = {
      pexelsKey: keys.pexelsKey.trim(),
      pixabayKey: keys.pixabayKey.trim(),
      speechifyKey: keys.speechifyKey.trim(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    window.dispatchEvent(new CustomEvent("scenering-api-keys-updated", { detail: cleaned }));
  } catch (err) {
    console.error("Failed to save API keys to localStorage:", err);
  }
}

export function clearStoredApiKeys(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(
      new CustomEvent("scenering-api-keys-updated", {
        detail: { pexelsKey: "", pixabayKey: "", speechifyKey: "" },
      })
    );
  } catch (err) {
    console.error("Failed to clear API keys:", err);
  }
}

export function getApiKeysHeaders(): Record<string, string> {
  const keys = getStoredApiKeys();
  const headers: Record<string, string> = {};
  if (keys.pexelsKey) {
    headers["X-Pexels-Key"] = keys.pexelsKey;
  }
  if (keys.pixabayKey) {
    headers["X-Pixabay-Key"] = keys.pixabayKey;
  }
  return headers;
}

/**
 * Kept for compatibility with existing search call sites. Provider keys must
 * never be placed in URLs because URLs are commonly retained in browser,
 * proxy and server logs; they travel only in request headers.
 */
export function getApiKeysQueryParams(): string {
  return "";
}
