import { createHarness, createStubContext, stubImage } from "./harness";
import {
  placeImage,
  resolveFraming,
  frameSizeFor,
  fitFrameInBox,
  drawSceneImage,
  leavesGap,
  suggestFit,
  cropLosesALot,
  aspectMismatch,
  autoCropToFrame,
  autoFrame,
  AUTO_CROP_MAX_MISMATCH,
} from "../src/lib/scene-framing";
import type { Scene } from "../src/types";

/**
 * The standing rule for this app: IMAGES ARE NEVER MIS-SHAPED. A photo may be
 * cropped or letterboxed, but its aspect ratio must survive every combination
 * of fit mode, zoom, crop, rotation and flip.
 */
const h = createHarness();

const RATIOS = ["16:9", "9:16", "1:1", "4:3", undefined];
const PHOTOS: [number, number][] = [
  [1600, 900], [900, 1600], [1000, 1000], [4000, 3000], [320, 240],
  [1920, 1080], [2048, 1152], [600, 1300], [1300, 600], [1, 1],
];
/**
 * Crop-bounds checks exclude the 1x1 photo: sourceRect floors the sampled
 * rectangle at one pixel, so a sub-pixel crop of a one-pixel image necessarily
 * reads past its own edge. That is a degenerate input, not a real photo.
 */
const CROPPABLE = PHOTOS.filter(([w, hh]) => w > 4 && hh > 4);
const FITS = ["cover", "contain", "blur_fill"] as const;

for (const ratio of RATIOS) {
  const frame = frameSizeFor(ratio);

  for (const [pw, ph] of PHOTOS) {
    const img = stubImage(pw, ph);

    for (const fit of FITS) {
      for (const zoom of [0.5, 1, 1.75, 3]) {
        for (const [ox, oy] of [[0, 0], [25, -25], [-50, 50]]) {
          const scene: Partial<Scene> = {
            image_fit: fit,
            image_zoom: zoom,
            image_offset_x: ox,
            image_offset_y: oy,
          };
          const f = resolveFraming(scene);
          const placed = placeImage(img, frame.w, frame.h, f, {
            mode: fit === "cover" ? "cover" : "contain",
          });

          h.finite(placed.dw, `dw finite ${ratio} ${fit}`);
          h.finite(placed.dh, `dh finite ${ratio} ${fit}`);
          h.ok(placed.dw > 0 && placed.dh > 0, `positive size ${ratio} ${fit}`);

          // THE CORE GUARANTEE: destination shape equals source shape.
          const sourceAspect = placed.sw / placed.sh;
          const destAspect = placed.dw / placed.dh;
          h.ok(
            Math.abs(sourceAspect - destAspect) / sourceAspect < 0.005,
            `DISTORTION ${ratio} ${fit} zoom=${zoom} photo=${pw}x${ph}: src ${sourceAspect.toFixed(4)} vs dst ${destAspect.toFixed(4)}`
          );

          // "cover" at default zoom must leave no gap; "contain" may.
          if (fit === "cover" && zoom >= 1 && ox === 0 && oy === 0) {
            h.ok(
              !leavesGap(placed, frame.w, frame.h),
              `cover should fill the frame (${ratio}, photo ${pw}x${ph})`
            );
          }
        }
      }
    }
  }
}

// Cropping must sample inside the source and keep the drawn shape honest.
for (const crop of [
  { x: 0, y: 0, w: 1, h: 1 },
  { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
  { x: 0.6, y: 0.1, w: 0.4, h: 0.8 },
]) {
  for (const [pw, ph] of CROPPABLE) {
    const img = stubImage(pw, ph);
    const f = resolveFraming({ image_crop: crop, image_fit: "cover" });
    const placed = placeImage(img, 1920, 1080, f, { mode: "cover" });
    h.ok(placed.sx >= -0.01 && placed.sy >= -0.01, "crop starts inside the source");
    h.ok(placed.sx + placed.sw <= pw + 0.01, "crop stays within source width");
    h.ok(placed.sy + placed.sh <= ph + 0.01, "crop stays within source height");
    h.ok(
      Math.abs(placed.sw / placed.sh - placed.dw / placed.dh) / (placed.sw / placed.sh) < 0.005,
      "cropped draw keeps its aspect ratio"
    );
  }
}

// drawSceneImage must never hand a non-finite number to the canvas. The stub
// context throws on NaN, so reaching the end is the assertion.
for (const ratio of RATIOS) {
  const frame = frameSizeFor(ratio);
  for (const fit of FITS) {
    for (const rotate of [0, 45, -90, 180]) {
      for (const [fh, fv] of [[false, false], [true, false], [false, true], [true, true]]) {
        const { ctx } = createStubContext(frame.w, frame.h);
        const scene: Partial<Scene> = {
          image_fit: fit,
          image_rotate: rotate,
          image_flip_h: fh,
          image_flip_v: fv,
          image_backdrop: "blur",
        };
        try {
          drawSceneImage(ctx, stubImage() as never, scene, frame.w, frame.h, {
            motionScale: 1.2,
            motionDx: 10,
            motionDy: -10,
          });
          h.ok(true, `drawSceneImage ok ${ratio} ${fit} rot=${rotate}`);
        } catch (err) {
          h.ok(false, `drawSceneImage threw for ${ratio} ${fit} rot=${rotate}: ${err}`);
        }
      }
    }
  }
}

// Degenerate inputs must not produce NaN geometry.
for (const bad of [0, -5, NaN, Infinity]) {
  const f = resolveFraming({ image_zoom: bad as number });
  const placed = placeImage(stubImage(), 1920, 1080, f, { mode: "cover" });
  h.finite(placed.dw, `zoom=${bad} dw`);
  h.finite(placed.dh, `zoom=${bad} dh`);
  h.ok(placed.dw > 0 && placed.dh > 0, `zoom=${bad} positive size`);
}

// fitFrameInBox: the scene-card sizing helper.
for (const ratio of RATIOS) {
  const frame = frameSizeFor(ratio);
  for (const [bw, bh] of [[232, 176], [132, 220], [420, 300], [1000, 10], [10, 1000]]) {
    const fitted = fitFrameInBox(ratio, bw, bh);
    h.ok(fitted.w >= 1 && fitted.h >= 1, `fitFrameInBox positive (${bw}x${bh})`);
    h.ok(fitted.w <= Math.max(1, bw) + 1, `fitFrameInBox width fits ${bw}`);
    h.ok(fitted.h <= Math.max(1, bh) + 1, `fitFrameInBox height fits ${bh}`);
    const want = frame.w / frame.h;
    const got = fitted.w / fitted.h;
    // Rounding to whole pixels dominates at tiny sizes, so allow more there.
    const tolerance = Math.min(fitted.w, fitted.h) < 20 ? 0.35 : 0.02;
    h.ok(
      Math.abs(want - got) / want <= tolerance,
      `fitFrameInBox distorted ${ratio} in ${bw}x${bh}: ${fitted.w}x${fitted.h}`
    );
  }
}

// A chosen photo always fills the frame now — see autoFrame below.
h.eq(suggestFit(stubImage(1600, 900), 1920, 1080), "cover", "matching shapes use cover");
h.eq(
  suggestFit(stubImage(600, 1600), 1920, 1080),
  "cover",
  "a severe mismatch still fills the frame — bars are the user's choice, not ours"
);
h.ok(
  cropLosesALot(stubImage(600, 1600) as never, 1920, 1080),
  "but a severe mismatch is flagged as an expensive crop"
);
h.ok(
  !cropLosesALot(stubImage(1600, 900) as never, 1920, 1080),
  "a matching shape loses nothing worth mentioning"
);

/* ------------------------------------------------------------------ *
 * Background framing: "Transparent" is the default choice, and it must
 * paint NOTHING behind a photo that does not reach the frame edge. The
 * other styles must still paint what they promise.
 * ------------------------------------------------------------------ */

h.eq(resolveFraming({}).backdrop, "transparent", "a new scene defaults to clear bars");
h.eq(resolveFraming(null).backdrop, "transparent", "an empty scene defaults to clear bars");
h.eq(
  resolveFraming({ image_backdrop: "blur" }).backdrop,
  "blur",
  "an explicitly stored style still wins"
);
// Regression: a landscape photo dropped into a 9:16 project auto-suggests
// blur_fill but stored NO backdrop — the default must then be the blurred
// fill, not transparent, or the video renders black bars top and bottom.
h.eq(
  resolveFraming({ image_fit: "blur_fill" }).backdrop,
  "blur",
  "blur_fill without a stored backdrop defaults to blurred bars, never black"
);
h.eq(
  resolveFraming({ image_fit: "blur_fill", image_backdrop: "black" }).backdrop,
  "black",
  "an explicit backdrop on a blur_fill scene is still honoured"
);

/** Draws a tall photo into a wide frame and reports what the context was asked to do. */
function paintTallPhoto(backdrop: "transparent" | "blur" | "black" | "colour", fit: "contain" | "blur_fill" | "cover") {
  const { ctx, ops } = createStubContext(1920, 1080);
  const scene: Partial<Scene> = { image_fit: fit, image_backdrop: backdrop, image_backdrop_color: "#123456" };
  drawSceneImage(ctx, stubImage(600, 1600) as never, scene, 1920, 1080);
  return ops;
}

for (const fit of ["contain", "blur_fill"] as const) {
  const clear = paintTallPhoto("transparent", fit);
  h.ok(
    !clear.includes("fillRect"),
    `${fit} + transparent paints no bars (ops: ${clear.join(",")})`
  );

  const black = paintTallPhoto("black", fit);
  h.ok(black.includes("fillRect"), `${fit} + black fills the bars`);

  const colour = paintTallPhoto("colour", fit);
  h.ok(colour.includes("fillRect"), `${fit} + colour fills the bars`);

  const blurred = paintTallPhoto("blur", fit);
  const draws = blurred.filter((op) => op === "drawImage").length;
  h.ok(draws >= 2, `${fit} + blur paints the photo and its blurred wallpaper (draws: ${draws})`);
}

// A photo that already fills the frame has no bars, so nothing is painted behind it.
{
  const { ctx, ops } = createStubContext(1920, 1080);
  drawSceneImage(ctx, stubImage(1920, 1080) as never, { image_fit: "cover", image_backdrop: "transparent" }, 1920, 1080);
  h.ok(!ops.includes("fillRect"), "a full-frame photo paints no backdrop");
}

/* ---------------------------------------------------------------------------
 * Automatic framing — what a photo looks like the instant it is chosen,
 * before the user touches a control.
 * ------------------------------------------------------------------------- */

// ------------------------------------------------------------ aspectMismatch
h.eq(aspectMismatch(stubImage(1920, 1080) as never, 1920, 1080), 1, "identical shapes mismatch by 1");
h.eq(aspectMismatch(stubImage(1280, 720) as never, 1920, 1080), 1, "same ratio at another size still 1");
h.near(aspectMismatch(stubImage(1080, 1920) as never, 1920, 1080), 3.16, 0.01, "portrait in landscape is a severe mismatch");
h.near(aspectMismatch(stubImage(1920, 1080) as never, 1080, 1920), 3.16, 0.01, "the measure is symmetric");
h.near(aspectMismatch(stubImage(1440, 1080) as never, 1920, 1080), 1.333, 0.01, "4:3 in 16:9 is a mild mismatch");
h.eq(aspectMismatch(stubImage(0, 0) as never, 1920, 1080), 1, "an unmeasured photo reports no mismatch");
h.eq(aspectMismatch(stubImage(1920, 1080) as never, 0, 0), 1, "an unmeasured frame reports no mismatch");

for (const [iw, ih] of [[1920, 1080], [1080, 1920], [1000, 1000], [4000, 900], [900, 4000]]) {
  for (const ratio of RATIOS) {
    const frame = frameSizeFor(ratio);
    const m = aspectMismatch(stubImage(iw, ih) as never, frame.w, frame.h);
    h.finite(m, `mismatch ${iw}x${ih} in ${ratio} is a number`);
    h.ok(m >= 1, `mismatch ${iw}x${ih} in ${ratio} is never below 1`);
  }
}

// ---------------------------------------------------------- autoCropToFrame
{
  const full = autoCropToFrame(stubImage(1920, 1080) as never, 1920, 1080);
  h.eq(full.x, 0, "a matching photo is not cropped (x)");
  h.eq(full.y, 0, "a matching photo is not cropped (y)");
  h.eq(full.w, 1, "a matching photo keeps its full width");
  h.eq(full.h, 1, "a matching photo keeps its full height");

  // A 1:1 photo in a 16:9 frame must lose height, never width.
  const square = autoCropToFrame(stubImage(1080, 1080) as never, 1920, 1080);
  h.eq(square.w, 1, "a square photo in a wide frame keeps its full width");
  h.near(square.h, 0.5625, 0.001, "a square photo in a wide frame trims to 16:9 of its height");
  h.near(square.y, (1 - 0.5625) / 2, 0.001, "the surviving band is centred");

  // A wide photo in a square frame must lose width, never height.
  const wide = autoCropToFrame(stubImage(1920, 1080) as never, 1080, 1080);
  h.eq(wide.h, 1, "a wide photo in a square frame keeps its full height");
  h.near(wide.w, 0.5625, 0.001, "a wide photo in a square frame trims its width");
  h.near(wide.x, (1 - 0.5625) / 2, 0.001, "the surviving column is centred");

  h.eq(autoCropToFrame(stubImage(0, 0) as never, 1920, 1080).w, 1, "an unmeasured photo is not cropped");
  h.eq(autoCropToFrame(stubImage(1920, 1080) as never, 0, 0).w, 1, "an unmeasured frame crops nothing");
}

// Whatever the pairing, the crop must stay inside the photo and have the
// frame's shape — a crop that leaves the source would draw a transparent edge.
for (const [iw, ih] of [[1920, 1080], [1080, 1920], [1000, 1000], [4000, 900], [900, 4000], [1440, 1080]]) {
  for (const ratio of RATIOS) {
    const frame = frameSizeFor(ratio);
    const crop = autoCropToFrame(stubImage(iw, ih) as never, frame.w, frame.h);
    const label = `${iw}x${ih} in ${ratio}`;
    h.ok(crop.x >= -1e-9 && crop.y >= -1e-9, `${label}: crop starts inside the photo`);
    h.ok(crop.x + crop.w <= 1 + 1e-9, `${label}: crop ends inside the photo (x)`);
    h.ok(crop.y + crop.h <= 1 + 1e-9, `${label}: crop ends inside the photo (y)`);
    h.ok(crop.w > 0 && crop.h > 0, `${label}: crop is not empty`);
    // The cropped region, in pixels, has the frame's aspect ratio.
    const croppedRatio = (iw * crop.w) / (ih * crop.h);
    h.near(croppedRatio, frame.w / frame.h, 0.001, `${label}: the crop matches the frame shape`);
  }
}

// ------------------------------------------------------------------ autoFrame
{
  const mild = autoFrame(stubImage(1440, 1080) as never, 1920, 1080);
  h.eq(mild.image_fit, "cover", "a mild mismatch is cropped to fill the frame");
  h.ok(mild.image_crop.w < 1 || mild.image_crop.h < 1, "a mild mismatch gets a real crop");
  h.eq(mild.image_backdrop, undefined, "a cropped photo needs no backdrop");

  // The rule: a chosen photo ALWAYS fills the frame, top to bottom and edge
  // to edge. A portrait photo in a landscape frame used to come back as
  // blur_fill, which in a vertical project meant nothing ever filled a scene.
  const severe = autoFrame(stubImage(1080, 1920) as never, 1920, 1080);
  h.eq(severe.image_fit, "cover", "a portrait photo in a landscape frame is cropped to fill");
  h.eq(severe.image_backdrop, undefined, "a filled frame has no bars to colour in");
  h.ok(severe.image_crop.h < 1, "the crop trims the photo's height to the frame");
  h.eq(severe.image_crop.w, 1, "and keeps its full width");
  h.near(severe.image_crop.y, (1 - severe.image_crop.h) / 2, 0.001, "the crop is centred, not stuck to the top");
  h.ok(cropLosesALot(stubImage(1080, 1920) as never, 1920, 1080), "the editor can still tell this crop is expensive");

  const exact = autoFrame(stubImage(1920, 1080) as never, 1920, 1080);
  h.eq(exact.image_fit, "cover", "a perfectly matching photo just fills the frame");

  // The old threshold no longer changes the framing — only the warning.
  const frameRatio = 16 / 9;
  const justUnder = AUTO_CROP_MAX_MISMATCH - 0.05;
  const justOver = AUTO_CROP_MAX_MISMATCH + 0.05;
  const under = stubImage(1000, Math.round((1000 / frameRatio) * justUnder));
  const over = stubImage(1000, Math.round((1000 / frameRatio) * justOver));
  h.eq(autoFrame(under as never, 1920, 1080).image_fit, "cover", "just inside the limit is cropped");
  h.eq(autoFrame(over as never, 1920, 1080).image_fit, "cover", "just past the limit is cropped too");
  h.ok(!cropLosesALot(under as never, 1920, 1080), "just inside the limit is not flagged");
  h.ok(cropLosesALot(over as never, 1920, 1080), "just past the limit is flagged as expensive");

  // The common pairings a crop must survive, and the one it must not.
  // 4:3 in 9:16 is a mismatch of ~2.37 — the worst pairing a centred crop
  // still survives, and deliberately just inside the limit.
  h.eq(autoFrame(stubImage(1440, 1080) as never, 1080, 1920).image_fit, "cover", "4:3 photo in a vertical frame is still cropped");
  h.ok(aspectMismatch(stubImage(1440, 1080) as never, 1080, 1920) < AUTO_CROP_MAX_MISMATCH, "4:3 in 9:16 sits just inside the crop limit");
  // The pairing this whole change is about: a 16:9 photo in a vertical frame.
  const wideInTall = autoFrame(stubImage(1920, 1080) as never, 1080, 1920);
  h.eq(wideInTall.image_fit, "cover", "a 16:9 photo in a 9:16 frame fills it instead of floating in bars");
  h.ok(wideInTall.image_crop.w < 1, "the sides are trimmed to reach the top and bottom");
  h.eq(wideInTall.image_crop.h, 1, "the full height of the photo is used");
  h.eq(autoFrame(stubImage(1080, 1080) as never, 1920, 1080).image_fit, "cover", "a square photo in a wide frame is cropped");
  h.eq(autoFrame(stubImage(1920, 1080) as never, 1080, 1080).image_fit, "cover", "a wide photo in a square frame is cropped");
  h.eq(autoFrame(stubImage(0, 0) as never, 1920, 1080).image_fit, "cover", "an unmeasured photo keeps the default fit");
}

// Whatever autoFrame decides, drawing with it must still preserve the photo's
// shape — the standing rule at the top of this file.
for (const [iw, ih] of [[1920, 1080], [1080, 1920], [1000, 1000], [4000, 900], [900, 4000]]) {
  for (const ratio of RATIOS) {
    const frame = frameSizeFor(ratio);
    const framing = autoFrame(stubImage(iw, ih) as never, frame.w, frame.h);
    const { ctx } = createStubContext(frame.w, frame.h);
    const placed = drawSceneImage(
      ctx,
      stubImage(iw, ih) as never,
      framing as Partial<Scene>,
      frame.w,
      frame.h
    );
    h.finite(placed.dw, `auto-framed ${iw}x${ih} in ${ratio} draws a finite width`);
    h.finite(placed.dh, `auto-framed ${iw}x${ih} in ${ratio} draws a finite height`);
    const drawnRatio = placed.dw / placed.dh;
    const sourceRatio = placed.sw / placed.sh;
    h.near(drawnRatio, sourceRatio, 0.02, `auto-framed ${iw}x${ih} in ${ratio} is not mis-shaped`);
  }
}

// autoFrame and suggestFit must never disagree: both are consulted by
// different screens and a split decision would look random. Every shape,
// however extreme, now fills the frame.
for (const [iw, ih] of [[1080, 1920], [900, 4000], [4000, 900], [1920, 1080], [1080, 1080]]) {
  for (const ratio of RATIOS) {
    const frame = frameSizeFor(ratio);
    const framing = autoFrame(stubImage(iw, ih) as never, frame.w, frame.h);
    const suggested = suggestFit(stubImage(iw, ih) as never, frame.w, frame.h);
    h.eq(framing.image_fit, suggested, `${iw}x${ih} in ${ratio}: auto framing agrees with the fit suggestion`);
    h.eq(framing.image_fit, "cover", `${iw}x${ih} in ${ratio}: the photo fills the frame`);
    const crop = framing.image_crop;
    const cropped = (iw * crop.w) / (ih * crop.h);
    h.near(cropped, frame.w / frame.h, 0.01, `${iw}x${ih} in ${ratio}: the crop is exactly the frame shape`);
  }
}

h.done("framing");
