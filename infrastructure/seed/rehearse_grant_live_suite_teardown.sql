-- Teardown for `rehearse_grant_live_suite_fixture.sql`. LOCAL ONLY.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 NEVER RUN THIS ANYWHERE BUT A LOCAL DATABASE. It deletes the three
-- `[AUDIT]` organisations BY THEIR REAL PRODUCTION IDS, plus the tenant they
-- sit in. On production that is the operator's own tenant and their audit
-- fixtures. It exists solely to undo the rehearsal fixture on `aw-postgres`.
--
-- The rehearsal it belongs to is described in
-- `.claude/TASK_LIST_2026-08-19_pt5.md` §2: recreate the [AUDIT] shape locally
-- by its measured ids, run the grant script against it, and prove all four
-- behaviours (grant · idempotent re-run · reactivate a revoked row · REFUSE a
-- target that no longer matches) before letting it near Render.
--
-- ⚠️ IT DELETES MEMBERSHIPS FIRST, THEN ORGANISATIONS, THEN THE USER, THEN THE
-- TENANT. `memberships.tenant_id` is ON DELETE RESTRICT, so the reverse order
-- fails rather than cascading — which is the safe direction, but it means the
-- order here is load-bearing rather than stylistic.
-- ══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.current_role', 'admin', true);

DELETE FROM identity.memberships
 WHERE user_id = '11111111-1111-1111-1111-111111111111';

DELETE FROM identity.organizations
 WHERE id IN ('d7d30afd-a615-4c0b-a8d2-fa61c44570bb',
              'c5c43056-8920-47c9-8735-2d52e8ee3115',
              'f9dc95da-d225-49b2-a4ed-adae414e2b2d',
              -- the "role held in ANOTHER organisation" org, which is what
              -- makes the gate's masked-failure scenario reproducible
              '22222222-2222-2222-2222-222222222222');

DELETE FROM identity.users
 WHERE id = '11111111-1111-1111-1111-111111111111';

DELETE FROM identity.tenants
 WHERE id = '7adce423-8a76-49f0-8174-7b40b66ef8c5';

COMMIT;

-- Confirm nothing survived. Expect 0.
SELECT set_config('app.current_role', 'admin', false);
SELECT count(*) AS leftover_rehearsal_orgs
  FROM identity.organizations
 WHERE name LIKE '%REHEARSAL%' OR name LIKE '[AUDIT]%';
