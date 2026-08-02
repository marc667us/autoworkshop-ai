-- 034_variation_authorization_fill.sql — a freeze that was one notch too tight
--
-- 033 froze the decision metadata on an approved variation, which is right: the
-- record of WHO approved it and HOW is the evidence of consent, and evidence
-- that can be edited afterwards is not evidence.
--
-- But it swept `work_authorized_at` into the same rule, and that goes one step
-- too far. Found by `verify/032` failing at check 8 — the authorisation step —
-- immediately after 033 was applied.
--
-- THE PROBLEM IT CREATES. `approved` is a terminal status, so an approved
-- variation whose `work_authorized_at` was somehow never set could NEVER be
-- authorised: the freeze refuses to fill it, and no transition leads anywhere
-- that would. The customer has said yes and the work is permanently blocked,
-- with no remedy short of re-asking them for a whole new variation.
--
-- The service sets the approval and the authorisation in ONE statement, so it
-- never produces that state itself. This is about what the DATABASE guarantees
-- when something else does.
--
-- THE DISTINCTION THAT MATTERS: filling a NULL is a COMPLETION; changing a value
-- that is already set is a REWRITE. Only the second is dangerous — it could
-- withdraw an authorisation silently, or move its timestamp. So:
--
--   · NULL -> a value  ALLOWED  (finishing what the approval began)
--   · a value -> anything else  REFUSED (rewriting the record)
--
-- The consent fields keep the stricter rule: `decided_by_name` and its companions
-- may not be filled in later either, because adding a name after the fact
-- FABRICATES consent rather than completing it. That asymmetry is the whole
-- point of this migration, and it is why the two are no longer treated alike.
--
-- ⚠️ `ck_variation_authorization` still refuses `work_authorized_at` on anything
-- but an approved row, so this loosening cannot authorise unapproved work. It
-- only decides whether an approved row may have its authorisation completed.

BEGIN;

CREATE OR REPLACE FUNCTION repair.reject_decided_variation_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Content freezes the moment the customer is asked, so the number they approve
  -- is the number the row holds.
  IF OLD.status IN ('sent_to_customer', 'approved', 'rejected') THEN
    IF NEW.new_finding IS DISTINCT FROM OLD.new_finding
       OR NEW.additional_work IS DISTINCT FROM OLD.additional_work
       OR NEW.additional_parts IS DISTINCT FROM OLD.additional_parts
       OR NEW.additional_labour_hours IS DISTINCT FROM OLD.additional_labour_hours
       OR NEW.additional_cost IS DISTINCT FROM OLD.additional_cost
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.original_complaint IS DISTINCT FROM OLD.original_complaint
       OR NEW.original_approved_work IS DISTINCT FROM OLD.original_approved_work THEN
      RAISE EXCEPTION
        'this variation is already % — its scope and cost cannot change; withdraw it and raise a new one',
        OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF OLD.status IN ('approved', 'rejected') THEN
    -- The evidence of consent. Neither changeable NOR fillable-in-later: a name
    -- added after the fact fabricates consent rather than completing it.
    IF NEW.decision IS DISTINCT FROM OLD.decision
       OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
       OR NEW.decided_by_name IS DISTINCT FROM OLD.decided_by_name
       OR NEW.decision_channel IS DISTINCT FROM OLD.decision_channel
       OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by THEN
      RAISE EXCEPTION
        'the record of who approved this variation and how cannot be rewritten'
        USING ERRCODE = 'check_violation';
    END IF;

    -- ⚠️ THE AUTHORISATION MAY BE COMPLETED, NEVER REWRITTEN. Filling a NULL
    -- finishes what the approval began; changing a value that is already set
    -- would let an authorisation be silently withdrawn or back-dated.
    IF OLD.work_authorized_at IS NOT NULL
       AND (NEW.work_authorized_at IS DISTINCT FROM OLD.work_authorized_at
            OR NEW.work_authorized_by IS DISTINCT FROM OLD.work_authorized_by) THEN
      RAISE EXCEPTION
        'this variation authorisation is already recorded and cannot be changed or withdrawn'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
