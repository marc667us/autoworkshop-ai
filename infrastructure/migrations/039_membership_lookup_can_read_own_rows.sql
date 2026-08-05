-- 039 — the membership LOOKUP can read the rows it exists to find
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE DEFECT, MEASURED ON PRODUCTION 2026-08-05
-- ══════════════════════════════════════════════════════════════════════════
--
-- With 037 + 038 applied, registration WORKS: a workshop was created through
-- the real form, and a second submit is correctly refused with "this account
-- already belongs to an organisation". That refusal is a SELECT on
-- identity.memberships inside register_workshop, so the row demonstrably
-- exists.
--
-- And yet a fresh session for the same account showed the onboarding form, an
-- org chip reading "No workshop yet", and zero KPI tiles. The application did
-- not believe the workshop it had just created existed.
--
-- `Diagnose identity RLS` (run 30963160097) measured why:
--
--   connected role            autoworkshop | superuser=f | bypassrls=f
--   identity.users            rls=f  forced=f          <- NOT the problem
--   identity.memberships      rls=t  forced=t
--   policies on memberships   tenant_isolation      ALL     tenant_id = current_tenant_id()
--                             registration_bootstrap_insert INSERT
--                             registration_bootstrap_select SELECT  in_registration_bootstrap()
--
--   SELECT count(*) FROM identity.memberships_for_subject(<subject>)  ->  1
--
-- One row — and its membership columns are NULL.
--
-- ── WHY, EXACTLY ──────────────────────────────────────────────────────────
--
-- `memberships_for_subject` is SECURITY DEFINER, and everyone reading it
-- assumed that made it exempt. It does not: its owner is `autoworkshop`, which
-- on Render is NOT a superuser (`rolsuper=f`, `rolbypassrls=f`), and
-- identity.memberships is FORCE ROW LEVEL SECURITY — which binds the table
-- OWNER as well. So inside the definer, every policy still applies:
--
--   tenant_isolation              needs a tenant context, and this query is
--                                 what ESTABLISHES the tenant context
--   registration_bootstrap_select needs app.bootstrap, only set inside
--                                 register_workshop
--
-- Neither holds during a normal `/me`, so every membership row is filtered out.
--
-- 🔴 AND THE FUNCTION USES A **LEFT** JOIN:
--
--       FROM identity.users u
--       LEFT JOIN identity.memberships m ON m.user_id = u.id
--
-- so the user row survives with NULL membership columns, and
-- `membership.repository.ts` then does exactly what it should with that:
--
--       rows.filter((r) => r.tenant_id !== null)   ->  []
--       hasWorkshop: active.length > 0             ->  false
--
-- ⚠️ THE LEFT JOIN TURNS "REFUSED BY RLS" INTO "HAS NO MEMBERSHIP", and those
-- two are not the same statement. One is a permissions fault; the other is a
-- fact about the user. The application cannot tell them apart, so it reported
-- the second — confidently, and wrongly, to somebody who had just created a
-- workshop. This is the same shape as the recorded lesson "a truth about A used
-- as evidence for B".
--
-- ⚠️ AND IT IS A PRODUCTION-ONLY DEFECT. Locally `autoworkshop` IS a superuser
-- and bypasses RLS entirely, so the LEFT JOIN finds the memberships and every
-- test passes. Second time this exact asymmetry has bitten: 037 was the first.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE FIX
-- ══════════════════════════════════════════════════════════════════════════
--
-- Give the lookup the same shape 037/038 gave registration: a narrow,
-- transaction-local door that ONLY this function can open, pinned to the one
-- subject being resolved.
--
-- 1. `identity.in_membership_lookup()` — true when the flag is set AND the
--    effective user is the owner of `memberships_for_subject`. NOT security
--    definer, for the reason 038 documents at length: as a definer it would
--    always see its own owner and return true for everybody, restoring the hole.
--
-- 2. A SELECT policy on identity.memberships admitting only rows whose
--    `user_id` matches the subject currently being looked up.
--
-- 3. `memberships_for_subject` becomes plpgsql so it can open the door, read,
--    and CLOSE IT AGAIN before returning. A `LANGUAGE sql` function cannot
--    `SET LOCAL`, which is why it could not do this before.
--
-- ⚠️ WHY NOT SIMPLY `ALTER ROLE autoworkshop BYPASSRLS`? Because that would
-- exempt the owner from every policy on every table, which is precisely the
-- state that let this defect hide locally. The whole point of FORCE here is
-- that production and development behave alike.
--
-- ⚠️ WHY NOT WIDEN `tenant_isolation`? It is the tenant-isolation policy — the
-- Severity-1 control of this product (CLAUDE.md §5). It stays exactly as it is.
-- This adds a separate, narrower policy that cannot see across users at all.
--
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. the old signature has to go first ────────────────────────────────────
--
-- `CREATE OR REPLACE FUNCTION` cannot add a column to a `RETURNS TABLE`:
--     ERROR: cannot change return type of existing function
--     DETAIL: Row type defined by OUT parameters is different.
-- So it is dropped and rebuilt. The GRANT is re-issued at the bottom, because a
-- dropped function takes its privileges with it — forgetting that would leave
-- `autoworkshop_app` unable to execute the one function every request needs, and
-- the failure would look like a broken login rather than a missing grant.
--
-- Ordered before `in_membership_lookup`, which names this function via
-- `::regprocedure`: build the thing that is referred to before the thing that
-- refers to it.

DROP FUNCTION IF EXISTS identity.memberships_for_subject(TEXT);

-- ── 1. the lookup, with display_name and the door it opens ─────────────────

CREATE OR REPLACE FUNCTION identity.memberships_for_subject(p_subject TEXT)
RETURNS TABLE (
    user_id         uuid,
    tenant_id       uuid,
    organization_id uuid,
    branch_id       uuid,
    role_name       TEXT,
    status          TEXT,
    -- ⚠️ NEW COLUMN, AND IT REMOVES A JOIN FROM THE CALLER.
    -- `membership.repository.ts` joined identity.users back on afterwards to
    -- get this, with a comment saying it "costs nothing" because the function
    -- already joins that table. The join was harmless only because
    -- identity.users happens to have no RLS; returning the value directly means
    -- the caller no longer reaches into an identity table at all, so this stops
    -- depending on that happening to stay true.
    display_name    TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
-- Pinned so a caller-controlled search_path cannot resolve these tables
-- elsewhere. pg_temp last, and only because Postgres always searches it.
SET search_path = identity, pg_catalog, pg_temp
AS $$
BEGIN
    -- Refuse an empty subject rather than opening the door with a flag that
    -- matches no user. The policy would find nothing, but a blank flag is still
    -- an open door and there is no reason to have one.
    IF p_subject IS NULL OR btrim(p_subject) = '' THEN
        RETURN;
    END IF;

    -- `true` = transaction-local. It cannot outlive this statement's
    -- transaction even if the reset below were somehow skipped.
    PERFORM set_config('app.membership_lookup', p_subject, true);

    RETURN QUERY
        SELECT u.id,
               m.tenant_id,
               m.organization_id,
               m.branch_id,
               m.role_name,
               m.status,
               u.display_name
          FROM identity.users u
     LEFT JOIN identity.memberships m ON m.user_id = u.id
         WHERE u.keycloak_subject = p_subject
           AND u.status = 'active';

    -- ⚠️ SHUT BEFORE RETURNING, exactly as register_workshop does. The caller
    -- continues in the same transaction, and a door left open is one the next
    -- statement can walk through.
    PERFORM set_config('app.membership_lookup', '', true);
END;
$$;

COMMENT ON FUNCTION identity.memberships_for_subject(TEXT) IS
'Bootstrap lookup: resolves a validated Keycloak subject to its own memberships. '
'SECURITY DEFINER is NOT sufficient on its own -- the owner is not a superuser in '
'production and identity.memberships is FORCE RLS, which binds owners too. It '
'therefore opens a transaction-local door (039) pinned to this one subject, reads, '
'and closes it. Accepts only a subject taken from a signature-validated token.';

REVOKE ALL ON FUNCTION identity.memberships_for_subject(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.memberships_for_subject(TEXT) TO autoworkshop_app;

-- ── 2. the gate ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION identity.in_membership_lookup()
RETURNS boolean
LANGUAGE sql
STABLE
-- NOT SECURITY DEFINER, deliberately — see 038. It must observe the CALLER's
-- effective user; as a definer it would always see its own owner and return
-- true for every caller, which is the hole rather than the fix.
SET search_path = identity, pg_catalog, pg_temp
AS $$
  SELECT current_setting('app.membership_lookup', true) IS NOT NULL
     AND current_setting('app.membership_lookup', true) <> ''
     AND current_user = (
           SELECT r.rolname
             FROM pg_proc p
             JOIN pg_roles r ON r.oid = p.proowner
            WHERE p.oid = 'identity.memberships_for_subject(text)'::regprocedure
         );
$$;

COMMENT ON FUNCTION identity.in_membership_lookup() IS
'TRUE only inside identity.memberships_for_subject: the app.membership_lookup '
'flag is set AND the effective user is that function''s owner. set_config is not '
'privileged, so the flag alone is settable by any caller -- the owner check is '
'the half that cannot be forged from an application connection (lesson of 038).';

REVOKE ALL ON FUNCTION identity.in_membership_lookup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.in_membership_lookup() TO autoworkshop_app;

-- ── 3. the policy ───────────────────────────────────────────────────────────
--
-- SELECT only. It grants no INSERT, UPDATE or DELETE, and it cannot reach a row
-- belonging to anybody other than the subject being resolved: `user_id` is
-- pinned to the flag, and the flag holds a subject taken from a
-- signature-validated token.

DROP POLICY IF EXISTS membership_lookup_select ON identity.memberships;
CREATE POLICY membership_lookup_select ON identity.memberships
    FOR SELECT
    USING (
        identity.in_membership_lookup()
        AND user_id = (
              SELECT u.id
                FROM identity.users u
               WHERE u.keycloak_subject = current_setting('app.membership_lookup', true)
            )
    );


COMMIT;
