-- 076 — `register_fleet` joins the registration lock it was left out of.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 THE DEFECT, FOUND BY CODEX REVIEWING THE ROUTE THAT CALLS THIS FUNCTION.
--
-- Migration 075 created `identity.register_fleet` with an unlocked
-- `IF EXISTS (... memberships WHERE user_id = v_user ...)` guard before creating
-- the tenant. Two concurrent submissions by the same person can BOTH observe no
-- membership and each go on to create a separate tenant, organisation, branch,
-- membership and verification record. The one-organisation rule is then broken
-- for that account, permanently, with no constraint able to notice: the unique
-- key is `(organization_id, user_id, role_name)` and each request invented a
-- DIFFERENT organisation.
--
-- 🔴 AND IT IS WORSE ACROSS KINDS. Migrations 071 and 072 fixed exactly this for
-- `register_workshop` and `register_supplier` by taking
--
--     pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user, 0))
--
-- immediately after resolving the user. That lock is what serialises one
-- IDENTITY's registrations. A function that does not take it does not merely
-- race itself — it races the other two, because they are only serialised
-- against callers holding the same lock. So "register a workshop" and "register
-- a fleet" submitted together could both succeed, and the person ends up owning
-- two organisations through a rule both functions claim to enforce.
--
-- ⚠️ AND THE CODE SAID OTHERWISE. `MembershipRepository.registerFleet` and the
-- controller both carried a comment claiming "already belongs to an
-- organisation is enforced in the database so a double-submitted form cannot
-- race two tenants into existence". That sentence was true of the workshop and
-- supplier functions it was copied from and false of this one. A comment that
-- claims a guarantee which does not exist is worse than no comment: it is the
-- reason nobody checks. Both are corrected in the same commit as this file.
--
-- ⚠️ A NEW MIGRATION, NOT AN EDIT TO 075. 075 is applied to production. Editing
-- an applied migration changes nothing on a deployed database and leaves the
-- file and the live schema silently disagreeing — the drift this project's
-- "no CREATE TABLE IF NOT EXISTS" rule exists to prevent.
--
-- 🔴 CREATE OR REPLACE MUST RESTATE THE FUNCTION IN FULL. There is no partial
-- form. Everything below is 075's body verbatim except the single PERFORM added
-- after the user is resolved — deliberately so this file can be diffed against
-- 075 and the change seen to be one line.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION identity.register_fleet(
    p_subject       TEXT,
    p_fleet_name    TEXT,
    p_location_name TEXT
)
RETURNS TABLE (
    o_tenant_id       uuid,
    o_organization_id uuid,
    o_branch_id       uuid,
    o_membership_id   uuid
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
    IF p_fleet_name IS NULL OR btrim(p_fleet_name) = '' THEN
        RAISE EXCEPTION 'a fleet needs a name';
    END IF;

    -- The caller, from the validated token subject. `identity.users` is not
    -- tenant-scoped, so this read needs no bypass.
    SELECT id INTO v_user
      FROM identity.users
     WHERE keycloak_subject = p_subject
       AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no active application user for this identity';
    END IF;

    -- ── THE ONE LINE THIS MIGRATION EXISTS FOR ─────────────────────────────
    -- Serialise this identity's registrations before reading. Identical key to
    -- 071/072 so all three registration functions queue behind ONE lock per
    -- person: a different key here would serialise fleet against fleet and
    -- still let a fleet race a workshop.
    --
    -- `_xact_` — released when the transaction ends, including on the
    -- exception paths below, so no code path can leak it and block that account
    -- from ever registering again.
    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));

    -- ── the door opens here, and only here ─────────────────────────────────
    -- Transaction-local, so a pooled connection cannot carry the flag into the
    -- next request even on an abort. Cleared explicitly as well, because the
    -- SUCCESS path leaves the caller's transaction open.
    PERFORM set_config('app.bootstrap',      'on',         true);
    PERFORM set_config('app.bootstrap_user', v_user::text, true);

    -- One organisation per person. AFTER the flag is set: under FORCE RLS with
    -- no tenant context this read returns zero rows for everybody, so placing
    -- it earlier would make it a check that cannot fire — the bug migration 037
    -- fixed in `register_workshop`. And after the LOCK, which is what makes the
    -- read meaningful when two requests arrive together.
    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        -- ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. A rule with no way past
        -- it is a wall, and the person in front of it files a bug rather than
        -- acting.
        --
        -- 🔴 AND THE WORDING IS A CONTRACT. `RegistrationController.registerFleet`
        -- matches on the substring "already belongs to an organisation" to turn
        -- this into a 409 instead of a 500. Rewording it here reintroduces the
        -- defect where a double-submitted form told the user "Internal server
        -- error" for a guard that had worked perfectly.
        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a fleet, or ask a platform administrator to add you to an existing fleet.';
    END IF;

    -- A readable, unique slug — `identity.tenants.slug` is NOT NULL and unique,
    -- so deriving it from the name alone collides on the second "City Haulage".
    v_slug := regexp_replace(lower(btrim(p_fleet_name)), '[^a-z0-9]+', '-', 'g');
    v_slug := btrim(v_slug, '-');
    IF v_slug = '' THEN
        v_slug := 'fleet';
    END IF;
    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    v_tenant := gen_random_uuid();
    v_org    := gen_random_uuid();
    v_branch := gen_random_uuid();
    v_member := gen_random_uuid();

    INSERT INTO identity.tenants (id, name, slug, status, created_by)
    VALUES (v_tenant, btrim(p_fleet_name), v_slug, 'active', v_user);

    -- 🔴 LITERAL 1 of 2: `fleet_operator`, one of the ten values
    -- `organizations_org_type_check` admits. Not `fleet`, which is plausible
    -- and absent; `register_workshop` died on exactly that mistake.
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
    VALUES (v_org, v_tenant, btrim(p_fleet_name), 'fleet_operator', 'active', v_user);

    -- A depot immediately. `resolveTenantContext` copes with a NULL branch, but
    -- a fleet with nowhere to keep vehicles is not a state worth representing.
    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
    VALUES (v_branch, v_tenant, v_org,
            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main depot'),
            'active', v_user);

    -- 🔴 LITERAL 2 of 2: the role, spelled as every consumer expects.
    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'fleet_administrator', 'active', v_user);

    -- Queued for verification INSIDE the same transaction that creates the
    -- fleet. Written afterwards on a separate connection it could survive a
    -- rolled-back sign-up and describe a fleet that does not exist — or be
    -- lost, leaving a fleet nobody is ever asked to verify.
    INSERT INTO identity.organization_registrations
        (tenant_id, organization_id, kind, status, submitted_by)
    VALUES (v_tenant, v_org, 'fleet', 'pending', v_user);

    -- ── and the door closes ────────────────────────────────────────────────
    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

COMMENT ON FUNCTION identity.register_fleet(TEXT, TEXT, TEXT) IS
'Self-service registration for a fleet operator: creates a tenant, a '
'fleet_operator organisation, one depot and a fleet_administrator membership '
'for the CALLER, resolved from the token subject, and queues the fleet for '
'admin verification. The role and the org type are literals, never parameters. '
'Takes the same per-identity advisory lock as register_workshop and '
'register_supplier (076), so concurrent submissions by one person — of ANY '
'kind — are serialised and the one-organisation rule actually holds.';

REVOKE ALL ON FUNCTION identity.register_fleet(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.register_fleet(TEXT, TEXT, TEXT) TO autoworkshop_app;

-- ── PROVE THE LOCK IS REALLY IN ALL THREE, NOT JUST INTENDED ──────────────
--
-- 🔴 ASSERTED FROM `pg_get_functiondef`, NOT FROM THIS FILE HAVING RUN.
-- `CREATE OR REPLACE FUNCTION` reports success whatever the body contains, and
-- 075 is proof that a registration function can ship without this lock while
-- every gate stays green. This reads the DEPLOYED definition back.
DO $lockguard$
DECLARE
    v_missing text := '';
    v_fn      text;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'identity.register_workshop(text,text,text)',
        'identity.register_supplier(text,text,text)',
        'identity.register_fleet(text,text,text)'
    ]
    LOOP
        IF pg_get_functiondef(v_fn::regprocedure) NOT LIKE '%pg_advisory_xact_lock%' THEN
            v_missing := v_missing || ' ' || v_fn;
        END IF;
    END LOOP;

    IF v_missing <> '' THEN
        RAISE EXCEPTION
            'these registration functions do not take the per-identity advisory '
            'lock and can race two organisations into existence for one person:%. '
            'Nothing has been applied.', v_missing;
    END IF;

    RAISE NOTICE 'all three registration functions take the per-identity lock';
END
$lockguard$;

COMMIT;
