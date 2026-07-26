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
  checksum="$(sha256sum "$file" | cut -d' ' -f1)"

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
