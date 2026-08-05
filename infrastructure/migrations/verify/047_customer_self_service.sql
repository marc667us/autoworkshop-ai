-- verify/047 — customer self-service, PROVEN BY INJECTING EACH FAILURE.
--
-- Same shape as verify/045 and verify/046: builds its own tenant through the
-- registration bootstrap door, shuts it, and SET LOCAL ROLEs to a role RLS
-- actually applies to before making any isolation claim — skipping LOUDLY, and
-- not counting a pass, when it cannot.

DO $verify$
DECLARE
    tid uuid; oid uuid; other_oid uuid; me uuid;
    cust_a uuid; cust_b uuid; veh_a uuid; doc uuid; mk uuid;
    n int; refused boolean; ref1 text; ref2 text;
    passed int := 0;
    bypasses boolean; rls_role text;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/047: no user rows — cannot build a fixture'; END IF;

    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid(); other_oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-047 tenant', 'verify-047-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-047 workshop', 'individual_workshop', me),
               (other_oid, tid, 'verify-047 OTHER workshop', 'individual_workshop', me);
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
        SELECT id INTO other_oid FROM identity.organizations
         WHERE tenant_id = tid AND id <> oid LIMIT 1;
    END IF;
    IF oid IS NULL THEN RAISE EXCEPTION 'verify/047: tenant % has no organisation', tid; END IF;

    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.organization_ids', oid::text, true);

    SELECT rolsuper OR rolbypassrls INTO bypasses FROM pg_roles WHERE rolname = current_user;
    IF bypasses THEN
        SELECT rolname INTO rls_role FROM pg_roles
         WHERE rolname = 'autoworkshop_app' AND NOT rolsuper AND NOT rolbypassrls;
    END IF;

    -- TWO customers, because a rule about "somebody else's vehicle" cannot be
    -- tested with one.
    INSERT INTO core.customers (tenant_id, organization_id, customer_type, display_name, created_by)
    VALUES (tid, oid, 'individual', 'verify-047 customer A', me) RETURNING id INTO cust_a;
    INSERT INTO core.customers (tenant_id, organization_id, customer_type, display_name, created_by)
    VALUES (tid, oid, 'individual', 'verify-047 customer B', me) RETURNING id INTO cust_b;
    -- `make_id` is NOT NULL on core.vehicles. The catalogue of makes is shared
    -- rather than per-tenant, so the fixture reuses one instead of inventing a
    -- make — a fixture that manufactures a state the product forbids is a
    -- recorded defect here (two answerable proposals on one card, 2026-08-04).
    SELECT id INTO mk FROM core.vehicle_makes ORDER BY name LIMIT 1;
    IF mk IS NULL THEN
        RAISE EXCEPTION 'verify/047: core.vehicle_makes is empty — cannot build a vehicle';
    END IF;
    INSERT INTO core.vehicles (tenant_id, organization_id, customer_id, make_id, registration_number, created_by)
    VALUES (tid, oid, cust_a, mk, 'VFY047-' || substr(gen_random_uuid()::text,1,6), me)
    RETURNING id INTO veh_a;

    -- 1. a document is filed against its owner's vehicle
    INSERT INTO core.vehicle_documents
      (tenant_id, organization_id, vehicle_id, customer_id, document_kind, title, expires_on, created_by)
    VALUES (tid, oid, veh_a, cust_a, 'insurance', 'Comprehensive cover',
            current_date + 90, me)
    RETURNING id INTO doc;
    passed := passed + 1;
    RAISE NOTICE '  1/9 a document is filed against its owner''s vehicle';

    -- 2. 🔴 AND NOT AGAINST SOMEBODY ELSE'S. The denormalised customer_id is a
    -- second place the truth can live; this is what stops it lying.
    refused := false;
    BEGIN
        INSERT INTO core.vehicle_documents
          (tenant_id, organization_id, vehicle_id, customer_id, document_kind, title, created_by)
        VALUES (tid, oid, veh_a, cust_b, 'registration', 'Not mine', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a document was filed against ANOTHER customer''s vehicle';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  2/9 a document cannot be filed against somebody else''s vehicle';

    -- 3. …and the same rule survives an UPDATE, because a rule enforced on one
    -- statement is defeated by the other.
    refused := false;
    BEGIN
        UPDATE core.vehicle_documents SET customer_id = cust_b WHERE id = doc;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    SELECT count(*) INTO n FROM core.vehicle_documents WHERE id = doc AND customer_id = cust_a;
    IF n <> 1 THEN
        RAISE EXCEPTION 'a document was REASSIGNED to another customer by UPDATE';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  3/9 the ownership rule holds on UPDATE too';

    -- 4. a maintenance item must be able to come due
    refused := false;
    BEGIN
        INSERT INTO core.maintenance_schedules
          (tenant_id, organization_id, vehicle_id, customer_id, item, created_by)
        VALUES (tid, oid, veh_a, cust_a, 'Oil change', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a maintenance item with NEITHER a due mileage NOR a due date was '
                        'accepted — a reminder that can never fire looks like cover and is not';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  4/9 a maintenance item with no trigger at all is refused';

    -- 5. an authorisation is withdrawn, never silently deactivated
    refused := false;
    BEGIN
        INSERT INTO core.authorized_drivers
          (tenant_id, organization_id, customer_id, full_name, is_active, created_by)
        VALUES (tid, oid, cust_a, 'Withdrawn with no date', false, me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'an inactive driver authorisation was accepted with no withdrawal date';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  5/9 an inactive authorisation must record when it was withdrawn';

    -- 6. 🔴 A RESOLVED CASE MUST BE EXPLAINED. A case that closes with no word
    -- about what was done is one the customer cannot tell was handled.
    refused := false;
    BEGIN
        INSERT INTO support.cases
          (tenant_id, organization_id, customer_id, reference, subject, description,
           category, status, created_by)
        VALUES (tid, oid, cust_a, 'VFY-047-1', 'Bill query', 'The total looks wrong',
                'billing', 'resolved', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a case was RESOLVED with no resolution recorded';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  6/9 a case cannot be resolved without saying what was done';

    -- 7. 🔴 THE CASE REFERENCE ALLOCATOR HANDS OUT DIFFERENT NUMBERS.
    -- The first draft built it from `count(*) + 1`, which two concurrent
    -- callers resolve identically. This cannot prove the CONCURRENT case from
    -- one session, but it does prove the allocator ADVANCES rather than
    -- re-deriving — the property `count(*)` lacks.
    SELECT support.next_case_reference(oid) INTO ref1;
    SELECT support.next_case_reference(oid) INTO ref2;
    IF ref1 = ref2 THEN
        RAISE EXCEPTION 'the case reference allocator returned % twice — it is deriving, '
                        'not allocating, and two simultaneous complaints would collide', ref1;
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  7/9 the case reference allocator advances (% then %)', ref1, ref2;

    -- 8-9. organisation isolation, under a role RLS applies to
    IF bypasses AND rls_role IS NULL THEN
        RAISE WARNING '  8-9/9 SKIPPED: this connection is % (superuser or bypassrls), so no '
                      'policy applies to it and an isolation claim would be meaningless. '
                      'NOT A PASS.', current_user;
    ELSIF other_oid IS NOT NULL THEN
        IF rls_role IS NOT NULL THEN
            EXECUTE format('SET LOCAL ROLE %I', rls_role);
            RAISE NOTICE '  (switched to % — RLS applies to it)', rls_role;
        END IF;

        PERFORM set_config('app.organization_ids', other_oid::text, true);
        SELECT count(*) INTO n FROM core.vehicle_documents WHERE id = doc;
        IF n <> 0 THEN
            RAISE EXCEPTION 'a SIBLING ORGANISATION can read this customer''s vehicle documents';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  8/9 a sibling organisation cannot read the documents';

        SELECT count(*) INTO n FROM core.authorized_drivers WHERE customer_id = cust_a;
        IF n <> 0 THEN
            RAISE EXCEPTION 'a sibling organisation can read who may collect this customer''s car';
        END IF;
        passed := passed + 1;
        RAISE NOTICE '  9/9 a sibling organisation cannot read the driver authorisations';
    ELSE
        RAISE WARNING '  8-9/9 SKIPPED: this tenant has only one organisation. NOT A PASS.';
    END IF;

    RESET ROLE;

    RAISE NOTICE 'verify/047: % of 9 checks passed', passed;
    IF passed < 9 THEN
        RAISE WARNING 'verify/047: % checks did NOT run. This run does not prove them.', 9 - passed;
    END IF;
END
$verify$;
