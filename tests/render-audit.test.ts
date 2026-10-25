/**
 * The finished-file audit.
 *
 * Every smoothness complaint this suite exists for ends in the same place: the
 * file that was handed to the customer. The renderer cannot see its own
 * output, so `mp4-audit.ts` reads the container back the way a player does.
 * These tests build real MP4 files with the same muxer the renderer uses and
 * check that the audit reads them correctly — including the cases that produce
 * stop-and-go playback.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { createHarness } from "./harness";
import {
  MP4_AUDIT_WINDOW_BYTES,
  auditFinishedMp4,
  parseMp4,
  patchSignedCompositionOffsets,
  readMp4Head,
} from "../src/lib/mp4-audit";

const h = createHarness();

const AVC_C = new Uint8Array([
  1, 0x64, 0x00, 0x28, 0xff, 0xe1, 0x00, 0x04, 0x67, 0x64, 0x00, 0x28, 0x01, 0x00, 0x04, 0x68, 0xee, 0x3c, 0x80,
]);

interface BuildOptions {
  frames?: number;
  fps?: number;
  /** Give frames uneven durations, the way a stuttering timeline does. */
  jitter?: boolean;
  /** Leave the movie index at the end of the file. */
  indexAtEnd?: boolean;
  audio?: boolean;
  /** Omit the video track entirely. */
  noVideo?: boolean;
  /** Patch the video track timescale away from the frame rate. */
  badCodec?: boolean;
}

function buildMp4(options: BuildOptions = {}): Uint8Array {
  const {
    frames = 90,
    fps = 30,
    jitter = false,
    indexAtEnd = false,
    audio = true,
    noVideo = false,
    badCodec = false,
  } = options;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    ...(noVideo
      ? {}
      : {
          video: {
            codec: "avc" as const,
            width: 1920,
            height: 1080,
            frameRate: badCodec ? 1000 : 30000,
          },
        }),
    ...(audio ? { audio: { codec: "aac" as const, numberOfChannels: 2, sampleRate: 48_000 } } : {}),
    fastStart: indexAtEnd
      ? false
      : { expectedVideoChunks: frames + 2, expectedAudioChunks: frames * 3 + 8 },
  });

  const videoMeta = {
    decoderConfig: {
      codec: "avc1.640028",
      description: AVC_C,
      codedWidth: 1920,
      codedHeight: 1080,
    },
  };

  for (let i = 0; i < frames && !noVideo; i++) {
    // A stuttering render shows up here: some frames are held longer and the
    // next ones are squeezed, which is what a frame that arrived late (or not
    // at all) looks like once it is muxed.
    const oneFrameUs = Math.round(1_000_000 / fps);
    const timestampUs = jitter
      ? Math.round(((i + (i % 7 === 6 ? 1 : 0)) * 1_000_000) / fps)
      : Math.round((i * 1_000_000) / fps);
    const durationUs = jitter && i % 7 === 6 ? oneFrameUs * 2 : oneFrameUs;
    muxer.addVideoChunkRaw(
      new Uint8Array(120 + (i % 11)),
      i % (fps * 2) === 0 ? "key" : "delta",
      timestampUs,
      durationUs,
      videoMeta,
    );
  }

  if (audio) {
    const audioMeta = {
      decoderConfig: {
        codec: "mp4a.40.2",
        sampleRate: 48_000,
        numberOfChannels: 2,
        description: new Uint8Array([0x12, 0x10]),
      },
    };
    const framesNeeded = Math.ceil((frames / fps) * 48_000 / 1024) + 2;
    for (let i = 0; i < framesNeeded; i++) {
      muxer.addAudioChunkRaw(
        new Uint8Array(24),
        "key",
        Math.round((i * 1024 * 1_000_000) / 48_000),
        Math.round((1024 * 1_000_000) / 48_000),
        audioMeta,
      );
    }
  }

  muxer.finalize();
  return new Uint8Array(target.buffer as ArrayBuffer);
}

/* ------------------------------------------------------------------ *
 * A clean file is read as a clean file.
 * ------------------------------------------------------------------ */
{
  const bytes = buildMp4();
  const audit = parseMp4(bytes, { width: 1920, height: 1080, fps: 30, frames: 90, durationSec: 3, requireAudio: true });
  h.eq(audit.isMp4, true, "a muxed file is recognised as MP4");
  h.ok(audit.video !== null, "the video track is found");
  h.eq(audit.video?.sampleCount, 90, "every encoded frame is counted in the sample table");
  h.eq(audit.video?.codec, "avc1", "the video codec is read from the sample description");
  h.ok((audit.video?.codecDetail || "").includes("High profile"), "the H.264 profile is read from avcC");
  h.eq(audit.video?.uniformFrameDelta !== null, true, "frame timing is constant");
  h.near(audit.video?.frameRate ?? 0, 30, 0.001, "the file declares 30 fps");
  h.eq(audit.video?.width, 1920, "the sample description carries the width");
  h.eq(audit.video?.height, 1080, "the sample description carries the height");
  h.eq(audit.video?.zeroSizeSamples, 0, "no empty frames");
  h.eq(audit.video?.firstPresentationSec, 0, "the first frame is presented at t=0");
  h.eq(audit.audio?.codec, "mp4a", "the audio track is found");
  h.eq(audit.audio?.codecDetail, "AAC", "the audio object type is read from esds");
  h.eq(audit.fastStart, true, "the index is at the front");
  h.eq(audit.fragmented, false, "the file is not fragmented");
  h.eq(audit.problems.length, 0, `a clean render has nothing to report (${audit.problems.join(" | ")})`);
  h.eq(audit.ok, true, "a clean render passes the audit");
  h.ok(audit.summary.includes("1920×1080"), "the summary names the resolution");
  h.ok(audit.summary.includes("30.00 fps CFR"), "the summary names the constant frame rate");
}

/* ------------------------------------------------------------------ *
 * The failure the customer reported: stop-and-go frame timing.
 * ------------------------------------------------------------------ */
{
  const bytes = buildMp4({ jitter: true });
  const audit = parseMp4(bytes, { fps: 30, frames: 90, durationSec: 3 });
  h.eq(audit.video?.uniformFrameDelta, null, "uneven frame durations are not called constant");
  h.ok((audit.video?.distinctFrameDurations ?? 0) > 1, "more than one frame duration is recorded");
  h.ok(
    audit.problems.some((p) => /constant frame rate/i.test(p)),
    "the audit names uneven frame timing as a problem",
  );
  h.eq(audit.ok, false, "a stuttering file does not pass");
}

/* ------------------------------------------------------------------ *
 * Missing frames, wrong size, wrong codec, index at the end.
 * ------------------------------------------------------------------ */
{
  const bytes = buildMp4();
  const audit = parseMp4(bytes, { fps: 30, frames: 120, width: 3840, height: 2160, durationSec: 30 });
  h.ok(audit.problems.some((p) => /holds 90 video frames/i.test(p)), "a short file is reported");
  h.ok(audit.problems.some((p) => /1920×1080, not the requested/i.test(p)), "a wrong resolution is reported");
  h.ok(audit.problems.some((p) => /long where the timeline is/i.test(p)), "a wrong duration is reported");
}

{
  const bytes = buildMp4({ indexAtEnd: true });
  const audit = parseMp4(bytes, { fps: 30, frames: 90 });
  h.eq(audit.fastStart, false, "an index at the end is noticed");
  h.ok(audit.problems.some((p) => /index is at the end/i.test(p)), "the audit explains why that matters");
}

{
  const bytes = buildMp4({ noVideo: true });
  const audit = parseMp4(bytes, { fps: 30 });
  h.eq(audit.video, null, "a sound-only file has no video track");
  h.ok(audit.problems.some((p) => /no video track/i.test(p)), "the missing video track is reported");
}

{
  const bytes = buildMp4({ badCodec: true });
  const audit = parseMp4(bytes, { fps: 30, frames: 90 });
  // A track whose timescale cannot hold the frame rate evenly shows up as
  // uneven frame durations, which is exactly what a player renders as judder.
  h.ok(
    audit.problems.some((p) => /constant frame rate/i.test(p)),
    "a timescale too coarse for the frame rate is reported as uneven frame timing",
  );
  h.eq(audit.ok, false, "a coarse-timescale file does not pass");
}

/* ------------------------------------------------------------------ *
 * A file that is not an MP4 at all — the mislabelled-download failure.
 * ------------------------------------------------------------------ */
{
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01]);
  const audit = parseMp4(webm, { fps: 30 });
  h.eq(audit.isMp4, false, "a WebM header is not mistaken for MP4");
  h.ok(audit.problems.some((p) => /not an MP4/i.test(p)), "the audit says the file is not an MP4");
  h.eq(audit.ok, false, "a non-MP4 file cannot pass");
}

/* ------------------------------------------------------------------ *
 * B-frames: the offset a hardware encoder needs and the muxer cannot say.
 *
 * Chrome's H.264 encoder with latencyMode "quality" emits I, P, B, B — the
 * presentation order is not the decode order — so the renderer hands the
 * muxer a NEGATIVE composition offset for each B frame. mp4-muxer writes the
 * composition table as version 0, whose offsets are unsigned; the negative
 * value lands in the file as a huge positive one and the picture jumps ahead
 * by hours for those frames while the audio track stays perfect. That is
 * precisely "the voice runs normal but nothing else follows in line".
 * ------------------------------------------------------------------ */
function buildReorderedMp4(indexAtEnd = false): Uint8Array {
  const fps = 30;
  const groups = 24;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc" as const, width: 1920, height: 1080, frameRate: 30000 },
    fastStart: indexAtEnd ? false : { expectedVideoChunks: groups * 4 + 2, expectedAudioChunks: 4 },
  });
  const meta = {
    decoderConfig: { codec: "avc1.640028", description: AVC_C, codedWidth: 1920, codedHeight: 1080 },
  };
  // Decode order I, P, B, B; presentation order 0, 1, 2, 3.
  const slots = [0, 3, 1, 2];
  for (let group = 0; group < groups; group++) {
    for (const slot of slots) {
      const presentationIndex = group * 4 + slot;
      const decodeIndex = group * 4 + slots.indexOf(slot);
      const pts = Math.round((presentationIndex * 1_000_000) / fps);
      const dts = Math.round((decodeIndex * 1_000_000) / fps);
      muxer.addVideoChunkRaw(
        new Uint8Array(220),
        presentationIndex % (groups * 4) === 0 ? "key" : "delta",
        pts,
        Math.round(1_000_000 / fps),
        meta,
        pts - dts,
      );
    }
  }
  muxer.finalize();
  return new Uint8Array(target.buffer as ArrayBuffer);
}

{
  const bytes = buildReorderedMp4();
  const before = parseMp4(bytes, { fps: 30, frames: 96 });
  h.ok((before.video?.reorderedSamples ?? 0) > 0, "the audit sees the reordered frames");
  h.ok(
    (before.video?.unsignedOverflowSamples ?? 0) > 0,
    "the audit sees negative offsets written as unsigned ones",
  );
  h.ok(
    before.problems.some((p) => /frame times are corrupt/i.test(p)),
    "an unsigned composition table holding negative offsets is a reported fault, not a passing file",
  );
  h.eq(before.ok, false, "the corrupt index does not pass the audit");

  // The one-byte repair: same bytes, table version raised to 1 (signed).
  const repaired = await patchSignedCompositionOffsets(new Blob([bytes]));
  h.eq(repaired.patched, 1, "exactly one composition table is rewritten");
  const after = parseMp4(new Uint8Array(await repaired.blob.arrayBuffer()), { fps: 30, frames: 96 });
  h.eq(after.video?.unsignedOverflowSamples, 0, "no offset overflows after the repair");
  h.ok(
    (after.video?.maxCompositionOffsetSec ?? 99) <= 2 / 30 + 0.002,
    "no offset is larger than the two frame times a reordering encoder needs",
  );
  h.eq(after.ok, true, "the repaired file passes the audit");
  h.eq(after.video?.sampleCount, 96, "the repair leaves every frame in place");
  h.eq(after.video?.reorderedSamples, (before.video?.reorderedSamples ?? 0), "the same frames are reordered, now correctly");

  // A file that never needed the repair must come back untouched: with no
  // reordering there is no composition table at all, and nothing is written.
  const clean = buildMp4();
  const untouched = await patchSignedCompositionOffsets(new Blob([clean]));
  h.eq(untouched.patched, 0, "a file with no composition table is left alone");
  h.eq(
    (await untouched.blob.arrayBuffer()).byteLength,
    clean.byteLength,
    "the repair never changes the length of the file",
  );
  const cleanAfter = parseMp4(new Uint8Array(await untouched.blob.arrayBuffer()), { fps: 30, frames: 90 });
  h.eq(cleanAfter.ok, true, "a clean file stays clean after the repair runs");
}

{
  // The same repair when the movie index was written at the end of the file:
  // the table has to be found from the tail instead of the head.
  const bytes = buildReorderedMp4(true);
  const before = parseMp4(bytes, { fps: 30, frames: 96 });
  h.ok(
    (before.video?.unsignedOverflowSamples ?? 0) > 0,
    "an index at the end still exposes the unsigned composition offsets",
  );
  const repaired = await patchSignedCompositionOffsets(new Blob([bytes]));
  h.eq(repaired.patched, 1, "the table is found in the tail and raised to version 1");
  h.eq((await repaired.blob.arrayBuffer()).byteLength, bytes.byteLength, "the tail repair keeps the file length");
  const after = parseMp4(new Uint8Array(await repaired.blob.arrayBuffer()), { fps: 30, frames: 96 });
  h.eq(after.video?.unsignedOverflowSamples, 0, "the repaired tail index reads its offsets as signed");
  h.eq(after.video?.sampleCount, 96, "and every frame is still there");
}

/* ------------------------------------------------------------------ *
 * Reading a real Blob: head window and the index-at-the-end fallback.
 * ------------------------------------------------------------------ */
{
  const bytes = buildMp4();
  const audit = await auditFinishedMp4(new Blob([bytes], { type: "video/mp4" }), {
    fps: 30,
    frames: 90,
    width: 1920,
    height: 1080,
    durationSec: 3,
  });
  h.eq(audit.ok, true, "a blob is audited without reading the whole file");
  h.eq(audit.video?.sampleCount, 90, "the blob audit counts the frames");
}

{
  // A file whose index sits at the end is found from the tail.
  const bytes = buildMp4({ indexAtEnd: true });
  const blob = new Blob([bytes]);
  const head = await readMp4Head(blob);
  h.eq(head.found, true, "the index at the end of the file is still found");
  const audit = parseMp4(head.bytes, { fps: 30, frames: 90 });
  h.eq(audit.video?.sampleCount, 90, "the tail-read index is parsed correctly");
}

{
  // The audit never reads more than its window, however big the file is.
  const filler = new Uint8Array(1024);
  const head = buildMp4();
  const blob = new Blob([head, filler, filler]);
  h.ok(MP4_AUDIT_WINDOW_BYTES >= 4 * 1024 * 1024, "the audit window is large enough for a long video's index");
  const audit = await auditFinishedMp4(blob, { fps: 30, frames: 90 });
  h.eq(audit.isMp4, true, "padding after the file does not confuse the audit");
}

h.done("render-audit");
