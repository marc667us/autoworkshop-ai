-- verify/048 — knowledge and learning, PROVEN BY INJECTING EACH FAILURE.
--
-- Same shape as 045-047: builds its own tenant through the registration
-- bootstrap door, shuts it, and SET LOCAL ROLEs to a role RLS actually applies
-- to before making any isolation claim — skipping LOUDLY, and not counting a
-- pass, when it cannot.

DO $verify$
DECLARE
    tid uuid; oid uuid; other_oid uuid; me uuid;
    art uuid; asset uuid;
    n int; refused boolean;
    passed int := 0;
    bypasses boolean; rls_role text;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/048: no user rows — cannot build a fixture'; END IF;

    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid(); other_oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-048 tenant', 'verify-048-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-048 workshop', 'individual_workshop', me),
               (other_oid, tid, 'verify-048 OTHER workshop', 'individual_workshop', me);
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
        SELECT id INTO other_oid FROM identity.organizations
         WHERE tenant_id = tid AND id <> oid LIMIT 1;
    END IF;
    IF oid IS NULL THEN RAISE EXCEPTION 'verify/048: tenant % has no organisation', tid; END IF;

    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.organization_ids', oid::text, true);

    SELECT rolsuper OR rolbypassrls INTO bypasses FROM pg_roles WHERE rolname = current_user;
    IF bypasses THEN
        SELECT rolname INTO rls_role FROM pg_roles
         WHERE rolname = 'autoworkshop_app' AND NOT rolsuper AND NOT rolbypassrls;
    END IF;

    -- 1. the standard fault codes are present and readable
    SELECT count(*) INTO n FROM knowledge.fault_codes;
    IF n = 0 THEN
        RAISE EXCEPTION 'no fault codes were seeded — the code index would be permanently empty '
                        'for a reason no reader could guess';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  1/8 % standard fault codes are present', n;

    -- 2. an article is created and can reference a fault code
    INSERT INTO knowledge.articles
      (tenant_id, organization_id, title, body, category, fault_code, created_by)
    VALUES (tid, oid, 'verify-048 misfire notes', 'Check the coils first.', 'diagnostic',
            'P0300', me)
    RETURNING id INTO art;
    SELECT count(*) INTO n FROM knowledge.articles WHERE id = art AND fault_code = 'P0300';
    IF n <> 1 THEN RAISE EXCEPTION 'an article could not be linked to a fault code'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  2/8 an article links to a standard fault code';

    -- 3. 🔴 THE STAGING BOUNDARY IS ENFORCED, NOT DOCUMENTED. A diagram marked
    -- as awaiting a licence may NOT carry the file — that is exactly the thing
    -- CLAUDE.md §4 stages, and a nullable column with no constraint would let
    -- an unlicensed OEM diagram be filed by accident.
    --
    -- ⚠️ THE FIXTURE BUILDS ITS OWN ASSET rather than borrowing one. The first
    -- draft did `(SELECT id FROM media.assets LIMIT 1)`, which is NULL on a
    -- fresh database — making the row legal, the check unexercisable, and the
    -- run report a loud skip forever. A check that can never run is the defect
    -- class this repository has paid for most; the fix is to construct the
    -- state, not to tolerate its absence.
    INSERT INTO media.assets
      (tenant_id, organization_id, storage_key, content_type, status, scan_status)
    VALUES (tid, oid, 'verify-048/' || gen_random_uuid()::text, 'image/png', 'pending', 'pending')
    RETURNING id INTO asset;

    refused := false;
    BEGIN
        INSERT INTO knowledge.diagrams
          (tenant_id, organization_id, title, source, asset_id, created_by)
        VALUES (tid, oid, 'verify-048 OEM wiring', 'licensed_pending', asset, me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a diagram AWAITING A LICENCE was allowed to carry a file — '
                        'that is exactly the licensed content CLAUDE.md section 4 stages';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  3/8 a licence-pending diagram cannot carry a file';

    -- …and a LICENSED one may, so the constraint discriminates rather than
    -- simply forbidding every diagram from having a file.
    INSERT INTO knowledge.diagrams
      (tenant_id, organization_id, title, source, asset_id, created_by)
    VALUES (tid, oid, 'verify-048 licensed wiring', 'licensed', asset, me);

    -- 4. …and its own-source counterpart is perfectly legal
    INSERT INTO knowledge.diagrams (tenant_id, organization_id, title, source, created_by)
    VALUES (tid, oid, 'verify-048 our own routing sketch', 'own', me);
    passed := passed + 1;
    RAISE NOTICE '  4/8 a workshop can file its OWN diagram today';

    -- 5. a certification cannot expire before it was awarded
    refused := false;
    BEGIN
        INSERT INTO learning.certifications
          (tenant_id, organization_id, user_id, name, awarded_on, expires_on, created_by)
        VALUES (tid, oid, me, 'verify-048 backwards', current_date, current_date - 1, me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a certification was accepted that expired before it was awarded';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  5/8 a certification cannot expire before it was awarded';

    -- 6. …and one with NO expiry is legal, because "does not expire" is not
    -- the same as "expired". Same distinction slice 9 makes about documents.
    INSERT INTO learning.certifications
      (tenant_id, organization_id, user_id, name, awarded_on, created_by)
    VALUES (tid, oid, me, 'verify-048 permanent', current_date, me);
    passed := passed + 1;
    RAISE NOTICE '  6/8 a certification with no expiry is accepted';

    -- 7-8. organisation isolation, under a role RLS applies to
    IF bypasses AND rls_role IS NULL THEN
        RAISE WARNING '  7-8/8 SKIPPED: this connection is % (superuser or bypassrls), so no '
                      'policy applies to it. NOT A PASS.', current_user;
    ELSIF other_oid IS NOT NULL THEN
        IF rls_role IS NOT NULL THEN
            EXECUTE format('SET LOCAL ROLE %I', rls_role);
            RAISE NOTICE '  (switched to % — RLS applies to it)', rls_role;
        END IF;

        PERFORM set_config('app.organization_ids', other_oid::text, true);
        SELECT count(*) INTO n FROM knowledge.articles WHERE id = art;
        IF n <> 0 THEN
            RAISE EXCEPTION 'a SIBLING ORGANISATION can read this workshop''s own procedures — '
                            'a garage''s method published to its competitors';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  7/8 a sibling organisation cannot read the workshop''s own articles';

        -- 🔴 …AND THE GLOBAL TABLE IS STILL READABLE. Fault codes are a
        -- published standard; scoping them per workshop would mean 500
        -- workshops each retyping the same table. This asserts the policies
        -- discriminate rather than merely being restrictive.
        SELECT count(*) INTO n FROM knowledge.fault_codes;
        IF n = 0 THEN
            RAISE EXCEPTION 'the STANDARD fault code table is invisible to this organisation — '
                            'reference data has been scoped as if it were private';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  8/8 the standard fault codes stay readable to every organisation';
    ELSE
        RAISE WARNING '  7-8/8 SKIPPED: this tenant has only one organisation. NOT A PASS.';
    END IF;

    RESET ROLE;

    RAISE NOTICE 'verify/048: % of 8 checks passed', passed;
    IF passed < 8 THEN
        RAISE WARNING 'verify/048: % checks did NOT run. This run does not prove them.', 8 - passed;
    END IF;
END
$verify$;
