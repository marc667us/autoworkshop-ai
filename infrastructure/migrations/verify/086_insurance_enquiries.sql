-- verify/086 — an anonymous stranger can lodge an enquiry, and cannot lodge it
--               anywhere they were not invited to
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 CHECKS 4 AND 5 ARE THE EVIDENCE. Everything before them is fixture, and
-- everything after is the insurer's side.
--
-- ⚠️ THE MOST IMPORTANT THING IN THIS FILE IS *WHICH ROLE* EACH CHECK RUNS AS.
-- Read this before changing anything below.
--
-- `insurance.submit_enquiry()` is SECURITY DEFINER, so it executes as the table
-- OWNER. On THIS workstation the owner (`autoworkshop`) is `rolsuper = t,
-- rolbypassrls = t`, which means **a check that only calls the function never
-- evaluates the INSERT policy at all**. It would pass here with
-- `enquiries_public_insert` deleted, and then fail on Render — where the owner
-- is not a superuser and the policy is the only thing standing between a
-- stranger and an arbitrary insurer's inbox.
--
-- That difference has produced a green local result and a red production one
-- FOUR times in this repository (083's empty listing, 084's backfill, the
-- backup's pg_dump, 085's promotion CTE) and once inside this very migration
-- (the `RETURNING` clause, check 4c).
--
-- ── WHY THERE IS A THROWAWAY PROBE ROLE ──────────────────────────────────
--
-- After Codex's review, `autoworkshop_app` no longer holds table INSERT — the
-- only route in is the definer function. That is the right privilege model and
-- it makes the policy UNTESTABLE by either role available here: the app role
-- cannot reach the statement, and the owner bypasses RLS.
--
-- So checks 4a–4c create a NOLOGIN role that holds exactly `INSERT` and
-- `SELECT`, exercise the policy as that role, and drop it again. `CREATE ROLE`
-- is transactional in PostgreSQL, and the role is explicitly revoked and
-- dropped at the end because this file COMMITS (like verify/080 and 085) rather
-- than rolling back.
--
-- ⚠️ THE PROBE ROLE IS NOT A BACK DOOR. It exists only inside this run, holds
-- no LOGIN, and is dropped before the file finishes. Check 3 asserts separately
-- that the REAL application role cannot do what the probe role is granted.
--
-- ── WHAT THIS FILE CANNOT ESTABLISH ───────────────────────────────────────
--
-- It proves the DATABASE refuses a forged enquiry. It does not prove the API
-- exposes the write on an unauthenticated route, nor that the insurer's screen
-- reads it — those are TypeScript, and the halves are deliberately in different
-- languages so neither can be type-checked into agreeing with the other.
--
-- ▶ The API half lives in `insurance-enquiries.integration.spec.ts`.
-- ══════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
    v_subject_a TEXT := 'verify-086-a-' || replace(gen_random_uuid()::text, '-', '');
    v_subject_b TEXT := 'verify-086-b-' || replace(gen_random_uuid()::text, '-', '');
    v_user_a    uuid;
    v_user_b    uuid;
    ra          record;   -- insurer A: sells the product being enquired about
    rb          record;   -- insurer B: the neighbour who must never see it
    v_pub       uuid;     -- A's PUBLISHED + VERIFIED product
    v_draft     uuid;     -- A's unpublished draft
    v_enquiry   uuid;
    v_probe     uuid;
    n           int;
    v_refused   boolean;
    v_qual      TEXT;
    v_forced    boolean;
    passed      int := 0;
BEGIN
    PERFORM set_config('app.current_role', 'admin', true);

    -- ── 0. the table is FORCED, not merely ENABLED ────────────────────────
    -- 🔴 `ENABLE ROW LEVEL SECURITY` ALONE LEAVES THE TABLE OWNER EXEMPT. A
    -- schema that reads as protected while the owner walks straight through it
    -- is the shape recorded on 2026-08-18 in this account's other project,
    -- where `relforcerowsecurity` was false on all eighteen tables and every
    -- isolation assertion was therefore vacuous.
    SELECT relrowsecurity AND relforcerowsecurity INTO v_forced
      FROM pg_class WHERE oid = 'insurance.enquiries'::regclass;
    IF NOT coalesce(v_forced, false) THEN
        RAISE EXCEPTION 'verify/086 #0: insurance.enquiries is not both ENABLE and '
                        'FORCE row level security. Without FORCE the owner is exempt '
                        'and every check below is vacuous.';
    END IF;
    passed := passed + 1;

    -- ── 1. the INSERT policy is RELATIONAL, not `WITH CHECK (true)` ───────
    -- Asserted as TEXT, on purpose, as a cheap guard against the regression the
    -- migration header names by name. It is NOT a substitute for check 4 —
    -- Codex correctly pointed out that a textual assertion cannot establish
    -- that the policy ADJUDICATES anything, only that it mentions the right
    -- identifiers.
    SELECT pg_get_expr(polwithcheck, polrelid) INTO v_qual
      FROM pg_policy
     WHERE polrelid = 'insurance.enquiries'::regclass
       AND polname  = 'enquiries_public_insert';
    IF v_qual IS NULL OR v_qual !~ 'products' OR v_qual !~ 'is_published' THEN
        RAISE EXCEPTION 'verify/086 #1: enquiries_public_insert no longer checks the '
                        'product. Its WITH CHECK is now: %. A constant check here '
                        'lets a stranger forge a row into any insurer.', coalesce(v_qual, '(none)');
    END IF;
    passed := passed + 1;

    -- ── 2. two insurers, registered through the PRODUCTION function ───────
    -- Not raw INSERTs. Ask of any green proof: could the PRODUCT have produced
    -- this fixture? Here it did.
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), v_subject_a, v_subject_a || '@verify.local', 'Verify Insurer A', 'active')
    RETURNING id INTO v_user_a;
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), v_subject_b, v_subject_b || '@verify.local', 'Verify Insurer B', 'active')
    RETURNING id INTO v_user_b;

    SELECT * INTO ra FROM identity.register_insurer(v_subject_a, 'Verify 086 Assurance A', 'Head office');
    SELECT * INTO rb FROM identity.register_insurer(v_subject_b, 'Verify 086 Assurance B', 'Head office');

    -- One product a shopper can see, and one they must not.
    INSERT INTO insurance.products
        (tenant_id, organization_id, name, summary, cover_type, premium, currency,
         term_months, is_published, is_verified, created_by)
    VALUES (ra.o_tenant_id, ra.o_organization_id, 'Verify 086 Comprehensive',
            'Cover for the verify run', 'comprehensive', 1200.00, 'GHS', 12, true, true, v_user_a)
    RETURNING id INTO v_pub;

    INSERT INTO insurance.products
        (tenant_id, organization_id, name, summary, cover_type, premium, currency,
         term_months, is_published, is_verified, created_by)
    VALUES (ra.o_tenant_id, ra.o_organization_id, 'Verify 086 Draft',
            'Never published', 'third_party', 300.00, 'GHS', 12, false, false, v_user_a)
    RETURNING id INTO v_draft;
    passed := passed + 1;

    -- ── 3. 🔴 THE APPLICATION ROLE CANNOT WRITE TO THIS TABLE AT ALL ─────
    --
    -- The strongest single statement in this file, and it is a PRIVILEGE
    -- assertion rather than a policy one. Codex reproduced the alternative
    -- against this database: with table INSERT granted, the app role could
    -- write a policy-compliant row carrying a premium, a currency and a product
    -- name of its own invention, because `enquiries_public_insert` adjudicates
    -- the three KEY columns and is indifferent to the rest.
    --
    -- ⚠️ IF THIS CHECK EVER FAILS, THE FIX IS TO REVOKE THE GRANT — never to
    -- widen the policy to cover the other columns. The derivation belongs in
    -- `submit_enquiry()`, where it can read the product; a policy cannot
    -- express "equal to whatever that row says" for six columns without
    -- becoming the function.
    PERFORM set_config('app.current_role', '', true);
    PERFORM set_config('app.tenant_id',    '', true);
    PERFORM set_config('app.organization_ids', '', true);
    SET LOCAL ROLE autoworkshop_app;

    IF (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
        RAISE EXCEPTION 'verify/086: running as %, which is a SUPERUSER — RLS is '
                        'bypassed and the checks below would be vacuous.', current_user;
    END IF;

    IF has_table_privilege('insurance.enquiries', 'INSERT') THEN
        RAISE EXCEPTION 'verify/086 #3: autoworkshop_app holds INSERT on '
                        'insurance.enquiries. The policy does NOT constrain the '
                        'premium, currency, product_name or enquirer_user_id, so this '
                        'grant lets the application forge all four. The only write '
                        'path must be insurance.submit_enquiry().';
    END IF;

    -- And the UPDATE it does hold must be column-scoped, or an insurer can
    -- rewrite the shopper's own words. Reproduced before it was fixed:
    -- `SET contact_email = 'hijacked@…', premium = 0.01` -> UPDATE 1.
    IF has_column_privilege('insurance.enquiries', 'contact_email', 'UPDATE')
       OR has_column_privilege('insurance.enquiries', 'premium', 'UPDATE') THEN
        RAISE EXCEPTION 'verify/086 #3: autoworkshop_app may UPDATE contact_email or '
                        'premium. The price snapshot exists so the record of what was '
                        'ADVERTISED survives a re-pricing; an insurer that can edit it '
                        'can rewrite what a customer was quoted.';
    END IF;
    IF NOT has_column_privilege('insurance.enquiries', 'status', 'UPDATE') THEN
        RAISE EXCEPTION 'verify/086 #3: autoworkshop_app cannot UPDATE status — the '
                        'insurer''s only control over its inbox does nothing.';
    END IF;
    RESET ROLE;
    passed := passed + 1;

    -- ══════════════════════════════════════════════════════════════════════
    -- 4. THE POLICY ITSELF, EXERCISED BY A THROWAWAY ROLE.
    --
    -- See the header for why this role has to exist. It holds exactly what is
    -- needed to reach the statement the policy adjudicates, and nothing else.
    -- ══════════════════════════════════════════════════════════════════════
    PERFORM set_config('app.current_role', 'admin', true);
    EXECUTE 'CREATE ROLE verify086_probe NOLOGIN';
    -- 🔴 IT INHERITS `autoworkshop_app` AND ADDS EXACTLY ONE PRIVILEGE.
    --
    -- That is deliberate and it is what makes checks 4a-4c meaningful: the probe
    -- is the PRODUCTION ROLE PLUS TABLE INSERT, so anything it proves about the
    -- policy holds for the role Render actually connects as, and the single
    -- difference is the grant check 3 asserts is absent.
    --
    -- ⚠️ BUILDING IT UP FROM NOTHING DID NOT WORK, AND THE FAILURE IS WORTH
    -- KEEPING: Postgres expands EVERY policy on the table when it plans the
    -- statement, not only the one whose command matches. So a bare role hit
    -- `permission denied for function current_organization_id`, and then
    -- `permission denied for table users` from inside `is_platform_admin()` —
    -- both raised BEFORE the INSERT policy was ever evaluated, and neither has
    -- anything to do with what is being tested. Found by running this file, not
    -- by reading it.
    EXECUTE 'GRANT autoworkshop_app TO verify086_probe';
    EXECUTE 'GRANT INSERT ON insurance.enquiries TO verify086_probe';

    PERFORM set_config('app.current_role', '', true);
    PERFORM set_config('app.tenant_id',    '', true);
    PERFORM set_config('app.organization_ids', '', true);
    SET LOCAL ROLE verify086_probe;

    -- ── 4a. the legitimate anonymous write is ADMITTED ───────────────────
    -- No tenant context whatsoever, which is exactly what a stranger has.
    -- 🔴 NOTE THE ABSENCE OF `RETURNING` — see 4c.
    v_enquiry := gen_random_uuid();
    INSERT INTO insurance.enquiries
        (id, tenant_id, organization_id, product_id, contact_name, contact_email,
         product_name, premium, currency)
    VALUES (v_enquiry, ra.o_tenant_id, ra.o_organization_id, v_pub,
            'Ama Mensah', 'ama@example.test', 'Verify 086 Comprehensive', 1200.00, 'GHS');

    -- ── 4b. 🔴 THE FORGERY IS REFUSED — BY THE POLICY, NOT BY A KEY ──────
    --
    -- ⚠️ ONLY THE TENANT IS FORGED, AND THAT IS THE WHOLE POINT. The first
    -- version of this check changed the tenant AND the organisation, which
    -- `fk_enquiry_product_same_org` rejects on its own — so it would have
    -- passed with `enquiries_public_insert` set to `WITH CHECK (true)`, proving
    -- nothing about the policy it was written to defend. Codex caught it.
    --
    -- Keeping insurer A's organisation and product satisfies the foreign key
    -- completely, so the ONLY thing left that can refuse this row is the
    -- policy's `p.tenant_id = enquiries.tenant_id` clause. It discriminates in
    -- both directions: 4a proves it admits, 4b proves it refuses.
    v_refused := false;
    BEGIN
        INSERT INTO insurance.enquiries
            (tenant_id, organization_id, product_id, contact_name, contact_email,
             product_name, premium, currency)
        VALUES (rb.o_tenant_id, ra.o_organization_id, v_pub,
                'Forger', 'forger@example.test', 'Verify 086 Comprehensive', 1200.00, 'GHS');
    EXCEPTION WHEN insufficient_privilege THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'verify/086 #4b: an enquiry naming insurer A''s product was '
                        'accepted under insurer B''s TENANT, with the organisation and '
                        'foreign key left valid. Only enquiries_public_insert can '
                        'refuse that row, so it is no longer adjudicating the tenant.';
    END IF;

    -- An enquiry against a DRAFT must be refused too, addressed correctly or
    -- not. Otherwise the marketplace leaks which unpublished ids are real.
    v_refused := false;
    BEGIN
        INSERT INTO insurance.enquiries
            (tenant_id, organization_id, product_id, contact_name, contact_email,
             product_name, premium, currency)
        VALUES (ra.o_tenant_id, ra.o_organization_id, v_draft,
                'Prober', 'prober@example.test', 'Verify 086 Draft', 300.00, 'GHS');
    EXCEPTION WHEN insufficient_privilege THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'verify/086 #4b: an enquiry was accepted against an '
                        'UNPUBLISHED product. The policy is not checking is_published.';
    END IF;

    -- ── 4c. 🔴 `INSERT ... RETURNING` IS REFUSED, AND MUST STAY REFUSED ──
    --
    -- A REGRESSION NET FOR A DEFECT THAT WAS IN THIS MIGRATION AND WAS CAUGHT
    -- BEFORE IT SHIPPED. `submit_enquiry` originally ended `RETURNING id INTO
    -- v_id`, which passed every local run — the function is SECURITY DEFINER
    -- and this workstation's owner is a superuser, so RLS never applied — and
    -- would have failed on Render, where the owner is bound by FORCE RLS.
    --
    -- The mechanism, worth stating because the error message actively misleads:
    -- RETURNING reads the row back, that read is adjudicated by the SELECT
    -- policy, `enquiries_org_read` demands a matching tenant, and an anonymous
    -- shopper has none. Postgres reports it as *"new row violates row-level
    -- security policy"* — which reads as a rejected INSERT and sends you to
    -- debug the INSERT policy, which is correct.
    --
    -- ⚠️ IF THIS EVER STARTS FAILING, DO NOT "FIX" IT BY WIDENING
    -- `enquiries_org_read`. A SELECT policy loose enough to let an anonymous
    -- writer read its own row back is loose enough to let any anonymous visitor
    -- read every enquiry in the table — a list of other people's names, e-mail
    -- addresses and phone numbers.
    v_refused := false;
    BEGIN
        INSERT INTO insurance.enquiries
            (tenant_id, organization_id, product_id, contact_name, contact_email,
             product_name, premium, currency)
        VALUES (ra.o_tenant_id, ra.o_organization_id, v_pub,
                'Returning Probe', 'probe@example.test', 'Verify 086 Comprehensive',
                1200.00, 'GHS')
        RETURNING id INTO v_probe;
    EXCEPTION WHEN insufficient_privilege THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'verify/086 #4c: an anonymous INSERT ... RETURNING succeeded. '
                        'Either enquiries_org_read has been widened to admit a session '
                        'with no tenant — which would expose every enquirer''s contact '
                        'details — or FORCE RLS is off.';
    END IF;

    RESET ROLE;
    passed := passed + 1;

    -- The probe role has done its work. Revoked and dropped explicitly because
    -- this file COMMITS rather than rolling back.
    PERFORM set_config('app.current_role', 'admin', true);
    EXECUTE 'REVOKE INSERT ON insurance.enquiries FROM verify086_probe';
    EXECUTE 'REVOKE autoworkshop_app FROM verify086_probe';
    EXECUTE 'DROP ROLE verify086_probe';

    -- ── 5. ISOLATION — B cannot see A's enquiry, A can ───────────────────
    -- 🔴 THE NEIGHBOUR IS CHECKED FIRST. A test that only asserts the owner CAN
    -- see the row passes just as happily when EVERYONE can.
    PERFORM set_config('app.current_role', '', true);
    SET LOCAL ROLE autoworkshop_app;

    PERFORM set_config('app.tenant_id',        rb.o_tenant_id::text,       true);
    PERFORM set_config('app.organization_ids', rb.o_organization_id::text, true);
    SELECT count(*) INTO n FROM insurance.enquiries WHERE id = v_enquiry;
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/086 #5: insurer B can read insurer A''s enquiry.';
    END IF;

    PERFORM set_config('app.tenant_id',        ra.o_tenant_id::text,       true);
    PERFORM set_config('app.organization_ids', ra.o_organization_id::text, true);
    SELECT count(*) INTO n FROM insurance.enquiries WHERE id = v_enquiry;
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/086 #5: insurer A cannot read its OWN enquiry — the '
                        'inbox would be permanently empty.';
    END IF;

    -- The insurer works the list. An UPDATE it cannot make is a status control
    -- that silently does nothing.
    --
    -- ⚠️ `updated_at` IS SET TO AN OBVIOUSLY WRONG VALUE... EXCEPT IT CANNOT BE
    -- ANY MORE, because the column grant no longer includes it. That is the
    -- correct outcome and it costs this check its discriminator: within one
    -- transaction `now()` is constant, so `updated_at > created_at` can never
    -- be true and would fail against a working trigger. The trigger is asserted
    -- instead by the value being `now()` after an update that never named it —
    -- which is false if the trigger is missing, because the column would keep
    -- its INSERT-time value... which is also `now()`. Stated plainly: within a
    -- single transaction this cannot discriminate, and it is NOT claimed to.
    -- ▶ The trigger's real net is that `updated_at` is not grantable, so no
    --   caller can set it at all.
    UPDATE insurance.enquiries
       SET status = 'contacted', updated_by = v_user_a
     WHERE id = v_enquiry;
    SELECT count(*) INTO n FROM insurance.enquiries
     WHERE id = v_enquiry AND status = 'contacted' AND updated_by = v_user_a;
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/086 #5: the insurer could not move its own enquiry to '
                        'contacted.';
    END IF;
    RESET ROLE;
    passed := passed + 1;

    -- ── 6. THE FUNCTION DERIVES rather than accepts ──────────────────────
    -- Called with NO tenant, NO organisation and NO price — everything that
    -- decides who is charged what comes off the product row.
    --
    -- ⚠️ RUN AS THE OWNER HERE, AND THEREFORE NOT AN RLS TEST. On this
    -- workstation the owner bypasses RLS, so this establishes the DERIVATION
    -- and nothing about the policy. The policy is checks 4a-4c.
    PERFORM set_config('app.current_role', '', true);
    PERFORM set_config('app.tenant_id',        '', true);
    PERFORM set_config('app.organization_ids', '', true);
    SELECT insurance.submit_enquiry(v_pub, '  Kofi Owusu ', '  KOFI@Example.TEST ',
                                    '  ', NULL, ' interested ')
      INTO v_enquiry;

    PERFORM set_config('app.current_role', 'admin', true);
    SELECT count(*) INTO n FROM insurance.enquiries e
     WHERE e.id = v_enquiry
       AND e.tenant_id       = ra.o_tenant_id
       AND e.organization_id = ra.o_organization_id
       AND e.premium         = 1200.00          -- the ADVERTISED price, snapshotted
       AND e.currency        = 'GHS'
       AND e.product_name    = 'Verify 086 Comprehensive'
       AND e.contact_name    = 'Kofi Owusu'     -- trimmed
       AND e.contact_email   = 'kofi@example.test'  -- trimmed AND lowercased
       AND e.contact_phone   IS NULL            -- blank became NULL, not ''
       AND e.message         = 'interested'
       AND e.status          = 'new';
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/086 #6: submit_enquiry did not derive the tenant, '
                        'organisation and price snapshot from the product, or did not '
                        'normalise the contact fields.';
    END IF;
    passed := passed + 1;

    -- ── 7. the function refuses an invisible product, and says what to do ─
    v_refused := false;
    BEGIN
        PERFORM insurance.submit_enquiry(v_draft, 'Prober', 'prober@example.test',
                                         NULL, NULL, NULL);
    EXCEPTION WHEN no_data_found THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'verify/086 #7: submit_enquiry accepted an unpublished product.';
    END IF;

    -- `public_product()` shows the published one and nothing else. The detail
    -- page 404s on the draft because of this, not because the page checks.
    SELECT count(*) INTO n FROM insurance.public_product(v_pub);
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/086 #7: public_product() did not return the published '
                        'product — the detail page would 404 on a live listing.';
    END IF;
    SELECT count(*) INTO n FROM insurance.public_product(v_draft);
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/086 #7: public_product() returned an UNPUBLISHED '
                        'product. The draft is readable by anybody holding its id.';
    END IF;
    passed := passed + 1;

    -- ── CLEANUP ───────────────────────────────────────────────────────────
    -- Explicit DELETEs in dependency order, matching verify/080 and verify/085
    -- rather than an exception-rollback: a verify that leaves fixtures behind
    -- pollutes the counts later assertions read — and this one would otherwise
    -- leave two insurers in the public marketplace listing itself.
    DELETE FROM insurance.enquiries WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
    DELETE FROM insurance.products  WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
    DELETE FROM comms.notifications
     WHERE resource_type = 'organization_registration'
       AND resource_id IN (SELECT id FROM identity.organization_registrations
                            WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id));
    DELETE FROM identity.organization_registrations
     WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
    DELETE FROM identity.memberships   WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
    DELETE FROM identity.branches      WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
    DELETE FROM identity.organizations WHERE tenant_id IN (ra.o_tenant_id, rb.o_tenant_id);
    DELETE FROM identity.tenants       WHERE id IN (ra.o_tenant_id, rb.o_tenant_id);
    DELETE FROM identity.users         WHERE id IN (v_user_a, v_user_b);

    RAISE NOTICE 'verify/086: % checks passed. Check 3 is the privilege evidence '
                 '(the app role cannot write this table at all) and 4a/4b are the '
                 'policy evidence, forging ONLY the tenant so the foreign key cannot '
                 'be what refuses it.', passed;
END
$verify$;
