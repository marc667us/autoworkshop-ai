#!/usr/bin/env bash
# Seed the PUBLIC parts catalogue and mechanic directory (migration 021).
#
# This is the data a visitor with no account sees. Unlike seed-dev-core.sh it is
# not tenant-scoped — the catalogue is platform-wide by construction.
#
# ⚠️ WHY THIS SEEDS AN UNPUBLISHED SUPPLIER AND AN UNPUBLISHED PART ON PURPOSE.
# With every row published, a total failure of the `is_published` policy and a
# perfectly working one render identically — the landing page shows everything
# either way, and the gate is untested. So one supplier and one part are left
# unpublished. They must NEVER appear on the public page. That is the same
# argument seed-dev-core.sh makes for seeding two tenants, applied to a
# different predicate: an exclusion you cannot see is an exclusion you have not
# verified.
#
# ⚠️ CURRENCY IS SET EXPLICITLY ON EVERY ROW. Migration 021 defaults the column
# to 'GBP' while the rest of this application prices in GHS (see
# repair.organization_pricing in seed-dev-core.sh). 021 is applied and
# checksummed so the default cannot be edited in place; migration 022 corrects
# it. Until then, relying on the default would silently price a Ghanaian part
# in sterling.
#
# DEV ONLY. Idempotent: re-running reconciles rather than duplicating.
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-aw-postgres}"
DB="${POSTGRES_DB:-autoworkshop}"
DB_USER="${POSTGRES_USER:-autoworkshop}"

if [ -n "${DATABASE_URL:-}" ] && ! printf '%s' "$DATABASE_URL" | grep -qE '(localhost|127\.0\.0\.1|@aw-postgres)'; then
  echo "refusing to seed: DATABASE_URL does not look local" >&2
  exit 2
fi

psql_run() { docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB" "$@"; }

# ⚠️ THE SQL LIVES IN infrastructure/seed/catalogue.sql, NOT HERE.
# The same statements seed the DEPLOYED catalogue via
# .github/workflows/seed-live-catalogue.yml. Keeping a copy in this script
# would mean the live shop and the local one could drift apart about what is
# for sale (§3: extend, never duplicate).
echo "==> seeding the catalogue from infrastructure/seed/catalogue.sql"
psql_run -q -f - < "$(dirname "${BASH_SOURCE[0]}")/../infrastructure/seed/catalogue.sql"

# ⚠️ ONE TRANSACTION, AND THAT IS LOAD-BEARING. `set_config(...,true)` is
# transaction-local, and migration 021's admin_write policy reads it. Without
# the explicit BEGIN each statement would be its own transaction, the setting
# would be gone by the next one, and every INSERT would be silently refused by
# RLS — zero rows, exit code 0. That exact failure is why CLAUDE.md's schema
# rules call it out.

# Parts are inserted separately so the supplier/category lookups read cleanly.

echo "==> seeding catalogue.part_fitments"

# Fitments drive the make/model/year search. The model dropdown on the landing
# page is derived FROM THIS TABLE rather than from core.vehicle_models — which
# is empty — so the page can never offer a model that returns nothing.

echo "==> seeding catalogue.mechanic_directory"

# Published from the workshops that already exist. Consented fields ONLY — see
# migration 021's header for why this is a copy and not a view over
# core.organization_profile.

echo "==> seeding catalogue.supplier_users (migration 023)"

# ⚠️ WITHOUT THIS THE SUPPLIER ORDER INBOX LOOKS BROKEN RATHER THAN EMPTY.
# Migration 023 created the membership table but nothing seeded a row, so
# `/orders-and-delivery/new-orders` on supplier-web showed "No orders yet" for
# every dev identity no matter how many orders existed — the policy was working
# exactly as designed and there was simply nobody it could match. Found by
# handing over test credentials that could not reach the screen they were for.
#
# Dev-only convenience. In production a supplier account arrives through
# sign-up and verification, which is Slice B — this is NOT that flow, and it
# must not become the model for it.
#
# Both identities are attached to EVERY published supplier so a tester can work
# any order without hunting for the right login. That is a dev shortcut and
# would be wrong in production: a real member belongs to one supplier.

echo "==> catalogue seeded"
psql_run -tAc "SELECT 'suppliers published: ' || count(*) FILTER (WHERE is_published) || ' of ' || count(*) FROM catalogue.suppliers;"
psql_run -tAc "SELECT 'parts published: '     || count(*) FILTER (WHERE is_published) || ' of ' || count(*) FROM catalogue.parts;"
psql_run -tAc "SELECT 'fitments: '            || count(*) FROM catalogue.part_fitments;"
psql_run -tAc "SELECT 'mechanics published: ' || count(*) FILTER (WHERE is_published) || ' of ' || count(*) FROM catalogue.mechanic_directory;"
# READ THIS COUNT. A zero here means the supplier inbox has nobody to
# authenticate and will read as broken — the exact failure this seed exists to
# prevent.
psql_run -tAc "SELECT 'supplier memberships: ' || count(*) FILTER (WHERE status='active') || ' active of ' || count(*) FROM catalogue.supplier_users;"
