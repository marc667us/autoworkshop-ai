-- verify/050 — the three Codex findings, PROVEN BY PERFORMING EACH ATTACK.
--
-- Every check below does the thing the finding said was possible and asserts it
-- is now refused. A fix whose failure has never been demonstrated is the defect
-- class that has cost this repository the most.

DO $verify$
DECLARE
    tid uuid; oid uuid; me uuid; other_user uuid; mk uuid;
    cust_a uuid; cust_b uuid; veh_a uuid; veh_b uuid; jc_b uuid;
    thread_theirs uuid;
    refused boolean; n int;
    passed int := 0;
BEGIN
    SELECT id INTO me FROM identity.users ORDER BY created_at LIMIT 1;
    SELECT id INTO other_user FROM identity.users WHERE id <> me ORDER BY created_at LIMIT 1;
    IF me IS NULL OR other_user IS NULL THEN
        RAISE EXCEPTION 'verify/050: needs two users — cannot build the attack fixture';
    END IF;

    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-050 tenant', 'verify-050-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-050 workshop', 'individual_workshop', me);
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
    END IF;
    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.organization_ids', oid::text, true);

    -- 🔴 TWO CUSTOMERS IN ONE ORGANISATION. This is the exact condition the
    -- findings turn on: org-scoped RLS cannot tell them apart, so if the
    -- application layer does not, nothing does.
    INSERT INTO core.customers (tenant_id, organization_id, customer_type, display_name, created_by)
    VALUES (tid, oid, 'individual', 'verify-050 customer A', me) RETURNING id INTO cust_a;
    INSERT INTO core.customers (tenant_id, organization_id, customer_type, display_name, created_by)
    VALUES (tid, oid, 'individual', 'verify-050 customer B', me) RETURNING id INTO cust_b;

    SELECT id INTO mk FROM core.vehicle_makes ORDER BY name LIMIT 1;
    INSERT INTO core.vehicles (tenant_id, organization_id, customer_id, make_id, registration_number, created_by)
    VALUES (tid, oid, cust_b, mk, 'V050B-' || substr(gen_random_uuid()::text,1,6), me)
    RETURNING id INTO veh_b;

    -- Customer B's job card. Customer A must not be able to reach it.
    INSERT INTO repair.job_cards
      (tenant_id, organization_id, job_number, customer_id, vehicle_id, complaint, created_by)
    VALUES (tid, oid, 'JC-050-' || substr(gen_random_uuid()::text,1,6), cust_b, veh_b,
            'verify-050 B''s brakes', me)
    RETURNING id INTO jc_b;

    -- 1. 🔴 FINDING 3 — a case filed against ANOTHER customer's job card.
    refused := false;
    BEGIN
        INSERT INTO support.cases
          (tenant_id, organization_id, customer_id, job_card_id, reference, subject,
           description, category, created_by)
        VALUES (tid, oid, cust_a, jc_b, 'VFY-050-1', 'Prying', 'Whose job is this?',
                'billing', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'CUSTOMER A RAISED A CASE AGAINST CUSTOMER B''S JOB CARD — '
                        'listCases would then leak B''s job number to A';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  1/5 a case cannot be filed against another customer''s job card';

    -- 2. …nor against another customer's vehicle, which had the same hole.
    refused := false;
    BEGIN
        INSERT INTO support.cases
          (tenant_id, organization_id, customer_id, vehicle_id, reference, subject,
           description, category, created_by)
        VALUES (tid, oid, cust_a, veh_b, 'VFY-050-2', 'Prying', 'Whose car is this?',
                'quality', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a case was filed against ANOTHER customer''s vehicle';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  2/5 a case cannot be filed against another customer''s vehicle';

    -- 3. …and a case against the caller's OWN job card still works, so the
    -- trigger discriminates rather than simply forbidding every link.
    INSERT INTO core.vehicles (tenant_id, organization_id, customer_id, make_id, registration_number, created_by)
    VALUES (tid, oid, cust_a, mk, 'V050A-' || substr(gen_random_uuid()::text,1,6), me)
    RETURNING id INTO veh_a;
    INSERT INTO support.cases
      (tenant_id, organization_id, customer_id, vehicle_id, reference, subject,
       description, category, created_by)
    VALUES (tid, oid, cust_a, veh_a, 'VFY-050-3', 'My own car', 'This one is mine',
            'quality', me);
    passed := passed + 1;
    RAISE NOTICE '  3/5 a case against the customer''s OWN vehicle is still accepted';

    -- 4. 🔴 FINDING 2 — a call pinned to a thread its creator is not part of.
    INSERT INTO comms.threads (tenant_id, organization_id, thread_kind, subject, created_by)
    VALUES (tid, oid, 'customer', 'verify-050 not my conversation', other_user)
    RETURNING id INTO thread_theirs;
    INSERT INTO comms.participants
      (tenant_id, organization_id, thread_id, user_id, party_kind, added_by)
    VALUES (tid, oid, thread_theirs, other_user, 'workshop', other_user);

    refused := false;
    BEGIN
        INSERT INTO comms.calls
          (tenant_id, organization_id, call_kind, medium, subject, status,
           scheduled_for, thread_id, created_by)
        VALUES (tid, oid, 'customer', 'voice', 'verify-050 eavesdrop', 'scheduled',
                now() + interval '1 hour', thread_theirs, me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'A CALL WAS ATTACHED TO A CONVERSATION ITS CREATOR IS NOT PART OF';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  4/5 a call cannot be attached to somebody else''s conversation';

    -- 5. …and a call on a thread the creator IS part of still works.
    INSERT INTO comms.participants
      (tenant_id, organization_id, thread_id, user_id, party_kind, added_by)
    VALUES (tid, oid, thread_theirs, me, 'workshop', other_user);
    INSERT INTO comms.calls
      (tenant_id, organization_id, call_kind, medium, subject, status,
       scheduled_for, thread_id, created_by)
    VALUES (tid, oid, 'customer', 'voice', 'verify-050 legitimate', 'scheduled',
            now() + interval '1 hour', thread_theirs, me);
    passed := passed + 1;
    RAISE NOTICE '  5/5 a call on a conversation the creator IS part of is accepted';

    RAISE NOTICE 'verify/050: % of 5 checks passed', passed;
    IF passed < 5 THEN
        RAISE WARNING 'verify/050: % checks did NOT run.', 5 - passed;
    END IF;
END
$verify$;
