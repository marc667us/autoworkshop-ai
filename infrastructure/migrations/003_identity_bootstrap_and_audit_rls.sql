-- ============================================================================
-- Migration 003 — the identity bootstrap lookup, and RLS on audit.events
--
-- Two defects found by the Codex security review of 2026-07-27 and then
-- REPRODUCED against the live database before anything was changed. Both were
-- invisible to every test in the suite because no test connects as
-- `autoworkshop_app` with no tenant context, which is exactly the state the
-- application is in at the moment a request arrives.
--
-- ── DEFECT 1: authorization could never succeed ─────────────────────────────
--
-- `MembershipRepository.findByKeycloakSubject()` resolves which tenants a user
-- belongs to. It has to run WITHOUT a tenant context, because it is the query
-- that ESTABLISHES the tenant context -- there is nothing to scope it to yet.
-- It therefore used `queryWithoutTenant()`, which issues a plain pool query and
-- sets no `app.*` settings at all.
--
-- But `identity.memberships` is under ENABLE + FORCE RLS, and its policy reads
--     USING (is_platform_admin() OR tenant_id = current_tenant_id())
-- With nothing set, `current_tenant_id()` is NULL and `current_role_name()` is
-- 'none', so the policy evaluates `tenant_id = NULL` -> NULL -> not visible.
--
-- Measured on the running database, as the real application role:
--     current_user = autoworkshop_app, rolsuper = f
--     memberships actually present : 1   (technician, active)
--     memberships visible          : 0
--     bootstrap query returns      : the user row, tenant_id NULL, role NULL
--
-- The repository then filters `tenant_id !== null` and returns an EMPTY
-- membership list for every user alive. No tenant context can be resolved, so
-- authorization fails closed for everyone -- a platform-wide login outage that
-- typecheck, lint, 122 unit tests and a 10-target build all pass through.
--
-- FIX: a SECURITY DEFINER function, owned by the table owner, so it runs with
-- the owner's RLS exemption instead of the caller's. This is the standard
-- pattern for a bootstrap lookup and it is safe here for reasons that are
-- structural, not incidental:
--
--   * It accepts ONLY a Keycloak subject, which the API takes from a token
--     whose signature it has already validated. It accepts no tenant id, no
--     user id, and no predicate from the caller -- so there is nothing to
--     tamper with.
--   * It returns ONLY that subject's own rows. There is no argument that can
--     widen it to another user, and no way to enumerate.
--   * `search_path` is pinned. A SECURITY DEFINER function without that can be
--     hijacked by a caller-controlled search_path resolving `identity.users` to
--     something else entirely.
--   * EXECUTE is revoked from PUBLIC and granted only to the application role.
--
-- The tenant boundary is crossed in exactly one place, deliberately, in about
-- ten lines -- which is far easier to audit than the alternative of widening a
-- policy on `identity.memberships` itself.
--
-- ── DEFECT 2: audit.events had no row-level security ────────────────────────
--
-- Every tenant-owned table in 001 gets ENABLE + FORCE. `audit.events` got
-- neither, while 002 grants SELECT on it to `autoworkshop_app`. Confirmed live:
--     audit.events           enabled=f forced=f
--     identity.memberships   enabled=t forced=t
--
-- The table carries `tenant_id`, `actor_user_id`, `correlation_id` and a
-- `detail` jsonb. Any audit-viewing endpoint, any over-broad internal query, or
-- any SQL injection reaching the app role could read every tenant's audit trail.
-- CLAUDE.md §7 requires RLS on every tenant-owned table; this one was missed.
--
-- THE POLICY IS ASYMMETRIC ON PURPOSE. A naive `tenant_id = current_tenant_id()`
-- on both sides would break the audit trail: system and pre-authentication
-- events (failed login, boot, scheduled jobs) legitimately carry
-- `tenant_id IS NULL`, and a WITH CHECK demanding a match would reject them.
-- Silently losing audit rows is worse than the exposure being fixed. So:
--
--   READ  -- a NULL-tenant event is visible ONLY to a platform admin, never
--            leaked into a tenant's view.
--   WRITE -- a NULL-tenant event is allowed, but an event ATTRIBUTED to another
--            tenant is not. You may record a system event; you may not forge
--            one against someone else.
--
-- Append-only is unaffected: the DO INSTEAD NOTHING rules on UPDATE and DELETE
-- from 001 still stand, and this migration grants nothing new.
-- ============================================================================

BEGIN;

-- ── defect 1: bootstrap membership resolution ───────────────────────────────

CREATE OR REPLACE FUNCTION identity.memberships_for_subject(p_subject TEXT)
RETURNS TABLE (
    user_id         uuid,
    tenant_id       uuid,
    organization_id uuid,
    branch_id       uuid,
    role_name       TEXT,
    status          TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Pinned so a caller-controlled search_path cannot resolve these tables
-- elsewhere. pg_temp last, and only because Postgres always searches it.
SET search_path = identity, pg_catalog, pg_temp
AS $$
    SELECT u.id,
           m.tenant_id,
           m.organization_id,
           m.branch_id,
           m.role_name,
           m.status
      FROM identity.users u
 LEFT JOIN identity.memberships m ON m.user_id = u.id
     WHERE u.keycloak_subject = p_subject
       AND u.status = 'active';
$$;

COMMENT ON FUNCTION identity.memberships_for_subject(TEXT) IS
'Bootstrap lookup: resolves a validated Keycloak subject to its own memberships. '
'SECURITY DEFINER because identity.memberships is under FORCE RLS and this query '
'runs before any tenant context exists -- it is what establishes it. Accepts only '
'a subject taken from a signature-validated token; returns only that user''s rows.';

-- Not for the world. Only the application role may resolve a subject.
REVOKE ALL ON FUNCTION identity.memberships_for_subject(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.memberships_for_subject(TEXT) TO autoworkshop_app;

-- ── defect 2: RLS on the audit trail ────────────────────────────────────────

ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;
-- FORCE, so the owner is bound by the policy too. Without it, isolation is off
-- in precisely the environment where it matters most -- the lesson of 002.
ALTER TABLE audit.events FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_tenant_read  ON audit.events;
DROP POLICY IF EXISTS audit_tenant_write ON audit.events;

-- Read: own tenant only. NULL-tenant system events are platform-admin only,
-- rather than visible to whichever tenant happens to be asking.
CREATE POLICY audit_tenant_read ON audit.events
    FOR SELECT
    USING (
        identity.is_platform_admin()
        OR (tenant_id IS NOT NULL AND tenant_id = identity.current_tenant_id())
    );

-- Write: system events (tenant_id IS NULL) are permitted, because losing them
-- is worse than the exposure this closes. Attributing an event to a DIFFERENT
-- tenant is not.
CREATE POLICY audit_tenant_write ON audit.events
    FOR INSERT
    WITH CHECK (
        identity.is_platform_admin()
        OR tenant_id IS NULL
        OR tenant_id = identity.current_tenant_id()
    );

COMMIT;
