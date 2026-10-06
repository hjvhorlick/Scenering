#!/usr/bin/env bash
# One-shot bring-up of the local dev environment in the Arena sandbox.
# The sandbox wipes node_modules, dist, .dev.vars and the local D1 state
# between sessions; this restores all of it. The dev server itself is
# started separately (it must outlive this script).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d node_modules/.bin ] || npm ci

if [ ! -f .dev.vars ]; then
  cat > .dev.vars <<'EOF'
NODE_ENV=development
SESSION_SECRET=local-development-secret-change-me-32-chars-minimum
PUBLIC_APP_URL=
SCENERING_OWNER_EMAIL=owner@example.com
ALLOW_FRAMING=1
EMAIL_PROVIDER=console
EOF
fi

[ -f dist/index.html ] || npm run build
npx wrangler d1 migrations apply scenering-db --local

echo "Sandbox dev environment ready."
