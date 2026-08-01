-- 026_fitment_publication_guard.sql
--
-- 🔴 CLOSES A PUBLICATION BYPASS THAT 024 LEFT OPEN. Found by Codex on the 024
-- review and CONFIRMED BY MEASUREMENT before this migration was written:
--
--     supplier inserted 1 fitment row(s) on a PUBLISHED part
--     CONFIRMED: the new fitment is PUBLIC to an anonymous visitor — no admin approval
--
-- 024's stated rule is "a supplier may write its catalogue but may NOT publish
-- it", and it enforced that on `suppliers` and `parts` with column guards. It
-- did not enforce it on `part_fitments`, and fitments are public content:
-- 021's `public_read` policy makes a fitment readable exactly when ITS PART is
-- published. So a supplier holding one admin-approved part could attach any
-- number of new compatibility claims to it and every one of them went straight
-- to the open internet.
--
-- ⚠️ WHY THIS IS WORSE THAN A COSMETIC ESCAPE, and why it is fixed rather than
-- documented. A fitment is the claim "this part fits that car". It is the field
-- a buyer searches on and the one they trust when they cannot inspect the part.
-- A wrong claim on a brake disc is not a typo on a listing — it is the wrong
-- component fitted to a vehicle. Of everything in this schema, fitment is the
-- field where unreviewed public writes carry physical risk.
--
-- ⚠️ THE REFUSAL NAMES A REACHABLE ALTERNATIVE, which in this repository is not
-- a nicety: a rule whose escape hatch is unreachable is a wall, and that has
-- been the most expensive defect class here for four slices running. A supplier
-- who needs to correct a live fitment asks an administrator to WITHDRAW the
-- part; the part is then unpublished, the supplier edits freely, and the
-- administrator republishes. Every step of that is now genuinely possible —
-- admin unpublish was itself dead until migration 025 and is asserted by
-- `verify/025` check 2.

BEGIN;

CREATE OR REPLACE FUNCTION catalogue.reject_published_fitment_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_part_id   UUID;
  v_published BOOLEAN;
  v_number    TEXT;
BEGIN
  -- The administrator is the approval authority; constraining them here would
  -- remove the only route by which a live fitment can ever be corrected.
  IF identity.is_platform_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ⚠️ THE ROW BEING JUDGED DIFFERS BY OPERATION. On DELETE there is no NEW; on
  -- UPDATE both exist and BOTH matter — checking only NEW would let a fitment
  -- be moved OFF a published part, and checking only OLD would let one be moved
  -- ON to it. The loop below therefore judges every part id involved.
  FOREACH v_part_id IN ARRAY (
    CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW.part_id]
      WHEN 'DELETE' THEN ARRAY[OLD.part_id]
      ELSE ARRAY[OLD.part_id, NEW.part_id]
    END
  )
  LOOP
    -- Read the parent WITHOUT the caller's policies in the way. `parts` is
    -- RLS-protected and a supplier can see its own rows, so a plain SELECT
    -- would usually work — but "usually" is not a guard. `current_user_supplies`
    -- already establishes the SECURITY DEFINER precedent in 023 for exactly
    -- this reason: a check that silently sees no row would pass.
    SELECT p.is_published, p.part_number INTO v_published, v_number
      FROM catalogue.parts p WHERE p.id = v_part_id;

    -- No parent visible => this trigger has no opinion. The FK and the row
    -- policy decide; raising here would replace a clean refusal with a
    -- confusing one.
    IF v_published IS NULL THEN
      CONTINUE;
    END IF;

    -- Not theirs => the policy already refused it. Say nothing.
    IF NOT catalogue.current_user_supplies(
         (SELECT supplier_id FROM catalogue.parts WHERE id = v_part_id)) THEN
      CONTINUE;
    END IF;

    IF v_published THEN
      RAISE EXCEPTION
        'part % is published: its fitments are public, so only an administrator '
        'may change them. Ask an administrator to withdraw the part, edit the '
        'fitments while it is unpublished, then have it republished.',
        v_number
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_fitments_publication_guard ON catalogue.part_fitments;
CREATE TRIGGER trg_fitments_publication_guard
  BEFORE INSERT OR UPDATE OR DELETE ON catalogue.part_fitments
  FOR EACH ROW EXECUTE FUNCTION catalogue.reject_published_fitment_write();

COMMIT;
