import { existsSync, statSync } from "node:fs";
import { createHarness } from "./harness";
import { BACKGROUND_MUSIC_TRACKS, SOUND_LIBRARY } from "../src/data/media-library";
import { generateAttributionDocument } from "../src/data/media-library";
import { CATALOG_ITEMS } from "../src/lib/video-studio-catalog";

/**
 * The Sound Effects tab once held a 3-minute classical piano track filed under
 * "Camera & Applause", because a music entry in the effect library was bucketed
 * as foley. These checks keep music out of the effects and keep every effect
 * pointing at a real recording that is long enough to play in full.
 */
const h = createHarness();

const EFFECTS = (CATALOG_ITEMS as unknown as { sound_effects: any[] }).sound_effects;

// ---- music never lives in the effect library ---------------------------------
for (const sound of SOUND_LIBRARY) {
  h.ok(sound.category !== "music", `${sound.id} is not filed as a music track`);
}
h.eq(
  SOUND_LIBRARY.filter((s) => (s.section ?? "") === "foley" && /satie|debussy|gymnopedie|clair/i.test(s.name)).length,
  0,
  "no classical track is filed under Foley"
);

// ---- calm YouTube Audio Library tracks are available as music ----------------
for (const id of ["divider", "candlepower", "gentle_reflection"]) {
  const track = BACKGROUND_MUSIC_TRACKS.find((t) => t.id === id);
  h.ok(Boolean(track), `${id} is in the background music library`);
  h.ok((track?.duration ?? 0) > 60, `${id} keeps its full length`);
}

// ---- the effects tab holds effects only --------------------------------------
h.ok(EFFECTS.length >= 10, `expected a full effects list, got ${EFFECTS.length}`);
const groups = new Set<string>();
for (const item of EFFECTS) {
  groups.add(item.subCategory);
  h.ok(["ui", "impact", "foley"].includes(item.subCategory), `${item.type} sits in a real group (${item.subCategory})`);
  h.ok(
    item.defaultDuration > 0 && item.defaultDuration <= 30,
    `${item.type} is a short effect (${item.defaultDuration}s) — music would be minutes long`
  );

  const url: string = item.defaultAudioSettings?.soundUrl ?? "";
  h.ok(url.startsWith("/sounds/"), `${item.type} points at the sound library (${url})`);
  h.ok(!/gymnopedie|clair_de_lune|real_|yt_/.test(url), `${item.type} is not a music file (${url})`);

  // the file has to exist in the build, or the card plays nothing
  const file = `public${url}`;
  h.ok(existsSync(file), `${item.type} audio exists on disk (${url})`);
  h.ok(existsSync(file) && statSync(file).size > 1024, `${item.type} audio is not an empty file`);
}
h.eq(groups.size, 3, "all three effect groups have something in them");
h.ok(groups.has("foley"), "the foley group exists");

// ---- the foley group is camera & applause, nothing else ----------------------
const foley = EFFECTS.filter((i) => i.subCategory === "foley");
h.ok(foley.length >= 3, `foley group has ${foley.length} sounds`);
for (const item of foley) {
  h.ok(
    /camera|shutter|applause|click/i.test(item.name),
    `${item.type} is a camera/applause sound (${item.name})`
  );
}

// ---------------------------------------------------------------------------
// The credits document must follow the project through the whole creation
// process: every element that is USED goes into the list, anything unused
// stays out.
{
  const base = {
    projectTitle: "Credits Test",
    includeBackgroundMusic: false,
    imageSources: [],
    graphicsUsed: [],
    voiceName: undefined as string | undefined,
  };

  // Nothing used -> no sound, graphic, image or voice sections at all.
  const empty = generateAttributionDocument(base);
  h.ok(!empty.includes("SOUND EFFECTS"), "no sound effects are credited when none are used");
  h.ok(!empty.includes("3D GRAPHICS"), "no 3D graphics are credited when none are used");
  h.ok(!empty.includes("STOCK IMAGES"), "no image sources are credited when none are used");
  h.ok(!empty.includes("VOICEOVER & SPEECH SYNTHESIS"), "no voice is credited when none is used");

  // A sound effect used -> exactly that one is credited.
  const one = generateAttributionDocument({ ...base, soundsUsed: ["ting"] });
  h.ok(one.includes("SOUND EFFECTS"), "a used sound effect is credited");
  const creditedSounds = SOUND_LIBRARY.filter((s) => one.includes(`"${s.name}"`));
  h.eq(creditedSounds.length, 1, "only the used sound effect is credited");
  h.eq(creditedSounds[0]?.id, "ting", "the credited sound effect is the used one");

  // A 3D sticker used -> the section appears and names only that sticker.
  const gfx = generateAttributionDocument({ ...base, graphicsUsed: ["Gold Star"] });
  h.ok(gfx.includes("3D GRAPHICS"), "used 3D stickers are credited");
  h.ok(gfx.includes("Included assets: Gold Star"), "only the used sticker is listed");

  // An image source used -> that source alone is credited.
  const img = generateAttributionDocument({ ...base, imageSources: ["Unsplash (Unsplash License)"] });
  h.ok(img.includes("STOCK IMAGES"), "used image sources are credited");
  h.ok(img.includes("Sourced via Unsplash (Unsplash License)"), "the used image source is listed");
  h.ok(!img.includes("Pexels"), "unused image sources stay out of the document");

  // A voice used -> the voice section names it.
  const voiced = generateAttributionDocument({ ...base, voiceName: "The Storyteller (Male • American (US))" });
  h.ok(voiced.includes("VOICEOVER & SPEECH SYNTHESIS"), "the narration voice is credited");
  h.ok(voiced.includes("Voice Profile: The Storyteller"), "the voice profile name is in the credits");
}

h.done("sound-library");
