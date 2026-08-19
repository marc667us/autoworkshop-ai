-- One-off: let the live-suite identity REACH the partner workspaces.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 WHAT THIS CLOSES — A3, AND ONLY HALF OF IT.
--
-- `diagnose-live-identity-roles.yml` run 32293446882 asked production rather
-- than inferring, and the inference held:
--
--   live-owner@aiappinvent.com   1 active membership   1 active role
--                                roles: workshop_owner
--   marc667us@yahoo.com          7 active memberships  7 active roles
--
-- So the signed-in half of the live suite holds ONE role and `RoleSwitcher`
-- renders nothing below two. Four A3 checks skip, and four screens built in
-- slices 17 and 20 are unverified by any signed-in viewer.
--
-- The three `[AUDIT]` partner organisations are the ones the operator already
-- uses, and each has exactly one member — the operator:
--
--   [AUDIT] Insurance Company  d7d30afd-…  insurance_company  insurance_owner
--   [AUDIT] Towing Company     c5c43056-…  towing_company     towing_owner
--   [AUDIT] Fleet Operator     f9dc95da-…  fleet_operator     fleet_administrator
--
-- All three live in tenant 7adce423-8a76-49f0-8174-7b40b66ef8c5. The live-suite
-- account lives in its OWN tenant, so these memberships are deliberately
-- CROSS-TENANT — which `identity.memberships` represents natively (`users` is
-- not tenant-scoped, by the comment in migration 001) and which the operator's
-- own account does not exercise, because all seven of its roles sit in one
-- tenant.
--
-- ── 🔴 WHY GRANTING THE MEMBERSHIPS IS NOT, BY ITSELF, THE FIX ────────────
--
-- The resume pointer prescribed exactly this write and stopped there. Read
-- against source, that would have been INERT:
--
--   viewer-contract.ts:470   if (m.organizationId !== organizationId) continue;
--
-- `rolesFromMemberships` is SCOPED TO THE ACTIVE ORGANISATION, deliberately —
-- every request sends `x-organization-id` AND `x-role-name` together and
-- `resolveTenantContext` requires ONE membership matching BOTH, so offering a
-- role held only elsewhere would offer a pair the API refuses. A role held in
-- another organisation therefore NEVER appears in the role switcher, no matter
-- how many memberships this script writes.
--
-- ▶ The control that crosses organisations is the ORGANISATION switcher, and
--   changing organisation CLEARS the stored role (`set-organization-action.ts`)
--   so the API re-defaults to the strongest role held in the new organisation.
--   The harness change is in `apps/e2e/tests/live-signed-in.spec.ts`, and
--   WITHOUT IT this script changes nothing a test can observe.
--
-- ── ⚠️ WHY THE DEFAULT LANDING DOES NOT MOVE ─────────────────────────────
--
-- `resolveTenantContext` defaults by ROLE AUTHORITY first, organisation id only
-- as a tie-break. In `ROLE_PRECEDENCE`, `workshop_owner` is index 1 and outranks
-- `supplier_owner`(2), `fleet_administrator`(3), `insurance_owner`(4) and
-- `towing_owner`(5); only `platform_administrator`(0) beats it. So after this
-- runs, the live-suite account still signs in to its own workshop, and the four
-- currently-passing signed-in checks keep passing. That was checked BEFORE
-- writing, because adding memberships to the account the suite signs in as is
-- exactly the kind of change that turns a green suite red for a reason nobody
-- expects.
--
-- ── ⚠️ THE E-MAIL IS NOT HARDCODED HERE ──────────────────────────────────
--
-- `LIVE_OWNER_EMAIL` is a repository secret. This script takes it as
-- `:live_email` from the workflow, which reads the SAME secret the live suite
-- signs in with — so the account provisioned, the account granted and the
-- account tested cannot drift apart. A literal in this file could.
--
-- ⚠️ AND IT IS RE-EXPORTED AS A GUC IMMEDIATELY BELOW, WHICH IS NOT
-- REDUNDANT. psql substitutes `:'live_email'` in ordinary statement text but
-- NOT inside dollar-quoted bodies, so a `:'live_email'` written inside the
-- `DO $grant$ … $grant$` block below would be sent to the server verbatim and
-- fail to parse. The blocks read `current_setting('live.email')` instead.
--
-- 🔴 EVERY WRITE IS GUARDED BY THE FULL SHAPE THAT WAS MEASURED — organisation
-- id, tenant id, org_type, active status — and is idempotent through the
-- natural key. If production has moved since the diagnostic, nothing is written
-- and the gate says so rather than reporting success.
-- ══════════════════════════════════════════════════════════════════════════

\pset pager off
\set ON_ERROR_STOP on

BEGIN;

-- Transaction-local: this IS one transaction, so `true` is correct. The
-- diagnostic needed `false` because each of its statements was its own
-- transaction; copying that here would leak the setting past COMMIT.
SELECT set_config('app.current_role', 'admin', true) AS platform_context;

-- The e-mail, carried across the dollar-quoting boundary. `true` again: it must
-- not outlive this transaction.
SELECT set_config('live.email', :'live_email', true) AS live_email;

\echo ''
\echo '=== BEFORE — what the live-suite identity holds ==='
SELECT u.email, o.name AS organization, o.org_type, m.role_name, m.status
  FROM identity.users u
  LEFT JOIN identity.memberships m   ON m.user_id = u.id
  LEFT JOIN identity.organizations o ON o.id = m.organization_id
 WHERE u.email = :'live_email'
 ORDER BY o.name;

DO $grant$
DECLARE
    -- Measured 2026-08-19 by diagnose-live-identity-roles.yml run 32293446882.
    v_tenant    uuid := '7adce423-8a76-49f0-8174-7b40b66ef8c5';
    v_ins_org   uuid := 'd7d30afd-a615-4c0b-a8d2-fa61c44570bb';
    v_tow_org   uuid := 'c5c43056-8920-47c9-8735-2d52e8ee3115';
    v_fleet_org uuid := 'f9dc95da-d225-49b2-a4ed-adae414e2b2d';
    v_email     text := current_setting('live.email', true);
    v_user      uuid;
    v_changed   int;
    v_total     int := 0;
BEGIN
    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'live.email is not set — the workflow did not pass '
                        '-v live_email, so this script does not know which account '
                        'to grant. Refusing rather than guessing.';
    END IF;

    -- ── resolve the account, and REFUSE on anything but exactly one ───────
    -- A LIKE or a "first match" here could grant partner authority to the
    -- wrong person. `identity.users` is not tenant-scoped, so an e-mail is the
    -- only handle — it must therefore resolve to exactly one active row or
    -- this stops.
    SELECT id INTO v_user
      FROM identity.users
     WHERE email = v_email AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no ACTIVE identity.users row with e-mail %. LIVE_OWNER_EMAIL '
                        'names an account that does not exist on production — run '
                        'provision-live-suite-account.yml first, or the secret is wrong.',
                        v_email;
    END IF;

    RAISE NOTICE 'granting partner memberships to % (%)', v_email, v_user;

    -- ── the three grants ─────────────────────────────────────────────────
    -- One statement per organisation rather than a loop over a VALUES list:
    -- each names its own org_type, so a mistyped pairing (a towing role into
    -- the insurance organisation) cannot insert anything. A loop would make
    -- all three share one predicate and lose exactly that check.
    --
    -- `ON CONFLICT` on the natural key `(organization_id, user_id, role_name)`
    -- makes a re-run a no-op, so `0 granted` on the second run is SUCCESS.
    --
    -- `created_by` is left NULL, deliberately. Naming a grantor would write a
    -- claim about history this script cannot establish — the same reasoning
    -- that made repair_audit_org_founders.sql set the role rather than
    -- backfill `created_by`. The existing [AUDIT] rows are NULL too.
    --
    -- `tenant_id` comes from the ORGANISATION ROW, never from a literal or from
    -- the user's own tenant. A membership whose tenant disagrees with its
    -- organisation is the shape RLS cannot express and every join would then
    -- silently drop.
    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
    SELECT o.tenant_id, o.id, v_user, 'insurance_owner', 'active'
      FROM identity.organizations o
     WHERE o.id        = v_ins_org
       AND o.tenant_id = v_tenant
       AND o.org_type  = 'insurance_company'
       AND o.status    = 'active'
    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RAISE NOTICE 'insurance: % membership(s) granted', v_changed;
    v_total := v_total + v_changed;

    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
    SELECT o.tenant_id, o.id, v_user, 'towing_owner', 'active'
      FROM identity.organizations o
     WHERE o.id        = v_tow_org
       AND o.tenant_id = v_tenant
       AND o.org_type  = 'towing_company'
       AND o.status    = 'active'
    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RAISE NOTICE 'towing: % membership(s) granted', v_changed;
    v_total := v_total + v_changed;

    INSERT INTO identity.memberships (tenant_id, organization_id, user_id, role_name, status)
    SELECT o.tenant_id, o.id, v_user, 'fleet_administrator', 'active'
      FROM identity.organizations o
     WHERE o.id        = v_fleet_org
       AND o.tenant_id = v_tenant
       AND o.org_type  = 'fleet_operator'
       AND o.status    = 'active'
    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RAISE NOTICE 'fleet: % membership(s) granted', v_changed;
    v_total := v_total + v_changed;

    RAISE NOTICE 'total granted this run: % (0 on a re-run is expected)', v_total;
END;
$grant$;

-- ── THE GATE: assert the END STATE, not the row count ─────────────────────
--
-- 🔴 THIS IS WHAT MAKES THE WRITE MEANINGFUL. Inserting rows is not the goal;
-- the goal is that a signed-in viewer can REACH the insurance, towing and fleet
-- workspaces. So the end state is asserted here and the transaction ROLLS BACK
-- if it is not true — rather than reporting success and leaving the live suite
-- to skip again twenty minutes later.
--
-- It asserts the ORGANISATION count as well as the roles, because the
-- organisation switcher is the control the harness actually drives and it too
-- renders nothing below two options.
DO $gate$
DECLARE
    v_email   text := current_setting('live.email', true);
    v_orgs    int;
    v_roles   text[];
    v_missing text[];
BEGIN
    PERFORM set_config('app.current_role', 'admin', true);

    SELECT count(DISTINCT m.organization_id),
           array_agg(DISTINCT m.role_name)
      INTO v_orgs, v_roles
      FROM identity.users u
      JOIN identity.memberships m ON m.user_id = u.id AND m.status = 'active'
     WHERE u.email = v_email;

    SELECT array_agg(r) INTO v_missing
      FROM unnest(ARRAY['insurance_owner','towing_owner','fleet_administrator']) AS r
     WHERE NOT (r = ANY(COALESCE(v_roles, ARRAY[]::text[])));

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'the grants did not take: % still missing for %. The [AUDIT] '
                        'organisations have changed shape since run 32293446882 — '
                        're-run diagnose-live-identity-roles.yml and re-measure the ids.',
                        v_missing, v_email;
    END IF;

    -- The organisation switcher renders nothing below two options, so this is
    -- the harness's actual precondition — not a restatement of the roles check.
    IF v_orgs < 2 THEN
        RAISE EXCEPTION 'the account holds % organisation(s); the organisation switcher '
                        'renders nothing below two, so the harness still could not reach '
                        'a partner workspace.', v_orgs;
    END IF;

    RAISE NOTICE 'gate passed: % organisations, roles %', v_orgs, v_roles;
END;
$gate$;

\echo ''
\echo '=== AFTER — what the live-suite identity holds now ==='
SELECT u.email, o.name AS organization, o.org_type, m.role_name, m.status
  FROM identity.users u
  JOIN identity.memberships m   ON m.user_id = u.id
  JOIN identity.organizations o ON o.id = m.organization_id
 WHERE u.email = :'live_email'
 ORDER BY o.name;

COMMIT;
