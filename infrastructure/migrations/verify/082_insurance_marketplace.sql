-- verify/082 — an insurer can register a product, sell it, and the platform is
-- owed a levy it did not have to ask for.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 CHECK 5 IS THE ONE THAT MATTERS: a levy row the PRODUCT created, from a
-- sale, without the application computing anything. The owner's requirement is
-- "pays platform levy for selling on the platform" — a levy the application
-- has to remember to write is a levy that will one day not be written, and the
-- failure is invisible because the sale still succeeds.
--
-- Every check runs against the real triggers and the real CHECK constraints.
-- Nothing here asserts by reading the migration back.
-- ══════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
    v_tenant  uuid; v_org uuid; v_user uuid; v_ws_org uuid; v_ws_tenant uuid;
    v_product uuid; v_policy uuid;
    v_levy    record;
    n         int;
    refused   boolean;
    passed    int := 0;
BEGIN
    PERFORM set_config('app.current_role', 'admin', true);

    -- A throwaway insurer, and a throwaway WORKSHOP to prove the negative.
    v_tenant := gen_random_uuid(); v_org := gen_random_uuid(); v_user := gen_random_uuid();
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (v_user, 'verify-082-'||v_user, 'verify082@example.test', 'Verify 082', 'active');
    INSERT INTO identity.tenants (id, name, slug, status, created_by)
    VALUES (v_tenant, 'Verify 082 Assurance', 'verify-082-'||substr(v_tenant::text,1,8), 'active', v_user);
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
    VALUES (v_org, v_tenant, 'Verify 082 Assurance', 'insurance_company', 'active', v_user);

    v_ws_tenant := gen_random_uuid(); v_ws_org := gen_random_uuid();
    INSERT INTO identity.tenants (id, name, slug, status, created_by)
    VALUES (v_ws_tenant, 'Verify 082 Motors', 'verify-082-ws-'||substr(v_ws_tenant::text,1,8), 'active', v_user);
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
    VALUES (v_ws_org, v_ws_tenant, 'Verify 082 Motors', 'individual_workshop', 'active', v_user);

    -- ── 1. 🔴 A WORKSHOP MAY NOT REGISTER INSURANCE ───────────────────────
    -- Selling insurance is regulated. The role check in the service is the
    -- first line; this is the one that holds when a fixture, an import or an
    -- agent writes the row instead.
    refused := false;
    BEGIN
        INSERT INTO insurance.products
            (tenant_id, organization_id, name, cover_type, premium, currency, term_months)
        VALUES (v_ws_tenant, v_ws_org, 'Motors Cover', 'comprehensive', 100, 'GHS', 12);
    EXCEPTION WHEN others THEN
        refused := true;
        IF SQLERRM NOT LIKE '%only an insurance company%' THEN
            RAISE EXCEPTION 'verify/082 #1: refused for the wrong reason: %', SQLERRM;
        END IF;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'verify/082 #1: a WORKSHOP registered an insurance product';
    END IF;
    passed := passed + 1;

    -- ── 2. An insurer may, and it starts unpublished and unverified ───────
    INSERT INTO insurance.products
        (tenant_id, organization_id, name, summary, cover_type, premium, currency,
         term_months, excess, created_by)
    VALUES (v_tenant, v_org, 'Comprehensive 12-month', 'Full cover incl. windscreen',
            'comprehensive', 1200.00, 'GHS', 12, 250.00, v_user)
    RETURNING id INTO v_product;

    SELECT count(*) INTO n FROM insurance.products
     WHERE id = v_product AND is_published = false AND is_verified = false;
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/082 #2: a new product did not start unpublished and unverified';
    END IF;
    passed := passed + 1;

    -- ── 3. 🔴 IT CANNOT PUBLISH ITSELF BEFORE VERIFICATION ────────────────
    refused := false;
    BEGIN
        UPDATE insurance.products SET is_published = true WHERE id = v_product;
    EXCEPTION WHEN others THEN
        refused := true;
        IF SQLERRM NOT LIKE '%has not been verified%' THEN
            RAISE EXCEPTION 'verify/082 #3: refused for the wrong reason: %', SQLERRM;
        END IF;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'verify/082 #3: an UNVERIFIED insurance product was listed for sale';
    END IF;
    passed := passed + 1;

    -- The platform administrator verifies it, and then it may be listed.
    UPDATE insurance.products SET is_verified = true WHERE id = v_product;
    UPDATE insurance.products SET is_published = true WHERE id = v_product;

    -- ── 4. It appears in the PUBLIC listing, and unverified ones do not ───
    SELECT count(*) INTO n FROM insurance.public_products() WHERE o_product_id = v_product;
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/082 #4: a published, verified product is not in the public listing';
    END IF;

    -- A second product, verified but NOT published, must stay invisible.
    INSERT INTO insurance.products
        (tenant_id, organization_id, name, cover_type, premium, currency, term_months, is_verified)
    VALUES (v_tenant, v_org, 'Draft cover', 'third_party', 300, 'GHS', 12, true);
    SELECT count(*) INTO n FROM insurance.public_products()
     WHERE o_name = 'Draft cover';
    IF n <> 0 THEN
        RAISE EXCEPTION 'verify/082 #4b: an UNPUBLISHED product is visible to the public';
    END IF;
    passed := passed + 1;

    -- ── 5. 🔴 THE SALE ACCRUES THE PLATFORM LEVY, BY ITSELF ───────────────
    INSERT INTO insurance.policies
        (tenant_id, organization_id, product_id, policy_number, buyer_user_id,
         vehicle_registration, premium, currency, cover_starts_on, cover_ends_on, created_by)
    VALUES (v_tenant, v_org, v_product, 'VERIFY-082-0001', v_user,
            'GR-1234-24', 1200.00, 'GHS', current_date, current_date + 365, v_user)
    RETURNING id INTO v_policy;

    SELECT * INTO v_levy FROM insurance.platform_levies WHERE policy_id = v_policy;
    IF v_levy IS NULL THEN
        RAISE EXCEPTION 'verify/082 #5: a policy was sold and the platform is owed NOTHING — '
                        'the levy trigger did not fire';
    END IF;
    -- 10% of 1200.00 = 120.00, from the platform default seeded by 082.
    IF v_levy.amount <> 120.00 OR v_levy.percent <> 10.00 THEN
        RAISE EXCEPTION 'verify/082 #5b: levy is % at %%% — expected 120.00 at 10%%',
                        v_levy.amount, v_levy.percent;
    END IF;
    IF v_levy.settlement_status <> 'outstanding' THEN
        RAISE EXCEPTION 'verify/082 #5c: a fresh levy is not outstanding';
    END IF;
    -- It names the rate row that produced it, so the number stays explainable.
    IF v_levy.levy_rate_id IS NULL THEN
        RAISE EXCEPTION 'verify/082 #5d: the levy does not record which rate produced it';
    END IF;
    passed := passed + 1;

    -- ── 6. An insurer-specific rate BEATS the platform default ────────────
    INSERT INTO insurance.levy_rates (organization_id, percent, note)
    VALUES (v_org, 4.00, 'verify/082 negotiated rate');

    INSERT INTO insurance.policies
        (tenant_id, organization_id, product_id, policy_number, buyer_user_id,
         premium, currency, cover_starts_on, cover_ends_on, created_by)
    VALUES (v_tenant, v_org, v_product, 'VERIFY-082-0002', v_user,
            1000.00, 'GHS', current_date, current_date + 365, v_user)
    RETURNING id INTO v_policy;

    SELECT * INTO v_levy FROM insurance.platform_levies WHERE policy_id = v_policy;
    IF v_levy.percent <> 4.00 OR v_levy.amount <> 40.00 THEN
        RAISE EXCEPTION 'verify/082 #6: the negotiated rate did not win — got %%% giving %',
                        v_levy.percent, v_levy.amount;
    END IF;
    passed := passed + 1;

    -- ── 7. A policy cannot cite ANOTHER organisation's product ────────────
    -- The composite FK, which a plain `product_id` reference could not express.
    refused := false;
    BEGIN
        INSERT INTO insurance.policies
            (tenant_id, organization_id, product_id, policy_number, buyer_user_id,
             premium, currency, cover_starts_on, cover_ends_on)
        VALUES (v_ws_tenant, v_ws_org, v_product, 'VERIFY-082-0003', v_user,
                10, 'GHS', current_date, current_date + 30);
    EXCEPTION WHEN others THEN
        refused := true;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'verify/082 #7: one organisation sold ANOTHER organisation''s product';
    END IF;
    passed := passed + 1;

    -- ── CLEANUP ───────────────────────────────────────────────────────────
    DELETE FROM insurance.platform_levies WHERE tenant_id IN (v_tenant, v_ws_tenant);
    DELETE FROM insurance.policies        WHERE tenant_id IN (v_tenant, v_ws_tenant);
    DELETE FROM insurance.products        WHERE tenant_id IN (v_tenant, v_ws_tenant);
    DELETE FROM insurance.levy_rates      WHERE organization_id = v_org;
    DELETE FROM identity.organizations    WHERE id IN (v_org, v_ws_org);
    DELETE FROM identity.tenants          WHERE id IN (v_tenant, v_ws_tenant);
    DELETE FROM identity.users            WHERE id = v_user;

    RAISE NOTICE 'verify/082: % / 7 passed. Check 5 is the evidence — a sale '
                 'accrued the platform levy with no application code involved.', passed;
END
$verify$;
