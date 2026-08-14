-- 084 — the public listing was still empty after 083, and the JOIN was why
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 083 WAS A CORRECT FIX FOR AN INCOMPLETE DIAGNOSIS, AND THE LIVE SITE SAID
-- SO IMMEDIATELY.
--
-- 083 added a public-read policy to `insurance.products` and applied cleanly to
-- production. `GET /public/insurance-products` still answered `200 []`.
--
-- Measured under the app role rather than reasoned about a second time:
--
--   products only ............................................. 1
--   the function body, WITH the join to organizations ......... 0
--   organizations visible with no tenant context .............. 0
--
-- `insurance.public_products()` selects the insurer's name by joining
-- `identity.organizations`, which is under FORCE RLS with `tenant_isolation`
-- and no public-read policy. An anonymous read has no tenant context, so the
-- JOIN matched nothing — the products were visible all along and the join threw
-- them away.
--
-- ⚠️ THE LESSON, AND IT IS NOT THE ONE I DREW FROM 083. A permissive policy on
-- the table you are reading is not enough: it must hold for EVERY table the
-- query touches. A join silently re-imposes the strictest policy in the chain,
-- and it does it by returning fewer rows rather than by failing — which is why
-- this surfaced as an empty list behind a 200 instead of an error.
--
-- ── WHY NOT JUST OPEN `identity.organizations` ────────────────────────────
--
-- Because that table is the identity spine. A policy wide enough to expose one
-- name would expose the whole row — status, type, tenant — for every business
-- that ever lists a product, to every authenticated query in the platform. The
-- name is the only field the marketplace needs.
--
-- ── THE PATTERN THE PARTS MARKETPLACE ALREADY USES ────────────────────────
--
-- `catalogue.suppliers` carries its own `name`, and the public parts listing
-- joins THAT, never `identity.organizations`. The public face of a business is
-- its own row in the catalogue, deliberately separate from its identity record.
-- 082 skipped that step for insurance and joined identity directly.
--
-- So the trading name is copied onto the product, and kept honest by a trigger
-- rather than by discipline: it is set at INSERT from the organisation, which
-- the inserting session can always see (it is their own), and it is refreshed
-- if the organisation is renamed.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE insurance.products ADD COLUMN insurer_name TEXT;

-- Backfill under the platform escape, which this migration runs with.
UPDATE insurance.products p
   SET insurer_name = o.name
  FROM identity.organizations o
 WHERE o.id = p.organization_id
   AND p.insurer_name IS NULL;

-- 🔴 SET BY A TRIGGER, NOT BY THE APPLICATION. A denormalised name that the
-- service is trusted to populate is a name that will one day be missing or
-- stale, and the failure is invisible — a listing showing the wrong insurer.
-- The trigger reads the organisation as the DEFINER, and the inserting session
-- can always see its own organisation, which is the case that matters.
CREATE OR REPLACE FUNCTION insurance.set_insurer_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = insurance, identity, pg_catalog, pg_temp
AS $$
BEGIN
    SELECT o.name INTO NEW.insurer_name
      FROM identity.organizations o
     WHERE o.id = NEW.organization_id;
    IF NEW.insurer_name IS NULL OR btrim(NEW.insurer_name) = '' THEN
        -- Refuse rather than list a product under a blank insurer. A shopper
        -- comparing cover has to know who is selling it.
        RAISE EXCEPTION 'could not resolve the insurer name for this product'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_insurer_name
    BEFORE INSERT OR UPDATE OF organization_id ON insurance.products
    FOR EACH ROW EXECUTE FUNCTION insurance.set_insurer_name();

ALTER TABLE insurance.products
    ALTER COLUMN insurer_name SET NOT NULL;

-- Keep it true if the organisation is renamed. Without this the marketplace
-- would show the name a business had when it first listed, for ever.
CREATE OR REPLACE FUNCTION insurance.sync_insurer_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = insurance, identity, pg_catalog, pg_temp
AS $$
BEGIN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
        UPDATE insurance.products SET insurer_name = NEW.name
         WHERE organization_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_insurer_name
    AFTER UPDATE OF name ON identity.organizations
    FOR EACH ROW EXECUTE FUNCTION insurance.sync_insurer_name();

-- ── The public projection, with NO join to a tenant-scoped table ───────────
--
-- ⚠️ `o.status = 'active'` IS GONE, AND THAT IS THE POINT OF THIS MIGRATION.
-- It was the reason for the join. A product is withdrawn by unpublishing it or
-- by the platform withdrawing verification — both are on the product itself,
-- both are enforced, and neither needs the identity spine.
CREATE OR REPLACE FUNCTION insurance.public_products()
RETURNS TABLE (
    o_product_id   uuid,
    o_insurer      TEXT,
    o_name         TEXT,
    o_summary      TEXT,
    o_cover_type   TEXT,
    o_premium      numeric,
    o_currency     TEXT,
    o_term_months  integer,
    o_excess       numeric,
    o_terms_url    TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = insurance, pg_catalog, pg_temp
AS $$
    SELECT p.id, p.insurer_name, p.name, p.summary, p.cover_type, p.premium,
           p.currency, p.term_months, p.excess, p.terms_url
      FROM insurance.products p
     WHERE p.is_published AND p.is_verified
     ORDER BY p.premium;
$$;

REVOKE ALL ON FUNCTION insurance.public_products() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insurance.public_products() TO autoworkshop_app;

COMMIT;
