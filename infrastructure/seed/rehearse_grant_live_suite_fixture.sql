-- Local-only rehearsal fixture for grant_live_suite_partner_memberships.sql.
--
-- ══════════════════════════════════════════════════════════════════════════
-- Mirrors the three `[AUDIT]` organisations BY THEIR MEASURED PRODUCTION IDS
-- (diagnose-live-identity-roles.yml run 32293446882) so the script under test
-- meets the exact shape it will meet on Render — a rehearsal against
-- differently-shaped data proves nothing about the guards, which are written
-- in terms of those ids.
--
-- 🔴 NEVER RUN AGAINST PRODUCTION. Undone by
-- `rehearse_grant_live_suite_teardown.sql`, which deletes these rows by the
-- same ids and is equally local-only.
--
-- What the rehearsal established, 2026-08-19 (see
-- `.claude/TASK_LIST_2026-08-19_pt5.md` §2): grant · idempotent re-run ·
-- a revoked row REACTIVATED · and a target that no longer matches REFUSED by
-- organisation id with the transaction rolled back.
-- ══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.current_role', 'admin', true);

INSERT INTO identity.tenants (id, name, slug, status)
VALUES ('7adce423-8a76-49f0-8174-7b40b66ef8c5', 'REHEARSAL Tenant', 'rehearsal-a3', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.organizations (id, tenant_id, name, org_type, status) VALUES
  ('d7d30afd-a615-4c0b-a8d2-fa61c44570bb', '7adce423-8a76-49f0-8174-7b40b66ef8c5', '[AUDIT] Insurance Company', 'insurance_company', 'active'),
  ('c5c43056-8920-47c9-8735-2d52e8ee3115', '7adce423-8a76-49f0-8174-7b40b66ef8c5', '[AUDIT] Towing Company',    'towing_company',    'active'),
  ('f9dc95da-d225-49b2-a4ed-adae414e2b2d', '7adce423-8a76-49f0-8174-7b40b66ef8c5', '[AUDIT] Fleet Operator',    'fleet_operator',    'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'rehearsal-a3-subject',
        'rehearsal-live-owner@example.invalid', 'Rehearsal Live Suite Owner', 'active')
ON CONFLICT (id) DO NOTHING;

COMMIT;
