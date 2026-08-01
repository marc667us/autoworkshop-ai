-- 027_mechanic_directory_optin.sql
--
-- SLICE C — let a workshop publish and withdraw its OWN directory listing.
--
-- `catalogue.mechanic_directory` has existed since migration 021 and no workshop
-- can touch it: the only policies are `public_read` (published rows, no account
-- needed) and `admin_write`. So the directory a customer searches to find a
-- garage can only be populated by a platform administrator — the same shape of
-- gap Slice B closed for parts, one table over.
--
-- ⚠️ THE WORKSHOP PUBLISHES ITSELF HERE, AND THAT IS A DELIBERATE DIFFERENCE
-- FROM THE PARTS CATALOGUE. A part listing is a claim about a PRODUCT a stranger
-- will buy, so migration 024 keeps publication with an administrator. A
-- directory entry is a workshop's own consented description of ITSELF — trading
-- name, town, phone. Requiring an administrator to approve a garage saying "we
-- are here, this is our phone number" would make the directory unfillable, which
-- is what 021 already established when it called publication "an explicit ACT"
-- rather than a predicate. `admin_write` remains FOR ALL, so an administrator
-- can still withdraw an abusive listing.
--
-- ⚠️ IT STAYS A COPY, NEVER A VIEW OVER `core.organization_profile`. 021's
-- header sets out why at length and none of it has changed: publishing must be
-- an act that copies CONSENTED fields into a public table, not a predicate that
-- exempts rows from tenant isolation. If this table is wrong, a listing is
-- wrong; if the alternative were wrong, the customer book leaks. The screen
-- therefore OFFERS the profile's values as defaults and writes them here as
-- separate data.

BEGIN;

-- ---------------------------------------------------------------------------
-- The organization a request is acting in.
-- ---------------------------------------------------------------------------
-- ⚠️ THE FIRST ORG-SCOPED PREDICATE IN THIS SCHEMA. Every policy up to now is
-- keyed on TENANT (`identity.current_tenant_id()`), which is recorded in the
-- outstanding list as "RLS is tenant-only, not org-scoped… needs a plan before
-- code". This is not that plan. It introduces the helper for ONE table where
-- organization is unambiguously the right key, because a directory listing is
-- unique per organization (`uq_directory_org`) and a tenant may hold several.
-- Repo-wide org-scoping remains open work.
--
-- ⚠️ THE GUC IS NAMED `app.organization_ids`, PLURAL, AND CARRIES EXACTLY ONE
-- ID. `tenantSessionStatements` sets it from `ctx.organizationId` — the single
-- organization the request resolved to. The plural name is a leftover and it is
-- a trap: reading it as a list would make this function look like it needs
-- parsing. If it ever DOES become a list, this cast fails loudly with
-- `invalid input syntax for type uuid` rather than silently matching nothing,
-- which is the safe direction for a policy predicate.
CREATE OR REPLACE FUNCTION identity.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.organization_ids', true), '')::uuid;
$$;

COMMENT ON FUNCTION identity.current_organization_id() IS
  'The single organization id the request resolved to. Reads app.organization_ids, '
  'which is plural in name and singular in content.';

-- ---------------------------------------------------------------------------
-- Who may speak for the workshop in public.
-- ---------------------------------------------------------------------------
-- ⚠️ A HELPER RATHER THAN AN INLINE PREDICATE, ON PURPOSE. Migrations 021-024
-- hand-rolled `current_role_name() = 'admin'` instead of calling
-- `identity.is_platform_admin()`, which had existed since migration 001 and
-- already handled both role names — and every one of those policies was
-- unreachable from the application until 025 repointed them. Restating a role
-- test inline is exactly how that happened, so this one gets a name.
--
-- ⚠️ OWNER ONLY, NOT MANAGER. `07.txt` pt2 §50 gives the owner "full workshop
-- governance" and the manager "daily operational control"; the workshop's
-- public identity — its trading name and the phone number strangers ring — is
-- governance. Deliberately conservative: widening a public surface later is a
-- one-line change, and narrowing one after garages have published is not.
CREATE OR REPLACE FUNCTION identity.current_user_governs_organization()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT identity.is_platform_admin()
      OR identity.current_role_name() = 'workshop_owner';
$$;

REVOKE ALL ON FUNCTION identity.current_organization_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.current_user_governs_organization() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.current_organization_id() TO autoworkshop_app;
GRANT EXECUTE ON FUNCTION identity.current_user_governs_organization() TO autoworkshop_app;

-- ---------------------------------------------------------------------------
-- The policy.
-- ---------------------------------------------------------------------------
-- FOR ALL, so an owner may create the listing, read it back while it is still
-- unpublished, edit the consented fields, and withdraw it.
--
-- ⚠️ `WITH CHECK` PINS THE ORGANIZATION as well as `USING`. Without it an owner
-- could UPDATE their own row and set `organization_id` to somebody else's,
-- taking over that workshop's public listing — `USING` tests the row as it WAS
-- and would happily permit the change. The same trap 024 documents for
-- `parts.supplier_id`, which needed a trigger because the column had to stay
-- editable by an administrator; here the predicate alone is enough because
-- nobody may move a listing at all.
CREATE POLICY owner_manage_own ON catalogue.mechanic_directory
  FOR ALL
  USING (
    organization_id = identity.current_organization_id()
    AND identity.current_user_governs_organization()
  )
  WITH CHECK (
    organization_id = identity.current_organization_id()
    AND identity.current_user_governs_organization()
  );

COMMIT;
