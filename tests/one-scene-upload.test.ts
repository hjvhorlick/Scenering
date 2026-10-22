import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import {
  fitSceneDurationForScene,
  NARRATION_LEAD_IN_SECONDS,
  narrationLeadIn,
  projectDurationForScenes,
  sceneClipSeconds,
  sceneDurationForScene,
  sceneDurationForText,
  sceneFootageLength,
  sceneTimelineDuration,
  singleSceneDuration,
} from "../src/lib/duration-utils";
import { clipAudioPlanFor } from "../src/lib/clip-audio";
import { stretchFullVideoMedia } from "../src/lib/render-visualizers";
import type { TimelineInsert } from "../src/types";
import {
  chunksToWordTimings,
  defaultTranscriptionModels,
  runWithTranscriptionTimeout,
  TranscriptionError,
  TranscriptionTimeoutError,
  wordsToText,
  STT_AUDIO_TIMEOUT_MS,
  STT_ENGINE_URL,
  STT_ENGINE_TIMEOUT_MS,
  STT_INFERENCE_MIN_TIMEOUT_MS,
  STT_LOW_MEMORY_CLIP_SECONDS,
  STT_MODEL_CANDIDATES,
  STT_MODEL_TIMEOUT_MS,
} from "../src/lib/speech-to-text";
import {
  narratableText,
  projectHasNarration,
  sceneCaptionWords,
  sceneHasTranscript,
  sceneUpdatesForTranscript,
  transcriptMatchesClip,
  transcriptToCaptionText,
  TRANSCRIPT_KEYS,
} from "../src/lib/clip-transcript";
import { parseCaptionFile, CaptionFileError } from "../src/lib/caption-file";
import {
  sourceHasPixels,
  sourcePixelHeight,
  sourcePixelWidth,
  sourceRect,
} from "../src/lib/scene-framing";
import type { Scene } from "../src/types";

/**
 * An uploaded video used as the whole project.
 *
 * Four things are guarded here, and each one has been broken once already:
 *
 * 1. **The video plays start to finish.** Every path that re-times a scene
 *    used to work from its WORD COUNT alone, so a music video with no script
 *    was cut to the project's 10/20/30 target — 20 seconds, or three, the
 *    first time the creator went back through Setup.
 * 2. **The original sound is a real choice.** It is in the exported file by
 *    default, and absent when the creator removes it.
 * 3. **Captions can come from the footage's own audio**, timed per word, and
 *    they are ordinary captions from that point on.
 * 4. **Nothing about the split-scene workflow changed.** A script project
 *    still times its scenes by its words.
 */
const h = createHarness();

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name: string) => readFileSync(join(repoRoot, name), "utf8");

const app = read("src/App.tsx");
const setup = read("src/components/SetupStudio.tsx");
const captions = read("src/components/CaptionsStudio.tsx");
const render = read("src/components/RenderView.tsx");
const preview = read("src/components/VideoPreview.tsx");
const sceneClip = read("src/lib/scene-clip.ts");
const sceneFraming = read("src/lib/scene-framing.ts");
const server = read("server.ts");

/** A three-minute music video with no script — the case that used to break. */
const footageScene = {
  id: 1,
  project_id: 1,
  order_index: 0,
  text: "",
  image_query: "",
  image_url: null,
  duration: 187.4,
  video_url: "custom-video:cv_abc",
  video_name: "My take",
  video_duration: 187.4,
  video_trim_start: 0,
  video_trim_end: 187.4,
  video_mute: false,
  video_volume: 1,
  video_fit_mode: "trim",
} as Scene;

/* ------------------------------------------------------------------ *
 * 1. the whole video: nothing re-times footage down
 * ------------------------------------------------------------------ */
{
  h.eq(sceneClipSeconds(footageScene), 187.4, "a scene's footage length is read off the clip");
  h.eq(sceneClipSeconds({ ...footageScene, video_url: null }), 0, "a scene with no clip has no footage length");
  h.eq(
    sceneClipSeconds({ ...footageScene, video_duration: undefined }),
    0,
    "a clip whose length was never measured decides nothing"
  );

  // The three actions that used to cut the video short.
  h.eq(
    sceneDurationForScene(footageScene, { singleScene: true, targetDuration: 20 }),
    187.4,
    "Setup's Continue (a 20s target) leaves a one-scene video at its own length"
  );
  h.eq(
    sceneDurationForScene(footageScene, { singleScene: true, targetDuration: 10 }),
    187.4,
    "the 10-second card leaves it alone too"
  );
  h.eq(
    fitSceneDurationForScene(footageScene, { singleScene: true }),
    187.4,
    "Fit to speech does not shrink footage to the three-second floor"
  );

  // And the old behaviour, named so the regression is visible if it returns.
  h.eq(sceneDurationForText("", 20), 20, "the word-count rule on its own still says 20s — which is the cut");
  h.ok(
    sceneDurationForScene(footageScene, { singleScene: true }) > sceneDurationForText("", 20),
    "the footage rule is longer than the rule that used to apply"
  );

  // A one-scene project with only a script is still timed by its words.
  h.eq(
    sceneDurationForScene({ text: "A short line of script.", video_url: null }, { singleScene: true }),
    singleSceneDuration("A short line of script.", undefined),
    "with no footage, the spoken length still decides"
  );

  // Split-scene projects are untouched: the clip is trimmed to the narration
  // there, so the words stay in charge.
  h.eq(
    sceneDurationForScene(footageScene, { singleScene: false, targetDuration: 20 }),
    sceneDurationForText("", 20),
    "a split-scene project still times by words, clip attached or not"
  );

  // The project's own length is the footage's length.
  h.eq(
    projectDurationForScenes([footageScene], { singleScene: true, targetDuration: 20 }),
    187.4,
    "a one-scene project runs for exactly as long as its footage"
  );
  h.near(
    projectDurationForScenes([footageScene, { ...footageScene, id: 2 }], { singleScene: true }),
    374.8,
    0.001,
    "and a longer project is the sum of its scenes"
  );
}

/* ------------------------------------------------------------------ *
 * 1b. the length the RENDER actually schedules
 *
 * Not a re-implementation: `sceneTimelineDuration` and `narrationLeadIn` are
 * the two functions RenderView builds `sceneSchedule` from, and the sum of the
 * windows it produces is the length of the exported file.
 * ------------------------------------------------------------------ */
{
  const scheduleLength = (scenes: Scene[], audioSeconds: number | undefined, voiceover: boolean) => {
    const leadIn = narrationLeadIn(false, voiceover);
    return scenes.reduce((total, scene, index) => {
      const windowDur =
        sceneTimelineDuration(scene, voiceover ? audioSeconds : undefined, { singleScene: true }) +
        (index === 0 ? leadIn : 0);
      return total + windowDur;
    }, 0);
  };

  h.near(
    scheduleLength([footageScene], undefined, false),
    187.4,
    0.001,
    "a 3m07s upload renders as 3m07s — the file is as long as the footage"
  );
  h.near(
    scheduleLength([footageScene], undefined, false),
    sceneDurationForScene(footageScene, { singleScene: true }),
    0.001,
    "and the schedule agrees with the scene's own stored length"
  );

  /* The regression this guards: narration switched back on must not shorten
     the picture. The spoken track is 30 seconds; the footage is not. The extra
     two seconds are the documented narration lead-in (the first frame is held
     before the first words) — the footage itself still plays start to end at
     natural speed, and the file is never SHORTER than it. */
  const withVoice = scheduleLength([footageScene], 30, true);
  h.near(withVoice, 187.4 + NARRATION_LEAD_IN_SECONDS, 0.001, "the lead-in sits on top of the footage, not inside it");
  h.ok(
    withVoice >= sceneFootageLength(footageScene),
    "the rendered file is never shorter than the footage on it, whatever the narration does"
  );
  h.eq(
    narrationLeadIn(false, false),
    0,
    "with no narration there is no opening hold, so the footage starts on frame one and the file is exactly its length"
  );

  // A script scene with a clip trimmed to its narration is unchanged: the two
  // agree, so the floor decides nothing.
  const scriptScene = {
    ...footageScene,
    text: "A short line of narration.",
    duration: 8,
    video_trim_start: 0,
    video_trim_end: 8,
  } as Scene;
  h.eq(
    sceneTimelineDuration(scriptScene, 7.6),
    8,
    "a clip trimmed to its narration still follows the voice, exactly as before"
  );

  /* And the floor does not leak into a multi-scene project. A creator can turn
     the one-scene switch off and ask for twenty-second scenes; the export must
     then be the twenty seconds the timeline shows, not the whole 3m07s clip.
     Without the flag the render and the timeline would disagree. */
  h.eq(
    sceneTimelineDuration({ ...footageScene, video_trim_end: 187.4, duration: 20 }, undefined),
    20,
    "outside a one-scene project the export matches the timeline, not the raw footage"
  );
  h.eq(
    sceneTimelineDuration({ ...footageScene, video_trim_end: 187.4, duration: 20 }, undefined, {
      singleScene: true,
    }),
    187.4,
    "and the same footage does hold its full length once the switch is on"
  );
  h.ok(
    /sceneTimelineDuration\(s, item \? item\.duration : undefined, \{ singleScene \}\)/.test(render),
    "the render passes the one-scene flag into its scene schedule"
  );
  h.ok(
    /singleScene: boolean = false/.test(preview) && /\{ singleScene \}\)/.test(preview),
    "the preview threads the same flag through its timing helpers"
  );
  h.eq(
    sceneFootageLength({ ...footageScene, video_trim_start: 10, video_trim_end: 40 }),
    30,
    "a trimmed-in clip runs for the length the creator chose"
  );
  h.eq(sceneFootageLength({ ...footageScene, video_url: null }), 0, "a scene with no footage has no floor");
}

/* ------------------------------------------------------------------ *
 * 2. the wiring: every re-timing path asks the one rule
 * ------------------------------------------------------------------ */
{
  h.ok(
    app.includes("sceneDurationForScene(s, { singleScene: oneScene, targetDuration: dur })"),
    "Setup's Continue re-times through the footage-aware rule"
  );
  h.ok(
    app.includes("sceneDurationForScene(s, { singleScene: oneScene, targetDuration: targetSeconds })"),
    "the duration cards do too"
  );
  h.ok(
    app.includes("fitSceneDurationForScene(s, { singleScene })"),
    "Fit to speech does too"
  );
  h.ok(
    !/const updated = prev\.map\(\(s\) => \(\{ \.\.\.s, duration: sceneDurationForText\(s\.text, dur\) \}\)\)/.test(app),
    "the word-count-only stamp is gone from the re-timing path"
  );
  h.ok(
    app.includes("onUpdateSceneDuration?.(durToApply, oneScene)") === false &&
      setup.includes("onUpdateSceneDuration?.(durToApply, oneScene)"),
    "Setup says which shape the project is, because its own switch has not landed yet"
  );
  h.ok(
    setup.includes("onUpdateSceneDuration?.(seconds, false)") &&
      setup.includes("onCalibrateScenesWordCount?.(seconds, false)"),
    "and picking 10/20/30 says so explicitly, so footage cannot answer a request for twenty-second scenes"
  );

  // The project's duration follows the footage from the moment it exists.
  h.ok(
    /const projectDuration = footageDuration > 0\s*\? footageDuration\s*:\s*audioDuration > 0\s*\? audioDuration\s*:\s*chosenDuration;/.test(app) &&
      app.includes("default_duration: projectDuration") &&
      app.includes("scene_duration: projectDuration"),
    "a project built from footage is still created at the footage's length, not the target that was showing"
  );
  h.ok(
    /: audioDuration > 0\s*\? audioDuration\s*: chosenDuration;/.test(app),
    "and the new audio source uses its own length only when there is no footage"
  );
  h.ok(
    /const footage = oneScene \? sceneClipSeconds\(scenes\[0\]\) : 0;/.test(app) &&
      app.includes("const projectDuration = footage > 0 ? Math.round(footage * 10) / 10 : dur;"),
    "and re-timing keeps the project at that length"
  );
  /* Saving the script rebuilds the scenes, and it writes the project's length
     too. That write used to be the target unconditionally, so a one-scene
     project whose scene was three minutes long saved a row claiming twenty
     seconds — and the next reload believed it. */
  h.ok(
    /const projectDuration = oneScene && newScenes\.length > 0 \? newScenes\[0\]\.duration : targetDur;/.test(
      app
    ) && app.includes("default_duration: projectDuration }"),
    "saving the script stores the length the scene actually got, not the target"
  );
  h.ok(
    !/default_duration: targetDur \}/.test(app),
    "no path writes the bare target as a one-scene project's length"
  );
  h.ok(
    !/setScenes\(\(prev\) => \{\s*\n\s*const footage = oneScene/.test(app),
    "that decision is taken outside the state updater, which must stay pure"
  );

  // Nothing trims the file away: the trim window is the whole clip.
  h.ok(
    /video_trim_end: clip\.duration/.test(app),
    "the attached clip keeps its full trim window, start to finish"
  );
}

/* ------------------------------------------------------------------ *
 * 3. the original sound: kept by default, gone when asked
 * ------------------------------------------------------------------ */
{
  const kept = clipAudioPlanFor(footageScene, 0, 187.4);
  h.ok(kept !== null, "an uploaded clip's soundtrack is in the render by default");
  h.eq(kept?.whenSeconds, 0, "it starts where its scene starts");
  h.eq(kept?.offsetSeconds, 0, "from the top of the file");
  h.near(kept?.durationSeconds ?? 0, 187.4, 0.001, "and runs the full length of the scene");
  h.eq(kept?.volume, 1, "at the volume the scene asks for");

  h.eq(
    clipAudioPlanFor({ ...footageScene, video_mute: true }, 0, 187.4),
    null,
    "removing the sound means no track at all, not a silent one"
  );
  h.eq(
    clipAudioPlanFor({ ...footageScene, video_volume: 0 }, 0, 187.4),
    null,
    "a volume of zero is the same decision"
  );
  h.eq(
    clipAudioPlanFor({ ...footageScene, video_url: null }, 0, 187.4),
    null,
    "a scene with no footage has no soundtrack to place"
  );

  // A trimmed-in clip starts inside its own audio, and never runs past the scene.
  const trimmed = clipAudioPlanFor(
    { ...footageScene, video_trim_start: 10, video_trim_end: 40 },
    5,
    30
  );
  h.eq(trimmed?.whenSeconds, 5, "a trimmed clip is placed at its scene's position");
  h.eq(trimmed?.offsetSeconds, 10, "reading from where the trim begins");
  h.eq(trimmed?.durationSeconds, 30, "and capped at the scene, so it cannot overrun the video");

  // Both renderers place it, and a muted scene reaches neither.
  h.ok(
    render.includes("clipAudioPlanFor(entry.scene, entry.startTime, entry.duration)"),
    "the renderer asks what should be heard"
  );
  h.eq(
    [...render.matchAll(/clipAudioPlanFor\(entry\.scene, entry\.startTime, entry\.duration\)/g)].length,
    2,
    "in BOTH pipelines — the frame-exact one and the compatibility fallback"
  );
  h.ok(
    render.includes("scheduleClipAudio(offlineCtx, track, plan, offlineMusicAnalyser, 0)"),
    "the frame-exact render decodes and schedules it into its offline mix"
  );
  h.ok(
    render.includes("scheduleClipAudio(audioCtx, track, plan, musicAnalyser, renderAudioT0)"),
    "and the compatibility render schedules it on the live clock"
  );
  h.ok(
    render.includes("has no soundtrack this browser can read"),
    "a clip this browser cannot decode says so instead of exporting silence quietly"
  );
  h.ok(
    preview.includes("sceneCaptionWords(scene)"),
    "the preview and the export read captions the same way"
  );
}

/* ------------------------------------------------------------------ *
 * 4. the choice itself, where the creator can see it
 * ------------------------------------------------------------------ */
{
  h.ok(
    !setup.includes("Keep the original sound") && !setup.includes("handleSetKeepOriginalAudio"),
    "Setup no longer exposes the experimental uploaded-video soundtrack controls"
  );
  h.ok(
    /video_mute: clip\.mute \?\? false/.test(app) && app.includes("const handleUpdateSingleSceneAudio"),
    "existing scene/video tools still preserve and edit the clip's soundtrack state"
  );

  /* Cancelling a transcription is the creator's decision, not a failure. The
     engine reports it by throwing, so it must be told apart here. */
  const hook = read("src/lib/use-clip-transcription.ts");
  h.ok(
    /if \(cancelledRef\.current\) \{\s*setError\(null\);/.test(hook),
    "pressing Cancel clears the error instead of reporting the cancellation as one"
  );

  const nativeVideoSize = { videoWidth: 1920, videoHeight: 1080 };
  h.eq(sourcePixelWidth(nativeVideoSize), 1920, "native videoWidth is accepted as a canvas source width");
  h.eq(sourcePixelHeight(nativeVideoSize), 1080, "native videoHeight is accepted as a canvas source height");
  h.ok(sourceHasPixels(nativeVideoSize), "a decoded native video element is recognised as drawable");
  const videoCrop = sourceRect(nativeVideoSize, { x: 0.25, y: 0.1, w: 0.5, h: 0.75 });
  h.eq(videoCrop.sx, 480, "video crop x uses the native width");
  h.eq(videoCrop.sy, 108, "video crop y uses the native height");
  h.eq(videoCrop.sw, 960, "video crop width uses the native width");
  h.eq(videoCrop.sh, 810, "video crop height uses the native height");

  h.ok(
    !sceneClip.includes("new Proxy(video") &&
      !sceneClip.includes("Object.defineProperties(drawable") &&
      sceneClip.includes("return video;") &&
      sceneFraming.includes('if ("videoWidth" in source)'),
    "canvas receives the unmodified HTMLVideoElement and framing reads its native video dimensions"
  );
  h.ok(
    sceneClip.includes('document.body?.appendChild(el)') &&
      sceneClip.includes("The uploaded video is no longer available") &&
      sceneClip.includes('el.addEventListener("loadedmetadata", primeFirstFrame)') &&
      sceneClip.includes('el.addEventListener("loadeddata", notifyFrame)') &&
      sceneClip.includes('el.addEventListener("seeked", notifyFrame)') &&
      preview.includes("setClipFrameRevision((revision) => revision + 1)") &&
      preview.includes("Loading uploaded video frame…") &&
      preview.includes("Video preview failed:") &&
      preview.includes("loadCustomVideos().then") &&
      !setup.includes("loadCustomVideos") &&
      render.includes("idleSource = asDrawableClip(video)") &&
      render.includes("await loadCustomVideos()"),
    "decoded or restored footage paints scene and render previews while Setup remains script-only"
  );
}

/* ------------------------------------------------------------------ *
 * 5. captions from the footage's own audio
 * ------------------------------------------------------------------ */
{
  // Word-level timings pass straight through.
  const wordLevel = chunksToWordTimings(
    [
      { text: " Hello", timestamp: [0.2, 0.6] },
      { text: " there", timestamp: [0.6, 1.1] },
      { text: " world", timestamp: [1.1, null] },
    ],
    2
  );
  h.ok(wordLevel.wordLevel, "one word per chunk is recognised as word-level timing");
  h.eq(wordLevel.words.length, 3, "every word is kept");
  h.eq(wordLevel.words[0].text, "Hello", "leading spaces are trimmed");
  h.near(wordLevel.words[0].start, 0.2, 0.001, "and its spoken moment is kept exactly");
  h.ok(
    wordLevel.words[2].end > wordLevel.words[2].start,
    "a word with no end (the audio stopped there) still gets one, so the highlight leaves it"
  );

  // Segment timings are spread over the words, weighted by length.
  const segments = chunksToWordTimings(
    [{ text: "The quick brown fox", timestamp: [1, 3] }],
    3
  );
  h.ok(!segments.wordLevel, "several words in one span is recognised as segment timing");
  h.eq(segments.words.length, 4, "and every word in the span is timed");
  h.near(segments.words[0].start, 1, 0.001, "starting where the phrase starts");
  h.near(segments.words[3].end, 3, 0.001, "and ending where it ends");
  h.ok(
    segments.words[2].end - segments.words[2].start > segments.words[0].end - segments.words[0].start,
    "the longer words hold the highlight longer, because they are the slower ones"
  );
  for (let i = 1; i < segments.words.length; i++) {
    h.ok(
      segments.words[i].start >= segments.words[i - 1].end - 0.0001,
      `word ${i + 1} never starts before the one before it finishes`
    );
  }

  h.eq(chunksToWordTimings([], 0).words.length, 0, "an empty transcript stays empty");
  h.eq(wordsToText(wordLevel.words), "Hello there world", "the words read back as a sentence");

  // What lands on the scene, and what the caption clock reads back.
  const fields = sceneUpdatesForTranscript(wordLevel.words, 2);
  h.eq(fields.text, "Hello there world", "the transcript becomes the scene's caption text");
  h.eq(fields.caption_source, "transcript", "and is marked as transcribed, not typed");
  h.eq(fields.caption_audio_duration, 2, "with the length of audio it covers, so a stale one can be spotted");
  h.ok(
    sceneHasTranscript({ ...footageScene, ...fields }),
    "a scene carrying those fields is a transcribed scene"
  );
  h.ok(!sceneHasTranscript(footageScene), "and an ordinary scene is not");

  const untrimmed = sceneCaptionWords({ ...footageScene, ...fields });
  h.near(untrimmed?.[0].start ?? -1, 0.2, 0.001, "an untrimmed clip's words are already in scene time");
  const shifted = sceneCaptionWords({ ...footageScene, ...fields, video_trim_start: 0.5 });
  h.near(shifted?.[0].start ?? -1, 0, 0.001, "a trimmed-in clip's words are shifted to the scene's clock");
  h.near(shifted?.[1].start ?? -1, 0.1, 0.001, "word by word, not just the first");
  h.eq(sceneCaptionWords(footageScene), null, "a scene with no transcript offers no timings");

  h.ok(
    transcriptMatchesClip({ ...footageScene, ...fields, video_duration: 2 }),
    "a transcript covering this footage matches it"
  );
  h.ok(
    !transcriptMatchesClip({ ...footageScene, ...fields, video_duration: 187.4 }),
    "and one made from a different clip is reported as stale rather than trusted"
  );
  h.eq(
    transcriptToCaptionText([
      { text: "Hello", start: 0, end: 1 },
      { text: "world ,", start: 1, end: 2 },
    ]),
    "Hello world,",
    "punctuation is pulled back against its word"
  );
  h.ok(
    TRANSCRIPT_KEYS.includes("caption_words") && TRANSCRIPT_KEYS.includes("caption_source"),
    "the transcript travels with the scene's stored settings, so it survives a reload"
  );
  h.ok(
    app.includes("[...FRAMING_KEYS, ...CLIP_KEYS, ...TRANSCRIPT_KEYS]"),
    "and the app persists those keys"
  );
}

/* ------------------------------------------------------------------ *
 * 5b. one scene has no 10/20/30 target at all
 *
 * The target length is a rule about how long a SPOKEN scene should be. A
 * one-scene project is not measured that way: its length is the footage's, or
 * the time the script takes to read. So the cards are not offered in that
 * mode, and nothing on the way to a new project reaches for 20.
 * ------------------------------------------------------------------ */
{
  // The length of a one-scene project, whatever target the frame was showing.
  h.eq(
    singleSceneDuration("", 187.4),
    187.4,
    "with footage the one-scene length is the footage's, not a target"
  );
  h.eq(
    singleSceneDuration("A short line of narration.", 187.4),
    187.4,
    "and a script does not pull it back to its reading time"
  );
  h.ok(
    singleSceneDuration("A short line of narration.") < 20,
    "with no footage the length is the script's own reading time, not the 20s target"
  );

  // Setup is now script-only: all three duration choices stay visible beside
  // the one-scene option, which only controls scene splitting.
  h.ok(
    setup.includes("DURATION_OPTIONS.map((opt) =>") &&
      setup.includes("onClick={handleSelectSingleScene}") &&
      setup.includes("onUpdateSingleScene?.(true)"),
    "Setup keeps 10/20/30 and one-scene mode as script scene-splitting choices"
  );
  h.ok(
    setup.includes("singleSceneDuration(scriptText)") &&
      !setup.includes("sourceSeconds = singleSource") &&
      !setup.includes("VIDEO_UPLOAD_ACCEPT"),
    "one-scene script duration no longer depends on a Setup media source"
  );
  h.ok(
    setup.includes("handleSelectDuration") && setup.includes("onUpdateSingleScene?.(false)"),
    "choosing 10/20/30 returns the project to split-scene mode"
  );

  /* The regression this guards end to end: a 3m07s upload in a one-scene
     project stays 3m07s through every re-timing pass and into the render. */
  const clipScene = {
    text: "",
    duration: 187.4,
    video_url: "custom-video:x",
    video_name: "my-video.mp4",
    video_duration: 187.4,
    video_trim_start: 0,
    video_trim_end: 187.4,
  } as Scene;
  for (const target of [10, 20, 30]) {
    h.eq(
      sceneDurationForScene(clipScene, { singleScene: true, targetDuration: target }),
      187.4,
      `a ${target}s target on the frame does not shorten a one-scene upload`
    );
  }
  h.eq(
    projectDurationForScenes([clipScene], { singleScene: true, targetDuration: 20 }),
    187.4,
    "and the project's own length is the footage's"
  );
  // The same footage in a split-scene project follows its words, as before.
  h.eq(
    sceneDurationForScene(clipScene, { singleScene: false, targetDuration: 20 }),
    20,
    "outside one-scene mode a target length still applies, exactly as before"
  );
}

/* ------------------------------------------------------------------ *
 * 6. a caption file works too, with no model at all
 * ------------------------------------------------------------------ */
{
  const srt = [
    "1",
    "00:00:01,000 --> 00:00:04,000",
    "Golden light breaks",
    "",
    "2",
    "00:00:04,500 --> 00:00:06,250",
    "across the <i>horizon</i>",
    "",
  ].join("\n");
  const parsed = parseCaptionFile(srt, "captions.srt");
  h.eq(parsed.format, "srt", "an SRT file is recognised");
  h.eq(parsed.words.length, 6, "every word in every cue is timed");
  h.eq(parsed.text, "Golden light breaks across the horizon", "and read back as caption text");
  h.near(parsed.words[0].start, 1, 0.001, "the first word starts with its cue");
  h.near(parsed.audioSeconds, 6.25, 0.001, "the file's own length is reported, to check against the footage");

  const vtt = "WEBVTT\n\n00:00:02.000 --> 00:00:03.000 line:90%\n<c>Two words</c>\n";
  const fromVtt = parseCaptionFile(vtt, "captions.vtt");
  h.eq(fromVtt.format, "vtt", "a VTT file is recognised");
  h.eq(fromVtt.words.length, 2, "its markup is stripped and its words are timed");
  h.ok(!fromVtt.text.includes("<"), "no cue markup reaches the caption text");

  let refused = false;
  try {
    parseCaptionFile("just some words\nwith no timings at all", "notes.txt");
  } catch (err) {
    refused = err instanceof CaptionFileError;
  }
  h.ok(refused, "a file with no timed cues says so, instead of quietly producing nothing");

  h.ok(
    captions.includes("parseCaptionFile(await file.text(), file.name)"),
    "the Captions step can read one"
  );
}

/* ------------------------------------------------------------------ *
 * 7. where the captions are made, and what it costs
 * ------------------------------------------------------------------ */
{
  h.ok(
    /Generate captions from \$\{source\?\.label \?\? "the audio"\}/.test(captions),
    "the Captions step offers to transcribe a scene's footage, and names the audio it will read"
  );
  h.ok(!setup.includes("Generate captions") && !setup.includes("Free and on this device"),
    "Setup no longer contains the experimental video-audio transcription controls");
  h.ok(
    captions.includes("sceneHasClip(scene)") && captions.includes("<SceneTranscriptControls"),
    "the controls appear on scenes that have footage, and only on those"
  );
  h.ok(
    render.includes("const spokenWords = audioBuffers.get(currentScene.id)?.words;") &&
      render.includes("const footageWords = spokenWords ? null : sceneCaptionWords(currentScene);") &&
      render.includes("wordTimings: spokenWords ?? footageWords,"),
    "the export drives captions from the narration when there is one, and from the transcript when there is not"
  );
  h.ok(
    preview.includes("wordTimings: sa?.words ?? footageWords"),
    "and the preview highlights the same words at the same moments"
  );

  /* The two clocks are not the same clock. A provider's word timings start
     when the speech starts, which is after the opening hold; a transcript's
     are the footage's own, which start with the scene. Feeding the transcript
     the speech clock would put every caption two seconds late. */
  h.ok(
    /audioTimeSec: footageWords \? elapsedInScene : speechElapsed/.test(render),
    "the export reads the footage's clock for transcribed captions"
  );
  h.ok(
    /audioTimeSec: footageWords \? Math\.max\(0, elapsedInScene \?\? 0\) : speechElapsed \?\? 0/.test(preview),
    "and so does the preview, so the two can never disagree about where a word lands"
  );
  h.ok(
    NARRATION_LEAD_IN_SECONDS > 0,
    "which matters: the opening hold is long enough to see a caption drift"
  );

  // The engine: free, on-device, pinned, and out of the main/UI bundle.
  const stt = read("src/lib/speech-to-text.ts");
  const sttWorker = read("src/lib/speech-to-text.worker.ts");
  const progressUi = read("src/components/TranscriptionProgressStatus.tsx");
  h.ok(STT_ENGINE_URL.startsWith("https://cdn.jsdelivr.net/npm/@huggingface/transformers@"), "the engine comes from one pinned version");
  h.ok(
    /transformers@\d+\.\d+\.\d+/.test(STT_ENGINE_URL),
    "pinned to an exact version, so a new release cannot arrive by itself"
  );
  h.ok(STT_MODEL_CANDIDATES.every((m) => m.startsWith("onnx-community/whisper")), "the models are Whisper");
  h.ok(
    sttWorker.includes("import(/* @vite-ignore */ url)") &&
      stt.includes('new URL("./speech-to-text.worker.ts", import.meta.url)'),
    "loaded on demand inside a dedicated module worker, not the main/UI bundle"
  );
  h.ok(!read("package.json").includes("transformers"), "and it is not an install-time dependency, so the install cannot fail because of it");
  h.ok(sttWorker.includes("allowLocalModels = false"), "weights come from the hub, never a local folder");
  h.ok(
    server.includes("https://cdn.jsdelivr.net") && server.includes("https://huggingface.co"),
    "the policy allows exactly the two hosts the engine needs"
  );
  h.ok(
    server.includes("'wasm-unsafe-eval'") && !/script-src[^;]*'unsafe-eval'/.test(server),
    "and permits WASM compilation without permitting arbitrary eval"
  );

  // These are the canonical timestamped ids used in upstream examples/tests;
  // the old base_en spellings did not match that published model family.
  h.eq(
    STT_MODEL_CANDIDATES.join("|"),
    [
      "onnx-community/whisper-tiny.en_timestamped",
      "onnx-community/whisper-base.en_timestamped",
      "onnx-community/whisper-base_timestamped",
    ].join("|"),
    "every fallback uses a published timestamped Whisper model id, with the low-memory model first"
  );
  h.eq(
    defaultTranscriptionModels(STT_LOW_MEMORY_CLIP_SECONDS - 1).length,
    STT_MODEL_CANDIDATES.length,
    "short clips retain the published model-load fallback list"
  );
  h.eq(
    defaultTranscriptionModels(STT_LOW_MEMORY_CLIP_SECONDS).length,
    1,
    "five-minute and longer clips stay on Tiny instead of loading a larger model into an already full browser"
  );
  h.eq(
    defaultTranscriptionModels(STT_LOW_MEMORY_CLIP_SECONDS)[0],
    STT_MODEL_CANDIDATES[0],
    "the long-clip model is the low-memory Tiny candidate"
  );
  h.ok(
    STT_AUDIO_TIMEOUT_MS > 0 &&
      STT_ENGINE_TIMEOUT_MS > 0 &&
      STT_MODEL_TIMEOUT_MS > 0 &&
      STT_INFERENCE_MIN_TIMEOUT_MS > 0,
    "audio decode, engine, model download and inference all have finite timeout budgets"
  );
  h.ok(
    (stt.match(/armTimeout\(/g) || []).length >= 3 &&
      stt.includes("terminateTranscriptionWorker(worker)") &&
      stt.includes("worker.terminate()") &&
      sttWorker.includes('engine.pipeline("automatic-speech-recognition"') &&
      sttWorker.includes("transcriber(audio.subarray(start, end)"),
    "UI-thread timers can terminate stalled engine, model and windowed-inference work"
  );
  h.ok(
    stt.includes("finish(() => resolve(message), true)") &&
      stt.includes("finish(() => reject(workerFailure(message)), true)") &&
      read("src/lib/use-clip-transcription.ts").includes("useEffect(() => () =>") &&
      read("src/lib/use-clip-transcription.ts").includes("abortRef.current?.abort()"),
    "success, failure and section exit all terminate Whisper so model memory cannot freeze the next screen"
  );
  h.ok(
    sttWorker.includes("decoded.duration >= STT_LOW_MEMORY_CLIP_SECONDS") &&
      sttWorker.includes("request.models.slice(0, 1)") &&
      sttWorker.includes('failure(id, "inference", detail);') &&
      !sttWorker.includes("That model could not finish the transcription. Trying fallback"),
    "measured long audio and late inference failures cannot load a larger model and repeat the recording"
  );
  h.ok(
    app.includes("{ ...updates, burn_caption: true }") &&
      app.includes("handleUpdateCaptionsConfig({ ...captionsConfig, enabled: true })") &&
      captions.includes("onEnableCaptions={enableGeneratedCaptions}"),
    "a successful transcript turns project and scene captions on rather than hiding the generated words"
  );
  h.ok(
    stt.includes("The transcription engine failed to load") &&
      stt.includes("The Whisper transcription models failed to load") &&
      stt.includes("Whisper loaded, but transcription failed while listening"),
    "engine-load, model-load and inference failures have distinct user-facing messages"
  );
  h.ok(
    stt.includes("response.blob()") &&
      !stt.includes("decodeAudioData(") &&
      sttWorker.includes("new BlobSource(source)") &&
      sttWorker.includes("new AudioSampleSink(track)") &&
      read("src/lib/speech-to-text-protocol.ts").includes("source: Blob") &&
      read("package.json").includes('"mediabunny": "1.62.0"'),
    "the page clones only a Blob handle while worker-side demuxing, decoding and resampling avoid a giant UI-thread ArrayBuffer"
  );
  h.ok(
    sttWorker.includes("numThreads = 1") &&
      stt.includes("setInterval(() =>") &&
      stt.includes("first 30-second section in the background"),
    "Whisper cannot occupy the UI thread or every CPU core, and a heartbeat remains visible during inference"
  );
  h.ok(
    sttWorker.includes('event: "inference-progress"') &&
      sttWorker.includes("completedSeconds / duration") &&
      sttWorker.includes("audio.subarray(start, end)"),
    "transcription percentage comes from completed audio windows rather than an invented timer"
  );
  h.ok(
    sttWorker.includes('return_timestamps: useWordTimestamps ? "word" : true') &&
      sttWorker.includes('encoder_model: decoded.duration >= STT_LOW_MEMORY_CLIP_SECONDS ? "q4" : "q8"'),
    "long recordings use lower-memory segment timing and q4 encoding while still yielding timed caption words"
  );
  h.ok(
    sttWorker.includes("midpoint < trustedStart || midpoint >= trustedEnd") &&
      sttWorker.includes("Math.min(duration, absoluteEnd)") &&
      sttWorker.includes('"no-speech"'),
    "overlap merging keeps one bounded timestamp per word and preserves the distinct no-speech result"
  );
  h.ok(
    progressUi.includes('role="dialog"') &&
      progressUi.includes('role="progressbar"') &&
      progressUi.includes('aria-live="polite"') &&
      progressUi.includes("Large on-device process") &&
      progressUi.includes("Audio completed") &&
      progressUi.includes("waitingForFirstWindow") &&
      progressUi.includes("Cancel transcription") &&
      read("src/components/CaptionsStudio.tsx").includes("<TranscriptionProgressStatus") &&
      read("src/components/CaptionsStudio.tsx").includes("sourceSeconds={source?.seconds || 0}") &&
      read("src/components/CaptionsStudio.tsx").includes("transcriptionButtonLabel(transcription.progress)") &&
      !read("src/components/SetupStudio.tsx").includes('"Listening…"') &&
      !read("src/components/CaptionsStudio.tsx").includes('"Listening…"'),
    "Captions opens an accessible process window with elapsed time, real audio progress and cancellation"
  );
  const transcriptionHook = read("src/lib/use-clip-transcription.ts");
  h.ok(
    (transcriptionHook.match(/abortRef\.current\?\.abort\(\)/g) || []).length >= 3 &&
      transcriptionHook.includes("runRef.current += 1") &&
      transcriptionHook.includes("signal: abortController.signal"),
    "cancel, reset and a superseding run abort in-flight work instead of waiting for its timeout"
  );

  let timeoutError: unknown = null;
  let operationWasAborted = false;
  try {
    await runWithTranscriptionTimeout(
      (signal) => new Promise<never>(() => {
        signal.addEventListener("abort", () => { operationWasAborted = true; }, { once: true });
      }),
      5,
      "Whisper test operation stalled."
    );
  } catch (error) {
    timeoutError = error;
  }
  h.ok(timeoutError instanceof TranscriptionTimeoutError, "a stalled operation rejects instead of hanging forever");
  h.eq((timeoutError as Error)?.message, "Whisper test operation stalled.", "the timeout reason is fit to show in the UI");
  h.ok(operationWasAborted, "the timed-out operation receives an AbortSignal as well as a rejected race");

  const parentAbort = new AbortController();
  let cancelledOperationStarted = false;
  let cancellationError: unknown = null;
  const cancelledRun = runWithTranscriptionTimeout(
    async () => {
      cancelledOperationStarted = true;
      return "too late";
    },
    1_000,
    "unused timeout",
    parentAbort.signal
  );
  parentAbort.abort();
  try {
    await cancelledRun;
  } catch (error) {
    cancellationError = error;
  }
  h.ok(cancellationError instanceof TranscriptionError, "caller cancellation rejects with the distinct cancellation error");
  h.eq((cancellationError as Error)?.message, "Transcription cancelled.", "cancellation never masquerades as an engine timeout");
  h.eq(cancelledOperationStarted, false, "an immediately superseded run never starts its expensive operation");
}

/* ------------------------------------------------------------------ *
 * 8. the timeline and the exported file are the same length
 *
 * The render holds the first frame for the narration lead-in before the
 * first words, so the file really is two seconds longer than the sum of
 * the scene durations. App's `estimatedTotalDuration` used to omit that
 * hold, which was not just a wrong readout: whole-video media is
 * stretched to that same number, and `renderTimelineInsert` stops drawing
 * once time passes `startTime + duration` — so a full-video visualiser
 * vanished two seconds before the end of its own video.
 * ------------------------------------------------------------------ */
{
  // App's formula, read back from the source so this cannot drift from it.
  h.ok(
    /const speaks = voiceoverEnabled && projectHasNarration\(scenes\);/.test(app) &&
      /const leadIn = narrationLeadIn\(intro > 0, speaks\);/.test(app) &&
      /Math\.round\(\(intro \+ leadIn \+ script \+ outro\) \* 10\) \/ 10/.test(app),
    "the timeline total includes the narration lead-in the render actually adds"
  );
  h.ok(
    /\}, \[scenes, introSection, outroSection, voiceoverEnabled\]\);/.test(app),
    "and it is recomputed when the narration switch changes"
  );

  /* Both sides, computed the way each side computes it. The render adds the
     hold to the FIRST scene's window; the timeline adds it once. */
  const timeline = (sceneDur: number, introSec: number, outroSec: number, voiceover: boolean) => {
    const intro = introSec > 0 ? Math.max(0.5, introSec) : 0;
    const outro = outroSec > 0 ? Math.max(0.5, outroSec) : 0;
    const leadIn = narrationLeadIn(intro > 0, voiceover);
    return Math.max(1, Math.round((intro + leadIn + Math.max(1, sceneDur) + outro) * 10) / 10);
  };
  const exported = (sceneDur: number, introSec: number, outroSec: number, voiceover: boolean) => {
    const intro = introSec > 0 ? Math.max(0.5, introSec) : 0;
    const outro = outroSec > 0 ? Math.max(0.5, outroSec) : 0;
    return Math.max(1, intro + sceneDur + narrationLeadIn(intro > 0, voiceover) + outro);
  };

  const cases: [string, number, number, number, boolean][] = [
    ["a one-scene upload, no narration", 187.4, 0, 0, false],
    ["a one-scene upload, narration on", 187.4, 0, 0, true],
    ["a script project, narration on", 60, 0, 0, true],
    ["with an intro", 60, 4, 0, true],
    ["with an intro and an outro", 60, 4, 3, true],
    ["intro and outro, no narration", 60, 4, 3, false],
  ];
  for (const [label, sceneDur, introSec, outroSec, voiceover] of cases) {
    h.near(
      timeline(sceneDur, introSec, outroSec, voiceover),
      exported(sceneDur, introSec, outroSec, voiceover),
      0.05,
      `timeline and export agree: ${label}`
    );
  }

  // The visible symptom: a full-video visualiser stretched to the timeline
  // total must still be on screen in the last two seconds of the file.
  const visualiser = {
    id: "v1",
    category: "audio_visualizers",
    type: "bars",
    title: "Bars",
    startTime: 0,
    duration: 10,
    position: { x: 0.5, y: 0.5 },
    size: 1,
    visualOptions: { spanFullVideo: true },
  } as TimelineInsert;
  const total = timeline(187.4, 0, 0, true);
  const stretched = stretchFullVideoMedia([visualiser], total)[0];
  h.near(stretched.duration, 189.4, 0.05, "a full-video visualiser is stretched to the real length");
  // The exact visibility test renderTimelineInsert applies.
  const t = 188.5;
  h.ok(
    !(t < stretched.startTime || t > stretched.startTime + stretched.duration),
    `and it is still drawn at ${t}s, inside the last two seconds of the export`
  );
}

/* ------------------------------------------------------------------
 * 9. Captions are never read aloud over the sound they came from
 *
 * A transcript writes the words it heard into `scene.text`, because that is
 * the field the caption renderer reads. Voiceover defaults to ON, and the
 * renderer speaks whatever it finds in `scene.text` — so captioning a music
 * video and then switching narration back on used to put a synthesised voice
 * reading the lyrics over the song. Nothing ever replaced or removed the
 * soundtrack; a second voice was simply laid on top of it.
 * ------------------------------------------------------------------ */
{
  const transcript = sceneUpdatesForTranscript(
    [
      { text: "Never", start: 1.2, end: 1.6 },
      { text: "gonna", start: 1.6, end: 1.9 },
      { text: "give", start: 1.9, end: 2.2 },
      { text: "you", start: 2.2, end: 2.5 },
      { text: "up", start: 2.5, end: 2.9 },
    ],
    187.4
  );

  h.eq(transcript.caption_source, "transcript", "a transcript records where its words came from");
  h.eq(transcript.text, "Never gonna give you up", "and those words still become the captions");

  // The point of the change: captions are shown, never spoken.
  h.eq(narratableText(transcript), "", "words transcribed from the soundtrack are never narrated");
  h.eq(
    narratableText({ text: "Welcome to the show" }),
    "Welcome to the show",
    "words the creator wrote are still narrated, exactly as before"
  );
  h.eq(
    narratableText({ text: "   " }),
    "",
    "a scene with nothing but whitespace has nothing to say"
  );

  // And so the render no longer holds the first frame waiting for words that
  // will never come.
  h.eq(projectHasNarration([transcript]), false, "a captioned music video speaks nothing");
  h.eq(
    projectHasNarration([transcript, { text: "Welcome to the show" }]),
    true,
    "one written scene is enough to make the project a narrated one"
  );
  h.eq(projectHasNarration([]), false, "an empty project speaks nothing");

  h.eq(
    narrationLeadIn(false, projectHasNarration([transcript])),
    0,
    "so a captioned music video starts at zero instead of holding a silent frame"
  );
  h.eq(
    narrationLeadIn(false, projectHasNarration([{ text: "Welcome to the show" }])),
    NARRATION_LEAD_IN_SECONDS,
    "while a narrated project still holds its opening for the first words"
  );

  // The renderer, the timeline readout and the preview must all ask the same
  // question, or the export opens on a different frame from the preview.
  const render = read("src/components/RenderView.tsx");
  h.ok(
    /const speaks = voiceoverEnabled && projectHasNarration\(scenesWithImages\);/.test(render) &&
      /const leadIn = narrationLeadIn\(Boolean\(introSec\), speaks\);/.test(render),
    "the renderer decides its lead-in from what will actually be spoken"
  );
  h.ok(
    /const spokenText = narratableText\(s\);/.test(render) &&
      /await fetchSceneAudioWithTimeline\(spokenText,/.test(render),
    "and it sends only the creator's own words to the speech engine"
  );

  /* The bypass this guards: `resolveSceneAudioBuffer` reads `scene.audio_url`,
     which a narration generated for an EARLIER script leaves behind, and
     installing a transcript does not clear it. Resolving before the text check
     would resurrect that old voice over the song the captions came from, so a
     caption-only scene has to be skipped before the resolve, not after it. */
  h.ok(
    /if \(s\.caption_source === "transcript"\) continue;/.test(render),
    "a caption-only scene is skipped before its saved narration is resolved"
  );
  const gateAt = render.indexOf('if (s.caption_source === "transcript") continue;');
  const resolveAt = render.indexOf("let resolved = await resolveSceneAudioBuffer(s, audioCtx);");
  h.ok(
    gateAt > 0 && resolveAt > gateAt,
    "and the skip really does come before the resolve it is guarding"
  );

  /* The guarantee is structural, not a list of patched call sites: narration
     reaches the voice bus only through `audioBuffers`, and that map has exactly
     one writer, inside the gated loop. Both render paths (offline export and
     realtime) read from it, so closing the loop closes both. */
  h.eq(
    (render.match(/audioBuffers\.set\(/g) || []).length,
    1,
    "narration has exactly one way into the voice bus"
  );
  const writerAt = render.indexOf("audioBuffers.set(");
  h.ok(
    writerAt > gateAt && writerAt > resolveAt,
    "and that single writer sits behind the caption-only skip"
  );
  h.eq(
    (render.match(/audioBuffers\.get\(entry\.scene\.id\)/g) || []).length,
    2,
    "both the offline export and the realtime preview read that same map"
  );

  // With nothing spoken, the caption clock spans the scene rather than being
  // estimated from words that are only ever drawn.
  h.ok(
    /!voiceoverEnabled \|\| !narratableText\(s\)/.test(render),
    "a caption-only scene times its captions to the picture, not to an imagined reading"
  );

  const preview = read("src/components/VideoPreview.tsx");
  h.ok(
    /const speaks = voiceoverEnabled && projectHasNarration\(scenesWithImages\);/.test(preview),
    "the preview asks the same question over the same scenes"
  );
  h.ok(
    !/Boolean\(introSec\), voiceoverEnabled/.test(preview),
    "no preview call site still passes the bare voiceover switch as the lead-in"
  );

  /* The live preview has its own narration loader, separate from RenderView.
     It must apply the same rule before resolving stale saved narration, or the
     preview speaks captions even though the exported file is clean. */
  h.ok(
    preview.includes('import { narratableText, projectHasNarration, sceneCaptionWords } from "../lib/clip-transcript";'),
    "the preview imports the shared captions-versus-narration rule"
  );
  const synthAt = preview.indexOf("const synthesizeScene = useCallback(");
  const generateAt = preview.indexOf("const generateAllAudio = useCallback(");
  const synthSource = preview.slice(synthAt, generateAt);
  h.ok(
    synthAt > 0 && /const text = narratableText\(scene\);/.test(synthSource),
    "preview synthesis derives speech from narratableText rather than raw caption text"
  );
  const previewSkipAt = synthSource.indexOf('if (scene.caption_source === "transcript") return null;');
  const previewResolveAt = synthSource.indexOf("const resolved = await resolveSceneAudioBuffer(scene, audioCtx);");
  h.ok(
    previewSkipAt > 0 && previewResolveAt > previewSkipAt,
    "the preview skips caption-only scenes before stale saved narration can be resolved"
  );
  h.ok(
    /const spokenText = narratableText\(s\);[\s\S]{0,260}if \(s\.caption_source === "transcript"\) return false;/.test(preview),
    "the play-button missing-audio check is caption-aware too"
  );

  /* One failed provider request must not throw away voices that succeeded for
     other scenes. The warning is rendered in the controls, not console-only. */
  h.ok(
    preview.includes("await Promise.allSettled(") && !synthSource.includes("Promise.allSettled"),
    "preview narration settles each scene independently"
  );
  h.ok(
    preview.includes("Narration failed for scene") &&
      preview.includes("Preview continues without") &&
      preview.includes('role="status" aria-live="polite"'),
    "a missing scene voice is surfaced to the creator while the preview continues"
  );
}

h.done("one-scene-upload");
