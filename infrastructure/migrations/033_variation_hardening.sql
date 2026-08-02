-- 033_variation_hardening.sql — closing four holes in 032's enforcement
--
-- 032 shipped the variation flow with 15 passing checks. Codex then found four
-- ways round it, and the first is the same defect 030 shipped and 031 fixed:
-- **the rule was enforced on UPDATE and nowhere else.** Twice in one day.
--
--   1. 🔴 CRITICAL — `trg_variation_status` was `BEFORE UPDATE` only. A direct
--      INSERT could create a variation already `approved`, already carrying
--      `work_authorized_at`, having never been reviewed or sent to anybody. The
--      service never does that; the DATABASE is supposed to be the backstop for
--      when something else does, and it was not.
--
--   2. THE INTERNAL REVIEW WAS A SERVICE-LAYER RULE ONLY. Nothing in the
--      database required `internally_reviewed_by` to be set, to differ from
--      `created_by`, or to belong to a role permitted to review. §3792's
--      "reviewed internally" was enforceable only by the one caller that
--      happened to remember.
--
--      ⚠️ AND `verify/032` PROVED THE BYPASS WAS ACCEPTED WITHOUT NOTICING: it
--      performs the review as the `technician` who raised the variation, which
--      is precisely what the requirement forbids. A verify script that exercises
--      the hole and calls it a pass is worse than no check.
--
--   3. NO APPROVAL HISTORY, though §3792 requires the decision "recorded in the
--      approval history" — and a `modified` decision was recorded nowhere at
--      all, because the row simply returned to draft. The history of what the
--      customer was asked and answered was therefore unrecoverable.
--
--   4. CONTENT WAS EDITABLE AFTER BEING SENT. The freeze only began at
--      `approved`/`rejected`, so the cost could be raised between sending and
--      approval — the customer approves one number and the row holds another.

BEGIN;

-- ── 3. the approval history — §3792 ─────────────────────────────────────────
--
-- APPEND-ONLY, and separate from the variation rather than columns on it,
-- because "what were they asked, and what did they say, and when" is a SEQUENCE.
-- A `modified` answer sends the variation back to draft to be rewritten, so the
-- current row cannot hold that answer — only a history can.
-- ⚠️ THE UNIQUE KEY FIRST. A composite foreign key needs a matching unique
-- constraint to ALREADY EXIST — declaring the referencing table first fails with
-- "there is no unique constraint matching given keys". 032 gave the variation no
-- (id, tenant_id, organization_id) key because nothing referenced it yet.
ALTER TABLE repair.repair_variations
    DROP CONSTRAINT IF EXISTS uq_variations_id_tenant_org;
ALTER TABLE repair.repair_variations
    ADD CONSTRAINT uq_variations_id_tenant_org UNIQUE (id, tenant_id, organization_id);

CREATE TABLE IF NOT EXISTS repair.variation_decisions (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
    variation_id    uuid NOT NULL,

    decision        TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'modified')),
    -- The CONTENT the customer was answering about, captured at the moment of
    -- the answer. Without it a `modified` decision points at a variation that
    -- has since been rewritten, and the history says nothing.
    quoted_cost     numeric(14,2) NOT NULL,
    quoted_currency TEXT NOT NULL,
    quoted_work     TEXT NOT NULL,

    decided_at       timestamptz NOT NULL DEFAULT now(),
    decided_by_name  TEXT,
    decision_channel TEXT CHECK (decision_channel IN ('in_person','phone','email','sms','portal')),
    decision_note    TEXT,
    recorded_by      uuid,

    CONSTRAINT fk_vdecision_variation
        FOREIGN KEY (variation_id, tenant_id, organization_id)
        REFERENCES repair.repair_variations(id, tenant_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_vdecision_variation
    ON repair.variation_decisions(variation_id, decided_at DESC);

ALTER TABLE repair.variation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.variation_decisions FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON repair.variation_decisions;
CREATE POLICY tenant_isolation ON repair.variation_decisions
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- Append-only in the strongest sense available: no UPDATE, no DELETE. 006's
-- ALTER DEFAULT PRIVILEGES grants both on new tables, so both REVOKEs are
-- load-bearing rather than decorative.
GRANT SELECT, INSERT ON repair.variation_decisions TO autoworkshop_app;
REVOKE UPDATE, DELETE ON repair.variation_decisions FROM autoworkshop_app;

-- ── 1 + 2 + 4. the lifecycle, enforced on INSERT as well as UPDATE ──────────
CREATE OR REPLACE FUNCTION repair.reject_variation_status_skip()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ok boolean := false;
BEGIN
  -- 🔴 THE CRITICAL HOLE. 032 fired only on UPDATE, so a direct INSERT could
  -- create a variation already approved and already authorised, having never
  -- been reviewed or sent. Every variation now BEGINS as a draft, with no
  -- decision and no authorisation, whatever the inserting statement says.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION
        'a variation must start as a draft; it cannot be created already % (07.txt §3792)',
        NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.work_authorized_at IS NOT NULL OR NEW.decision IS NOT NULL THEN
      RAISE EXCEPTION
        'a new variation cannot arrive already decided or already authorised'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  ok := CASE
    WHEN OLD.status = 'draft'               AND NEW.status IN ('internally_reviewed', 'withdrawn') THEN true
    WHEN OLD.status = 'internally_reviewed' AND NEW.status IN ('sent_to_customer', 'draft', 'withdrawn') THEN true
    WHEN OLD.status = 'sent_to_customer'    AND NEW.status IN ('approved', 'rejected', 'draft', 'withdrawn') THEN true
    ELSE false
  END;

  IF NOT ok THEN
    RAISE EXCEPTION
      'a variation cannot go from % to %: it must be reviewed internally, sent to the customer, then decided (07.txt §3792)',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── 2. THE INTERNAL REVIEW IS A REAL REVIEW ──────────────────────────────
  --
  -- §3792 requires it, and 032 left it entirely to the service. All three parts
  -- are enforced here now, because a rule only one caller remembers is a rule
  -- until somebody writes a second caller.
  IF NEW.status = 'internally_reviewed' THEN
    IF NEW.internally_reviewed_by IS NULL THEN
      RAISE EXCEPTION 'an internal review must record who carried it out'
        USING ERRCODE = 'check_violation';
    END IF;
    -- The raiser cannot review their own. Same independence shape as the
    -- diagnosis review and the QC inspection.
    IF NEW.internally_reviewed_by = NEW.created_by THEN
      RAISE EXCEPTION
        'the person who raised this variation cannot also review it internally (07.txt §3792)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- And a technician cannot review at all. `current_role_name()` answers
    -- 'none' when unset, so an unauthenticated path fails closed.
    IF identity.current_role_name() IN ('technician', 'reception_staff', 'storekeeper', 'cashier', 'customer', 'none') THEN
      RAISE EXCEPTION
        'a variation is reviewed by a supervisor, manager or the owner, not by %',
        identity.current_role_name()
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_variation_status ON repair.repair_variations;
CREATE TRIGGER trg_variation_status
    BEFORE INSERT OR UPDATE ON repair.repair_variations
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_variation_status_skip();

-- ── 4 (+3). content freezes when SENT, not when decided ─────────────────────
--
-- 032 froze scope and cost only from `approved`/`rejected`. So the cost could be
-- raised between sending and approval, and the customer would approve one number
-- while the row held another — the exact substitution this flow exists to
-- prevent. The freeze now starts the moment the customer is asked.
--
-- ⚠️ AND THE DECISION METADATA FREEZES TOO. 032 froze the scope but left
-- `decided_by_name`, `decision_channel`, `recorded_by` and `work_authorized_at`
-- rewritable on an approved row — so the evidence of consent could be edited
-- after the fact, which is worse than the scope being editable.
CREATE OR REPLACE FUNCTION repair.reject_decided_variation_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
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
    IF NEW.decision IS DISTINCT FROM OLD.decision
       OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
       OR NEW.decided_by_name IS DISTINCT FROM OLD.decided_by_name
       OR NEW.decision_channel IS DISTINCT FROM OLD.decision_channel
       OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
       OR NEW.work_authorized_at IS DISTINCT FROM OLD.work_authorized_at
       OR NEW.work_authorized_by IS DISTINCT FROM OLD.work_authorized_by THEN
      RAISE EXCEPTION
        'the record of who approved this variation and how cannot be rewritten'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
