-- 025_platform_admin_role_name.sql
--
-- 🔴 EVERY ADMIN POLICY IN THE CATALOGUE AND MARKETPLACE SCHEMAS IS CURRENTLY
-- UNREACHABLE FROM THE APPLICATION. Nine policies and three triggers, across
-- migrations 021 to 024, gate on:
--
--     identity.current_role_name() = 'admin'
--
-- and no request this application makes ever sets that value.
-- `tenantSessionStatements` sets `app.current_role` from `ctx.activeRole`,
-- which is the `identity.memberships.role_name` — for a platform administrator
-- that string is `platform_administrator`. The literal `admin` is set by
-- exactly two things: `scripts/seed-dev-catalogue.sh` and hand-run psql.
--
-- MEASURED, NOT INFERRED (2026-08-01, against the live local database):
--
--   set_config('app.current_role','platform_administrator') → UPDATE 0
--   set_config('app.current_role','admin')                  → UPDATE 20
--
-- So the 07-30 outstanding item "nothing can publish a catalogue row except the
-- seed script" was never only a missing screen. The database refuses the write
-- regardless of who is signed in, and an administrator publishing a part
-- through a perfectly correct API would have silently changed nothing —
-- `UPDATE 0` is not an error. Slice B's approval flow would have been built,
-- reviewed, merged and dead on arrival.
--
-- ⚠️ THIS IS THE "CONFIG READS CORRECT, MECHANISM IS INERT" PATTERN AGAIN, and
-- the tell was the same as every previous instance: two vocabularies for one
-- concept, agreeing nowhere. `permission-matrix.ts` already documents that the
-- database and the navigation speak different role names and maps between them.
-- Nothing mapped for SQL, because the policies were written against a role name
-- somebody expected the app to use rather than the one it does.
--
-- THE FIX IS ONE FUNCTION, not nine edited predicates. Two copies of a rule
-- drift; twelve copies have already proved they do.

BEGIN;

-- ---------------------------------------------------------------------------
-- The single predicate.
-- ---------------------------------------------------------------------------
-- BOTH names are accepted, deliberately:
--
--   · `platform_administrator` — what the APPLICATION sets, from the membership
--     row. This is the one that was missing and the reason for this migration.
--   · `admin` — what SEED SCRIPTS and migrations set. Dropping it would break
--     `seed-dev-catalogue.sh`, every verify script under `verify/`, and any
--     future data fix run by hand, all of which legitimately act as the
--     platform. That breakage would be loud but pointless.
--
-- Kept as a hard-coded list rather than a lookup against `ROLE_PERMISSIONS`:
-- the permission matrix lives in TypeScript, and a policy that had to consult
-- application tables to answer "is this the platform administrator" would be a
-- new dependency in the hottest path in the database. `permission-matrix.spec`
-- asserts this list against the SQL text so the two cannot drift again.
--
-- STABLE and SECURITY INVOKER: it reads only a GUC, so there is nothing to
-- define away from the caller.
CREATE OR REPLACE FUNCTION identity.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT identity.current_role_name() IN ('admin', 'platform_administrator');
$$;

COMMENT ON FUNCTION identity.is_platform_admin() IS
  'True when app.current_role names the platform administrator. Accepts the '
  'application role name (platform_administrator) AND the seed/psql one (admin). '
  'Added in 025 because every admin policy in 021-024 tested only the latter and '
  'was therefore unreachable from the application.';

REVOKE ALL ON FUNCTION identity.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.is_platform_admin() TO autoworkshop_app;

-- ---------------------------------------------------------------------------
-- 021 — the public catalogue.
-- ---------------------------------------------------------------------------
DROP POLICY admin_write ON catalogue.suppliers;
CREATE POLICY admin_write ON catalogue.suppliers
  FOR ALL USING (identity.is_platform_admin())
  WITH CHECK (identity.is_platform_admin());

DROP POLICY admin_write ON catalogue.part_categories;
CREATE POLICY admin_write ON catalogue.part_categories
  FOR ALL USING (identity.is_platform_admin())
  WITH CHECK (identity.is_platform_admin());

DROP POLICY admin_write ON catalogue.parts;
CREATE POLICY admin_write ON catalogue.parts
  FOR ALL USING (identity.is_platform_admin())
  WITH CHECK (identity.is_platform_admin());

DROP POLICY admin_write ON catalogue.part_fitments;
CREATE POLICY admin_write ON catalogue.part_fitments
  FOR ALL USING (identity.is_platform_admin())
  WITH CHECK (identity.is_platform_admin());

DROP POLICY admin_write ON catalogue.mechanic_directory;
CREATE POLICY admin_write ON catalogue.mechanic_directory
  FOR ALL USING (identity.is_platform_admin())
  WITH CHECK (identity.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 022 — marketplace orders.
-- ---------------------------------------------------------------------------
-- ⚠️ `order_events` STAYS APPEND-ONLY. This restores the administrator's reach,
-- it does not widen it: 022 REVOKEd UPDATE and DELETE on that table from the
-- application role entirely, and a policy cannot grant back a privilege the
-- role does not hold.
DROP POLICY admin_all ON catalogue.orders;
CREATE POLICY admin_all ON catalogue.orders
  FOR ALL USING (identity.is_platform_admin())
  WITH CHECK (identity.is_platform_admin());

DROP POLICY admin_all ON catalogue.order_lines;
CREATE POLICY admin_all ON catalogue.order_lines
  FOR ALL USING (identity.is_platform_admin())
  WITH CHECK (identity.is_platform_admin());

DROP POLICY admin_all ON catalogue.order_events;
CREATE POLICY admin_all ON catalogue.order_events
  FOR ALL USING (identity.is_platform_admin())
  WITH CHECK (identity.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 023 — supplier accounts.
-- ---------------------------------------------------------------------------
DROP POLICY admin_all ON catalogue.supplier_users;
CREATE POLICY admin_all ON catalogue.supplier_users
  FOR ALL USING (identity.is_platform_admin())
  WITH CHECK (identity.is_platform_admin());

-- ---------------------------------------------------------------------------
-- The three column-guard triggers.
-- ---------------------------------------------------------------------------
-- Their admin early-return had the identical defect: a platform administrator
-- correcting an order would have been treated as an ordinary supplier and
-- refused by the very guard written to exempt them.
--
-- ⚠️ REPLACED WHOLE rather than patched, because `CREATE OR REPLACE FUNCTION`
-- has no partial form. Each body below is 023's or 024's, unchanged except for
-- the predicate on its first line — if either is edited later, this migration
-- is where the two versions have to be reconciled.
CREATE OR REPLACE FUNCTION catalogue.reject_supplier_order_overreach()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Platform admin is not constrained here; support has to be able to correct
  -- an order, and every such correction is an `order_events` row.
  IF identity.is_platform_admin() THEN
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

CREATE OR REPLACE FUNCTION catalogue.reject_supplier_profile_overreach()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF identity.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_published OR NEW.is_verified THEN
      RAISE EXCEPTION 'a supplier cannot publish or verify itself'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT catalogue.current_user_supplies(NEW.id) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_published IS DISTINCT FROM OLD.is_published THEN
    RAISE EXCEPTION 'only an administrator may publish or unpublish a supplier'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'only an administrator may change verification'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'only an administrator may change a supplier slug'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'created_by is immutable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'id is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION catalogue.reject_part_overreach()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF identity.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT catalogue.current_user_supplies(NEW.supplier_id) THEN
      RETURN NEW;
    END IF;
    IF NEW.is_published THEN
      RAISE EXCEPTION 'a supplier cannot publish its own part'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT catalogue.current_user_supplies(OLD.supplier_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_published IS DISTINCT FROM OLD.is_published THEN
    RAISE EXCEPTION 'only an administrator may publish or unpublish a part'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
    RAISE EXCEPTION 'a part cannot be moved to another supplier'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
