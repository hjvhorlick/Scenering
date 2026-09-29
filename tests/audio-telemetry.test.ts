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

console.log(`PASS audio-telemetry: ${checks} checks, 0 failed`);
