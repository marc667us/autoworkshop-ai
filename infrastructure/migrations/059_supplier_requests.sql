-- 059 — the workshop's Request for Parts, addressed to a supplier it CHOOSES
--
-- ══════════════════════════════════════════════════════════════════════════
-- The owner's value proposition, 2026-08-07: "a major object and value
-- proposition of the app is connecting vehicle owners with need to repair with
-- workshops and vehicle part suppliers, this is a win win for all."
--
-- 058 built the CUSTOMER → WORKSHOP edge. This is the WORKSHOP → SUPPLIER edge
-- of the same idea, and it is deliberately the same shape: a party finds
-- another in a PUBLIC directory, asks for something, and the other side may
-- quote or decline. Two edges, one pattern.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 WHY NOT `parts.purchase_orders`, WHICH ALREADY EXISTS ──────────────
--
-- It was the obvious home and it is impossible, for a reason worth stating
-- precisely because it is invisible until you look:
--
--   `parts.purchase_orders` is one of the 49 tables migration 054 gave a
--   **RESTRICTIVE** `org_restrict` policy: `organization_id =
--   identity.current_organization_id()`. RESTRICTIVE policies are combined with
--   **AND**, so no permissive policy added later can widen them. A purchase
--   order's `organization_id` is the WORKSHOP's, so a supplier — a different
--   organisation — can NEVER read one. Not "does not"; cannot.
--
-- Weakening that policy for this feature would erode the isolation 054 exists
-- for, on the very table that records what a workshop buys. So the supplier
-- conversation gets its own table, exactly as the customer conversation did.
--
-- ⚠️ AND IT IS GENUINELY A DIFFERENT THING, not a workaround. A purchase order
-- is the workshop's INTERNAL record of what it has ordered. This is the ASK,
-- sent to somebody who has not agreed yet and may say no. That is the same
-- distinction as job card vs service request in 058, and the same reasoning:
-- a record of agreed work cannot express an unanswered request.
--
-- ── 🔴 THE SUPPLIER IS THE TARGET; THE ORGANISATION IS THE ASKER ──────────
--
-- Mirror image of 058. There the row's `organization_id` was the workshop being
-- ASKED; here it is the workshop DOING the asking, and `supplier_id` names the
-- party being asked. So the SELECT policy again has two arms — "my organisation
-- asked this" and "this was sent to a supplier I work for" — and neither side
-- may see the other's rows.
--
-- ⚠️ NOT IN 054's LIST, and it must never be added to it. An `org_restrict`
-- policy here would AND away the supplier's arm and silently break the feature,
-- which is precisely the failure this header exists to prevent a future reader
-- from causing.

BEGIN;

CREATE TABLE IF NOT EXISTS parts.supplier_requests (
    id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,

    -- The WORKSHOP asking.
    organization_id       uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
    requested_by          uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,

    -- 🔴 THE SUPPLIER BEING ASKED. `catalogue.suppliers` is a PLATFORM-WIDE
    -- directory with no tenant of its own — that is what makes it a marketplace
    -- rather than a per-workshop address book, and it is why a workshop can ask
    -- a supplier it has no prior relationship with.
    supplier_id           uuid NOT NULL REFERENCES catalogue.suppliers(id) ON DELETE CASCADE,

    -- The part, AS DESCRIBED. Free text and a nullable catalogue id, because
    -- the thing a workshop needs is very often not in any catalogue — it is "the
    -- offside rear wheel bearing for a 2013 Hilux". Requiring a catalogue part
    -- would make the feature unusable for exactly the requests that need a human.
    part_id               uuid REFERENCES catalogue.parts(id) ON DELETE SET NULL,
    part_description      TEXT NOT NULL,
    quantity              integer NOT NULL CHECK (quantity > 0),
    needed_by             date,
    notes                 TEXT,

    -- Which repair it is for, when it is for one. Nullable: a workshop also
    -- restocks. No FK to keep this table usable from the parts desk without a
    -- job, and because the job card lives in another schema's lifecycle.
    job_card_id           uuid,

    -- ⚠️ `new` IS THE ONLY STATE THE ASKER CAN CREATE. Everything else is an
    -- answer, and `declined` is a real outcome rather than a deletion — a
    -- supplier that turns work away should leave a trace, so "they never got
    -- back to us" is checkable rather than a matter of memory.
    status                TEXT NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new', 'quoted', 'declined',
                                            'accepted', 'cancelled')),

    -- ── the supplier's answer ────────────────────────────────────────────
    -- Money as an integer of minor units. A repair quoted in floating point is
    -- a repair that reconciles to the wrong number eventually.
    quote_minor           bigint CHECK (quote_minor IS NULL OR quote_minor >= 0),
    quote_currency        TEXT CHECK (quote_currency IS NULL OR quote_currency ~ '^[A-Z]{3}$'),
    quote_lead_days       integer CHECK (quote_lead_days IS NULL OR quote_lead_days >= 0),
    decline_reason        TEXT,
    responded_by          uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    responded_at          timestamptz,

    -- Set when the workshop accepts a quote and it becomes real procurement.
    converted_purchase_order_id uuid,

    created_at            timestamptz NOT NULL DEFAULT now(),

    -- A quote must actually BE one. `quoted` with no price is a status that
    -- says an answer arrived while carrying none.
    CONSTRAINT ck_supplier_request_quoted
      CHECK (status <> 'quoted' OR (quote_minor IS NOT NULL AND quote_currency IS NOT NULL)),

    -- A decline must say why — the only thing the asker can act on.
    CONSTRAINT ck_supplier_request_declined
      CHECK (status <> 'declined' OR decline_reason IS NOT NULL),

    -- An answer without an answerer, or an answerer with no time, cannot be
    -- audited. Refuse the half-state rather than discover it later.
    CONSTRAINT ck_supplier_request_responded
      CHECK ((responded_by IS NULL) = (responded_at IS NULL)),

    -- 🔴 ACCEPTING REQUIRES A QUOTE TO ACCEPT. Without this the workshop could
    -- mark an unanswered request `accepted` and believe a price had been agreed.
    CONSTRAINT ck_supplier_request_accepted
      CHECK (status <> 'accepted' OR quote_minor IS NOT NULL)
);

-- The supplier's inbox: their own new requests, newest first.
CREATE INDEX IF NOT EXISTS idx_supplier_request_supplier
    ON parts.supplier_requests (supplier_id, status, created_at DESC);
-- The workshop's own asks, across every supplier.
CREATE INDEX IF NOT EXISTS idx_supplier_request_org
    ON parts.supplier_requests (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_request_tenant
    ON parts.supplier_requests (tenant_id);

ALTER TABLE parts.supplier_requests ENABLE ROW LEVEL SECURITY;
-- FORCE: the app connects as the table owner on Render, and an un-FORCEd policy
-- is inert for the owner.
ALTER TABLE parts.supplier_requests FORCE ROW LEVEL SECURITY;

/*
 * Is the caller a user of this supplier?
 *
 * SECURITY DEFINER because the policy must read `catalogue.supplier_users`,
 * which has its own RLS — a policy that cannot see the link table would refuse
 * every supplier, and would look like a permissions bug in the application.
 *
 * ⚠️ IT TAKES THE SUPPLIER AS AN ARGUMENT AND ANSWERS ONLY ABOUT THE CALLER.
 * It cannot be used to enumerate anything: it returns a boolean about
 * `current_user_id()` and nothing else, so a caller learns only what they could
 * already learn by trying.
 */
CREATE OR REPLACE FUNCTION parts.current_user_supplies(p_supplier uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = catalogue, identity, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM catalogue.supplier_users su
     WHERE su.supplier_id = p_supplier
       AND su.user_id = identity.current_user_id()
  );
$$;

REVOKE ALL ON FUNCTION parts.current_user_supplies(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION parts.current_user_supplies(uuid) TO autoworkshop_app;

-- ── SELECT: the workshop that asked, OR the supplier that was asked ────────
--
-- Two parties, one row, and neither may read the other's rows. The supplier arm
-- is a MEMBERSHIP test, not an organisation one, because a supplier is not an
-- organisation in this schema at all — `catalogue.suppliers` is platform-wide,
-- which is what makes the directory a marketplace.
DROP POLICY IF EXISTS supplier_request_select ON parts.supplier_requests;
CREATE POLICY supplier_request_select ON parts.supplier_requests FOR SELECT USING (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id())
  OR parts.current_user_supplies(supplier_id)
);

-- ── INSERT: the asking workshop only, and only as `new` ────────────────────
--
-- A supplier cannot raise a request against itself, and nobody can file one
-- pre-quoted or pre-accepted.
DROP POLICY IF EXISTS supplier_request_insert ON parts.supplier_requests;
CREATE POLICY supplier_request_insert ON parts.supplier_requests FOR INSERT WITH CHECK (
  identity.is_platform_admin()
  OR (requested_by = identity.current_user_id()
      AND tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      AND identity.current_role_name() <> 'customer'
      AND status = 'new')
);

-- ── UPDATE: both parties, each answering their own half ────────────────────
--
-- ⚠️ RLS CANNOT RESTRICT WHICH COLUMNS A ROW UPDATE TOUCHES. So this policy says
-- WHO may write the row, and `SupplierRequestService` says WHAT each side may
-- change: the supplier quotes or declines, the workshop accepts or cancels.
-- Stating that here so the next reader does not mistake this policy for the
-- whole rule — CLAUDE.md §8, and the reason the service checks too.
DROP POLICY IF EXISTS supplier_request_update ON parts.supplier_requests;
CREATE POLICY supplier_request_update ON parts.supplier_requests FOR UPDATE USING (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      AND identity.current_role_name() <> 'customer')
  OR parts.current_user_supplies(supplier_id)
) WITH CHECK (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      AND identity.current_role_name() <> 'customer')
  OR parts.current_user_supplies(supplier_id)
);

-- No DELETE. `cancelled` and `declined` are how a request goes away, so both
-- sides keep the record of what was asked and what came back.
GRANT SELECT, INSERT, UPDATE ON parts.supplier_requests TO autoworkshop_app;

COMMIT;
