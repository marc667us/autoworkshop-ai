-- ============================================================================
-- Migration 015 — a repair plan's identity columns cannot be re-pointed
-- (Phase 5, slice 4 — Codex review, HIGH, accepted)
--
-- 014 wrote a trigger that refuses changes once a plan is SETTLED, and a second
-- trigger that refuses a task addressing anything but a CONFIRMED finding of the
-- plan's own diagnosis. Both hold. What neither covers is the plan HEADER moving
-- underneath them while the plan is still open.
--
-- ── THE HOLE, AND WHY IT IS WORSE THAN IT LOOKS ────────────────────────────
--
-- `GRANT UPDATE ON repair.repair_plans` is needed — a plan is worked on over a
-- shift, and the review writes to it. But it is granted on the WHOLE ROW, and
-- `reject_settled_plan_change()` only refuses updates when the OLD status is
-- already `approved`/`rejected`. So while a plan is `in_progress`:
--
--     UPDATE repair.repair_plans SET diagnosis_id = <another diagnosis>
--
-- succeeds. CONFIRMED BY EXPERIMENT as `autoworkshop_app` under RLS, not
-- inferred: the plan then presents the confirmed faults of diagnosis B while its
-- tasks still reference findings of diagnosis A. Every guard in the slice is
-- bypassed WITHOUT WRITING A SINGLE TASK ROW — `assertFindingIsPlannable` never
-- runs because no task is inserted or updated, and
-- `assert_task_finding_is_confirmed()` is a trigger on the TASK table, so it never
-- fires either.
--
-- The result is a plan that passes every check and is priced from faults it does
-- not address. Nothing looks wrong, which is the same shape as the review bypass
-- Codex found in slice 3b: the row survives and the obligation attached to it
-- does not.
--
-- ── WHY A TRIGGER RATHER THAN "THE SERVICE NEVER DOES THAT" ────────────────
--
-- The service does not do it today — `recordDetails` assembles its SET list from
-- four literal column names and `diagnosis_id` is not among them. That is exactly
-- the argument this repository has already rejected once. §1294's technician/AI
-- distinction was made STRUCTURAL for the same reason: a rule that holds only
-- because today's callers happen to be well behaved is not a rule, and the next
-- caller is an MCP tool, a later slice, or a backfill script.
--
-- ── WHAT IS FROZEN, AND WHAT IS DELIBERATELY NOT ───────────────────────────
--
-- Frozen from INSERT onward: the columns that say WHICH plan this is and what it
-- was built from. Changing any of them turns this row into a different record
-- while keeping its id, its audit history and its children.
--
-- NOT frozen: `repair_procedure`, `safety_precautions`, `post_repair_tests`,
-- `notes`, and the status/submission/review columns. Those are the plan's
-- CONTENT and its lifecycle, which is what an open plan exists to accumulate.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION repair.reject_settled_plan_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- ── 014's rules, restated unchanged ─────────────────────────────────
    IF OLD.status IN ('approved', 'rejected') THEN
        RAISE EXCEPTION
            'repair plan % is already reviewed and cannot be changed; record a new attempt instead', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD.status = 'submitted' AND NEW.status = 'in_progress' THEN
        RAISE EXCEPTION
            'repair plan % cannot return to in_progress; record a new attempt instead', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- ── 015's addition: the identity columns are write-once ─────────────
    --
    -- `IS DISTINCT FROM` rather than `<>`, so a NULL on either side is compared
    -- rather than yielding NULL and falling through the IF. None of these columns
    -- is nullable today; using the null-safe operator means that if one ever
    -- becomes nullable, this check does not quietly stop working.
    IF NEW.diagnosis_id IS DISTINCT FROM OLD.diagnosis_id THEN
        RAISE EXCEPTION
            'repair plan % cannot be re-pointed at a different diagnosis; its tasks reference the findings of diagnosis %. Record a new plan against the other diagnosis instead',
            OLD.id, OLD.diagnosis_id
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.job_card_id IS DISTINCT FROM OLD.job_card_id THEN
        RAISE EXCEPTION
            'repair plan % cannot be moved to a different job card', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.attempt_no IS DISTINCT FROM OLD.attempt_no THEN
        -- An attempt number that moves is how attempt 3 comes to follow attempt 1,
        -- and how "the newest attempt" — which every read path resolves by
        -- `attempt_no DESC` — comes to mean a different row than it did.
        RAISE EXCEPTION
            'repair plan % cannot change its attempt number', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        -- RLS refuses a write that lands OUTSIDE the caller's tenant, because the
        -- policy's WITH CHECK is evaluated against the NEW row. It does not refuse
        -- a platform administrator moving a row BETWEEN tenants, and
        -- `is_platform_admin()` is a disjunct in that policy. This closes it.
        RAISE EXCEPTION
            'repair plan % cannot be moved between tenants or organizations', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- The trigger itself is unchanged — 014 already attached it BEFORE UPDATE on
-- `repair.repair_plans`, and `CREATE OR REPLACE FUNCTION` re-points it. Restated
-- here so a future reader is not left checking whether the trigger exists.
DROP TRIGGER IF EXISTS trg_repair_plans_immutable ON repair.repair_plans;
CREATE TRIGGER trg_repair_plans_immutable
    BEFORE UPDATE ON repair.repair_plans
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_settled_plan_change();

COMMIT;
