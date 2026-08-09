-- verify/074 — the towing schema, and its RLS proven under RENDER'S ROLE.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 CHECKS 4-6 RUN AS `autoworkshop_app`, NOT AS THE OWNER.
--
-- Most verify files in this repo say their RLS checks "are only meaningful
-- under rehearsal", because the local migration role is a superuser and
-- bypasses every policy. That is true but it is not a limit — `autoworkshop_app`
-- exists on this machine with `rolsuper = f, rolbypassrls = f`, which is
-- Render's exact shape, and `SET ROLE` reaches it. Measured on 2026-08-09:
-- `repair.job_cards` returns 6 rows as the owner and 0 as that role.
--
-- So the policies are tested here rather than deferred. A workspace whose whole
-- audience is one organisation's dispatch office should not ship with its RLS
-- unexercised.
-- ══════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
    tid uuid := gen_random_uuid();
    orgA uuid := gen_random_uuid();
    orgB uuid := gen_random_uuid();
    me uuid;
    vehA uuid := gen_random_uuid(); drvA uuid := gen_random_uuid();
    reqA uuid := gen_random_uuid(); recA uuid := gen_random_uuid();
    vehB uuid := gen_random_uuid(); drvB uuid := gen_random_uuid();
    reqB uuid := gen_random_uuid();
    n int; refused boolean; passed int := 0;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/074: no user rows'; END IF;

    -- ── 1. Seven tables, every one ENABLE **and** FORCE ───────────────────
    SELECT count(*) INTO n FROM pg_class c
     WHERE c.relnamespace = 'towing'::regnamespace AND c.relkind = 'r'
       AND c.relrowsecurity AND c.relforcerowsecurity;
    IF n <> 7 THEN
        RAISE EXCEPTION 'verify/074 #1: expected 7 towing tables with ENABLE+FORCE '
                        'RLS, found %. ENABLE without FORCE is INERT for the '
                        'owner, and the app connects as the owner.', n;
    END IF;
    passed := passed + 1;

    -- ── 2. 21 policies (select/insert/update on each of the seven) ────────
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'towing';
    IF n <> 21 THEN RAISE EXCEPTION 'verify/074 #2: expected 21 policies, found %', n; END IF;
    passed := passed + 1;

    -- ── 3. Every cross-table reference is THREE-column ────────────────────
    --
    -- The rule 073 had to retrofit onto eighteen keys. If towing ever needs a
    -- retrofit of its own, this check is what failed to stop it.
    SELECT count(*) INTO n
      FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
     WHERE k.contype = 'f'
       AND c.relnamespace = 'towing'::regnamespace
       AND k.conname LIKE '%_scope'
       AND array_length(k.conkey, 1) = 3;
    IF n <> 7 THEN
        RAISE EXCEPTION 'verify/074 #3: expected 7 three-column scoped keys '
                        '(request->customer, request->vehicle, recovery->'
                        'request/driver/vehicle, incident->recovery, '
                        'invoice->recovery), found %', n;
    END IF;
    passed := passed + 1;

    -- ── FIXTURES: two organisations in one tenant ─────────────────────────
    PERFORM set_config('app.bootstrap', 'on', true);
    PERFORM set_config('app.bootstrap_user', me::text, true);
    INSERT INTO identity.tenants (id, name, slug, created_by)
      VALUES (tid, 'verify-074', 'verify-074-' || replace(tid::text,'-',''), me);
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
      VALUES (orgA, tid, 'Recovery A', 'individual_workshop', me),
             (orgB, tid, 'Recovery B', 'individual_workshop', me);
    PERFORM set_config('app.bootstrap', 'off', true);

    INSERT INTO towing.recovery_vehicles (id, tenant_id, organization_id, registration, label)
      VALUES (vehA, tid, orgA, 'TR-A-01', 'Flatbed 1'),
             (vehB, tid, orgB, 'TR-B-01', 'Flatbed 1');
    INSERT INTO towing.drivers (id, tenant_id, organization_id, full_name, phone)
      VALUES (drvA, tid, orgA, 'Yaw Mensah', '+233200000001'),
             (drvB, tid, orgB, 'Adjoa Boateng', '+233200000002');
    INSERT INTO towing.requests
        (id, tenant_id, organization_id, reference, contact_name, contact_phone,
         vehicle_description, pickup_location, fault_summary)
      VALUES (reqA, tid, orgA, 'TR-0001', 'Kofi', '+233240000001',
              'Blue Corolla', 'N1 near Achimota', 'Will not start'),
             (reqB, tid, orgB, 'TR-0001', 'Ama', '+233240000002',
              'White Hilux', 'Tema motorway', 'Flat tyre');

    -- ── 4. 🔴 A RECOVERY CANNOT BORROW ANOTHER ORGANISATION'S TRUCK ───────
    --
    -- The defect class 073 was written about, tested here before it can exist.
    refused := false;
    BEGIN
        INSERT INTO towing.recoveries
            (tenant_id, organization_id, request_id, driver_id, vehicle_id)
        VALUES (tid, orgA, reqA, drvA, vehB);   -- ← organisation B's truck
    EXCEPTION WHEN foreign_key_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'verify/074 #4: organisation A dispatched organisation '
                        'B''s recovery vehicle';
    END IF;
    passed := passed + 1;

    -- A legitimate dispatch still works — the half that stops this being a wall.
    INSERT INTO towing.recoveries
        (id, tenant_id, organization_id, request_id, driver_id, vehicle_id)
      VALUES (recA, tid, orgA, reqA, drvA, vehA);

    -- ── 5. 🔴 RLS UNDER RENDER'S ROLE: A sees only A ──────────────────────
    PERFORM set_config('role', 'autoworkshop_app', true);
    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.organization_ids', orgA::text, true);
    PERFORM set_config('app.user_id', me::text, true);
    PERFORM set_config('app.current_role', 'workshop_owner', true);

    IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
        RAISE EXCEPTION 'verify/074 #5: running as a role that bypasses RLS — '
                        'this check would pass against no policies at all';
    END IF;

    SELECT count(*) INTO n FROM towing.requests WHERE id = reqA;
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/074 #5: organisation A cannot read its OWN '
                        'request — the policy refuses everything (found %)', n;
    END IF;
    SELECT count(*) INTO n FROM towing.requests WHERE id = reqB;
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/074 #5b: organisation A can read organisation '
                        'B''s roadside request';
    END IF;
    SELECT count(*) INTO n FROM towing.drivers WHERE id = drvB;
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/074 #5c: organisation A can read organisation '
                        'B''s driver roster';
    END IF;
    passed := passed + 1;

    -- ── 6. 🔴 A CUSTOMER SEES NOTHING ─────────────────────────────────────
    --
    -- Since 061 "a customer" is any stranger who enrolled at a published
    -- workshop. Without the `<> 'customer'` clause this workspace would publish
    -- a driver roster and an incident log.
    PERFORM set_config('app.current_role', 'customer', true);
    SELECT count(*) INTO n FROM towing.requests;
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/074 #6: a customer can read % towing request(s)', n;
    END IF;
    SELECT count(*) INTO n FROM towing.drivers;
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/074 #6b: a customer can read the driver roster';
    END IF;
    passed := passed + 1;

    PERFORM set_config('role', 'none', true);   -- back to the owner for cleanup

    -- ── 7. One recovery per request ───────────────────────────────────────
    refused := false;
    BEGIN
        INSERT INTO towing.recoveries
            (tenant_id, organization_id, request_id, driver_id, vehicle_id)
        VALUES (tid, orgA, reqA, drvA, vehA);
    EXCEPTION WHEN unique_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'verify/074 #7: the same request was dispatched twice — '
                        'two trucks to one breakdown';
    END IF;
    passed := passed + 1;

    -- ── CLEANUP ───────────────────────────────────────────────────────────
    DELETE FROM towing.incidents         WHERE tenant_id = tid;
    DELETE FROM towing.invoices          WHERE tenant_id = tid;
    DELETE FROM towing.recoveries        WHERE tenant_id = tid;
    DELETE FROM towing.requests          WHERE tenant_id = tid;
    DELETE FROM towing.drivers           WHERE tenant_id = tid;
    DELETE FROM towing.recovery_vehicles WHERE tenant_id = tid;
    DELETE FROM towing.settings          WHERE tenant_id = tid;
    DELETE FROM identity.organizations   WHERE tenant_id = tid;
    DELETE FROM identity.tenants         WHERE id = tid;

    RAISE NOTICE 'verify/074: % / 7 passed. Checks 4-6 are the evidence: a '
                 'cross-organisation dispatch refused, and the policies '
                 'exercised as autoworkshop_app rather than as a superuser.', passed;
END
$verify$;
