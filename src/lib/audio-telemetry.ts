import type { AudioBus, AudioFrame } from "./audio-reactive";

/**
 * Compact, fixed-size telemetry for an offline render.
 *
 * A long render used to retain two new analyser arrays and three new objects
 * for every frame. At 15 minutes / 30 fps that means 54,000 ArrayBuffers plus
 * 80,000+ JavaScript objects staying live until the video pass finishes.
 * Keeping the same bytes in six contiguous arrays removes that object storm,
 * makes the allocation predictable up front, and lets each frame expose cheap
 * views into the packed storage only while it is being painted.
 */
export class PackedAudioTelemetry {
  readonly frameCount: number;
  readonly frequencyBins: number;
  readonly waveformBins: number;

  private readonly voiceLevels: Float32Array;
  private readonly musicLevels: Float32Array;
  private readonly voiceFrequency: Uint8Array;
  private readonly musicFrequency: Uint8Array;
  private readonly voiceWaveform: Uint8Array;
  private readonly musicWaveform: Uint8Array;

  constructor(frameCount: number, frequencyBins: number, waveformBins: number) {
    this.frameCount = Math.max(1, Math.floor(frameCount));
    this.frequencyBins = Math.max(1, Math.floor(frequencyBins));
    this.waveformBins = Math.max(1, Math.floor(waveformBins));

    this.voiceLevels = new Float32Array(this.frameCount);
    this.musicLevels = new Float32Array(this.frameCount);
    this.voiceFrequency = new Uint8Array(this.frameCount * this.frequencyBins);
    this.musicFrequency = new Uint8Array(this.frameCount * this.frequencyBins);
    this.voiceWaveform = new Uint8Array(this.frameCount * this.waveformBins);
    this.musicWaveform = new Uint8Array(this.frameCount * this.waveformBins);

    // Web Audio time-domain silence is centred on 128, not zero. Filling once
    // means an unrecorded frame is correctly silent instead of a full-scale
    // negative waveform.
    this.voiceWaveform.fill(128);
    this.musicWaveform.fill(128);
  }

  /** Exact retained payload, useful in the render health report. */
  get byteLength(): number {
    return (
      this.voiceLevels.byteLength +
      this.musicLevels.byteLength +
      this.voiceFrequency.byteLength +
      this.musicFrequency.byteLength +
      this.voiceWaveform.byteLength +
      this.musicWaveform.byteLength
    );
  }

  setFrame(index: number, voice: AudioBus, music: AudioBus): void {
    if (index < 0 || index >= this.frameCount) return;
    this.writeBus(index, voice, true);
    this.writeBus(index, music, false);
  }

  /**
   * Copies analyser scratch arrays into their fixed slot. The source arrays
   * may be reused immediately for the next suspension point.
   */
  setAnalyserFrame(
    index: number,
    voiceLevel: number,
    voiceFrequency: Uint8Array,
    voiceWaveform: Uint8Array,
    musicLevel: number,
    musicFrequency: Uint8Array,
    musicWaveform: Uint8Array,
  ): void {
    if (index < 0 || index >= this.frameCount) return;
    this.voiceLevels[index] = finiteLevel(voiceLevel);
    this.musicLevels[index] = finiteLevel(musicLevel);
    copyBins(voiceFrequency, this.voiceFrequency, index * this.frequencyBins, this.frequencyBins);
    copyBins(musicFrequency, this.musicFrequency, index * this.frequencyBins, this.frequencyBins);
    copyBins(voiceWaveform, this.voiceWaveform, index * this.waveformBins, this.waveformBins, 128);
    copyBins(musicWaveform, this.musicWaveform, index * this.waveformBins, this.waveformBins, 128);
  }

  frame(index: number): AudioFrame {
    const i = Math.max(0, Math.min(this.frameCount - 1, Math.floor(index)));
    const freqStart = i * this.frequencyBins;
    const waveStart = i * this.waveformBins;
    return {
      voice: {
        level: this.voiceLevels[i],
        freq: this.voiceFrequency.subarray(freqStart, freqStart + this.frequencyBins),
        wave: this.voiceWaveform.subarray(waveStart, waveStart + this.waveformBins),
      },
      music: {
        level: this.musicLevels[i],
        freq: this.musicFrequency.subarray(freqStart, freqStart + this.frequencyBins),
        wave: this.musicWaveform.subarray(waveStart, waveStart + this.waveformBins),
      },
    };
  }

  private writeBus(index: number, bus: AudioBus, voice: boolean): void {
    const levels = voice ? this.voiceLevels : this.musicLevels;
    const frequency = voice ? this.voiceFrequency : this.musicFrequency;
    const waveform = voice ? this.voiceWaveform : this.musicWaveform;
    levels[index] = finiteLevel(bus.level);
    copyBins(bus.freq, frequency, index * this.frequencyBins, this.frequencyBins);
    copyBins(bus.wave, waveform, index * this.waveformBins, this.waveformBins, 128);
  }
}

function finiteLevel(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Copy or linearly resample an analyser row into a fixed-width slot. */
function copyBins(
  source: ArrayLike<number> | null | undefined,
  target: Uint8Array,
  targetOffset: number,
  targetLength: number,
  emptyValue = 0,
): void {
  if (!source || source.length === 0) {
    target.fill(emptyValue, targetOffset, targetOffset + targetLength);
    return;
  }
  if (source.length === targetLength) {
    target.set(source as ArrayLike<number>, targetOffset);
    return;
  }
  const scale = source.length / targetLength;
  for (let i = 0; i < targetLength; i++) {
    const sourceIndex = Math.min(source.length - 1, Math.floor(i * scale));
    target[targetOffset + i] = source[sourceIndex] ?? emptyValue;
  }
}
