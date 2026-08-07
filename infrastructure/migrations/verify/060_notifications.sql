-- verify/060 — notifications, PROVEN BY WHAT THEY REFUSE AND WHAT THEY SUPPRESS.
--
-- 🔴 THE CHECKS THAT MATTER ARE 4, 5, 6 AND 11. Writing a row is easy. The
-- value is in: a direct INSERT being refused (the only door is the function),
-- the same event never arriving twice, a switched-off preference writing
-- NOTHING at all, and one recipient being unable to read another's mail.
--
-- ⚠️ CHECKS 4 AND 11 ARE ONLY MEANINGFUL UNDER REHEARSAL. Locally the role is
-- `superuser=true bypassrls=true`, so every policy is bypassed and a refusal
-- cannot be observed. They RAISE NOTICE locally and are counted only when they
-- genuinely refuse — the same convention as verify/058, and the reason
-- `Rehearse Migration On Live` exists at all.

DO $verify$
DECLARE
    tid uuid; oid uuid; me uuid; other_user uuid;
    nid uuid; nid2 uuid;
    refused boolean;
    n int;
    passed int := 0;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/060: no user rows'; END IF;

    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-060', 'verify-060-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-060 workshop', 'individual_workshop', me);
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
    END IF;
    IF oid IS NULL THEN RAISE EXCEPTION 'verify/060: no organisation'; END IF;

    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.user_id', me::text, true);
    PERFORM set_config('app.organization_ids', oid::text, true);
    PERFORM set_config('app.current_role', 'reception_staff', true);

    -- 1. The table exists with the columns delivery depends on.
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema = 'comms' AND table_name = 'notifications'
       AND column_name IN ('recipient_id','event_key','channel','subject','body',
                           'status','attempts','dedupe_key','sent_at');
    IF n <> 9 THEN RAISE EXCEPTION 'verify/060 #1: expected 9 key columns, found %', n; END IF;
    passed := passed + 1;

    -- 2. RLS is not merely ENABLED but FORCED. An un-FORCEd policy is inert for
    --    the table owner, which is exactly how the app connects on Render — the
    --    defect that made every enterprise policy in the Solar schema
    --    decorative for weeks.
    SELECT count(*) INTO n FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname='comms' AND c.relname='notifications'
       AND c.relrowsecurity AND c.relforcerowsecurity;
    IF n <> 1 THEN RAISE EXCEPTION 'verify/060 #2: RLS is not ENABLED and FORCED'; END IF;
    passed := passed + 1;

    -- 3. The function enqueues, and returns the id it created.
    nid := comms.enqueue_notification(
        tid, oid, me, 'service_request.created', 'email',
        'A new service request', 'A customer has filed a request.',
        'someone@example.test', 'service_request', gen_random_uuid(),
        'verify060:' || gen_random_uuid()::text);
    IF nid IS NULL THEN RAISE EXCEPTION 'verify/060 #3: enqueue returned NULL for an enabled event'; END IF;
    passed := passed + 1;

    -- 4. 🔴 A DIRECT INSERT IS REFUSED. The whole security argument of this
    --    migration is that the only way in is the function: a policy permissive
    --    enough to let a customer notify reception would also let a customer
    --    forge a message wearing the workshop's voice.
    refused := false;
    BEGIN
        INSERT INTO comms.notifications
            (tenant_id, organization_id, recipient_id, event_key, channel,
             subject, body, dedupe_key)
        VALUES (tid, oid, me, 'forged.event', 'email', 'Forged', 'Forged',
                'verify060-forged:' || gen_random_uuid()::text);
    EXCEPTION WHEN insufficient_privilege THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE NOTICE 'verify/060 #4: a DIRECT INSERT succeeded — expected locally (superuser bypasses RLS), a DEFECT under rehearsal';
    ELSE
        passed := passed + 1;
    END IF;

    -- 5. 🔴 THE SAME EVENT DOES NOT ARRIVE TWICE. A retry, a double-submitted
    --    form and two overlapping drains all produce a second attempt at one
    --    message; the database refuses it rather than trusting every caller.
    nid2 := comms.enqueue_notification(
        tid, oid, me, 'service_request.created', 'email',
        'A new service request', 'A customer has filed a request.',
        'someone@example.test', 'service_request', NULL,
        (SELECT dedupe_key FROM comms.notifications WHERE id = nid));
    IF nid2 IS NOT NULL THEN RAISE EXCEPTION 'verify/060 #5: a duplicate dedupe_key created a SECOND notification'; END IF;
    SELECT count(*) INTO n FROM comms.notifications
     WHERE dedupe_key = (SELECT dedupe_key FROM comms.notifications WHERE id = nid);
    IF n <> 1 THEN RAISE EXCEPTION 'verify/060 #5: expected exactly 1 row for the dedupe key, found %', n; END IF;
    passed := passed + 1;

    -- 6. 🔴 A SWITCHED-OFF PREFERENCE WRITES NOTHING. Not a suppressed row — no
    --    row. A record would claim the product tried to say something it was
    --    explicitly asked not to say.
    INSERT INTO core.notification_preferences
        (tenant_id, organization_id, user_id, event_key, channel, is_enabled, created_by)
    VALUES (tid, oid, me, 'quiet.event', 'email', false, me)
    ON CONFLICT ON CONSTRAINT uq_notification_pref DO UPDATE SET is_enabled = false;

    nid2 := comms.enqueue_notification(
        tid, oid, me, 'quiet.event', 'email', 'Should not exist', 'Should not exist',
        NULL, NULL, NULL, 'verify060-quiet:' || gen_random_uuid()::text);
    IF nid2 IS NOT NULL THEN RAISE EXCEPTION 'verify/060 #6: a DISABLED preference still produced a notification'; END IF;
    SELECT count(*) INTO n FROM comms.notifications WHERE event_key = 'quiet.event';
    IF n <> 0 THEN RAISE EXCEPTION 'verify/060 #6: a disabled event wrote % row(s)', n; END IF;
    passed := passed + 1;

    -- 7. SILENCE MEANS ENABLED. A workshop that never opened the settings
    --    screen must still be told things — otherwise "no preferences yet"
    --    looks exactly like "notifications are broken".
    nid2 := comms.enqueue_notification(
        tid, oid, me, 'never.configured', 'email', 'Default on', 'Default on',
        NULL, NULL, NULL, 'verify060-default:' || gen_random_uuid()::text);
    IF nid2 IS NULL THEN RAISE EXCEPTION 'verify/060 #7: an event with NO preference row was suppressed'; END IF;
    passed := passed + 1;

    -- 8. A USER-SPECIFIC preference beats the organisation default. Most
    --    specific wins, or a personal opt-out is silently overridden.
    INSERT INTO core.notification_preferences
        (tenant_id, organization_id, user_id, event_key, channel, is_enabled, created_by)
    VALUES (tid, oid, NULL, 'mixed.event', 'email', true, me)
    ON CONFLICT ON CONSTRAINT uq_notification_pref DO UPDATE SET is_enabled = true;
    INSERT INTO core.notification_preferences
        (tenant_id, organization_id, user_id, event_key, channel, is_enabled, created_by)
    VALUES (tid, oid, me, 'mixed.event', 'email', false, me)
    ON CONFLICT ON CONSTRAINT uq_notification_pref DO UPDATE SET is_enabled = false;

    nid2 := comms.enqueue_notification(
        tid, oid, me, 'mixed.event', 'email', 'Should not exist', 'Should not exist',
        NULL, NULL, NULL, 'verify060-mixed:' || gen_random_uuid()::text);
    IF nid2 IS NOT NULL THEN RAISE EXCEPTION 'verify/060 #8: the org default overrode the user''s own opt-out'; END IF;
    passed := passed + 1;

    -- 9. 🔴 A ROW CANNOT CLAIM DELIVERY WITH NO EVIDENCE OF IT. `sent` without
    --    `sent_at` is the state every "did they actually get it?" question dies
    --    in, so the constraint refuses it.
    refused := false;
    BEGIN
        UPDATE comms.notifications SET status = 'sent', sent_at = NULL WHERE id = nid;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'verify/060 #9: accepted status=sent with no sent_at'; END IF;
    passed := passed + 1;

    -- 10. The drain's own path works: claim, then record. A failure keeps the
    --     row PENDING and counts the attempt — it does not falsify it as sent.
    PERFORM comms.record_notification_result(nid, false, 'connection refused');
    SELECT attempts INTO n FROM comms.notifications WHERE id = nid;
    IF n <> 1 THEN RAISE EXCEPTION 'verify/060 #10: a failure did not count an attempt (attempts=%)', n; END IF;
    PERFORM 1 FROM comms.notifications WHERE id = nid AND status = 'pending' AND last_error IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'verify/060 #10: a failed send did not stay pending with an error'; END IF;

    PERFORM comms.record_notification_result(nid, true, NULL);
    PERFORM 1 FROM comms.notifications WHERE id = nid AND status='sent' AND sent_at IS NOT NULL AND last_error IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'verify/060 #10: a successful send was not recorded as sent'; END IF;
    passed := passed + 1;

    -- 11. 🔴 ONE RECIPIENT MAY NOT READ ANOTHER'S. A notification carries the
    --     subject and body of a message addressed to one person. An
    --     organisation-wide predicate here would let every member of a workshop
    --     read every customer's quotes — the 45-screen leak, one layer down.
    other_user := gen_random_uuid();
    PERFORM set_config('app.user_id', other_user::text, true);
    PERFORM set_config('app.current_role', 'customer', true);
    SELECT count(*) INTO n FROM comms.notifications WHERE id = nid;
    IF n <> 0 THEN
        RAISE NOTICE 'verify/060 #11: another user read this notification — expected locally (superuser bypasses RLS), a DEFECT under rehearsal';
    ELSE
        passed := passed + 1;
    END IF;

    -- Restore the caller so the rest can write.
    PERFORM set_config('app.user_id', me::text, true);
    PERFORM set_config('app.current_role', 'reception_staff', true);

    -- 12. 🔴 A CUSTOMER IS NEVER NOTIFIED AS "STAFF". `customer` is a real
    --     membership role in the workshop's OWN organisation — the fact behind
    --     every ungated-read defect in this codebase. If the recipient query
    --     said "everyone in the org", the workshop's intake would be emailed
    --     back to the very customers who filed it, complete with another
    --     customer's complaint and vehicle.
    --
    --     Proven with a REAL customer membership, not by reading the role list:
    --     a check that inspects the source of the thing it is checking passes
    --     for the same reason the code was written, which is no evidence at all.
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, created_by)
    VALUES (gen_random_uuid(), 'verify060-cust-' || gen_random_uuid()::text,
            'verify060-customer@example.test', 'Verify 060 Customer', me)
    RETURNING id INTO other_user;

    INSERT INTO identity.memberships
        (tenant_id, organization_id, user_id, role_name, status, created_by)
    VALUES (tid, oid, other_user, 'customer', 'active', me)
    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;

    PERFORM comms.notify_workshop_staff(
        tid, oid, 'service_request.created', 'Intake', 'A customer asked for service.',
        'service_request', gen_random_uuid(), 'verify060-staff:' || gen_random_uuid()::text);

    SELECT count(*) INTO n FROM comms.notifications
     WHERE recipient_id = other_user AND event_key = 'service_request.created';
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/060 #12: a CUSTOMER received the workshop''s intake notification (% row(s))', n;
    END IF;
    passed := passed + 1;

    -- 13. `notify_user` resolves the recipient's address itself, so the address
    --     never has to travel through the caller's session. A row with no
    --     `to_address` would sit in the queue failing for ever.
    n := comms.notify_user(
        tid, oid, other_user, 'service_request.decided', 'Decided', 'Your request was decided.',
        'service_request', gen_random_uuid(), 'verify060-user:' || gen_random_uuid()::text);
    IF n = 0 THEN RAISE EXCEPTION 'verify/060 #13: notify_user wrote nothing for an active user'; END IF;
    PERFORM 1 FROM comms.notifications
      WHERE recipient_id = other_user AND event_key = 'service_request.decided'
        AND to_address = 'verify060-customer@example.test';
    IF NOT FOUND THEN RAISE EXCEPTION 'verify/060 #13: notify_user did not record the recipient address'; END IF;
    passed := passed + 1;

    DELETE FROM comms.notifications WHERE dedupe_key LIKE 'verify060%';
    DELETE FROM comms.notifications WHERE recipient_id = other_user;
    DELETE FROM identity.memberships WHERE user_id = other_user;
    DELETE FROM identity.users WHERE id = other_user;
    DELETE FROM core.notification_preferences
     WHERE organization_id = oid AND event_key IN ('quiet.event','mixed.event');

    RAISE NOTICE 'verify/060: % / 13 passed (4 and 11 are only MEANINGFUL under rehearsal — locally a superuser bypasses RLS)', passed;
END
$verify$;
