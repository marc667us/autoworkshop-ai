-- Proof by effect for migration 037 (registration under FORCE row-level
-- security, as a NON-superuser — i.e. under production's conditions).
--
-- ── 🔴 WHY THIS FILE EXISTS AT ALL, AND WHAT verify/036 COULD NOT SEE ───────
--
-- `verify/036` passed 9 of 9 locally against a defect that made registration
-- return 500 on every attempt in production. It was not careless: it did
-- `SET LOCAL ROLE autoworkshop_app` and asserted `current_user`. That was
-- necessary and still insufficient, for one reason:
--
--     A SECURITY DEFINER function DISCARDS the caller's role and executes as
--     the function's OWNER. Locally that owner is `autoworkshop`, a SUPERUSER,
--     and a superuser is exempt from row-level security. On Render the very
--     same user is merely the table owner, and migration 001 applied FORCE ROW
--     LEVEL SECURITY, which exists exactly so owners are NOT exempt.
--
-- So the outer SET ROLE was undone the instant the function was entered. The
-- test measured a privilege level the application never runs at.
--
-- ── HOW THIS FILE FIXES THE MEASUREMENT ─────────────────────────────────────
--
-- It re-owns the function to `autoworkshop_app` — a plain, non-superuser role —
-- INSIDE the transaction, so the SECURITY DEFINER elevation lands somewhere
-- that RLS actually applies. DDL is transactional in Postgres, so the ROLLBACK
-- at the end restores the original owner. That reproduces production's
-- conditions on a local box, which is the only way this defect class is
-- catchable before it ships.
--
-- Check 0 REFUSES TO CONTINUE if the effective owner still turns out to be a
-- superuser. A file that silently measures the wrong thing is worse than no
-- file: this repo has now been burned four times by a check that walks through
-- its own gap and reports a pass.
--
-- Guards are proved by INJECTING the failure — attempting the forbidden thing
-- and requiring a refusal — never by exercising the happy path and inferring.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/037_registration_rls_bootstrap.sql
--
-- Seeds nothing, asserts under production privileges, ROLLS BACK.

BEGIN;

-- Subjects unique to THIS run. A fixed literal would make the second run judge
-- rows the first left behind, and the duplicate guard would then fire on the
-- happy path — the file failing for the wrong reason. Two runs in this repo
-- have already consumed their own fixture.
CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v TEXT) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;
INSERT INTO _fx VALUES
  ('subject',  'verify037-'  || replace(gen_random_uuid()::text, '-', '')),
  ('subject2', 'verify037b-' || replace(gen_random_uuid()::text, '-', ''));

-- ── THE MEASUREMENT FIX ─────────────────────────────────────────────────────
-- Make the SECURITY DEFINER elevation land on a non-superuser, as it does on
-- Render. Rolled back with everything else.
ALTER FUNCTION identity.register_workshop(TEXT, TEXT, TEXT)          OWNER TO autoworkshop_app;
ALTER FUNCTION identity.provision_user_from_subject(TEXT, TEXT, TEXT) OWNER TO autoworkshop_app;

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  s        TEXT := (SELECT v FROM _fx WHERE k = 'subject');
  s2       TEXT := (SELECT v FROM _fx WHERE k = 'subject2');
  uid      uuid;
  uid2     uuid;
  reg      RECORD;
  n        INT;
  role     TEXT;
  owner_su BOOLEAN;
BEGIN
  -- ── 0. IS THIS MEASUREMENT EVEN VALID? ────────────────────────────────────
  -- Two ways it could quietly become meaningless: running as the wrong caller,
  -- or — the one that actually happened — the function still executing as a
  -- superuser and sailing past every policy under test.
  IF current_user <> 'autoworkshop_app' THEN
    RAISE EXCEPTION 'MEASUREMENT INVALID: caller is %, not autoworkshop_app', current_user;
  END IF;

  SELECT r.rolsuper INTO owner_su
    FROM pg_proc p
    JOIN pg_roles r ON r.oid = p.proowner
   WHERE p.oid = 'identity.register_workshop(text,text,text)'::regprocedure;

  IF owner_su IS NOT FALSE THEN
    RAISE EXCEPTION
      'MEASUREMENT INVALID: register_workshop still executes as a SUPERUSER, so '
      'row-level security is bypassed and NOTHING below is being tested. This is '
      'the exact blind spot that let verify/036 pass 9/9 against a live 500.';
  END IF;
  RAISE NOTICE 'PASS 0  the function executes as a NON-superuser: RLS is genuinely in force';

  -- ── 1. sign-up still works under these privileges ─────────────────────────
  uid := identity.provision_user_from_subject(s, 'verify037@example.com', 'Verify Threeseven');
  IF uid IS NULL THEN RAISE EXCEPTION 'FAIL 1: sign-up returned no user id'; END IF;
  RAISE NOTICE 'PASS 1  a validated subject becomes an application user';

  -- ── 2. 🔴 THE HEADLINE: registration is no longer refused by RLS ──────────
  -- Before 037 this raised
  --   new row violates row-level security policy for table "tenants"
  -- and returned 500 to every user in production.
  SELECT * INTO reg FROM identity.register_workshop(s, 'Verify Motors 037', 'Verify Branch');
  IF reg.tenant_id IS NULL OR reg.organization_id IS NULL
     OR reg.branch_id IS NULL OR reg.membership_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 2: registration did not return all four ids';
  END IF;
  RAISE NOTICE 'PASS 2  registration creates tenant + organisation + branch + membership under FORCE RLS';

  -- ── 3. the rows are real, seen through the boundary the app itself uses ───
  -- NOT a direct SELECT: that correctly returns zero under RLS with no tenant
  -- context, and reading that as a failure is how verify/036's first draft
  -- reported a working registration as broken.
  SELECT role_name INTO role
    FROM identity.memberships_for_subject(s) WHERE tenant_id IS NOT NULL;
  IF role IS DISTINCT FROM 'workshop_owner' THEN
    RAISE EXCEPTION 'FAIL 3: resolved role is %, expected workshop_owner', COALESCE(role, '(none)');
  END IF;
  RAISE NOTICE 'PASS 3  the registrant resolves as workshop_owner — the nav tree and permissions will bind';

  -- ── 4. 🔴 THE DUPLICATE GUARD ACTUALLY FIRES NOW ──────────────────────────
  -- This is the second defect 037 closes. The guard is a SELECT on
  -- identity.memberships; under FORCE RLS with no tenant context it returned
  -- ZERO ROWS for everybody, so it could not fire at all. It has been reading
  -- as a safety net while being incapable of catching anything. Had 037 opened
  -- only the INSERT door, this would have shipped as a working duplicate bug.
  BEGIN
    PERFORM identity.register_workshop(s, 'Duplicate Motors', 'X');
    RAISE EXCEPTION 'FAIL 4: a SECOND registration was allowed for the same person';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 4:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 4  a repeated registration is refused: %', SQLERRM;
  END;

  -- ── 5. THE DOOR IS SHUT AGAIN ON THE WAY OUT ──────────────────────────────
  -- The caller's transaction continues after the function returns. If the flag
  -- were still set, the rest of that transaction would hold a bypass nobody
  -- asked for.
  IF COALESCE(current_setting('app.bootstrap', true), '') = 'on' THEN
    RAISE EXCEPTION 'FAIL 5: app.bootstrap is STILL ON after the function returned';
  END IF;
  RAISE NOTICE 'PASS 5  app.bootstrap is cleared before control returns to the caller';

  -- ── 6. GUARD, INJECTED: with the door shut, a bare INSERT is refused ──────
  -- Proves the bypass is the ONLY way through, and that 037 did not simply
  -- weaken the table.
  BEGIN
    INSERT INTO identity.tenants (name, slug, status, created_by)
    VALUES ('Backdoor Motors', 'backdoor-' || substr(gen_random_uuid()::text,1,8), 'active', uid);
    RAISE EXCEPTION 'FAIL 6: an ordinary INSERT into identity.tenants was ACCEPTED';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS 6  an INSERT outside the function is still refused by RLS';
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'FAIL 6:%' THEN RAISE; END IF;
      RAISE NOTICE 'PASS 6  an INSERT outside the function is still refused: %', SQLERRM;
  END;

  -- ── 7. GUARD, INJECTED: the flag alone is NOT enough ──────────────────────
  -- The policies pin the row to app.bootstrap_user. Force the flag on but name
  -- somebody else, and the write must still be refused — otherwise the bypass
  -- would be "RLS off" wearing a nicer name.
  uid2 := identity.provision_user_from_subject(s2, 'verify037b@example.com', 'Other Person');
  PERFORM set_config('app.bootstrap',      'on',         true);
  PERFORM set_config('app.bootstrap_user', uid2::text,   true);
  BEGIN
    INSERT INTO identity.tenants (name, slug, status, created_by)
    VALUES ('Impersonation Motors', 'imp-' || substr(gen_random_uuid()::text,1,8), 'active', uid);
    RAISE EXCEPTION 'FAIL 7: the bootstrap door wrote a row attributed to ANOTHER user';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS 7  the door is pinned to one user: a row for anyone else is refused';
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'FAIL 7:%' THEN RAISE; END IF;
      RAISE NOTICE 'PASS 7  the door is pinned to one user: %', SQLERRM;
  END;

  -- ── 8. GUARD, INJECTED: a membership cannot be minted for someone else ────
  -- The membership policy pins created_by AND user_id, because created_by alone
  -- would let this door grant somebody else access to a tenant.
  BEGIN
    INSERT INTO identity.memberships
      (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (reg.tenant_id, reg.organization_id, reg.branch_id, uid,
            'workshop_owner', 'active', uid2);
    RAISE EXCEPTION 'FAIL 8: the bootstrap door granted a membership to a third party';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS 8  a membership for a third party is refused';
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'FAIL 8:%' THEN RAISE; END IF;
      RAISE NOTICE 'PASS 8  a membership for a third party is refused: %', SQLERRM;
  END;
  PERFORM set_config('app.bootstrap',      '', true);
  PERFORM set_config('app.bootstrap_user', '', true);

  -- ── 9. GUARD, INJECTED: junk in the GUC fails CLOSED, and does not 500 ────
  -- The comparison is made on TEXT precisely so a non-uuid cannot RAISE a cast
  -- error. A guard that turns bad input into a 500 is a denial of service with
  -- good intentions.
  PERFORM set_config('app.bootstrap',      'on',           true);
  PERFORM set_config('app.bootstrap_user', 'not-a-uuid-at-all', true);
  BEGIN
    INSERT INTO identity.tenants (name, slug, status, created_by)
    VALUES ('Junk Motors', 'junk-' || substr(gen_random_uuid()::text,1,8), 'active', uid);
    RAISE EXCEPTION 'FAIL 9: a junk app.bootstrap_user was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS 9  a junk bootstrap_user is refused, not crashed on';
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'FAIL 9:%' THEN RAISE; END IF;
      RAISE NOTICE 'PASS 9  a junk bootstrap_user is refused: %', SQLERRM;
  END;
  PERFORM set_config('app.bootstrap',      '', true);
  PERFORM set_config('app.bootstrap_user', '', true);

  -- ── 10. GUARD, INJECTED: an unknown subject still cannot register ────────
  BEGIN
    PERFORM identity.register_workshop('subject-037-does-not-exist', 'Ghost Motors', 'X');
    RAISE EXCEPTION 'FAIL 10: an unprovisioned subject registered a workshop';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 10:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 10 an unknown subject cannot register: %', SQLERRM;
  END;

  -- ── 11. GUARD, INJECTED: a suspended user cannot register ────────────────
  UPDATE identity.users SET status = 'suspended' WHERE id = uid2;
  BEGIN
    PERFORM identity.register_workshop(s2, 'Suspended Motors', 'X');
    RAISE EXCEPTION 'FAIL 11: a suspended user registered a workshop';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 11:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 11 a suspended user cannot register: %', SQLERRM;
  END;

  -- ── 12. a second, DIFFERENT person can still register ────────────────────
  -- The duplicate guard must bind to the PERSON, not to "anyone has registered
  -- already". A guard that is too wide breaks sign-up for the whole platform
  -- after the first workshop, which is a far worse failure than the one fixed.
  SELECT count(*) INTO n FROM identity.users WHERE id = uid2;
  UPDATE identity.users SET status = 'active' WHERE id = uid2;
  SELECT * INTO reg FROM identity.register_workshop(s2, 'Second Person Motors', 'Main');
  IF reg.tenant_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 12: the SECOND person on the platform could not register';
  END IF;
  RAISE NOTICE 'PASS 12 a different person registers their own workshop normally';

  RAISE NOTICE 'ALL 13 CHECKS PASSED (caller %, function owner is a non-superuser)', current_user;
END;
$$;

ROLLBACK;
