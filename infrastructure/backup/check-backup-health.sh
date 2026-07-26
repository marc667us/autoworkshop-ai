#!/usr/bin/env bash
#
# Backup health check (T-0019).
#
# THIS IS THE SCRIPT THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT.
# WAL archiving failed 864 times over five hours while every dashboard, setting
# and service status looked healthy. Nothing was watching the one counter that
# knew. Backups fail silently by nature: the database keeps serving, the
# scheduler keeps firing, and the only symptom is an absence — a file that was
# not written, a counter that did not move.
#
# So this checks for absences, not errors:
#   - has a backup actually happened recently?
#   - did the last scheduled run succeed?
#   - is WAL archiving currently working, or has failed_count started rising?
#   - has a restore drill been run this month? (§37 requires monthly)
#   - is the off-host copy present, or is everything on one host?
#
# Exit codes: 0 healthy · 1 WARNING · 2 CRITICAL.
# A scheduler that reports non-zero exits is the alerting channel; that is
# deliberate — it needs no service, no credential and no monthly fee.
#
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-26}"   # daily + 2h grace
MAX_DRILL_AGE_DAYS="${MAX_DRILL_AGE_DAYS:-35}"       # monthly + grace
WORST=0
note() { printf '  %-9s %s\n' "$1" "$2"; }
warn_up()  { [ "$WORST" -lt 1 ] && WORST=1; note "WARNING" "$1"; }
crit_up()  { WORST=2; note "CRITICAL" "$1"; }
ok()       { note "OK" "$1"; }

echo "=== AutoWorkshop backup health — $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

# --- 1. Is there a recent backup at all? -----------------------------------
NEWEST="$(ls -1t "$LOCAL_DIR"/base-*.tar.gz.enc 2>/dev/null | head -1 || true)"
if [ -z "$NEWEST" ]; then
  crit_up "no base backup exists at all"
else
  AGE_MIN="$(( ( $(date -u +%s) - $(date -u -r "$NEWEST" +%s 2>/dev/null || echo 0) ) / 60 ))"
  AGE_H=$((AGE_MIN / 60))
  if [ "$AGE_H" -gt "$MAX_BACKUP_AGE_HOURS" ]; then
    crit_up "newest backup is ${AGE_H}h old (threshold ${MAX_BACKUP_AGE_HOURS}h) — $(basename "$NEWEST")"
  else
    ok "newest backup is ${AGE_H}h old — $(basename "$NEWEST")"
  fi
fi

# --- 2. Did the last scheduled runs succeed? -------------------------------
for job in daily weekly drill; do
  SF="${BACKUP_HOME}/status/${job}.json"
  if [ -f "$SF" ]; then
    RC="$(grep -o '"exit_code": *[0-9]*' "$SF" | grep -o '[0-9]*$')"
    WHEN="$(grep -o '"last_run_utc": *"[^"]*"' "$SF" | sed 's/.*"\([^"]*\)"$/\1/')"
    OUTCOME="$(grep -o '"outcome": *"[^"]*"' "$SF" | sed 's/.*"\([^"]*\)"$/\1/')"
    if [ "${RC:-1}" -ne 0 ]; then
      crit_up "scheduled job '${job}' last FAILED (rc=${RC}) at ${WHEN}"
    elif [ "${OUTCOME:-}" = "skipped" ]; then
      # exit_code 0 but the work never happened. Without this branch a job that
      # is skipped every single time it fires reports as a healthy success.
      warn_up "scheduled job '${job}' was SKIPPED at ${WHEN} (lock held) — it did not run"
    else
      ok "scheduled job '${job}' last succeeded at ${WHEN}"
    fi
  else
    # Absence is the signal. A job that has never run leaves no failure behind.
    warn_up "scheduled job '${job}' has never run"
  fi
done

# --- 3. Is WAL archiving working RIGHT NOW? --------------------------------
if ! docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  crit_up "postgres container '${PG_CONTAINER}' is not running"
else
  ARCHIVED="$(trim "$(pg_query 'SELECT archived_count FROM pg_stat_archiver')")"
  FAILED="$(trim "$(pg_query 'SELECT failed_count FROM pg_stat_archiver')")"
  LASTF="$(trim "$(pg_query "SELECT coalesce(extract(epoch from last_failed_time)::bigint,0) FROM pg_stat_archiver")")"
  LASTA="$(trim "$(pg_query "SELECT coalesce(extract(epoch from last_archived_time)::bigint,0) FROM pg_stat_archiver")")"

  if [ "${ARCHIVED:-0}" -eq 0 ]; then
    crit_up "WAL has NEVER been archived (archived=0, failed=${FAILED}) — no point-in-time recovery"
  elif [ "${LASTF:-0}" -gt "${LASTA:-0}" ]; then
    crit_up "the most recent WAL archive attempt FAILED (failed=${FAILED}) — PITR is degrading NOW"
  else
    ok "WAL archiving healthy (archived=${ARCHIVED}, failed=${FAILED})"
  fi

  # failed_count rising between checks is the early warning the original defect
  # never got. Remembered across runs so a rise is visible without a metrics stack.
  PREV_FILE="${BACKUP_HOME}/status/.last-failed-count"
  PREV="$(cat "$PREV_FILE" 2>/dev/null || echo "${FAILED:-0}")"
  if [ "${FAILED:-0}" -gt "${PREV:-0}" ]; then
    crit_up "archiver failed_count ROSE ${PREV} -> ${FAILED} since the last check"
  fi
  echo "${FAILED:-0}" > "$PREV_FILE"
fi

# --- 4. Has a restore drill run recently? (§37 monthly) --------------------
NEWEST_DRILL="$(ls -1t "$DRILL_DIR"/drill-*.md 2>/dev/null | head -1 || true)"
if [ -z "$NEWEST_DRILL" ]; then
  crit_up "no restore drill has ever been run — the backup is unproven"
else
  DAGE=$(( ( $(date -u +%s) - $(date -u -r "$NEWEST_DRILL" +%s 2>/dev/null || echo 0) ) / 86400 ))
  if [ "$DAGE" -gt "$MAX_DRILL_AGE_DAYS" ]; then
    warn_up "last restore drill was ${DAGE}d ago (§37 requires monthly)"
  else
    ok "restore drill ${DAGE}d ago — $(basename "$NEWEST_DRILL")"
  fi
  grep -q '^\*\*FAIL\*\*' "$NEWEST_DRILL" 2>/dev/null && crit_up "the most recent drill FAILED"
fi

# --- 5. Is there an off-host copy? -----------------------------------------
if docker ps --format '{{.Names}}' | grep -qx "$MINIO_CONTAINER"; then
  # Count on the HOST, not inside the container. The minio image is minimal and
  # has no `grep`, so an in-container `mc ls | grep -c` fails with "command not
  # found", the count comes back empty, and this reported CRITICAL "no off-host
  # backup" while four of them sat in the bucket. A false CRITICAL is not a safe
  # default — it is the thing that teaches an operator to ignore the check.
  #
  # Count WITHOUT `... | grep -c ... || echo 0`. That idiom is broken in exactly
  # the case this check exists for: with zero matches `grep -c` prints "0" AND
  # exits 1, so `|| echo 0` appends a second "0", N becomes "0\n0", the integer
  # test below errors, and the `if` takes the ELSE branch — reporting OK when
  # there are no off-host backups at all. It is only correct on the healthy
  # path, which is why it survived live runs. Capture first, then count.
  #
  if LISTING="$(docker exec "$MINIO_CONTAINER" sh -c "
        mc alias set root http://localhost:9000 '${S3_ACCESS_KEY:-minioadmin}' '${S3_SECRET_KEY:-change_me_locally}' >/dev/null 2>&1
        mc ls root/${BACKUP_BUCKET} 2>/dev/null" 2>/dev/null)"; then
    N="$(printf '%s\n' "$LISTING" | grep -c 'base-.*\.tar\.gz\.enc$' || true)"
    N="$(printf '%s' "$N" | tr -dc '0-9')"   # one integer, whatever grep did
    [ -z "$N" ] && N=0
  else
    # Could not list the bucket. That is not "zero backups" and must not be
    # reported as either OK or a confirmed absence.
    N=""
  fi

  if [ -z "$N" ]; then
    crit_up "cannot list off-host bucket '${BACKUP_BUCKET}' — off-host copies UNCONFIRMED"
  elif [ "$N" -eq 0 ]; then
    crit_up "no base backup found off-host — every copy is on the host being protected"
  else
    ok "${N} base backup(s) present off-host"
  fi
else
  warn_up "off-host storage (${MINIO_CONTAINER}) is not running — cannot confirm off-host copies"
fi

echo
case "$WORST" in
  0) echo "RESULT: HEALTHY" ;;
  1) echo "RESULT: WARNING — backups are working but something needs attention" ;;
  2) echo "RESULT: CRITICAL — recoverability is compromised. Act now." ;;
esac
exit "$WORST"
