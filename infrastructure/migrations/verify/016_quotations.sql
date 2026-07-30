-- ============================================================================
-- Proof by EFFECT for migration 016 — run as `autoworkshop_app`, under RLS.
--
-- The API probe proves what the service does. THIS proves what the database refuses
-- when the service is not in the way — the rules that exist precisely because a later
-- caller (an MCP tool, a backfill, slice 6) may write these rows directly.
--
-- ⚠️ EVERY REFUSAL IS PAIRED WITH A CONTROL. A trigger that refused everything would
-- pass every "is it refused" check and silently make the slice unusable, which is the
-- failure those checks cannot see on their own.
--
--   docker exec -i aw-postgres psql -v ON_ERROR_STOP=1 -U autoworkshop \
--     -d autoworkshop < infrastructure/migrations/verify/016_quotations.sql
-- ============================================================================

BEGIN;

-- Before SET ROLE: `repair.job_cards` is RLS-FORCEd, so a SELECT with no
-- `app.tenant_id` returns nothing — and the tenant id is what the lookup is for.
CREATE TEMP TABLE t_target ON COMMIT DROP AS
SELECT j.id AS card_id, j.tenant_id, j.organization_id
  FROM repair.job_cards j
 LIMIT 1;
GRANT SELECT ON t_target TO autoworkshop_app;

SET ROLE autoworkshop_app;

DO $$
DECLARE
    v_t uuid; v_o uuid; v_c uuid;
    v_diag uuid; v_plan_a uuid; v_plan_b uuid;
    v_task uuid; v_q uuid; v_line uuid;
    v_total numeric; v_n integer; v_refused boolean;
BEGIN
    SELECT card_id, tenant_id, organization_id INTO v_c, v_t, v_o FROM t_target;
    IF v_c IS NULL THEN
        RAISE EXCEPTION 'no job card — run scripts/seed-dev-core.sh first';
    END IF;

    PERFORM set_config('app.tenant_id', v_t::text, true);
    PERFORM set_config('app.current_role', 'workshop_manager', true);

    INSERT INTO repair.diagnoses (tenant_id, organization_id, job_card_id, attempt_no)
    VALUES (v_t, v_o, v_c, 9501) RETURNING id INTO v_diag;
    INSERT INTO repair.repair_plans (tenant_id, organization_id, job_card_id, diagnosis_id, attempt_no)
    VALUES (v_t, v_o, v_c, v_diag, 9501) RETURNING id INTO v_plan_a;
    INSERT INTO repair.repair_plans (tenant_id, organization_id, job_card_id, diagnosis_id, attempt_no)
    VALUES (v_t, v_o, v_c, v_diag, 9502) RETURNING id INTO v_plan_b;
    INSERT INTO repair.repair_plan_tasks (tenant_id, organization_id, plan_id, position, title)
    VALUES (v_t, v_o, v_plan_a, 1, 'a task on plan A') RETURNING id INTO v_task;

    INSERT INTO repair.quotations
        (tenant_id, organization_id, job_card_id, repair_plan_id, attempt_no, currency, labour_rate)
    VALUES (v_t, v_o, v_c, v_plan_a, 9501, 'GHS', 120.00)
    RETURNING id INTO v_q;

    -- ── 1. the GENERATED total — the database computes it ──────────────────
    INSERT INTO repair.quotation_lines
        (tenant_id, organization_id, quotation_id, position, line_kind,
         repair_plan_task_id, description, quantity, unit_price)
    VALUES (v_t, v_o, v_q, 1, 'labour', v_task, 'replace the coil', 3, 33.33)
    RETURNING id INTO v_line;

    SELECT line_total INTO v_total FROM repair.quotation_lines WHERE id = v_line;
    IF v_total <> 99.99 THEN
        RAISE EXCEPTION 'FAIL: 3 x 33.33 should be 99.99, got %', v_total;
    END IF;
    RAISE NOTICE 'PASS 1/7: the database computed the line total exactly (99.99)';

    -- ── 2. the total cannot be written by hand ────────────────────────────
    -- The whole point of GENERATED: an application-written total is free to drift from
    -- its own quantity and price, which is the classic invoice defect.
    v_refused := false;
    BEGIN
        UPDATE repair.quotation_lines SET line_total = 1.00 WHERE id = v_line;
        RAISE EXCEPTION 'FAIL: line_total was writable';
    EXCEPTION WHEN generated_always THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'FAIL: no generated_always error'; END IF;
    RAISE NOTICE 'PASS 2/7: line_total cannot be written by a caller';

    -- ── 3. it RECOMPUTES when its inputs change (the control for 1 and 2) ──
    --
    -- ⚠️ AND IT DEMONSTRATES THE HAZARD THE SERVICE GUARDS AGAINST. `10.005` is written
    -- to a `numeric(14,2)` column, which ROUNDS IT TO 10.01 SILENTLY — no error, no
    -- warning. So the total is 2 x 10.01 = 20.02, NOT the 20.01 an unwary reader
    -- computes from the value they typed.
    --
    -- This script originally asserted 20.01 and failed, which is the best possible
    -- argument for `requireMoney()` refusing more than two decimals at the API boundary:
    -- if a proof script written by someone who KNEW about the rounding still got it
    -- wrong, an advisor typing a price certainly will. The number a person enters and
    -- the number a customer is charged must be the same number, and the only way to
    -- guarantee that is to refuse the input rather than round it.
    UPDATE repair.quotation_lines SET quantity = 2, unit_price = 10.005 WHERE id = v_line;

    SELECT unit_price INTO v_total FROM repair.quotation_lines WHERE id = v_line;
    IF v_total <> 10.01 THEN
        RAISE EXCEPTION 'FAIL: expected the column to round 10.005 to 10.01, got %', v_total;
    END IF;

    SELECT line_total INTO v_total FROM repair.quotation_lines WHERE id = v_line;
    IF v_total <> 20.02 THEN
        RAISE EXCEPTION 'FAIL: expected 2 x 10.01 = 20.02, got %', v_total;
    END IF;
    RAISE NOTICE 'PASS 3/7: CONTROL — the total recomputes, and the column silently rounds (20.02)';

    -- ── 4. a line may not cite a task on ANOTHER plan ──────────────────────
    -- Same tenant, same organisation, same job card — everything the composite FK
    -- checks is satisfied. Only the trigger refuses it.
    v_refused := false;
    BEGIN
        UPDATE repair.quotations SET repair_plan_id = v_plan_b WHERE id = v_q;
        RAISE EXCEPTION 'FAIL: the quotation was re-pointed at another plan';
    EXCEPTION WHEN restrict_violation THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'FAIL: no restrict_violation on the re-point'; END IF;
    RAISE NOTICE 'PASS 4/7: a quotation cannot be re-pointed at a different plan';

    -- ── 5. the CURRENCY is frozen once priced ──────────────────────────────
    v_refused := false;
    BEGIN
        UPDATE repair.quotations SET currency = 'USD' WHERE id = v_q;
        RAISE EXCEPTION 'FAIL: the currency was changed after pricing';
    EXCEPTION WHEN restrict_violation THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'FAIL: no restrict_violation on the currency'; END IF;
    RAISE NOTICE 'PASS 5/7: the currency cannot change — every amount is denominated in it';

    -- ── 6. CONTROL: the content and the lifecycle still write ──────────────
    UPDATE repair.quotations
       SET discount_amount = 25.00, recommended_repair = 'replace the coil',
           status = 'submitted', submitted_by = gen_random_uuid(), submitted_at = now()
     WHERE id = v_q;
    RAISE NOTICE 'PASS 6/7: CONTROL — discount, terms and the submission still write';

    -- ── 7. once submitted the lines freeze ─────────────────────────────────
    v_refused := false;
    BEGIN
        DELETE FROM repair.quotation_lines WHERE id = v_line;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        -- Reaching here is a failure, but WHICH failure matters: 0 rows would mean the
        -- BEFORE DELETE trigger returned NEW and skipped the row silently.
        RAISE EXCEPTION 'FAIL: a line on a submitted quotation was deleted (DELETE %)', v_n;
    EXCEPTION WHEN restrict_violation THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'FAIL: no restrict_violation deleting a line'; END IF;
    RAISE NOTICE 'PASS 7/7: a submitted quotation''s lines cannot be removed';

    RAISE NOTICE '=== 7/7 passed — rolling back, nothing written ===';
END;
$$;

ROLLBACK;
