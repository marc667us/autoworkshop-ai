-- ============================================================================
-- Proof by EFFECT for migration 014 — run as `autoworkshop_app`, the role the
-- application actually connects as.
--
-- Reading `relforcerowsecurity` or a GRANT out of the catalogue proves only that a
-- statement ran. What matters is whether the rules BITE: whether a task addressing
-- a suspected fault is refused, whether a task addressing another job's fault is
-- refused, whether the children can be removed while the plan is open and cannot
-- once it is submitted, and whether the header is still undeletable. All of it
-- under RLS, as the app's own role, inside a transaction that rolls back.
--
-- ⚠️ EVERY CHECK HAS A CONTROL. A script that only asserts the happy path passes
-- identically with the trigger dropped — that is how 012 shipped a DELETE branch
-- nothing could reach, and how a BEFORE DELETE trigger returning NEW looks like
-- success while removing nothing. So each refusal is asserted by CATCHING a
-- specific SQLSTATE, and each permitted write is asserted by ROW COUNT.
--
--   docker exec -i aw-postgres psql -v ON_ERROR_STOP=1 -U autoworkshop \
--     -d autoworkshop < infrastructure/migrations/verify/014_repair_plans.sql
-- ============================================================================

BEGIN;

-- THE LOOKUP HAPPENS BEFORE `SET ROLE`, AND IT HAS TO — `repair.job_cards` is
-- RLS-FORCEd, so a SELECT with no `app.tenant_id` set returns nothing, and the
-- tenant id is the very thing the lookup is for. The migration user is a superuser
-- and bypasses RLS; the ids cross the role change in a temp table.
CREATE TEMP TABLE t_target ON COMMIT DROP AS
SELECT j.id AS card_id, j.tenant_id, j.organization_id
  FROM repair.job_cards j
 LIMIT 1;

GRANT SELECT ON t_target TO autoworkshop_app;

SET ROLE autoworkshop_app;

DO $$
DECLARE
    v_tenant    uuid;
    v_org       uuid;
    v_card      uuid;
    v_diag      uuid;
    v_other     uuid;
    v_confirmed uuid;
    v_suspected uuid;
    v_foreign   uuid;
    v_plan      uuid;
    v_task      uuid;
    v_res       uuid;
    v_n         integer;
    v_refused   boolean;
BEGIN
    SELECT card_id, tenant_id, organization_id
      INTO v_card, v_tenant, v_org
      FROM t_target;
    IF v_card IS NULL THEN
        RAISE EXCEPTION 'no job card to test against — run scripts/seed-dev-core.sh first';
    END IF;

    -- The RLS context the application sets per request. Without it every statement
    -- below is invisible to its own policy and the test would "pass" by touching
    -- nothing.
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
    PERFORM set_config('app.current_role', 'technician', true);

    -- ── fixtures: one approved diagnosis with a confirmed and a suspected
    --    finding, plus a SECOND diagnosis whose finding belongs to nobody here ──
    INSERT INTO repair.diagnoses (tenant_id, organization_id, job_card_id, attempt_no)
    VALUES (v_tenant, v_org, v_card, 9101)
    RETURNING id INTO v_diag;

    INSERT INTO repair.diagnostic_findings
        (tenant_id, organization_id, diagnosis_id, position,
         fault_description, affected_system, finding_status, confirmed_by, confirmed_at)
    VALUES (v_tenant, v_org, v_diag, 1, 'a confirmed fault', 'electrical',
            'confirmed', gen_random_uuid(), now())
    RETURNING id INTO v_confirmed;

    INSERT INTO repair.diagnostic_findings
        (tenant_id, organization_id, diagnosis_id, position,
         fault_description, affected_system, finding_status)
    VALUES (v_tenant, v_org, v_diag, 2, 'a suspected fault', 'mechanical', 'suspected')
    RETURNING id INTO v_suspected;

    INSERT INTO repair.diagnoses (tenant_id, organization_id, job_card_id, attempt_no)
    VALUES (v_tenant, v_org, v_card, 9102)
    RETURNING id INTO v_other;

    INSERT INTO repair.diagnostic_findings
        (tenant_id, organization_id, diagnosis_id, position,
         fault_description, affected_system, finding_status, confirmed_by, confirmed_at)
    VALUES (v_tenant, v_org, v_other, 1, 'another diagnosis''s confirmed fault',
            'other', 'confirmed', gen_random_uuid(), now())
    RETURNING id INTO v_foreign;

    INSERT INTO repair.repair_plans
        (tenant_id, organization_id, job_card_id, diagnosis_id, attempt_no)
    VALUES (v_tenant, v_org, v_card, v_diag, 9101)
    RETURNING id INTO v_plan;

    -- ── 1. a task against a CONFIRMED finding of this plan's diagnosis: ALLOWED ──
    INSERT INTO repair.repair_plan_tasks
        (tenant_id, organization_id, plan_id, position, finding_id, title,
         estimated_labour_hours)
    VALUES (v_tenant, v_org, v_plan, 1, v_confirmed, 'replace the harness', 1.50)
    RETURNING id INTO v_task;
    RAISE NOTICE 'PASS 1/8: a task may address a confirmed finding of its own diagnosis';

    -- ── 2. a task against a SUSPECTED finding: REFUSED ─────────────────────────
    -- The control for check 1. Without the trigger this INSERT succeeds and a
    -- customer is quoted for a guess (`02.txt` §1290, `07.txt` §25).
    v_refused := false;
    BEGIN
        INSERT INTO repair.repair_plan_tasks
            (tenant_id, organization_id, plan_id, position, finding_id, title)
        VALUES (v_tenant, v_org, v_plan, 2, v_suspected, 'chase the suspected fault');
        RAISE EXCEPTION 'FAIL: a task against a SUSPECTED finding was accepted';
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'FAIL: no integrity_constraint_violation on the suspected finding';
    END IF;
    RAISE NOTICE 'PASS 2/8: a task may not address a suspected finding';

    -- ── 3. a task against ANOTHER diagnosis's confirmed finding: REFUSED ───────
    -- Same tenant, same organisation, same job card — everything the composite
    -- foreign key checks is satisfied. Only the trigger refuses it.
    v_refused := false;
    BEGIN
        INSERT INTO repair.repair_plan_tasks
            (tenant_id, organization_id, plan_id, position, finding_id, title)
        VALUES (v_tenant, v_org, v_plan, 3, v_foreign, 'address another record''s fault');
        RAISE EXCEPTION 'FAIL: a task against ANOTHER diagnosis''s finding was accepted';
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'FAIL: no integrity_constraint_violation on the foreign finding';
    END IF;
    RAISE NOTICE 'PASS 3/8: a task may not address a finding from a different diagnosis';

    -- ── 4. a task with NO finding: ALLOWED ────────────────────────────────────
    -- The nullability is a decision, so it is asserted rather than assumed: a road
    -- test addresses no single fault, and forcing one would corrupt the link.
    INSERT INTO repair.repair_plan_tasks
        (tenant_id, organization_id, plan_id, position, title, estimated_labour_hours)
    VALUES (v_tenant, v_org, v_plan, 4, 'road test after repair', 0.50);
    RAISE NOTICE 'PASS 4/8: a task need not address a fault';

    -- ── 5. resources, plan-scoped and task-scoped ─────────────────────────────
    INSERT INTO repair.repair_plan_resources
        (tenant_id, organization_id, plan_id, task_id, position,
         resource_kind, name, quantity, unit)
    VALUES (v_tenant, v_org, v_plan, v_task, 1, 'part', 'wiring harness', 1, 'each')
    RETURNING id INTO v_res;

    INSERT INTO repair.repair_plan_resources
        (tenant_id, organization_id, plan_id, position, resource_kind, name, quantity, unit)
    VALUES (v_tenant, v_org, v_plan, 2, 'lifting_equipment', 'two-post lift', 1, 'each');
    RAISE NOTICE 'PASS 5/8: resources attach to a task and to the plan as a whole';

    -- ── 6. while the plan is OPEN the children can be REMOVED ─────────────────
    -- 013's whole lesson, applied up front: a refusal that names an alternative
    -- must have that alternative REACHABLE. Row count, not absence of error — a
    -- BEFORE DELETE trigger returning NEW skips the row and reports success.
    DELETE FROM repair.repair_plan_resources WHERE id = v_res;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'FAIL: open plan — expected DELETE 1 on a resource, got DELETE %', v_n;
    END IF;
    DELETE FROM repair.repair_plan_tasks WHERE id = v_task;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'FAIL: open plan — expected DELETE 1 on a task, got DELETE %', v_n;
    END IF;
    RAISE NOTICE 'PASS 6/8: a task and a resource on an open plan can be removed';

    -- ── 7. once SUBMITTED the children freeze ─────────────────────────────────
    UPDATE repair.repair_plans
       SET status = 'submitted', submitted_by = gen_random_uuid(), submitted_at = now()
     WHERE id = v_plan;

    v_refused := false;
    BEGIN
        DELETE FROM repair.repair_plan_tasks WHERE plan_id = v_plan;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        RAISE EXCEPTION
            'FAIL: submitted plan — the task DELETE was not refused (DELETE %)', v_n;
    EXCEPTION WHEN restrict_violation THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'FAIL: no restrict_violation deleting a task on a submitted plan';
    END IF;

    v_refused := false;
    BEGIN
        UPDATE repair.repair_plan_tasks SET title = 'edited after submission'
         WHERE plan_id = v_plan;
        RAISE EXCEPTION 'FAIL: submitted plan — a task UPDATE was not refused';
    EXCEPTION WHEN restrict_violation THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'FAIL: no restrict_violation updating a task on a submitted plan';
    END IF;
    RAISE NOTICE 'PASS 7/8: a submitted plan''s tasks can be neither edited nor removed';

    -- ── 8. the HEADER is not deletable, at any status ─────────────────────────
    v_refused := false;
    BEGIN
        DELETE FROM repair.repair_plans WHERE id = v_plan;
        RAISE EXCEPTION 'FAIL: the repair plan header was deletable';
    EXCEPTION WHEN insufficient_privilege THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'FAIL: no insufficient_privilege on the header delete';
    END IF;
    RAISE NOTICE 'PASS 8/8: the repair plan header is not deletable';

    RAISE NOTICE '=== 8/8 passed — rolling back, nothing written ===';
END;
$$;

ROLLBACK;
