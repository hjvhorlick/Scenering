/**
 * A live tap on whatever the voice player is currently speaking.
 *
 * The studio already draws 52 sound visualisers — but only onto the video,
 * from the render engine. While you are auditioning narration in the Voiceover
 * step there was nothing to look at at all, even though the audio is right
 * there. This is the missing half: one shared AnalyserNode that the TTS player
 * routes voices through, so a visualiser on screen can be driven by the real
 * waveform instead of a guess.
 *
 * Two rules keep it out of the way:
 *
 *   1. Nothing is routed unless something is actually watching. A component
 *      calls `addVoiceListener()` when it mounts; until then the player leaves
 *      its audio elements completely alone, so the ordinary "play this line"
 *      path is byte-for-byte what it always was.
 *   2. Every Web Audio call is guarded. If a browser refuses to give us a
 *      media-element source the voice still plays — it just plays untapped,
 *      and `hasVoiceSignal()` reports false so the UI can say so rather than
 *      animate something it cannot hear.
 *
 * Browser speech synthesis (the free fallback voice) produces no node we are
 * allowed to touch, so it can never be measured. That is a fact about the Web
 * Speech API, not a bug, and the UI is expected to label it honestly.
 */

import { AudioBus, EMPTY_BUS, makeBus } from "./audio-reactive";
import { getEchoAudioContext } from "./voice-echo";

let listeners = 0;
let analyser: AnalyserNode | null = null;
let freqBuf: Uint8Array<ArrayBuffer> | null = null;
let waveBuf: Uint8Array<ArrayBuffer> | null = null;
/** Elements already routed — createMediaElementSource() throws on the second call. */
const tapped = new WeakSet<HTMLAudioElement>();
let lastSignalAt = 0;

/**
 * Register interest in the voice signal. Returns the unsubscribe function;
 * while at least one listener is registered the player will route voices
 * through the analyser.
 */
export function addVoiceListener(): () => void {
  listeners += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    listeners = Math.max(0, listeners - 1);
  };
}

/** True when something on screen is drawing the voice. */
export function voiceMonitorWanted(): boolean {
  return listeners > 0;
}

/**
 * The shared analyser, created on the same AudioContext the voice echo uses so
 * a voice is never split across two contexts. Returns null where Web Audio is
 * unavailable.
 */
export function getVoiceAnalyser(): AnalyserNode | null {
  if (analyser) return analyser;
  try {
    const ctx = getEchoAudioContext();
    const node = ctx.createAnalyser();
    // 512 samples => 256 bins, the same resolution the video preview reads, so
    // a visualiser looks identical here and on the finished frame.
    node.fftSize = 512;
    node.smoothingTimeConstant = 0.72;
    node.minDecibels = -92;
    node.maxDecibels = -12;
    node.connect(ctx.destination);
    analyser = node;
    freqBuf = new Uint8Array(new ArrayBuffer(node.frequencyBinCount));
    waveBuf = new Uint8Array(new ArrayBuffer(node.fftSize));
  } catch {
    analyser = null;
  }
  return analyser;
}

/**
 * Route one audio element through the analyser. Used for voices that are not
 * already going through the echo chain.
 *
 * Returns true when the tap was attached. On any failure the element is left
 * connected to the speakers the ordinary way — a missing visualiser is a small
 * disappointment, silent narration is a broken app.
 */
export function tapVoiceElement(element: HTMLAudioElement): boolean {
  if (tapped.has(element)) return true;
  const node = getVoiceAnalyser();
  if (!node) return false;
  let source: MediaElementAudioSourceNode | null = null;
  try {
    const ctx = getEchoAudioContext();
    source = ctx.createMediaElementSource(element);
    source.connect(node);
    tapped.add(element);
    return true;
  } catch {
    // The source may exist but be connected to nothing, which would mute the
    // voice. Put it back on the speakers before giving up.
    try {
      if (source) source.connect(getEchoAudioContext().destination);
    } catch {}
    return false;
  }
}

/** Read the current voice bus: level, frequency bins and the raw waveform. */
export function readVoiceBus(): AudioBus {
  const node = analyser;
  if (!node || !freqBuf || !waveBuf) return EMPTY_BUS;
  try {
    node.getByteFrequencyData(freqBuf);
    node.getByteTimeDomainData(waveBuf);
  } catch {
    return EMPTY_BUS;
  }
  let sum = 0;
  for (let i = 0; i < freqBuf.length; i++) sum += freqBuf[i];
  const level = sum / (freqBuf.length * 255);
  if (level > 0.004) lastSignalAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  return makeBus(level, freqBuf, waveBuf);
}

/**
 * True when real audio has reached the analyser in the last moment. A short
 * grace period keeps the label steady through the gaps between words.
 */
export function hasVoiceSignal(graceMs = 900): boolean {
  if (!lastSignalAt) return false;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  return now - lastSignalAt < graceMs;
}

/** Forget the signal history — called when playback stops. */
export function resetVoiceSignal() {
  lastSignalAt = 0;
}
