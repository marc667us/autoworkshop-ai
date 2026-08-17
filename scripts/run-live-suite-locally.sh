#!/usr/bin/env bash
# ============================================================================
# RUN THE ANONYMOUS LIVE SUITE AGAINST PRODUCTION, WITHOUT `gh`.
#
#   bash scripts/run-live-suite-locally.sh
#
# ── 🔴 WHY THIS EXISTS ──────────────────────────────────────────────────────
#
# On 2026-08-17 `gh`'s keyring token was invalid, so no workflow could be listed
# or dispatched — `live-suite.yml` included. `git push` still worked because it
# uses a separate credential store, which is exactly the kind of partial failure
# that reads as "everything is fine".
#
# The hard rule in this project is: run the FULL suite against the DEPLOYED site
# after every deploy, and report passed / failed / SKIPPED as three numbers. A
# broken CLI is not an exemption from that, and "I could not run it" is only an
# acceptable answer once you have tried the other way in.
#
# The anonymous half of the suite is an inline Python script inside
# `.github/workflows/live-suite.yml`. It needs nothing but a network and a
# Python interpreter, so it can be extracted and run here — same script, same
# default URLs, same assertions.
#
# ⚠️ WHAT THIS IS NOT. It does NOT run the SIGNED-IN half (4 checks). That job
# needs `LIVE_OWNER_EMAIL` / `LIVE_OWNER_PASSWORD`, which are repository secrets
# and are not on this machine. Those four checks are UNMEASURED when you run
# this — a third state, not a pass. Say so when reporting.
#
# ⚠️ AND IT RUNS FROM THIS WORKSTATION, NOT FROM CI. Same assertions, different
# network path. Worth knowing when comparing against a CI run.
# ============================================================================
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

WORKFLOW='.github/workflows/live-suite.yml'
[ -f "$WORKFLOW" ] || { echo "[FAIL] $WORKFLOW is missing"; exit 1; }

PYTHON_BIN="$(command -v python 2>/dev/null || command -v python3 2>/dev/null || true)"
if [ -z "$PYTHON_BIN" ]; then
  echo "[SKIP] no python on PATH — the suite could not run. This is UNMEASURED, not green."
  exit 1
fi

# The workflow's own defaults, kept here in one place so a URL change is a
# one-line edit rather than a hunt. These mirror `live-suite.yml`'s `env:`.
export APEX="${APEX:-https://autoworkshop.aiappinvent.com}"
export CUSTOMER="${CUSTOMER:-$APEX/customer}"
export TOWING="${TOWING:-$APEX/towing}"
export ADMIN="${ADMIN:-$APEX/admin}"
export FLEET="${FLEET:-$APEX/fleet}"
export INSURANCE="${INSURANCE:-$APEX/insurance}"
export API="${API:-https://autoworkshop-api.onrender.com}"
export KEYCLOAK="${KEYCLOAK:-https://autoworkshop-keycloak.onrender.com}"
export REALM="${REALM:-autoworkshop}"

# ── 1. WARM EVERYTHING FIRST ───────────────────────────────────────────────
#
# 🔴 NOT A TEST — A PRECONDITION, and the workflow says the same. Free instances
# spin down and the first request pays the whole cold start (Keycloak measured
# at ~127s). Measuring before warming is how a healthy platform gets reported as
# an outage; that happened on 2026-08-07 and cost an hour.
echo "== warming =="
for url in "$APEX" "$CUSTOMER" "$TOWING" "$ADMIN" "$FLEET" "$INSURANCE" \
           "$API/api/v1/health" \
           "$KEYCLOAK/realms/$REALM/.well-known/openid-configuration"; do
  # 🔴 `-L` IS LOAD-BEARING FOR WARMING. The pack roots are `redirect()` stubs,
  # so without it curl gets a 307 and the DESTINATION — the page the suite is
  # about to measure — is never woken. A warm step that stops at the redirect
  # leaves exactly the cold start it exists to pay. The repo already records
  # "even a 307 proves nothing without -L" for the assertion case; it is just as
  # true for the precondition.
  #
  # `code="$(...)" || code=000` — NEVER `curl … || echo 000`, which prints AND
  # exits non-zero and yields the string `000000`. Recorded defect, twice.
  code="$(curl -sL -o /dev/null -w '%{http_code}' --max-time 240 "$url")" || code='000'
  printf '  %-72s -> %s\n' "$url" "$code"
done

# ── 2. EXTRACT THE SUITE ───────────────────────────────────────────────────
#
# The heredoc is indented ten spaces by the YAML; awk strips exactly that so the
# Python parses. Anchored on `python3 - <<'PY'` and the closing `PY`.
SUITE="$(mktemp 2>/dev/null || echo /tmp/aw-live-anon.$$.py)"
awk '/python3 - <<.PY./{f=1;next} f&&/^          PY$/{exit} f{sub(/^          /,"");print}' \
  "$WORKFLOW" > "$SUITE"

lines="$(wc -l < "$SUITE")"
if [ "$lines" -lt 100 ]; then
  echo "[FAIL] extracted only $lines lines — the heredoc anchors in $WORKFLOW moved."
  echo "       Do NOT report a pass from a suite that did not extract."
  exit 1
fi
echo "== extracted $lines lines =="

# ── 3. RUN IT, AND READ THE COUNT ──────────────────────────────────────────
#
# ⚠️ READ THE COUNT, NEVER THE EXIT CODE. This project has had a suite exit 0
# while running ZERO tests for two days. The script prints
# `PASSED n FAILED n SKIPPED n`; that line is the result.
echo "== running =="
"$PYTHON_BIN" "$SUITE"
rc=$?

echo
echo "== reminder =="
echo "  · The SIGNED-IN half (4 checks) did NOT run — it needs LIVE_OWNER_EMAIL /"
echo "    LIVE_OWNER_PASSWORD and a workflow dispatch. Report those as UNMEASURED."
echo "  · A skip is not a pass. Report passed / failed / SKIPPED as three numbers."
exit "$rc"
