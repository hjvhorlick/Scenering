/**
 * Seeing what a video really is, and converting it when this browser cannot
 * play the container it arrived in.
 *
 * A customer's "MP4" or "MOV" is often not the thing its extension says: an
 * iPhone records HEVC inside a `.mov`, a camera writes H.264 inside a `.mts`,
 * a download arrives as Matroska with an `.mkv` name. A `<video>` element
 * either plays the container or it does not, and when it does not the upload
 * used to be refused outright — even though the picture inside was perfectly
 * ordinary H.264.
 *
 * Mediabunny (already a dependency, used by the transcription worker) can
 * demux those files and tell us exactly what is inside. This module uses it
 * for two things, both on demand so the main bundle does not pay for them:
 *
 *  - `inspectMediaBlob()` names the container, the codecs and the real
 *    duration/size, which turns "that video could not be played" into a
 *    sentence about HEVC or Matroska.
 *  - `convertVideoForBrowser()` rewrites a file this browser cannot play as
 *    MP4 (H.264 + AAC) — or WebM when the browser cannot encode H.264 — so an
 *    upload that used to fail is stored in a format the whole app can open.
 *
 * Nothing here throws: every failure returns `null`, and the caller keeps its
 * original, accurate refusal.
 */

import type { BufferTarget, Input as MediaInput } from "mediabunny";

export interface MediaInspection {
  /** Customer-facing container name such as "MP4" or "Matroska (MKV)". */
  container: string;
  /** MIME type reported by the demuxer, codecs included. */
  mimeType: string;
  /** Seconds from the file's own metadata (0 when it does not say). */
  duration: number;
  width: number;
  height: number;
  /** "avc", "hevc", "vp9", "av1", … as named by the demuxer. */
  videoCodec: string | null;
  audioCodec: string | null;
  /** Whether this browser has a decoder for the video track. */
  videoDecodable: boolean;
}

type MediaToolkit = typeof import("mediabunny");
type VideoCodecName = Parameters<MediaToolkit["canEncodeVideo"]>[0];
type AudioCodecName = Parameters<MediaToolkit["canEncodeAudio"]>[0];

let toolkitPromise: Promise<MediaToolkit> | null = null;

/**
 * The containers an upload can plausibly be in. Listing them keeps the HLS
 * demuxer (and its playlist machinery) out of the on-demand chunk; no
 * customer uploads a `.m3u8` as a video file.
 *
 * Exported so the audio-stripping re-wrap (`clip-audio-strip.ts`) reads a file
 * with exactly the same set of containers the uploader accepted it from.
 */
export function uploadInputFormats(mb: MediaToolkit) {
  return [mb.MP4, mb.QTFF, mb.MATROSKA, mb.WEBM, mb.MPEG_TS, mb.MP3, mb.WAVE, mb.OGG, mb.FLAC, mb.ADTS];
}

/** Loads mediabunny once, and retries after a failed load on the next call. */
export function loadMediaToolkit(): Promise<MediaToolkit> {
  if (!toolkitPromise) {
    toolkitPromise = import("mediabunny").catch((error) => {
      toolkitPromise = null;
      throw error;
    });
  }
  return toolkitPromise;
}

const CODEC_NAMES: Record<string, string> = {
  avc: "H.264",
  hevc: "HEVC (H.265)",
  vp8: "VP8",
  vp9: "VP9",
  av1: "AV1",
  prores: "Apple ProRes",
  aac: "AAC",
  opus: "Opus",
  mp3: "MP3",
  vorbis: "Vorbis",
  flac: "FLAC",
  ac3: "AC-3",
  eac3: "E-AC-3",
  dts: "DTS",
};

/** "hevc" → "HEVC (H.265)"; an unknown codec keeps its own name. */
export function describeCodec(codec: string | null | undefined): string {
  if (!codec) return "";
  return CODEC_NAMES[codec] || codec.toUpperCase();
}

/**
 * The sentence a creator can act on. Naming the codec is the difference
 * between "MP4 is not supported" (which is false, and infuriating) and
 * "this MP4 holds HEVC, which this browser cannot decode".
 */
export function unplayableVideoMessage(inspection: MediaInspection | null): string {
  if (!inspection) {
    return "That video could not be played by this browser. MP4 (H.264), MOV and WebM are the formats that always work.";
  }
  if (!inspection.videoCodec) {
    return "That file has no picture in it — it may be an audio-only file in a video container.";
  }
  const video = describeCodec(inspection.videoCodec);
  const container = inspection.container || "that container";
  if (video && inspection.videoCodec) {
    if (inspection.videoCodec === "hevc") {
      return (
        `That video is HEVC (H.265) inside ${container}, and this browser has no HEVC decoder. ` +
        "Export it as MP4 (H.264 + AAC) and upload it again. On an iPhone, Settings → Camera → Formats → " +
        "Most Compatible records H.264 from then on."
      );
    }
    if (inspection.videoCodec === "prores") {
      return (
        `That video is Apple ProRes inside ${container}, which web browsers cannot decode. ` +
        "Export it as MP4 (H.264 + AAC) and upload it again."
      );
    }
    return (
      `That video is ${video} inside ${container}, which this browser cannot play. ` +
      "Convert it to MP4 (H.264 + AAC) and upload it again."
    );
  }
  return `That video is ${container}, which this browser cannot play. Convert it to MP4 (H.264 + AAC) and upload it again.`;
}

function durationOf(value: unknown): number {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/**
 * Names what is inside a file without decoding it. Returns `null` when the
 * bytes are not media that the toolkit can read at all.
 */
export async function inspectMediaBlob(blob: Blob): Promise<MediaInspection | null> {
  if (!blob || blob.size === 0) return null;
  try {
    const mb = await loadMediaToolkit();
    const input = new mb.Input({ source: new mb.BlobSource(blob), formats: uploadInputFormats(mb) });
    try {
      if (!(await input.canRead())) return null;
      const format = await input.getFormat().catch(() => null);
      const video = await input.getPrimaryVideoTrack().catch(() => null);
      const audio = await input.getPrimaryAudioTrack().catch(() => null);
      if (!video && !audio) return null;

      const videoCodec = video ? await video.getCodec().catch(() => null) : null;
      const audioCodec = audio ? await audio.getCodec().catch(() => null) : null;
      const width = video ? Number(await video.getDisplayWidth().catch(() => 0)) || 0 : 0;
      const height = video ? Number(await video.getDisplayHeight().catch(() => 0)) || 0 : 0;
      const metadataDuration = durationOf(await input.getDurationFromMetadata().catch(() => null));
      const videoDecodable = video ? await video.canDecode().catch(() => false) : false;

      return {
        container: format?.name || "",
        mimeType: format?.mimeType || "",
        duration: metadataDuration,
        width,
        height,
        videoCodec: videoCodec || null,
        audioCodec: audioCodec || null,
        videoDecodable,
      };
    } finally {
      try {
        input.dispose();
      } catch {
        /* the demuxer is already gone */
      }
    }
  } catch {
    return null;
  }
}

export interface ConvertVideoOptions {
  /** 0–1 while the file is rewritten. */
  onProgress?: (progress: number) => void;
  /** Files larger than this are left to a desktop converter. */
  maxBytes?: number;
}

/**
 * Conversion buffers its output in memory, so a half-gigabyte camera file
 * would take the tab down. Above this size the upload keeps the honest
 * "convert it first" refusal instead.
 */
export const MAX_CONVERT_VIDEO_BYTES = 400 * 1024 * 1024;

/**
 * A conversion that stops making progress must not leave the upload button
 * frozen at "Converting 37%" for ever. Ten minutes is far beyond a packet
 * copy and generous even for a full transcode of a long clip.
 */
const CONVERSION_TIMEOUT_MS = 10 * 60_000;

interface ConversionPlan {
  format: "mp4" | "webm";
  videoCodec: VideoCodecName;
  audioCodec: AudioCodecName | null;
  mimeType: string;
  extension: string;
}

/**
 * H.264 in MP4 is the one target every browser in use can play; WebM with
 * VP9 is the fallback for browsers without an H.264 encoder. The audio codec
 * is left unspecified in the first plan so a compatible track is copied
 * rather than re-encoded.
 */
const CONVERSION_PLANS: ConversionPlan[] = [
  { format: "mp4", videoCodec: "avc", audioCodec: null, mimeType: "video/mp4", extension: "mp4" },
  { format: "mp4", videoCodec: "avc", audioCodec: "aac", mimeType: "video/mp4", extension: "mp4" },
  { format: "webm", videoCodec: "vp9", audioCodec: "vorbis", mimeType: "video/webm", extension: "webm" },
  { format: "webm", videoCodec: "vp9", audioCodec: "opus", mimeType: "video/webm", extension: "webm" },
  { format: "webm", videoCodec: "vp8", audioCodec: "opus", mimeType: "video/webm", extension: "webm" },
];

function renamedFile(file: Blob, originalName: string, extension: string, mimeType: string): File {
  const base = (originalName || "video").replace(/\.[a-z0-9]+$/i, "").trim() || "video";
  return new File([file], `${base}.${extension}`, { type: mimeType, lastModified: Date.now() });
}

/**
 * Rewrites `file` as MP4 (H.264) or WebM so this browser can play it, or
 * returns `null` when that is not possible here (unsupported codec, no
 * encoder, too large, storage pressure). The caller treats `null` as "keep
 * the original refusal", never as a crash.
 */
export async function convertVideoForBrowser(
  file: Blob,
  originalName: string,
  options: ConvertVideoOptions = {},
): Promise<File | null> {
  if (!file || file.size === 0) return null;
  if (file.size > (options.maxBytes ?? MAX_CONVERT_VIDEO_BYTES)) return null;

  let mb: MediaToolkit;
  try {
    mb = await loadMediaToolkit();
  } catch {
    return null;
  }

  for (const plan of CONVERSION_PLANS) {
    let input: MediaInput | null = null;
    let timedOut = false;
    try {
      input = new mb.Input({ source: new mb.BlobSource(file), formats: uploadInputFormats(mb) });
      if (!(await input.canRead())) return null;

      const video = await input.getPrimaryVideoTrack().catch(() => null);
      if (!video) return null;
      const sourceVideoCodec = await video.getCodec().catch(() => null);
      if (!sourceVideoCodec) return null;

      // Copying avoids a decoder, transcoding needs one this browser has.
      if (sourceVideoCodec !== plan.videoCodec) {
        if (!(await video.canDecode().catch(() => false))) continue;
        if (!(await mb.canEncodeVideo(plan.videoCodec).catch(() => false))) continue;
      }

      const audio = await input.getPrimaryAudioTrack().catch(() => null);
      const sourceAudioCodec = audio ? await audio.getCodec().catch(() => null) : null;
      if (audio && plan.audioCodec && sourceAudioCodec !== plan.audioCodec) {
        if (!(await audio.canDecode().catch(() => false))) continue;
        if (!(await mb.canEncodeAudio(plan.audioCodec).catch(() => false))) continue;
      }

      const output = new mb.Output({
        format: plan.format === "mp4" ? new mb.Mp4OutputFormat() : new mb.WebMOutputFormat(),
        target: new mb.BufferTarget(),
      });

      const conversion = await mb.Conversion.init({
        input,
        output,
        // Copy the packets when they already match; only re-encode what must change.
        video: { codec: plan.videoCodec },
        ...(audio ? { audio: plan.audioCodec ? { codec: plan.audioCodec } : {} } : {}),
        copy: {},
        // We handle discarded tracks ourselves; keep the console quiet.
        showWarnings: false,
      });

      const keepsVideo = conversion.utilizedTracks.some((track) => track.isVideoTrack());
      const keepsAudio = !audio || conversion.utilizedTracks.some((track) => track.isAudioTrack());
      if (!conversion.isValid || !keepsVideo || !keepsAudio) continue;

      conversion.onProgress = (progress) => {
        const bounded = Math.max(0, Math.min(1, Number(progress) || 0));
        options.onProgress?.(bounded);
      };
      const guard = setTimeout(() => {
        timedOut = true;
        void conversion.cancel().catch(() => {});
      }, CONVERSION_TIMEOUT_MS);
      try {
        await conversion.execute();
      } finally {
        clearTimeout(guard);
      }

      const buffer = (output.target as BufferTarget).buffer;
      if (!buffer || buffer.byteLength === 0) continue;
      options.onProgress?.(1);
      return renamedFile(new Blob([buffer], { type: plan.mimeType }), originalName, plan.extension, plan.mimeType);
    } catch {
      // A cancelled conversion is not going to succeed on another plan.
      if (timedOut) return null;
      // Otherwise this plan did not fit the file; the next one may.
    } finally {
      try {
        input?.dispose();
      } catch {
        /* already disposed */
      }
    }
  }
  return null;
}
