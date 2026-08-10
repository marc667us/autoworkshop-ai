-- 077 — a platform administrator is a GRANT RECORD, not a membership role name.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT WAS WRONG, AND WHY IT WAS NOT MERELY UNTIDY.
--
-- `identity.is_platform_admin()` has answered this since migration 001:
--
--     current_role_name() IN ('admin', 'platform_administrator')
--
-- `current_role_name()` reads `app.current_role`, which `tenantSessionStatements`
-- writes from `TenantContext.activeRole`, which `resolveTenantContext` takes
-- from a MEMBERSHIP ROW's `role_name`. So platform authority — the predicate
-- that opens EVERY tenant table in this database — was conferred by a text
-- column on a row inside one organisation.
--
-- Three consequences, all real:
--
--   1. A PLATFORM ADMINISTRATOR HAD TO BELONG TO SOMEBODY'S WORKSHOP.
--      `identity.memberships.organization_id` and `.tenant_id` are both NOT
--      NULL, so the grant workflow attaches the platform administrator to an
--      organisation they have no business being a member of — the owner's own
--      garage, in production today. The model forced a false statement.
--
--   2. THE ONLY THING STOPPING SELF-PROMOTION WAS APPLICATION CODE.
--      `MembershipService.GRANTABLE_ROLES` deliberately omits
--      `platform_administrator`, and that is good — but its own comment records
--      that `role_name` is "a plain TEXT column with no database CHECK".
--      CLAUDE.md §7 requires BOTH layers: "App code is the first line of
--      defence; DB RLS is the final. Both required." Here the database had no
--      opinion at all. Any path that ever wrote that string — a future
--      migration, a seed script, a repaired row, an injection — became platform
--      administrator everywhere.
--
--   3. REVOCATION HAD NO RECORD. Deleting or downgrading a membership row left
--      nothing behind saying who removed platform authority, when, or why.
--
-- ⚠️ WHAT THIS MIGRATION DELIBERATELY DOES **NOT** DO.
--
-- It does not read the Keycloak token. `platform_administrator` is a realm role
-- and `KeycloakJwtService` already parses `realm_access.roles`, and it would
-- have been one line to trust it. That is rejected, on the plan's own authority:
--
--   · COMBINED_PLAN_v2 §4 — tenant context comes "solely from validated
--     Keycloak claims AND membership records" (Codex correction #4).
--   · PLAN_EXTENSION_v1 §2.1 — an invariant added because Codex found this
--     exact hole (finding 6): "Authority derives from membership and role,
--     NEVER from the ... claim itself ... it is not an input to any
--     authorization decision."
--   · `keycloak-jwt.service.ts` already says why, in code: a token role set "can
--     be stale relative to a membership that was just revoked".
--
-- A grant table keeps that property. Revocation takes effect on the next
-- statement, not at token expiry.
--
-- 🔴 WHAT THIS MIGRATION DOES **NOT** FIX — READ THIS BEFORE TRUSTING IT.
--
-- This closes the DATABASE half only. The API still derives `platform.admin`
-- from `ROLE_PERMISSIONS['platform_administrator']`, keyed on
-- `TenantContext.activeRole`, which is still the membership `role_name`. So:
--
--   · REVOKING A GRANT DOES NOT YET REVOKE API AUTHORITY. RLS will refuse the
--     rows, but any endpoint whose application check IS the enforcement — see
--     `security.controller.ts`, which reads `pg_catalog` and says so — still
--     admits a `platform_administrator` membership holding no grant.
--   · `TenantContext` carries no grant state, and `/me` reports permissions
--     from the role alone.
--
-- Found by Codex reviewing this migration, and MISSED by my own security pass,
-- which verified the database end to end and never traced the API. Closing it
-- means resolving grant status during context construction and gating
-- `platform.admin` on it — a change to every platform-admin endpoint, and a
-- slice of its own rather than a postscript to this one.
--
-- Until that lands, treat this as defence in depth that removed a text column
-- from the RLS trust chain, NOT as the whole control.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- The seeding escape, per the standing rule. Asserted live below rather than
-- assumed: migration 073's orphan check read 6 rows as the owner and 0 as the
-- Render role, and reported success either way.
SELECT set_config('app.current_role', 'admin', true);

DO $$
BEGIN
  IF NOT identity.is_platform_admin() THEN
    RAISE EXCEPTION
      'the admin escape is NOT live — this migration would run under RLS as an '
      'ordinary role and its backfill would silently write nothing';
  END IF;
END
$$;

-- ── The record itself ───────────────────────────────────────────────────────
--
-- ⚠️ NO `tenant_id`, AND THAT IS THE POINT. Every other table in this database
-- carries one because it belongs to a tenant. This one records authority OVER
-- all tenants; giving it a tenant would recreate the exact falsehood being
-- removed. It is therefore NOT a tenant-owned table and the §6 tenant baseline
-- does not apply to it — stated explicitly so a later audit does not "fix" it.
CREATE TABLE identity.platform_administrators (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  granted_by      uuid REFERENCES identity.users(id),
  -- ⚠️ `granted_by` IS NOT ENOUGH AND IS NOT REQUIRED. Conferring platform
  -- authority is an out-of-band operation run by a workflow or by hand, and the
  -- operator frequently has no row in `identity.users` to point at. A nullable
  -- FK would therefore record nothing in exactly the case that matters, so the
  -- accountable identity is a REQUIRED free-text actor instead: a GitHub actor
  -- and run id, or the migration that wrote it. Codex, this diff.
  granted_actor   text NOT NULL,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  granted_reason  text NOT NULL,
  revoked_by      uuid REFERENCES identity.users(id),
  revoked_actor   text,
  revoked_at      timestamptz,
  revoked_reason  text,

  -- A revocation is all three fields or none. A half-written revocation would
  -- read as "still active" on the `revoked_at IS NULL` test below, which is the
  -- test every RLS policy in this database ends up depending on.
  CONSTRAINT platform_admin_revocation_is_complete CHECK (
    (revoked_at IS NULL     AND revoked_reason IS NULL AND revoked_actor IS NULL)
 OR (revoked_at IS NOT NULL AND btrim(revoked_reason) <> '' AND btrim(revoked_actor) <> '')
  ),
  CONSTRAINT platform_admin_reason_not_blank
    CHECK (btrim(granted_reason) <> '' AND btrim(granted_actor) <> '')
);

COMMENT ON TABLE identity.platform_administrators IS
  'Platform-wide administrative authority. Deliberately NOT tenant-scoped: it '
  'records authority over all tenants. Append-only — see the trigger below.';

-- At most ONE active grant per user. Partial, so a user may be granted, revoked
-- and granted again, leaving the full history in place.
CREATE UNIQUE INDEX platform_administrators_one_active
  ON identity.platform_administrators (user_id)
  WHERE revoked_at IS NULL;

-- ── Append-only, enforced rather than asserted in prose ─────────────────────
--
-- CLAUDE.md: "Approvals, payments, warranty decisions and audit events are
-- append-only." This is an authority ledger and belongs in that set. The only
-- legal mutation is a one-way transition from active to revoked; everything
-- else — including re-revoking with a different reason, and DELETE — is refused
-- by the database rather than by a convention nobody re-reads.
CREATE OR REPLACE FUNCTION identity.platform_administrators_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'identity.platform_administrators is append-only; revoke instead of deleting';
  END IF;

  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'this grant was already revoked at %; grant a new row instead of editing history',
      OLD.revoked_at;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.granted_by IS DISTINCT FROM OLD.granted_by
     OR NEW.granted_actor IS DISTINCT FROM OLD.granted_actor
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
     OR NEW.granted_reason IS DISTINCT FROM OLD.granted_reason THEN
    RAISE EXCEPTION 'only the revocation columns may be written after a grant exists';
  END IF;

  -- 🔴 THE ONLY LEGAL UPDATE IS A COMPLETED REVOCATION — asserted here, not
  -- merely claimed in the header. Codex found that the earlier version allowed
  -- an UPDATE that touched `revoked_by` while leaving `revoked_at` null: an
  -- edit to a live authority row that revoked nothing and left no trace, on a
  -- ledger this file calls append-only.
  IF NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'the only permitted update to an active grant is a completed revocation '
                    '(revoked_at, revoked_reason and revoked_actor together)';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER platform_administrators_append_only
  BEFORE UPDATE OR DELETE ON identity.platform_administrators
  FOR EACH ROW EXECUTE FUNCTION identity.platform_administrators_append_only();

-- ── RLS, written to avoid recursing through the function that reads it ──────
--
-- 🔴 THE TRAP THIS AVOIDS. `is_platform_admin()` is called inside the RLS
-- policies of nearly every table here. It is about to SELECT from THIS table.
-- If this table's own policy called `is_platform_admin()` — the obvious,
-- house-style thing to write — evaluating any policy anywhere would re-enter
-- the function, which would query this table, which would evaluate this policy.
-- Infinite recursion, at the first SELECT after deploy.
--
-- So these policies deliberately use ONLY the primitive settings accessors and
-- never the derived predicate. A future edit adding `is_platform_admin()` here
-- would deadlock the database; verify/077 asserts it stays absent.
ALTER TABLE identity.platform_administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.platform_administrators FORCE ROW LEVEL SECURITY;

-- A user may see their OWN grant — which is all `is_platform_admin()` needs,
-- because it only ever asks about the current user.
CREATE POLICY platform_administrators_self_read
  ON identity.platform_administrators
  FOR SELECT
  USING (user_id = identity.current_user_id()
      OR identity.current_role_name() = 'admin');

-- Writing is the seed/operator path only. There is deliberately no application
-- write path: conferring platform authority is an out-of-band operation with a
-- workflow behind it, not an API call. If that ever changes it needs its own
-- migration, its own service and its own review.
CREATE POLICY platform_administrators_admin_write
  ON identity.platform_administrators
  FOR ALL
  USING (identity.current_role_name() = 'admin')
  WITH CHECK (identity.current_role_name() = 'admin');

GRANT SELECT ON identity.platform_administrators TO autoworkshop_app;

-- ── Backfill BEFORE the predicate changes ──────────────────────────────────
--
-- 🔴 ORDER MATTERS AND GETTING IT WRONG LOCKS THE OWNER OUT. The moment
-- `is_platform_admin()` stops honouring the membership role name, anyone whose
-- authority came from one has none. In production that is the owner's own
-- account. So every existing active `platform_administrator` membership becomes
-- a grant first, in the same transaction.
INSERT INTO identity.platform_administrators (user_id, granted_at, granted_actor, granted_reason)
SELECT m.user_id,
       min(m.created_at),
       'migration 077',
       'backfilled from an existing active platform_administrator membership'
  FROM identity.memberships m
 WHERE m.role_name = 'platform_administrator'
   AND m.status = 'active'
 GROUP BY m.user_id
ON CONFLICT DO NOTHING;

-- ── The predicate itself ───────────────────────────────────────────────────
--
-- `'admin'` REMAINS, and is not the same kind of thing as the name being
-- removed. It is the seed/psql/migration escape — it cannot arrive from a
-- membership row, because `resolveTenantContext` only ever writes a real
-- `role_name` into `app.current_role`, and `admin` is not a grantable role. It
-- is set by `set_config` inside migrations and seed scripts, i.e. by whoever
-- already holds the database credential.
--
-- `'platform_administrator'` is REMOVED. That string is a membership role name,
-- and a membership role name is exactly what must stop conferring this.
CREATE OR REPLACE FUNCTION identity.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT (
           -- 🔴 THE SEED ESCAPE NOW REQUIRES A REAL DATABASE PRINCIPAL, NOT
           -- ONLY A SETTING. `app.current_role` is a custom GUC and ANY role
           -- can write it, including `autoworkshop_app` — so on the first
           -- version of this migration a single injected
           -- `set_config('app.current_role','admin',true)` restored platform
           -- authority over every table, through the very function written to
           -- stop that. The grant table was irrelevant: the escape bypassed it.
           -- Codex found this and was right; my own security pass missed it by
           -- reasoning about who may WRITE the grant table rather than about
           -- who may skip reading it.
           --
           -- `current_user` is not settable by SQL the attacker controls, so
           -- pairing the two means the escape belongs to whoever holds the
           -- OWNER credential — migrations, seeds and hand-run psql — and to
           -- nobody reachable from the application connection.
           identity.current_role_name() = 'admin'
           AND current_user = (SELECT pg_get_userbyid(relowner)
                                 FROM pg_class
                                WHERE oid = 'identity.platform_administrators'::regclass)
         )
      OR EXISTS (
           SELECT 1
             FROM identity.platform_administrators pa
            WHERE pa.user_id = identity.current_user_id()
              AND pa.revoked_at IS NULL);
$$;

COMMENT ON FUNCTION identity.is_platform_admin() IS
  'True for a user holding an un-revoked row in identity.platform_administrators, '
  'or for the seed/psql escape — which requires BOTH app.current_role = admin AND '
  'the caller to be the owner of that table, because app.current_role is a GUC any '
  'role can set and the application role could otherwise grant itself everything. '
  'Migration 077 removed the membership role name platform_administrator from this '
  'test: authority is a grant record, never a text column on a row inside one '
  'organisation. NOTE: the API still derives platform.admin from the membership '
  'role, so revoking a grant does not yet revoke API authority — see the header.';

-- ── Prove the backfill actually landed ────────────────────────────────────
--
-- ⚠️ THIS RUNS AS THE OWNER, like the rest of the migration, and an earlier
-- version of this comment claimed otherwise (Codex). That is fine HERE — the
-- question is whether rows exist, not who may see them — but the distinction
-- matters enough elsewhere in this repo that a false claim about it is worth
-- removing. The privilege-shape assertions live in verify/077, which really
-- does switch role.
DO $$
DECLARE
  v_memberships int;
  v_grants      int;
BEGIN
  SELECT count(DISTINCT user_id) INTO v_memberships
    FROM identity.memberships
   WHERE role_name = 'platform_administrator' AND status = 'active';

  SELECT count(*) INTO v_grants
    FROM identity.platform_administrators
   WHERE revoked_at IS NULL;

  -- ⚠️ PER USER, NOT A COUNT. Comparing totals lets an UNRELATED active grant
  -- mask a missing one — the check would pass while a real administrator was
  -- locked out. Codex, this diff.
  IF EXISTS (
      SELECT 1
        FROM identity.memberships m
       WHERE m.role_name = 'platform_administrator'
         AND m.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM identity.platform_administrators pa
                          WHERE pa.user_id = m.user_id AND pa.revoked_at IS NULL)) THEN
    RAISE EXCEPTION
      'backfill incomplete: at least one active platform_administrator membership has no active '
      'grant, so that administrator has just lost every authority they had';
  END IF;

  RAISE NOTICE '077: % active platform administrator grant(s) now recorded', v_grants;
END
$$;

COMMIT;
