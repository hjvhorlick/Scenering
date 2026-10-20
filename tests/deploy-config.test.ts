import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawConfig = readFileSync(join(root, "wrangler.jsonc"), "utf8");
const config = JSON.parse(rawConfig.replace(/^\s*\/\/.*$/gm, ""));
const checker = readFileSync(join(root, "scripts/check-deploy-config.mjs"), "utf8");
const setup = readFileSync(join(root, "scripts/setup-preview-resources.sh"), "utf8");
const docs = readFileSync(join(root, "CLOUDFLARE.md"), "utf8");
let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks++;
}

// Workers Builds runs `npx wrangler preview` for every branch except main, and
// wrangler 4.147+ exits immediately ("Your Wrangler configuration is missing a
// `previews` block") unless this block exists. Losing it turns every branch
// build red again.
const preview = config.previews;
check(Boolean(preview), "Wrangler config declares the `previews` block branch builds require");
check(rawConfig.includes('"previews"'), "the previews block survives JSONC comment stripping");

// A fake id is worse than a missing one: wrangler's config check passes, then
// the preview upload fails and the build goes red. So the committed previews
// block may only name real resources — which means it ships without storage
// bindings until `scripts/setup-preview-resources.sh` has been run.
const previewsOnly = JSON.stringify(preview);
check(!/PLACEHOLDER/i.test(previewsOnly), "previews block contains no placeholder ids");
check(!/<REPLACE_ME>/.test(rawConfig), "wrangler.jsonc contains no <REPLACE_ME> preview values");

// Whatever storage the previews block does carry must be isolated from
// production: unreviewed branch code must never touch live customer data.
if (preview.d1_databases?.length) {
  check(preview.d1_databases[0].binding === "DB", "preview D1 preserves the DB binding");
  check(preview.d1_databases[0].database_name === "scenering-db-preview", "preview D1 has a dedicated name");
  check(preview.d1_databases[0].database_id !== config.d1_databases[0].database_id, "preview D1 cannot point at production");
  check(/^[0-9a-f-]{36}$/.test(preview.d1_databases[0].database_id), "preview D1 id is a real database id");
}
if (preview.kv_namespaces?.length) {
  check(preview.kv_namespaces[0].binding === "RATE_LIMITS", "preview KV preserves the RATE_LIMITS binding");
  check(preview.kv_namespaces[0].id !== config.kv_namespaces[0].id, "preview KV cannot point at production");
  check(/^[0-9a-f]{32}$/.test(preview.kv_namespaces[0].id), "preview KV id is a real namespace id");
}
if (preview.r2_buckets?.length) {
  check(preview.r2_buckets[0].binding === "AUDIO_BUCKET", "preview R2 preserves the AUDIO_BUCKET binding");
  check(preview.r2_buckets[0].bucket_name !== config.r2_buckets[0].bucket_name, "preview R2 cannot point at production");
}

// Previews inherit no vars, so the preview-safe ones must be repeated here.
check(preview.vars.EMAIL_PROVIDER === "console", "previews do not send live email");
check(preview.vars.PADDLE_ENVIRONMENT === "sandbox", "previews use Paddle sandbox mode");
check(preview.vars.PADDLE_CLIENT_ENVIRONMENT === "sandbox", "preview Paddle.js environment is sandbox");
check(preview.vars.BILLING_PROVIDER === "", "previews do not select a live billing provider");

// Production deploys read the same file: they must be unaffected and keep
// passing their own guard.
check(checker.includes("delete config.previews"), "production validator excludes preview-only settings");
const productionCheck = spawnSync("node", [join(root, "scripts/check-deploy-config.mjs")], { cwd: root, encoding: "utf8" });
check(productionCheck.status === 0, "production deploy-config validation passes");

// The one-time setup has to fill the committed markers in place, point
// migrations at the preview database only, and create the named resources.
check(rawConfig.includes("// setup-preview-resources:bindings"), "wrangler.jsonc keeps the bindings start marker");
check(rawConfig.includes("// setup-preview-resources:bindings-end"), "wrangler.jsonc keeps the bindings end marker");
check(setup.includes("setup-preview-resources:bindings") && setup.includes("setup-preview-resources:bindings-end"), "setup writes the preview bindings between the markers");
check(setup.includes("rate-limits-preview") && setup.includes("scenering-audio-preview"), "setup creates named isolated KV and R2 resources");
check(setup.includes("wrangler d1 migrations apply") && setup.includes("--remote"), "setup applies migrations to the isolated remote preview database");
check(setup.includes("config.d1_databases = config.previews.d1_databases"), "migration setup cannot target the production D1 binding");

check(docs.includes("npx wrangler preview base-config secret put SESSION_SECRET"), "Cloudflare runbook documents the one-time preview secret step");
check(docs.includes("missing a `previews` block"), "Cloudflare runbook explains the branch-build failure mode");

console.log(`✓ deploy-config: ${checks} checks`);
