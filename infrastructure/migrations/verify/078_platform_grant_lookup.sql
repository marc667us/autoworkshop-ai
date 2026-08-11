-- verify/078 — the guard can read a grant BEFORE a tenant context exists, and
-- nobody else can read anybody else's.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🟢 THE CHECKS THAT MATTER RUN AS `autoworkshop_app`, WHICH IS NOBYPASSRLS.
--
-- That is not a detail — it is the entire reason this migration exists. As the
-- owner, every query below would pass whether or not the door works, because a
-- superuser bypasses RLS and the local owner IS a superuser. This repository has
-- twice shipped a guard that passed as the owner and was inert as the
-- application role, and `membership.repository.ts` records a third case where a
-- bootstrap read returned zero rows for every user alive with the whole test
-- suite green.
--
-- 🔴 CHECK 2 IS THE ONE THAT WOULD HAVE CAUGHT THE NAIVE IMPLEMENTATION.
-- It proves that a DIRECT select from `identity.platform_administrators`, with
-- no tenant context set, sees NOTHING as the application role — which is exactly
-- what `TenantGuard` would have done had this migration not been written, and it
-- would have locked every platform administrator out of production silently.
--
-- 🔴 CHECK 5 IS THE FORGERY CHECK. `set_config` is not privileged, so any caller
-- can write the flag. Setting it by hand and then selecting must STILL return
-- nothing, because the other half of the gate is `current_user = <the function's
-- owner>`, which an application connection cannot reach. This is the lesson of
-- 038 restated as an assertion.
--
-- 🔴 CHECK 7 GUARDS A CHANGE THAT WOULD HANG THE DATABASE, exactly as verify/077
-- does for the policies 077 added. No policy on this table may call
-- `is_platform_admin()` — that function SELECTs from this table, so a policy
-- calling it re-enters it on every evaluation. The symptom is not a failing
-- test; it is a production deadlock.
--
-- ⚠️ IDS AND SUBJECTS ARE RESOLVED BEFORE `SET ROLE`, DELIBERATELY. Reading them
-- afterwards returns nothing — the grant table is FORCE RLS — and every check
-- below would then read false for the right-looking reason. verify/077 records
-- that this mistake was made while writing it.
--
-- ⚠️ THIS FILE ROLLS BACK. It ends in ROLLBACK so it can be run against any
-- database, including production through the migrations workflow, without
-- leaving a row behind.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $verify$
DECLARE
    v_granted_subject    text;
    v_ungranted_subject  text;
    v_granted_user       uuid;
    v_answer             boolean;
    v_count              int;
    v_policies           int;
BEGIN
    -- ── Resolved as the OWNER, before any SET ROLE ──────────────────────────
    SELECT u.keycloak_subject, u.id
      INTO v_granted_subject, v_granted_user
      FROM identity.platform_administrators pa
      JOIN identity.users u ON u.id = pa.user_id
     WHERE pa.revoked_at IS NULL
       AND u.status = 'active'
       AND u.keycloak_subject IS NOT NULL
     LIMIT 1;

    IF v_granted_subject IS NULL THEN
        RAISE EXCEPTION 'check 0 FAILED: no active platform administrator grant with a '
                        'keycloak_subject exists. 077''s backfill should have created one '
                        'per active platform_administrator membership. Without one this '
                        'file cannot prove the positive case, and passing it by skipping '
                        'would be a check whose result depends on how much data exists.';
    END IF;

    -- A user who is NOT granted. Deliberately taken from the whole user table
    -- rather than from memberships: the point is that holding any membership,
    -- including a `platform_administrator` one, buys nothing here.
    SELECT u.keycloak_subject INTO v_ungranted_subject
      FROM identity.users u
     WHERE u.status = 'active'
       AND u.keycloak_subject IS NOT NULL
       AND NOT EXISTS (SELECT 1
                         FROM identity.platform_administrators pa
                        WHERE pa.user_id = u.id
                          AND pa.revoked_at IS NULL)
     LIMIT 1;

    IF v_ungranted_subject IS NULL THEN
        RAISE EXCEPTION 'check 0b FAILED: every active user holds a grant, so the negative '
                        'case cannot be proved. Do not weaken this into a skip — a check '
                        'that only ever runs its positive half proves nothing.';
    END IF;

    -- ═══ AS THE APPLICATION ROLE, WHICH IS WHAT PRODUCTION USES ═══
    SET LOCAL ROLE autoworkshop_app;

    -- 1. The granted subject reads TRUE, with NO tenant context set.
    --    This is the request-time question TenantGuard has to ask.
    SELECT identity.platform_grant_for_subject(v_granted_subject) INTO v_answer;
    IF v_answer IS NOT TRUE THEN
        RAISE EXCEPTION 'check 1 FAILED: a granted subject read % as autoworkshop_app with '
                        'no tenant context. This is the case that locks the owner out of '
                        'production.', v_answer;
    END IF;

    -- 2. 🔴 THE TRAP THIS MIGRATION EXISTS FOR. A direct SELECT, which is what a
    --    naive implementation would have written, sees nothing at all here.
    SELECT count(*) INTO v_count
      FROM identity.platform_administrators
     WHERE revoked_at IS NULL;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'check 2 FAILED: a direct SELECT with no tenant context returned % '
                        'rows as autoworkshop_app. Either FORCE RLS is off or a policy is '
                        'wider than 077 intended — and if this ever legitimately becomes '
                        'non-zero, migration 078 is unnecessary and should be reconsidered '
                        'rather than have this check relaxed.', v_count;
    END IF;

    -- 3. An UNGRANTED subject reads FALSE. The negative case, proved against a
    --    real user rather than a fabricated one.
    SELECT identity.platform_grant_for_subject(v_ungranted_subject) INTO v_answer;
    IF v_answer IS NOT FALSE THEN
        RAISE EXCEPTION 'check 3 FAILED: an ungranted subject read %. A membership role '
                        'name must buy nothing here.', v_answer;
    END IF;

    -- 4. An empty and a NULL subject read FALSE rather than opening the door.
    IF identity.platform_grant_for_subject('') IS NOT FALSE
       OR identity.platform_grant_for_subject('   ') IS NOT FALSE
       OR identity.platform_grant_for_subject(NULL) IS NOT FALSE THEN
        RAISE EXCEPTION 'check 4 FAILED: a blank or NULL subject did not read false. A flag '
                        'that matches no user is still an open door.';
    END IF;

    -- 5. 🔴 FORGERY. Set the flag by hand — which any caller may do, because
    --    set_config is not privileged — and the policy must STILL show nothing,
    --    because the other half of the gate is the function's owner.
    PERFORM set_config('app.platform_grant_lookup', v_granted_subject, true);
    SELECT count(*) INTO v_count
      FROM identity.platform_administrators
     WHERE revoked_at IS NULL;
    PERFORM set_config('app.platform_grant_lookup', '', true);
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'check 5 FAILED: setting app.platform_grant_lookup by hand exposed '
                        '% rows to autoworkshop_app. The owner half of in_platform_grant_'
                        'lookup() is not holding, and the flag alone is forgeable by any '
                        'caller — this is the hole 038 was about.', v_count;
    END IF;

    -- 6. The door SHUTS. After a call the flag must be empty, so the next
    --    statement in the same transaction cannot walk through it.
    PERFORM identity.platform_grant_for_subject(v_granted_subject);
    IF coalesce(current_setting('app.platform_grant_lookup', true), '') <> '' THEN
        RAISE EXCEPTION 'check 6 FAILED: the lookup flag was still set to "%" after the '
                        'function returned.', current_setting('app.platform_grant_lookup', true);
    END IF;

    RESET ROLE;

    -- 7. 🔴 STRUCTURAL — no policy on this table may reference is_platform_admin().
    --    Asserted because the symptom is a deadlock, not a failing test.
    SELECT count(*) INTO v_policies
      FROM pg_policies
     WHERE schemaname = 'identity'
       AND tablename  = 'platform_administrators'
       AND (coalesce(qual, '') LIKE '%is_platform_admin%'
         OR coalesce(with_check, '') LIKE '%is_platform_admin%');
    IF v_policies <> 0 THEN
        RAISE EXCEPTION 'check 7 FAILED: % policy/policies on identity.platform_administrators '
                        'reference is_platform_admin(), which SELECTs from this very table. '
                        'That is infinite recursion at the first SELECT after deploy.', v_policies;
    END IF;

    -- 8. 077's own self-read policy SURVIVED. This migration adds a policy; it
    --    must not have replaced the one is_platform_admin() depends on.
    SELECT count(*) INTO v_policies
      FROM pg_policies
     WHERE schemaname = 'identity'
       AND tablename  = 'platform_administrators'
       AND policyname = 'platform_administrators_self_read';
    IF v_policies <> 1 THEN
        RAISE EXCEPTION 'check 8 FAILED: 077''s platform_administrators_self_read policy is '
                        'gone (found %). is_platform_admin() relies on it once a tenant '
                        'context exists.', v_policies;
    END IF;

    -- 9. The gate function is NOT a SECURITY DEFINER. As a definer it would
    --    always observe its own owner and return true for every caller, which is
    --    the hole rather than the fix (039's reasoning, asserted here).
    SELECT count(*) INTO v_count
      FROM pg_proc
     WHERE oid = 'identity.in_platform_grant_lookup()'::regprocedure
       AND prosecdef;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'check 9 FAILED: in_platform_grant_lookup() is SECURITY DEFINER. It '
                        'must observe the CALLER''s effective user, or it returns true for '
                        'everyone.';
    END IF;

    -- 10. The reader IS a definer, and grants EXECUTE to the app role only.
    SELECT count(*) INTO v_count
      FROM pg_proc
     WHERE oid = 'identity.platform_grant_for_subject(text)'::regprocedure
       AND prosecdef;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'check 10 FAILED: platform_grant_for_subject is not SECURITY DEFINER; '
                        'it cannot open the door it exists to open.';
    END IF;

    IF has_function_privilege('public', 'identity.platform_grant_for_subject(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'check 10b FAILED: PUBLIC may execute platform_grant_for_subject.';
    END IF;

    RAISE NOTICE '078 verify: 10/10 checks passed (0, 0b, 1-10).';
END;
$verify$;

-- Deliberate: this file asserts, it does not change anything.
ROLLBACK;
