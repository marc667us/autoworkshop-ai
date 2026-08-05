-- verify/039 — the membership lookup can read the rows it exists to find,
--               and cannot read anybody else's.
--
-- ⚠️ THE MEASUREMENT FIX IS THE WHOLE POINT OF THIS FILE.
--
-- Locally `autoworkshop` is a SUPERUSER and bypasses RLS entirely, so
-- `memberships_for_subject` finds the memberships whatever the policies say and
-- every assertion below passes against a database where the defect is fully
-- present. That is exactly how `verify/036` came to pass 9/9 while production
-- returned a 500, and it is how this defect survived 037 and 038 — both of
-- which were verified, both of which shipped, and neither of which touched the
-- read path.
--
-- So this file re-owns the function to a NON-superuser inside the transaction,
-- and REFUSES TO RUN if the owner is still a superuser. A green run on a
-- superuser-owned function is not evidence of anything.
--
-- Seeds nothing permanent, asserts under production privileges, ROLLS BACK.

BEGIN;

-- Subjects unique to THIS run. A fixed literal would make the second run judge
-- rows the first left behind — two runs in this repo have already consumed
-- their own fixture.
CREATE TEMP TABLE _fx39 (k TEXT PRIMARY KEY, v TEXT) ON COMMIT DROP;
GRANT SELECT ON _fx39 TO autoworkshop_app;
INSERT INTO _fx39 VALUES
  ('subject',  'verify039-'  || replace(gen_random_uuid()::text, '-', '')),
  ('subject2', 'verify039b-' || replace(gen_random_uuid()::text, '-', ''));

-- ── THE MEASUREMENT FIX, IN TWO PARTS ───────────────────────────────────────
--
-- 1. The definer elevation must land on a NON-SUPERUSER, as it does on Render.
--
-- 2. 🔴 AND THE OWNER MUST NOT BE THE CALLER. The first draft of this file
--    re-owned the functions to `autoworkshop_app` — the role it then called
--    as — so `current_user = owner` was trivially true and the owner check in
--    `in_membership_lookup()` could not discriminate. Check 6 failed with
--    "the app role set the flag itself and read 1 membership row", which looked
--    like a hole in 039 and was really a hole in the test. In production the
--    owner is `autoworkshop` and the caller is `autoworkshop_app`; a verify in
--    which they coincide is measuring a situation that does not exist.
--
--    verify/038 hit this exact wall and solved it the same way. CREATE ROLE is
--    transactional, so the ROLLBACK at the end removes it.
CREATE ROLE verify039_owner NOSUPERUSER NOLOGIN;
GRANT USAGE ON SCHEMA identity TO verify039_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO verify039_owner;
-- The policies call `identity.is_platform_admin()` and friends, which are
-- REVOKEd from PUBLIC — without EXECUTE the owner fails on the helper rather
-- than on the policy, and the run reports a permission error that reads like the
-- fix breaking registration. This role stands in for `autoworkshop`, which owns
-- them all and needs no grant.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA identity TO verify039_owner;

ALTER FUNCTION identity.memberships_for_subject(TEXT)                 OWNER TO verify039_owner;
ALTER FUNCTION identity.register_workshop(TEXT, TEXT, TEXT)           OWNER TO verify039_owner;
ALTER FUNCTION identity.provision_user_from_subject(TEXT, TEXT, TEXT) OWNER TO verify039_owner;

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  s        TEXT := (SELECT v FROM _fx39 WHERE k = 'subject');
  s2       TEXT := (SELECT v FROM _fx39 WHERE k = 'subject2');
  uid      uuid;
  uid2     uuid;
  reg      RECORD;
  n        INT;
  row1     RECORD;
  owner_su BOOLEAN;
  leaked   INT;
BEGIN
  -- ── 0. IS THIS MEASUREMENT EVEN VALID? ────────────────────────────────────
  IF current_user <> 'autoworkshop_app' THEN
    RAISE EXCEPTION 'MEASUREMENT INVALID: caller is %, not autoworkshop_app', current_user;
  END IF;

  SELECT r.rolsuper INTO owner_su
    FROM pg_proc p
    JOIN pg_roles r ON r.oid = p.proowner
   WHERE p.oid = 'identity.memberships_for_subject(text)'::regprocedure;

  IF owner_su IS NOT FALSE THEN
    RAISE EXCEPTION
      'MEASUREMENT INVALID: memberships_for_subject still executes as a SUPERUSER, '
      'so RLS is bypassed and NOTHING below is being tested. This is the blind spot '
      'that let 037 and 038 both ship green while the READ path stayed broken.';
  END IF;
  -- ⚠️ AND THEY MUST DIFFER. Without this the run passes checks 0-5 and fails 6
  -- for a reason that has nothing to do with the product.
  IF (SELECT r.rolname
        FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
       WHERE p.oid = 'identity.memberships_for_subject(text)'::regprocedure) = current_user THEN
    RAISE EXCEPTION
      'MEASUREMENT INVALID: the function owner and the caller are the same role, '
      'so the owner check cannot discriminate and check 6 tests nothing.';
  END IF;
  RAISE NOTICE 'PASS 0  the lookup executes as a NON-superuser that is not the caller';

  -- ── 1. a brand-new person resolves, with no membership ────────────────────
  -- The honest "no workshop yet" case, which must keep working: it is what the
  -- onboarding screen is for.
  uid := identity.provision_user_from_subject(s, 'verify039@example.com', 'Verify Threenine');
  IF uid IS NULL THEN RAISE EXCEPTION 'FAIL 1: sign-up returned no user id'; END IF;

  SELECT count(*) INTO n FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 1b: a new user already has % membership(s)', n;
  END IF;
  RAISE NOTICE 'PASS 1  a new user resolves with no membership';

  -- ── 2. THE DEFECT ITSELF ──────────────────────────────────────────────────
  -- Register a workshop, then look the same subject up again. Before 039 this
  -- returned ONE row with tenant_id NULL — the user survived the LEFT JOIN, the
  -- membership was filtered out by RLS, and the application read that as "this
  -- person has no workshop".
  SELECT * INTO reg FROM identity.register_workshop(s, 'Verify039 Workshop', 'Verify039 Branch');
  IF reg.membership_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 2: registration did not return a membership id';
  END IF;

  SELECT count(*) INTO n FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION
      'FAIL 2b: the lookup returned % membership rows, expected 1. This is THE '
      'defect: RLS filtered the membership and the LEFT JOIN turned "refused" '
      'into "has none".', n;
  END IF;
  RAISE NOTICE 'PASS 2  after registering, the lookup FINDS the membership';

  -- ── 3. it resolves to the right role, not merely to a row ─────────────────
  SELECT * INTO row1 FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
  IF row1.role_name <> 'workshop_owner' THEN
    RAISE EXCEPTION 'FAIL 3: resolved role is %, expected workshop_owner',
      COALESCE(row1.role_name, '(none)');
  END IF;
  IF row1.tenant_id <> reg.tenant_id THEN
    RAISE EXCEPTION 'FAIL 3b: resolved a DIFFERENT tenant than registration created';
  END IF;
  RAISE NOTICE 'PASS 3  it resolves the right tenant and the right role';

  -- ── 4. display_name comes back, so the caller needs no join ───────────────
  -- The repository used to JOIN identity.users afterwards for this. Returning
  -- it means the caller no longer reaches into an identity table at all.
  IF row1.display_name IS DISTINCT FROM 'Verify Threenine' THEN
    RAISE EXCEPTION 'FAIL 4: display_name came back as %, expected Verify Threenine',
      COALESCE(row1.display_name, '(null)');
  END IF;
  RAISE NOTICE 'PASS 4  display_name is returned by the function itself';

  -- ── 5. THE DOOR IS SHUT AGAIN ─────────────────────────────────────────────
  -- 037's own header claimed a door was closed when it was not, and 038 existed
  -- solely to close it. So this is asserted, not assumed.
  IF COALESCE(current_setting('app.membership_lookup', true), '') <> '' THEN
    RAISE EXCEPTION 'FAIL 5: app.membership_lookup is STILL SET after the function returned';
  END IF;
  RAISE NOTICE 'PASS 5  the lookup flag is cleared before the function returns';

  -- ── 6. THE APP ROLE CANNOT OPEN THE DOOR ITSELF ───────────────────────────
  -- `set_config` is not privileged, so the flag alone is forgeable — that was
  -- 038's finding on the write side, and it applies identically here. The owner
  -- check is what makes it safe. Prove it by DOING the forbidden thing.
  PERFORM set_config('app.membership_lookup', s, true);
  SELECT count(*) INTO leaked FROM identity.memberships WHERE user_id = uid;
  PERFORM set_config('app.membership_lookup', '', true);
  IF leaked <> 0 THEN
    RAISE EXCEPTION
      'FAIL 6: the app role set the flag itself and read % membership row(s) '
      'directly. The owner check is not holding.', leaked;
  END IF;
  RAISE NOTICE 'PASS 6  setting the flag from the app role opens nothing';

  -- ── 7. IT CANNOT REACH ANOTHER PERSON'S MEMBERSHIPS ───────────────────────
  -- The policy pins user_id to the subject being resolved. A second person's
  -- rows must stay invisible even while the door is open for the first.
  uid2 := identity.provision_user_from_subject(s2, 'verify039b@example.com', 'Verify Threenine B');
  PERFORM identity.register_workshop(s2, 'Verify039 Other Workshop', 'Other Branch');

  SELECT count(*) INTO n
    FROM identity.memberships_for_subject(s)
   WHERE tenant_id IS NOT NULL AND user_id = uid2;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 7: looking up one subject returned ANOTHER user''s membership';
  END IF;

  SELECT count(*) INTO n FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 7b: the lookup returned % rows for one subject, expected 1', n;
  END IF;
  RAISE NOTICE 'PASS 7  one subject in, only that subject''s membership out';

  -- ── 8. AND THE SECOND PERSON STILL RESOLVES ───────────────────────────────
  -- A policy that returns nothing for everybody would pass check 7 while
  -- breaking the product. Check 7 alone cannot tell those apart.
  SELECT count(*) INTO n FROM identity.memberships_for_subject(s2) WHERE tenant_id IS NOT NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL 8: the SECOND user resolves % memberships, expected 1', n;
  END IF;
  RAISE NOTICE 'PASS 8  the other user resolves their own membership too';

  -- ── 9. TENANT ISOLATION IS UNTOUCHED ──────────────────────────────────────
  -- 039 adds a policy to a table carrying the product's Severity-1 control. An
  -- ordinary read with no context must still see nothing.
  SELECT count(*) INTO leaked FROM identity.memberships;
  IF leaked <> 0 THEN
    RAISE EXCEPTION
      'FAIL 9: a plain SELECT with no tenant context returned % membership row(s). '
      '039 has widened tenant isolation, which it must not.', leaked;
  END IF;
  RAISE NOTICE 'PASS 9  tenant isolation still denies a context-free read';

  RAISE NOTICE 'verify/039: 10/10';
END $$;

ROLLBACK;
