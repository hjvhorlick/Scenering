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

const preview = config.previews;
check(Boolean(preview), "Wrangler config declares Worker Previews");
check(preview.d1_databases.length === 1, "previews define one isolated D1 database");
check(preview.d1_databases[0].binding === "DB", "preview D1 preserves the DB binding");
check(preview.d1_databases[0].database_name === "scenering-db-preview", "preview D1 has a dedicated name");
check(preview.d1_databases[0].database_id.includes("PLACEHOLDER"), "preview D1 ID awaits account setup");
check(preview.d1_databases[0].database_id !== config.d1_databases[0].database_id, "preview D1 cannot point at production");
check(preview.d1_databases[0].migrations_dir === "./migrations", "preview D1 uses the app migrations");
check(preview.kv_namespaces.length === 1, "previews define one isolated KV namespace");
check(preview.kv_namespaces[0].binding === "RATE_LIMITS", "preview KV preserves the RATE_LIMITS binding");
check(preview.kv_namespaces[0].id.includes("PLACEHOLDER"), "preview KV ID awaits account setup");
check(preview.kv_namespaces[0].id !== config.kv_namespaces[0].id, "preview KV cannot point at production");
check(preview.r2_buckets.length === 1, "previews define one isolated R2 bucket");
check(preview.r2_buckets[0].binding === "AUDIO_BUCKET", "preview R2 preserves the AUDIO_BUCKET binding");
check(preview.r2_buckets[0].bucket_name === "scenering-audio-preview", "preview R2 has a dedicated name");
check(preview.r2_buckets[0].bucket_name !== config.r2_buckets[0].bucket_name, "preview R2 cannot point at production");
check(preview.vars.EMAIL_PROVIDER === "console", "previews do not send live email");
check(preview.vars.PADDLE_ENVIRONMENT === "sandbox", "previews use Paddle sandbox mode");
check(preview.vars.PADDLE_CLIENT_ENVIRONMENT === "sandbox", "preview Paddle.js environment is sandbox");
check(preview.vars.BILLING_PROVIDER === "", "previews do not select a live billing provider");
check(checker.includes("delete config.previews"), "production validator excludes preview-only placeholders");
const productionCheck = spawnSync("node", [join(root, "scripts/check-deploy-config.mjs")], { cwd: root, encoding: "utf8" });
check(productionCheck.status === 0, "production deploy-config validation passes with preview IDs unfilled");
check(setup.includes("wrangler d1 migrations apply") && setup.includes("--remote"), "setup applies migrations to the isolated remote preview database");
check(setup.includes("config.d1_databases = config.previews.d1_databases"), "migration setup cannot target the production D1 binding");
check(setup.includes("rate-limits-preview") && setup.includes("scenering-audio-preview"), "setup creates named isolated KV and R2 resources");
check(setup.includes("D1_PLACEHOLDER") && setup.includes("KV_PLACEHOLDER"), "setup only replaces preview ID placeholders");
check(docs.includes("npx wrangler preview base-config secret put SESSION_SECRET"), "Cloudflare runbook documents the one-time preview secret step");

console.log(`✓ deploy-config: ${checks} checks`);
