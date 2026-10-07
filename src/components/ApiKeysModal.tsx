import { useState, useEffect } from "react";
import { getStoredApiKeys, saveStoredApiKeys, clearStoredApiKeys, CustomerApiKeys } from "../lib/api-keys";
import { verifySpeechifyApiKey } from "../lib/speechify-client";
import Icon, { iconify } from "./icons/Icon";

interface ApiKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function ApiKeysModal({ isOpen, onClose, onSaved }: ApiKeysModalProps) {
  const [pexelsKey, setPexelsKey] = useState("");
  const [pixabayKey, setPixabayKey] = useState("");
  const [speechifyKey, setSpeechifyKey] = useState("");
  const [showPexels, setShowPexels] = useState(false);
  const [showPixabay, setShowPixabay] = useState(false);
  const [showSpeechify, setShowSpeechify] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<{
    pexels?: { valid: boolean; message: string };
    pixabay?: { valid: boolean; message: string };
    speechify?: { valid: boolean; message: string };
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const current = getStoredApiKeys();
      setPexelsKey(current.pexelsKey);
      setPixabayKey(current.pixabayKey);
      setSpeechifyKey(current.speechifyKey);
      setTestResults(null);
      setSaveSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestAndSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setTesting(true);
    setTestResults(null);
    setSaveSuccess(false);

    const keysToSave: CustomerApiKeys = {
      pexelsKey: pexelsKey.trim(),
      pixabayKey: pixabayKey.trim(),
      speechifyKey: speechifyKey.trim(),
    };

    const results: {
      pexels?: { valid: boolean; message: string };
      pixabay?: { valid: boolean; message: string };
      speechify?: { valid: boolean; message: string };
    } = {};

    try {
      // Only image-search keys are sent to Scenering's existing image-key
      // verifier. Speechify is tested below with a direct browser request.
      if (keysToSave.pexelsKey || keysToSave.pixabayKey) {
        const res = await fetch("/api/verify-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pexelsKey: keysToSave.pexelsKey,
            pixabayKey: keysToSave.pixabayKey,
          }),
        });
        const data = await res.json().catch(() => null);
        if (keysToSave.pexelsKey) {
          results.pexels = {
            valid: data?.status?.pexels?.valid ?? false,
            message: data?.status?.pexels?.valid
              ? "Valid key! Pexels HD search enabled."
              : (data?.status?.pexels?.error || "Key could not be verified with Pexels."),
          };
        }
        if (keysToSave.pixabayKey) {
          results.pixabay = {
            valid: data?.status?.pixabay?.valid ?? false,
            message: data?.status?.pixabay?.valid
              ? "Valid key! Pixabay search enabled."
              : (data?.status?.pixabay?.error || "Key could not be verified with Pixabay."),
          };
        }
      }

      if (keysToSave.speechifyKey) {
        try {
          results.speechify = await verifySpeechifyApiKey(keysToSave.speechifyKey);
        } catch (error: any) {
          results.speechify = {
            valid: false,
            message: error?.message || "Speechify could not verify this API key directly.",
          };
        }
      }

      saveStoredApiKeys(keysToSave);
      setTestResults(results);
      setSaveSuccess(true);
      if (onSaved) onSaved();
    } catch (err: any) {
      // Fallback save anyway so the customer isn't blocked
      saveStoredApiKeys(keysToSave);
      setSaveSuccess(true);
      if (onSaved) onSaved();
    } finally {
      setTesting(false);
    }
  };

  const handleClear = () => {
    if (confirm("Clear all saved provider API keys?")) {
      clearStoredApiKeys();
      setPexelsKey("");
      setPixabayKey("");
      setSpeechifyKey("");
      setTestResults(null);
      setSaveSuccess(true);
      if (onSaved) onSaved();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="min-h-full flex items-start justify-center p-0 sm:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
      <div
        className="bg-gray-900 border border-hairline rounded-t-2xl sm:rounded-2xl w-full max-w-xl sm:my-4 shadow-xl animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-hairline flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold">
              🔑
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Provider API Keys</h2>
              <p className="text-xs text-gray-400">
                Add your own stock-image and Speechify voiceover keys
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleTestAndSave} className="p-6 space-y-5">
          {/* Success Banner */}
          {saveSuccess && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>
                {pexelsKey.trim() || pixabayKey.trim() || speechifyKey.trim()
                  ? "Keys are saved in this browser. Speechify requests go directly to Speechify; Pexels and Pixabay keys are used for stock-image search."
                  : "All provider keys have been cleared from this browser."}
              </span>
            </div>
          )}

          {/* Pexels Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-200 uppercase tracking-wider flex items-center gap-2">
                <span>Pexels API Key</span>
                {pexelsKey.trim() ? (
                  <span className="text-[10px] bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 px-1.5 py-0.5 rounded font-normal normal-case">
                    Configured
                  </span>
                ) : (
                  <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-normal normal-case">
                    Optional
                  </span>
                )}
              </label>
              <a
                href="https://www.pexels.com/api/new/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 underline inline-flex items-center gap-1"
              >
                Get free Pexels key
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
            <div className="relative">
              <input
                type={showPexels ? "text" : "password"}
                value={pexelsKey}
                onChange={(e) => setPexelsKey(e.target.value)}
                placeholder="Paste your Pexels API key..."
                className="w-full pl-3 pr-10 py-2.5 bg-gray-800/80 border border-hairline rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPexels(!showPexels)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-xs px-1"
              >
                {showPexels ? "Hide" : "Show"}
              </button>
            </div>
            {testResults?.pexels && (
              <p
                className={`text-xs ${
                  testResults.pexels.valid ? "text-emerald-400" : "text-amber-400"
                } flex items-center gap-1.5 pt-0.5`}
              >
                <span>{iconify(testResults.pexels.valid ? "✓" : "⚠")}</span>
                {testResults.pexels.message}
              </p>
            )}
            <p className="text-[11px] text-gray-400">
              High-resolution, cinematic landscape photos curated for narrative videos.
            </p>
          </div>

          {/* Pixabay Section */}
          <div className="space-y-2 pt-2 border-t border-hairline">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-200 uppercase tracking-wider flex items-center gap-2">
                <span>Pixabay API Key</span>
                {pixabayKey.trim() ? (
                  <span className="text-[10px] bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 px-1.5 py-0.5 rounded font-normal normal-case">
                    Configured
                  </span>
                ) : (
                  <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-normal normal-case">
                    Optional
                  </span>
                )}
              </label>
              <a
                href="https://pixabay.com/api/docs/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 underline inline-flex items-center gap-1"
              >
                Get free Pixabay key
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
            <div className="relative">
              <input
                type={showPixabay ? "text" : "password"}
                value={pixabayKey}
                onChange={(e) => setPixabayKey(e.target.value)}
                placeholder="Paste your Pixabay API key..."
                className="w-full pl-3 pr-10 py-2.5 bg-gray-800/80 border border-hairline rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPixabay(!showPixabay)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-xs px-1"
              >
                {showPixabay ? "Hide" : "Show"}
              </button>
            </div>
            {testResults?.pixabay && (
              <p
                className={`text-xs ${
                  testResults.pixabay.valid ? "text-emerald-400" : "text-amber-400"
                } flex items-center gap-1.5 pt-0.5`}
              >
                <span>{iconify(testResults.pixabay.valid ? "✓" : "⚠")}</span>
                {testResults.pixabay.message}
              </p>
            )}
            <p className="text-[11px] text-gray-400">
              Vast library of illustrations, photography, and background scenery.
            </p>
          </div>

          {/* Speechify Section */}
          <div className="space-y-2 pt-2 border-t border-hairline">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-semibold text-gray-200 uppercase tracking-wider flex items-center gap-2">
                <span>Speechify API Key</span>
                {speechifyKey.trim() ? (
                  <span className="text-[10px] bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 px-1.5 py-0.5 rounded font-normal normal-case">
                    Configured
                  </span>
                  ) : (
                    <span className="text-[10px] bg-amber-950/60 text-amber-300 px-1.5 py-0.5 rounded font-normal normal-case">
                      Required for voiceover
                    </span>
                  )}
              </label>
              <a
                href="https://platform.speechify.ai/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 underline inline-flex items-center gap-1 whitespace-nowrap"
              >
                Get Speechify key
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
            <div className="relative">
              <input
                type={showSpeechify ? "text" : "password"}
                value={speechifyKey}
                onChange={(e) => setSpeechifyKey(e.target.value)}
                placeholder="Paste your Speechify API key..."
                autoComplete="off"
                className="w-full pl-3 pr-10 py-2.5 bg-gray-800/80 border border-hairline rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
              />
              <button
                type="button"
                onClick={() => setShowSpeechify(!showSpeechify)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-xs px-1"
              >
                {showSpeechify ? "Hide" : "Show"}
              </button>
            </div>
            {testResults?.speechify && (
              <p
                className={`text-xs ${
                  testResults.speechify.valid ? "text-emerald-400" : "text-amber-400"
                } flex items-center gap-1.5 pt-0.5`}
              >
                <span>{iconify(testResults.speechify.valid ? "✓" : "⚠")}</span>
                {testResults.speechify.message}
              </p>
            )}
            <p className="text-[11px] text-gray-400">
              Used for voiceovers and voice previews. The key stays in this browser and goes directly from your browser to Speechify; Scenering and Cloudflare do not receive it.
            </p>
          </div>

          {/* Wikimedia fallback reminder */}
          <div className="p-3 bg-gray-800/60 rounded-xl border border-hairline text-xs text-gray-400 space-y-1">
            <div className="font-semibold text-gray-300 flex items-center gap-1.5">
              <Icon glyph="ℹ" /> Free Keyless Fallback
            </div>
            <p>
              If no keys are entered or a search yields no results on Pexels/Pixabay, Scenering automatically searches Wikimedia Commons as a free fallback.
            </p>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleClear}
              disabled={testing || (!pexelsKey && !pixabayKey && !speechifyKey)}
              className="px-3 py-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear Keys
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white text-xs font-medium transition-colors"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={testing}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 rounded-lg text-white text-xs font-medium transition-colors flex items-center gap-2"
              >
                {testing ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verifying & Saving...
                  </>
                ) : (
                  "Save & Verify Keys"
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}
