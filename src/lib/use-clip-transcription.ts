/**
 * The state machine behind every "generate captions from this video" button.
 *
 * One hook rather than three copies, because Setup, the Captions step and the
 * clip panel all do the same job and must report it the same way: what stage
 * the run is at, how far through the model download, and — when it fails — a
 * sentence the creator can act on instead of an engine stack trace.
 *
 * It deliberately knows nothing about scenes. Callers hand it an address to
 * read audio from and decide what to do with the words that come back, which
 * is what lets Setup run a transcription before the project even exists.
 */

import { useCallback, useRef, useState } from "react";
import {
  transcribeAudioUrl,
  TranscriptionError,
  type TranscriptionProgress,
  type TranscriptionResult,
} from "./speech-to-text";

export interface ClipTranscriptionState {
  busy: boolean;
  /** The last stage reported, for the progress line under the button. */
  progress: TranscriptionProgress | null;
  /** A sentence fit for the screen, or null. */
  error: string | null;
  /** The finished transcript, kept so the caller can re-apply it. */
  result: TranscriptionResult | null;
  generate: (sourceUrl: string, audioSeconds: number) => Promise<TranscriptionResult | null>;
  cancel: () => void;
  reset: () => void;
}

export function useClipTranscription(): ClipTranscriptionState {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const cancelledRef = useRef(false);
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    // Invalidate the old callbacks before aborting: its cancellation rejection
    // must not repopulate the error that reset is about to clear.
    runRef.current += 1;
    cancelledRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setProgress(null);
    setError(null);
    setResult(null);
  }, []);

  const generate = useCallback(
    async (sourceUrl: string, audioSeconds: number): Promise<TranscriptionResult | null> => {
      // A second run supersedes the first: its result must not land on top of
      // the newer one just because it finished later.
      const run = ++runRef.current;
      // Superseding a run also stops its model fetch/inference rather than only
      // ignoring the eventual result.
      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;
      cancelledRef.current = false;
      setBusy(true);
      setError(null);
      setResult(null);
      setProgress({ stage: "engine", message: "Loading the transcription engine…", fraction: 0 });
      try {
        const done = await transcribeAudioUrl(sourceUrl, {
          audioSeconds,
          signal: abortController.signal,
          cancelled: () => cancelledRef.current,
          onProgress: (next) => {
            if (runRef.current === run) setProgress(next);
          },
        });
        if (runRef.current !== run) return null;
        setResult(done);
        return done;
      } catch (err) {
        if (runRef.current !== run) return null;
        /* Cancelling is the creator's decision, not a failure. The engine
           reports it by throwing, so it has to be told apart here or the word
           "cancelled" is shown in the red error box meant for real problems. */
        if (cancelledRef.current) {
          setError(null);
          setProgress(null);
          return null;
        }
        const message =
          err instanceof TranscriptionError
            ? err.message
            : (err as Error)?.message || "Transcription failed.";
        setError(message);
        return null;
      } finally {
        if (runRef.current === run) {
          if (abortRef.current === abortController) abortRef.current = null;
          setBusy(false);
        }
      }
    },
    []
  );

  return { busy, progress, error, result, generate, cancel, reset };
}
