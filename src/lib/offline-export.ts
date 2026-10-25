import { Muxer as Mp4Muxer, StreamTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebMMuxer, StreamTarget as WebMTarget } from "webm-muxer";
import { createFrameBudget, yieldToBrowser } from "./yield-to-browser";
import { patchSignedCompositionOffsets } from "./mp4-audit";
import {
  createOpfsOutputStore,
  estimateMuxedOutputBytes,
  RenderStorageCapacityError,
  type RenderOutputStorageMode,
  type RenderOutputStore,
} from "./render-output-store";
import {
  DEFAULT_ENCODER_STALL_MS,
  RenderCancelledError,
  drainEncoderQueue,
  withTimeout,
} from "./render-guard";

/**
 * Deadlines for the finishing stages.
 *
 * These are not performance targets — they are the point at which a silent
 * browser-internal stall is declared a failure instead of a render that hangs
 * for ever. Every one of them is far longer than the operation needs on a slow
 * machine; see the header of render-guard.ts for why they exist.
 */

/** The encoders' own flush: the last chunks of video/audio. */
export const ENCODER_FLUSH_TIMEOUT_MS = 120_000;
/** Queued OPFS writes landing on disk. */
export const OUTPUT_DRAIN_TIMEOUT_MS = 120_000;
/** The staging file being closed and handed over as a File. */
export const OUTPUT_HANDOVER_TIMEOUT_MS = 60_000;
/** How long an encoder queue may sit at one depth before it is wedged. */
export const ENCODE_QUEUE_STALL_MS = DEFAULT_ENCODER_STALL_MS;

export type OfflineContainer = "mp4" | "webm";

export interface OfflineExportConfig {
  container: OfflineContainer;
  width: number;
  height: number;
  fps: number;
  videoKbps: number;
  audioKbps: number;
  sampleRate?: number;
  channels?: number;
  /**
   * How many frames the render will produce, if it is known up front.
   *
   * MP4 keeps its index (the `moov` atom) either at the front of the file or
   * at the back. At the front is what lets a player start without the whole
   * file, but the muxer can only do that if it knows how much room to leave —
   * otherwise it has to hold the entire video in memory and shuffle it into
   * place at the end, which on a long render is hundreds of megabytes moved
   * in one synchronous go, right at the finish.
   *
   * Given the frame count it reserves the space instead, and the file streams
   * out as it is written.
   */
  expectedVideoChunks?: number;
  expectedAudioChunks?: number;
}

export interface OfflineSupport {
  supported: boolean;
  videoCodec?: string;
  audioCodec?: string;
  hardwareAcceleration?: HardwareAcceleration;
  bitrateMode?: VideoEncoderBitrateMode;
  reason?: string;
}

function browserCodecs(): { VideoEncoder: typeof VideoEncoder; AudioEncoder: typeof AudioEncoder } | null {
  const root = typeof globalThis === "object" ? globalThis : undefined;
  const video = root && (root as typeof globalThis).VideoEncoder;
  const audio = root && (root as typeof globalThis).AudioEncoder;
  return video && audio ? { VideoEncoder: video, AudioEncoder: audio } : null;
}

function avcLevelForSize(width: number, height: number, fps = 30): string {
  const pixels = width * height;
  const highFrameRate = fps > 30;
  if (pixels <= 1280 * 720) return highFrameRate ? "28" : "1f";
  if (pixels <= 1920 * 1080) return highFrameRate ? "2a" : "28";
  return highFrameRate ? "34" : "33";
}

/**
 * Ticks per second written into the video track's sample table.
 *
 * A thousand ticks per frame, so a frame time can be recorded to a thousandth
 * of a frame instead of being rounded to a whole one. The frame rate itself is
 * still what the timeline uses; this only makes the container precise enough
 * to describe it.
 */
export function trackTimescale(fps: number): number {
  return Math.max(1000, Math.round(fps * 1000));
}

/** H.264 High profile, with a level appropriate to the frame size and rate. */
export function avcCodecForSize(width: number, height: number, fps = 30): string {
  return `avc1.6400${avcLevelForSize(width, height, fps)}`;
}

function avcFallbacks(width: number, height: number, fps = 30): string[] {
  const level = avcLevelForSize(width, height, fps);
  // High, Main, then Constrained Baseline. Some Chrome installations expose
  // only a software Main/Baseline encoder even though High hardware probing fails.
  return [`avc1.6400${level}`, `avc1.4d00${level}`, `avc1.42e0${level}`];
}

function candidates(config: OfflineExportConfig): Array<{ video: string; audio: string }> {
  if (config.container === "mp4") {
    return avcFallbacks(config.width, config.height, config.fps).map((video) => ({ video, audio: "mp4a.40.2" }));
  }
  return [
    { video: "vp09.00.10.08", audio: "opus" },
    { video: "vp8", audio: "opus" },
  ];
}

export interface OfflineExportStats {
  codedWidth: number;
  codedHeight: number;
  submittedFrames: number;
  encodedVideoChunks: number;
  encodedAudioChunks: number;
  videoDurationSec: number;
  audioDurationSec: number;
  effectiveFps: number;
  maxFrameDurationDriftUs: number;
  /**
   * Chunks the encoder emitted out of presentation order (B-frames). Harmless
   * in a container that carries composition offsets — which this muxer is
   * given — but fatal if they are ever muxed as if they were in order, so the
   * count belongs in the report.
   */
  reorderedChunks: number;
  /** Largest composition offset applied, in microseconds. */
  maxCompositionOffsetUs: number;
  /** True when the encoder reordered frames and the index needed the signed fix. */
  signedOffsetsPatched: boolean;
  /**
   * Frames whose timestamp was not exactly on its own 1/fps tick. A non-zero
   * value means the container's sample table carries uneven frame durations,
   * which a player turns into held frames and rushed frames: stop-and-go.
   */
  offCadenceFrames: number;
  /** Presentation timestamp of every frame, in microseconds, in submission order. */
  firstFramePtsUs: number;
  lastFramePtsUs: number;
}

function videoConfig(
  config: OfflineExportConfig,
  codec: string,
  hardwareAcceleration?: HardwareAcceleration,
  bitrateMode?: VideoEncoderBitrateMode
): VideoEncoderConfig {
  return {
    codec,
    width: config.width,
    height: config.height,
    displayWidth: config.width,
    displayHeight: config.height,
    framerate: config.fps,
    bitrate: config.videoKbps * 1000,
    ...(bitrateMode ? { bitrateMode } : {}),
    ...(hardwareAcceleration ? { hardwareAcceleration } : {}),
    latencyMode: "quality",
    ...(config.container === "mp4" ? { avc: { format: "avc" as const } } : {}),
  };
}

/** Import-safe WebCodecs capability probe with a useful failure diagnosis. */
export async function supported(config: OfflineExportConfig): Promise<OfflineSupport> {
  const api = browserCodecs();
  if (!api) return { supported: false, reason: "WebCodecs VideoEncoder/AudioEncoder are unavailable in this browser" };
  if (typeof api.VideoEncoder.isConfigSupported !== "function") {
    return { supported: false, reason: "VideoEncoder capability probing is unavailable" };
  }
  if (typeof api.AudioEncoder.isConfigSupported !== "function") {
    return { supported: false, reason: "AudioEncoder capability probing is unavailable" };
  }

  const attempts: string[] = [];
  for (const pair of candidates(config)) {
    let audioSupported = false;
    try {
      const audio = await api.AudioEncoder.isConfigSupported({
        codec: pair.audio,
        sampleRate: config.sampleRate ?? 48_000,
        numberOfChannels: config.channels ?? 2,
        bitrate: config.audioKbps * 1000,
      });
      audioSupported = Boolean(audio.supported);
    } catch (error) {
      attempts.push(`${pair.audio} audio probe threw ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!audioSupported) {
      attempts.push(`${pair.audio} audio is unsupported`);
      continue;
    }

    // First ask for hardware + VBR so detailed scenes, caption edges and
    // visualisers receive bits where needed; fall back cleanly when a driver
    // only exposes default rate control or software encoding.
    for (const acceleration of ["prefer-hardware", undefined] as const) {
      for (const bitrateMode of ["variable", undefined] as const) {
        try {
          const video = await api.VideoEncoder.isConfigSupported(
            videoConfig(config, pair.video, acceleration, bitrateMode)
          );
          if (video.supported) {
            return {
              supported: true,
              videoCodec: pair.video,
              audioCodec: pair.audio,
              ...(acceleration ? { hardwareAcceleration: acceleration } : {}),
              ...(bitrateMode ? { bitrateMode } : {}),
            };
          }
          attempts.push(
            `${pair.video} video (${acceleration || "browser-selected"}, ${bitrateMode || "default-rc"}) is unsupported`
          );
        } catch (error) {
          attempts.push(`${pair.video} video probe threw ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }
  return {
    supported: false,
    reason: `No supported ${config.container.toUpperCase()} WebCodecs configuration. ${attempts.join("; ")}`,
  };
}


/**
 * Where the muxed file accumulates.
 *
 * `ArrayBufferTarget`, which this used to use, keeps the whole file in one
 * contiguous buffer and grows it by allocating a bigger one and copying. At
 * the end the finished buffer is copied again into a Blob. For a nine-minute
 * 1080p export that is roughly 540 MB of file, about a gigabyte while it is
 * being grown, and another copy on top to hand it over — enough to take the
 * tab down, and all of it happening in the last few seconds of a render that
 * has already been going for a while.
 *
 * Keeping the pieces as a list instead costs one copy of each piece and no
 * reallocation. A Blob built from many small buffers does not need them to be
 * contiguous and the browser is free to spill it to disk, so the peak is
 * roughly the size of the file rather than three times it.
 *
 * The muxer mostly appends, but it does seek back to patch box sizes, and —
 * when space has been reserved for it — to write the index at the front. So
 * writes have to be accepted at any position, not just at the end.
 */
export class ChunkStore {
  /** Appended pieces, in file order. `end` is exclusive. */
  private parts: Array<{ start: number; end: number; data: Uint8Array<ArrayBuffer> }> = [];
  private size = 0;

  get byteLength(): number {
    return this.size;
  }

  write(data: Uint8Array, position: number): void {
    if (data.byteLength === 0) return;

    // The common case by far: the next piece of the file.
    if (position === this.size) {
      const copy = new Uint8Array(new ArrayBuffer(data.byteLength));
      copy.set(data);
      this.parts.push({ start: position, end: position + copy.byteLength, data: copy });
      this.size += copy.byteLength;
      return;
    }

    // A patch into what has already been written.
    if (position < this.size) {
      this.patch(data, position);
      const overrun = position + data.byteLength - this.size;
      if (overrun > 0) this.write(data.subarray(data.byteLength - overrun), this.size);
      return;
    }

    // A write past the end: pad the hole, then append. The muxer does this
    // when it reserves room for the index it will come back and fill in.
    const gap = position - this.size;
    const pad = new Uint8Array(new ArrayBuffer(gap));
    this.parts.push({ start: this.size, end: position, data: pad });
    this.size = position;
    this.write(data, position);
  }

  /** Overwrite bytes already stored, across as many pieces as it spans. */
  private patch(data: Uint8Array, position: number): void {
    const limit = Math.min(position + data.byteLength, this.size);
    let index = this.indexOf(position);
    let cursor = position;

    while (cursor < limit && index < this.parts.length) {
      const part = this.parts[index];
      const from = cursor - part.start;
      const take = Math.min(part.end, limit) - cursor;
      part.data.set(data.subarray(cursor - position, cursor - position + take), from);
      cursor += take;
      index += 1;
    }
  }

  /** Binary search for the piece containing `position`. */
  private indexOf(position: number): number {
    let low = 0;
    let high = this.parts.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const part = this.parts[mid];
      if (position < part.start) high = mid - 1;
      else if (position >= part.end) low = mid + 1;
      else return mid;
    }
    return this.parts.length;
  }

  /**
   * Hand the file over as a Blob. Single use: the pieces are released as they
   * are handed on, so the store and the Blob are never both fully resident.
   */
  toBlob(type: string): Blob {
    const blob = new Blob(this.parts.map((part) => part.data), { type });
    // Let the pieces go before the Blob is handed on, so the two are never
    // both fully resident.
    this.parts = [];
    return blob;
  }

  clear(): void {
    this.parts = [];
    this.size = 0;
  }
}

/** Memory fallback for browsers without OPFS. Long Chromium renders use the
 * disk-backed store below; this adapter preserves compatibility elsewhere. */
class MemoryOutputStore implements RenderOutputStore {
  readonly mode = "memory" as const;
  private readonly chunks = new ChunkStore();

  get byteLength(): number { return this.chunks.byteLength; }
  get pendingBytes(): number { return 0; }
  write(data: Uint8Array, position: number): void { this.chunks.write(data, position); }
  async flush(): Promise<void> {}
  async toBlob(type: string): Promise<Blob> { return this.chunks.toBlob(type); }
  async dispose(): Promise<void> {
    this.chunks.clear();
  }
}

type MuxerLike = {
  addVideoChunk(
    chunk: EncodedVideoChunk,
    meta?: EncodedVideoChunkMetadata,
    timestamp?: number,
    compositionTimeOffset?: number
  ): void;
  addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void;
  finalize(): void;
};

/** Owns the encoders and muxer for a deterministic, non-real-time export. */
export class OfflineExporter {
  readonly config: Required<Omit<OfflineExportConfig, "expectedVideoChunks" | "expectedAudioChunks">> &
    Pick<OfflineExportConfig, "expectedVideoChunks" | "expectedAudioChunks">;
  private readonly video: VideoEncoder;
  private readonly audio: AudioEncoder;
  private readonly muxer: MuxerLike;
  private readonly store: RenderOutputStore;
  private readonly mime: string;
  private failure: Error | null = null;
  private cancelled = false;
  /** Resolves the instant `abort()` is called, so a pending wait can stop. */
  private signalCancel: (() => void) | null = null;
  private readonly cancelSignal: Promise<void> = new Promise<void>((resolve) => {
    this.signalCancel = resolve;
  });
  private cancelFailure: Error | null = null;
  private decodedVideoChunks = 0;
  private submittedVideoFrames = 0;
  private maxVideoEndUs = 0;
  private encodedAudioChunksCount = 0;
  private maxAudioEndUs = 0;
  private codedWidth = 0;
  private codedHeight = 0;
  private maxFrameDurationDriftUs = 0;
  private reorderedChunks = 0;
  private maxCompositionOffsetUs = 0;
  /**
   * Smallest composition offset the encoder needed, in microseconds. Below
   * zero means the encoder emitted frames out of presentation order (B-frames)
   * and the MP4 index has to be able to say so — see
   * `patchSignedCompositionOffsets`.
   */
  private minCompositionOffsetUs = 0;
  private signedOffsetsPatched = false;
  private offCadenceFrames = 0;
  private firstFramePtsUs = -1;
  private lastFramePtsUs = 0;
  private mp4SignatureChecked = false;
  /** Where the growing muxed file lives during the encode. */
  readonly outputStorage: RenderOutputStorageMode;
  /** Human-readable detail shown in the render health panel/report. */
  readonly outputStorageDetail: string;

  private constructor(
    config: OfflineExportConfig,
    probe: OfflineSupport & { videoCodec: string; audioCodec: string },
    store: RenderOutputStore,
    outputStorageDetail: string,
  ) {
    const api = browserCodecs();
    if (!api) throw new Error("WebCodecs disappeared after capability probing");
    this.config = { ...config, sampleRate: config.sampleRate ?? 48_000, channels: config.channels ?? 2 };
    this.store = store;
    this.outputStorage = store.mode;
    this.outputStorageDetail = outputStorageDetail;
    const fail = (error: DOMException) => { this.failure = new Error(error.message || "WebCodecs encoding failed"); };

    const onData = (data: Uint8Array, position: number) => this.store.write(data, position);

    if (config.container === "mp4") {
      this.muxer = new Mp4Muxer({
        target: new Mp4Target({ onData }),
        /**
         * The video track's timescale. mp4-muxer stores every sample duration
         * in these ticks, so the timescale decides how exactly a frame time can
         * be written down. Passing the frame rate itself (30) gives one tick
         * per frame: ANY rounding — an encoder reporting 33 333 µs for one
         * frame and 33 334 µs for the next, which every hardware encoder does
         * at some point — becomes a whole frame of error, and the player holds
         * one frame and rushes the next. A thousand ticks per frame absorbs
         * that rounding into a thousandth of a frame and the sample table stays
         * uniform. See tests/render-audit.test.ts.
         */
        video: { codec: "avc", width: config.width, height: config.height, frameRate: trackTimescale(config.fps) },
        audio: { codec: "aac", numberOfChannels: this.config.channels, sampleRate: this.config.sampleRate },
        /**
         * Reserve room for the index rather than holding the whole file to
         * shuffle it into place at the end. Needs an upper bound on the chunk
         * counts; without one we fall back to writing the index last, which
         * still streams — the file simply is not fast-start.
         */
        fastStart:
          config.expectedVideoChunks && config.expectedAudioChunks
            ? {
                expectedVideoChunks: config.expectedVideoChunks,
                expectedAudioChunks: config.expectedAudioChunks,
              }
            : false,
      });
      this.mime = "video/mp4";
    } else {
      this.muxer = new WebMMuxer({
        target: new WebMTarget({ onData }),
        video: { codec: probe.videoCodec.startsWith("vp8") ? "V_VP8" : "V_VP9", width: config.width, height: config.height, frameRate: config.fps },
        audio: { codec: "A_OPUS", numberOfChannels: this.config.channels, sampleRate: this.config.sampleRate },
      });
      this.mime = "video/webm";
    }

    this.video = new api.VideoEncoder({
      output: (chunk, meta) => {
        if (meta?.decoderConfig) {
          if (meta.decoderConfig.codedWidth) this.codedWidth = meta.decoderConfig.codedWidth;
          if (meta.decoderConfig.codedHeight) this.codedHeight = meta.decoderConfig.codedHeight;
        }
        const chunkDurUs = chunk.duration ?? Math.round(1_000_000 / this.config.fps);
        const nominalDurUs = 1_000_000 / this.config.fps;
        const driftUs = Math.abs(chunkDurUs - nominalDurUs);
        if (driftUs > this.maxFrameDurationDriftUs) this.maxFrameDurationDriftUs = driftUs;
        const endUs = chunk.timestamp + chunkDurUs;
        if (endUs > this.maxVideoEndUs) this.maxVideoEndUs = endUs;

        // Cadence telemetry: the sample table is only uniform if every frame
        // landed exactly on its own tick of the timeline.
        const expectedPtsUs = Math.round((this.decodedVideoChunks * 1_000_000) / this.config.fps);
        if (this.firstFramePtsUs < 0) this.firstFramePtsUs = chunk.timestamp;
        this.lastFramePtsUs = chunk.timestamp;
        const offCadence = Math.abs(chunk.timestamp - expectedPtsUs) > 1;
        if (offCadence) this.offCadenceFrames += 1;

        if (config.container === "mp4") {
          // VideoEncoder emits chunks in decode order; supplying exact DTS→PTS
          // offsets lets latencyMode: "quality" use B-frames cleanly in MP4.
          const compositionTimeOffset = chunk.timestamp - expectedPtsUs;
          this.decodedVideoChunks += 1;
          if (compositionTimeOffset !== 0) {
            this.reorderedChunks += 1;
            const magnitude = Math.abs(compositionTimeOffset);
            if (magnitude > this.maxCompositionOffsetUs) this.maxCompositionOffsetUs = magnitude;
            if (compositionTimeOffset < this.minCompositionOffsetUs) {
              this.minCompositionOffsetUs = compositionTimeOffset;
            }
          }
          this.muxer.addVideoChunk(chunk, meta, chunk.timestamp, compositionTimeOffset);
        } else {
          this.decodedVideoChunks += 1;
          this.muxer.addVideoChunk(chunk, meta);
        }
      },
      error: fail,
    });
    this.audio = new api.AudioEncoder({
      output: (chunk, meta) => {
        this.encodedAudioChunksCount += 1;
        const endUs = chunk.timestamp + (chunk.duration ?? 0);
        if (endUs > this.maxAudioEndUs) this.maxAudioEndUs = endUs;
        this.muxer.addAudioChunk(chunk, meta);
      },
      error: fail,
    });
    this.video.configure(videoConfig(config, probe.videoCodec, probe.hardwareAcceleration, probe.bitrateMode));
    this.audio.configure({
      codec: probe.audioCodec,
      sampleRate: this.config.sampleRate,
      numberOfChannels: this.config.channels,
      bitrate: config.audioKbps * 1000,
    });
  }

  static async create(config: OfflineExportConfig): Promise<OfflineExporter> {
    const probe = await supported(config);
    if (!probe.supported || !probe.videoCodec || !probe.audioCodec) throw new Error(probe.reason || "Offline export is unsupported");

    let store: RenderOutputStore = new MemoryOutputStore();
    let storageDetail = "Compatibility memory store (OPFS unavailable)";
    try {
      const expectedBytes = estimateMuxedOutputBytes(config);
      const opfs = await createOpfsOutputStore(expectedBytes);
      if (opfs) {
        store = opfs.store;
        storageDetail = opfs.persistent
          ? "Protected disk stream (persistent OPFS)"
          : "Protected disk stream (temporary OPFS)";
      }
    } catch (error) {
      // A real capacity failure is actionable and must stop before the costly
      // encode. Other OPFS failures fall back for browser compatibility.
      if (error instanceof RenderStorageCapacityError) throw error;
      storageDetail = `Compatibility memory store (disk stream unavailable: ${
        error instanceof Error ? error.message : String(error)
      })`;
    }

    try {
      return new OfflineExporter(
        config,
        { ...probe, videoCodec: probe.videoCodec, audioCodec: probe.audioCodec },
        store,
        storageDetail,
      );
    } catch (error) {
      void store.dispose();
      throw error;
    }
  }

  private throwIfFailed(): void {
    if (this.failure) throw this.failure;
    if (this.cancelled) throw new RenderCancelledError();
  }

  /** True once the creator has cancelled this encode. */
  get isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Stops every pending wait immediately.
   *
   * Cancel used to set a flag that was only read *between frames*. Once all
   * the frames are in, the render is inside the encoder flush or a disk drain
   * and nothing reads it again — which is why the Cancel button appeared
   * dead at exactly the moment a customer is most likely to press it.
   */
  abort(message = "Render cancelled"): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.cancelFailure = new RenderCancelledError(message);
    try {
      this.signalCancel?.();
    } catch {}
  }

  /**
   * Race a browser-internal wait against cancellation and a deadline.
   *
   * Both outcomes are named, so the render screen can say which of the four
   * finishing steps stalled instead of freezing on an opaque percentage.
   */
  private guarded<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    if (this.cancelled) return Promise.reject(this.cancelFailure || new RenderCancelledError());
    const deadline = withTimeout(operation, timeoutMs, label);
    const cancelled = this.cancelSignal.then(() => {
      throw this.cancelFailure || new RenderCancelledError();
    });
    return Promise.race([deadline, cancelled]);
  }

  /** Wait for an encoder queue to drain, giving up if it stops moving. */
  private async drainVideoQueue(): Promise<void> {
    await drainEncoderQueue({
      queueSize: () => this.video.encodeQueueSize,
      limit: 6,
      stallMs: ENCODE_QUEUE_STALL_MS,
      operation: "the video encoder accepted the frames it was given",
      yieldTo: yieldToBrowser,
      throwIfFailed: () => this.throwIfFailed(),
      isCancelled: () => this.cancelled,
    });
  }

  private async drainAudioQueue(): Promise<void> {
    await drainEncoderQueue({
      queueSize: () => this.audio.encodeQueueSize,
      limit: 8,
      stallMs: ENCODE_QUEUE_STALL_MS,
      operation: "the audio encoder accepted the soundtrack it was given",
      yieldTo: yieldToBrowser,
      throwIfFailed: () => this.throwIfFailed(),
      isCancelled: () => this.cancelled,
    });
  }

  /** Land the queued OPFS copies, with a deadline. */
  private async drainOutput(operation: string): Promise<void> {
    if (this.store.pendingBytes === 0) return;
    await this.guarded(this.store.flush(), OUTPUT_DRAIN_TIMEOUT_MS, operation);
  }

  async encodeCanvas(canvas: HTMLCanvasElement, frameIndex: number): Promise<void> {
    if (canvas.width !== this.config.width || canvas.height !== this.config.height) {
      throw new Error(
        `Render canvas resolution mismatch: got ${canvas.width}×${canvas.height}, expected ${this.config.width}×${this.config.height}`
      );
    }
    this.throwIfFailed();
    await this.drainVideoQueue();
    // The muxer callback is synchronous while OPFS is asynchronous. Bound its
    // queued copies so encode speed can never outrun disk for the length of a
    // nine- or fifteen-minute video.
    if (this.store.pendingBytes > 16 * 1024 * 1024) {
      await this.drainOutput("the encoded frames were written to protected browser storage");
    }
    const timestamp = Math.round(frameIndex * 1_000_000 / this.config.fps);
    const next = Math.round((frameIndex + 1) * 1_000_000 / this.config.fps);
    const frame = new VideoFrame(canvas, { timestamp, duration: next - timestamp });
    try {
      this.submittedVideoFrames += 1;
      this.video.encode(frame, { keyFrame: frameIndex % Math.max(1, Math.round(this.config.fps * 2)) === 0 });
    } finally {
      frame.close();
    }
  }

  /**
   * Encode the whole mixed soundtrack.
   *
   * This used to hand control back only when the encoder's queue was full.
   * When the encoder keeps up — which it does, because AAC is cheap next to
   * H.264 — the queue never fills, nothing is awaited, and the loop runs to
   * completion in one go. Nine minutes of audio is 5,400 turns of it, and the
   * window is frozen solid for every one of them. That is the stall at the
   * end of a long render, when the progress bar has stopped at the last step
   * and the tab stops responding.
   *
   * It now yields on a time budget as well, so the browser gets a turn
   * several times a second no matter how fast the encoder is going.
   */
  async encodeAudio(
    buffer: AudioBuffer,
    chunkFrames = 4_800,
    onProgress?: (fraction: number) => void,
  ): Promise<void> {
    const channels = this.config.channels;
    const budget = createFrameBudget();
    for (let offset = 0; offset < buffer.length; offset += chunkFrames) {
      this.throwIfFailed();
      await this.drainAudioQueue();
      if (this.store.pendingBytes > 16 * 1024 * 1024) {
        await this.drainOutput("the encoded soundtrack was written to protected browser storage");
      }
      await budget.maybeYield();
      this.throwIfFailed();
      onProgress?.(Math.min(1, offset / Math.max(1, buffer.length)));
      const frames = Math.min(chunkFrames, buffer.length - offset);
      const planar = new Float32Array(frames * channels);
      for (let channel = 0; channel < channels; channel++) {
        const source = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
        planar.set(source.subarray(offset, offset + frames), channel * frames);
      }
      const data = new AudioData({
        format: "f32-planar",
        sampleRate: this.config.sampleRate,
        numberOfFrames: frames,
        numberOfChannels: channels,
        timestamp: Math.round(offset * 1_000_000 / this.config.sampleRate),
        data: planar,
      });
      try { this.audio.encode(data); } finally { data.close(); }
    }
  }

  /** Bytes written so far — useful for reporting progress on a long render. */
  get bytesWritten(): number {
    return this.store.byteLength;
  }

  /** Encoded bytes copied from muxer callbacks but not yet committed to disk. */
  get queuedOutputBytes(): number {
    return this.store.pendingBytes;
  }

  /** Actual stream telemetry recorded during encoding for post-export verification. */
  getExportStats(): OfflineExportStats {
    const videoDurationSec =
      this.maxVideoEndUs > 0
        ? this.maxVideoEndUs / 1_000_000
        : this.submittedVideoFrames / Math.max(1, this.config.fps);
    const audioDurationSec = this.maxAudioEndUs / 1_000_000;
    const effectiveFps =
      videoDurationSec > 0 ? this.decodedVideoChunks / videoDurationSec : 0;
    return {
      codedWidth: this.codedWidth || this.config.width,
      codedHeight: this.codedHeight || this.config.height,
      submittedFrames: this.submittedVideoFrames,
      encodedVideoChunks: this.decodedVideoChunks,
      encodedAudioChunks: this.encodedAudioChunksCount,
      videoDurationSec,
      audioDurationSec,
      effectiveFps: Math.round(effectiveFps * 100) / 100,
      maxFrameDurationDriftUs: Math.round(this.maxFrameDurationDriftUs),
      reorderedChunks: this.reorderedChunks,
      maxCompositionOffsetUs: Math.round(this.maxCompositionOffsetUs),
      signedOffsetsPatched: this.signedOffsetsPatched,
      offCadenceFrames: this.offCadenceFrames,
      firstFramePtsUs: Math.max(0, this.firstFramePtsUs),
      lastFramePtsUs: this.lastFramePtsUs,
    };
  }

  /**
   * Finish the container and hand the file over.
   *
   * Every step here used to be an unbounded await — see render-guard.ts. Each
   * one now has a deadline and a name, so a browser-side stall at 95% is
   * reported as "the video encoder stopped responding while it finished the
   * last of its frames" instead of hanging the render screen for ever.
   */
  async finalize(): Promise<Blob> {
    this.throwIfFailed();
    // Both encoders still have work queued at this point; flushing is where
    // the last of the video actually gets encoded, and on a long render that
    // is not instant.
    await this.guarded(
      Promise.all([this.video.flush(), this.audio.flush()]),
      ENCODER_FLUSH_TIMEOUT_MS,
      "the video encoder finished the last of its frames",
    );
    this.throwIfFailed();
    // Encoder flush only guarantees output callbacks have run. Disk writes
    // triggered by those callbacks are asynchronous and need their own drain.
    await this.guarded(
      this.store.flush(),
      OUTPUT_DRAIN_TIMEOUT_MS,
      "the finished frames were written to protected browser storage",
    );
    try { this.video.close(); } catch {}
    try { this.audio.close(); } catch {}
    this.muxer.finalize();
    await this.guarded(
      this.store.flush(),
      OUTPUT_DRAIN_TIMEOUT_MS,
      "the container index was written to disk",
    );
    let blob = await this.guarded(
      this.store.toBlob(this.mime),
      OUTPUT_HANDOVER_TIMEOUT_MS,
      "the finished file was handed back to the renderer",
    );
    if (this.config.container === "mp4" && this.minCompositionOffsetUs < 0) {
      /**
       * The encoder reordered frames, so the index must be allowed to express
       * a negative offset. `mp4-muxer` writes the composition table as
       * version 0, where offsets are unsigned — the negative values land in
       * the file as enormous positive ones and the picture jumps ahead by
       * hours for those frames while the audio stays perfect. Raising the
       * table's version makes the bytes mean what they were written to mean.
       * tests/render-audit.test.ts proves both halves of that.
       */
      const repaired = await patchSignedCompositionOffsets(blob);
      this.signedOffsetsPatched = repaired.patched > 0;
      blob = repaired.blob;
    }
    if (this.config.container === "mp4") {
      /**
       * The bytes are checked before the file is called a video.
       *
       * An `.mp4` name over WebM content is the failure that reaches the
       * customer as "the player will not open it" or "it stutters", and it is
       * invisible everywhere else in the pipeline. Three bytes are enough to
       * tell: an ISO base-media file begins with a box whose type is `ftyp`.
       */
      const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      const brand = String.fromCharCode(header[4] ?? 0, header[5] ?? 0, header[6] ?? 0, header[7] ?? 0);
      this.mp4SignatureChecked = true;
      if (brand !== "ftyp") {
        throw new Error(
          `The encoder produced ${brand ? `"${brand}"` : "nothing"} instead of an MP4 header. ` +
            "The file was not handed over, because a WebM download renamed .mp4 will not play where MP4 is expected.",
        );
      }
    }
    return blob;
  }

  /** True once the finished file's first bytes were confirmed to be MP4. */
  get containerVerified(): boolean {
    return this.mp4SignatureChecked;
  }

  /** Remove the OPFS staging file after the Vault has verified its own Blob. */
  async releaseOutputStorage(): Promise<void> {
    await withTimeout(
      this.store.dispose(),
      OUTPUT_DRAIN_TIMEOUT_MS,
      "the temporary render file was cleaned up",
    ).catch(() => {
      /* a leftover .part file is swept by clearStaleRenderScratch on the next render */
    });
  }

  close(): void {
    // Stops anything still waiting inside finalize() before the encoders are
    // pulled out from under it.
    this.abort();
    try { if (this.video.state !== "closed") this.video.close(); } catch {}
    try { if (this.audio.state !== "closed") this.audio.close(); } catch {}
    void this.store.dispose();
  }
}
