#!/usr/bin/env bash
# Record what is ACTUALLY deployed, as a snapshot a human can read.
#
# ══════════════════════════════════════════════════════════════════════════
# WHY THIS EXISTS. This repository's most expensive recurring defect is not a
# broken feature — it is a CORRECT BELIEF ABOUT THE WRONG THING. On 2026-08-09
# alone:
#
#   · migrations were applied to production and the API was NOT redeployed, so
#     four new routes 404'd while every gate was green;
#   · the drift check built to catch exactly that reported "production matches
#     this commit" four lines below the runner's own "6 pending";
#   · the live suite passed 21/0/0 against a deploy it did not touch.
#
# Each was found by asking the deployed system a direct question. This script
# is those questions in one place, so the first thing a session can do is see
# the real state instead of inferring it from a green workflow.
#
# 🔴 IT ASSERTS NOTHING AND EXITS 0 ALWAYS. It is a CAMERA, not a gate. The
# gate is `live-suite.yml`, which reports passed/failed/skipped as three
# numbers. A script that both measured and judged would tempt the next person
# to read its exit code as a verdict — and this repo has been misled by an exit
# code three times in one day (tail's, not the command's).
#
# Usage:  bash scripts/record-live-state.sh            # human-readable
#         bash scripts/record-live-state.sh > state.md # keep it with the notes
# ══════════════════════════════════════════════════════════════════════════

APEX="${APEX:-https://autoworkshop.aiappinvent.com}"
API="${API:-https://autoworkshop-api.onrender.com}"
CUSTOMER="${CUSTOMER:-https://autoworkshop-customer.onrender.com}"
SUPPLIER="${SUPPLIER:-https://autoworkshop-supplier.onrender.com}"
KEYCLOAK="${KEYCLOAK:-https://autoworkshop-keycloak.onrender.com}"
REALM="${REALM:-autoworkshop}"

# ⚠️ 240s, NOT THE USUAL 30. These are free-tier services that spin down;
# Keycloak has been measured at ~127s from cold and a 90s timeout once produced
# a confident "the app is down" report when nothing was wrong.
T=240

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
row() { printf '  %-46s %s\n' "$1" "$2"; }

code() { curl -s -o /dev/null -w '%{http_code}' --max-time "$T" "$1" 2>/dev/null || echo 000; }
post_code() {
  curl -s -o /dev/null -w '%{http_code}' --max-time "$T" -X POST \
    -H 'Content-Type: application/json' -d "${2:-\{\}}" "$1" 2>/dev/null || echo 000
}

echo "AutoWorkshop — live state at $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "(a snapshot, not a verdict — the gate is the Live suite workflow)"

say "1. The five services answer"
row "apex (workshop-web)"        "$(code "$APEX/")"
row "customer-web"               "$(code "$CUSTOMER/")"
row "supplier-web"               "$(code "$SUPPLIER/")"
row "api /health"                "$(code "$API/api/v1/health")"
row "keycloak realm"             "$(code "$KEYCLOAK/realms/$REALM/.well-known/openid-configuration")"

say "2. Routes that must exist and REFUSE anonymously (401/403 = good, 404 = not deployed)"
for p in /leads /registrations /registrations/mine /agents/proposals \
         /service-requests /notifications /registration/status; do
  row "GET  $p" "$(code "$API/api/v1$p")"
done
row "POST /registration/supplier" "$(post_code "$API/api/v1/registration/supplier" '{"supplierName":"state probe"}')"
row "POST /registration/customer" "$(post_code "$API/api/v1/registration/customer" '{"organizationId":"11111111-1111-1111-1111-111111111111"}')"

say "3. The public shopfront has CONTENT, not just structure"
# 🔴 CONTENT, NOT STRUCTURE. 24 live browser checks once passed against a shop
# with no products in it, and the local Playwright suite reported a clean
# 138/2 while the marketplace was empty — which hid a serious colour-contrast
# violation on a button that only renders when there is stock.
PARTS="$(curl -s --max-time $T "$API/api/v1/public/parts?limit=1" 2>/dev/null \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("total","?"))' 2>/dev/null || echo '?')"
MECHS="$(curl -s --max-time $T "$API/api/v1/public/mechanics" 2>/dev/null \
  | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))' 2>/dev/null || echo '?')"
row "parts listed"     "$PARTS"
row "mechanics listed" "$MECHS"

say "4. The owner's buttons are IN THE SERVED HTML"
# 🔴 GREP THE LIVE HTML FOR THE FEATURE'S OWN WORDS. A button gated on an env
# var that nobody set passed typecheck, lint, unit tests, a container smoke
# test and a Render deploy — and could not render for anyone. Only its absence
# from the served page would have caught it.
curl -s --max-time $T "$APEX/" -o /tmp/aw_apex.html 2>/dev/null
for t in "Request repair service" "Set up your workshop" "Register as parts supplier"; do
  n="$(grep -c "$t" /tmp/aw_apex.html 2>/dev/null || echo 0)"
  row "\"$t\"" "$([ "$n" -gt 0 ] && echo present || echo 'ABSENT')"
done
# The supplier button must sign in at the SUPPLIER's own origin. A cross-host
# callbackUrl signs the visitor in HERE and drops them there as a stranger —
# `c586e38`, reported four times before it was found.
SUP_HREF="$(grep -o 'https://[^"]*supplier[^"]*api/auth/signin[^"]*' /tmp/aw_apex.html 2>/dev/null | head -1)"
row "supplier button signs in at" "${SUP_HREF:-'(no absolute supplier sign-in link found)'}"

say "5. Migration drift — is production the same schema as this checkout?"
echo "  Not measurable from here: it needs the database, which is reachable"
echo "  only from a runner whose IP is added to Render's allow list."
echo "  Run:  gh workflow run apply-migrations.yml --repo marc667us/autoworkshop-ai"
echo "  (no confirm = inspect only; it prints IN REPO / APPLIED / PENDING and"
echo "   goes RED when production is behind)"

say "Done — this recorded state, it did not judge it."
echo "  The gate:  gh workflow run live-suite.yml --repo marc667us/autoworkshop-ai"
exit 0
