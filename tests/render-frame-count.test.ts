/**
 * The frame count that refused a finished music video.
 *
 * Reported: a music video with no narration rendered to the end and was then
 * rejected with the generic "The video could not be rendered / try again"
 * card — on every attempt.
 *
 * The cause was two roundings of the same number. The encode loop used
 * Math.ceil(duration × fps); the post-encode verification used
 * Math.round(duration × fps). When the fractional part was below 0.5 the
 * encoder produced one frame more than the check expected, the check raised a
 * hard error, and the finished file was thrown away.
 *
 * Narration scenes never exposed it, because a narration scene's length is
 * stored to one decimal place — at 30, 50 and 60 fps that product is always
 * whole. A single-scene music video takes its length from the uploaded clip's
 * own duration (96.44s, 87.419s), and about half of those land in the
 * mismatch window.
 *
 * This suite pins the arithmetic AND the wiring: the number handed to the
 * validator, to the MP4 byte audit and to the encode loop is one number, from
 * one helper.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { totalFrameCount } from "../src/lib/render-profile";
import { validateFinishedExport } from "../src/lib/export-validator";
import type { OfflineExportStats } from "../src/lib/offline-export";

let checks = 0;
const ok = (condition: boolean, label: string) => {
  checks += 1;
  if (!condition) throw new Error(label);
};
const eq = (actual: unknown, expected: unknown, label: string) => {
  checks += 1;
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
};

/* ---------------------------------------------- 1. the arithmetic */

// Durations that come from an uploaded clip rather than a narration line.
const clipDurations = [
  96.44, 87.42, 87.419, 61.3, 45.02, 120.15, 33.333, 59.94, 14.7, 300.001, 7.71,
];
for (const duration of clipDurations) {
  for (const fps of [24, 25, 30, 50, 60] as const) {
    eq(
      totalFrameCount(duration, fps),
      Math.ceil(duration * fps),
      `${duration}s @ ${fps}fps counts every frame the encoder will emit`,
    );
    ok(
      totalFrameCount(duration, fps) >= Math.round(duration * fps),
      `${duration}s @ ${fps}fps never asks for fewer frames than the encoder produces`,
    );
  }
}

// The exact case from the report.
eq(totalFrameCount(96.44, 30), 2894, "96.44s @ 30fps is 2894 frames, not the 2893 the old check demanded");
ok(Math.round(96.44 * 30) === 2893, "…which is the number that used to disagree (the regression itself)");

// Degenerate inputs must not produce NaN or Infinity.
eq(totalFrameCount(0, 30), 0, "no duration, no frames");
eq(totalFrameCount(Number.NaN, 30), 0, "NaN duration is 0 frames");
eq(totalFrameCount(-5, 30), 0, "a negative duration is 0 frames");
eq(totalFrameCount(Number.POSITIVE_INFINITY, 30), 0, "an infinite duration is 0 frames");

/* ------------------------------- 2. validator accepts what it is given */

const statsFor = (frames: number, seconds: number, fps = 30): OfflineExportStats => ({
  codedWidth: 1920,
  codedHeight: 1080,
  submittedFrames: frames,
  encodedVideoChunks: frames,
  encodedAudioChunks: Math.ceil(seconds / 0.0214),
  videoDurationSec: seconds,
  audioDurationSec: seconds,
  audioPacketGaps: 0,
  audioPacketOverlaps: 0,
  audioMaxContinuityGapUs: 0,
  effectiveFps: fps,
  maxFrameDurationDriftUs: 400,
  reorderedChunks: 0,
  maxCompositionOffsetUs: 0,
  signedOffsetsPatched: false,
  offCadenceFrames: 0,
  firstFramePtsUs: 0,
  lastFramePtsUs: Math.round(seconds * 1_000_000),
});

const base = {
  byteSize: 24 * 1024 * 1024,
  expectedWidth: 1920,
  expectedHeight: 1080,
  expectedFps: 30,
  engine: "frame-exact" as const,
};

// The reported project: a 96.44s single-scene music video at 30fps.
{
  const durationSec = 96.44;
  const frames = totalFrameCount(durationSec, 30);
  const report = await validateFinishedExport(new Blob([new Uint8Array(2048)]), {
    ...base,
    expectedDurationSec: durationSec,
    expectedFrames: frames,
    encoderStats: statsFor(frames, durationSec),
  });
  ok(report.ok, "a music video whose length comes from the clip passes its own check");
  ok(report.errors.length === 0, "…with no errors");
  eq(report.checks.find((c) => c.id === "framerate")?.ok, true, "…and the frame-rate check passes");
}

// The same project as the OLD code wired it: encoder ceil, validator round.
{
  const durationSec = 96.44;
  const encoded = Math.ceil(durationSec * 30);
  const report = await validateFinishedExport(new Blob([new Uint8Array(2048)]), {
    ...base,
    expectedDurationSec: durationSec,
    expectedFrames: Math.round(durationSec * 30), // the bug
    encoderStats: statsFor(encoded, durationSec),
  });
  eq(report.ok, true, "one frame of bookkeeping is no longer enough to refuse a finished file");
}

// A real gap is still a failure: two frames missing is a visible hold.
{
  const durationSec = 96.44;
  const frames = totalFrameCount(durationSec, 30);
  const report = await validateFinishedExport(new Blob([new Uint8Array(2048)]), {
    ...base,
    expectedDurationSec: durationSec,
    expectedFrames: frames,
    encoderStats: statsFor(frames - 3, durationSec),
  });
  eq(report.ok, false, "three missing frames still fail the check");
  ok(
    report.errors.some((e) => /frames instead of/i.test(e)),
    "…and the error names the frame count",
  );
}

/* ------------------------------------------------ 3. the wiring */

const renderSrc = readFileSync(
  fileURLToPath(new URL("../src/components/RenderView.tsx", import.meta.url)),
  "utf8",
);
ok(
  !/Math\.ceil\(\s*estimatedTotalDuration\s*\*\s*fpsUsed\s*\)/.test(renderSrc),
  "the encode loop does not round the frame count itself",
);
ok(
  /const totalFrames = totalFrameCount\(estimatedTotalDuration, fpsUsed\)/.test(renderSrc),
  "the encode loop asks the shared helper",
);
ok(
  /expectedFrames: totalFrameCount\(estimatedTotalDuration, fpsUsed\)/.test(renderSrc),
  "the validator is handed the same number",
);
ok(
  /frames: totalFrames,/.test(renderSrc),
  "the MP4 byte audit is handed the same number too",
);

console.log(`PASS render frame count: ${checks} checks, 0 failed`);
