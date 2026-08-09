-- 075 — a fleet operator could not exist in production either
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 THE THIRD TIME. Asked of the role BEFORE building any of fleet-web's 29
-- screens, exactly as 08-09 asked it of `supplier_owner` and 08-08 of
-- `customer`: **which production code path WRITES a `fleet_administrator`
-- membership?**
--
--     None.
--
-- `identity.memberships` has four writers and this was checked against
-- `pg_proc`, not against a grep of the source:
--
--     register_workshop   → always 'workshop_owner'
--     register_supplier   → always 'supplier_owner'
--     enrol_as_customer   → always 'customer'
--     MembershipService.grant()  → admin-only, and needs an organisation that
--                                  already exists with a member who can grant
--
-- And no path creates a `fleet_operator` ORGANISATION either: the two
-- registration functions hard-code `individual_workshop` / `multi_branch_
-- workshop` and `parts_supplier`, and `organization_registrations.kind` is
-- `CHECK (kind IN ('workshop','supplier'))`.
--
-- So `fleet_administrator` was in `ROLE_PRECEDENCE`, in `GRANTABLE_ROLES`, in
-- `CAN_GRANT_MEMBERSHIP`, in `CAN_CREATE_ORG`, in the permission matrix, in
-- `NON_WORKSHOP_ROLES`, and it owned a 29-entry navigation tree — and nothing
-- could create one. `CAN_CREATE_ORG` even lists it, which is circular: you must
-- already BE a fleet administrator to create the organisation that would make
-- you one.
--
-- Building the 29 screens first would have shipped an app whose every route
-- 401s for the only role that is supposed to reach it, and it would have passed
-- every test, because `seed-dev-identity.sh` writes memberships with raw SQL.
-- That is the supplier defect verbatim, one session later.
--
-- ── WHAT THIS MIGRATION IS, AND IS NOT ────────────────────────────────────
--
-- It is the missing door: `identity.register_fleet`, a near-copy of
-- `register_supplier` with two literals changed and the same verification queue
-- entry. It is deliberately NOT the fleet domain schema — vehicles,
-- maintenance plans, approvals and downtime are the next migration. The door
-- comes first because until it exists none of that is reachable.
--
-- ── ⚠️ THE LITERALS ARE THE WHOLE MIGRATION ───────────────────────────────
--
-- `'fleet_operator'` is one of the ten values `organizations_org_type_check`
-- admits, and `'fleet_administrator'` is spelled exactly as
-- `permission-matrix.ts`, `ROLE_PRECEDENCE`, `viewer-contract.ts` and the fleet
-- navigation tree expect. A merely plausible name — `fleet`, `fleet_owner`,
-- `fleet_admin` — resolves to no tree and no permissions, and the registrant
-- lands in an organisation they can see nothing in. That is the
-- `quality_controller` defect, which failed CLOSED for months. Both are
-- LITERALS here, never parameters, and verify/075 asserts them by name.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── 1. The verification queue learns a third kind ─────────────────────────
--
-- A fleet joins the SAME admin gate as a workshop and a supplier: it works in
-- its own organisation immediately and is invisible in any public registry
-- until approved. Adding the row without widening this CHECK would make
-- `register_fleet` fail on its last statement — at runtime, on a real
-- registrant, long after this migration reported success.
ALTER TABLE identity.organization_registrations
    DROP CONSTRAINT organization_registrations_kind_check;
ALTER TABLE identity.organization_registrations
    ADD CONSTRAINT organization_registrations_kind_check
    CHECK (kind IN ('workshop', 'supplier', 'fleet'));

-- ── 2. The door ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION identity.register_fleet(
    p_subject       TEXT,
    p_fleet_name    TEXT,
    p_location_name TEXT
)
-- ⚠️ THE `o_` PREFIX IS LOAD-BEARING — 061's note. A `RETURNS TABLE` column is
-- an ordinary plpgsql variable inside the body, so a column named
-- `organization_id` makes every unqualified reference ambiguous, and plpgsql
-- resolves identifiers when the statement FIRST EXECUTES. The failure is at
-- runtime; `CREATE FUNCTION` reports success either way.
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

    -- ── the door opens here, and only here ─────────────────────────────────
    -- Transaction-local, so a pooled connection cannot carry the flag into the
    -- next request even on an abort. Cleared explicitly as well, because the
    -- SUCCESS path leaves the caller's transaction open.
    PERFORM set_config('app.bootstrap',      'on',         true);
    PERFORM set_config('app.bootstrap_user', v_user::text, true);

    -- One organisation per person. AFTER the flag is set: under FORCE RLS with
    -- no tenant context this read returns zero rows for everybody, so placing
    -- it earlier would make it a check that cannot fire — the bug migration 037
    -- fixed in `register_workshop`.
    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        -- ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. A rule with no way past
        -- it is a wall, and the person in front of it files a bug rather than
        -- acting.
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
'Refuses an account that already belongs to an organisation. Before this '
'function existed NO production code path could create a fleet_administrator '
'membership or a fleet_operator organisation at all.';

-- 🔴 EXECUTE GRANTED TO THE APPLICATION ROLE AND REVOKED FROM PUBLIC. A
-- SECURITY DEFINER function reachable by PUBLIC is reachable by every role in
-- the database, including any future read-only or reporting role.
REVOKE ALL ON FUNCTION identity.register_fleet(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.register_fleet(TEXT, TEXT, TEXT) TO autoworkshop_app;

-- ── 3. PROVE THE BOOTSTRAP DOOR ACTUALLY OPENS FOR THIS FUNCTION ──────────
--
-- 🔴 THE ONE FAILURE `CREATE FUNCTION` WOULD NOT REPORT.
-- `in_registration_bootstrap()` admits a caller only when `current_user` equals
-- the owner of `register_workshop`. A SECURITY DEFINER function runs as its OWN
-- owner, so if this file were applied by a different role than 037 was, every
-- INSERT above would be refused by 037's policies — at runtime, on a real
-- fleet's first sign-up, long after this migration reported success.
DO $guard$
DECLARE
    v_workshop_owner text;
    v_fleet_owner    text;
BEGIN
    SELECT r.rolname INTO v_workshop_owner
      FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
     WHERE p.oid = 'identity.register_workshop(text,text,text)'::regprocedure;

    SELECT r.rolname INTO v_fleet_owner
      FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
     WHERE p.oid = 'identity.register_fleet(text,text,text)'::regprocedure;

    IF v_workshop_owner IS DISTINCT FROM v_fleet_owner THEN
        RAISE EXCEPTION
            'register_fleet is owned by % but register_workshop by %. '
            'in_registration_bootstrap() pins the bootstrap door to the latter, so '
            'every INSERT in register_fleet would be refused by 037''s policies at '
            'runtime. Nothing has been applied.',
            v_fleet_owner, v_workshop_owner;
    END IF;

    -- And it must really be SECURITY DEFINER. Created as INVOKER it would run
    -- as `autoworkshop_app`, the bootstrap door would never open, and the first
    -- sign-up would fail on the tenants INSERT.
    IF NOT (SELECT p.prosecdef FROM pg_proc p
             WHERE p.oid = 'identity.register_fleet(text,text,text)'::regprocedure) THEN
        RAISE EXCEPTION
            'register_fleet is not SECURITY DEFINER — the bootstrap door cannot '
            'open for it. Nothing has been applied.';
    END IF;
END
$guard$;


-- ── 4. THE ADMIN ALERT LEARNS THE THIRD KIND ──────────────────────────────
--
-- 🔴 FOUND BY THE REHEARSAL, NOT BY READING. Migration 070's trigger builds the
-- message with
--
--     v_kind := CASE NEW.kind WHEN 'supplier' THEN 'parts supplier'
--                             ELSE 'workshop' END;
--
-- so the moment section 1 above widened `kind`, every fleet registration
-- announced itself to administrators as **"Verify a new workshop: City
-- Haulage"**, and the body told them approving it publishes to the *mechanic
-- directory*. Observed verbatim before this fix.
--
-- That is the "give a value a NEW meaning, then re-check every path that
-- already produces it" lesson, and the mechanism is a silent `ELSE` — the same
-- shape as a default branch that swallows an unhandled case. The replacement
-- has no silent default: an unrecognised kind names itself.
--
-- ⚠️ THE BODY IS THE REST OF 070/072'S FUNCTION, UNCHANGED. It is reproduced in
-- full because `CREATE OR REPLACE FUNCTION` has no partial form; the only
-- edits are the two CASE expressions, both commented inline.

CREATE OR REPLACE FUNCTION identity.alert_admins_of_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'identity', 'comms', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_admin   RECORD;
    v_org     TEXT;
    v_kind    TEXT;
    v_written integer := 0;
BEGIN
    IF NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    -- 🔴 THE NAME IS UNREADABLE WITHOUT OPENING A DOOR, AND NOBODY NOTICED.
    --
    -- Found by rehearse/075 under NOBYPASSRLS: this SELECT returned NULL and
    -- every alert read **"Verify a new workshop: unnamed"**. Locally the
    -- definer's owner is a superuser and reads the name fine, which is why the
    -- defect has been live for workshop AND supplier registrations since 070
    -- without ever showing up.
    --
    -- The three policies on `identity.organizations` are: `tenant_isolation`
    -- (needs a tenant context, and registration has none), a bootstrap policy
    -- that is INSERT-only, and `enrolment_bootstrap_select`, which admits
    -- exactly one organisation — the one named by `app.bootstrap_org`. No
    -- registration function ever set it.
    --
    -- So the existing mechanism is reused rather than a new policy invented,
    -- and it is CLEARED immediately: the caller's transaction continues after
    -- this trigger returns and must not keep a read exemption it never asked
    -- for. This fixes all three kinds, not just fleet.
    PERFORM set_config('app.bootstrap_org', NEW.organization_id::text, true);

    SELECT o.name INTO v_org
      FROM identity.organizations o
     WHERE o.id = NEW.organization_id;

    PERFORM set_config('app.bootstrap_org', '', true);

    v_kind := CASE NEW.kind
                WHEN 'supplier' THEN 'parts supplier'
                WHEN 'fleet'    THEN 'fleet operator'
                WHEN 'workshop' THEN 'workshop'
                -- 🔴 NO SILENT `ELSE`. This read `ELSE 'workshop'`, so 075
                -- widening `kind` made every fleet announce itself as a
                -- workshop. An unknown kind now names itself rather than
                -- impersonating the default.
                ELSE NEW.kind
              END;

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
                CASE NEW.kind
                  WHEN 'supplier' THEN 'parts marketplace'
                  -- A fleet is not published to a public registry at all;
                  -- approval is what lets it trade, so the sentence must not
                  -- promise a directory listing it will never appear in.
                  WHEN 'fleet'    THEN 'platform as a verified fleet operator'
                  ELSE 'mechanic directory'
                END
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
$function$;;

COMMIT;
