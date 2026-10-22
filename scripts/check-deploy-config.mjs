#!/usr/bin/env node
//
// Scenering — deploy-config and pending-migration guard.
//
// Two mistakes only used to surface after code was already on its way to
// production:
//   1. `wrangler deploy` sends the binding ids in wrangler.jsonc to the
//      Cloudflare API verbatim, so leftover placeholders only failed remotely
//      with `KV namespace 'SCENERING_KV_ID_PLACEHOLDER' is not valid [10042]`.
//   2. `wrangler deploy` uploads Worker code without checking whether the
//      production D1 database has applied every SQL file in `./migrations` —
//      which let Worker code referencing new columns reach live traffic ahead
//      of `0007_devices_workspace.sql` and break sign-in with HTTP 500.
//
// Static binding checks always run (`deploy:check` and offline test suites).
// Passing `--remote` (wired into `npm run deploy`) also queries
// `wrangler d1 migrations list <database> --remote` and refuses to build or
// deploy while any migration is pending — or if Wrangler cannot read the
// remote migration ledger. (`--local [--persist-to <dir>]` runs the identical
// Wrangler check against a local SQLite database for automated tests.)
//
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const checkRemote = args.includes("--remote");
const checkLocal = args.includes("--local");
const persistToIdx = args.indexOf("--persist-to");
const persistTo = persistToIdx >= 0 ? args[persistToIdx + 1] : null;

let config;
try {
  // wrangler.jsonc is JSONC; every comment in it is a full-line // comment.
  const json = readFileSync(resolve(repoRoot, "wrangler.jsonc"), "utf8")
    .replace(/^\s*\/\/.*$/gm, "");
  config = JSON.parse(json);
} catch (err) {
  console.error(`✖ Could not parse wrangler.jsonc: ${err.message}`);
  process.exit(1);
}

// Preview resource IDs intentionally start as placeholders and are populated
// only after the one-time preview-resource setup. They are not used by a
// production deploy, so validate only the production configuration here.
delete config.previews;

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
else {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(d1.database_id ?? ""))
    problems.push(`DB database_id "${d1.database_id}" is not a UUID`);
  if (!String(d1.database_name ?? "").trim())
    problems.push('DB entry is missing "database_name"');
}

if (problems.length) {
  console.error("✖ wrangler.jsonc is not deployable:");
  for (const problem of problems) console.error(`  • ${problem}`);
  process.exit(1);
}

console.log("✓ wrangler.jsonc bindings look deployable (RATE_LIMITS kv, DB d1)");

// 3. When deploying (or running the local test harness), refuse to proceed if
//    D1 has unapplied migrations. Note: `wrangler d1 migrations list` exits 0
//    even when migrations ARE pending, so we must inspect its output rather
//    than relying on its exit code alone.
if (checkRemote || checkLocal) {
  const dbName = d1.database_name;
  const migrationsDir = resolve(repoRoot, d1.migrations_dir || "./migrations");
  const knownFiles = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const wranglerArgs = ["--no-install", "wrangler", "d1", "migrations", "list", dbName];
  if (checkRemote) {
    wranglerArgs.push("--remote");
  } else {
    wranglerArgs.push("--local");
    if (persistTo) wranglerArgs.push("--persist-to", persistTo);
  }

  const result = spawnSync("npx", wranglerArgs, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const rawOutput = `${result.stdout || ""}\n${result.stderr || ""}`;
  const cleanOutput = rawOutput.replace(/\x1b\[[0-9;]*m/g, "");

  if (result.error || result.status !== 0) {
    console.error(`✖ Could not verify ${checkRemote ? "remote" : "local"} D1 migrations for "${dbName}":`);
    console.error(cleanOutput.trim() || result.error?.message || `exit status ${result.status}`);
    process.exit(1);
  }

  const pendingSet = new Set(knownFiles.filter((file) => cleanOutput.includes(file)));
  for (const match of cleanOutput.matchAll(/\b\d{4}_[A-Za-z0-9_.-]+\.sql\b/g)) {
    pendingSet.add(match[0]);
  }
  const pending = [...pendingSet].sort();
  const hasPendingBanner = /Migrations to be applied/i.test(cleanOutput);
  const confirmedClean = /No migrations to apply/i.test(cleanOutput);

  if (pending.length > 0 || hasPendingBanner || !confirmedClean) {
    const applyFlag = checkRemote ? "--remote" : "--local";
    const summary = pending.length > 0 ? pending.join(", ") : "unrecognised migration status output";
    console.error(`✖ Refusing to deploy: D1 database "${dbName}" has pending migration(s): ${summary}`);
    console.error(`  Apply them first: npx wrangler d1 migrations apply ${dbName} ${applyFlag}`);
    process.exit(1);
  }

  console.log(`✓ D1 migrations verified on ${dbName} (${checkRemote ? "remote" : "local"}: no pending migrations)`);
}
