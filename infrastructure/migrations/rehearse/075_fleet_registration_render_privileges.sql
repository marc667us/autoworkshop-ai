-- REHEARSAL — run migration 075's registration path under RENDER'S PRIVILEGE
-- SHAPE, on the LOCAL database, inside a transaction that is ROLLED BACK.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 WHY THIS FILE EXISTS
--
-- `verify/075` passes. It proves the behaviour and it proves nothing about
-- production, because measured on this machine:
--
--     proname                        | owner        | rolbypassrls
--     register_workshop              | autoworkshop | t
--     register_fleet                 | autoworkshop | t
--     alert_admins_of_registration   | autoworkshop | t
--
-- A SECURITY DEFINER function runs as its OWNER. Locally that owner holds
-- BYPASSRLS, so migration 037's bootstrap policies are never consulted and a
-- green verify proves only that the SQL parses. On Render the owner is an
-- ordinary role and every identity table is FORCE ROW LEVEL SECURITY — the one
-- setting that stops even the owner being exempt.
--
-- This is not a hypothetical. On 2026-08-09 the admin-alert trigger was found
-- INERT on Render for exactly this reason: the local owner saw 2 administrators
-- and a NOBYPASSRLS role saw 0, so every registration would have been queued
-- with nobody told. The rehearsal that missed it ran as the bypassing owner —
-- while quoting that scar in the migration's own header.
--
-- ── HOW THE SHAPE IS REPRODUCED ───────────────────────────────────────────
--
-- A throwaway role is created NOSUPERUSER NOBYPASSRLS and the three definer
-- functions are re-owned to it. That reproduces three facts at once:
--
--   · the definers run as a role that CANNOT bypass RLS;
--   · `in_registration_bootstrap()` still matches, because it compares
--     `current_user` to the owner of `register_workshop` and BOTH move
--     together — re-owning only `register_fleet` would slam the door and
--     produce a false failure;
--   · the tables are FORCE RLS, so being the owner grants no exemption.
--
-- ⚠️ EVERYTHING IS ROLLED BACK. CREATE ROLE, ALTER FUNCTION ... OWNER and the
-- seeded rows are all transactional in PostgreSQL, so this WRITES NOTHING THAT
-- SURVIVES. Run it as the migration owner:
--
--   docker exec -i aw-postgres psql -v ON_ERROR_STOP=1 -U autoworkshop \
--     -d autoworkshop < infrastructure/migrations/rehearse/075_fleet_registration_render_privileges.sql
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE ROLE aw_rehearse_075 NOSUPERUSER NOBYPASSRLS NOLOGIN NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA identity TO aw_rehearse_075;
GRANT SELECT, INSERT, UPDATE ON
    identity.users,
    identity.tenants,
    identity.organizations,
    identity.branches,
    identity.memberships,
    identity.organization_registrations
  TO aw_rehearse_075;

-- The alert trigger writes a notification; give the rehearsal role what the
-- real owner would have, or the failure would be a privilege error rather than
-- the RLS answer we are here to observe.
GRANT USAGE ON SCHEMA comms TO aw_rehearse_075;
GRANT SELECT, INSERT, UPDATE ON comms.notifications TO aw_rehearse_075;

-- ⚠️ AND EXECUTE ON THE POLICY HELPERS. Every policy on these tables calls
-- `identity.is_platform_admin()`, `current_tenant_id()` and friends, and a
-- policy that cannot call its own helper raises `permission denied for
-- function` — which looks like an RLS refusal and is not one. The real owner on
-- Render holds these; withholding them here would make the rehearsal fail for a
-- reason production does not have, and a rehearsal that fails wrongly gets
-- deleted rather than believed.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA identity TO aw_rehearse_075;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA comms    TO aw_rehearse_075;

-- 🔴 ALL THREE MOVE TOGETHER. See the header: the bootstrap door is pinned to
-- the owner of `register_workshop`.
ALTER FUNCTION identity.register_workshop(text, text, text) OWNER TO aw_rehearse_075;
ALTER FUNCTION identity.register_fleet(text, text, text)    OWNER TO aw_rehearse_075;
ALTER FUNCTION identity.alert_admins_of_registration()      OWNER TO aw_rehearse_075;

DO $rehearse$
DECLARE
    v_subject TEXT := 'rehearse-075-' || replace(gen_random_uuid()::text, '-', '');
    v_user    uuid := gen_random_uuid();
    r         record;
    n         int;
    v_before  int;
    v_admins  int;
BEGIN
    -- Confirm the shape really is Render's before trusting anything below. A
    -- rehearsal that quietly ran as a bypassing role is worse than no
    -- rehearsal: it manufactures confidence.
    IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'aw_rehearse_075') THEN
        RAISE EXCEPTION 'rehearse/075: the throwaway role bypasses RLS — this '
                        'would prove nothing';
    END IF;
    IF (SELECT r2.rolname FROM pg_proc p JOIN pg_roles r2 ON r2.oid = p.proowner
         WHERE p.oid = 'identity.register_fleet(text,text,text)'::regprocedure)
       <> 'aw_rehearse_075' THEN
        RAISE EXCEPTION 'rehearse/075: register_fleet was not re-owned';
    END IF;

    -- Counted BEFORE the call. A delta cannot be fooled by guessing which
    -- column the alert stamps its resource id into — two earlier drafts of this
    -- check filtered on the wrong `event_key` and then on the wrong
    -- `resource_id`, and BOTH reported "no alert" against an alert that fired.
    SELECT count(*) INTO v_before FROM comms.notifications
     WHERE event_key = 'organization.registered';

    SELECT count(*) INTO v_admins FROM identity.memberships
     WHERE role_name = 'platform_administrator' AND status = 'active';

    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (v_user, v_subject, v_subject || '@example.test', 'Rehearse 075', 'active');

    -- ── THE CALL, under Render's privileges ───────────────────────────────
    SELECT * INTO r FROM identity.register_fleet(v_subject, 'Rehearse Haulage', 'Depot');

    SELECT count(*) INTO n FROM identity.memberships
     WHERE id = r.o_membership_id AND role_name = 'fleet_administrator' AND status = 'active';
    IF n <> 1 THEN
        RAISE EXCEPTION 'rehearse/075: NO fleet_administrator membership under '
                        'Render''s privilege shape. 037''s bootstrap policies '
                        'refused an INSERT that succeeds locally as a superuser — '
                        'registration would fail on the first real sign-up.';
    END IF;

    SELECT count(*) INTO n FROM identity.organization_registrations
     WHERE organization_id = r.o_organization_id AND kind = 'fleet' AND status = 'pending';
    IF n <> 1 THEN
        RAISE EXCEPTION 'rehearse/075: the fleet was created but NOT queued for '
                        'verification under Render''s privileges';
    END IF;

    RAISE NOTICE 'rehearse/075: register_fleet works under NOBYPASSRLS — '
                 'membership and verification queue row both written.';

    -- ── 🔴 AND THE ALERT: THE 08-09 DEFECT, MEASURED RATHER THAN ASSUMED ──
    --
    -- On 2026-08-09 this trigger was INERT on Render: the local owner saw 2
    -- administrators and a NOBYPASSRLS role saw 0, so every registration was
    -- queued with nobody told. Here the whole definer chain runs as a
    -- NOBYPASSRLS role, so a zero below is the real answer.
    SELECT count(*) INTO n FROM comms.notifications
     WHERE event_key = 'organization.registered';
    n := n - v_before;

    IF v_admins = 0 THEN
        RAISE WARNING 'rehearse/075 ⚠️  VACUOUS: there are no active platform '
                      'administrators in this database, so the alert had nobody '
                      'to write to. This check proved NOTHING.';
    ELSIF n < v_admins THEN
        RAISE EXCEPTION 'rehearse/075: % administrator(s) are active but only % '
                        'alert(s) were written under Render''s privilege shape. '
                        'The alert is INERT for some of them, exactly as it was '
                        'on 08-09 — registrations would be queued with nobody told.',
                        v_admins, n;
    ELSE
        RAISE NOTICE 'rehearse/075: % alert(s) written for % administrator(s) '
                     'under NOBYPASSRLS — the 08-09 defect does not recur here.',
                     n, v_admins;
    END IF;

    -- 🔴 AND THE ALERT MUST SAY **FLEET**. 070's trigger reads
    -- `CASE kind WHEN 'supplier' THEN 'parts supplier' ELSE 'workshop' END`, so
    -- widening `kind` without touching it announces a haulage company as a
    -- workshop and tells the administrator that approving it publishes to the
    -- mechanic directory. Giving a value a new meaning means re-checking every
    -- path that already produces it.
    SELECT count(*) INTO n FROM comms.notifications
     WHERE event_key = 'organization.registered'
       AND subject LIKE '%fleet operator%'
       AND subject LIKE '%Rehearse Haulage%';
    IF n = 0 AND v_admins > 0 THEN
        RAISE EXCEPTION 'rehearse/075: the alert does not say [%]. It says [%]. '
                        'Either 070''s CASE has no fleet branch, or the '
                        'organisation name could not be read under NOBYPASSRLS '
                        'and the alert reads "unnamed" — both have happened.',
                        'fleet operator: Rehearse Haulage',
                        (SELECT subject FROM comms.notifications
                          WHERE event_key = 'organization.registered'
                          ORDER BY created_at DESC LIMIT 1);
    END IF;
    RAISE NOTICE 'rehearse/075: the alert names the KIND and the ORGANISATION '
                 'correctly under NOBYPASSRLS.';

END
$rehearse$;

-- ⚠️ ROLLBACK, NOT COMMIT. The ownership changes above would otherwise leave
-- production definers owned by a throwaway role.
ROLLBACK;
