import { Muxer as Mp4Muxer, StreamTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebMMuxer, StreamTarget as WebMTarget } from "webm-muxer";
import { createFrameBudget, yieldToBrowser } from "./yield-to-browser";
import {
  createOpfsOutputStore,
  estimateMuxedOutputBytes,
  RenderStorageCapacityError,
  type RenderOutputStorageMode,
  type RenderOutputStore,
} from "./render-output-store";

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
  reason?: string;
}

function browserCodecs(): { VideoEncoder: typeof VideoEncoder; AudioEncoder: typeof AudioEncoder } | null {
  const root = typeof globalThis === "object" ? globalThis : undefined;
  const video = root && (root as typeof globalThis).VideoEncoder;
  const audio = root && (root as typeof globalThis).AudioEncoder;
  return video && audio ? { VideoEncoder: video, AudioEncoder: audio } : null;
}

/** H.264 High profile, with a level appropriate to the frame size. */
export function avcCodecForSize(width: number, height: number): string {
  const pixels = width * height;
  if (pixels <= 1280 * 720) return "avc1.64001f";
  if (pixels <= 1920 * 1080) return "avc1.640028";
  return "avc1.640033";
}

function avcFallbacks(width: number, height: number): string[] {
  const pixels = width * height;
  const level = pixels <= 1280 * 720 ? "1f" : pixels <= 1920 * 1080 ? "28" : "33";
  // High, Main, then Constrained Baseline. Some Chrome installations expose
  // only a software Main/Baseline encoder even though High hardware probing fails.
  return [`avc1.6400${level}`, `avc1.4d00${level}`, `avc1.42e0${level}`];
}

function candidates(config: OfflineExportConfig): Array<{ video: string; audio: string }> {
  if (config.container === "mp4") {
    return avcFallbacks(config.width, config.height).map((video) => ({ video, audio: "mp4a.40.2" }));
  }
  return [
    { video: "vp09.00.10.08", audio: "opus" },
    { video: "vp8", audio: "opus" },
  ];
}

function videoConfig(
  config: OfflineExportConfig,
  codec: string,
  hardwareAcceleration?: HardwareAcceleration
): VideoEncoderConfig {
  return {
    codec,
    width: config.width,
    height: config.height,
    framerate: config.fps,
    bitrate: config.videoKbps * 1000,
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

    // First ask for hardware. Then omit the preference so Chrome is free to
    // select its software encoder; strict hardware-only probing caused silent fallback.
    for (const acceleration of ["prefer-hardware", undefined] as const) {
      try {
        const video = await api.VideoEncoder.isConfigSupported(videoConfig(config, pair.video, acceleration));
        if (video.supported) {
          return {
            supported: true,
            videoCodec: pair.video,
            audioCodec: pair.audio,
            ...(acceleration ? { hardwareAcceleration: acceleration } : {}),
          };
        }
        attempts.push(`${pair.video} video (${acceleration || "browser-selected"}) is unsupported`);
      } catch (error) {
        attempts.push(`${pair.video} video probe threw ${error instanceof Error ? error.message : String(error)}`);
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
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
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
        video: { codec: "avc", width: config.width, height: config.height, frameRate: config.fps },
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

    this.video = new api.VideoEncoder({ output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta), error: fail });
    this.audio = new api.AudioEncoder({ output: (chunk, meta) => this.muxer.addAudioChunk(chunk, meta), error: fail });
    this.video.configure(videoConfig(config, probe.videoCodec, probe.hardwareAcceleration));
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

  private throwIfFailed(): void { if (this.failure) throw this.failure; }

  async encodeCanvas(canvas: HTMLCanvasElement, frameIndex: number): Promise<void> {
    while (this.video.encodeQueueSize > 6) {
      this.throwIfFailed();
      await yieldToBrowser();
    }
    // The muxer callback is synchronous while OPFS is asynchronous. Bound its
    // queued copies so encode speed can never outrun disk for the length of a
    // nine- or fifteen-minute video.
    if (this.store.pendingBytes > 16 * 1024 * 1024) await this.store.flush();
    const timestamp = Math.round(frameIndex * 1_000_000 / this.config.fps);
    const next = Math.round((frameIndex + 1) * 1_000_000 / this.config.fps);
    const frame = new VideoFrame(canvas, { timestamp, duration: next - timestamp });
    try {
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
      while (this.audio.encodeQueueSize > 8) {
        this.throwIfFailed();
        await yieldToBrowser();
      }
      if (this.store.pendingBytes > 16 * 1024 * 1024) await this.store.flush();
      await budget.maybeYield();
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

  async finalize(): Promise<Blob> {
    // Both encoders still have work queued at this point; flushing is where
    // the last of the video actually gets encoded, and on a long render that
    // is not instant.
    await Promise.all([this.video.flush(), this.audio.flush()]);
    this.throwIfFailed();
    // Encoder flush only guarantees output callbacks have run. Disk writes
    // triggered by those callbacks are asynchronous and need their own drain.
    await this.store.flush();
    this.video.close();
    this.audio.close();
    this.muxer.finalize();
    await this.store.flush();
    return await this.store.toBlob(this.mime);
  }

  /** Remove the OPFS staging file after the Vault has verified its own Blob. */
  async releaseOutputStorage(): Promise<void> {
    await this.store.dispose();
  }

  close(): void {
    try { if (this.video.state !== "closed") this.video.close(); } catch {}
    try { if (this.audio.state !== "closed") this.audio.close(); } catch {}
    void this.store.dispose();
  }
}
