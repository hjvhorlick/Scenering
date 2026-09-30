import { createHarness } from "./harness";
import {
  is16x9Aspect,
  meetsFullHd,
  isUsableStockDimensions,
  pexelsPhotoToCandidate,
  pixabayHitToCandidate,
  pixabayUpgradeUrlTo1920,
  wikimediaThumbAtWidth,
  wikimediaInfoToCandidate,
  PHOTO_MIN_WIDTH,
  PHOTO_MIN_HEIGHT,
} from "../src/lib/image-candidates";
import {
  classifyPhotoMetrics,
  computePhotoMetrics,
  MAX_ANALYZED,
} from "../src/lib/image-analysis";

/**
 * The image-search quality gate: only photographic images, every one of them
 * 16:9 and at least 1920×1080, and never upscaled into a 1080p render.
 */
const h = createHarness();

// ------------------------------------------------------------- dimensions
h.ok(is16x9Aspect(1920, 1080), "1920×1080 is 16:9");
h.ok(is16x9Aspect(3840, 2160), "3840×2160 is 16:9");
h.ok(is16x9Aspect(1920, 1116), "1920×1116 (1.72) counts as ~16:9");
h.ok(!is16x9Aspect(1920, 1129), "1920×1129 (1.70) is outside the 16:9 tolerance");
h.ok(!is16x9Aspect(3000, 2000), "3:2 is not 16:9");
h.ok(!is16x9Aspect(1920, 1440), "4:3 is not 16:9");
h.ok(!is16x9Aspect(1080, 1920), "portrait is not 16:9");
h.ok(!is16x9Aspect(0, 0), "zero size is not 16:9");
h.ok(!is16x9Aspect(undefined, undefined), "missing size is not 16:9");

h.ok(meetsFullHd(1920, 1080), "1920×1080 meets Full HD");
h.ok(meetsFullHd(4000, 2300), "4000×2300 meets Full HD");
h.ok(!meetsFullHd(1880, 1060), "1880 wide does not meet Full HD");
h.ok(!meetsFullHd(1920, 1072), "1072 high does not meet Full HD");

h.ok(isUsableStockDimensions(1920, 1080), "16:9 Full HD passes the gate");
h.ok(!isUsableStockDimensions(2400, 1200), "2:1 Full HD fails the aspect gate");
h.ok(!isUsableStockDimensions(1280, 720), "720p fails the size gate");

// ----------------------------------------------------------------- Pexels
const pexelsPhoto = (w: number, hh: number, id = 123) => ({
  width: w,
  height: hh,
  src: { original: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?foo=1` },
});

const px = pexelsPhotoToCandidate(pexelsPhoto(3000, 2000));
h.ok(px !== null, "large landscape photo accepted");
h.eq(px!.url, "https://images.pexels.com/photos/123/pexels-photo-123.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop", "delivered as an exact 1920×1080 crop");
h.eq(px!.thumbnail, "https://images.pexels.com/photos/123/pexels-photo-123.jpeg?auto=compress&cs=tinysrgb&w=480&h=270&fit=crop", "thumbnail is the same 16:9 composition");
h.eq(px!.width, 1920, "reported width is the served width");
h.eq(px!.height, 1080, "reported height is the served height");

h.ok(pexelsPhotoToCandidate(pexelsPhoto(4000, 3000)) !== null, "any source aspect works when the CDN crops");
h.ok(pexelsPhotoToCandidate(pexelsPhoto(940, 627)) === null, "940px source rejected (would upscale)");
h.ok(pexelsPhotoToCandidate(pexelsPhoto(1920, 1000)) === null, "under-height source rejected");
h.ok(pexelsPhotoToCandidate({ width: 3000, height: 2000, src: {} }) === null, "missing original URL rejected");
h.ok(pexelsPhotoToCandidate(null) === null, "null photo rejected");

// ---------------------------------------------------------------- Pixabay
const pixabayHit = (over: Record<string, any>) => ({
  imageWidth: 1920,
  imageHeight: 1080,
  largeImageURL: "https://pixabay.com/get/gabc_1280.jpg",
  webformatURL: "https://pixabay.com/get/gabc_640.jpg",
  previewURL: "https://pixabay.com/get/gabc_150.jpg",
  ...over,
});

const pb = pixabayHitToCandidate(pixabayHit({ fullHDURL: "https://pixabay.com/get/gabc_1920.jpg" }));
h.ok(pb !== null, "16:9 Full HD hit accepted");
h.eq(pb!.url, "https://pixabay.com/get/gabc_1920.jpg", "fullHDURL preferred");
h.ok(pixabayHitToCandidate(pixabayHit({ imageWidth: 6000, imageHeight: 4000, fullHDURL: "u_1920.jpg" })) === null, "3:2 hit rejected (Pixabay cannot crop)");
h.ok(pixabayHitToCandidate(pixabayHit({ imageWidth: 1280, imageHeight: 720 })) === null, "720p hit rejected");
h.ok(pixabayHitToCandidate(pixabayHit({})) === null, "hit without a Full HD URL rejected rather than upscaled");

h.eq(pixabayUpgradeUrlTo1920("https://pixabay.com/get/gabc_1280.jpg"), "https://pixabay.com/get/gabc_1920.jpg", "_1280 upgraded to _1920");
h.eq(pixabayUpgradeUrlTo1920("https://pixabay.com/get/gabc_640.jpg?foo"), "https://pixabay.com/get/gabc_1920.jpg", "_640 upgraded, query stripped");
h.eq(pixabayUpgradeUrlTo1920("https://example.com/photo.jpg"), null, "non-/get/ URL cannot be upgraded");

// ------------------------------------------------------------- Wikimedia
h.eq(
  wikimediaThumbAtWidth("https://upload.wikimedia.org/w/commons/a/ab/F.jpg/1920px-F.jpg", 320),
  "https://upload.wikimedia.org/w/commons/a/ab/F.jpg/320px-F.jpg",
  "thumb width swapped"
);
h.eq(
  wikimediaThumbAtWidth("https://upload.wikimedia.org/w/commons/a/ab/F.jpg", 320),
  "https://upload.wikimedia.org/w/commons/a/ab/F.jpg",
  "non-thumb URL passes through"
);

const wm = wikimediaInfoToCandidate({
  width: 3840,
  height: 2160,
  thumburl: "https://upload.wikimedia.org/w/commons/a/ab/F.jpg/1920px-F.jpg",
  thumbwidth: 1920,
  url: "https://upload.wikimedia.org/w/commons/a/ab/F.jpg",
});
h.ok(wm !== null, "16:9 wikimedia image accepted");
h.eq(wm!.url, "https://upload.wikimedia.org/w/commons/a/ab/F.jpg/1920px-F.jpg", "1920px thumb served");
h.ok(wm!.thumbnail.endsWith("/320px-F.jpg"), "small thumb derived for the grid");
h.ok(wikimediaInfoToCandidate({ width: 1200, height: 675, thumburl: "t" }) === null, "small wikimedia image rejected");
h.ok(wikimediaInfoToCandidate({ width: 3840, height: 2160 }) === null, "wikimedia entry without URLs rejected");

// ---------------------------------------------------- photo classification
/**
 * Deterministic photo-grain noise, so synthetic fixtures behave like the
 * downscaled photographs the real analyser sees (hundreds of quantised
 * colours) instead of flat blocks of a handful.
 */
let lcgState = 42;
const lcg = () => ((lcgState = (lcgState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

/** Tiles base colours across a full analysis-sized grid with grain on top. */
function rowsFromBase(bases: number[][], rows: number, cols: number, grain: number): number[][][] {
  const out: number[][][] = [];
  for (let i = 0; i < rows; i++) {
    const row: number[][] = [];
    for (let j = 0; j < cols; j++) {
      const [r, g, b] = bases[(i * cols + j) % bases.length];
      const n = () => Math.round((lcg() - 0.5) * 2 * grain);
      row.push([
        Math.max(0, Math.min(255, r + n())),
        Math.max(0, Math.min(255, g + n())),
        Math.max(0, Math.min(255, b + n())),
      ]);
    }
    out.push(row);
  }
  return out;
}

// A colour photograph: varied hues, no dominant white, plenty of grain.
const photo = computePhotoMetrics(
  new Uint8ClampedArray(
    rowsFromBase(
      [
        [84, 62, 41], [120, 90, 60], [160, 130, 90], [90, 110, 140], [60, 90, 130],
        [200, 180, 140], [150, 100, 70], [100, 140, 120], [130, 120, 100], [70, 60, 90],
      ],
      36,
      64,
      18
    ).flat(2)
  )
);
h.eq(classifyPhotoMetrics(photo), "photo", "colour photo accepted");
h.ok(photo.uniqueColors >= 220, `colour photo has photo-like colour variety (${photo.uniqueColors})`);

// A black-and-white photograph: luminance variety, no chroma (grain kept gray).
const bwPixels: number[] = [];
for (let i = 0; i < 36 * 64; i++) {
  const v = 20 + Math.floor(lcg() * 215);
  const jitter = Math.round((lcg() - 0.5) * 6);
  bwPixels.push(v, v + jitter, v - jitter, 255);
}
const bw = computePhotoMetrics(new Uint8ClampedArray(bwPixels));
h.eq(classifyPhotoMetrics(bw), "reject", "black-and-white photo rejected");
h.ok(bw.colorFrac < 0.05, `B&W shot has almost no chroma (${bw.colorFrac.toFixed(3)})`);

// A line diagram: white paper, a handful of flat colours, no grain.
const diagramPixels: number[] = [];
const diagramBases = [
  [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255],
  [40, 40, 40], [255, 255, 255], [200, 30, 30], [255, 255, 255],
  [30, 30, 200], [255, 255, 255], [255, 255, 255], [40, 40, 40],
];
for (let i = 0; i < 36 * 64; i++) {
  const [r, g, b] = diagramBases[i % diagramBases.length];
  diagramPixels.push(r, g, b, 255);
}
const diagram = computePhotoMetrics(new Uint8ClampedArray(diagramPixels));
h.eq(classifyPhotoMetrics(diagram), "reject", "line diagram rejected");
h.ok(diagram.whiteFrac > 0.62, `diagram is paper-white (${diagram.whiteFrac.toFixed(2)})`);

// A snowy landscape: bright, but with sky and rock tones plus grain — must pass.
const snow = computePhotoMetrics(
  new Uint8ClampedArray(
    rowsFromBase(
      [
        [120, 160, 210], [150, 185, 230], [235, 238, 245], [245, 246, 250],
        [250, 250, 252], [240, 242, 248], [180, 170, 160], [90, 85, 80],
      ],
      36,
      64,
      8
    ).flat(2)
  )
);
h.eq(classifyPhotoMetrics(snow), "photo", "bright snowy landscape still accepted");

// A night shot: mostly dark, but colourful — must pass.
const night = computePhotoMetrics(
  new Uint8ClampedArray(
    rowsFromBase(
      [
        [8, 10, 24], [12, 14, 40], [30, 20, 60], [80, 40, 90], [20, 60, 110],
        [10, 12, 30], [60, 30, 30], [15, 18, 45],
      ],
      36,
      64,
      8
    ).flat(2)
  )
);
h.eq(classifyPhotoMetrics(night), "photo", "colourful night shot still accepted");

// Metrics sanity on the raw computation.
const flat = computePhotoMetrics(new Uint8ClampedArray([255, 0, 0, 255]));
h.near(flat.colorFrac, 1, 1e-9, "pure red counts as colourful");
h.eq(flat.uniqueColors, 1, "one quantised colour counted");
h.ok(MAX_ANALYZED >= 12, "analysis cap still fills a grid");


h.done("image candidates");
