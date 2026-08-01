-- Proof by effect for migration 027 (mechanic directory opt-in).
--
-- 027 hands a workshop owner control of a PUBLIC row. The claims worth proving
-- are therefore about the edges: an owner reaches their own listing and nobody
-- else's, a non-owner in the same organization cannot publish the workshop, and
-- the row cannot be moved to another organization.
--
-- Every refusal is paired with the allowed action it must not block. "The
-- workshop cannot publish itself" is a worse outcome than most of the
-- exclusions here, and it is the one that would look like a broken screen.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/027_mechanic_directory_optin.sql
--
-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.

BEGIN;

SELECT set_config('app.current_role', 'admin', true);

CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;

-- TWO organizations. One alone cannot show that the predicate keys on
-- organization rather than simply returning everything.
INSERT INTO _fx (k, v)
SELECT 'org_1', id FROM identity.organizations ORDER BY id LIMIT 1;
INSERT INTO _fx (k, v)
SELECT 'org_2', id FROM identity.organizations
 WHERE id <> (SELECT v FROM _fx WHERE k = 'org_1') ORDER BY id LIMIT 1;

-- org_2 already has a PUBLISHED listing, so the cross-organization checks have
-- a real row to fail against rather than an absence.
INSERT INTO catalogue.mechanic_directory
  (organization_id, trading_name, city, country, public_phone, is_published)
VALUES
  ((SELECT v FROM _fx WHERE k='org_2'), 'Verify 027 Other Garage', 'Tema', 'GH', '+233000000002', TRUE)
ON CONFLICT (organization_id) DO UPDATE
  SET trading_name = EXCLUDED.trading_name, is_published = TRUE;

-- org_1 has none — the normal starting point for a workshop that has never
-- opted in, and the state the screen must be able to leave.
DELETE FROM catalogue.mechanic_directory WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  n INTEGER;
BEGIN
  -- 0. Not an administrator, or every refusal below is vacuous.
  PERFORM set_config('app.current_role', 'workshop_owner', true);
  PERFORM set_config('app.organization_ids', (SELECT v FROM _fx WHERE k='org_1')::text, true);
  IF identity.is_platform_admin() THEN
    RAISE EXCEPTION 'check 0 FAILED: assertions are running as admin';
  END IF;
  IF identity.current_organization_id() <> (SELECT v FROM _fx WHERE k='org_1') THEN
    RAISE EXCEPTION 'check 0 FAILED: current_organization_id() does not read app.organization_ids';
  END IF;
  RAISE NOTICE 'check 0 OK: acting as a workshop_owner in org_1';

  -- 1. CONTROL. The owner can CREATE the listing. Everything below is an
  --    exclusion and none of it means anything if opting in does not work.
  INSERT INTO catalogue.mechanic_directory
    (organization_id, trading_name, city, country, public_phone, services, is_published)
  VALUES ((SELECT v FROM _fx WHERE k='org_1'), 'Verify 027 Garage', 'Accra', 'GH',
          '+233000000001', ARRAY['Diagnostics','Brakes'], FALSE);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 1 FAILED: an owner could not create its own listing (% rows)', n;
  END IF;
  RAISE NOTICE 'check 1 OK: an owner CAN create its own directory listing';

  -- 2. CONTROL. And read it back while it is still unpublished — an opt-in
  --    screen that cannot show the draft it just saved is unusable.
  SELECT count(*) INTO n FROM catalogue.mechanic_directory
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1') AND NOT is_published;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 2 FAILED: an owner cannot read its own UNPUBLISHED listing';
  END IF;
  RAISE NOTICE 'check 2 OK: an owner sees its own unpublished listing';

  -- 3. CONTROL. And publish it. This is the entire point of the slice.
  UPDATE catalogue.mechanic_directory SET is_published = TRUE
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 3 FAILED: an owner could not PUBLISH its own listing (% rows)', n;
  END IF;
  RAISE NOTICE 'check 3 OK: an owner CAN publish its own listing';

  -- 4. CONTROL. And withdraw it again. Opt-in without opt-out is not consent.
  UPDATE catalogue.mechanic_directory SET is_published = FALSE
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 4 FAILED: an owner could not withdraw its listing (% rows)', n;
  END IF;
  RAISE NOTICE 'check 4 OK: an owner CAN withdraw — opt-in is reversible';

  -- 5. Cross-organization WRITE. org_2's listing must be untouchable.
  UPDATE catalogue.mechanic_directory SET public_phone = '+233999999999'
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_2');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 5 FAILED: org_1 rewrote org_2''s public phone number (% rows)', n;
  END IF;
  RAISE NOTICE 'check 5 OK: an owner cannot edit another workshop''s listing';

  -- 6. Cross-organization WITHDRAWAL — taking a competitor off the directory is
  --    the most attractive version of this attack.
  UPDATE catalogue.mechanic_directory SET is_published = FALSE
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_2');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 6 FAILED: org_1 withdrew org_2''s listing (% rows)', n;
  END IF;
  RAISE NOTICE 'check 6 OK: an owner cannot withdraw a competitor';

  -- 7. 🔴 MOVING THE LISTING. `USING` tests the row as it WAS, so without a
  --    matching `WITH CHECK` an owner could re-point their own row at another
  --    organization and take over its public identity.
  BEGIN
    UPDATE catalogue.mechanic_directory
       SET organization_id = (SELECT v FROM _fx WHERE k='org_2')
     WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
    -- A unique-violation on `uq_directory_org` is also a refusal, but it would
    -- be the WRONG refusal — it would pass only because org_2 happens to have a
    -- listing already. The policy must be what stops it.
    RAISE EXCEPTION 'check 7 FAILED: an owner MOVED its listing to another organization';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'check 7 OK: WITH CHECK refuses moving a listing between organizations';
    WHEN unique_violation THEN
      RAISE EXCEPTION
        'check 7 INCONCLUSIVE: blocked by uq_directory_org, not by the policy — '
        'the same statement would succeed against an organization with no listing';
  END;

  -- 8. ROLE. A technician in the SAME organization may not speak for the
  --    workshop in public. Role and organization are separate conditions and
  --    this is the one a policy keyed only on organization would miss.
  PERFORM set_config('app.current_role', 'technician', true);
  UPDATE catalogue.mechanic_directory SET is_published = TRUE
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 8 FAILED: a technician published the workshop (% rows)', n;
  END IF;
  RAISE NOTICE 'check 8 OK: a technician cannot publish the workshop';

  -- 8a. A MANAGER is not an owner either, and this is the likelier accidental
  --     allow of the two: "daily operational control" (§50) sounds like it
  --     ought to cover the workshop's own profile. Testing only `technician`
  --     would let a later widening to manager pass unnoticed — Codex, LOW.
  PERFORM set_config('app.current_role', 'workshop_manager', true);
  UPDATE catalogue.mechanic_directory SET is_published = TRUE
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 8a FAILED: a workshop_manager published the workshop (% rows)', n;
  END IF;
  RAISE NOTICE 'check 8a OK: a workshop_manager cannot publish the workshop';

  -- 8b. CONTROL for check 8. A zero row count also happens when the row cannot
  --     be found, so prove the owner still reaches the same row.
  PERFORM set_config('app.current_role', 'workshop_owner', true);
  UPDATE catalogue.mechanic_directory SET is_published = TRUE
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 8b FAILED: the owner could not reach the row either — check 8 was vacuous';
  END IF;
  RAISE NOTICE 'check 8b OK: the same statement DOES work for the owner';

  -- 9. The public still reads only published rows. 027 adds a write path; it
  --    must not have widened the read one.
  --
  -- ⚠️ THERE MUST BE AN UNPUBLISHED ROW TO FAIL AGAINST. Check 8b republished
  -- org_1, so without this withdrawal the anonymous count below would be zero
  -- because nothing was unpublished — passing while testing nothing. Codex
  -- rated it LOW; it is the vacuous-pass class this file exists to avoid.
  PERFORM set_config('app.current_role', 'workshop_owner', true);
  UPDATE catalogue.mechanic_directory SET is_published = FALSE
   WHERE organization_id = (SELECT v FROM _fx WHERE k='org_1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 9 SETUP FAILED: no unpublished row to test against (% rows)', n;
  END IF;

  PERFORM set_config('app.current_role', '', true);
  PERFORM set_config('app.organization_ids', '', true);
  PERFORM set_config('app.user_id', '', true);
  SELECT count(*) INTO n FROM catalogue.mechanic_directory WHERE NOT is_published;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 9 FAILED: an anonymous reader sees % unpublished listings', n;
  END IF;
  RAISE NOTICE 'check 9 OK: anonymous readers still see only published listings';

  RAISE NOTICE '--- 027 verify: all checks passed ---';
END;
$$;

ROLLBACK;
