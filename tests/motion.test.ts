import { createHarness } from "./harness";
import { getMotionTransform } from "../src/lib/render-effects";
import type { SceneMotionType } from "../src/types";

/**
 * Camera motion must be VISIBLE and must never expose a blank edge.
 *
 * Ken Burns once drifted 20px across a whole scene — about 1% of a 1920px
 * frame, or one pixel per second — which read as a completely static image.
 * It also started at scale 1.0 while drifting sideways, sliding an uncovered
 * edge into frame. These checks pin both properties down.
 */
const h = createHarness();

const ALL: SceneMotionType[] = [
  "none", "ken_burns", "slow_zoom", "zoom_in", "zoom_out", "pan_left",
  "pan_right", "subtle_camera", "shake", "pulse", "floating",
];
const MOVING = ALL.filter((m) => m !== "none");
const FRAMES: [number, number][] = [
  [1920, 1080], [1080, 1920], [1280, 720], [3840, 2160], [1080, 1080],
];

for (const motion of ALL) {
  for (const [w, hh] of FRAMES) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let minS = Infinity, maxS = -Infinity;

    for (let i = 0; i <= 400; i++) {
      const p = i / 400;
      const t = getMotionTransform(motion, p, w, hh);

      h.finite(t.scale, `${motion} scale finite`);
      h.finite(t.dx, `${motion} dx finite`);
      h.finite(t.dy, `${motion} dy finite`);
      h.ok(t.scale > 0, `${motion} scale positive`);

      // Net offset from the centred position — the renderers add the centring
      // term back, so this is the real travel.
      const nx = t.dx + (w * t.scale - w) / 2;
      const ny = t.dy + (hh * t.scale - hh) / 2;
      minX = Math.min(minX, nx); maxX = Math.max(maxX, nx);
      minY = Math.min(minY, ny); maxY = Math.max(maxY, ny);
      minS = Math.min(minS, t.scale); maxS = Math.max(maxS, t.scale);

      // EDGE SAFETY: at scale s the image overhangs by (s-1)/2 each side.
      // Drift beyond that slides an uncovered gap into frame.
      h.ok(
        Math.abs(nx) <= (w * t.scale - w) / 2 + 0.51 &&
          Math.abs(ny) <= (hh * t.scale - hh) / 2 + 0.51,
        `${motion} @${w}x${hh} p=${p.toFixed(2)} exposes a blank edge`
      );
    }

    if (motion === "none") {
      h.eq(maxX - minX, 0, "none must not drift");
      h.eq(maxS, 1, "none must not zoom");
      continue;
    }

    const driftX = ((maxX - minX) / w) * 100;
    const driftY = ((maxY - minY) / hh) * 100;
    const zoom = (maxS - minS) * 100;

    // Visible: either a real drift or a real zoom. The bug that started this
    // was motion the user simply could not see, so the bar is per-motion
    // rather than one lenient OR — a "pan" that only zooms is still broken
    // even though a zoom is technically movement.
    const MOVERS = ["ken_burns", "pan_left", "pan_right", "shake", "floating", "subtle_camera"];
    if (MOVERS.includes(motion)) {
      h.ok(
        driftX >= 3 || driftY >= 3,
        `${motion} @${w}x${hh} must visibly travel, not just zoom (drift ${driftX.toFixed(1)}%/${driftY.toFixed(1)}%, zoom ${zoom.toFixed(1)}%)`
      );
    }
    if (["zoom_in", "zoom_out"].includes(motion)) {
      h.ok(zoom >= 20, `${motion} @${w}x${hh} should be a bold zoom, got ${zoom.toFixed(1)}%`);
    }
    h.ok(
      driftX >= 2 || driftY >= 2 || zoom >= 6,
      `${motion} @${w}x${hh} is not visible enough (drift ${driftX.toFixed(1)}%/${driftY.toFixed(1)}%, zoom ${zoom.toFixed(1)}%)`
    );

    // Something must change early — a move nobody notices starting is a move
    // that looks broken. Sampled as max deviation, because periodic effects
    // can return to their start exactly on a quarter mark.
    const start = getMotionTransform(motion, 0, w, hh);
    const startX = start.dx + (w * start.scale - w) / 2;
    let early = 0;
    for (let i = 1; i <= 60; i++) {
      const q = getMotionTransform(motion, (i / 60) * 0.25, w, hh);
      early = Math.max(
        early,
        (Math.abs(q.dx + (w * q.scale - w) / 2 - startX) / w) * 100 +
          Math.abs(q.scale - start.scale) * 100
      );
    }
    h.ok(early >= 0.8, `${motion} too slow to start (${early.toFixed(2)} in first 25%)`);

    // ...but not nauseating.
    h.ok(driftX <= 30 && driftY <= 30, `${motion} drifts too far (${driftX.toFixed(1)}%)`);
    h.ok(maxS <= 1.6, `${motion} zooms too hard (${maxS})`);
  }
}

// No sudden jumps between frames — those read as a glitch, not a camera move.
for (const motion of MOVING) {
  let prev = getMotionTransform(motion, 0, 1920, 1080);
  for (let i = 1; i <= 600; i++) {
    const t = getMotionTransform(motion, i / 600, 1920, 1080);
    const jump =
      Math.abs(t.dx - prev.dx) + Math.abs(t.dy - prev.dy) + Math.abs(t.scale - prev.scale) * 1920;
    h.ok(jump < 40, `${motion} jumps ${jump.toFixed(1)}px at p=${(i / 600).toFixed(3)}`);
    prev = t;
  }
}

// A zero-length scene divides by zero upstream; NaN must never reach the canvas.
for (const motion of ALL) {
  for (const p of [-5, -0.1, 1.1, 99, NaN, Infinity, -Infinity]) {
    const t = getMotionTransform(motion, p, 1920, 1080);
    h.finite(t.scale, `${motion} p=${p} scale`);
    h.finite(t.dx, `${motion} p=${p} dx`);
    h.finite(t.dy, `${motion} p=${p} dy`);
  }
}

// An unset effect must behave as the documented default.
const fallback = getMotionTransform(undefined, 0.5, 1920, 1080);
const kenBurns = getMotionTransform("ken_burns", 0.5, 1920, 1080);
h.eq(fallback.scale, kenBurns.scale, "undefined motion falls back to ken_burns");
h.eq(fallback.dx, kenBurns.dx, "undefined motion dx matches ken_burns");

h.done("motion");
