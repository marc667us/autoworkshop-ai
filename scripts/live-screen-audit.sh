#!/usr/bin/env bash
# Walk EVERY navigation route on EVERY deployed app and say what a user gets.
#
# ══════════════════════════════════════════════════════════════════════════
# 🔴 WHY THIS EXISTS. `audit-menu-coverage.mjs` reads the REPOSITORY: it knows
# which routes have a `page.tsx`. That is not the same question as "what does a
# person actually see on the live site", and the difference has been expensive
# here — the audit printed `0 dead ends` while measuring two apps out of seven,
# and separately a whole app shipped with ten screens no user could reach.
#
# This asks the live site, one route at a time, and sorts every answer into one
# of four states:
#
#   BUILT        200, and the page is NOT the placeholder
#   PLACEHOLDER  200, and it says "has not been built yet"
#   HIDDEN       404 from the APP — permission-gated, correct for anonymous
#   UNREACHABLE  404 from RENDER's edge (x-render-routing: no-server), or a
#                transport failure. NOT a product fact.
#
# ⚠️ THE LAST TWO ARE DIFFERENT AND MUST NEVER BE MERGED. A permission-gated
# screen returning 404 to an anonymous visitor is the product working as
# designed; a 404 from Render's router means no instance answered. Both are
# "404" and only one is a defect. Told apart by the body: Render's is a 10-byte
# `Not Found`.
#
# ⚠️ ANONYMOUS, SO IT UNDERSTATES. Screens behind a permission render as HIDDEN
# here even when built. That is a floor on what is built, not a census — the
# signed-in half needs the live-suite account (gap A1).
#
# Usage:  bash scripts/live-screen-audit.sh [routes-file] [out.tsv]
# ══════════════════════════════════════════════════════════════════════════
set -uo pipefail

ROUTES="${1:-/tmp/routes.txt}"
OUT="${2:-tmp/live-screen-audit.tsv}"
mkdir -p "$(dirname "$OUT")"

declare -A HOST=(
  [apex]=https://autoworkshop.aiappinvent.com
  [customer]=https://autoworkshop-customer.onrender.com
  [supplier]=https://autoworkshop-supplier.onrender.com
  [towing]=https://autoworkshop-towing.onrender.com
  [fleet]=https://autoworkshop-fleet.onrender.com
  [insurance]=https://autoworkshop-insurance.onrender.com
  [admin]=https://autoworkshop-admin.onrender.com
)

# 🔴 WARM FIRST, MEASURE SECOND. A free instance answers its first request with
# a cold start (136s measured) or, worse, with Render's `no-server` 404 in half a
# second. Measuring before warming reports a healthy platform as an outage —
# that happened on 2026-08-07 and cost an hour.
echo "warming ${#HOST[@]} hosts..."
for h in "${!HOST[@]}"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 240 "${HOST[$h]}/" || echo 000)
  echo "  $h -> $code"
done

printf 'app\troute\tlabel\tstate\tcode\n' > "$OUT"

while IFS='|' read -r app _var route label; do
  [ -n "${HOST[$app]:-}" ] || continue
  url="${HOST[$app]}${route}"

  state=""; code=""
  for attempt in 1 2 3; do
    if body="$(curl -sL --max-time 150 -w '\n%{http_code}' "$url")"; then
      code="${body##*$'\n'}"
      page="${body%$'\n'*}"
    else
      code=000; page=""
    fi
    case "$code" in
      200)
        if printf '%s' "$page" | grep -qi "has not been built yet"; then
          state=PLACEHOLDER
        else
          state=BUILT
        fi
        break ;;
      404)
        # Render's edge 404 is a ~10-byte text/plain body; the app's own 404 is
        # a rendered page. Size is the cheapest reliable discriminator.
        if [ "${#page}" -lt 200 ]; then
          state=UNREACHABLE   # no instance — retry
        else
          state=HIDDEN        # the app refused: permission-gated
          break
        fi ;;
      000) state=UNREACHABLE ;;
      *)   state="HTTP_${code}"; break ;;
    esac
    sleep 2
  done

  printf '%s\t%s\t%s\t%s\t%s\n' "$app" "$route" "$label" "$state" "$code" >> "$OUT"
  printf '  %-10s %-42s %s\n' "$app" "$route" "$state"
done < "$ROUTES"

echo
echo "---- what a user actually reaches ----"
awk -F'\t' 'NR>1 {t[$1"\t"$4]++; app[$1]++}
  END {
    for (k in t) { split(k,p,"\t"); c[p[1]"|"p[2]]=t[k] }
    for (a in app)
      printf "  %-10s BUILT %-4d PLACEHOLDER %-4d HIDDEN %-4d UNREACHABLE %-4d  of %d\n",
        a, c[a"|BUILT"]+0, c[a"|PLACEHOLDER"]+0, c[a"|HIDDEN"]+0, c[a"|UNREACHABLE"]+0, app[a]
  }' "$OUT" | sort
