#!/usr/bin/env bash
# Seed development customers and vehicles into BOTH tenants (Phase 4).
#
# WHY BOTH TENANTS, AND WHY THAT IS THE POINT
#
# Seeding only the tenant you sign in as produces a screen that looks correct
# and proves nothing: with one tenant's data in the database, a total isolation
# failure and perfect isolation render identically. The organizations screen is
# trustworthy precisely because Postgres holds two organisations and the page
# shows one — the exclusion is visible.
#
# So this seeds Tenant A (Alpha Motors) AND Tenant B (Beta Auto). Signed in as a
# member of Tenant A, the customers and vehicles screens must show ONLY the
# Alpha rows. A Beta row appearing on either screen is a Severity-1 tenant
# isolation regression, not test noise.
#
# It also seeds a customer with NO vehicles and a vehicle with NO model, because
# both are legal states in migration 004 and both are places a LEFT JOIN written
# as an INNER JOIN would silently drop a row.
#
# DEV ONLY — refuses to run against anything but the local Postgres container.
# Idempotent: re-running reconciles rather than duplicating.
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-aw-postgres}"
DB="${POSTGRES_DB:-autoworkshop}"
DB_USER="${POSTGRES_USER:-autoworkshop}"

# ── dev-only guard ──────────────────────────────────────────────────────────
# This writes business records. It must never be pointed at a deployed database,
# where it would invent customers a real workshop would then have to explain.
if [ -n "${DATABASE_URL:-}" ] && ! printf '%s' "$DATABASE_URL" | grep -qE '(localhost|127\.0\.0\.1|@aw-postgres)'; then
  echo "refusing to seed: DATABASE_URL does not look local" >&2
  exit 2
fi

psql_run() { docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB" "$@"; }

echo "==> seeding core.customers and core.vehicles"

# Runs as the table OWNER, which is exempt from RLS even under FORCE. That is
# correct HERE and only here: a seed has to write into two tenants at once,
# which is exactly what the policy forbids the application from doing. The
# application itself connects as autoworkshop_app and gets no such exemption.
psql_run -q <<'SQL'
BEGIN;

-- Resolve the organisations by name rather than hardcoding uuids, so this keeps
-- working after a database reset regenerates them.
WITH orgs AS (
    SELECT o.id AS org_id, o.tenant_id, o.name
      FROM identity.organizations o
     WHERE o.name IN ('Alpha Motors', 'Beta Auto')
),
seeded AS (
    SELECT * FROM (VALUES
        -- (organisation, name, type, email, phone, location)
        ('Alpha Motors', 'Kwame Mensah',        'individual', 'kwame.mensah@example.test',  '+233 24 111 2233', 'Accra'),
        ('Alpha Motors', 'Adjoa Boateng',       'individual', 'adjoa.boateng@example.test', '+233 20 444 5566', 'Tema'),
        -- A business customer, and deliberately one with NO vehicle: the
        -- customers list uses a LEFT JOIN to count vehicles, and this row is
        -- what fails if that ever becomes an INNER JOIN.
        ('Alpha Motors', 'Sunrise Logistics Ltd','business',  'fleet@sunrise.example.test', '+233 30 222 7788', 'Accra'),
        -- Tenant B. Must NEVER appear on a Tenant A screen.
        ('Beta Auto',    'Yaw Darko',           'individual', 'yaw.darko@example.test',     '+233 27 888 9900', 'Kumasi')
    ) AS s(org_name, display_name, customer_type, email, phone, location)
)
INSERT INTO core.customers
    (tenant_id, organization_id, display_name, customer_type, email, phone, location)
SELECT o.tenant_id, o.org_id, s.display_name, s.customer_type, s.email, s.phone, s.location
  FROM seeded s
  JOIN orgs   o ON o.name = s.org_name
 WHERE NOT EXISTS (
     SELECT 1 FROM core.customers c
      WHERE c.organization_id = o.org_id AND c.display_name = s.display_name
 );

-- Vehicles. `make` is resolved to its id by name — the whole reason migration
-- 004 normalised it — and `model` is left NULL here, which is legal and is the
-- case a LEFT JOIN on vehicle_models must survive.
WITH v AS (
    SELECT * FROM (VALUES
        ('Kwame Mensah',  'GR 4821-22', 'Toyota',        2018, 'petrol', 'automatic',  84500, 'Silver', 'JHMCM56557C404453'),
        ('Kwame Mensah',  'GT 1190-19', 'Nissan',        2015, 'diesel', 'manual',    162300, 'White',  NULL),
        ('Adjoa Boateng', 'GW 7745-21', 'Hyundai',       2020, 'petrol', 'automatic',  41200, 'Blue',   'KMHD35LE8EU123456'),
        -- Tenant B's vehicle. Must NEVER appear on a Tenant A screen.
        ('Yaw Darko',     'AS 3312-20', 'Mercedes-Benz', 2019, 'diesel', 'automatic',  73900, 'Black',  NULL)
    ) AS s(customer_name, registration_number, make_name, model_year, fuel_type, transmission_type, mileage, colour, vin)
)
INSERT INTO core.vehicles
    (tenant_id, organization_id, customer_id, registration_number, make_id,
     model_year, fuel_type, transmission_type, current_mileage_km, colour, vin)
SELECT c.tenant_id, c.organization_id, c.id, v.registration_number, mk.id,
       v.model_year, v.fuel_type, v.transmission_type, v.mileage, v.colour, v.vin
  FROM v
  JOIN core.customers    c  ON c.display_name = v.customer_name
  JOIN core.vehicle_makes mk ON lower(mk.name) = lower(v.make_name)
 WHERE NOT EXISTS (
     SELECT 1 FROM core.vehicles ev
      WHERE ev.tenant_id = c.tenant_id
        AND upper(ev.registration_number) = upper(v.registration_number)
 );

COMMIT;
SQL

# ── link a customer record to a real platform account ───────────────────────
#
# `core.customers.user_id` is NULLABLE by design — a walk-in customer must be
# recordable without an account. But it is also the predicate the ENTIRE
# customer-facing side rests on: `CustomerService` and `VehicleService` narrow a
# viewer whose role is `customer` to rows where `user_id` matches them
# (`01 (1).txt` §19, "Vehicle owners shall see only vehicles they own").
#
# With every seeded row leaving `user_id` NULL, that predicate matched NOTHING
# and the narrowing had never once been exercised against real data — a signed-in
# customer would have seen an empty garage, and the isolation would have looked
# like it worked for the wrong reason. So: if the customer dev identity exists,
# link it to Kwame Mensah, who has two vehicles and is not the only customer.
# That makes the garage a real test — 2 of the tenant's 4 vehicles.
if psql_run -tAc "SELECT 1 FROM identity.users WHERE email = 'customer@autoworkshop.local'" | grep -q 1; then
  echo "==> linking customer@autoworkshop.local to a customer record"
  # Scoped through the account's OWN MEMBERSHIP, not by name alone.
  #
  # Codex P1, accepted: `display_name` is not unique. Matching on it would link
  # the dev account to every customer row sharing that name — including rows in
  # another tenant, which this script deliberately creates. Since `user_id` IS
  # the ownership predicate the garage relies on, a sloppy link would silently
  # widen what the customer sees and the isolation test would then be proving
  # nothing. Joining through `identity.memberships` confines the update to the
  # one tenant and organisation the account actually belongs to.
  psql_run -q <<'SQL'
UPDATE core.customers c
   SET user_id = u.id
  FROM identity.users u
  JOIN identity.memberships m ON m.user_id = u.id AND m.status = 'active'
 WHERE u.email = 'customer@autoworkshop.local'
   AND c.tenant_id       = m.tenant_id
   AND c.organization_id = m.organization_id
   AND c.display_name    = 'Kwame Mensah'
   AND c.user_id IS DISTINCT FROM u.id;
SQL

  # A link that matched more than one customer would make the garage look
  # correct while proving nothing, so it is asserted rather than assumed.
  linked="$(psql_run -tAc "SELECT count(*) FROM core.customers c JOIN identity.users u ON u.id = c.user_id WHERE u.email = 'customer@autoworkshop.local'" | tr -d '[:space:]')"
  if [ "$linked" != "1" ]; then
    echo "ERROR: expected exactly 1 customer linked to the dev account, found $linked." >&2
    echo "       The garage's owner-scoping test is only meaningful with exactly one." >&2
    exit 1
  fi
else
  echo "==> no customer dev identity yet — run:"
  echo "    DEV_USER_ROLE=customer DEV_USER_EMAIL=customer@autoworkshop.local \\"
  echo "      bash scripts/seed-dev-identity.sh   # then re-run this script"
fi

# Insurance dates, RELATIVE TO TODAY rather than fixed.
#
# The customer dashboard computes lapsed / due-soon / in-date from these, so
# hardcoded dates would silently stop exercising those branches the moment they
# aged past — the fixture would keep passing while testing only one outcome.
# CURRENT_DATE arithmetic keeps one vehicle lapsed and one in date forever.
psql_run -q <<'SQL'
UPDATE core.vehicles SET insurer_name = 'Star Assurance',
       insurance_expires_on = CURRENT_DATE - 30
 WHERE upper(registration_number) = 'GR 4821-22';
UPDATE core.vehicles SET insurer_name = 'Enterprise Insurance',
       insurance_expires_on = CURRENT_DATE + 15
 WHERE upper(registration_number) = 'GT 1190-19';
SQL

echo "==> verifying"
psql_run -c "
SELECT t.name AS tenant, c.display_name AS customer, count(v.id) AS vehicles
  FROM core.customers c
  JOIN identity.tenants t ON t.id = c.tenant_id
  LEFT JOIN core.vehicles v ON v.customer_id = c.id
 GROUP BY t.name, c.display_name
 ORDER BY t.name, c.display_name;"

echo "==> done. Signed in to Tenant A, the screens must show ONLY the Tenant A rows."

# ── slice 6: a letterhead and a labour rate, so documents render as documents ──
#
# A repair proposal is a COMMERCIAL DOCUMENT that leaves the building. Without a
# business identity behind it, the customer-facing page renders a name and a column of
# blank lines — technically correct and useless to look at, which is the worst way to
# review a document layout. Without a labour rate every generated labour line is priced
# at zero and submission is refused, so the quotation screen cannot be exercised either.
#
# Idempotent. Applied to workshop organisations only — a parts supplier is not issuing
# repair proposals.
echo "==> dev letterhead + pricing (slice 6)"
psql_run -q <<'SQL'
INSERT INTO core.organization_profile
  (organization_id, tenant_id, legal_name, trading_name, address, city, country,
   phone, email, website, tax_identification_number, vat_registration_number, document_footer)
SELECT o.id, o.tenant_id, o.name || ' Limited', o.name,
       'Plot 14, Spintex Road' || chr(10) || 'Baatsona', 'Accra', 'Ghana',
       '+233 30 123 4567', 'service@' || lower(replace(o.name,' ','')) || '.example',
       'www.' || lower(replace(o.name,' ','')) || '.example',
       'C0012345678', 'VAT-GH-004521',
       'Payment due on collection. Bank: Example Bank Ghana, Acct 1234567890.' || chr(10) ||
       'Registered in Ghana. All work carried out subject to our standard terms of business.'
  FROM identity.organizations o
 WHERE o.org_type IN ('individual_workshop','multi_branch_workshop')
ON CONFLICT (organization_id) DO UPDATE
  SET trading_name = EXCLUDED.trading_name, address = EXCLUDED.address,
      city = EXCLUDED.city, country = EXCLUDED.country, phone = EXCLUDED.phone,
      email = EXCLUDED.email, tax_identification_number = EXCLUDED.tax_identification_number,
      vat_registration_number = EXCLUDED.vat_registration_number,
      document_footer = EXCLUDED.document_footer;

INSERT INTO repair.organization_pricing
  (organization_id, tenant_id, currency, default_labour_rate, tax_name, tax_rate_percent,
   default_validity_days, default_warranty_terms)
SELECT o.id, o.tenant_id, 'GHS', 120.00, 'VAT', 15.000, 14,
       '12 months or 20,000 km on parts supplied and labour carried out, whichever comes first.'
  FROM identity.organizations o
 WHERE o.org_type IN ('individual_workshop','multi_branch_workshop')
ON CONFLICT (organization_id) DO UPDATE
  SET default_labour_rate = EXCLUDED.default_labour_rate,
      tax_rate_percent = EXCLUDED.tax_rate_percent,
      default_warranty_terms = EXCLUDED.default_warranty_terms;
SQL
