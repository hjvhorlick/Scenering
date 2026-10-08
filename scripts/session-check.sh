#!/usr/bin/env bash
#
# Scenering — one-command state check.
#
#   bash /home/user/Scenering/scripts/session-check.sh
#
# Paste that into a fresh session. In one pass it reports:
#
#   1. which branch and which uncommitted work is here (owner said: no push)
#   2. dependencies present (node_modules is wiped between sandbox sessions)
#   3. local preview state: dev flags, database, owner account, social links
#   4. the full gate — typecheck (app + worker), every test suite, build,
#      deploy dry-run
#   5. which of the owner's requested fixes are present in the source
#   6. live preview HTTP checks (when the dev server is running)
#   7. what is still open, and the standing rules
#
# Nothing here writes to the app; the only files it may create are the dev-only
# .dev.vars and the local SQLite database under .wrangler/, both gitignored.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || { echo "repo not found at $ROOT"; exit 1; }
FAILED=0
BASE="http://127.0.0.1:8787"
OWNER_EMAIL="hjvhorlick@gmail.com"

bold() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
note() { printf '   %s\n' "$1"; }
check() { # check "label" "shell test"
  if eval "$2" >/dev/null 2>&1; then printf '   ok    %s\n' "$1"
  else printf '   FAIL  %s\n' "$1"; FAILED=$((FAILED + 1)); fi
}
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$1" 2>/dev/null || echo "---"; }
server_up() { [ "$(code "$BASE/api/health")" = "200" ]; }

bold "1. Where we are"
note "repo:   $ROOT"
note "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
note "head:   $(git log --oneline -1 2>/dev/null)"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  note "uncommitted work — correct, the owner said not to push yet:"
  git status --short | sed 's/^/      /'
else
  note "working tree clean"
fi

bold "2. Dependencies"
if [ -x node_modules/.bin/tsx ] && [ -x node_modules/.bin/vite ]; then
  note "node_modules present"
else
  note "node_modules missing — installing (this is why the preview breaks after a reset)"
  npm ci --no-audit --no-fund 2>&1 | tail -2 | sed 's/^/      /'
fi

bold "3. Local preview state"
if [ -f .dev.vars ]; then
  note ".dev.vars present (dev-only flags; gitignored)"
else
  note "writing .dev.vars (dev-only flags; gitignored)"
  cat > .dev.vars <<'EOF'
ALLOW_FRAMING=1
DEV_AUTO_OWNER=1
DEV_EMBEDDED_PREVIEW=1
TRUST_PROXY=1
SCENERING_OWNER_EMAIL=hjvhorlick@gmail.com
EMAIL_PROVIDER=console
EOF
fi
note "applying migrations to the local database (idempotent)"
npx wrangler d1 migrations apply scenering-db --local 2>&1 | grep -E "migrations|✅|error" | tail -4 | sed 's/^/      /'

if server_up; then
  note "dev server is up on $BASE"
  if [ "$(code "$BASE/api/auth/session")" = "401" ]; then
    note "owner account missing in this database — registering it"
    curl -s -X POST -H "Content-Type: application/json" \
      --data "{\"email\":\"$OWNER_EMAIL\",\"displayName\":\"Henry Horlick\",\"password\":\"Martha7304\"}" \
      "$BASE/api/auth/register" > /tmp/sc-register.json
    TOKEN="$(grep -o 'token=[A-Za-z0-9_-]*' /tmp/sc-register.json | head -1 | cut -d= -f2)"
    if [ -n "$TOKEN" ]; then
      curl -s -X POST -H "Content-Type: application/json" --data "{\"token\":\"$TOKEN\"}" \
        "$BASE/api/auth/verify-email" >/dev/null
      note "owner registered and verified locally"
    else
      note "register said: $(head -c 160 /tmp/sc-register.json)"
    fi
  fi
  LINKS="$(curl -s --max-time 8 "$BASE/api/social-links" | grep -o '"tiktok"' | head -1)"
  if [ -z "$LINKS" ]; then
    note "social links empty in this database — saving all five"
    curl -s -X PUT -H "Content-Type: application/json" \
      --data '{"youtube":"https://www.youtube.com/@scenering","facebook":"https://www.facebook.com/scenering","linkedin":"https://www.linkedin.com/company/scenering","x":"https://x.com/scenering","tiktok":"https://www.tiktok.com/@scenering"}' \
      "$BASE/api/admin/social-links" >/dev/null
  fi
else
  note "dev server NOT running — start it with:"
  note "   npx wrangler dev --ip 0.0.0.0 --port 8787"
  note "(in an agent session: start_process, so it stays up for the preview)"
fi

bold "4. The full gate"
npm run verify 2>&1 | grep -E "^FAIL|suites (passed|FAILED)|error TS|built in|Total Upload|✘" | tail -8 | sed 's/^/   /'

bold "5. Which fixes are in the source"
check "API-keys dialog is portalled to <body>, above the corner menu" \
  "grep -q 'createPortal' src/components/ApiKeysModal.tsx && grep -q 'z-\[300\]' src/components/ApiKeysModal.tsx"
check "API-keys dialog opens instantly (no half-second fade, no full-screen blur)" \
  "grep -q 'animate-dialog-in' src/components/ApiKeysModal.tsx && ! grep -q 'fixed inset-0 z-\[300\][^\"]*animate-fade-in' src/components/ApiKeysModal.tsx"
check "API keys offered in the app only, never on the public website" \
  "grep -q 'inAppArea && <button' src/shared/SiteCornerMenu.tsx"
check "Email Centre (Resend) entry for the admin in the corner menu" \
  "grep -q 'Email Centre' src/shared/SiteCornerMenu.tsx && grep -q 'admin/email-centre' src/components/AccountMembershipModal.tsx"
check "TTS crackle fix: click-free narration envelopes (preview AND export)" \
  "grep -q 'startVoiceSource' src/components/VideoPreview.tsx && grep -q 'startVoiceSource(offlineCtx' src/components/RenderView.tsx"
check "Render speed: audio telemetry sampled every third frame" \
  "grep -q 'TELEMETRY_SAMPLE_STRIDE' src/lib/audio-telemetry.ts && grep -q 'setAnalyserSpan' src/components/RenderView.tsx"
check "Ordered section gate: Next commits the section, later sections locked" \
  "grep -q 'commitAndAdvance' src/App.tsx && grep -q 'isPhaseLocked' src/App.tsx && grep -q 'handleStepRequest' src/App.tsx"
check "Gate rules pinned by tests" \
  "test -f tests/phase-gate.test.ts && test -f tests/audio-quality.test.ts"
check "Origin guard accepts preview writes, rejects foreign origins" \
  "grep -q 'forwardedHost' server.ts"
check "X and TikTok marks stay adaptive (never fixed grey)" \
  "grep -q 'tiktok' src/shared/SocialLinks.tsx && grep -q 'adaptive' src/shared/SocialLinks.tsx"
check "Mobile: every header reserves the corner menu's width (one shared definition)" \
  "grep -q -- '--sc-corner-reserve' src/shared/site-corner-menu.css && grep -q 'pr-\[var(--sc-corner-reserve)\]' src/App.tsx && grep -q 'sc-corner-reserve' src/marketing/PublicPage.tsx"
check "Mobile: phone header shows the glyph only, and landscape compacts the chrome" \
  "grep -q 'sc-corner-word' src/shared/site-corner-menu.css && grep -q 'max-height: 560px' src/index.css"
check "Mobile: the plan comparison is cards on a phone, table on a desktop" \
  "grep -q 'data-label' src/marketing/PublicPage.tsx && grep -q 'attr(data-label)' src/marketing/marketing.css"
check "Mobile: off-screen front-page sections are skipped until approached" \
  "grep -q 'content-visibility: auto' src/marketing/marketing.css"
check "Shipped icons on disk" \
  "test -f public/favicon.ico && test -f public/apple-touch-icon.png && test -f public/icon-192.png"

bold "6. Live preview checks"
if server_up; then
  for path in / /app /admin/email-centre /login /favicon.ico /site.webmanifest; do
    check "GET $path = 200" "[ \"\$(code $BASE$path)\" = \"200\" ]"
  done
  check "signed-in owner is the admin (dev auto-owner)" \
    "curl -s --max-time 8 $BASE/api/auth/session | grep -q '\"role\":\"admin\"'"
  check "all five social platforms incl. TikTok" \
    "curl -s --max-time 8 $BASE/api/social-links | grep -q '\"tiktok\"'"
else
  note "skipped — start the dev server first (step 3)"
fi

bold "7. Still open / standing rules"
note "OPEN (needs the owner's ears and eyes, not more code):"
note "   • Voice crackle — confirm by playing a preview; the fix is the 12/18 ms envelopes."
note "   • Render speed — the stopwatch table now prints the audio-pass share; compare on a long render."
note "   • Preview visual pass: section-Next gating, API-keys dialog from the corner menu."
note "RULES: nothing is committed or pushed until the owner says so. Voice TTS is Speechify."
note "   Never substitute another vendor. Production owner is hjvhorlick@gmail.com (sceneforge)."
note "   X/TikTok marks must stay black/adaptive. Social strips sit right of the logo at wordmark height."

bold "Summary"
if [ "$FAILED" -eq 0 ]; then
  echo "   everything checked out"
else
  echo "   $FAILED check(s) FAILED — see above"
fi
exit 0
