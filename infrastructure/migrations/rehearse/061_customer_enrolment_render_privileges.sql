-- REHEARSAL — `identity.enrol_as_customer` under PRODUCTION's privilege shape.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 WHY THIS FILE EXISTS AT ALL: A GREEN LOCAL TEST OF THIS FUNCTION PROVES
--    NOTHING.
--
-- Locally the definer owner (`autoworkshop`) is `rolsuper=t, rolbypassrls=t`. A
-- SECURITY DEFINER function runs as its OWNER, so locally **no policy on any
-- table this function touches is ever consulted**. The bootstrap door, the
-- narrow org/branch SELECT policies, migration 054's RESTRICTIVE `org_restrict`
-- — none of them are exercised. The function would pass here even if every
-- policy were wrong.
--
-- That is not a hypothetical. Migration 036 passed 9/9 locally against a defect
-- that existed ONLY on production, where the same role is merely the table
-- OWNER and `FORCE ROW LEVEL SECURITY` therefore binds it. That cost a session
-- and produced a live 500 on `POST /registration/workshop`.
--
-- So this re-owns the functions and tables to a NOSUPERUSER NOBYPASSRLS role,
-- drives the enrolment **with no user and no tenant context**, and ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `identity.register_workshop` IS RE-OWNED TOO, AND IT IS NOT OPTIONAL.
-- `identity.in_registration_bootstrap()` (migration 038) opens the door only
-- when `current_user` equals the owner of `identity.register_workshop`. It does
-- NOT ask about the function actually running. So if only `enrol_as_customer`
-- were re-owned, the door would stay shut and this rehearsal would report a
-- failure that production will not have — both functions share one owner there.
-- That coupling is worth knowing about: 038's guard is "am I a definer function
-- owned by the registration owner", spelled as one specific regprocedure.
--
-- ⚠️ EVERYTHING IS ROLLED BACK — CREATE ROLE, ALTER ... OWNER and every seeded
-- row. Re-owning takes an ACCESS EXCLUSIVE lock for the transaction, which is
-- why the guard below refuses to run against anything but a local database.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 < infrastructure/migrations/rehearse/061_customer_enrolment_render_privileges.sql

\set ON_ERROR_STOP on

BEGIN;

DO $rehearse$
DECLARE
    sim_role   TEXT := 'rehearse_061_nobypass';
    v_tenant   uuid;
    v_org      uuid;
    v_branch   uuid;
    v_stranger uuid;
    v_staff    uuid;
    v_sub      TEXT := 'rehearse-061-stranger-subject';
    v_staffsub TEXT := 'rehearse-061-staff-subject';
    r          RECORD;
    n          INT;
    passes     INT := 0;
    fails      INT := 0;
BEGIN
    -- ── fail-closed guard ──────────────────────────────────────────────────
    -- A truncation is not a redaction and a warning is not a guard: this
    -- REFUSES rather than advising. Re-owning live tables would lock them.
    IF current_database() NOT IN ('autoworkshop', 'autoworkshop_test') THEN
        RAISE EXCEPTION 'rehearse/061 refuses to run on database % — LOCAL development only', current_database();
    END IF;
    IF inet_server_addr() IS NOT NULL
       AND NOT (inet_server_addr() << inet '127.0.0.0/8'
             OR inet_server_addr() << inet '172.16.0.0/12'
             OR inet_server_addr() << inet '192.168.0.0/16'
             OR inet_server_addr() << inet '10.0.0.0/8') THEN
        RAISE EXCEPTION 'rehearse/061 refuses to run against the non-private server % — it takes DDL locks', inet_server_addr();
    END IF;

    -- ── build production's privilege shape ─────────────────────────────────
    EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', sim_role);
    -- The current superuser must be a member to SET ROLE into it.
    EXECUTE format('GRANT %I TO CURRENT_USER', sim_role);

    -- ⚠️ OWNERSHIP IS NOT ACCESS. Re-owning a table gives the role implicit
    -- rights ON THAT TABLE, but reaching it still needs USAGE on the schema,
    -- and the function calls helpers (`identity.in_registration_bootstrap`,
    -- `identity.current_organization_id`) that migrations 027/038 REVOKEd from
    -- PUBLIC. Without these grants the rehearsal dies on `permission denied for
    -- schema identity` and proves nothing about RLS — a failure of the harness
    -- reading exactly like a failure of the product. This repository has lost
    -- hours to that distinction before.
    EXECUTE format('GRANT USAGE ON SCHEMA identity, catalogue, core TO %I', sim_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity, catalogue, core TO %I', sim_role);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA identity, catalogue TO %I', sim_role);

    EXECUTE format('ALTER FUNCTION identity.enrol_as_customer(TEXT, uuid) OWNER TO %I', sim_role);
    EXECUTE format('ALTER FUNCTION identity.register_workshop(TEXT, TEXT, TEXT) OWNER TO %I', sim_role);
    EXECUTE format('ALTER TABLE identity.memberships   OWNER TO %I', sim_role);
    EXECUTE format('ALTER TABLE identity.organizations OWNER TO %I', sim_role);
    EXECUTE format('ALTER TABLE identity.branches      OWNER TO %I', sim_role);
    EXECUTE format('ALTER TABLE identity.users         OWNER TO %I', sim_role);
    EXECUTE format('ALTER TABLE catalogue.mechanic_directory OWNER TO %I', sim_role);

    -- ── seed: a workshop, published; a stranger; a staff member ────────────
    -- Seeded as the superuser BEFORE dropping privileges, so the fixture itself
    -- never depends on the door being open.
    SELECT o.tenant_id, o.id, b.id INTO v_tenant, v_org, v_branch
      FROM identity.organizations o
      LEFT JOIN identity.branches b ON b.organization_id = o.id AND b.status = 'active'
     WHERE o.status = 'active'
     ORDER BY o.created_at
     LIMIT 1;

    IF v_org IS NULL THEN
        RAISE EXCEPTION 'rehearse/061: no active organisation — run scripts/seed-dev-identity.sh first';
    END IF;

    INSERT INTO catalogue.mechanic_directory (organization_id, trading_name, city, country, is_published)
    VALUES (v_org, 'Rehearsal Motors', 'Accra', 'GH', TRUE)
    ON CONFLICT (organization_id) DO UPDATE SET is_published = TRUE;

    INSERT INTO identity.users (keycloak_subject, email, display_name, status)
    VALUES (v_sub, 'rehearse-061-stranger@example.test', 'Rehearsal Stranger', 'active')
    RETURNING id INTO v_stranger;

    INSERT INTO identity.users (keycloak_subject, email, display_name, status)
    VALUES (v_staffsub, 'rehearse-061-staff@example.test', 'Rehearsal Staff', 'active')
    RETURNING id INTO v_staff;

    INSERT INTO identity.memberships
        (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_tenant, v_org, v_branch, v_staff, 'technician', 'active', v_staff);

    -- ── drop to the non-bypassing role, with NO user and NO tenant context ──
    EXECUTE format('SET LOCAL ROLE %I', sim_role);

    IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
        RAISE EXCEPTION 'rehearse/061: acting role % still bypasses RLS — this rehearsal proves nothing', current_user;
    END IF;
    RAISE NOTICE 'acting as %, bypassrls=false, no app.* context set', current_user;

    -- ── 1. a stranger enrols at a PUBLISHED workshop ───────────────────────
    BEGIN
        SELECT * INTO r FROM identity.enrol_as_customer(v_sub, v_org);
        IF r.o_membership_id IS NOT NULL AND r.o_created AND r.o_tenant_id = v_tenant THEN
            passes := passes + 1;
            RAISE NOTICE 'PASS 1 — enrolled with no context; membership %, tenant %', r.o_membership_id, r.o_tenant_id;
        ELSE
            fails := fails + 1;
            RAISE WARNING 'FAIL 1 — enrolment returned created=% membership=%', r.o_created, r.o_membership_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails + 1;
        RAISE WARNING 'FAIL 1 — enrolment RAISED under production privileges: %. This is the 036 failure mode.', SQLERRM;
    END;

    -- ── 2. the row really is a `customer`, and really is committed ─────────
    -- Read as the superuser: the point is what EXISTS, not what the enrolling
    -- caller can see. Checking through the same door that wrote it would be a
    -- check walking through its own gap.
    RESET ROLE;
    SELECT count(*) INTO n
      FROM identity.memberships
     WHERE user_id = v_stranger AND organization_id = v_org
       AND role_name = 'customer' AND status = 'active';
    IF n = 1 THEN
        passes := passes + 1;
        RAISE NOTICE 'PASS 2 — exactly one active customer membership exists';
    ELSE
        fails := fails + 1;
        RAISE WARNING 'FAIL 2 — expected exactly 1 customer membership, found %', n;
    END IF;
    EXECUTE format('SET LOCAL ROLE %I', sim_role);

    -- ── 3. idempotent: the funnel calls this on every visit ────────────────
    BEGIN
        SELECT * INTO r FROM identity.enrol_as_customer(v_sub, v_org);
        IF NOT r.o_created AND r.o_membership_id IS NOT NULL THEN
            passes := passes + 1;
            RAISE NOTICE 'PASS 3 — second call returned the existing row, created=false';
        ELSE
            fails := fails + 1;
            RAISE WARNING 'FAIL 3 — second call reported created=% — a duplicate or a failure', r.o_created;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        fails := fails + 1;
        RAISE WARNING 'FAIL 3 — the idempotent path RAISED: %', SQLERRM;
    END;

    RESET ROLE;
    SELECT count(*) INTO n
      FROM identity.memberships
     WHERE user_id = v_stranger AND organization_id = v_org AND role_name = 'customer';
    IF n = 1 THEN
        passes := passes + 1;
        RAISE NOTICE 'PASS 4 — still exactly one row after the second call';
    ELSE
        fails := fails + 1;
        RAISE WARNING 'FAIL 4 — % customer membership rows after two calls', n;
    END IF;

    -- ── 5. an UNPUBLISHED workshop cannot be joined ────────────────────────
    -- Constraint 2 in migration 061: publishing is the workshop's consent.
    UPDATE catalogue.mechanic_directory SET is_published = FALSE WHERE organization_id = v_org;
    DELETE FROM identity.memberships WHERE user_id = v_stranger AND organization_id = v_org;
    EXECUTE format('SET LOCAL ROLE %I', sim_role);
    BEGIN
        SELECT * INTO r FROM identity.enrol_as_customer(v_sub, v_org);
        fails := fails + 1;
        RAISE WARNING 'FAIL 5 — enrolled into an UNPUBLISHED workshop. Any stranger can join any tenant.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%not accepting customers%' THEN
            passes := passes + 1;
            RAISE NOTICE 'PASS 5 — refused an unpublished workshop: %', SQLERRM;
        ELSE
            fails := fails + 1;
            RAISE WARNING 'FAIL 5 — refused, but for the WRONG reason: %', SQLERRM;
        END IF;
    END;

    -- ── 6. the role is a literal — a staff account is never converted ──────
    RESET ROLE;
    UPDATE catalogue.mechanic_directory SET is_published = TRUE WHERE organization_id = v_org;
    EXECUTE format('SET LOCAL ROLE %I', sim_role);
    BEGIN
        SELECT * INTO r FROM identity.enrol_as_customer(v_staffsub, v_org);
        fails := fails + 1;
        RAISE WARNING 'FAIL 6 — a technician was given a customer membership at their own workshop';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%already has a role%' THEN
            passes := passes + 1;
            RAISE NOTICE 'PASS 6 — refused a staff account: %', SQLERRM;
        ELSE
            fails := fails + 1;
            RAISE WARNING 'FAIL 6 — refused, but for the WRONG reason: %', SQLERRM;
        END IF;
    END;

    -- ── 7. the door is SHUT again afterwards ───────────────────────────────
    -- The function leaves the caller's transaction open, so a flag left set
    -- would hand the rest of it a bypass nobody asked for.
    IF COALESCE(current_setting('app.bootstrap', true), '') = 'on' THEN
        fails := fails + 1;
        RAISE WARNING 'FAIL 7 — app.bootstrap is STILL on after the function returned';
    ELSE
        passes := passes + 1;
        RAISE NOTICE 'PASS 7 — app.bootstrap cleared on every exit path';
    END IF;

    -- ── 8. the app role cannot forge the door (migration 038) ──────────────
    -- The whole point of `in_registration_bootstrap()`. `set_config` is not
    -- privileged, so without 038 the application role could open the door and
    -- INSERT a membership with no function in the call path.
    --
    -- 🔴 THIS MUST RUN AS `autoworkshop_app`, AND THE FIRST VERSION DID NOT.
    -- It ran as `sim_role`, which by construction OWNS `register_workshop` —
    -- so `in_registration_bootstrap()` returned TRUE and the check reported a
    -- catastrophic forgery that cannot happen in production, where the
    -- application connects as `autoworkshop_app` and is NOT the definer owner.
    -- A check that walks through its own gap and calls the result a finding is
    -- worse than no check: it spends a session on a defect that does not exist.
    RESET ROLE;
    SET LOCAL ROLE autoworkshop_app;
    IF current_user <> 'autoworkshop_app' THEN
        RAISE EXCEPTION 'rehearse/061 check 8 is not acting as the application role (current_user=%)', current_user;
    END IF;
    PERFORM set_config('app.bootstrap',      'on',           true);
    PERFORM set_config('app.bootstrap_user', v_stranger::text, true);
    BEGIN
        INSERT INTO identity.memberships
            (tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
        VALUES (v_tenant, v_org, v_branch, v_stranger, 'workshop_owner', 'active', v_stranger);
        fails := fails + 1;
        RAISE WARNING 'FAIL 8 — forged the bootstrap door WITHOUT a definer function and minted workshop_owner';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        passes := passes + 1;
        RAISE NOTICE 'PASS 8 — the raw settings alone do not open the door';
    WHEN OTHERS THEN
        IF SQLERRM LIKE '%row-level security%' OR SQLERRM LIKE '%policy%' THEN
            passes := passes + 1;
            RAISE NOTICE 'PASS 8 — refused by policy: %', SQLERRM;
        ELSE
            fails := fails + 1;
            RAISE WARNING 'FAIL 8 — unexpected error: %', SQLERRM;
        END IF;
    END;
    PERFORM set_config('app.bootstrap', '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RESET ROLE;
    RAISE NOTICE '────────────────────────────────────────';
    RAISE NOTICE 'rehearse/061: % passed, % failed', passes, fails;
    IF fails > 0 THEN
        RAISE EXCEPTION 'rehearse/061 FAILED (% of % checks)', fails, passes + fails;
    END IF;
END
$rehearse$;

-- ⚠️ ROLLBACK, NEVER COMMIT. The role, the ownership changes and every seeded
-- row disappear with the transaction.
ROLLBACK;
