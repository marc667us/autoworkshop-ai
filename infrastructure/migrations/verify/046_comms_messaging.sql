-- verify/046 — messaging, PROVEN BY INJECTING EACH FAILURE.
--
-- Same shape as verify/045: builds its own tenant through the registration
-- bootstrap door, shuts it, and — because the local `autoworkshop` role is
-- `superuser=true bypassrls=true` — SET LOCAL ROLEs to a role RLS actually
-- applies to before making any isolation claim. A run that cannot do that skips
-- those checks LOUDLY and does not count them.
--
-- 🔴 CHECK 6 IS THE ONE THAT MATTERS MOST AND IS EASIEST TO GET WRONG.
-- Unread is DERIVED from missing receipts, not stored on the message. The
-- failure mode of a stored flag is invisible in a single-user test and obvious
-- the moment two people share an inbox — so this asserts the two-reader case
-- explicitly rather than the one-reader case that would pass either way.

DO $verify$
DECLARE
    tid uuid; oid uuid; other_oid uuid;
    me uuid; you uuid;
    thread uuid; msg uuid; msg2 uuid;
    n int; refused boolean; ts1 timestamptz; ts2 timestamptz;
    passed int := 0;
    bypasses boolean; rls_role text;
BEGIN
    SELECT id INTO me FROM identity.users ORDER BY created_at LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/046: no user rows — cannot build a fixture'; END IF;
    -- A SECOND person, because a read receipt that works for one reader proves
    -- nothing about a shared inbox.
    SELECT id INTO you FROM identity.users WHERE id <> me ORDER BY created_at LIMIT 1;

    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid(); other_oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-046 tenant', 'verify-046-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-046 workshop', 'individual_workshop', me),
               (other_oid, tid, 'verify-046 OTHER workshop', 'individual_workshop', me);
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
        SELECT id INTO other_oid FROM identity.organizations
         WHERE tenant_id = tid AND id <> oid LIMIT 1;
    END IF;
    IF oid IS NULL THEN RAISE EXCEPTION 'verify/046: tenant % has no organisation', tid; END IF;

    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.organization_ids', oid::text, true);

    SELECT rolsuper OR rolbypassrls INTO bypasses FROM pg_roles WHERE rolname = current_user;
    IF bypasses THEN
        SELECT rolname INTO rls_role FROM pg_roles
         WHERE rolname = 'autoworkshop_app' AND NOT rolsuper AND NOT rolbypassrls;
    END IF;

    -- 1. a thread and a message exist
    INSERT INTO comms.threads (tenant_id, organization_id, thread_kind, subject, created_by)
    VALUES (tid, oid, 'customer', 'verify-046 brake noise', me)
    RETURNING id INTO thread;
    INSERT INTO comms.messages (tenant_id, organization_id, thread_id, sender_user_id, body)
    VALUES (tid, oid, thread, me, 'Is the car ready?')
    RETURNING id INTO msg;
    SELECT count(*) INTO n FROM comms.messages WHERE thread_id = thread;
    IF n <> 1 THEN RAISE EXCEPTION 'the message just inserted is not readable'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  1/9 a thread carries a message';

    -- 2. an empty message is not a message
    refused := false;
    BEGIN
        INSERT INTO comms.messages (tenant_id, organization_id, thread_id, sender_user_id, body)
        VALUES (tid, oid, thread, me, '   ');
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'a whitespace-only message body was ACCEPTED'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  2/9 an empty message body is refused';

    -- 3. 🔴 A SENT MESSAGE CANNOT BE EDITED. On UPDATE…
    refused := false;
    BEGIN
        UPDATE comms.messages SET body = 'something else' WHERE id = msg;
    EXCEPTION WHEN check_violation OR insufficient_privilege THEN refused := true;
    END;
    SELECT count(*) INTO n FROM comms.messages WHERE id = msg AND body = 'Is the car ready?';
    IF n <> 1 THEN RAISE EXCEPTION 'a sent message was REWRITTEN'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  3/9 a sent message cannot be edited (body unchanged)';

    -- 4. …and on DELETE, because a rule enforced on one statement is defeated
    -- by the other. Asserted as an EFFECT — the row still being there is true
    -- whether the refusal was an exception or zero rows matched.
    BEGIN
        DELETE FROM comms.messages WHERE id = msg;
    EXCEPTION WHEN check_violation OR insufficient_privilege THEN NULL;
    END;
    SELECT count(*) INTO n FROM comms.messages WHERE id = msg;
    IF n <> 1 THEN RAISE EXCEPTION 'a sent message was DELETED'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  4/9 a sent message cannot be unsent (row still present)';

    -- 5. the thread's ordering key follows its newest message
    SELECT last_message_at INTO ts1 FROM comms.threads WHERE id = thread;
    INSERT INTO comms.messages (tenant_id, organization_id, thread_id, sender_user_id, body, sent_at)
    VALUES (tid, oid, thread, me, 'Second message', now() + interval '1 minute')
    RETURNING id INTO msg2;
    SELECT last_message_at INTO ts2 FROM comms.threads WHERE id = thread;
    IF ts2 <= ts1 THEN
        RAISE EXCEPTION 'last_message_at did not move with a newer message (% -> %)', ts1, ts2;
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  5/9 last_message_at follows the newest message';

    -- 6. 🔴 UNREAD IS PER PERSON. One reader marking a message read must NOT
    -- mark it read for the other — the exact failure a `messages.is_read`
    -- boolean would have, invisible until two people share an inbox.
    IF you IS NOT NULL THEN
        INSERT INTO comms.read_receipts (tenant_id, organization_id, message_id, user_id)
        VALUES (tid, oid, msg, me);

        SELECT count(*) INTO n FROM comms.messages m
         WHERE m.thread_id = thread
           AND NOT EXISTS (SELECT 1 FROM comms.read_receipts r
                            WHERE r.message_id = m.id AND r.user_id = me);
        IF n <> 1 THEN RAISE EXCEPTION 'after reading 1 of 2, I should have 1 unread, got %', n; END IF;

        SELECT count(*) INTO n FROM comms.messages m
         WHERE m.thread_id = thread
           AND NOT EXISTS (SELECT 1 FROM comms.read_receipts r
                            WHERE r.message_id = m.id AND r.user_id = you);
        IF n <> 2 THEN
            RAISE EXCEPTION 'MY reading marked it read for SOMEBODY ELSE — they should still '
                            'have 2 unread, they have %. Unread is being stored, not derived.', n;
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  6/9 one person reading does not mark it read for another';

        -- 7. re-reading is not a second reading
        INSERT INTO comms.read_receipts (tenant_id, organization_id, message_id, user_id)
        VALUES (tid, oid, msg, me)
        ON CONFLICT ON CONSTRAINT uq_receipt DO NOTHING;
        SELECT count(*) INTO n FROM comms.read_receipts WHERE message_id = msg AND user_id = me;
        IF n <> 1 THEN RAISE EXCEPTION 'a message was recorded as read % times by one person', n; END IF;
        passed := passed + 1;
        RAISE NOTICE '  7/9 marking read twice records one receipt';
    ELSE
        RAISE WARNING '  6-7/9 SKIPPED: only one user exists, so a shared inbox cannot be '
                      'simulated. NOT A PASS.';
    END IF;

    -- 8-9. organisation isolation, under a role RLS applies to
    IF bypasses AND rls_role IS NULL THEN
        RAISE WARNING '  8-9/9 SKIPPED: this connection is % (superuser or bypassrls), so no '
                      'policy applies to it and an isolation claim would be meaningless. '
                      'NOT A PASS. Run rehearse-migration.yml against live.', current_user;
    ELSIF other_oid IS NOT NULL THEN
        IF rls_role IS NOT NULL THEN
            EXECUTE format('SET LOCAL ROLE %I', rls_role);
            RAISE NOTICE '  (switched to % — RLS applies to it)', rls_role;
        END IF;

        PERFORM set_config('app.organization_ids', other_oid::text, true);
        SELECT count(*) INTO n FROM comms.messages WHERE thread_id = thread;
        IF n <> 0 THEN
            RAISE EXCEPTION 'a SIBLING ORGANISATION in the same tenant can read this '
                            'workshop''s messages — the policy is tenant-wide, not org-scoped';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  8/9 a sibling organisation cannot read the conversation';

        SELECT count(*) INTO n FROM comms.threads WHERE id = thread;
        IF n <> 0 THEN
            RAISE EXCEPTION 'a sibling organisation can see the THREAD even if not its messages';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  9/9 a sibling organisation cannot even see the thread exists';
    ELSE
        RAISE WARNING '  8-9/9 SKIPPED: this tenant has only one organisation, so there is '
                      'nothing to be isolated from. NOT A PASS.';
    END IF;

    RESET ROLE;

    RAISE NOTICE 'verify/046: % of 9 checks passed', passed;
    IF passed < 9 THEN
        RAISE WARNING 'verify/046: % checks did NOT run. This run does not prove them.', 9 - passed;
    END IF;
END
$verify$;
