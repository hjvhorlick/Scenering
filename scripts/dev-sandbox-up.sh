#!/usr/bin/env bash
# Idempotently start the Scenering dev server on 0.0.0.0:3000 inside the sandbox.
set -euo pipefail

cd /home/user/Scenering

# Ensure local D1 sqlite schema is initialized so wrangler dev / workerd can serve DB queries immediately
npx wrangler d1 migrations apply scenering-db --local >/dev/null 2>&1 || true

# Ensure .dev.vars exists for local workerd dev
if [ ! -f .dev.vars ]; then
  cat > .dev.vars <<'EOF'
# The server reads SESSION_SECRET. SCENERING_AUTH_SECRET is accepted as a
# legacy alias, but setting the wrong name used to leave a deployed server on
# the built-in development secret.
NODE_ENV=development
SESSION_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
# Register and verify this exact local address to access /admin.
SCENERING_OWNER_EMAIL=owner@example.test
EMAIL_PROVIDER=console
PAYPAL_ENVIRONMENT=sandbox
EOF
fi

# Check if port 3000 is already listening
if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
  exit 0
fi

nohup npm run dev -- --host 0.0.0.0 --port 3000 > /tmp/scenering-dev.log 2>&1 &

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

cat /tmp/scenering-dev.log >&2 || true
exit 1
