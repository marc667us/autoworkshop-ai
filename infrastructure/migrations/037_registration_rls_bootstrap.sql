-- ============================================================================
-- 037 — REGISTRATION UNDER ROW-LEVEL SECURITY, AS THE APPLICATION ROLE
--
-- ── THE DEFECT THIS FIXES ───────────────────────────────────────────────────
--
--   Render log : new row violates row-level security policy for table "tenants"
--
-- `identity.register_workshop` (migration 036) is SECURITY DEFINER and owned by
-- the `autoworkshop` database user. LOCALLY that user is a SUPERUSER, and a
-- superuser bypasses row-level security entirely — so all four INSERTs sailed
-- through and `verify/036` reported 9 of 9. ON RENDER the same user is merely
-- the table OWNER, and migration 001 applied `FORCE ROW LEVEL SECURITY`, which
-- exists precisely so that owners are NOT exempt. The first INSERT is refused.
--
-- The function is byte-identical in both places. **The ROLE is not.** This is
-- why anything touching RLS is rehearsed ON LIVE, as the app role, and never
-- believed on the strength of a local pass.
--
-- ── THE SECOND DEFECT, FOUND WHILE FIXING THE FIRST ─────────────────────────
--
-- 🔴 THE DUPLICATE-REGISTRATION GUARD HAS NEVER RUN IN PRODUCTION EITHER.
--
--     IF EXISTS (SELECT 1 FROM identity.memberships
--                 WHERE user_id = v_user AND status = 'active') THEN
--         RAISE EXCEPTION 'this account already belongs to an organisation';
--     END IF;
--
-- That is a SELECT against a FORCE-RLS table with NO tenant context. Its policy
-- evaluates `tenant_id = NULL` for every row, so the query returns ZERO ROWS —
-- always, for everybody. The guard cannot fire. It has been reading as a safety
-- net while being incapable of catching anything, which is the failure shape
-- this repo has now paid for repeatedly: a check that walks through its own gap
-- and reports success. Locally, again, superuser made it look correct.
--
-- Left alone, the moment the INSERT fix lands a user could register a SECOND
-- workshop by double-submitting the form, and nothing in any screen would
-- reveal the duplicate. So the fix below opens the read as well as the write —
-- if it opened only the write it would ship a working duplicate bug.
--
-- ── THE SHAPE OF THE FIX ────────────────────────────────────────────────────
--
-- A controlled bypass, scoped to this one function, visible in the catalogue as
-- named policies rather than hidden in a role attribute:
--
--   1. `register_workshop` sets two transaction-local GUCs before it touches a
--      tenant-owned table: `app.bootstrap = 'on'` and `app.bootstrap_user` =
--      the id of the user being registered. It CLEARS them again before it
--      returns.
--   2. This migration adds one permissive policy per table, admitting a row
--      ONLY when the flag is on AND the row is attributed to that same user.
--
-- ⚠️ The bypass is NOT "ignore RLS while the flag is set". Every policy below
-- also pins `created_by` (or `user_id`) to `app.bootstrap_user`, so even with
-- the flag forced on, the door can only create rows belonging to the one person
-- registering. It cannot read or write anybody else's tenant.
--
-- ⚠️ FAIL-CLOSED IN BOTH DIRECTIONS, deliberately:
--   · `current_setting(..., true)` returns NULL when unset. `NULL = 'on'` is
--     NULL, which is not TRUE, so the policy refuses. An unset flag is a
--     closed door, not an open one.
--   · The user comparison is made on TEXT, not uuid. A junk value in
--     `app.bootstrap_user` therefore fails to match rather than RAISEing a
--     cast error — no remote input can turn this into a 500.
--
-- ⚠️ REJECTED ALTERNATIVE: a `BYPASSRLS` role owning the function. It needs
-- privileges Render's user probably lacks, and it would move the exemption from
-- a policy anyone can read in `pg_policies` into a role attribute nobody looks
-- at. The existing tenant_isolation policies are NOT weakened here.
--
-- ── WHY THE INSERTS NO LONGER USE `RETURNING` ───────────────────────────────
--
-- `INSERT ... RETURNING id` reads the row back, which brings the SELECT policy
-- into play on top of the INSERT one. Rather than widen SELECT on four tables
-- to satisfy a convenience, the function now generates each id up front with
-- `gen_random_uuid()` and inserts it explicitly. Same values, no read required,
-- one less policy interaction to reason about. (`RETURNING id, never lastrowid`
-- in CLAUDE.md is a rule about not using a driver's row-id side channel; it is
-- not a requirement to read back a key we already hold.)
-- ============================================================================

BEGIN;

-- ── 1. the bootstrap policies ───────────────────────────────────────────────
-- Permissive, so each is OR'd with the existing `tenant_isolation` policy
-- rather than replacing it. FOR INSERT only, except on memberships, which also
-- needs the narrow SELECT the duplicate guard depends on.

DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.tenants;
CREATE POLICY registration_bootstrap_insert ON identity.tenants
    FOR INSERT
    WITH CHECK (
        current_setting('app.bootstrap', true) = 'on'
        AND created_by::text = current_setting('app.bootstrap_user', true)
    );

DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.organizations;
CREATE POLICY registration_bootstrap_insert ON identity.organizations
    FOR INSERT
    WITH CHECK (
        current_setting('app.bootstrap', true) = 'on'
        AND created_by::text = current_setting('app.bootstrap_user', true)
    );

DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.branches;
CREATE POLICY registration_bootstrap_insert ON identity.branches
    FOR INSERT
    WITH CHECK (
        current_setting('app.bootstrap', true) = 'on'
        AND created_by::text = current_setting('app.bootstrap_user', true)
    );

-- The membership row is the one that grants the caller their own access, so it
-- is pinned on BOTH columns: the row must be created by the registering user
-- AND be about the registering user. `created_by` alone would let a future
-- caller of this door mint a membership for somebody else.
DROP POLICY IF EXISTS registration_bootstrap_insert ON identity.memberships;
CREATE POLICY registration_bootstrap_insert ON identity.memberships
    FOR INSERT
    WITH CHECK (
        current_setting('app.bootstrap', true) = 'on'
        AND created_by::text = current_setting('app.bootstrap_user', true)
        AND user_id::text   = current_setting('app.bootstrap_user', true)
    );

-- 🔴 THIS ONE IS WHAT MAKES THE DUPLICATE GUARD REAL.
-- Without it the guard reads zero rows forever and one person can own several
-- workshops. It exposes a single person's OWN membership rows, and only while
-- the flag is on — it is not a general read of the table.
DROP POLICY IF EXISTS registration_bootstrap_select ON identity.memberships;
CREATE POLICY registration_bootstrap_select ON identity.memberships
    FOR SELECT
    USING (
        current_setting('app.bootstrap', true) = 'on'
        AND user_id::text = current_setting('app.bootstrap_user', true)
    );

COMMENT ON POLICY registration_bootstrap_insert ON identity.tenants IS
'Sign-up only. Admits an INSERT while identity.register_workshop holds '
'app.bootstrap=on, and only for a row attributed to app.bootstrap_user. '
'Registration is the one operation that legitimately has no tenant context — '
'it is what CREATES the tenant a context is later made from.';

COMMENT ON POLICY registration_bootstrap_select ON identity.memberships IS
'Lets identity.register_workshop see whether the registering user ALREADY '
'belongs to an organisation. Under FORCE RLS with no tenant context that check '
'returned zero rows for everyone, so the one-workshop-per-person rule could '
'never fire. Scoped to that single user, and only while app.bootstrap=on.';

-- ── 2. the function, taught to open and close the door ──────────────────────

CREATE OR REPLACE FUNCTION identity.register_workshop(
    p_subject       TEXT,
    p_workshop_name TEXT,
    p_branch_name   TEXT
)
RETURNS TABLE (
    tenant_id       uuid,
    organization_id uuid,
    branch_id       uuid,
    membership_id   uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, pg_catalog, pg_temp
AS $$
DECLARE
    v_user   uuid;
    v_tenant uuid;
    v_org    uuid;
    v_branch uuid;
    v_member uuid;
    v_slug   TEXT;
BEGIN
    IF p_workshop_name IS NULL OR btrim(p_workshop_name) = '' THEN
        RAISE EXCEPTION 'a workshop needs a name';
    END IF;

    -- The caller is resolved from the SUBJECT, never passed in as a user id.
    -- A user id parameter would let any caller register a workshop in somebody
    -- else's name, which is the confused-deputy shape `1.txt` §9 forbids.
    -- `identity.users` is not tenant-scoped, so this read needs no bypass.
    SELECT id INTO v_user
      FROM identity.users
     WHERE keycloak_subject = p_subject
       AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no active application user for this identity';
    END IF;

    -- ── the door opens here, and only here ─────────────────────────────────
    -- Both settings are transaction-local (`is_local => true`), so a connection
    -- returned to the pool cannot carry them to the next request even if this
    -- function were to abort. They are cleared explicitly below as well,
    -- because the SUCCESS path leaves the caller's transaction open and the
    -- flag must not still be set when control returns to the service.
    PERFORM set_config('app.bootstrap',      'on',          true);
    PERFORM set_config('app.bootstrap_user', v_user::text,  true);

    -- ⚠️ ONE WORKSHOP PER PERSON, and this check only became CAPABLE of firing
    -- in migration 037: under FORCE RLS with no tenant context it read zero
    -- rows for everybody. It sits AFTER the flag is set for that reason.
    -- A retried request — a double-submitted form, a client that resends on a
    -- slow response — would otherwise create a SECOND tenant with the same
    -- owner, and there is no UI anywhere that would reveal the duplicate.
    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        RAISE EXCEPTION 'this account already belongs to an organisation';
    END IF;

    -- A readable, unique slug. `identity.tenants.slug` is NOT NULL and unique;
    -- deriving it from the name alone would collide on the second "Auto Fix".
    v_slug := regexp_replace(lower(btrim(p_workshop_name)), '[^a-z0-9]+', '-', 'g');
    v_slug := btrim(v_slug, '-');
    IF v_slug = '' THEN
        v_slug := 'workshop';
    END IF;
    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    -- Ids are generated here rather than read back with RETURNING — see the
    -- header. Same uuid source the column defaults use.
    v_tenant := gen_random_uuid();
    v_org    := gen_random_uuid();
    v_branch := gen_random_uuid();
    v_member := gen_random_uuid();

    INSERT INTO identity.tenants (id, name, slug, status, created_by)
    VALUES (v_tenant, btrim(p_workshop_name), v_slug, 'active', v_user);

    -- ⚠️ `individual_workshop`, NOT `workshop`. `organizations_org_type_check`
    -- (migration 001) admits ten specific values and `workshop` is not one of
    -- them — the first run of this function died on that constraint. A new
    -- registration starts as a single workshop; `multi_branch_workshop` is what
    -- it becomes when a second branch is added, which is a later decision and
    -- not one to guess at sign-up.
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
    VALUES (v_org, v_tenant, btrim(p_workshop_name), 'individual_workshop', 'active', v_user);

    -- Every workshop gets one branch immediately. `resolveTenantContext` copes
    -- with a NULL branch, but the screens read better with a real one, and a
    -- workshop with nowhere to do the work is not a state worth representing.
    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
    VALUES (v_branch, v_tenant, v_org,
            COALESCE(NULLIF(btrim(p_branch_name), ''), 'Main branch'),
            'active', v_user);

    -- `workshop_owner`, spelled exactly as `permission-matrix.ts` and
    -- `viewer-contract.ts`'s ROLE_TO_NAV expect. A role name that is merely
    -- plausible resolves to no navigation tree and no permissions, and the user
    -- lands in a workshop they can see nothing in.
    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'workshop_owner', 'active', v_user);

    -- ── and the door closes ────────────────────────────────────────────────
    -- The caller's transaction continues after this function returns. Leaving
    -- the flag set would hand the rest of that transaction a bypass it was
    -- never meant to have — a bypass whose blast radius is small (it is pinned
    -- to this user) but which would still be an exemption nobody asked for.
    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

COMMENT ON FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) IS
'Registration: creates tenant + organisation + branch + owner membership for the '
'caller, atomically. The ONLY function that grants a membership to its own caller, '
'and safe only because the tenant did not exist a moment earlier: it accepts no '
'tenant id and refuses a caller who already belongs to one. Adding a person to an '
'EXISTING organisation is MembershipService.grant(), which requires an admin. '
'Opens a narrow RLS bootstrap door (app.bootstrap / app.bootstrap_user, both '
'transaction-local) because it runs as a NON-superuser owner on production, where '
'FORCE ROW LEVEL SECURITY applies to owners too. Closes it before returning.';

REVOKE ALL ON FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) TO autoworkshop_app;

COMMIT;
