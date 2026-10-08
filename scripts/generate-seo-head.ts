#!/usr/bin/env node
/**
 * Writes the front page's search-engine tags into index.html.
 *
 *   npx tsx scripts/generate-seo-head.ts      (`npm run seo:head`)
 *
 * The tags live in `src/shared/seo.ts` and are injected into the shell per URL
 * by the Worker. `index.html` keeps a copy so a deployment that serves the built
 * files with no Worker at all is still described correctly — which means that
 * copy has to be regenerated whenever the table changes (a new page, a new
 * description, a price that moved). Doing that by hand is how the price in a
 * search result ends up a release behind the checkout.
 *
 * Only the region between the `seo:start` and `seo:end` markers is replaced;
 * everything around it — the comments that explain the block, the icons, the
 * theme bootstrap — is left alone. `npm run build` does not run this: a build
 * should not rewrite a source file, and the test suite fails loudly if the
 * committed copy has drifted.
 *
 * Written as TypeScript rather than .mjs (the other scripts in this folder are
 * .mjs) because it imports the shared table, and running it through `tsx` is
 * how the tests already import the same module.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEO_HEAD_END, SEO_HEAD_INDENT, SEO_HEAD_START, staticSeoHeadBlock } from "../src/shared/seo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "index.html");
const html = readFileSync(file, "utf8");

const start = html.indexOf(SEO_HEAD_START);
const end = html.indexOf(SEO_HEAD_END);
if (start === -1 || end === -1 || end < start) {
  console.error(`[seo] ${SEO_HEAD_START} / ${SEO_HEAD_END} markers are missing from index.html`);
  process.exit(1);
}

const before = html.slice(0, start + SEO_HEAD_START.length);
const after = html.slice(end);
const next = `${before}\n${staticSeoHeadBlock()}\n${SEO_HEAD_INDENT}${after}`;

if (next === html) {
  console.log("[seo] index.html already matches src/shared/seo.ts");
} else {
  writeFileSync(file, next);
  console.log("[seo] wrote the front page's tags into index.html");
}
