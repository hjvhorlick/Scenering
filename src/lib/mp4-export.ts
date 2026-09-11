import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { CompositionOptions } from "./frame-renderer";
import { drawCompositionFrame } from "./frame-renderer";

/**
 * Real MP4 (H.264 + AAC) export using the WebCodecs API and mp4-muxer.
 *
 * Unlike the MediaRecorder path this renders offline: every frame is drawn and
 * encoded as fast as the encoder accepts it, so output is deterministic and no
 * audio/video drift can creep in.
 */

/** Bitrate used for the AAC audio track. */
const AUDIO_BITRATE = 192_000;

/** Samples per AAC encode chunk (the codec's natural frame size). */
const AUDIO_CHUNK_FRAMES = 1024;

/** Encoder queue depth kept in flight before we throttle. */
const MAX_QUEUE_SIZE = 8;

/** H.264 levels/profiles to try, highest first. */
const AVC_CODEC_CANDIDATES = [
  "avc1.4d002a", // Main, level 4.2  (1080p60)
  "avc1.4d0028", // Main, level 4.0  (1080p30)
  "avc1.640028", // High, level 4.0
  "avc1.4d001f", // Main, level 3.1  (720p30)
  "avc1.42001f", // Baseline, level 3.1
];

const AAC_CODEC = "mp4a.40.2"; // AAC-LC

export type Mp4UnsupportedReason =
  | "no-webcodecs"
  | "no-video-codec"
  | "no-audio-codec";

export interface Mp4SupportInfo {
  supported: boolean;
  reason?: Mp4UnsupportedReason;
  detail?: string;
  videoCodec?: string;
  audioSupported: boolean;
}

const supportCache = new Map<string, Mp4SupportInfo>();

/**
 * Checks whether the browser can actually encode a real MP4 at this size.
 * Results are cached because `isConfigSupported` is relatively expensive.
 */
export async function probeMp4Support(
  width: number,
  height: number,
  fps: number
): Promise<Mp4SupportInfo> {
  const cacheKey = `${width}x${height}@${fps}`;
  const cached = supportCache.get(cacheKey);
  if (cached) return cached;

  const result = await probeUncached(width, height, fps);
  supportCache.set(cacheKey, result);
  return result;
}

async function probeUncached(
  width: number,
  height: number,
  fps: number
): Promise<Mp4SupportInfo> {
  if (
    typeof VideoEncoder === "undefined" ||
    typeof VideoFrame === "undefined" ||
    typeof AudioEncoder === "undefined" ||
    typeof AudioData === "undefined"
  ) {
    return {
      supported: false,
      reason: "no-webcodecs",
      detail: "This browser does not expose the WebCodecs API.",
      audioSupported: false,
    };
  }

  let videoCodec: string | undefined;
  for (const codec of AVC_CODEC_CANDIDATES) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        framerate: fps,
        bitrate: 5_000_000,
      });
      if (res.supported) {
        videoCodec = codec;
        break;
      }
    } catch {
      // try the next profile/level
    }
  }

  if (!videoCodec) {
    return {
      supported: false,
      reason: "no-video-codec",
      detail: "No H.264 encoder is available in this browser.",
      audioSupported: false,
    };
  }

  let audioSupported = false;
  try {
    const res = await AudioEncoder.isConfigSupported({
      codec: AAC_CODEC,
      sampleRate: 48000,
      numberOfChannels: 2,
    });
    audioSupported = Boolean(res.supported);
  } catch {
    audioSupported = false;
  }

  if (!audioSupported) {
    return {
      supported: false,
      reason: "no-audio-codec",
      detail: "No AAC audio encoder is available in this browser.",
      audioSupported: false,
      videoCodec,
    };
  }

  return { supported: true, videoCodec, audioSupported: true };
}

export function describeMp4Support(info: Mp4SupportInfo): string {
  switch (info.reason) {
    case "no-webcodecs":
      return "MP4 export needs the WebCodecs API, which this browser doesn't expose. Renders will fall back to WebM.";
    case "no-video-codec":
      return "This browser has no H.264 video encoder, so MP4 export is unavailable. Renders will fall back to WebM.";
    case "no-audio-codec":
      return "This browser has no AAC audio encoder, so MP4 export is unavailable. Renders will fall back to WebM.";
    default:
      return "MP4 export is unavailable in this browser. Renders will fall back to WebM.";
  }
}

export interface Mp4RenderOptions {
  canvas: HTMLCanvasElement;
  composition: CompositionOptions;
  /** Pre-mixed soundtrack, or null for a silent video. */
  audio: AudioBuffer | null;
  fps: number;
  bitrate: number;
  /** Progress of the frame-encoding stage, 0..1. */
  onProgress?: (fraction: number) => void;
  shouldAbort?: () => boolean;
}

function waitForDequeue(encoder: VideoEncoder | AudioEncoder): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      encoder.removeEventListener("dequeue", finish);
      resolve();
    };
    encoder.addEventListener("dequeue", finish);
    // Safety net: some implementations never fire `dequeue`.
    setTimeout(finish, 250);
  });
}

function configureVideoEncoder(
  encoder: VideoEncoder,
  codec: string,
  width: number,
  height: number,
  fps: number,
  bitrate: number
): void {
  const config: VideoEncoderConfig = {
    codec,
    width,
    height,
    framerate: fps,
    bitrate,
    latencyMode: "quality",
  };

  try {
    // Ask for AVCC (length-prefixed) bitstream — what MP4 wants.
    encoder.configure({ ...config, avc: { format: "avc" } });
  } catch {
    // Firefox and older builds reject the `avc` option; mp4-muxer detects
    // Annex B automatically in that case.
    encoder.configure(config);
  }
}

async function encodeAudioTrack(
  muxer: Muxer<ArrayBufferTarget>,
  audio: AudioBuffer
): Promise<void> {
  const sampleRate = audio.sampleRate;
  const channelCount = Math.min(2, Math.max(1, audio.numberOfChannels));

  let encoderError: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  encoder.configure({
    codec: AAC_CODEC,
    sampleRate,
    numberOfChannels: channelCount,
    bitrate: AUDIO_BITRATE,
  });

  const channels: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) {
    channels.push(audio.getChannelData(c));
  }

  try {
    for (let offset = 0; offset < audio.length; offset += AUDIO_CHUNK_FRAMES) {
      if (encoderError) throw encoderError;

      const frames = Math.min(AUDIO_CHUNK_FRAMES, audio.length - offset);
      const data = new Float32Array(frames * channelCount);
      for (let c = 0; c < channelCount; c++) {
        data.set(channels[c].subarray(offset, offset + frames), c * frames);
      }

      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: frames,
        numberOfChannels: channelCount,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data,
      });

      if (encoder.encodeQueueSize >= MAX_QUEUE_SIZE) {
        await waitForDequeue(encoder);
      }
      encoder.encode(audioData);
      audioData.close();
    }

    await encoder.flush();
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }

  if (encoderError) throw encoderError;
}

/**
 * Encodes the composition to a real MP4 file (H.264 video + AAC audio).
 */
export async function renderMp4File(options: Mp4RenderOptions): Promise<Blob> {
  const { canvas, composition, audio, fps, bitrate, onProgress, shouldAbort } = options;
  const { width, height } = composition;

  const support = await probeMp4Support(width, height, fps);
  if (!support.supported || !support.videoCodec) {
    throw new Error(describeMp4Support(support));
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: "avc",
      width,
      height,
      frameRate: fps,
    },
    audio: audio
      ? {
          codec: "aac",
          numberOfChannels: Math.min(2, Math.max(1, audio.numberOfChannels)),
          sampleRate: audio.sampleRate,
        }
      : undefined,
    fastStart: "in-memory",
  });

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  configureVideoEncoder(videoEncoder, support.videoCodec, width, height, fps, bitrate);

  const totalFrames = Math.max(1, Math.round(composition.duration * fps));
  const frameDurationMicros = Math.round(1_000_000 / fps);
  // A keyframe every 2 seconds keeps seeking snappy without bloating the file.
  const keyFrameInterval = Math.max(1, Math.round(fps * 2));

  try {
    // Audio first so the muxer always knows the track layout.
    if (audio) {
      await encodeAudioTrack(muxer, audio);
    }

    for (let i = 0; i < totalFrames; i++) {
      if (shouldAbort?.()) throw new Error("Render cancelled");
      if (encoderError) throw encoderError;

      const time = i / fps;
      drawCompositionFrame(ctx, composition, time);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(time * 1_000_000),
        duration: frameDurationMicros,
      });

      if (videoEncoder.encodeQueueSize >= MAX_QUEUE_SIZE) {
        await waitForDequeue(videoEncoder);
      }
      videoEncoder.encode(frame, { keyFrame: i % keyFrameInterval === 0 });
      frame.close();

      if (i % 5 === 0 || i === totalFrames - 1) {
        onProgress?.((i + 1) / totalFrames);
        // Yield so React can paint the progress bar and cancellation stays responsive.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    await videoEncoder.flush();
  } finally {
    if (videoEncoder.state !== "closed") videoEncoder.close();
  }

  if (encoderError) throw encoderError;

  muxer.finalize();
  const output = (muxer.target as ArrayBufferTarget).buffer;
  return new Blob([output], { type: "video/mp4" });
}
