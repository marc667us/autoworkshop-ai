-- 086 — the shopper's half of the insurance marketplace: an ENQUIRY the
--       insurer can actually see
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 THIS MIGRATION EXISTS BECAUSE OF THE QUESTION THE TASK LIST ORDERED ME TO
-- ASK BEFORE BUILDING THE SCREEN: **WHICH PRODUCTION PATH WRITES IT?**
--
-- Slice 17 is "public browse → product detail → enquiry". The first two need no
-- schema at all: 083 opened `insurance.products` to an anonymous reader and 084
-- removed the join that was throwing the rows away, so the listing already
-- works. The THIRD needs all of this, and without it the enquiry form would be
-- a control that discards what a person types into it — the same defect class
-- as the five roles with no production write path, in a different costume.
--
-- ── WHO WRITES, WHO READS, AND WHY THAT DECIDES THE DESIGN ────────────────
--
--   WRITER: an ANONYMOUS visitor. This is not an incidental convenience — it
--           is the premise of the whole surface. `PublicController`'s header
--           states it for the mechanic directory ("a shopper compares cover
--           before they have an account") and `assertInsuranceOperator`'s
--           refusal message already promises it in production code today:
--           *"To buy cover, the published products are on the public
--           marketplace and need no account."* A write path requiring a login
--           would make that promise false.
--
--   READER: the selling insurer, org-scoped, through the ordinary tenant
--           policy — and a platform administrator.
--
-- An anonymous writer and a tenant-scoped reader is the hard combination here,
-- because the writer has NO tenant context at all. Everything below follows
-- from resolving that without opening a hole.
--
-- ── WHY `WITH CHECK (true)` IS REFUSED, EXPLICITLY ────────────────────────
--
-- The obvious way to admit an anonymous INSERT is a permissive policy with
-- `WITH CHECK (true)`. That is precisely the defect found in this account's
-- other project on 2026-08-17, where an audit-chain insert policy said `true`
-- and therefore let anybody forge a row into any organisation. The same shape
-- here would let a stranger post an enquiry into an insurer they chose, at a
-- premium they chose, from a product that was never published.
--
-- So the check is RELATIONAL rather than constant: the row's own
-- `(product_id, tenant_id, organization_id)` must match a product that is
-- **published and verified**. A caller cannot name a tenant, because the only
-- tenant that satisfies the check is the one that already owns the product
-- they are enquiring about.
--
-- ⚠️ AND THE POLICY IS NOT SUFFICIENT ON ITS OWN — SAID HERE BECAUSE THE FIRST
-- DRAFT OF THIS HEADER IMPLIED IT WAS. It adjudicates the three KEY columns and
-- NOTHING ELSE, so it is indifferent to the premium, the currency, the product
-- name and the enquirer. What confines those is the GRANTS at the bottom of
-- this file: `autoworkshop_app` has no table INSERT at all, so the only route
-- in is `submit_enquiry()`, which derives them. Policy and privilege are two
-- halves of one control here, and reading either alone overstates it.
--
-- ⚠️ AND THAT SUBQUERY IS ITSELF UNDER RLS — WHICH IS WHY IT WORKS, NOT A
-- PROBLEM WITH IT. 084's lesson, stated there in full: *"a permissive policy on
-- the table you are reading is not enough: it must hold for EVERY table the
-- query touches."* Here the chain is deliberately one table long, and 083's
-- `products_public_read` (`USING (is_published AND is_verified)`) is exactly
-- the policy that makes an anonymous session able to see it. The published-and-
-- verified condition is therefore enforced TWICE and by two mechanisms — once
-- by the policy's own predicate and once by the RLS the subquery inherits —
-- and neither is load-bearing alone.
--
-- ── WHY THERE IS ALSO A SECURITY DEFINER FUNCTION ─────────────────────────
--
-- The policy decides what MAY be written. The function decides what IS written:
-- `tenant_id`, `organization_id` and the price snapshot are DERIVED from the
-- product row, never accepted from the caller. That is the confused-deputy rule
-- `insurance.service.ts:107` already states for the authenticated path — "a body
-- field naming either would be the confused-deputy hole the whole tenancy design
-- exists to prevent" — applied to the anonymous path, where it matters more.
--
-- 🔴 THE FUNCTION ALONE WOULD NOT BE ENOUGH, AND 083 IS THE PROOF. A SECURITY
-- DEFINER function runs as its OWNER and `FORCE ROW LEVEL SECURITY` BINDS THE
-- OWNER — on Render the owner is not a superuser. 082 relied on a definer
-- function for the public read and it returned `200 []` on production while the
-- row existed. So this migration ships the POLICY as the mechanism and the
-- function as the derivation, not the other way round.
--
-- ── THE PRICE SNAPSHOT IS NOT DENORMALISATION FOR SPEED ───────────────────
--
-- `product_name`, `premium` and `currency` are copied onto the enquiry because
-- an enquiry is a record of WHAT WAS ADVERTISED WHEN THE PERSON ASKED. An
-- insurer may re-price or unpublish a product the next day; a list that renders
-- today's price against last week's enquiry misrepresents what the shopper was
-- responding to. Same reasoning 084 gives for `insurer_name` on the product.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE insurance.enquiries (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 🔴 DERIVED FROM THE PRODUCT, NEVER SUPPLIED. See the function below.
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id),
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id),
    product_id       uuid NOT NULL,

    -- TEXT throughout, never VARCHAR(n) — the Solar truncation lesson, and the
    -- same choice `insurance.products` makes two migrations up.
    contact_name     TEXT NOT NULL,
    contact_email    TEXT NOT NULL,
    contact_phone    TEXT,
    vehicle_registration TEXT,
    message          TEXT,

    -- What was advertised at the moment of asking. See the header.
    product_name     TEXT NOT NULL,
    premium          numeric(14,2) NOT NULL CHECK (premium >= 0),
    currency         TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),

    -- Set only when the enquirer happened to be signed in. NULLABLE BY DESIGN:
    -- an enquiry from a stranger is the ordinary case, not the exception, and a
    -- NOT NULL here would have quietly required an account.
    enquirer_user_id uuid REFERENCES identity.users(id),

    -- The insurer works the list. Three states and no more: an enquiry is new,
    -- somebody has responded to it, or it is finished. A wider vocabulary with
    -- no screen behind it is a column nothing ever writes.
    status           TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new','contacted','closed')),

    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid REFERENCES identity.users(id),

    CHECK (length(btrim(contact_name)) > 0),
    -- Deliberately a shape check, not an RFC 5322 attempt. The address is the
    -- only way the insurer can reply, so an obviously-broken one is refused at
    -- the boundary; anything cleverer rejects real addresses.
    CHECK (contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

-- The enquiry and the product must belong to the same organisation — 082's
-- `uq_product_org_scoped` is what makes this expressible, and 073/079 closed
-- this class for eighteen other relationships.
--
-- ⚠️ NO `ON DELETE` ACTION, DELIBERATELY. This repository has recorded that a
-- composite `ON DELETE SET NULL` nulls EVERY key column including a NOT NULL
-- `tenant_id`. RESTRICT (the default) is also the correct business rule: an
-- insurer must not be able to delete a product to make the enquiries about it
-- disappear.
ALTER TABLE insurance.enquiries
    ADD CONSTRAINT fk_enquiry_product_same_org
    FOREIGN KEY (product_id, organization_id)
    REFERENCES insurance.products (id, organization_id);

-- The insurer's inbox, newest first — the only list this table has.
CREATE INDEX idx_enquiries_org     ON insurance.enquiries (organization_id, created_at DESC);
CREATE INDEX idx_enquiries_product ON insurance.enquiries (product_id);
CREATE INDEX idx_enquiries_status  ON insurance.enquiries (organization_id, status);

COMMENT ON TABLE insurance.enquiries IS
'A shopper asking an insurer about a published product. Written anonymously '
'through insurance.submit_enquiry(); read only by the owning organisation and '
'the platform. The tenant, organisation and price are DERIVED from the product, '
'never accepted from the caller.';

ALTER TABLE insurance.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.enquiries FORCE  ROW LEVEL SECURITY;

-- ── READ / WRITE BY THE OWNING INSURER ────────────────────────────────────
-- The same organisation-scoped shape as `products_tenant_isolation`, and
-- org-scoped rather than tenant-only for the reason 082 records: a tenant here
-- can hold more than one organisation.
--
-- ⚠️ SPLIT INTO SELECT AND UPDATE RATHER THAN `FOR ALL`, AND THE REASON IS
-- NARROWER THAN IT LOOKS. An earlier draft of this comment claimed the split
-- means "the insurer may not INSERT". THAT WOULD HAVE BEEN A COMMENT ASSERTING
-- A RULE THE POLICIES DO NOT IMPLEMENT — this repository's own recorded defect
-- class — because permissive policies OR together, so `enquiries_public_insert`
-- below admits an insurer exactly as it admits anybody else.
--
-- What the split actually buys: the insurer's own reach is never widened beyond
-- SELECT and UPDATE by THIS policy, so the only INSERT any session can make is
-- one that satisfies the relational check below. An insurer inserting there is
-- confined to its OWN organisation and its OWN published product — it can
-- manufacture an enquiry for a product it already sells, which is self-
-- deception rather than a security boundary, and no other organisation's data
-- is reachable. Stated plainly rather than claimed away.
CREATE POLICY enquiries_org_read ON insurance.enquiries
    FOR SELECT
    USING (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()));

CREATE POLICY enquiries_org_update ON insurance.enquiries
    FOR UPDATE
    USING (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()))
    -- The same predicate on the NEW row, so an UPDATE cannot move an enquiry
    -- into another organisation. A USING-only policy permits exactly that.
    WITH CHECK (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()));

-- ── THE ANONYMOUS WRITE ───────────────────────────────────────────────────
-- Relational, not constant. See the header for why `WITH CHECK (true)` is
-- refused by name.
CREATE POLICY enquiries_public_insert ON insurance.enquiries
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1
          FROM insurance.products p
         WHERE p.id              = insurance.enquiries.product_id
           AND p.tenant_id       = insurance.enquiries.tenant_id
           AND p.organization_id = insurance.enquiries.organization_id
           AND p.is_published
           AND p.is_verified
    ));

COMMENT ON POLICY enquiries_public_insert ON insurance.enquiries IS
'Admits an anonymous enquiry ONLY against a published, verified product, and '
'only with the tenant and organisation that product already has. Relational '
'rather than WITH CHECK (true), which would let a stranger forge a row into '
'any insurer.';

-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 THE GRANTS ARE THE SECOND HALF OF THE POLICY, AND THE FIRST DRAFT GAVE
-- AWAY EVERYTHING THE POLICY WAS PROTECTING. Both findings below were raised by
-- Codex and then REPRODUCED against this database before being fixed — neither
-- is theoretical.
--
-- ── WHY `INSERT` IS NOT GRANTED ──────────────────────────────────────────
--
-- It was, and `enquiries_public_insert` does not save you. That policy checks
-- the three KEY columns (`product_id`, `tenant_id`, `organization_id`) and says
-- nothing about the rest of the row — so with table INSERT, the application
-- role could write a perfectly policy-compliant enquiry carrying a premium, a
-- currency, a product name and an `enquirer_user_id` of its own invention.
-- Measured 2026-08-19 as `autoworkshop_app` with no tenant context:
--
--     INSERT ... VALUES (t, o, v_pub, 'Forger', ..., 'A NAME I INVENTED',
--                        0.01, 'USD')   ->  SUCCEEDED
--
-- The header of this migration claimed those values are "DERIVED from the
-- product row, never accepted from the caller". That was true of
-- `submit_enquiry()` and FALSE of the granted capability — a comment asserting
-- a rule the schema did not implement, which this repository treats as a defect
-- in its own right.
--
-- ▶ So the ONLY way in is the function. `autoworkshop_app` gets EXECUTE and no
--   INSERT. The definer owns the insert, and on Render FORCE RLS still binds
--   the owner, so `enquiries_public_insert` remains a real second gate there
--   rather than the only one.
--
-- ── WHY `UPDATE` IS COLUMN-SCOPED ────────────────────────────────────────
--
-- A table-wide UPDATE grant let the owning insurer rewrite the SHOPPER'S OWN
-- WORDS. The row-scoped `WITH CHECK` only pins the organisation, so everything
-- else was editable. Measured, as the insurer, on its own enquiry:
--
--     UPDATE ... SET contact_email = 'hijacked@attacker.test',
--                    premium = 0.01, contact_name = 'Rewritten'   ->  UPDATE 1
--
-- That defeats the entire point of the price snapshot: the premium is stored so
-- the record of WHAT WAS ADVERTISED survives a re-pricing, and an insurer that
-- can edit it can rewrite what a customer was quoted. `insurance.service.ts`
-- comments that "the status is the only thing this may change" — true of that
-- one statement, and not of the privilege.
--
-- `updated_at` is deliberately absent from the column list: it belongs to
-- `trg_touch_enquiry`, and a BEFORE trigger may set a column the caller has no
-- privilege on.
-- ══════════════════════════════════════════════════════════════════════════
GRANT SELECT                     ON insurance.enquiries TO autoworkshop_app;
GRANT UPDATE (status, updated_by) ON insurance.enquiries TO autoworkshop_app;

-- ── WHAT THE ANONYMOUS ENDPOINT ACTUALLY CALLS ────────────────────────────
--
-- SECURITY DEFINER for the DERIVATION, not for the permission — the policy
-- above is the permission, and 083 is why that distinction is written down.
--
-- ⚠️ `search_path` IS PINNED. A definer function without one is the classic
-- privilege-escalation shape, and the other definer functions in this schema
-- (`set_insurer_name`, `accrue_platform_levy`, `public_products`) all pin it.
CREATE OR REPLACE FUNCTION insurance.submit_enquiry(
    p_product_id           uuid,
    p_contact_name         TEXT,
    p_contact_email        TEXT,
    p_contact_phone        TEXT,
    p_vehicle_registration TEXT,
    p_message              TEXT,
    p_enquirer_user_id     uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = insurance, pg_catalog, pg_temp
AS $fn$
DECLARE
    v_product record;
    v_id      uuid;
BEGIN
    -- The product read is subject to RLS exactly like the caller's would be,
    -- and 083's public-read policy is what makes it visible. An unpublished or
    -- unverified product is therefore NOT FOUND here rather than rejected
    -- later — the enquirer never learns it exists.
    SELECT p.id, p.tenant_id, p.organization_id, p.name, p.premium, p.currency
      INTO v_product
      FROM insurance.products p
     WHERE p.id = p_product_id
       AND p.is_published
       AND p.is_verified;

    IF NOT FOUND THEN
        -- Named so the API can turn it into a 404 rather than a 500, and
        -- worded so it names what the visitor CAN do — the repository's
        -- most-recorded defect class is a refusal with no reachable
        -- alternative.
        RAISE EXCEPTION 'that insurance product is not on the marketplace; browse the published products and try again'
            USING ERRCODE = 'no_data_found';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- 🔴 THE ID IS GENERATED HERE INSTEAD OF BY `RETURNING`, AND THAT IS NOT A
    -- STYLE CHOICE. IT IS THE DIFFERENCE BETWEEN WORKING ON RENDER AND NOT.
    --
    -- `INSERT ... RETURNING` reads the row it just wrote, and **RLS applies the
    -- SELECT policy to that read**. The only SELECT policy on this table is
    -- `enquiries_org_read`, which requires the caller's tenant and organisation
    -- to match. An anonymous shopper has NEITHER — that is the entire premise
    -- of this table — so the write is admitted by `enquiries_public_insert` and
    -- then the RETURNING clause is refused, with the misleading message
    -- *"new row violates row-level security policy"*, which reads as a rejected
    -- INSERT rather than a rejected read-back.
    --
    -- MEASURED, not reasoned, on 2026-08-19 as `autoworkshop_app` with no
    -- tenant context, both statements in one block against the same product:
    --
    --     WITHOUT RETURNING .... SUCCEEDED
    --     WITH RETURNING ....... FAILED  new row violates row-level security policy
    --
    -- ⚠️ AND THIS WOULD HAVE PASSED EVERY LOCAL CHECK. This function is
    -- SECURITY DEFINER, so it runs as the table owner; on this workstation the
    -- owner is `rolsuper = t, rolbypassrls = t` and RLS never applies, while on
    -- Render the owner is an ordinary role bound by FORCE RLS. That is the same
    -- local-superuser blind spot that produced 083's `200 []`, 084's silent
    -- backfill, the backup's refused pg_dump and 085's zero-row CTE.
    --
    -- The alternative — widening the SELECT policy so the writer can read its
    -- own row back — is refused: it would have to admit a session with no
    -- tenant at all, which is every anonymous visitor, to a table of other
    -- people's contact details.
    -- ══════════════════════════════════════════════════════════════════════
    v_id := gen_random_uuid();

    INSERT INTO insurance.enquiries (
        id, tenant_id, organization_id, product_id,
        contact_name, contact_email, contact_phone, vehicle_registration, message,
        product_name, premium, currency, enquirer_user_id
    ) VALUES (
        v_id, v_product.tenant_id, v_product.organization_id, v_product.id,
        btrim(p_contact_name), lower(btrim(p_contact_email)),
        nullif(btrim(coalesce(p_contact_phone, '')), ''),
        nullif(btrim(coalesce(p_vehicle_registration, '')), ''),
        nullif(btrim(coalesce(p_message, '')), ''),
        v_product.name, v_product.premium, v_product.currency,
        p_enquirer_user_id
    );

    RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION insurance.submit_enquiry(uuid, TEXT, TEXT, TEXT, TEXT, TEXT, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insurance.submit_enquiry(uuid, TEXT, TEXT, TEXT, TEXT, TEXT, uuid) TO autoworkshop_app;

-- ── ONE PRODUCT, FOR THE DETAIL PAGE ──────────────────────────────────────
-- The list function already exists (084). A detail page filtering the whole
-- list client-side would ship every product's fields to render one, and would
-- 200 on an id that does not exist.
CREATE OR REPLACE FUNCTION insurance.public_product(p_id uuid)
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
AS $fn$
    SELECT p.id, p.insurer_name, p.name, p.summary, p.cover_type, p.premium,
           p.currency, p.term_months, p.excess, p.terms_url
      FROM insurance.products p
     WHERE p.id = p_id
       AND p.is_published
       AND p.is_verified;
$fn$;

REVOKE ALL ON FUNCTION insurance.public_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insurance.public_product(uuid) TO autoworkshop_app;

-- Keep `updated_at` honest. Set by a trigger rather than by the service, for
-- the reason 084 gives about `insurer_name`: a timestamp the application is
-- trusted to write is one that will eventually be stale, invisibly.
CREATE OR REPLACE FUNCTION insurance.touch_enquiry()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_touch_enquiry
    BEFORE UPDATE ON insurance.enquiries
    FOR EACH ROW EXECUTE FUNCTION insurance.touch_enquiry();

COMMIT;
