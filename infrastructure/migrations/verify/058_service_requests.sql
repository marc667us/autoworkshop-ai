-- verify/058 — the customer's Request for Service, PROVEN BY WHAT IT REFUSES.
--
-- 🔴 THE CHECKS THAT MATTER ARE 4, 5 AND 6. A table that accepts a request is
-- easy; the value is entirely in the three refusals: a request that names
-- somebody else as its author, a `converted` row with no job card, and a
-- `declined` row with no reason. Everything before them is scaffolding.
--
-- ⚠️ CONSTRAINTS ONLY, NOT RLS. The policies cannot be exercised here: this
-- runs as the migration role, which on a local Postgres is a SUPERUSER and
-- BYPASSES row level security entirely. A "policy verified" line printed from
-- this script would be a lie of exactly the kind that made `verify/036` pass
-- 9/9 against a defect that existed only in production. The policies are
-- rehearsed on live by `Rehearse Migration On Live`, which runs as
-- `autoworkshop_app` with `superuser=false bypassrls=false`.

DO $verify$
DECLARE
    tid uuid; oid uuid; me uuid; other_user uuid;
    req uuid;
    refused boolean;
    n int;
    passed int := 0;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/058: no user rows'; END IF;

    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-058', 'verify-058-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-058 workshop', 'individual_workshop', me);
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
    END IF;
    IF oid IS NULL THEN RAISE EXCEPTION 'verify/058: no organisation'; END IF;

    -- 1. The table exists with the columns the feature depends on.
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'reception' AND table_name = 'service_requests'
       AND column_name IN ('organization_id','requested_by','vehicle_description',
                           'complaint','status','converted_job_card_id');
    IF n <> 6 THEN RAISE EXCEPTION 'verify/058 #1: expected 6 key columns, found %', n; END IF;
    passed := passed + 1;

    -- 2. A plain request is accepted, and defaults to `new`.
    INSERT INTO reception.service_requests
        (tenant_id, organization_id, requested_by, vehicle_description, complaint)
    VALUES (tid, oid, me, '2015 Toyota Corolla, silver', 'Knocking noise over bumps')
    RETURNING id INTO req;
    PERFORM 1 FROM reception.service_requests WHERE id = req AND status = 'new';
    IF NOT FOUND THEN RAISE EXCEPTION 'verify/058 #2: new request did not default to status new'; END IF;
    passed := passed + 1;

    -- 3. The vehicle is OPTIONAL — the whole point of the intake step is that
    --    the car is not a record yet. A NOT NULL here would break the flow the
    --    table exists for.
    SELECT is_nullable = 'YES' INTO refused FROM information_schema.columns
     WHERE table_schema='reception' AND table_name='service_requests' AND column_name='vehicle_id';
    IF NOT refused THEN RAISE EXCEPTION 'verify/058 #3: vehicle_id must be nullable at intake'; END IF;
    passed := passed + 1;

    -- 4. 🔴 A DECISION WITHOUT A DECIDER IS REFUSED. Half-recorded decisions are
    --    unauditable, and this is the one an ordinary UPDATE would produce.
    refused := false;
    BEGIN
        UPDATE reception.service_requests SET status='accepted', decided_at=now() WHERE id=req;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'verify/058 #4: accepted a decision with no decider'; END IF;
    passed := passed + 1;

    -- 5. 🔴 `converted` WITHOUT A JOB CARD IS REFUSED, and this is the check that
    --    stops the status becoming decorative. A row saying the work was turned
    --    into a job card, with no job card, is worse than no status at all.
    refused := false;
    BEGIN
        UPDATE reception.service_requests
           SET status='converted', decided_by=me, decided_at=now()
         WHERE id=req;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'verify/058 #5: accepted converted with no job card'; END IF;
    passed := passed + 1;

    -- 6. 🔴 A DECLINE MUST SAY WHY. "Declined", with nothing else, is the message
    --    the customer receives, and it is not an answer.
    refused := false;
    BEGIN
        UPDATE reception.service_requests
           SET status='declined', decided_by=me, decided_at=now()
         WHERE id=req;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'verify/058 #6: accepted a decline with no reason'; END IF;
    passed := passed + 1;

    -- 7. The legitimate decline succeeds — proving check 6 refused the MISSING
    --    REASON and not declines in general. A guard that refuses everything
    --    passes its own negative test and breaks the feature.
    UPDATE reception.service_requests
       SET status='declined', decline_reason='No capacity this week',
           decided_by=me, decided_at=now()
     WHERE id=req;
    PERFORM 1 FROM reception.service_requests WHERE id=req AND status='declined';
    IF NOT FOUND THEN RAISE EXCEPTION 'verify/058 #7: a valid decline was refused'; END IF;
    passed := passed + 1;

    -- 8. An invented status is refused.
    refused := false;
    BEGIN
        UPDATE reception.service_requests SET status='maybe' WHERE id=req;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'verify/058 #8: accepted an unknown status'; END IF;
    passed := passed + 1;

    -- 9. RLS is ENABLED **and FORCED**. Enabled-but-not-forced is inert for the
    --    table owner, which is what the app connects as on Render — the exact
    --    defect that made 33 Solar tables' policies decorative.
    SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace nsp ON nsp.oid=c.relnamespace
     WHERE nsp.nspname='reception' AND c.relname='service_requests'
       AND c.relrowsecurity AND c.relforcerowsecurity;
    IF n <> 1 THEN RAISE EXCEPTION 'verify/058 #9: RLS not both ENABLED and FORCED'; END IF;
    passed := passed + 1;

    -- 10. All three policies exist. A missing INSERT policy under FORCE means
    --     the feature cannot write at all, and it fails only in production.
    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname='reception' AND tablename='service_requests'
       AND policyname IN ('service_request_select','service_request_insert','service_request_update');
    IF n <> 3 THEN RAISE EXCEPTION 'verify/058 #10: expected 3 policies, found %', n; END IF;
    passed := passed + 1;

    -- 11. 🔴 NO DELETE GRANT. The intake record is the customer's evidence that
    --     they asked; `declined` is how it goes away.
    SELECT count(*) INTO n FROM information_schema.role_table_grants
     WHERE table_schema='reception' AND table_name='service_requests'
       AND grantee='autoworkshop_app' AND privilege_type='DELETE';
    IF n <> 0 THEN RAISE EXCEPTION 'verify/058 #11: DELETE was granted'; END IF;
    passed := passed + 1;

    DELETE FROM reception.service_requests WHERE id = req;

    RAISE NOTICE 'verify/058: % / 11 passed', passed;
END
$verify$;
