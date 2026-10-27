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

/**
 * How many PCM frames one AudioData handed to the audio encoder should carry.
 *
 * Feeding the encoder in the codec's own packet size means the platform
 * encoder never has to accumulate or split an arbitrary-sized input before it
 * can emit a packet. Every browser's AAC encoder normalises its output to
 * 1024-frame packets anyway (via an internal FIFO), so asking for anything
 * larger only adds a platform-dependent buffering step to the path — and that
 * step is exactly where cross-browser behaviour differs. AAC-LC is always
 * 1024 frames; WebCodecs Opus defaults to a 20 ms packet (960 frames at
 * 48 kHz). See the Chromium AudioToolbox/Media Foundation encoder wrappers,
 * which both drain their inputs through a 1024-frame FIFO.
 */
export function audioChunkFramesForCodec(codec: string, sampleRate: number): number {
  if (/opus/i.test(codec)) return Math.max(1, Math.round(sampleRate * 0.02));
  return 1024;
}

/**
 * Round-trip timing check for the audio packets an encoder actually emits.
 *
 * A rendered voice with an intermittent hole in it is, at the container
 * level, a packet whose timestamp does not begin where the previous packet
 * ended. Encoder implementations are supposed to emit a gapless stream, but
 * this runs on Chrome, Edge, Safari and Firefox through platform codec
 * services that do not all behave identically, so the exporter measures the
 * stream instead of assuming it. Rounding noise between adjacent packets
 * (sub-microsecond at 48 kHz) is ignored; a missing packet is a ~21 ms AAC
 * hole and is counted.
 */
export const AUDIO_CONTINUITY_TOLERANCE_US = 2_000;

export class AudioContinuityGuard {
  private lastEndUs: number | null = null;
  /** Packets that started later than the previous packet's end. */
  gaps = 0;
  /** Packets that started before the previous packet's end. */
  overlaps = 0;
  /** Widest gap observed, in microseconds. */
  maxGapUs = 0;

  constructor(private readonly toleranceUs: number = AUDIO_CONTINUITY_TOLERANCE_US) {}

  observe(timestampUs: number, durationUs: number): void {
    if (this.lastEndUs !== null) {
      const delta = timestampUs - this.lastEndUs;
      if (delta > this.toleranceUs) {
        this.gaps += 1;
        if (delta > this.maxGapUs) this.maxGapUs = delta;
      } else if (delta < -this.toleranceUs) {
        this.overlaps += 1;
      }
    }
    this.lastEndUs = timestampUs + Math.max(0, durationUs);
  }

  reset(): void {
    this.lastEndUs = null;
    this.gaps = 0;
    this.overlaps = 0;
    this.maxGapUs = 0;
  }
}

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
  /**
   * The exact configuration the browser said it supports.
   *
   * Probing is deliberately more forgiving than the old single-shot check —
   * it tries without `latencyMode`, without display dimensions and without
   * the acceleration/rate-control hints — so the configuration that comes
   * back may be a cut-down one. Handing the encoder anything other than the
   * configuration that answered "supported" is how a probe that succeeds is
   * followed by `configure()` throwing, which the customer sees as the render
   * failing for no reason.
   */
  encoderConfig?: VideoEncoderConfig;
  audioEncoderConfig?: AudioEncoderConfig;
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

/**
 * Every H.264 profile/level string worth asking for, best first.
 *
 * A browser's answer to "can you encode H.264 at 1080p?" is not one answer.
 * Hardware encoders advertise High profile; blocked or blacklisted hardware
 * leaves only a software Main or Constrained Baseline encoder; Safari and
 * Firefox are stricter about which level strings they will even acknowledge.
 * Probing High alone — which is what this used to do — turned "no High
 * hardware encoder" into "this browser cannot record the selected format",
 * even though the same browser would happily encode Main or Baseline. The
 * list therefore walks profiles first (best compression first) and then the
 * level computed for the real frame rate and the conservative one computed
 * for 30 fps.
 */
function avcFallbacks(width: number, height: number, fps = 30): string[] {
  const levels = [avcLevelForSize(width, height, fps), avcLevelForSize(width, height, 30)];
  // High, Main, Baseline, Constrained Baseline — the four profiles every
  // H.264 encoder implements at least one of.
  const profiles = ["6400", "4d00", "42e0", "42c0"];
  const codecs: string[] = [];
  for (const profile of profiles) {
    for (const level of levels) {
      const codec = `avc1.${profile}${level}`;
      if (!codecs.includes(codec)) codecs.push(codec);
    }
  }
  return codecs;
}

function candidates(config: OfflineExportConfig): Array<{ video: string; audio: string }> {
  if (config.container === "mp4") {
    return avcFallbacks(config.width, config.height, config.fps).map((video) => ({ video, audio: "mp4a.40.2" }));
  }
  return [
    { video: "vp09.00.10.08", audio: "opus" },
    { video: "vp09.00.41.08", audio: "opus" },
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
  /**
   * Round-trip continuity of the encoded audio packets. Zero gaps and zero
   * overlaps means every packet begins exactly where the previous one ended,
   * so no platform encoder dropped or duplicated a piece of the soundtrack.
   */
  audioPacketGaps: number;
  audioPacketOverlaps: number;
  audioMaxContinuityGapUs: number;
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

/**
 * The shape of a video configuration, richest first.
 *
 * `isConfigSupported()` rejects a configuration for any field the encoder does
 * not understand, not only for the codec. `latencyMode: "quality"`,
 * `hardwareAcceleration`, `bitrateMode` and `displayWidth`/`displayHeight`
 * are all optional in the WebCodecs specification and are all refused by some
 * real browsers — Firefox ignores `latencyMode`, Safari historically rejected
 * unknown dictionary members on some versions, and a hardware encoder that
 * only offers constant bitrate refuses `bitrateMode: "variable"`. Asking for
 * the richest shape and then degrading it one field at a time is what turns a
 * spurious "unsupported" into a finished video, and every shape still carries
 * `avc: { format: "avc" }` so the MP4 muxer receives the length-prefixed
 * bitstream it writes into the file.
 */
function videoConfigVariants(
  config: OfflineExportConfig,
  codec: string,
  hardwareAcceleration?: HardwareAcceleration,
  bitrateMode?: VideoEncoderBitrateMode
): VideoEncoderConfig[] {
  const common: VideoEncoderConfig = {
    codec,
    width: config.width,
    height: config.height,
    ...(config.fps ? { framerate: config.fps } : {}),
    bitrate: config.videoKbps * 1000,
    ...(bitrateMode ? { bitrateMode } : {}),
    ...(hardwareAcceleration ? { hardwareAcceleration } : {}),
    ...(config.container === "mp4" ? { avc: { format: "avc" as const } } : {}),
  };
  const withLatency: VideoEncoderConfig = {
    ...common,
    displayWidth: config.width,
    displayHeight: config.height,
    latencyMode: "quality",
  };
  const minimal: VideoEncoderConfig = {
    codec,
    width: config.width,
    height: config.height,
    bitrate: config.videoKbps * 1000,
    ...(config.container === "mp4" ? { avc: { format: "avc" as const } } : {}),
  };
  return [withLatency, common, minimal];
}

/**
 * The configuration the exporter will actually hand to `configure()`.
 *
 * Kept in one place so the probe and the encoder can never diverge: whatever
 * `isConfigSupported()` accepted is what the encoder is constructed with.
 */
function videoConfig(
  config: OfflineExportConfig,
  codec: string,
  hardwareAcceleration?: HardwareAcceleration,
  bitrateMode?: VideoEncoderBitrateMode
): VideoEncoderConfig {
  return videoConfigVariants(config, codec, hardwareAcceleration, bitrateMode)[0];
}

/** Ensure an MP4-bound configuration keeps its length-prefixed AVC bitstream. */
function withMp4BitstreamFormat(
  container: OfflineExportConfig["container"],
  config: VideoEncoderConfig,
): VideoEncoderConfig {
  if (container !== "mp4" || config.avc) return config;
  return { ...config, avc: { format: "avc" } };
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
  // One audio answer serves every video attempt: the audio codec is the same
  // for all of them, and probing it once per video candidate made a browser
  // with no H.264 encoder sit inside a long chain of identical async calls
  // before it could say so.
  const audioAnswers = new Map<string, { ok: boolean; config: AudioEncoderConfig }>();
  const probeAudio = async (codec: string): Promise<{ ok: boolean; config: AudioEncoderConfig }> => {
    const key = codec;
    const cached = audioAnswers.get(key);
    if (cached) return cached;
    const audioConfig: AudioEncoderConfig = {
      codec,
      sampleRate: config.sampleRate ?? 48_000,
      numberOfChannels: config.channels ?? 2,
      bitrate: config.audioKbps * 1000,
    };
    let answer: { ok: boolean; config: AudioEncoderConfig } = { ok: false, config: audioConfig };
    try {
      const audio = await api.AudioEncoder.isConfigSupported(audioConfig);
      answer = { ok: Boolean(audio.supported), config: audioConfig };
    } catch (error) {
      attempts.push(`${codec} audio probe threw ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!answer.ok && !attempts.some((a) => a.startsWith(`${codec} audio`))) {
      attempts.push(`${codec} audio is unsupported`);
    }
    audioAnswers.set(key, answer);
    return answer;
  };

  for (const pair of candidates(config)) {
    const audioAnswer = await probeAudio(pair.audio);
    if (!audioAnswer.ok) continue;

    // First ask for hardware + VBR so detailed scenes, caption edges and
    // visualisers receive bits where needed; fall back cleanly when a driver
    // only exposes default rate control or software encoding.
    for (const acceleration of ["prefer-hardware", undefined] as const) {
      for (const bitrateMode of ["variable", undefined] as const) {
        for (const candidateConfig of videoConfigVariants(config, pair.video, acceleration, bitrateMode)) {
          try {
            const video = await api.VideoEncoder.isConfigSupported(candidateConfig);
            if (video.supported) {
              return {
                supported: true,
                videoCodec: pair.video,
                audioCodec: pair.audio,
                ...(acceleration ? { hardwareAcceleration: acceleration } : {}),
                ...(bitrateMode ? { bitrateMode } : {}),
                // `isConfigSupported` may hand back a normalised copy; use the
                // one the browser answered about when it gives us one. The AVC
                // bitstream format is re-stated if a browser drops it, because
                // without it the encoder may emit Annex B and the MP4 muxer
                // would write length-unaware samples that no player can read.
                encoderConfig: withMp4BitstreamFormat(
                  config.container,
                  (video.config as VideoEncoderConfig | undefined) ?? candidateConfig,
                ),
                audioEncoderConfig: audioAnswer.config,
              };
            }
          } catch (error) {
            attempts.push(
              `${pair.video} video probe threw ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
        attempts.push(
          `${pair.video} video (${acceleration || "browser-selected"}, ${bitrateMode || "default-rc"}) is unsupported`
        );
      }
    }
  }
  return {
    supported: false,
    reason: `No supported ${config.container.toUpperCase()} WebCodecs configuration. ${attempts.join("; ")}`,
  };
}

/** What the renderer should actually encode, once the browser has been asked. */
export interface EncodableFormat {
  supported: boolean;
  /** The container that will really be written. */
  container: OfflineContainer;
  /** True when the requested container could not be encoded on this device. */
  substituted: boolean;
  support: OfflineSupport;
}

/**
 * Pick the container this browser can actually produce.
 *
 * The project asks for MP4 because that is what platforms take. If the
 * device cannot encode H.264/AAC — a Firefox installation without an AAC
 * encoder, a hardened build, a machine whose hardware encoder is blocklisted
 * — the honest answer used to be "This browser cannot record the selected
 * format", shown to the customer after they had already chosen everything and
 * pressed Render. Nothing was wrong with their project, their settings or
 * their choice; one codec was unavailable on one device.
 *
 * So the device is asked twice before the customer is told anything: MP4
 * first, then the compatible alternative. If either works, the render goes
 * ahead in the container that works and the finish line says so in one
 * sentence. Only when neither container can be encoded does this return
 * `supported: false`, and even then the message the customer sees names no
 * codec.
 */
export async function resolveEncodableFormat(config: OfflineExportConfig): Promise<EncodableFormat> {
  const requested = await supported(config);
  if (requested.supported) {
    return { supported: true, container: config.container, substituted: false, support: requested };
  }
  const alternate: OfflineContainer = config.container === "mp4" ? "webm" : "mp4";
  const fallback = await supported({ ...config, container: alternate });
  if (fallback.supported) {
    return { supported: true, container: alternate, substituted: true, support: fallback };
  }
  return { supported: false, container: config.container, substituted: false, support: requested };
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
  /** Codec string the platform audio encoder was configured with. */
  private readonly audioCodec: string;
  /** Watches the emitted audio packets for gaps or overlaps. */
  private readonly audioContinuity = new AudioContinuityGuard();
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
    this.audioCodec = probe.audioCodec;
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
        // Measure before muxing: a hole or a repeated timestamp here is an
        // audible dropout in the finished voice, whatever the muxer then does.
        this.audioContinuity.observe(chunk.timestamp, chunk.duration ?? 0);
        this.muxer.addAudioChunk(chunk, meta);
      },
      error: fail,
    });
    /**
     * Configure with exactly what the probe accepted — never a rebuilt
     * "equivalent" configuration. A browser that only accepted the cut-down
     * shape (no `latencyMode`, no acceleration hint) would otherwise throw
     * here, after the project had already been told the render was starting.
     */
    this.video.configure(
      probe.encoderConfig ?? videoConfig(config, probe.videoCodec, probe.hardwareAcceleration, probe.bitrateMode)
    );
    this.audio.configure(
      probe.audioEncoderConfig ?? {
        codec: probe.audioCodec,
        sampleRate: this.config.sampleRate,
        numberOfChannels: this.config.channels,
        bitrate: config.audioKbps * 1000,
      }
    );
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
   * PCM is handed over in the codec's own natural packet size (1024 frames
   * for AAC, a 20 ms packet for Opus), so no platform encoder has to buffer
   * or split an arbitrary-sized input before emitting a packet. The PCM
   * stream itself is unchanged — only the size of the AudioData pieces it is
   * cut into — and the emitted packets are checked for gaps and overlaps by
   * the continuity guard, so a platform encoder that ever drops a packet on
   * any browser is measured in the export stats instead of shipping as an
   * audible hole in the voice.
   *
   * This used to hand control back only when the encoder's queue was full.
   * When the encoder keeps up — which it does, because AAC is cheap next to
   * H.264 — the queue never fills, nothing is awaited, and the loop runs to
   * completion in one go. Nine minutes of audio is thousands of turns of it,
   * and the window used to freeze for every one. It now also yields on a
   * time budget, so the browser gets a turn several times a second no matter
   * how fast the encoder is going.
   */
  async encodeAudio(
    buffer: AudioBuffer,
    /**
     * PCM frames per AudioData. Omit to use the codec's natural packet size
     * (1024 for AAC, a 20 ms packet for Opus) — the value every platform
     * encoder normalises to internally anyway. An explicit override exists
     * for tests and for code that has measured a reason to deviate.
     */
    chunkFrames?: number,
    onProgress?: (fraction: number) => void,
  ): Promise<void> {
    const channels = this.config.channels;
    const naturalFrames = audioChunkFramesForCodec(this.audioCodec, this.config.sampleRate);
    const framesPerChunk = chunkFrames && chunkFrames > 0 ? chunkFrames : naturalFrames;
    const budget = createFrameBudget();
    for (let offset = 0; offset < buffer.length; offset += framesPerChunk) {
      this.throwIfFailed();
      await this.drainAudioQueue();
      if (this.store.pendingBytes > 16 * 1024 * 1024) {
        await this.drainOutput("the encoded soundtrack was written to protected browser storage");
      }
      await budget.maybeYield();
      this.throwIfFailed();
      onProgress?.(Math.min(1, offset / Math.max(1, buffer.length)));
      const frames = Math.min(framesPerChunk, buffer.length - offset);
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
      audioPacketGaps: this.audioContinuity.gaps,
      audioPacketOverlaps: this.audioContinuity.overlaps,
      audioMaxContinuityGapUs: this.audioContinuity.maxGapUs,
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
