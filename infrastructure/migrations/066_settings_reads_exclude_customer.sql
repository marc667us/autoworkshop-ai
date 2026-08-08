-- 066 — `org_select` on the two PUBLISHABLE settings tables forgot the customer
--
-- ══════════════════════════════════════════════════════════════════════════
-- 045 wrote `org_select` for seven `core.*` settings tables in one DO loop:
--
--     USING (identity.is_platform_admin()
--            OR (tenant_id = identity.current_tenant_id()
--                AND organization_id = identity.current_organization_id()))
--
-- Tenant AND organisation, and NO role clause. That was written when every
-- membership in a workshop's organisation belonged to a colleague. Migration
-- 061 made `customer` a SELF-SERVICE role — any signed-up stranger can now
-- enrol at any workshop published in `catalogue.mechanic_directory` — and a
-- customer's active organisation IS THE WORKSHOP'S. So the organisation arm is
-- TRUE for them and this policy admits them.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 WHAT A CUSTOMER COULD READ THROUGH IT ──────────────────────────────
--
-- `SettingsService.listServiceCategories` and `listOpeningHours` carry no
-- `is_published` / `is_active` predicate, so the rows behind this policy are
-- the workshop's DRAFT and DEACTIVATED service catalogue — `indicative_price`
-- and `currency` per category, i.e. the internal price list reception quotes
-- from — plus opening hours it has not agreed to show anybody. See
-- `authz/workshop-roles.ts` for why organisation-scoped RLS structurally
-- cannot tell a customer apart from the staff they buy from.
--
-- ── ⚠️ ONLY THESE TWO TABLES, AND ONLY THIS ONE POLICY ────────────────────
--
-- The other five tables 045 covers (`approval_limits`, `document_templates`,
-- `notification_preferences`, `workflow_rules`, `integrations`) are NOT
-- touched here. Their service methods already refuse a customer by role
-- (`assertMayReadConfig` / `assertMayGovern`), and widening this change into
-- them would be a second change hiding inside a security fix. They are worth a
-- policy of their own later; that is a separate migration with its own
-- evidence, not a line added here.
--
-- `org_insert`, `org_update` and `org_delete` are untouched for the same
-- reason: a customer already cannot reach them, because every WRITE in
-- `SettingsService` calls `assertMayAdminister` or `assertMayGovern`.
--
-- ── ⚠️ `public_read` IS PRESERVED EXACTLY, AND IT STILL MATTERS ────────────
--
-- 045 also gave these two tables:
--
--     public_read ON core.opening_hours      USING (is_published)
--     public_read ON core.service_categories USING (is_published AND is_active)
--
-- Neither is dropped or recreated here. They exist so a STRANGER with no
-- tenant context at all can read a workshop's published profile through
-- `GET /public/workshops/:organizationId/profile`, which is the only reader
-- outside the workspace and the reason the flags exist.
--
-- 🔴 SO BE PRECISE ABOUT WHAT THIS POLICY CHANGE DOES AND DOES NOT DO.
-- Permissive policies OR together. After this migration a customer session
-- still matches `public_read` and can therefore still see PUBLISHED, ACTIVE
-- rows — which is correct, because a stranger can see those too. What it
-- removes from a customer is the DRAFT and DEACTIVATED rows, which no other
-- policy admits them to. The refusal of the `/settings/*` ROUTES themselves is
-- the service's job and is made in the same change: `listOpeningHours` and
-- `listServiceCategories` now call `assertMayReadConfig`, exactly as their five
-- sibling reads already did. Neither layer is a substitute for the other
-- (CLAUDE.md §7) and this comment does not claim the policy alone closes the
-- route.
--
-- ── ⚠️ 045 IS NOT EDITED ──────────────────────────────────────────────────
--
-- `run.sh` records and CHECKSUMS every applied migration precisely so the live
-- schema cannot drift from the history. Editing an already-applied file would
-- make it disagree with its recorded checksum and block every later migration.
-- Fixes go in the next number, always. 062 did the same thing to 059's
-- `supplier_request_select`, and this is written from that worked example.
--
-- No table, column, index, grant or trigger changes here. Two policies are
-- replaced, and only their organisation arm differs from 045.

BEGIN;

DROP POLICY IF EXISTS org_select ON core.service_categories;
CREATE POLICY org_select ON core.service_categories FOR SELECT USING (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      -- ── THE ONLY DIFFERENCE FROM 045 ────────────────────────────────────
      -- A customer of this workshop is inside this organisation and must not
      -- read its unpublished catalogue or its indicative prices. Same clause,
      -- same spelling, as `supplier_request_select` in 062.
      AND identity.current_role_name() <> 'customer')
);

DROP POLICY IF EXISTS org_select ON core.opening_hours;
CREATE POLICY org_select ON core.opening_hours FOR SELECT USING (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      -- As above. Draft opening hours are a rota the workshop has not agreed
      -- to publish; the published ones remain readable through `public_read`.
      AND identity.current_role_name() <> 'customer')
);

COMMIT;
