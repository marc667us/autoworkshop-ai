-- verify/055 — slice 13, PROVEN BY INJECTING EACH FAILURE.
--
-- The interesting claim in 055 is a CONDITIONAL requirement: a towing case must
-- carry a location and a phone number, and every other kind of case must NOT be
-- forced to. A check that only tested the first half would pass happily against
-- a constraint that had broken every billing complaint in the product.
--
-- ⚠️ IT ALSO PROVES THE OLD CATEGORIES SURVIVED. Re-adding a CHECK constraint
-- is a rewrite of the whole list, and dropping a value that existing rows use
-- is how a migration breaks data it never mentioned.

DO $verify$
DECLARE
    tid uuid; oid uuid; me uuid; cust uuid;
    n int; refused boolean;
    passed int := 0;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/055: no user rows'; END IF;

    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-055', 'verify-055-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-055 workshop', 'individual_workshop', me);
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
    END IF;
    IF oid IS NULL THEN RAISE EXCEPTION 'verify/055: tenant % has no organisation', tid; END IF;

    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.organization_ids', oid::text, true);

    INSERT INTO core.customers (tenant_id, organization_id, display_name, created_by)
    VALUES (tid, oid, 'verify-055 customer', me) RETURNING id INTO cust;

    -- 1. a towing case WITH a location and a phone is accepted
    INSERT INTO support.cases
      (tenant_id, organization_id, customer_id, reference, subject, description,
       category, location, contact_phone, created_by, updated_by)
    VALUES (tid, oid, cust, support.next_case_reference(oid), 'verify-055 tow',
            'will not start', 'towing', 'Spintex Road, by the filling station',
            '+233200000000', me, me);
    passed := passed + 1;
    RAISE NOTICE '  1/5 a towing case with a location and a phone is accepted';

    -- 2. 🔴 THE DEFECT, INJECTED: a towing case with NO location.
    -- A recovery request nobody can drive to is useless in a way a missing
    -- billing note is not.
    refused := false;
    BEGIN
        INSERT INTO support.cases
          (tenant_id, organization_id, customer_id, reference, subject, description,
           category, contact_phone, created_by, updated_by)
        VALUES (tid, oid, cust, support.next_case_reference(oid), 'verify-055 tow2',
                'will not start', 'towing', '+233200000000', me, me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a TOWING case with no location was ACCEPTED — the recovery driver '
                        'has nowhere to go';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  2/5 a towing case with no location is refused';

    -- 3. …and with no contact phone
    refused := false;
    BEGIN
        INSERT INTO support.cases
          (tenant_id, organization_id, customer_id, reference, subject, description,
           category, location, created_by, updated_by)
        VALUES (tid, oid, cust, support.next_case_reference(oid), 'verify-055 tow3',
                'will not start', 'towing', 'Spintex Road', me, me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a TOWING case with no contact phone was ACCEPTED';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  3/5 a towing case with no contact phone is refused';

    -- 4. 🔴 AND THE OTHER HALF: a NON-towing case must NOT be forced to carry
    -- them. A constraint that required a location on every case would have
    -- broken every billing complaint in the product, and check 1 alone would
    -- never have noticed.
    INSERT INTO support.cases
      (tenant_id, organization_id, customer_id, reference, subject, description,
       category, created_by, updated_by)
    VALUES (tid, oid, cust, support.next_case_reference(oid), 'verify-055 bill',
            'charged twice', 'billing', me, me);
    passed := passed + 1;
    RAISE NOTICE '  4/5 a billing case still needs no location or phone';

    -- 5. every pre-existing category survived the CHECK being rewritten
    FOR n IN
        SELECT 1 FROM unnest(ARRAY['billing','quality','delay','warranty','account','other']) AS c
    LOOP
        NULL;
    END LOOP;
    BEGIN
        INSERT INTO support.cases
          (tenant_id, organization_id, customer_id, reference, subject, description,
           category, created_by, updated_by)
        SELECT tid, oid, cust, support.next_case_reference(oid), 'verify-055 ' || c,
               'x', c, me, me
          FROM unnest(ARRAY['quality','delay','warranty','account','other']) AS c;
    EXCEPTION WHEN check_violation THEN
        RAISE EXCEPTION 'rewriting the category CHECK DROPPED a category that existing '
                        'rows use — the migration broke data it never mentioned';
    END;
    passed := passed + 1;
    RAISE NOTICE '  5/5 every pre-existing case category still validates';

    RAISE NOTICE 'verify/055: % of 5 checks passed', passed;
    IF passed < 5 THEN
        RAISE EXCEPTION 'verify/055: % checks did NOT run', 5 - passed;
    END IF;
END
$verify$;
