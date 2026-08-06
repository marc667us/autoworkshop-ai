-- verify/053 — slice 12, PROVEN BY INJECTING EACH FAILURE.
--
-- Same shape as verify/045: it BUILDS ITS OWN TENANT through the registration
-- bootstrap door, shuts the door, and asserts EFFECTS rather than mechanisms.
--
-- 🔴 WHAT THIS FILE IS ACTUALLY FOR. 053 makes a claim that a customer-facing
-- screen is about to depend on: "the job card names the customer, and the
-- invoice agrees". Every check below tries to make that claim FALSE — a wrong
-- job card, a wrong invoice, a NULL owner — because a guard is only proven by
-- the failure it refuses, and this repository has a recorded defect for a check
-- that walked through its own gap and passed.
--
-- ⚠️ IT ALSO PROVES THE TRIGGER IS NARROW. A blanket BEFORE UPDATE on
-- `repair.job_cards` would wall every existing job card with an inconsistent
-- pair out of the workshop for ever — the product would appear to break on rows
-- nobody had touched. Check 4 moves a job card's STAGE and requires it to
-- succeed. Without that check, the safest-looking version of this migration is
-- the one that breaks production.

DO $verify$
DECLARE
    tid uuid; oid uuid; me uuid;
    cust_a uuid; cust_b uuid; make_id uuid;
    veh uuid; jc uuid; inv uuid;
    n int; refused boolean; got uuid;
    passed int := 0;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/053: no user rows — cannot build a fixture'; END IF;

    -- ⚠️ A FIXTURE CANNOT DISCOVER A TENANT. `identity.tenants` is
    -- `USING (id = current_tenant_id())`, so with no context it returns zero
    -- rows by design. That cost five refused rehearsals on 2026-08-06.
    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-053 tenant', 'verify-053-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-053 workshop', 'individual_workshop', me);
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
    END IF;
    IF oid IS NULL THEN RAISE EXCEPTION 'verify/053: tenant % has no organisation', tid; END IF;

    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.organization_ids', oid::text, true);

    -- ── the fixture: TWO customers, one vehicle owned by the FIRST ──────────
    --
    -- Two, because every interesting failure in this migration is "customer B
    -- reaching customer A's row", and a single-customer fixture cannot express
    -- it. A fixture that cannot express the failure is a fixture that always
    -- passes.
    INSERT INTO core.customers (tenant_id, organization_id, display_name, created_by)
    VALUES (tid, oid, 'verify-053 customer A', me) RETURNING id INTO cust_a;
    INSERT INTO core.customers (tenant_id, organization_id, display_name, created_by)
    VALUES (tid, oid, 'verify-053 customer B', me) RETURNING id INTO cust_b;

    SELECT id INTO make_id FROM core.vehicle_makes LIMIT 1;
    IF make_id IS NULL THEN
        INSERT INTO core.vehicle_makes (name) VALUES ('verify-053 make') RETURNING id INTO make_id;
    END IF;

    INSERT INTO core.vehicles (tenant_id, organization_id, customer_id, registration_number,
                               make_id, created_by)
    VALUES (tid, oid, cust_a, 'V53-' || substr(gen_random_uuid()::text,1,6), make_id, me)
    RETURNING id INTO veh;

    -- 1. the honest case still works: a job card for the vehicle's OWNER
    INSERT INTO repair.job_cards (tenant_id, organization_id, job_number, customer_id,
                                  vehicle_id, complaint, created_by)
    VALUES (tid, oid, repair.next_job_number(oid), cust_a, veh, 'verify-053 noise', me)
    RETURNING id INTO jc;
    passed := passed + 1;
    RAISE NOTICE '  1/9 a job card for the vehicle owner is accepted';

    -- 2. 🔴 THE DEFECT ITSELF, INJECTED. Customer B books customer A's vehicle.
    refused := false;
    BEGIN
        INSERT INTO repair.job_cards (tenant_id, organization_id, job_number, customer_id,
                                      vehicle_id, complaint, created_by)
        VALUES (tid, oid, repair.next_job_number(oid), cust_b, veh, 'verify-053 stolen', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a job card named a customer who does NOT own the vehicle and was ACCEPTED — '
                        'job card, invoice and warranty can disagree about whose record this is';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  2/9 a job card naming a non-owner is refused on INSERT';

    -- 3. …and on UPDATE. A rule enforced on one statement is defeated by the
    -- other — recorded twice in this repository already (QC 030, variations 032).
    refused := false;
    BEGIN
        UPDATE repair.job_cards SET customer_id = cust_b WHERE id = jc;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'a job card was REASSIGNED to a non-owner by UPDATE — the guard fires on INSERT only';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  3/9 reassigning a job card to a non-owner is refused on UPDATE';

    -- 4. 🔴 AND THE GUARD IS NARROW. Moving the stage must still work, or every
    -- job card already holding an inconsistent pair is walled out of the
    -- workshop for ever. This is the check that distinguishes this migration
    -- from the version of it that breaks production.
    UPDATE repair.job_cards SET stage = 'vehicle_received' WHERE id = jc;
    SELECT count(*) INTO n FROM repair.job_cards WHERE id = jc AND stage = 'vehicle_received';
    IF n <> 1 THEN
        RAISE EXCEPTION 'a job card could not be moved through its own stages — '
                        'the trigger is firing on columns it does not constrain';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  4/9 an unrelated column on a job card can still be updated';

    -- 5. an invoice that names nobody is FILLED from the job card, not refused.
    -- Deriving rather than refusing is what lets this migration ship without a
    -- simultaneous code deploy — see the trigger's own comment.
    INSERT INTO finance.invoices (tenant_id, organization_id, job_card_id, invoice_number,
                                  currency, created_by)
    VALUES (tid, oid, jc, 'INV-53-' || substr(gen_random_uuid()::text,1,8), 'GHS', me)
    RETURNING id INTO inv;
    SELECT customer_id INTO got FROM finance.invoices WHERE id = inv;
    IF got IS DISTINCT FROM cust_a THEN
        RAISE EXCEPTION 'an invoice with no customer was stored as % — expected the job card''s customer %',
                        got, cust_a;
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  5/9 an invoice with no customer is filled from its job card';

    -- 6. an invoice billed to the WRONG customer is refused
    refused := false;
    BEGIN
        INSERT INTO finance.invoices (tenant_id, organization_id, job_card_id, customer_id,
                                      invoice_number, currency, created_by)
        VALUES (tid, oid, jc, cust_b, 'INV-53-' || substr(gen_random_uuid()::text,1,8), 'GHS', me);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'an invoice was billed to a customer who is not on its job card and was ACCEPTED';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  6/9 an invoice billed to the wrong customer is refused';

    -- 7. …and it cannot be re-pointed afterwards either
    refused := false;
    BEGIN
        UPDATE finance.invoices SET customer_id = cust_b WHERE id = inv;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'an invoice was re-pointed to another customer by UPDATE';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  7/9 an invoice cannot be re-pointed to another customer';

    -- 8. 🔴 THE BACKFILL, ASSERTED OVER EVERY ROW THIS CONNECTION CAN SEE —
    -- not over the fixture. The fixture rows were written under the new trigger
    -- and cannot be wrong; the rows that existed BEFORE the migration are the
    -- ones the backfill had to repair, and they are what a customer's invoice
    -- list will actually read.
    SELECT count(*) INTO n
      FROM finance.invoices i
      JOIN repair.job_cards j ON j.id = i.job_card_id AND j.tenant_id = i.tenant_id
     WHERE i.customer_id IS DISTINCT FROM j.customer_id;
    IF n <> 0 THEN
        RAISE EXCEPTION '% invoice(s) are billed to someone other than their job card''s customer — '
                        'the backfill did not converge', n;
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  8/9 every visible invoice agrees with its job card about the customer';

    -- 9. 🔴 THE CUSTOMER PREDICATE ITSELF — the thing the screens depend on.
    --
    -- RLS CANNOT express this and is not being tested here: both customers are
    -- in the SAME organisation, so no policy can separate them. What is asserted
    -- is that a query carrying the customer predicate returns A's invoice to A
    -- and NOT to B. If this ever passes vacuously — because A has no invoice —
    -- check 5 above has already failed.
    SELECT count(*) INTO n FROM finance.invoices
     WHERE organization_id = oid AND customer_id = cust_a AND id = inv;
    IF n <> 1 THEN RAISE EXCEPTION 'customer A cannot see their own invoice'; END IF;

    SELECT count(*) INTO n FROM finance.invoices
     WHERE organization_id = oid AND customer_id = cust_b AND id = inv;
    IF n <> 0 THEN
        RAISE EXCEPTION 'customer B can see customer A''s invoice through the customer predicate';
    END IF;
    passed := passed + 1;
    RAISE NOTICE '  9/9 the customer predicate returns A''s invoice to A and not to B';

    -- 🔴 REPORT THE DENOMINATOR. "8 checks passed" reads as success; "8 of 9"
    -- is the number that shows something was skipped.
    --
    -- ⚠️ AND IT DOES NOT RAISE TO CLEAN UP. `rehearse-migration.yml` wraps this
    -- file in its own BEGIN/ROLLBACK, so the fixture is discarded by the caller.
    -- An exception here would abort under `ON_ERROR_STOP=1` and report a failed
    -- rehearsal for a verify that had just passed every check.
    RAISE NOTICE 'verify/053: % of 9 checks passed', passed;
    IF passed < 9 THEN
        RAISE EXCEPTION 'verify/053: % checks did NOT run. This run does not prove them.', 9 - passed;
    END IF;
END
$verify$;
