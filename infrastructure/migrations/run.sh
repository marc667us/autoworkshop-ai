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

psql_run() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$USER_NAME" -d "$DB" "$@"; }

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

echo "==> ensuring migration ledger"
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

  echo "  apply $version"
  psql_run -q < "$file"
  psql_run -q -c "INSERT INTO public.schema_migrations (version, checksum) VALUES ('$version', '$checksum')"
  applied=$((applied + 1))
done

echo "==> done: $applied applied, $skipped skipped"
