-- 028_directory_member_read.sql
--
-- 🔴 THE SCREEN SHOWED THE WRONG STATE TO EVERYONE EXCEPT THE OWNER.
--
-- 027 gave `catalogue.mechanic_directory` a single policy covering both reading
-- and writing — `owner_manage_own`, `FOR ALL`, requiring the owner or admin
-- role. `public_read` covers only PUBLISHED rows. So a manager, technician or
-- cashier looking at their own workshop's listing while it was saved but NOT
-- yet published got no row at all.
--
-- MEASURED (Codex found it, this reproduced it):
--
--     owner sees own unpublished listing: 1
--     MANAGER sees own unpublished listing: 0
--     TECHNICIAN sees own unpublished listing: 0
--
-- The consequence is not a leak — it is a LIE. `describe()` falls back to
-- suggestions from the workshop profile when it finds no listing, so those
-- users saw a page reading "Not listed" above a pre-filled form, for a workshop
-- whose listing was sitting there saved and one click from publication. Someone
-- would have filled it in again and asked why saving did nothing.
--
-- ⚠️ AND THE SERVICE COMMENT ASSERTED THE OPPOSITE. `directory.service.ts` said
-- the listing was "readable by any member of the organization: knowing whether
-- your workshop is publicly listed is not a governance secret". That was the
-- intent, it was never true, and a comment describing a rule the policy does
-- not implement is the second one of those found in two days. The rule is the
-- right one — so this migration makes the database agree with it, rather than
-- editing the comment to match a weaker reality.
--
-- ⚠️ READ ONLY. Writing stays with the owner (027). Splitting them is the whole
-- point: a member may SEE that their workshop is listed, and still not be able
-- to change what the public reads.

BEGIN;

-- Permissive policies OR together, so this ADDS to `public_read`,
-- `owner_manage_own` and `admin_write` rather than replacing any of them.
--
-- No role condition, deliberately. Every member of the organization may see
-- their own workshop's public listing and its state; that is not privileged
-- information inside the organization, and hiding it is what produced the
-- misleading screen. The ORGANIZATION predicate is still the isolation
-- boundary, and it is the same one 027 uses.
CREATE POLICY member_read_own ON catalogue.mechanic_directory
  FOR SELECT
  USING (organization_id = identity.current_organization_id());

COMMIT;
