-- 029_pricing_write_scope.sql
--
-- 🔴 ANY MEMBER OF THE TENANT CAN REWRITE THE WORKSHOP'S LABOUR RATE.
--
-- `repair.organization_pricing` holds the money a quotation is built from — the
-- default labour rate, the tax rate, the validity period. Migration 016 gave it
-- ONE policy, `tenant_isolation`, `FOR ALL`, testing only the tenant:
--
--     USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
--
-- There is no role condition, so every role in the tenant may write it.
-- MEASURED against the live local database before this migration was written:
--
--     CONFIRMED: a TECHNICIAN rewrote the labour rate (1 rows, now 1.00)
--
-- A technician setting the labour rate to 1.00 changes what every subsequent
-- quotation charges. Nothing in the application offered that — there is no
-- pricing screen at all, which is why it has gone unnoticed — but "no screen"
-- is not a control, and this slice is about to ADD the screen.
--
-- ⚠️ AND THE PREDICATE IS THE WRONG KEY. The table is keyed by ORGANIZATION
-- (`organization_id PRIMARY KEY`) while the policy tests TENANT. A tenant
-- holding two workshops therefore lets either one rewrite the other's prices —
-- confirmed reachable: the seed data already has two organizations in one
-- tenant. Isolation must be as narrow as the row it protects.
--
-- ⚠️ READS STAY TENANT-WIDE, DELIBERATELY. `quotation.service.ts` reads this
-- table while building a quotation, and that runs as whichever role is
-- preparing it — reception, a manager, a technician. Narrowing the read to the
-- owner would break quotation preparation for everybody, which is a far worse
-- outcome than the defect being fixed. The split is: everyone in the tenant may
-- SEE the rates; only the owner may CHANGE them.

BEGIN;

-- `tenant_isolation` was FOR ALL. Replaced by an explicit pair so that reading
-- and writing can differ — the same shape 028 needed for the directory.
DROP POLICY IF EXISTS tenant_isolation ON repair.organization_pricing;

-- Anyone in the tenant may read the rates. Unchanged in effect from 016 for
-- SELECT, so quotation preparation is untouched.
CREATE POLICY tenant_read ON repair.organization_pricing
  FOR SELECT
  USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- ⚠️ WRITES ARE OWNER-ONLY AND ORGANIZATION-SCOPED. `07.txt` pt2 §50 gives the
-- owner "full workshop governance, staff, FINANCIAL and reporting access"; the
-- manager gets "daily operational control" with no financial authority, and the
-- cashier "invoice review, payment collection" — collecting a price, not
-- setting one. Prices are the owner's.
--
-- Both `USING` and `WITH CHECK` carry the full predicate. `WITH CHECK` alone
-- would let an owner UPDATE a row into another organization; `USING` alone
-- would let them create one there. 027's directory policy documents the same
-- pair for the same reason.
CREATE POLICY owner_write ON repair.organization_pricing
  FOR INSERT
  WITH CHECK (
    organization_id = identity.current_organization_id()
    AND tenant_id = identity.current_tenant_id()
    AND identity.current_user_governs_organization()
  );

CREATE POLICY owner_update ON repair.organization_pricing
  FOR UPDATE
  USING (
    organization_id = identity.current_organization_id()
    AND tenant_id = identity.current_tenant_id()
    AND identity.current_user_governs_organization()
  )
  WITH CHECK (
    organization_id = identity.current_organization_id()
    AND tenant_id = identity.current_tenant_id()
    AND identity.current_user_governs_organization()
  );

-- ⚠️ NO DELETE POLICY, AND NO DELETE GRANT (016 withheld it). Pricing is
-- SUPERSEDED by an edit, never removed — a quotation already issued must stay
-- explicable, and a missing pricing row would silently return the column
-- defaults, which is a labour rate of zero.

COMMIT;
