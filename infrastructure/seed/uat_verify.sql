-- Read the UAT population back. Writes nothing.
--
-- ⚠️ ITS OWN FILE, AND THE WORKFLOW RUNS IT UNGATED. On 2026-08-10 a seeder's
-- write and its read-back were gated on the same APPLY input, so the only run
-- that could print the result was the run that wrote it — and that run's query
-- turned out to be invalid SQL while the write had already committed. Green,
-- and proving nothing. This can be run at any time, by anyone, to ask the
-- database what is actually there.
--
-- Every count is scoped by the TAG in the organisation name, so it can never
-- accidentally report the owner's real workshop as UAT data.

\set ON_ERROR_STOP on
\pset format aligned

-- 🔴 THIS READ MUST OPEN THE SAME DOOR THE WRITE DID, AND THE FIRST VERSION
-- DID NOT. It reported 0 for all twenty measures on production against a seed
-- run that had just printed "UAT population written" — a verification that
-- lied, which is this repository's most-repeated defect shape.
--
-- The data was there. The QUERY could not see it. Every table below is under
-- ENABLE + FORCE ROW LEVEL SECURITY, and the `tenant_isolation` policy admits
-- a row only when `identity.is_platform_admin()` is true or the row's tenant
-- matches the request's. `is_platform_admin()` requires BOTH halves:
--
--     identity.current_role_name() = 'admin'
--     AND current_user = <owner of identity.platform_administrators>
--
-- `uat_population.sql` sets the GUC; this file did not, so the escape never
-- opened. It passed LOCALLY because the local `autoworkshop` role is a
-- SUPERUSER and bypasses RLS altogether — the exact local/Render privilege
-- difference this repository has recorded repeatedly. Reproduced by running
-- the same query under `SET ROLE autoworkshop_app`, which returned 0 locally
-- too.
--
-- ⚠️ TRANSACTION-LOCAL (`true`), so it needs a transaction — and the pairing
-- with `current_user` is what makes this safe to write here at all: the GUC
-- alone confers nothing, because any role can set it. The escape belongs to
-- whoever holds the OWNER credential, which is this workflow and migrations,
-- and to nothing reachable from the application connection.
BEGIN;
SELECT set_config('app.current_role', 'admin', true);

WITH ws AS (
    SELECT o.id AS org, o.tenant_id AS t
      FROM identity.organizations o
      JOIN identity.tenants tn ON tn.id = o.tenant_id
     WHERE tn.name LIKE '%UAT-2026-08-14%'
       AND o.org_type = 'individual_workshop'
)
SELECT * FROM (
    SELECT  1 AS ord, 'workshops'                 AS use_case, count(*)::text AS actual, '1'  AS expected FROM ws
    UNION ALL SELECT  2, 'customers enrolled (requested service)', count(*)::text, '10'
      FROM identity.memberships m JOIN ws ON ws.org = m.organization_id
     WHERE m.role_name = 'customer' AND m.status = 'active'
    UNION ALL SELECT  3, 'technicians', count(*)::text, '5'
      FROM identity.memberships m JOIN ws ON ws.org = m.organization_id
     WHERE m.role_name = 'technician' AND m.status = 'active'
    UNION ALL SELECT  4, 'service requests', count(*)::text, '10'
      FROM reception.service_requests s JOIN ws ON ws.org = s.organization_id
    UNION ALL SELECT  5, 'job cards', count(*)::text, '10'
      FROM repair.job_cards j JOIN ws ON ws.org = j.organization_id
    UNION ALL SELECT  6, 'inspection reports (submitted)', count(*)::text, '10'
      FROM repair.inspections x JOIN ws ON ws.org = x.organization_id WHERE x.status = 'submitted'
    UNION ALL SELECT  7, 'diagnoses (approved)', count(*)::text, '10'
      FROM repair.diagnoses x JOIN ws ON ws.org = x.organization_id WHERE x.status = 'approved'
    UNION ALL SELECT  8, 'repair work completed', count(*)::text, '10'
      FROM repair.repair_executions x JOIN ws ON ws.org = x.organization_id WHERE x.status = 'completed'
    UNION ALL SELECT  9, 'final testing reports', count(*)::text, '10'
      FROM repair.repair_test_sessions x JOIN ws ON ws.org = x.organization_id WHERE x.status = 'submitted'
    UNION ALL SELECT 10, 'quality control passed', count(*)::text, '10'
      FROM repair.quality_inspections x JOIN ws ON ws.org = x.organization_id WHERE x.status = 'passed'
    UNION ALL SELECT 11, 'invoices paid', count(*)::text, '10'
      FROM finance.invoices x JOIN ws ON ws.org = x.organization_id WHERE x.status = 'paid'
    UNION ALL SELECT 12, 'payments received (GHS)', COALESCE(to_char(sum(p.amount), 'FM999999.00'), '0'), '>0'
      FROM finance.payments p JOIN ws ON ws.org = p.organization_id
    UNION ALL SELECT 13, 'stock items (technician availability view)', count(*)::text, '8'
      FROM parts.stock_items x JOIN ws ON ws.org = x.organization_id
    UNION ALL SELECT 14, 'stock issued to jobs (movements)', count(*)::text, '10'
      FROM parts.stock_movements sm JOIN ws ON ws.org = sm.organization_id
     WHERE sm.movement_kind = 'issue_to_job'
    UNION ALL SELECT 15, 'purchase requisitions', count(*)::text, '4'
      FROM parts.purchase_requisitions x JOIN ws ON ws.org = x.organization_id
    UNION ALL SELECT 16, 'purchase orders', count(*)::text, '4'
      FROM parts.purchase_orders x JOIN ws ON ws.org = x.organization_id
    UNION ALL SELECT 17, 'goods receipts', count(*)::text, '4'
      FROM parts.goods_receipts x JOIN ws ON ws.org = x.organization_id
    UNION ALL SELECT 18, 'supplier catalogue parts (published)', count(*)::text, '8'
      FROM catalogue.parts p
      JOIN catalogue.suppliers s ON s.id = p.supplier_id
      JOIN identity.organizations o ON o.id = s.organization_id
     WHERE o.name LIKE '%UAT-2026-08-14%' AND p.is_published
    UNION ALL SELECT 19, 'fleet firms', count(*)::text, '2'
      FROM identity.organizations o
     WHERE o.org_type = 'fleet_operator' AND o.name LIKE '%UAT-2026-08-14%'
    UNION ALL SELECT 20, 'fleet vehicles registered', count(*)::text, '20'
      FROM core.vehicles v JOIN identity.organizations o ON o.id = v.organization_id
     WHERE o.org_type = 'fleet_operator' AND o.name LIKE '%UAT-2026-08-14%'
    -- 🔴 REPORTED AS ZERO RATHER THAN OMITTED. The owner asked for an insurance
    -- sales pipeline and a marketing campaign; there is no production path for
    -- either, so this row exists to say so on every run instead of the absence
    -- being mistaken for an oversight.
    UNION ALL SELECT 21, 'insurance pipeline / campaign (NO PRODUCTION PATH)', '0', 'n/a'
) rows
ORDER BY ord;

COMMIT;
