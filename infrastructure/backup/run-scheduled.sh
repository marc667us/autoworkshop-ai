#!/usr/bin/env bash
#
# Unattended wrapper — the entry point every scheduler calls.
#
# Running a script by hand and running it from a scheduler are different
# problems. By hand you see the output, you know it ran, and you notice if it
# takes an hour. From a scheduler nobody sees anything, so this wrapper adds the
# three things that make unattended execution trustworthy:
#
#   1. A LOCK, so a slow run and the next scheduled run cannot overlap. Two
#      concurrent pg_basebackups against one cluster is how a backup window
#      turns into an outage.
#   2. A LOG, so there is something to read afterwards.
#   3. A STATUS FILE, so a monitor can tell "ran and succeeded" from "never ran
#      at all". A scheduler that silently stops firing looks exactly like a
#      system with nothing to do — this is how the WAL archiving defect went
#      five hours unnoticed, and it is the failure mode to design against.
#
# Usage:
#   ./run-scheduled.sh daily     # backup + off-host copy
#   ./run-scheduled.sh weekly    # backup labelled weekly (retention differs)
#   ./run-scheduled.sh drill     # full restore drill
#   ./run-scheduled.sh health    # health check only (cheap, run often)
#
set -uo pipefail   # NOT -e: this wrapper must always reach its status-writing code
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

JOB="${1:-daily}"
LOG_DIR="${HERE}/logs"
STATUS_DIR="${HERE}/status"
LOCK_DIR="${HERE}/.lock-${JOB}"
LOG_FILE="${LOG_DIR}/${JOB}.log"
STATUS_FILE="${STATUS_DIR}/${JOB}.json"
STALE_LOCK_MINUTES=180

mkdir -p "$LOG_DIR" "$STATUS_DIR"

stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# ---------------------------------------------------------------------------
# Lock. `mkdir` is atomic on every filesystem that matters, and Git Bash has no
# flock, so this is the portable primitive rather than a preference.
# ---------------------------------------------------------------------------
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  # A lock left behind by a killed run would block this job forever, which is a
  # silent stop — the exact failure this wrapper exists to prevent. So a lock
  # older than the stale threshold is broken, loudly.
  if [ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin "+${STALE_LOCK_MINUTES}" 2>/dev/null)" ]; then
    echo "[$(stamp)] WARNING: breaking a stale lock (older than ${STALE_LOCK_MINUTES}m): ${LOCK_DIR}" >> "$LOG_FILE"
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR" 2>/dev/null || { echo "[$(stamp)] FATAL: cannot acquire lock" >> "$LOG_FILE"; exit 1; }
  else
    echo "[$(stamp)] SKIPPED: '${JOB}' is already running (lock held)" >> "$LOG_FILE"
    exit 0   # not an error: the previous run is still working
  fi
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

# ---------------------------------------------------------------------------
# Log rotation. Crude on purpose — a log that grows forever eventually fills the
# disk the database lives on, which would be an impressively self-defeating way
# for a backup system to cause an outage.
# ---------------------------------------------------------------------------
if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE" | tr -d ' ')" -gt 5000000 ]; then
  mv -f "$LOG_FILE" "${LOG_FILE}.1"
fi

START="$(date -u +%s)"
{
  echo "==============================================================="
  echo "[$(stamp)] START job=${JOB}"
} >> "$LOG_FILE"

case "$JOB" in
  daily)   "$HERE/backup.sh" --label daily  ;;
  weekly)  "$HERE/backup.sh" --label weekly ;;
  drill)   "$HERE/restore-drill.sh"         ;;
  health)  "$HERE/check-backup-health.sh"   ;;
  *)       echo "unknown job: ${JOB}" ; exit 2 ;;
esac >> "$LOG_FILE" 2>&1
RC=$?

END="$(date -u +%s)"
DURATION=$((END - START))

{
  echo "[$(stamp)] END job=${JOB} rc=${RC} duration=${DURATION}s"
} >> "$LOG_FILE"

# ---------------------------------------------------------------------------
# Status file. Written on success AND failure — a status file that only appears
# when things go well cannot distinguish "broken" from "never ran".
# ---------------------------------------------------------------------------
cat > "$STATUS_FILE" <<JSON
{
  "job": "${JOB}",
  "last_run_utc": "$(stamp)",
  "exit_code": ${RC},
  "outcome": "$([ "$RC" -eq 0 ] && echo success || echo FAILED)",
  "duration_seconds": ${DURATION},
  "log": "${LOG_FILE}"
}
JSON

if [ "$RC" -ne 0 ]; then
  echo "[$(stamp)] job '${JOB}' FAILED with rc=${RC} — see ${LOG_FILE}" >&2
fi
exit "$RC"
