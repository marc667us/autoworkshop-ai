-- Sample population: 10 workshops, 10 suppliers, 20 customers.
--
-- ══════════════════════════════════════════════════════════════════════════
-- Owner, 2026-08-11: "use 20 customers and 10 workshops and 10 suppliers as
-- sample data to test all features and functionalities of the live web app" and
-- "leave sample data in the app for me check".
--
-- 🔴 IT GOES THROUGH THE REAL REGISTRATION FUNCTIONS, NOT INSERTS.
-- `identity.register_workshop`, `identity.register_supplier` and
-- `identity.enrol_as_customer` are the paths the product uses. Seeding rows
-- directly would produce a database that looks right and proves nothing — and
-- this repository has caught four roles that could not be created through any
-- production path at all (`customer`, `supplier_owner`, `fleet_administrator`,
-- and the insurance self-service door that is still missing). Using the real
-- doors means this seeder FAILS if a door is broken, which is the point.
--
-- ⚠️ WHERE THE OWNER WILL ACTUALLY SEE EACH GROUP — read this before expecting
-- twenty new rows in one screen.
--
--   · 20 CUSTOMERS land inside the OWNER'S OWN organisation, resolved from
--     :owner_email. They appear in the customer book, and their vehicles with
--     them. Seeding them into a fresh tenant would make a beautiful demo the
--     owner cannot see.
--   · 10 WORKSHOPS and 10 SUPPLIERS are SEPARATE ORGANISATIONS, because that is
--     what a workshop and a supplier ARE. RLS means the owner will NOT see them
--     from inside their own workshop, and that is correct behaviour, not a bug.
--     They are visible through the platform-administration directory (which the
--     owner can reach since migration 078 gave their grant real API authority)
--     and, for suppliers with published parts, the public marketplace.
--
-- ⚠️ THESE ACCOUNTS CANNOT SIGN IN, AND THE NAMES SAY SO. Each demo owner is an
-- application user created from a synthetic subject; no Keycloak account backs
-- it. Creating 20 real Keycloak users is a different job with a different risk,
-- and pretending these are sign-in-able would be the more expensive lie. Every
-- organisation carries the tag in its NAME so the owner can tell sample data
-- from real data at a glance, which is the whole reason they asked to keep it.
--
-- IDEMPOTENT. `register_workshop` raises 'this account already belongs to an
-- organisation' on a second run, so every subject is checked first and skipped
-- if it is already placed. Re-running adds only what is missing.
--
-- Parameters (psql -v):
--   owner_email  — whose organisation the 20 customers join
--   tag          — written into every organisation and customer name
--   apply        — 'APPLY' to write; anything else counts and writes nothing
-- ══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

BEGIN;

-- 🔴 THE PARAMETERS ARE PASSED AS SETTINGS, NOT AS psql VARIABLES.
--
-- A dollar-quoted block is OPAQUE to psql substitution: `:'apply'` inside
-- `DO $seed$ ... $seed$` is not replaced, and PostgreSQL fails on the literal
-- colon. This is a recorded trap in this repository — a guard once read
-- settings nothing had set and could never have passed — and it cost a run
-- here too before this comment existed.
--
-- `set_config(..., false)` = session-scoped, so the DO block below and the
-- read-back at the bottom both see the same values.
SELECT set_config('seed.apply',       :'apply',       false),
       set_config('seed.tag',         :'tag',         false),
       set_config('seed.owner_email', :'owner_email', false);

DO $seed$
DECLARE
    v_apply       boolean := (current_setting('seed.apply') = 'APPLY');
    v_tag         text    := current_setting('seed.tag');
    v_owner_email text    := current_setting('seed.owner_email');
    v_owner_org   uuid;
    v_owner_ten   uuid;
    v_subject     text;
    v_org         uuid;
    v_cust        uuid;
    v_make        uuid;
    v_model       uuid;
    i             int;
    made_ws       int := 0;
    made_sup      int := 0;
    made_cust     int := 0;
    skipped       int := 0;

    ws_names  text[] := ARRAY[
      'Accra Precision Motors','Tema Harbour Auto','Kumasi Drive Line','Takoradi Torque',
      'East Legon Autocare','Spintex Service Point','Achimota Gearworks','Madina Motor Clinic',
      'Cape Coast Auto Hub','Tamale Trans Repair'];
    sup_names text[] := ARRAY[
      'Ring Road Parts Depot','Suame Magazine Supplies','Kaneshie Auto Spares','Tema Filters Direct',
      'Adum Brake Systems','Odorkor Lubricants','Weija Electrical Auto','Ashaiman Tyre House',
      'Dansoman Bearings','Nima Genuine Parts'];
    cust_names text[] := ARRAY[
      'Kofi Mensah','Ama Owusu','Yaw Boateng','Akosua Darko','Kwame Asante','Efua Amoah',
      'Kojo Nyarko','Abena Sarpong','Kwesi Appiah','Adjoa Frimpong','Yaa Adjei','Fiifi Quansah',
      'Esi Bediako','Nana Ofori','Akua Tetteh','Kwabena Larbi','Afia Danso','Kojo Baffour',
      'Adwoa Aryee','Kwaku Mensa'];
BEGIN
    -- The platform-admin escape, asserted rather than assumed. Every table here
    -- is FORCE RLS and the seeding role does not bypass it in production, so
    -- without this the counts below would be a confident zero over invisible
    -- rows. Since 077 the escape also requires table ownership, which a seed
    -- connection running as the owner has.
    PERFORM set_config('app.current_role', 'admin', true);
    IF NOT identity.is_platform_admin() THEN
        RAISE EXCEPTION 'seed: the platform-admin escape is not live; this run '
                        'would read and write into a database it cannot see.';
    END IF;

    -- ── The owner's own organisation, RESOLVED, never assumed ──────────────
    SELECT m.organization_id, m.tenant_id INTO v_owner_org, v_owner_ten
      FROM identity.users u
      JOIN identity.memberships m ON m.user_id = u.id AND m.status = 'active'
     WHERE lower(u.email) = lower(v_owner_email)
     ORDER BY CASE WHEN m.role_name = 'workshop_owner' THEN 0 ELSE 1 END
     LIMIT 1;

    IF v_owner_org IS NULL THEN
        RAISE EXCEPTION 'seed: % holds no active membership, so there is no '
                        'organisation for the 20 customers to join. Register a '
                        'workshop for that account first.', v_owner_email;
    END IF;

    RAISE NOTICE 'owner organisation resolved: % (tenant %)', v_owner_org, v_owner_ten;

    -- ── 10 workshops ──────────────────────────────────────────────────────
    FOR i IN 1..10 LOOP
        v_subject := format('demo-workshop-%s-%s', lpad(i::text, 2, '0'), v_tag);

        IF EXISTS (SELECT 1 FROM identity.users u
                    JOIN identity.memberships m ON m.user_id = u.id
                   WHERE u.keycloak_subject = v_subject) THEN
            skipped := skipped + 1;
            CONTINUE;
        END IF;

        IF v_apply THEN
            PERFORM identity.provision_user_from_subject(
                v_subject,
                format('demo-workshop-%s@aiappinvent.com', lpad(i::text, 2, '0')),
                format('%s (owner)', ws_names[i]));
            PERFORM identity.register_workshop(
                v_subject,
                format('%s [%s]', ws_names[i], v_tag),
                'Main branch');
        END IF;
        made_ws := made_ws + 1;
    END LOOP;

    -- ── 10 suppliers ──────────────────────────────────────────────────────
    FOR i IN 1..10 LOOP
        v_subject := format('demo-supplier-%s-%s', lpad(i::text, 2, '0'), v_tag);

        IF EXISTS (SELECT 1 FROM identity.users u
                    JOIN identity.memberships m ON m.user_id = u.id
                   WHERE u.keycloak_subject = v_subject) THEN
            skipped := skipped + 1;
            CONTINUE;
        END IF;

        IF v_apply THEN
            PERFORM identity.provision_user_from_subject(
                v_subject,
                format('demo-supplier-%s@aiappinvent.com', lpad(i::text, 2, '0')),
                format('%s (owner)', sup_names[i]));
            PERFORM identity.register_supplier(
                v_subject,
                format('%s [%s]', sup_names[i], v_tag),
                'Main depot');
        END IF;
        made_sup := made_sup + 1;
    END LOOP;

    -- ── 20 customers, INSIDE the owner's organisation ─────────────────────
    --
    -- `enrol_as_customer` writes the membership; `core.customers` is the
    -- customer RECORD the workshop's screens read. Both are needed: the first
    -- is who they are, the second is what the workshop knows about them.
    SELECT id INTO v_make FROM core.vehicle_makes ORDER BY name LIMIT 1;
    SELECT id INTO v_model FROM core.vehicle_models WHERE make_id = v_make LIMIT 1;

    IF v_make IS NULL THEN
        RAISE EXCEPTION 'seed: no vehicle make exists, so no vehicle can be '
                        'created. Run the catalogue seed first.';
    END IF;

    FOR i IN 1..20 LOOP
        v_subject := format('demo-customer-%s-%s', lpad(i::text, 2, '0'), v_tag);

        IF EXISTS (SELECT 1 FROM core.customers
                    WHERE organization_id = v_owner_org
                      AND display_name = format('%s [%s]', cust_names[i], v_tag)) THEN
            skipped := skipped + 1;
            CONTINUE;
        END IF;

        IF v_apply THEN
            PERFORM identity.provision_user_from_subject(
                v_subject,
                format('demo-customer-%s@aiappinvent.com', lpad(i::text, 2, '0')),
                cust_names[i]);
            PERFORM identity.enrol_as_customer(v_subject, v_owner_org);

            INSERT INTO core.customers
                (tenant_id, organization_id, user_id, customer_type, display_name,
                 email, phone, status, notes)
            VALUES
                (v_owner_ten, v_owner_org,
                 (SELECT id FROM identity.users WHERE keycloak_subject = v_subject),
                 'individual',
                 format('%s [%s]', cust_names[i], v_tag),
                 format('demo-customer-%s@aiappinvent.com', lpad(i::text, 2, '0')),
                 format('+2332%s000%s', lpad(i::text, 2, '0'), lpad(i::text, 2, '0')),
                 'active',
                 format('Sample data %s — safe to delete', v_tag))
            RETURNING id INTO v_cust;

            -- One vehicle each, so the garage and job-card screens have
            -- something to show. A customer with no vehicle exercises nothing.
            INSERT INTO core.vehicles
                (tenant_id, organization_id, customer_id, registration_number,
                 make_id, model_id, model_year, current_mileage_km, colour, status)
            VALUES
                (v_owner_ten, v_owner_org, v_cust,
                 format('GS %s-%s', lpad((1000 + i)::text, 4, '0'), '22'),
                 v_make, v_model, 2016 + (i % 8), 40000 + (i * 1500),
                 (ARRAY['Silver','Black','White','Blue','Red'])[1 + (i % 5)],
                 'active');
        END IF;
        made_cust := made_cust + 1;
    END LOOP;

    RAISE NOTICE '─────────────────────────────────────────────────────────';
    IF v_apply THEN
        RAISE NOTICE 'SEEDED   workshops % · suppliers % · customers % · skipped (already present) %',
                     made_ws, made_sup, made_cust, skipped;
    ELSE
        RAISE NOTICE 'DRY RUN — would create: workshops % · suppliers % · customers % · skip %',
                     made_ws, made_sup, made_cust, skipped;
        RAISE NOTICE 'Nothing was written. Re-run with apply=APPLY.';
    END IF;
    RAISE NOTICE '─────────────────────────────────────────────────────────';
END;
$seed$;

-- ── Read it back, in the same run, so the result is visible ───────────────
--
-- 🔴 THE READ-BACK IS NOT GATED ON `apply`. On 2026-08-10 a seeder wrote five
-- journeys correctly and went red on its own verification, and because both the
-- write and the read were gated on the same APPLY, the only run that could ever
-- print the result was the run that wrote it — and that run's query was broken.
-- The data landed and nobody could see it, with no way to ask again.
-- ⚠️ `set_config`, NOT `SET LOCAL app.current_role`. `current_role` is a
-- RESERVED KEYWORD in PostgreSQL and the SET LOCAL form is a syntax error —
-- `tenant-context.ts` records the same finding against a live database. The
-- DO block above set it transaction-locally; this re-states it for the
-- read-back, which runs as a separate statement.
SELECT set_config('app.current_role', 'admin', true);

SELECT 'workshops' AS group, count(*) AS rows
  FROM identity.organizations WHERE name LIKE '%[' || :'tag' || ']%' AND org_type LIKE '%workshop%'
UNION ALL
SELECT 'suppliers', count(*)
  FROM identity.organizations WHERE name LIKE '%[' || :'tag' || ']%' AND org_type = 'parts_supplier'
UNION ALL
SELECT 'customers (owner org)', count(*)
  FROM core.customers WHERE display_name LIKE '%[' || :'tag' || ']%'
UNION ALL
SELECT 'their vehicles', count(*)
  FROM core.vehicles v JOIN core.customers c ON c.id = v.customer_id
 WHERE c.display_name LIKE '%[' || :'tag' || ']%';

COMMIT;
