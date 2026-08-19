-- Read-only: which identity does the live suite sign in as, and what can it act as?
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 WHY THIS EXISTS. Live-suite run 32290511884 found the role switcher
-- ABSENT for the signed-in account:
--
--     getByLabel('Acting as role')  ->  element(s) not found
--
-- `RoleSwitcher` renders nothing below two roles, so the control is absent
-- rather than broken. The conclusion drawn was that `LIVE_OWNER_EMAIL` is a CI
-- test identity holding ONE role — which makes the signed-in half of the suite
-- structurally unable to verify any partner-role screen (insurance, towing,
-- fleet).
--
-- ⚠️ THAT CONCLUSION WAS INFERRED FROM A MISSING DOM NODE. It is consistent
-- with `RoleSwitcher`'s source and with the recorded test identities, and it is
-- still an inference. Before writing memberships into production on the back of
-- it, ASK THE DATABASE. Reasoning from source has been wrong twice this week.
--
-- ⚠️ AND THE SECRET IS NOT READABLE HERE. `LIVE_OWNER_EMAIL` is a repository
-- secret; this file cannot know its value, so it lists every plausible
-- candidate — the recorded `live-*@aiappinvent.com` identities and the
-- operator's own account — with the membership count that decides whether a
-- switcher renders at all.
--
-- 🔴 READ-ONLY. Every statement is a SELECT.
-- ══════════════════════════════════════════════════════════════════════════

\pset pager off
\timing off

-- Session-scoped, NOT transaction-local: each psql statement outside an
-- explicit transaction is its own transaction, so `true` would be discarded
-- before the next one ran. That mistake made an 08-16 diagnostic print
-- `(0 rows)` against a populated table.
SELECT set_config('app.current_role', 'admin', false) AS platform_context;

\echo ''
\echo '=== 0. can we see anything? (0 here means the escape failed) ==='
SELECT current_user AS running_as,
       (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
       (SELECT count(*) FROM identity.users)       AS users_visible,
       (SELECT count(*) FROM identity.memberships) AS memberships_visible;

\echo ''
\echo '=== 1. CANDIDATE IDENTITIES, and how many ACTIVE roles each holds ==='
-- 🔴 `active_roles` IS THE ANSWER. `RoleSwitcher` returns null below 2, so any
-- account showing 1 here cannot verify a partner-role screen no matter how many
-- times the suite runs.
SELECT u.email,
       u.display_name,
       u.status,
       count(m.id) FILTER (WHERE m.status = 'active')                       AS active_memberships,
       count(DISTINCT m.role_name) FILTER (WHERE m.status = 'active')       AS active_roles,
       string_agg(DISTINCT m.role_name, ', ') FILTER (WHERE m.status = 'active') AS roles
  FROM identity.users u
  LEFT JOIN identity.memberships m ON m.user_id = u.id
 WHERE u.email ILIKE '%aiappinvent.com'
    OR u.email ILIKE '%yahoo.com'
 GROUP BY u.id, u.email, u.display_name, u.status
 ORDER BY active_roles DESC, u.email;

\echo ''
\echo '=== 2. the [AUDIT] partner organisations, and who is in them ==='
-- These are the organisations a CI identity would need memberships in for the
-- A3 checks to assert rather than skip.
SELECT o.name,
       o.org_type,
       o.id                AS organization_id,
       o.tenant_id,
       u.email             AS member,
       m.role_name,
       m.status
  FROM identity.organizations o
  LEFT JOIN identity.memberships m ON m.organization_id = o.id AND m.tenant_id = o.tenant_id
  LEFT JOIN identity.users u       ON u.id = m.user_id
 WHERE o.org_type IN ('insurance_company', 'towing_company', 'fleet_operator')
 ORDER BY o.org_type, o.name, u.email;

\echo ''
\echo '=== 3. what a fleet membership would even be worth — is there a fleet org? ==='
-- Slice 20 built nine fleet screens. If no fleet_operator organisation exists on
-- production, no signed-in viewer can reach them at all, which is a separate
-- finding from the switcher one.
SELECT count(*) FILTER (WHERE org_type = 'fleet_operator')    AS fleet_orgs,
       count(*) FILTER (WHERE org_type = 'insurance_company') AS insurance_orgs,
       count(*) FILTER (WHERE org_type = 'towing_company')    AS towing_orgs
  FROM identity.organizations
 WHERE status = 'active';
