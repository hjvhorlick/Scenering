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
 * WHAT IT COSTS INSTEAD, so nobody is surprised: about 40 MB the first time
 * (the engine plus a quantised Whisper), and CPU time while it runs. Both are
 * reported on screen as they happen.
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

/** Where the engine is loaded from. Pinned: a new major must not arrive by itself. */
export const STT_ENGINE_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

/**
 * Tried in order until one loads and runs.
 *
 * The `_timestamped` variants are the ones that report a start and end for
 * every word, which is what a karaoke caption needs. The plain model is last:
 * it still gives segment timestamps, and `spreadWordsOverSegments` turns those
 * into a usable per-word clock rather than failing the whole feature.
 */
export const STT_MODEL_CANDIDATES: readonly string[] = [
  "onnx-community/whisper-base_en_timestamped",
  "onnx-community/whisper-tiny.en_timestamped",
  "onnx-community/whisper-base_en",
];

export type TranscriptionStage = "engine" | "model" | "transcribing" | "done";

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
  /** Checked between stages; a cancelled run throws TranscriptionError. */
  cancelled?: () => boolean;
  /** Override the model list (a creator who wants the larger model can set one). */
  models?: readonly string[];
  /** Seconds of audio being transcribed, echoed back on the result. */
  audioSeconds?: number;
}

/** The engine's own module, loaded once per page. */
let enginePromise: Promise<any> | null = null;
/** A loaded transcriber per model id, so a second run does not reload weights. */
const transcribers = new Map<string, any>();

/** True when this browser can even try: ESM dynamic import and Web Audio. */
export function transcriptionSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof AudioContext !== "undefined" &&
    typeof fetch === "function" &&
    typeof Worker === "function"
  );
}

function loadEngine(): Promise<any> {
  if (!enginePromise) {
    enginePromise = import(/* @vite-ignore */ STT_ENGINE_URL).catch((error) => {
      enginePromise = null;
      throw new TranscriptionError(
        "The transcription engine could not be loaded. Check the connection — it is fetched once from jsDelivr and cached after that." +
          ` (${(error as Error)?.message || "unknown error"})`
      );
    });
  }
  return enginePromise;
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
  const bailIfCancelled = () => {
    if (options.cancelled?.()) throw new TranscriptionError("Transcription cancelled.");
  };

  report({ stage: "engine", message: "Loading the transcription engine…", fraction: 0 });
  const engine = await loadEngine();
  bailIfCancelled();

  try {
    // Weights come from the hub, never from a local folder, and the browser's
    // own cache keeps them after the first run.
    engine.env.allowLocalModels = false;
    engine.env.useBrowserCache = true;
  } catch {
    /* older engine builds name these differently; the defaults are the same */
  }

  const candidates = options.models?.length ? options.models : STT_MODEL_CANDIDATES;
  const failures: string[] = [];

  for (const modelId of candidates) {
    bailIfCancelled();
    try {
      let transcriber = transcribers.get(modelId);
      if (!transcriber) {
        report({ stage: "model", message: `Downloading ${modelId.split("/")[1]} (about 40 MB, once)…`, fraction: 0 });
        transcriber = await engine.pipeline("automatic-speech-recognition", modelId, {
          // Quantised weights: a quarter of the download, and indistinguishable
          // at this job.
          dtype: { encoder_model: "q8", decoder_model_merged: "q4" },
          progress_callback: (item: any) => {
            if (item?.status !== "progress" || typeof item.progress !== "number") return;
            report({
              stage: "model",
              message: `Downloading ${modelId.split("/")[1]}…`,
              fraction: Math.max(0, Math.min(1, item.progress / 100)),
            });
          },
        });
        transcribers.set(modelId, transcriber);
      }

      bailIfCancelled();
      report({ stage: "transcribing", message: "Listening to your video's audio…" });
      const output = await transcriber(sourceUrl, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: "word",
      });
      bailIfCancelled();

      const audioSeconds = Math.max(0, options.audioSeconds ?? 0);
      const chunks: RawChunk[] = Array.isArray(output?.chunks) ? output.chunks : [];
      const { words, wordLevel } = chunksToWordTimings(chunks, audioSeconds);
      const text = wordsToText(words) || String(output?.text ?? "").trim();
      if (!text) {
        throw new TranscriptionError(
          "No speech was found in that video's audio. If it is mostly music, type the captions in the Captions step instead."
        );
      }
      report({ stage: "done", message: "Transcript ready.", fraction: 1 });
      return { words, text, model: modelId, wordLevel, audioSeconds };
    } catch (error) {
      if (error instanceof TranscriptionError) throw error;
      const message = (error as Error)?.message || String(error);
      failures.push(`${modelId}: ${message}`);
      console.warn("Transcription model failed:", message);
    }
  }

  throw new TranscriptionError(
    "Transcription could not run in this browser. " +
      (failures.length > 0 ? `(${failures[0]})` : "") +
      " You can still type the captions in the Captions step, or import an SRT file."
  );
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
