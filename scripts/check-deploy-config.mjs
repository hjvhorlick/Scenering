#!/usr/bin/env node
//
// Scenering — deploy-config guard.
//
// `wrangler deploy` sends the binding ids in wrangler.jsonc to the Cloudflare
// API verbatim, and leftover placeholders only fail there, remotely, with a
// message like:
//   KV namespace 'SCENERING_KV_ID_PLACEHOLDER' is not valid. [code: 10042]
// This script makes that mistake fail locally, first, with instructions.
//
// Wired into `npm run deploy` and `npm run deploy:check`. It is deliberately
// NOT part of `verify`: `wrangler deploy --dry-run` never contacts the API, so
// a fresh clone mid-setup (placeholders not yet filled) still passes the test
// gate — only an actual deploy needs real ids.
//
import { readFileSync } from "node:fs";

let config;
try {
  // wrangler.jsonc is JSONC; every comment in it is a full-line // comment.
  const json = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")
    .replace(/^\s*\/\/.*$/gm, "");
  config = JSON.parse(json);
} catch (err) {
  console.error(`✖ Could not parse wrangler.jsonc: ${err.message}`);
  process.exit(1);
}

const problems = [];

// 1. No leftover SCENERING_*_PLACEHOLDER values. Checked on the serialized
//    (comment-stripped) config so comments may mention the names freely.
const placeholder = JSON.stringify(config).match(/"([A-Za-z0-9_]*PLACEHOLDER[A-Za-z0-9_]*)"/);
if (placeholder) {
  problems.push(
    `placeholder value still present: ${placeholder[1]} — run \`bash scripts/setup-cloudflare.sh\` or paste the real id into wrangler.jsonc`
  );
}

// 2. Binding ids must have the shape the API expects (KV: 32 hex chars,
//    D1: UUID); anything else is another remote API error waiting to happen.
const kv = (config.kv_namespaces ?? []).find((n) => n.binding === "RATE_LIMITS");
if (!kv) problems.push('no kv_namespaces entry with binding "RATE_LIMITS"');
else if (!/^[0-9a-f]{32}$/.test(kv.id ?? ""))
  problems.push(`RATE_LIMITS id "${kv.id}" is not a 32-hex-character namespace id`);

const d1 = (config.d1_databases ?? []).find((d) => d.binding === "DB");
if (!d1) problems.push('no d1_databases entry with binding "DB"');
else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(d1.database_id ?? ""))
  problems.push(`DB database_id "${d1.database_id}" is not a UUID`);

if (problems.length) {
  console.error("✖ wrangler.jsonc is not deployable:");
  for (const problem of problems) console.error(`  • ${problem}`);
  process.exit(1);
}

console.log("✓ wrangler.jsonc bindings look deployable (RATE_LIMITS kv, DB d1)");
