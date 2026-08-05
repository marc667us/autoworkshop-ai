-- verify/049 — in-app calls, PROVEN BY INJECTING EACH FAILURE.
--
-- Same shape as 045-048: builds its own tenant through the registration
-- bootstrap door, shuts it, and SET LOCAL ROLEs to a role RLS actually applies
-- to before making any isolation claim — skipping LOUDLY, and not counting a
-- pass, when it cannot.
--
-- 🔴 CHECKS 7 AND 8 ARE THE ONES THAT MATTER MOST HERE. `comms.call_signals`
-- carries SDP and ICE — the network addresses of two people's machines. If the
-- isolation on that table is wrong, a workshop can watch another workshop's
-- call being negotiated.

DO $verify$
DECLARE
    tid uuid; oid uuid; other_oid uuid; me uuid; you uuid;
    cid uuid; ev uuid; s1 bigint; s2 bigint;
    n int; refused boolean;
    passed int := 0;
    bypasses boolean; rls_role text;
BEGIN
    SELECT id INTO me FROM identity.users ORDER BY created_at LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/049: no user rows — cannot build a fixture'; END IF;
    SELECT id INTO you FROM identity.users WHERE id <> me ORDER BY created_at LIMIT 1;

    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid(); other_oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-049 tenant', 'verify-049-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-049 workshop', 'individual_workshop', me),
               (other_oid, tid, 'verify-049 OTHER workshop', 'individual_workshop', me);
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
        SELECT id INTO other_oid FROM identity.organizations
         WHERE tenant_id = tid AND id <> oid LIMIT 1;
    END IF;
    IF oid IS NULL THEN RAISE EXCEPTION 'verify/049: tenant % has no organisation', tid; END IF;

    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.organization_ids', oid::text, true);

    SELECT rolsuper OR rolbypassrls INTO bypasses FROM pg_roles WHERE rolname = current_user;
    IF bypasses THEN
        SELECT rolname INTO rls_role FROM pg_roles
         WHERE rolname = 'autoworkshop_app' AND NOT rolsuper AND NOT rolbypassrls;
    END IF;

    -- 1. a scheduled call needs a time — one that can never come round looks
    -- like cover and is not.
    refused := false;
    BEGIN
        INSERT INTO comms.calls
          (tenant_id, organization_id, call_kind, medium, subject, status, created_by)
        VALUES (tid, oid, 'customer', 'video', 'verify-049 no time', 'scheduled', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a call was SCHEDULED with no time — it can never come round';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  1/10 a scheduled call must carry a time';

    -- 2. an in-app video call is created
    INSERT INTO comms.calls
      (tenant_id, organization_id, call_kind, medium, subject, status, scheduled_for, created_by)
    VALUES (tid, oid, 'customer', 'video', 'verify-049 show them the brake pads', 'scheduled',
            now() + interval '1 hour', me)
    RETURNING id INTO cid;
    passed := passed + 1;
    RAISE NOTICE '  2/10 an in-app video call is created';

    -- 3. 🔴 A COMPLETED CALL MUST SAY WHAT HAPPENED. Same rule as slice 9's
    -- resolved support case.
    refused := false;
    BEGIN
        UPDATE comms.calls
           SET status = 'completed', started_at = now(), ended_at = now()
         WHERE id = cid;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'a call was COMPLETED with no outcome recorded'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  3/10 a completed call cannot be left without an outcome';

    -- 4. a call cannot end before it started
    refused := false;
    BEGIN
        INSERT INTO comms.calls
          (tenant_id, organization_id, call_kind, medium, subject, status,
           started_at, ended_at, outcome, created_by)
        VALUES (tid, oid, 'customer', 'voice', 'verify-049 backwards', 'completed',
                now(), now() - interval '1 hour', 'nonsense', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'a call was accepted that ended before it started'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  4/10 a call cannot end before it started';

    -- 5. 🔴 THE SIGNALLING CHANNEL ORDERS BY `seq`, NOT BY TIME. Two ICE
    -- candidates written in the same millisecond must still have a defined
    -- order, or a peer polling "everything after N" can miss one and the call
    -- fails to connect for a reason nobody can reproduce.
    INSERT INTO comms.call_signals
      (tenant_id, organization_id, call_id, from_user_id, to_user_id, signal_kind, payload)
    VALUES (tid, oid, cid, me, you, 'offer', '{"sdp":"v=0 ..."}'::jsonb)
    RETURNING seq INTO s1;
    INSERT INTO comms.call_signals
      (tenant_id, organization_id, call_id, from_user_id, to_user_id, signal_kind, payload)
    VALUES (tid, oid, cid, me, you, 'ice', '{"candidate":"candidate:1 ..."}'::jsonb)
    RETURNING seq INTO s2;
    IF s2 <= s1 THEN
        RAISE EXCEPTION 'call signals are not strictly ordered (% then %) — a polling peer '
                        'can miss a candidate', s1, s2;
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  5/10 signals are strictly ordered by seq (% then %)', s1, s2;

    -- 6. 🔴 A SIGNAL CANNOT BE REWRITTEN. A negotiation you cannot replay is one
    -- you cannot debug, and it is the first thing you read when a call will not
    -- connect. Asserted as an EFFECT — the row is unchanged either way.
    BEGIN
        UPDATE comms.call_signals SET payload = '{"sdp":"tampered"}'::jsonb WHERE seq = s1;
    EXCEPTION WHEN check_violation OR insufficient_privilege THEN NULL;
    END;
    SELECT count(*) INTO n FROM comms.call_signals
     WHERE seq = s1 AND payload->>'sdp' = 'v=0 ...';
    IF n <> 1 THEN RAISE EXCEPTION 'a call signal was REWRITTEN'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  6/10 a call signal cannot be rewritten';

    -- 7. `connection_failed` is recordable — the honest outcome when two peers
    -- cannot find a path. If this vocabulary were missing, the only way to
    -- report a failed call would be to say nothing.
    INSERT INTO comms.call_events
      (tenant_id, organization_id, call_id, event_kind, note, recorded_by)
    VALUES (tid, oid, cid, 'connection_failed',
            'ICE failed — both peers behind restrictive NAT', me)
    RETURNING id INTO ev;
    SELECT count(*) INTO n FROM comms.call_events
     WHERE id = ev AND event_kind = 'connection_failed';
    IF n <> 1 THEN RAISE EXCEPTION 'a failed connection could not be recorded'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  7/10 a failed media connection is recordable, not swallowed';

    -- 8. a phone call needs nothing configured — D7's promise that an app with
    -- no provider connected still works.
    INSERT INTO comms.calls
      (tenant_id, organization_id, call_kind, medium, subject, status, scheduled_for, created_by)
    VALUES (tid, oid, 'customer', 'phone', 'verify-049 just ring them', 'scheduled',
            now() + interval '2 hours', me);
    passed := passed + 1;
    RAISE NOTICE '  8/10 a phone call needs nothing configured';

    -- 9-10. organisation isolation, under a role RLS applies to
    IF bypasses AND rls_role IS NULL THEN
        RAISE WARNING '  9-10/10 SKIPPED: this connection is % (superuser or bypassrls), so no '
                      'policy applies to it. NOT A PASS.', current_user;
    ELSIF other_oid IS NOT NULL THEN
        IF rls_role IS NOT NULL THEN
            EXECUTE format('SET LOCAL ROLE %I', rls_role);
            RAISE NOTICE '  (switched to % — RLS applies to it)', rls_role;
        END IF;

        PERFORM set_config('app.organization_ids', other_oid::text, true);
        SELECT count(*) INTO n FROM comms.calls WHERE id = cid;
        IF n <> 0 THEN
            RAISE EXCEPTION 'a SIBLING ORGANISATION can read this workshop''s consultations';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  9/10 a sibling organisation cannot read the call log';

        -- 🔴 THE ONE THAT MATTERS MOST. Signals carry SDP and ICE — the network
        -- addresses of two people's machines. A leak here lets one workshop
        -- watch another's call being negotiated.
        -- 🔴 THE VARIABLE IS `cid`, NOT `call_id`. Naming it after the column
        -- made `WHERE call_id = call_id` a SELF-COMPARISON that is true for
        -- every row — Postgres caught it as ambiguous here, but in a query
        -- without the ambiguity it would have silently counted the whole table
        -- and the isolation check would have failed for the wrong reason.
        SELECT count(*) INTO n FROM comms.call_signals WHERE call_id = cid;
        IF n <> 0 THEN
            RAISE EXCEPTION 'a sibling organisation can read another workshop''s SIGNALLING — '
                            'the SDP and ICE candidates of a private call';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  10/10 a sibling organisation cannot read the signalling';
    ELSE
        RAISE WARNING '  9-10/10 SKIPPED: this tenant has only one organisation. NOT A PASS.';
    END IF;

    RESET ROLE;

    RAISE NOTICE 'verify/049: % of 10 checks passed', passed;
    IF passed < 10 THEN
        RAISE WARNING 'verify/049: % checks did NOT run. This run does not prove them.', 10 - passed;
    END IF;
END
$verify$;
