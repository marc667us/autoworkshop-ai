-- verify/056 — resource bookings, PROVEN BY THE BOOKING IT REFUSES.
--
-- 🔴 CHECK 3 IS THE ONE THAT MATTERS. A reservation table whose only job is to
-- stop two people taking the same ramp at the same hour is worth nothing if the
-- overlap rule does not fire. Everything else here is scaffolding around it.

DO $verify$
DECLARE
    tid uuid; oid uuid; other_oid uuid; me uuid;
    cust uuid; veh uuid; jc uuid; make_id uuid;
    tool uuid; bay uuid; b1 uuid;
    n int; refused boolean;
    passed int := 0;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/056: no user rows'; END IF;

    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-056', 'verify-056-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-056 workshop', 'individual_workshop', me);
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
    END IF;
    IF oid IS NULL THEN RAISE EXCEPTION 'verify/056: tenant % has no organisation', tid; END IF;

    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.organization_ids', oid::text, true);

    -- fixture: a customer, vehicle, job card, a tool and a bay
    INSERT INTO core.customers (tenant_id, organization_id, display_name, created_by)
    VALUES (tid, oid, 'verify-056 customer', me) RETURNING id INTO cust;
    SELECT id INTO make_id FROM core.vehicle_makes LIMIT 1;
    IF make_id IS NULL THEN
        INSERT INTO core.vehicle_makes (name) VALUES ('verify-056 make') RETURNING id INTO make_id;
    END IF;
    INSERT INTO core.vehicles (tenant_id, organization_id, customer_id, registration_number,
                               make_id, created_by)
    VALUES (tid, oid, cust, 'V56-'||substr(gen_random_uuid()::text,1,6), make_id, me)
    RETURNING id INTO veh;
    INSERT INTO repair.job_cards (tenant_id, organization_id, job_number, customer_id,
                                  vehicle_id, complaint, created_by)
    VALUES (tid, oid, repair.next_job_number(oid), cust, veh, 'verify-056', me)
    RETURNING id INTO jc;
    INSERT INTO parts.tools (tenant_id, organization_id, asset_tag, name, tool_type, created_by)
    VALUES (tid, oid, 'T56-'||substr(gen_random_uuid()::text,1,6), 'verify-056 torque wrench',
            'hand_tool', me)
    RETURNING id INTO tool;
    INSERT INTO core.service_bays (tenant_id, organization_id, name, bay_type, created_by)
    VALUES (tid, oid, 'verify-056 bay', 'general', me) RETURNING id INTO bay;

    -- 1. an honest booking is accepted
    INSERT INTO parts.resource_bookings
      (tenant_id, organization_id, resource_kind, resource_id, job_card_id,
       starts_at, ends_at, booked_by)
    VALUES (tid, oid, 'tool', tool, jc, now(), now() + interval '2 hours', me)
    RETURNING id INTO b1;
    passed := passed + 1;
    RAISE NOTICE '  1/6 a tool booking is accepted';

    -- 2. a booking that ends before it starts is a typo, not a night shift
    refused := false;
    BEGIN
        INSERT INTO parts.resource_bookings
          (tenant_id, organization_id, resource_kind, resource_id, job_card_id,
           starts_at, ends_at, booked_by)
        VALUES (tid, oid, 'bay', bay, jc, now() + interval '3 hours', now(), me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'a booking ending before it starts was ACCEPTED'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  2/6 a backwards time window is refused';

    -- 3. 🔴 THE DEFECT, INJECTED: the same tool, an overlapping hour.
    refused := false;
    BEGIN
        INSERT INTO parts.resource_bookings
          (tenant_id, organization_id, resource_kind, resource_id, job_card_id,
           starts_at, ends_at, booked_by)
        VALUES (tid, oid, 'tool', tool, jc,
                now() + interval '1 hour', now() + interval '3 hours', me);
    EXCEPTION WHEN exclusion_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'the SAME TOOL was booked twice for an overlapping window — '
                        'the reservation screen adds a step and prevents nothing';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  3/6 an overlapping booking of the same tool is refused';

    -- 4. …and a NON-overlapping window on the same tool is still fine.
    -- Without this, the safest-looking constraint is one that blocks the tool
    -- for ever after its first booking.
    INSERT INTO parts.resource_bookings
      (tenant_id, organization_id, resource_kind, resource_id, job_card_id,
       starts_at, ends_at, booked_by)
    VALUES (tid, oid, 'tool', tool, jc,
            now() + interval '4 hours', now() + interval '5 hours', me);
    passed := passed + 1;
    RAISE NOTICE '  4/6 a later, non-overlapping booking of the same tool is accepted';

    -- 5. RELEASING frees the slot rather than blocking it for ever
    UPDATE parts.resource_bookings SET status = 'released', release_reason = 'done'
     WHERE id = b1;
    INSERT INTO parts.resource_bookings
      (tenant_id, organization_id, resource_kind, resource_id, job_card_id,
       starts_at, ends_at, booked_by)
    VALUES (tid, oid, 'tool', tool, jc, now(), now() + interval '2 hours', me);
    passed := passed + 1;
    RAISE NOTICE '  5/6 releasing a booking frees its window';

    -- 6. a booking against a resource that is not in this workshop is refused
    refused := false;
    BEGIN
        INSERT INTO parts.resource_bookings
          (tenant_id, organization_id, resource_kind, resource_id, job_card_id,
           starts_at, ends_at, booked_by)
        VALUES (tid, oid, 'tool', gen_random_uuid(), jc,
                now() + interval '9 hours', now() + interval '10 hours', me);
    EXCEPTION WHEN foreign_key_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a booking against a tool that does not exist here was ACCEPTED';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  6/6 a booking against an unknown resource is refused';

    RAISE NOTICE 'verify/056: % of 6 checks passed', passed;
    IF passed < 6 THEN
        RAISE EXCEPTION 'verify/056: % checks did NOT run', 6 - passed;
    END IF;
END
$verify$;
