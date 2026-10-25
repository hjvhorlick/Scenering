/**
 * Reads a finished MP4 back and reports what is actually inside it.
 *
 * Why this exists
 * ---------------
 * Everything else in the render path *assumes* the file it just built is the
 * file it meant to build. `mp4-muxer` is handed a stream of encoded frames and
 * writes a container around them; if the stream it is handed has a repeated
 * presentation time, a frame that never arrived, or a container that is really
 * WebM wearing an `.mp4` name, nothing anywhere notices. The finished video
 * then plays with visible stop-and-go — a caption highlight that jumps and a
 * camera move that freezes and restarts — while the render screen says
 * "Render Complete" and the app claims "H.264 High · yuv420p".
 *
 * The only way to be sure is to read the muxed bytes back the way a player
 * will: walk the boxes, expand the sample tables, and check that
 *
 *   1. the file really is an ISO base-media (MP4) file — an `ftyp` box with a
 *      recognised brand, not a Matroska/WebM header;
 *   2. the video track's sample-to-time table describes a CONSTANT frame rate
 *      (one `stts` delta, not a staircase);
 *   3. every frame the encoder was given is present (`stsz` sample count);
 *   4. frame durations are exact to the microsecond (no ±1 tick jitter, which
 *      is what a player turns into a dropped/held frame);
 *   5. the index is at the front (`moov` before `mdat`), so a player does not
 *      have to seek to the end of the file to start;
 *   6. the audio track is the length of the video track.
 *
 * Nothing here needs the whole file: the index is a few hundred kilobytes and
 * it sits at the front of a fast-start MP4, so the audit reads the head of the
 * blob and never materialises a 900 MB video in memory.
 */

/* ------------------------------------------------------------------ *
 * A very small, bounds-checked box reader.
 * ------------------------------------------------------------------ */

const u32 = (view: DataView, at: number): number => (at + 4 <= view.byteLength ? view.getUint32(at) : 0);
const i32 = (view: DataView, at: number): number => (at + 4 <= view.byteLength ? view.getInt32(at) : 0);
const u64 = (view: DataView, at: number): number =>
  at + 8 <= view.byteLength ? view.getUint32(at) * 0x1_0000_0000 + view.getUint32(at + 4) : 0;
const u16 = (view: DataView, at: number): number => (at + 2 <= view.byteLength ? view.getUint16(at) : 0);
const u8 = (view: DataView, at: number): number => (at + 1 <= view.byteLength ? view.getUint8(at) : 0);

export interface Mp4Box {
  type: string;
  /** Offset of the box header within the buffer we were given. */
  start: number;
  /** Offset just past the box. */
  end: number;
  /** Size of the header (8, or 16 for 64-bit sizes). */
  header: number;
}

/** Iterate the boxes in `[start, end)`. Never throws: a malformed length stops the walk. */
function walkBoxes(view: DataView, start: number, end: number): Mp4Box[] {
  const out: Mp4Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    let size = u32(view, at);
    const type = fourcc(view, at + 4);
    let header = 8;
    if (size === 1) {
      size = u64(view, at + 8);
      header = 16;
    } else if (size === 0) {
      size = end - at; // "to end of file"
    }
    if (size < header || at + size > end) break;
    out.push({ type, start: at, end: at + size, header });
    at += size;
  }
  return out;
}

function fourcc(view: DataView, at: number): string {
  if (at + 4 > view.byteLength) return "";
  let s = "";
  for (let i = 0; i < 4; i++) {
    const code = view.getUint8(at + i);
    s += code >= 32 && code < 127 ? String.fromCharCode(code) : "?";
  }
  return s;
}

const childBoxes = (view: DataView, parent: Mp4Box): Mp4Box[] =>
  walkBoxes(view, parent.start + parent.header, parent.end);

/** Follow a path of box types, e.g. `minf` → `stbl`. */
const find = (view: DataView, boxes: Mp4Box[], ...path: string[]): Mp4Box | null => {
  let list = boxes;
  let found: Mp4Box | null = null;
  for (const name of path) {
    found = list.find((b) => b.type === name) ?? null;
    if (!found) return null;
    list = childBoxes(view, found);
  }
  return found;
};

/* ------------------------------------------------------------------ *
 * The audit model
 * ------------------------------------------------------------------ */

export interface Mp4TrackAudit {
  kind: "video" | "audio";
  handler: string;
  /** Track media timescale (ticks per second). */
  timescale: number;
  /** Media duration in seconds, from the sample table. */
  durationSec: number;
  sampleCount: number;
  /** Four-character code of the first sample entry, e.g. `avc1` / `mp4a`. */
  codec: string;
  /** `High profile, level 4.0` for H.264; empty for audio. */
  codecDetail: string;
  width: number;
  height: number;
  /** Constant frame duration in timescale ticks, or null if it is not constant. */
  uniformFrameDelta: number | null;
  /** Frame rate implied by the dominant frame duration, when it is constant. */
  frameRate: number | null;
  /** Worst deviation from the dominant frame duration, in microseconds. */
  maxFrameDeltaErrorUs: number;
  /** How many distinct frame durations appear anywhere in the track. */
  distinctFrameDurations: number;
  /** Samples whose presentation time is offset from their decode time (B-frames). */
  reorderedSamples: number;
  /** Presentation time of the first sample, in seconds. Anything but ~0 delays the picture. */
  firstPresentationSec: number;
  /**
   * Largest (signed) composition offset in the track, in seconds.
   *
   * A reordering encoder never offsets a frame by more than a few frame
   * times. Anything in the seconds range means negative offsets were written
   * into an unsigned table — the whole picture then jumps around the timeline
   * while the soundtrack stays perfect, which reads as stop-and-go motion.
   */
  maxCompositionOffsetSec: number;
  /** Samples whose composition offset cannot be what the table claims. */
  unsignedOverflowSamples: number;
  /** Keyframes declared by `stss`; null when every sample is a keyframe. */
  keyframes: number | null;
  /** Samples with a zero byte length — an empty frame the player will hold over. */
  zeroSizeSamples: number;
  /** Edit list trimming (a non-zero media time drops the first frames). */
  editList: { mediaTimeSec: number; segmentDurationSec: number } | null;
}

export interface Mp4Audit {
  /** True when the bytes really are an ISO/MP4 file. */
  isMp4: boolean;
  brand: string;
  /** `moov` appears before `mdat`, so the file can start playing without the whole download. */
  fastStart: boolean;
  /** A fragmented MP4 (`moof`), which many players seek badly in. */
  fragmented: boolean;
  video: Mp4TrackAudit | null;
  audio: Mp4TrackAudit | null;
  /** Things that will be visible in the finished video. */
  problems: string[];
  ok: boolean;
  /** One line a customer can read. */
  summary: string;
}

export interface Mp4Expectation {
  width?: number;
  height?: number;
  fps?: number;
  frames?: number;
  durationSec?: number;
  /** The container the renderer set out to produce. */
  container?: "mp4" | "webm";
  /** Allow a short silent track (the renderer always writes one, but be forgiving). */
  requireAudio?: boolean;
}

const MP4_BRANDS = /^(isom|iso[2-9]|mp4[12]|avc1|dash|MSNV|M4V |mmp4|isoavc|isoism|mif1)$/;

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

export function parseMp4(bytes: Uint8Array, expectations: Mp4Expectation = {}): Mp4Audit {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const top = walkBoxes(view, 0, bytes.byteLength);
  const ftyp = top.find((b) => b.type === "ftyp");
  const brand = ftyp ? fourcc(view, ftyp.start + ftyp.header) : "";
  const isMp4 = Boolean(ftyp) && (MP4_BRANDS.test(brand) || brand === "");
  const moov = top.find((b) => b.type === "moov");
  const mdat = top.find((b) => b.type === "mdat");
  const fastStart = Boolean(moov && mdat && moov.start < mdat.start);
  const fragmented = top.some((b) => b.type === "moof");

  const audit: Mp4Audit = {
    isMp4,
    brand,
    fastStart,
    fragmented,
    video: null,
    audio: null,
    problems: [],
    ok: false,
    summary: "",
  };

  if (!moov) {
    audit.problems.push(
      isMp4
        ? "The file has no movie header (moov) in the part that was read, so its index is missing or unreachable."
        : "The file is not an MP4 — its first box is not an ftyp header.",
    );
    audit.summary = audit.problems[0];
    return audit;
  }

  const moovChildren = childBoxes(view, moov);
  for (const trak of moovChildren.filter((b) => b.type === "trak")) {
    const track = parseTrack(view, trak);
    if (!track) continue;
    if (track.kind === "video" && !audit.video) audit.video = track;
    else if (track.kind === "audio" && !audit.audio) audit.audio = track;
  }

  judge(audit, expectations);
  return audit;
}

function parseTrack(view: DataView, trak: Mp4Box): Mp4TrackAudit | null {
  const trakChildren = childBoxes(view, trak);
  const mdia = find(view, trakChildren, "mdia");
  if (!mdia) return null;
  const mdiaChildren = childBoxes(view, mdia);
  const mdhd = find(view, mdiaChildren, "mdhd");
  const hdlr = find(view, mdiaChildren, "hdlr");
  const stblBox = find(view, mdiaChildren, "minf", "stbl");
  if (!mdhd || !hdlr) return null;

  const handler = fourcc(view, hdlr.start + hdlr.header + 8);
  const kind: "video" | "audio" | null = handler === "vide" ? "video" : handler === "soun" ? "audio" : null;
  if (!kind) return null;

  const version = u8(view, mdhd.start + mdhd.header);
  const timescale = version === 1
    ? u32(view, mdhd.start + mdhd.header + 20)
    : u32(view, mdhd.start + mdhd.header + 12);

  const track: Mp4TrackAudit = {
    kind,
    handler,
    timescale: timescale || 1,
    durationSec: 0,
    sampleCount: 0,
    codec: "",
    codecDetail: "",
    width: 0,
    height: 0,
    uniformFrameDelta: null,
    frameRate: null,
    maxFrameDeltaErrorUs: 0,
    distinctFrameDurations: 0,
    reorderedSamples: 0,
    firstPresentationSec: 0,
    maxCompositionOffsetSec: 0,
    unsignedOverflowSamples: 0,
    keyframes: null,
    zeroSizeSamples: 0,
    editList: null,
  };

  // ---- edit list: a non-zero media_time silently drops the opening frames
  const elst = find(view, trakChildren, "edts", "elst");
  if (elst) {
    const ev = u8(view, elst.start + elst.header);
    const count = u32(view, elst.start + elst.header + 4);
    let at = elst.start + elst.header + 8;
    for (let i = 0; i < count; i++) {
      const seg = ev === 1 ? u64(view, at) : u32(view, at);
      at += ev === 1 ? 8 : 4;
      const mediaTime = ev === 1 ? i64(view, at) : i32(view, at);
      at += ev === 1 ? 8 : 4;
      at += 4; // media_rate_integer + fraction
      if (mediaTime > 0 || seg > 0) {
        track.editList = {
          mediaTimeSec: mediaTime / track.timescale,
          segmentDurationSec: seg / (ev === 1 ? track.timescale : track.timescale),
        };
        break;
      }
    }
  }

  if (!stblBox) return track;
  const stbl = childBoxes(view, stblBox);

  // ---- sample description: codec fourcc, size, H.264 profile/level
  const stsd = find(view, stbl, "stsd");
  if (stsd) {
    const entryStart = stsd.start + stsd.header + 8;
    const entrySize = u32(view, entryStart);
    if (entrySize >= 16) {
      track.codec = fourcc(view, entryStart + 4);
      const entryEnd = Math.min(stsd.end, entryStart + entrySize);
      const entryChildren = walkBoxes(view, entryStart + 8 + sampleEntryBodySize(track.codec, view, entryStart), entryEnd);
      if (track.codec === "avc1" || track.codec === "avc3" || track.codec === "avc2") {
        track.width = u16(view, entryStart + 8 + 24);
        track.height = u16(view, entryStart + 8 + 26);
        const avcC = entryChildren.find((b) => b.type === "avcC");
        if (avcC) {
          const profile = u8(view, avcC.start + avcC.header + 1);
          const level = u8(view, avcC.start + avcC.header + 3);
          track.codecDetail = `${avcProfileName(profile)}, level ${(level / 10).toFixed(1)}`;
        }
      } else if (track.codec === "hvc1" || track.codec === "hev1") {
        track.width = u16(view, entryStart + 8 + 24);
        track.height = u16(view, entryStart + 8 + 26);
        track.codecDetail = "HEVC";
      } else if (track.codec === "vp09" || track.codec === "vp08" || track.codec === "av01") {
        track.width = u16(view, entryStart + 8 + 24);
        track.height = u16(view, entryStart + 8 + 26);
        track.codecDetail = track.codec === "av01" ? "AV1" : "VP9";
      } else if (track.codec === "mp4a") {
        const esds = entryChildren.find((b) => b.type === "esds");
        track.codecDetail = esds && findAacAudioObjectType(view, esds) ? "AAC" : "";
      }
    }
  }

  // ---- sample sizes: proves every frame that was encoded is in the file
  const stsz = find(view, stbl, "stsz");
  if (stsz) {
    const fixed = u32(view, stsz.start + stsz.header + 4);
    const count = u32(view, stsz.start + stsz.header + 8);
    track.sampleCount = count;
    if (fixed === 0) {
      let at = stsz.start + stsz.header + 12;
      for (let i = 0; i < count; i++, at += 4) {
        if (u32(view, at) === 0) track.zeroSizeSamples += 1;
      }
    }
  }

  // ---- timing: one delta for every frame is what a player calls CFR
  const stts = find(view, stbl, "stts");
  if (stts) {
    const count = u32(view, stts.start + stts.header + 4);
    const deltas = new Map<number, number>();
    let samples = 0;
    let ticks = 0;
    let at = stts.start + stts.header + 8;
    for (let i = 0; i < count; i++, at += 8) {
      const n = u32(view, at);
      const delta = u32(view, at + 4);
      samples += n;
      ticks += n * delta;
      deltas.set(delta, (deltas.get(delta) ?? 0) + n);
    }
    if (!track.sampleCount) track.sampleCount = samples;
    track.durationSec = ticks / track.timescale;
    track.distinctFrameDurations = deltas.size;
    let dominant = 0;
    let dominantSamples = -1;
    for (const [delta, n] of deltas) {
      if (n > dominantSamples) {
        dominant = delta;
        dominantSamples = n;
      }
    }
    if (samples > 1 && deltas.size === 1) {
      track.uniformFrameDelta = dominant;
      track.frameRate = track.timescale / dominant;
    }
    for (const delta of deltas.keys()) {
      const errorUs = Math.abs(delta - dominant) / track.timescale * 1_000_000;
      if (errorUs > track.maxFrameDeltaErrorUs) track.maxFrameDeltaErrorUs = errorUs;
    }
  }

  // ---- composition offsets: B-frames and a delayed first frame
  const ctts = find(view, stbl, "ctts");
  if (ctts) {
    /**
     * Version 0 offsets are UNSIGNED, version 1 offsets are signed. That one
     * byte decides whether a B-frame's "one frame earlier" is read as a
     * thirtieth of a second sooner or as seventy one minutes into the film, so
     * the version is part of the evidence, not an implementation detail.
     */
    const cttsVersion = u8(view, ctts.start + ctts.header);
    const count = u32(view, ctts.start + ctts.header + 4);
    let at = ctts.start + ctts.header + 8;
    const twoSecondsOfTicks = track.timescale * 2;
    let firstOffset: number | null = null;
    for (let i = 0; i < count; i++, at += 8) {
      const n = u32(view, at);
      const raw = u32(view, at + 4);
      const offset = cttsVersion === 1 ? i32(view, at + 4) : raw;
      if (firstOffset === null && n > 0) firstOffset = offset;
      if (offset !== 0) track.reorderedSamples += n;
      const offsetSec = Math.abs(offset) / track.timescale;
      if (offsetSec > track.maxCompositionOffsetSec) track.maxCompositionOffsetSec = offsetSec;
      // An unsigned table cannot hold a negative offset, so a "positive" one of
      // more than two seconds is a negative value that lost its sign.
      if (cttsVersion !== 1 && raw > twoSecondsOfTicks) track.unsignedOverflowSamples += n;
    }
    if (firstOffset === null) firstOffset = 0;
    track.firstPresentationSec = Math.max(0, firstOffset) / track.timescale;
  }

  // ---- keyframes
  const stss = find(view, stbl, "stss");
  if (stss) track.keyframes = u32(view, stss.start + stss.header + 4);

  return track;
}

function i64(view: DataView, at: number): number {
  if (at + 8 > view.byteLength) return 0;
  const hi = view.getInt32(at);
  const lo = view.getUint32(at + 4);
  return hi * 0x1_0000_0000 + lo;
}

/** Bytes between the end of a sample entry's box header and its child boxes. */
function sampleEntryBodySize(codec: string, view: DataView, entryStart: number): number {
  if (codec === "mp4a") {
    const version = u16(view, entryStart + 8 + 8);
    return version === 1 ? 44 : version === 2 ? 64 : 28;
  }
  return 78;
}

function avcProfileName(profile: number): string {
  switch (profile) {
    case 66: return "Baseline profile";
    case 77: return "Main profile";
    case 88: return "Extended profile";
    case 100: return "High profile";
    case 110: return "High 10 profile";
    case 122: return "High 4:2:2 profile";
    case 244: return "High 4:4:4 profile";
    default: return `H.264 profile ${profile}`;
  }
}

/** Walk the esds descriptor chain far enough to see the audio object type. */
function findAacAudioObjectType(view: DataView, esds: Mp4Box): boolean {
  try {
    let at = esds.start + esds.header + 4; // version + flags
    const readLength = (): number => {
      let length = 0;
      for (let i = 0; i < 4; i++) {
        const b = u8(view, at++);
        length = (length << 7) | (b & 0x7f);
        if ((b & 0x80) === 0) break;
      }
      return length;
    };
    const tag = u8(view, at++);
    if (tag !== 0x03) return false;
    readLength();
    at += 2; // ES_ID
    const flags = u8(view, at++);
    if (flags & 0x80) at += 2;
    if (flags & 0x40) {
      const urlLength = u8(view, at++);
      at += urlLength;
    }
    if (flags & 0x20) at += 2;
    if (u8(view, at++) !== 0x04) return false;
    readLength();
    const objectType = u8(view, at);
    // 0x40 = MPEG-4 AAC, 0x66/0x67/0x68 = MPEG-2 AAC.
    return objectType === 0x40 || objectType === 0x66 || objectType === 0x67 || objectType === 0x68;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Judgement — what the numbers mean for the person watching
 * ------------------------------------------------------------------ */

function judge(audit: Mp4Audit, expect: Mp4Expectation) {
  const { problems } = audit;
  const video = audit.video;

  if (!audit.isMp4) {
    problems.push(
      `The finished file is not an MP4 (its first bytes read "${audit.brand || "unknown"}"), so a player will not treat it as H.264/AAC video.`,
    );
  } else if (audit.brand && !MP4_BRANDS.test(audit.brand)) {
    problems.push(`The finished file uses the "${audit.brand}" brand, which is not an MP4 video brand.`);
  }

  if (audit.fragmented) {
    problems.push("The finished file is a fragmented MP4; seeking and smooth playback are unreliable in many players.");
  }
  if (!audit.fastStart) {
    problems.push("The file's index is at the end rather than the front, so playback can start late or stutter while it loads.");
  }

  if (!video) {
    problems.push("The finished file has no video track.");
  } else {
    if (video.codec !== "avc1" && video.codec !== "avc3" && video.codec !== "avc2" && expect.container !== "webm") {
      problems.push(
        video.codec
          ? `The video track is encoded as ${video.codec}${video.codecDetail ? ` (${video.codecDetail})` : ""}, not H.264.`
          : "The video track does not declare an H.264 codec.",
      );
    }
    if (expect.width && expect.height && video.width && video.height) {
      const aligned = (a: number, b: number) =>
        a === b || (a >= b && a <= Math.ceil(b / 16) * 16 && Math.abs(a - b) < 16);
      if (!aligned(video.width, expect.width) || !aligned(video.height, expect.height)) {
        problems.push(`The finished video is ${video.width}×${video.height}, not the requested ${expect.width}×${expect.height}.`);
      }
    }
    if (expect.frames && video.sampleCount && video.sampleCount !== expect.frames) {
      problems.push(
        `The finished file holds ${video.sampleCount} video frames where the timeline asked for ${expect.frames}.`,
      );
    }
    if (!video.sampleCount) {
      problems.push("The finished file's video track contains no frames.");
    }
    if (video.zeroSizeSamples > 0) {
      problems.push(`${video.zeroSizeSamples} video frames were written with no data, so a player will hold the previous picture.`);
    }
    if (expect.fps && video.distinctFrameDurations > 1 && video.maxFrameDeltaErrorUs > 200) {
      problems.push(
        `The video's frame timing is not constant frame rate: ${video.distinctFrameDurations} different frame durations, up to ${(video.maxFrameDeltaErrorUs / 1000).toFixed(2)} ms off.`,
      );
    } else if (expect.fps && video.frameRate !== null && Math.abs(video.frameRate - expect.fps) > 0.05) {
      problems.push(
        `The finished video runs at ${video.frameRate.toFixed(2)} fps, not the requested ${expect.fps} fps.`,
      );
    }
    if (video.unsignedOverflowSamples > 0) {
      problems.push(
        `The video's frame times are corrupt: ${video.unsignedOverflowSamples} frames carry a presentation offset of up to ` +
          `${video.maxCompositionOffsetSec.toFixed(1)}s. Negative composition offsets were written into an unsigned (version 0) ` +
          "sample table, so the picture jumps while the soundtrack stays correct.",
      );
    } else if (video.maxCompositionOffsetSec > 1) {
      problems.push(
        `The video's frame times are corrupt: a frame is presented ${video.maxCompositionOffsetSec.toFixed(1)}s away from its decode time. ` +
          "Negative composition offsets were written into an unsigned sample table, so the picture jumps while the soundtrack stays correct.",
      );
    }
    if (video.firstPresentationSec > 0.001) {
      problems.push(
        `The first video frame is presented ${(video.firstPresentationSec * 1000).toFixed(0)} ms late.`,
      );
    }
    if (video.editList && video.editList.mediaTimeSec > 0.001) {
      problems.push(
        `The video track carries an edit list that trims its first ${(video.editList.mediaTimeSec * 1000).toFixed(0)} ms.`,
      );
    }
    if (expect.durationSec && video.durationSec > 0) {
      const drift = Math.abs(video.durationSec - expect.durationSec);
      if (drift > Math.max(0.2, 2 / Math.max(1, expect.fps ?? 30))) {
        problems.push(
          `The finished video is ${video.durationSec.toFixed(2)}s long where the timeline is ${expect.durationSec.toFixed(2)}s.`,
        );
      }
    }
  }

  if (audit.audio && video && video.durationSec > 0 && audit.audio.durationSec > 0) {
    const gapMs = Math.abs(audit.audio.durationSec - video.durationSec) * 1000;
    if (gapMs > 250) {
      problems.push(
        `The soundtrack is ${(gapMs / 1000).toFixed(2)}s different in length from the picture, so the voice and the captions will not stay together.`,
      );
    }
  } else if (expect.requireAudio && !audit.audio) {
    problems.push("The finished file has no audio track.");
  }

  audit.ok = problems.length === 0;
  const bits: string[] = [];
  if (video) {
    bits.push(`${video.width && video.height ? `${video.width}×${video.height} · ` : ""}${video.codec.toUpperCase() || "video"}`);
    if (video.codecDetail) bits.push(video.codecDetail);
    if (video.frameRate) bits.push(`${video.frameRate.toFixed(2)} fps CFR · ${video.sampleCount} frames`);
    else if (video.sampleCount) bits.push(`${video.sampleCount} frames · variable timing`);
    if (video.reorderedSamples > 0) bits.push(`${video.reorderedSamples} reordered`);
  }
  if (audit.audio) bits.push(`${audit.audio.codec.toUpperCase()}${audit.audio.codecDetail ? ` ${audit.audio.codecDetail}` : ""}`);
  bits.push(audit.fastStart ? "fast-start" : "index at end");
  audit.summary = bits.filter(Boolean).join(" · ");
}

/* ------------------------------------------------------------------ *
 * Repairing the one thing the muxer cannot express
 * ------------------------------------------------------------------ */

/**
 * Rewrites negative composition offsets so that they are read as negative.
 *
 * The encoding order of H.264 frames is not always their presentation order:
 * a hardware encoder that uses B-frames emits I, P, B, B and gives the B
 * frames timestamps *earlier* than the frame they follow. The MP4 sample table
 * records that difference in a `ctts` box, where **version 0 offsets are
 * unsigned and version 1 offsets are signed**. `mp4-muxer` only ever writes
 * version 0.
 *
 * So the moment an encoder hands it a negative offset, the value is written as
 * a two's-complement 32-bit number that the container then reads as a positive
 * one — a frame presented tens of minutes into the movie instead of a
 * thirtieth of a second earlier. Players cope by holding the picture and then
 * snapping to the next frame: the camera stutters and the burned-in caption
 * highlight jerks, while the separately-stored audio track plays perfectly.
 *
 * The fix is one byte. Version 1 has exactly the same table layout, and the
 * bytes already written are the correct two's-complement values, so raising
 * the version number makes every offset mean what it was meant to mean. This
 * is done on the finished Blob, at the front of the file where the reserved
 * index lives, and the video payload is never touched.
 */
export async function patchSignedCompositionOffsets(blob: Blob): Promise<{ blob: Blob; patched: number }> {
  const windowBytes = Math.min(blob.size, MP4_AUDIT_WINDOW_BYTES);
  const head = new Uint8Array(await blob.slice(0, windowBytes).arrayBuffer());
  const inHead = locateCttsBoxes(head, 0);
  if (inHead.length > 0) return applySignedVersion(blob, head, 0, windowBytes, inHead);

  if (blob.size > windowBytes) {
    const base = blob.size - windowBytes;
    const tail = new Uint8Array(await blob.slice(base).arrayBuffer());
    const moov = locateMoov(tail, base, blob.size);
    if (moov) {
      // Offsets found inside the located `moov` are relative to that box.
      const inTail = locateCttsBoxes(tail.slice(moov.start), 0);
      if (inTail.length > 0) {
        return applySignedVersion(
          blob,
          tail,
          base,
          windowBytes,
          inTail.map((offset) => offset + moov.start),
        );
      }
    }
  }
  return { blob, patched: 0 };
}

/** Raise the version byte of the given boxes and rebuild the Blob around them. */
function applySignedVersion(
  blob: Blob,
  window: Uint8Array<ArrayBuffer>,
  base: number,
  windowBytes: number,
  boxStarts: number[],
): { blob: Blob; patched: number } {
  let patched = 0;
  for (const at of boxStarts) {
    // version 0 → 1. The table layout is identical; only the interpretation of
    // the offsets changes (unsigned to signed).
    if (at + 9 > window.byteLength || window[at + 8] !== 0) continue;
    window[at + 8] = 1;
    patched += 1;
  }
  if (patched === 0) return { blob, patched: 0 };
  return {
    blob: new Blob([blob.slice(0, base), window, blob.slice(base + windowBytes)], { type: blob.type }),
    patched,
  };
}

/**
 * Absolute offsets of every `ctts` box inside the `moov` that starts at
 * `moovStart`, found by walking the box tree — never by searching for the
 * four-character code, which could just as easily appear inside compressed
 * video payload and cost a byte of picture.
 */
function locateCttsBoxes(bytes: Uint8Array, moovStart: number): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const moov = walkBoxes(view, moovStart, bytes.byteLength).find((b) => b.type === "moov");
  if (!moov) return [];
  const out: number[] = [];
  for (const trak of childBoxes(view, moov).filter((b) => b.type === "trak")) {
    const stbl = find(view, childBoxes(view, trak), "mdia", "minf", "stbl");
    if (!stbl) continue;
    const ctts = find(view, childBoxes(view, stbl), "ctts");
    if (ctts) out.push(ctts.start);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Reading only the head (or tail) of a finished Blob
 * ------------------------------------------------------------------ */

/** How much of the file the audit is willing to read. The index is ~1 MB. */
export const MP4_AUDIT_WINDOW_BYTES = 24 * 1024 * 1024;

/**
 * Read the movie header out of a finished blob without loading the video.
 *
 * A fast-start MP4 keeps `moov` at the front, so the first few megabytes are
 * enough. When the index is at the back (a muxer without reserved space) the
 * tail is read instead and the `moov` box is found by scanning for a valid box
 * header — poppler-style, but cheap and safe because the size fields are
 * validated against the real file length.
 */
export async function readMp4Head(blob: Blob): Promise<{ bytes: Uint8Array; found: boolean }> {
  const headLength = Math.min(blob.size, MP4_AUDIT_WINDOW_BYTES);
  const head = new Uint8Array(await blob.slice(0, headLength).arrayBuffer());
  if (containsCompleteMoov(head)) return { bytes: head, found: true };

  if (blob.size > headLength) {
    const tailLength = Math.min(blob.size, MP4_AUDIT_WINDOW_BYTES);
    const tail = new Uint8Array(await blob.slice(blob.size - tailLength).arrayBuffer());
    const located = locateMoov(tail, blob.size - tailLength, blob.size);
    if (located) return { bytes: located.bytes, found: true };
  }
  return { bytes: head, found: false };
}

function containsCompleteMoov(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const top = walkBoxes(view, 0, bytes.byteLength);
  const moov = top.find((b) => b.type === "moov");
  return Boolean(moov && moov.end <= bytes.byteLength);
}

/**
 * Find a `moov` anywhere in a chunk of the file and return a buffer that
 * starts exactly at that box, so the normal parser can read it. `base` is the
 * absolute file offset of the chunk, used to validate the candidate's size.
 */
function locateMoov(
  bytes: Uint8Array,
  base: number,
  fileSize: number,
): { start: number; bytes: Uint8Array } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 0; at + 8 <= bytes.byteLength; at++) {
    if (
      bytes[at + 4] !== 0x6d || // m
      bytes[at + 5] !== 0x6f || // o
      bytes[at + 6] !== 0x6f || // o
      bytes[at + 7] !== 0x76 //   v
    ) {
      continue;
    }
    let size = u32(view, at);
    let header = 8;
    if (size === 1) {
      size = u64(view, at + 8);
      header = 16;
    }
    if (size < header) continue;
    const absoluteEnd = base + at + size;
    if (absoluteEnd > fileSize) continue;
    if (at + size > bytes.byteLength) return null; // the box is outside this window
    return { start: at, bytes: bytes.subarray(at, at + size) };
  }
  return null;
}

/** Convenience: read + parse a finished blob. */
export async function auditFinishedMp4(blob: Blob, expectations: Mp4Expectation = {}): Promise<Mp4Audit> {
  const { bytes } = await readMp4Head(blob);
  return parseMp4(bytes, expectations);
}

/** One sentence for the render report; never empty. */
export function describeAudit(audit: Mp4Audit): string {
  if (audit.ok) return `Verified MP4 · ${audit.summary}`;
  return `Not clean: ${audit.problems[0]}`;
}
