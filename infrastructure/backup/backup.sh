#!/usr/bin/env bash
#
# AutoWorkshop AI — physical + logical backup (Supervisor condition C3).
#
# Produces, for one run:
#   base-<stamp>.tar.gz.enc     encrypted physical base backup (pg_basebackup)
#   logical-<stamp>.sql.gz.enc  encrypted logical dump (pg_dump, custom format)
#   <name>.sha256               checksum of each artefact, written BEFORE upload
#   manifest-<stamp>.json       identity, timestamps, LSN, sizes, checksums
#
# and copies all of it off-host into MinIO under credentials that are NOT the
# application's.
#
# WHY PHYSICAL *AND* LOGICAL. They fail differently, which is the point. A
# physical base backup plus archived WAL is the only thing that gives
# point-in-time recovery (`1.txt` §29, RPO <= 5 min), but it is version- and
# platform-locked and useless if the cluster's page format is corrupt. A logical
# dump restores into any Postgres 16+, survives page corruption, and is the only
# way back if the base backup itself is bad. Keeping one and calling it "the
# backup" is how a recovery fails on the day it matters.
#
# ZERO COST: pg_basebackup, pg_dump, gzip, openssl and MinIO are all FOSS and
# already in the stack. Nothing here needs a purchase or a subscription.
#
# Usage:
#   ./backup.sh                 # full run: physical + logical + off-host copy
#   ./backup.sh --no-offhost    # local artefacts only (used by the restore drill)
#   ./backup.sh --label pre-migration-039
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

LABEL="scheduled"
OFFHOST=1
SKIP_REALM=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-offhost) OFFHOST=0 ;;
    # The realm export costs ~3 minutes of JVM startup. The restore drill
    # exercises the DATABASE recovery path and does not need it; the scheduled
    # daily run always takes it.
    --no-realm) SKIP_REALM=1 ;;
    --label) LABEL="$2"; shift ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
require_container "$PG_CONTAINER"
key_file_or_create

log "backup run ${STAMP} (label: ${LABEL})"

# ---------------------------------------------------------------------------
# 0. Refuse to back up a database whose WAL archiving is broken.
#
# A base backup without its WAL is a backup you can restore only to the exact
# instant it was taken — it cannot meet the 5-minute RPO, and worse, it looks
# like a complete backup. This check is the reason the whole archiving defect
# was found; it stays.
# ---------------------------------------------------------------------------
archiver_healthy || die "WAL archiving is failing — fix it before trusting any backup. Run: ./verify-archiving.sh"

# ---------------------------------------------------------------------------
# 1. Physical base backup, streamed straight into encryption.
#
# The plaintext tar never lands on disk: pg_basebackup writes to stdout, openssl
# encrypts the stream, and only ciphertext is written. A backup that exists
# unencrypted for even a few seconds on the host it protects is a backup that
# can be read by anything that compromised that host.
# ---------------------------------------------------------------------------
BASE="base-${STAMP}.tar.gz.enc"
log "physical base backup -> ${BASE}"
docker exec "$PG_CONTAINER" bash -c "
  pg_basebackup -U '${PG_USER}' -D - -Ft -z -Xfetch --checkpoint=fast 2>/tmp/basebackup.err
" | encrypt_stream > "$LOCAL_DIR/$BASE" || {
  docker exec "$PG_CONTAINER" cat /tmp/basebackup.err >&2 || true
  die "pg_basebackup failed"
}
# `pipefail` is set, so a pg_basebackup failure aborts at the `||` above. The
# size floor catches the other case — a command that exits 0 having produced
# nothing useful — which `[ -s ]` alone would wave through.
assert_plausible "$LOCAL_DIR/$BASE" 1000000 "physical base backup"

# ---------------------------------------------------------------------------
# 2. Logical dump — custom format so individual tables can be restored.
# ---------------------------------------------------------------------------
LOGICAL="logical-${STAMP}.dump.enc"
log "logical dump -> ${LOGICAL}"
docker exec "$PG_CONTAINER" \
  pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-password \
  | encrypt_stream > "$LOCAL_DIR/$LOGICAL" || die "pg_dump failed"
assert_plausible "$LOCAL_DIR/$LOGICAL" 20000 "logical dump"

# ---------------------------------------------------------------------------
# 3. Keycloak realm export (`1.txt` §32 — daily and after any change).
#
# The realm is configuration-as-code in the repo, but the RUNNING realm can
# drift from it, and a restored database full of users nobody can log in to is
# not a restored system.
# ---------------------------------------------------------------------------
REALM="realm-${STAMP}.json.enc"
if [ "$SKIP_REALM" = "1" ]; then
  log "keycloak realm export skipped (--no-realm)"
  REALM=""
elif docker ps --format '{{.Names}}' | grep -qx "$KC_CONTAINER"; then
  log "keycloak realm export -> ${REALM} (takes ~3 min: kc.sh starts a JVM)"

  # DO NOT TRUST kc.sh's EXIT CODE. `kc.sh export` completes the export, logs
  # "Export finished successfully", and *then* tries to start the management
  # HTTP interface on :9000 — which the already-running Keycloak owns. It dies
  # with "Address already in use" and returns non-zero, having done the job
  # perfectly. An earlier version of this script chained on `&&` and therefore
  # reported "realm NOT backed up" on every single run while a valid 92KB realm
  # file sat in the container.
  #
  # The artefact is the evidence, not the exit status.
  docker exec "$KC_CONTAINER" bash -c \
    'rm -rf /tmp/kcexport; /opt/keycloak/bin/kc.sh export --dir /tmp/kcexport --realm autoworkshop' \
    >/dev/null 2>&1 || true

  if docker exec "$KC_CONTAINER" test -s /tmp/kcexport/autoworkshop-realm.json 2>/dev/null \
     && docker exec "$KC_CONTAINER" head -c1 /tmp/kcexport/autoworkshop-realm.json 2>/dev/null | grep -q '{'; then
    docker exec "$KC_CONTAINER" cat /tmp/kcexport/autoworkshop-realm.json \
      | encrypt_stream > "$LOCAL_DIR/$REALM"
    docker exec "$KC_CONTAINER" rm -rf /tmp/kcexport >/dev/null 2>&1 || true
    log "  realm exported ($(du -h "$LOCAL_DIR/$REALM" | cut -f1) encrypted)"
  else
    warn "keycloak export produced no usable realm file — the realm is NOT backed up this run"
    rm -f "$LOCAL_DIR/$REALM"; REALM=""
  fi
else
  warn "keycloak container not running — realm NOT backed up this run"
  REALM=""
fi

# ---------------------------------------------------------------------------
# 4. Checksums, computed on the artefacts as written.
# ---------------------------------------------------------------------------
for f in "$BASE" "$LOGICAL" ${REALM:+"$REALM"}; do
  ( cd "$LOCAL_DIR" && sha256sum "$f" > "${f}.sha256" )
done

# ---------------------------------------------------------------------------
# 5. Manifest — what this backup IS, so a restore can prove its identity
#    rather than trusting a filename (§36 "backup identity and timestamp").
# ---------------------------------------------------------------------------
LSN="$(pg_query "SELECT pg_current_wal_lsn()")"
LAST_WAL="$(pg_query "SELECT coalesce(last_archived_wal,'none') FROM pg_stat_archiver")"
PGVER="$(pg_query "SHOW server_version")"
MANIFEST="manifest-${STAMP}.json"

# `--label` is operator-supplied and lands inside a JSON string, so it is
# escaped rather than interpolated raw. A label containing a quote would
# otherwise produce a manifest that no restore tooling can parse — and the
# manifest is what a restore reads to confirm it has the backup it thinks it
# has. A missing realm is emitted as JSON `null`, not the string "null", which
# a consumer would read as a filename.
json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g'; }
realm_json="null"
[ -n "${REALM}" ] && realm_json="\"$(json_escape "$REALM")\""

cat > "$LOCAL_DIR/$MANIFEST" <<JSON
{
  "stamp": "$(json_escape "$STAMP")",
  "label": "$(json_escape "$LABEL")",
  "database": "$(json_escape "$PG_DB")",
  "postgres_version": "$(json_escape "$(trim "$PGVER")")",
  "current_lsn": "$(json_escape "$(trim "$LSN")")",
  "last_archived_wal": "$(json_escape "$(trim "$LAST_WAL")")",
  "artifacts": {
    "physical": "$(json_escape "$BASE")",
    "logical": "$(json_escape "$LOGICAL")",
    "realm": ${realm_json}
  },
  "encryption": "aes-256-cbc, key held outside the backed-up container",
  "created_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

# ---------------------------------------------------------------------------
# 6. Off-host copy, under SEPARATE credentials (§34).
#
# The application's S3 key cannot reach the backup bucket, and the backup key
# cannot reach application media. A credential that can delete both your data
# and your backups is a single point of failure wearing two hats — that is the
# shape of most ransomware losses.
# ---------------------------------------------------------------------------
if [ "$OFFHOST" = "1" ]; then
  # A FAILED OFF-HOST COPY IS A FAILED BACKUP. This used to warn and carry on,
  # which meant a run could report success holding exactly one copy of the data,
  # on the same host as the database — and then prune older backups on the
  # strength of that "success". One copy on the machine you are protecting
  # against is not a backup, and quietly deleting the previous ones because you
  # think you have a new one is how a single failure becomes total loss.
  #
  # `--no-offhost` remains available for the restore drill, which deliberately
  # exercises only the local path.
  offhost_put "$BASE" "$LOGICAL" ${REALM:+"$REALM"} "$MANIFEST" \
    "${BASE}.sha256" "${LOGICAL}.sha256" ${REALM:+"${REALM}.sha256"} \
    || die "off-host copy FAILED — this backup exists only on the host being backed up. Retention pruning was skipped deliberately so the previous good backups survive. Fix off-host storage and re-run."
else
  log "off-host copy skipped (--no-offhost) — local copy only, not a complete backup"
fi

# ---------------------------------------------------------------------------
# 7. Retention (§33): WAL 7d · daily 35d · weekly 12w · monthly 12m.
#    Pruning runs LAST, so a failure above never destroys an older good backup.
# ---------------------------------------------------------------------------
prune_local 35
prune_wal 7

log "backup ${STAMP} complete"
echo "$STAMP"
