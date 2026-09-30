/**
 * Plain-colour scene backdrops and human-readable durations.
 *
 * The colour backdrop added a third way for a scene to have something to show,
 * alongside a still image and a video clip. Before it existed, seven separate
 * call sites each asked "does this scene have a visual?" by writing
 * `s.image_url || s.video_url` inline. A scene whose only visual is a colour
 * would have been silently dropped from the exported video by any of them that
 * was missed — which is what these checks guard.
 */

import {
  sceneHasVisual,
  sceneIsBlankColor,
} from "../src/lib/scene-framing";
import { formatDuration, formatDurationPrecise } from "../src/lib/duration-utils";
import { createHarness } from "./harness";

const h = createHarness();
const ok = h.ok;

// ---------------------------------------------------------------- visuals ---
// A plain colour alone counts as a visual, or the scene vanishes from the render.
ok(sceneHasVisual({ blank_color: "#101828" }), "a scene with only a colour renders");
ok(sceneHasVisual({ image_url: "photo.jpg" }), "a scene with only a photo renders");
ok(sceneHasVisual({ video_url: "clip.mp4" }), "a scene with only a clip renders");
ok(
  sceneHasVisual({ image_url: "photo.jpg", blank_color: "#000000" }),
  "a photo plus a stale colour still renders"
);
ok(!sceneHasVisual({}), "a scene with nothing at all is skipped");
ok(!sceneHasVisual({ image_url: null, video_url: null, blank_color: null }), "explicit nulls are skipped");
ok(!sceneHasVisual({ image_url: "" }), "an empty string image url is not a visual");

// A colour is only the backdrop when there is no photo or clip competing.
ok(sceneIsBlankColor({ blank_color: "#101828" }), "colour with no image is the flat backdrop");
ok(
  !sceneIsBlankColor({ blank_color: "#101828", image_url: "photo.jpg" }),
  "a photo takes priority over a colour — the renderer must not paint over it"
);
ok(
  !sceneIsBlankColor({ blank_color: "#101828", video_url: "clip.mp4" }),
  "a clip takes priority over a colour"
);
ok(!sceneIsBlankColor({ image_url: "photo.jpg" }), "a photo alone is not a flat backdrop");
ok(!sceneIsBlankColor({}), "an empty scene is not a flat backdrop");

// Sweep: every combination of the three fields, so no case is untested.
{
  const vals = [null, "x"];
  let combos = 0;
  for (const image_url of vals) {
    for (const video_url of vals) {
      for (const blank_color of vals) {
        combos++;
        const scene = { image_url, video_url, blank_color };
        const expected = Boolean(image_url || video_url || blank_color);
        ok(sceneHasVisual(scene) === expected, `hasVisual ${JSON.stringify(scene)}`);
        // A flat backdrop requires the colour to be the ONLY thing present.
        const expectedBlank = Boolean(blank_color && !image_url && !video_url);
        ok(sceneIsBlankColor(scene) === expectedBlank, `isBlank ${JSON.stringify(scene)}`);
      }
    }
  }
  ok(combos === 8, "all eight field combinations were swept");
}

// --------------------------------------------------------------- duration ---
// Seconds stay seconds; anything a whole minute or longer reads as minutes.
ok(formatDuration(0) === "0s", "zero reads as 0s");
ok(formatDuration(14) === "14s", "under a minute stays in seconds");
ok(formatDuration(14.8) === "15s", "sub-second precision is rounded away");
ok(formatDuration(45) === "45s", "45 seconds stays in seconds");
ok(formatDuration(59) === "59s", "just under a minute stays in seconds");
ok(formatDuration(60) === "1m", "exactly a minute drops the empty seconds");
ok(formatDuration(61) === "1m 1s", "a minute and a second");
ok(formatDuration(260) === "4m 20s", "4m 20s — the form the UI was missing");
ok(formatDuration(320) === "5m 20s", "5m 20s");
ok(formatDuration(600) === "10m", "ten minutes drops the empty seconds");
ok(formatDuration(3600) === "1h", "an hour drops empty minutes");
ok(formatDuration(3900) === "1h 5m", "an hour and five minutes");
ok(formatDuration(3661) === "1h 1m 1s", "hours, minutes and seconds");

// Degenerate input must not produce NaN or "undefined" in the UI.
for (const bad of [0, -5, NaN, Infinity, -Infinity]) {
  const out = formatDuration(bad as number);
  ok(typeof out === "string" && !/NaN|Infinity|undefined/.test(out), `formatDuration(${bad}) -> ${out}`);
}

ok(formatDurationPrecise(14.25) === "14.3s", "precise keeps a tenth below a minute");
ok(formatDurationPrecise(14) === "14s", "precise drops a pointless .0");
ok(formatDurationPrecise(260) === "4m 20s", "precise defers to the plain format past a minute");

// No raw two-or-more-digit second count should survive in the formatted output
// of a realistic project length, which was the original complaint.
{
  const total = 12 * 20; // twelve twenty-second scenes
  const shown = formatDuration(total);
  ok(shown === "4m", `a twelve-scene project reads as ${shown}, not 240s`);
  ok(!/^\d{2,}s$/.test(shown), "long durations are never shown as raw seconds");
}

h.done("scene-visuals");
