import {
  ALL_FORMATS,
  AudioSampleSink,
  BlobSource,
  Input,
} from "mediabunny";
import type {
  TranscriptionWorkerChunk,
  TranscriptionWorkerFailure,
  TranscriptionWorkerProgress,
  TranscriptionWorkerRequest,
  TranscriptionWorkerResponse,
  TranscriptionWorkerResult,
} from "./speech-to-text-protocol";

/**
 * Every expensive part of local transcription lives here: media demuxing,
 * WebCodecs audio decoding, 16 kHz resampling, model loading and Whisper.
 * The React/UI thread only fetches a Blob handle and paints progress.
 *
 * Terminating this worker is also the one dependable cancellation mechanism:
 * older Transformers.js/ONNX internals do not consistently honour an
 * AbortSignal while WASM is running.
 */

const SAMPLE_RATE = 16_000;
const WINDOW_SECONDS = 30;
const STRIDE_SECONDS = 5;
const AUDIO_PROGRESS_INTERVAL_MS = 250;

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

function growFloat32(source: Float32Array, requiredLength: number): Float32Array {
  if (source.length >= requiredLength) return source;
  let length = Math.max(1, source.length);
  while (length < requiredLength) length = Math.max(requiredLength, Math.ceil(length * 1.5));
  const grown = new Float32Array(length);
  grown.set(source);
  return grown;
}

/**
 * Demux and decode incrementally from the Blob inside this worker. In
 * particular, do not call AudioContext.decodeAudioData on the page: that API
 * needs the entire video in one ArrayBuffer and was the remaining browser
 * freeze even after Whisper itself moved off-thread.
 */
async function decodeSoundtrack(
  id: number,
  source: Blob,
  durationHint: number
): Promise<{ audio: Float32Array; duration: number }> {
  progress(id, {
    stage: "audio",
    event: "audio-start",
    message: "Opening the soundtrack in the background decoder…",
    fraction: 0,
  });

  const input = new Input({
    source: new BlobSource(source),
    formats: ALL_FORMATS,
  });

  try {
    if (!(await input.canRead())) {
      throw new Error("The video container is not supported by the background decoder.");
    }
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("No playable audio track was found in that video.");
    if (!(await track.canDecode())) {
      const codec = await track.getCodec().catch(() => null);
      throw new Error(
        `This browser cannot decode the video's ${codec || "audio"} track in a worker. ` +
        "Try an MP4 with AAC audio, or import an SRT/VTT caption file."
      );
    }

    const metadataDuration = await track.getDurationFromMetadata().catch(() => null);
    const expectedDuration = Math.max(
      0.01,
      Number(metadataDuration) || 0,
      Number(durationHint) || 0
    );
    let mono: Float32Array = new Float32Array(Math.max(1, Math.ceil(expectedDuration * SAMPLE_RATE)));
    let sourceData: Float32Array = new Float32Array(0);
    let writtenFrames = 0;
    let decodedEnd = 0;
    let lastProgressAt = 0;
    let lastProgressFraction = -1;
    const sink = new AudioSampleSink(track);

    for await (const sample of sink.samples()) {
      try {
        const channels = Math.max(1, sample.numberOfChannels);
        const frames = Math.max(0, sample.numberOfFrames);
        if (frames === 0) continue;

        const floatCount = sample.allocationSize({ planeIndex: 0, format: "f32" }) / 4;
        sourceData = growFloat32(sourceData, floatCount);
        const interleaved = sourceData.subarray(0, floatCount);
        sample.copyTo(interleaved, { planeIndex: 0, format: "f32" });

        const sampleStart = sample.timestamp;
        const sampleEnd = sample.timestamp + sample.duration;
        const outputStart = Math.max(0, Math.ceil(sampleStart * SAMPLE_RATE));
        const outputEnd = Math.max(outputStart, Math.ceil(sampleEnd * SAMPLE_RATE));
        mono = growFloat32(mono, outputEnd);
        const sourceRate = Math.max(1, sample.sampleRate);
        const channelScale = channels === 1 ? 1 : 1 / Math.sqrt(channels);

        for (let outputFrame = outputStart; outputFrame < outputEnd; outputFrame += 1) {
          const sourcePosition = (outputFrame / SAMPLE_RATE - sampleStart) * sourceRate;
          const lower = Math.max(0, Math.min(frames - 1, Math.floor(sourcePosition)));
          const upper = Math.max(0, Math.min(frames - 1, lower + 1));
          const mix = Math.max(0, Math.min(1, sourcePosition - lower));
          let value = 0;
          const lowerOffset = lower * channels;
          const upperOffset = upper * channels;
          for (let channel = 0; channel < channels; channel += 1) {
            value +=
              (interleaved[lowerOffset + channel] || 0) * (1 - mix) +
              (interleaved[upperOffset + channel] || 0) * mix;
          }
          mono[outputFrame] = Math.max(-1, Math.min(1, value * channelScale));
        }

        writtenFrames = Math.max(writtenFrames, outputEnd);
        decodedEnd = Math.max(decodedEnd, sampleEnd);
        const now = Date.now();
        const fraction = Math.min(0.99, decodedEnd / expectedDuration);
        if (
          now - lastProgressAt >= AUDIO_PROGRESS_INTERVAL_MS ||
          fraction - lastProgressFraction >= 0.01
        ) {
          lastProgressAt = now;
          lastProgressFraction = fraction;
          progress(id, {
            stage: "audio",
            event: "audio-progress",
            message: `Decoded ${formatClock(decodedEnd)} of about ${formatClock(expectedDuration)} in the background…`,
            fraction,
          });
        }
      } finally {
        sample.close();
      }
    }

    if (writtenFrames <= 0 || decodedEnd <= 0) {
      throw new Error("No playable audio samples were found in that video.");
    }

    const duration = writtenFrames / SAMPLE_RATE;
    progress(id, {
      stage: "audio",
      event: "audio-progress",
      message: `Soundtrack ready · ${formatClock(duration)} decoded in the background.`,
      fraction: 1,
    });
    return { audio: mono.subarray(0, writtenFrames), duration };
  } finally {
    input.dispose();
  }
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
    // One WASM thread prevents model inference from monopolising every CPU
    // core even though it is already isolated from React in this worker.
    try {
      engine.env.backends.onnx.wasm.numThreads = 1;
      engine.env.backends.onnx.wasm.proxy = false;
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
      // word timestamps. The main thread spreads these words over the trusted
      // window rather than losing otherwise useful captions.
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

async function disposeTranscriber(modelId: string, transcriber: any): Promise<void> {
  transcribers.delete(modelId);
  try {
    await transcriber?.dispose?.();
  } catch {}
}

async function run(request: TranscriptionWorkerRequest): Promise<void> {
  const { id } = request;
  let decoded: { audio: Float32Array; duration: number };
  try {
    decoded = await decodeSoundtrack(id, request.source, request.durationHint);
  } catch (error) {
    failure(id, "audio", errorMessage(error));
    return;
  }

  progress(id, {
    stage: "engine",
    event: "engine-start",
    message: "Starting the Whisper engine in the background worker…",
    fraction: 0,
  });

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
      const output = await transcribeInWindows(id, transcriber, decoded.audio);
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
        audioSeconds: decoded.duration,
        output,
      };
      post(result);
      return;
    } catch (error) {
      inferenceFailures.push(`${modelId}: ${errorMessage(error)}`);
      await disposeTranscriber(modelId, transcriber);
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
