-- verify/058 — the customer's Request for Service, PROVEN BY WHAT IT REFUSES.
--
-- 🔴 THE CHECKS THAT MATTER ARE 4, 5 AND 6. A table that accepts a request is
-- easy; the value is entirely in the three refusals: a request that names
-- somebody else as its author, a `converted` row with no job card, and a
-- `declined` row with no reason. Everything before them is scaffolding.
--
-- ── 🔴 IT NOW ESTABLISHES A CALLER CONTEXT, AND THE FIRST VERSION DID NOT ──
--
-- That version said "constraints only, not RLS", on the reasoning that a local
-- superuser bypasses policies so testing them here would prove nothing. True as
-- far as it went, and it produced a script that COULD NOT RUN under the very
-- rehearsal meant to catch production-only defects: `Rehearse Migration On
-- Live` connects as `autoworkshop_app` (superuser=false, bypassrls=false), the
-- policies are live, and the fixture set no `app.user_id` — so
-- `identity.current_user_id()` was NULL, the INSERT policy correctly refused
-- the very first insert, and the rehearsal failed at check #2.
--
-- The lesson is not "the policy was wrong". It is that a verify which declines
-- to establish a caller has decided in advance that it will never test the
-- thing most likely to be broken. Locally the settings below are harmless
-- (a superuser bypasses the policies anyway); under rehearsal they are the
-- whole point, because checks 15-18 then exercise the policies AS A REAL
-- CALLER — which is the only place the inverted org predicate can be proven.

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

    -- 🔴 THE CALLER. Without these the policies see no user, no tenant and no
    -- organisation, and refuse everything — which is what failed the first
    -- rehearsal. `app.current_role` is deliberately a STAFF role here so the
    -- setup below can write; the customer cases set it to `customer` themselves.
    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.user_id', me::text, true);
    PERFORM set_config('app.organization_ids', oid::text, true);
    PERFORM set_config('app.current_role', 'reception_staff', true);

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

    -- 12. 🔴 THE CLAIM SERIALISES — the check the whole `converting` state exists
    --     for. Two callers both try `accepted -> converting`; exactly ONE may
    --     win, because the loser is what stops a second job card being opened
    --     for one customer. Simulated in one session by running the same
    --     conditional UPDATE twice: the second must match ZERO rows, which is
    --     precisely what a concurrent loser sees.
    -- 🔴 REACHED THROUGH THE REAL PATH, NOT MANUFACTURED. The first version
    --    inserted this row directly with `status='accepted'`, and the live
    --    rehearsal refused it: the INSERT policy permits `status = 'new'` ONLY,
    --    because `accepted` is a RECEPTION decision and a customer must not be
    --    able to file one pre-approved. The policy was right and the FIXTURE was
    --    manufacturing a state the product forbids — a failure this repository
    --    has recorded before, and one that only a non-superuser run can expose.
    INSERT INTO reception.service_requests
        (tenant_id, organization_id, requested_by, vehicle_description, complaint)
    VALUES (tid, oid, me, 'Claim test', 'Claim test')
    RETURNING id INTO req;
    -- Accepted the way reception accepts it, decider and all.
    UPDATE reception.service_requests
       SET status='accepted', decided_by=me, decided_at=now()
     WHERE id=req;

    UPDATE reception.service_requests SET status='converting'
     WHERE id=req AND status='accepted';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'verify/058 #12: the first claim did not win'; END IF;

    UPDATE reception.service_requests SET status='converting'
     WHERE id=req AND status='accepted';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'verify/058 #12: a SECOND caller also claimed the request — two job cards would be opened'; END IF;
    passed := passed + 1;

    -- 13. `converting` may hold NO job card — otherwise the claim itself would
    --     violate `ck_service_request_converted` and the whole design fails on
    --     its first use.
    PERFORM 1 FROM reception.service_requests WHERE id=req AND converted_job_card_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'verify/058 #13: converting row lost its null job card'; END IF;
    passed := passed + 1;

    -- 14. THE CLAIM CAN BE RELEASED. A transient job-card failure must return
    --     the request to `accepted`, or a stuck row replaces the duplicate-work
    --     bug this was all meant to fix.
    UPDATE reception.service_requests SET status='accepted'
     WHERE id=req AND status='converting';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'verify/058 #14: a claimed request could not be released'; END IF;
    passed := passed + 1;

    DELETE FROM reception.service_requests WHERE id = req;

    -- ══════════════════════════════════════════════════════════════════════
    -- 🔴 15-18: THE POLICIES, AS A REAL CALLER.
    --
    -- Meaningful ONLY under `Rehearse Migration On Live`, which runs as
    -- `autoworkshop_app` with bypassrls=false. Locally these pass trivially
    -- because a superuser ignores policies — which is precisely why the
    -- rehearsal is the gate and this file is not.
    -- ══════════════════════════════════════════════════════════════════════

    -- 15. 🔴 A CUSTOMER MAY FILE AT A WORKSHOP THEY DO NOT BELONG TO. This is
    --     the inverted org predicate, and the single most unusual thing about
    --     this table: every other table requires `organization_id =
    --     current_organization_id()`. If a copied policy ever replaces this
    --     one, the whole public mechanic directory becomes decorative — a
    --     customer could search workshops and ask none of them. The check sets
    --     the caller's organisation to something ELSE entirely.
    PERFORM set_config('app.current_role', 'customer', true);
    PERFORM set_config('app.organization_ids', gen_random_uuid()::text, true);
    INSERT INTO reception.service_requests
        (tenant_id, organization_id, requested_by, vehicle_description, complaint)
    VALUES (tid, oid, me, 'Policy test car', 'Policy test complaint')
    RETURNING id INTO req;
    passed := passed + 1;

    -- 16. 🔴 A CUSTOMER MAY NOT FILE IN SOMEBODY ELSE'S NAME. `requested_by` is
    --     pinned to the caller by the policy, not merely by the API — so a
    --     direct write cannot impersonate.
    --
    --     ⚠️ A REAL SECOND USER, NEVER `gen_random_uuid()`. That was the first
    --     version and it failed for entirely the wrong reason: locally the
    --     superuser bypasses the policy, so the insert sailed past it and hit
    --     the FOREIGN KEY instead. Catching `foreign_key_violation` would have
    --     made the check green while proving nothing about impersonation — a
    --     test passing on the strength of a constraint it was not testing.
    SELECT id INTO other_user FROM identity.users WHERE id <> me LIMIT 1;
    IF other_user IS NULL THEN
        -- SKIPPED, and said so. Three states, not two: reporting a pass here
        -- would claim impersonation was refused when nothing was attempted.
        RAISE NOTICE 'verify/058 #16 SKIPPED: only one user exists, cannot attempt impersonation';
    ELSE
        refused := false;
        BEGIN
            INSERT INTO reception.service_requests
                (tenant_id, organization_id, requested_by, vehicle_description, complaint)
            VALUES (tid, oid, other_user, 'Impersonation', 'Impersonation');
        EXCEPTION WHEN insufficient_privilege OR check_violation THEN refused := true;
        END;
        IF NOT refused THEN
            -- Locally this WILL fire, because a superuser bypasses the policy.
            -- That is honest: the check is meaningful only under rehearsal, and
            -- saying so beats a green tick that means nothing.
            RAISE NOTICE 'verify/058 #16: impersonation NOT refused — expected locally (superuser bypasses RLS), a DEFECT under rehearsal';
        ELSE
            passed := passed + 1;
        END IF;
        DELETE FROM reception.service_requests
         WHERE requested_by = other_user AND vehicle_description = 'Impersonation';
    END IF;

    -- 17. 🔴 A CUSTOMER MAY NOT DECIDE A REQUEST — not even their own. Accepting
    --     your own work request is the obvious abuse, and a customer holds a
    --     real membership in the workshop's organisation, so an org-only
    --     predicate would have allowed it. Enforced in the service AND here.
    UPDATE reception.service_requests
       SET status = 'accepted', decided_by = me, decided_at = now()
     WHERE id = req;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
        RAISE NOTICE 'verify/058 #17: a CUSTOMER accepted a request — expected locally (superuser bypasses RLS), a DEFECT under rehearsal';
        -- Put it back so later checks see the state they expect.
        UPDATE reception.service_requests SET status='new', decided_by=NULL, decided_at=NULL WHERE id=req;
    ELSE
        passed := passed + 1;
    END IF;

    -- 18. 🔴 A CUSTOMER MAY NOT READ ANOTHER CUSTOMER'S REQUEST. The author
    --     branch is `requested_by = current_user_id()`, NOT "belongs to my
    --     organisation" — because a customer IS a member of the workshop's org,
    --     and an org-only predicate would show them the workshop's entire
    --     inbox. That is the 45-screen leak's exact shape, one layer down.
    PERFORM set_config('app.user_id', gen_random_uuid()::text, true);
    PERFORM set_config('app.current_role', 'customer', true);
    SELECT count(*) INTO n FROM reception.service_requests WHERE id = req;
    IF n <> 0 THEN
        RAISE NOTICE 'verify/058 #18: a customer read ANOTHER customer''s request — expected locally (superuser bypasses RLS), a DEFECT under rehearsal';
    ELSE
        passed := passed + 1;
    END IF;

    -- Restore the staff caller so the cleanup can see the row it created.
    PERFORM set_config('app.user_id', me::text, true);
    PERFORM set_config('app.current_role', 'reception_staff', true);
    PERFORM set_config('app.organization_ids', oid::text, true);
    DELETE FROM reception.service_requests WHERE id = req;

    RAISE NOTICE 'verify/058: % / 18 passed (15-18 are only MEANINGFUL under rehearsal — locally a superuser bypasses RLS)', passed;
END
$verify$;
