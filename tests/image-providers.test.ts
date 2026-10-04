import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "./harness";

/**
 * Provider request limits.
 *
 * Image research looked broken for every account that had keys: the client
 * asks for 100 candidates, and the server passed that straight through as
 * each provider's page size. Pexels rejects `per_page` above 80 with a 400
 * and Wikimedia rejects more than 50 `titles=` values, so both answered with
 * nothing on every single search and the studio silently fell back to the
 * bundled nature deck — "the image search does not work".
 *
 * The provider functions live inside server.ts, which starts a listening
 * server when imported, so these checks read the source: the ceilings must
 * stay clamped and every upstream call must be bounded by a timeout, or a
 * hung provider leaves the search spinner turning for ever.
 */
const h = createHarness();

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = readFileSync(join(repoRoot, "server.ts"), "utf8");

const section = (from: string, to: string) => {
  const start = server.indexOf(from);
  const end = server.indexOf(to, start + 1);
  return start === -1 ? "" : server.slice(start, end === -1 ? server.length : end);
};

const pexels = section("async function searchPexels", "async function searchPixabay");
const pixabay = section("async function searchPixabay", "async function searchWikimedia");
const wikimedia = section("async function searchWikimedia", "function generatePlaceholder");

h.ok(pexels.length > 0, "the Pexels provider is present in the server");
h.ok(pixabay.length > 0, "the Pixabay provider is present in the server");
h.ok(wikimedia.length > 0, "the Wikimedia provider is present in the server");

// ------------------------------------------------------------- page ceilings
h.ok(
  /const PEXELS_MAX_PER_PAGE = 80;/.test(server),
  "the Pexels page ceiling is stated as the documented 80"
);
h.ok(
  /const PIXABAY_MAX_PER_PAGE = 200;/.test(server),
  "the Pixabay page ceiling is stated as the documented 200"
);
h.ok(
  /const WIKIMEDIA_MAX_TITLES = 50;/.test(server),
  "the Wikimedia titles ceiling is stated as the documented 50"
);

h.ok(
  !/per_page=\$\{count\}/.test(pexels),
  "Pexels is never asked for the raw requested count"
);
h.ok(
  pexels.includes("Math.min(Math.max(1, count), PEXELS_MAX_PER_PAGE)"),
  "the Pexels page size is clamped to its ceiling"
);
h.ok(
  !/per_page=\$\{count\}/.test(pixabay),
  "Pixabay is never asked for the raw requested count"
);
h.ok(
  pixabay.includes("Math.min(Math.max(3, count), PIXABAY_MAX_PER_PAGE)"),
  "the Pixabay page size is clamped to its 3–200 window"
);
h.ok(
  !/srlimit=\$\{count\}/.test(wikimedia),
  "Wikimedia is never asked for the raw requested count"
);
h.ok(
  wikimedia.includes("WIKIMEDIA_MAX_TITLES"),
  "Wikimedia image info is requested in chunks of at most 50 titles"
);
h.ok(
  !/titles=\$\{encodeURIComponent\(allTitles/.test(wikimedia),
  "the whole title list is never sent in one request"
);

// ------------------------------------------------------------------ timeouts
h.ok(
  /const PROVIDER_TIMEOUT_MS = \d+;/.test(server),
  "a provider timeout is defined"
);
for (const [name, body] of [
  ["Pexels", pexels],
  ["Pixabay", pixabay],
  ["Wikimedia", wikimedia],
] as const) {
  const fetches = body.match(/await fetch\(/g)?.length ?? 0;
  const timeouts = body.match(/AbortSignal\.timeout\(PROVIDER_TIMEOUT_MS\)/g)?.length ?? 0;
  h.ok(fetches > 0, `${name} makes at least one upstream request`);
  h.eq(timeouts, fetches, `every ${name} request is bounded by the provider timeout`);
}

// ---------------------------------------------------------------- diagnostics
for (const [name, body] of [
  ["Pexels", pexels],
  ["Pixabay", pixabay],
  ["Wikimedia", wikimedia],
] as const) {
  h.ok(
    body.includes("console.warn"),
    `a failed ${name} search is reported instead of being swallowed silently`
  );
  h.ok(
    !/\}\s*catch\s*\{\s*return \[\];/.test(body),
    `${name} no longer discards its error without a word`
  );
}

h.done("image-providers");
