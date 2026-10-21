/**
 * Speech-to-text for the audio INSIDE an uploaded video.
 *
 * WHY ON-DEVICE: the owner's rule is that no paid transcription service goes in
 * without its cost being named and approved. This one costs nothing — no API
 * key, no account, no per-minute charge, and the customer's audio never leaves
 * their browser. The engine is OpenAI's Whisper (open source) running through
 * Transformers.js (Apache-2.0) in a Web Worker, with the model weights fetched
 * once from the Hugging Face hub and kept in the browser's own cache after
 * that. A three-minute clip transcribes in roughly its own length on a laptop.
 *
 * WHAT IT COSTS INSTEAD, so nobody is surprised: a one-time model download
 * (the exact size depends on which fallback loads), and CPU time while it runs.
 * Both are reported on screen as they happen.
 *
 * WHY A CDN RATHER THAN A DEPENDENCY: the engine ships `onnxruntime-node` and
 * `sharp` as hard dependencies, whose install scripts download native binaries.
 * Putting that in package.json would make `npm install` fail for anyone without
 * those hosts reachable — including CI and this repository's own test run — to
 * add code that only ever runs in a browser. It is therefore loaded on demand
 * from jsDelivr with a dynamic import Vite is told to leave alone, which is why
 * `script-src` allows that one host (see server.ts) and nothing in the main
 * bundle grows.
 *
 * The provider is behind a small interface so a different engine (a customer's
 * own API key, a server-side model) can be added later without touching the
 * callers: Setup, the Captions step and the clip panel all just ask for a
 * transcript of a scene's footage.
 */

import type { WordTiming } from "./word-sync";
import type {
  TranscriptionWorkerFailure,
  TranscriptionWorkerProgress,
  TranscriptionWorkerResponse,
  TranscriptionWorkerResult,
} from "./speech-to-text-protocol";

/** Where the engine is loaded from. Pinned: a new major must not arrive by itself. */
export const STT_ENGINE_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

/**
 * Tried in order until one loads and runs.
 *
 * These exact ids are used by upstream Transformers.js examples/tests and the
 * Remotion Whisper integration. In particular, English-only model names use a
 * dot (`base.en`), not the underscore (`base_en`) that made two old candidates
 * point at repositories that were never documented upstream. Every candidate
 * here supports timestamps; `chunksToWordTimings` still handles segment-level
 * output defensively if a runtime returns it.
 */
export const STT_MODEL_CANDIDATES: readonly string[] = [
  // Tiny first is intentional: loading Base first can consume enough memory to
  // make a modest laptop tab unresponsive before one word is produced.
  "onnx-community/whisper-tiny.en_timestamped",
  "onnx-community/whisper-base.en_timestamped",
  "onnx-community/whisper-base_timestamped",
];

/** Maximum silence while the worker demuxes and decodes the soundtrack. */
export const STT_AUDIO_TIMEOUT_MS = 120_000;
/** Maximum silence while the small engine module itself is fetched. */
export const STT_ENGINE_TIMEOUT_MS = 30_000;
/** Maximum silence between model-download progress events. */
export const STT_MODEL_TIMEOUT_MS = 90_000;
/** Minimum inference allowance; longer clips get proportionally more time. */
export const STT_INFERENCE_MIN_TIMEOUT_MS = 120_000;

export type TranscriptionStage = "audio" | "engine" | "model" | "transcribing" | "done";

export interface TranscriptionProgress {
  stage: TranscriptionStage;
  /** A sentence fit to put on screen. */
  message: string;
  /** 0..1 within the current stage, when it can be known. */
  fraction?: number;
}

export interface TranscriptionResult {
  words: WordTiming[];
  text: string;
  /** Which model actually answered, so the UI can say what was used. */
  model: string;
  /** True when timings are per word; false when they had to be spread over segments. */
  wordLevel: boolean;
  /** Seconds of audio that was transcribed. */
  audioSeconds: number;
}

export class TranscriptionError extends Error {}

export interface TranscriptionOptions {
  onProgress?: (progress: TranscriptionProgress) => void;
  /** Legacy polling cancellation hook, converted internally to the same AbortSignal. */
  cancelled?: () => boolean;
  /** Cancels a download/inference immediately when the caller stops the run. */
  signal?: AbortSignal;
  /** Override each stage timeout (primarily for embedded callers and tests). */
  timeoutMs?: number;
  /** Override the model list (a creator who wants the larger model can set one). */
  models?: readonly string[];
  /** Duration hint for timeout sizing; the worker-decoded soundtrack supplies the exact result. */
  audioSeconds?: number;
}

/** A timeout is operational, not a user cancellation or a no-speech result. */
export class TranscriptionTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptionTimeoutError";
  }
}

/**
 * Runs one engine operation behind both an AbortSignal and a real rejecting
 * timer. Passing the signal gives cooperative fetches a chance to stop; the
 * rejecting timer is still essential because older Transformers.js internals
 * can ignore that signal. `keepAlive` restarts the timer while a model download
 * is making progress, so a slow connection is allowed and a stalled one is not.
 */
export function runWithTranscriptionTimeout<T>(
  operation: (signal: AbortSignal, keepAlive: () => void) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  parentSignal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      parentSignal?.removeEventListener("abort", onParentAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const failForTimeout = () => {
      const error = new TranscriptionTimeoutError(timeoutMessage);
      try { controller.abort(error); } catch { controller.abort(); }
      finish(() => reject(error));
    };
    const keepAlive = () => {
      if (settled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(failForTimeout, Math.max(1, timeoutMs));
    };
    const onParentAbort = () => {
      const error = new TranscriptionError("Transcription cancelled.");
      try { controller.abort(parentSignal?.reason ?? error); } catch { controller.abort(); }
      finish(() => reject(error));
    };

    if (parentSignal?.aborted) {
      onParentAbort();
      return;
    }
    parentSignal?.addEventListener("abort", onParentAbort, { once: true });
    keepAlive();

    // Defer invocation so a parent that is already cancelling this turn can
    // prevent an expensive module fetch/model job from starting at all.
    void Promise.resolve().then(async () => {
      if (settled) return;
      try {
        const value = await operation(controller.signal, keepAlive);
        finish(() => resolve(value));
      } catch (error) {
        finish(() => reject(error));
      }
    });
  });
}

/** True when this browser can hand a local media Blob to a module worker. */
export function transcriptionSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Blob !== "undefined" &&
    typeof fetch === "function" &&
    typeof Worker === "function"
  );
}

interface RawChunk {
  text?: string;
  timestamp?: [number | null, number | null] | null;
}

/**
 * Words with a start and an end, from whatever the model returned.
 *
 * Three shapes occur in practice:
 *  - word-level: one chunk per word, both ends present;
 *  - segment-level: one chunk per phrase, sometimes with a null end;
 *  - a final chunk whose end is null because the audio stopped there.
 * All three become a plain word clock, since that is what the caption
 * renderer consumes.
 */
export function chunksToWordTimings(
  chunks: readonly RawChunk[],
  fallbackEndSeconds: number
): { words: WordTiming[]; wordLevel: boolean } {
  const words: WordTiming[] = [];
  let wordLevel = true;

  for (const chunk of chunks || []) {
    const raw = String(chunk?.text ?? "");
    const [rawStart, rawEnd] = chunk?.timestamp ?? [null, null];
    const start = Number.isFinite(rawStart as number) ? Math.max(0, Number(rawStart)) : null;
    const end = Number.isFinite(rawEnd as number) ? Math.max(0, Number(rawEnd)) : null;
    const parts = raw.split(/(\s+)/).filter((piece) => piece.length > 0);

    // Count the real words: a word-level model returns one per chunk, so a
    // chunk holding several words means the timings are per segment.
    const spoken = parts.filter((piece) => piece.trim().length > 0).length;
    if (spoken > 1) wordLevel = false;

    if (spoken <= 1) {
      const text = raw.trim();
      if (!text) continue;
      const at = start ?? (words.length > 0 ? words[words.length - 1].end : 0);
      words.push({ text, start: at, end: end ?? at });
      continue;
    }

    /* Several words in one timed span: spread them across it by length. Even
       spacing by character count follows speech far better than even spacing
       by word, because the long words are the slow ones. */
    const from = start ?? (words.length > 0 ? words[words.length - 1].end : 0);
    const to = end ?? Math.max(from, fallbackEndSeconds);
    const span = Math.max(0, to - from);
    const lengths = parts.filter((piece) => piece.trim().length > 0).map((piece) => piece.trim().length);
    const total = Math.max(1, lengths.reduce((a, b) => a + b, 0));
    let cursor = from;
    let index = 0;
    for (const piece of parts) {
      const text = piece.trim();
      if (!text) continue;
      const share = (lengths[index] / total) * span;
      words.push({ text, start: cursor, end: cursor + share });
      cursor += share;
      index++;
    }
  }

  // A word with no end at all still needs one, or the highlight never leaves it.
  let last = 0;
  for (const word of words) {
    if (word.start < last) word.start = last;
    if (!(word.end > word.start)) word.end = word.start + 0.18;
    last = word.end;
  }
  return { words, wordLevel };
}

/** The joined text, for the scene's caption field. */
export function wordsToText(words: readonly WordTiming[]): string {
  return words
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cancelledError(): TranscriptionError {
  return new TranscriptionError("Transcription cancelled.");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw cancelledError();
}

/**
 * Fetch only a Blob handle on the page. Reading compressed bytes, demuxing the
 * video, decoding its audio and resampling all happen inside the worker. Blob
 * structured cloning is handle-based, so even a large upload is not copied
 * into a giant main-thread ArrayBuffer.
 */
async function openSourceBlob(
  sourceUrl: string,
  signal: AbortSignal,
  report: (progress: TranscriptionProgress) => void
): Promise<Blob> {
  report({ stage: "audio", message: "Opening the video's soundtrack…", fraction: 0 });
  try {
    const response = await fetch(sourceUrl, { signal });
    if (!response.ok) {
      throw new TranscriptionError(`The video's audio could not be opened (HTTP ${response.status}).`);
    }
    const source = await response.blob();
    throwIfAborted(signal);
    if (source.size <= 0) {
      throw new TranscriptionError("The uploaded video file is empty.");
    }
    report({
      stage: "audio",
      message: "Video opened. Sending it to the background audio decoder…",
      fraction: 0,
    });
    return source;
  } catch (error) {
    if (signal.aborted) throw cancelledError();
    if (error instanceof TranscriptionError) throw error;
    throw new TranscriptionError(
      `The video's audio could not be opened. (${(error as Error)?.message || "read failed"})`
    );
  }
}

let sharedTranscriptionWorker: Worker | null = null;
let activeWorkerCancel: ((error: Error) => void) | null = null;
let nextWorkerRequestId = 1;

function getTranscriptionWorker(): Worker {
  if (!sharedTranscriptionWorker) {
    sharedTranscriptionWorker = new Worker(
      new URL("./speech-to-text.worker.ts", import.meta.url),
      { type: "module", name: "scenering-transcription" }
    );
  }
  return sharedTranscriptionWorker;
}

function terminateTranscriptionWorker(worker: Worker): void {
  try { worker.terminate(); } catch {}
  if (sharedTranscriptionWorker === worker) sharedTranscriptionWorker = null;
}

function workerFailure(error: TranscriptionWorkerFailure): TranscriptionError {
  switch (error.stage) {
    case "audio":
      return new TranscriptionError(
        `The video's soundtrack could not be prepared in the background. (${error.message})`
      );
    case "engine":
      return new TranscriptionError(
        `The transcription engine failed to load. Check the connection and try again. (${error.message})`
      );
    case "model":
      return new TranscriptionError(
        `The Whisper transcription models failed to load. Check the connection and try again. (${error.message})`
      );
    case "inference":
      return new TranscriptionError(
        `Whisper loaded, but transcription failed while listening to the audio. Try again, or import an SRT file. (${error.message})`
      );
    case "no-speech":
      return new TranscriptionError(error.message);
  }
}

/**
 * Runs Whisper in a persistent module worker. Timeouts live here on the UI
 * thread, so they still fire even if ONNX/WASM stops yielding inside the
 * worker; cancellation terminates that worker and therefore really stops CPU.
 */
function transcribeInWorker(
  source: Blob,
  models: readonly string[],
  durationHint: number,
  options: TranscriptionOptions,
  report: (progress: TranscriptionProgress) => void
): Promise<TranscriptionWorkerResult> {
  activeWorkerCancel?.(cancelledError());
  const worker = getTranscriptionWorker();
  const id = nextWorkerRequestId++;
  const audioTimeoutMs = options.timeoutMs ?? Math.max(
    STT_AUDIO_TIMEOUT_MS,
    Math.ceil(Math.max(0, durationHint) * 1_000)
  );
  const engineTimeoutMs = options.timeoutMs ?? STT_ENGINE_TIMEOUT_MS;
  const modelTimeoutMs = options.timeoutMs ?? STT_MODEL_TIMEOUT_MS;
  const inferenceTimeoutMs = options.timeoutMs ?? Math.max(
    STT_INFERENCE_MIN_TIMEOUT_MS,
    Math.ceil(Math.max(0, durationHint) * 2_000)
  );

  return new Promise<TranscriptionWorkerResult>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let inferenceStartedAt = 0;
    let completedFraction = 0;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      if (heartbeat) clearInterval(heartbeat);
      timeout = null;
      heartbeat = null;
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onWorkerError);
      worker.removeEventListener("messageerror", onMessageError);
      options.signal?.removeEventListener("abort", onAbort);
      if (activeWorkerCancel === cancelRun) activeWorkerCancel = null;
    };
    const finish = (callback: () => void, terminate = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (terminate) terminateTranscriptionWorker(worker);
      callback();
    };
    const armTimeout = (milliseconds: number, message: string) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        finish(() => reject(new TranscriptionTimeoutError(message)), true);
      }, Math.max(1, milliseconds));
    };
    const startHeartbeat = () => {
      if (!inferenceStartedAt) inferenceStartedAt = Date.now();
      if (heartbeat) return;
      heartbeat = setInterval(() => {
        if (settled) return;
        const elapsed = Math.max(1, Math.round((Date.now() - inferenceStartedAt) / 1000));
        const percent = Math.round(completedFraction * 100);
        report({
          stage: "transcribing",
          message: completedFraction > 0
            ? `Whisper is working in the background · ${percent}% of the audio completed · ${elapsed}s elapsed`
            : `Whisper is working on the first 30-second section in the background · ${elapsed}s elapsed`,
          fraction: completedFraction,
        });
      }, 1_000);
    };
    const cancelRun = (error: Error) => finish(() => reject(error), true);
    const onAbort = () => cancelRun(cancelledError());
    const onWorkerError = (event: ErrorEvent) => {
      finish(
        () => reject(new TranscriptionError(`The transcription worker stopped unexpectedly. (${event.message || "worker error"})`)),
        true
      );
    };
    const onMessageError = () => {
      finish(() => reject(new TranscriptionError("The transcription worker returned unreadable data.")), true);
    };
    const onMessage = (event: MessageEvent<TranscriptionWorkerResponse>) => {
      const message = event.data;
      if (!message || message.id !== id) return;
      if (message.type === "result") {
        finish(() => resolve(message));
        return;
      }
      if (message.type === "failure") {
        finish(() => reject(workerFailure(message)));
        return;
      }

      const progressMessage: TranscriptionWorkerProgress = message;
      if (progressMessage.stage !== "transcribing") {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        inferenceStartedAt = 0;
        completedFraction = 0;
      }

      if (progressMessage.stage === "audio") {
        armTimeout(
          audioTimeoutMs,
          `The background audio decoder stopped making progress for ${Math.round(audioTimeoutMs / 1000)} seconds.`
        );
      } else if (progressMessage.event === "engine-start") {
        armTimeout(
          engineTimeoutMs,
          `The transcription engine failed to load within ${Math.round(engineTimeoutMs / 1000)} seconds.`
        );
      } else if (
        progressMessage.event === "engine-ready" ||
        progressMessage.event === "model-start" ||
        progressMessage.event === "model-progress" ||
        progressMessage.event === "model-fallback"
      ) {
        armTimeout(
          modelTimeoutMs,
          `The Whisper model stopped making download progress for ${Math.round(modelTimeoutMs / 1000)} seconds.`
        );
      } else {
        if (typeof progressMessage.fraction === "number") {
          completedFraction = Math.max(completedFraction, progressMessage.fraction);
        }
        startHeartbeat();
        armTimeout(
          inferenceTimeoutMs,
          `Whisper stopped making transcription progress for ${Math.round(inferenceTimeoutMs / 1000)} seconds.`
        );
      }
      report({
        stage: progressMessage.stage,
        message: progressMessage.message,
        fraction: progressMessage.fraction,
      });
    };

    if (options.signal?.aborted) {
      finish(() => reject(cancelledError()), true);
      return;
    }
    activeWorkerCancel = cancelRun;
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onWorkerError);
    worker.addEventListener("messageerror", onMessageError);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    armTimeout(
      audioTimeoutMs,
      `The background audio decoder did not start within ${Math.round(audioTimeoutMs / 1000)} seconds.`
    );
    try {
      worker.postMessage({
        type: "start",
        id,
        engineUrl: STT_ENGINE_URL,
        models: [...models],
        source,
        durationHint,
      });
    } catch (error) {
      finish(
        () => reject(new TranscriptionError(`The transcription worker could not start. (${(error as Error)?.message || "start failed"})`)),
        true
      );
    }
  });
}

/**
 * Transcribes the audio at `sourceUrl` (a `blob:`, `http(s):` or data address).
 *
 * Throws `TranscriptionError` with a sentence fit for the screen — never a raw
 * engine message on its own, because the caller has to explain what to do
 * next.
 */
export async function transcribeAudioUrl(
  sourceUrl: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  if (!transcriptionSupported()) {
    throw new TranscriptionError("This browser cannot run on-device transcription.");
  }
  const report = (progress: TranscriptionProgress) => {
    try {
      options.onProgress?.(progress);
    } catch {
      /* a broken progress UI must not fail the transcription */
    }
  };

  // Convert the legacy polling cancellation hook into the same AbortSignal the
  // audio preparation and worker runner use. Cancel now terminates WASM rather
  // than merely ignoring its eventual answer.
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted || options.cancelled?.()) controller.abort();
  else options.signal?.addEventListener("abort", forwardAbort, { once: true });
  const cancelPoll = setInterval(() => {
    if (options.cancelled?.()) controller.abort();
  }, 100);

  try {
    throwIfAborted(controller.signal);
    const source = await openSourceBlob(sourceUrl, controller.signal, report);
    throwIfAborted(controller.signal);
    const candidates = options.models?.length ? options.models : STT_MODEL_CANDIDATES;
    const durationHint = Math.max(0, Number(options.audioSeconds) || 0);

    const result = await transcribeInWorker(
      source,
      candidates,
      durationHint,
      { ...options, signal: controller.signal },
      report
    );
    throwIfAborted(controller.signal);

    const audioSeconds = result.audioSeconds;
    const chunks: RawChunk[] = Array.isArray(result.output?.chunks) ? result.output.chunks : [];
    const { words, wordLevel } = chunksToWordTimings(chunks, audioSeconds);
    const text = wordsToText(words) || String(result.output?.text ?? "").trim();
    if (!text) {
      throw new TranscriptionError(
        "No speech was found in that video's audio. If it is mostly music, type the captions in the Captions step instead."
      );
    }
    report({ stage: "done", message: "Transcript ready.", fraction: 1 });
    return { words, text, model: result.model, wordLevel, audioSeconds };
  } catch (error) {
    if (controller.signal.aborted) throw cancelledError();
    if (error instanceof TranscriptionError || error instanceof TranscriptionTimeoutError) throw error;
    throw new TranscriptionError(
      `Transcription failed unexpectedly. (${(error as Error)?.message || "unknown error"})`
    );
  } finally {
    clearInterval(cancelPoll);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}

/**
 * Transcribes the clip attached to a scene, resolving its stored address first.
 *
 * Split out because every caller has a scene and not a URL, and because the
 * resolution has to go through the upload store (`custom-video:<id>` is not a
 * URL the engine can fetch).
 */
export async function transcribeSceneClip(
  scene: { video_url?: string | null; video_duration?: number },
  resolveUrl: (url: string | null | undefined) => string | null,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const resolved = resolveUrl(scene?.video_url);
  if (!resolved) {
    throw new TranscriptionError(
      "That scene's footage is not in this browser's storage any more, so its audio cannot be read. Re-upload the video and try again."
    );
  }
  return transcribeAudioUrl(resolved, {
    ...options,
    audioSeconds: options.audioSeconds ?? Math.max(0, Number(scene?.video_duration) || 0),
  });
}
