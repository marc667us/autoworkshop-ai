-- verify/045 — settings, PROVEN BY INJECTING EACH FAILURE.
--
-- Same shape as verify/042 and verify/044: it BUILDS ITS OWN TENANT through the
-- registration bootstrap door (whose guard is `current_user = owner of
-- register_workshop`, which a migration is and the APPLICATION is not), shuts
-- the door, and runs every check under the permissions a real user has.
--
-- ⚠️ A FIXTURE CANNOT DISCOVER A TENANT. `identity.tenants` is
-- `USING (id = current_tenant_id())`, so with no context it returns zero rows —
-- by design. That cost five refused rehearsals on 2026-08-06; it is not
-- rediscovered here.
--
-- 🔴 AND THIS ONE SETS `app.organization_ids` AS WELL AS `app.tenant_id`,
-- because 045 is the first migration whose policies read
-- `identity.current_organization_id()`. A verify that set only the tenant would
-- see zero rows through its own correct policies and report a broken migration.
--
-- 🔴 EVERY ASSERTION ASSERTS AN EFFECT, NOT A MECHANISM. Check 5 of verify/042
-- demanded a specific exception on a forbidden DELETE; live has no DELETE policy
-- so the DELETE matched zero rows and raised nothing, and the verify failed
-- against a database that was MORE secure than the one it passed on. Here the
-- isolation checks assert "the row is not visible / did not change", which is
-- true whether the refusal arrives as an exception or as zero rows matched.

-- ── 🔴 AND IT REFUSES TO MAKE AN RLS CLAIM IT CANNOT SUPPORT ───────────────
--
-- The first run of this file FAILED check 7 locally, reporting that a sibling
-- organisation could read another's settings. The policy was fine. The local
-- `autoworkshop` role is `superuser=true bypassrls=true`, so NO policy applied
-- to it at all — the check was measuring the connection, not the schema.
--
-- That is the same trap as 036 (which passed 9/9 locally against a defect that
-- existed only in production) arriving from the opposite direction: here the
-- superuser makes a CORRECT schema look broken. Both directions have now cost a
-- session, and the cause is identical — an RLS assertion run by a role RLS does
-- not apply to says nothing whatsoever.
--
-- So the isolation checks SET LOCAL ROLE to a role that does not bypass RLS.
-- If none is available they are SKIPPED LOUDLY and NOT counted as passes,
-- because a silent skip is indistinguishable from a pass, which is the defect
-- class that has cost this repository the most.

DO $verify$
DECLARE
    tid uuid; oid uuid; other_oid uuid; me uuid;
    cat_id uuid; hours_id uuid; integ_id uuid;
    n int; refused boolean; txt text;
    passed int := 0;
    bypasses boolean;
    rls_role text;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/045: no user rows — cannot build a fixture'; END IF;

    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-045 tenant', 'verify-045-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-045 workshop', 'individual_workshop', me);
        -- 🔴 THE SECOND ORGANISATION IS THE WHOLE POINT OF THIS FILE.
        -- A tenant here holds more than one, which is what made every earlier
        -- slice's tenant-wide RLS insufficient. Without a sibling org there is
        -- nothing to be isolated FROM and checks 6-7 would pass vacuously.
        other_oid := gen_random_uuid();
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (other_oid, tid, 'verify-045 OTHER workshop', 'individual_workshop', me);
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
        SELECT id INTO other_oid FROM identity.organizations
         WHERE tenant_id = tid AND id <> oid LIMIT 1;
    END IF;
    IF oid IS NULL THEN RAISE EXCEPTION 'verify/045: tenant % has no organisation', tid; END IF;

    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.organization_ids', oid::text, true);

    -- Does THIS connection bypass RLS? Measured, never assumed — and measured
    -- for the role we will actually be running as.
    SELECT rolsuper OR rolbypassrls INTO bypasses FROM pg_roles WHERE rolname = current_user;
    IF bypasses THEN
        -- Pick a role that RLS genuinely applies to. `autoworkshop_app` is the
        -- role the application connects as, which is the one whose experience
        -- these checks are supposed to describe.
        SELECT rolname INTO rls_role FROM pg_roles
         WHERE rolname = 'autoworkshop_app' AND NOT rolsuper AND NOT rolbypassrls;
    END IF;

    -- 1. a service category is created and is visible in its own organisation
    INSERT INTO core.service_categories (tenant_id, organization_id, name, indicative_price, created_by)
    VALUES (tid, oid, 'verify-045 brakes ' || substr(gen_random_uuid()::text,1,8), 250.00, me)
    RETURNING id INTO cat_id;
    SELECT count(*) INTO n FROM core.service_categories WHERE id = cat_id;
    IF n <> 1 THEN RAISE EXCEPTION 'a category just inserted is not visible to its own org'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  1/9 a service category is visible inside its own organisation';

    -- 2. opening hours: a day is either closed, or it has BOTH ends
    refused := false;
    BEGIN
        INSERT INTO core.opening_hours (tenant_id, organization_id, weekday, is_closed, opens_at, created_by)
        VALUES (tid, oid, 1, false, time '08:00', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'an open day with no closing time was ACCEPTED — ck_hours_complete is not doing anything';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  2/9 an open day with no closing time is refused';

    -- 3. closing before opening is a typo, not a night shift
    refused := false;
    BEGIN
        INSERT INTO core.opening_hours (tenant_id, organization_id, weekday, opens_at, closes_at, created_by)
        VALUES (tid, oid, 2, time '17:00', time '08:00', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'closes_at before opens_at was ACCEPTED'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  3/9 closing before opening is refused';

    -- 4. 🔴 THE NULL-BRANCH UNIQUENESS. A plain UNIQUE would let a single-site
    -- workshop store Monday twice, because UNIQUE treats every NULL as distinct.
    -- This is the check that proves NULLS NOT DISTINCT is really there.
    INSERT INTO core.opening_hours (tenant_id, organization_id, weekday, opens_at, closes_at, is_published, created_by)
    VALUES (tid, oid, 3, time '08:00', time '17:00', true, me)
    RETURNING id INTO hours_id;
    refused := false;
    BEGIN
        INSERT INTO core.opening_hours (tenant_id, organization_id, weekday, opens_at, closes_at, created_by)
        VALUES (tid, oid, 3, time '09:00', time '18:00', me);
    EXCEPTION WHEN unique_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'the same weekday was stored TWICE for a branchless workshop — '
                        'UNIQUE is treating NULL branch_id as distinct';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  4/9 the same weekday cannot be stored twice when branch_id is NULL';

    -- 5. 🔴 THE CREDENTIAL GUARD, PROVEN BY TRYING TO STORE A CREDENTIAL.
    -- On INSERT first…
    refused := false;
    BEGIN
        INSERT INTO core.integrations (tenant_id, organization_id, provider_kind, provider_name, config, created_by)
        VALUES (tid, oid, 'sms', 'verify-045 gateway',
                '{"sender_id":"WORKSHOP","api_key":"live_abc123"}'::jsonb, me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'an api_key was STORED IN PLAINTEXT in core.integrations.config';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  5/9 a credential in integrations.config is refused on INSERT';

    -- 6. …and on UPDATE, because a rule enforced on one statement is defeated by
    -- the other. Recorded twice in this repository (QC 030, variations 032).
    INSERT INTO core.integrations (tenant_id, organization_id, provider_kind, provider_name, config, created_by)
    VALUES (tid, oid, 'sms', 'verify-045 gateway', '{"sender_id":"WORKSHOP"}'::jsonb, me)
    RETURNING id INTO integ_id;
    refused := false;
    BEGIN
        UPDATE core.integrations
           SET config = '{"sender_id":"WORKSHOP","password":"hunter2"}'::jsonb
         WHERE id = integ_id;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a credential was smuggled into integrations.config by UPDATE — '
                        'the guard fires on INSERT only';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  6/9 a credential in integrations.config is refused on UPDATE too';

    -- 7. 🔴 ORGANISATION ISOLATION — THE REASON THIS MIGRATION EXISTS.
    -- Switch to the SIBLING organisation in the SAME TENANT. Under the old
    -- tenant-only predicate every row above would still be visible here.
    IF bypasses AND rls_role IS NULL THEN
        RAISE WARNING 'verify/045: checks 7-9 SKIPPED — this connection is % '
                      '(superuser or bypassrls) and no non-bypassing role is available. '
                      'THE ISOLATION AND PUBLIC-READ RULES ARE UNPROVEN BY THIS RUN. '
                      'Run rehearse-migration.yml against live, where the app role does '
                      'not bypass RLS.', current_user;
    ELSIF other_oid IS NOT NULL THEN
        -- Transaction-local, so the ROLLBACK takes it with everything else and a
        -- pooled connection carries nothing to the next caller.
        IF rls_role IS NOT NULL THEN
            EXECUTE format('SET LOCAL ROLE %I', rls_role);
            RAISE NOTICE '  (switched to % — RLS applies to it; the outer role bypasses)', rls_role;
        END IF;

        PERFORM set_config('app.organization_ids', other_oid::text, true);
        SELECT count(*) INTO n FROM core.service_categories WHERE id = cat_id;
        IF n <> 0 THEN
            RAISE EXCEPTION 'a SIBLING ORGANISATION in the same tenant can read this '
                            'workshop''s service categories — the policy is tenant-wide, not org-scoped';
        END IF;
        SELECT count(*) INTO n FROM core.approval_limits WHERE organization_id = oid;
        IF n <> 0 THEN
            RAISE EXCEPTION 'a sibling organisation can read this workshop''s approval limits';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  7/9 a sibling organisation in the SAME TENANT sees none of it';

        -- 8. and cannot WRITE into it either. Asserted as an EFFECT: whether the
        -- refusal arrives as an exception or as zero rows matched, the row must
        -- be unchanged when we look again as its owner.
        BEGIN
            UPDATE core.service_categories SET name = 'hijacked' WHERE id = cat_id;
        EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
        END;
        PERFORM set_config('app.organization_ids', oid::text, true);
        SELECT name INTO txt FROM core.service_categories WHERE id = cat_id;
        IF txt = 'hijacked' THEN
            RAISE EXCEPTION 'a sibling organisation REWROTE this workshop''s service category';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  8/9 a sibling organisation cannot rewrite it either (row unchanged)';
    ELSE
        RAISE WARNING '  7-8/9 SKIPPED: this tenant has only one organisation, so there is '
                      'nothing to be isolated from. NOT A PASS.';
    END IF;

    -- 9. published hours are readable with NO tenant and NO organisation at all,
    -- which is what the public workshop profile needs. Unpublished ones are not.
    -- Meaningless under a bypassing role for the same reason as 7-8: the
    -- `public_read` policy is not what would be answering.
    IF bypasses AND rls_role IS NULL THEN
        RAISE WARNING '  9/9 SKIPPED: a bypassing role would read every row whatever the '
                      'policy said. NOT A PASS.';
    ELSE
        IF rls_role IS NOT NULL THEN EXECUTE format('SET LOCAL ROLE %I', rls_role); END IF;
        PERFORM set_config('app.tenant_id', '', true);
        PERFORM set_config('app.organization_ids', '', true);
        SELECT count(*) INTO n FROM core.opening_hours WHERE id = hours_id;
        IF n <> 1 THEN
            RAISE EXCEPTION 'PUBLISHED opening hours are not readable without a tenant context — '
                            'the public workshop profile cannot render them';
        END IF;
        SELECT count(*) INTO n FROM core.opening_hours WHERE organization_id = oid AND NOT is_published;
        IF n <> 0 THEN
            RAISE EXCEPTION 'UNPUBLISHED opening hours leaked to an anonymous reader';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  9/9 published hours are public, unpublished hours are not';
    END IF;

    -- Restore the outer role so a caller that continues in this transaction is
    -- not silently downgraded.
    RESET ROLE;

    -- 🔴 REPORT THE DENOMINATOR. "8 checks passed" out of a possible 9 reads as
    -- success; "8 of 9" is the number that shows something was skipped.
    RAISE NOTICE 'verify/045: % of 9 checks passed', passed;
    IF passed < 9 THEN
        RAISE WARNING 'verify/045: % checks did NOT run. This run does not prove them.', 9 - passed;
    END IF;
END
$verify$;
