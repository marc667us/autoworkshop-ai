-- ============================================================================
-- Migration 036 — sign-up via Keycloak, and registering a workshop
--
-- WHY THIS EXISTS
--
-- Owner instruction 2026-08-03: "users must sign up via kc".
--
-- Keycloak can already create an account. Nothing in this system then creates
-- the APPLICATION user behind it, so a person who signs up gets a valid token
-- and is refused by both guards with "no application user for this identity".
-- Measured on the live site the same day: the owner signs in successfully and
-- the shell still reads "Not signed in", because `identity.users` holds no row
-- for their subject and `identity.tenants` holds no workshop at all.
--
-- Until now the ONLY thing that ever wrote `identity.users` was
-- `scripts/seed-dev-identity.sh`, which refuses to run against anything but a
-- local Keycloak. So every deployed environment was, by construction, an
-- application nobody could be a user of.
--
-- ── TWO FUNCTIONS, AND THE LINE BETWEEN THEM IS THE WHOLE DESIGN ────────────
--
-- 1. `provision_user_from_subject` — AUTHENTICATION becomes an identity.
--    Creates the `identity.users` row for a validated Keycloak subject. It
--    grants NOTHING: the user has no membership, so `TenantGuard` still refuses
--    every workshop route and `withUser` leaves `app.tenant_id` unset, which
--    makes every tenant-owned table return zero rows. What it buys is that the
--    person exists and can act as themselves — browse the marketplace, place an
--    order, register a workshop.
--
-- 2. `register_workshop` — an identity becomes an ORGANISATION.
--    Creates tenant + organisation + branch + an owner membership, atomically.
--
-- 🔴 THE SECOND ONE IS THE ONLY PLACE IN THE SYSTEM THAT GRANTS A MEMBERSHIP TO
-- ITS OWN CALLER, and it is safe for exactly one reason: the membership it
-- grants is over a tenant THAT DID NOT EXIST A MOMENT AGO. It cannot name an
-- existing tenant, cannot accept a tenant id, and cannot add anyone to anything
-- that already has members. Adding a person to an EXISTING organisation stays
-- where it already is — `MembershipService.grant()`, which requires an
-- authenticated admin of that organisation. Do not "simplify" these together.
--
-- ── WHY SECURITY DEFINER, AGAIN ─────────────────────────────────────────────
--
-- Same reason as `identity.memberships_for_subject` (migration 003), and the
-- same measured failure behind it: `identity.memberships` is under ENABLE +
-- FORCE RLS, so with no tenant context its policy evaluates `tenant_id = NULL`
-- and the INSERT's WITH CHECK cannot pass. These functions run BEFORE any
-- tenant context exists — they are what creates the thing a context is made of.
--
-- Both are small, pinned to a fixed `search_path`, accept only a subject taken
-- from a signature-validated token, and are executable only by the application
-- role. That is the whole tenant-boundary crossing, and it stays auditable.
-- ============================================================================

BEGIN;

-- ── 1. sign-up: a validated subject becomes an application user ─────────────

CREATE OR REPLACE FUNCTION identity.provision_user_from_subject(
    p_subject      TEXT,
    p_email        TEXT,
    p_display_name TEXT
)
RETURNS uuid
LANGUAGE plpgsql
-- VOLATILE (the default): it writes. Declaring STABLE here would let the
-- planner cache it and silently skip the insert on a second call in one
-- statement.
SECURITY DEFINER
SET search_path = identity, pg_catalog, pg_temp
AS $$
DECLARE
    v_id uuid;
BEGIN
    -- Refuse empties rather than writing a row nobody can be matched to. A
    -- blank subject would collide on the unique index with the NEXT blank one,
    -- quietly merging two people into one account.
    IF p_subject IS NULL OR btrim(p_subject) = '' THEN
        RAISE EXCEPTION 'provision_user_from_subject requires a subject';
    END IF;

    INSERT INTO identity.users (keycloak_subject, email, display_name, status)
    VALUES (
        p_subject,
        -- `email` and `display_name` are NOT NULL. A Keycloak client can be
        -- configured without the email or profile scope, so neither claim is
        -- guaranteed — fall back rather than fail the sign-in. The subject is
        -- the only identity input that is actually guaranteed, and it is the
        -- only one the row is keyed on.
        COALESCE(NULLIF(btrim(p_email), ''), p_subject || '@no-email.invalid'),
        COALESCE(NULLIF(btrim(p_display_name), ''), NULLIF(btrim(p_email), ''), 'New user'),
        'active'
    )
    ON CONFLICT (keycloak_subject) DO UPDATE
       -- Keycloak stays authoritative for the profile: a user who changes their
       -- name or email there sees it change here on their next request. Status
       -- is deliberately NOT reset to 'active' — see below.
       SET email        = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           updated_at   = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION identity.provision_user_from_subject(TEXT, TEXT, TEXT) IS
'Sign-up: turns a signature-validated Keycloak subject into an identity.users row. '
'Grants NO membership, so the user can act only as themselves and every '
'tenant-owned table still returns zero rows for them. SECURITY DEFINER because it '
'runs before any tenant context exists. Never reactivates a suspended user.';

REVOKE ALL ON FUNCTION identity.provision_user_from_subject(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.provision_user_from_subject(TEXT, TEXT, TEXT) TO autoworkshop_app;

-- 🔴 THE `status` COLUMN IS NOT IN THE DO UPDATE SET, AND THAT IS THE POINT.
--
-- A user suspended by an administrator would otherwise be silently restored to
-- 'active' by their own next sign-in — the account lock undone by the person it
-- was applied to, through a code path whose name says "provision". Suspension is
-- an administrative decision and only an administrator reverses it.
--
-- `memberships_for_subject` filters on `u.status = 'active'`, so a suspended
-- user's next request resolves to no user at all and both guards refuse. That is
-- the behaviour we want, and it depends on this column NOT being touched here.

-- ── 2. registration: an identity becomes a workshop ─────────────────────────

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
    SELECT id INTO v_user
      FROM identity.users
     WHERE keycloak_subject = p_subject
       AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no active application user for this identity';
    END IF;

    -- ⚠️ ONE WORKSHOP PER PERSON, FOR NOW, AND IT IS CHECKED HERE rather than in
    -- the service. A retried request — a double-submitted form, a client that
    -- resends on a slow response — would otherwise create a SECOND tenant with
    -- the same owner, and there is no UI anywhere that would reveal the
    -- duplicate. The user would simply be in whichever one sorted first.
    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
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

    INSERT INTO identity.tenants (name, slug, status, created_by)
    VALUES (btrim(p_workshop_name), v_slug, 'active', v_user)
    RETURNING id INTO v_tenant;

    -- ⚠️ `individual_workshop`, NOT `workshop`. `organizations_org_type_check`
    -- (migration 001) admits ten specific values and `workshop` is not one of
    -- them — the first run of this function died on that constraint. A new
    -- registration starts as a single workshop; `multi_branch_workshop` is what
    -- it becomes when a second branch is added, which is a later decision and
    -- not one to guess at sign-up.
    INSERT INTO identity.organizations (tenant_id, name, org_type, status, created_by)
    VALUES (v_tenant, btrim(p_workshop_name), 'individual_workshop', 'active', v_user)
    RETURNING id INTO v_org;

    -- Every workshop gets one branch immediately. `resolveTenantContext` copes
    -- with a NULL branch, but the screens read better with a real one, and a
    -- workshop with nowhere to do the work is not a state worth representing.
    INSERT INTO identity.branches (tenant_id, organization_id, name, status, created_by)
    VALUES (v_tenant, v_org,
            COALESCE(NULLIF(btrim(p_branch_name), ''), 'Main branch'),
            'active', v_user)
    RETURNING id INTO v_branch;

    -- `workshop_owner`, spelled exactly as `permission-matrix.ts` and
    -- `viewer-contract.ts`'s ROLE_TO_NAV expect. A role name that is merely
    -- plausible resolves to no navigation tree and no permissions, and the user
    -- lands in a workshop they can see nothing in.
    INSERT INTO identity.memberships
        (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_tenant, v_org, v_branch, v_user, 'workshop_owner', 'active', v_user)
    RETURNING id INTO v_member;

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

COMMENT ON FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) IS
'Registration: creates tenant + organisation + branch + owner membership for the '
'caller, atomically. The ONLY function that grants a membership to its own caller, '
'and safe only because the tenant did not exist a moment earlier: it accepts no '
'tenant id and refuses a caller who already belongs to one. Adding a person to an '
'EXISTING organisation is MembershipService.grant(), which requires an admin.';

REVOKE ALL ON FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) TO autoworkshop_app;

COMMIT;
