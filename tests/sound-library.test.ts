import { existsSync, statSync } from "node:fs";
import { createHarness } from "./harness";
import { BACKGROUND_MUSIC_TRACKS, SOUND_LIBRARY } from "../src/data/media-library";
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

// ---- the classical tracks are still available as music -----------------------
for (const id of ["gymnopedie_no1", "clair_de_lune"]) {
  const track = BACKGROUND_MUSIC_TRACKS.find((t) => t.id === id);
  h.ok(Boolean(track), `${id} is still in the background music library`);
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
  h.ok(!/gymnopedie|clair_de_lune|real_/.test(url), `${item.type} is not a music file (${url})`);

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

h.done("sound-library");
