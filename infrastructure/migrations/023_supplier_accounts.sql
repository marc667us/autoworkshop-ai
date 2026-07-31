-- 023_supplier_accounts.sql
--
-- SLICE A step 2 — give a supplier an ACCOUNT, so the order inbox has somebody
-- to authenticate. Owner decision 2026-07-31, taken after 022 recorded that a
-- supplier could not sign in at all.
--
-- 021 deliberately defined a supplier as a catalogue entity with "no tenant, no
-- users, no job cards", and that was right FOR A CATALOGUE: a parts distributor
-- appears in the marketplace whether or not it ever signs up, and giving every
-- one of them a tenant and a membership surface would have been ceremony. What
-- changed is that 022 introduced something a supplier must ACT on. A row that
-- receives orders needs somebody accountable for reading them.
--
-- ⚠️ A SUPPLIER ACCOUNT IS NOT A TENANT, AND THIS MIGRATION DOES NOT MAKE ONE.
-- `catalogue.supplier_users` is a membership between a global `identity.users`
-- row and a `catalogue.suppliers` row. It grants reach into the catalogue
-- schema and NOTHING ELSE — no tenant context, no organization, no branch, no
-- job cards, no customer book. A supplier signing in must not become a way into
-- the workshop side of the product, so the membership is deliberately kept out
-- of `identity` and confers nothing there.
--
-- ⚠️ RLS SELECTS ROWS, NOT COLUMNS — WHICH IS WHY THERE IS ALSO A TRIGGER.
-- A supplier may update the status and the tracking reference of an order sent
-- to them. They must not be able to rewrite its price, its buyer, or its
-- delivery address. No policy can express that: `WITH CHECK` sees only the
-- resulting row and cannot compare it to the old one. Column-level GRANTs
-- cannot express it either, because every request in this application arrives
-- on the SAME database role and is distinguished only by GUCs. So the column
-- rule is a BEFORE UPDATE trigger comparing OLD to NEW, the same mechanism 015
-- uses for settled repair plans.

BEGIN;

-- ---------------------------------------------------------------------------
-- Supplier membership.
-- ---------------------------------------------------------------------------
CREATE TABLE catalogue.supplier_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  supplier_id  UUID NOT NULL REFERENCES catalogue.suppliers(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES identity.users(id)      ON DELETE RESTRICT,

  -- `owner` may invite and revoke other members; `staff` may only work orders.
  -- Deliberately two values: a permission lattice nobody has asked for is a
  -- lattice nobody maintains.
  member_role  TEXT NOT NULL DEFAULT 'staff',

  -- ⚠️ REVOKED, NOT DELETED. Removing the row would erase the fact that this
  -- person once had access, which is precisely what an investigation needs.
  -- Every predicate below tests `status = 'active'`, so a revoked member is
  -- inert immediately while remaining on the record.
  status       TEXT NOT NULL DEFAULT 'active',

  invited_by   UUID REFERENCES identity.users(id) ON DELETE RESTRICT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_supplier_user UNIQUE (supplier_id, user_id),
  CONSTRAINT ck_supplier_member_role CHECK (member_role IN ('owner', 'staff')),
  CONSTRAINT ck_supplier_member_status CHECK (status IN ('active', 'revoked'))
);

CREATE INDEX idx_supplier_users_user     ON catalogue.supplier_users (user_id, status);
CREATE INDEX idx_supplier_users_supplier ON catalogue.supplier_users (supplier_id, status);

-- ---------------------------------------------------------------------------
-- The membership predicate every supplier policy below is built from.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER on purpose, and this is the one place in this migration
-- where that is load-bearing. The policies on `orders` need to ask "is the
-- caller a member of this supplier?" — but `supplier_users` is itself
-- RLS-protected, so asking it as the caller would recurse into another policy
-- check. Running the lookup as the owner answers the membership question
-- directly. It is safe because the function takes ONE argument, reads ONE
-- table, returns a BOOLEAN, and cannot be steered into returning rows.
--
-- STABLE, not VOLATILE, so the planner may evaluate it once per statement
-- rather than once per row — the difference between an index lookup and a
-- sequential membership check on every order in the table.
CREATE OR REPLACE FUNCTION catalogue.current_user_supplies(p_supplier_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = catalogue, identity, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM catalogue.supplier_users su
     WHERE su.supplier_id = p_supplier_id
       AND su.user_id = identity.current_user_id()
       AND su.status = 'active'
  );
$$;

-- A SECURITY DEFINER function is executable by PUBLIC unless told otherwise,
-- and PUBLIC includes every role the database will ever have. Same REVOKE as
-- `identity.memberships_for_subject` in 003.
REVOKE ALL ON FUNCTION catalogue.current_user_supplies(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION catalogue.current_user_supplies(UUID) TO autoworkshop_app;

-- ---------------------------------------------------------------------------
-- What a supplier is allowed to change on an order.
-- ---------------------------------------------------------------------------
-- Returns the columns a supplier-context UPDATE may touch. Written as a
-- function rather than inlined so the trigger and any future test assert the
-- SAME list — two copies of this rule would drift.
CREATE OR REPLACE FUNCTION catalogue.reject_supplier_order_overreach()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Platform admin is not constrained here; support has to be able to correct
  -- an order, and every such correction is an `order_events` row.
  IF identity.current_role_name() = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Not a supplier member for this order => this trigger has no opinion. The
  -- RLS policies already decided whether the row was reachable at all; the
  -- buyer has no UPDATE policy, so there is no third case to handle.
  IF NOT catalogue.current_user_supplies(OLD.supplier_id) THEN
    RETURN NEW;
  END IF;

  -- ⚠️ EVERY COLUMN NOT NAMED IN THE ALLOWED SET IS FROZEN, stated as explicit
  -- comparisons rather than a whitelist loop so that a column ADDED LATER is
  -- frozen by default. A `to_jsonb(NEW) - allowed_keys` diff would silently let
  -- new columns through, which is the wrong failure direction for money.
  IF NEW.id                 IS DISTINCT FROM OLD.id
     OR NEW.order_number    IS DISTINCT FROM OLD.order_number
     OR NEW.buyer_user_id   IS DISTINCT FROM OLD.buyer_user_id
     OR NEW.supplier_id     IS DISTINCT FROM OLD.supplier_id
     OR NEW.supplier_name   IS DISTINCT FROM OLD.supplier_name
     OR NEW.currency        IS DISTINCT FROM OLD.currency
     OR NEW.subtotal        IS DISTINCT FROM OLD.subtotal
     OR NEW.delivery_fee    IS DISTINCT FROM OLD.delivery_fee
     OR NEW.total           IS DISTINCT FROM OLD.total
     OR NEW.placed_at       IS DISTINCT FROM OLD.placed_at
  THEN
    RAISE EXCEPTION
      'a supplier may not change the identity or the money of an order '
      '(order %). Allowed: status, delivery_tracking_reference, delivery_notes, '
      'payment_status, payment_method, payment_reference, cancelled_reason.',
      OLD.order_number
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The delivery ADDRESS is the buyer's instruction, not the supplier's field.
  -- A supplier who could rewrite it could redirect goods the buyer paid for.
  IF NEW.delivery_recipient IS DISTINCT FROM OLD.delivery_recipient
     OR NEW.delivery_phone  IS DISTINCT FROM OLD.delivery_phone
     OR NEW.delivery_address IS DISTINCT FROM OLD.delivery_address
  THEN
    RAISE EXCEPTION
      'a supplier may not change the delivery details of an order (order %). '
      'Ask the buyer to change them, or cancel and re-place.',
      OLD.order_number
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_supplier_scope ON catalogue.orders;
CREATE TRIGGER trg_orders_supplier_scope
  BEFORE UPDATE ON catalogue.orders
  FOR EACH ROW
  EXECUTE FUNCTION catalogue.reject_supplier_order_overreach();

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE catalogue.supplier_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue.supplier_users FORCE  ROW LEVEL SECURITY;

-- A member sees their own membership rows, and every membership of a supplier
-- they belong to — an owner has to be able to see who else has access in order
-- to revoke it. Note this reads `supplier_users` from within a policy ON
-- `supplier_users`, so it goes through the SECURITY DEFINER function rather
-- than a direct subquery, which would recurse.
CREATE POLICY member_read ON catalogue.supplier_users
  FOR SELECT USING (
    user_id = identity.current_user_id()
    OR catalogue.current_user_supplies(supplier_id)
  );

CREATE POLICY admin_all ON catalogue.supplier_users
  FOR ALL USING (identity.current_role_name() = 'admin')
  WITH CHECK (identity.current_role_name() = 'admin');

-- ---------------------------------------------------------------------------
-- Supplier reach into orders.
-- ---------------------------------------------------------------------------
-- ⚠️ THE SUPPLIER SEES THE BUYER'S DELIVERY DETAILS, AND THAT IS INTENDED.
-- They cannot deliver to an address they cannot read. What they do NOT get is
-- the buyer's account: no email, no other orders, no vehicle or workshop
-- record — the order row carries only the recipient, phone and address the
-- buyer supplied FOR THIS DELIVERY. That is the same consented-copy principle
-- 021 used for `mechanic_directory`.
CREATE POLICY supplier_read ON catalogue.orders
  FOR SELECT USING (catalogue.current_user_supplies(supplier_id));

-- UPDATE is granted at row level here and narrowed to specific COLUMNS by
-- `trg_orders_supplier_scope` above. Both are required: the policy decides
-- WHICH orders, the trigger decides WHAT may change.
CREATE POLICY supplier_update ON catalogue.orders
  FOR UPDATE USING (catalogue.current_user_supplies(supplier_id))
  WITH CHECK (catalogue.current_user_supplies(supplier_id));

CREATE POLICY supplier_read ON catalogue.order_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM catalogue.orders o
      WHERE o.id = order_id AND catalogue.current_user_supplies(o.supplier_id)
    )
  );

CREATE POLICY supplier_read ON catalogue.order_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM catalogue.orders o
      WHERE o.id = order_id AND catalogue.current_user_supplies(o.supplier_id)
    )
  );

-- A supplier confirming or dispatching an order must be able to say so. Insert
-- only — `order_events` remains append-only for every actor, enforced by the
-- REVOKE in 022.
CREATE POLICY supplier_insert ON catalogue.order_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM catalogue.orders o
      WHERE o.id = order_id AND catalogue.current_user_supplies(o.supplier_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Grants.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogue.supplier_users TO autoworkshop_app;

COMMIT;
