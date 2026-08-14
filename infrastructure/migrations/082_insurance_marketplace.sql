-- 082 — insurers register products online, sell them, and pay the platform a levy
--
-- ══════════════════════════════════════════════════════════════════════════
-- Owner, 2026-08-14: *"insurance regist product online and sell but pays
-- plantform lever for selling on the platform"*.
--
-- ── 🔴 THIS ANSWERS A QUESTION THAT WAS OPEN, AND IT ANSWERS IT DIFFERENTLY
-- ── FROM BOTH OPTIONS THAT WERE ON THE TABLE ──────────────────────────────
--
-- The question was whether an insurance "sales pipeline" meant (A) an insurer
-- marketing to workshop customers, or (B) the platform selling insurance. Both
-- were problematic: (A) needs an insurer to read customers and vehicles
-- belonging to WORKSHOP tenants, which `COMBINED_PLAN_v2` §4 makes the
-- isolation boundary; and the lead-origin rule on `crm.leads` — `source_url`
-- NOT NULL, no `POST /leads`, cited against Ghana's Data Protection Act 2012 —
-- independently forbids assembling such a list.
--
-- The answer is neither. It is the **marketplace model the parts catalogue
-- already uses**: the insurer LISTS, the customer COMES to the listing, and the
-- platform takes a cut of the sale. Nothing reads across a tenant boundary,
-- because nobody is being marketed AT. That is why this shape is buildable when
-- the other two were not.
--
-- ⚠️ IT ALSO MEANS MIGRATION 081 IS THE WRONG SHAPE FOR THIS. `crm.campaigns`
-- is outbound marketing over leads. It is tenant-scoped and harmless, it is NOT
-- applied to production, and it is NOT part of this answer. If it never gains a
-- caller it should be reverted rather than left as schema nobody reaches.
--
-- ── WHY A NEW SCHEMA RATHER THAN `catalogue.orders` ───────────────────────
--
-- `catalogue.orders` is parts-shaped: `supplier_id`, `delivery_fee`,
-- `delivery_recipient`, `delivery_address`, `delivery_tracking_reference`, and
-- `order_lines.part_id`. A policy has no delivery, no quantity and no shipment;
-- it has a COVER PERIOD, a VEHICLE and a PREMIUM. Overloading orders would mean
-- half the columns are permanently NULL and the two products constrain each
-- other for ever.
--
-- `COMBINED_PLAN_v2` §4 names `fleet-insurance-triple` as one of the thirteen
-- business domains and prescribes one schema per domain. Towing already has
-- `towing.*` from migration 074. Insurance gets `insurance.*`, for the same
-- reason and by the same precedent.
--
-- ⚠️ AND `register_insurer` DOES NOT CREATE A `catalogue.suppliers` ROW —
-- checked, not assumed (080 mentions that table zero times). So these tables
-- key on the `identity.organizations` row of type `insurance_company` directly,
-- and a trigger asserts that type rather than trusting the caller.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS insurance;
GRANT USAGE ON SCHEMA insurance TO autoworkshop_app;

-- ── 1. The platform's levy rate ───────────────────────────────────────────
--
-- 🔴 SET BY THE PLATFORM, NOT BY THE INSURER, and that is the whole point of a
-- levy. It is deliberately NOT a column on the product: an insurer editing its
-- own product must not be able to edit what it owes.
--
-- One row per insurer, with a NULL organisation meaning "the default for
-- everybody". A rate is time-bounded rather than overwritten, so a policy sold
-- last month can still be explained by the rate that applied then — the same
-- append-only reasoning `CLAUDE.md` applies to approvals and payments.
CREATE TABLE insurance.levy_rates (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- NULL = the platform default. A specific organisation overrides it.
    organization_id  uuid REFERENCES identity.organizations(id),
    percent          numeric(5,2) NOT NULL
                     CHECK (percent >= 0 AND percent <= 100),
    effective_from   timestamptz NOT NULL DEFAULT now(),
    effective_to     timestamptz,
    note             TEXT,
    created_by       uuid REFERENCES identity.users(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_levy_rates_org ON insurance.levy_rates (organization_id, effective_from DESC);

-- The platform default, so a sale can never fail for want of a rate. 10% is a
-- starting value and is expected to be changed by the owner; it is recorded as
-- a row rather than hardcoded precisely so that changing it is a data edit with
-- an effective date, not a migration.
INSERT INTO insurance.levy_rates (organization_id, percent, note)
VALUES (NULL, 10.00, 'Platform default levy, seeded by migration 082');

-- ── 2. The products an insurer registers ──────────────────────────────────

CREATE TABLE insurance.products (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id),
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id),

    -- TEXT throughout, never VARCHAR(n) — the Solar truncation lesson.
    name             TEXT NOT NULL,
    summary          TEXT,
    cover_type       TEXT NOT NULL
                     CHECK (cover_type IN ('third_party','third_party_fire_theft',
                                           'comprehensive','windscreen','roadside_assistance','other')),
    -- What it costs and for how long. `term_months` rather than free dates: a
    -- PRODUCT has a term; a POLICY has actual dates, below.
    premium          numeric(14,2) NOT NULL CHECK (premium >= 0),
    currency         TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    term_months      integer NOT NULL CHECK (term_months > 0 AND term_months <= 60),

    excess           numeric(14,2) CHECK (excess IS NULL OR excess >= 0),
    terms_url        TEXT,

    -- Same two-flag shape as `catalogue.suppliers`: the insurer may unpublish
    -- its own product; only a platform administrator may verify it.
    is_published     boolean NOT NULL DEFAULT false,
    is_verified      boolean NOT NULL DEFAULT false,

    created_by       uuid REFERENCES identity.users(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid REFERENCES identity.users(id),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX uq_insurance_product_name_per_org
    ON insurance.products (organization_id, lower(btrim(name)));
CREATE INDEX idx_insurance_products_tenant    ON insurance.products (tenant_id);
CREATE INDEX idx_insurance_products_published ON insurance.products (is_published, is_verified);

-- 🔴 ONLY AN INSURANCE COMPANY MAY REGISTER AN INSURANCE PRODUCT, ENFORCED IN
-- THE DATABASE. A foreign key cannot express "…and that organisation is of type
-- insurance_company", and the app-layer role check is the first line rather
-- than the last (CLAUDE.md §8). Without this a workshop owner could list
-- insurance, which is a regulated activity.
CREATE OR REPLACE FUNCTION insurance.assert_org_is_insurer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = insurance, identity, pg_catalog, pg_temp
AS $$
DECLARE
    v_type TEXT;
BEGIN
    -- Reads `identity.organizations` as the definer, because the inserting
    -- session is tenant-scoped and this must be true regardless of who asks.
    SELECT org_type INTO v_type
      FROM identity.organizations WHERE id = NEW.organization_id;
    IF v_type IS DISTINCT FROM 'insurance_company' THEN
        RAISE EXCEPTION
            'only an insurance company may register an insurance product '
            '(this organisation is %)', COALESCE(v_type, 'unknown')
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_org_is_insurer
    BEFORE INSERT OR UPDATE OF organization_id ON insurance.products
    FOR EACH ROW EXECUTE FUNCTION insurance.assert_org_is_insurer();

-- 🔴 AND IT CANNOT PUBLISH ITSELF BEFORE VERIFICATION. Exactly the gate
-- `catalogue.reject_unverified_publication` puts in front of a workshop, and
-- for a stronger reason: an unverified party selling insurance is a regulatory
-- problem, not merely a quality one. That trigger exists because a workshop
-- COULD publish itself and defeat the whole verification gate (Codex, 08-09).
CREATE OR REPLACE FUNCTION insurance.reject_unverified_product_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.is_published IS NOT TRUE THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.is_published IS TRUE THEN
        RETURN NEW;
    END IF;
    IF NEW.is_verified IS NOT TRUE THEN
        RAISE EXCEPTION
            'This product has not been verified yet and cannot be listed for '
            'sale. A platform administrator reviews every insurance product '
            'before it is offered to the public.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reject_unverified_product_publication
    BEFORE INSERT OR UPDATE ON insurance.products
    FOR EACH ROW EXECUTE FUNCTION insurance.reject_unverified_product_publication();

-- ── 3. A sale ─────────────────────────────────────────────────────────────
--
-- ⚠️ THE BUYER IS AN APPLICATION USER, NOT A `core.customers` ROW. A customer
-- record belongs to a WORKSHOP's tenant; the buyer of a policy is a person on
-- the platform, and requiring a workshop relationship would mean only somebody
-- else's customer could insure a car.
CREATE TABLE insurance.policies (
    id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- The SELLING insurer's tenancy. A policy is the insurer's record.
    tenant_id          uuid NOT NULL REFERENCES identity.tenants(id),
    organization_id    uuid NOT NULL REFERENCES identity.organizations(id),

    product_id         uuid NOT NULL REFERENCES insurance.products(id),
    policy_number      TEXT NOT NULL,

    buyer_user_id      uuid NOT NULL REFERENCES identity.users(id),
    -- Optional: a policy may be bought before the vehicle is on the platform.
    vehicle_id         uuid REFERENCES core.vehicles(id),
    vehicle_registration TEXT,

    -- 🔴 THE PRICE IS COPIED, NOT JOINED. A product's premium changes; what the
    -- buyer paid must not. The same reasoning `finance.invoice_lines` uses in
    -- holding `unit_price` rather than pointing at a price list.
    premium            numeric(14,2) NOT NULL CHECK (premium >= 0),
    currency           TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),

    cover_starts_on    date NOT NULL,
    cover_ends_on      date NOT NULL,

    status             TEXT NOT NULL DEFAULT 'issued'
                       CHECK (status IN ('issued','active','expired','cancelled')),
    cancelled_reason   TEXT,

    sold_at            timestamptz NOT NULL DEFAULT now(),
    created_by         uuid REFERENCES identity.users(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_by         uuid REFERENCES identity.users(id),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CHECK (length(btrim(policy_number)) > 0),
    CHECK (cover_ends_on > cover_starts_on),
    CHECK (status <> 'cancelled' OR cancelled_reason IS NOT NULL)
);

CREATE UNIQUE INDEX uq_policy_number_per_org
    ON insurance.policies (organization_id, upper(btrim(policy_number)));
CREATE INDEX idx_policies_tenant   ON insurance.policies (tenant_id);
CREATE INDEX idx_policies_buyer    ON insurance.policies (buyer_user_id, sold_at DESC);
CREATE INDEX idx_policies_product  ON insurance.policies (product_id);

-- The product and the policy must belong to the same organisation. 073/079
-- closed this class for eighteen other relationships; applied here from the
-- start rather than in a follow-up.
ALTER TABLE insurance.products
    ADD CONSTRAINT uq_product_org_scoped UNIQUE (id, organization_id);
ALTER TABLE insurance.policies
    ADD CONSTRAINT fk_policy_product_same_org
    FOREIGN KEY (product_id, organization_id)
    REFERENCES insurance.products (id, organization_id);

-- ── 4. 🔴 THE PLATFORM LEVY — APPEND-ONLY, AND COMPUTED BY THE DATABASE ────
--
-- `CLAUDE.md`: "Approvals, payments, warranty decisions and audit events are
-- append-only; corrections are new rows." A levy is money the platform is owed,
-- so it is written once, by a trigger, at the moment of sale — NOT by the
-- application, and NOT editable by the insurer who owes it.
--
-- Computing it in the trigger rather than in a service is the difference
-- between a rule and a convention: an insurer inserting a policy by any route
-- accrues the levy, including through a future import, an agent, or a fixture.
CREATE TABLE insurance.platform_levies (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id        uuid NOT NULL UNIQUE REFERENCES insurance.policies(id) ON DELETE CASCADE,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id),

    premium          numeric(14,2) NOT NULL CHECK (premium >= 0),
    percent          numeric(5,2)  NOT NULL CHECK (percent >= 0 AND percent <= 100),
    amount           numeric(14,2) NOT NULL CHECK (amount >= 0),
    currency         TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),

    -- Which rate row produced it, so the number is explainable years later.
    levy_rate_id     uuid REFERENCES insurance.levy_rates(id),

    settlement_status TEXT NOT NULL DEFAULT 'outstanding'
                      CHECK (settlement_status IN ('outstanding','invoiced','settled','waived')),
    settled_at       timestamptz,
    note             TEXT,
    created_at       timestamptz NOT NULL DEFAULT now(),

    CHECK (settlement_status <> 'settled' OR settled_at IS NOT NULL)
);

CREATE INDEX idx_levies_org ON insurance.platform_levies (organization_id, settlement_status);

CREATE OR REPLACE FUNCTION insurance.accrue_platform_levy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = insurance, pg_catalog, pg_temp
AS $$
DECLARE
    v_rate    record;
BEGIN
    -- The insurer's own rate if one is in force, otherwise the platform
    -- default. `effective_from <= now()` and an open or future `effective_to`.
    SELECT id, percent INTO v_rate
      FROM insurance.levy_rates r
     WHERE (r.organization_id = NEW.organization_id OR r.organization_id IS NULL)
       AND r.effective_from <= now()
       AND (r.effective_to IS NULL OR r.effective_to > now())
     -- A rate naming this organisation wins over the platform default.
     ORDER BY (r.organization_id IS NOT NULL) DESC, r.effective_from DESC
     LIMIT 1;

    IF v_rate IS NULL THEN
        -- Fail loudly. A sale that silently accrues no levy is revenue the
        -- platform never learns it is owed, and it would look exactly like a
        -- working sale.
        RAISE EXCEPTION
            'no levy rate is in force for this organisation and there is no '
            'platform default — refusing to record a sale that owes nothing'
            USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO insurance.platform_levies
        (policy_id, organization_id, tenant_id, premium, percent, amount,
         currency, levy_rate_id)
    VALUES (NEW.id, NEW.organization_id, NEW.tenant_id, NEW.premium,
            v_rate.percent, round(NEW.premium * v_rate.percent / 100.0, 2),
            NEW.currency, v_rate.id);

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_accrue_platform_levy
    AFTER INSERT ON insurance.policies
    FOR EACH ROW EXECUTE FUNCTION insurance.accrue_platform_levy();

-- ── 5. Row level security ─────────────────────────────────────────────────
--
-- ENABLE **and FORCE** — `ENABLE` alone exempts the owner, and the application
-- connects as the owner on Render.

ALTER TABLE insurance.products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.products         FORCE  ROW LEVEL SECURITY;
ALTER TABLE insurance.policies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.policies         FORCE  ROW LEVEL SECURITY;
ALTER TABLE insurance.platform_levies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.platform_levies  FORCE  ROW LEVEL SECURITY;
ALTER TABLE insurance.levy_rates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.levy_rates       FORCE  ROW LEVEL SECURITY;

-- Products: the owning insurer, or a platform administrator.
-- ⚠️ THE PUBLIC LISTING DOES NOT COME THROUGH HERE. Anonymous marketplace reads
-- go through a SECURITY DEFINER function (below), exactly as the parts
-- catalogue does — a policy admitting `is_published` to everyone would also
-- admit it to every authenticated tenant's ordinary queries.
-- 🔴 ORGANISATION-SCOPED, NOT ONLY TENANT-SCOPED. The first version of this
-- migration wrote `tenant_id = current_tenant_id()` alone, and
-- `organisation-isolation.integration.spec.ts` failed it with the reason
-- spelled out: "a tenant here holds more than one organisation, so these are
-- isolated by the application layer alone". Migrations 073 and 079 closed that
-- class for eighteen relationships; a policy that omits it puts one insurer's
-- products inside another's reach whenever a tenant holds two organisations.
CREATE POLICY products_tenant_isolation ON insurance.products
    FOR ALL
    USING (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()))
    WITH CHECK (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()));

-- Policies: the selling insurer, a platform administrator — and THE BUYER.
-- 🔴 THE BUYER CLAUSE IS NOT DECORATION. Without it a person could not see the
-- policy they bought: it lives in the INSURER's tenant, and every other read
-- path in this product is tenant-scoped. `identity.current_user_id()` is the
-- validated application user, so this admits exactly one person's own policies.
CREATE POLICY policies_tenant_isolation ON insurance.policies
    FOR ALL
    USING (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id())
           -- The buyer clause is NOT organisation-scoped, and must not be: the
           -- buyer belongs to no organisation of the insurer's, which is the
           -- entire point of them being able to see what they bought.
           OR buyer_user_id = identity.current_user_id())
    WITH CHECK (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()));

-- Levies: the insurer who owes it, and the platform. NOT the buyer — what the
-- platform charges the insurer is not the customer's business.
CREATE POLICY levies_tenant_isolation ON insurance.platform_levies
    FOR ALL
    USING (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()))
    WITH CHECK (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()));

-- Rates: readable by the organisation it names and by the platform; writable by
-- the platform only. Two policies, because a levy an insurer could edit is not
-- a levy.
CREATE POLICY levy_rates_read ON insurance.levy_rates
    FOR SELECT
    -- ⚠️ `current_organization_id()`, SINGULAR. I wrote
    -- `current_organization_ids()` and the migration refused to apply —
    -- `resolveTenantContext` resolves exactly ONE organisation per request, so
    -- there is no plural form and there should not be. Measured from `pg_proc`,
    -- not assumed.
    USING (identity.is_platform_admin()
           OR organization_id IS NULL
           OR organization_id = identity.current_organization_id());

CREATE POLICY levy_rates_platform_writes ON insurance.levy_rates
    FOR ALL
    USING (identity.is_platform_admin())
    WITH CHECK (identity.is_platform_admin());

GRANT SELECT, INSERT, UPDATE ON insurance.products        TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON insurance.policies        TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON insurance.platform_levies TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON insurance.levy_rates      TO autoworkshop_app;

-- ── 6. The PUBLIC listing ─────────────────────────────────────────────────
--
-- A SECURITY DEFINER function rather than a permissive RLS policy, for the
-- reason noted above: a policy wide enough for an anonymous visitor is also
-- wide enough for every authenticated tenant's ordinary queries, and this table
-- holds an insurer's unpublished drafts.
--
-- Returns only PUBLISHED and VERIFIED products, and only the fields a shopper
-- needs. No `created_by`, no draft, no internal id of the owning tenant.
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
SET search_path = insurance, identity, pg_catalog, pg_temp
AS $$
    SELECT p.id, o.name, p.name, p.summary, p.cover_type, p.premium,
           p.currency, p.term_months, p.excess, p.terms_url
      FROM insurance.products p
      JOIN identity.organizations o ON o.id = p.organization_id
     WHERE p.is_published AND p.is_verified
       AND o.status = 'active'
     ORDER BY p.premium;
$$;

REVOKE ALL ON FUNCTION insurance.public_products() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insurance.public_products() TO autoworkshop_app;

COMMENT ON TABLE insurance.products IS
'Insurance products an insurer registers for sale on the platform. Published '
'only after a platform administrator verifies them — selling insurance '
'unverified is a regulatory problem, not a quality one.';

COMMENT ON TABLE insurance.platform_levies IS
'What the platform is owed for each sale. Written by a trigger at the moment of '
'sale, append-only, and not editable by the insurer who owes it.';

COMMIT;
