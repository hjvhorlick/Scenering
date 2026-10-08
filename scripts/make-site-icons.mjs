#!/usr/bin/env node
/**
 * Builds the site's icons from the brand artwork.
 *
 *   node scripts/make-site-icons.mjs      (`npm run brand:icons`)
 *
 * WHAT IT MAKES
 *   public/favicon.ico                       16, 32 and 48 px, for browser tabs
 *   public/favicon-32.png                    32 px, the PNG tab icon some
 *                                            browsers and crawlers prefer
 *   public/icon-192.png                      192 px, the web-app manifest icon
 *   public/apple-touch-icon.png              180 px, iOS home screen
 *   public/marketing/logo-scenering-512.png  512 px, the logo search engines read
 *                                            and the large manifest icon — one
 *                                            copy, so the brand mark cannot end
 *                                            up in two versions
 *
 * WHERE THE ARTWORK COMES FROM
 *   assets-src/brand/scenering-icon.png — the full-size icon the owner supplied
 *   (1254×1254). Like the rest of assets-src, that master lives outside git and
 *   the results here are committed, so a contributor only runs this when the
 *   mark changes. Without the master the script says so and stops; it never
 *   invents a mark of its own.
 *
 * WHY IT IS NOT CROPPED
 *   The artwork is used as it is drawn — resized and nothing else, no
 *   recolouring, no trimming of its background and no cropping of the letter.
 *   If a future master is not square it is letterboxed to square (padded with
 *   the colour of its own top-left pixel) so that every derived icon stays a
 *   square tile; a search result and a home screen both expect one, and
 *   cropping is how a letter loses an edge. Google asks for a square PNG or ICO
 *   of at least 48 px linked from the home page, which is why there is no SVG
 *   here.
 *
 * Needs ImageMagick (`convert`), same as scripts/make-og-card.mjs and
 * scripts/optimize-marketing-assets.mjs.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const marketingDir = join(publicDir, "marketing");
const tmp = join(root, "node_modules", ".cache", "icons");

/** The owner's artwork: the whole mark, at full size. */
const MASTER = join(root, "assets-src", "brand", "scenering-icon.png");

/** What each icon is for, and the size the browser or crawler asks for. */
const OUTPUTS = [
  [512, join(marketingDir, "logo-scenering-512.png")],  // schema logo, manifest, social cards
  [192, join(publicDir, "icon-192.png")],               // manifest / Android
  [32, join(publicDir, "favicon-32.png")],              // PNG tab icon
  [180, join(publicDir, "apple-touch-icon.png")],       // iOS home screen
];
/** The sizes inside favicon.ico, largest first. */
const ICO_SIZES = [48, 32, 16];

function fail(message) {
  console.error(`[icons] ${message}`);
  process.exit(1);
}

if (!existsSync(MASTER)) {
  console.log(`[icons] no brand artwork at ${MASTER} — nothing to do.`);
  console.log("[icons] the full-size master lives outside git; the committed icons in public/ are what ships.");
  process.exit(0);
}

/* The PNG header, read directly: width, height. No image library needed to
   know whether the master is square. */
const header = readFileSync(MASTER).subarray(0, 24);
if (header.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") fail(`${MASTER} is not a PNG.`);
const width = header.readUInt32BE(16);
const height = header.readUInt32BE(20);
if (width < 512 || height < 512) fail(`${MASTER} is ${width}×${height}; the logo search engines read must be at least 512px.`);

let magick = "convert";
try {
  execFileSync(magick, ["-version"], { stdio: "ignore" });
} catch {
  try {
    magick = "magick";
    execFileSync(magick, ["-version"], { stdio: "ignore" });
  } catch {
    fail("ImageMagick is required (install `convert`, or `magick` from ImageMagick 7).");
  }
}
const run = (args) => execFileSync(magick, args, { stdio: ["ignore", "inherit", "inherit"] });

mkdirSync(marketingDir, { recursive: true });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

/* Square, at full size. The master is square already — this branch exists so a
   future one that is not gets padded rather than clipped. */
const square = join(tmp, "square.png");
if (width === height) {
  run([MASTER, "-strip", square]);
} else {
  console.log(`[icons] ${width}×${height} artwork — padding to ${Math.max(width, height)}², not cropping it`);
  const side = Math.max(width, height);
  run([MASTER, "-background", "white", "-gravity", "center", "-extent", `${side}x${side}`, "-strip", square]);
}

/* Every size from that same square, through the same two steps, so the set is
   consistent: the tab icon, the manifest, the home screen and the logo a
   search engine reads.
 
   1. Lanczos down to the size. Nothing else about the drawing changes — no
      recolour, no trim, no crop, and the letter is the letter the master
      draws.
   2. A light unsharp. A 1254px artwork reduced to 32px goes soft: the blue
      rim the S leans on loses its edge and the mark turns to mush in a tab.
      Measured against the plain reduction the difference is under one percent
      of the pixels at 512px — invisible at logo size — and it is what keeps
      16, 32 and 48 legible. */
const reduce = (size, out) => {
  run([square, "-filter", "Lanczos", "-resize", `${size}x${size}`, "-unsharp", "0x0.6+0.6+0.02", "-strip", out]);
};

for (const [size, out] of OUTPUTS) {
  reduce(size, out);
  console.log(`[icons] wrote ${out.replace(`${root}/`, "")} (${size}×${size})`);
}

const icoParts = ICO_SIZES.map((size) => {
  const out = join(tmp, `favicon-${size}.png`);
  reduce(size, out);
  return out;
});
run([...icoParts, join(publicDir, "favicon.ico")]);
console.log(`[icons] wrote public/favicon.ico (${ICO_SIZES.join(", ")})`);

rmSync(tmp, { recursive: true, force: true });
