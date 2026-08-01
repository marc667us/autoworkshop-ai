-- 024_supplier_catalogue.sql
--
-- SLICE B — let a supplier manage its OWN catalogue, and let an administrator
-- decide what the public sees.
--
-- The gap this closes, stated plainly in the 07-30 outstanding list: "Nothing
-- can publish a catalogue row except the seed script." Every part in the
-- marketplace today was inserted by `scripts/seed-dev-catalogue.sh`. Until a
-- supplier can add its own stock the marketplace cannot grow without a
-- developer, which is not a product.
--
-- ⚠️ THE ONE RULE THIS MIGRATION EXISTS TO ENFORCE: A SUPPLIER MAY WRITE ITS
-- CATALOGUE BUT MAY NOT PUBLISH IT. `is_published` is the only thing standing
-- between a draft row and the open internet (021's own words), and a supplier
-- that can flip it is a supplier that can put anything in front of a stranger
-- under this platform's name. Publication stays with `admin_write`.
--
-- ⚠️ AND AGAIN: RLS SELECTS ROWS, NOT COLUMNS. A policy cannot say "you may
-- update this row except for these two fields" — `WITH CHECK` sees only the
-- resulting row and cannot compare it to the old one. So the column rule is a
-- trigger comparing OLD to NEW, exactly as 023 does for orders and 015 for
-- settled repair plans. The policy decides WHICH rows; the trigger decides WHAT
-- may change. Both are required and neither is sufficient.
--
-- ⚠️ WHY THE "APPLICATION" IS JUST AN UNPUBLISHED SUPPLIER ROW, with no
-- `supplier_applications` table. 021 already made `is_published` default FALSE
-- precisely so "a row created without thinking about it is invisible". A
-- separate application table would hold the same columns, need the same
-- validation, and then be copied into `suppliers` on approval — two schemas and
-- a copy step to express a boolean that already exists. Approval is publication.
--
-- ⚠️ `created_by` IS ADDED FOR A SECURITY REASON, NOT FOR AUDIT. The obvious
-- bootstrap policy — "you may make yourself owner of a supplier that has no
-- members yet" — lets ANY signed-in user claim ownership of ANY unclaimed
-- supplier, including one an administrator created by hand and had not yet
-- staffed. Ownership therefore bootstraps only on a supplier the SAME USER
-- created, which is a fact the row has to carry.

BEGIN;

-- ---------------------------------------------------------------------------
-- Who created a supplier row.
-- ---------------------------------------------------------------------------
-- NULL for every row that predates this migration, and for anything an
-- administrator creates directly. NULL must therefore never satisfy a
-- predicate: `created_by = identity.current_user_id()` is NULL-safe only
-- because SQL comparison with NULL yields NULL, which is not TRUE. That is the
-- desired behaviour and it is asserted in the verify script rather than assumed.
ALTER TABLE catalogue.suppliers
  ADD COLUMN created_by UUID REFERENCES identity.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN catalogue.suppliers.created_by IS
  'The user who applied to list this supplier. Load-bearing: it is what stops a '
  'signed-in stranger claiming ownership of an unclaimed supplier row.';

CREATE INDEX idx_suppliers_created_by ON catalogue.suppliers (created_by);

-- ---------------------------------------------------------------------------
-- The column guard for suppliers.
-- ---------------------------------------------------------------------------
-- Frozen columns are listed EXPLICITLY and compared one by one rather than with
-- a whole-row comparison, for the reason 023 gives: a column added later is
-- then frozen BY DEFAULT for suppliers, because it will not appear in the
-- allowed set. A guard that silently permits tomorrow's column is a guard that
-- expires without telling anybody.
CREATE OR REPLACE FUNCTION catalogue.reject_supplier_profile_overreach()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Platform admin is unconstrained: verifying and publishing a supplier is
  -- precisely the administrator's job, and support must be able to correct a
  -- listing.
  IF identity.current_role_name() = 'admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- An applicant may not arrive pre-approved. Belt and braces with the
    -- INSERT policy's WITH CHECK: the policy states the same rule, and if
    -- either is ever relaxed the other still refuses.
    IF NEW.is_published OR NEW.is_verified THEN
      RAISE EXCEPTION 'a supplier cannot publish or verify itself'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  -- Not a member => no opinion. The row-level policy is what refused them, and
  -- raising here would replace a clean "no such row" with a confusing message.
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
  -- The slug is the public URL. Changing it silently breaks every link anyone
  -- has ever shared, so it is an administrator's decision too.
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

DROP TRIGGER IF EXISTS trg_suppliers_profile_scope ON catalogue.suppliers;
CREATE TRIGGER trg_suppliers_profile_scope
  BEFORE INSERT OR UPDATE ON catalogue.suppliers
  FOR EACH ROW EXECUTE FUNCTION catalogue.reject_supplier_profile_overreach();

-- ---------------------------------------------------------------------------
-- The column guard for parts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION catalogue.reject_part_overreach()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF identity.current_role_name() = 'admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT catalogue.current_user_supplies(NEW.supplier_id) THEN
      RETURN NEW;   -- the policy refuses it; say nothing here
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

  -- ⚠️ MOVING A PART BETWEEN SUPPLIERS IS THE ESCALATION THIS LINE STOPS.
  -- Without it a supplier could take one of their own drafts and reassign it to
  -- a PUBLISHED competitor, and because `parts.is_published` would be
  -- unchanged, nothing else in this migration would object. The row-level
  -- policy does not catch it either: `USING` tests the OLD row, which they do
  -- own, and `WITH CHECK` would test the NEW one — so the check must exist, and
  -- freezing the column is simpler to reason about than relying on both halves
  -- of the policy being right.
  IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
    RAISE EXCEPTION 'a part cannot be moved to another supplier'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parts_supplier_scope ON catalogue.parts;
CREATE TRIGGER trg_parts_supplier_scope
  BEFORE INSERT OR UPDATE ON catalogue.parts
  FOR EACH ROW EXECUTE FUNCTION catalogue.reject_part_overreach();

-- ---------------------------------------------------------------------------
-- Policies — suppliers.
-- ---------------------------------------------------------------------------
-- Permissive policies OR together, so each of these ADDS to 021's `public_read`
-- and `admin_write` rather than replacing them.

-- A member sees their own supplier row whether or not it is published — which
-- is the entire point: an applicant must be able to see the listing they are
-- waiting to have approved. The `created_by` arm covers the window between
-- creating the row and the ownership row existing.
CREATE POLICY supplier_read_own ON catalogue.suppliers
  FOR SELECT USING (
    catalogue.current_user_supplies(id) OR created_by = identity.current_user_id()
  );

-- Anybody signed in may APPLY. The row is invisible to the public until an
-- administrator publishes it, so the worst an abusive applicant achieves is a
-- row in a queue — and `is_published`/`is_verified` are pinned FALSE here as
-- well as in the trigger.
CREATE POLICY applicant_insert ON catalogue.suppliers
  FOR INSERT WITH CHECK (
    identity.current_user_id() IS NOT NULL
    AND created_by = identity.current_user_id()
    AND is_published = FALSE
    AND is_verified = FALSE
  );

CREATE POLICY supplier_update_own ON catalogue.suppliers
  FOR UPDATE USING (catalogue.current_user_supplies(id))
  WITH CHECK (catalogue.current_user_supplies(id));

-- ---------------------------------------------------------------------------
-- Policies — parts and fitments.
-- ---------------------------------------------------------------------------
-- FOR ALL: a supplier reads its drafts, adds stock, edits it and removes it.
-- DELETE is granted deliberately — a part is reference data, not a record of
-- something that happened, and 022 snapshots price, currency and supplier onto
-- `order_lines` at order time precisely so a placed order does not depend on
-- the catalogue row still existing.
CREATE POLICY supplier_manage_own ON catalogue.parts
  FOR ALL USING (catalogue.current_user_supplies(supplier_id))
  WITH CHECK (catalogue.current_user_supplies(supplier_id));

CREATE POLICY supplier_manage_own ON catalogue.part_fitments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM catalogue.parts p
       WHERE p.id = part_id AND catalogue.current_user_supplies(p.supplier_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM catalogue.parts p
       WHERE p.id = part_id AND catalogue.current_user_supplies(p.supplier_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Policy — bootstrapping ownership.
-- ---------------------------------------------------------------------------
-- ⚠️ NARROWED TO A SUPPLIER THIS USER CREATED. The obvious version of this
-- policy — "the supplier has no active members yet" — reads as a reasonable
-- first-come rule and is a privilege-escalation hole: every supplier an
-- administrator seeds by hand sits unclaimed until somebody staffs it, and any
-- signed-in stranger could make themselves its owner in that window. Three of
-- the five suppliers in the dev catalogue were created exactly that way.
--
-- So: you may make YOURSELF the OWNER of a supplier YOU created, once.
-- Inviting further members is `supplier_users`' own concern and stays with the
-- administrator until a supplier-side invitation flow exists.
CREATE POLICY founder_insert ON catalogue.supplier_users
  FOR INSERT WITH CHECK (
    user_id = identity.current_user_id()
    AND member_role = 'owner'
    AND status = 'active'
    AND EXISTS (
      SELECT 1 FROM catalogue.suppliers s
       WHERE s.id = supplier_id
         AND s.created_by = identity.current_user_id()
    )
  );

COMMIT;
