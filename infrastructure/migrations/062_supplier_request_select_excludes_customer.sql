-- 062 — the SELECT policy on `parts.supplier_requests` forgot the customer
--
-- ══════════════════════════════════════════════════════════════════════════
-- 059 wrote three policies for this table. Two of them carry
-- `identity.current_role_name() <> 'customer'` on the tenant/organisation arm:
--
--   supplier_request_insert  ... AND identity.current_role_name() <> 'customer' ...
--   supplier_request_update  ... AND identity.current_role_name() <> 'customer' ...  (USING and WITH CHECK)
--
-- and `supplier_request_select` does not. Nothing in 059's text argues for the
-- difference; it reads as three policies written in a row where the clause was
-- typed into the last two. The effect is this repository's most-repeated shape:
-- EVERY WRITE WAS GATED AND THE READ WAS NOT.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 WHY THE ORGANISATION ARM IS NOT ALREADY ENOUGH ─────────────────────
--
-- `customer` is a real, grantable membership role (`authz/permission-matrix.ts`)
-- and a customer's active organisation IS THE WORKSHOP'S. So
-- `organization_id = identity.current_organization_id()` is TRUE for them, and
-- the SELECT arm admitted them to every parts request the workshop had ever
-- raised: which supplier was asked, what the supplier quoted (`quote_minor` —
-- the price the workshop PAYS, before the margin the customer is billed),
-- how long the part takes, and the free-text `notes` written between staff and
-- a supplier. See `authz/workshop-roles.ts` for why RLS structurally cannot
-- separate the two: row-level security here is organisation-scoped, and a
-- customer is inside the organisation.
--
-- ── ⚠️ THE OTHER TWO ARMS ARE PRESERVED EXACTLY ───────────────────────────
--
-- `identity.is_platform_admin()` — the platform administrator is not inside any
-- one workshop and must keep reading across them.
--
-- `parts.current_user_supplies(supplier_id)` — the SUPPLIER's arm, and it is a
-- MEMBERSHIP test rather than an organisation one on purpose: a supplier is not
-- an organisation in this schema at all (`catalogue.suppliers` is the
-- platform-wide directory that makes this a marketplace). Narrowing it, or
-- accidentally AND-ing the customer clause onto it, would empty every
-- supplier's inbox — `SupplierRequestService.listForSupplier` relies on this
-- arm for the whole of its result. The clause is added to the tenant/org arm
-- ONLY, which is the arm the customer was walking through.
--
-- ── STATED IN BOTH LAYERS, DELIBERATELY (CLAUDE.md §7) ────────────────────
--
-- `SupplierRequestService.listForWorkshop` gains `assertWorkshopStaff` in the
-- same change. The service is the first line of defence and produces a sentence
-- a person can act on; this policy is the final one and holds even if a future
-- caller forgets. Neither is a substitute for the other.
--
-- ── ⚠️ 059 IS NOT EDITED ──────────────────────────────────────────────────
--
-- `run.sh` records and CHECKSUMS every applied migration precisely so the live
-- schema cannot drift from the history. Editing 059 in place would make an
-- already-applied file disagree with its recorded checksum. Fixes go in the
-- next number, always.
--
-- No table, column, index, grant or trigger changes here. One policy is
-- replaced, and only its middle arm differs.

BEGIN;

DROP POLICY IF EXISTS supplier_request_select ON parts.supplier_requests;
CREATE POLICY supplier_request_select ON parts.supplier_requests FOR SELECT USING (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      -- ── THE ONLY DIFFERENCE FROM 059 ────────────────────────────────────
      -- Matches `supplier_request_insert` and `supplier_request_update`
      -- word for word. A customer of this workshop is inside this
      -- organisation and must not read its procurement.
      AND identity.current_role_name() <> 'customer')
  OR parts.current_user_supplies(supplier_id)
);

COMMIT;
