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

echo "==> seeding catalogue.suppliers, part_categories, parts, part_fitments"

# ⚠️ ONE TRANSACTION, AND THAT IS LOAD-BEARING. `set_config(...,true)` is
# transaction-local, and migration 021's admin_write policy reads it. Without
# the explicit BEGIN each statement would be its own transaction, the setting
# would be gone by the next one, and every INSERT would be silently refused by
# RLS — zero rows, exit code 0. That exact failure is why CLAUDE.md's schema
# rules call it out.
psql_run -q <<'SQL'
BEGIN;
SELECT set_config('app.current_role', 'admin', true);

INSERT INTO catalogue.part_categories (slug, name, display_order) VALUES
  ('brakes',       'Brakes',                10),
  ('filters',      'Filters',               20),
  ('engine',       'Engine & Timing',       30),
  ('suspension',   'Suspension & Steering', 40),
  ('electrical',   'Electrical & Batteries',50),
  ('cooling',      'Cooling',               60),
  ('transmission', 'Transmission & Clutch', 70),
  ('body',         'Body & Lighting',       80)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;

INSERT INTO catalogue.suppliers (slug, name, country, city, website, is_verified, is_published) VALUES
  ('accra-auto-spares',      'Accra Auto Spares',       'Ghana',       'Accra',      'www.accraautospares.example',   TRUE,  TRUE),
  ('tema-motor-factors',     'Tema Motor Factors',      'Ghana',       'Tema',       'www.temamotorfactors.example',  TRUE,  TRUE),
  ('kumasi-spares',          'Kumasi Spares Ltd',       'Ghana',       'Kumasi',     'www.kumasispares.example',      TRUE,  TRUE),
  ('euro-parts-direct',      'Euro Parts Direct',       'Germany',     'Hamburg',    'www.europartsdirect.example',   TRUE,  TRUE),
  ('gulf-auto-supply',       'Gulf Auto Supply',        'UAE',         'Dubai',      'www.gulfautosupply.example',    FALSE, TRUE),
  -- Deliberately unpublished. See the header note: this supplier and its parts
  -- must not appear on the public page, and that absence is the test.
  ('draft-supplier',         'Draft Supplier (unlisted)','Ghana',      'Takoradi',   NULL,                            FALSE, FALSE)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, country = EXCLUDED.country, city = EXCLUDED.city,
      website = EXCLUDED.website, is_verified = EXCLUDED.is_verified,
      is_published = EXCLUDED.is_published, updated_at = now();
COMMIT;
SQL

# Parts are inserted separately so the supplier/category lookups read cleanly.
psql_run -q <<'SQL'
BEGIN;
SELECT set_config('app.current_role', 'admin', true);

WITH s AS (SELECT slug, id FROM catalogue.suppliers),
     c AS (SELECT slug, id FROM catalogue.part_categories),
     incoming (supplier_slug, category_slug, part_number, name, brand, description, price, in_stock, is_published) AS (VALUES
  ('accra-auto-spares','brakes',      'BRK-1042','Front Brake Pad Set',            'Bosch',     'Ceramic front pads, low dust, includes wear sensor.',            420.00, TRUE,  TRUE),
  ('accra-auto-spares','brakes',      'BRK-2210','Front Brake Disc (Vented, 280mm)','ATE',      'Vented front disc, sold individually.',                          380.00, TRUE,  TRUE),
  ('accra-auto-spares','filters',     'FLT-0091','Engine Oil Filter',              'MANN',      'Spin-on oil filter with anti-drainback valve.',                   85.00, TRUE,  TRUE),
  ('accra-auto-spares','electrical',  'ELC-5501','12V 60Ah Battery',               'Exide',     'Maintenance-free calcium battery, 540A cold cranking.',          950.00, TRUE,  TRUE),
  ('tema-motor-factors',    'filters',     'FLT-0142','Cabin Pollen Filter',            'Bosch',     'Activated carbon cabin filter.',                                 140.00, TRUE,  TRUE),
  ('tema-motor-factors',    'filters',     'FLT-0310','Air Filter Element',             'MANN',      'Panel air filter element.',                                      110.00, TRUE,  TRUE),
  ('tema-motor-factors',    'engine',      'ENG-7720','Timing Belt Kit',                'Gates',     'Belt, tensioner and idler pulley kit.',                          890.00, TRUE,  TRUE),
  ('tema-motor-factors',    'cooling',     'COL-3300','Radiator Assembly',              'Nissens',   'Aluminium core radiator with plastic tanks.',                   1250.00, FALSE, TRUE),
  ('kumasi-spares',         'suspension',  'SUS-4410','Front Shock Absorber (Gas)',     'KYB',       'Gas-charged front shock absorber, sold individually.',           610.00, TRUE,  TRUE),
  ('kumasi-spares',         'suspension',  'SUS-4488','Lower Control Arm (Left)',       'Lemforder', 'Front lower control arm with integrated ball joint.',             780.00, TRUE,  TRUE),
  ('kumasi-spares',         'brakes',      'BRK-3120','Rear Brake Shoe Set',            'TRW',       'Rear drum brake shoe set with fitting kit.',                     320.00, TRUE,  TRUE),
  ('kumasi-spares',         'transmission','TRN-9001','Clutch Kit (3-piece)',           'LuK',       'Cover, plate and release bearing.',                             1850.00, TRUE,  TRUE),
  ('euro-parts-direct',     'engine',      'ENG-7801','Spark Plug (Iridium)',           'NGK',       'Iridium spark plug, long-life. Price per plug.',                  95.00, TRUE,  TRUE),
  ('euro-parts-direct',     'electrical',  'ELC-5610','Alternator 90A',                 'Valeo',     'Remanufactured 90A alternator, exchange unit.',                 2100.00, TRUE,  TRUE),
  ('euro-parts-direct',     'body',        'BDY-2201','Headlamp Assembly (Right)',      'Depo',      'Right-hand headlamp assembly, halogen.',                        1400.00, TRUE,  TRUE),
  ('euro-parts-direct',     'cooling',     'COL-3390','Water Pump',                     'SKF',       'Water pump with gasket.',                                        540.00, TRUE,  TRUE),
  -- Quote-only: NULL price is legal (migration 021 allows it) and the card must
  -- say "Price on request" rather than rendering an empty cell or a zero.
  ('gulf-auto-supply',      'engine',      'ENG-8100','Cylinder Head (Reconditioned)',  'OEM',       'Reconditioned cylinder head, exchange. Price on application.',    NULL, TRUE,  TRUE),
  ('gulf-auto-supply',      'transmission','TRN-9110','Automatic Gearbox Oil (4L)',     'Castrol',   'ATF for automatic transmissions, 4 litre.',                      330.00, TRUE,  TRUE),
  -- Unpublished part belonging to a PUBLISHED supplier — checks that the part
  -- gate is independent of the supplier gate.
  ('tema-motor-factors',    'brakes',      'BRK-9999','Draft Part (unlisted)',          'Draft',     'Not ready for publication.',                                     100.00, TRUE,  FALSE),
  -- Published part belonging to an UNPUBLISHED supplier — checks the reverse.
  ('draft-supplier',        'filters',     'FLT-9999','Orphan Part (supplier unlisted)','Draft',     'Supplier not published.',                                        100.00, TRUE,  TRUE)
)
INSERT INTO catalogue.parts (supplier_id, category_id, part_number, name, brand, description, price, currency, in_stock, is_published)
SELECT s.id, c.id, i.part_number, i.name, i.brand, i.description, i.price, 'GHS', i.in_stock, i.is_published
  FROM incoming i
  JOIN s ON s.slug = i.supplier_slug
  JOIN c ON c.slug = i.category_slug
ON CONFLICT (supplier_id, part_number) DO UPDATE
  SET name = EXCLUDED.name, brand = EXCLUDED.brand, description = EXCLUDED.description,
      price = EXCLUDED.price, currency = EXCLUDED.currency, in_stock = EXCLUDED.in_stock,
      is_published = EXCLUDED.is_published, updated_at = now();
COMMIT;
SQL

echo "==> seeding catalogue.part_fitments"

# Fitments drive the make/model/year search. The model dropdown on the landing
# page is derived FROM THIS TABLE rather than from core.vehicle_models — which
# is empty — so the page can never offer a model that returns nothing.
psql_run -q <<'SQL'
BEGIN;
SELECT set_config('app.current_role', 'admin', true);

WITH p AS (SELECT pt.id, pt.part_number, s.slug AS supplier_slug
             FROM catalogue.parts pt JOIN catalogue.suppliers s ON s.id = pt.supplier_id),
     incoming (part_number, make, model, year_from, year_to) AS (VALUES
  ('BRK-1042','Toyota','Corolla',      2014, 2019),
  ('BRK-1042','Toyota','Camry',        2012, 2017),
  ('BRK-1042','Honda', 'Civic',        2016, NULL),
  ('BRK-2210','Toyota','Corolla',      2014, 2019),
  ('BRK-2210','Nissan','Sentra',       2013, 2019),
  ('BRK-3120','Toyota','Hilux',        2011, 2015),
  ('BRK-3120','Nissan','Navara',       2010, 2016),
  ('FLT-0091','Toyota','Corolla',      2009, NULL),
  ('FLT-0091','Toyota','Camry',        2010, NULL),
  ('FLT-0091','Honda', 'Accord',       2012, 2020),
  ('FLT-0142','Toyota','Corolla',      2014, 2019),
  ('FLT-0142','Hyundai','Elantra',     2015, 2020),
  ('FLT-0310','Nissan','Sentra',       2013, 2019),
  ('FLT-0310','Kia',   'Rio',          2012, 2017),
  ('ENG-7720','Ford',  'Focus',        2011, 2018),
  ('ENG-7720','Hyundai','Elantra',     2011, 2016),
  ('ENG-7801','Toyota','Corolla',      2014, 2019),
  ('ENG-7801','Honda', 'Civic',        2016, NULL),
  ('ENG-7801','Kia',   'Rio',          2012, 2017),
  ('ENG-8100','Toyota','Hilux',        2011, 2015),
  ('COL-3300','Ford',  'Focus',        2011, 2018),
  ('COL-3390','Ford',  'Focus',        2011, 2018),
  ('COL-3390','Mazda', 'Mazda3',       2010, 2016),
  ('SUS-4410','Toyota','Hilux',        2011, 2015),
  ('SUS-4410','Mitsubishi','L200',     2010, 2015),
  ('SUS-4488','Hyundai','Elantra',     2015, 2020),
  ('TRN-9001','Ford',  'Focus',        2011, 2018),
  ('TRN-9001','Nissan','Sentra',       2013, 2019),
  ('TRN-9110','Toyota','Camry',        2012, 2017),
  ('ELC-5501','Toyota','Corolla',      2009, NULL),
  ('ELC-5501','Nissan','Navara',       2010, 2016),
  ('ELC-5501','Hyundai','Elantra',     2011, 2020),
  ('ELC-5610','Toyota','Camry',        2012, 2017),
  ('ELC-5610','Honda', 'Accord',       2012, 2020),
  ('BDY-2201','Toyota','Corolla',      2014, 2019),
  ('BDY-2201','Kia',   'Rio',          2012, 2017)
)
INSERT INTO catalogue.part_fitments (part_id, make, model, year_from, year_to)
SELECT p.id, i.make, i.model, i.year_from, i.year_to
  FROM incoming i JOIN p ON p.part_number = i.part_number
ON CONFLICT (part_id, make, model, year_from) DO UPDATE
  SET year_to = EXCLUDED.year_to;
COMMIT;
SQL

echo "==> seeding catalogue.mechanic_directory"

# Published from the workshops that already exist. Consented fields ONLY — see
# migration 021's header for why this is a copy and not a view over
# core.organization_profile.
psql_run -q <<'SQL'
BEGIN;
SELECT set_config('app.current_role', 'admin', true);

INSERT INTO catalogue.mechanic_directory
  (organization_id, trading_name, city, country, public_phone, services, specialisms, is_published)
SELECT o.id,
       o.name,
       COALESCE(p.city, 'Accra'),
       COALESCE(p.country, 'Ghana'),
       COALESCE(p.phone, '+233 30 000 0000'),
       ARRAY['Diagnostics','Servicing','Brakes','Suspension','Air conditioning'],
       ARRAY['Toyota','Nissan','Hyundai'],
       TRUE
  FROM identity.organizations o
  LEFT JOIN core.organization_profile p ON p.organization_id = o.id
 WHERE o.org_type IN ('individual_workshop','multi_branch_workshop')
ON CONFLICT (organization_id) DO UPDATE
  SET trading_name = EXCLUDED.trading_name, city = EXCLUDED.city,
      country = EXCLUDED.country, public_phone = EXCLUDED.public_phone,
      services = EXCLUDED.services, specialisms = EXCLUDED.specialisms,
      is_published = EXCLUDED.is_published, updated_at = now();
COMMIT;
SQL

echo "==> catalogue seeded"
psql_run -tAc "SELECT 'suppliers published: ' || count(*) FILTER (WHERE is_published) || ' of ' || count(*) FROM catalogue.suppliers;"
psql_run -tAc "SELECT 'parts published: '     || count(*) FILTER (WHERE is_published) || ' of ' || count(*) FROM catalogue.parts;"
psql_run -tAc "SELECT 'fitments: '            || count(*) FROM catalogue.part_fitments;"
psql_run -tAc "SELECT 'mechanics published: ' || count(*) FILTER (WHERE is_published) || ' of ' || count(*) FROM catalogue.mechanic_directory;"
