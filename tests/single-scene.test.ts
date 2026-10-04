/* ------------------------------------------------------------------ *
 * One-scene projects, uploaded footage, and the voiceover switch.
 *
 * Three things were added together because they are one workflow: someone
 * making a music video picks "One Scene", uploads their footage, and turns
 * the narration off. What this suite pins down:
 *
 *   1. A one-scene project really is ONE scene — whatever the script's
 *      length, whatever the scene-duration setting says.
 *   2. Its length is the real length. The normal splitter clamps a scene to
 *      1.6x its target so a 20-second scene cannot quietly become a minute;
 *      a one-scene project has no target to be clamped to, and uploaded
 *      footage overrides the estimate with its true runtime.
 *   3. With narration off there is no opening hold, no synthesis and no
 *      spoken track — in the preview AND in the export, from the same shared
 *      formula, so the two cannot drift apart.
 * ------------------------------------------------------------------ */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NARRATION_LEAD_IN_SECONDS,
  SINGLE_SCENE,
  SINGLE_SCENE_OPTION,
  countScenesFromScript,
  countWords,
  isSingleScene,
  narrationLeadIn,
  sceneDurationForText,
  singleSceneDuration,
  splitScriptIntoScenes,
} from "../src/lib/duration-utils";
import {
  CUSTOM_VIDEO_PREFIX,
  MAX_CUSTOM_VIDEO_BYTES,
  customVideoId,
  isCustomVideoUrl,
  resolveVideoUrl,
} from "../src/lib/custom-video";
import { createHarness } from "./harness";

const h = createHarness();
const ok = h.ok;
const eq = h.eq;

const read = (rel: string) =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", rel), "utf8");

/* A script long enough that every other mode would split it. */
const LONG_SCRIPT = Array.from(
  { length: 12 },
  (_, i) =>
    `Sentence number ${i + 1} carries roughly a dozen words so the whole script is unmistakably long enough to be split.`
).join(" ");

/* ------------------------------------------------------------------ *
 * 1. one scene means one scene
 * ------------------------------------------------------------------ */
{
  ok(countWords(LONG_SCRIPT) > 100, "the fixture script is long enough to be worth splitting");

  for (const target of [10, 20, 30]) {
    ok(
      splitScriptIntoScenes(LONG_SCRIPT, target).length > 1,
      `${target}s mode still splits a long script into several scenes`
    );
    eq(
      splitScriptIntoScenes(LONG_SCRIPT, target, true).length,
      1,
      `one-scene mode keeps the whole script together at the ${target}s setting`
    );
    eq(
      countScenesFromScript(LONG_SCRIPT, target, true),
      1,
      `the scene count shown in Setup says 1 at the ${target}s setting`
    );
  }

  eq(
    splitScriptIntoScenes(LONG_SCRIPT, 20, true)[0],
    LONG_SCRIPT.replace(/\s+/g, " ").trim(),
    "the single scene holds the script verbatim — nothing is dropped or rewritten"
  );

  // Paragraph breaks are collapsed, exactly as the splitter already does.
  const paragraphs = "First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.";
  eq(splitScriptIntoScenes(paragraphs, 20, true).length, 1, "paragraph breaks do not create scenes");
  eq(splitScriptIntoScenes("", 20, true).length, 0, "an empty script still produces no scenes");
  eq(splitScriptIntoScenes("   \n  ", 20, true).length, 0, "whitespace alone produces no scenes");
}

{
  // The splitter's old behaviour must be untouched when the flag is absent.
  for (const target of [10, 20, 30]) {
    eq(
      JSON.stringify(splitScriptIntoScenes(LONG_SCRIPT, target)),
      JSON.stringify(splitScriptIntoScenes(LONG_SCRIPT, target, false)),
      `${target}s splitting is byte-identical with the flag defaulted and explicitly off`
    );
  }
  ok(isSingleScene(SINGLE_SCENE), "the single-scene choice identifies itself");
  ok(!isSingleScene(20), "a numeric duration is not the single-scene choice");
  eq(SINGLE_SCENE_OPTION.id, SINGLE_SCENE, "the Setup card and the splitter agree on the choice id");
}

/* ------------------------------------------------------------------ *
 * 2. the single scene is as long as it really is
 * ------------------------------------------------------------------ */
{
  // ~250 words at 2.5 words/second is about 100 seconds of speech.
  const spokenSeconds = countWords(LONG_SCRIPT) / 2.5;
  const clamped = sceneDurationForText(LONG_SCRIPT, 20);
  const honest = singleSceneDuration(LONG_SCRIPT);

  ok(clamped <= 20 * 1.6 + 0.001, "the normal path still clamps a scene to 1.6x its target");
  ok(honest > clamped, "a one-scene project is not squeezed into a 20-second target");
  h.near(honest, spokenSeconds + 0.4, 0.6, "the single scene lasts as long as the words take to say");

  // Footage wins over the estimate: the video IS the scene.
  eq(singleSceneDuration(LONG_SCRIPT, 42.5), 42.5, "uploaded footage sets the scene length exactly");
  eq(singleSceneDuration("", 185.2), 185.2, "footage with no script still sets the length");
  eq(singleSceneDuration("", 0), 10, "a scene with neither words nor footage falls back to 10s");
  ok(singleSceneDuration("Just a few words.") >= 3, "a very short script still gets a usable length");

  for (const seconds of [0.5, 7, 63.4, 212, 3600]) {
    eq(
      singleSceneDuration("anything at all", seconds),
      Math.round(seconds * 10) / 10,
      `${seconds}s of footage is reported back unchanged`
    );
  }
}

/* ------------------------------------------------------------------ *
 * 3. the opening hold belongs to the narration
 * ------------------------------------------------------------------ */
{
  eq(narrationLeadIn(false, true), NARRATION_LEAD_IN_SECONDS, "a narrated opening still holds the first frame");
  eq(narrationLeadIn(true, true), 0, "an intro section is its own opening, so there is no extra hold");
  eq(narrationLeadIn(false, false), 0, "with no narration there are no first words to wait for");
  eq(narrationLeadIn(true, false), 0, "neither an intro nor narration means no hold at all");
  eq(narrationLeadIn(false), NARRATION_LEAD_IN_SECONDS, "the default is the old narrated behaviour");

  // The preview and the renderer must read the SAME function, or the first
  // cut lands on a different frame in each.
  const preview = read("src/components/VideoPreview.tsx");
  const render = read("src/components/RenderView.tsx");
  ok(preview.includes("narrationLeadIn("), "the live preview takes its lead-in from the shared rule");
  ok(render.includes("narrationLeadIn("), "the renderer takes its lead-in from the shared rule");
  ok(
    !/sceneIdx === 0 && !hasIntro \? NARRATION_LEAD_IN_SECONDS/.test(preview),
    "the preview no longer carries its own private copy of the lead-in rule"
  );
  ok(
    !/const narrationLeadIn = introSec \? 0 : NARRATION_LEAD_IN_SECONDS/.test(render),
    "the renderer no longer carries its own private copy either"
  );
}

/* ------------------------------------------------------------------ *
 * 4. uploaded footage is addressed, not embedded
 * ------------------------------------------------------------------ */
{
  ok(isCustomVideoUrl(`${CUSTOM_VIDEO_PREFIX}cv_abc123`), "an upload address is recognised");
  ok(!isCustomVideoUrl("https://example.com/clip.mp4"), "a remote URL is not an upload address");
  ok(!isCustomVideoUrl("blob:http://localhost/abc"), "a blob URL is not an upload address");
  ok(!isCustomVideoUrl(null) && !isCustomVideoUrl(undefined), "nothing is not an upload address");
  eq(customVideoId(`${CUSTOM_VIDEO_PREFIX}cv_abc123`), "cv_abc123", "the id is read back out of the address");

  // Ordinary URLs pass straight through, which is what makes it safe to put
  // this resolver in front of every <video> in the app.
  eq(resolveVideoUrl("https://example.com/clip.mp4"), "https://example.com/clip.mp4", "remote clips pass through");
  eq(resolveVideoUrl("blob:http://x/y"), "blob:http://x/y", "blob clips pass through");
  eq(resolveVideoUrl(null), null, "nothing resolves to nothing");
  // Outside a browser there is no IndexedDB, so an upload resolves to null
  // rather than throwing — the scene then simply has no picture.
  eq(resolveVideoUrl(`${CUSTOM_VIDEO_PREFIX}missing`), null, "a missing upload resolves to null, not a crash");

  eq(MAX_CUSTOM_VIDEO_BYTES, 500 * 1024 * 1024, "uploads are capped at 500 MB");

  const lib = read("src/lib/custom-video.ts");
  ok(lib.includes("indexedDB.open"), "uploads are kept in IndexedDB so they survive a reload");
  ok(!lib.includes("localStorage"), "a video file never goes into localStorage");
  ok(lib.includes("scenering-video"), "the video store has its own database, away from the music store");
  const music = read("src/lib/custom-music.ts");
  ok(
    !music.includes("scenering-video") && !lib.includes('DB_NAME = "scenering-media"'),
    "the two upload stores cannot race each other over one database version"
  );
}

/* ------------------------------------------------------------------ *
 * 5. the wiring: every surface that plays a clip resolves the address
 * ------------------------------------------------------------------ */
{
  const clip = read("src/lib/scene-clip.ts");
  const panel = read("src/components/SceneClipPanel.tsx");
  ok(clip.includes("resolveVideoUrl(scene.video_url)"), "the clip pool resolves the stored address");
  ok(!/el\.src = scene\.video_url/.test(clip), "the clip pool never feeds the raw address to a video element");
  ok(panel.includes("resolveVideoUrl(scene.video_url)"), "the scene editor's clip preview resolves it too");

  const app = read("src/App.tsx");
  ok(app.includes("loadCustomVideos()"), "uploads are re-opened on start-up, before a project loads");
  ok(
    /single_scene: boolean/.test(app) && /voiceover_enabled: boolean/.test(app),
    "both switches are part of the saved project settings"
  );
  ok(
    /single_scene: false/.test(app) && /voiceover_enabled: true/.test(app),
    "projects that pre-date the switches default to split scenes and narration on"
  );
  ok(
    /setSingleScene\(projectSettings\.single_scene \?\? false\)/.test(app) &&
      /setVoiceoverEnabled\(projectSettings\.voiceover_enabled \?\? true\)/.test(app),
    "loading an older project cannot leave either switch undefined"
  );
  ok(
    /video_url: existing\?\.video_url \?\? null/.test(app),
    "re-wording the script never throws away the attached footage"
  );
}

/* ------------------------------------------------------------------ *
 * 6. the voiceover switch actually reaches the audio
 * ------------------------------------------------------------------ */
{
  const preview = read("src/components/VideoPreview.tsx");
  const render = read("src/components/RenderView.tsx");
  const studio = read("src/components/VoiceoverStudio.tsx");
  const setup = read("src/components/SetupStudio.tsx");
  const app = read("src/App.tsx");

  ok(preview.includes("voiceoverEnabled"), "the preview knows about the switch");
  ok(
    /if \(!voiceoverEnabled\) \{\s*\n\s*audioBuffersRef\.current\.clear\(\);/.test(preview),
    "turning it off drops any narration already in memory, so it cannot still be heard"
  );
  ok(
    /const missingScenes = voiceoverEnabled/.test(preview),
    "pressing play with it off does not start synthesising a voice"
  );
  ok(
    /for \(let i = 0; voiceoverEnabled && i < scenesWithImages\.length; i\+\+\)/.test(render),
    "the renderer skips the whole narration pass when it is off"
  );
  ok(
    /const speechDur = !voiceoverEnabled/.test(render),
    "with no voice, the caption clock follows the scene rather than an imagined speech length"
  );
  ok(
    /voiceoverEnabled && scenes\.some/.test(studio),
    "leaving the Voiceover step does not generate narration nobody asked for"
  );

  // The switch is reachable from both the place you set a project up and the
  // place you would go looking for it.
  ok(setup.includes("<VoiceoverSwitch"), "Setup carries the switch, next to the one-scene choice");
  ok(studio.includes("<VoiceoverSwitch"), "the Voiceover step carries the same switch");
  ok(
    app.includes("onUpdateVoiceoverEnabled={handleUpdateVoiceoverEnabled}"),
    "both switches write to the same project setting"
  );
  const switchSrc = read("src/components/VoiceoverSwitch.tsx");
  ok(switchSrc.includes('role="switch"'), "it is a real switch, announced as one to a screen reader");
  ok(switchSrc.includes("aria-checked={enabled}"), "its state is announced too");
}

/* ------------------------------------------------------------------ *
 * 7. Setup offers the choice, and a video alone is enough to start
 * ------------------------------------------------------------------ */
{
  const setup = read("src/components/SetupStudio.tsx");
  ok(setup.includes("SINGLE_SCENE_OPTION"), "the fourth scene-length card comes from the shared definition");
  ok(
    setup.includes("Make the video from my script") && setup.includes("Upload my own video"),
    "picking one scene offers both routes: the script, or your own footage"
  );
  ok(
    /canStart = script\.trim\(\)\.length > 0 \|\| \(oneScene && hasFootage\)/.test(setup),
    "a music video with no script at all can still be started"
  );
  ok(
    /!scriptText && !\(oneScene && hasFootage\)/.test(setup),
    "the guard that demands a script makes an exception for uploaded footage"
  );
  ok(
    setup.includes("onUpdateVoiceoverEnabled?.(false)"),
    "uploading footage switches narration off, because that footage has its own sound"
  );
  ok(
    /video_mute: false/.test(read("src/App.tsx")),
    "an uploaded clip keeps its own soundtrack — the whole point of a music video"
  );
}

/* ------------------------------------------------------------------ *
 * 8. switching an existing project to one scene does not leave debris
 * ------------------------------------------------------------------ */
{
  const app = read("src/App.tsx");
  ok(
    /for \(const stale of prev\.slice\(newScenes\.length\)\)/.test(app),
    "re-splitting into fewer scenes deletes the rows that are no longer used"
  );
  ok(
    /localStorage\.removeItem\(`scenering_scene_meta_\$\{stale\.id\}`\)/.test(app),
    "and their saved per-scene settings go with them, so nothing reappears on reload"
  );
  ok(
    /if \(newScenes\.some\(\(s\) => s\.id === stale\.id\)\) continue;/.test(app),
    "a scene that survived the re-split is never deleted by the cleanup"
  );
}

/* ------------------------------------------------------------------ *
 * 9. the Voiceover step keeps what is not about the voice
 * ------------------------------------------------------------------ */
{
  const studio = read("src/components/VoiceoverStudio.tsx");
  const switchAt = studio.indexOf("<VoiceoverSwitch");
  const musicAt = studio.indexOf("<BackgroundMusicLibrary");
  // The captions switch lives in the Captions step only; this step keeps the
  // narration switch and the music library.
  const firstGate = studio.indexOf("{voiceoverEnabled && (");

  ok(switchAt > 0 && musicAt > 0, "the step still holds the narration switch and the music library");
  ok(studio.indexOf("<CaptionsSwitch") === -1, "and no longer carries a second captions switch");
  ok(switchAt < firstGate, "the switch itself is above everything it hides");

  // Music and captions must sit OUTSIDE the gated narration blocks: someone
  // scoring a music video still needs them with the voiceover off.
  const gateOpens = [...studio.matchAll(/\{voiceoverEnabled && \(\s+<>/g)].map((m) => m.index ?? 0);
  const gateCloses = [...studio.matchAll(/<\/>\s+\)\}/g)].map((m) => m.index ?? 0);
  const insideAGate = (at: number) =>
    gateOpens.some((open, i) => at > open && at < (gateCloses[i] ?? Infinity));

  ok(!insideAGate(musicAt), "the background music library stays available with narration off");
  ok(studio.includes("This video has no narration"), "the step says plainly what being off means");
}

h.done("single-scene");
