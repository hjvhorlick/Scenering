import { createHarness } from "./harness";
import { getMotionTransform } from "../src/lib/render-effects";
import {
  getSceneCameraTransform,
  motionForStyle,
  motionForAnimationStyle,
  MOTION_STYLE_ROTATION,
  ANIMATION_STYLE_ROTATION,
} from "../src/lib/scene-animation";
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
/** Every preset the Motion Style tables are allowed to produce. */
const PRESETS: SceneMotionType[] = [
  "none", "ken_burns", "slow_zoom", "zoom_in", "zoom_out", "pan_left",
  "pan_right", "pan_up", "pan_down", "zoom_pan", "subtle_camera",
  "cinematic_drift", "shake", "pulse", "floating",
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

/* ---------------------------------------------------------------------------
 * MOTION MUST FLOW — one continuous move, not a stagger
 *
 * This is the "Ken Burns moves jagged" complaint, and it has one cause: the
 * pan was clamped to the crop headroom of the *current* frame. A push-in has
 * almost no room at scale 1.12, so the pan raced into the edge within the
 * first fifth of the scene, the clamp squashed it there, and it then sat
 * still while the zoom carried on. A pull-out is worse: its headroom SHRINKS
 * as the scene runs, so the clamp dragged the picture backwards while it was
 * zooming out. Both read as a camera that stutters.
 *
 * The travel is now budgeted from the smallest zoom of the whole move, so it
 * fits on every frame. These checks pin the three properties that make that
 * true, for every preset a whole-video camera choice can pick.
 * ------------------------------------------------------------------------- */
const FLOWING: SceneMotionType[] = [
  "ken_burns", "slow_zoom", "zoom_in", "zoom_out", "zoom_pan",
  "pan_left", "pan_right", "pan_up", "pan_down",
];
/* Presets whose move deliberately breathes — it slows to a stop and starts
   again, and `shake` is a handheld tremor sampled far above this cadence —
   so the straight-line rules below are not about them. What they still owe is
   the edge-safety and NaN checks above. */
for (const motion of FLOWING) {
  for (const [w, hh] of FRAMES) {
    for (const sceneIndex of [0, 1, 2, 3]) {
      const N = 120;
      const dxs: number[] = [];
      const dys: number[] = [];
      const scales: number[] = [];
      for (let i = 0; i <= N; i++) {
        const t = getMotionTransform(motion, i / N, w, hh, sceneIndex);
        dxs.push(t.dx + (w * t.scale - w) / 2);
        dys.push(t.dy + (hh * t.scale - hh) / 2);
        scales.push(t.scale);
      }
      const deltas = (a: number[]) => a.slice(1).map((v, i) => v - a[i]);
      const where = `${motion} @${w}x${hh} scene ${sceneIndex}`;

      // 1. NO JOLT. Frame-to-frame acceleration may never spike: a step change
      //    in velocity is what the eye reads as "jagged".
      for (const [name, deltasOf] of [
        ["pan x", deltas(dxs)],
        ["pan y", deltas(dys)],
        // scale is turned into pixels so it is comparable with the pans
        ["zoom", deltas(scales).map((v) => v * w)],
      ] as [string, number[]][]) {
        const peak = Math.max(...deltasOf.map(Math.abs));
        if (!(peak > 1e-9)) continue;
        for (let i = 1; i < deltasOf.length; i++) {
          const jolt = Math.abs(deltasOf[i] - deltasOf[i - 1]) / peak;
          h.ok(jolt < 0.2, `${where}: ${name} jolts ${(jolt * 100).toFixed(0)}% of peak speed at frame ${i}`);
        }
      }

      // 2. NO REVERSAL. A straight camera move travels one way only. A pan
      //    that changes direction part-way through is the clamp dragging the
      //    picture back, which is the jerk the customer sees.
      if (FLOWING.includes(motion)) {
        for (const [name, deltasOf] of [["pan x", deltas(dxs)], ["pan y", deltas(dys)]] as [string, number[]][]) {
          const moving = deltasOf.filter((v) => Math.abs(v) > 1e-9);
          if (moving.length < 8) continue;
          const first = Math.sign(moving[0]);
          const reversals = moving.filter((v) => Math.sign(v) !== first).length;
          h.eq(reversals, 0, `${where}: ${name} never reverses`);
        }
      }

      // 3. NO MID-SCENE STALL. A straight move keeps going until the scene
      //    ends; a stretch of near-stillness in the middle is the old freeze.
      if (FLOWING.includes(motion)) {
        const speed = deltas(dxs).map(
          (v, i) => Math.abs(v) + Math.abs(deltas(dys)[i]) + Math.abs(deltas(scales)[i]) * w * 0.5
        );
        const middle = speed.slice(Math.floor(speed.length * 0.2), Math.floor(speed.length * 0.8));
        const median = [...middle].sort((a, b) => a - b)[Math.floor(middle.length / 2)] || 1e-9;
        let run = 0;
        let longest = 0;
        for (const v of middle) {
          if (v < median * 0.15) {
            run += 1;
            longest = Math.max(longest, run);
          } else {
            run = 0;
          }
        }
        h.ok(longest <= 8, `${where}: stalls for ${longest} frames mid-scene`);
      }
    }
  }
}

/* ---------------------------------------------------------------------------
   THE FILE MUST MOVE LIKE THE PREVIEW

   A render is handed a cleaned copy of the project (`stripVipFromExport`), and
   on a plan without the per-scene effect stack that copy reports
   `sceneAnimationEnabled: false`. The camera then resolved to
   `scene.motion_effect` — a field the preview never reads — so on any project
   whose two motion fields had drifted apart the preview glided and the
   finished video froze or moved differently, scene by scene. The camera is a
   separate feature (audited through `motionStyle`), so the export keeps it,
   and the project's Motion Style supplies the movement for a scene that has
   none of its own.
--------------------------------------------------------------------------- */
const STYLE_IDS = ["ken_burns", "dynamic", "zoom_in", "zoom_out", "pan", "shake", "floating"];

for (const style of STYLE_IDS) {
  for (const idx of [0, 1, 2, 3, 4, 5, 7]) {
    const legacy = motionForStyle(style, idx);
    const anim = motionForAnimationStyle(style, idx);
    h.ok(legacy !== "none", `style ${style}#${idx} gives the legacy field a movement`);
    h.ok(anim !== "none", `style ${style}#${idx} gives the animation stack a movement`);
    // Both paths must be real presets the renderer knows.
    h.ok(PRESETS.includes(legacy), `style ${style}#${idx} legacy motion is a preset`);
    h.ok(PRESETS.includes(anim), `style ${style}#${idx} animation motion is a preset`);
  }
}

// "dynamic" rotates, and the rotation is periodic with its own table — this is
// what makes scene N and scene N+6 look the same.
for (let idx = 0; idx < 12; idx++) {
  h.eq(
    motionForStyle("dynamic", idx),
    MOTION_STYLE_ROTATION[idx % MOTION_STYLE_ROTATION.length],
    `dynamic legacy rotation at ${idx}`
  );
  h.eq(
    motionForAnimationStyle("dynamic", idx),
    ANIMATION_STYLE_ROTATION[idx % ANIMATION_STYLE_ROTATION.length],
    `dynamic animation rotation at ${idx}`
  );
}
h.eq(motionForStyle("none", 3), "none", "the none style means no movement (legacy)");
h.eq(motionForAnimationStyle("none", 3), "none", "the none style means no movement (animation)");
h.eq(motionForStyle(undefined, 0), "none", "an unset style means no movement");

// A scene with per-scene camera motion but no legacy field: this is the exact
// shape of a project whose fields drifted. Stripped for the export it must
// still move, and it must move the way the style says.
const driftedScene = {
  motion_effect: undefined,
  animation: { enabled: true, camera: { motion: "ken_burns" as SceneMotionType, speed: 0.45, intensity: 0.55 } },
};
const atStart = getSceneCameraTransform(driftedScene, false, 0, 1920, 1080, 2, motionForStyle("dynamic", 2));
const atEnd = getSceneCameraTransform(driftedScene, false, 1, 1920, 1080, 2, motionForStyle("dynamic", 2));
// The style's movement for scene 2 is a pan, so the zoom is constant and the
// travel is on x — movement is "anything changes", and at least one of the two
// must hold for every scene index of every style.
h.ok(
  atEnd.scale !== atStart.scale || Math.abs(atEnd.dx - atStart.dx) > 1 || Math.abs(atEnd.dy - atStart.dy) > 1,
  "a stripped scene keeps a moving camera in the export"
);
h.ok(Math.abs(atEnd.dx - atStart.dx) > 1, "a stripped scene keeps its pan");

// ...and the same scene with no fallback keeps the old, frozen behaviour, so
// the fallback is what fixes it rather than a blanket change.
const frozen = getSceneCameraTransform(driftedScene, false, 1, 1920, 1080, 2);
h.eq(frozen.scale, 1, "without a style fallback a motionless scene stays at scale 1");
h.eq(frozen.dx, 0, "without a style fallback a motionless scene does not pan");

// A scene that DOES carry its own movement is never overridden by the style.
const ownScene = { motion_effect: "pan_left" as SceneMotionType, animation: undefined };
h.eq(
  getSceneCameraTransform(ownScene, false, 0.5, 1920, 1080, 0, "ken_burns").scale,
  getSceneCameraTransform({ motion_effect: "pan_left", animation: undefined }, false, 0.5, 1920, 1080, 0).scale,
  "a scene's own motion beats the style fallback"
);

// The enabled path: a scene with its own animation camera keeps that movement
// even when the style would say something else (preview parity).
const enabledScene = getSceneCameraTransform(driftedScene, true, 0.5, 1920, 1080, 2, "pan_right");
h.near(
  enabledScene.scale,
  getSceneCameraTransform(driftedScene, true, 0.5, 1920, 1080, 2).scale,
  1e-9,
  "the animation stack's own camera is used when it is on"
);

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
