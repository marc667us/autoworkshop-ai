-- Proof by effect for migration 038 (the bootstrap door is openable only by
-- identity.register_workshop, not by the application role).
--
-- ── WHAT THIS FILE MUST PROVE, AND IN WHICH ORDER ──────────────────────────
--
-- Two things, and the second is the one that matters:
--
--   1. Registration STILL WORKS. A fix that closes the door on the function
--      itself would turn a 500 into a different 500.
--   2. THE APP ROLE CANNOT OPEN THE DOOR ITSELF. Before 038 this succeeded —
--      `set_config` is not privileged and migration 002 grants
--      `autoworkshop_app` INSERT on every `identity` table, so the role could
--      set both GUCs and write directly with no function in the call path.
--      Measured, not theorised: `INSERT 0 1`.
--
-- 037's header claimed the bypass was "reachable only from inside this
-- function". It was not. This file is the check that sentence never had.
--
-- ⚠️ AS `autoworkshop_app`, AND WITH THE FUNCTION RE-OWNED to a non-superuser —
-- the same two conditions `verify/037` establishes. Without them a superuser
-- sails past every policy and the whole file passes while testing nothing.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/038_bootstrap_door_requires_definer.sql
--
-- Seeds nothing, ROLLS BACK.

BEGIN;

CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v TEXT) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;
INSERT INTO _fx VALUES ('subject', 'verify038-' || replace(gen_random_uuid()::text, '-', ''));

-- ── 🔴 PRODUCTION HAS *THREE* ROLES, AND THAT IS THE WHOLE POINT HERE ──────
--
-- On Render: the tables and functions are owned by `autoworkshop`, which is NOT
-- a superuser, and the application connects as `autoworkshop_app`. Two distinct
-- roles.
--
-- `verify/037` re-owns the function to `autoworkshop_app` — correct for what it
-- asserts (that RLS applies to a non-superuser owner) and USELESS here: it makes
-- the owner and the caller the same role, so 038's "are you the owner?" check is
-- trivially true and the fix looks broken when it is not. The first run of this
-- file failed for exactly that reason.
--
-- So this creates a THIRD role: a non-superuser owner that is not the app role.
-- CREATE ROLE is transactional, so the ROLLBACK at the end removes it.
CREATE ROLE verify038_owner NOSUPERUSER NOLOGIN;
GRANT USAGE ON SCHEMA identity TO verify038_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO verify038_owner;
-- The POLICIES call `identity.is_platform_admin()` and friends, and those are
-- REVOKEd from PUBLIC — so without EXECUTE the owner fails on the helper rather
-- than on the policy, and the run reports a permission error that looks like the
-- fix breaking registration. Same reasoning as the table grants: this role is
-- standing in for `autoworkshop`, which owns them all and needs no grant.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA identity TO verify038_owner;

ALTER FUNCTION identity.register_workshop(TEXT, TEXT, TEXT)           OWNER TO verify038_owner;
ALTER FUNCTION identity.provision_user_from_subject(TEXT, TEXT, TEXT) OWNER TO verify038_owner;

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  s        TEXT := (SELECT v FROM _fx WHERE k = 'subject');
  uid      uuid;
  reg      RECORD;
  owner_su BOOLEAN;
BEGIN
  IF current_user <> 'autoworkshop_app' THEN
    RAISE EXCEPTION 'MEASUREMENT INVALID: caller is %, not autoworkshop_app', current_user;
  END IF;

  SELECT r.rolsuper INTO owner_su
    FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
   WHERE p.oid = 'identity.register_workshop(text,text,text)'::regprocedure;
  IF owner_su IS NOT FALSE THEN
    RAISE EXCEPTION 'MEASUREMENT INVALID: the function still runs as a SUPERUSER';
  END IF;

  -- And the owner must be a DIFFERENT role from the caller, or 038's check is
  -- trivially satisfied and PASS 2 below would prove nothing.
  IF (SELECT r.rolname FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
       WHERE p.oid = 'identity.register_workshop(text,text,text)'::regprocedure) = current_user THEN
    RAISE EXCEPTION
      'MEASUREMENT INVALID: the function owner and the caller are the same role, '
      'so the owner check cannot discriminate and nothing below is being tested';
  END IF;
  RAISE NOTICE 'PASS 0  app role calling a non-superuser-owned function, owner <> caller';

  -- ── 1. REGISTRATION STILL WORKS ──────────────────────────────────────────
  -- First, because a fix that breaks the legitimate path is not a fix.
  uid := identity.provision_user_from_subject(s, 'verify038@example.com', 'Verify Threeeight');
  SELECT * INTO reg FROM identity.register_workshop(s, 'Verify Motors 038', 'Main');
  IF reg.tenant_id IS NULL OR reg.membership_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 1: 038 broke registration itself';
  END IF;
  RAISE NOTICE 'PASS 1  registration still creates tenant + org + branch + membership';

  -- ── 2. 🔴 THE HEADLINE: THE APP ROLE CANNOT OPEN THE DOOR ────────────────
  -- Exactly the sequence that succeeded before 038. No function in the call
  -- path: just the two settings and a direct INSERT.
  PERFORM set_config('app.bootstrap',      'on',       true);
  PERFORM set_config('app.bootstrap_user', uid::text,  true);
  BEGIN
    INSERT INTO identity.tenants (name, slug, status, created_by)
    VALUES ('Spoofed Motors', 'spoof-' || substr(gen_random_uuid()::text, 1, 8), 'active', uid);
    RAISE EXCEPTION
      'FAIL 2: the application role opened the bootstrap door BY ITSELF — '
      'set_config is not privileged, so the flag alone was never a control';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS 2  the app role cannot open the door: the owner check refuses it';
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'FAIL 2:%' THEN RAISE; END IF;
      RAISE NOTICE 'PASS 2  the app role cannot open the door: %', SQLERRM;
  END;

  -- ── 3. nor read a membership through it ──────────────────────────────────
  -- The SELECT policy carried the same flaw. A forged flag must not turn the
  -- narrow duplicate-check read into a general one.
  IF EXISTS (SELECT 1 FROM identity.memberships WHERE user_id = uid) THEN
    RAISE EXCEPTION
      'FAIL 3: the app role read a membership through the forged bootstrap flag';
  END IF;
  RAISE NOTICE 'PASS 3  the forged flag opens no read either';

  -- ── 4. and the helper itself says so ─────────────────────────────────────
  -- Asserted directly, so a future change to the policies cannot quietly leave
  -- the predicate true for the app role while the INSERTs happen to fail for
  -- some other reason.
  IF identity.in_registration_bootstrap() THEN
    RAISE EXCEPTION 'FAIL 4: in_registration_bootstrap() is TRUE for the application role';
  END IF;
  RAISE NOTICE 'PASS 4  in_registration_bootstrap() is FALSE outside the function';

  PERFORM set_config('app.bootstrap',      '', true);
  PERFORM set_config('app.bootstrap_user', '', true);

  RAISE NOTICE 'ALL 5 CHECKS PASSED (as %)', current_user;
END;
$$;

ROLLBACK;
