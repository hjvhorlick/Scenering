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
  /**
   * The browser clones Blob handles without copying their bytes. Demuxing,
   * audio decoding, resampling and Whisper all therefore stay off the UI
   * thread; the original video is never uploaded.
   */
  source: Blob;
  /** Used only to choose a generous extraction timeout before exact duration is known. */
  durationHint: number;
}

export type TranscriptionWorkerEvent =
  | "audio-start"
  | "audio-progress"
  | "engine-start"
  | "engine-ready"
  | "model-start"
  | "model-progress"
  | "model-fallback"
  | "inference-start"
  | "inference-progress";

export interface TranscriptionWorkerProgress {
  type: "progress";
  id: number;
  stage: "audio" | "engine" | "model" | "transcribing";
  event: TranscriptionWorkerEvent;
  message: string;
  fraction?: number;
}

export interface TranscriptionWorkerResult {
  type: "result";
  id: number;
  model: string;
  /** Duration of the decoded soundtrack, not a metadata guess from the video. */
  audioSeconds: number;
  output: {
    text: string;
    chunks: TranscriptionWorkerChunk[];
  };
}

export interface TranscriptionWorkerFailure {
  type: "failure";
  id: number;
  stage: "audio" | "engine" | "model" | "inference" | "no-speech";
  message: string;
}

export type TranscriptionWorkerRequest = TranscriptionWorkerStart;
export type TranscriptionWorkerResponse =
  | TranscriptionWorkerProgress
  | TranscriptionWorkerResult
  | TranscriptionWorkerFailure;
