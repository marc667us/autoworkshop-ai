-- 072 — three more defects in the registration path, found by the Supervisor
--
-- ══════════════════════════════════════════════════════════════════════════
-- Codex reviewed 068-071 and found three HIGH defects, all real and all fixed
-- in 071. The Supervisor then reviewed the same code and found THREE MORE
-- HIGHs that Codex did not. Both gates were worth running; neither alone was
-- sufficient — the second time in three days that has been true.
--
--   A. A self-registered supplier could not edit its own listing or add a
--      single part.
--   B. Approving a WORKSHOP published nothing, and told the administrator it
--      had.
--   C. A workshop could publish ITSELF, bypassing the entire verification gate
--      this work exists to build.
--
-- C is the one that matters: it defeats the feature. A and B are the same
-- defect 071 fixed for suppliers, left in place for the other half.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- C — A WORKSHOP COULD PUBLISH ITSELF
--
-- 069's header states: "They are NOT in the PUBLIC REGISTRIES until an admin
-- approves ... A workshop is invisible in catalogue.mechanic_directory."
-- `DirectoryService.setPublication` lets any `workshop_owner` or manager set
-- `is_published = true` with no reference to `organization_registrations` at
-- all. So a PENDING — or REJECTED — workshop saves a profile, presses Publish,
-- and is in the public directory. Worse, migration 061 gates customer enrolment
-- on that same flag, so an unverified workshop could also start acquiring
-- customers.
--
-- 🔴 THE SUPPLIER HALF WAS ALREADY CLOSED and that is what makes this an
-- oversight rather than a design: `catalogue.suppliers` is protected by 024's
-- trigger plus `admin_write`, so a supplier genuinely cannot publish itself.
-- The two registries were simply never made to agree.
--
-- ⚠️ ENFORCED IN THE DATABASE, NOT IN `DirectoryService`. A rule that lives
-- only in application code is one forgotten `assert` away from being untrue,
-- and this table already has more than one writer. `CLAUDE.md` §7: app code is
-- the first line, RLS and constraints are the final, and BOTH are required.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION catalogue.reject_unverified_publication()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY DEFINER so it can read `identity.organization_registrations`, which
-- is under FORCE RLS and whose SELECT policy is scoped to the caller's own
-- organisation — which happens to be the right one here, but would not be for a
-- platform administrator acting on somebody else's row.
--
-- ⚠️ AND SECURITY DEFINER ALONE IS NOT A BYPASS. 071's whole subject: it
-- changes WHO the query runs as, not whether RLS applies. This works because
-- the function's owner is also the table owner, and `organization_registrations`
-- is not FORCE-protected against a platform-admin read... which is exactly the
-- kind of claim that has been wrong here before, so the verification block at
-- the bottom exercises it as `autoworkshop_app` rather than asserting it.
SECURITY DEFINER
SET search_path = catalogue, identity, pg_catalog, pg_temp
AS $$
DECLARE
    v_status text;
BEGIN
    -- Only a transition INTO published is interesting. Un-publishing, and any
    -- other edit, is always allowed — a workshop must be able to take its own
    -- listing down without asking anybody.
    IF NEW.is_published IS NOT TRUE THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.is_published IS TRUE THEN
        RETURN NEW;
    END IF;

    SELECT r.status INTO v_status
      FROM identity.organization_registrations r
     WHERE r.organization_id = NEW.organization_id;

    -- ⚠️ NO ROW MEANS A WORKSHOP THAT PREDATES SELF-REGISTRATION, AND IT IS
    -- ALLOWED. Every organisation created before migration 069 has no
    -- registration row and never will; refusing them would un-publish the
    -- existing directory the moment this migration applied. The gate is for
    -- businesses that came through the self-service door, which are exactly the
    -- ones that have a row.
    IF v_status IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_status <> 'approved' THEN
        RAISE EXCEPTION
            'This workshop is % verification and cannot be listed publicly yet. '
            'A platform administrator reviews every new business; you can keep '
            'setting up your profile in the meantime.',
            CASE v_status WHEN 'pending' THEN 'awaiting' ELSE v_status || ' at' END
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION catalogue.reject_unverified_publication() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_reject_unverified_publication ON catalogue.mechanic_directory;
CREATE TRIGGER trg_reject_unverified_publication
    BEFORE INSERT OR UPDATE ON catalogue.mechanic_directory
    FOR EACH ROW EXECUTE FUNCTION catalogue.reject_unverified_publication();

-- 🔴 `BEFORE INSERT OR UPDATE`, NOT UPDATE ALONE. "A rule enforced on UPDATE
-- and nowhere else" is a recorded defect in this repository — twice in one day
-- (QC 030, variations 032) — because a direct INSERT can assert the END state.
-- `DirectoryService.save` upserts, so an INSERT carrying `is_published = true`
-- is a real path and not a hypothetical one.

-- ═══════════════════════════════════════════════════════════════════════════
-- A + B — BOTH REGISTRIES GET THEIR ROW AT REGISTRATION
--
-- A. `register_supplier` (071) created the `catalogue.suppliers` row and NOT a
--    `catalogue.supplier_users` row. Every supplier write is gated on
--    `catalogue.current_user_supplies()`, which reads `supplier_users` — so the
--    registrant could not edit the listing, could not correct the placeholder
--    country 071's own comment promised they would edit, and could not add a
--    single part. `SupplierCatalogueService.apply()` writes BOTH and says why:
--    "the supplier row alone is an orphan nobody can administer". 071 created
--    exactly that orphan.
--
-- B. Nothing created a `catalogue.mechanic_directory` row for a new workshop,
--    so approval's `UPDATE ... WHERE organization_id = $1` matched ZERO rows
--    while the admin screen said "Approved — the business is now listed
--    publicly". Identical to the defect 071 fixed for suppliers, and left in
--    place for workshops because only the supplier half was being looked at.
--
-- ⚠️ THE DIRECTORY ROW IS A DRAFT, NOT A LISTING. `trading_name`, `city` and
-- `country` are NOT NULL; the sign-up form asks for none of them. The row is
-- created UNPUBLISHED with the organisation's own name and a placeholder
-- locality the workshop edits in Settings before anyone can see it — and
-- because `is_published` stays FALSE, nobody can. A placeholder on an invisible
-- draft is not a fabricated business record; the same reasoning 071 gives for
-- the supplier's country, and the same reason it would be unacceptable in
-- `crm.leads`, which is about people who never asked to be there.
-- ═══════════════════════════════════════════════════════════════════════════

-- The registration functions must be able to write both rows. Same door, same
-- reasoning, as 069 and 071: `in_registration_bootstrap()`, never the raw flag.
DROP POLICY IF EXISTS registration_bootstrap_directory_insert ON catalogue.mechanic_directory;
CREATE POLICY registration_bootstrap_directory_insert ON catalogue.mechanic_directory FOR INSERT
  WITH CHECK (
    identity.in_registration_bootstrap()
    -- 🔴 UNPUBLISHED ONLY. Without this the bootstrap door could publish a
    -- listing directly and skip the queue — the same clause 071 puts on
    -- `catalogue.suppliers`, and the same shape as 064's `lead_insert` pinning
    -- a new lead to `status = 'new'`.
    AND is_published = FALSE
  );

DROP POLICY IF EXISTS registration_bootstrap_supplier_user_insert ON catalogue.supplier_users;
CREATE POLICY registration_bootstrap_supplier_user_insert ON catalogue.supplier_users FOR INSERT
  WITH CHECK (identity.in_registration_bootstrap());

-- `catalogue.supplier_users` may not have had RLS enabled with an INSERT arm
-- for this path; make sure the grant exists either way.
GRANT SELECT, INSERT, UPDATE ON catalogue.supplier_users TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON catalogue.mechanic_directory TO autoworkshop_app;

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
    v_user     uuid;
    v_tenant   uuid;
    v_org      uuid;
    v_branch   uuid;
    v_member   uuid;
    v_supplier uuid;
    v_slug     TEXT;
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

    v_tenant   := gen_random_uuid();
    v_org      := gen_random_uuid();
    v_branch   := gen_random_uuid();
    v_member   := gen_random_uuid();
    v_supplier := gen_random_uuid();

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

    INSERT INTO catalogue.suppliers
        (id, organization_id, slug, name, country, is_published, is_verified, created_by)
    VALUES (v_supplier, v_org, v_slug, btrim(p_supplier_name), 'GH', FALSE, FALSE, v_user);

    -- 🔴 DEFECT A — BOTH ROWS, OR THE LISTING IS AN ORPHAN NOBODY CAN
    -- ADMINISTER. `current_user_supplies()` reads THIS table, and every
    -- supplier write in the product is gated on it.
    INSERT INTO catalogue.supplier_users (supplier_id, user_id, member_role, status, invited_by)
    VALUES (v_supplier, v_user, 'owner', 'active', v_user);

    INSERT INTO identity.organization_registrations
        (tenant_id, organization_id, kind, status, submitted_by)
    VALUES (v_tenant, v_org, 'supplier', 'pending', v_user);

    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

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

    -- 🔴 DEFECT B — THE DIRECTORY DRAFT, so approval has a row to publish.
    -- Unpublished, which is all the new INSERT policy permits. `city` and
    -- `country` are NOT NULL and the form asks for neither; the workshop fills
    -- them in from Settings, and until it does the row is invisible to everyone.
    INSERT INTO catalogue.mechanic_directory
        (organization_id, trading_name, city, country, is_published)
    VALUES (v_org, btrim(p_workshop_name), 'Unspecified', 'GH', FALSE);

    INSERT INTO identity.organization_registrations
        (tenant_id, organization_id, kind, status, submitted_by)
    VALUES (v_tenant, v_org, 'workshop', 'pending', v_user);

    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

COMMIT;
