import { createHarness, createStubContext, stubImage } from "./harness";
import {
  placeImage,
  resolveFraming,
  frameSizeFor,
  fitFrameInBox,
  drawSceneImage,
  leavesGap,
  suggestFit,
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

// suggestFit should recommend the blurred fill only for a real shape mismatch.
h.eq(suggestFit(stubImage(1600, 900), 1920, 1080), "cover", "matching shapes use cover");
h.eq(
  suggestFit(stubImage(600, 1600), 1920, 1080),
  "blur_fill",
  "a tall photo in a wide frame gets the blurred fill"
);
// The 1x1 box is still checked for robustness, just not for exact shape.
const tiny = fitFrameInBox("16:9", 1, 1);
h.ok(tiny.w >= 1 && tiny.h >= 1, "fitFrameInBox survives a 1x1 box");

h.done("framing");
