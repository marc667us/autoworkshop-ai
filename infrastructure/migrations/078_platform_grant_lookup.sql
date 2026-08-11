-- 078 — the API can finally ASK whether a platform grant exists.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY THIS MIGRATION EXISTS.
--
-- 077 made the DATABASE require an un-revoked row in
-- `identity.platform_administrators`. It said so in its own header and left the
-- other half open, deliberately and in writing:
--
--     "the API still derives platform.admin from the membership role, so
--      revoking a grant does not yet revoke API authority"
--
-- That asymmetry has been live on production since 2026-08-10 18:07. Revoking a
-- grant removes database reach and leaves every API gate open — and for
-- `GET /security/posture` and `GET /operations/report` the application check IS
-- the enforcement, because both read server-wide catalogues through
-- `queryWithoutTenant` with no row-level security underneath them at all.
--
-- Closing it means the API must learn, at request time, whether the caller
-- holds a grant. That turns out to be impossible with 077's policies alone, and
-- the reason is the whole point of this file.
--
-- ── THE TRAP: 077'S SELF-READ POLICY CANNOT FIRE WHERE THE API NEEDS IT ────
--
-- 077 granted the application role SELECT and added:
--
--     CREATE POLICY platform_administrators_self_read ... FOR SELECT
--       USING (user_id = identity.current_user_id()
--           OR identity.current_role_name() = 'admin');
--
-- `identity.current_user_id()` reads `app.user_id`. That setting is written by
-- `tenantSessionStatements`, which runs AFTER `resolveTenantContext` has already
-- decided who the caller is. The grant must be known BEFORE that, inside
-- `TenantGuard`, where no tenant context exists yet and `app.user_id` is unset.
--
-- `identity.platform_administrators` is ENABLE + FORCE ROW LEVEL SECURITY, so
-- with the setting unset the policy evaluates `user_id = NULL` and hides every
-- row. A plain SELECT from the guard would return zero rows FOR EVERY USER,
-- including real administrators — and it would do so silently, with no error.
--
-- 🔴 THAT EXACT FAILURE HAS ALREADY HAPPENED IN THIS REPOSITORY, and
-- `membership.repository.ts` carries the scar in its header: the bootstrap
-- membership query "returned an empty membership list for every user alive —
-- authorization failing closed for everyone, with the whole test suite green".
-- Unit tests do not connect as `autoworkshop_app`, so nothing local would have
-- caught it. Writing the naive SELECT here would have reproduced it verbatim,
-- one migration after the file that documents it.
--
-- ⚠️ AND FAILING CLOSED IS NOT HARMLESS HERE. Once the API gates `platform.admin`
-- on this answer, a read that always returns false locks every platform
-- administrator out of the administration surface — on production, where there
-- is exactly one such account and it is the owner's.
--
-- ── THE SHAPE, COPIED RATHER THAN INVENTED ────────────────────────────────
--
-- Migration 039 already solved this problem for memberships: a SECURITY DEFINER
-- function opens a TRANSACTION-LOCAL door pinned to one validated subject,
-- reads, and shuts it before returning. Its gate function is deliberately NOT a
-- definer, so it observes the CALLER's effective user — because `set_config` is
-- not privileged and a flag alone is settable by anyone, which was the lesson of
-- 038. This migration is that pattern applied to the grant table, and nothing
-- more. Three deliberate consequences of copying it exactly:
--
--   1. The function accepts a KEYCLOAK SUBJECT, never a user id. A user id
--      parameter would let any caller ask about anybody; a subject comes only
--      from a signature-validated token, and the caller cannot mint one.
--   2. The flag half is forgeable and is assumed to be. The half that is not is
--      `current_user = <owner of this function>`, which an application
--      connection cannot reach: `deploy-api.yml` connects as `autoworkshop_app`,
--      which is NOBYPASSRLS and cannot SET ROLE to the owner.
--   3. The door is SELECT-only and pinned to the one subject being resolved. It
--      cannot read another user's grant, and it grants no write of any kind —
--      077 deliberately left conferring authority as an out-of-band operation,
--      and this migration does not change that.
--
-- ⚠️ WHAT THIS MIGRATION DOES NOT DO.
--
-- It does not touch `is_platform_admin()`. 077's predicate is correct and stays
-- exactly as it is. This adds a way to ASK the same question from outside a
-- tenant context; it does not add a second answer. Two answers to one question
-- is how the membership `role_name` and the SQL predicate drifted apart for four
-- migrations in the first place (see 025).
--
-- It does not read `realm_access.roles`. COMBINED_PLAN_v2 §4 and
-- PLAN_EXTENSION_v1 §2.1 both forbid a token claim conferring authority, and
-- §2.1 exists because Codex found that hole at plan stage.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. the reader ───────────────────────────────────────────────────────────
--
-- Returns a BOOLEAN, not the row. The caller needs to know whether authority
-- exists, and returning `granted_actor`/`granted_reason` to the API would put
-- operator notes about one administrator on a code path that runs for every
-- authenticated request. Nothing needs them there.

CREATE OR REPLACE FUNCTION identity.platform_grant_for_subject(p_subject TEXT)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
-- Pinned so a caller-controlled search_path cannot resolve these tables
-- elsewhere. pg_temp last, and only because Postgres always searches it.
SET search_path = identity, pg_catalog, pg_temp
AS $$
DECLARE
    v_granted boolean;
BEGIN
    -- Refuse an empty subject rather than opening the door with a flag that
    -- matches no user. The policy would find nothing, but a blank flag is still
    -- an open door and there is no reason to have one. Copied from 039, and the
    -- reason is the same.
    IF p_subject IS NULL OR btrim(p_subject) = '' THEN
        RETURN false;
    END IF;

    -- `true` = transaction-local. It cannot outlive this statement's
    -- transaction even if the reset below were somehow skipped.
    PERFORM set_config('app.platform_grant_lookup', p_subject, true);

    SELECT EXISTS (
             SELECT 1
               FROM identity.platform_administrators pa
               JOIN identity.users u ON u.id = pa.user_id
              WHERE u.keycloak_subject = p_subject
                AND u.status = 'active'
                AND pa.revoked_at IS NULL)
      INTO v_granted;

    -- ⚠️ SHUT BEFORE RETURNING, exactly as 039 and register_workshop do. The
    -- caller continues in the same transaction, and a door left open is one the
    -- next statement can walk through.
    PERFORM set_config('app.platform_grant_lookup', '', true);

    RETURN v_granted;
END;
$$;

COMMENT ON FUNCTION identity.platform_grant_for_subject(TEXT) IS
'Bootstrap lookup: does this validated Keycloak subject hold an un-revoked platform '
'administrator grant? Needed because 077''s self-read policy keys on app.user_id, '
'which is not set yet inside TenantGuard -- so a plain SELECT there returns zero rows '
'for EVERY user under FORCE RLS, silently. Opens a transaction-local door pinned to '
'this one subject, reads, and closes it. Accepts only a subject taken from a '
'signature-validated token, never a user id.';

REVOKE ALL ON FUNCTION identity.platform_grant_for_subject(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.platform_grant_for_subject(TEXT) TO autoworkshop_app;

-- ── 2. the gate ─────────────────────────────────────────────────────────────
--
-- Declared BEFORE the reader, because the policy in §3 references it and the
-- reader sets the flag it tests. NOT SECURITY DEFINER, for the reason 039 gives:
-- as a definer it would always observe its own owner and return true for every
-- caller, which is the hole rather than the fix.

CREATE OR REPLACE FUNCTION identity.in_platform_grant_lookup()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = identity, pg_catalog, pg_temp
AS $$
  SELECT current_setting('app.platform_grant_lookup', true) IS NOT NULL
     AND current_setting('app.platform_grant_lookup', true) <> ''
     AND current_user = (
           SELECT r.rolname
             FROM pg_proc p
             JOIN pg_roles r ON r.oid = p.proowner
            WHERE p.oid = 'identity.platform_grant_for_subject(text)'::regprocedure
         );
$$;

COMMENT ON FUNCTION identity.in_platform_grant_lookup() IS
'TRUE only inside identity.platform_grant_for_subject: the app.platform_grant_lookup '
'flag is set AND the effective user is that function''s owner. set_config is not '
'privileged, so the flag alone is settable by any caller -- the owner check is the '
'half that cannot be forged from an application connection (lesson of 038).';

REVOKE ALL ON FUNCTION identity.in_platform_grant_lookup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.in_platform_grant_lookup() TO autoworkshop_app;

-- ── 3. the policy ───────────────────────────────────────────────────────────
--
-- SELECT only, and pinned to the subject being resolved. It cannot reach a row
-- belonging to anybody else: `user_id` is tied to the flag, and the flag holds a
-- subject taken from a signature-validated token.
--
-- ⚠️ THIS IS AN ADDITIONAL POLICY, NOT A REPLACEMENT. 077's
-- `platform_administrators_self_read` stays exactly as it is — it is what
-- `is_platform_admin()` relies on once a tenant context exists, and PostgreSQL
-- ORs permissive policies together. Dropping it would break the predicate 077
-- built.
--
-- ⚠️ IT MUST NOT CALL `is_platform_admin()`. 077's header explains why in
-- detail: that predicate reads this very table, so referencing it from a policy
-- ON this table is infinite recursion at the first SELECT after deploy.
-- verify/077 asserts it stays absent and verify/078 asserts it here too.

DROP POLICY IF EXISTS platform_grant_lookup_select ON identity.platform_administrators;
CREATE POLICY platform_grant_lookup_select
  ON identity.platform_administrators
  FOR SELECT
  USING (
      identity.in_platform_grant_lookup()
      AND user_id = (
            SELECT u.id
              FROM identity.users u
             WHERE u.keycloak_subject = current_setting('app.platform_grant_lookup', true)
          )
  );

COMMIT;
