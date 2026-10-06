/**
 * Cutting an MPEG audio stream on a frame boundary.
 *
 * The music library ships beds that run for minutes — the longest is a little
 * over thirteen, and weighs fifteen megabytes. A ninety-second video that puts
 * one under its narration used to download and decode every byte of it before
 * the first frame could play, because `decodeAudioData()` takes a whole file
 * and gives back a whole AudioBuffer. Eleven megabytes fetched to use one and
 * a half of them, with the user watching a spinner for the other nine and a
 * half.
 *
 * An MPEG layer III stream makes this avoidable. It is not a container with an
 * index: it is a plain sequence of self-contained frames, each one announcing
 * its own bitrate, sample rate and length in its first four bytes. Stop
 * reading at the end of any frame and what you have left is still a valid
 * stream — a shorter piece of the same music. So the loader asks the server
 * for the first N bytes with a Range request, and this module decides what N
 * should be and where exactly to cut so the decoder is never handed half a
 * frame.
 *
 * Everything here is pure byte arithmetic: no DOM, no fetch, no audio context.
 * That is deliberate — the sums are the part worth testing, and they are
 * tested against the real files in `public/sounds` as well as synthetic ones.
 */

/* ------------------------------------------------------------------ *
 * Frame headers
 * ------------------------------------------------------------------ */

/** Bitrates in kbps by (version group, layer), index 0 = "free", 15 = invalid. */
const BITRATES_V1_L1 = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0];
const BITRATES_V1_L2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0];
const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_V2_L1 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0];
const BITRATES_V2_L23 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

const SAMPLE_RATES_V1 = [44100, 48000, 32000];
const SAMPLE_RATES_V2 = [22050, 24000, 16000];
const SAMPLE_RATES_V25 = [11025, 12000, 8000];

export type MpegVersion = 1 | 2 | 2.5;
export type MpegLayer = 1 | 2 | 3;

export interface MpegFrame {
  /** Byte offset of the frame's first sync byte. */
  offset: number;
  /** Whole length of the frame, header included. */
  byteLength: number;
  sampleRate: number;
  samplesPerFrame: number;
  bitrateKbps: number;
  channels: 1 | 2;
  version: MpegVersion;
  layer: MpegLayer;
  /** Playing time of this single frame. */
  seconds: number;
}

/**
 * Reads the four header bytes at `offset`.
 *
 * Returns null for anything that is not a plausible frame: a false sync (the
 * pattern 11 bits of 1s turns up inside audio data often enough to matter),
 * a reserved version or layer, the "free" or invalid bitrate index, or the
 * reserved sample-rate index.
 */
export function readFrameHeader(bytes: Uint8Array, offset: number): MpegFrame | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return null;

  const versionBits = (bytes[offset + 1] >> 3) & 0x03;
  const layerBits = (bytes[offset + 1] >> 1) & 0x03;
  if (versionBits === 1 || layerBits === 0) return null; // reserved

  const version: MpegVersion = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const layer: MpegLayer = layerBits === 3 ? 1 : layerBits === 2 ? 2 : 3;

  const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f;
  const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null;

  const table =
    version === 1
      ? layer === 1
        ? BITRATES_V1_L1
        : layer === 2
          ? BITRATES_V1_L2
          : BITRATES_V1_L3
      : layer === 1
        ? BITRATES_V2_L1
        : BITRATES_V2_L23;
  const bitrateKbps = table[bitrateIndex];
  if (!bitrateKbps) return null;

  const rates = version === 1 ? SAMPLE_RATES_V1 : version === 2 ? SAMPLE_RATES_V2 : SAMPLE_RATES_V25;
  const sampleRate = rates[sampleRateIndex];
  if (!sampleRate) return null;

  const padding = (bytes[offset + 2] >> 1) & 0x01;
  const channelMode = (bytes[offset + 3] >> 6) & 0x03;
  const channels: 1 | 2 = channelMode === 3 ? 1 : 2;

  // Layer I counts in 4-byte slots; layers II and III in bytes. Layer III on
  // the half-rate versions (MPEG-2 / 2.5) carries half as many samples per
  // frame, so its divisor halves with it.
  const samplesPerFrame = layer === 1 ? 384 : layer === 2 ? 1152 : version === 1 ? 1152 : 576;
  const bitsPerSecond = bitrateKbps * 1000;
  const byteLength =
    layer === 1
      ? (Math.floor((12 * bitsPerSecond) / sampleRate) + padding) * 4
      : Math.floor((samplesPerFrame / 8) * (bitsPerSecond / sampleRate)) + padding;
  if (!(byteLength > 4)) return null;

  return {
    offset,
    byteLength,
    sampleRate,
    samplesPerFrame,
    bitrateKbps,
    channels,
    version,
    layer,
    seconds: samplesPerFrame / sampleRate,
  };
}

/**
 * Length of a leading ID3v2 tag, or 0 when there is none.
 *
 * Tags are not always small: one bundled track carries 140 KB of embedded
 * artwork in front of its first audio frame, which is more than a modest
 * head request would even cover.
 */
export function id3v2Length(bytes: Uint8Array): number {
  if (bytes.length < 10) return 0;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0; // "ID3"
  const size =
    ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
  const footer = (bytes[5] & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

/**
 * First byte offset at or after `from` that begins a real frame.
 *
 * "Real" means the header parses *and* the next frame lands exactly where
 * this one says it will — the check that separates a true sync from the
 * 0xFF 0xFx byte pair that turns up inside compressed audio.
 */
export function findFrameOffset(bytes: Uint8Array, from = 0, searchLimit = 0x20000): number {
  const start = Math.max(0, from);
  const end = Math.min(bytes.length - 4, start + searchLimit);
  for (let i = start; i <= end; i++) {
    if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) continue;
    const frame = readFrameHeader(bytes, i);
    if (!frame) continue;
    const next = i + frame.byteLength;
    // The last frame of a file has nothing after it to confirm against, so a
    // header that reaches the end of the buffer is accepted on its own.
    if (next + 4 > bytes.length) return i;
    if (readFrameHeader(bytes, next)) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ *
 * The VBR header (Xing / Info / VBRI)
 * ------------------------------------------------------------------ */

export interface VbrHeader {
  /** Offset of the "Xing" / "Info" / "VBRI" marker. */
  offset: number;
  kind: "Xing" | "Info" | "VBRI";
  /** Audio frames in the whole file, excluding this header frame. 0 if absent. */
  frames: number;
  /** Bytes of audio data in the whole file. 0 if absent. */
  bytes: number;
  /** Offset of the 4-byte frame count field, or -1 when the file has none. */
  framesField: number;
  /** Offset of the 4-byte byte count field, or -1 when the file has none. */
  bytesField: number;
}

function readU32(bytes: Uint8Array, at: number): number {
  if (at + 4 > bytes.length) return 0;
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function writeU32(bytes: Uint8Array, at: number, value: number) {
  if (at + 4 > bytes.length) return;
  const v = Math.max(0, Math.min(0xffffffff, Math.round(value)));
  bytes[at] = (v >>> 24) & 0xff;
  bytes[at + 1] = (v >>> 16) & 0xff;
  bytes[at + 2] = (v >>> 8) & 0xff;
  bytes[at + 3] = v & 0xff;
}

function matches(bytes: Uint8Array, at: number, text: string): boolean {
  if (at < 0 || at + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[at + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Reads the VBR header an encoder writes into the first (silent) frame.
 *
 * It is what makes a variable-bitrate file's real average knowable without
 * reading the file: LAME records the total frame count and byte count there.
 * Nine of the ten bundled beds are VBR, so this is the difference between
 * asking for a sensible prefix and guessing from one frame that happens to be
 * 64 kbps because it is silence.
 */
export function readVbrHeader(bytes: Uint8Array, frame: MpegFrame): VbrHeader | null {
  const sideInfo = frame.version === 1 ? (frame.channels === 1 ? 17 : 32) : frame.channels === 1 ? 9 : 17;
  const xingAt = frame.offset + 4 + sideInfo;
  const kind = matches(bytes, xingAt, "Xing") ? "Xing" : matches(bytes, xingAt, "Info") ? "Info" : null;

  if (kind) {
    const flags = readU32(bytes, xingAt + 4);
    let cursor = xingAt + 8;
    let frames = 0;
    let byteCount = 0;
    let framesField = -1;
    let bytesField = -1;
    if (flags & 0x0001) {
      framesField = cursor;
      frames = readU32(bytes, cursor);
      cursor += 4;
    }
    if (flags & 0x0002) {
      bytesField = cursor;
      byteCount = readU32(bytes, cursor);
      cursor += 4;
    }
    return { offset: xingAt, kind, frames, bytes: byteCount, framesField, bytesField };
  }

  // Fraunhofer's variant sits at a fixed offset instead of after the side info.
  const vbriAt = frame.offset + 4 + 32;
  if (matches(bytes, vbriAt, "VBRI")) {
    return {
      offset: vbriAt,
      kind: "VBRI",
      bytes: readU32(bytes, vbriAt + 10),
      frames: readU32(bytes, vbriAt + 14),
      bytesField: vbriAt + 10,
      framesField: vbriAt + 14,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Planning the request
 * ------------------------------------------------------------------ */

/** Head request size: enough for a tag, the VBR frame and a few seconds of audio. */
export const MP3_HEAD_BYTES = 64 * 1024;

/**
 * Seconds of slack added to every prefix.
 *
 * A bed is cut to the stretch the timeline plays. Landing the cut exactly on
 * the last sample would leave nothing for a crossfade or for a loop point
 * that arrives a hair early, so every prefix carries a couple of seconds more
 * than the timeline asks for.
 */
export const MP3_PREFIX_TAIL_SECONDS = 2;

/** Used when the stream cannot be read yet — the highest MPEG-1 layer III rate. */
const FALLBACK_BYTES_PER_SECOND = (320 * 1000) / 8;

export interface Mp3PrefixPlan {
  /** Bytes to ask for, counted from the start of the file. */
  byteLength: number;
  /** The average the estimate is based on. */
  bytesPerSecond: number;
  /** Where that average came from. */
  basis: "vbr-header" | "frame" | "unknown";
  /** True when the plan covers the whole file, so no cut is needed. */
  whole: boolean;
  /**
   * Set when the head handed in stops inside a leading ID3 tag, so no frame
   * could be read. The plan is still usable — it is simply the cautious one.
   */
  blindTag: boolean;
}

/**
 * How many bytes of a file are worth fetching to hear `seconds` of it.
 *
 * `head` is the first chunk of the file (any size; `MP3_HEAD_BYTES` is the
 * size the loader uses). `totalBytes` is the file's real length when the
 * server reported it, which caps the answer and lets the plan say "this is
 * the whole thing" instead of asking for a range nobody needs.
 */
export function planMp3Prefix(head: Uint8Array, seconds: number, totalBytes = 0): Mp3PrefixPlan {
  const wanted = Math.max(0, seconds) + MP3_PREFIX_TAIL_SECONDS;
  const tag = id3v2Length(head);
  const cap = totalBytes > 0 ? totalBytes : Number.POSITIVE_INFINITY;

  const finish = (bytesPerSecond: number, basis: Mp3PrefixPlan["basis"], blindTag: boolean): Mp3PrefixPlan => {
    // 12% over the measured average absorbs the loud passages of a VBR file,
    // where the first minute can sit well above the average for the whole.
    const estimate = tag + Math.ceil(bytesPerSecond * wanted * 1.12) + 16 * 1024;
    // Never below one head request (a second round trip for a few kilobytes
    // is not worth it) and never beyond the end of the file.
    const byteLength = Math.min(cap, Math.max(MP3_HEAD_BYTES, estimate));
    return {
      byteLength,
      bytesPerSecond,
      basis,
      whole: totalBytes > 0 && byteLength >= totalBytes,
      blindTag,
    };
  };

  // A tag bigger than the head we hold: there is no frame to read yet, so
  // plan from the worst case rather than pretend to know.
  if (tag > 0 && tag + 512 > head.length) return finish(FALLBACK_BYTES_PER_SECOND, "unknown", true);

  const frameAt = findFrameOffset(head, tag);
  const frame = frameAt >= 0 ? readFrameHeader(head, frameAt) : null;
  if (!frame) return finish(FALLBACK_BYTES_PER_SECOND, "unknown", false);

  const vbr = readVbrHeader(head, frame);
  if (vbr && vbr.frames > 0 && vbr.bytes > 0) {
    const streamSeconds = (vbr.frames * frame.samplesPerFrame) / frame.sampleRate;
    if (streamSeconds > 0.5) {
      // The whole file is shorter than the stretch we need: take all of it and
      // skip the second request entirely.
      if (streamSeconds <= wanted && totalBytes > 0) {
        return {
          byteLength: totalBytes,
          bytesPerSecond: vbr.bytes / streamSeconds,
          basis: "vbr-header",
          whole: true,
          blindTag: false,
        };
      }
      return finish(vbr.bytes / streamSeconds, "vbr-header", false);
    }
  }

  // No VBR header: the file is almost certainly constant bitrate, and the
  // first frame's rate is the file's rate.
  return finish((frame.bitrateKbps * 1000) / 8, "frame", false);
}

/* ------------------------------------------------------------------ *
 * Cutting
 * ------------------------------------------------------------------ */

export interface Mp3Cut {
  /** Leading tag (kept as-is) plus whole frames only — a playable stream. */
  bytes: Uint8Array;
  /** Playing time of the frames kept. */
  seconds: number;
  frames: number;
  /** True when nothing was dropped: the input was already short enough. */
  whole: boolean;
}

/**
 * Trims a downloaded prefix to whole frames covering `seconds` of audio.
 *
 * Two jobs, both of which have to happen before the bytes reach a decoder:
 *
 * 1. **Never hand over half a frame.** A Range request stops at the byte it
 *    was told to; that byte is almost always in the middle of a frame.
 *    Browsers differ on what they do with the remainder — some ignore it,
 *    some reject the whole buffer — so the ragged end is removed here.
 *
 * 2. **Tell the truth in the VBR header.** The first frame of a VBR file
 *    announces how many frames the file has. Left alone in a cut stream that
 *    claim is a lie, and a decoder that believes it reports a buffer minutes
 *    longer than the audio it actually has — silence a looping bed would
 *    dutifully play. The count and byte total are rewritten to match what is
 *    really there.
 *
 * Returns null when the bytes are not an MPEG stream at all (a WAV or OGG
 * sound effect, an HTML error page); the caller should fetch the whole file.
 */
export function cutMp3Prefix(source: Uint8Array, seconds: number): Mp3Cut | null {
  const tag = id3v2Length(source);
  const firstOffset = findFrameOffset(source, tag);
  if (firstOffset < 0) return null;

  const first = readFrameHeader(source, firstOffset);
  if (!first) return null;

  const wanted = Math.max(0, seconds) + MP3_PREFIX_TAIL_SECONDS;
  let cursor = firstOffset;
  let played = 0;
  let frames = 0;
  let end = firstOffset;

  while (cursor + 4 <= source.length) {
    const frame = readFrameHeader(source, cursor);
    if (!frame) {
      // Junk between frames (an APE tag, a stray byte) — try to resync once,
      // and stop for good if there is nothing recognisable left.
      const resync = findFrameOffset(source, cursor + 1, 8192);
      if (resync < 0) break;
      cursor = resync;
      continue;
    }
    if (cursor + frame.byteLength > source.length) break; // incomplete trailing frame
    cursor += frame.byteLength;
    end = cursor;
    frames++;
    played += frame.seconds;
    if (played >= wanted) break;
  }

  if (frames === 0) return null;

  const whole = end >= source.length;
  const bytes = whole ? source.slice() : source.slice(0, end);

  const vbr = readVbrHeader(bytes, first);
  if (vbr && !whole) {
    // LAME counts every frame except the header frame itself.
    if (vbr.framesField >= 0 && vbr.frames > 0) writeU32(bytes, vbr.framesField, Math.max(1, frames - 1));
    if (vbr.bytesField >= 0 && vbr.bytes > 0) writeU32(bytes, vbr.bytesField, bytes.length);
  }

  return { bytes, seconds: played, frames, whole };
}

/**
 * Playing time of a stream, read from its VBR header when it has one and
 * counted frame by frame when it does not. Used to tell a prefix that covers
 * the timeline from one that fell short.
 */
export function mp3Duration(bytes: Uint8Array): number {
  const tag = id3v2Length(bytes);
  const firstOffset = findFrameOffset(bytes, tag);
  if (firstOffset < 0) return 0;
  const first = readFrameHeader(bytes, firstOffset);
  if (!first) return 0;

  const vbr = readVbrHeader(bytes, first);
  if (vbr && vbr.frames > 0) return (vbr.frames * first.samplesPerFrame) / first.sampleRate;

  let cursor = firstOffset;
  let played = 0;
  while (cursor + 4 <= bytes.length) {
    const frame = readFrameHeader(bytes, cursor);
    if (!frame) break;
    if (cursor + frame.byteLength > bytes.length) break;
    cursor += frame.byteLength;
    played += frame.seconds;
  }
  return played;
}

/** True when these bytes begin an MPEG stream (tag or sync), not WAV/OGG/HTML. */
export function looksLikeMpeg(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  if (id3v2Length(bytes) > 0) return true;
  return findFrameOffset(bytes, 0, 8192) >= 0;
}
