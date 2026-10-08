import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import {
  VOICE_FADE_IN_SECONDS,
  VOICE_FADE_OUT_SECONDS,
  scheduleVoiceFadeIn,
  scheduleVoiceFadeOut,
  startVoiceSource,
} from "../src/lib/voice-fade";
import {
  PackedAudioTelemetry,
  TELEMETRY_SAMPLE_STRIDE,
  telemetrySampleFrames,
} from "../src/lib/audio-telemetry";

/**
 * The two quality regressions the owner reported, pinned to their causes.
 *
 *   • "the voice is crackling" — narration that starts and stops as a step in
 *     the signal. Every source now opens from silence and closes into it, and
 *     the hard stop is scheduled for the end of the fade.
 *
 *   • "the render is slow / the window freezes" — the offline audio pass
 *     suspends the audio context once per video frame to read the analysers,
 *     and every suspension is a cross-thread round trip on the main thread.
 *     It now samples every third frame and holds each sample across the frames
 *     it stands for, so the visualisers see the same picture for a third of
 *     the round trips.
 */

const h = createHarness();
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* ------------------------------------------------------------------ *
 * A fake AudioParam: records the envelope it was asked to draw.
 * ------------------------------------------------------------------ */
function fakeParam() {
  const calls: string[] = [];
  const param = {
    value: 0,
    setValueAtTime: (value: number, when: number) => calls.push(`set:${value}@${when}`),
    linearRampToValueAtTime: (value: number, when: number) => calls.push(`ramp:${value}@${when}`),
    cancelScheduledValues: (when: number) => calls.push(`cancel@${when}`),
  };
  return { param, calls };
}

/* ---- a fade-in is scheduled, not a full-gain start --------------------- */

{
  const { param, calls } = fakeParam();
  scheduleVoiceFadeIn(param, 10);
  h.eq(calls.length, 2, "the fade-in is a scheduled envelope, not a jump");
  h.eq(calls[0], "set:0@10", "it starts from silence");
  h.eq(calls[1], `ramp:1@${10 + VOICE_FADE_IN_SECONDS}`, "…and opens over the fade time");
  h.ok(VOICE_FADE_IN_SECONDS <= 0.02, "the fade-in is short enough to sound immediate");
  h.ok(VOICE_FADE_IN_SECONDS >= 0.008, "…and long enough to remove the click");
}

/* ---- a fade-out starts from wherever the gain is now ------------------- */

{
  const { param, calls } = fakeParam();
  param.value = 0.4; // caught mid-fade, which is exactly when a jump would click
  const silentAt = scheduleVoiceFadeOut(param, 5);
  h.eq(calls[0], "cancel@5", "previous automation is cancelled first");
  h.eq(calls[1], "set:0.4@5", "the fade starts from the CURRENT gain, not from full scale");
  h.eq(calls[2], `ramp:0@${5 + VOICE_FADE_OUT_SECONDS}`, "…and closes to silence");
  h.eq(silentAt, 5 + VOICE_FADE_OUT_SECONDS, "it reports when the signal has reached silence");
  h.ok(VOICE_FADE_OUT_SECONDS >= VOICE_FADE_IN_SECONDS, "a stop fades at least as long as a start");
}

{
  const { param, calls } = fakeParam();
  param.value = Number.NaN;
  scheduleVoiceFadeOut(param, 1);
  h.ok(calls.some((call) => call.startsWith("set:1@")), "a non-finite current gain falls back to full scale");
}

/* ---- the handle: start, then fade before stopping --------------------- */

function fakeContext() {
  const events: string[] = [];
  const source = {
    buffer: null as AudioBuffer | null,
    onended: null as null | (() => void),
    connect: () => events.push("source.connect"),
    disconnect: () => events.push("source.disconnect"),
    stop: (when?: number) => events.push(`source.stop:${when ?? "now"}`),
    start: (when: number, offset: number) => events.push(`source.start:${when}/${offset}`),
  };
  const gainParam = {
    value: 1,
    setValueAtTime: (value: number, when: number) => events.push(`gain.set:${value}@${when}`),
    linearRampToValueAtTime: (value: number, when: number) => events.push(`gain.ramp:${value}@${when}`),
    cancelScheduledValues: (when: number) => events.push(`gain.cancel@${when}`),
  };
  const gain = { gain: gainParam, connect: () => events.push("gain.connect"), disconnect: () => events.push("gain.disconnect") };
  const ctx = {
    currentTime: 2,
    createBufferSource: () => source,
    createGain: () => gain,
  } as unknown as BaseAudioContext;
  const buffer = { duration: 4 } as AudioBuffer;
  return { ctx, buffer, source, gainParam, events };
}

{
  const { ctx, buffer, events } = fakeContext();
  const handle = startVoiceSource(ctx, buffer, {} as AudioNode, { offsetSeconds: 1.5 });
  h.ok(events.includes("source.connect") && events.includes("gain.connect"), "the source plays through its own gain");
  h.ok(events.includes("source.start:2/1.5"), "it starts at the scene's speech offset, on this context's clock");
  h.ok(events.some((event) => event.startsWith("gain.set:0@")), "it starts from silence");

  handle.stop();
  h.ok(events.some((event) => event.startsWith("gain.ramp:0@")), "stopping fades the gain to silence");
  const stopEvent = events.find((event) => event.startsWith("source.stop:"));
  h.ok(Boolean(stopEvent) && stopEvent !== "source.stop:now", "the hard stop is scheduled for the end of the fade");
  h.ok(handle.stopping, "the handle reports that it is stopping");
  const before = events.length;
  handle.stop();
  h.eq(events.length, before, "stopping twice does nothing the second time");
}

{
  // The offset can never land past the end of the audio.
  const { ctx, buffer, events } = fakeContext();
  startVoiceSource(ctx, buffer, {} as AudioNode, { offsetSeconds: 99 });
  h.ok(events.some((event) => event.endsWith("/3.98")), "an offset past the end is clamped inside the buffer");
}

{
  // The offline render schedules ahead of the clock and passes its own time.
  const { ctx, buffer, events } = fakeContext();
  startVoiceSource(ctx, buffer, {} as AudioNode, { whenSeconds: 42, offsetSeconds: 0 });
  h.ok(events.includes("source.start:42/0"), "a scheduled start uses the given time, not 'now'");
  h.ok(events.some((event) => event.startsWith("gain.set:0@42")), "…and its fade starts at that time");
}

/* ---- the preview and the export both use it --------------------------- */

const preview = read("src/components/VideoPreview.tsx");
h.ok(preview.includes("startVoiceSource"), "the preview plays narration through the faded source");
h.ok(!/currentAudioSource\) try \{ currentAudioSource\.stop\(\)/.test(preview), "no scene change cuts a line mid-waveform");
h.ok(!/source\.start\(0, safeOffset\)/.test(preview), "no preview source starts at full gain");
h.ok(preview.includes("currentAudioSource.stop();\n        currentAudioSource = null;"), "the outgoing line is faded, not cut");

const render = read("src/components/RenderView.tsx");
h.ok(render.includes("startVoiceSource(offlineCtx"), "the exported soundtrack opens each line from silence too");
h.ok(render.includes('from "../lib/voice-fade"'), "…through the same helper as the preview");

/* ------------------------------------------------------------------ *
 * Render sampling
 * ------------------------------------------------------------------ */

h.ok(TELEMETRY_SAMPLE_STRIDE >= 3, "the audio telemetry is sampled at most every third frame");
h.ok(TELEMETRY_SAMPLE_STRIDE <= 6, "…but not so sparsely that the visualisers step visibly");

{
  const frames = telemetrySampleFrames(100);
  h.eq(frames[0], 1, "sampling starts at frame 1, never at time zero");
  h.eq(frames[1] - frames[0], TELEMETRY_SAMPLE_STRIDE, "samples are one stride apart");
  h.ok(frames[frames.length - 1] < 100, "the last sample is inside the render");
  h.eq(frames.length, Math.ceil(99 / TELEMETRY_SAMPLE_STRIDE), "and there are a third as many of them as there are frames");
  h.eq(telemetrySampleFrames(1).length, 0, "a single-frame render has nothing to sample");
}

{
  // One sample fills the frames it stands for, so frame() still answers for
  // every frame — the visualisers need no knowledge of the stride.
  const telemetry = new PackedAudioTelemetry(6, 4, 8);
  const freq = new Uint8Array([1, 2, 3, 4]);
  const wave = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]);
  telemetry.setAnalyserSpan(1, 1 + TELEMETRY_SAMPLE_STRIDE, 0.5, freq, wave, 0.25, freq, wave);
  for (let frame = 1; frame < 1 + TELEMETRY_SAMPLE_STRIDE; frame++) {
    const row = telemetry.frame(frame);
    h.eq(row.voice.level, 0.5, `frame ${frame} shows the sampled voice level`);
    h.eq(row.music.level, 0.25, `frame ${frame} shows the sampled music level`);
    h.eq(Array.from(row.voice.freq).join(","), "1,2,3,4", `frame ${frame} carries the sampled spectrum`);
  }
  h.eq(telemetry.frame(0).voice.level, 0, "frames before the first sample stay silent");
  h.eq(telemetry.frame(5).voice.level, 0, "frames after the last sample are untouched");
}

{
  // A span that runs past the end is clamped rather than writing out of bounds.
  const telemetry = new PackedAudioTelemetry(3, 2, 2);
  const freq = new Uint8Array([7, 7]);
  const wave = new Uint8Array([0, 0]);
  telemetry.setAnalyserSpan(2, 99, 0.9, freq, wave, 0.9, freq, wave);
  h.near(telemetry.frame(2).voice.level, 0.9, 1e-6, "the last frame of a clamped span is written");
  h.ok(Number.isFinite(telemetry.frame(0).voice.level), "and nothing was written out of bounds");
}

const capture = render.slice(render.indexOf("const captureTelemetry"), render.indexOf("const captureTelemetry") + 2600);
h.ok(capture.includes("TELEMETRY_SAMPLE_STRIDE"), "the render samples on the shared stride");
h.ok(capture.includes("setAnalyserSpan("), "…and fills the frames between samples");
h.ok(/for \(let frame = start; frame <= lastSample; frame \+= STRIDE\)/.test(capture), "it suspends only at the sampled frames");
h.ok(capture.includes("if (frame === lastSample && end < totalFrames) scheduleWindow(end)"), "the look-ahead window still hands over before resuming");
h.ok(capture.includes("end >= totalFrames && frame === lastSample"), "the pass still resolves on the final sample");

/* The stride must not change what the visualisers are handed. */
const timing = read("src/lib/render-timing.ts");
h.ok(timing.includes("audio pass"), "the render's stopwatch still reports the audio pass the stride shortens");

h.done("audio quality & render sampling");
