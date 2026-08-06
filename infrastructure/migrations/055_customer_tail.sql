-- 055 — slice 13: the customer tail (recovery requests, and the reads behind it)
--
-- ══════════════════════════════════════════════════════════════════════════
-- LIST B item B1. Eight customer routes were still signposts. Seven of them
-- need only a customer-predicated READ over data that already exists. One —
-- `/support/towing` — had NO backend of any kind, which is why it is the only
-- part of this slice that touches the schema.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 A TOWING REQUEST IS A SUPPORT CASE, NOT A NEW TABLE ─────────────────
--
-- The tempting move is `support.towing_requests`: its own table, its own
-- number, its own status machine. That would be a SECOND thing a customer can
-- raise, a second inbox for the workshop to watch, and a second place for
-- "what has this customer asked us for?" to be answered — and the two answers
-- would disagree the first time one of them changed.
--
-- A recovery request is what `support.cases` already models: a customer asks
-- for something, it has a reference, a priority, a status, an owner and a
-- resolution. It differs in exactly two facts — WHERE the vehicle is, and WHAT
-- NUMBER to ring — so those are the only two columns added.
--
-- Directive §3: if an equivalent exists, EXTEND it, do not duplicate it.
--
-- ── ⚠️ THE COLUMNS ARE NULLABLE, AND THE CHECK IS WHAT MAKES THEM REQUIRED ─
--
-- `location` and `contact_phone` are meaningless on a billing complaint, so
-- they cannot be NOT NULL on the table. A `towing` case without a location is
-- useless in a different way: it is a recovery request nobody can drive to. So
-- the requirement is CONDITIONAL, and expressed as a CHECK rather than left to
-- the service — the service is one caller, and the constraint is the rule.

BEGIN;

ALTER TABLE support.cases
  ADD COLUMN IF NOT EXISTS location      TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

COMMENT ON COLUMN support.cases.location IS
  'Where the vehicle is. Required for a towing case, meaningless on the others.';
COMMENT ON COLUMN support.cases.contact_phone IS
  'The number to ring about this case. Required for towing — the recovery driver '
  'needs somebody to call on arrival.';

-- ── the category ───────────────────────────────────────────────────────────
--
-- 🔴 DROP AND RE-ADD, BECAUSE A CHECK CONSTRAINT CANNOT BE ALTERED IN PLACE.
-- Named explicitly rather than letting Postgres generate one, so the next
-- migration that needs to widen this can find it.

ALTER TABLE support.cases DROP CONSTRAINT IF EXISTS cases_category_check;
ALTER TABLE support.cases DROP CONSTRAINT IF EXISTS ck_case_category;
ALTER TABLE support.cases ADD CONSTRAINT ck_case_category
  CHECK (category IN ('billing', 'quality', 'delay', 'warranty', 'account',
                      'towing', 'other'));

-- A towing case must say where the vehicle is and who to ring. Anything else
-- must not be forced to.
ALTER TABLE support.cases DROP CONSTRAINT IF EXISTS ck_towing_needs_location;
ALTER TABLE support.cases ADD CONSTRAINT ck_towing_needs_location
  CHECK (
    category <> 'towing'
    OR (location IS NOT NULL AND length(btrim(location)) > 0
        AND contact_phone IS NOT NULL AND length(btrim(contact_phone)) > 0)
  );

-- ── indexes for the customer-scoped reads slice 13 adds ────────────────────
--
-- Every screen in this slice asks the same shape of question: "…for THIS
-- customer, in THIS organisation". Without these each one is a sequential scan
-- of the whole workshop's history.

CREATE INDEX IF NOT EXISTS idx_appointments_org_customer
    ON reception.appointments (organization_id, customer_id, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS idx_executions_org_job_card
    ON repair.repair_executions (organization_id, job_card_id);

CREATE INDEX IF NOT EXISTS idx_parts_used_execution
    ON repair.execution_parts_used (organization_id, execution_id);

CREATE INDEX IF NOT EXISTS idx_cases_org_customer_category
    ON support.cases (organization_id, customer_id, category);

COMMIT;
