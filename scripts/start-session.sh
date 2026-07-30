#!/usr/bin/env bash
# ============================================================================
# START HERE. This script IS the start of a session.
#
#   bash scripts/start-session.sh
#
# It exists because the last three sessions each lost time to the same two
# things, and neither is discoverable by reading code:
#
#   1. STALE SERVERS. `pkill -f` does not kill Windows processes, so a server
#      from a PREVIOUS DAY keeps serving port 3001/4000. The symptoms look
#      exactly like product defects — a finished page renders the "not built
#      yet" catch-all, a new route 404s while an old one answers 401 — and on
#      2026-07-30 that cost an hour before anyone checked the process start
#      time. This script kills them and PROVES the port is free.
#   2. FORGETTING THE MIGRATIONS. Local schema ahead of, or behind, migration
#      history is the drift this repo bans.
#
# It is READ-MOSTLY and idempotent: it kills dev servers, checks Docker, applies
# pending migrations, and then PRINTS what to read and what to run. It does not
# build or start anything — that is the operator's call, and a script that
# silently starts servers is how you end up with two.
# ============================================================================
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  [OK]   %s\n' "$1"; }
warn() { printf '  [WARN] %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1"; }

bold "AutoWorkshop AI — session start"
printf '  repo   %s\n' "$(pwd)"
printf '  branch %s\n' "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
printf '  tip    %s\n' "$(git log --oneline -1 2>/dev/null || echo '?')"

# ── 1. the pointer ─────────────────────────────────────────────────────────
bold "1. READ THESE FIRST — in this order"
for f in .claude/NEXT_SESSION_START_HERE.md .claude/CURRENT_TASK.md; do
  if [ -f "$f" ]; then ok "$f"; else fail "$f is MISSING"; fi
done
printf '\n  The first file carries: state at last close, the complete outstanding\n'
printf '  list, and the traps. The second carries the next slice, in steps.\n'

# ── 2. stale dev servers ───────────────────────────────────────────────────
bold "2. Killing stale dev servers (pkill does NOT work here)"
if command -v powershell.exe >/dev/null 2>&1; then
  powershell.exe -NoProfile -Command '
    foreach ($p in @(3000,3001,3002,4000)) {
      Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        $pr = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        if ($pr) {
          Write-Output ("  killed port {0} -> PID {1}, started {2}" -f $p, $pr.Id, $pr.StartTime)
          Stop-Process -Id $pr.Id -Force -ErrorAction SilentlyContinue
        }
      }
    }
    Start-Sleep -Seconds 2
    foreach ($p in @(3000,3001,3002,4000)) {
      $n = (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count
      if ($n -gt 0) { Write-Output ("  [FAIL] port {0} STILL has {1} listener(s)" -f $p, $n) }
    }
  ' 2>/dev/null | sed 's/^/ /'
  ok "ports 3000/3001/3002/4000 free (anything still listening is printed above)"
else
  warn "powershell.exe not on PATH — kill dev servers by hand before building"
fi

# ── 3. infrastructure ──────────────────────────────────────────────────────
bold "3. Docker infrastructure"
if ! docker ps >/dev/null 2>&1; then
  fail "Docker is not responding. Start Docker Desktop, then re-run this script."
  printf '  (Do NOT kill wslrelay.exe — it severs host port forwarding.)\n'
  exit 1
fi
for c in aw-postgres aw-keycloak aw-redis aw-minio aw-nats; do
  line="$(docker ps --filter "name=^${c}$" --format '{{.Status}}' 2>/dev/null)"
  if [ -z "$line" ]; then
    fail "$c is NOT running — try: pnpm infra:up"
  else
    case "$line" in
      *unhealthy*) fail "$c $line" ;;
      *) ok "$c — $line" ;;
    esac
  fi
done
printf '\n  ⚠️ A container reporting healthy is not proof the service works. Keycloak\n'
printf '     once answered /health/ready UP with a dead database for 30 hours; it was\n'
printf '     found by STARTING THE APP, not by reading a status.\n'

# ── 4. migrations ──────────────────────────────────────────────────────────
bold "4. Migrations (idempotent by tracking, never by IF NOT EXISTS)"
if bash infrastructure/migrations/run.sh 2>&1 | tail -3 | sed 's/^/  /'; then
  :
else
  fail "migrations did not apply cleanly — read the output above before building"
fi
printf '\n  ⚠️ These land on the LOCAL Postgres only. Run them wherever else the DB\n'
printf '     lives before anything depends on them.\n'

# ── 5. what to do next ─────────────────────────────────────────────────────
bold "5. Next, by hand — section 1 of NEXT_SESSION_START_HERE.md has the detail"
cat <<'NEXT'
  # four dev identities + seed data (idempotent; password Change_me_locally1!)
  bash scripts/seed-dev-identity.sh
  DEV_USER_ROLE=platform_administrator DEV_USER_EMAIL=admin@autoworkshop.local     bash scripts/seed-dev-identity.sh
  DEV_USER_ROLE=reception_staff        DEV_USER_EMAIL=reception@autoworkshop.local bash scripts/seed-dev-identity.sh
  DEV_USER_ROLE=customer               DEV_USER_EMAIL=customer@autoworkshop.local  bash scripts/seed-dev-identity.sh
  DEV_USER_ROLE=workshop_supervisor    DEV_USER_EMAIL=supervisor@autoworkshop.local bash scripts/seed-dev-identity.sh
  bash scripts/seed-dev-core.sh

  # build + run (rm -rf first: a stale dist/.next is the other phantom-defect source)
  (cd apps/api && rm -rf dist && ./node_modules/.bin/nest build)
  set -a && . ./.env && set +a && (cd apps/api && node dist/main.js &)

  (cd apps/workshop-web && rm -rf .next && ./node_modules/.bin/next build)
  # then next start -p 3001 with AUTH_SECRET/AUTH_URL/API_BASE_URL/KEYCLOAK_* set

  # THEN PROVE THE SERVER IS YOURS — not yesterday's:
  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/api/v1/health   # 200
  powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Get-Process -Id \$_.OwningProcess | Select-Object Id,StartTime }"
NEXT

bold "Reminders that have each cost a session"
cat <<'RULES'
  · READ THE COUNT, NEVER THE EXIT CODE. `playwright test` once exited 0 while
    running ZERO tests for two days. Baseline: 138 passed / 2 skipped; 344 unit.
  · Playwright runs from apps/e2e via ./node_modules/.bin/playwright test —
    there is no root `pnpm e2e` script.
  · export MSYS_NO_PATHCONV=1 before node scripts taking /paths — but NOT for pnpm.
  · A migration already applied is CHECKSUMMED. Fixes go in the next number.
  · Every refusal must name a REACHABLE alternative. Three slices running, that
    has been the most expensive class of defect in this repo.
  · Codex needs its prompt on STDIN: printf '%s' "$P" | codex.cmd exec ... -
    Passed as an argv string it reads only the first line and asks for the rest.
RULES

bold "Ready. Open .claude/NEXT_SESSION_START_HERE.md and start there."
