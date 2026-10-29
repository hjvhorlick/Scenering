#!/usr/bin/env bash
#
# Put the PayPal Sandbox credentials on the shared Previews base config, so a
# Worker Preview can actually run a Sandbox checkout.
#
# Why this script exists: `npx wrangler secret put` sets a secret for the
# production deployment only. Worker Previews — which is what Workers Builds
# runs for every branch other than main — do not inherit production secrets;
# they read the shared Previews base config. Keys that are already on Cloudflare
# therefore have to be set there as well before a branch preview can open a
# checkout, and doing it by hand is eight prompts with eight chances to paste a
# value into the wrong name.
#
# Production stays production: the deployed site runs NODE_ENV=production and
# refuses PayPal Sandbox checkout no matter what is configured. A Preview runs
# the `previews` block, where NODE_ENV is "development", so this is the only
# Cloudflare target where Sandbox checkout is meant to run.
#
# Requires an authenticated Wrangler session (`npx wrangler login`, or
# CLOUDFLARE_API_TOKEN with Workers scope). Safe to re-run.
set -euo pipefail

command -v npx >/dev/null || { echo "npx not found; install Node.js 18+ first." >&2; exit 1; }

# A value already in the environment is used as-is; otherwise prompt without
# echoing, so a secret is never written to the terminal, the shell history or
# a screenshot. An empty answer leaves that variable untouched — which is how
# you set up one product now and the rest later.
put_secret() {
  local name="$1" prompt="$2" value="${!1:-}"
  if [[ -z "$value" ]]; then
    printf '%s (leave blank to skip): ' "$prompt" >&2
    read -rs value || true
    printf '\n' >&2
  fi
  [[ -n "$value" ]] || { echo "  skipped $name" >&2; return 0; }
  printf '%s' "$value" | npx wrangler preview base-config secret put "$name" >/dev/null
  echo "  set $name" >&2
}

cat >&2 <<'EOF'
PayPal Sandbox credentials for Worker Previews.

The Client ID, Client Secret and at least ONE plan id are required to test a
checkout. The other three plan ids can wait: a plan with no id is simply kept
off sale while the plans that do exist stay purchasable. The webhook id can
wait too — approval is verified by reading the subscription back from PayPal,
so only renewals, cancellations and payment failures need it.

Values are not echoed and are never written to this repository.

EOF

echo "Credentials (required):" >&2
put_secret PAYPAL_CLIENT_ID "Sandbox REST app Client ID"
put_secret PAYPAL_CLIENT_SECRET "Sandbox REST app Client Secret"

echo >&2
echo "Plan ids (set at least the one you created in Sandbox):" >&2
put_secret PAYPAL_SCENEFLOW_MONTHLY_PLAN_ID "SceneFlow monthly plan id (P-…)"
put_secret PAYPAL_SCENEFLOW_YEARLY_PLAN_ID "SceneFlow yearly plan id (P-…)"
put_secret PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID "SceneForge monthly plan id (P-…)"
put_secret PAYPAL_SCENEFORGE_YEARLY_PLAN_ID "SceneForge yearly plan id (P-…)"

echo >&2
echo "Webhook (optional — can be registered later):" >&2
put_secret PAYPAL_WEBHOOK_ID "Sandbox webhook id"

cat >&2 <<'EOF'

Done. The next Worker Preview of any branch picks these up: push the branch,
or run `npx wrangler preview` from an authenticated terminal.

Check what a preview can actually see at:
  https://<your-preview-host>/api/billing/public-config

`checkoutEnabled: true` means the buttons will open. Anything outstanding is
listed under `missing` (blocking), `unconfiguredPlans` (that plan is off sale)
and `warnings` (outstanding, not blocking).

EOF
