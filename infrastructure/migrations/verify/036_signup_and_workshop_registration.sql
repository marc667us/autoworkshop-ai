-- Proof by effect for migration 036 (sign up via Keycloak, register a workshop).
--
-- ⚠️ EVERY ASSERTION BELOW RUNS AS `autoworkshop_app`, NEVER AS THE OWNER, and
-- that is not a formality here. Both functions are SECURITY DEFINER precisely
-- because the tables they touch are under FORCE RLS with no tenant context; the
-- superuser is exempt from RLS entirely, so a check run as the owner would pass
-- for a function the application could never call. That exact mistake produced
-- a live outage in this repo once already (see `membership.repository.ts`).
--
-- 🔴 IT ALSO CAUGHT A LIAR WHILE BEING WRITTEN. The first pass asserted the new
-- rows with a plain SELECT on `identity.organizations` as the app role — which
-- correctly returned ZERO under RLS with no tenant context, while the
-- registration had in fact worked perfectly. An empty result was read as a
-- failure of the thing being tested rather than of the way it was measured.
-- Anything below that must observe a tenant-owned table therefore does it
-- through `memberships_for_subject`, which is the boundary crossing the
-- application itself uses.
--
-- Each guard is proved by INJECTING the failure, not by asserting the happy
-- path and hoping: a second registration, an unknown subject, and a suspended
-- user each ATTEMPT the forbidden thing and must be refused.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/036_signup_and_workshop_registration.sql
--
-- Seeds nothing (these functions create their own world), asserts as
-- `autoworkshop_app`, ROLLS BACK.

BEGIN;

-- A subject unique to THIS run. A fixed literal would make the second run of
-- this file judge the rows the first run left behind — and worse, the
-- "already belongs to an organisation" guard would fire on the happy path and
-- the file would fail for the wrong reason. This repo has had two runs consume
-- their own fixture already.
CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v TEXT) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;
INSERT INTO _fx VALUES
  ('subject', 'verify036-' || replace(gen_random_uuid()::text, '-', '')),
  ('subject2', 'verify036b-' || replace(gen_random_uuid()::text, '-', ''));

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  s     TEXT := (SELECT v FROM _fx WHERE k = 'subject');
  s2    TEXT := (SELECT v FROM _fx WHERE k = 'subject2');
  uid   uuid;
  uid2  uuid;
  reg   RECORD;
  n     INT;
  role  TEXT;
BEGIN
  IF current_user <> 'autoworkshop_app' THEN
    RAISE EXCEPTION 'MEASUREMENT INVALID: running as %, not autoworkshop_app', current_user;
  END IF;

  -- ── 1. sign-up ────────────────────────────────────────────────────────────
  uid := identity.provision_user_from_subject(s, 'verify036@example.com', 'Verify Sixthreesix');
  IF uid IS NULL THEN RAISE EXCEPTION 'FAIL 1: sign-up returned no user id'; END IF;
  RAISE NOTICE 'PASS 1  a validated subject becomes an application user';

  -- ── 2. idempotent, and Keycloak stays authoritative for the profile ───────
  IF identity.provision_user_from_subject(s, 'renamed@example.com', 'Renamed') <> uid THEN
    RAISE EXCEPTION 'FAIL 2: a second sign-in created a SECOND user for one subject';
  END IF;
  RAISE NOTICE 'PASS 2  re-signing in reconciles the same row, never duplicates it';

  -- ── 3. authentication is NOT authorization ────────────────────────────────
  -- Observed through the boundary function, because a direct SELECT on
  -- identity.memberships returns zero here for RLS reasons and would "pass"
  -- whatever the truth was.
  SELECT count(*) INTO n
    FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 3: signing up granted % membership(s) — it must grant none', n;
  END IF;
  RAISE NOTICE 'PASS 3  a new user holds NO membership: every workshop route still refuses them';

  -- ── 4. registration ───────────────────────────────────────────────────────
  SELECT * INTO reg FROM identity.register_workshop(s, 'Verify Motors', 'Verify Branch');
  IF reg.tenant_id IS NULL OR reg.organization_id IS NULL
     OR reg.branch_id IS NULL OR reg.membership_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 4: registration did not return all four ids';
  END IF;
  RAISE NOTICE 'PASS 4  registering creates tenant + organisation + branch + membership atomically';

  -- ── 5. and the guard can now resolve them, as the RIGHT role ──────────────
  -- `workshop_owner` spelled exactly as permission-matrix.ts and ROLE_TO_NAV
  -- expect. A merely plausible role name resolves to no navigation tree and no
  -- permissions, and the owner lands in a workshop showing them nothing.
  SELECT role_name INTO role
    FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
  IF role IS DISTINCT FROM 'workshop_owner' THEN
    RAISE EXCEPTION 'FAIL 5: resolved role is %, expected workshop_owner', COALESCE(role, '(none)');
  END IF;
  RAISE NOTICE 'PASS 5  the guard resolves the registrant as workshop_owner';

  -- ── 6. GUARD, INJECTED: a repeated registration is REFUSED ────────────────
  -- A double-submitted form would otherwise create a SECOND tenant with the
  -- same owner, and no screen anywhere would reveal the duplicate.
  BEGIN
    PERFORM identity.register_workshop(s, 'Duplicate Motors', 'X');
    RAISE EXCEPTION 'FAIL 6: a second registration was ALLOWED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 6:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 6  a repeated registration is refused: %', SQLERRM;
  END;

  -- ── 7. GUARD, INJECTED: an unknown subject cannot register ────────────────
  BEGIN
    PERFORM identity.register_workshop('subject-that-does-not-exist', 'Ghost Motors', 'X');
    RAISE EXCEPTION 'FAIL 7: an unprovisioned subject registered a workshop';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 7:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 7  an unknown subject cannot register: %', SQLERRM;
  END;

  -- ── 8. GUARD, INJECTED: sign-in does NOT undo a suspension ────────────────
  -- The account lock must not be reversible by the person it was applied to.
  uid2 := identity.provision_user_from_subject(s2, 'suspended@example.com', 'Suspended Person');
  UPDATE identity.users SET status = 'suspended' WHERE id = uid2;
  PERFORM identity.provision_user_from_subject(s2, 'suspended@example.com', 'Suspended Person');
  SELECT count(*) INTO n FROM identity.users WHERE id = uid2 AND status = 'active';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 8: a suspended user reactivated themselves by signing in';
  END IF;
  -- And the consequence that matters: they resolve to nothing, so both guards refuse.
  SELECT count(*) INTO n FROM identity.memberships_for_subject(s2);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL 8b: a suspended user is still resolvable by the guards';
  END IF;
  RAISE NOTICE 'PASS 8  a suspended user stays suspended, and resolves to no user at all';

  -- ── 9. a blank subject is refused rather than written ─────────────────────
  -- Two blank subjects would collide on the unique index and quietly merge two
  -- people into one account.
  BEGIN
    PERFORM identity.provision_user_from_subject('   ', 'x@y.com', 'Blank');
    RAISE EXCEPTION 'FAIL 9: a blank subject was provisioned';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 9:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 9  a blank subject is refused: %', SQLERRM;
  END;

  RAISE NOTICE 'ALL 9 CHECKS PASSED (as %)', current_user;
END;
$$;

ROLLBACK;
