-- verify/054 — organisation isolation, PROVEN BY THE READ IT REFUSES.
--
-- 🔴 THIS FILE EXISTS BECAUSE THE BUG IT FIXES WAS INVISIBLE IN A DIFF.
--
-- Postgres OR-combines PERMISSIVE policies, so an organisation-scoped policy
-- added ALONGSIDE the old tenant-only one would enforce nothing while looking
-- completely correct. Check 3 below is the one that can tell the difference:
-- it does the cross-organisation read and requires ZERO rows back.
--
-- ⚠️ IT REFUSES TO MAKE THE CLAIM UNDER A BYPASSING ROLE. The local
-- `autoworkshop` role is `superuser=true bypassrls=true`, and an RLS assertion
-- made by a role RLS does not apply to says nothing whatsoever — that trap has
-- cost this repository two sessions in both directions.

DO $verify$
DECLARE
    tid uuid; org_a uuid; org_b uuid; me uuid;
    cust_b uuid; job_b uuid; veh_b uuid; make_id uuid;
    n int; passed int := 0; bypasses boolean; rls_role text;
    missing int;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/054: no user rows — cannot build a fixture'; END IF;

    SELECT rolsuper OR rolbypassrls INTO bypasses FROM pg_roles WHERE rolname = current_user;
    IF bypasses THEN
        SELECT rolname INTO rls_role FROM pg_roles
         WHERE rolname = 'autoworkshop_app' AND NOT rolsuper AND NOT rolbypassrls;
    END IF;

    -- 1. every table in 054's list carries the restrictive policy
    SELECT count(*) INTO missing
      FROM (VALUES ('core.customers'),('repair.job_cards'),('finance.invoices'),
                   ('warranty.policies'),('parts.stock_items'),('reception.appointments'),
                   ('media.assets'),('core.vehicles')) v(t)
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_policies p
        WHERE p.schemaname||'.'||p.tablename = v.t
          AND p.policyname = 'org_restrict'
          AND p.permissive = 'RESTRICTIVE');
    IF missing <> 0 THEN
        RAISE EXCEPTION '% sampled table(s) have no RESTRICTIVE org_restrict policy', missing;
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  1/4 the restrictive organisation policy is present';

    -- 2. it is RESTRICTIVE, not permissive.
    -- 🔴 THE WHOLE FIX TURNS ON THIS ONE WORD. A permissive policy would be
    -- OR-ed with the old tenant-only one and enforce exactly nothing.
    SELECT count(*) INTO n FROM pg_policies
     WHERE policyname = 'org_restrict' AND permissive <> 'RESTRICTIVE';
    IF n <> 0 THEN
        RAISE EXCEPTION '% org_restrict policies are PERMISSIVE — they are OR-ed with the '
                        'old tenant-only policies and enforce nothing', n;
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  2/4 every org_restrict policy is RESTRICTIVE (AND-ed, not OR-ed)';

    -- ── the fixture: TWO organisations in ONE tenant ────────────────────────
    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-054', 'verify-054-' || replace(tid::text,'-',''), me);
        PERFORM set_config('app.bootstrap', 'off', true);
    END IF;

    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.bootstrap', 'on', true);
    PERFORM set_config('app.bootstrap_user', me::text, true);
    org_a := gen_random_uuid(); org_b := gen_random_uuid();
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
    VALUES (org_a, tid, 'verify-054 A', 'individual_workshop', me),
           (org_b, tid, 'verify-054 B', 'individual_workshop', me);
    PERFORM set_config('app.bootstrap', 'off', true);

    -- a customer, a vehicle and a job card, all inside organisation B
    PERFORM set_config('app.organization_ids', org_b::text, true);
    INSERT INTO core.customers (tenant_id, organization_id, display_name, created_by)
    VALUES (tid, org_b, 'verify-054 B customer', me) RETURNING id INTO cust_b;

    SELECT id INTO make_id FROM core.vehicle_makes LIMIT 1;
    IF make_id IS NULL THEN
        INSERT INTO core.vehicle_makes (name) VALUES ('verify-054 make') RETURNING id INTO make_id;
    END IF;
    INSERT INTO core.vehicles (tenant_id, organization_id, customer_id, registration_number,
                               make_id, created_by)
    VALUES (tid, org_b, cust_b, 'V54-'||substr(gen_random_uuid()::text,1,6), make_id, me)
    RETURNING id INTO veh_b;
    INSERT INTO repair.job_cards (tenant_id, organization_id, job_number, customer_id,
                                  vehicle_id, complaint, created_by)
    VALUES (tid, org_b, repair.next_job_number(org_b), cust_b, veh_b, 'verify-054', me)
    RETURNING id INTO job_b;

    -- 3. 🔴 THE READ THAT MUST COME BACK EMPTY.
    PERFORM set_config('app.organization_ids', org_a::text, true);
    IF rls_role IS NOT NULL THEN
        EXECUTE format('SET LOCAL ROLE %I', rls_role);
    END IF;

    IF bypasses AND rls_role IS NULL THEN
        RAISE WARNING 'verify/054: this connection BYPASSES RLS and no non-bypassing role '
                      'exists — check 3 is SKIPPED and this run proves nothing about isolation';
    ELSE
        SELECT count(*) INTO n FROM core.customers WHERE id = cust_b;
        IF n <> 0 THEN
            RAISE EXCEPTION 'organisation A can READ a customer belonging to organisation B '
                            'of the same tenant — the organisation predicate is not enforced';
        END IF;
        SELECT count(*) INTO n FROM repair.job_cards WHERE id = job_b;
        IF n <> 0 THEN
            RAISE EXCEPTION 'organisation A can READ organisation B''s job card';
        END IF;
        SELECT count(*) INTO n FROM core.vehicles WHERE id = veh_b;
        IF n <> 0 THEN
            RAISE EXCEPTION 'organisation A can READ organisation B''s vehicle';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  3/4 organisation A cannot read organisation B''s customer, vehicle or job card';
    END IF;

    RESET ROLE;

    -- 4. …and organisation B can still read its OWN rows.
    -- A refusal that also refuses the rightful owner is an outage, not a fix.
    PERFORM set_config('app.organization_ids', org_b::text, true);
    IF rls_role IS NOT NULL THEN
        EXECUTE format('SET LOCAL ROLE %I', rls_role);
    END IF;
    SELECT count(*) INTO n FROM core.customers WHERE id = cust_b;
    RESET ROLE;
    IF n <> 1 THEN
        RAISE EXCEPTION 'organisation B can no longer read its OWN customer — 054 is an outage, not a fix';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  4/4 organisation B still reads its own rows';

    RAISE NOTICE 'verify/054: % of 4 checks passed', passed;
    IF passed < 4 THEN
        RAISE EXCEPTION 'verify/054: % checks did NOT run. This run does not prove them.', 4 - passed;
    END IF;
END
$verify$;
