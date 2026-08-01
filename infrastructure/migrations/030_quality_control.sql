-- 030_quality_control.sql — Phase 5 slice 9: the independent quality inspection
--
-- `2.txt` §563, in one sentence that carries the whole slice:
--
--     "Following repair, an INDEPENDENT quality-control inspection should verify
--      that the ORIGINAL COMPLAINT HAS BEEN ADDRESSED and that NO NEW DEFECT WAS
--      INTRODUCED."
--
-- Three requirements, and this migration makes each of them STRUCTURAL rather
-- than a rule the application is trusted to remember:
--
--   1. INDEPENDENT — the inspector may not be anyone who did the work. Enforced
--      by a trigger, using `repair.user_worked_on_job_card()` below. This is the
--      rule the whole slice exists for, and an application-only check would be
--      one refactor away from silently disappearing.
--
--   2. THE COMPLAINT ADDRESSED — a boolean the inspector must answer.
--
--   3. NO NEW DEFECT INTRODUCED — a second boolean, separate from the first
--      because they fail independently: a repair can fix the original fault and
--      break something else, and one field could not say so.
--
-- ⚠️ A PASS IS DEFINED BY THOSE TWO ANSWERS, NOT CHOSEN ALONGSIDE THEM. The
-- CHECK constraint below makes `passed` reachable ONLY when the complaint was
-- addressed AND no new defect was found. Without it `status` would be a third,
-- independent field and an inspector could record "complaint not addressed" and
-- "passed" in the same row — which is exactly the kind of contradiction that
-- looks fine on a screen and is discovered by a customer.

BEGIN;

-- ── who worked on this job card ─────────────────────────────────────────────
--
-- 🔴 THE INDEPENDENCE PREDICATE. "Did the work" is deliberately BROAD, because
-- the failure this rule guards against is somebody signing off their own repair,
-- and every one of these tables is a record of having touched it:
--
--   · `repair_executions`      — started or completed the repair
--   · `execution_tasks`        — completed one of its tasks
--   · `execution_time_entries` — booked labour time to it
--   · `execution_parts_used`   — fitted parts to it
--
-- ⚠️ `execution_evidence` IS DELIBERATELY EXCLUDED. Photographing a car is not
-- doing the repair — an inspector may well take their own evidence, and
-- including it would make the QC inspection self-refusing the moment they did.
--
-- SECURITY DEFINER so the trigger can see the rows regardless of the caller's
-- RLS context; `search_path` is pinned, because a SECURITY DEFINER function
-- without one is a privilege-escalation primitive.
CREATE OR REPLACE FUNCTION repair.user_worked_on_job_card(p_job_card uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = repair, identity, pg_catalog
AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
      SELECT 1 FROM repair.repair_executions e
       WHERE e.job_card_id = p_job_card
         AND (e.started_by = p_user OR e.completed_by = p_user)
    UNION ALL
      SELECT 1 FROM repair.execution_tasks t
        JOIN repair.repair_executions e2 ON e2.id = t.execution_id
       WHERE e2.job_card_id = p_job_card AND t.completed_by = p_user
    UNION ALL
      SELECT 1 FROM repair.execution_time_entries te
        JOIN repair.repair_executions e3 ON e3.id = te.execution_id
       WHERE e3.job_card_id = p_job_card AND te.technician_id = p_user
    UNION ALL
      SELECT 1 FROM repair.execution_parts_used pu
        JOIN repair.repair_executions e4 ON e4.id = pu.execution_id
       WHERE e4.job_card_id = p_job_card AND pu.recorded_by = p_user
  );
$$;

COMMENT ON FUNCTION repair.user_worked_on_job_card(uuid, uuid) IS
  '2.txt §563 independence: true when this user executed any part of the repair '
  'on this job card. Evidence capture is excluded deliberately — photographing a '
  'car is not repairing it.';

-- ── the inspection ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repair.quality_inspections (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    job_card_id      uuid NOT NULL,
    -- The test session this inspection follows. §563 places QC AFTER the repair,
    -- and testing is what closes the repair, so an inspection with no submitted
    -- session would be inspecting a car still being worked on. A trigger below
    -- refuses one that is not submitted.
    test_session_id  uuid NOT NULL,

    -- Re-inspection after a failure is a NEW attempt, never an edit of the old
    -- one: the failed inspection is the record of why the car went back.
    attempt_no       integer NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),

    status           TEXT NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress', 'passed', 'failed')),

    -- ── §563's two questions ─────────────────────────────────────────────
    -- Nullable while `in_progress` (they have not been answered yet) and NOT
    -- NULL once decided — enforced by the CHECK below rather than by column
    -- nullability, because the requirement is conditional on status.
    complaint_addressed boolean,
    new_defect_found    boolean,
    new_defect_description TEXT,

    notes            TEXT,

    inspector_id     uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
    started_at       timestamptz NOT NULL DEFAULT now(),
    decided_at       timestamptz,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- ⚠️ COMPOSITE FKs ON (id, tenant_id, ORGANIZATION_ID) — three columns, not
    -- two. The referenced unique keys are `uq_job_cards_id_tenant_org` and
    -- `uq_test_sessions_id_tenant_org`, and a foreign key must match a unique
    -- constraint EXACTLY; a two-column version simply fails to create. Checked
    -- against the live catalog rather than assumed, and the wider key is the
    -- better one anyway: it pins the ORGANISATION as well, so an inspection can
    -- never reference a job card belonging to a sibling workshop.
    --
    -- The owner's binding rule: relationships in schemas mean REAL foreign keys.
    -- A foreign key proves the referenced row EXISTS; RLS is what decides who
    -- may see it. Both, always.
    CONSTRAINT fk_qc_job_card_scope
        FOREIGN KEY (job_card_id, tenant_id, organization_id)
        REFERENCES repair.job_cards(id, tenant_id, organization_id) ON DELETE CASCADE,
    CONSTRAINT fk_qc_session_scope
        FOREIGN KEY (test_session_id, tenant_id, organization_id)
        REFERENCES repair.repair_test_sessions(id, tenant_id, organization_id) ON DELETE CASCADE,

    -- ⚠️ A PASS IS THE TWO ANSWERS, NOT A THIRD OPINION. See the header.
    CONSTRAINT ck_qc_decision_consistent CHECK (
        (status = 'in_progress'
            AND decided_at IS NULL)
     OR (status = 'passed'
            AND complaint_addressed IS TRUE
            AND new_defect_found IS FALSE
            AND decided_at IS NOT NULL)
     OR (status = 'failed'
            AND complaint_addressed IS NOT NULL
            AND new_defect_found IS NOT NULL
            -- A failure has to be one of the two things §563 asks about;
            -- "failed" with both answers positive is a contradiction.
            AND (complaint_addressed IS FALSE OR new_defect_found IS TRUE)
            AND decided_at IS NOT NULL)
    ),

    -- A new defect that is not described cannot be acted on by the technician it
    -- goes back to. The mirror of the diagnosis rule: a rejection must say why.
    CONSTRAINT ck_qc_new_defect_described CHECK (
        new_defect_found IS NOT TRUE
     OR (new_defect_description IS NOT NULL AND btrim(new_defect_description) <> '')
    ),

    -- One inspection attempt per session at a time. Re-inspection increments.
    CONSTRAINT uq_qc_session_attempt UNIQUE (test_session_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_qc_card
    ON repair.quality_inspections(job_card_id, attempt_no DESC);
CREATE INDEX IF NOT EXISTS idx_qc_tenant
    ON repair.quality_inspections(tenant_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_qc_open
    ON repair.quality_inspections(tenant_id, status) WHERE status = 'in_progress';
CREATE INDEX IF NOT EXISTS idx_qc_inspector
    ON repair.quality_inspections(inspector_id);

-- ── the independence trigger ────────────────────────────────────────────────
--
-- 🔴 THE RULE OF THIS SLICE, IN THE DATABASE. The service checks it too and
-- returns a sentence naming the reason; this refuses it even if that check is
-- removed, bypassed, or a future caller forgets it exists. `2.txt` §563's
-- "independent" is worth exactly as much as its enforcement.
CREATE OR REPLACE FUNCTION repair.reject_self_inspection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF repair.user_worked_on_job_card(NEW.job_card_id, NEW.inspector_id) THEN
    RAISE EXCEPTION
      'independence: this inspector worked on job card % and cannot inspect it (2.txt §563)',
      NEW.job_card_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qc_independence ON repair.quality_inspections;
CREATE TRIGGER trg_qc_independence
    -- ⚠️ ON UPDATE TOO, not just INSERT. Without it an inspection could be
    -- opened by an independent inspector and then have `inspector_id` moved onto
    -- somebody who did the work — the rule enforced at the door and nowhere else.
    BEFORE INSERT OR UPDATE OF inspector_id, job_card_id ON repair.quality_inspections
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_self_inspection();

-- ── the repair must actually be finished ────────────────────────────────────
CREATE OR REPLACE FUNCTION repair.reject_qc_before_testing()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_status TEXT;
BEGIN
  SELECT status INTO session_status
    FROM repair.repair_test_sessions
   WHERE id = NEW.test_session_id;

  IF session_status IS NULL THEN
    RAISE EXCEPTION 'test session % does not exist', NEW.test_session_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- §563 places QC AFTER the repair. An inspection opened against a session
  -- still in progress would describe a car in a different condition from the
  -- one that is eventually released.
  IF session_status <> 'submitted' THEN
    RAISE EXCEPTION
      'quality control follows testing: test session % is % and has not been submitted',
      NEW.test_session_id, session_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qc_after_testing ON repair.quality_inspections;
CREATE TRIGGER trg_qc_after_testing
    BEFORE INSERT ON repair.quality_inspections
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_qc_before_testing();

-- ── a decided inspection is the record; it does not change ──────────────────
CREATE OR REPLACE FUNCTION repair.reject_settled_inspection_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'in_progress' THEN
    RAISE EXCEPTION
      'this inspection was already % and cannot be changed; re-inspection is a new attempt',
      OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qc_settled ON repair.quality_inspections;
CREATE TRIGGER trg_qc_settled
    BEFORE UPDATE ON repair.quality_inspections
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_settled_inspection_change();

-- ── row-level security ──────────────────────────────────────────────────────
-- ENABLE *and* FORCE. Enable alone exempts the table owner, which is the role
-- the app connects as — isolation present and inert.
ALTER TABLE repair.quality_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.quality_inspections FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.quality_inspections;
CREATE POLICY tenant_isolation ON repair.quality_inspections
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- NO DELETE, and this one is not a default being followed. An inspection that
-- FAILED is the reason a car went back to the workshop; deleting it would erase
-- the only record of why. Re-inspection increments `attempt_no` instead.
--
-- ⚠️ THE REVOKE IS NOT REDUNDANT. Migration 006's `ALTER DEFAULT PRIVILEGES`
-- already grants UPDATE/DELETE on new tables in this schema, so a table that
-- merely omits DELETE from its GRANT still HAS it. 008 learned this the
-- expensive way — an append-only table that silently was not.
GRANT SELECT, INSERT, UPDATE ON repair.quality_inspections TO autoworkshop_app;
REVOKE DELETE ON repair.quality_inspections FROM autoworkshop_app;

COMMIT;
