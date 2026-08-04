-- ============================================================================
-- 038 — THE REGISTRATION BOOTSTRAP DOOR MUST BE OPENABLE ONLY BY THE FUNCTION
--
-- ── THE DEFECT, AND IT IS ONE I WROTE ───────────────────────────────────────
--
-- Migration 037's policies admit a row when two transaction-local settings say
-- so:
--
--     current_setting('app.bootstrap', true) = 'on'
--     AND created_by::text = current_setting('app.bootstrap_user', true)
--
-- 037's own header claims: "The bypass must be reachable only from inside this
-- function." **THAT SENTENCE WAS FALSE WHEN IT WAS WRITTEN.** `set_config` is
-- not privileged, and migration 002 grants `autoworkshop_app` INSERT on every
-- table in `identity` — so the application role can open the door for itself
-- and write directly, with `identity.register_workshop` never involved.
--
-- Measured, as `autoworkshop_app`, with no function in the call path:
--
--     SET app.bootstrap = 'on';
--     SET app.bootstrap_user = '<any user id>';
--     INSERT INTO identity.tenants (...) VALUES (...);   -- INSERT 0 1
--
-- Found by Codex. It is the "a comment that claims a safety net which does not
-- exist" failure this repository has now recorded three times — and the most
-- expensive kind, because a confident sentence stops the next reader checking.
--
-- ── HOW BAD, STATED HONESTLY ────────────────────────────────────────────────
--
-- Narrow, and not nothing. The policies still pin every row to
-- `app.bootstrap_user`, so the door cannot write into somebody else's tenant or
-- read another customer's data — the blast radius is "create a tenant, an
-- organisation and a membership attributed to a chosen user", which is what
-- registration legitimately does. It is a widening of an intended path, not an
-- open door to other tenants. It is fixed here because the gap between what the
-- policy does and what its comment claims is itself the hazard.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────────
--
-- Add a predicate the app role cannot satisfy: the effective user must be the
-- OWNER of `identity.register_workshop`. Inside that SECURITY DEFINER function
-- `current_user` is the owner; on an ordinary application connection it is
-- `autoworkshop_app`. So the door now opens only where 037 always claimed.
--
-- ⚠️ THE OWNER IS LOOKED UP, NOT HARDCODED. Writing `current_user =
-- 'autoworkshop'` would be simpler and would silently stop working the day the
-- function is re-owned — failing OPEN in the environment where it matters, which
-- is precisely the local/production drift that caused the 500 that 037 fixed.
-- ============================================================================

BEGIN;

-- ── the non-spoofable half of the predicate ─────────────────────────────────

CREATE OR REPLACE FUNCTION identity.in_registration_bootstrap()
RETURNS boolean
LANGUAGE sql
STABLE
-- NOT SECURITY DEFINER, deliberately: it must observe the CALLER's effective
-- user. As SECURITY DEFINER it would always see its own owner and return true
-- for everybody, which would restore the exact hole it closes.
SET search_path = identity, pg_catalog, pg_temp
AS $$
  SELECT current_setting('app.bootstrap', true) = 'on'
     AND current_user = (
           SELECT r.rolname
             FROM pg_proc p
             JOIN pg_roles r ON r.oid = p.proowner
            WHERE p.oid = 'identity.register_workshop(text,text,text)'::regprocedure
         );
$$;

COMMENT ON FUNCTION identity.in_registration_bootstrap() IS
'TRUE only inside identity.register_workshop: the app.bootstrap flag is set AND '
'the effective user is that function''s owner. The flag alone is settable by any '
'caller (set_config is not privileged), so the owner check is the half that '
'cannot be forged from an application connection.';

REVOKE ALL ON FUNCTION identity.in_registration_bootstrap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.in_registration_bootstrap() TO autoworkshop_app;

-- ── the five policies, re-stated with the owner requirement ─────────────────
-- Each still pins the row to app.bootstrap_user. That pin is what keeps the
-- door from touching another person's tenant; this migration adds who may
-- knock at all.

DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.tenants;
CREATE POLICY registration_bootstrap_insert ON identity.tenants
    FOR INSERT
    WITH CHECK (
        identity.in_registration_bootstrap()
        AND created_by::text = current_setting('app.bootstrap_user', true)
    );

DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.organizations;
CREATE POLICY registration_bootstrap_insert ON identity.organizations
    FOR INSERT
    WITH CHECK (
        identity.in_registration_bootstrap()
        AND created_by::text = current_setting('app.bootstrap_user', true)
    );

DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.branches;
CREATE POLICY registration_bootstrap_insert ON identity.branches
    FOR INSERT
    WITH CHECK (
        identity.in_registration_bootstrap()
        AND created_by::text = current_setting('app.bootstrap_user', true)
    );

DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.memberships;
CREATE POLICY registration_bootstrap_insert ON identity.memberships
    FOR INSERT
    WITH CHECK (
        identity.in_registration_bootstrap()
        AND created_by::text = current_setting('app.bootstrap_user', true)
        AND user_id::text   = current_setting('app.bootstrap_user', true)
    );

DROP POLICY IF EXISTS registration_bootstrap_select ON identity.memberships;
CREATE POLICY registration_bootstrap_select ON identity.memberships
    FOR SELECT
    USING (
        identity.in_registration_bootstrap()
        AND user_id::text = current_setting('app.bootstrap_user', true)
    );

COMMENT ON POLICY registration_bootstrap_insert ON identity.tenants IS
'Sign-up only. Admits an INSERT while identity.register_workshop holds '
'app.bootstrap=on AND the effective user is that function''s owner, and only '
'for a row attributed to app.bootstrap_user. The owner requirement (038) is '
'what makes this unreachable from an ordinary application connection — the flag '
'alone was settable by the app role, which 037''s header wrongly claimed it was not.';

COMMIT;
