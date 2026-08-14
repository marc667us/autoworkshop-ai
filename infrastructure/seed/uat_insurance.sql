-- UAT: the insurance case that could not be run on 2026-08-14 morning.
--
-- ══════════════════════════════════════════════════════════════════════════
-- The owner's UAT asked for an insurance sales pipeline. It was the ONE case
-- of eight that could not be populated, because none of it existed — reported
-- as a named zero row rather than faked. Migration 082 built it, so this closes
-- the loop.
--
-- 🔴 IT EXERCISES THE REAL RULES, IN THE REAL ORDER, AND THAT ORDER IS THE
-- TEST. Every step below is refused by the database if taken out of turn:
--
--   1. register_insurer          — the real SECURITY DEFINER function
--   2. approve the registration  — the platform administrator's decision
--   3. register a product        — refused for any org that is not an insurer
--   4. try to LIST it unverified — MUST BE REFUSED, and is asserted to be
--   5. verify it                 — the platform's decision
--   6. list it                   — now permitted
--   7. sell it                   — and the LEVY ACCRUES BY ITSELF
--
-- Step 4 is the one worth having. A seed that simply set `is_verified` and
-- `is_published` together would prove nothing about the gate, and the gate is
-- the regulated part.
--
-- Step 7 is the owner's actual requirement — "pays platform levy for selling on
-- the platform". `verify/082` proves the trigger locally; this proves it on
-- PRODUCTION, which nothing had.
--
-- ⚠️ IDEMPOTENT BY MARKER, ONE TRANSACTION. A partial insurance UAT would look
-- like a product defect.
-- ══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '10s';

SELECT set_config('app.current_role', 'admin', true);

DO $uat$
DECLARE
    v_tag      TEXT := 'UAT-2026-08-14';
    v_subject  TEXT := 'uat-UAT-2026-08-14-insurer';
    v_exists   int;
    v_user     uuid;
    v_admin    uuid;
    v_tenant   uuid; v_org uuid;
    v_product  uuid; v_policy uuid;
    v_levy     record;
    refused    boolean;
BEGIN
    SELECT count(*) INTO v_exists
      FROM identity.organizations
     WHERE org_type = 'insurance_company' AND name LIKE '%'||v_tag||'%';
    IF v_exists > 0 THEN
        RAISE NOTICE 'insurance UAT % already exists. Nothing written.', v_tag;
        RETURN;
    END IF;

    -- ── 1. The insurer registers, through the real product path ───────────
    PERFORM identity.provision_user_from_subject(
        v_subject, 'uat.insurer@aiappinvent.com', 'UAT Insurance Assessor '||v_tag);
    SELECT o_tenant_id, o_organization_id INTO v_tenant, v_org
      FROM identity.register_insurer(v_subject, 'UAT Assurance '||v_tag, 'Accra office');
    SELECT id INTO v_user FROM identity.users WHERE keycloak_subject = v_subject;

    -- ── 2. A platform administrator verifies the BUSINESS ─────────────────
    SELECT m.user_id INTO v_admin
      FROM identity.memberships m
     WHERE m.role_name = 'platform_administrator' AND m.status = 'active'
     LIMIT 1;
    IF v_admin IS NULL THEN v_admin := v_user; END IF;

    UPDATE identity.organization_registrations
       SET status = 'approved', decided_by = v_admin, decided_at = now(),
           decision_note = 'UAT '||v_tag||': verified for acceptance testing'
     WHERE organization_id = v_org;

    -- ── 3. The insurer registers a product ────────────────────────────────
    INSERT INTO insurance.products
        (tenant_id, organization_id, name, summary, cover_type, premium,
         currency, term_months, excess, created_by)
    VALUES (v_tenant, v_org, 'Comprehensive 12-month '||v_tag,
            'Full cover including windscreen, for the UAT walkthrough.',
            'comprehensive', 1200.00, 'GHS', 12, 250.00, v_user)
    RETURNING id INTO v_product;

    -- ── 4. 🔴 IT CANNOT BE LISTED BEFORE THE PLATFORM VERIFIES IT ─────────
    -- The assertion that makes this a test rather than a fixture.
    refused := false;
    BEGIN
        UPDATE insurance.products SET is_published = true WHERE id = v_product;
    EXCEPTION WHEN others THEN
        refused := true;
        IF SQLERRM NOT LIKE '%has not been verified%' THEN
            RAISE EXCEPTION 'UAT insurance: listing was refused for the WRONG reason: %', SQLERRM;
        END IF;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'UAT insurance: an UNVERIFIED product was listed for sale — '
                        'the regulated gate did not hold';
    END IF;
    RAISE NOTICE 'UAT insurance: unverified listing correctly REFUSED';

    -- ── 5 & 6. The platform verifies, then the insurer lists ──────────────
    UPDATE insurance.products SET is_verified = true, updated_by = v_admin WHERE id = v_product;
    UPDATE insurance.products SET is_published = true, updated_by = v_user  WHERE id = v_product;

    -- ── 7. 🔴 A SALE, AND THE LEVY ACCRUES BY ITSELF ──────────────────────
    INSERT INTO insurance.policies
        (tenant_id, organization_id, product_id, policy_number, buyer_user_id,
         vehicle_registration, premium, currency, cover_starts_on, cover_ends_on,
         created_by)
    VALUES (v_tenant, v_org, v_product, 'UAT-POL-0001', v_user,
            'UAT-C-001', 1200.00, 'GHS', current_date, current_date + 365, v_user)
    RETURNING id INTO v_policy;

    SELECT * INTO v_levy FROM insurance.platform_levies WHERE policy_id = v_policy;
    IF v_levy IS NULL THEN
        RAISE EXCEPTION 'UAT insurance: a policy was SOLD and the platform is owed '
                        'NOTHING — the levy trigger did not fire on this database';
    END IF;
    RAISE NOTICE 'UAT insurance: sale recorded, platform levy accrued % % at %%%',
                 v_levy.currency, v_levy.amount, v_levy.percent;

    -- A second sale, so the levy statement has more than one line to show.
    INSERT INTO insurance.policies
        (tenant_id, organization_id, product_id, policy_number, buyer_user_id,
         vehicle_registration, premium, currency, cover_starts_on, cover_ends_on,
         created_by)
    VALUES (v_tenant, v_org, v_product, 'UAT-POL-0002', v_user,
            'UAT-C-002', 1200.00, 'GHS', current_date, current_date + 365, v_user);

    RAISE NOTICE 'UAT insurance % written: 1 insurer, 1 verified+listed product, 2 policies.', v_tag;
END
$uat$;

COMMIT;
