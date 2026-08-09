#!/usr/bin/env bash
# Continuous live probe — every service, with sample data, over TIME.
#
# ══════════════════════════════════════════════════════════════════════════
# WHY A SOAK AND NOT ANOTHER SUITE RUN
#
# `live-suite.yml` answers "is it right NOW". It cannot answer "how often is it
# wrong", and on 2026-08-09 that became the question: the three newest services
# answered the SAME url back-to-back as 200, 200, 404, 200, 404, 404 — every 404
# a 10-byte `Not Found` from Render's edge carrying `x-render-routing:
# no-server`, returned in ~0.6s. A cold start on this account measures 136s, so
# sub-second means the router had no instance, not a service waking.
#
# A single sample of that is a coin flip. This takes many samples and reports the
# RATE, which is the only honest way to describe an intermittent fault.
#
# 🔴 THIS COSTS FREE INSTANCE HOURS, and that pool is the thing under pressure —
# nine services now share one allowance that was exhausted once and suspended
# everything. Waking a sleeping service is exactly what this does. INTERVAL is
# deliberately not aggressive, and the run is BOUNDED. Do not turn this into a
# permanent warmer; `keep-warm.yml` exists for that and warms only Keycloak, on
# purpose, for the same reason.
#
# ⚠️ SAMPLE DATA IS ANONYMOUS AND MUST STAY THAT WAY. The POSTs below carry
# representative bodies and expect 400/401/403 — "the route is there and refuses
# me". They must never carry a credential: this file is committed, it runs
# unattended, and a soak that authenticates is a soak that can WRITE. Reading is
# safe to repeat forever; writing is not.
#
# Usage:  bash scripts/live-soak.sh [ROUNDS] [INTERVAL_SECONDS]
# Output: appends TSV to tmp/live-soak.log and prints a tally per round.
# ══════════════════════════════════════════════════════════════════════════
set -uo pipefail

ROUNDS="${1:-24}"
INTERVAL="${2:-300}"
LOG="${LOG:-tmp/live-soak.log}"
# 🔴 ABOVE THE MEASURED COLD START, NOT BELOW IT. This was 90s while the header
# above records a free-tier wake at 136s — so a sleeping service timed out and
# was recorded as a fault, inflating the exact rate this script measures.
# `keep-warm.yml` uses 150s for the same reason and says "do not lower this
# without a new measurement". Same rule here.
MAXTIME="${MAXTIME:-150}"
mkdir -p "$(dirname "$LOG")"

APEX=https://autoworkshop.aiappinvent.com
API=https://autoworkshop-api.onrender.com
CUSTOMER=https://autoworkshop-customer.onrender.com
SUPPLIER=https://autoworkshop-supplier.onrender.com
TOWING=https://autoworkshop-towing.onrender.com
ADMIN=https://autoworkshop-admin.onrender.com
FLEET=https://autoworkshop-fleet.onrender.com
INSURANCE=https://autoworkshop-insurance.onrender.com

# ⚠️ curl's exit status, never `|| echo 000`. That idiom appends a second 000 to
# curl's own and yields `000000`, so every comparison against "000" is false —
# measured on 2026-08-09, length 6. It is why a retry loop written for exactly
# this case skipped it.
get() {  # get <url> -> "<code> <seconds>"
  local out
  if out="$(curl -s -o /dev/null -w '%{http_code} %{time_total}' --max-time "$MAXTIME" "$1")"; then
    printf '%s' "$out"
  else
    printf '000 0'
  fi
}

post() {  # post <url> <json> -> "<code> <seconds>"
  local out
  if out="$(curl -s -o /dev/null -w '%{http_code} %{time_total}' --max-time "$MAXTIME" \
            -X POST -H 'Content-Type: application/json' -d "$2" "$1")"; then
    printf '%s' "$out"
  else
    printf '000 0'
  fi
}

# name | method | url | body | what a HEALTHY answer looks like (regex)
CHECKS=(
  "apex|GET|${APEX}/||^200$"
  "api-health|GET|${API}/api/v1/health||^200$"
  "keycloak|GET|https://autoworkshop-keycloak.onrender.com/realms/autoworkshop/.well-known/openid-configuration||^200$"
  "customer|GET|${CUSTOMER}/||^200$"
  "supplier|GET|${SUPPLIER}/||^(200|307)$"
  "towing-dash|GET|${TOWING}/operations/dashboard||^200$"
  "admin-dash|GET|${ADMIN}/home/operations-dashboard||^200$"
  "fleet-dash|GET|${FLEET}/home/dashboard||^200$"
  "insurance-dash|GET|${INSURANCE}/home/dashboard||^200$"
  # ── sample data, all anonymous ────────────────────────────────────────────
  "parts-catalogue|GET|${API}/api/v1/public/parts||^200$"
  "vin-honda|GET|${API}/api/v1/public/vin/1HGCM82633A004352||^200$"
  "vin-nonsense|GET|${API}/api/v1/public/vin/NOTAVIN0000000000||^(200|400|404)$"
  "towing-api-gated|GET|${API}/api/v1/towing/dashboard||^(401|403)$"
  "reg-supplier-gated|POST|${API}/api/v1/registration/supplier|{\"supplierName\":\"soak probe\"}|^(400|401|403)$"
  "reg-customer-gated|POST|${API}/api/v1/registration/customer|{\"organizationId\":\"11111111-1111-1111-1111-111111111111\"}|^(400|401|403)$"
  # 🔴 THE NAME IS `reg-fleet-gated`, NOT `reg-fleet-MISSING`, AND THAT MATTERS.
  # It was written as MISSING because the route 404'd; the route now exists, and
  # a name describing a state the code has left behind reads as a POLICY
  # statement to the next person. It will report BAD until the API carrying the
  # route is deployed — which is the honest signal, not a stale label.
  "reg-fleet-gated|POST|${API}/api/v1/registration/fleet|{\"fleetName\":\"soak probe\"}|^(400|401|403)$"
)

# 🔴 A RUN ID, BECAUSE THE TALLY IS ABOUT THIS RUN. The log is appended to and
# never rotated, so a closing tally over the whole file reports a rate diluted by
# every previous run — including the rounds that recorded a fault a fix has since
# removed. The number this script exists to produce is "how often was it wrong
# JUST NOW", and without this column that cannot be computed at all.
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"

[ -s "$LOG" ] || printf 'utc\trun\tround\tname\tcode\tseconds\tverdict\n' >> "$LOG"

echo "soak: ${ROUNDS} rounds every ${INTERVAL}s -> ${LOG}  (run ${RUN_ID})"
for round in $(seq 1 "$ROUNDS"); do
  ok=0; bad=0; line=""
  for spec in "${CHECKS[@]}"; do
    IFS='|' read -r name method url body want <<< "$spec"
    if [ "$method" = "POST" ]; then
      read -r code secs <<< "$(post "$url" "$body")"
    else
      read -r code secs <<< "$(get "$url")"
    fi
    # ⚠️ A TIMEOUT IS ITS OWN VERDICT, NOT A FAILURE. `000` means the request
    # never got an answer, and this file's own header records a cold start
    # measured at 136s — longer than the budget above. Counting that as BAD
    # inflates the very intermittent-failure rate the soak exists to measure, and
    # repeats this project's "a 90s timeout is not proof of an outage" mistake.
    # It is reported separately so a slow wake and a wrong answer never merge.
    if [ "$code" = "000" ]; then
      verdict=TIMEOUT; line="${line} ${name}=timeout"
    elif [[ "$code" =~ $want ]]; then
      verdict=ok; ok=$((ok+1))
    else
      verdict=BAD; bad=$((bad+1)); line="${line} ${name}=${code}"
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$RUN_ID" "$round" "$name" "$code" "$secs" "$verdict" >> "$LOG"
  done
  echo "round ${round}/${ROUNDS}  ok=${ok} bad=${bad}${line:+  ->${line}}"
  [ "$round" -lt "$ROUNDS" ] && sleep "$INTERVAL"
done

# ⚠️ FILTERED TO THIS RUN, AND ON THE POST-`run` COLUMN NUMBERS. Adding the run
# id shifted every field right by one; an awk still reading $3/$6 would tally the
# ROUND column against the SECONDS column and print a confident, meaningless
# number. Rows written before the column existed simply do not match `$2==run`,
# so an old log is excluded rather than misread.
echo "---- soak tally for run ${RUN_ID} ----"
awk -F'\t' -v run="$RUN_ID" '
  NR>1 && $2==run {
    t[$4]++
    if ($7=="ok")      o[$4]++
    if ($7=="TIMEOUT") w[$4]++
  }
  END {
    for (n in t)
      printf "  %-22s %d/%d ok%s\n", n, o[n]+0, t[n],
             (w[n] ? sprintf("  (%d timed out, not counted as wrong)", w[n]) : "")
  }' "$LOG" | sort
