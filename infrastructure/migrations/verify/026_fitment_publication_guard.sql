-- Proof by effect for migration 026 (the fitment publication guard).
--
-- The bypass this closes was REPRODUCED before the migration was written: a
-- supplier inserted a fitment on its own published part and an anonymous
-- visitor could read it immediately. Check 2 below is that exact sequence,
-- now expected to be refused.
--
-- Every refusal is paired with the allowed action it must not block. The
-- failure this file most needs to catch is not "the guard is missing" — it is
-- "the guard refuses everything", which would leave suppliers unable to
-- describe what their parts fit and would present as a broken screen rather
-- than as a rule.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/026_fitment_publication_guard.sql
--
-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.

BEGIN;

SELECT set_config('app.current_role', 'admin', true);

CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;

INSERT INTO _fx (k, v) VALUES ('member', gen_random_uuid());

INSERT INTO identity.users (id, keycloak_subject, email, display_name, preferred_locale, status)
SELECT v, 'verify-026-' || k, k || '@verify.invalid', 'Verify ' || k, 'en', 'active' FROM _fx;

INSERT INTO catalogue.suppliers (slug, name, country, is_published)
VALUES ('verify-026-supplier', 'Verify 026 Parts', 'GH', TRUE);
INSERT INTO _fx (k, v) SELECT 'supplier', id FROM catalogue.suppliers WHERE slug='verify-026-supplier';

INSERT INTO catalogue.supplier_users (supplier_id, user_id, member_role, status)
VALUES ((SELECT v FROM _fx WHERE k='supplier'), (SELECT v FROM _fx WHERE k='member'), 'owner', 'active');

INSERT INTO _fx (k, v) SELECT 'category', id FROM catalogue.part_categories ORDER BY display_order LIMIT 1;

-- ONE PUBLISHED part and ONE DRAFT, both this supplier's. The pair is the whole
-- test: the same actor performing the same action must be allowed on one and
-- refused on the other, which is what proves the guard keys on PUBLICATION and
-- not on membership.
INSERT INTO catalogue.parts (supplier_id, category_id, part_number, name, price, currency, is_published)
VALUES
  ((SELECT v FROM _fx WHERE k='supplier'), (SELECT v FROM _fx WHERE k='category'),
   'VERIFY-026-LIVE', 'Verify 026 Published Disc', 100.00, 'GHS', TRUE),
  ((SELECT v FROM _fx WHERE k='supplier'), (SELECT v FROM _fx WHERE k='category'),
   'VERIFY-026-DRAFT', 'Verify 026 Draft Disc', 100.00, 'GHS', FALSE);

INSERT INTO _fx (k, v) SELECT 'live',  id FROM catalogue.parts WHERE part_number='VERIFY-026-LIVE';
INSERT INTO _fx (k, v) SELECT 'draft', id FROM catalogue.parts WHERE part_number='VERIFY-026-DRAFT';

-- A pre-existing fitment on the LIVE part, so UPDATE and DELETE have a target.
INSERT INTO catalogue.part_fitments (part_id, make, model, year_from, year_to)
VALUES ((SELECT v FROM _fx WHERE k='live'), 'Toyota', 'Camry', 2010, 2015);

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  n INTEGER;
BEGIN
  -- 0. Not running as an administrator, or every refusal below is vacuous.
  PERFORM set_config('app.current_role', '', true);
  IF identity.is_platform_admin() THEN
    RAISE EXCEPTION 'check 0 FAILED: assertions are running as admin';
  END IF;
  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='member')::text, true);
  RAISE NOTICE 'check 0 OK: assertions run as a non-admin supplier member';

  -- 1. CONTROL. Fitments on a DRAFT part still work. This is the everyday case
  --    and the one a too-broad guard would destroy.
  INSERT INTO catalogue.part_fitments (part_id, make, model, year_from, year_to)
  VALUES ((SELECT v FROM _fx WHERE k='draft'), 'Toyota', 'Corolla', 2012, 2018);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 1 FAILED: a supplier cannot add a fitment to its own DRAFT part (% rows)', n;
  END IF;
  RAISE NOTICE 'check 1 OK: a supplier CAN still manage fitments on a draft part';

  -- 2. 🔴 THE BYPASS. Reproduced before 026 existed: this INSERT succeeded and
  --    the row was immediately public.
  BEGIN
    INSERT INTO catalogue.part_fitments (part_id, make, model, year_from, year_to)
    VALUES ((SELECT v FROM _fx WHERE k='live'), 'Toyota', 'Corolla', 2012, 2018);
    RAISE EXCEPTION 'check 2 FAILED: a supplier published a new fitment on a LIVE part';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 2 OK: a supplier cannot add a fitment to a published part';
  END;

  -- 3. UPDATE is the same escape by another door — editing an existing public
  --    claim changes what the buyer reads just as much as adding one.
  BEGIN
    UPDATE catalogue.part_fitments SET year_to = 2099
     WHERE part_id = (SELECT v FROM _fx WHERE k='live');
    RAISE EXCEPTION 'check 3 FAILED: a supplier edited a fitment on a LIVE part';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 3 OK: a supplier cannot edit a fitment on a published part';
  END;

  -- 4. And DELETE. Removing a compatibility claim from a live listing is a
  --    public change too — it is how a part silently stops matching searches.
  BEGIN
    DELETE FROM catalogue.part_fitments WHERE part_id = (SELECT v FROM _fx WHERE k='live');
    RAISE EXCEPTION 'check 4 FAILED: a supplier deleted a fitment from a LIVE part';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 4 OK: a supplier cannot delete a fitment from a published part';
  END;

  -- 5. MOVING a fitment from the draft part onto the live one. The guard judges
  --    BOTH the old and the new parent for exactly this: a check that looked
  --    only at OLD would wave this through, and it is the same publication with
  --    an extra step.
  BEGIN
    UPDATE catalogue.part_fitments SET part_id = (SELECT v FROM _fx WHERE k='live')
     WHERE part_id = (SELECT v FROM _fx WHERE k='draft');
    RAISE EXCEPTION 'check 5 FAILED: a supplier MOVED a fitment onto a published part';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 5 OK: a fitment cannot be moved onto a published part';
  END;

  -- 6. THE ALTERNATIVE THE REFUSAL NAMES IS REACHABLE. The error tells the
  --    supplier to have the part withdrawn, edited and republished. If any step
  --    of that were impossible the rule would be a wall, which in this
  --    repository has been the most expensive defect class of all. Walk it.
  PERFORM set_config('app.current_role', 'platform_administrator', true);
  UPDATE catalogue.parts SET is_published = FALSE WHERE id = (SELECT v FROM _fx WHERE k='live');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 6 FAILED: an administrator could not withdraw the part (% rows)', n;
  END IF;

  PERFORM set_config('app.current_role', '', true);
  INSERT INTO catalogue.part_fitments (part_id, make, model, year_from, year_to)
  VALUES ((SELECT v FROM _fx WHERE k='live'), 'Toyota', 'Corolla', 2012, 2018);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 6 FAILED: the supplier still could not edit after withdrawal (% rows)', n;
  END IF;

  PERFORM set_config('app.current_role', 'platform_administrator', true);
  UPDATE catalogue.parts SET is_published = TRUE WHERE id = (SELECT v FROM _fx WHERE k='live');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 6 FAILED: an administrator could not republish (% rows)', n;
  END IF;
  RAISE NOTICE 'check 6 OK: withdraw -> supplier edits -> republish is genuinely walkable';

  -- 7. An administrator may correct a live fitment directly, without the
  --    withdraw dance. Support needs one route that does not require taking a
  --    listing off the internet.
  PERFORM set_config('app.current_role', 'platform_administrator', true);
  UPDATE catalogue.part_fitments SET year_to = 2020
   WHERE part_id = (SELECT v FROM _fx WHERE k='live') AND model = 'Camry';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 7 FAILED: an administrator could not correct a live fitment (% rows)', n;
  END IF;
  RAISE NOTICE 'check 7 OK: an administrator CAN correct a live fitment directly';

  RAISE NOTICE '--- 026 verify: all checks passed ---';
END;
$$;

ROLLBACK;
