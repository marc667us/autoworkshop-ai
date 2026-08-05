-- 044 — parts: stock, movements, reservations, requisitions, orders, receipts
--
-- ══════════════════════════════════════════════════════════════════════════
-- SLICE 4 of docs/00-project/COMPLETION_PLAN.md — the workshop's own store
-- ══════════════════════════════════════════════════════════════════════════
--
-- The biggest slice by screens (17 routes), and the one that turns the owner's
-- shopping cart into real procurement.
--
-- ── 🔴 `catalogue.parts` IS NOT THIS WORKSHOP'S STOCK ──────────────────────
--
-- `catalogue.*` is the PUBLIC MARKETPLACE: parts that SUPPLIERS list for sale,
-- with `in_stock` meaning "the supplier says they have it". This schema is the
-- workshop's OWN shelf — what it has bought and is holding. The two are
-- different questions with different owners, and merging them would mean a
-- supplier's stock level answering "can I fit this today?"
--
-- A stock item may REFERENCE a catalogue part (bought through the marketplace)
-- or stand alone (bought locally, off a van). `catalogue_part_id` is therefore
-- nullable, and `part_number` is carried here rather than joined: a workshop
-- must still be able to find a part after a supplier delists it.
--
-- ── 🔴 ON-HAND IS DERIVED FROM THE MOVEMENT LEDGER, NEVER STORED ───────────
--
-- The tempting shape is `stock_items.quantity_on_hand`, incremented and
-- decremented. It is the same mistake as a stored `paid_total` on an invoice,
-- which slice 3 refused for the same reason: a counter drifts the first time a
-- write is retried, and a workshop whose system says four alternators when the
-- shelf holds three has a system nobody believes.
--
-- So every change is a ROW in `parts.stock_movements` — append-only, signed
-- quantity — and on-hand is `sum(quantity)`. That also makes "why is this
-- number what it is" answerable, which a counter never can be.
--
-- `parts.stock_on_hand` is a VIEW over that sum. Reading it is the ONLY
-- supported way to ask what is in stock.
--
-- ── ⚠️ RESERVED IS NOT CONSUMED ────────────────────────────────────────────
--
-- Holding a part for tomorrow's job does not take it off the shelf; it makes it
-- unavailable to anyone else. So a reservation is its own row with its own
-- lifecycle, and AVAILABLE = on-hand − reserved. Modelling a reservation as a
-- negative movement would make the shelf count wrong and lose the ability to
-- release it.

BEGIN;

CREATE SCHEMA IF NOT EXISTS parts;
GRANT USAGE ON SCHEMA parts TO autoworkshop_app;

-- ── the workshop's own stock items ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parts.stock_items (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- Nullable: plenty of stock is bought locally and is on no marketplace.
    catalogue_part_id uuid REFERENCES catalogue.parts(id) ON DELETE SET NULL,

    -- Carried, not joined. A workshop must still be able to find a part after a
    -- supplier delists it from the marketplace.
    part_number      TEXT NOT NULL CHECK (length(btrim(part_number)) > 0),
    name             TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    brand            TEXT,
    unit             TEXT NOT NULL DEFAULT 'each',

    -- What it cost the workshop, not what the customer is charged. Pricing to
    -- the customer belongs to the quotation. numeric(14,2), matching every other
    -- money column in this database — a second representation is how two screens
    -- come to disagree about the same number.
    unit_cost        numeric(14,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
    currency         TEXT NOT NULL DEFAULT 'GHS' CHECK (currency ~ '^[A-Z]{3}$'),

    -- When on-hand falls to or below this, it wants ordering. NULL means the
    -- workshop has not said, which is different from zero.
    reorder_level    integer CHECK (reorder_level IS NULL OR reorder_level >= 0),
    shelf_location   TEXT,

    is_active        boolean NOT NULL DEFAULT true,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_stock_part_number UNIQUE (organization_id, part_number)
);

CREATE INDEX IF NOT EXISTS idx_stock_tenant ON parts.stock_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_tenant_active
    ON parts.stock_items (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_stock_tenant_created
    ON parts.stock_items (tenant_id, created_at DESC);

ALTER TABLE parts.stock_items DROP CONSTRAINT IF EXISTS uq_stock_id_tenant;
ALTER TABLE parts.stock_items ADD CONSTRAINT uq_stock_id_tenant UNIQUE (id, tenant_id);

-- ── the movement ledger ─────────────────────────────────────────────────────
--
-- APPEND-ONLY. Every change to what is on the shelf is a row here, and the
-- on-hand figure is their sum. See the header for why this is not a counter.

CREATE TABLE IF NOT EXISTS parts.stock_movements (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    stock_item_id    uuid NOT NULL,

    -- ⚠️ SIGNED. Receipts and returns are positive, issues and write-offs
    -- negative. A separate `direction` column would let a row say `issue` with a
    -- positive quantity and mean the opposite of what it reads.
    quantity         numeric(12,3) NOT NULL CHECK (quantity <> 0),

    movement_kind    TEXT NOT NULL CHECK (movement_kind IN (
        'goods_receipt', 'issue_to_job', 'return_from_job', 'stock_take',
        'write_off', 'transfer_in', 'transfer_out', 'opening_balance')),

    -- What it was for, when it was for something. No FK: a job card is scoped by
    -- tenant + organisation and RLS already answers reachability.
    job_card_id      uuid,
    goods_receipt_id uuid,
    reason           TEXT,

    recorded_by      uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    recorded_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_movement_item_scope
        FOREIGN KEY (stock_item_id, tenant_id)
        REFERENCES parts.stock_items (id, tenant_id) ON DELETE RESTRICT,
    -- A write-off or a stock-take correction must say why. These are the two
    -- movements that make stock disappear without a job to point at, and they
    -- are exactly where an unexplained number becomes unanswerable.
    CONSTRAINT chk_movement_reason
        CHECK (movement_kind NOT IN ('write_off', 'stock_take') OR reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_movement_item
    ON parts.stock_movements (stock_item_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_movement_tenant ON parts.stock_movements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_movement_job
    ON parts.stock_movements (tenant_id, job_card_id);

-- ── reservations ────────────────────────────────────────────────────────────
--
-- Holding a part for a job. NOT a movement: the part is still on the shelf, it
-- is simply spoken for. AVAILABLE = on-hand − reserved.

CREATE TABLE IF NOT EXISTS parts.reservations (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    stock_item_id    uuid NOT NULL,
    job_card_id      uuid NOT NULL,
    quantity         numeric(12,3) NOT NULL CHECK (quantity > 0),

    status           TEXT NOT NULL DEFAULT 'held'
                     CHECK (status IN ('held', 'issued', 'released', 'expired')),
    release_reason   TEXT,

    reserved_by      uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    reserved_at      timestamptz NOT NULL DEFAULT now(),
    settled_at       timestamptz,

    CONSTRAINT fk_reservation_item_scope
        FOREIGN KEY (stock_item_id, tenant_id)
        REFERENCES parts.stock_items (id, tenant_id) ON DELETE RESTRICT,
    -- A settled reservation must say when; a live one must not claim to have.
    CONSTRAINT chk_reservation_settled
        CHECK ((status = 'held') = (settled_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_reservation_item
    ON parts.reservations (stock_item_id, status);
CREATE INDEX IF NOT EXISTS idx_reservation_tenant ON parts.reservations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservation_job
    ON parts.reservations (tenant_id, job_card_id);
CREATE INDEX IF NOT EXISTS idx_reservation_held
    ON parts.reservations (tenant_id, organization_id) WHERE status = 'held';

-- ── requisitions: "we need this" ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parts.purchase_requisitions (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    requisition_number TEXT NOT NULL CHECK (length(btrim(requisition_number)) > 0),
    -- Free text as well as an optional stock item: a technician asking for
    -- something the workshop has never carried is the normal case, and forcing a
    -- stock item first is how a request ends up on a scrap of paper.
    stock_item_id    uuid,
    description      TEXT NOT NULL CHECK (length(btrim(description)) > 0),
    quantity         numeric(12,3) NOT NULL CHECK (quantity > 0),
    job_card_id      uuid,
    needed_by        date,

    status           TEXT NOT NULL DEFAULT 'requested'
                     CHECK (status IN ('requested', 'approved', 'ordered',
                                       'rejected', 'cancelled')),
    decision_reason  TEXT,

    requested_by     uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    requested_at     timestamptz NOT NULL DEFAULT now(),
    decided_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    decided_at       timestamptz,

    CONSTRAINT uq_requisition_number UNIQUE (organization_id, requisition_number),
    CONSTRAINT fk_requisition_item_scope
        FOREIGN KEY (stock_item_id, tenant_id)
        REFERENCES parts.stock_items (id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT chk_requisition_rejected_reason
        CHECK (status <> 'rejected' OR decision_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_requisition_tenant ON parts.purchase_requisitions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_requisition_tenant_status
    ON parts.purchase_requisitions (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_requisition_tenant_created
    ON parts.purchase_requisitions (tenant_id, requested_at DESC);

-- ── purchase orders: "we ordered it" ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parts.purchase_orders (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    order_number     TEXT NOT NULL CHECK (length(btrim(order_number)) > 0),
    -- The marketplace supplier, when the order went through it. Nullable: a
    -- workshop buys from the shop down the road too.
    supplier_id      uuid REFERENCES catalogue.suppliers(id) ON DELETE SET NULL,
    supplier_name    TEXT NOT NULL CHECK (length(btrim(supplier_name)) > 0),

    -- The marketplace order this came from, when the cart was the origin. This
    -- is the join between the owner's shopping cart and the workshop's stock.
    marketplace_order_id uuid REFERENCES catalogue.orders(id) ON DELETE SET NULL,

    status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'sent', 'part_received',
                                       'received', 'cancelled')),
    currency         TEXT NOT NULL DEFAULT 'GHS' CHECK (currency ~ '^[A-Z]{3}$'),
    expected_on      date,
    notes            TEXT,
    cancelled_reason TEXT,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_po_number UNIQUE (organization_id, order_number),
    CONSTRAINT chk_po_cancelled_reason
        CHECK (status <> 'cancelled' OR cancelled_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_po_tenant ON parts.purchase_orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_tenant_status
    ON parts.purchase_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_po_tenant_created
    ON parts.purchase_orders (tenant_id, created_at DESC);

ALTER TABLE parts.purchase_orders DROP CONSTRAINT IF EXISTS uq_po_id_tenant;
ALTER TABLE parts.purchase_orders ADD CONSTRAINT uq_po_id_tenant UNIQUE (id, tenant_id);

CREATE TABLE IF NOT EXISTS parts.purchase_order_lines (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    purchase_order_id uuid NOT NULL,
    stock_item_id    uuid,
    position         integer NOT NULL,

    description      TEXT NOT NULL CHECK (length(btrim(description)) > 0),
    quantity         numeric(12,3) NOT NULL CHECK (quantity > 0),
    unit_cost        numeric(14,2) NOT NULL CHECK (unit_cost >= 0),
    -- Computed by the database, same rounding as every other line total here.
    line_total       numeric(14,2)
                     GENERATED ALWAYS AS (round(quantity * unit_cost, 2)) STORED,

    CONSTRAINT fk_po_line_scope
        FOREIGN KEY (purchase_order_id, tenant_id)
        REFERENCES parts.purchase_orders (id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_po_line_item_scope
        FOREIGN KEY (stock_item_id, tenant_id)
        REFERENCES parts.stock_items (id, tenant_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_po_line_order
    ON parts.purchase_order_lines (purchase_order_id, position);
CREATE INDEX IF NOT EXISTS idx_po_line_tenant ON parts.purchase_order_lines (tenant_id);

-- ── goods receipts: "it arrived" ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parts.goods_receipts (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    receipt_number   TEXT NOT NULL CHECK (length(btrim(receipt_number)) > 0),
    purchase_order_id uuid,
    delivery_note_reference TEXT,
    notes            TEXT,

    received_by      uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    received_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_receipt_no UNIQUE (organization_id, receipt_number),
    CONSTRAINT fk_receipt_po_scope
        FOREIGN KEY (purchase_order_id, tenant_id)
        REFERENCES parts.purchase_orders (id, tenant_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_receipt_tenant ON parts.goods_receipts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_receipt_tenant_created
    ON parts.goods_receipts (tenant_id, received_at DESC);

-- ── tools and equipment ─────────────────────────────────────────────────────
--
-- §34/§46's "tools and equipment" pair. A tool is NOT a stock item: it is not
-- consumed, it is BORROWED and comes back. Modelling it as stock would make
-- every loan a negative movement and every return a positive one, and the shelf
-- count would swing about while the tool never left the building.

CREATE TABLE IF NOT EXISTS parts.tools (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    asset_tag        TEXT NOT NULL CHECK (length(btrim(asset_tag)) > 0),
    name             TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    tool_type        TEXT NOT NULL DEFAULT 'hand_tool'
                     CHECK (tool_type IN ('hand_tool', 'power_tool', 'diagnostic',
                                          'lifting', 'measurement', 'specialist', 'other')),
    location         TEXT,
    notes            TEXT,

    status           TEXT NOT NULL DEFAULT 'available'
                     CHECK (status IN ('available', 'in_use', 'maintenance',
                                       'calibration', 'lost', 'retired')),
    -- Calibration matters for torque wrenches and diagnostic gear; an out-of-date
    -- one produces measurements a repair is then judged on.
    calibration_due_on date,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_tool_tag UNIQUE (organization_id, asset_tag)
);

CREATE INDEX IF NOT EXISTS idx_tool_tenant ON parts.tools (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tool_tenant_status ON parts.tools (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tool_tenant_created
    ON parts.tools (tenant_id, created_at DESC);

-- ── the two views everything reads ──────────────────────────────────────────
--
-- ⚠️ READING THESE IS THE ONLY SUPPORTED WAY TO ASK WHAT IS IN STOCK. A caller
-- that sums the movements itself will eventually sum them differently.
--
-- `security_invoker = true` so the VIEW runs under the CALLER's permissions and
-- RLS applies. Without it a view owned by `autoworkshop` would hand every
-- tenant's stock to anyone who could select from it — a view is the classic
-- place RLS is lost by accident.

CREATE OR REPLACE VIEW parts.stock_on_hand
WITH (security_invoker = true) AS
SELECT
    si.id                AS stock_item_id,
    si.tenant_id,
    si.organization_id,
    si.part_number,
    si.name,
    si.brand,
    si.unit,
    si.unit_cost,
    si.currency,
    si.reorder_level,
    si.shelf_location,
    si.is_active,
    COALESCE(m.on_hand, 0)  AS on_hand,
    COALESCE(r.reserved, 0) AS reserved,
    COALESCE(m.on_hand, 0) - COALESCE(r.reserved, 0) AS available,
    -- "Wants ordering" is DERIVED, never a stored flag: a stored one is wrong
    -- the moment a movement lands and stays wrong until something rewrites it.
    (si.reorder_level IS NOT NULL
     AND COALESCE(m.on_hand, 0) - COALESCE(r.reserved, 0) <= si.reorder_level) AS needs_reorder
FROM parts.stock_items si
LEFT JOIN LATERAL (
    SELECT sum(quantity) AS on_hand
      FROM parts.stock_movements sm WHERE sm.stock_item_id = si.id
) m ON true
LEFT JOIN LATERAL (
    SELECT sum(quantity) AS reserved
      FROM parts.reservations rs
     WHERE rs.stock_item_id = si.id AND rs.status = 'held'
) r ON true;

GRANT SELECT ON parts.stock_on_hand TO autoworkshop_app;

-- ── append-only ledger guard ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION parts.reject_movement_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'parts.stock_movements is append-only: the on-hand figure IS the sum of these rows, '
        'so editing one rewrites history. Record a correcting movement instead.'
        USING ERRCODE = 'check_violation';
END;
$$;

-- ⚠️ UPDATE **AND** DELETE. "A rule enforced on UPDATE and nowhere else" has
-- been the defect twice in this repository.
DROP TRIGGER IF EXISTS trg_movement_immutable ON parts.stock_movements;
CREATE TRIGGER trg_movement_immutable
    BEFORE UPDATE OR DELETE ON parts.stock_movements
    FOR EACH ROW EXECUTE FUNCTION parts.reject_movement_rewrite();

-- ── row-level security ──────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'parts.stock_items', 'parts.stock_movements', 'parts.reservations',
        'parts.purchase_requisitions', 'parts.purchase_orders',
        'parts.purchase_order_lines', 'parts.goods_receipts', 'parts.tools'
    ] LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_select', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR SELECT USING '
            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
            'tenant_select', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
            'tenant_insert', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_update', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR UPDATE USING '
            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id()) '
            'WITH CHECK '
            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
            'tenant_update', t);
    END LOOP;
END $$;

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- ⚠️ THE REVOKES ARE NOT REDUNDANT — 006's ALTER DEFAULT PRIVILEGES grants
-- UPDATE/DELETE on every new table in these schemas.
--
-- `stock_movements` gets INSERT and SELECT only: the ledger is the truth, and
-- the trigger is a second line of defence rather than the only one.

GRANT SELECT, INSERT, UPDATE ON parts.stock_items            TO autoworkshop_app;
GRANT SELECT, INSERT         ON parts.stock_movements        TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON parts.reservations           TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON parts.purchase_requisitions  TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON parts.purchase_orders        TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON parts.purchase_order_lines   TO autoworkshop_app;
GRANT SELECT, INSERT         ON parts.goods_receipts         TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON parts.tools                  TO autoworkshop_app;

REVOKE DELETE ON parts.stock_items           FROM autoworkshop_app;
REVOKE DELETE ON parts.reservations          FROM autoworkshop_app;
REVOKE DELETE ON parts.purchase_requisitions FROM autoworkshop_app;
REVOKE DELETE ON parts.purchase_orders       FROM autoworkshop_app;
REVOKE DELETE ON parts.purchase_order_lines  FROM autoworkshop_app;
REVOKE DELETE ON parts.tools                 FROM autoworkshop_app;
REVOKE DELETE, UPDATE ON parts.stock_movements FROM autoworkshop_app;
REVOKE DELETE, UPDATE ON parts.goods_receipts  FROM autoworkshop_app;

COMMIT;
