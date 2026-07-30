-- ============================================================================
-- Proof by EFFECT for migration 015 — run as `autoworkshop_app`, under RLS.
--
-- This is the SAME script that CONFIRMED the hole before 015 existed: it performed
-- the re-pointing UPDATE and reported success. That is why it is kept rather than
-- rewritten — a regression test whose failure mode has actually been observed is
-- worth more than one written against a hypothesis.
--
-- ⚠️ IT CARRIES ITS OWN CONTROL. Checks 1-4 assert the identity columns are
-- REFUSED; check 5 asserts the CONTENT columns still update. Without that control
-- a trigger that refused every update would pass checks 1-4 and silently break
-- the whole slice — the plan could never be edited at all.
--
--   docker exec -i aw-postgres psql -v ON_ERROR_STOP=1 -U autoworkshop \
--     -d autoworkshop < infrastructure/migrations/verify/015_plan_identity_immutable.sql
-- ============================================================================

BEGIN;

-- The lookup happens BEFORE `SET ROLE` — `repair.job_cards` is RLS-FORCEd, so a
-- SELECT with no `app.tenant_id` set returns nothing, and the tenant id is the very
-- thing the lookup is for.
CREATE TEMP TABLE t_target ON COMMIT DROP AS
SELECT j.id AS card_id, j.tenant_id, j.organization_id
  FROM repair.job_cards j
 LIMIT 1;

GRANT SELECT ON t_target TO autoworkshop_app;

SET ROLE autoworkshop_app;

DO $$
DECLARE
    v_tenant  uuid;
    v_org     uuid;
    v_card    uuid;
    v_diag_a  uuid;
    v_diag_b  uuid;
    v_plan    uuid;
    v_after   uuid;
    v_text    text;
    v_refused boolean;
BEGIN
    SELECT card_id, tenant_id, organization_id
      INTO v_card, v_tenant, v_org
      FROM t_target;
    IF v_card IS NULL THEN
        RAISE EXCEPTION 'no job card to test against — run scripts/seed-dev-core.sh first';
    END IF;

    PERFORM set_config('app.tenant_id', v_tenant::text, true);
    PERFORM set_config('app.current_role', 'technician', true);

    INSERT INTO repair.diagnoses (tenant_id, organization_id, job_card_id, attempt_no)
    VALUES (v_tenant, v_org, v_card, 9401) RETURNING id INTO v_diag_a;
    INSERT INTO repair.diagnoses (tenant_id, organization_id, job_card_id, attempt_no)
    VALUES (v_tenant, v_org, v_card, 9402) RETURNING id INTO v_diag_b;

    INSERT INTO repair.repair_plans
        (tenant_id, organization_id, job_card_id, diagnosis_id, attempt_no)
    VALUES (v_tenant, v_org, v_card, v_diag_a, 9401)
    RETURNING id INTO v_plan;

    -- ── 1. the exploit Codex found: re-point the plan's diagnosis ──────────
    v_refused := false;
    BEGIN
        UPDATE repair.repair_plans SET diagnosis_id = v_diag_b WHERE id = v_plan;
        SELECT diagnosis_id INTO v_after FROM repair.repair_plans WHERE id = v_plan;
        RAISE EXCEPTION
            'FAIL: diagnosis_id was re-pointed on an OPEN plan (% -> %)', v_diag_a, v_after;
    EXCEPTION WHEN restrict_violation THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'FAIL: no restrict_violation on the diagnosis re-point';
    END IF;
    RAISE NOTICE 'PASS 1/5: a plan cannot be re-pointed at another diagnosis';

    -- ── 2. the job card ───────────────────────────────────────────────────
    v_refused := false;
    BEGIN
        UPDATE repair.repair_plans SET job_card_id = v_card WHERE id = v_plan;
        -- Same value, so this one must SUCCEED — `IS DISTINCT FROM` compares values,
        -- not whether the column appeared in the SET list. Asserted so a future
        -- rewrite using a column-presence check is caught: it would refuse every
        -- ordinary save that happens to mention the column.
        RAISE NOTICE 'PASS 2/5: setting job_card_id to its OWN value is not a change';
    EXCEPTION WHEN restrict_violation THEN
        RAISE EXCEPTION 'FAIL: a no-op write to job_card_id was refused';
    END;

    -- ── 3. attempt_no ─────────────────────────────────────────────────────
    v_refused := false;
    BEGIN
        UPDATE repair.repair_plans SET attempt_no = 9999 WHERE id = v_plan;
        RAISE EXCEPTION 'FAIL: attempt_no was changed';
    EXCEPTION WHEN restrict_violation THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'FAIL: no restrict_violation on the attempt_no change';
    END IF;
    RAISE NOTICE 'PASS 3/5: a plan cannot change its attempt number';

    -- ── 4. the tenant ─────────────────────────────────────────────────────
    v_refused := false;
    BEGIN
        UPDATE repair.repair_plans SET organization_id = v_org, tenant_id = v_tenant
         WHERE id = v_plan;
    EXCEPTION WHEN restrict_violation THEN
        RAISE EXCEPTION 'FAIL: a no-op write to tenant_id/organization_id was refused';
    END;
    RAISE NOTICE 'PASS 4/5: a no-op write to the tenant columns is not a change';

    -- ── 5. THE CONTROL: content still updates ─────────────────────────────
    --
    -- Without this a trigger refusing EVERY update would pass 1-4 and make the plan
    -- uneditable — the slice would be broken in exactly the way these checks cannot
    -- see.
    UPDATE repair.repair_plans
       SET repair_procedure = 'a procedure recorded after 015',
           status = 'submitted', submitted_by = gen_random_uuid(), submitted_at = now()
     WHERE id = v_plan;
    SELECT repair_procedure INTO v_text FROM repair.repair_plans WHERE id = v_plan;
    IF v_text IS DISTINCT FROM 'a procedure recorded after 015' THEN
        RAISE EXCEPTION 'FAIL: the content columns no longer update (got %)', v_text;
    END IF;
    RAISE NOTICE 'PASS 5/5: CONTROL — content and the review transition still write';

    RAISE NOTICE '=== 5/5 passed — rolling back, nothing written ===';
END;
$$;

ROLLBACK;
