-- Proof by effect for migration 028 (directory member read).
--
-- 028 exists because a comment described a rule the database did not implement:
-- `directory.service.ts` said the listing was readable by any member of the
-- organization, and 027's single `FOR ALL` policy restricted it to the owner.
-- The screen therefore told a manager "Not listed" about a listing that existed.
--
-- So the checks are: every member SEES, and only the owner WRITES. Both halves,
-- because 028 must not have widened the write path while fixing the read one.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/028_directory_member_read.sql
--
-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.

BEGIN;

SELECT set_config('app.current_role', 'admin', true);

CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;

INSERT INTO _fx (k, v)
SELECT 'org_1', id FROM identity.organizations ORDER BY id LIMIT 1;
INSERT INTO _fx (k, v)
SELECT 'org_2', id FROM identity.organizations
 WHERE id <> (SELECT v FROM _fx WHERE k = 'org_1') ORDER BY id LIMIT 1;

-- org_1: saved but NOT published — the exact state that was invisible.
INSERT INTO catalogue.mechanic_directory
  (organization_id, trading_name, city, country, is_published)
VALUES ((SELECT v FROM _fx WHERE k='org_1'), 'Verify 028 Garage', 'Accra', 'GH', FALSE)
ON CONFLICT (organization_id) DO UPDATE
  SET trading_name = EXCLUDED.trading_name, is_published = FALSE;

-- org_2: also unpublished, so "sees own" cannot pass by seeing everything.
INSERT INTO catalogue.mechanic_directory
  (organization_id, trading_name, city, country, is_published)
VALUES ((SELECT v FROM _fx WHERE k='org_2'), 'Verify 028 Other', 'Tema', 'GH', FALSE)
ON CONFLICT (organization_id) DO UPDATE
  SET trading_name = EXCLUDED.trading_name, is_published = FALSE;

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  n INTEGER;
BEGIN
  PERFORM set_config('app.current_role', '', true);
  PERFORM set_config('app.organization_ids', (SELECT v FROM _fx WHERE k='org_1')::text, true);

  -- 1. 🔴 THE REGRESSION. Before 028 every one of these returned 0.
  PERFORM set_config('app.current_role', 'workshop_manager', true);
  SELECT count(*) INTO n FROM catalogue.mechanic_directory
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 1 FAILED: a manager cannot see its own unpublished listing (% rows)', n;
  END IF;
  RAISE NOTICE 'check 1 OK: a MANAGER sees its own unpublished listing';

  PERFORM set_config('app.current_role', 'technician', true);
  SELECT count(*) INTO n FROM catalogue.mechanic_directory
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 2 FAILED: a technician cannot see its own unpublished listing (% rows)', n;
  END IF;
  RAISE NOTICE 'check 2 OK: a TECHNICIAN sees its own unpublished listing';

  -- 3. And still not another organization's unpublished listing. The read was
  --    widened by ORGANIZATION, not globally.
  SELECT count(*) INTO n FROM catalogue.mechanic_directory
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_2');
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 3 FAILED: a member read ANOTHER organization''s unpublished listing';
  END IF;
  RAISE NOTICE 'check 3 OK: still cannot read another organization''s draft';

  -- 4. 🔴 THE WRITE PATH IS UNCHANGED. If 028 accidentally granted FOR ALL, a
  --    technician could publish the workshop — a far worse bug than the one it
  --    fixes.
  UPDATE catalogue.mechanic_directory SET is_published = TRUE
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 4 FAILED: 028 widened the WRITE path — a technician published (% rows)', n;
  END IF;
  RAISE NOTICE 'check 4 OK: a technician still cannot publish';

  -- 5. CONTROL. The owner still can, so check 4 is about the ROLE and not about
  --    an unreachable row.
  PERFORM set_config('app.current_role', 'workshop_owner', true);
  UPDATE catalogue.mechanic_directory SET is_published = TRUE
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 5 FAILED: the owner could not publish either — check 4 was vacuous';
  END IF;
  RAISE NOTICE 'check 5 OK: the owner CAN still publish';

  -- 6. Anonymous readers are unaffected: published only.
  PERFORM set_config('app.current_role', '', true);
  PERFORM set_config('app.organization_ids', '', true);
  SELECT count(*) INTO n FROM catalogue.mechanic_directory WHERE NOT is_published;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 6 FAILED: an anonymous reader sees % unpublished listings', n;
  END IF;
  RAISE NOTICE 'check 6 OK: anonymous readers still see only published listings';

  RAISE NOTICE '--- 028 verify: all checks passed ---';
END;
$$;

ROLLBACK;
