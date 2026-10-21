import type {
  TranscriptionWorkerChunk,
  TranscriptionWorkerFailure,
  TranscriptionWorkerProgress,
  TranscriptionWorkerRequest,
  TranscriptionWorkerResponse,
  TranscriptionWorkerResult,
} from "./speech-to-text-protocol";

/**
 * Whisper runs here, never on React's/UI thread.
 *
 * Terminating this worker is also the one dependable cancellation mechanism:
 * older Transformers.js/ONNX internals do not consistently honour an
 * AbortSignal while WASM is running.
 */

const SAMPLE_RATE = 16_000;
const WINDOW_SECONDS = 30;
const STRIDE_SECONDS = 5;

const workerScope = self as unknown as {
  postMessage(message: TranscriptionWorkerResponse): void;
  onmessage: ((event: MessageEvent<TranscriptionWorkerRequest>) => void) | null;
};

let enginePromise: Promise<any> | null = null;
let engineUrl = "";
const transcribers = new Map<string, any>();

function post(message: TranscriptionWorkerResponse): void {
  workerScope.postMessage(message);
}

function progress(
  id: number,
  message: Omit<TranscriptionWorkerProgress, "type" | "id">
): void {
  post({ type: "progress", id, ...message });
}

function failure(
  id: number,
  stage: TranscriptionWorkerFailure["stage"],
  message: string
): void {
  post({ type: "failure", id, stage, message });
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error || "unknown error");
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  return `${mins}:${String(total % 60).padStart(2, "0")}`;
}

async function loadEngine(url: string): Promise<any> {
  if (!enginePromise || engineUrl !== url) {
    engineUrl = url;
    enginePromise = import(/* @vite-ignore */ url);
  }
  try {
    const engine = await enginePromise;
    engine.env.allowLocalModels = false;
    engine.env.useBrowserCache = true;
    // Keep one CPU core free for painting buttons/progress and handling Cancel.
    // The expensive work is off-thread, but a WASM pool using every core can
    // still make the page feel frozen on a small laptop.
    try {
      engine.env.backends.onnx.wasm.numThreads = 1;
    } catch {}
    return engine;
  } catch (error) {
    enginePromise = null;
    throw error;
  }
}

function timedChunk(
  chunk: TranscriptionWorkerChunk,
  offsetSeconds: number
): TranscriptionWorkerChunk {
  const timestamp = chunk.timestamp;
  if (!timestamp) return { text: chunk.text, timestamp: null };
  const [start, end] = timestamp;
  return {
    text: chunk.text,
    timestamp: [
      typeof start === "number" ? start + offsetSeconds : null,
      typeof end === "number" ? end + offsetSeconds : null,
    ],
  };
}

/**
 * Process one real 30-second window at a time. Besides making progress honest,
 * this prevents a long recording from disappearing into one opaque inference
 * call. Five-second overlaps preserve words at window boundaries; only each
 * window's trusted centre is retained, so captions are not duplicated.
 */
async function transcribeInWindows(
  id: number,
  transcriber: any,
  audio: Float32Array
): Promise<{ text: string; chunks: TranscriptionWorkerChunk[] }> {
  const windowSamples = WINDOW_SECONDS * SAMPLE_RATE;
  const strideSamples = STRIDE_SECONDS * SAMPLE_RATE;
  const stepSamples = windowSamples - strideSamples * 2;
  const starts: number[] = [];
  for (let start = 0; start < audio.length; start += stepSamples) {
    starts.push(start);
    if (start + windowSamples >= audio.length) break;
  }

  const duration = audio.length / SAMPLE_RATE;
  const merged: TranscriptionWorkerChunk[] = [];
  const untimedText: string[] = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = Math.min(audio.length, start + windowSamples);
    const isFirst = index === 0;
    const isLast = index === starts.length - 1;
    const startSeconds = start / SAMPLE_RATE;
    const endSeconds = end / SAMPLE_RATE;
    const trustedStart = startSeconds + (isFirst ? 0 : STRIDE_SECONDS);
    const trustedEnd = Math.max(trustedStart, endSeconds - (isLast ? 0 : STRIDE_SECONDS));

    const raw = await transcriber(audio.subarray(start, end), {
      return_timestamps: "word",
    });
    const output = Array.isArray(raw) ? raw[0] : raw;
    const chunks: TranscriptionWorkerChunk[] = Array.isArray(output?.chunks)
      ? output.chunks
      : [];
    let kept = 0;
    for (const chunk of chunks) {
      const absolute = timedChunk(chunk, startSeconds);
      const [wordStart, wordEnd] = absolute.timestamp ?? [null, null];
      const midpoint =
        typeof wordStart === "number" && typeof wordEnd === "number"
          ? (wordStart + wordEnd) / 2
          : typeof wordStart === "number"
            ? wordStart
            : trustedStart;
      // Every midpoint belongs to exactly one half-open trusted range. This
      // both removes overlap duplicates and rejects timestamps hallucinated
      // into the model's padding after the real end of the last window.
      if (midpoint < trustedStart || midpoint >= trustedEnd) continue;
      if (absolute.timestamp) {
        const [absoluteStart, absoluteEnd] = absolute.timestamp;
        absolute.timestamp = [
          typeof absoluteStart === "number" ? Math.min(duration, absoluteStart) : null,
          typeof absoluteEnd === "number" ? Math.min(duration, absoluteEnd) : null,
        ];
      }
      merged.push(absolute);
      kept += 1;
    }

    const text = String(output?.text || "").trim();
    if (kept === 0 && text) {
      // Defensive fallback for a runtime that returns text despite ignoring
      // word timestamps. The main thread will spread these words over the
      // trusted window rather than losing otherwise useful captions.
      merged.push({ text, timestamp: [trustedStart, Math.max(trustedStart, trustedEnd)] });
      untimedText.push(text);
    }

    const completedSeconds = isLast ? duration : Math.min(duration, trustedEnd);
    progress(id, {
      stage: "transcribing",
      event: "inference-progress",
      message: `Transcribed ${formatClock(completedSeconds)} of ${formatClock(duration)} in the background…`,
      fraction: duration > 0 ? Math.min(1, completedSeconds / duration) : 1,
    });
  }

  const text = merged
    .map((chunk) => String(chunk.text || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim() || untimedText.join(" ").trim();
  return { text, chunks: merged };
}

async function run(request: TranscriptionWorkerRequest): Promise<void> {
  const { id } = request;
  let engine: any;
  try {
    engine = await loadEngine(request.engineUrl);
    progress(id, {
      stage: "model",
      event: "engine-ready",
      message: "Transcription engine ready. Checking the Whisper model…",
      fraction: 0,
    });
  } catch (error) {
    failure(id, "engine", errorMessage(error));
    return;
  }

  const modelFailures: string[] = [];
  const inferenceFailures: string[] = [];

  for (let modelIndex = 0; modelIndex < request.models.length; modelIndex += 1) {
    const modelId = request.models[modelIndex];
    let transcriber = transcribers.get(modelId);

    if (!transcriber) {
      progress(id, {
        stage: "model",
        event: "model-start",
        message: `Loading ${modelId.split("/")[1]} (cached after the first successful run)…`,
        fraction: 0,
      });
      const progressByFile = new Map<string, number>();
      const seenActivities = new Set<string>();
      let acceptingProgress = true;
      try {
        transcriber = await engine.pipeline("automatic-speech-recognition", modelId, {
          dtype: { encoder_model: "q8", decoder_model_merged: "q4" },
          progress_callback: (item: any) => {
            if (!acceptingProgress) return;
            const status = String(item?.status || "unknown");
            const file = String(item?.file || item?.name || "model");
            const value = typeof item?.progress === "number" ? item.progress : null;
            if (status === "progress" && value !== null) {
              const previous = progressByFile.get(file) ?? -1;
              if (value <= previous) return;
              progressByFile.set(file, value);
              progress(id, {
                stage: "model",
                event: "model-progress",
                message: `Downloading ${modelId.split("/")[1]} · ${file}…`,
                fraction: Math.max(0, Math.min(1, value / 100)),
              });
              return;
            }
            const activity = `${status}:${file}`;
            if (seenActivities.has(activity)) return;
            seenActivities.add(activity);
            progress(id, {
              stage: "model",
              event: "model-progress",
              message: `${status === "done" ? "Prepared" : "Preparing"} ${modelId.split("/")[1]} · ${file}…`,
            });
          },
        });
        acceptingProgress = false;
        transcribers.set(modelId, transcriber);
      } catch (error) {
        acceptingProgress = false;
        modelFailures.push(`${modelId}: ${errorMessage(error)}`);
        if (modelIndex + 1 < request.models.length) {
          progress(id, {
            stage: "model",
            event: "model-fallback",
            message: `That Whisper model did not load. Trying fallback ${modelIndex + 2} of ${request.models.length}…`,
            fraction: 0,
          });
        }
        continue;
      }
    }

    try {
      progress(id, {
        stage: "transcribing",
        event: "inference-start",
        message: "Whisper is transcribing in a background worker…",
        fraction: 0,
      });
      const output = await transcribeInWindows(id, transcriber, request.audio);
      if (!output.text) {
        failure(
          id,
          "no-speech",
          "No speech was found in that video's audio. If it is mostly music, type the captions in the Captions step instead."
        );
        return;
      }
      const result: TranscriptionWorkerResult = {
        type: "result",
        id,
        model: modelId,
        output,
      };
      post(result);
      return;
    } catch (error) {
      inferenceFailures.push(`${modelId}: ${errorMessage(error)}`);
      if (modelIndex + 1 < request.models.length) {
        progress(id, {
          stage: "model",
          event: "model-fallback",
          message: `That model could not finish the transcription. Trying fallback ${modelIndex + 2} of ${request.models.length}…`,
          fraction: 0,
        });
      }
    }
  }

  if (inferenceFailures.length > 0) {
    failure(id, "inference", inferenceFailures[0]);
  } else {
    failure(id, "model", modelFailures[0] || "No Whisper model could be loaded.");
  }
}

workerScope.onmessage = (event) => {
  if (event.data?.type !== "start") return;
  void run(event.data).catch((error) => {
    failure(event.data.id, "inference", errorMessage(error));
  });
};
