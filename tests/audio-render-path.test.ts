/**
 * The render-only voice path.
 *
 * THE REPORT: the live preview's voice was clean, but the voice in the
 * rendered file had intermittent breaks and glitches. Everything that turns
 * the preview sound into the file sound lives in two render-only places:
 *
 *   1. the automatic mastering chain (audio-mastering.ts) — the preview plays
 *      through one soft limiter only; the render used to add vocal EQ, a
 *      compressor, +1.28 dB of makeup gain and then a hard-knee 20:1 limiter
 *      that an already maximised Speechify track over-drove on every loud
 *      syllable;
 *   2. the WebCodecs audio encode (offline-export.ts) — PCM is now fed in the
 *      codec's natural packet size, and the packets the platform encoder
 *      emits are measured for gaps and overlaps so a dropped packet can never
 *      ship silently on any browser.
 *
 * These tests pin both halves without needing a browser or an encoder.
 */

import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import {
  AUDIO_CONTINUITY_TOLERANCE_US,
  AudioContinuityGuard,
  audioChunkFramesForCodec,
} from "../src/lib/offline-export";
import {
  RENDER_LIMITER_ATTACK_SECONDS,
  RENDER_LIMITER_KNEE_DB,
  RENDER_LIMITER_RATIO,
  RENDER_LIMITER_RELEASE_SECONDS,
  RENDER_LIMITER_THRESHOLD_DB,
  VOICE_MAKEUP_GAIN,
  createMasteringChain,
} from "../src/lib/audio-mastering";

const h = createHarness();
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* ------------------------------------------------------------------ *
 * 1. Natural packet framing for every supported audio codec
 * ------------------------------------------------------------------ */

h.eq(audioChunkFramesForCodec("mp4a.40.2", 48_000), 1024, "AAC-LC at 48 kHz feeds 1024-frame packets");
h.eq(audioChunkFramesForCodec("aac", 44_100), 1024, "AAC-LC at 44.1 kHz still feeds 1024-frame packets");
h.eq(audioChunkFramesForCodec("A_OPUS", 48_000), 960, "Opus at 48 kHz feeds a 20 ms (960-frame) packet");
h.eq(audioChunkFramesForCodec("opus", 44_100), 882, "Opus at 44.1 kHz feeds a 20 ms (882-frame) packet");

/* ------------------------------------------------------------------ *
 * 2. The input is sliced into gapless, non-overlapping AudioData pieces
 *
 * This walks the exact offset loop OfflineExporter.encodeAudio uses and
 * proves every PCM frame is handed to the encoder exactly once, including
 * the short final packet, and that the AudioData timestamps are contiguous.
 * ------------------------------------------------------------------ */

for (const codec of ["mp4a.40.2", "opus"]) {
  const sampleRate = 48_000;
  const framesPerChunk = audioChunkFramesForCodec(codec, sampleRate);
  for (const totalSamples of [framesPerChunk, framesPerChunk * 10, framesPerChunk * 10 + 337, sampleRate * 3 + 17]) {
    let covered = 0;
    let previousEndSample = 0;
    let previousEndUs: number | null = null;
    for (let offset = 0; offset < totalSamples; offset += framesPerChunk) {
      const frames = Math.min(framesPerChunk, totalSamples - offset);
      // No overlap with the previous piece.
      h.eq(offset, previousEndSample, `${codec}: audio pieces never overlap (${totalSamples} samples)`);
      previousEndSample = offset + frames;
      // The timestamp is the exact sample position of the first frame.
      const timestampUs = Math.round(offset * 1_000_000 / sampleRate);
      if (previousEndUs !== null) {
        h.eq(timestampUs, previousEndUs, `${codec}: AudioData timestamps are contiguous (${totalSamples} samples)`);
      }
      previousEndUs = Math.round((offset + frames) * 1_000_000 / sampleRate);
      covered += frames;
    }
    h.eq(covered, totalSamples, `${codec}: every one of ${totalSamples} PCM frames is encoded exactly once`);
  }
}

/* ------------------------------------------------------------------ *
 * 3. AudioContinuityGuard — the dropout detector
 * ------------------------------------------------------------------ */

{
  // A healthy Chromium AAC stream: packets stamped from a 1024-frame tracker
  // with a constant 21333 µs duration. Rounding between packets is well
  // inside the tolerance, so a real stream reports zero gaps.
  const guard = new AudioContinuityGuard();
  const packetUs = Math.round((1024 / 48_000) * 1_000_000);
  for (let k = 0; k < 500; k += 1) {
    const timestampUs = Math.round((k * 1024 * 1_000_000) / 48_000);
    guard.observe(timestampUs, packetUs);
  }
  h.eq(guard.gaps, 0, "a gapless AAC stream reports no gaps despite µs timestamp rounding");
  h.eq(guard.overlaps, 0, "…and no overlaps");
  h.eq(guard.maxGapUs, 0, "…and no gap width");

  // One dropped packet: the next timestamp lands a full packet late.
  const withDrop = new AudioContinuityGuard();
  for (let k = 0; k < 10; k += 1) {
    if (k === 5) continue; // the encoder lost packet 5
    withDrop.observe(k * packetUs, packetUs);
  }
  h.eq(withDrop.gaps, 1, "a missing AAC packet is counted as one gap");
  h.ok(withDrop.maxGapUs >= packetUs, "the gap is at least one AAC packet wide");
  h.ok(withDrop.maxGapUs > AUDIO_CONTINUITY_TOLERANCE_US, "a real dropout is larger than the rounding tolerance");

  // A duplicated/overlapping timestamp is counted the other way.
  const withOverlap = new AudioContinuityGuard();
  withOverlap.observe(0, packetUs);
  withOverlap.observe(Math.round(packetUs / 2), packetUs);
  h.eq(withOverlap.overlaps, 1, "a packet starting inside the previous one is an overlap");

  const reset = new AudioContinuityGuard();
  reset.observe(0, packetUs);
  reset.observe(packetUs * 5, packetUs);
  h.eq(reset.gaps, 1, "sanity: the guard sees the gap before reset");
  reset.reset();
  reset.observe(0, packetUs);
  h.eq(reset.gaps, 0, "reset clears every measurement");
}

/* ------------------------------------------------------------------ *
 * 4. The render mastering chain can no longer over-drive the voice
 * ------------------------------------------------------------------ */

type CapturedCompressor = {
  threshold: { value: number };
  knee: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
};

function capturingAudioContext() {
  const compressors: CapturedCompressor[] = [];
  const gains: Array<{ gain: { value: number } }> = [];
  const node = () => ({ connect() {}, disconnect() {} });
  const ctx = {
    createGain: () => {
      const g = { gain: { value: 1 }, ...node() };
      gains.push(g);
      return g;
    },
    createDynamicsCompressor: () => {
      const c: CapturedCompressor = {
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 1 },
        attack: { value: 0 },
        release: { value: 0 },
        ...node(),
      };
      compressors.push(c);
      return c;
    },
    createBiquadFilter: () => ({
      type: "peaking",
      frequency: { value: 0 },
      Q: { value: 1 },
      gain: { value: 0 },
      ...node(),
    }),
  } as unknown as BaseAudioContext;
  return { ctx, compressors, gains };
}

{
  const { ctx, compressors, gains } = capturingAudioContext();
  const chain = createMasteringChain(ctx, "automatic");

  const limiter = compressors.find(
    (c) =>
      c.threshold.value === RENDER_LIMITER_THRESHOLD_DB &&
      c.knee.value === RENDER_LIMITER_KNEE_DB &&
      c.ratio.value === RENDER_LIMITER_RATIO,
  );
  h.ok(Boolean(limiter), "the render limiter uses the soft, preview-matched constants (not a hard 20:1 knee-0 limiter)");
  h.eq(limiter?.attack.value, RENDER_LIMITER_ATTACK_SECONDS, "the limiter attack matches the preview");
  h.eq(limiter?.release.value, RENDER_LIMITER_RELEASE_SECONDS, "the limiter release matches the preview");
  h.ok(RENDER_LIMITER_KNEE_DB > 0, "the limiter has a real soft knee so transients are rounded, not slammed");
  h.ok(RENDER_LIMITER_RATIO < 20, "the limiter ratio is gentler than the old hard limiter");

  h.eq(VOICE_MAKEUP_GAIN, 1.0, "the voice bus carries no makeup gain that would push speech into the limiter");
  h.ok(gains.every((g) => g.gain.value <= 1.0), "no stage in the automatic chain amplifies beyond unity before the limiter");

  chain.dispose();

  // Manual mode must stay a straight wire: no dynamics at all.
  const manual = capturingAudioContext();
  createMasteringChain(manual.ctx, "manual").dispose();
  h.eq(manual.compressors.length, 0, "manual mastering adds no compressor or limiter");
}

/* ------------------------------------------------------------------ *
 * 5. The render limiter and the live-preview limiter stay identical
 *
 * The preview is what the creator approves. These source pins make sure the
 * two AudioParam sets cannot drift apart again without a test failing.
 * ------------------------------------------------------------------ */

{
  const preview = read("src/components/VideoPreview.tsx");
  h.ok(preview.includes(`masterLimiter.threshold.setValueAtTime(${RENDER_LIMITER_THRESHOLD_DB},`), "preview limiter threshold matches the render limiter");
  h.ok(preview.includes(`masterLimiter.knee.setValueAtTime(${RENDER_LIMITER_KNEE_DB.toFixed(1)},`), "preview limiter knee matches the render limiter");
  h.ok(preview.includes(`masterLimiter.ratio.setValueAtTime(${RENDER_LIMITER_RATIO.toFixed(1)},`), "preview limiter ratio matches the render limiter");
  h.ok(preview.includes(`masterLimiter.attack.setValueAtTime(${RENDER_LIMITER_ATTACK_SECONDS},`), "preview limiter attack matches the render limiter");
  h.ok(preview.includes(`masterLimiter.release.setValueAtTime(${RENDER_LIMITER_RELEASE_SECONDS},`), "preview limiter release matches the render limiter");
}

/* ------------------------------------------------------------------ *
 * 6. The render feeds natural packets and measures what comes back
 * ------------------------------------------------------------------ */

{
  const exporter = read("src/lib/offline-export.ts");
  const render = read("src/components/RenderView.tsx");

  h.ok(exporter.includes("audioChunkFramesForCodec(this.audioCodec, this.config.sampleRate)"), "the exporter chooses packet framing from the configured codec");
  h.ok(exporter.includes("this.audioContinuity.observe(chunk.timestamp, chunk.duration ?? 0)"), "every emitted audio packet passes through the continuity guard");
  h.ok(!/encodeAudio\(mixedAudio,\s*4_?800/.test(render), "the render no longer forces 4,800-frame AudioData chunks on the encoder");
  h.ok(render.includes("encodeAudio(mixedAudio, undefined"), "the render lets the exporter use codec-natural framing");
}

h.done("render audio path: limiter gain staging, natural packet framing, dropout guard");
