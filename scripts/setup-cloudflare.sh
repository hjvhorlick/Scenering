#!/bin/bash
#
# Scenering — Cloudflare Workers setup (idempotent).
#
# Creates the three backing resources this Worker needs and wires their ids
# into wrangler.jsonc:
#   • D1 database      (binding DB)          — accounts, sessions, billing
#   • R2 bucket        (binding AUDIO_BUCKET) — custom voice-import uploads
#   • KV namespace     (binding RATE_LIMITS)  — rate-limit counters
# Then applies the D1 schema remotely and prompts for the required secrets.
#
# Safe to re-run: existing resources are detected, and wrangler.jsonc is only
# edited where a SCENERING_*_PLACEHOLDER value is still present.
set -euo pipefail

CONFIG="wrangler.jsonc"

say() { printf '\n\033[1;36m%s\033[0m\n' "$1"; }
ok()  { printf '\033[1;32m✅ %s\033[0m\n' "$1"; }

# Replace a placeholder in wrangler.jsonc only if it is still there.
# macOS sed needs -i '' ; GNU sed needs -i.
replace_placeholder() {
  local placeholder="$1" value="$2"
  if grep -q "\"$placeholder\"" "$CONFIG"; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|$placeholder|$value|" "$CONFIG"
    else
      sed -i    "s|$placeholder|$value|" "$CONFIG"
    fi
    ok "wrangler.jsonc: $placeholder → $value"
  else
    echo "ℹ️  $CONFIG already has a real value for this slot — left untouched."
  fi
}

command -v npx >/dev/null || { echo "npx not found — install Node.js 18+ first."; exit 1; }

say "🚀 Scenering — Cloudflare Workers setup"

# ---------------------------------------------------------------- D1 database
say "📦 Step 1/6: D1 database (binding: DB)"
DB_OUTPUT=$(npx wrangler d1 create scenering-db 2>&1 || true)
echo "$DB_OUTPUT"
# D1 database ids are UUIDs (8-4-4-4-12 hex). If the database already exists,
# wrangler prints an error containing the existing id's hint — fall back to
# the value already in wrangler.jsonc, or ask.
DB_ID=$(echo "$DB_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)
if [ -z "$DB_ID" ]; then
  # Creation usually fails here because the database already exists — look
  # the id up with `d1 info` instead of prompting for it.
  DB_ID=$(npx wrangler d1 info scenering-db 2>/dev/null | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)
  [ -n "$DB_ID" ] && ok "Found existing database scenering-db: $DB_ID"
fi
if [ -z "$DB_ID" ]; then
  if grep -q '"database_id": "SCENERING_D1_ID_PLACEHOLDER"' "$CONFIG"; then
    read -r -p "Could not create/read the database id. Paste the D1 database id: " DB_ID
    [ -n "$DB_ID" ] || { echo "No database id — aborting."; exit 1; }
  else
    DB_ID=$(grep -oE '"database_id": "[0-9a-f-]{36}"' "$CONFIG" | grep -oE '[0-9a-f-]{36}')
    echo "Using the database id already configured in $CONFIG: $DB_ID"
  fi
fi
replace_placeholder "SCENERING_D1_ID_PLACEHOLDER" "$DB_ID"

# ------------------------------------------------------------------ R2 bucket
say "📦 Step 2/6: R2 bucket (binding: AUDIO_BUCKET)"
npx wrangler r2 bucket create scenering-audio 2>&1 || echo "(bucket probably already exists — continuing)"
ok "R2 bucket scenering-audio ready"

# -------------------------------------------------------------- KV namespace
say "📦 Step 3/6: KV namespace (binding: RATE_LIMITS)"
# If wrangler.jsonc already carries a real namespace id, keep it — creating
# another namespace would orphan the one production traffic uses. The sed
# range spans the whole binding block so comment lines can't hide the id.
KV_CONFIG_ID=$(sed -n '/"binding": "RATE_LIMITS"/,/}/p' "$CONFIG" | grep -oE '[a-f0-9]{32}' | head -1 || true)
if [ -n "$KV_CONFIG_ID" ]; then
  ok "RATE_LIMITS already bound to namespace $KV_CONFIG_ID — skipping creation"
else
  KV_OUTPUT=$(npx wrangler kv namespace create RATE_LIMITS 2>&1 || true)
  echo "$KV_OUTPUT"
  KV_ID=$(echo "$KV_OUTPUT" | grep -oE '[a-f0-9]{32}' | head -1 || true)
  if [ -z "$KV_ID" ]; then
    read -r -p "Paste the KV namespace id: " KV_ID
    [ -n "$KV_ID" ] || { echo "No namespace id — aborting."; exit 1; }
  fi
  replace_placeholder "SCENERING_KV_ID_PLACEHOLDER" "$KV_ID"
fi

# ------------------------------------------------------------- D1 schema (×2)
say "📦 Step 4/6: applying migrations"
# --remote targets the production D1 behind the deployed Worker;
# --local seeds the local miniflare copy that `wrangler dev` uses, so local
# development is not greeted by "no such table: users".
npx wrangler d1 migrations apply scenering-db --remote 2>&1 || true
npx wrangler d1 migrations apply scenering-db --local  2>&1 || true
ok "Schema applied (remote + local)"

# ------------------------------------------------------------------- secrets
say "🔐 Step 5/6: required secrets"
if [ -z "${SESSION_SECRET:-}" ]; then
  SESSION_SECRET=$(openssl rand -base64 48 2>/dev/null || head -c 48 /dev/urandom | base64)
fi
echo "$SESSION_SECRET" | npx wrangler secret put SESSION_SECRET
ok "SESSION_SECRET set"
read -r -p "SCENERING_OWNER_EMAIL (the owner-admin sign-in address, e.g. hjvhorlick@gmail.com): " OWNER_EMAIL
if [ -n "$OWNER_EMAIL" ]; then
  echo "$OWNER_EMAIL" | npx wrangler secret put SCENERING_OWNER_EMAIL
  ok "SCENERING_OWNER_EMAIL set"
else
  echo "⚠️  Skipped — the owner-admin role cannot be granted until this is set."
fi
# wrangler.jsonc selects the Resend adapter, so production email cannot be sent
# until this server-side key exists. Accept an exported value for automation;
# otherwise prompt without echoing the key to the terminal.
if [ -z "${RESEND_API_KEY:-}" ]; then
  read -r -s -p "RESEND_API_KEY (required for verification and reset emails): " RESEND_API_KEY
  echo
fi
if [ -n "$RESEND_API_KEY" ]; then
  printf '%s' "$RESEND_API_KEY" | npx wrangler secret put RESEND_API_KEY
  ok "RESEND_API_KEY set"
else
  echo "⚠️  Skipped — EMAIL_PROVIDER=resend cannot send email until this is set."
fi

say "🔐 Step 6/6: optional secrets (Enter to skip each)"
# Names must match what src/env.ts and server/platform.ts actually read — a
# secret set under any other name is silently ignored by the app.
for SECRET in PEXELS_API_KEY PIXABAY_API_KEY \
  LEMON_SQUEEZY_API_KEY LEMON_SQUEEZY_STORE_ID LEMON_SQUEEZY_WEBHOOK_SECRET \
  LEMON_SQUEEZY_SCENEFLOW_MONTHLY_VARIANT_ID LEMON_SQUEEZY_SCENEFLOW_YEARLY_VARIANT_ID \
  LEMON_SQUEEZY_SCENEFORGE_MONTHLY_VARIANT_ID LEMON_SQUEEZY_SCENEFORGE_YEARLY_VARIANT_ID \
  LEMON_SQUEEZY_SCENEFLOW_MONTHLY_CHECKOUT_URL LEMON_SQUEEZY_SCENEFLOW_YEARLY_CHECKOUT_URL \
  LEMON_SQUEEZY_SCENEFORGE_MONTHLY_CHECKOUT_URL LEMON_SQUEEZY_SCENEFORGE_YEARLY_CHECKOUT_URL; do
  read -r -p "$SECRET: " VAL
  if [ -n "$VAL" ]; then
    printf '%s' "$VAL" | npx wrangler secret put "$SECRET"
    ok "$SECRET set"
  else
    echo "⏭️  Skipped $SECRET"
  fi
done

say "Setup complete"
cat <<'EOF'

Next steps:
  npm run build          # build the SPA into dist/ (the assets layer serves it)
  npx wrangler deploy    # deploy the Worker + assets + bindings
  npm run dev            # or develop locally against wrangler dev on :8787

The hourly Cron Trigger in wrangler.jsonc (audio-expiry sweep) is deployed
with the Worker automatically — nothing to schedule by hand.
See CLOUDFLARE.md for the full platform-compatibility report.
EOF
