import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";
import { createCatalogInsert } from "../src/lib/catalog-insert";
import { buildInsertAudioPlan, InsertAudioMixer, type InsertAudioPlan } from "../src/lib/insert-audio";
import { stretchFullVideoMedia } from "../src/lib/render-visualizers";
import { CATALOG_ITEMS, type CatalogItem } from "../src/lib/video-studio-catalog";
import type { TimelineInsert } from "../src/types";

/* ------------------------------------------------------------------ *
 * Where a music bed sits on the timeline.
 *
 * Background music is a bed under the whole video. It was treated as one in
 * the Voiceover step, which asks for a whole-video insert explicitly, and as
 * a sound effect everywhere else: the Video Studio grid built its insert at
 * the playhead, like a chime. Two things followed, both reported as "the
 * music does not play".
 *
 *   - Add a track with the playhead a minute in and the bed starts a minute
 *     in. The first minute of the video has no music under it.
 *   - Add one with the playhead near the end — where it sits after watching
 *     the preview through — and the window between the playhead and the end
 *     of the video is too small to be worth scheduling, so the bed is
 *     dropped and nothing plays at all.
 *
 * Saved projects are the other half of it: a bed from before scopes existed
 * carries a start time and no scope, and has to play from the first frame.
 * ------------------------------------------------------------------ */

const h = createHarness();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSync(join(repoRoot, file), "utf8");

const musicItem: CatalogItem = (CATALOG_ITEMS.background_music || [])[0];
h.ok(Boolean(musicItem), "the music library has tracks to add");
h.eq(musicItem.category, "background_music", "and the first of them is a music track");
h.ok(musicItem.defaultDuration > 60, "which is minutes long on its own");

/* -------------------------------- 1. added from the Video Studio grid */

{
  // The playhead is four minutes into a five-minute video: where it lands
  // after watching most of the preview.
  const insert = createCatalogInsert(musicItem, {
    currentPlayheadTime: 240,
    totalDuration: 300,
  });

  h.eq(insert.startTime, 0, "music added from the grid starts at the first frame, not at the playhead");
  h.eq(insert.duration, 300, "and runs the length of the video");
  h.eq(insert.scope, "entire_video", "carrying the scope that says so");
  h.eq(insert.category, "background_music", "it is still a music insert");
  h.ok(Boolean(insert.audioSettings?.soundUrl), "with a sound to play");
}

{
  // The same track from the Voiceover step, which always asked for a
  // whole-video insert. Both doors now produce the same thing.
  const fromVoiceover = createCatalogInsert(musicItem, { totalDuration: 300, forceFullVideo: true });
  const fromStudio = createCatalogInsert(musicItem, { currentPlayheadTime: 240, totalDuration: 300 });

  h.eq(fromStudio.startTime, fromVoiceover.startTime, "both doors start the bed in the same place");
  h.eq(fromStudio.duration, fromVoiceover.duration, "for the same length");
  h.eq(fromStudio.scope, fromVoiceover.scope, "with the same scope");
}

{
  // The fix must not turn every catalogue item into a whole-video one: a
  // sound effect is still placed where the playhead is.
  const effect = (CATALOG_ITEMS.sound_effects || [])[0];
  if (effect) {
    const insert = createCatalogInsert(effect, { currentPlayheadTime: 42, totalDuration: 300 });
    h.eq(insert.startTime, 42, "a sound effect is still dropped at the playhead");
    h.eq(insert.duration, effect.defaultDuration, "and keeps its own short length");
    h.eq(insert.scope, undefined, "with no whole-video scope on it");
  }

  const sticker = (CATALOG_ITEMS.stickers || [])[0];
  if (sticker) {
    const insert = createCatalogInsert(sticker, { currentPlayheadTime: 12, totalDuration: 300 });
    h.eq(insert.startTime, 12, "a sticker is still placed at the playhead");
  }
}

/* -------------------------------- 2. what the mixer makes of it */

const bed = (over: Partial<TimelineInsert> = {}): TimelineInsert => ({
  id: "bgm-1",
  category: "background_music",
  type: "bgm_divider",
  title: "Divider",
  startTime: 0,
  duration: 300,
  position: { x: 0.5, y: 0.5 },
  size: 1,
  audioSettings: { soundUrl: "/sounds/yt_divider.mp3", soundName: "Divider", volume: 0.5, loop: true },
  ...over,
});

{
  // A project saved before scopes existed: a start time, and nothing to say
  // what the start time means.
  const plans = buildInsertAudioPlan([bed({ scope: undefined, startTime: 95, duration: 60 })], 300);
  h.eq(plans.length, 1, "a scope-less bed is still scheduled");
  h.eq(plans[0].startTime, 0, "and plays from the first frame");
  h.eq(plans[0].endTime, 300, "to the last");
  h.eq(plans[0].loop, true, "looping to fill the video");
  h.eq(plans[0].name, "Divider", "named, so a failure can be reported against it");
}

{
  // The bug at its worst: the playhead near the end left a window the
  // scheduler threw away, so the bed was never heard at all.
  const plans = buildInsertAudioPlan([bed({ scope: undefined, startTime: 299.4, duration: 90 })], 300);
  h.eq(plans.length, 1, "a bed added with the playhead at the end is no longer dropped");
  h.eq(plans[0].startTime, 0, "it plays from the first frame like any other bed");
  h.near(plans[0].endTime - plans[0].startTime, 300, 1e-9, "for the whole video, not for the half second that was left");
}

{
  const plans = buildInsertAudioPlan([bed({ scope: "entire_video" })], 300);
  h.eq(plans[0].startTime, 0, "an explicit whole-video bed is unchanged");
  h.eq(plans[0].endTime, 300, "and still runs to the end");
}

{
  // The deliberate choices still mean what they say.
  const fromHere = buildInsertAudioPlan([bed({ scope: "from_here", startTime: 120 })], 300);
  h.eq(fromHere[0].startTime, 120, "'from here' still starts where it was put");
  h.eq(fromHere[0].endTime, 300, "and runs to the end");

  const thisScene = buildInsertAudioPlan([bed({ scope: "this_scene", startTime: 120, duration: 20 })], 300);
  h.eq(thisScene[0].startTime, 120, "'this scene' still starts where it was put");
  h.eq(thisScene[0].endTime, 140, "and stops at the end of the scene");
}

{
  const delayed = buildInsertAudioPlan(
    [bed({ scope: undefined, startTime: 44, audioSettings: { soundUrl: "/sounds/a.mp3", volume: 0.4, delay: 5 } })],
    300
  );
  h.eq(delayed[0].startTime, 5, "a deliberate delay still shifts the bed, from the first frame");
  h.eq(delayed[0].volume, 0.4, "and the volume is carried through");

  const muted = buildInsertAudioPlan(
    [bed({ audioSettings: { soundUrl: "/sounds/a.mp3", muted: true } })],
    300
  );
  h.eq(muted.length, 0, "a muted bed is still silent");
}

{
  // Replacing one track with another must not leave two beds playing.
  const plans = buildInsertAudioPlan(
    [
      bed({ id: "old", scope: undefined, startTime: 10 }),
      bed({ id: "new", scope: undefined, startTime: 200 }),
    ],
    300
  );
  h.eq(plans.length, 1, "only the newest bed plays");
  h.eq(plans[0].key, "new", "and it is the one most recently chosen");
  h.eq(plans[0].startTime, 0, "from the first frame");
}

{
  // Sound effects keep their place on the timeline: this change is about
  // music, and only about music.
  const effect: TimelineInsert = {
    id: "sfx-1",
    category: "sound_effects",
    type: "chime",
    title: "Chime",
    startTime: 42,
    duration: 3,
    position: { x: 0.5, y: 0.5 },
    size: 1,
    audioSettings: { soundUrl: "/sounds/chime.ogg", volume: 0.8 },
  };
  const plans = buildInsertAudioPlan([effect], 300);
  h.eq(plans[0].startTime, 42, "a sound effect still fires where it was placed");
  h.eq(plans[0].endTime, 45, "and lasts as long as it was given");
  h.eq(plans[0].name, "Chime", "with its own name for reporting");
}

/* -------------------------------- 3. re-timing the video keeps it pinned */

{
  const inserts = [bed({ scope: undefined, startTime: 95, duration: 60 })];
  const stretched = stretchFullVideoMedia(inserts, 420);
  h.eq(stretched[0].startTime, 0, "lengthening the video pulls a scope-less bed back to the start");
  h.eq(stretched[0].duration, 420, "and stretches it over the new length");

  const again = stretchFullVideoMedia(stretched, 420);
  h.eq(again, stretched, "and nothing changes when nothing changed, so React can skip the update");
}

/* -------------------------------- 4. the bed starts with the narration */

{
  /**
   * A real-time render schedules every line of narration against a single
   * instant a fraction of a second in the future, so the first sample of
   * scene one is ready before the recorder starts. The bed was started
   * without that instant, so it ran ~120 ms in front of the voice for the
   * length of the video.
   */
  class FakeGain {
    gain = { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} };
    connect() {}
    disconnect() {}
  }
  const started: number[] = [];
  class FakeSource {
    buffer: unknown = null;
    loop = false;
    onended: (() => void) | null = null;
    connect() {}
    disconnect() {}
    start(when?: number) {
      started.push(when ?? 0);
    }
    stop() {}
  }
  class FakeCtx {
    currentTime = 8.4;
    createGain() {
      return new FakeGain() as unknown as GainNode;
    }
    createBufferSource() {
      return new FakeSource() as unknown as AudioBufferSourceNode;
    }
  }

  const ctx = new FakeCtx();
  const mixer = new InsertAudioMixer(ctx as unknown as BaseAudioContext, new FakeGain() as unknown as AudioNode);
  const plan: InsertAudioPlan = {
    key: "bgm",
    url: "/sounds/bed.mp3",
    name: "Divider",
    startTime: 0,
    endTime: 300,
    volume: 0.5,
    loop: true,
  };
  (mixer as unknown as { slots: unknown[] }).slots = [
    { plan, buffer: { duration: 92 } as AudioBuffer, source: null, gain: null, started: false, finished: false },
  ];

  const narrationStart = ctx.currentTime + 0.12;
  mixer.startFrom(0, narrationStart);
  h.eq(started.length, 1, "the bed is started once");
  h.near(started[0], narrationStart, 1e-9, "on the same instant the narration was scheduled for");
  h.ok(started[0] > ctx.currentTime, "which is ahead of the clock, not at it");

  // Without an anchor — live preview — it still starts immediately.
  const live = new InsertAudioMixer(ctx as unknown as BaseAudioContext, new FakeGain() as unknown as AudioNode);
  (live as unknown as { slots: unknown[] }).slots = [
    { plan, buffer: { duration: 92 } as AudioBuffer, source: null, gain: null, started: false, finished: false },
  ];
  started.length = 0;
  live.startFrom(0);
  h.near(started[0], ctx.currentTime, 1e-9, "a live preview still starts the bed on the spot");
}

/* -------------------------------- 5. the screens that call all this */

{
  const render = read("src/components/RenderView.tsx");
  h.ok(
    /insertMixer\.startFrom\(0,\s*renderAudioT0\)/.test(render),
    "the real-time render hands the mixer the narration's own start time"
  );
  h.ok(
    render.includes("soundLoadIssues"),
    "the render page keeps hold of the sounds that would not load"
  );
  h.ok(
    /could not be loaded/.test(render),
    "and says so on the page rather than rendering a quietly incomplete file"
  );

  const preview = read("src/components/VideoPreview.tsx");
  h.ok(preview.includes("setSoundLoadIssues"), "the preview collects the same list");
  h.ok(/Not playing:/.test(preview), "and names the sounds it is not playing");

  const studio = read("src/components/VideoStudio.tsx");
  h.ok(
    /category === "background_music"/.test(studio),
    "the studio grid knows music is whole-video when it labels a card"
  );

  const catalog = read("src/lib/catalog-insert.ts");
  h.ok(
    /item\.category === "background_music"/.test(catalog),
    "and the insert builder is where that rule actually lives"
  );
}

h.done("music placement");
