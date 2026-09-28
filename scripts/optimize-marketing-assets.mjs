#!/usr/bin/env node
/**
 * Marketing artwork optimiser.
 *
 * Source artwork lives in `assets-src/marketing/` as full-size PNG (that
 * folder is git-ignored — it is the "negative", not the print). This script
 * turns every source file into the two responsive WebP widths the public
 * website actually ships:
 *
 *     public/marketing/<id>-1280.webp   used above ~720px viewport
 *     public/marketing/<id>-640.webp    phones and thumbnails
 *
 * Run it after adding or replacing artwork:
 *
 *     npm run marketing:assets
 *
 * Replacing a conceptual illustration with a real product screenshot later is
 * therefore a two-step job: drop the new file in `assets-src/marketing/` under
 * the same name, re-run this script. The website reads everything through
 * `src/marketing/assets.ts`, so nothing else changes.
 *
 * ImageMagick does the encoding. If it is not installed the script explains
 * what to install and exits 0, so `npm run build` never fails over artwork.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(repoRoot, "assets-src", "marketing");
const outDir = join(repoRoot, "public", "marketing");

/**
 * Widths shipped per asset. Photography needs two responsive sizes; a brand
 * mark only ever renders small, so `mark-*.png` gets its own pair instead of
 * a pointless 1280px encode.
 */
const WIDTH_PRESETS = [
  { match: /^mark-/, widths: [240, 120] },
  // The square key art never renders wider than a hero column, and the source
  // is 1024 square — encoding a 1280 would be an upscale.
  { match: /^hero-showpiece$/, widths: [1024, 512] },
  { match: /.*/, widths: [1280, 640] },
];
const widthsFor = (id) => WIDTH_PRESETS.find((preset) => preset.match.test(id)).widths;
/** WebP quality — visually lossless for photography at these widths. */
const QUALITY = 78;

function findMagick() {
  for (const candidate of [
    ["magick", ["convert"]],
    ["convert", []],
  ]) {
    const [bin, prefix] = candidate;
    const probe = spawnSync(bin, [...prefix, "-version"], { stdio: "ignore" });
    if (probe.status === 0) return { bin, prefix };
  }
  return null;
}

const magick = findMagick();
if (!magick) {
  console.log(
    "[marketing-assets] ImageMagick not found — skipping.\n" +
      "                   Install it (apt install imagemagick / brew install imagemagick)\n" +
      "                   and re-run `npm run marketing:assets` to rebuild the WebP set."
  );
  process.exit(0);
}

if (!existsSync(sourceDir)) {
  console.log(`[marketing-assets] no source folder at ${sourceDir} — nothing to do.`);
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const sources = readdirSync(sourceDir).filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
if (sources.length === 0) {
  console.log("[marketing-assets] no source artwork found — nothing to do.");
  process.exit(0);
}

let written = 0;
let skipped = 0;

for (const name of sources) {
  const src = join(sourceDir, name);
  const id = parse(name).name;
  const srcStat = statSync(src);

  for (const width of widthsFor(id)) {
    const out = join(outDir, `${id}-${width}.webp`);
    // Only re-encode when the source is newer than the output.
    if (existsSync(out) && statSync(out).mtimeMs >= srcStat.mtimeMs) {
      skipped++;
      continue;
    }
    execFileSync(magick.bin, [
      ...magick.prefix,
      src,
      "-auto-orient",
      "-strip",
      "-resize",
      `${width}x>`,
      "-quality",
      String(QUALITY),
      "-define",
      "webp:method=6",
      out,
    ]);
    written++;
  }
}

const totalKb = readdirSync(outDir)
  .filter((n) => n.endsWith(".webp"))
  .reduce((sum, n) => sum + statSync(join(outDir, n)).size, 0);

console.log(
  `[marketing-assets] ${written} file(s) encoded, ${skipped} up to date — ` +
    `${(totalKb / 1024).toFixed(0)} KB total in public/marketing/`
);
