import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import {
  cutMp3Prefix,
  findFrameOffset,
  id3v2Length,
  looksLikeMpeg,
  mp3Duration,
  planMp3Prefix,
  readFrameHeader,
  readVbrHeader,
  MP3_HEAD_BYTES,
  MP3_PREFIX_TAIL_SECONDS,
} from "../src/lib/mp3-prefix";

/* ------------------------------------------------------------------ *
 * Cutting an MPEG stream on a frame boundary.
 *
 * The point of the module is that a thirteen-minute music bed does not have
 * to be downloaded to play ninety seconds of it. That only holds if the
 * arithmetic is right: a frame length computed from the wrong table, or a
 * cut one byte into a frame, and the browser is handed a stream it decodes
 * to silence — which is exactly the failure this whole change is about.
 *
 * So the sums are checked twice: against frames built here, byte by byte,
 * where the right answer is known in advance; and against the real files in
 * public/sounds, which are the ones that actually have to work.
 * ------------------------------------------------------------------ */

const h = createHarness();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------------------------------------------- building test data */

const SAMPLE_RATE_INDEX: Record<number, number> = { 44100: 0, 48000: 1, 32000: 2 };
const BITRATE_INDEX_V1L3: Record<number, number> = {
  32: 1, 40: 2, 48: 3, 56: 4, 64: 5, 80: 6, 96: 7, 112: 8,
  128: 9, 160: 10, 192: 11, 224: 12, 256: 13, 320: 14,
};

interface FrameSpec {
  bitrateKbps?: number;
  sampleRate?: number;
  padding?: 0 | 1;
  mono?: boolean;
  /** Bytes to put after the header; the rest of the frame is filled with 0x00. */
  payload?: number[];
}

/** One MPEG-1 Layer III frame, header computed the way a real encoder does. */
function mpegFrame(spec: FrameSpec = {}): Uint8Array {
  const bitrateKbps = spec.bitrateKbps ?? 128;
  const sampleRate = spec.sampleRate ?? 44100;
  const padding = spec.padding ?? 0;
  const length = Math.floor((1152 / 8) * ((bitrateKbps * 1000) / sampleRate)) + padding;
  const frame = new Uint8Array(length);
  frame[0] = 0xff;
  frame[1] = 0xfb; // MPEG-1, layer III, no CRC
  frame[2] = (BITRATE_INDEX_V1L3[bitrateKbps] << 4) | (SAMPLE_RATE_INDEX[sampleRate] << 2) | (padding << 1);
  frame[3] = spec.mono ? 0xc0 : 0x00;
  if (spec.payload) frame.set(spec.payload.slice(0, length - 4), 4);
  return frame;
}

/** A first frame carrying a Xing header, as LAME writes for a VBR file. */
function xingFrame(frames: number, bytes: number, bitrateKbps = 128): Uint8Array {
  const frame = mpegFrame({ bitrateKbps });
  const at = 4 + 32; // MPEG-1 stereo side info
  frame.set([0x58, 0x69, 0x6e, 0x67], at); // "Xing"
  frame.set([0, 0, 0, 0x03], at + 4); // flags: frames + bytes
  const u32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
  frame.set(u32(frames), at + 8);
  frame.set(u32(bytes), at + 12);
  return frame;
}

function id3Tag(payloadBytes: number): Uint8Array {
  const tag = new Uint8Array(10 + payloadBytes);
  tag.set([0x49, 0x44, 0x33, 4, 0, 0], 0); // "ID3" v2.4, no flags
  tag[6] = (payloadBytes >>> 21) & 0x7f;
  tag[7] = (payloadBytes >>> 14) & 0x7f;
  tag[8] = (payloadBytes >>> 7) & 0x7f;
  tag[9] = payloadBytes & 0x7f;
  return tag;
}

function join8(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/* ------------------------------------------------- 1. reading one header */

{
  const frame = readFrameHeader(mpegFrame({ bitrateKbps: 128, sampleRate: 44100 }), 0);
  h.ok(frame !== null, "a 128 kbps 44.1 kHz frame header parses");
  h.eq(frame?.byteLength, 417, "128 kbps at 44.1 kHz is a 417-byte frame");
  h.eq(frame?.samplesPerFrame, 1152, "MPEG-1 layer III carries 1152 samples");
  h.eq(frame?.bitrateKbps, 128, "the bitrate is read from the table, not guessed");
  h.eq(frame?.channels, 2, "stereo is read from the channel mode");
  h.near(frame?.seconds ?? 0, 1152 / 44100, 1e-9, "a frame lasts samples over sample rate");

  const padded = readFrameHeader(mpegFrame({ bitrateKbps: 128, padding: 1 }), 0);
  h.eq(padded?.byteLength, 418, "the padding bit adds the one byte it says it does");

  const mono = readFrameHeader(mpegFrame({ bitrateKbps: 64, mono: true }), 0);
  h.eq(mono?.channels, 1, "mono frames are recognised (their side info is shorter)");
  h.eq(mono?.byteLength, 208, "64 kbps at 44.1 kHz is a 208-byte frame");

  const rate48 = readFrameHeader(mpegFrame({ bitrateKbps: 320, sampleRate: 48000 }), 0);
  h.eq(rate48?.byteLength, 960, "320 kbps at 48 kHz is a 960-byte frame");
}

/* ---- headers that must be refused, because accepting one desynchronises
       everything after it ---- */
{
  const bad = mpegFrame();
  bad[2] = 0xf0 | (bad[2] & 0x0f); // bitrate index 15 = invalid
  h.eq(readFrameHeader(bad, 0), null, "the invalid bitrate index is refused");

  const free = mpegFrame();
  free[2] = free[2] & 0x0f; // bitrate index 0 = "free format"
  h.eq(readFrameHeader(free, 0), null, "a free-format frame is refused, not sized at zero");

  const reservedRate = mpegFrame();
  reservedRate[2] = (reservedRate[2] & 0xf0) | 0x0c; // sample-rate index 3
  h.eq(readFrameHeader(reservedRate, 0), null, "the reserved sample rate is refused");

  const reservedVersion = mpegFrame();
  reservedVersion[1] = 0xeb; // version bits 01
  h.eq(readFrameHeader(reservedVersion, 0), null, "the reserved MPEG version is refused");

  h.eq(readFrameHeader(new Uint8Array([0xff, 0xfb]), 0), null, "two bytes are not a header");
  h.eq(readFrameHeader(mpegFrame(), -4), null, "a negative offset reads nothing");
}

/* ------------------------------------- 2. finding the first real frame */

{
  const stream = join8(mpegFrame(), mpegFrame(), mpegFrame());
  h.eq(findFrameOffset(stream, 0), 0, "a stream that starts with a frame starts at zero");

  // 0xFF 0xFB inside audio data is common. A header is only believed when the
  // frame it describes is followed by another frame.
  const decoy = join8(
    new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x11, 0x22]),
    mpegFrame(),
    mpegFrame()
  );
  h.eq(findFrameOffset(decoy, 0), 6, "a false sync is skipped for the frame that really is one");

  const tagged = join8(id3Tag(2048), mpegFrame(), mpegFrame());
  h.eq(id3v2Length(tagged), 2058, "an ID3v2 tag reports its synchsafe length plus its header");
  h.eq(findFrameOffset(tagged, id3v2Length(tagged)), 2058, "audio starts where the tag ends");

  const footered = id3Tag(100);
  footered[5] = 0x10; // footer-present flag
  h.eq(id3v2Length(footered), 120, "a tag with a footer is ten bytes longer");

  h.eq(id3v2Length(mpegFrame()), 0, "a file with no tag reports no tag");
  h.eq(findFrameOffset(new Uint8Array(4096), 0), -1, "silence with no sync word finds nothing");
}

/* ----------------------------------------------- 3. the VBR header */

{
  const stream = join8(xingFrame(17200, 11_700_000), mpegFrame(), mpegFrame());
  const first = readFrameHeader(stream, 0);
  const vbr = first ? readVbrHeader(stream, first) : null;
  h.eq(vbr?.kind, "Xing", "the Xing marker is found after the side info");
  h.eq(vbr?.frames, 17200, "the frame count is read");
  h.eq(vbr?.bytes, 11_700_000, "the byte count is read");

  h.near(mp3Duration(stream), (17200 * 1152) / 44100, 0.01, "the VBR header gives the whole duration");
  h.near(
    mp3Duration(join8(mpegFrame(), mpegFrame(), mpegFrame())),
    (3 * 1152) / 44100,
    1e-9,
    "with no VBR header the frames are counted instead"
  );
}

/* ------------------------------------------- 4. planning the request */

{
  // A 731-second VBR bed: 11.7 MB of audio, so about 16 kB a second.
  const frames = Math.round((731 * 44100) / 1152);
  const head = join8(xingFrame(frames, 11_700_000), ...Array.from({ length: 40 }, () => mpegFrame()));
  const plan = planMp3Prefix(head, 90, 11_778_042);

  h.eq(plan.basis, "vbr-header", "the real average comes from the VBR header, not from one frame");
  h.ok(plan.byteLength < 2_000_000, "ninety seconds of an 11.7 MB bed is under 2 MB");
  h.ok(plan.byteLength > 1_400_000, "and is not so small it would fall short of the window");
  h.eq(plan.whole, false, "a prefix of a long file is not the whole file");
  h.ok(
    plan.byteLength / 11_778_042 < 0.2,
    "the request is a fifth of the file at most — the point of the exercise"
  );

  // The first frame of a VBR file is usually its quietest: 64 kbps here
  // against a 128 kbps average. Planning from it would fetch half of what
  // the window needs.
  const fromFrameAlone = ((64 * 1000) / 8) * 92;
  h.ok(plan.byteLength > fromFrameAlone, "the plan beats what the first frame alone would suggest");
}

{
  // Constant bitrate, no VBR header: the first frame is the whole story.
  const head = join8(...Array.from({ length: 60 }, () => mpegFrame({ bitrateKbps: 320 })));
  const plan = planMp3Prefix(head, 60, 8_000_000);
  h.eq(plan.basis, "frame", "a CBR file is planned from its frame rate");
  h.near(plan.bytesPerSecond, 40000, 1, "320 kbps is 40 kB a second");
  h.ok(plan.byteLength >= 40000 * 62, "the plan covers the window plus its tail");
  h.ok(plan.byteLength < 8_000_000, "and still less than the file");
}

{
  // A tag bigger than the head: no frame can be read yet, so the plan is the
  // cautious one rather than a wrong one. (One bundled track carries 140 kB
  // of artwork in front of its first frame.)
  const head = join8(id3Tag(400_000).subarray(0, MP3_HEAD_BYTES));
  const plan = planMp3Prefix(head, 90, 8_486_879);
  h.eq(plan.blindTag, true, "a head that stops inside the tag is reported as such");
  h.eq(plan.basis, "unknown", "and the estimate does not pretend to have read a frame");
  h.ok(plan.byteLength > 400_000, "the plan at least clears the tag");
  h.ok(plan.byteLength < 8_486_879, "and is still a prefix, not the whole file");
}

{
  // A track shorter than the window: ask for all of it, in one request.
  const frames = Math.round((20 * 44100) / 1152);
  const head = join8(xingFrame(frames, 320_000), ...Array.from({ length: 10 }, () => mpegFrame()));
  const plan = planMp3Prefix(head, 600, 330_000);
  h.eq(plan.whole, true, "a short track is taken whole");
  h.eq(plan.byteLength, 330_000, "and the request is exactly the file");
}

{
  const plan = planMp3Prefix(new Uint8Array([0x4f, 0x67, 0x67, 0x53]), 30, 20_000);
  h.ok(plan.byteLength <= 20_000, "a file that is not MPEG is never over-requested");
  h.eq(plan.basis, "unknown", "and no bitrate is invented for it");
}

/* --------------------------------------------------- 5. cutting */

{
  const frameCount = 200;
  const stream = join8(...Array.from({ length: frameCount }, () => mpegFrame()));
  const oneFrame = 1152 / 44100;

  const cut = cutMp3Prefix(stream, 1);
  h.ok(cut !== null, "a plain stream can be cut");
  h.eq(cut!.bytes.length % 417, 0, "the cut lands exactly on a frame boundary");
  h.near(cut!.seconds, cut!.frames * oneFrame, 1e-9, "the reported seconds are the frames kept");
  h.ok(cut!.seconds >= 1 + MP3_PREFIX_TAIL_SECONDS, "the cut covers the window and its tail");
  h.ok(cut!.seconds < 1 + MP3_PREFIX_TAIL_SECONDS + oneFrame, "and overruns by less than one frame");
  h.eq(cut!.whole, false, "a cut that dropped frames does not claim to be whole");

  // Re-reading the cut stream has to find the same frames and nothing else:
  // a decoder walks it the same way.
  h.near(mp3Duration(cut!.bytes), cut!.seconds, 1e-9, "the cut stream re-reads as its own length");
  h.eq(findFrameOffset(cut!.bytes, 0), 0, "and still begins with a frame");

  const everything = cutMp3Prefix(stream, 3600);
  h.eq(everything!.whole, true, "asking for more than there is returns the whole stream");
  h.eq(everything!.bytes.length, stream.length, "with no bytes lost");
  h.eq(everything!.frames, frameCount, "and every frame counted");
}

{
  // The ragged end a Range request leaves: the last frame arrives half
  // written. It must be dropped, not handed to the decoder.
  const stream = join8(...Array.from({ length: 50 }, () => mpegFrame()));
  const ragged = stream.subarray(0, 417 * 49 + 200);
  const cut = cutMp3Prefix(ragged, 10);
  h.eq(cut!.frames, 49, "the half-written trailing frame is dropped");
  h.eq(cut!.bytes.length, 417 * 49, "so the stream ends where its last whole frame does");
}

{
  // A tag and a VBR header in front, as every real file has.
  const totalFrames = 17200;
  const stream = join8(
    id3Tag(300),
    xingFrame(totalFrames, 11_700_000),
    ...Array.from({ length: 400 }, () => mpegFrame())
  );
  const cut = cutMp3Prefix(stream, 2);
  h.ok(cut !== null, "a tagged VBR stream can be cut");
  h.eq(id3v2Length(cut!.bytes), 310, "the tag is carried over untouched");

  const first = readFrameHeader(cut!.bytes, 310);
  const vbr = first ? readVbrHeader(cut!.bytes, first) : null;
  h.ok(vbr !== null, "the VBR header survives the cut");
  h.eq(vbr?.frames, cut!.frames - 1, "and is rewritten to the frames that are really there");
  h.eq(vbr?.bytes, cut!.bytes.length, "along with the byte total");
  h.ok(
    (vbr?.frames ?? 0) < totalFrames,
    "the stale count is gone — a decoder that believed it would report minutes of silence"
  );
  h.near(mp3Duration(cut!.bytes), cut!.seconds, 0.03, "so the cut file's own duration is honest");
}

{
  h.eq(cutMp3Prefix(new Uint8Array(2048), 10), null, "bytes with no frames in them cut to nothing");
  h.eq(
    cutMp3Prefix(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0]), 10),
    null,
    "an OGG file is refused rather than mangled"
  );
  h.eq(looksLikeMpeg(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0])), false, "a WAV is not MPEG");
  h.eq(looksLikeMpeg(join8(id3Tag(64), mpegFrame())), true, "a tagged MP3 is MPEG");
  h.eq(looksLikeMpeg(join8(mpegFrame(), mpegFrame())), true, "an untagged MP3 is MPEG");
}

/* ------------------------------------- 6. the files that ship with the app */

interface RealFile {
  path: string;
  /** Catalogue length in seconds, as shown in the music library. */
  catalogue: number;
}

const realFiles: RealFile[] = [
  { path: "public/sounds/yt_dark_glow_mountains.mp3", catalogue: 790 },
  { path: "public/sounds/yt_undercover_vampire.mp3", catalogue: 731 },
  { path: "public/sounds/yt_divider.mp3", catalogue: 202 },
  { path: "public/sounds/real_gentle_reflection.mp3", catalogue: 209 },
];

let examined = 0;
for (const file of realFiles) {
  const full = join(repoRoot, file.path);
  if (!existsSync(full)) continue;
  examined++;

  const bytes = new Uint8Array(readFileSync(full));
  const name = file.path.split("/").pop();

  h.eq(looksLikeMpeg(bytes), true, `${name} is read as an MPEG stream`);
  h.near(mp3Duration(bytes), file.catalogue, 1.5, `${name} is as long as the library says it is`);

  // What the loader actually does: one head request, then a planned prefix.
  const head = bytes.subarray(0, MP3_HEAD_BYTES);
  const plan = planMp3Prefix(head, 90, bytes.length);
  const prefix = bytes.subarray(0, plan.byteLength);
  const cut = cutMp3Prefix(prefix, 90);

  h.ok(cut !== null, `${name} cuts to a 90-second prefix`);
  h.ok(
    cut!.seconds >= 90 + MP3_PREFIX_TAIL_SECONDS,
    `${name}: the prefix covers the whole 90-second window`
  );
  h.ok(cut!.seconds < 95, `${name}: and does not drag a minute of unused audio along`);
  h.ok(
    cut!.bytes.length < bytes.length / 2,
    `${name}: the prefix is less than half the file (${(cut!.bytes.length / 1e6).toFixed(2)} MB of ${(bytes.length / 1e6).toFixed(2)} MB)`
  );
  h.near(
    mp3Duration(cut!.bytes),
    cut!.seconds,
    0.05,
    `${name}: the cut stream reports its own real length`
  );
  h.eq(findFrameOffset(cut!.bytes, id3v2Length(cut!.bytes)), id3v2Length(cut!.bytes), `${name}: the cut begins on a frame`);
}

h.ok(examined >= 3, `${examined} shipped music files were cut for real, not just synthetic ones`);

{
  // The headline number, on the file it was measured from: the bed that used
  // to cost 11 MB before a 90-second video could start.
  const full = join(repoRoot, "public/sounds/yt_dark_glow_mountains.mp3");
  if (existsSync(full)) {
    const bytes = new Uint8Array(readFileSync(full));
    const plan = planMp3Prefix(bytes.subarray(0, MP3_HEAD_BYTES), 90, bytes.length);
    h.ok(bytes.length > 11_000_000, "the bed really is over 11 MB");
    h.ok(plan.byteLength < 1_800_000, "and a 90-second window now fetches under 1.8 MB of it");
  }

  const longest = join(repoRoot, "public/sounds/yt_undercover_vampire.mp3");
  if (existsSync(longest)) {
    const bytes = new Uint8Array(readFileSync(longest));
    h.ok(bytes.length > 14_000_000, "the longest bed is the 15 MB one");
    h.ok(mp3Duration(bytes) > 12 * 60, "and runs over twelve minutes");
    const plan = planMp3Prefix(bytes.subarray(0, MP3_HEAD_BYTES), 45, bytes.length);
    h.ok(plan.byteLength < 1_500_000, "a 45-second video fetches a megabyte and a half of it at most");
  }
}

h.done("mp3-prefix");
