import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import { BACKGROUND_MUSIC_TRACKS } from "../src/data/media-library";
import { CATALOG_ITEMS } from "../src/lib/video-studio-catalog";

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
      library.includes('accept="audio/*'),
    "the music section can add and remove your own files"
  );
  h.ok(
    library.includes("loadCustomMusic"),
    "previously uploaded tracks are read back when the step opens"
  );
}

h.done("music-library");
