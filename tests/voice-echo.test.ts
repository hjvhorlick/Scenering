/**
 * Voice echo suite.
 *
 * The echo is a real audio effect: it changes what is recorded into the video.
 * This suite checks the numbers behind the spaces (delays, decay, damping), that
 * the audio graph is actually wired the way the UI claims, and that all three
 * places the narration is heard — the voice previews, the live video preview and
 * the final render — are connected to it. No audio hardware is needed: the graph
 * is built on a recording stand-in for an AudioContext.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import {
  DEFAULT_VOICE_ECHO,
  VOICE_ECHO_PRESETS,
  createVoiceEchoGraph,
  describeVoiceEcho,
  echoDampingFrequency,
  getVoiceEchoPreset,
  resolveVoiceEcho,
  voiceEchoIsActive,
  voiceEchoPresetConfig,
} from "../src/lib/voice-echo";

const h = createHarness();
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, "..", rel), "utf8");

// ---------------------------------------------------------------- stand-in audio
/** Records what the echo graph asks the audio API to do. */
function makeAudioRecorder() {
  const calls: string[] = [];
  const param = (name: string, value: number) => ({
    value,
    setTargetAtTime(v: number, t: number) {
      calls.push(`${name}=${v.toFixed(4)}@${t}`);
      this.value = v;
    },
  });

  let delaySeconds = 1;
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: "running",
    destination: { name: "destination" },
    resume: async () => {},
    createGain: () => ({
      gain: param("gain", 1),
      connect: (to: unknown) => calls.push(`gain->${(to as { name?: string })?.name ?? "node"}`),
      disconnect: () => calls.push("gain.disconnect"),
    }),
    createDelay: (max: number) => {
      delaySeconds = max;
      return {
        delayTime: param("delayTime", 0),
        connect: (to: unknown) => calls.push(`delay->${(to as { name?: string })?.name ?? "node"}`),
        disconnect: () => calls.push("delay.disconnect"),
      };
    },
    createBiquadFilter: () => ({
      type: "lowpass",
      frequency: param("frequency", 350),
      connect: (to: unknown) => calls.push(`filter->${(to as { name?: string })?.name ?? "node"}`),
      disconnect: () => calls.push("filter.disconnect"),
    }),
    createStereoPanner: () => ({
      pan: param("pan", 0),
      connect: (to: unknown) => calls.push(`panner->${(to as { name?: string })?.name ?? "node"}`),
      disconnect: () => calls.push("panner.disconnect"),
    }),
    maxDelaySeconds: () => delaySeconds,
  };

  return { ctx, calls };
}

// ---------------------------------------------------------------- presets
h.ok(VOICE_ECHO_PRESETS.length >= 6, `expected 6+ spaces, got ${VOICE_ECHO_PRESETS.length}`);
const seen = new Set<string>();
for (const preset of VOICE_ECHO_PRESETS) {
  h.ok(!seen.has(preset.id), `duplicate echo preset id ${preset.id}`);
  seen.add(preset.id);
  h.ok(Boolean(preset.name && preset.blurb && preset.icon), `${preset.id} is fully described`);
  h.ok(preset.delay >= 0 && preset.delay <= 1000, `${preset.id} delay is in range (${preset.delay})`);
  h.ok(preset.feedback >= 0 && preset.feedback <= 0.85, `${preset.id} decay is safe (${preset.feedback})`);
  h.ok(preset.amount >= 0 && preset.amount <= 1, `${preset.id} mix is in range (${preset.amount})`);
  h.ok(preset.tone >= 0 && preset.tone <= 1, `${preset.id} tone is in range (${preset.tone})`);
  h.ok(preset.width >= 0 && preset.width <= 1, `${preset.id} width is in range (${preset.width})`);
}

h.eq(getVoiceEchoPreset("off").name, "No Echo", "the off preset is the dry voice");
h.eq(getVoiceEchoPreset("nonsense").id, "off", "an unknown preset falls back to dry");
h.eq(DEFAULT_VOICE_ECHO.enabled, false, "echo is off until the user turns it on");
h.eq(DEFAULT_VOICE_ECHO.preset, "room", "the default space is a warm room");

// picking a space carries that space's own numbers
for (const preset of VOICE_ECHO_PRESETS) {
  const cfg = voiceEchoPresetConfig(preset.id);
  h.eq(cfg.delay, preset.delay, `${preset.id} preset applies its delay`);
  h.eq(cfg.feedback, preset.feedback, `${preset.id} preset applies its decay`);
  h.eq(cfg.amount, preset.amount, `${preset.id} preset applies its mix`);
  h.eq(cfg.enabled, preset.id !== "off", `${preset.id} preset is ${preset.id === "off" ? "off" : "on"}`);
}

// the spaces get progressively bigger
const ordered = VOICE_ECHO_PRESETS.filter((p) => p.id !== "off" && p.id !== "doubler");
for (let i = 1; i < ordered.length; i++) {
  h.ok(
    ordered[i].delay >= ordered[i - 1].delay,
    `${ordered[i].id} is a longer space than ${ordered[i - 1].id} (${ordered[i].delay}ms vs ${ordered[i - 1].delay}ms)`
  );
}

// ---------------------------------------------------------------- clamping
{
  const wild = resolveVoiceEcho({
    enabled: true,
    preset: "hall",
    amount: 9,
    delay: -400,
    feedback: 12,
    tone: -3,
    width: 7,
  });
  h.eq(wild.amount, 1, "echo mix clamps at 100%");
  h.eq(wild.delay, 0, "echo delay never goes negative");
  h.eq(wild.feedback, 0.85, "echo decay clamps below runaway feedback");
  h.eq(wild.tone, 0, "echo tone clamps at 0");
  h.eq(wild.width, 1, "echo width clamps at 1");

  const nan = resolveVoiceEcho({ preset: "hall", amount: NaN, delay: NaN, feedback: NaN, tone: NaN, width: NaN });
  h.finite(nan.amount, "a NaN mix resolves to a number");
  h.finite(nan.delay, "a NaN delay resolves to a number");
  h.finite(nan.feedback, "a NaN decay resolves to a number");

  h.eq(resolveVoiceEcho(undefined).enabled, false, "no config means no echo");
  h.eq(
    resolveVoiceEcho({ enabled: true, preset: "off", amount: 1, delay: 300, feedback: 0.5, tone: 0.5, width: 0.5 }).enabled,
    false,
    "the off preset always wins"
  );
}

// ---------------------------------------------------------------- description
h.ok(describeVoiceEcho(undefined).toLowerCase().includes("dry"), "off is described as dry");
{
  const text = describeVoiceEcho(voiceEchoPresetConfig("cathedral"));
  h.ok(text.includes("Cathedral"), `the description names the space (${text})`);
  h.ok(text.includes("%"), `the description shows the mix (${text})`);
  h.ok(text.includes("ms"), `the description shows the delay (${text})`);
}
h.eq(voiceEchoIsActive(voiceEchoPresetConfig("off")), false, "off is not active");
h.eq(voiceEchoIsActive(voiceEchoPresetConfig("hall")), true, "a hall is active");
h.eq(
  voiceEchoIsActive({ ...voiceEchoPresetConfig("hall"), amount: 0 }),
  false,
  "zero mix is not active"
);

// ---------------------------------------------------------------- damping curve
h.ok(
  echoDampingFrequency(0) > echoDampingFrequency(1),
  "a brighter echo keeps more high end than a distant one"
);
for (const tone of [0, 0.25, 0.5, 0.75, 1]) {
  const f = echoDampingFrequency(tone);
  h.finite(f, `damping frequency is finite at tone ${tone}`);
  h.ok(f >= 1800 && f <= 9000, `damping frequency stays in the audible band (${f})`);
}

// ---------------------------------------------------------------- the graph
{
  const { ctx, calls } = makeAudioRecorder();
  const cfg = voiceEchoPresetConfig("hall");
  const graph = createVoiceEchoGraph(ctx as unknown as BaseAudioContext, cfg);

  const values = calls.join(" ");
  h.ok(values.includes(`delayTime=${(cfg.delay / 1000).toFixed(4)}`), "the graph applies the preset delay");
  h.ok(values.includes(`gain=${cfg.amount.toFixed(4)}`), "the graph applies the wet mix");
  h.ok(values.includes(`gain=${cfg.feedback.toFixed(4)}`), "the graph applies the decay");
  h.ok(
    values.includes(`frequency=${echoDampingFrequency(cfg.tone).toFixed(4)}`),
    "the graph rolls the repeats off at the tone setting"
  );
  h.ok(
    values.includes("delay->") && values.includes("filter->") && values.includes("gain->"),
    "the delay chain is connected"
  );
  h.ok(values.includes("pan"), "the wide spaces use the second, panned tap");

  // turning the echo down mid-playback only moves gains — nothing is re-wired
  const before = calls.length;
  graph.update({ ...cfg, amount: 0.1, preset: "studio" });
  h.ok(calls.length > before, "update() re-applies the settings");
  h.ok(values.includes("gain=1.0000"), "the dry voice is always passed through at full level");

  // switching it off silences the tail (no runaway repeats)
  const beforeOff = calls.length;
  graph.update({ ...cfg, enabled: false });
  const after = calls.slice(beforeOff).join(" ");
  h.ok(after.includes("gain=0.0000"), "switching the echo off mutes the wet path");
  h.ok(
    !after.includes(`gain=${cfg.feedback.toFixed(4)}`),
    "switching the echo off also drops the feedback to zero"
  );

  graph.dispose();
  h.ok(calls.join(" ").includes("disconnect"), "dispose() tears the chain down");

  // the off preset builds a silent chain rather than a broken one
  const dry = makeAudioRecorder();
  const dryGraph = createVoiceEchoGraph(dry.ctx as unknown as BaseAudioContext, voiceEchoPresetConfig("off"));
  h.ok(dry.calls.join(" ").includes("gain=0.0000"), "the off preset builds a silent (not broken) chain");
  dryGraph.dispose();
}

// the graph guards against reckless feedback values from a hand-edited project
{
  const { ctx } = makeAudioRecorder();
  const graph = createVoiceEchoGraph(ctx as unknown as BaseAudioContext, { ...DEFAULT_VOICE_ECHO, enabled: true, preset: "hall", amount: 0.4, delay: 300, feedback: 5 });
  h.ok(graph.config.feedback <= 0.85, "a runaway decay is clamped before it reaches the audio graph");
  graph.dispose();
}

// ---------------------------------------------------------------- wiring
{
  // the voice preview in the Voiceover step
  const studio = read("src/components/VoiceoverStudio.tsx");
  h.ok(studio.includes("VOICE_ECHO_PRESETS.map"), "the Voiceover step offers every space");
  h.ok(studio.includes("ttsPlayer.setVoiceEcho"), "voice previews play through the echo");
  h.ok(studio.includes("onUpdateVoiceEcho"), "the choice is saved on the project");
  h.ok(studio.includes("Listen with echo"), "there is a button to hear the echo");

  // the player that speaks the previews
  const player = read("src/lib/tts-player.ts");
  h.ok(player.includes("attachEcho"), "the player routes the audio element through the echo");
  h.ok(
    player.match(/attachEcho\(audio\)/g)?.length === 2,
    "both playback paths (server voice + imported track) are routed"
  );

  // the live video preview
  const preview = read("src/components/VideoPreview.tsx");
  h.ok(preview.includes("createVoiceEchoGraph"), "the video preview builds the echo chain");
  h.ok(
    preview.includes("source.connect(echo.graph.input)"),
    "scene narration is played through the echo chain in the preview"
  );

  // the render — this is the one that decides what lands in the file
  const render = read("src/components/RenderView.tsx");
  h.ok(render.includes("createVoiceEchoGraph"), "the render builds the echo chain");
  h.ok(
    render.includes("source.connect(voiceEchoGraph ? voiceEchoGraph.input : analyser)"),
    "rendered narration is recorded through the echo chain"
  );
  h.ok(
    render.includes("voiceEchoGraph.output.connect(analyser)"),
    "the visualisers still react to the voice as it sounds (echo included)"
  );
  h.ok(render.includes('describeVoiceEcho(voiceEcho)'), "the render screen shows the chosen space");
  h.ok(render.includes("voiceEchoGraph?.dispose()"), "the chain is torn down when a render ends");

  // the setting itself
  const app = read("src/App.tsx");
  h.ok(app.includes("voice_echo: VoiceEchoConfig"), "the echo is saved per project");
  h.ok(app.includes("voiceEcho={voiceEcho}"), "the setting is handed to the screens that use it");
}

h.done("voice-echo");
