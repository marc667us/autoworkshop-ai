-- verify/059 — the workshop's Request for Parts, PROVEN BY WHAT IT REFUSES.
--
-- ── 🔴 IT ESTABLISHES A CALLER FROM THE START ─────────────────────────────
--
-- verify/058 did not, and it cost two failed rehearsals to find out: with no
-- `app.user_id` the INSERT policy correctly refused the very first row, and the
-- script could not run under the one gate built to catch production-only
-- defects. A verify that declines to act like a real caller has decided in
-- advance never to test the thing most likely to be broken.
--
-- ⚠️ CHECKS 10-13 ARE MEANINGFUL ONLY UNDER `Rehearse Migration On Live`, which
-- connects as `autoworkshop_app` with superuser=false and bypassrls=false.
-- Locally a superuser BYPASSES every policy, so those checks report NOTICEs
-- rather than passing — a green 13/13 on a laptop would be the lie. The count
-- printed at the end says so out loud.

DO $verify$
DECLARE
    tid uuid; oid uuid; me uuid; other_user uuid;
    sup uuid; other_sup uuid; req uuid;
    refused boolean; n int;
    passed int := 0;
BEGIN
    SELECT id INTO me FROM identity.users LIMIT 1;
    IF me IS NULL THEN RAISE EXCEPTION 'verify/059: no user rows'; END IF;

    tid := identity.current_tenant_id();
    IF tid IS NULL THEN
        tid := gen_random_uuid(); oid := gen_random_uuid();
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.bootstrap_user', me::text, true);
        INSERT INTO identity.tenants (id, name, slug, created_by)
        VALUES (tid, 'verify-059', 'verify-059-' || replace(tid::text,'-',''), me);
        INSERT INTO identity.organizations (id, tenant_id, name, org_type, created_by)
        VALUES (oid, tid, 'verify-059 workshop', 'individual_workshop', me);
        PERFORM set_config('app.bootstrap', 'off', true);
    ELSE
        SELECT id INTO oid FROM identity.organizations WHERE tenant_id = tid LIMIT 1;
    END IF;
    IF oid IS NULL THEN RAISE EXCEPTION 'verify/059: no organisation'; END IF;

    -- THE CALLER: a workshop storekeeper, which is who asks a supplier for a part.
    PERFORM set_config('app.tenant_id', tid::text, true);
    PERFORM set_config('app.user_id', me::text, true);
    PERFORM set_config('app.organization_ids', oid::text, true);
    PERFORM set_config('app.current_role', 'storekeeper', true);

    SELECT id INTO sup FROM catalogue.suppliers LIMIT 1;
    IF sup IS NULL THEN
        INSERT INTO catalogue.suppliers (name, slug, country, created_by)
        VALUES ('verify-059 supplier', 'verify-059-' || replace(gen_random_uuid()::text,'-',''), 'GH', me)
        RETURNING id INTO sup;
    END IF;

    -- 1. The table exists with the columns the feature depends on.
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_schema='parts' AND table_name='supplier_requests'
       AND column_name IN ('supplier_id','organization_id','requested_by',
                           'part_description','quantity','status','quote_minor');
    IF n <> 7 THEN RAISE EXCEPTION 'verify/059 #1: expected 7 key columns, found %', n; END IF;
    passed := passed + 1;

    -- 2. A workshop can ask a supplier, and it defaults to `new`.
    INSERT INTO parts.supplier_requests
        (tenant_id, organization_id, requested_by, supplier_id, part_description, quantity)
    VALUES (tid, oid, me, sup, 'Offside rear wheel bearing, 2013 Hilux', 2)
    RETURNING id INTO req;
    PERFORM 1 FROM parts.supplier_requests WHERE id=req AND status='new';
    IF NOT FOUND THEN RAISE EXCEPTION 'verify/059 #2: did not default to new'; END IF;
    passed := passed + 1;

    -- 3. The catalogue part is OPTIONAL — the thing a workshop needs is very
    --    often not in any catalogue, which is the case that needs a human.
    SELECT is_nullable='YES' INTO refused FROM information_schema.columns
     WHERE table_schema='parts' AND table_name='supplier_requests' AND column_name='part_id';
    IF NOT refused THEN RAISE EXCEPTION 'verify/059 #3: part_id must be nullable'; END IF;
    passed := passed + 1;

    -- 4. A quantity of zero or less is a typo, not an order.
    refused := false;
    BEGIN
        INSERT INTO parts.supplier_requests
            (tenant_id, organization_id, requested_by, supplier_id, part_description, quantity)
        VALUES (tid, oid, me, sup, 'Nothing', 0);
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'verify/059 #4: accepted quantity 0'; END IF;
    passed := passed + 1;

    -- 5. 🔴 `quoted` WITHOUT A PRICE IS REFUSED — a status saying an answer
    --    arrived while carrying none is worse than no status.
    refused := false;
    BEGIN
        UPDATE parts.supplier_requests
           SET status='quoted', responded_by=me, responded_at=now() WHERE id=req;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'verify/059 #5: accepted a quote with no price'; END IF;
    passed := passed + 1;

    -- 6. A real quote succeeds — proving #5 refused the MISSING PRICE and not
    --    quoting in general. A guard that refuses everything passes its own
    --    negative test and breaks the feature.
    UPDATE parts.supplier_requests
       SET status='quoted', quote_minor=45000, quote_currency='GHS',
           quote_lead_days=3, responded_by=me, responded_at=now()
     WHERE id=req;
    PERFORM 1 FROM parts.supplier_requests WHERE id=req AND status='quoted';
    IF NOT FOUND THEN RAISE EXCEPTION 'verify/059 #6: a valid quote was refused'; END IF;
    passed := passed + 1;

    -- 7. 🔴 ACCEPTING REQUIRES A QUOTE TO ACCEPT. Without this the workshop
    --    could mark an unanswered request accepted and believe a price had been
    --    agreed. Proven on a SECOND row that was never quoted.
    DECLARE unquoted uuid;
    BEGIN
        INSERT INTO parts.supplier_requests
            (tenant_id, organization_id, requested_by, supplier_id, part_description, quantity)
        VALUES (tid, oid, me, sup, 'Never quoted', 1)
        RETURNING id INTO unquoted;
        refused := false;
        BEGIN
            UPDATE parts.supplier_requests SET status='accepted' WHERE id=unquoted;
        EXCEPTION WHEN check_violation THEN refused := true;
        END;
        IF NOT refused THEN
            RAISE EXCEPTION 'verify/059 #7: accepted a request that was never quoted';
        END IF;
        DELETE FROM parts.supplier_requests WHERE id=unquoted;
    END;
    passed := passed + 1;

    -- 8. A decline must say why.
    refused := false;
    BEGIN
        UPDATE parts.supplier_requests
           SET status='declined', decline_reason=NULL, responded_by=me, responded_at=now()
         WHERE id=req;
    EXCEPTION WHEN check_violation THEN refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'verify/059 #8: accepted a decline with no reason'; END IF;
    passed := passed + 1;

    -- 9. RLS ENABLED **and FORCED**, and all three policies present. A missing
    --    INSERT policy under FORCE means the feature cannot write at all, and it
    --    fails only in production.
    SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
     WHERE ns.nspname='parts' AND c.relname='supplier_requests'
       AND c.relrowsecurity AND c.relforcerowsecurity;
    IF n <> 1 THEN RAISE EXCEPTION 'verify/059 #9: RLS not ENABLED and FORCED'; END IF;
    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname='parts' AND tablename='supplier_requests';
    IF n <> 3 THEN RAISE EXCEPTION 'verify/059 #9: expected 3 policies, found %', n; END IF;
    passed := passed + 1;

    -- ══════════════════════════════════════════════════════════════════════
    -- 10-13: THE POLICIES, AS A REAL CALLER. Only meaningful under rehearsal.
    -- ══════════════════════════════════════════════════════════════════════

    -- 10. 🔴 THIS TABLE MUST NOT CARRY 054's RESTRICTIVE `org_restrict` POLICY.
    --     That is why `parts.purchase_orders` could not be used: RESTRICTIVE is
    --     AND-ed, so it would silently remove the supplier's arm and break the
    --     feature while every other check still passed. Asserted rather than
    --     trusted, because adding this table to 054's list is an easy and
    --     invisible mistake.
    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname='parts' AND tablename='supplier_requests' AND permissive='RESTRICTIVE';
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/059 #10: a RESTRICTIVE policy exists — the supplier can no longer read their own inbox';
    END IF;
    passed := passed + 1;

    -- 11. 🔴 A SUPPLIER USER CAN READ A REQUEST SENT TO THEM. The whole edge
    --     depends on it: without this the marketplace directory is decorative,
    --     exactly as it would have been for customers in 058.
    INSERT INTO catalogue.supplier_users (supplier_id, user_id, member_role, status, invited_by)
    VALUES (sup, me, 'owner', 'active', me)
    ON CONFLICT DO NOTHING;
    PERFORM set_config('app.current_role', 'supplier_owner', true);
    PERFORM set_config('app.organization_ids', gen_random_uuid()::text, true);  -- NOT the workshop's
    SELECT count(*) INTO n FROM parts.supplier_requests WHERE id=req;
    IF n <> 1 THEN
        RAISE NOTICE 'verify/059 #11: supplier could NOT read a request sent to them (n=%) — a DEFECT under rehearsal', n;
    ELSE
        passed := passed + 1;
    END IF;

    -- 12. 🔴 A SUPPLIER MAY NOT READ ANOTHER SUPPLIER'S REQUEST. The arm is a
    --     membership test on THIS supplier, not "any supplier user".
    SELECT id INTO other_sup FROM catalogue.suppliers WHERE id <> sup LIMIT 1;
    IF other_sup IS NULL THEN
        RAISE NOTICE 'verify/059 #12 SKIPPED: only one supplier exists, cannot test cross-supplier isolation';
    ELSE
        UPDATE parts.supplier_requests SET supplier_id=other_sup WHERE id=req;
        SELECT count(*) INTO n FROM parts.supplier_requests WHERE id=req;
        IF n <> 0 THEN
            RAISE NOTICE 'verify/059 #12: a supplier read ANOTHER supplier''s request — expected locally (superuser bypasses RLS), a DEFECT under rehearsal';
        ELSE
            passed := passed + 1;
        END IF;
        -- Put it back as the workshop, which can still see the row.
        PERFORM set_config('app.current_role', 'storekeeper', true);
        PERFORM set_config('app.organization_ids', oid::text, true);
        UPDATE parts.supplier_requests SET supplier_id=sup WHERE id=req;
    END IF;

    -- 13. 🔴 A CUSTOMER MAY NOT RAISE A PARTS REQUEST. Parts procurement is not
    --     a customer function, and a customer holds a real membership in the
    --     workshop's organisation — so an org-only predicate would have allowed
    --     it. Same shape as the 45-screen leak, one layer down.
    PERFORM set_config('app.current_role', 'customer', true);
    refused := false;
    BEGIN
        INSERT INTO parts.supplier_requests
            (tenant_id, organization_id, requested_by, supplier_id, part_description, quantity)
        VALUES (tid, oid, me, sup, 'Customer should not be able to order this', 1);
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN refused := true;
    END;
    IF NOT refused THEN
        RAISE NOTICE 'verify/059 #13: a CUSTOMER raised a parts request — expected locally (superuser bypasses RLS), a DEFECT under rehearsal';
        DELETE FROM parts.supplier_requests
         WHERE part_description = 'Customer should not be able to order this';
    ELSE
        passed := passed + 1;
    END IF;

    PERFORM set_config('app.current_role', 'storekeeper', true);
    DELETE FROM parts.supplier_requests WHERE id=req;

    RAISE NOTICE 'verify/059: % / 13 passed (10-13 are only MEANINGFUL under rehearsal — locally a superuser bypasses RLS)', passed;
END
$verify$;
