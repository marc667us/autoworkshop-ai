-- 053 — slice 12: a customer can see their OWN invoices, payments and warranty
--
-- ══════════════════════════════════════════════════════════════════════════
-- LIST A, item A2. On 2026-08-07 eleven read methods were found ungated: a
-- signed-in CUSTOMER could read the whole workshop's invoice book, payment
-- record, stock, supplier orders and warranty decisions. `assertWorkshopStaff`
-- closed that. It did NOT open the legitimate door — a customer still had no
-- way to see their own records, and six of the fourteen customer signposts are
-- exactly that door.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 THE QUESTION THIS MIGRATION HAD TO ANSWER FIRST ─────────────────────
--
-- "Which invoices are MINE?" turned out to have two different answers in this
-- schema, and nothing made them agree.
--
--   `repair.job_cards.customer_id`  NOT NULL, real FK to core.customers.
--   `finance.invoices.customer_id`  NULLABLE, and `createInvoiceForJobCard`
--                                   stamps it from `core.vehicles.customer_id`
--                                   — THE VEHICLE'S OWNER, not the job card's
--                                   customer.
--
-- Those are the same person right up until they are not: a vehicle sold to a
-- new owner, or a car booked in by someone other than its registered keeper.
-- Nothing in the schema forced `job_cards.customer_id` to equal
-- `vehicles.customer_id`, so the two could diverge silently — and then:
--
--   · the staff invoice list (`listInvoices` joins `core.customers` on
--     `i.customer_id`) NAMES THE WRONG CUSTOMER on the invoice;
--   · a customer-scoped query returns a DIFFERENT set depending on which
--     column it trusts — which is precisely the query slice 12 adds.
--
-- Building the customer's own invoice screen on top of an ambiguous ownership
-- column would ship a screen that is sometimes right. So the ambiguity is
-- removed here, before any screen reads it.
--
-- ── THE DECISION: THE JOB CARD NAMES THE CUSTOMER ──────────────────────────
--
-- `repair.job_cards.customer_id` is authoritative. It is NOT NULL, it carries a
-- real foreign key, and it is what `02.txt` §29 and `3.txt` §1139 mean by "the
-- vehicle, the customer, the complaint" — the customer for THIS repair. The
-- vehicle's registered keeper is a property of the vehicle, not of the repair.
--
-- Migration 050 already reached the same conclusion for support cases, where it
-- checks a case against BOTH the job card's owner and the vehicle's owner. It
-- could do that because the two agreed in the data it saw. This migration makes
-- that agreement a rule instead of a coincidence.

BEGIN;

-- ── 1. a job card's customer must be the vehicle's owner ────────────────────
--
-- ⚠️ INSERT, AND UPDATE ONLY OF THE TWO COLUMNS IT CONSTRAINS.
--
-- A blanket `BEFORE UPDATE` would fire on every stage change, every mileage
-- edit, every assignment — so any job card already holding an inconsistent pair
-- could never be moved through the workshop again, and the product would appear
-- to break on rows nobody had touched. `UPDATE OF customer_id, vehicle_id`
-- fires only when someone actually changes the thing being constrained.
--
-- 🔴 THIS REPOSITORY HAS A RECORDED DEFECT FOR THE OPPOSITE MISTAKE — "a rule
-- enforced on UPDATE and nowhere else", found twice in one day (QC 030,
-- variations 032), where a direct INSERT asserted the end state and walked
-- straight past the guard. So: INSERT is covered too, and it is covered first.

CREATE OR REPLACE FUNCTION repair.assert_job_card_customer_owns_vehicle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    keeper uuid;
BEGIN
    SELECT customer_id INTO keeper
      FROM core.vehicles
     WHERE id = NEW.vehicle_id AND tenant_id = NEW.tenant_id;

    -- No row means the vehicle is not in this tenant. RLS would have hidden it
    -- anyway; saying so is clearer than a null-comparison that quietly passes.
    IF keeper IS NULL THEN
        RAISE EXCEPTION
            'job card names vehicle % which is not a vehicle of this tenant',
            NEW.vehicle_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF keeper <> NEW.customer_id THEN
        RAISE EXCEPTION
            'this job card names customer % but vehicle % belongs to customer % — '
            'transfer the vehicle first, or book the repair under its owner',
            NEW.customer_id, NEW.vehicle_id, keeper
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION repair.assert_job_card_customer_owns_vehicle() IS
  'A job card names the customer for the repair; that customer must be the '
  'vehicle owner, so job card, invoice and warranty cannot disagree about whose '
  'record this is.';

DROP TRIGGER IF EXISTS trg_job_card_customer_owns_vehicle ON repair.job_cards;
CREATE TRIGGER trg_job_card_customer_owns_vehicle
    BEFORE INSERT OR UPDATE OF customer_id, vehicle_id ON repair.job_cards
    FOR EACH ROW EXECUTE FUNCTION repair.assert_job_card_customer_owns_vehicle();

-- ── 2. an invoice belongs to the job card's customer ────────────────────────
--
-- Backfill BEFORE the constraint, from the authoritative column. Every invoice
-- has a `job_card_id` (NOT NULL) and every job card has a `customer_id`
-- (NOT NULL), so this backfill is total — there is no row it cannot resolve.

UPDATE finance.invoices i
   SET customer_id = j.customer_id
  FROM repair.job_cards j
 WHERE j.id = i.job_card_id
   AND j.tenant_id = i.tenant_id
   AND (i.customer_id IS DISTINCT FROM j.customer_id);

-- ⚠️ NOT NULL is asserted AFTER the backfill, and it is the point of the
-- backfill. A nullable owner column is how "show me my invoices" silently
-- returns fewer rows than the customer has.
ALTER TABLE finance.invoices ALTER COLUMN customer_id SET NOT NULL;

CREATE OR REPLACE FUNCTION finance.assert_invoice_customer_matches_job_card()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    owner_id uuid;
BEGIN
    SELECT customer_id INTO owner_id
      FROM repair.job_cards
     WHERE id = NEW.job_card_id AND tenant_id = NEW.tenant_id;

    IF owner_id IS NULL THEN
        RAISE EXCEPTION
            'invoice names job card % which is not a job card of this tenant',
            NEW.job_card_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- 🔴 SET, NOT CHECKED, WHEN THE CALLER LEFT IT NULL.
    --
    -- `createInvoiceForJobCard` derives this from the vehicle today. Refusing
    -- its insert would break invoicing until the service is redeployed, and a
    -- migration that requires a simultaneous code deploy is a migration that
    -- cannot be rehearsed. Deriving it here makes the DATABASE the single
    -- authority, so the service can pass it, omit it, or get it wrong, and the
    -- row is still correct.
    IF NEW.customer_id IS NULL THEN
        NEW.customer_id := owner_id;
    ELSIF NEW.customer_id <> owner_id THEN
        RAISE EXCEPTION
            'this invoice names customer % but job card % belongs to customer %',
            NEW.customer_id, NEW.job_card_id, owner_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION finance.assert_invoice_customer_matches_job_card() IS
  'An invoice is billed to the customer named on its job card. Fills the column '
  'when omitted so the database, not the caller, is the authority on whose bill '
  'this is.';

DROP TRIGGER IF EXISTS trg_invoice_customer_matches_job_card ON finance.invoices;
CREATE TRIGGER trg_invoice_customer_matches_job_card
    BEFORE INSERT OR UPDATE OF customer_id, job_card_id ON finance.invoices
    FOR EACH ROW EXECUTE FUNCTION finance.assert_invoice_customer_matches_job_card();

-- ── 3. indexes for the customer-scoped reads slice 12 adds ──────────────────
--
-- Every one of these screens asks "…WHERE organization_id = ? AND customer_id = ?"
-- or reaches the customer through the job card. Without these the customer's
-- own invoice list is a sequential scan of the workshop's entire invoice book —
-- which is both slow and, given what that book contains, a query worth keeping
-- narrow.

CREATE INDEX IF NOT EXISTS idx_invoice_org_customer
    ON finance.invoices (organization_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_cards_org_customer
    ON repair.job_cards (organization_id, customer_id);

-- Warranty and quotations carry no customer column at all — they reach the
-- customer through `job_card_id`, so that is the column the join needs.
CREATE INDEX IF NOT EXISTS idx_policy_org_job_card
    ON warranty.policies (organization_id, job_card_id);

CREATE INDEX IF NOT EXISTS idx_quotation_org_job_card
    ON repair.quotations (organization_id, job_card_id);

COMMIT;
