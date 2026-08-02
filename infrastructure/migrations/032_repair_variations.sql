-- 032_repair_variations.sql — Phase 5 slice 7b: the repair variation flow
--
-- `07.txt` §14 (line 3770) lists what a variation SHALL include, and §3766
-- step 12 states the rule the whole slice exists to enforce:
--
--     "The technician PAUSES CHARGEABLE ADDITIONAL WORK UNTIL APPROVAL IS
--      RECEIVED."
--
-- That is a promise to a customer that they will not be billed for work they
-- never agreed to. A workshop that strips a gearbox "while it was open" and
-- invoices for it has broken something no refund fixes, so the rule is made
-- STRUCTURAL here rather than left to a screen to remember:
--
--   · `work_authorized_at` can only be set while the variation is APPROVED, and
--     a trigger refuses it otherwise.
--   · A CHARGEABLE variation cannot be approved without recording WHO approved
--     it and THROUGH WHAT CHANNEL — consent with no name against it is not
--     consent.
--   · The status sequence cannot skip internal review, because §3792 requires
--     a variation to be "reviewed internally" BEFORE it is "sent to the
--     customer", and a workshop that quotes extra work it has not checked
--     itself is how a variation becomes an argument.
--
-- ⚠️ THE SNAPSHOT FIELDS ARE COPIES, NOT JOINS, and that is deliberate. §14
-- requires a variation to carry the ORIGINAL COMPLAINT and the ORIGINAL
-- APPROVED WORK. Joining them at read time would mean a later edit to the job
-- card silently rewrote what the customer was shown — the same reasoning that
-- makes `quotations` store the labour rate rather than look it up, so a
-- quotation already issued stays explicable.

BEGIN;

CREATE TABLE IF NOT EXISTS repair.repair_variations (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    job_card_id      uuid NOT NULL,
    -- A variation arises DURING a repair — §3764's step 11 sits between
    -- "records unexpected findings" and "completes the authorized repair".
    execution_id     uuid NOT NULL,

    variation_no     integer NOT NULL CHECK (variation_no >= 1),

    -- ── §14's required content ───────────────────────────────────────────
    -- Snapshots. See the header: a variation must stay explicable after the
    -- job card moves on.
    original_complaint      TEXT NOT NULL,
    original_approved_work  TEXT NOT NULL,

    new_finding             TEXT NOT NULL,
    additional_work         TEXT NOT NULL,
    additional_parts        TEXT,
    additional_labour_hours numeric(8,2) CHECK (additional_labour_hours IS NULL OR additional_labour_hours >= 0),

    -- ⚠️ `additional_cost` IS WHAT MAKES A VARIATION CHARGEABLE, and zero is a
    -- legitimate answer: discovering that a loose clip needs re-seating is a
    -- variation the customer should still be told about, at no charge. The
    -- rules below therefore key on `> 0`, never on the mere existence of a row.
    additional_cost         numeric(14,2) NOT NULL DEFAULT 0 CHECK (additional_cost >= 0),
    currency                TEXT NOT NULL DEFAULT 'GHS' CHECK (currency ~ '^[A-Z]{3}$'),

    effect_on_completion    TEXT,

    -- ── §3792's lifecycle ────────────────────────────────────────────────
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',
        'internally_reviewed',
        'sent_to_customer',
        'approved',
        'rejected',
        'withdrawn')),

    internally_reviewed_by  uuid,
    internally_reviewed_at  timestamptz,
    sent_at                 timestamptz,

    -- The customer is not necessarily a system user, so their decision is
    -- recorded BY a member of staff, with the customer NAMED. Same shape as
    -- `repair_proposals`, for the same reason.
    decision         TEXT CHECK (decision IN ('approved', 'rejected', 'modified')),
    decided_at       timestamptz,
    decided_by_name  TEXT,
    decision_channel TEXT CHECK (decision_channel IN ('in_person', 'phone', 'email', 'sms', 'portal')),
    decision_note    TEXT,
    recorded_by      uuid,

    -- 🔴 THE AUTHORISATION FLAG. This is the ONE field execution code consults
    -- before booking chargeable additional work. Nothing else in the row is a
    -- substitute for it, and the trigger below is what makes it trustworthy.
    work_authorized_at timestamptz,
    work_authorized_by uuid,

    created_by  uuid,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid,
    updated_at  timestamptz NOT NULL DEFAULT now(),

    -- Composite FKs on (id, tenant_id, organization_id) — the referenced unique
    -- keys are three columns, and the wider key pins the ORGANISATION too, so a
    -- variation can never reference a sibling workshop's job.
    CONSTRAINT fk_variation_card_scope
        FOREIGN KEY (job_card_id, tenant_id, organization_id)
        REFERENCES repair.job_cards(id, tenant_id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT fk_variation_execution_scope
        FOREIGN KEY (execution_id, tenant_id, organization_id)
        REFERENCES repair.repair_executions(id, tenant_id, organization_id) ON DELETE RESTRICT,

    CONSTRAINT uq_variation_execution_no UNIQUE (execution_id, variation_no),

    -- ── 🔴 THE RULE: no chargeable work before approval ──────────────────
    CONSTRAINT ck_variation_authorization CHECK (
        work_authorized_at IS NULL
     OR (status = 'approved' AND decision = 'approved' AND work_authorized_by IS NOT NULL)
    ),

    -- ⚠️ CONSENT NEEDS A NAME AND A CHANNEL — but only when there is money at
    -- stake. A free-of-charge variation is a courtesy notification, and
    -- demanding a signature for it would push staff to record £0 variations as
    -- nothing at all, which loses the record entirely.
    CONSTRAINT ck_variation_chargeable_consent CHECK (
        status <> 'approved'
     OR additional_cost = 0
     OR (decided_by_name IS NOT NULL AND btrim(decided_by_name) <> ''
         AND decision_channel IS NOT NULL
         AND recorded_by IS NOT NULL)
    ),

    -- A rejection the customer gave a reason for is worth far more to the next
    -- conversation than a bare "no". Mirrors the diagnosis review rule.
    CONSTRAINT ck_variation_rejection_reason CHECK (
        status <> 'rejected'
     OR (decision_note IS NOT NULL AND btrim(decision_note) <> '')
    ),

    -- A decided variation must say when, and an undecided one must not pretend.
    CONSTRAINT ck_variation_decision_timing CHECK (
        (status IN ('approved', 'rejected') AND decision IS NOT NULL AND decided_at IS NOT NULL)
     OR (status NOT IN ('approved', 'rejected') AND decision IS NULL AND decided_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_variation_card
    ON repair.repair_variations(job_card_id, variation_no DESC);
CREATE INDEX IF NOT EXISTS idx_variation_execution
    ON repair.repair_variations(execution_id);
CREATE INDEX IF NOT EXISTS idx_variation_tenant
    ON repair.repair_variations(tenant_id, organization_id);
-- The queue: variations waiting on somebody.
CREATE INDEX IF NOT EXISTS idx_variation_pending
    ON repair.repair_variations(tenant_id, status)
 WHERE status IN ('draft', 'internally_reviewed', 'sent_to_customer');

-- ── the lifecycle cannot skip internal review ───────────────────────────────
--
-- §3792 orders it: reviewed internally, THEN sent to the customer, THEN
-- decided. A workshop that quotes extra work it has not checked itself is how a
-- variation turns into an argument, so the order is enforced rather than
-- assumed by the screen that happens to exist today.
CREATE OR REPLACE FUNCTION repair.reject_variation_status_skip()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ok boolean := false;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  ok := CASE
    WHEN OLD.status = 'draft'               AND NEW.status IN ('internally_reviewed', 'withdrawn') THEN true
    WHEN OLD.status = 'internally_reviewed' AND NEW.status IN ('sent_to_customer', 'draft', 'withdrawn') THEN true
    -- A customer may approve, reject, or ask for changes. "Modified" returns it
    -- to draft: the workshop rewrites it and the sequence starts again, which
    -- is why `decision = 'modified'` never reaches a terminal status.
    WHEN OLD.status = 'sent_to_customer'    AND NEW.status IN ('approved', 'rejected', 'draft', 'withdrawn') THEN true
    ELSE false
  END;

  IF NOT ok THEN
    RAISE EXCEPTION
      'a variation cannot go from % to %: it must be reviewed internally, sent to the customer, then decided (07.txt §3792)',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_variation_status ON repair.repair_variations;
CREATE TRIGGER trg_variation_status
    BEFORE UPDATE ON repair.repair_variations
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_variation_status_skip();

-- ── a decided variation's content is fixed ──────────────────────────────────
--
-- What the customer approved is what the customer approved. Editing the cost or
-- the scope afterwards is the failure this whole flow exists to prevent, and it
-- would leave the approval attached to something nobody agreed to.
CREATE OR REPLACE FUNCTION repair.reject_decided_variation_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('approved', 'rejected') THEN
    IF NEW.new_finding IS DISTINCT FROM OLD.new_finding
       OR NEW.additional_work IS DISTINCT FROM OLD.additional_work
       OR NEW.additional_parts IS DISTINCT FROM OLD.additional_parts
       OR NEW.additional_labour_hours IS DISTINCT FROM OLD.additional_labour_hours
       OR NEW.additional_cost IS DISTINCT FROM OLD.additional_cost
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.original_complaint IS DISTINCT FROM OLD.original_complaint
       OR NEW.original_approved_work IS DISTINCT FROM OLD.original_approved_work THEN
      RAISE EXCEPTION
        'this variation was already % — its scope and cost cannot be changed; raise a new variation',
        OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_variation_settled ON repair.repair_variations;
CREATE TRIGGER trg_variation_settled
    BEFORE UPDATE ON repair.repair_variations
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_decided_variation_edit();

-- ── row-level security ──────────────────────────────────────────────────────
-- ENABLE *and* FORCE. Enable alone exempts the table owner, which is the role
-- the app connects as — isolation present and inert.
ALTER TABLE repair.repair_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.repair_variations FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.repair_variations;
CREATE POLICY tenant_isolation ON repair.repair_variations
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- ⚠️ NO DELETE, AND THE REVOKE IS LOAD-BEARING. Migration 006's
-- `ALTER DEFAULT PRIVILEGES` already grants UPDATE/DELETE on new tables in this
-- schema, so a table that merely omits DELETE from its GRANT still HAS it — 008
-- learned that the expensive way, and 030 nearly repeated it. A variation the
-- customer REJECTED is the record of what they refused; deleting it erases the
-- reason a job stopped. Withdrawal is a status, not a deletion.
GRANT SELECT, INSERT, UPDATE ON repair.repair_variations TO autoworkshop_app;
REVOKE DELETE ON repair.repair_variations FROM autoworkshop_app;

COMMIT;
