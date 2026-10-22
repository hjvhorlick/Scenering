import { useEffect, useState } from "react";
import Icon from "./icons/Icon";
import {
  describeBreakdown,
  describeCleanup,
  releaseSceneringSpace,
  storageBreakdown,
} from "../lib/storage-health";

/**
 * The amber note shown when an upload worked for this tab but could not be
 * kept on the device — nearly always because the device is out of storage.
 *
 * It is not a passive warning. A customer whose disk is full has no way to
 * discover that Scenering is holding abandoned render files and unreferenced
 * uploads on it, so the note carries the one action that can help: clear
 * those, report exactly what was freed, and invite a retry. Nothing a saved
 * project uses is touched (see `releaseSceneringSpace`).
 */
export default function StorageWarningNote({
  message,
  onDismiss,
  variant = "panel",
}: {
  message: string;
  onDismiss?: () => void;
  /** `inline` for the compact scene row, `panel` for the fuller cards. */
  variant?: "inline" | "panel";
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  /** "Using 1.4 GB of 2.0 GB — 900 MB of it finished renders in the Vault." */
  const [breakdown, setBreakdown] = useState("");

  useEffect(() => {
    let active = true;
    void storageBreakdown()
      .then((measured) => {
        if (active) setBreakdown(describeBreakdown(measured));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const freeUpSpace = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setResult(describeCleanup(await releaseSceneringSpace()));
    } catch {
      setResult("That could not be cleared. Free space in the device's own settings and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (variant === "inline") {
    return (
      <div className="text-[10px] text-amber-300 space-y-1">
        <div className="flex items-start gap-1.5">
          <span>{message}</span>
          {onDismiss && (
            <button type="button" onClick={onDismiss} className="text-amber-400/70 hover:text-white shrink-0" title="Dismiss">
              ✕
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={freeUpSpace}
          disabled={busy}
          className="px-1.5 py-0.5 rounded border border-amber-700/70 text-amber-200 hover:bg-amber-900/40 disabled:opacity-60"
        >
          {busy ? "Clearing…" : "Free up space"}
        </button>
        {result && <p className="text-amber-200/90">{result}</p>}
        {!result && breakdown && <p className="text-amber-200/70">{breakdown}</p>}
      </div>
    );
  }

  return (
    <div className="px-3 py-2 rounded-lg bg-amber-950/50 border border-amber-800/70 text-amber-200 text-[11px] space-y-2">
      <div className="flex items-start gap-2">
        <span className="flex-1 leading-relaxed">{message}</span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-amber-300/70 hover:text-white shrink-0"
            title="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={freeUpSpace}
          disabled={busy}
          className="px-2 py-1 rounded-lg bg-amber-600/90 hover:bg-amber-500 text-gray-950 font-semibold disabled:opacity-60 flex items-center gap-1"
        >
          <Icon glyph="🗑" /> {busy ? "Clearing unused files…" : "Free up space"}
        </button>
        <span className="text-amber-200/70">
          Clears unused uploads and abandoned render files — never anything a project uses.
        </span>
      </div>
      {result ? (
        <p className="text-amber-100/90">{result}</p>
      ) : (
        breakdown && <p className="text-amber-200/70 leading-relaxed">{breakdown}</p>
      )}
    </div>
  );
}
