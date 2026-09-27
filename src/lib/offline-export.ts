import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebMMuxer, ArrayBufferTarget as WebMTarget } from "webm-muxer";

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
}

export interface OfflineSupport {
  supported: boolean;
  videoCodec?: string;
  audioCodec?: string;
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

function candidates(config: OfflineExportConfig): Array<{ video: string; audio: string }> {
  if (config.container === "mp4") {
    return [{ video: avcCodecForSize(config.width, config.height), audio: "mp4a.40.2" }];
  }
  return [
    { video: "vp09.00.10.08", audio: "opus" },
    { video: "vp8", audio: "opus" },
  ];
}

/** Import-safe WebCodecs capability probe (returns false in Node and older browsers). */
export async function supported(config: OfflineExportConfig): Promise<OfflineSupport> {
  const api = browserCodecs();
  if (!api || typeof api.VideoEncoder.isConfigSupported !== "function" || typeof api.AudioEncoder.isConfigSupported !== "function") {
    return { supported: false, reason: "WebCodecs VideoEncoder/AudioEncoder are unavailable" };
  }
  for (const pair of candidates(config)) {
    try {
      const [video, audio] = await Promise.all([
        api.VideoEncoder.isConfigSupported({
          codec: pair.video,
          width: config.width,
          height: config.height,
          framerate: config.fps,
          bitrate: config.videoKbps * 1000,
          hardwareAcceleration: "prefer-hardware",
          latencyMode: "quality",
          ...(config.container === "mp4" ? { avc: { format: "avc" as const } } : {}),
        }),
        api.AudioEncoder.isConfigSupported({
          codec: pair.audio,
          sampleRate: config.sampleRate ?? 48_000,
          numberOfChannels: config.channels ?? 2,
          bitrate: config.audioKbps * 1000,
        }),
      ]);
      if (video.supported && audio.supported) return { supported: true, videoCodec: pair.video, audioCodec: pair.audio };
    } catch {
      // Try the next WebM codec; MP4 falls through to the recorder.
    }
  }
  return { supported: false, reason: `No supported ${config.container.toUpperCase()} WebCodecs configuration` };
}

type MuxerLike = {
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void;
  finalize(): void;
};

/** Owns the encoders and muxer for a deterministic, non-real-time export. */
export class OfflineExporter {
  readonly config: Required<OfflineExportConfig>;
  private readonly video: VideoEncoder;
  private readonly audio: AudioEncoder;
  private readonly muxer: MuxerLike;
  private readonly target: { buffer: ArrayBuffer };
  private readonly mime: string;
  private failure: Error | null = null;

  private constructor(config: OfflineExportConfig, probe: Required<Pick<OfflineSupport, "videoCodec" | "audioCodec">>) {
    const api = browserCodecs();
    if (!api) throw new Error("WebCodecs disappeared after capability probing");
    this.config = { ...config, sampleRate: config.sampleRate ?? 48_000, channels: config.channels ?? 2 };
    const fail = (error: DOMException) => { this.failure = new Error(error.message || "WebCodecs encoding failed"); };

    if (config.container === "mp4") {
      const target = new Mp4Target();
      this.target = target;
      this.muxer = new Mp4Muxer({
        target,
        video: { codec: "avc", width: config.width, height: config.height, frameRate: config.fps },
        audio: { codec: "aac", numberOfChannels: this.config.channels, sampleRate: this.config.sampleRate },
        fastStart: "in-memory",
      });
      this.mime = "video/mp4";
    } else {
      const target = new WebMTarget();
      this.target = target;
      this.muxer = new WebMMuxer({
        target,
        video: { codec: probe.videoCodec.startsWith("vp8") ? "V_VP8" : "V_VP9", width: config.width, height: config.height, frameRate: config.fps },
        audio: { codec: "A_OPUS", numberOfChannels: this.config.channels, sampleRate: this.config.sampleRate },
      });
      this.mime = "video/webm";
    }

    this.video = new api.VideoEncoder({ output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta), error: fail });
    this.audio = new api.AudioEncoder({ output: (chunk, meta) => this.muxer.addAudioChunk(chunk, meta), error: fail });
    this.video.configure({
      codec: probe.videoCodec,
      width: config.width,
      height: config.height,
      framerate: config.fps,
      bitrate: config.videoKbps * 1000,
      hardwareAcceleration: "prefer-hardware",
      latencyMode: "quality",
      ...(config.container === "mp4" ? { avc: { format: "avc" as const } } : {}),
    });
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
    return new OfflineExporter(config, { videoCodec: probe.videoCodec, audioCodec: probe.audioCodec });
  }

  private throwIfFailed(): void { if (this.failure) throw this.failure; }

  async encodeCanvas(canvas: HTMLCanvasElement, frameIndex: number): Promise<void> {
    while (this.video.encodeQueueSize > 6) {
      this.throwIfFailed();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const timestamp = Math.round(frameIndex * 1_000_000 / this.config.fps);
    const next = Math.round((frameIndex + 1) * 1_000_000 / this.config.fps);
    const frame = new VideoFrame(canvas, { timestamp, duration: next - timestamp });
    try {
      this.video.encode(frame, { keyFrame: frameIndex % Math.max(1, Math.round(this.config.fps * 2)) === 0 });
    } finally {
      frame.close();
    }
  }

  async encodeAudio(buffer: AudioBuffer, chunkFrames = 4_800): Promise<void> {
    const channels = this.config.channels;
    for (let offset = 0; offset < buffer.length; offset += chunkFrames) {
      while (this.audio.encodeQueueSize > 8) {
        this.throwIfFailed();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
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

  async finalize(): Promise<Blob> {
    await Promise.all([this.video.flush(), this.audio.flush()]);
    this.throwIfFailed();
    this.video.close();
    this.audio.close();
    this.muxer.finalize();
    return new Blob([this.target.buffer], { type: this.mime });
  }

  close(): void {
    try { if (this.video.state !== "closed") this.video.close(); } catch {}
    try { if (this.audio.state !== "closed") this.audio.close(); } catch {}
  }
}
