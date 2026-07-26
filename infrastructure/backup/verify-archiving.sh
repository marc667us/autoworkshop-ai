#!/usr/bin/env bash
#
# Prove WAL archiving works — by archiving a segment, not by reading settings.
#
# WHY THIS SCRIPT EXISTS. On 2026-07-26 this stack reported archive_mode=on,
# wal_level=replica and archive_timeout=5min, exactly as configured, and had
# archived nothing at all: /wal_archive was owned by root, archive_command runs
# as uid 999, and pg_stat_archiver showed archived_count=0 against
# failed_count=864 on a single segment. Postgres logs an archive failure and
# retries forever; nothing surfaces, and the database keeps serving traffic.
#
# `SHOW archive_mode` proves someone typed a setting. Only a segment landing in
# the archive proves recovery is possible. This script does the latter, and is
# the gate the backup script calls before trusting anything.
#
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

require_container "$PG_CONTAINER"

echo "=== configuration (necessary, not sufficient) ==="
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" \
  -c "SELECT name, setting FROM pg_settings WHERE name IN
      ('archive_mode','archive_command','archive_timeout','wal_level','max_wal_senders');"

echo
echo "=== can the postgres uid actually write to the archive? ==="
docker exec "$PG_CONTAINER" bash -c '
  ls -ld /wal_archive
  su postgres -c "touch /wal_archive/.probe" 2>&1 \
    && { echo "WRITE OK"; rm -f /wal_archive/.probe; } \
    || { echo "WRITE DENIED — archive_command cannot possibly succeed"; exit 1; }
'

echo
echo "=== force a segment switch and watch for it to arrive ==="
BEFORE="$(trim "$(pg_query 'SELECT archived_count FROM pg_stat_archiver')")"
pg_query "SELECT pg_switch_wal()" >/dev/null
# archive_command runs asynchronously after the switch.
for _ in $(seq 1 20); do
  AFTER="$(trim "$(pg_query 'SELECT archived_count FROM pg_stat_archiver')")"
  [ "${AFTER:-0}" -gt "${BEFORE:-0}" ] && break
  sleep 1
done

docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" \
  -c "SELECT archived_count, last_archived_wal, last_archived_time,
             failed_count, last_failed_wal, last_failed_time
      FROM pg_stat_archiver;"

echo "=== segments on disk ==="
docker exec "$PG_CONTAINER" bash -c 'ls -1 /wal_archive | wc -l' | sed 's/^/  count: /'

if [ "${AFTER:-0}" -gt "${BEFORE:-0}" ]; then
  echo
  echo "ARCHIVING VERIFIED: archived_count ${BEFORE} -> ${AFTER}, a real segment reached the archive."
  exit 0
fi

echo
echo "ARCHIVING BROKEN: forced a WAL switch and nothing was archived." >&2
echo "Point-in-time recovery is NOT available. Do not trust any base backup taken now." >&2
exit 1
