import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import { BACKGROUND_MUSIC_TRACKS } from "../src/data/media-library";
import { CATALOG_ITEMS } from "../src/lib/video-studio-catalog";
import { createCatalogInsert } from "../src/lib/catalog-insert";
import { buildInsertAudioPlan, projectMusicBed } from "../src/lib/insert-audio";
import { stretchFullVideoMedia } from "../src/lib/render-visualizers";
import { customTrackToItem, trackLoops } from "../src/components/VoiceMediaLibrary";
import { createMusicVideoInsert, isMusicVideoSourceInsert, playOnceConsequence } from "../src/lib/custom-music";
import type { CustomMusicTrack } from "../src/lib/custom-music";
import type { TimelineInsert } from "../src/types";

/**
 * The background music library.
 *
 * Two things can go quietly wrong here and only show up in someone's finished
 * video, so they are checked rather than trusted:
 *
 *   1. **A track that is not there.** A catalogue entry whose file is missing
 *      is a card that plays silence — and if it is the bed for the whole
 *      video, the video is silent under the narration.
 *
 *   2. **A credit naming the wrong person.** Every track here is used on the
 *      strength of its licence, and CC BY licences *require* attribution. The
 *      app pastes `creditText` into the creator's video description, so a
 *      credit that names the wrong artist is both a licence breach for them
 *      and a lie about someone else's work. The catalogue once credited two
 *      Alexander Nakarada tracks to Kevin MacLeod; these checks are what stop
 *      that happening again.
 */
const h = createHarness();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- the library is the size the product claims -----------------------------
h.eq(BACKGROUND_MUSIC_TRACKS.length, 30, "the background music library holds 30 tracks");
h.eq(
  CATALOG_ITEMS.background_music.length,
  BACKGROUND_MUSIC_TRACKS.length,
  "every track reaches the Voiceover step's music cards"
);

// ---- every track is a real, playable file -----------------------------------
const ids = new Set<string>();
const urls = new Set<string>();
for (const track of BACKGROUND_MUSIC_TRACKS) {
  h.ok(!ids.has(track.id), `${track.id} is a unique track id`);
  ids.add(track.id);

  h.ok(!urls.has(track.url), `${track.id} does not reuse another track's audio file`);
  urls.add(track.url);

  h.ok(track.url.startsWith("/sounds/"), `${track.id} is served from the bundled sound folder`);
  const file = join(repoRoot, "public", track.url);
  h.ok(existsSync(file), `${track.id} has its audio file on disk (${track.url})`);
  h.ok(
    existsSync(file) && statSync(file).size > 50 * 1024,
    `${track.id} is a real recording rather than an empty placeholder`
  );

  // A background bed is minutes long; a sound effect is seconds. A duration of
  // zero would also break the loop maths in buildInsertAudioPlan().
  h.ok(track.duration > 30, `${track.id} is long enough to sit under a video (${track.duration}s)`);
  h.ok(Number.isFinite(track.duration), `${track.id} has a finite duration`);
}

// ---- every track credits somebody, correctly --------------------------------
for (const track of BACKGROUND_MUSIC_TRACKS) {
  h.ok(Boolean(track.author?.trim()), `${track.id} names its author`);
  h.ok(Boolean(track.license?.trim()), `${track.id} states its licence`);
  h.ok(Boolean(track.creditText?.trim()), `${track.id} has credit text to paste into a description`);

  // The credit has to name the same person the catalogue says made it, or the
  // attribution the creator publishes is wrong.
  const surname = track.author.split("(")[0].trim().split(/\s+/).slice(-1)[0];
  h.ok(
    surname.length > 2 && track.creditText.includes(surname),
    `${track.id} credits its own author (${track.author}) in the credit line`
  );

  // The credit has to quote the *released* title of the work, which is not
  // always the friendly label on the card: the bed shown as "Campfire
  // Acoustic" is released as "Bonfire", and the credit must say Bonfire.
  const quoted = /"([^"]{3,})"/.exec(track.creditText);
  h.ok(Boolean(quoted), `${track.id} credit quotes the released title of the track`);
  h.ok(
    track.creditText.startsWith("Music: "),
    `${track.id} credit is a paste-ready line for a video description`
  );
}

// ---- a YouTube Audio Library claim has to be a YouTube Audio Library track ---
for (const track of BACKGROUND_MUSIC_TRACKS) {
  const claimsYouTube = /youtube/i.test(track.source) || /youtube/i.test(track.license);
  if (claimsYouTube) {
    h.ok(
      /youtube/i.test(track.creditText),
      `${track.id} says YouTube Audio Library in its credit as well as its metadata`
    );
    h.ok(
      track.sourceUrl.includes("youtube.com"),
      `${track.id} points at the YouTube Audio Library it claims to come from`
    );
  } else {
    h.ok(
      !/youtube/i.test(track.creditText),
      `${track.id} does not claim YouTube Audio Library in its credit (source: ${track.source})`
    );
  }
}

// ---- the catalogue card carries the track through to the timeline -----------
for (const item of CATALOG_ITEMS.background_music) {
  const url = item.defaultAudioSettings?.soundUrl ?? "";
  h.ok(url.startsWith("/sounds/"), `${item.type} card points at its audio (${url})`);
  h.ok(item.defaultAudioSettings?.loop === true, `${item.type} loops to fill the video`);
  h.ok(item.defaultDuration > 0, `${item.type} has a real length`);
}

// ---- uploaded music: a saved project must survive a reload -------------------
{
  const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");
  const customMusic = read("src/lib/custom-music.ts");
  const mediaLibrary = read("src/data/media-library.ts");
  const insertAudio = read("src/lib/insert-audio.ts");
  const library = read("src/components/VoiceMediaLibrary.tsx");

  h.ok(
    customMusic.includes('CUSTOM_MUSIC_PREFIX = "custom-music:"'),
    "an upload is addressed by a stable id, not by a blob: URL that dies with the page"
  );
  h.ok(
    customMusic.includes("indexedDB.open") && customMusic.includes("createObjectStore"),
    "uploads are stored in IndexedDB so they are still there tomorrow"
  );

  // The two places that actually turn a URL into sound. If either one forgets
  // to resolve, uploaded music plays in one half of the app and not the other.
  h.ok(
    mediaLibrary.includes("resolveAudioUrl(url)"),
    "the preview player resolves an uploaded track before playing it"
  );
  h.ok(
    insertAudio.includes("resolveAudioUrl(url)"),
    "the render/decode path resolves an uploaded track before fetching it"
  );

  h.ok(
    library.includes("addCustomMusic") &&
      library.includes("removeCustomMusic") &&
      library.includes("accept={AUDIO_UPLOAD_ACCEPT}"),
    "the music section can add and remove your own files"
  );
  h.ok(
    library.includes("loadCustomMusic"),
    "previously uploaded tracks are read back when the step opens"
  );
}

// ---- an imported file asks: loop it, or use its own length? ------------------
/* The whole point of the question is that the creator decides, so both answers
   have to survive all the way into the render plan. These are the real
   functions the library uses, not a copy of their logic. */
{
  const track: CustomMusicTrack = {
    id: "cm_probe",
    name: "My track",
    mime: "audio/mpeg",
    size: 1024,
    duration: 187.4,
    addedAt: 1,
  };

  // Not answered yet (an upload from before the question existed) behaves
  // exactly as it always did: it loops.
  h.eq(trackLoops(track), true, "an upload nobody has answered yet still loops, as it always did");
  h.eq(trackLoops({ ...track, loop: true }), true, "and answering 'loop' loops");
  h.eq(trackLoops({ ...track, loop: false }), false, "while answering 'use its length' does not");

  const looping = customTrackToItem({ ...track, loop: true });
  h.eq(looping.spansFullVideo, true, "a looping upload still stretches across the whole video");
  h.eq(looping.defaultAudioSettings?.loop, true, "and repeats");

  const once = customTrackToItem({ ...track, loop: false });
  h.eq(once.spansFullVideo, false, "an upload set to its own length is not stretched across the video");
  h.eq(once.defaultAudioSettings?.loop, false, "and does not repeat");
  h.eq(once.defaultDuration, 187, "its card carries the file's own length");

  // The insert the timeline actually receives. `totalDuration` is deliberately
  // much longer than the file: if the answer were ignored, the bed would be
  // stretched to 600s and looped, which is the other answer.
  const loopingInsert = createCatalogInsert(looping, { totalDuration: 600, forceFullVideo: true });
  const onceInsert = createCatalogInsert(once, {
    totalDuration: 600,
    forceFullVideo: once.spansFullVideo !== false,
  });

  h.eq(loopingInsert.duration, 600, "looping: the bed covers the whole video");
  h.eq(loopingInsert.audioSettings?.loop, true, "looping: and repeats to get there");
  h.eq(onceInsert.duration, 187, "its own length: the bed is exactly as long as the file");
  h.eq(onceInsert.audioSettings?.loop, false, "its own length: and plays once");
  h.eq(onceInsert.scope, undefined, "its own length: it is not pinned as an entire-video element");

  // And the audio plan the renderer plays honours both.
  const loopingPlan = buildInsertAudioPlan([loopingInsert], 600);
  const oncePlan = buildInsertAudioPlan([onceInsert], 600);
  h.eq(loopingPlan.length, 1, "a looping bed reaches the audio plan");
  h.eq(loopingPlan[0].loop, true, "looping: the plan repeats the track");
  h.eq(oncePlan.length, 1, "a play-once bed reaches the audio plan");
  h.eq(oncePlan[0].loop, false, "its own length: the plan plays it once");
  h.near(oncePlan[0].endTime, 187, 0.6, "its own length: and stops when the file ends");

  // The choice is stored on the track, so a saved project comes back with it.
  const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");
  const store = read("src/lib/custom-music.ts");
  h.ok(
    store.includes("export async function setCustomMusicLoop"),
    "the answer is written back to the stored upload, not held in one component"
  );
  h.ok(
    store.includes("store.put({ ...existing, loop })"),
    "and it is persisted in IndexedDB, so it survives a reload"
  );

  // The question is actually asked, at the moment the file is imported.
  const library = read("src/components/VoiceMediaLibrary.tsx");
  h.ok(
    library.includes("if (lastTrack) setAwaitingLoopChoice(lastTrack)"),
    "importing a file asks the question"
  );
  h.ok(
    library.includes("Loop it across the video") && library.includes("Use the file's length"),
    "and offers both answers: loop it, or use the length of the music file"
  );
  h.ok(
    library.includes("forceFullVideo: item.spansFullVideo !== false"),
    "the insert is built from that answer rather than always spanning the video"
  );

  // ------------------------------------------------------------------
  // 6. "Use the file's length" states its cost before it is chosen
  // ------------------------------------------------------------------
  /* The video is never cut to fit a track, so this answer can leave the tail of
     the video with no music at all. That is a legitimate choice, but a creator
     who only finds out in the finished file has lost the render. The
     consequence is therefore computed and shown on the button itself. */
  h.ok(
    library.includes("playOnceConsequence(awaitingLoopChoice.duration, totalDuration)"),
    "the question compares the track against the real video length"
  );
  h.ok(
    library.includes("{onceConsequence && ("),
    "and shows the answer's consequence under the button that carries it"
  );

  // A 3m07s video with a 1m30s track: 97.4s of the video would have no music.
  h.eq(
    playOnceConsequence(90, 187.4),
    "Your video is 3:07, so the last 1:37 would play with no music.",
    "a track shorter than the video names the silence it leaves behind"
  );
  // A 5m00s track over the same video: 112.6s of it is never heard.
  h.eq(
    playOnceConsequence(300, 187.4),
    "Your video is 3:07, so the last 1:53 of the track would not be heard.",
    "a track longer than the video names the part that will not play"
  );
  h.eq(
    playOnceConsequence(187.4, 187.4),
    "It matches your video's length almost exactly.",
    "an exact match says so rather than warning about nothing"
  );
  // Under a second apart is not worth interrupting for.
  h.eq(
    playOnceConsequence(186.9, 187.4),
    "It matches your video's length almost exactly.",
    "a difference under a second is reported as a match, not as silence"
  );
  // No video yet (a script-only project): nothing to compare against.
  h.eq(playOnceConsequence(90, 0), "", "with no video length there is no warning");
  h.eq(playOnceConsequence(0, 187.4), "", "with no track length there is no warning");
}

// ------------------------------------------------------------------
// 7. Which track the Captions step listens to
// ------------------------------------------------------------------
{
  /* A music video built from stills has no footage soundtrack, so the music
     track is the only place its captions can come from. `projectMusicBed` has
     to pick the same track the renderer plays, or the words would be
     transcribed from audio the finished video never uses. */
  const bed = (soundUrl: string, duration: number, extra = {}): TimelineInsert =>
    ({
      id: `ins_${soundUrl}`,
      category: "background_music",
      type: "bgm_x",
      title: "Track",
      startTime: 0,
      duration,
      position: { x: 0.5, y: 0.5 },
      size: 1,
      audioSettings: { soundUrl, volume: 0.5, ...extra },
    }) as unknown as TimelineInsert;

  const visual = {
    id: "ins_visual",
    category: "visual_effect",
    type: "fx_x",
    title: "FX",
    startTime: 0,
    duration: 10,
    position: { x: 0.5, y: 0.5 },
    size: 1,
  } as unknown as TimelineInsert;

  h.eq(projectMusicBed(undefined), null, "no inserts means no track to listen to");
  h.eq(projectMusicBed([]), null, "an empty timeline has no track either");
  h.eq(projectMusicBed([visual]), null, "an effects-only timeline has no soundtrack to read");

  const one = projectMusicBed([bed("https://cdn/x.mp3", 187)]);
  h.ok(one !== null, "a music bed is found");
  h.eq(one!.url, "https://cdn/x.mp3", "and it resolves to the file the renderer plays");
  h.near(one!.seconds, 187, 0.6, "with the length the transcriber needs for progress");

  // A music selection REPLACES the previous one, so captions must follow the
  // survivor rather than the first track anyone added.
  const swapped = projectMusicBed([
    bed("https://cdn/first.mp3", 120),
    visual,
    bed("https://cdn/second.mp3", 240),
  ]);
  h.eq(swapped!.url, "https://cdn/second.mp3", "the last music selection is the one read");

  // And the same guards the audio plan applies.
  h.eq(
    projectMusicBed([bed("https://cdn/x.mp3", 187, { muted: true })]),
    null,
    "a muted bed is not playing, so there is nothing to transcribe"
  );
  h.eq(
    projectMusicBed([bed("", 187)]),
    null,
    "a bed with no file behind it has nothing to read"
  );

  // The Captions step must actually offer the button for a stills-and-music
  // video, not only for footage.
  const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");
  const captions = read("src/components/CaptionsStudio.tsx");
  h.ok(
    /\{\(sceneHasClip\(scene\) \|\| musicBed\) &&/.test(captions),
    "the transcript panel appears for a video built from stills as well as footage"
  );
  h.ok(
    captions.includes("musicBed={musicBed}"),
    "and it is handed the project's track"
  );

  const app = read("src/App.tsx");
  h.ok(
    /const captionsMusicBed = useMemo\(\(\) => projectMusicBed\(inserts\), \[inserts\]\);/.test(app),
    "App derives it from the same insert list the renderer plays"
  );
}

// ------------------------------------------------------------------
// 8. A project can begin with its own audio plus a still image
// ------------------------------------------------------------------
{
  const sourceTrack: CustomMusicTrack = {
    id: "cm_setup",
    name: "Finished song",
    mime: "audio/mpeg",
    size: 2048,
    duration: 187.4,
    addedAt: 1,
    loop: false,
  };
  const insert = createMusicVideoInsert(sourceTrack);
  h.eq(insert.category, "background_music", "an audio project source uses the existing music-bed path");
  h.ok(isMusicVideoSourceInsert(insert), "Setup marks source audio separately from an ordinary narrated-project bed");
  h.ok(
    !isMusicVideoSourceInsert(customTrackToItem(sourceTrack) as unknown as TimelineInsert),
    "uploading ordinary background music does not turn a script project into a music-video source"
  );
  h.eq(insert.startTime, 0, "its soundtrack begins at frame zero");
  h.near(insert.duration, 187.4, 0.001, "the insert keeps the audio file's own length");
  h.eq(insert.audioSettings?.soundUrl, "custom-music:cm_setup", "it stores the reload-safe audio address");
  h.eq(insert.audioSettings?.loop, false, "the source track is explicitly never looped");
  const afterPicturesGrow = stretchFullVideoMedia([insert], 240)[0];
  h.near(afterPicturesGrow.duration, 187.4, 0.001, "adding more pictures does not stretch a play-once source track");

  const longerVideoPlan = buildInsertAudioPlan([afterPicturesGrow], 240);
  h.eq(longerVideoPlan.length, 1, "the source soundtrack reaches the ordinary render mixer");
  h.eq(longerVideoPlan[0].loop, false, "a longer video still does not loop the track");
  h.near(longerVideoPlan[0].endTime, 187.4, 0.001, "when the pictures run longer, the video wins and the track ends");

  const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");
  const setup = read("src/components/SetupStudio.tsx");
  const app = read("src/App.tsx");
  h.ok(
    setup.includes('useState<"script" | "upload" | "audio">("script")') &&
      setup.includes("Upload audio + image"),
    "one-scene Setup offers audio plus image as a third source"
  );
  h.ok(
    setup.includes("accept={AUDIO_UPLOAD_ACCEPT}") &&
      setup.includes("accept={IMAGE_UPLOAD_ACCEPT}") &&
      setup.includes("await addCustomMusic(file)") &&
      setup.includes("await addCustomImage(file)"),
    "the new source validates and stores both files through the existing upload stores"
  );
  h.ok(
    setup.includes("await setCustomMusicLoop(track.id, false)") &&
      setup.includes("onUpdateVoiceoverEnabled?.(false)"),
    "choosing this source makes play-once and voiceover-off explicit"
  );
  h.ok(
    setup.includes("inserts.some(isMusicVideoSourceInsert)") &&
      setup.includes(".find(isMusicVideoSourceInsert)"),
    "reopening Setup cannot mistake a script project's ordinary music bed for source audio"
  );
  h.ok(
    /if \(!scriptText && !footageSourceReady && !stillsSourceReady\)/.test(setup),
    "the no-script creation gate admits a complete audio-and-image source"
  );
  h.ok(
    /if \(scriptText && singleSource === "script"\)/.test(setup),
    "revisiting Setup cannot rewrite source-audio caption text as a narration script"
  );
  h.ok(
    app.includes("const initialInserts = audio ? [createMusicVideoInsert(audio.track)] : [];") &&
      app.includes("setInserts(initialInserts)"),
    "project creation attaches the uploaded track immediately rather than only adding it to the library"
  );
  h.ok(
    app.includes("image_query_locked: true") &&
      app.includes("image_url: audio && i === 0 ? audio.image.url : null"),
    "the uploaded image is attached and pinned to the first scene"
  );
  h.ok(
    /const narration = audio \|\| clip \? false : options\?\.voiceoverEnabled \?\? true;/.test(app),
    "either source-media project is born with voiceover off even if stale UI state said otherwise"
  );
  h.ok(
    app.includes('setInserts((prev) => prev.filter((insert) => insert.category !== "background_music"))') &&
      /handleAttachAudioSource[\s\S]*?video_url: null,[\s\S]*?const sourceInsert = createMusicVideoInsert[\s\S]*?prev\.filter\(\(insert\) => insert\.category !== "background_music"\)/.test(app),
    "switching sources cannot layer a separate music insert over uploaded-video sound"
  );
  h.ok(
    /if \(changed\.audio\) \{\s*const sourceInsert = createMusicVideoInsert\(source\.track\);/.test(app),
    "replacing only the still preserves the existing source insert instead of minting a duplicate"
  );
  h.ok(
    /mediaSourceVoiceoverLocked &&\s*insert\.category === "background_music"/.test(app) &&
      /isMusicVideoSourceInsert\(updated\)[\s\S]*?loop: false/.test(app),
    "source projects reject a second music bed and keep their own track at frame zero without looping"
  );
}

h.done("music-library");
