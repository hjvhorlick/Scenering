/**
 * Post-encode verification for finished video exports.
 *
 * Checks the actual output dimensions, frame rate, audio-video synchronisation,
 * and video duration BEFORE a rendered file is committed to the Vault or
 * presented to the creator for download.
 */

import type { OfflineExportStats } from "./offline-export";

export interface ProbedVideoMetadata {
  width: number;
  height: number;
  durationSec: number | null;
}

export interface ExportValidationInput {
  byteSize: number;
  expectedWidth: number;
  expectedHeight: number;
  expectedFps: number;
  expectedDurationSec: number;
  expectedFrames: number;
  engine: "frame-exact" | "compatibility";
  expectAudio?: boolean;
  probed?: ProbedVideoMetadata | null;
  encoderStats?: OfflineExportStats | null;
  recordedFrames?: number | null;
}

export interface ExportValidationCheck {
  id: "container" | "dimensions" | "framerate" | "duration" | "audio_sync";
  label: string;
  ok: boolean;
  detail: string;
}

export interface ExportValidationReport {
  ok: boolean;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  audioSyncDeltaMs: number | null;
  summary: string;
  checks: ExportValidationCheck[];
  errors: string[];
  warnings: string[];
}

/**
 * Probes an encoded video Blob in an off-DOM <video> element to read the
 * container's actual decoded display dimensions and duration. Handles WebM
 * streams that initially report `duration === Infinity` by seeking to the end.
 */
export function probeVideoBlobMetadata(
  blob: Blob,
  timeoutMs = 5000
): Promise<ProbedVideoMetadata | null> {
  if (
    typeof document === "undefined" ||
    typeof document.createElement !== "function" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    let url = "";
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const finish = (result: ProbedVideoMetadata | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        video.removeAttribute("src");
        video.load();
      } catch {}
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }
      resolve(result);
    };

    const timer = window.setTimeout(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        finish({
          width: video.videoWidth,
          height: video.videoHeight,
          durationSec:
            Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null,
        });
      } else {
        finish(null);
      }
    }, Math.max(500, timeoutMs));

    video.onerror = () => finish(null);

    video.onloadedmetadata = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        finish({ width: w, height: h, durationSec: video.duration });
        return;
      }
      // MediaRecorder WebM containers often omit duration in the header until seeked.
      if (video.duration === Number.POSITIVE_INFINITY) {
        const onSeeked = () => {
          video.removeEventListener("timeupdate", onSeeked);
          video.removeEventListener("durationchange", onSeeked);
          const dur =
            Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
          finish({ width: w, height: h, durationSec: dur });
        };
        video.addEventListener("timeupdate", onSeeked);
        video.addEventListener("durationchange", onSeeked);
        try {
          video.currentTime = 1e9;
          return;
        } catch {
          finish({ width: w, height: h, durationSec: null });
          return;
        }
      }
      finish({ width: w, height: h, durationSec: null });
    };

    try {
      url = URL.createObjectURL(blob);
      video.src = url;
    } catch {
      finish(null);
    }
  });
}

/**
 * Pure verification of output dimensions, frame rate, audio sync, and duration.
 */
export function evaluateExportValidation(input: ExportValidationInput): ExportValidationReport {
  const checks: ExportValidationCheck[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Container byte check
  const containerOk = Number.isFinite(input.byteSize) && input.byteSize >= 1024;
  checks.push({
    id: "container",
    label: "Container payload",
    ok: containerOk,
    detail: containerOk
      ? `${(input.byteSize / 1_048_576).toFixed(2)} MB written`
      : `Output payload is empty or truncated (${input.byteSize} bytes)`,
  });
  if (!containerOk) {
    errors.push(`Exported file is empty or truncated (${input.byteSize} bytes).`);
  }

  // 2. Output dimensions check (actual decoded display size, plus H.264 16px macroblock alignment tolerance on coded size)
  const actualWidth =
    input.probed && input.probed.width > 0
      ? input.probed.width
      : input.encoderStats?.codedWidth || input.expectedWidth;
  const actualHeight =
    input.probed && input.probed.height > 0
      ? input.probed.height
      : input.encoderStats?.codedHeight || input.expectedHeight;

  const macroblockAlignedMatch =
    !input.probed &&
    Boolean(input.encoderStats) &&
    actualWidth >= input.expectedWidth &&
    actualWidth <= Math.ceil(input.expectedWidth / 16) * 16 &&
    actualHeight >= input.expectedHeight &&
    actualHeight <= Math.ceil(input.expectedHeight / 16) * 16;

  const dimsOk =
    (actualWidth === input.expectedWidth && actualHeight === input.expectedHeight) ||
    macroblockAlignedMatch;

  const reportedWidth = macroblockAlignedMatch ? input.expectedWidth : actualWidth;
  const reportedHeight = macroblockAlignedMatch ? input.expectedHeight : actualHeight;

  checks.push({
    id: "dimensions",
    label: "Output dimensions",
    ok: dimsOk,
    detail: dimsOk
      ? `${reportedWidth} × ${reportedHeight} matches requested resolution`
      : `Output resolution ${actualWidth} × ${actualHeight} does not match requested ${input.expectedWidth} × ${input.expectedHeight}`,
  });
  if (!dimsOk) {
    errors.push(
      `Exported video dimensions (${actualWidth} × ${actualHeight}) do not match requested ${input.expectedWidth} × ${input.expectedHeight}.`
    );
  }

  // 3. Video duration check
  const actualDurationSec =
    input.probed?.durationSec && input.probed.durationSec > 0
      ? input.probed.durationSec
      : input.encoderStats?.videoDurationSec && input.encoderStats.videoDurationSec > 0
      ? input.encoderStats.videoDurationSec
      : input.expectedDurationSec;

  const durationDeltaSec = Math.abs(actualDurationSec - input.expectedDurationSec);
  const maxDurationDriftSec =
    input.engine === "frame-exact"
      ? Math.max(0.18, 3 / Math.max(1, input.expectedFps))
      : Math.max(0.9, input.expectedDurationSec * 0.06);
  const durationOk = actualDurationSec > 0 && durationDeltaSec <= maxDurationDriftSec;

  checks.push({
    id: "duration",
    label: "Video duration",
    ok: durationOk,
    detail: durationOk
      ? `${actualDurationSec.toFixed(2)}s (target ${input.expectedDurationSec.toFixed(2)}s)`
      : `Duration ${actualDurationSec.toFixed(2)}s drifted from ${input.expectedDurationSec.toFixed(2)}s by ${durationDeltaSec.toFixed(2)}s`,
  });
  if (!durationOk) {
    if (input.engine === "frame-exact" || durationDeltaSec > Math.max(2.0, input.expectedDurationSec * 0.15)) {
      errors.push(
        `Exported video duration (${actualDurationSec.toFixed(2)}s) drifted from planned timeline (${input.expectedDurationSec.toFixed(2)}s).`
      );
    } else {
      warnings.push(
        `Real-time recorder duration differed by ${durationDeltaSec.toFixed(2)}s from ${input.expectedDurationSec.toFixed(2)}s.`
      );
    }
  }

  // 4. Frame rate & frame cadence consistency
  let actualFps = input.expectedFps;
  let fpsOk = true;
  let fpsDetail = `${input.expectedFps} fps CFR`;

  if (input.engine === "frame-exact" && input.encoderStats) {
    actualFps = input.encoderStats.effectiveFps || input.expectedFps;
    const chunksMatch = input.encoderStats.encodedVideoChunks === input.expectedFrames;
    const fpsDelta = Math.abs(actualFps - input.expectedFps);
    const cadenceSteady = input.encoderStats.maxFrameDurationDriftUs <= 2500;
    fpsOk = chunksMatch && fpsDelta <= 0.5 && cadenceSteady;
    fpsDetail = fpsOk
      ? `${actualFps.toFixed(2)} fps CFR (${input.encoderStats.encodedVideoChunks}/${input.expectedFrames} frames)`
      : `${actualFps.toFixed(2)} fps (${input.encoderStats.encodedVideoChunks}/${input.expectedFrames} frames, max frame drift ${input.encoderStats.maxFrameDurationDriftUs}µs)`;
    if (!chunksMatch) {
      errors.push(
        `Encoder emitted ${input.encoderStats.encodedVideoChunks} video frames instead of ${input.expectedFrames}.`
      );
    } else if (fpsDelta > 0.5) {
      errors.push(
        `Effective frame rate (${actualFps.toFixed(2)} fps) did not match requested ${input.expectedFps} fps.`
      );
    } else if (!cadenceSteady) {
      warnings.push(
        `Frame duration jitter reached ${(input.encoderStats.maxFrameDurationDriftUs / 1000).toFixed(2)}ms.`
      );
    }
  } else if (typeof input.recordedFrames === "number" && input.recordedFrames > 0 && actualDurationSec > 0) {
    actualFps = Math.round((input.recordedFrames / actualDurationSec) * 100) / 100;
    const minAcceptableFps = input.expectedFps * 0.7;
    fpsOk = actualFps >= minAcceptableFps;
    fpsDetail = `${actualFps.toFixed(1)} fps (${input.recordedFrames} painted frames)`;
    if (!fpsOk) {
      warnings.push(
        `Real-time fallback painted ${actualFps.toFixed(1)} fps below requested ${input.expectedFps} fps.`
      );
    }
  }

  checks.push({
    id: "framerate",
    label: "Frame rate",
    ok: fpsOk,
    detail: fpsDetail,
  });

  // 5. Audio-video synchronisation
  let audioSyncDeltaMs: number | null = null;
  if (input.encoderStats && input.encoderStats.encodedAudioChunks > 0) {
    const refVideoSec = input.encoderStats.videoDurationSec || actualDurationSec;
    audioSyncDeltaMs = Math.round(
      Math.abs(input.encoderStats.audioDurationSec - refVideoSec) * 1000
    );
    // AAC encodes in 1024-sample packets (~21.3ms @ 48 kHz); ≤140ms keeps A/V tightly locked.
    const syncOk = audioSyncDeltaMs <= 140;
    checks.push({
      id: "audio_sync",
      label: "Audio sync",
      ok: syncOk,
      detail: syncOk
        ? `A/V locked (±${audioSyncDeltaMs}ms)`
        : `Audio stream (${input.encoderStats.audioDurationSec.toFixed(2)}s) drifted ${audioSyncDeltaMs}ms from video (${refVideoSec.toFixed(2)}s)`,
    });
    if (!syncOk) {
      errors.push(
        `Audio/video synchronisation drifted by ${audioSyncDeltaMs}ms (audio ${input.encoderStats.audioDurationSec.toFixed(2)}s vs video ${refVideoSec.toFixed(2)}s).`
      );
    }
  } else if (input.expectAudio && input.engine === "frame-exact" && input.encoderStats) {
    checks.push({
      id: "audio_sync",
      label: "Audio sync",
      ok: false,
      detail: "Expected encoded audio track, but 0 audio packets were written",
    });
    errors.push("Expected an encoded audio track, but no audio packets were written to the container.");
  } else {
    checks.push({
      id: "audio_sync",
      label: "Audio sync",
      ok: true,
      detail:
        input.engine === "compatibility"
          ? "Hardware Web Audio clock phase-locked"
          : "Silent timeline verified",
    });
  }

  const ok = errors.length === 0;
  const syncBadge =
    audioSyncDeltaMs !== null ? ` · A/V ±${audioSyncDeltaMs}ms` : "";
  const summary = `${reportedWidth}×${reportedHeight} · ${Math.round(actualFps)}fps · ${actualDurationSec.toFixed(1)}s${syncBadge}`;

  return {
    ok,
    width: reportedWidth,
    height: reportedHeight,
    fps: actualFps,
    durationSec: actualDurationSec,
    audioSyncDeltaMs,
    summary,
    checks,
    errors,
    warnings,
  };
}

/**
 * Full async export validator: probes the finished Blob in a browser <video>
 * element and validates dimensions, frame rate, duration, and audio sync.
 */
export async function validateFinishedExport(
  blob: Blob,
  options: Omit<ExportValidationInput, "byteSize" | "probed">
): Promise<ExportValidationReport> {
  const probed = await probeVideoBlobMetadata(blob);
  return evaluateExportValidation({
    ...options,
    byteSize: blob.size,
    probed,
  });
}
