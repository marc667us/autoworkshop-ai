-- 054 — LIST A item A1: the organisation predicate the whole product was missing
--
-- ══════════════════════════════════════════════════════════════════════════
-- Found 2026-08-06 by counting policies, then PROVEN BEHAVIOURALLY by
-- `organisation-isolation.integration.spec.ts`:
--
--     AssertionError: organisation A can read a customer belonging to
--     organisation B of the same tenant: expected 1 to be +0
--
-- That is a real cross-organisation read at the database layer.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
--
-- Every RLS policy written before migration 045 filters on `tenant_id` ALONE:
--
--     USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
--
-- A tenant in this database holds MORE THAN ONE organisation — that is why 045
-- introduced `identity.current_organization_id()` in the first place, and why
-- verify/045 deliberately builds a SECOND organisation. So for the whole
-- original product — customers, vehicles, every `repair.*` table, finance,
-- warranty, parts, reception, media — two workshops under one tenant were
-- separated by the APPLICATION LAYER ALONE.
--
-- The application does carry `AND organization_id = $2` almost everywhere, so
-- this was a missing second line of defence rather than an open front door.
-- `COMPLETION_PLAN.md` §4 item 1 requires both, and says why: *tenant alone is
-- not isolation here.*
--
-- ── 🔴 WHY A **RESTRICTIVE** POLICY, AND NOT A REWRITE OF THE OLD ONES ─────
--
-- The obvious fix — edit ~150 existing policies to add the predicate — is the
-- wrong one, for a reason that is easy to get backwards:
--
--     POSTGRES COMBINES PERMISSIVE POLICIES WITH **OR**.
--
-- So simply ADDING an organisation-scoped permissive policy alongside the old
-- tenant-only one changes NOTHING: a row passes if EITHER matches, and the old
-- one still matches everything in the tenant. A half-done retrofit of that
-- shape would look completely correct in a diff and enforce nothing — the
-- "config reads correct while the mechanism is INERT" defect this repository
-- has recorded five or more times.
--
-- RESTRICTIVE policies are combined with **AND**. One per table therefore:
--
--   · leaves every existing policy exactly as it is — no bespoke logic
--     (`is_platform_admin`, the append-only guards, the media owner rules,
--     `assets_*`, `tenant_isolation`) is touched, re-derived or accidentally
--     dropped;
--   · applies to SELECT, INSERT, UPDATE and DELETE in one statement;
--   · cannot be satisfied by an older policy, because AND has no escape.
--
-- ── ⚠️ THE THREE THINGS THAT WOULD HAVE BROKEN, EACH CHECKED FIRST ────────
--
-- `identity.current_organization_id()` returns NULL when `app.organization_ids`
-- is unset, and `organization_id = NULL` is NULL — so the policy refuses
-- everything on any path with no organisation context. Before writing this:
--
--  1. **`withUser()`** (the marketplace buyer, who has no workshop) and
--     **`queryWithoutTenant()`** (health, the ledger, the public catalogue and
--     public workshop profile) — measured: NO policy on ANY of the 49 tables
--     below lacks a `current_tenant_id` predicate, so none of them has a public
--     or buyer-reachable read door. The buyer's own tables (`catalogue.*`) are
--     NOT in this list.
--  2. **The registration bootstrap** (036/037/038) — measured: it INSERTs into
--     `identity.*` only, and every `identity.*` table is excluded here.
--  3. **`withTenant()`** — `tenant-context.ts` sets `app.organization_ids` on
--     every single call, alongside `app.tenant_id`. That is the path all 49 of
--     these tables are reached by.
--
-- The platform-admin escape hatch is preserved explicitly, because
-- `identity.is_platform_admin()` is one throughout the rest of the schema and a
-- restrictive policy that omitted it would revoke it everywhere at once.

BEGIN;

DO $$
DECLARE
    t text;
    n int := 0;
    tables text[] := ARRAY[
        'core.customers',
        'core.organization_profile',
        'core.service_bays',
        'core.vehicles',
        'finance.credit_notes',
        'finance.invoice_lines',
        'finance.invoices',
        'finance.payments',
        'finance.receipts',
        'finance.refunds',
        'media.assets',
        'media.links',
        'parts.goods_receipts',
        'parts.purchase_order_lines',
        'parts.purchase_orders',
        'parts.purchase_requisitions',
        'parts.reservations',
        'parts.stock_items',
        'parts.stock_movements',
        'parts.tools',
        'reception.appointments',
        'reception.customer_feedback',
        'reception.vehicle_intakes',
        'reception.walk_ins',
        'repair.diagnoses',
        'repair.diagnostic_findings',
        'repair.execution_evidence',
        'repair.execution_parts_used',
        'repair.execution_tasks',
        'repair.execution_time_entries',
        'repair.inspection_items',
        'repair.inspections',
        'repair.job_card_stage_events',
        'repair.job_cards',
        'repair.quality_inspections',
        'repair.quotation_lines',
        'repair.quotations',
        'repair.repair_executions',
        'repair.repair_plan_resources',
        'repair.repair_plan_tasks',
        'repair.repair_plans',
        'repair.repair_proposals',
        'repair.repair_test_results',
        'repair.repair_test_sessions',
        'repair.repair_variations',
        'repair.variation_decisions',
        'warranty.claim_events',
        'warranty.claims',
        'warranty.policies'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        -- Belt and braces: ENABLE + FORCE. `ENABLE` without `FORCE` exempts the
        -- table OWNER, and Solar shipped exactly that — every policy correct and
        -- every policy inert. Idempotent, so re-running is harmless.
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_restrict', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s AS RESTRICTIVE FOR ALL '
            'USING (identity.is_platform_admin() '
            '       OR organization_id = identity.current_organization_id()) '
            'WITH CHECK (identity.is_platform_admin() '
            '       OR organization_id = identity.current_organization_id())',
            'org_restrict', t);
        n := n + 1;
    END LOOP;

    -- 🔴 THE MIGRATION CHECKS ITS OWN WORK. A loop that silently skipped a
    -- table would leave a hole nobody looked for again, and this list is long
    -- enough that nobody would notice one missing name.
    IF n <> array_length(tables, 1) THEN
        RAISE EXCEPTION '054 applied % policies for % tables', n, array_length(tables, 1);
    END IF;
    RAISE NOTICE '054: org_restrict applied to % tables', n;
END $$;

COMMIT;
