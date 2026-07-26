#!/usr/bin/env bash
#
# Shared helpers for the backup, verification and restore-drill scripts.
#
# Sourced, never executed directly.

# Windows/Git Bash rewrites container-absolute paths like /wal_archive into
# C:/Program Files/Git/wal_archive before docker ever sees them. Every docker
# exec in these scripts would silently address the wrong path.
export MSYS_NO_PATHCONV=1

PG_CONTAINER="${PG_CONTAINER:-aw-postgres}"
KC_CONTAINER="${KC_CONTAINER:-aw-keycloak}"
MINIO_CONTAINER="${MINIO_CONTAINER:-aw-minio}"
PG_USER="${POSTGRES_USER:-autoworkshop}"
PG_DB="${POSTGRES_DB:-autoworkshop}"

BACKUP_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DIR="${BACKUP_HOME}/artifacts"
KEY_FILE="${BACKUP_KEY_FILE:-${BACKUP_HOME}/.backup-key}"
DRILL_DIR="${BACKUP_HOME}/drills"

mkdir -p "$LOCAL_DIR" "$DRILL_DIR"

log()  { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
warn() { printf '[%s] WARNING: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die()  { printf '[%s] FATAL: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; exit 1; }
trim() { echo "$1" | tr -d ' \r\n'; }

require_container() {
  docker ps --format '{{.Names}}' | grep -qx "$1" \
    || die "container '$1' is not running. Start the stack: pnpm infra:up"
}

# Run a query and return the bare value.
pg_query() {
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "$1" 2>/dev/null
}

pg_query_on() {
  # pg_query_on <container> <port-inside> <sql>
  docker exec "$1" psql -U "$PG_USER" -d "$PG_DB" -tAc "$3" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Encryption key.
#
# ⚠️ WHERE THIS KEY LIVES IS A PRODUCTION DECISION, NOT A DETAIL.
# `1.txt` §34 requires the key to be held OUTSIDE the host being backed up: a
# key that only exists inside the thing you are protecting is not a key, it is
# a formality. Locally, the "host" is the postgres container, and this key sits
# on the workstation filesystem outside it — an honest approximation, and
# nothing more than that.
#
# In production the key belongs in a different trust domain from the database
# host entirely, and it must be backed up separately: an encrypted backup whose
# key was lost with the server is indistinguishable from no backup.
# ---------------------------------------------------------------------------
key_file_or_create() {
  if [ ! -f "$KEY_FILE" ]; then
    log "no backup key found — generating one at ${KEY_FILE}"
    openssl rand -hex 32 > "$KEY_FILE"
    chmod 600 "$KEY_FILE" 2>/dev/null || true
    warn "STORE THIS KEY SOMEWHERE ELSE TOO. If it is lost, every encrypted backup is unreadable."
  fi
}

# The key path handed to openssl must be in the form openssl itself understands.
#
# This file exports MSYS_NO_PATHCONV=1 (so Git Bash stops rewriting the
# container-absolute paths in every `docker exec`), and a side effect is that
# the Windows openssl binary then receives an MSYS path like /c/Users/... and
# cannot open it: "BIO_new_file:no such file". `fd:` is not supported by this
# build either. `cygpath -w` is the portable answer, and it is a no-op on Linux
# where cygpath does not exist.
openssl_key_arg() {
  if command -v cygpath >/dev/null 2>&1; then
    echo "file:$(cygpath -w "$KEY_FILE")"
  else
    echo "file:${KEY_FILE}"
  fi
}

encrypt_stream() {
  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass "$(openssl_key_arg)"
}

decrypt_stream() {
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass "$(openssl_key_arg)"
}

# ---------------------------------------------------------------------------
# Is WAL archiving actually working?
#
# Not "is it configured" — configured is what it looked like while it had failed
# 864 times in a row. This asks pg_stat_archiver whether anything has ever been
# archived and whether the most recent attempt failed.
# ---------------------------------------------------------------------------
# Is archiving working RIGHT NOW?
#
# An earlier version only read historical counters, and would have passed on a
# cluster whose archive path broke five minutes ago but had not yet retried —
# reporting health from a success that happened hours earlier. Given that the
# defect this entire script set exists to prevent was *silent archiving
# failure*, a gate that can be satisfied by stale history is the wrong gate.
#
# So this forces a segment switch and requires `archived_count` to advance.
# It costs one WAL segment per backup, which is the correct trade.
archiver_healthy() {
  local archived failed before after
  before="$(trim "$(pg_query 'SELECT archived_count FROM pg_stat_archiver')")"
  failed="$(trim "$(pg_query 'SELECT failed_count FROM pg_stat_archiver')")"

  if ! docker exec "$PG_CONTAINER" su postgres -c 'test -w /wal_archive' 2>/dev/null; then
    warn "the postgres user cannot write to /wal_archive — archive_command cannot possibly succeed"
    return 1
  fi

  pg_query "SELECT pg_switch_wal()" >/dev/null 2>&1 || { warn "could not force a WAL switch"; return 1; }

  local i=0
  while [ "$i" -lt 20 ]; do
    after="$(trim "$(pg_query 'SELECT archived_count FROM pg_stat_archiver')")"
    if [ "${after:-0}" -gt "${before:-0}" ]; then
      log "archiver healthy: archived ${before} -> ${after} (verified now, not from history)"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done

  failed="$(trim "$(pg_query 'SELECT failed_count FROM pg_stat_archiver')")"
  warn "forced a WAL switch and nothing was archived within 20s (archived=${before}, failed=${failed})"
  warn "point-in-time recovery is NOT available — do not trust a base backup taken now"
  return 1
}

# ---------------------------------------------------------------------------
# Off-host copy into MinIO, under credentials separate from the application's.
# ---------------------------------------------------------------------------
BACKUP_BUCKET="${BACKUP_BUCKET:-aw-backups}"

# ---------------------------------------------------------------------------
# SEPARATE CREDENTIALS (§34) — a real second identity, not a claim.
#
# This used to reuse S3_ACCESS_KEY/S3_SECRET_KEY, which are MinIO's ROOT
# credentials and the same ones the application uses for media. The comment
# said "credentials that are NOT the application's" while the code used exactly
# the application's, and the root account's at that. Codex caught it.
#
# Why it matters beyond tidiness: a single credential that can reach both the
# live media and the backups is one compromise away from losing both. That is
# the shape of most ransomware losses — the backups are deleted with the same
# key that encrypted the data.
#
# `offhost_setup` therefore provisions a dedicated MinIO user whose policy can
# touch ONLY the backup bucket. The root credential is used once, to create it,
# and never for the copy itself.
# ---------------------------------------------------------------------------
BACKUP_S3_USER="${BACKUP_S3_USER:-aw-backup-writer}"
BACKUP_S3_SECRET="${BACKUP_S3_SECRET:-}"

backup_secret_file() { echo "${BACKUP_HOME}/.backup-s3-secret"; }

offhost_setup() {
  docker ps --format '{{.Names}}' | grep -qx "$MINIO_CONTAINER" || return 1

  local sf; sf="$(backup_secret_file)"
  if [ -z "$BACKUP_S3_SECRET" ]; then
    if [ ! -f "$sf" ]; then
      openssl rand -hex 24 > "$sf"
      chmod 600 "$sf" 2>/dev/null || true
      log "generated a dedicated backup-writer secret at ${sf}"
    fi
    BACKUP_S3_SECRET="$(tr -d ' \r\n' < "$sf")"
  fi

  # Root alias — used ONLY to provision the scoped user and bucket.
  docker exec "$MINIO_CONTAINER" sh -c "
    mc alias set root http://localhost:9000 '${S3_ACCESS_KEY:-minioadmin}' '${S3_SECRET_KEY:-change_me_locally}' >/dev/null 2>&1
  " >/dev/null 2>&1 || return 1

  docker exec "$MINIO_CONTAINER" sh -c "
    set -e
    mc mb --ignore-existing root/${BACKUP_BUCKET} >/dev/null 2>&1
    mc version enable root/${BACKUP_BUCKET} >/dev/null 2>&1
    cat > /tmp/aw-backup-policy.json <<'POLICY'
{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:PutObject\", \"s3:GetObject\", \"s3:ListBucket\", \"s3:GetBucketLocation\"],
      \"Resource\": [\"arn:aws:s3:::${BACKUP_BUCKET}\", \"arn:aws:s3:::${BACKUP_BUCKET}/*\"]
    }
  ]
}
POLICY
    mc admin user add root '${BACKUP_S3_USER}' '${BACKUP_S3_SECRET}' >/dev/null 2>&1 || true
    mc admin policy create root aw-backup-only /tmp/aw-backup-policy.json >/dev/null 2>&1 || true
    mc admin policy attach root aw-backup-only --user '${BACKUP_S3_USER}' >/dev/null 2>&1 || true
    rm -f /tmp/aw-backup-policy.json
    # The alias the copy actually uses. No DeleteObject in the policy above:
    # a writer that cannot delete cannot be used to destroy the backup history.
    mc alias set backup http://localhost:9000 '${BACKUP_S3_USER}' '${BACKUP_S3_SECRET}' >/dev/null 2>&1
    mc ls backup/${BACKUP_BUCKET} >/dev/null 2>&1
  " >/dev/null 2>&1
}

# Returns non-zero if the off-host copy could not be completed. The CALLER
# decides whether that is fatal — and for a scheduled run it is.
offhost_put() {
  offhost_setup || { warn "off-host storage unavailable or could not be provisioned"; return 1; }
  local f rc=0
  for f in "$@"; do
    [ -f "$LOCAL_DIR/$f" ] || continue
    docker cp "$(cygpath -w "$LOCAL_DIR/$f" 2>/dev/null || echo "$LOCAL_DIR/$f")" \
      "$MINIO_CONTAINER:/tmp/$f" >/dev/null || { warn "off-host: failed to stage ${f}"; rc=1; continue; }
    if docker exec "$MINIO_CONTAINER" sh -c "mc cp /tmp/$f backup/${BACKUP_BUCKET}/$f >/dev/null && rm -f /tmp/$f"; then
      log "off-host: ${f}"
    else
      warn "off-host: FAILED to upload ${f}"
      rc=1
    fi
  done
  return $rc
}

# ---------------------------------------------------------------------------
# Retention.
#
# WAL is kept for 7 days, base backups for 35. That looks inconsistent and is
# not, but the reason matters enough to write down, because getting it wrong
# silently destroys recoverability:
#
#   `pg_basebackup -Xfetch` bundles the WAL needed to reach a consistent state
#   INTO the backup itself. A 30-day-old base backup is therefore restorable on
#   its own, without the archive.
#
#   What the 7-day archive buys is the PITR *window*: the ability to recover to
#   an arbitrary moment, rather than to the instant a backup was taken. So the
#   real guarantee is "any point in the last 7 days, or the exact moment of any
#   backup in the last 35".
#
# If `-Xfetch` is ever changed to `-Xnone`, this stops being true and every base
# backup older than the WAL horizon becomes unrestorable. Do not change it
# without changing this comment and the retention numbers together.
# ---------------------------------------------------------------------------
prune_local() {
  local days="$1" n
  n="$(find "$LOCAL_DIR" -maxdepth 1 -type f -mtime "+${days}" -print -delete 2>/dev/null | wc -l)"
  [ "${n:-0}" -gt 0 ] && log "retention: pruned ${n} local artefact(s) older than ${days}d" || true
}

prune_wal() {
  local days="$1"
  docker exec "$PG_CONTAINER" bash -c "find /wal_archive -type f -mtime +${days} -delete" 2>/dev/null || true
  log "retention: WAL older than ${days}d pruned"
}

latest_manifest() {
  ls -1t "$LOCAL_DIR"/manifest-*.json 2>/dev/null | head -1
}

# ---------------------------------------------------------------------------
# Artefact sanity: a backup must be plausibly large, not merely non-empty.
#
# `[ -s file ]` is not good enough here. `openssl enc` fed an empty stream still
# emits a 16-byte salt header, so a completely failed backup produces a
# non-empty file that passes every "is it there?" check. The floor below is
# deliberately crude — it is not asserting the backup is *good*, only that it is
# not obviously catastrophic. Proof of goodness is the restore drill; nothing
# else counts.
# ---------------------------------------------------------------------------
assert_plausible() { # assert_plausible <file> <min-bytes> <description>
  local f="$1" min="$2" desc="$3" size
  [ -f "$f" ] || die "${desc}: not created"
  size="$(wc -c < "$f" | tr -d ' ')"
  if [ "${size:-0}" -lt "$min" ]; then
    die "${desc}: only ${size} bytes (expected at least ${min}). This is a failed backup that would have looked present. Refusing to record it as one."
  fi
  log "  ${desc}: ${size} bytes"
}
