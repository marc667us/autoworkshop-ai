#!/usr/bin/env bash
#
# AutoWorkshop AI — RESTORE DRILL (Supervisor condition C3, `1.txt` §36-§37).
#
# Takes a backup, destroys nothing, and RESTORES IT into a throwaway cluster —
# then measures what was actually recovered and what was actually lost.
#
#   A backup that has not been restored is not a backup.
#
# The Solar database was destroyed on 2026-07-09 by a free-tier Postgres that
# expired with no backups. This project self-hosts, which removes that exact
# vector — and replaces it with host loss. The only defence against host loss is
# a restore path that someone has actually walked.
#
# WHAT THIS DRILL PROVES, in order:
#   1. WAL archiving works at all       (it did not, until 2026-07-26)
#   2. A base backup can be decrypted, extracted and started
#   3. WAL replay recovers transactions committed AFTER the backup was taken —
#      this is the difference between a nightly dump and a 5-minute RPO
#   4. The restored cluster is CORRECT, not merely running: RLS still forced,
#      the audit chain intact, migration history consistent, tenants isolated
#   5. Measured RTO and measured RPO, written to a dated report
#
# It is deliberately non-destructive: the live container is never stopped,
# never written to outside a dedicated `_drill` schema, and never restored into.
#
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

DRILL_CONTAINER="aw-restore-drill"
DRILL_VOLUME="autoworkshop_drilldata"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="${DRILL_DIR}/drill-${STAMP}.md"
PGIMAGE="pgvector/pgvector:pg16"

FAILURES=0
check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then
    printf '  PASS  %-52s %s\n' "$1" "$3"
    echo "| $1 | \`$2\` | \`$3\` | PASS |" >> "$REPORT.checks"
  else
    printf '  FAIL  %-52s expected %s, got %s\n' "$1" "$2" "$3"
    echo "| $1 | \`$2\` | \`$3\` | **FAIL** |" >> "$REPORT.checks"
    FAILURES=$((FAILURES + 1))
  fi
}

cleanup() {
  docker rm -f "$DRILL_CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$DRILL_VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -f "$REPORT.checks"
require_container "$PG_CONTAINER"
key_file_or_create

echo "==============================================================="
echo " RESTORE DRILL ${STAMP}"
echo "==============================================================="

# ---------------------------------------------------------------------------
# STEP 0 — refuse to drill against broken archiving.
# ---------------------------------------------------------------------------
log "step 0: is WAL archiving actually working?"
archiver_healthy || die "WAL archiving is broken. Fix it first — ./verify-archiving.sh"

# ---------------------------------------------------------------------------
# STEP 1 — canary table. Rows written here carry a timestamp, so after the
# restore we can say precisely WHICH transactions survived and which did not.
# That is the only way to state an RPO as a measurement instead of an intention.
# ---------------------------------------------------------------------------
log "step 1: seeding the canary"
# `docker exec -i` — without it stdin is not attached, the heredoc goes nowhere,
# psql exits 0 having done nothing, and the drill silently proceeds with no
# canary table at all. It failed exactly that way on the first run.
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS _drill;
CREATE TABLE IF NOT EXISTS _drill.canary (
  id    bigserial PRIMARY KEY,
  phase text        NOT NULL,
  at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
TRUNCATE _drill.canary;
INSERT INTO _drill.canary(phase) SELECT 'pre-backup' FROM generate_series(1,5);
SQL
PRE_COUNT="$(trim "$(pg_query "SELECT count(*) FROM _drill.canary WHERE phase='pre-backup'")")"
log "  ${PRE_COUNT} pre-backup canary rows"

# Facts about the live cluster, to compare against the restored one.
# `src` returns the literal string "missing" rather than defaulting to 0 — a
# count that silently becomes 0 would make "the table is gone" and "the table is
# empty" indistinguishable, and the drill would pass while the schema was lost.
src() { local v; v="$(trim "$(pg_query "$1")")"; echo "${v:-missing}"; }

SRC_TENANTS="$(src 'SELECT count(*) FROM identity.tenants')"
SRC_MIGRATIONS="$(src 'SELECT count(*) FROM public.schema_migrations')"
SRC_AUDIT="$(src 'SELECT count(*) FROM audit.events')"
SRC_RLS="$(src 'SELECT count(*) FROM pg_class WHERE relrowsecurity AND relforcerowsecurity')"
log "  live cluster: tenants=${SRC_TENANTS} migrations=${SRC_MIGRATIONS} audit=${SRC_AUDIT} forced-RLS=${SRC_RLS}"

# ---------------------------------------------------------------------------
# STEP 2 — take the backup being drilled.
# ---------------------------------------------------------------------------
log "step 2: taking the backup under test"
BACKUP_STAMP="$("$HERE/backup.sh" --no-offhost --no-realm --label restore-drill | tail -1)"
BASE_FILE="$LOCAL_DIR/base-${BACKUP_STAMP}.tar.gz.enc"
[ -f "$BASE_FILE" ] || die "expected base backup not found: $BASE_FILE"
log "  backup ${BACKUP_STAMP} ($(du -h "$BASE_FILE" | cut -f1))"

# ---------------------------------------------------------------------------
# STEP 3 — write MORE data AFTER the backup.
#
# This is the heart of the drill. Anyone can restore a backup and find the data
# that was in it. The question that matters is whether the transactions
# committed in the minutes AFTER the backup — the ones only WAL can carry — come
# back. If they do not, the real RPO is "since the last base backup", not five
# minutes, whatever the configuration claims.
# ---------------------------------------------------------------------------
log "step 3: committing transactions AFTER the backup (these must survive via WAL)"
for i in $(seq 1 10); do
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -qc \
    "INSERT INTO _drill.canary(phase) VALUES ('post-backup-${i}');" >/dev/null
done
POST_COUNT="$(trim "$(pg_query "SELECT count(*) FROM _drill.canary WHERE phase LIKE 'post-backup%'")")"
LAST_COMMIT="$(trim "$(pg_query "SELECT to_char(max(at),'YYYY-MM-DD\"T\"HH24:MI:SS.MS') FROM _drill.canary")")"
log "  ${POST_COUNT} post-backup rows, last committed at ${LAST_COMMIT}"

# A real crash does not wait for archive_timeout. Forcing the switch here is
# what a healthy system does every 5 minutes on its own; the gap between this
# and an unforced crash IS the RPO exposure, and it is reported below.
log "  forcing a WAL switch so those commits reach the archive"
pg_query "SELECT pg_switch_wal()" >/dev/null
sleep 3
FAILURE_MOMENT="$(date -u +%s)"
FAILURE_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "  simulated failure moment: ${FAILURE_ISO}"

# ---------------------------------------------------------------------------
# STEP 4 — restore. RTO measurement starts HERE and ends when the restored
# cluster answers a real query.
# ---------------------------------------------------------------------------
log "step 4: restoring into a throwaway cluster (RTO clock starts)"
RTO_START="$(date -u +%s)"

cleanup
docker volume create "$DRILL_VOLUME" >/dev/null

# Started with a sleeping entrypoint so the data directory can be populated
# before Postgres ever looks at it. The WAL archive is mounted READ-ONLY: a
# drill that could corrupt the live archive would be its own disaster.
docker run -d --name "$DRILL_CONTAINER" \
  --entrypoint bash \
  -v "${DRILL_VOLUME}:/var/lib/postgresql/data" \
  -v "autoworkshop_pgwal:/wal_archive:ro" \
  "$PGIMAGE" -c 'sleep 3600' >/dev/null

log "  decrypting and extracting the base backup"
decrypt_stream < "$BASE_FILE" \
  | docker exec -i "$DRILL_CONTAINER" tar -xzf - -C /var/lib/postgresql/data \
  || die "extraction failed — the backup is not restorable"

# Recovery configuration: replay every WAL segment the archive holds.
log "  configuring archive recovery"
docker exec "$DRILL_CONTAINER" bash -c '
  set -e
  cat >> /var/lib/postgresql/data/postgresql.auto.conf <<CONF

# --- restore drill: archive recovery ---
restore_command = '"'"'cp /wal_archive/%f %p'"'"'
recovery_target_timeline = '"'"'latest'"'"'
CONF
  touch /var/lib/postgresql/data/recovery.signal
  chown -R postgres:postgres /var/lib/postgresql/data
  chmod 700 /var/lib/postgresql/data
'

log "  starting the restored cluster"
docker exec -d "$DRILL_CONTAINER" \
  su postgres -c "postgres -D /var/lib/postgresql/data -p 5432 -c logging_collector=off"

# Wait for recovery to finish and the cluster to accept connections.
RECOVERED=0
for _ in $(seq 1 60); do
  if docker exec "$DRILL_CONTAINER" pg_isready -U "$PG_USER" -q 2>/dev/null; then
    if [ "$(trim "$(docker exec "$DRILL_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc 'SELECT pg_is_in_recovery()' 2>/dev/null)")" = "f" ]; then
      RECOVERED=1; break
    fi
  fi
  sleep 1
done
RTO_END="$(date -u +%s)"
RTO=$((RTO_END - RTO_START))

[ "$RECOVERED" = "1" ] || {
  docker exec "$DRILL_CONTAINER" bash -c 'tail -40 /var/lib/postgresql/data/log/*.log 2>/dev/null || true' >&2
  die "restored cluster never finished recovery — RESTORE FAILED"
}
log "  cluster is up and out of recovery after ${RTO}s"

# ---------------------------------------------------------------------------
# STEP 5 — verify the restore is CORRECT, not merely running (§36).
# ---------------------------------------------------------------------------
log "step 5: verifying the restored cluster"
d() { trim "$(docker exec "$DRILL_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "$1" 2>/dev/null)"; }

R_PRE="$(d "SELECT count(*) FROM _drill.canary WHERE phase='pre-backup'")"
R_POST="$(d "SELECT count(*) FROM _drill.canary WHERE phase LIKE 'post-backup%'")"
R_LAST="$(d "SELECT to_char(max(at),'YYYY-MM-DD\"T\"HH24:MI:SS.MS') FROM _drill.canary")"
R_TENANTS="$(d 'SELECT count(*) FROM identity.tenants')"
R_MIGRATIONS="$(d 'SELECT count(*) FROM public.schema_migrations')"
R_AUDIT="$(d 'SELECT count(*) FROM audit.events')"
R_RLS="$(d "SELECT count(*) FROM pg_class WHERE relrowsecurity AND relforcerowsecurity")"
R_APPROLE="$(d "SELECT count(*) FROM pg_roles WHERE rolname='autoworkshop_app' AND NOT rolsuper AND NOT rolbypassrls")"
R_CHECKSUM="$(d 'SHOW data_checksums')"

echo "| Check | Expected | Actual | Result |" >> "$REPORT.checks"
echo "|---|---|---|---|" >> "$REPORT.checks"

check "pre-backup rows recovered"            "$PRE_COUNT"      "$R_PRE"
check "POST-backup rows recovered (WAL)"     "$POST_COUNT"     "$R_POST"
check "tenants intact"                       "$SRC_TENANTS"    "$R_TENANTS"
check "migration history intact"             "$SRC_MIGRATIONS" "$R_MIGRATIONS"
check "audit chain intact"                   "$SRC_AUDIT"      "$R_AUDIT"
check "RLS still FORCED on restored tables"  "$SRC_RLS"       "$R_RLS"
check "app role is NOSUPERUSER/NOBYPASSRLS"  "1"               "$R_APPROLE"

# Tenant isolation, re-proven on the restored cluster. A restore that brings the
# data back but loses the policies has restored a data breach.
ISO="$(docker exec "$DRILL_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "
  SET ROLE autoworkshop_app;
  SELECT set_config('app.tenant_id','00000000-0000-0000-0000-000000000000',false);
  SELECT count(*) FROM identity.tenants;
" 2>/dev/null | tail -1 | tr -d ' \r\n')"
check "cross-tenant read denied by RLS"      "0"               "${ISO:-unknown}"

# ---------------------------------------------------------------------------
# STEP 6 — measured RPO.
# ---------------------------------------------------------------------------
RPO_NOTE="all committed transactions recovered"
if [ "$R_POST" != "$POST_COUNT" ]; then
  RPO_NOTE="LOST $((POST_COUNT - R_POST)) of ${POST_COUNT} post-backup transactions"
fi

echo
echo "==============================================================="
printf ' MEASURED RTO : %ss (backup on disk -> queryable cluster)\n' "$RTO"
printf ' MEASURED RPO : %s\n' "$RPO_NOTE"
printf ' last commit  : %s\n' "$LAST_COMMIT"
printf ' recovered to : %s\n' "$R_LAST"
echo "==============================================================="

# ---------------------------------------------------------------------------
# STEP 7 — the report. A drill nobody can point at later did not happen.
# ---------------------------------------------------------------------------
{
  echo "# Restore drill — ${STAMP}"
  echo
  echo "> A backup that has not been restored is not a backup. This is the record"
  echo "> of one that was, against \`1.txt\` §36-§37 and Supervisor condition C3."
  echo
  echo "## Result"
  echo
  if [ "$FAILURES" -eq 0 ]; then
    echo '**PASS** — the backup restored, WAL replay recovered post-backup transactions,'
    echo 'and the restored cluster is correct on every check below.'
  else
    echo "**FAIL** — ${FAILURES} check(s) failed. The backup is NOT proven restorable."
  fi
  echo
  echo "| Measure | Value |"
  echo "|---|---|"
  echo "| **RTO (measured)** | ${RTO}s — encrypted backup on disk to a queryable cluster |"
  echo "| **RPO (measured)** | ${RPO_NOTE} |"
  echo "| Backup under test | \`base-${BACKUP_STAMP}.tar.gz.enc\` |"
  echo "| Backup size | $(du -h "$BASE_FILE" | cut -f1) |"
  echo "| Simulated failure at | ${FAILURE_ISO} |"
  echo "| Last commit before failure | ${LAST_COMMIT} |"
  echo "| Recovered up to | ${R_LAST} |"
  echo "| Postgres | $(d 'SHOW server_version') |"
  echo "| Data checksums | ${R_CHECKSUM} |"
  echo
  echo "## Verification (§36)"
  echo
  cat "$REPORT.checks"
  echo
  echo "## What this drill does and does not prove"
  echo
  echo "**Proves:** the encrypted base backup decrypts and extracts; the cluster starts"
  echo "and completes archive recovery; transactions committed *after* the backup are"
  echo "recovered from archived WAL; RLS remains FORCED and cross-tenant reads are still"
  echo "denied on the restored cluster; migration history and the audit chain survive."
  echo
  echo "**Does not prove:** recovery from off-host storage alone (this drill reads the"
  echo "local WAL archive — the off-host copy is exercised by \`backup.sh\`, not here);"
  echo "recovery on different hardware; application-level recovery beyond the database;"
  echo "or Keycloak realm restore, which is exported but not yet drilled."
  echo
  echo "**RPO caveat, stated honestly:** this drill forces a WAL switch before the"
  echo "simulated failure. A real crash does not. Between segment switches the exposure"
  echo "is bounded by \`archive_timeout\` (currently 5 minutes) — that is the true"
  echo "worst-case RPO, and it meets \`1.txt\` §29 by design rather than by measurement."
} > "$REPORT"
rm -f "$REPORT.checks"

log "report written: ${REPORT}"

if [ "$FAILURES" -gt 0 ]; then
  die "DRILL FAILED — ${FAILURES} check(s) did not pass"
fi
echo "DRILL PASSED"
