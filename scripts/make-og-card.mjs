/**
 * Builds the link-preview card (public/marketing/og-card.jpg, 1200×630).
 *
 * Everything on it is ours: the wordmark, one of the scene stills that the
 * website itself uses, and type. No stock photography, no invented numbers,
 * no claims — just the product name and what it does.
 *
 *   node scripts/make-og-card.mjs
 *
 * Needs ImageMagick (`convert`), same as scripts/optimize-marketing-assets.mjs.
 * The result is committed, so contributors only run this when the card
 * changes.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "marketing");
const out = join(outDir, "og-card.jpg");
const tmp = join(root, "node_modules", ".cache", "og");

const mark = join(root, "assets-src", "marketing", "mark-scenering.png");
const still = join(root, "assets-src", "marketing", "scene-02-ancient-city.png");

const W = 1200;
const H = 630;
const INK = "#121a2c";
const MUTED = "#5b6780";
const ACCENT = "#2f6df6";

const run = (args) => execFileSync("convert", args, { stdio: ["ignore", "inherit", "inherit"] });

for (const file of [mark, still]) {
  if (!existsSync(file)) {
    console.error(`[og-card] missing source: ${file}`);
    console.error("[og-card] the full-size sources live outside git — nothing to do.");
    process.exit(0);
  }
}

mkdirSync(outDir, { recursive: true });
mkdirSync(tmp, { recursive: true });

const shot = join(tmp, "shot.png");
const shotRounded = join(tmp, "shot-rounded.png");
const markSmall = join(tmp, "mark.png");
const base = join(tmp, "base.png");

// 1. The still, cropped to the card's picture area and rounded off.
const SW = 470;
const SH = 470;
run([still, "-resize", `${SW}x${SH}^`, "-gravity", "center", "-extent", `${SW}x${SH}`, shot]);
run([
  shot,
  "(", "+clone", "-alpha", "extract", "-draw", `fill black polygon 0,0 0,26 26,0 fill white circle 26,26 26,0`,
  "(", "+clone", "-flip", ")", "-compose", "multiply", "-composite",
  "(", "+clone", "-flop", ")", "-compose", "multiply", "-composite",
  ")",
  "-alpha", "off", "-compose", "copy_opacity", "-composite",
  shotRounded,
]);

// 2. Wordmark at website scale.
run([mark, "-resize", "236x", markSmall]);

// 3. Light background with a soft accent wash behind the picture.
run([
  "-size", `${W}x${H}`,
  `gradient:#ffffff-#e7edfa`,
  "-fill", "#dbe6ff", "-draw", "circle 1010,180 1010,10",
  "-blur", "0x70",
  base,
]);

// 4. Compose: shadow, picture, wordmark, type.
run([
  base,
  // drop shadow for the still
  "(", shotRounded, "-background", "rgba(20,30,60,0.22)", "-shadow", "48x22+0+14", ")",
  "-gravity", "northwest", "-geometry", "+652+72", "-composite",
  "(", shotRounded, ")", "-gravity", "northwest", "-geometry", "+660+80", "-composite",
  "(", markSmall, ")", "-gravity", "northwest", "-geometry", "+72+78", "-composite",
  "-font", "DejaVu-Sans-Bold",
  "-fill", INK, "-pointsize", "64", "-annotate", "+70+296", "From idea",
  "-fill", INK, "-pointsize", "64", "-annotate", "+70+370", "to video.",
  "-font", "DejaVu-Sans",
  "-fill", MUTED, "-pointsize", "25", "-annotate", "+72+448", "Write a script. Scenering turns it into scenes,",
  "-fill", MUTED, "-pointsize", "25", "-annotate", "+72+484", "visuals, narration and captions.",
  "-font", "DejaVu-Sans-Bold",
  "-fill", ACCENT, "-pointsize", "20", "-annotate", "+72+552", "Script  ·  Scenes  ·  Visuals  ·  Voice  ·  Captions  ·  Video Studio",
  "-quality", "88",
  out,
]);

rmSync(tmp, { recursive: true, force: true });
console.log(`[og-card] wrote ${out.replace(root + "/", "")} (${W}×${H})`);
