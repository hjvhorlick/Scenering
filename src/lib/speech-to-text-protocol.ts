/** Messages exchanged with the dedicated on-device transcription worker. */

export interface TranscriptionWorkerChunk {
  text?: string;
  timestamp?: [number | null, number | null] | null;
}

export interface TranscriptionWorkerStart {
  type: "start";
  id: number;
  engineUrl: string;
  models: string[];
  /** Mono 16 kHz PCM. Its ArrayBuffer is transferred, not copied. */
  audio: Float32Array;
}

export type TranscriptionWorkerEvent =
  | "engine-ready"
  | "model-start"
  | "model-progress"
  | "model-fallback"
  | "inference-start"
  | "inference-progress";

export interface TranscriptionWorkerProgress {
  type: "progress";
  id: number;
  stage: "engine" | "model" | "transcribing";
  event: TranscriptionWorkerEvent;
  message: string;
  fraction?: number;
}

export interface TranscriptionWorkerResult {
  type: "result";
  id: number;
  model: string;
  output: {
    text: string;
    chunks: TranscriptionWorkerChunk[];
  };
}

export interface TranscriptionWorkerFailure {
  type: "failure";
  id: number;
  stage: "engine" | "model" | "inference" | "no-speech";
  message: string;
}

export type TranscriptionWorkerRequest = TranscriptionWorkerStart;
export type TranscriptionWorkerResponse =
  | TranscriptionWorkerProgress
  | TranscriptionWorkerResult
  | TranscriptionWorkerFailure;
