-- 068 — a parts supplier can register itself
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 THE `supplier_owner` ROLE COULD NOT EXIST IN PRODUCTION.
--
-- Owner, 2026-08-09: *"create another button called register as parts supplier,
-- when click the potential supplier creates account and login to the supplier
-- functionalities only."*
--
-- Before adding that button, the same question that caught the customer role on
-- 2026-08-08 was asked of this one: WHICH PRODUCTION CODE PATH WRITES A
-- `supplier_owner` MEMBERSHIP? The answer, from a repo-wide grep, is NONE.
-- `identity.memberships` has exactly two writers:
--
--   · `identity.register_workshop` — grants `workshop_owner`, always;
--   · `MembershipService.grant()`  — admin-only, and requires an EXISTING
--     organisation the admin already administers.
--
-- `supplier_owner` appears in `permission-matrix.ts`, in `ROLE_PRECEDENCE`, in
-- `branch.service.ts`, in `organization.service.ts`, in the supplier navigation
-- tree and in the `supplier-web` app — and nothing could ever create one. Every
-- supplier route is behind `TenantGuard`, so shipping the button first would
-- have produced an account that signs in successfully and is then refused by
-- everything, which is EXACTLY the customer-role defect, one week later.
--
-- 🔴 AND IT WOULD HAVE SURVIVED EVERY TEST, for the same reason that one did:
-- `scripts/seed-dev-identity.sh` INSERTs memberships with raw SQL, so a
-- supplier fixture exists locally that the product cannot produce. Ask of any
-- green proof: COULD THE PRODUCT HAVE PRODUCED THIS FIXTURE?
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── WHY THIS MIRRORS `register_workshop` AND NOT `enrol_as_customer` ──────
--
-- The two existing self-service paths are different shapes and the difference
-- decides which one a supplier is:
--
--   · `enrol_as_customer` (061) JOINS AN EXISTING ORGANISATION. It needs the
--     workshop's consent, so it is gated on that workshop having published
--     itself in `catalogue.mechanic_directory`.
--   · `register_workshop` (036/037) CREATES A NEW TENANT of its own.
--
-- A parts supplier is a business in its own right: it owns its catalogue, its
-- stock and its orders, and it joins nobody. So it creates a tenant, and there
-- is no third party whose consent is required — which is why the published-
-- directory constraint that 061 needs has no analogue here. Its absence is
-- deliberate and is not an oversight.
--
-- ── THE CONSTRAINTS THAT DO APPLY ─────────────────────────────────────────
--
--   1. THE CALLER IS RESOLVED FROM THE TOKEN SUBJECT, never from a user id
--      parameter. A user id argument is the confused-deputy shape that would
--      let one account register a supplier in somebody else's name.
--   2. THE ROLE IS A LITERAL, not a parameter. `'supplier_owner'` is written
--      into the INSERT. A role parameter on a SECURITY DEFINER function
--      reachable by any signed-in stranger is a privilege-escalation route with
--      a friendly name.
--   3. THE ORG TYPE IS A LITERAL, `'parts_supplier'` — one of the ten values
--      `organizations_org_type_check` admits. `register_workshop` died on that
--      constraint the first time it ran with a plausible-but-absent value.
--   4. ONE ORGANISATION PER PERSON. Refused, not stacked: an account holding
--      both `workshop_owner` and `supplier_owner` resolves through
--      `resolveTenantContext`'s precedence at every login, and the role
--      switcher would offer a role the product never meant them to hold. Same
--      rule `register_workshop` enforces, and it also makes a double-submitted
--      form a refusal rather than a second silent tenant.
--   5. THE RLS DOOR IS `in_registration_bootstrap()`, NOT the raw
--      `app.bootstrap` setting. 🔴 `set_config` IS NOT PRIVILEGED — any
--      application connection can set that flag — so reading it directly is the
--      hole migration 038 exists to close, and the first draft of 061 reopened
--      it by doing exactly that. The owner-identity half is the part that
--      cannot be forged.
--
-- ⚠️ 🔴 AND THE OWNER CHECK IS WHY THIS FUNCTION MUST BE CREATED BY THE SAME
-- ROLE THAT OWNS `register_workshop`. `in_registration_bootstrap()` compares
-- `current_user` against the owner of
-- `identity.register_workshop(text,text,text)` specifically. A SECURITY DEFINER
-- function runs as ITS OWN owner — so if this migration were applied by a
-- different role, every INSERT below would be refused by 037's policies at
-- RUNTIME while `CREATE FUNCTION` reported success. That is asserted at the
-- bottom of this file rather than assumed.
--
-- No table, column, index or trigger changes here. One function, one grant.

BEGIN;

CREATE OR REPLACE FUNCTION identity.register_supplier(
    p_subject        TEXT,
    p_supplier_name  TEXT,
    p_location_name  TEXT
)
-- ⚠️ THE `o_` PREFIX IS LOAD-BEARING — see 061's note. A `RETURNS TABLE` column
-- is an ordinary plpgsql variable inside the body, so a column named
-- `organization_id` makes every unqualified reference to it ambiguous, and
-- plpgsql resolves identifiers when the statement FIRST EXECUTES. The failure
-- is at runtime; `CREATE FUNCTION` reports success either way.
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
    IF p_supplier_name IS NULL OR btrim(p_supplier_name) = '' THEN
        RAISE EXCEPTION 'a supplier needs a name';
    END IF;

    -- CONSTRAINT 1 — the caller, from the validated token subject.
    -- `identity.users` is not tenant-scoped, so this read needs no bypass.
    SELECT id INTO v_user
      FROM identity.users
     WHERE keycloak_subject = p_subject
       AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no active application user for this identity';
    END IF;

    -- ── the door opens here, and only here ─────────────────────────────────
    -- Transaction-local, so a pooled connection cannot carry the flag into the
    -- next request even on an abort. Cleared explicitly as well, because the
    -- SUCCESS path leaves the caller's transaction open.
    PERFORM set_config('app.bootstrap',      'on',         true);
    PERFORM set_config('app.bootstrap_user', v_user::text, true);

    -- CONSTRAINT 4 — one organisation per person. AFTER the flag is set: under
    -- FORCE RLS with no tenant context this read returns zero rows for
    -- everybody, so placing it earlier would make it a check that cannot fire.
    -- That is precisely the bug migration 037 fixed in `register_workshop`.
    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        -- ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. "Every refusal must name
        -- a reachable alternative" is this repository's most expensive
        -- recurring defect — a rule with no way past it is a wall, and the
        -- person in front of it files a bug instead of acting.
        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a supplier, or ask a platform administrator to add you to an existing supplier.';
    END IF;

    -- A readable, unique slug. `identity.tenants.slug` is NOT NULL and unique,
    -- so deriving it from the name alone would collide on the second
    -- "Auto Parts Ltd".
    v_slug := regexp_replace(lower(btrim(p_supplier_name)), '[^a-z0-9]+', '-', 'g');
    v_slug := btrim(v_slug, '-');
    IF v_slug = '' THEN
        v_slug := 'supplier';
    END IF;
    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    v_tenant := gen_random_uuid();
    v_org    := gen_random_uuid();
    v_branch := gen_random_uuid();
    v_member := gen_random_uuid();

    INSERT INTO identity.tenants (id, name, slug, status, created_by)
    VALUES (v_tenant, btrim(p_supplier_name), v_slug, 'active', v_user);

    -- CONSTRAINT 3 — `parts_supplier`, one of the ten values
    -- `organizations_org_type_check` admits. Not `supplier`, which is plausible
    -- and absent; `register_workshop` died on exactly that mistake.
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
    VALUES (v_org, v_tenant, btrim(p_supplier_name), 'parts_supplier', 'active', v_user);

    -- One location immediately. `resolveTenantContext` copes with a NULL
    -- branch, but the screens read better with a real one, and a supplier with
    -- nowhere to hold stock is not a state worth representing.
    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
    VALUES (v_branch, v_tenant, v_org,
            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main location'),
            'active', v_user);

    -- CONSTRAINT 2 — the role is a LITERAL, spelled exactly as
    -- `permission-matrix.ts`, `ROLE_PRECEDENCE` and the supplier navigation
    -- tree expect. A merely plausible role name resolves to no tree and no
    -- permissions, and the person lands in an organisation they can see nothing
    -- in — the `quality_controller` defect, which failed CLOSED for months.
    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'supplier_owner', 'active', v_user);

    -- ── and the door closes ────────────────────────────────────────────────
    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

COMMENT ON FUNCTION identity.register_supplier(TEXT, TEXT, TEXT) IS
'Self-service registration for a parts supplier: creates a tenant, a '
'parts_supplier organisation, one location and a supplier_owner membership for '
'the CALLER, resolved from the token subject. The role and the org type are '
'literals, never parameters. Refuses an account that already belongs to an '
'organisation. Before this function existed no production code path could '
'create a supplier_owner membership at all.';

-- 🔴 EXECUTE IS GRANTED TO THE APPLICATION ROLE AND REVOKED FROM PUBLIC.
-- A SECURITY DEFINER function reachable by PUBLIC is reachable by every role in
-- the database, including any future read-only or reporting role.
REVOKE ALL ON FUNCTION identity.register_supplier(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.register_supplier(TEXT, TEXT, TEXT) TO autoworkshop_app;

-- ── PROVE THE DOOR ACTUALLY OPENS FOR THIS FUNCTION ────────────────────────
--
-- 🔴 THE ONE FAILURE THIS MIGRATION CAN HAVE THAT `CREATE FUNCTION` WOULD NOT
-- REPORT. `in_registration_bootstrap()` admits a caller only when
-- `current_user` equals the owner of `register_workshop`. A SECURITY DEFINER
-- function runs as its OWN owner, so if this file were ever applied by a
-- different role than 037 was, every INSERT above would be refused by 037's
-- policies — at runtime, on a real supplier's first sign-up, long after this
-- migration reported success.
--
-- Two owners, compared. If they differ, nothing is applied.
DO $$
DECLARE
    v_workshop_owner text;
    v_supplier_owner text;
BEGIN
    SELECT r.rolname INTO v_workshop_owner
      FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
     WHERE p.oid = 'identity.register_workshop(text,text,text)'::regprocedure;

    SELECT r.rolname INTO v_supplier_owner
      FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
     WHERE p.oid = 'identity.register_supplier(text,text,text)'::regprocedure;

    IF v_workshop_owner IS DISTINCT FROM v_supplier_owner THEN
        RAISE EXCEPTION
            'register_supplier is owned by % but register_workshop by %. '
            'in_registration_bootstrap() pins the bootstrap door to the latter, so '
            'every INSERT in register_supplier would be refused by 037''s policies '
            'at runtime. Nothing has been applied.',
            v_supplier_owner, v_workshop_owner;
    END IF;

    -- And it must really be SECURITY DEFINER — `prosecdef`. Created as INVOKER
    -- it would run as `autoworkshop_app`, the bootstrap door would never open,
    -- and the first sign-up would fail on the tenants INSERT.
    IF NOT (SELECT p.prosecdef FROM pg_proc p
             WHERE p.oid = 'identity.register_supplier(text,text,text)'::regprocedure) THEN
        RAISE EXCEPTION
            'register_supplier is not SECURITY DEFINER — the bootstrap door cannot '
            'open for it. Nothing has been applied.';
    END IF;
END $$;

COMMIT;
