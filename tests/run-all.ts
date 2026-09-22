import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Runs every *.test.ts in this folder in its own process and reports a
 * summary. Each suite is a plain tsx script, so there is no test-runner
 * dependency to install or keep up to date.
 */
const here = dirname(fileURLToPath(import.meta.url));

const suites = readdirSync(here)
  .filter((name) => name.endsWith(".test.ts"))
  .sort();

if (suites.length === 0) {
  console.error("No test suites found in", here);
  process.exit(1);
}

let failed = 0;
const started = Date.now();

for (const suite of suites) {
  const result = spawnSync("npx", ["--no-install", "tsx", join(here, suite)], {
    stdio: "inherit",
    encoding: "utf8",
  });
  if (result.status !== 0) failed++;
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  failed === 0
    ? `\nAll ${suites.length} suites passed in ${seconds}s`
    : `\n${failed} of ${suites.length} suites FAILED (${seconds}s)`
);

process.exit(failed === 0 ? 0 : 1);
