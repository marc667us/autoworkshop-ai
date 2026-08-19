-- verify/087 — the fleet↔workshop boundary, proven from THREE directions
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 CHECKS 3, 4 AND 5 ARE THE WHOLE POINT. Everything before them is fixture.
--
-- `fleet.service_requests` is the only table in this database that two
-- DIFFERENT TENANTS both read, and its workshop-side policy is the only RLS
-- predicate in the product that is organisation-scoped WITHOUT a tenant match.
-- That exception is deliberate (ADR-023 §4) and it is the single most
-- security-sensitive line in the slice, so it is tested in both directions AND
-- against an unrelated third party:
--
--   3. the FLEET sees its own request
--   4. the WORKSHOP sees the SAME row — the cross-tenant read that is the
--      entire reason this table exists
--   5. a THIRD organisation, party to neither, sees NOTHING
--
-- A test that only proves 3 and 4 would pass just as happily if the policy were
-- `USING (true)`. Check 5 is what discriminates.
--
-- ⚠️ EVERY ASSERTION RUNS AS `autoworkshop_app`. On this workstation the owner
-- is `rolsuper = t, rolbypassrls = t`, so an assertion made as the owner proves
-- nothing about Render — a trap this repository has paid for four times, and
-- once inside migration 086 this same week.
--
-- ── WHAT THIS FILE CANNOT ESTABLISH ───────────────────────────────────────
--
-- Which PARTY may change which COLUMN. Column privileges are granted to a ROLE,
-- not per-policy, so both parties hold the same column grant and the split is
-- enforced in the service layer. Stated here rather than left to be discovered.
-- ▶ That half lives in `apps/api/src/fleet/fleet.integration.spec.ts`.
-- ══════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
    v_sub_f     TEXT := 'verify-087-f-' || replace(gen_random_uuid()::text, '-', '');
    v_user_f    uuid;
    v_user_w    uuid;
    rf          record;          -- the fleet, from the PRODUCTION function
    v_ws_ten    uuid;            -- an independent workshop, its own tenant
    v_ws_org    uuid;
    v_ws_dir    uuid;            -- its PUBLIC directory row
    v_third_ten uuid;            -- a third party to neither side
    v_third_org uuid;
    v_cust      uuid;
    v_vehicle   uuid;
    v_make      uuid;
    v_req       uuid;
    n           int;
    v_refused   boolean;
    v_forced    boolean;
    passed      int := 0;
BEGIN
    PERFORM set_config('app.current_role', 'admin', true);

    -- ── 0. both tables are FORCED, not merely ENABLED ─────────────────────
    -- `ENABLE` alone leaves the table OWNER exempt, so every isolation
    -- assertion below would be vacuous. Recorded 2026-08-18 in this account's
    -- other project, where `relforcerowsecurity` was false on all 18 tables.
    SELECT bool_and(relrowsecurity AND relforcerowsecurity) INTO v_forced
      FROM pg_class
     WHERE oid IN ('fleet.service_requests'::regclass, 'fleet.drivers'::regclass);
    IF NOT coalesce(v_forced, false) THEN
        RAISE EXCEPTION 'verify/087 #0: fleet tables are not both ENABLE and FORCE '
                        'row level security — every check below would be vacuous.';
    END IF;
    passed := passed + 1;

    -- ── 1. the fixture: a fleet, a workshop, a third party ────────────────
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), v_sub_f, v_sub_f || '@verify.local', 'Verify Fleet Admin', 'active')
    RETURNING id INTO v_user_f;

    -- The fleet comes from the PRODUCTION registration function. Ask of any
    -- green proof: could the PRODUCT have produced this fixture? Here it did.
    SELECT * INTO rf FROM identity.register_fleet(v_sub_f, 'Verify 087 Haulage', 'Main depot');

    -- An independent workshop, in its OWN tenant. That separation is the entire
    -- subject of this file — a workshop in the fleet's tenant would prove nothing.
    INSERT INTO identity.tenants (name, slug)
    VALUES ('verify-087-ws', 'verify-087-ws-' || replace(gen_random_uuid()::text,'-',''))
    RETURNING id INTO v_ws_ten;
    INSERT INTO identity.organizations (tenant_id, name, org_type, status)
    VALUES (v_ws_ten, 'Verify 087 Motors', 'individual_workshop', 'active')
    RETURNING id INTO v_ws_org;
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), 'verify-087-w-' || replace(gen_random_uuid()::text,'-',''),
            'verify-087-w@verify.local', 'Verify Workshop Owner', 'active')
    RETURNING id INTO v_user_w;

    -- 🔴 PUBLISHED. The trigger refuses an unpublished directory row (check 8),
    -- because a workshop that has withdrawn from the directory should not
    -- receive new requests.
    INSERT INTO catalogue.mechanic_directory
        (organization_id, trading_name, city, country, is_published)
    VALUES (v_ws_org, 'Verify 087 Motors', 'Accra', 'GH', true)
    RETURNING id INTO v_ws_dir;

    -- A third organisation, party to neither. Check 5 is why it exists.
    INSERT INTO identity.tenants (name, slug)
    VALUES ('verify-087-3rd', 'verify-087-3rd-' || replace(gen_random_uuid()::text,'-',''))
    RETURNING id INTO v_third_ten;
    INSERT INTO identity.organizations (tenant_id, name, org_type, status)
    VALUES (v_third_ten, 'Verify 087 Bystander', 'individual_workshop', 'active')
    RETURNING id INTO v_third_org;

    -- ── 2. the fleet's vehicle lives in core.vehicles (ADR-023 decision 1) ─
    -- ⚠️ AND IT NEEDS A CUSTOMER ROW, because `core.vehicles.customer_id` is
    -- NOT NULL. The fleet is its own customer of record — the cost ADR-023
    -- states rather than hides.
    INSERT INTO core.customers (tenant_id, organization_id, display_name)
    VALUES (rf.o_tenant_id, rf.o_organization_id, 'Verify 087 Haulage')
    RETURNING id INTO v_cust;

    SELECT id INTO v_make FROM core.vehicle_makes LIMIT 1;
    IF v_make IS NULL THEN
        INSERT INTO core.vehicle_makes (name) VALUES ('Verify 087 Make') RETURNING id INTO v_make;
    END IF;

    INSERT INTO core.vehicles
        (tenant_id, organization_id, customer_id, registration_number, make_id, status)
    VALUES (rf.o_tenant_id, rf.o_organization_id, v_cust, 'V087-FLEET-1', v_make, 'active')
    RETURNING id INTO v_vehicle;
    passed := passed + 1;

    -- ══════════════════════════════════════════════════════════════════════
    -- FROM HERE WE ARE THE APPLICATION ROLE. See the header.
    -- ══════════════════════════════════════════════════════════════════════
    PERFORM set_config('app.current_role', '', true);
    SET LOCAL ROLE autoworkshop_app;

    IF (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
        RAISE EXCEPTION 'verify/087: running as %, a SUPERUSER — RLS is bypassed '
                        'and every check below is vacuous.', current_user;
    END IF;

    -- ── 3. THE FLEET RAISES A REQUEST AND SEES IT ─────────────────────────
    PERFORM set_config('app.tenant_id',        rf.o_tenant_id::text,       true);
    PERFORM set_config('app.organization_ids', rf.o_organization_id::text, true);

    v_req := gen_random_uuid();
    INSERT INTO fleet.service_requests
        (id, reference, fleet_tenant_id, fleet_organization_id, vehicle_id,
         workshop_directory_id, workshop_organization_id, fleet_name, workshop_name,
         vehicle_registration, request_type, summary, status)
    VALUES (v_req, 'V087-' || substr(replace(v_req::text,'-',''),1,10),
            rf.o_tenant_id, rf.o_organization_id, v_vehicle,
            v_ws_dir,
            -- Deliberately WRONG here. The trigger overwrites it from the
            -- directory; check 6 proves that, and it is what makes the
            -- workshop-side predicate trustworthy.
            rf.o_organization_id,
            'Verify 087 Haulage', 'WRONG NAME',
            'V087-FLEET-1', 'service', 'Annual service, 40k km', 'submitted');

    SELECT count(*) INTO n FROM fleet.service_requests WHERE id = v_req;
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/087 #3: the fleet cannot read the request it just '
                        'raised — its own workspace would be permanently empty.';
    END IF;
    passed := passed + 1;

    -- ── 4. 🔴 THE WORKSHOP SEES THE SAME ROW, ACROSS THE TENANT BOUNDARY ──
    -- This is the cross-tenant read the whole slice exists to make possible.
    -- Note the tenant is the WORKSHOP's and does NOT match the row's
    -- `fleet_tenant_id` — that mismatch is the point.
    PERFORM set_config('app.tenant_id',        v_ws_ten::text, true);
    PERFORM set_config('app.organization_ids', v_ws_org::text, true);

    SELECT count(*) INTO n FROM fleet.service_requests WHERE id = v_req;
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/087 #4: the WORKSHOP cannot see the request addressed '
                        'to it. The contract is one-sided and the workshop would never '
                        'learn it had been asked to do anything.';
    END IF;

    -- And it can read the SNAPSHOTS — the fields that cross the boundary.
    SELECT count(*) INTO n FROM fleet.service_requests
     WHERE id = v_req AND vehicle_registration = 'V087-FLEET-1'
       AND fleet_name = 'Verify 087 Haulage';
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/087 #4: the workshop can see the row but not the '
                        'snapshots, so it cannot tell whose vehicle it is.';
    END IF;
    passed := passed + 1;

    -- ── 5. 🔴 A THIRD ORGANISATION SEES NOTHING ───────────────────────────
    -- The discriminator. Checks 3 and 4 would both pass under `USING (true)`.
    PERFORM set_config('app.tenant_id',        v_third_ten::text, true);
    PERFORM set_config('app.organization_ids', v_third_org::text, true);

    SELECT count(*) INTO n FROM fleet.service_requests WHERE id = v_req;
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/087 #5: an UNRELATED organisation can read a service '
                        'request between two other parties. The workshop-side policy '
                        'is not discriminating — it is the one predicate in the '
                        'product scoped by organisation with no tenant match, so it '
                        'is the first thing to re-read.';
    END IF;
    passed := passed + 1;

    -- ── 6. THE DISCLOSURE BOUNDARY: the workshop cannot reach the fleet ───
    -- 🔴 THE SNAPSHOTS EXIST SO THIS CAN BE TRUE. If a workshop could read the
    -- fleet's `core.vehicles` rows, the whole snapshot design would be
    -- pointless and the boundary would be a convention rather than a mechanism.
    PERFORM set_config('app.tenant_id',        v_ws_ten::text, true);
    PERFORM set_config('app.organization_ids', v_ws_org::text, true);

    SELECT count(*) INTO n FROM core.vehicles WHERE id = v_vehicle;
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/087 #6: the workshop can read the FLEET''s vehicle row '
                        'across the tenant boundary. It should only ever see the '
                        'snapshot on the request.';
    END IF;

    SELECT count(*) INTO n FROM fleet.drivers
     WHERE organization_id = rf.o_organization_id;
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/087 #6: the workshop can read the fleet''s drivers.';
    END IF;

    -- And the trigger overwrote the deliberately-wrong values from check 3.
    SELECT count(*) INTO n FROM fleet.service_requests
     WHERE id = v_req AND workshop_organization_id = v_ws_org
       AND workshop_name = 'Verify 087 Motors';
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/087 #6: trg_set_workshop_from_directory did not derive '
                        'workshop_organization_id and workshop_name from the directory. '
                        'The column the workshop-side RLS predicate reads is whatever '
                        'the caller supplied, so the boundary is caller-controlled.';
    END IF;
    passed := passed + 1;

    -- ── 7. A WORKSHOP CANNOT MANUFACTURE A REQUEST TO ITSELF ──────────────
    -- There is no INSERT policy for the workshop side, deliberately: a workshop
    -- inventing a request from a fleet that never asked is not a state the
    -- product should be able to represent.
    v_refused := false;
    BEGIN
        INSERT INTO fleet.service_requests
            (reference, fleet_tenant_id, fleet_organization_id, vehicle_id,
             workshop_directory_id, workshop_organization_id, fleet_name, workshop_name,
             vehicle_registration, request_type, summary)
        VALUES ('V087-FORGED', rf.o_tenant_id, rf.o_organization_id, v_vehicle,
                v_ws_dir, v_ws_org, 'Verify 087 Haulage', 'Verify 087 Motors',
                'V087-FLEET-1', 'service', 'a job the fleet never asked for');
    EXCEPTION WHEN insufficient_privilege THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'verify/087 #7: a WORKSHOP created a service request on a '
                        'fleet''s behalf. Only the fleet-side policy may insert.';
    END IF;
    passed := passed + 1;

    -- ── 8. THE FLEET CANNOT NAME ANOTHER ORGANISATION'S VEHICLE ───────────
    -- Referential integrity bypasses RLS, so this is the 3-column FK's job, not
    -- the policy's. Proven with a vehicle that exists and is not the fleet's.
    PERFORM set_config('app.tenant_id',        rf.o_tenant_id::text,       true);
    PERFORM set_config('app.organization_ids', rf.o_organization_id::text, true);

    v_refused := false;
    BEGIN
        INSERT INTO fleet.service_requests
            (reference, fleet_tenant_id, fleet_organization_id, vehicle_id,
             workshop_directory_id, workshop_organization_id, fleet_name, workshop_name,
             vehicle_registration, request_type, summary)
        SELECT 'V087-OTHERVEH', rf.o_tenant_id, rf.o_organization_id, v.id,
               v_ws_dir, v_ws_org, 'Verify 087 Haulage', 'Verify 087 Motors',
               'NOT-MINE', 'service', 'someone else''s van'
          FROM core.vehicles v
         WHERE v.organization_id <> rf.o_organization_id
         LIMIT 1;
        -- No row to insert means the fixture could not express the case.
        IF NOT FOUND THEN v_refused := true; END IF;
    EXCEPTION WHEN foreign_key_violation THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'verify/087 #8: a fleet raised a request against a vehicle '
                        'belonging to another organisation. fk_request_vehicle_same_org '
                        'is not doing its job — referential integrity bypasses RLS, so '
                        'all three columns are required.';
    END IF;
    passed := passed + 1;

    -- ── 9. AN UNPUBLISHED WORKSHOP IS REFUSED, AND SO IS SELF-ADDRESSING ──
    -- 🔴 THE UNPUBLISH MUST BE DONE AS THE OWNER, AND THE FIRST VERSION OF THIS
    -- CHECK DID NOT — SO IT FAILED AGAINST A WORKING PRODUCT.
    --
    -- It set `app.current_role = 'admin'` while still `SET ROLE
    -- autoworkshop_app`. The platform escape is `current_role_name() = 'admin'`
    -- **AND `current_user` = the table owner**, so as the app role it does not
    -- apply: the UPDATE matched zero rows, `is_published` stayed true, and the
    -- INSERT below was accepted — correctly. The check reported a product defect
    -- that did not exist, which is the most expensive kind of failing test.
    RESET ROLE;
    PERFORM set_config('app.current_role', 'admin', true);
    UPDATE catalogue.mechanic_directory SET is_published = false WHERE id = v_ws_dir;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/087 #9: could not unpublish the directory row (% rows '
                        'updated), so the refusal below would pass vacuously.', n;
    END IF;
    PERFORM set_config('app.current_role', '', true);
    SET LOCAL ROLE autoworkshop_app;
    PERFORM set_config('app.tenant_id',        rf.o_tenant_id::text,       true);
    PERFORM set_config('app.organization_ids', rf.o_organization_id::text, true);

    v_refused := false;
    BEGIN
        INSERT INTO fleet.service_requests
            (reference, fleet_tenant_id, fleet_organization_id, vehicle_id,
             workshop_directory_id, workshop_organization_id, fleet_name, workshop_name,
             vehicle_registration, request_type, summary)
        VALUES ('V087-UNPUB', rf.o_tenant_id, rf.o_organization_id, v_vehicle,
                v_ws_dir, v_ws_org, 'Verify 087 Haulage', 'x',
                'V087-FLEET-1', 'service', 'to a withdrawn workshop');
    EXCEPTION WHEN check_violation THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'verify/087 #9: a request was accepted against a workshop that '
                        'has WITHDRAWN from the public directory.';
    END IF;
    passed := passed + 1;

    RESET ROLE;
    PERFORM set_config('app.current_role', 'admin', true);

    -- ── CLEANUP ───────────────────────────────────────────────────────────
    -- Explicit DELETEs in dependency order, matching verify/080, 085 and 086:
    -- a verify that leaves fixtures behind pollutes the counts later assertions
    -- read — and this one would leave a workshop in the PUBLIC directory.
    DELETE FROM fleet.service_requests WHERE fleet_tenant_id = rf.o_tenant_id;
    DELETE FROM fleet.drivers          WHERE tenant_id = rf.o_tenant_id;
    DELETE FROM core.vehicles          WHERE tenant_id = rf.o_tenant_id;
    DELETE FROM core.customers         WHERE tenant_id = rf.o_tenant_id;
    DELETE FROM catalogue.mechanic_directory WHERE id = v_ws_dir;
    DELETE FROM comms.notifications
     WHERE resource_type = 'organization_registration'
       AND resource_id IN (SELECT id FROM identity.organization_registrations
                            WHERE tenant_id = rf.o_tenant_id);
    DELETE FROM identity.organization_registrations WHERE tenant_id = rf.o_tenant_id;
    DELETE FROM identity.memberships   WHERE tenant_id IN (rf.o_tenant_id, v_ws_ten, v_third_ten);
    DELETE FROM identity.branches      WHERE tenant_id IN (rf.o_tenant_id, v_ws_ten, v_third_ten);
    DELETE FROM identity.organizations WHERE tenant_id IN (rf.o_tenant_id, v_ws_ten, v_third_ten);
    DELETE FROM identity.tenants       WHERE id IN (rf.o_tenant_id, v_ws_ten, v_third_ten);
    DELETE FROM identity.users         WHERE id IN (v_user_f, v_user_w);

    RAISE NOTICE 'verify/087: % checks passed. Checks 4 and 5 are the evidence — the '
                 'WORKSHOP reads a row in the FLEET''s tenant, and a third organisation '
                 'reads nothing. Check 6 proves the boundary column is derived from the '
                 'directory rather than supplied by the caller.', passed;
END
$verify$;
