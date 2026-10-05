#!/bin/bash
set -e
echo "🚀 Scenering — Cloudflare Workers Setup"
echo "═══════════════════════════════════════"

# Step 1: Create D1 database
echo "📦 Creating D1 database..."
DB_OUTPUT=$(npx wrangler d1 create scenering-db 2>&1 || true)
echo "$DB_OUTPUT"
# D1 database IDs are UUIDs (8-4-4-4-12 hex), not a bare 32-char hex blob.
DB_ID=$(echo "$DB_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || echo "")
if [ -z "$DB_ID" ]; then
  read -p "Paste the database ID from above: " DB_ID
fi
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|PLACEHOLDER_RUN_SETUP_SCRIPT|$DB_ID|" wrangler.jsonc
else
  sed -i "s|PLACEHOLDER_RUN_SETUP_SCRIPT|$DB_ID|" wrangler.jsonc
fi
echo "✅ D1 database ID: $DB_ID"

# Step 2: Create R2 bucket
echo "📦 Creating R2 bucket..."
npx wrangler r2 bucket create scenering-audio 2>&1 || true
echo "✅ R2 bucket created"

# Step 3: Create KV namespace
echo "📦 Creating KV namespace..."
KV_OUTPUT=$(npx wrangler kv namespace create RATE_LIMITS 2>&1 || true)
echo "$KV_OUTPUT"
KV_ID=$(echo "$KV_OUTPUT" | grep -oE '"id":\s*"[a-f0-9]+"' | grep -oE '[a-f0-9]{32}' || echo "")
if [ -z "$KV_ID" ]; then
  read -p "Paste the KV namespace ID from above: " KV_ID
fi
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|\"id\": \"PLACEHOLDER_RUN_SETUP_SCRIPT\"|\"id\": \"$KV_ID\"|" wrangler.jsonc
else
  sed -i "s|\"id\": \"PLACEHOLDER_RUN_SETUP_SCRIPT\"|\"id\": \"$KV_ID\"|" wrangler.jsonc
fi
echo "✅ KV namespace ID: $KV_ID"

# Step 4: Apply database schema
# --remote targets the real (production) D1 database tied to the deployed
# Worker, not the local wrangler-dev emulation — without it this would
# silently migrate an empty local DB and the live site would still have no
# tables.
echo "📦 Creating database tables..."
npx wrangler d1 migrations apply scenering-db --remote 2>&1 || true
echo "✅ Tables created"

# Step 5: Set required secrets
echo "🔐 Setting secrets..."
SESSION_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "fallback_$(date +%s)_change_me")
echo "Generated SESSION_SECRET: $SESSION_SECRET"
echo "$SESSION_SECRET" | npx wrangler secret put SESSION_SECRET 2>&1 || true
read -p "SCENERING_OWNER_EMAIL (e.g. hjvhorlick@gmail.com): " OWNER_EMAIL
echo "$OWNER_EMAIL" | npx wrangler secret put SCENERING_OWNER_EMAIL 2>&1 || true

# Step 6: Optional secrets
# Names match what src/env.ts and server/platform.ts actually read — a
# secret set under any other name is silently ignored by the app.
for SECRET in GEMINI_API_KEY PEXELS_API_KEY PIXABAY_API_KEY \
  LEMON_SQUEEZY_API_KEY LEMON_SQUEEZY_STORE_ID LEMON_SQUEEZY_WEBHOOK_SECRET \
  LEMON_SQUEEZY_SCENEFLOW_MONTHLY_VARIANT_ID LEMON_SQUEEZY_SCENEFLOW_YEARLY_VARIANT_ID \
  LEMON_SQUEEZY_SCENEFORGE_MONTHLY_VARIANT_ID LEMON_SQUEEZY_SCENEFORGE_YEARLY_VARIANT_ID \
  LEMON_SQUEEZY_SCENEFLOW_MONTHLY_CHECKOUT_URL LEMON_SQUEEZY_SCENEFLOW_YEARLY_CHECKOUT_URL \
  LEMON_SQUEEZY_SCENEFORGE_MONTHLY_CHECKOUT_URL LEMON_SQUEEZY_SCENEFORGE_YEARLY_CHECKOUT_URL; do
  read -p "$SECRET (Enter to skip): " VAL
  if [ -n "$VAL" ]; then echo "$VAL" | npx wrangler secret put "$SECRET" 2>&1 || true; echo "✅ $SECRET set"; else echo "⏭️ Skipped $SECRET"; fi
done

echo "═══════════════════════════════════════"
echo "✅ Setup complete! Now run:"
echo "  npm run build"
echo "  npx wrangler deploy"
echo "═══════════════════════════════════════"
