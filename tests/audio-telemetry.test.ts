import { PackedAudioTelemetry } from "../src/lib/audio-telemetry";
import { makeBus } from "../src/lib/audio-reactive";

let checks = 0;
const equal = (actual: unknown, expected: unknown, label: string) => {
  checks++;
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
};
const deepEqual = (actual: ArrayLike<number>, expected: number[], label: string) => {
  checks++;
  const a = Array.from(actual).join(",");
  const b = expected.join(",");
  if (a !== b) throw new Error(`${label}: expected [${b}], got [${a}]`);
};

{
  const packed = new PackedAudioTelemetry(3, 4, 6);
  equal(packed.frameCount, 3, "frame count is retained");
  equal(packed.byteLength, 3 * 2 * 4 + 3 * 4 * 2 + 3 * 6 * 2, "payload has no per-frame object overhead");

  const empty = packed.frame(0);
  deepEqual(empty.voice.freq || [], [0, 0, 0, 0], "empty frequency row is digital silence");
  deepEqual(empty.voice.wave || [], [128, 128, 128, 128, 128, 128], "empty waveform is centred silence");

  packed.setFrame(
    1,
    makeBus(0.5, new Uint8Array([1, 2, 3, 4]), new Uint8Array([120, 124, 128, 132, 136, 140])),
    makeBus(0.25, new Uint8Array([9, 8, 7, 6]), new Uint8Array([110, 115, 120, 125, 130, 135])),
  );
  const frame = packed.frame(1);
  equal(frame.voice.level, 0.5, "voice level round-trips");
  equal(frame.music.level, 0.25, "music level round-trips");
  deepEqual(frame.voice.freq || [], [1, 2, 3, 4], "voice bins round-trip");
  deepEqual(frame.music.wave || [], [110, 115, 120, 125, 130, 135], "music waveform round-trips");

  // Returned rows are views into one packed allocation, not retained copies.
  (frame.voice.freq as Uint8Array)[0] = 42;
  equal((packed.frame(1).voice.freq as Uint8Array)[0], 42, "frame exposes a packed view");
}

{
  const packed = new PackedAudioTelemetry(1, 4, 4);
  packed.setAnalyserFrame(
    0,
    Number.NaN,
    new Uint8Array([10, 20]),
    new Uint8Array([100, 110]),
    0.75,
    new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    new Uint8Array([120, 124, 128, 132, 136, 140, 144, 148]),
  );
  const frame = packed.frame(0);
  equal(frame.voice.level, 0, "non-finite levels are repaired");
  deepEqual(frame.voice.freq || [], [10, 10, 20, 20], "short rows are resampled");
  deepEqual(frame.music.freq || [], [1, 3, 5, 7], "long rows are downsampled");
  deepEqual(frame.music.wave || [], [120, 128, 136, 144], "waveform is downsampled");
}

/* ------------------------------------------------------------------ *
 * frameSmooth — the analyser at the frame rate, not at the sample rate.
 *
 * The offline pass stores one row for every third frame to keep memory
 * bounded. Played back as stored, anything driven by the analyser (a
 * visualiser, a reactive sticker, an audio-reactive zoom) moves in steps of
 * three frames — ten updates a second in a thirty frame video — and the file
 * reads as a stutter even though the camera itself is perfectly linear.
 * frameSmooth() fills in the frames between the stored rows without storing
 * anything extra.
 * ------------------------------------------------------------------ */
{
  const packed = new PackedAudioTelemetry(13, 4, 6);
  packed.setAnalyserSpan(0, 4, 0, new Uint8Array([0, 0, 0, 0]), new Uint8Array(6).fill(128), 0, new Uint8Array(4), new Uint8Array(6).fill(128));
  packed.setAnalyserSpan(4, 8, 1, new Uint8Array([100, 100, 100, 100]), new Uint8Array(6).fill(200), 1, new Uint8Array(4), new Uint8Array(6).fill(200));

  equal(packed.frame(1).voice.level, 0, "a stored row is still held for the frames it covers");

  const halfway = packed.frameSmooth(2, 4);
  equal(halfway.voice.level, 0.5, "frameSmooth interpolates between the stored samples");
  deepEqual(halfway.voice.freq || [], [50, 50, 50, 50], "frequency bins are interpolated");
  deepEqual(halfway.voice.wave || [], [164, 164, 164, 164, 164, 164], "waveform is interpolated around 128");

  equal(packed.frameSmooth(0, 4).voice.level, 0, "the stored sample itself is exact");
  equal(packed.frameSmooth(4, 4).voice.level, 1, "the next stored sample is exact");

  // Every in-between frame gets its own value: no two identical rows, which is
  // what stops the reactive visuals stepping.
  const levels = [0, 1, 2, 3, 4].map((f) => packed.frameSmooth(f, 4).voice.level);
  checks++;
  const strictlyIncreasing = levels.every((value, index) => index === 0 || value > levels[index - 1]);
  if (!strictlyIncreasing) throw new Error(`frameSmooth should rise steadily, got ${levels.join(",")}`);

  // No allocation per frame: the same arrays come back every call.
  const a = packed.frameSmooth(2, 4).voice.freq;
  const b = packed.frameSmooth(2, 4).voice.freq;
  equal(a, b, "frameSmooth reuses its scratch buffers");

  // Out-of-range indices clamp instead of reading past the packed arrays.
  equal(packed.frameSmooth(-5, 4).voice.level, 0, "a frame before the start clamps to the first row");
  // Row 8 onwards was never written, so the last row is silence — the point is
  // that it is read, not that it has a value.
  equal(packed.frameSmooth(99, 4).voice.level, 0, "a frame after the end clamps instead of reading past the arrays");
  deepEqual(packed.frameSmooth(99, 4).voice.freq || [], [0, 0, 0, 0], "clamped frames still return real bins");
}

console.log(`PASS audio-telemetry: ${checks} checks, 0 failed`);
