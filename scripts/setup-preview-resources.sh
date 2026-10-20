#!/usr/bin/env bash
#
# Create the isolated Cloudflare resources used by Worker Previews and wire
# their bindings into wrangler.jsonc. Safe to re-run; production bindings are
# never modified. Requires an authenticated Wrangler session
# (`npx wrangler login`, or CLOUDFLARE_API_TOKEN with Workers/KV/D1/R2 scope).
#
# Why this exists: Workers Builds runs `npx wrangler preview` on every branch
# other than main. That command needs a `previews` block (wrangler.jsonc has
# one), and any storage binding inside it must name a real resource. A made-up
# or placeholder id passes Wrangler's config check and then fails while the
# preview is uploaded — a red "Workers Builds" check on the branch. So the
# committed config ships without preview storage, and this script adds it once
# the resources exist.
set -euo pipefail

CONFIG="wrangler.jsonc"
D1_NAME="scenering-db-preview"
KV_NAME="rate-limits-preview"
R2_NAME="scenering-audio-preview"
MARKER_START="// setup-preview-resources:bindings"
MARKER_END="// setup-preview-resources:bindings-end"

command -v npx >/dev/null || { echo "npx not found; install Node.js 18+ first." >&2; exit 1; }
grep -qF "$MARKER_START" "$CONFIG" && grep -qF "$MARKER_END" "$CONFIG" || {
  echo "Could not find the preview-binding markers in $CONFIG." >&2
  echo "Restore the two '// setup-preview-resources:bindings' marker lines inside \"previews\"." >&2
  exit 1
}

# Wrangler prints created resource details as JSON-like text. If a resource
# already exists, find its ID from the corresponding list command instead.
find_id() {
  local json="$1" name="$2" kind="$3"
  node -e '
    const [text, name, kind] = process.argv.slice(1);
    let data;
    try { data = JSON.parse(text); } catch { process.exit(1); }
    const rows = Array.isArray(data) ? data : [data];
    const item = rows.find((row) => (row.name ?? row.title) === name);
    const id = item && (kind === "d1" ? item.uuid ?? item.database_id ?? item.id : item.id);
    if (id) process.stdout.write(String(id)); else process.exit(1);
  ' "$json" "$name" "$kind"
}

D1_ID="$(npx wrangler d1 create "$D1_NAME" 2>&1 || true)"
D1_ID="$(printf '%s' "$D1_ID" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
if [[ -z "$D1_ID" ]]; then
  D1_LIST="$(npx wrangler d1 list --json)"
  D1_ID="$(find_id "$D1_LIST" "$D1_NAME" d1 || true)"
fi
[[ "$D1_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo "Could not find/create D1 database $D1_NAME." >&2; exit 1; }

KV_ID="$(npx wrangler kv namespace create "$KV_NAME" 2>&1 || true)"
KV_ID="$(printf '%s' "$KV_ID" | grep -oE '[0-9a-f]{32}' | head -1 || true)"
if [[ -z "$KV_ID" ]]; then
  KV_LIST="$(npx wrangler kv namespace list)"
  KV_ID="$(find_id "$KV_LIST" "$KV_NAME" kv || true)"
fi
[[ "$KV_ID" =~ ^[0-9a-fA-F]{32}$ ]] || { echo "Could not find/create KV namespace $KV_NAME." >&2; exit 1; }

if ! npx wrangler r2 bucket create "$R2_NAME"; then
  R2_LIST="$(npx wrangler r2 bucket list)"
  grep -Fq "$R2_NAME" <<<"$R2_LIST" || { echo "Could not create/find R2 bucket $R2_NAME." >&2; exit 1; }
fi

# Write the three bindings between the markers inside "previews". Only that
# region is touched: production bindings, comments and every other setting stay
# exactly as they are. Re-running replaces the region, so it is idempotent.
node --input-type=module - "$CONFIG" "$D1_ID" "$KV_ID" "$R2_NAME" \
  "$MARKER_START" "$MARKER_END" "$D1_NAME" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
const [path, d1Id, kvId, r2Name, startMarker, endMarker, d1Name] = process.argv.slice(2);
let config = readFileSync(path, "utf8");
const startAt = config.indexOf(startMarker);
const endAt = config.indexOf(endMarker);
if (startAt === -1 || endAt === -1 || endAt < startAt) {
  console.error("Could not find the preview-binding markers in " + path);
  process.exit(1);
}
const bindings = {
  d1_databases: [{ binding: "DB", database_name: d1Name, database_id: d1Id, migrations_dir: "./migrations" }],
  kv_namespaces: [{ binding: "RATE_LIMITS", id: kvId }],
  r2_buckets: [{ binding: "AUDIO_BUCKET", bucket_name: r2Name }],
};
// Emit the properties (not a nested object) indented to sit inside
// "previews": { … }, where keys start at four spaces.
const body = JSON.stringify(bindings, null, 2)
  .split("\n")
  .slice(1, -1)
  .map((line) => "  " + line)
  .join("\n") + ",";
const lineEnd = config.indexOf("\n", startAt);
const head = config.slice(0, lineEnd + 1);
const tail = config.slice(endAt);
config = head + body + "\n    " + tail;
writeFileSync(path, config);
NODE

# Prove the patched file is still valid JSONC before using it for migrations.
node --input-type=module - "$CONFIG" "$D1_NAME" <<'NODE'
import { readFileSync } from "node:fs";
const [path, expectedD1] = process.argv.slice(2);
const config = JSON.parse(readFileSync(path, "utf8").replace(/^\s*\/\/.*$/gm, ""));
const previewD1 = config.previews?.d1_databases?.[0];
if (previewD1?.database_name !== expectedD1) {
  console.error("wrangler.jsonc no longer has a preview D1 binding for " + expectedD1);
  process.exit(1);
}
NODE

# D1's migrations CLI reads the top-level d1_databases list, so give it a
# temporary config in which that list is the preview-only database. It must
# never apply these migrations through the production D1 binding.
TMP_CONFIG="$(mktemp "$PWD/.wrangler-preview-setup.XXXXXX.jsonc")"
trap 'rm -f "$TMP_CONFIG"' EXIT
node --input-type=module - "$CONFIG" "$TMP_CONFIG" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
const [source, destination] = process.argv.slice(2);
const config = JSON.parse(readFileSync(source, "utf8").replace(/^\s*\/\/.*$/gm, ""));
config.d1_databases = config.previews.d1_databases;
delete config.previews;
writeFileSync(destination, JSON.stringify(config, null, 2));
NODE
npx wrangler d1 migrations apply "$D1_NAME" --remote --config "$TMP_CONFIG"

cat <<'EOF'

✅ Isolated preview storage is ready and wrangler.jsonc has been updated.

Commit the wrangler.jsonc change — Workers Builds reads the file from the
branch, so previews only get the database once it is on main.

Set the preview-only session secret once (shared by every Preview):
  npx wrangler preview base-config secret put SESSION_SECRET

Do not reuse production secrets or production storage for Worker Previews.
EOF
