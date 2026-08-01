-- 031_quality_control_hardening.sql — closing four holes in 030's enforcement
--
-- 030 shipped the independence rule of `2.txt` §563 and proved it with 13
-- checks. Codex then found FOUR ways round it, and every one is a variation on
-- the same theme: **the rule was enforced at the door and nowhere else.** That
-- is the exact shape this repository keeps paying for, so each is closed here
-- and each gets its own check in `verify/031`.
--
-- ⚠️ A NEW MIGRATION RATHER THAN AN EDIT TO 030. 030 is applied and its checksum
-- is recorded; changing it in place would either be rejected by the runner or,
-- worse, silently diverge from what a deployed database actually has.
--
--   1. THE JOB CARD AND THE TEST SESSION WERE NEVER TIED TOGETHER. Both were
--      scoped to the tenant and organisation, but nothing said the session
--      belonged to the job card being inspected. A technician who worked on job
--      A could insert a row carrying A's session and B's `job_card_id`, and the
--      independence trigger — which reads `NEW.job_card_id` — would then check
--      them against B, a car they never touched. The service happened to derive
--      the job card FROM the session, so the API was safe; the DATABASE invariant
--      was not, and the database is the enforcement point.
--
--   2. `trg_qc_after_testing` FIRED ONLY ON INSERT while `test_session_id`
--      remained updatable. An inspection could be opened correctly and then
--      repointed at a different — or unsubmitted — session, re-checking nothing.
--
--   3. `user_worked_on_job_card()` WAS EXECUTABLE BY PUBLIC. It is SECURITY
--      DEFINER precisely so it can see rows the caller's RLS hides, which makes
--      an unrestricted grant a cross-tenant oracle: anyone could ask "did user X
--      work on job Y" for any pair of ids.
--
--   4. A DECIDED INSPECTION COULD BE DELETED BY CASCADE. `DELETE` is revoked on
--      the table, but both foreign keys were `ON DELETE CASCADE` and
--      `repair.job_cards` still grants DELETE — so removing a job card silently
--      erased the record of why a car had been sent back.

BEGIN;

-- ── 1 + 2. the session must belong to the card, on INSERT *and* UPDATE ───────
--
-- Replaces 030's `reject_qc_before_testing`, which checked only the session's
-- status. Both facts are verified together because they answer the same
-- question — "is this inspection about the repair it claims to be about".
CREATE OR REPLACE FUNCTION repair.reject_qc_before_testing()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_status TEXT;
  session_card   uuid;
BEGIN
  SELECT status, job_card_id INTO session_status, session_card
    FROM repair.repair_test_sessions
   WHERE id = NEW.test_session_id;

  IF session_status IS NULL THEN
    RAISE EXCEPTION 'test session % does not exist', NEW.test_session_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- §563 places QC AFTER the repair. An inspection against a session still in
  -- progress describes a car in a different condition from the one released.
  IF session_status <> 'submitted' THEN
    RAISE EXCEPTION
      'quality control follows testing: test session % is % and has not been submitted',
      NEW.test_session_id, session_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- 🔴 THE HOLE. Without this, `job_card_id` is free of the session it names,
  -- and the independence trigger can be pointed at a car the inspector never
  -- worked on while the inspection is really about one they did.
  IF session_card IS DISTINCT FROM NEW.job_card_id THEN
    RAISE EXCEPTION
      'test session % belongs to job card %, not %',
      NEW.test_session_id, session_card, NEW.job_card_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qc_after_testing ON repair.quality_inspections;
CREATE TRIGGER trg_qc_after_testing
    -- ⚠️ UPDATE TOO, AND OF ALL THREE COLUMNS. 030 fired on INSERT alone, so a
    -- valid row could be repointed afterwards at a different or unsubmitted
    -- session and nothing re-checked it.
    BEFORE INSERT OR UPDATE OF test_session_id, job_card_id ON repair.quality_inspections
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_qc_before_testing();

-- The independence trigger gains `test_session_id` for the same reason: moving
-- the session moves which repair is being signed off.
DROP TRIGGER IF EXISTS trg_qc_independence ON repair.quality_inspections;
CREATE TRIGGER trg_qc_independence
    BEFORE INSERT OR UPDATE OF inspector_id, job_card_id, test_session_id
        ON repair.quality_inspections
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_self_inspection();

-- ── 3. the independence predicate is not a public oracle ────────────────────
--
-- SECURITY DEFINER means it reads rows the caller's RLS would hide — that is the
-- point, so the trigger works for any tenant. It also means an unrestricted
-- EXECUTE lets any role ask about ANY (job card, user) pair and learn who worked
-- on what across every tenant in the database.
--
-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default, so this
-- REVOKE is doing real work rather than restating a default.
REVOKE EXECUTE ON FUNCTION repair.user_worked_on_job_card(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION repair.user_worked_on_job_card(uuid, uuid) TO autoworkshop_app;

-- ── 4. a decided inspection survives the deletion of its parents ────────────
--
-- 🔴 `DELETE` WAS REVOKED ON THE TABLE AND THE ROWS WERE STILL DELETABLE. A
-- cascade is not a DELETE by the app, so the revoke never applied to it, and
-- `repair.job_cards` grants DELETE. Removing a job card therefore erased the
-- inspection that recorded why its car had been sent back — the append-only
-- table that silently was not, one level removed. 008 paid for the direct
-- version of this lesson.
--
-- RESTRICT rather than CASCADE: a job card with a quality inspection against it
-- can no longer be deleted at all, which is the correct answer for evidence. If
-- a card genuinely must go, its inspections are a deliberate, separate decision
-- rather than a side effect nobody sees.
ALTER TABLE repair.quality_inspections
    DROP CONSTRAINT IF EXISTS fk_qc_job_card_scope,
    DROP CONSTRAINT IF EXISTS fk_qc_session_scope;

ALTER TABLE repair.quality_inspections
    ADD CONSTRAINT fk_qc_job_card_scope
        FOREIGN KEY (job_card_id, tenant_id, organization_id)
        REFERENCES repair.job_cards(id, tenant_id, organization_id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_qc_session_scope
        FOREIGN KEY (test_session_id, tenant_id, organization_id)
        REFERENCES repair.repair_test_sessions(id, tenant_id, organization_id) ON DELETE RESTRICT;

-- ── 5. a pass carries no defect description ─────────────────────────────────
--
-- Smaller than the four above and worth closing while the file is open: 030's
-- CHECK allowed `status = 'passed'` with a non-null `new_defect_description`,
-- which reads as "passed, and here is the defect we found". Left over from a
-- failed attempt, it would print on a report as though it were current.
ALTER TABLE repair.quality_inspections
    DROP CONSTRAINT IF EXISTS ck_qc_pass_has_no_defect;
ALTER TABLE repair.quality_inspections
    ADD CONSTRAINT ck_qc_pass_has_no_defect CHECK (
        status <> 'passed' OR new_defect_description IS NULL
    );

COMMIT;
