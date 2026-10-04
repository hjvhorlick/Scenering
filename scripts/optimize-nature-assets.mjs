#!/usr/bin/env node
/**
 * Bundled nature library optimiser.
 *
 * The fallback library is the floor under image research: with no API key,
 * no network, or a subject the stock libraries have nothing for, these are
 * the photos a scene still gets. They are therefore shipped as same-origin
 * files rather than hotlinked from a provider that can disappear.
 *
 * Source artwork lives in `assets-src/nature/` as full-size PNG (git-ignored
 * — it is the "negative", not the print). This script turns every source
 * file into the two sizes the app actually ships:
 *
 *     public/nature/<id>-1920.webp   the photo a scene uses (exact 16:9 1080p)
 *     public/nature/<id>-640.webp    grid thumbnail and photo analysis
 *
 * Run it after adding or replacing a library photo:
 *
 *     npm run nature:assets
 *
 * Both outputs are centre-cropped to exactly 16:9 so every library photo
 * satisfies the same shape rule the stock providers are held to, and the
 * 1920×1080 variant means a 1080p render never upscales one.
 *
 * ImageMagick does the encoding. If it is not installed the script explains
 * what to install and exits 0, so `npm run build` never fails over artwork.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(repoRoot, "assets-src", "nature");
const outDir = join(repoRoot, "public", "nature");

/** The shipped pair. Widths are heights' 16:9 partners, cropped not padded. */
const VARIANTS = [
  { width: 1920, height: 1080, quality: 72, sharpen: true },
  { width: 640, height: 360, quality: 80, sharpen: false },
];

function magick() {
  for (const candidate of ["magick", "convert"]) {
    const probe = spawnSync(candidate, ["-version"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const tool = magick();
if (!tool) {
  console.log("ImageMagick not found — skipping nature artwork.");
  console.log("Install it (brew install imagemagick / apt-get install imagemagick) and re-run `npm run nature:assets`.");
  process.exit(0);
}

if (!existsSync(sourceDir)) {
  console.log(`No ${sourceDir} — nothing to optimise.`);
  console.log("The shipped WebP set in public/nature/ is committed, so this is normal in a fresh clone.");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const sources = readdirSync(sourceDir).filter((name) => /\.(png|jpe?g)$/i.test(name));
if (sources.length === 0) {
  console.log(`No source artwork in ${sourceDir}.`);
  process.exit(0);
}

let written = 0;
for (const name of sources) {
  const id = parse(name).name;
  for (const { width, height, quality, sharpen } of VARIANTS) {
    const out = join(outDir, `${id}-${width}.webp`);
    execFileSync(tool, [
      join(sourceDir, name),
      "-colorspace", "sRGB",
      "-filter", "Lanczos",
      // `^` scales to cover, then extent crops the overflow away: an exact
      // 16:9 frame with no letterboxing and no distortion.
      "-resize", `${width}x${height}^`,
      "-gravity", "center",
      "-extent", `${width}x${height}`,
      ...(sharpen ? ["-unsharp", "0x0.75+0.5+0.008"] : []),
      "-quality", String(quality),
      "-define", "webp:method=6",
      out,
    ]);
    written++;
  }
  console.log(`  ${id} → ${VARIANTS.map((v) => `${v.width}w`).join(", ")}`);
}

console.log(`\nWrote ${written} files to public/nature/ from ${sources.length} sources.`);
