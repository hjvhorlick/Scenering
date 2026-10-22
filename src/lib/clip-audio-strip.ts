/**
 * Removing the soundtrack from a clip — for real, not just muting it.
 *
 * The clip panel has always had a mute switch, and mute is the right default
 * for a script scene: the narration must not be talked over. But mute only
 * stops the track being *played*. The audio is still inside the stored file,
 * still taking up room on a device that may be nearly full (see
 * `storage-health.ts`), still there for anyone who opens the download, and
 * still the thing a caption pass would listen to.
 *
 * "Remove the audio" is a different, deliberate act: re-wrap the clip without
 * its audio track. The picture is packet-copied, never re-encoded, so an
 * H.264 clip is rewritten in a fraction of its duration and loses nothing
 * visually. The result replaces the stored upload through the same
 * `addCustomVideo` path as any other upload, so quota handling, the atomic
 * replacement of the old blob and the reload-safe address all behave
 * identically.
 *
 * The difference the UI has to make obvious, and this module encodes:
 *  - **mute** is reversible, instant, and loses nothing;
 *  - **remove** is permanent, saves the audio's bytes, and cannot be undone —
 *    undoing it means uploading the file again.
 */

import { loadMediaToolkit, uploadInputFormats } from "./media-convert";
import { getCustomVideo, isCustomVideoUrl, resolveVideoUrl } from "./custom-video";

export interface ClipAudioStripSuccess {
  ok: true;
  /** A video-only file, ready to be stored in place of the original. */
  file: File;
  /** Bytes the stored upload should shrink by (audio track + container slack). */
  savedBytes: number;
}

export interface ClipAudioStripFailure {
  ok: false;
  /** A sentence fit for the panel. */
  message: string;
  reason: "missing" | "remote" | "no-audio" | "unsupported" | "too-large" | "failed";
}

export type ClipAudioStripOutcome = ClipAudioStripSuccess | ClipAudioStripFailure;

/** Buffering the stripped file in memory; the same ceiling the uploader uses. */
const MAX_STRIP_BYTES = 400 * 1024 * 1024;
const STRIP_TIMEOUT_MS = 5 * 60_000;

function failure(reason: ClipAudioStripFailure["reason"], message: string): ClipAudioStripFailure {
  return { ok: false, reason, message };
}

function withExtension(name: string, extension: string): string {
  const base = (name || "clip").replace(/\.[a-z0-9]+$/i, "").trim() || "clip";
  return `${base}.${extension}`;
}

/**
 * Rewrites a stored, uploaded clip without its audio track.
 *
 * Only an upload can be rewritten: a remote `https:` clip is not ours to edit,
 * and there is nothing local to shrink, so those get the honest "mute it
 * instead" answer rather than a button that would do nothing.
 */
export async function stripClipAudio(
  url: string | null | undefined,
  options: { onProgress?: (progress: number) => void } = {},
): Promise<ClipAudioStripOutcome> {
  if (!url) return failure("missing", "This scene has no clip.");
  const clip = getCustomVideo(url);
  if (!isCustomVideoUrl(url)) {
    return failure(
      "remote",
      "This clip is streamed from a web address, so its file cannot be rewritten. Use the mute switch instead.",
    );
  }
  const resolved = resolveVideoUrl(url);
  if (!clip || !resolved) {
    return failure("missing", "That clip is no longer in this browser's storage. Upload it again to change its audio.");
  }

  let source: Blob;
  try {
    const response = await fetch(resolved);
    if (!response.ok) throw new Error("the stored file could not be read");
    source = await response.blob();
  } catch {
    return failure("failed", "The stored clip could not be read. Upload it again and remove the audio then.");
  }
  if (source.size > MAX_STRIP_BYTES) {
    return failure("too-large", "That clip is too large to rewrite here. Mute it instead.");
  }

  let mb: Awaited<ReturnType<typeof loadMediaToolkit>>;
  try {
    mb = await loadMediaToolkit();
  } catch {
    return failure("unsupported", "The media tool could not be loaded. Mute the clip instead.");
  }

  let input: InstanceType<typeof mb.Input> | null = null;
  try {
    input = new mb.Input({ source: new mb.BlobSource(source), formats: uploadInputFormats(mb) });
    if (!(await input.canRead())) {
      return failure("unsupported", "That clip's container cannot be rewritten here. Mute it instead.");
    }

    const audio = await input.getPrimaryAudioTrack().catch(() => null);
    if (!audio) {
      return failure("no-audio", "That clip has no audio track — there is nothing to remove.");
    }

    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) {
      return failure("unsupported", "That file has no picture in it, so it cannot be kept as a video-only clip.");
    }
    const videoCodec = await video.getCodec().catch(() => null);

    // Keep the picture untouched: choose a container that can carry this
    // codec as-is, so the rewrite is a copy rather than a re-encode.
    const mp4 = new mb.Mp4OutputFormat();
    const webm = new mb.WebMOutputFormat();
    const format = videoCodec && mp4.getSupportedCodecs().includes(videoCodec) ? mp4 : webm;
    const extension = format === webm ? "webm" : "mp4";
    const mimeType = format === webm ? "video/webm" : "video/mp4";

    const output = new mb.Output({ format, target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({
      input,
      output,
      // Copy the picture; drop the sound entirely.
      video: {},
      audio: { discard: true },
      copy: {},
      showWarnings: false,
    });

    const keepsVideo = conversion.utilizedTracks.some((track) => track.isVideoTrack());
    const keepsAudio = conversion.utilizedTracks.some((track) => track.isAudioTrack());
    if (!conversion.isValid || !keepsVideo || keepsAudio) {
      return failure(
        "unsupported",
        "That clip's video format cannot be re-wrapped without re-encoding, so its audio cannot be removed here. Mute it instead.",
      );
    }

    let timedOut = false;
    conversion.onProgress = (progress) => {
      options.onProgress?.(Math.max(0, Math.min(1, Number(progress) || 0)));
    };
    const guard = setTimeout(() => {
      timedOut = true;
      void conversion.cancel().catch(() => {});
    }, STRIP_TIMEOUT_MS);
    try {
      await conversion.execute();
    } finally {
      clearTimeout(guard);
    }
    if (timedOut) return failure("failed", "Removing the audio took too long. Try again, or mute the clip instead.");

    const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
    if (!buffer || buffer.byteLength === 0) {
      return failure("failed", "The rewritten clip came back empty. Mute the clip instead.");
    }

    options.onProgress?.(1);
    return {
      ok: true,
      file: new File([buffer], withExtension(clip.name, extension), { type: mimeType, lastModified: Date.now() }),
      savedBytes: Math.max(0, clip.size - buffer.byteLength),
    };
  } catch {
    return failure("failed", "The audio could not be removed from that clip. Mute it instead.");
  } finally {
    try {
      input?.dispose();
    } catch {
      /* already disposed */
    }
  }
}
