#!/usr/bin/env bash
# Apply migrations in order against the configured database.
#
# Deliberately simple and idempotent-by-tracking rather than idempotent-by-
# CREATE-IF-NOT-EXISTS: every applied migration is recorded, so the live schema
# can never silently drift from the migration history. That drift is a defect
# the Solar app paid for, and docs/05-database/DATABASE_MIGRATIONS.md bans it.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER="${PG_CONTAINER:-aw-postgres}"
DB="${POSTGRES_DB:-autoworkshop}"
USER_NAME="${POSTGRES_USER:-autoworkshop}"

# ── ONE RUNNER, TWO TARGETS ────────────────────────────────────────────────
#
# `DATABASE_URL` set  -> a remote Postgres, reached with a real `psql` client.
# `DATABASE_URL` unset -> the local Docker container, as before.
#
# 🔴 DELIBERATELY THE SAME SCRIPT rather than a second one for deployments. The
# ledger, the ordering and the checksum drift-guard are the whole point of this
# file; a separate remote runner would be a second implementation of all three,
# and the first time they disagreed the live schema would diverge from the
# migration history — the exact failure this repo bans CREATE-IF-NOT-EXISTS to
# avoid.
#
# ⚠️ `PSQL_BIN` IS AN ABSOLUTE PATH IN CI, NOT BARE `psql`. Solar lost a run to
# this: the job installed postgresql-client-18 and then called bare `pg_dump`,
# which PATH resolved to Ubuntu's bundled 16.x, and only the one step that
# cared about the version failed. A server newer than the client is refused by
# some tools and tolerated by others, so the version is asserted by the caller.
if [ -n "${DATABASE_URL:-}" ]; then
  PSQL_BIN="${PSQL_BIN:-psql}"
  psql_run() { "$PSQL_BIN" -v ON_ERROR_STOP=1 "$DATABASE_URL" "$@"; }
  TARGET_DESC="remote database from DATABASE_URL"
else
  psql_run() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$USER_NAME" -d "$DB" "$@"; }
  TARGET_DESC="local container $CONTAINER"
fi

# ⚠️ DRY RUN LISTS AND APPLIES NOTHING. A preview that only prints the SQL it
# would run is worth less than one that inspects the live ledger, so this reads
# the target and reports what is genuinely pending there.
DRY_RUN="${DRY_RUN:-0}"

# Checksum LF-NORMALISED content, never the raw bytes on disk.
#
# This repo is developed on Windows with `core.autocrlf=true`, so git stores LF
# and checks out CRLF. Hashing the raw file therefore produced a DIFFERENT
# checksum for a byte-identical migration depending only on when it was last
# checked out — and the drift guard below read that as "somebody edited an
# applied migration", named the wrong cause, and blocked every later migration.
# Verified 2026-07-28: `git show HEAD:...001` matched the ledger exactly while
# the working copy did not.
#
# Normalising is backward-compatible by luck worth stating: 001 and 002 were
# applied from LF working copies, so the checksums already in the ledger ARE the
# normalised ones. No ledger rewrite is needed and none was done.
#
# `.gitattributes` now pins these files to LF, which removes the cause. This
# stays as well, because a checksum that depends on a checkout setting is wrong
# regardless of whether anything currently triggers it.
checksum_of() { tr -d '\r' < "$1" | sha256sum | cut -d' ' -f1; }

echo "==> target: $TARGET_DESC"
[ "$DRY_RUN" = "1" ] && echo "==> DRY RUN — nothing will be written"

echo "==> ensuring migration ledger"
# ⚠️ The ledger itself is created even on a dry run, because without it every
# migration reads as pending and the preview would be a lie on a database that
# has in fact been migrated. It is an empty bookkeeping table, not schema.
psql_run -q <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version     TEXT PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now(),
    checksum    TEXT NOT NULL
);
SQL

applied=0
skipped=0

for file in "$DIR"/[0-9]*.sql; do
  version="$(basename "$file" .sql)"
  checksum="$(checksum_of "$file")"

  existing="$(psql_run -tAc "SELECT checksum FROM public.schema_migrations WHERE version = '$version'" || true)"
  existing="$(echo "$existing" | tr -d '[:space:]')"

  if [ -n "$existing" ]; then
    if [ "$existing" != "$checksum" ]; then
      # An applied migration was edited after the fact. Refuse: the live schema
      # and the file no longer agree, and applying it again would compound the
      # divergence rather than fix it.
      echo "ERROR: $version already applied but its checksum changed."
      echo "       Applied: $existing"
      echo "       Current: $checksum"
      echo "       Write a NEW migration instead of editing an applied one."
      exit 1
    fi
    echo "  skip  $version (already applied)"
    skipped=$((skipped + 1))
    continue
  fi

  if [ "$DRY_RUN" = "1" ]; then
    echo "  PENDING $version (dry run — not applied)"
    pending=$((${pending:-0} + 1))
    continue
  fi

  echo "  apply $version"
  psql_run -q < "$file"
  psql_run -q -c "INSERT INTO public.schema_migrations (version, checksum) VALUES ('$version', '$checksum')"
  applied=$((applied + 1))
done

if [ "$DRY_RUN" = "1" ]; then
  echo "==> dry run: ${pending:-0} pending, $skipped already applied. Nothing was written."
else
  echo "==> done: $applied applied, $skipped skipped"
fi
