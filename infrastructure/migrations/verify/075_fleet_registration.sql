-- verify/075 — a fleet operator can now exist, and the proof is a membership row.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 CHECK 4 IS THE WHOLE POINT: a `fleet_administrator` membership written by
-- a PRODUCTION CODE PATH, not by `seed-dev-identity.sh`'s raw SQL.
--
-- That distinction is the reason this migration exists. Before it, every test
-- of fleet-web would have passed against a membership the product itself could
-- never have produced — which is exactly how the `customer` role (08-08) and
-- the `supplier_owner` role (08-09) each reached production unreachable.
--
-- Ask of any green proof: **could the PRODUCT have produced this fixture?**
-- Here it did: `identity.register_fleet` is called, and nothing else.
--
-- ⚠️ THE PRIVILEGE REHEARSAL IS A SEPARATE FILE.
-- `rehearse/075_fleet_registration_render_privileges.sql` re-owns the whole
-- definer chain to a NOBYPASSRLS role and calls this same function, because
-- locally the definer's owner is a superuser and the bootstrap door would open
-- even if 037's policies refused everything. This file proves the BEHAVIOUR;
-- that one proves it survives Render's privilege shape.
-- ══════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
    v_subject TEXT := 'verify-075-' || replace(gen_random_uuid()::text, '-', '');
    v_user    uuid;
    r         record;
    n         int;
    refused   boolean;
    passed    int := 0;
BEGIN
    -- ── 1. The door exists, and is the right kind of door ─────────────────
    SELECT count(*) INTO n
      FROM pg_proc p
     WHERE p.oid = 'identity.register_fleet(text,text,text)'::regprocedure
       AND p.prosecdef;                          -- SECURITY DEFINER
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/075 #1: register_fleet is missing or is not '
                        'SECURITY DEFINER — the bootstrap door cannot open for it';
    END IF;

    -- Owned by the same role as register_workshop, or in_registration_bootstrap()
    -- refuses it at runtime while every migration reports success.
    IF (SELECT r2.rolname FROM pg_proc p JOIN pg_roles r2 ON r2.oid = p.proowner
         WHERE p.oid = 'identity.register_fleet(text,text,text)'::regprocedure)
       IS DISTINCT FROM
       (SELECT r2.rolname FROM pg_proc p JOIN pg_roles r2 ON r2.oid = p.proowner
         WHERE p.oid = 'identity.register_workshop(text,text,text)'::regprocedure)
    THEN
        RAISE EXCEPTION 'verify/075 #1b: register_fleet and register_workshop have '
                        'different owners — the bootstrap door is pinned to the latter';
    END IF;

    -- PUBLIC must not hold EXECUTE on a SECURITY DEFINER function.
    IF has_function_privilege('public', 'identity.register_fleet(text,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'verify/075 #1c: PUBLIC can execute register_fleet';
    END IF;
    IF NOT has_function_privilege('autoworkshop_app',
                                  'identity.register_fleet(text,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'verify/075 #1d: the application role CANNOT execute '
                        'register_fleet — the door is shut to the only caller';
    END IF;
    passed := passed + 1;

    -- ── 2. The queue accepts the third kind ───────────────────────────────
    SELECT count(*) INTO n FROM pg_constraint
     WHERE conrelid = 'identity.organization_registrations'::regclass
       AND conname = 'organization_registrations_kind_check'
       AND pg_get_constraintdef(oid) LIKE '%fleet%';
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/075 #2: organization_registrations still refuses '
                        'kind = fleet, so register_fleet would fail on its last '
                        'statement — at runtime, on a real registrant';
    END IF;
    passed := passed + 1;

    -- ── 3. A person with no organisation ──────────────────────────────────
    v_user := gen_random_uuid();
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (v_user, v_subject, v_subject || '@example.test', 'Verify 075', 'active');

    -- ── 4. 🔴 THE PRODUCT CREATES THE FLEET ───────────────────────────────
    SELECT * INTO r FROM identity.register_fleet(v_subject, 'Verify 075 Haulage', 'Tema depot');

    IF r.o_tenant_id IS NULL OR r.o_organization_id IS NULL
       OR r.o_branch_id IS NULL OR r.o_membership_id IS NULL THEN
        RAISE EXCEPTION 'verify/075 #4: register_fleet returned nulls';
    END IF;

    -- The organisation is a FLEET, by the literal the CHECK constraint admits.
    SELECT count(*) INTO n FROM identity.organizations
     WHERE id = r.o_organization_id AND org_type = 'fleet_operator' AND status = 'active';
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/075 #4b: the organisation is not an active '
                        'fleet_operator';
    END IF;

    -- 🔴 AND THE MEMBERSHIP IS THE ROLE THE NAVIGATION TREE EXPECTS. A merely
    -- plausible name here resolves to no tree and no permissions, and the
    -- registrant lands somewhere they can see nothing — failing CLOSED and
    -- silently, which is how `quality_controller` survived for months.
    SELECT count(*) INTO n FROM identity.memberships
     WHERE id = r.o_membership_id
       AND user_id = v_user
       AND organization_id = r.o_organization_id
       AND role_name = 'fleet_administrator'
       AND status = 'active';
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/075 #4c: no active fleet_administrator membership '
                        'was written — the role still cannot exist in production';
    END IF;

    -- A depot, so the fleet has somewhere to keep vehicles.
    SELECT count(*) INTO n FROM identity.branches
     WHERE id = r.o_branch_id AND organization_id = r.o_organization_id AND status = 'active';
    IF n <> 1 THEN RAISE EXCEPTION 'verify/075 #4d: no depot was created'; END IF;
    passed := passed + 1;

    -- ── 5. It joins the SAME verification gate as a workshop or supplier ──
    SELECT count(*) INTO n FROM identity.organization_registrations
     WHERE organization_id = r.o_organization_id
       AND kind = 'fleet' AND status = 'pending' AND submitted_by = v_user;
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/075 #5: the fleet was created but never queued '
                        'for verification — nobody will ever be asked to approve it';
    END IF;
    passed := passed + 1;

    -- ── 6. One organisation per person, and the refusal names a way out ───
    refused := false;
    BEGIN
        PERFORM identity.register_fleet(v_subject, 'Second Fleet', 'Depot 2');
    EXCEPTION WHEN others THEN
        refused := true;
        IF SQLERRM NOT LIKE '%already belongs to an organisation%' THEN
            RAISE EXCEPTION 'verify/075 #6: refused for the wrong reason: %', SQLERRM;
        END IF;
        -- Every refusal must name a reachable alternative.
        IF SQLERRM NOT LIKE '%different account%' AND SQLERRM NOT LIKE '%administrator%' THEN
            RAISE EXCEPTION 'verify/075 #6b: the refusal names no way forward: %', SQLERRM;
        END IF;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'verify/075 #6: one account registered two fleets';
    END IF;
    passed := passed + 1;

    -- ── CLEANUP ───────────────────────────────────────────────────────────
    -- The registration row before the organisation: 069 scopes it to the org.
    DELETE FROM identity.organization_registrations WHERE tenant_id = r.o_tenant_id;
    DELETE FROM identity.memberships   WHERE tenant_id = r.o_tenant_id;
    DELETE FROM identity.branches      WHERE tenant_id = r.o_tenant_id;
    DELETE FROM identity.organizations WHERE tenant_id = r.o_tenant_id;
    DELETE FROM identity.tenants       WHERE id = r.o_tenant_id;
    DELETE FROM identity.users         WHERE id = v_user;

    RAISE NOTICE 'verify/075: % / 5 passed. Check 4 is the evidence — a '
                 'fleet_administrator membership written by the PRODUCT, not by '
                 'a seed script.', passed;
END
$verify$;
