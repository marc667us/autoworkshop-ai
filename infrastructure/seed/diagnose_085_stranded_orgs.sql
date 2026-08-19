-- Read-only: WHICH two organisations does 085's backfill refuse to promote, and WHY?
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 THE MIGRATION IS NOT WRONG. IT REFUSED, WHICH IS WHAT IT IS FOR.
--
-- `apply-migrations` run 32252947622, 2026-08-19, against production:
--
--   NOTICE:  085: promoted 1 founder membership(s) to the org-admin role
--   ERROR:   085 would leave 2 insurance/towing organisation(s) with no member
--            who can grant a membership. The founder rule (earliest membership
--            AND created_by = user_id) did not match those organisations.
--            Inspect them before re-running — do NOT relax the rule to
--            role_name alone, which would promote every assessor.
--
-- 085's own comments spell out why the rule is written the way it is: relaxing
-- it to `role_name = 'insurance_assessor'` would promote EVERY assessor in the
-- organisation to administrator — turning a fix for a missing write path into a
-- privilege escalation. So the answer is not to loosen the predicate; it is to
-- find out what these two organisations actually look like.
--
-- The rule, restated, is a conjunction over the organisation's memberships:
--   · the membership is the organisation's EARLIEST (rank 1 by created_at), AND
--   · `created_by = user_id` on that same row (self-created — nobody else could
--     have created it, because the organisation did not exist a moment before).
--
-- Something in production breaks one of those. This file asks which, rather
-- than guessing — five confident diagnoses were wrong on 2026-08-13 and each
-- cost a cycle.
--
-- ── 🔴 WHY `is_local = false` AND NOT `true` ──────────────────────────────
--
-- `identity.memberships` and `identity.organizations` are under FORCE ROW LEVEL
-- SECURITY, and on Render the owner is NOT a superuser, so without the platform
-- escape every SELECT below returns ZERO ROWS and this file reports a clean
-- database that is nothing of the sort.
--
-- `set_config(..., true)` is TRANSACTION-LOCAL, and each psql statement outside
-- an explicit transaction IS its own transaction — so the context would be
-- discarded before the next statement ran. That exact mistake was made on
-- 2026-08-16: the diagnostic printed `(0 rows)` and was read as "the grant is
-- missing" when the grant had been active for six days. `false` makes it
-- session-scoped, which is what a psql script needs.
--
-- 🔴 READ-ONLY. Every statement is a SELECT. It writes nothing and needs no
-- confirm input, which is the point: a diagnostic nobody can run without
-- ceremony does not get run.
-- ══════════════════════════════════════════════════════════════════════════

\pset pager off
\timing off

SELECT set_config('app.current_role', 'admin', false) AS platform_context;

\echo ''
\echo '=== 0. Can we see anything at all? (if these are 0, the escape failed) ==='
SELECT current_user                                              AS running_as,
       (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
       (SELECT count(*) FROM identity.organizations)             AS organizations_visible,
       (SELECT count(*) FROM identity.memberships)               AS memberships_visible;

\echo ''
\echo '=== 1. Every insurance/towing organisation, and whether 085 would strand it ==='
-- `stranded` reproduces the guard's own predicate exactly, so this table says
-- which two rows produced the count in the error message.
SELECT o.id,
       o.name,
       o.org_type,
       o.status,
       o.created_at,
       EXISTS (SELECT 1 FROM identity.memberships m
                WHERE m.organization_id = o.id
                  AND m.tenant_id      = o.tenant_id
                  AND m.status         = 'active'
                  AND m.role_name IN ('insurance_owner','towing_owner')) AS has_owner_role,
       (SELECT count(*) FROM identity.memberships m
         WHERE m.organization_id = o.id AND m.tenant_id = o.tenant_id)   AS memberships_total,
       (SELECT count(*) FROM identity.memberships m
         WHERE m.organization_id = o.id AND m.tenant_id = o.tenant_id
           AND m.status = 'active')                                      AS memberships_active
  FROM identity.organizations o
 WHERE o.org_type IN ('insurance_company','towing_company')
 ORDER BY o.status, o.org_type, o.created_at;

\echo ''
\echo '=== 2. THE ANSWER: every membership of each STRANDED org, ranked ==='
-- 🔴 THIS IS THE ONE TO READ. For each organisation the guard would strand,
-- every membership in `created_at` order with the two halves of the founder
-- rule broken out:
--
--   is_earliest      -- rank 1 by created_at (the ordering 085 uses)
--   is_self_created  -- created_by = user_id
--
-- A row with `is_earliest = t` and `is_self_created = f` is the documented
-- second defect Codex found in 085's first draft: the organisation's first
-- member was created by SOMEBODY ELSE. 085 deliberately refuses to skip past it
-- to a later self-created row, because doing so promotes an ordinary assessor.
WITH stranded AS (
    SELECT o.id, o.tenant_id, o.name, o.org_type
      FROM identity.organizations o
     WHERE o.org_type IN ('insurance_company','towing_company')
       AND o.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM identity.memberships m
                        WHERE m.organization_id = o.id
                          AND m.tenant_id      = o.tenant_id
                          AND m.status         = 'active'
                          AND m.role_name IN ('insurance_owner','towing_owner'))
)
SELECT s.name                              AS org_name,
       s.org_type,
       m.id                                AS membership_id,
       m.role_name,
       m.status                            AS membership_status,
       m.created_at,
       row_number() OVER (PARTITION BY m.organization_id ORDER BY m.created_at) = 1
                                           AS is_earliest,
       (m.created_by = m.user_id)          AS is_self_created,
       m.user_id,
       m.created_by,
       u.email                             AS member_email,
       cb.email                            AS created_by_email
  FROM stranded s
  JOIN identity.memberships m ON m.organization_id = s.id AND m.tenant_id = s.tenant_id
  LEFT JOIN identity.users u  ON u.id  = m.user_id
  LEFT JOIN identity.users cb ON cb.id = m.created_by
 ORDER BY s.name, m.created_at;

\echo ''
\echo '=== 3. Were these registered by the product, or seeded by hand? ==='
-- A registration row means `identity.register_insurer` / `register_towing_operator`
-- created it, and those DO write `created_by = user_id`. Its ABSENCE points at a
-- hand-seeded or UAT fixture organisation, which is a very different remedy: a
-- fixture can be corrected or removed, a real customer cannot.
SELECT o.name,
       o.org_type,
       o.status                    AS org_status,
       r.id                        AS registration_id,
       r.status                    AS registration_status,
       r.created_at                AS registered_at
  FROM identity.organizations o
  LEFT JOIN identity.organization_registrations r
         ON r.organization_id = o.id AND r.tenant_id = o.tenant_id
 WHERE o.org_type IN ('insurance_company','towing_company')
 ORDER BY o.created_at;

\echo ''
\echo '=== 4. What the registration functions write TODAY (for comparison) ==='
-- If production drifted from the repository the way `register_workshop` did on
-- 2026-08-14, the founder rule may be failing because the deployed function does
-- not set created_by at all. Checked rather than assumed.
SELECT p.proname,
       (pg_get_functiondef(p.oid) LIKE '%created_by%')                   AS mentions_created_by,
       (pg_get_functiondef(p.oid) LIKE '%insurance_owner%')              AS writes_insurance_owner,
       (pg_get_functiondef(p.oid) LIKE '%towing_owner%')                 AS writes_towing_owner,
       (pg_get_functiondef(p.oid) LIKE '%insurance_assessor%')           AS writes_insurance_assessor,
       (pg_get_functiondef(p.oid) LIKE '%towing_operator%')              AS writes_towing_operator
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'identity'
   AND p.proname IN ('register_insurer','register_towing_operator')
 ORDER BY p.proname;

\echo ''
\echo '=== 5. Applied migration count, so the next session need not guess ==='
SELECT count(*) AS migrations_applied,
       max(version) AS highest_version
  FROM public.schema_migrations;
