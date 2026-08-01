-- Proof by effect for migration 024 (supplier catalogue management).
--
-- 024 makes one claim that the whole slice rests on:
--
--   A SUPPLIER MAY WRITE ITS CATALOGUE BUT MAY NOT PUBLISH IT.
--
-- Every refusal below is paired with the ALLOWED action it must not block. A
-- guard that refuses everything passes every exclusion test while the feature
-- is dead, and "supplier cannot add parts" is a worse outcome than "supplier
-- can publish parts" — it is the one nobody reports, because the screen simply
-- appears not to work.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/024_supplier_catalogue.sql
--
-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.

BEGIN;

-- ⚠️ SEEDING NEEDS THE ADMIN GUC, and 024 is what made that true here: the new
-- triggers refuse a non-admin INSERT that arrives pre-published, and these
-- fixtures deliberately ARE published. `scripts/seed-dev-catalogue.sh` already
-- sets this before every catalogue write for the same reason.
--
-- It is CLEARED again at the top of the assertion block below. Leaving it set
-- would make every check run as an administrator, and every refusal test would
-- pass by never being reached — check 0 exists to prove that did not happen.
SELECT set_config('app.current_role', 'admin', true);

CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;

INSERT INTO _fx (k, v) VALUES
  ('owner_1',   gen_random_uuid()),
  ('owner_2',   gen_random_uuid()),
  ('applicant', gen_random_uuid()),
  ('stranger',  gen_random_uuid());

INSERT INTO identity.users (id, keycloak_subject, email, display_name, preferred_locale, status)
SELECT v, 'verify-024-' || k, k || '@verify.invalid', 'Verify ' || k, 'en', 'active' FROM _fx;

-- TWO suppliers. One alone would let a policy that returns everything pass the
-- cross-supplier exclusions.
INSERT INTO catalogue.suppliers (id, slug, name, country, is_published)
VALUES
  (gen_random_uuid(), 'verify-024-alpha', 'Verify Alpha Parts', 'GH', TRUE),
  (gen_random_uuid(), 'verify-024-beta',  'Verify Beta Parts',  'GH', TRUE);

INSERT INTO _fx (k, v) SELECT 'supplier_1', id FROM catalogue.suppliers WHERE slug='verify-024-alpha';
INSERT INTO _fx (k, v) SELECT 'supplier_2', id FROM catalogue.suppliers WHERE slug='verify-024-beta';

-- ⚠️ SEEDED WITH created_by NULL ON PURPOSE. These are the "administrator
-- created it by hand" rows, and check 12 asserts a stranger cannot claim one.
INSERT INTO catalogue.supplier_users (supplier_id, user_id, member_role, status)
VALUES
  ((SELECT v FROM _fx WHERE k='supplier_1'), (SELECT v FROM _fx WHERE k='owner_1'), 'owner', 'active'),
  ((SELECT v FROM _fx WHERE k='supplier_2'), (SELECT v FROM _fx WHERE k='owner_2'), 'owner', 'active');

INSERT INTO _fx (k, v) SELECT 'category', id FROM catalogue.part_categories ORDER BY display_order LIMIT 1;

-- One PUBLISHED part per supplier, so the publish/unpublish refusals have a
-- published row to attack.
INSERT INTO catalogue.parts (supplier_id, category_id, part_number, name, price, currency, is_published)
VALUES
  ((SELECT v FROM _fx WHERE k='supplier_1'), (SELECT v FROM _fx WHERE k='category'),
   'VERIFY-024-P1', 'Verify Part One', 100.00, 'GHS', TRUE),
  ((SELECT v FROM _fx WHERE k='supplier_2'), (SELECT v FROM _fx WHERE k='category'),
   'VERIFY-024-P2', 'Verify Part Two', 200.00, 'GHS', TRUE);

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  n INTEGER;
  v_draft UUID;
  v_new_supplier UUID;
BEGIN
  -- 0. THE TEST IS NOT RUNNING AS AN ADMINISTRATOR.
  --
  -- The seed phase above needed `app.current_role='admin'`, and that GUC is
  -- transaction-local — it survives into this block unless cleared. If it did,
  -- every trigger below would take its admin early-return and all eleven
  -- refusal tests would pass without exercising a single rule. This is the
  -- check that makes the rest of the file mean something.
  PERFORM set_config('app.current_role', '', true);
  IF identity.current_role_name() = 'admin' THEN
    RAISE EXCEPTION 'check 0 FAILED: assertions are running as admin — every refusal below is vacuous';
  END IF;
  RAISE NOTICE 'check 0 OK: assertions run as a non-admin supplier member';

  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='owner_1')::text, true);

  -- 1. CONTROL. A supplier member can CREATE a part. Every refusal below is
  --    meaningless if this fails.
  INSERT INTO catalogue.parts (supplier_id, category_id, part_number, name, price, currency)
  VALUES ((SELECT v FROM _fx WHERE k='supplier_1'), (SELECT v FROM _fx WHERE k='category'),
          'VERIFY-024-DRAFT', 'Verify Draft Part', 50.00, 'GHS')
  RETURNING id INTO v_draft;
  IF v_draft IS NULL THEN
    RAISE EXCEPTION 'check 1 FAILED: a supplier could not add a part — the exclusions below are vacuous';
  END IF;
  RAISE NOTICE 'check 1 OK: a supplier CAN add a part to its own catalogue';

  -- 2. CONTROL. And edit it.
  UPDATE catalogue.parts SET price = 60.00, description = 'edited' WHERE id = v_draft;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 2 FAILED: a supplier could not edit its own part (% rows)', n;
  END IF;
  RAISE NOTICE 'check 2 OK: a supplier CAN edit its own part';

  -- 3. CONTROL. And read it while it is still a draft — an applicant who cannot
  --    see their own unpublished work has no screen to work on.
  SELECT count(*) INTO n FROM catalogue.parts WHERE id = v_draft AND NOT is_published;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 3 FAILED: a supplier cannot see its own UNPUBLISHED part';
  END IF;
  RAISE NOTICE 'check 3 OK: a supplier sees its own drafts';

  -- 4. THE HEADLINE RULE. It may not publish that draft.
  BEGIN
    UPDATE catalogue.parts SET is_published = TRUE WHERE id = v_draft;
    RAISE EXCEPTION 'check 4 FAILED: a supplier PUBLISHED its own part';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 4 OK: a supplier cannot publish its own part';
  END;

  -- 5. Nor create one already published, which is the same escalation by
  --    another door.
  BEGIN
    INSERT INTO catalogue.parts (supplier_id, category_id, part_number, name, price, currency, is_published)
    VALUES ((SELECT v FROM _fx WHERE k='supplier_1'), (SELECT v FROM _fx WHERE k='category'),
            'VERIFY-024-SNEAK', 'Verify Sneak', 10.00, 'GHS', TRUE);
    RAISE EXCEPTION 'check 5 FAILED: a supplier created a part that was already published';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 5 OK: a supplier cannot create a pre-published part';
  END;

  -- 6. Nor UNpublish a live one. Withdrawal is an administrator's decision for
  --    the same reason publication is: an order may already reference it.
  BEGIN
    UPDATE catalogue.parts SET is_published = FALSE WHERE part_number = 'VERIFY-024-P1';
    RAISE EXCEPTION 'check 6 FAILED: a supplier unpublished a live part';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 6 OK: a supplier cannot unpublish a live part';
  END;

  -- 7. Nor move a part onto a PUBLISHED competitor, which would put their text
  --    on somebody else's storefront with `is_published` never changing.
  BEGIN
    UPDATE catalogue.parts SET supplier_id = (SELECT v FROM _fx WHERE k='supplier_2')
     WHERE id = v_draft;
    RAISE EXCEPTION 'check 7 FAILED: a supplier moved a part to another supplier';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 7 OK: a part cannot be moved between suppliers';
  END;

  -- 8. Cross-supplier isolation on WRITE. The policy must refuse, and a refused
  --    UPDATE affects zero rows rather than raising.
  UPDATE catalogue.parts SET price = 1.00 WHERE part_number = 'VERIFY-024-P2';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 8 FAILED: supplier 1 edited supplier 2''s part (% rows)', n;
  END IF;
  RAISE NOTICE 'check 8 OK: a supplier cannot edit another supplier''s part';

  -- 9. CONTROL + exclusion on the supplier PROFILE. Editable fields work...
  UPDATE catalogue.suppliers SET city = 'Kumasi', website = 'https://example.test'
   WHERE id = (SELECT v FROM _fx WHERE k='supplier_1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 9 FAILED: a supplier could not edit its own profile (% rows)', n;
  END IF;
  RAISE NOTICE 'check 9 OK: a supplier CAN edit its own profile';

  -- 10. ...and the trust signals do not. "Verified" is the whole reason a
  --     stranger believes a price (021's own note), so a supplier that can set
  --     it can manufacture trust.
  BEGIN
    UPDATE catalogue.suppliers SET is_verified = TRUE
     WHERE id = (SELECT v FROM _fx WHERE k='supplier_1');
    RAISE EXCEPTION 'check 10 FAILED: a supplier VERIFIED itself';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 10 OK: a supplier cannot verify itself';
  END;

  BEGIN
    UPDATE catalogue.suppliers SET slug = 'verify-024-hijack'
     WHERE id = (SELECT v FROM _fx WHERE k='supplier_1');
    RAISE EXCEPTION 'check 10b FAILED: a supplier changed its own public slug';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 10b OK: a supplier cannot change its public slug';
  END;

  -- 11. APPLYING. A signed-in user may create an unpublished supplier row and
  --     become its owner.
  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='applicant')::text, true);
  INSERT INTO catalogue.suppliers (slug, name, country, created_by)
  VALUES ('verify-024-applied', 'Verify Applied Parts', 'GH',
          (SELECT v FROM _fx WHERE k='applicant'))
  RETURNING id INTO v_new_supplier;

  INSERT INTO catalogue.supplier_users (supplier_id, user_id, member_role, status)
  VALUES (v_new_supplier, (SELECT v FROM _fx WHERE k='applicant'), 'owner', 'active');

  SELECT count(*) INTO n FROM catalogue.suppliers WHERE id = v_new_supplier;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 11 FAILED: an applicant cannot see the supplier they just created';
  END IF;
  RAISE NOTICE 'check 11 OK: a signed-in user CAN apply and becomes owner';

  -- 11b. And the application is NOT public.
  SELECT count(*) INTO n FROM catalogue.suppliers WHERE id = v_new_supplier AND is_published;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 11b FAILED: a new application was published';
  END IF;
  RAISE NOTICE 'check 11b OK: an application is invisible until an administrator publishes it';

  -- 11c. An applicant cannot arrive pre-approved.
  BEGIN
    INSERT INTO catalogue.suppliers (slug, name, country, created_by, is_published)
    VALUES ('verify-024-sneak', 'Verify Sneak Parts', 'GH',
            (SELECT v FROM _fx WHERE k='applicant'), TRUE);
    RAISE EXCEPTION 'check 11c FAILED: an applicant created an already-published supplier';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'check 11c OK: an applicant cannot self-publish at creation';
  END;

  -- 12. 🔴 THE CLAIM HOLE. A stranger must NOT be able to make themselves owner
  --     of a supplier somebody else created — or of one an administrator seeded
  --     by hand, which is what `created_by IS NULL` represents. A "first member
  --     wins" bootstrap policy would pass every other check in this file and
  --     hand every unstaffed supplier to whoever asked first.
  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='stranger')::text, true);
  BEGIN
    INSERT INTO catalogue.supplier_users (supplier_id, user_id, member_role, status)
    VALUES ((SELECT v FROM _fx WHERE k='supplier_1'), (SELECT v FROM _fx WHERE k='stranger'),
            'owner', 'active');
    RAISE EXCEPTION 'check 12 FAILED: a stranger claimed ownership of an existing supplier';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 12 OK: a stranger cannot claim an existing supplier';
  END;

  -- 12b. Nor one another user created.
  BEGIN
    INSERT INTO catalogue.supplier_users (supplier_id, user_id, member_role, status)
    VALUES (v_new_supplier, (SELECT v FROM _fx WHERE k='stranger'), 'owner', 'active');
    RAISE EXCEPTION 'check 12b FAILED: a stranger claimed another user''s application';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 12b OK: a stranger cannot claim another user''s application';
  END;

  -- 13. A stranger sees no drafts at all — not the applicant's, not supplier 1's.
  SELECT count(*) INTO n FROM catalogue.parts WHERE part_number = 'VERIFY-024-DRAFT';
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 13 FAILED: a stranger read an unpublished part';
  END IF;
  SELECT count(*) INTO n FROM catalogue.suppliers WHERE id = v_new_supplier;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 13 FAILED: a stranger read an unpublished supplier';
  END IF;
  RAISE NOTICE 'check 13 OK: a stranger reads no drafts';

  -- 14. FITMENTS travel with the part they belong to.
  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='owner_1')::text, true);
  INSERT INTO catalogue.part_fitments (part_id, make, model, year_from, year_to)
  VALUES (v_draft, 'Toyota', 'Corolla', 2012, 2018);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 14 FAILED: a supplier could not add a fitment to its own part';
  END IF;
  RAISE NOTICE 'check 14 OK: a supplier CAN add a fitment to its own part';

  -- 14b. But not to somebody else's.
  --
  -- ⚠️ POSITIVE CONTROL FIRST — Codex rated the original version of this check
  -- LOW precisely because it accepted "zero rows inserted" as a pass, and that
  -- outcome ALSO occurs when the source SELECT matches nothing at all. A typo in
  -- the part number would have passed it. So: prove the competitor's part is
  -- visible to this actor before asserting that writing to it fails.
  SELECT count(*) INTO n FROM catalogue.parts WHERE part_number = 'VERIFY-024-P2';
  IF n <> 1 THEN
    RAISE EXCEPTION
      'check 14b FAILED (control): supplier 1 cannot even SEE supplier 2''s published '
      'part, so the exclusion below would pass without testing anything (% rows)', n;
  END IF;

  BEGIN
    INSERT INTO catalogue.part_fitments (part_id, make, model, year_from)
    SELECT id, 'Toyota', 'Hilux', 2015 FROM catalogue.parts WHERE part_number='VERIFY-024-P2';
    -- Reaching here without an exception is only acceptable if nothing landed.
    SELECT count(*) INTO n FROM catalogue.part_fitments f
      JOIN catalogue.parts p ON p.id = f.part_id
     WHERE p.part_number = 'VERIFY-024-P2' AND f.model = 'Hilux';
    IF n <> 0 THEN
      RAISE EXCEPTION 'check 14b FAILED: a supplier added a fitment to another supplier''s part';
    END IF;
    RAISE NOTICE 'check 14b OK: a supplier cannot add a fitment to another supplier''s part';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 14b OK: a supplier cannot add a fitment to another supplier''s part';
  END;

  -- 15. THE GUARD IS NOT A WALL. An administrator publishes — the action the
  --     whole slice exists to route through them. If this fails, suppliers can
  --     never be approved and the marketplace still cannot grow.
  PERFORM set_config('app.current_role', 'admin', true);
  UPDATE catalogue.parts SET is_published = TRUE WHERE id = v_draft;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 15 FAILED: an ADMINISTRATOR could not publish a part (% rows)', n;
  END IF;
  UPDATE catalogue.suppliers SET is_published = TRUE, is_verified = TRUE WHERE id = v_new_supplier;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 15 FAILED: an ADMINISTRATOR could not publish a supplier (% rows)', n;
  END IF;
  RAISE NOTICE 'check 15 OK: an administrator CAN publish and verify';

  RAISE NOTICE '--- 024 verify: all checks passed ---';
END;
$$;

ROLLBACK;
