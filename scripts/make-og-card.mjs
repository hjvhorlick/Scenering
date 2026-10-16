/**
 * Builds the search and link-preview image (public/marketing/og-hero.jpg,
 * 1200×630) from the hero section's key art.
 *
 * The owner asked for the hero section image to be the picture search engines
 * and link previews show, so the card IS that image: the Scenering key art
 * (public/marketing/hero-showpiece-1024.webp, the same file the hero section
 * draws) set whole in the middle of a 1200×630 frame. Nothing is added to it —
 * no text, no claims, no second picture — and nothing is cut from it: the art
 * is square, the frame is wide, so the frame is widened with the art's own
 * deep navy rather than cropping the SCENERING name off the bottom.
 *
 * Why 1200×630: it is the size Facebook, LinkedIn, WhatsApp and X (large
 * card) draw without cropping, and it is at least 1200 px wide, which is what
 * Google asks of large preview images. A square crop of the middle — what some
 * apps and search thumbnails take — is exactly the key art.
 *
 *   node scripts/make-og-card.mjs        (`npm run marketing:og`)
 *
 * Needs ImageMagick (`convert`), same as scripts/make-site-icons.mjs and
 * scripts/optimize-marketing-assets.mjs. The source is committed, so anyone
 * can rebuild the card; the result is committed too, so a contributor only
 * runs this when the key art changes. The filename changed from og-card.jpg
 * when the picture did: link-preview services cache by URL, and a new URL is
 * the reliable way to make them fetch the new picture.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "marketing");
const out = join(outDir, "og-hero.jpg");
const tmp = join(root, "node_modules", ".cache", "og");

/** The hero section's key art — the file the website itself shows. */
const art = join(outDir, "hero-showpiece-1024.webp");

const W = 1200;
const H = 630;
/** The art fills the frame's height and sits in the middle. */
const ART = H;
const LEFT = Math.round((W - ART) / 2);
/** How far the art's left and right edges fade into the background. */
const FEATHER = 110;
/* The background continues the art's own colours: its edges are a near-black
   navy (sampled at #01021e top, #010112 bottom) with a brighter navy glow
   behind the emblem. */
const TOP = "#020629";
const BOTTOM = "#010113";
const GLOW = "#0a1b55";

const run = (args) => execFileSync("convert", args, { stdio: ["ignore", "inherit", "inherit"] });

if (!existsSync(art)) {
  console.error(`[og-hero] missing source: ${art}`);
  process.exit(1);
}

mkdirSync(tmp, { recursive: true });
const sized = join(tmp, "art.png");
const mask = join(tmp, "mask.png");
const faded = join(tmp, "art-faded.png");
const base = join(tmp, "base.png");

// 1. The key art at the frame's height, whole.
run([art, "-resize", `${ART}x${ART}`, sized]);

// 2. A mask that fades the art's left and right edges into the background, so
//    there is no visible seam where the square art meets the wide frame.
run([
  "-size", `${ART}x${ART}`, "xc:white",
  "(", "-size", `${ART}x${FEATHER}`, "gradient:black-white", "-rotate", "-90", ")",
  "-geometry", "+0+0", "-composite",
  "(", "-size", `${ART}x${FEATHER}`, "gradient:white-black", "-rotate", "-90", ")",
  "-geometry", `+${ART - FEATHER}+0`, "-composite",
  mask,
]);
run([sized, mask, "-alpha", "off", "-compose", "CopyOpacity", "-composite", faded]);

// 3. The wide background: the art's navy, top to bottom, with its glow.
run([
  "-size", `${W}x${H}`, `gradient:${TOP}-${BOTTOM}`,
  "(", "-size", `${W}x${H}`, `radial-gradient:${GLOW}-none`, ")",
  "-compose", "over", "-composite",
  base,
]);

// 4. The art on the background, as a progressive JPEG with no metadata.
run([
  base, faded, "-gravity", "northwest", "-geometry", `+${LEFT}+0`, "-compose", "over", "-composite",
  "-quality", "88", "-interlace", "Plane", "-strip",
  out,
]);

rmSync(tmp, { recursive: true, force: true });
console.log(`[og-hero] wrote ${out.replace(root + "/", "")} (${W}×${H}) from ${art.replace(root + "/", "")}`);
