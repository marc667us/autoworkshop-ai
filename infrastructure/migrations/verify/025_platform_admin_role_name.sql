-- Proof by effect for migration 025 (the platform-admin role name).
--
-- 025 claims that an administrator signed into the APPLICATION can now write the
-- catalogue. The bug it fixes was invisible precisely because the failure mode
-- was `UPDATE 0` — not an error, not a refusal, just nothing happening. So
-- every check below counts AFFECTED ROWS rather than trusting that a statement
-- did not raise.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/025_platform_admin_role_name.sql
--
-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.

BEGIN;

SELECT set_config('app.current_role', 'admin', true);

CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;

-- `stranger` holds NO supplier membership, which is what makes checks 6 and 7
-- able to say anything about ROLE names at all.
INSERT INTO _fx (k, v) VALUES
  ('supplier_member', gen_random_uuid()),
  ('stranger',        gen_random_uuid());

INSERT INTO identity.users (id, keycloak_subject, email, display_name, preferred_locale, status)
SELECT v, 'verify-025-' || k, k || '@verify.invalid', 'Verify ' || k, 'en', 'active' FROM _fx;

INSERT INTO catalogue.suppliers (id, slug, name, country, is_published)
VALUES (gen_random_uuid(), 'verify-025-supplier', 'Verify 025 Parts', 'GH', TRUE);
INSERT INTO _fx (k, v) SELECT 'supplier', id FROM catalogue.suppliers WHERE slug='verify-025-supplier';

INSERT INTO catalogue.supplier_users (supplier_id, user_id, member_role, status)
VALUES ((SELECT v FROM _fx WHERE k='supplier'), (SELECT v FROM _fx WHERE k='supplier_member'), 'owner', 'active');

INSERT INTO _fx (k, v) SELECT 'category', id FROM catalogue.part_categories ORDER BY display_order LIMIT 1;

INSERT INTO catalogue.parts (supplier_id, category_id, part_number, name, price, currency, is_published)
VALUES ((SELECT v FROM _fx WHERE k='supplier'), (SELECT v FROM _fx WHERE k='category'),
        'VERIFY-025-DRAFT', 'Verify 025 Draft', 75.00, 'GHS', FALSE);

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  n INTEGER;
BEGIN
  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='supplier_member')::text, true);

  -- 1. 🔴 THE REGRESSION ITSELF. `platform_administrator` is the role name the
  --    application actually sets, from `identity.memberships.role_name`. Before
  --    025 this UPDATE affected ZERO rows and raised nothing at all.
  PERFORM set_config('app.current_role', 'platform_administrator', true);
  UPDATE catalogue.parts SET is_published = TRUE WHERE part_number = 'VERIFY-025-DRAFT';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION
      'check 1 FAILED: a platform_administrator published % rows, expected 1 — '
      'the admin policies are still unreachable from the application', n;
  END IF;
  RAISE NOTICE 'check 1 OK: platform_administrator CAN publish a part (this is the fix)';

  -- 2. And unpublish. Withdrawal is the half that matters when something is
  --    wrong on a public page.
  UPDATE catalogue.parts SET is_published = FALSE WHERE part_number = 'VERIFY-025-DRAFT';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 2 FAILED: a platform_administrator unpublished % rows, expected 1', n;
  END IF;
  RAISE NOTICE 'check 2 OK: platform_administrator CAN unpublish';

  -- 3. And publish/verify a SUPPLIER, which is what approves an application.
  UPDATE catalogue.suppliers SET is_verified = TRUE
   WHERE id = (SELECT v FROM _fx WHERE k='supplier');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 3 FAILED: a platform_administrator verified % suppliers, expected 1', n;
  END IF;
  RAISE NOTICE 'check 3 OK: platform_administrator CAN approve a supplier';

  -- 4. The seed/psql name STILL works. Dropping it would break
  --    `seed-dev-catalogue.sh` and every verify script in this directory —
  --    breakage that is loud, but pointless.
  PERFORM set_config('app.current_role', 'admin', true);
  UPDATE catalogue.parts SET description = 'touched by admin' WHERE part_number = 'VERIFY-025-DRAFT';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 4 FAILED: the literal admin role lost its write access (% rows)', n;
  END IF;
  RAISE NOTICE 'check 4 OK: the seed/psql `admin` name still works';

  -- 5. 🔴 THE FIX DID NOT WIDEN THE DOOR. A supplier member is still refused —
  --    if this passes, 025 has turned every signed-in supplier into an
  --    administrator, which is far worse than the bug it fixes.
  PERFORM set_config('app.current_role', 'supplier_owner', true);
  BEGIN
    UPDATE catalogue.parts SET is_published = TRUE WHERE part_number = 'VERIFY-025-DRAFT';
    RAISE EXCEPTION 'check 5 FAILED: a supplier published a part after 025';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 5 OK: a supplier is still refused';
  END;

  -- ⚠️ SWITCH TO A NON-MEMBER FOR THE REMAINING CHECKS, and this correction is
  -- worth recording. Written first with `app.user_id` still set to the supplier
  -- MEMBER, check 6 failed at `1 rows` — and the migration was right, the test
  -- was wrong. 024's `supplier_manage_own` policy is keyed on MEMBERSHIP, not
  -- on role, so a supplier member renaming their own part is allowed however
  -- `app.current_role` is set. The check proved nothing about role names
  -- because membership had already granted the write.
  --
  -- To ask "is this ROLE an administrator?" the actor must hold no other route
  -- to the row.
  PERFORM set_config('app.user_id', (SELECT v FROM _fx WHERE k='stranger')::text, true);

  -- 6. An ordinary workshop role is not an administrator. `admin` and
  --    `platform_administrator` are the ONLY accepted names, so a role that
  --    merely sounds senior must write nothing.
  PERFORM set_config('app.current_role', 'workshop_owner', true);
  UPDATE catalogue.parts SET name = 'renamed by a workshop owner'
   WHERE part_number = 'VERIFY-025-DRAFT';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 6 FAILED: workshop_owner wrote the public catalogue (% rows)', n;
  END IF;
  RAISE NOTICE 'check 6 OK: a workshop_owner is not a platform administrator';

  -- 6b. CONTROL for check 6. A zero row count also happens when the row cannot
  --     be FOUND, so prove the same statement as an administrator reaches it —
  --     otherwise check 6 would pass against a typo in the part number.
  PERFORM set_config('app.current_role', 'platform_administrator', true);
  UPDATE catalogue.parts SET name = 'renamed by an administrator'
   WHERE part_number = 'VERIFY-025-DRAFT';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION
      'check 6b FAILED: the administrator could not reach the row either (% rows) — '
      'check 6 passed vacuously', n;
  END IF;
  RAISE NOTICE 'check 6b OK: the same statement DOES reach the row as an administrator';

  -- 7. And an unset role writes nothing. Fail closed.
  PERFORM set_config('app.current_role', '', true);
  UPDATE catalogue.parts SET name = 'renamed by nobody' WHERE part_number = 'VERIFY-025-DRAFT';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 7 FAILED: an unset role wrote the catalogue (% rows)', n;
  END IF;
  RAISE NOTICE 'check 7 OK: an unset role writes nothing';

  RAISE NOTICE '--- 025 verify: all checks passed ---';
END;
$$;

ROLLBACK;
