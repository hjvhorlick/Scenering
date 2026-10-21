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
import { chunksToWordTimings, wordsToText, STT_ENGINE_URL, STT_MODEL_CANDIDATES } from "../src/lib/speech-to-text";
import {
  sceneCaptionWords,
  sceneHasTranscript,
  sceneUpdatesForTranscript,
  transcriptMatchesClip,
  transcriptToCaptionText,
  TRANSCRIPT_KEYS,
} from "../src/lib/clip-transcript";
import { parseCaptionFile, CaptionFileError } from "../src/lib/caption-file";
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
    /const projectDuration = footageDuration > 0 \? footageDuration : chosenDuration;/.test(app) &&
      app.includes("default_duration: projectDuration") &&
      app.includes("scene_duration: projectDuration"),
    "a project built from footage is created at the footage's length, not the target that was showing"
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
  h.ok(setup.includes("Keep the original sound"), "Setup offers to keep the soundtrack");
  h.ok(setup.includes("> Remove it") || setup.includes("Remove it\n"), "and to take it out");
  h.ok(
    setup.includes("handleSetKeepOriginalAudio(true)") && setup.includes("handleSetKeepOriginalAudio(false)"),
    "both choices are reachable"
  );
  h.ok(
    setup.includes("aria-pressed={keepOriginalAudio}"),
    "and they are announced as the state they are in"
  );
  h.ok(
    setup.includes("mute: !keepOriginalAudio"),
    "the choice is stored as the scene's own mute field, the one the clip panel already used"
  );
  h.ok(
    /video_mute: clip\.mute \?\? false/.test(app),
    "a project created from footage keeps its sound unless the creator said otherwise"
  );
  h.ok(
    app.includes("const handleUpdateSingleSceneAudio") &&
      app.includes("void handleUpdateScene(target.id, { video_mute: !keepOriginalAudio });"),
    "changing it later writes the same field, so Setup and the scene editor cannot disagree"
  );

  /* The switch has to OPEN showing what the project already says. It used to
     start at "keep" whatever the scene held, so footage muted in the clip panel
     came back to Setup claiming its sound was on. */
  h.ok(
    /useEffect\(\(\) => \{\s*const clipScene = scenes\.find\(\(sc\) => sc\.video_url\);\s*if \(clipScene\) setKeepOriginalAudio\(!clipScene\.video_mute\);/.test(
      setup
    ),
    "the sound switch opens on the scene's own mute field, not on a default"
  );
  h.ok(
    !/wantCaptions/.test(setup),
    "and the caption request is not tracked in state nothing ever reads"
  );

  /* Cancelling a transcription is the creator's decision, not a failure. The
     engine reports it by throwing, so it must be told apart here. */
  const hook = read("src/lib/use-clip-transcription.ts");
  h.ok(
    /if \(cancelledRef\.current\) \{\s*setError\(null\);/.test(hook),
    "pressing Cancel clears the error instead of reporting the cancellation as one"
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

  // Setup must not offer a target length while in one-scene mode, and must not
  // pass one when the project is created.
  h.ok(
    /\{oneScene \? \([\s\S]*?Split into scenes[\s\S]*?\) : \(\s*<div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4/.test(
      setup
    ),
    "the 10/20/30 cards are not rendered in one-scene mode"
  );
  h.ok(
    setup.includes("const durToApply = oneScene") &&
      setup.includes("singleSceneDuration(scriptText, footageSeconds || undefined)"),
    "and starting a one-scene project uses the footage's length, never the 20s target"
  );
  h.ok(
    !/const durToApply = selectedDuration \|\| 20;/.test(setup),
    "the unconditional 20-second default is gone from that path"
  );
  h.ok(
    setup.includes("handleExitSingleScene"),
    "leaving one-scene mode is still one click, so the target length is reachable when wanted"
  );
  /* And it has to be the SAME click as picking that length on a card. A partial
     copy split the scenes but never told the parent the new target, so the
     project kept the footage's length stored while its scenes were twenty
     seconds long. */
  h.ok(
    /handleSelectDuration\(\s*activeDuration,/.test(setup),
    "leaving one-scene mode goes through the same handler a duration card uses"
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
    captions.includes("Generate captions from the video's audio"),
    "the Captions step offers to transcribe a scene's footage"
  );
  h.ok(setup.includes("Generate captions"), "Setup offers it next to the upload");
  h.ok(
    setup.includes("Free and on this device") && setup.includes("no key"),
    "and says plainly that it costs nothing and uploads nothing"
  );
  h.ok(
    setup.includes("Captions are still taken from it first") ||
      setup.includes("captions still work with the sound removed"),
    "removing the sound is said out loud not to remove the captions"
  );
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

  // The engine: free, on-device, pinned, and out of the main bundle.
  const stt = read("src/lib/speech-to-text.ts");
  h.ok(STT_ENGINE_URL.startsWith("https://cdn.jsdelivr.net/npm/@huggingface/transformers@"), "the engine comes from one pinned version");
  h.ok(
    /transformers@\d+\.\d+\.\d+/.test(STT_ENGINE_URL),
    "pinned to an exact version, so a new release cannot arrive by itself"
  );
  h.ok(STT_MODEL_CANDIDATES.every((m) => m.startsWith("onnx-community/whisper")), "the models are Whisper");
  h.ok(stt.includes("import(/* @vite-ignore */ STT_ENGINE_URL)"), "loaded on demand, not from the main bundle");
  h.ok(!read("package.json").includes("transformers"), "and it is not an install-time dependency, so the install cannot fail because of it");
  h.ok(stt.includes("allowLocalModels = false"), "weights come from the hub, never a local folder");
  h.ok(
    server.includes("https://cdn.jsdelivr.net") && server.includes("https://huggingface.co"),
    "the policy allows exactly the two hosts the engine needs"
  );
  h.ok(
    server.includes("'wasm-unsafe-eval'") && !/script-src[^;]*'unsafe-eval'/.test(server),
    "and permits WASM compilation without permitting arbitrary eval"
  );
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
    /const leadIn = narrationLeadIn\(intro > 0, voiceoverEnabled\);/.test(app) &&
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

h.done("one-scene-upload");
