-- 083 — the public insurance listing returned NOTHING on production
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 FOUND BY TESTING THE LIVE SITE, AND BY NOTHING ELSE.
--
-- After 082 deployed and the insurance UAT ran on production — the gate held,
-- a sale was recorded, the levy accrued GHS 120.00 — the live endpoint said:
--
--     GET /api/v1/public/insurance-products  ->  200  []
--
-- One published, verified product in the database, and zero on the shopper's
-- page. A 200 with an empty list is the worst shape this can fail in: every
-- health check passes, the deploy is green, and the marketplace is empty.
--
-- ── WHY 082's SECURITY DEFINER FUNCTION WAS NOT ENOUGH ────────────────────
--
-- 082 exposed the public projection through `insurance.public_products()`, a
-- SECURITY DEFINER function, and argued against a permissive RLS policy on the
-- grounds that a policy wide enough for an anonymous shopper is also wide
-- enough for every authenticated tenant's ordinary queries — because the table
-- holds an insurer's unpublished DRAFTS.
--
-- The reasoning about drafts was right. The conclusion was wrong, and for a
-- reason this repository has already written down twice:
--
--     A SECURITY DEFINER FUNCTION RUNS AS ITS OWNER, AND `FORCE ROW LEVEL
--     SECURITY` BINDS THE OWNER.
--
-- On Render the owning role is NOT a superuser, so the function is subject to
-- `products_tenant_isolation` exactly like anybody else — and it runs with no
-- tenant context, so it matched nothing. LOCALLY the same function returns the
-- row, because the local `autoworkshop` role IS a superuser and bypasses RLS
-- entirely. That difference is why every local check passed.
--
-- Reproduced rather than reasoned: `SET ROLE autoworkshop_app` and a direct
-- read of `insurance.products WHERE is_published AND is_verified` returns 0
-- locally too, with one policy on the table.
--
-- ── THE FIX, AND WHY IT DOES NOT LEAK DRAFTS ──────────────────────────────
--
-- A permissive SELECT policy admitting ONLY `is_published AND is_verified`.
-- Those rows are public by definition — they are what the marketplace exists
-- to show — so admitting them to an authenticated tenant's ordinary query
-- discloses nothing that an anonymous visitor could not already read. A draft
-- stays invisible to everyone but its owner, which was the real concern.
--
-- This is the pattern `catalogue.parts` has used since it shipped: a
-- `public_read` policy gated on `is_published`, alongside tenant isolation.
-- 082 invented a different mechanism for the same problem and it did not
-- survive contact with production privileges.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ⚠️ PERMISSIVE, AND ADDITIVE. Postgres ORs permissive policies together, so
-- this widens the table by exactly the published-and-verified set and changes
-- nothing else. `products_tenant_isolation` still governs everything an
-- insurer does with its own drafts, and this policy is SELECT-only — it grants
-- no write of any kind.
CREATE POLICY products_public_read ON insurance.products
    FOR SELECT
    USING (is_published AND is_verified);

COMMENT ON POLICY products_public_read ON insurance.products IS
'The marketplace listing. Only published AND verified products, read-only. '
'A SECURITY DEFINER function alone could not do this: it runs as its owner, '
'and FORCE RLS binds the owner on Render, so the public endpoint returned an '
'empty list while the row existed.';

COMMIT;
