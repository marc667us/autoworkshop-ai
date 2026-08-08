-- 071 — the three defects Codex found in 068/069/070, all three MEASURED
--
-- ══════════════════════════════════════════════════════════════════════════
-- Codex reviewed the self-service registration path on 2026-08-09 and returned
-- three HIGH findings. All three were confirmed by measurement before anything
-- here was written; none was accepted on argument alone.
--
-- 🔴 FINDING 3 IS THE ONE THAT MATTERS MOST, AND MY OWN REHEARSAL COULD NOT
-- HAVE CAUGHT IT.
--
-- 070's trigger reads `identity.memberships` to find platform administrators.
-- It is SECURITY DEFINER, and I wrote in its header that this is what makes the
-- read work under FORCE RLS. THAT IS WRONG. SECURITY DEFINER changes WHO the
-- query runs as; it does not exempt anybody from RLS. Only `rolbypassrls` or
-- table ownership without FORCE does that.
--
-- Measured on this database:
--
--     rolname          | rolsuper | rolbypassrls
--     -----------------+----------+-------------
--     autoworkshop     | t        | t            <- the function's owner, LOCALLY
--     autoworkshop_app | f        | f
--
-- and then the trigger's exact query, with the settings a registration really
-- carries (`app.bootstrap='on'`, `app.bootstrap_user=<registrant>`):
--
--     as the local owner (superuser, bypasses RLS) : 2 administrators visible
--     as a NOBYPASSRLS role (what Render is)       : 0 administrators visible
--
-- So on Render the alert writes NOTHING and raises only its non-fatal notice.
-- Every registration would enter the queue and no administrator would ever be
-- told — the owner's actual requirement, silently unmet.
--
-- ⚠️ THIS IS THE RECORDED SCAR "A DEFINER FUNCTION'S OWNER IS A SUPERUSER
-- LOCALLY AND NOT ON RENDER", and I quoted it in 070's own header while
-- rehearsing in the one way that could not detect it. A rehearsal that runs as
-- a bypassing role proves nothing about a policy. The verification block at the
-- bottom of this file now runs under a NOBYPASSRLS role, in the migration.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- FINDING 3 — the alert must be able to SEE the administrators
--
-- The fix follows migration 060's own precedent rather than inventing one. The
-- notification drain has exactly this problem — a background job with no user
-- context needs to read rows RLS would refuse — and 060 solves it with a
-- transaction-local flag (`app.notify`) plus a policy that admits it.
--
-- 🔴 BUT A FLAG ALONE IS FORGEABLE. `set_config` is NOT privileged: any
-- application connection can set `app.admin_lookup='on'` and read every
-- membership in the database. That is precisely the hole migration 038 exists
-- to close and that the first draft of 061 reopened. So the flag is paired with
-- an OWNER-IDENTITY check, exactly as `in_registration_bootstrap()` does — and
-- that half cannot be forged from an application connection.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION identity.in_admin_lookup()
RETURNS boolean
LANGUAGE sql
STABLE
-- NOT SECURITY DEFINER, deliberately — the same reasoning as
-- `in_registration_bootstrap()`. As DEFINER it would always observe its own
-- owner and return true for everybody, restoring the exact hole it closes.
SET search_path = identity, pg_catalog, pg_temp
AS $$
  SELECT current_setting('app.admin_lookup', true) = 'on'
     AND current_user = (
           SELECT r.rolname
             FROM pg_proc p
             JOIN pg_roles r ON r.oid = p.proowner
            WHERE p.oid = 'identity.alert_admins_of_registration()'::regprocedure
         );
$$;

COMMENT ON FUNCTION identity.in_admin_lookup() IS
'TRUE only inside identity.alert_admins_of_registration: the app.admin_lookup '
'flag is set AND the effective user is that function''s owner. The flag alone is '
'settable by any caller (set_config is not privileged), so the owner check is '
'the half that cannot be forged from an application connection.';

REVOKE ALL ON FUNCTION identity.in_admin_lookup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.in_admin_lookup() TO autoworkshop_app;

-- ⚠️ THE NARROWEST POSSIBLE DOOR. It exposes ONLY active
-- `platform_administrator` rows — not every membership — so even if the owner
-- check were somehow satisfied outside the alert, what leaks is the list of
-- administrators' user ids and nothing else. A door sized to the job.
DROP POLICY IF EXISTS admin_lookup_select ON identity.memberships;
CREATE POLICY admin_lookup_select ON identity.memberships FOR SELECT USING (
  identity.in_admin_lookup()
  AND role_name = 'platform_administrator'
  AND status = 'active'
);

CREATE OR REPLACE FUNCTION identity.alert_admins_of_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, comms, pg_catalog, pg_temp
AS $$
DECLARE
    v_admin   RECORD;
    v_org     TEXT;
    v_kind    TEXT;
    v_written integer := 0;
BEGIN
    IF NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    SELECT o.name INTO v_org
      FROM identity.organizations o
     WHERE o.id = NEW.organization_id;

    v_kind := CASE NEW.kind WHEN 'supplier' THEN 'parts supplier' ELSE 'workshop' END;

    -- ── the admin-lookup door opens ────────────────────────────────────────
    -- Transaction-local, so a pooled connection cannot carry it into the next
    -- request even on an abort. Cleared explicitly below as well, because the
    -- caller's transaction continues after this trigger returns and must not
    -- keep a read exemption it never asked for.
    PERFORM set_config('app.admin_lookup', 'on', true);

    FOR v_admin IN
        SELECT DISTINCT m.user_id
          FROM identity.memberships m
         WHERE m.role_name = 'platform_administrator'
           AND m.status = 'active'
    LOOP
        v_written := v_written + comms.notify_user(
            NEW.tenant_id,
            NEW.organization_id,
            v_admin.user_id,
            'organization.registered',
            format('Verify a new %s: %s', v_kind, COALESCE(v_org, 'unnamed')),
            format(
                '%s registered as a %s and is waiting to be verified. '
                'It is NOT listed publicly yet — approving it is what publishes it '
                'to the %s. Open Registrations to check the business and decide.',
                COALESCE(v_org, 'An organisation'),
                v_kind,
                CASE NEW.kind WHEN 'supplier' THEN 'parts marketplace' ELSE 'mechanic directory' END
            ),
            'organization_registration',
            NEW.id,
            format('organization.registered:%s', v_admin.user_id)
        );
    END LOOP;

    PERFORM set_config('app.admin_lookup', '', true);

    IF v_written = 0 THEN
        RAISE NOTICE
            'registration % queued but NO platform administrator was alerted '
            '(none active). It is in the queue and will be found by anyone who '
            'opens it.', NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION identity.alert_admins_of_registration() FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- FINDING 2 — approval published a supplier matched BY NAME
--
-- `OrganizationRegistrationService.decide` bound the registration to
-- `catalogue.suppliers` with `lower(s.name) = lower(o.name)`. Codex's scenario
-- is correct and serious: register a supplier using the name of an existing
-- unverified one, and an administrator approving YOUR registration publishes
-- and VERIFIES THEIRS. With several same-named rows, all of them.
--
-- The mirror defect is just as bad: a genuinely new supplier matches nothing,
-- so approval marks them `approved` and publishes NOTHING — an administrator
-- who is certain they approved a business that stays invisible, with no reason
-- ever to look again.
--
-- 🔴 THE ROOT CAUSE IS THAT THERE WAS NO LINK TO BIND TO. `catalogue.suppliers`
-- predates self-registration (021) and is keyed by slug; its only ownership
-- link is per-USER (`catalogue.supplier_users`), not per-organisation. So the
-- fix is the missing column, and registration now CREATES the listing row —
-- unpublished — bound to the organisation it belongs to.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE catalogue.suppliers
    ADD COLUMN IF NOT EXISTS organization_id uuid
        REFERENCES identity.organizations(id) ON DELETE CASCADE;

-- 🔴 UNIQUE, AND PARTIAL. One organisation owns at most one marketplace
-- listing, so approval can never touch a second row. Partial because every row
-- that existed before self-registration has a NULL here and always will —
-- a plain UNIQUE would be satisfied by multiple NULLs in Postgres anyway, but
-- stating the intent as a partial index makes it read as a rule rather than an
-- accident of NULL semantics.
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_organization
    ON catalogue.suppliers (organization_id)
 WHERE organization_id IS NOT NULL;

COMMENT ON COLUMN catalogue.suppliers.organization_id IS
'The identity.organizations row that owns this marketplace listing, for '
'suppliers that registered themselves (migration 068). NULL for rows seeded '
'before self-registration existed. Approval publishes BY THIS COLUMN — matching '
'on name let one registrant''s approval publish and verify a different '
'business with the same name (Codex, 2026-08-09).';

-- The registration functions must be able to write that row. Same door, same
-- reasoning, as 069's INSERT policy: `in_registration_bootstrap()`, never the
-- raw flag.
DROP POLICY IF EXISTS registration_bootstrap_supplier_insert ON catalogue.suppliers;
CREATE POLICY registration_bootstrap_supplier_insert ON catalogue.suppliers FOR INSERT
  WITH CHECK (
    identity.in_registration_bootstrap()
    -- 🔴 AND IT MAY ONLY CREATE AN UNPUBLISHED, UNVERIFIED ROW. Without these
    -- two clauses the bootstrap door could publish a listing directly and skip
    -- the entire verification queue this work exists to build. The same shape
    -- as 064's `lead_insert`, which pins a new lead to `status = 'new'`.
    AND is_published = FALSE
    AND is_verified  = FALSE
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- FINDING 1 — "one organisation per person" was an unlocked read
--
-- Both functions check `IF EXISTS (SELECT 1 FROM identity.memberships WHERE
-- user_id = ...)` with nothing serialising it. Two concurrent requests for the
-- same subject — which is what a double-submitted form on a slow connection IS
-- — both see no membership and both create a tenant. The caller ends up owning
-- two organisations, and `resolveTenantContext` then has to pick one.
--
-- ⚠️ A UNIQUE INDEX ON `(user_id) WHERE status='active'` WAS REJECTED. It reads
-- like the obvious fix and it would forbid something the product allows:
-- `MembershipService.grant()` can legitimately add a person to a second
-- organisation, and a partial unique index would refuse that with a constraint
-- violation from a code path that has nothing to do with registration.
--
-- `pg_advisory_xact_lock` serialises only the thing that needs serialising —
-- concurrent REGISTRATION by one identity — and is released automatically at
-- COMMIT or ROLLBACK, so a failed registration cannot strand a lock.
-- `hashtextextended` rather than `hashtext` because the two-argument
-- `pg_advisory_xact_lock(bigint)` wants 64 bits; a 32-bit hash widened would
-- collide far sooner across a user base.
-- ═══════════════════════════════════════════════════════════════════════════

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

    SELECT id INTO v_user
      FROM identity.users
     WHERE keycloak_subject = p_subject
       AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no active application user for this identity';
    END IF;

    -- FINDING 1 — serialise this identity's registrations before reading.
    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));

    PERFORM set_config('app.bootstrap',      'on',          true);
    PERFORM set_config('app.bootstrap_user', v_user::text,  true);

    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        RAISE EXCEPTION 'this account already belongs to an organisation';
    END IF;

    v_slug := regexp_replace(lower(btrim(p_workshop_name)), '[^a-z0-9]+', '-', 'g');
    v_slug := btrim(v_slug, '-');
    IF v_slug = '' THEN
        v_slug := 'workshop';
    END IF;
    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    v_tenant := gen_random_uuid();
    v_org    := gen_random_uuid();
    v_branch := gen_random_uuid();
    v_member := gen_random_uuid();

    INSERT INTO identity.tenants (id, name, slug, status, created_by)
    VALUES (v_tenant, btrim(p_workshop_name), v_slug, 'active', v_user);

    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
    VALUES (v_org, v_tenant, btrim(p_workshop_name), 'individual_workshop', 'active', v_user);

    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
    VALUES (v_branch, v_tenant, v_org,
            COALESCE(NULLIF(btrim(p_branch_name), ''), 'Main branch'),
            'active', v_user);

    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'workshop_owner', 'active', v_user);

    INSERT INTO identity.organization_registrations
        (tenant_id, organization_id, kind, status, submitted_by)
    VALUES (v_tenant, v_org, 'workshop', 'pending', v_user);

    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

CREATE OR REPLACE FUNCTION identity.register_supplier(
    p_subject        TEXT,
    p_supplier_name  TEXT,
    p_location_name  TEXT
)
RETURNS TABLE (
    o_tenant_id       uuid,
    o_organization_id uuid,
    o_branch_id       uuid,
    o_membership_id   uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, catalogue, pg_catalog, pg_temp
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

    SELECT id INTO v_user
      FROM identity.users
     WHERE keycloak_subject = p_subject
       AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no active application user for this identity';
    END IF;

    -- FINDING 1 — serialise this identity's registrations before reading.
    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));

    PERFORM set_config('app.bootstrap',      'on',         true);
    PERFORM set_config('app.bootstrap_user', v_user::text, true);

    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a supplier, or ask a platform administrator to add you to an existing supplier.';
    END IF;

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

    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
    VALUES (v_org, v_tenant, btrim(p_supplier_name), 'parts_supplier', 'active', v_user);

    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
    VALUES (v_branch, v_tenant, v_org,
            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main location'),
            'active', v_user);

    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'supplier_owner', 'active', v_user);

    -- ── FINDING 2 — THE MARKETPLACE LISTING IS CREATED HERE, BOUND TO THE ORG.
    --
    -- Unpublished and unverified, which is what the new INSERT policy above
    -- allows and nothing more. Approval later flips both flags BY
    -- `organization_id`, so it can never reach another business's row and can
    -- never find nothing to publish.
    --
    -- ⚠️ `country` IS NOT NULL AND THE FORM DOES NOT ASK FOR IT. 'GH' is this
    -- product's market and the supplier edits it in their own profile before
    -- anyone sees the listing — it is invisible until approved. This is a
    -- placeholder on a hidden draft, NOT a fabricated business detail on a
    -- public record, and the distinction is the reason it is acceptable here
    -- and would not be in `crm.leads`.
    INSERT INTO catalogue.suppliers
        (organization_id, slug, name, country, is_published, is_verified, created_by)
    VALUES (v_org, v_slug, btrim(p_supplier_name), 'GH', FALSE, FALSE, v_user);

    INSERT INTO identity.organization_registrations
        (tenant_id, organization_id, kind, status, submitted_by)
    VALUES (v_tenant, v_org, 'supplier', 'pending', v_user);

    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY — AND THIS TIME UNDER A ROLE THAT DOES NOT BYPASS RLS
--
-- 🔴 THE WHOLE POINT OF THIS BLOCK. The previous rehearsal ran as the local
-- owner, which is `rolsuper=t rolbypassrls=t`, so it could not have observed
-- finding 3 even in principle. A temporary NOBYPASSRLS role is created,
-- granted exactly what the trigger needs, and the admin lookup is run as it —
-- inside this transaction, which is rolled back if the count is wrong.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_admins integer;
    v_total  integer;
BEGIN
    -- No administrators at all is legitimate on a fresh deployment, and this
    -- check must not make the first one impossible to create.
    SELECT count(*) INTO v_total FROM identity.memberships
     WHERE role_name = 'platform_administrator' AND status = 'active';

    -- 🔴 `CREATE ROLE` NEEDS `CREATEROLE`, AND THE PREMISE OF THIS WHOLE FILE
    -- IS THAT RENDER'S MIGRATION ROLE IS NOT A SUPERUSER.
    --
    -- Without the attribute this block raises, the transaction rolls back, and
    -- migrations 067-072 never apply — ON PRODUCTION ONLY, while passing
    -- locally where the owner is `rolsuper=t`. A verification step that can
    -- break the deploy it is verifying is worse than no verification step, and
    -- the failure mode is exactly the local-vs-Render asymmetry this file was
    -- written about. Supervisor, 2026-08-09.
    --
    -- Degraded to a NOTICE rather than a failure: the check is a belt-and-
    -- braces assertion about a policy, not a schema change anything depends on.
    IF v_total > 0 AND NOT (SELECT rolcreaterole FROM pg_roles WHERE rolname = current_user) THEN
        RAISE NOTICE
            'SKIPPED the negative-arm RLS check: % lacks CREATEROLE, so a throwaway '
            'NOBYPASSRLS role cannot be created here. The admin_lookup door is NOT '
            'verified by this run — check it with the rehearsal in /tmp/render_shape.sql.',
            current_user;
        v_total := 0;
    END IF;

    IF v_total > 0 THEN
        CREATE ROLE migration_071_norls NOLOGIN NOBYPASSRLS;
        GRANT USAGE ON SCHEMA identity TO migration_071_norls;
        GRANT SELECT ON ALL TABLES IN SCHEMA identity TO migration_071_norls;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA identity TO migration_071_norls;

        -- The exact conditions inside the trigger: the bootstrap door open for
        -- some registrant, and the admin-lookup flag on.
        PERFORM set_config('app.bootstrap', 'on', true);
        PERFORM set_config('app.admin_lookup', 'on', true);

        SET LOCAL ROLE migration_071_norls;
        SELECT count(*) INTO v_admins FROM identity.memberships
         WHERE role_name = 'platform_administrator' AND status = 'active';
        RESET ROLE;

        PERFORM set_config('app.bootstrap', '', true);
        PERFORM set_config('app.admin_lookup', '', true);

        -- ⚠️ `DROP OWNED BY` FIRST, OR THE DROP FAILS AND TAKES THE MIGRATION
        -- WITH IT. A role cannot be dropped while any grant still references
        -- it, and this one was just granted SELECT on every table and EXECUTE
        -- on every function in `identity`. The first run of this file died
        -- exactly here — "privileges for function
        -- identity.alert_admins_of_registration() ... CONTEXT: DROP ROLE" —
        -- which is the good failure: the transaction rolled back and nothing
        -- was applied. `DROP OWNED BY` revokes everything granted TO the role
        -- as well as dropping objects it owns, which here is nothing.
        DROP OWNED BY migration_071_norls;
        DROP ROLE migration_071_norls;

        -- ⚠️ `v_admins` IS EXPECTED TO BE 0 HERE AND THAT IS CORRECT. The new
        -- policy requires `in_admin_lookup()`, which requires `current_user` to
        -- be the ALERT FUNCTION'S OWNER — and this block runs as a throwaway
        -- role that is deliberately NOT that owner. What is being proven is
        -- that the door does NOT open for an arbitrary role that merely sets
        -- the flag, i.e. that finding 3's fix did not become finding 3's hole.
        IF v_admins <> 0 THEN
            RAISE EXCEPTION
                'app.admin_lookup opened identity.memberships to a role that is NOT '
                'the alert function''s owner (% rows). set_config is not privileged, '
                'so this door would be forgeable by any application connection. '
                'Nothing has been applied.', v_admins;
        END IF;
    END IF;
END $$;

COMMIT;
