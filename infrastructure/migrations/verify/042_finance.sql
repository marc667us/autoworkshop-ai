-- verify/042 — the append-only rules, PROVEN BY INJECTING EACH FAILURE.
--
-- ⚠️ EVERY CHECK HERE TRIES TO DO THE FORBIDDEN THING AND ASSERTS IT WAS
-- REFUSED. A verify that only does permitted things proves the happy path and
-- nothing else — this repository has recorded a guard that passed 4/4 with its
-- real defect re-injected, and a check that walked through its own gap.
--
-- Runs inside the caller's transaction. `rehearse-migration.yml` wraps this and
-- the migration together and ROLLS BACK, so it is safe against production.

DO $verify$
DECLARE
    tid uuid; oid uuid; jc uuid;
    inv uuid; pay uuid;
    refused boolean;
    rec record;
    me uuid;
    built_own_world boolean := false;
    passed int := 0;
BEGIN
    -- 🔴 THE TENANT CANNOT BE DISCOVERED UNDER PRODUCTION RLS, BY DESIGN.
    --
    -- `identity.tenants` carries `USING (id = identity.current_tenant_id())`, so
    -- a caller with no tenant context reads ZERO rows — you must already know
    -- which tenant you are to see it. That is correct security and it makes a
    -- fixture that discovers a tenant impossible to write.
    --
    -- Locally the role is a SUPERUSER, so the discovery below works and this
    -- verify passed 8/8 while proving nothing about RLS. Against production the
    -- same script left `tid` NULL, `app.tenant_id` empty, and every insert was
    -- refused. Measured, after two failed rehearsals:
    --
    --   ctx: current_user=autoworkshop tenant_setting= current_tenant_id=<null> org=<null>
    --
    -- So: an already-established context WINS, and the caller supplies it
    -- (`rehearse-migration.yml` has a `tenant_id` input). Discovery is the
    -- LOCAL fallback only.
    -- 🔴 THE FIXTURE BUILDS ITS OWN WORLD, because it cannot borrow one.
    --
    -- `identity.tenants` carries `USING (id = identity.current_tenant_id())`, so
    -- a caller with no tenant context reads ZERO rows — you must already know
    -- which tenant you are to see it. That is correct security and it makes a
    -- fixture that DISCOVERS a tenant impossible to write.
    --
    -- Locally the role is a SUPERUSER and discovery worked, so this verify once
    -- reported 8/8 while proving nothing whatever about RLS. Against production
    -- the same script left `tid` NULL and every insert was refused:
    --
    --   ctx: current_user=autoworkshop tenant_setting= current_tenant_id=<null>
    --   ERROR: new row violates row-level security policy for table "invoices"
    --
    -- ⚠️ SO IT OPENS 037/038's REGISTRATION BOOTSTRAP DOOR, which is the SAME
    -- path `register_workshop` uses to create the very first tenant. The door's
    -- guard is `current_user = <owner of register_workshop>`, and a migration or
    -- rehearsal connects as exactly that owner — while the APPLICATION connects
    -- as `autoworkshop_app` and cannot open it. That distinction is 038's whole
    -- point, and it is why this is a legitimate fixture rather than a bypass.
    --
    -- Everything below is created inside the caller's transaction and is rolled
    -- back with it. `rehearse-migration.yml` re-reads `schema_migrations`
    -- afterwards to prove nothing persisted.
    -- Any real user row; `identity.users` carries no RLS, so this is readable
    -- with no tenant context. The bootstrap door requires `created_by` to match
    -- `app.bootstrap_user`, so it must be a genuine id rather than a random one.
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN
        RAISE EXCEPTION 'verify/042: no user rows at all — cannot build a fixture';
    END IF;

    IF tid IS NULL THEN tid := identity.current_tenant_id(); END IF;

    IF tid IS NULL THEN
        tid := gen_random_uuid();
        oid := gen_random_uuid();

        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);

        -- `slug` and `org_type` are NOT NULL with no default. The slug is
        -- suffixed with the tenant's own uuid so two rehearsals running at once
        -- cannot collide on a unique index.
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-042 rehearsal tenant',
                'verify-042-' || replace(tid::text, '-', ''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-042 rehearsal workshop', 'individual_workshop', me);

        -- Shut the door again the moment it is no longer needed. Leaving it open
        -- for the rest of the transaction would mean every later statement in
        -- this verify ran under a permission the application never has, and the
        -- checks below would be testing the wrong world.
        PERFORM set_config('app.bootstrap', 'off', true);
        built_own_world := true;
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
    END IF;

    PERFORM set_config('app.tenant_id', tid::text, true);

    IF oid IS NULL THEN
        RAISE EXCEPTION 'verify/042: tenant % has no organisation to bill from', tid;
    END IF;

    -- `finance.invoices.job_card_id` carries no foreign key — a job card is
    -- scoped by tenant + organisation and a composite FK would add nothing RLS
    -- does not already enforce. So a synthetic id is honest here: this verify is
    -- about the MONEY rules, and borrowing a real card would make it depend on
    -- seed data that production may not have.
    SELECT id INTO jc FROM repair.job_cards
     WHERE tenant_id = tid AND organization_id = oid LIMIT 1;
    IF jc IS NULL THEN jc := gen_random_uuid(); END IF;

    -- ── diagnostic, printed before the first insert ────────────────────
    -- Measure, do not infer. The first two rehearsals failed here and guessing
    -- which setting the policy reads is what produced the second failure.
    RAISE NOTICE '  ctx: current_user=% tenant_setting=% current_tenant_id=% org=%',
        current_user,
        COALESCE(current_setting('app.tenant_id', true), '<unset>'),
        COALESCE(identity.current_tenant_id()::text, '<null>'),
        COALESCE(oid::text, '<null>');
    RAISE NOTICE '  is_platform_admin=%', identity.is_platform_admin();
    FOR rec IN
        SELECT policyname, cmd, COALESCE(qual, '-') AS using_expr,
               COALESCE(with_check, '-') AS check_expr
          FROM pg_policies WHERE schemaname='finance' AND tablename='invoices'
    LOOP
        RAISE NOTICE '  policy % (%): USING % CHECK %',
            rec.policyname, rec.cmd, rec.using_expr, rec.check_expr;
    END LOOP;

    -- 1. a draft invoice can be built
    INSERT INTO finance.invoices (tenant_id, organization_id, job_card_id,
                                  invoice_number, currency, tax_rate_percent)
    VALUES (tid, oid, jc, 'VERIFY-042-' || substr(gen_random_uuid()::text, 1, 8), 'GHS', 15)
    RETURNING id INTO inv;
    INSERT INTO finance.invoice_lines (tenant_id, organization_id, invoice_id, position,
                                       line_kind, description, quantity, unit_price)
    VALUES (tid, oid, inv, 0, 'labour', 'Diagnostic hour', 2, 150.00);
    passed := passed + 1;
    RAISE NOTICE '  1/8 a draft invoice accepts lines';

    -- 2. the generated line total is the DATABASE's arithmetic, not ours
    PERFORM 1 FROM finance.invoice_lines WHERE invoice_id = inv AND line_total = 300.00;
    IF NOT FOUND THEN RAISE EXCEPTION 'line_total was not computed as 300.00'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  2/8 line_total is generated by the database';

    -- 3. issue it
    UPDATE finance.invoices
       SET status = 'issued', issued_at = now(),
           net_total = 300.00, tax_total = 45.00, gross_total = 345.00
     WHERE id = inv;
    passed := passed + 1;
    RAISE NOTICE '  3/8 a draft invoice can be issued';

    -- 4. INJECT: change what an issued invoice says is owed
    refused := false;
    BEGIN
        UPDATE finance.invoices SET gross_total = 1.00 WHERE id = inv;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'an ISSUED invoice let its total be changed'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  4/8 an issued invoice refuses a change to what is owed';

    -- 5. INJECT: add a line to an issued invoice (the INSERT case a guard
    --    written only for UPDATE would miss)
    refused := false;
    BEGIN
        INSERT INTO finance.invoice_lines (tenant_id, organization_id, invoice_id,
                                           position, line_kind, description,
                                           quantity, unit_price)
        VALUES (tid, oid, inv, 1, 'part', 'Smuggled-in charge', 1, 999.00);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'a line was ADDED to an issued invoice'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  5/8 an issued invoice refuses a NEW line (INSERT, not just UPDATE)';

    -- 6. a payment can be recorded
    INSERT INTO finance.payments (tenant_id, organization_id, invoice_id, amount,
                                  currency, payment_method)
    VALUES (tid, oid, inv, 100.00, 'GHS', 'cash') RETURNING id INTO pay;
    passed := passed + 1;
    RAISE NOTICE '  6/8 a payment can be recorded';

    -- 7. INJECT: edit and delete a payment
    refused := false;
    BEGIN
        UPDATE finance.payments SET amount = 5.00 WHERE id = pay;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'a payment was EDITED'; END IF;
    refused := false;
    BEGIN
        DELETE FROM finance.payments WHERE id = pay;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'a payment was DELETED'; END IF;
    passed := passed + 1;
    RAISE NOTICE '  7/8 a payment refuses both UPDATE and DELETE';

    -- 8. INJECT: refund more than was paid
    refused := false;
    BEGIN
        INSERT INTO finance.refunds (tenant_id, organization_id, payment_id, amount,
                                     currency, reason, refund_method)
        VALUES (tid, oid, pay, 500.00, 'GHS', 'over-refund attempt', 'cash');
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'refunded MORE than was paid'; END IF;
    -- and a legitimate partial refund is still allowed, so the rule is a rule
    -- and not a wall
    INSERT INTO finance.refunds (tenant_id, organization_id, payment_id, amount,
                                 currency, reason, refund_method)
    VALUES (tid, oid, pay, 40.00, 'GHS', 'goodwill', 'cash');
    passed := passed + 1;
    RAISE NOTICE '  8/8 a refund cannot exceed the payment, but a partial one is allowed';

    RAISE NOTICE 'verify/042: OK (%/8)', passed;
END $verify$;
