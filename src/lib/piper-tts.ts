import type { PiperCandidateVoice } from "./piper-candidate-voices";
import { requestPiperStoragePersistence } from "./piper-storage";

type ProgressUpdate = { stage: string; message: string; fraction?: number };
type PendingRequest = {
  resolve: (result: PiperSynthesisResult) => void;
  reject: (error: Error) => void;
  onProgress?: (update: ProgressUpdate) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export interface PiperSynthesisResult {
  voiceId: string;
  wav: ArrayBuffer;
  duration: number;
  sampleRate: number;
  phonemeCount: number;
  peak: number;
  rms: number;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./piper-tts.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data as { id: number; type: string; message?: string; [key: string]: unknown };
    const request = pending.get(data.id);
    if (!request) return;
    if (data.type === "progress") {
      request.onProgress?.({
        stage: String(data.stage ?? "working"),
        message: String(data.message ?? "Preparing local speech…"),
        fraction: typeof data.fraction === "number" ? data.fraction : undefined,
      });
      return;
    }
    clearTimeout(request.timeout);
    pending.delete(data.id);
    if (data.type === "error") {
      request.reject(new Error(String(data.message ?? "Piper synthesis failed.")));
    } else if (data.type === "result") {
      request.resolve(data as unknown as PiperSynthesisResult);
    }
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "The local Piper worker could not start.");
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

const PIPER_REQUEST_TIMEOUT_MS = 90_000;

function failAllPending(error: Error, terminateWorker: boolean) {
  if (terminateWorker) {
    worker?.terminate();
    worker = null;
  }
  for (const request of pending.values()) {
    clearTimeout(request.timeout);
    request.reject(error);
  }
  pending.clear();
}

async function requestWorker(
  message: Record<string, unknown>,
  onProgress?: (update: ProgressUpdate) => void,
): Promise<PiperSynthesisResult> {
  // Try to mark this origin's CacheStorage/IndexedDB as persistent before the
  // worker commits a newly downloaded ONNX model. User gestures also call this
  // helper directly before any awaited work begins.
  await requestPiperStoragePersistence();
  const id = Number(message.id);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!pending.has(id)) return;
      failAllPending(new Error(
        "Piper did not finish within 90 seconds. The voice download or browser runtime may be stalled; cancel and retry on a stable connection."
      ), true);
    }, PIPER_REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, onProgress, timeout });
    try {
      getWorker().postMessage(message);
    } catch (error) {
      clearTimeout(timeout);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error("The Piper worker could not accept the request."));
    }
  });
}

export function synthesizePiper(
  voice: PiperCandidateVoice,
  text: string,
  onProgress?: (update: ProgressUpdate) => void,
  speed = 1,
): Promise<PiperSynthesisResult> {
  const id = nextId++;
  return requestWorker({ id, voiceId: voice.id, speakerId: voice.speakerId ?? 0, text, speed }, onProgress);
}

/** Start the shared worker and phonemizer assets while the creator is browsing voices. */
export function prewarmPiperRuntime(): void {
  try {
    getWorker().postMessage({ id: 0, type: "warm" });
  } catch {
    // The real synthesis request will surface any worker/runtime startup error.
  }
}

export function stopPiperWorker(): void {
  failAllPending(new Error("Local Piper audition was stopped."), true);
}
