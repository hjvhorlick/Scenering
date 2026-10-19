#!/usr/bin/env bash
#
# Create the isolated Cloudflare resources used by Worker Previews and wire
# their IDs into wrangler.jsonc. Safe to re-run; production bindings are never
# modified. Requires an authenticated Wrangler session.
set -euo pipefail

CONFIG="wrangler.jsonc"
D1_NAME="scenering-db-preview"
KV_NAME="rate-limits-preview"
R2_NAME="scenering-audio-preview"
D1_PLACEHOLDER="SCENERING_D1_PREVIEW_ID_PLACEHOLDER"
KV_PLACEHOLDER="SCENERING_KV_PREVIEW_ID_PLACEHOLDER"

command -v npx >/dev/null || { echo "npx not found; install Node.js 18+ first." >&2; exit 1; }
grep -q "$D1_PLACEHOLDER\|$KV_PLACEHOLDER" "$CONFIG" || {
  echo "Preview resource IDs already appear configured in $CONFIG; nothing to replace." >&2
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

# Replace only the preview placeholders; production IDs and config stay intact.
node --input-type=module - "$CONFIG" "$D1_PLACEHOLDER" "$D1_ID" "$KV_PLACEHOLDER" "$KV_ID" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
const [path, d1Placeholder, d1Id, kvPlaceholder, kvId] = process.argv.slice(2);
let config = readFileSync(path, "utf8");
if (config.includes(d1Placeholder)) config = config.replace(d1Placeholder, d1Id);
if (config.includes(kvPlaceholder)) config = config.replace(kvPlaceholder, kvId);
writeFileSync(path, config);
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
Set the preview-only session secret once with:
  npx wrangler preview base-config secret put SESSION_SECRET

Do not reuse production secrets or production storage for Worker Previews.
EOF
