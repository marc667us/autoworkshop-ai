-- ============================================================================
-- Migration 004 — customers and vehicles (Phase 4, Release 0.3)
--
-- The first business domain in the platform. Everything built after this refers
-- back to it: a job card is opened against a vehicle, an invoice is addressed to
-- a customer, a warranty attaches to a part fitted to a vehicle.
--
-- ── WHY A NEW `core` SCHEMA ────────────────────────────────────────────────
--
-- Not `workshop`. A vehicle is referred to by the workshop workspace, the
-- customer's own garage, a fleet operator's list and an insurer's claim — no
-- single workspace owns it, and naming the schema after one of them would make
-- every later join read as if it did. `core` is the subject records the whole
-- platform points at; Phase 5+ get their own (`repair`, `parts`, `finance`),
-- and those reference `core`, never the reverse.
--
-- ── THE OWNER'S SCHEMA RULE, AND THE QUALIFIER THAT MATTERS ────────────────
--
-- "Use real relationships: foreign keys, joins, normalised tables" (2026-07-27,
-- binding). So a vehicle does not carry a customer's name as text — it carries
-- `customer_id` REFERENCES core.customers, and the screen joins.
--
-- But **a foreign key cannot carry a tenant predicate**. `vehicle.customer_id`
-- guarantees the customer row exists; it says nothing about whose tenant may
-- read it. Integrity and isolation are different problems with different
-- mechanisms, so every tenant-owned table below gets BOTH: real FKs, and
-- `tenant_id` + ENABLE + FORCE ROW LEVEL SECURITY + the tenant index baseline.
-- Migration 001 is the worked example and this follows it exactly.
--
-- ── FIELDS ARE FROM THE SPEC, NOT INVENTED ─────────────────────────────────
--
-- `2.txt` §537: "register one or more vehicles by entering or scanning the
-- registration number, vehicle identification number, make, model, year, engine
-- type, transmission type, fuel type, mileage and insurance information."
-- `02.txt` §12 (customer onboarding): account, verified contact, customer
-- profile, first vehicle, communication preferences, location.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS core;

-- ── vehicle makes and models: a SHARED taxonomy, deliberately not tenant-owned
--
-- Normalising make and model out of the vehicle row is the owner's rule applied
-- where it earns its keep: Phase 6's parts-compatibility matching joins on these
-- ids, and it cannot join on free text where one workshop types "Toyota",
-- another "TOYOTA" and a third "toyata".
--
-- They carry no `tenant_id` and no RLS, for the same reason `identity.users`
-- does not (migration 001): the rows are not one tenant's data. A vehicle make
-- is a public fact about the world, not a commercial secret, and a taxonomy that
-- every tenant maintains privately is not a taxonomy — it is the free text this
-- table exists to replace.
--
-- The application MAY add to it, and that is a considered trade. The alternative
-- is seed-only, which puts a hard wall in front of a workshop the first time a
-- make outside the seed list drives in — a real product failure, in exchange for
-- protecting a list of car manufacturers. `created_by_tenant_id` records who
-- added a row so a bad entry is traceable and attributable, and the service
-- writes an audit event, which is how this stays accountable without being
-- fragmented.
CREATE TABLE IF NOT EXISTS core.vehicle_makes (
    id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                  TEXT NOT NULL,
    -- Provenance, NOT a scope: it does not restrict who may read the row.
    -- Nullable because platform-seeded rows were added by no tenant.
    created_by_tenant_id  uuid REFERENCES identity.tenants(id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_at            timestamptz,
    updated_by            uuid
);

-- Case-insensitive: "Toyota" and "TOYOTA" are the same manufacturer, and a
-- plain UNIQUE(name) would happily store both and defeat the whole point.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_makes_name ON core.vehicle_makes (lower(name));

CREATE TABLE IF NOT EXISTS core.vehicle_models (
    id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    make_id               uuid NOT NULL REFERENCES core.vehicle_makes(id) ON DELETE RESTRICT,
    name                  TEXT NOT NULL,
    created_by_tenant_id  uuid REFERENCES identity.tenants(id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_at            timestamptz,
    updated_by            uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_models_make_name
    ON core.vehicle_models (make_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_vehicle_models_make ON core.vehicle_models(make_id);

-- ── customers ───────────────────────────────────────────────────────────────
--
-- A customer record belongs to an ORGANIZATION, not merely to a tenant: a
-- multi-branch workshop group and a supplier in the same tenant do not share a
-- customer list. `01 (1).txt` §19: "Workshop staff shall see organizational
-- customer records."
--
-- `user_id` is NULLABLE and that is the important part. A walk-in customer who
-- has never opened the app must still be recordable, or reception cannot do its
-- job offline — the platform would be forcing an account on someone to let a
-- workshop write down who owns the car. When the person does register, the same
-- row gains a `user_id` and their garage lights up with the history already
-- there.
CREATE TABLE IF NOT EXISTS core.customers (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
    -- The platform account, when one exists. ON DELETE SET NULL: closing an
    -- account must not delete the workshop's record of who owned the vehicle.
    user_id          uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    customer_type    TEXT NOT NULL DEFAULT 'individual'
                     CHECK (customer_type IN ('individual', 'business')),
    display_name     TEXT NOT NULL,
    email            TEXT,
    phone            TEXT,
    -- `02.txt` §12 — communication preferences are set during onboarding.
    preferred_contact TEXT NOT NULL DEFAULT 'phone'
                     CHECK (preferred_contact IN ('phone', 'email', 'sms', 'in_app')),
    location         TEXT,
    notes            TEXT,
    status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'suspended', 'closed')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz,
    updated_by       uuid
);

-- ── vehicles ────────────────────────────────────────────────────────────────
--
-- `customer_id` is NOT NULL: an unowned vehicle has nobody to quote, invoice or
-- hand the keys back to, so the relationship is mandatory rather than a
-- convention the application is trusted to keep.
--
-- ON DELETE RESTRICT, not CASCADE: deleting a customer must not silently take
-- their service history with it. The delete fails and a human decides.
CREATE TABLE IF NOT EXISTS core.vehicles (
    id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id            uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id      uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
    customer_id          uuid NOT NULL REFERENCES core.customers(id) ON DELETE RESTRICT,

    -- `2.txt` §537 — identity of the vehicle.
    registration_number  TEXT NOT NULL,
    vin                  TEXT,
    make_id              uuid NOT NULL REFERENCES core.vehicle_makes(id) ON DELETE RESTRICT,
    -- Nullable: a make is always known at the gate, an exact model sometimes is
    -- not, and refusing the vehicle over it would push reception back to paper.
    model_id             uuid REFERENCES core.vehicle_models(id) ON DELETE RESTRICT,
    -- `08.txt` §2183 — "VIN and regional vehicle variant". The trim/variant long
    -- tail is regional and endless; it is described, not enumerated.
    variant              TEXT,
    model_year           integer CHECK (model_year IS NULL OR (model_year BETWEEN 1900 AND 2100)),

    engine_type          TEXT,
    transmission_type    TEXT CHECK (transmission_type IS NULL OR transmission_type IN
                          ('manual', 'automatic', 'cvt', 'dual_clutch', 'other')),
    fuel_type            TEXT CHECK (fuel_type IS NULL OR fuel_type IN
                          ('petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'cng', 'other')),
    -- Non-negative rather than unbounded: an odometer cannot be negative, and
    -- the constraint catches a sign error at the door instead of in a service
    -- interval calculation months later.
    current_mileage_km   integer CHECK (current_mileage_km IS NULL OR current_mileage_km >= 0),
    colour               TEXT,

    -- `2.txt` §537 "insurance information" — the facts the VEHICLE carries.
    -- Claims, assessment and authorisation are Phase 7 and get their own tables.
    insurer_name         TEXT,
    insurance_policy_no  TEXT,
    insurance_expires_on date,

    status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'inactive', 'sold', 'scrapped')),
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_at           timestamptz,
    updated_by           uuid
);

-- ── uniqueness, scoped to the tenant ────────────────────────────────────────
--
-- Per TENANT, not globally. The same physical car may be serviced by two
-- unrelated workshops, and a global unique constraint would let one tenant's
-- insert fail because of a row it is not permitted to know exists — leaking the
-- existence of another tenant's data through an error message.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_tenant_registration
    ON core.vehicles (tenant_id, upper(registration_number));

-- Partial: VIN is optional, and NULLs are distinct in a UNIQUE index anyway —
-- stated explicitly so the intent is not mistaken for an oversight.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_tenant_vin
    ON core.vehicles (tenant_id, upper(vin)) WHERE vin IS NOT NULL;

-- ── indexes (CLAUDE.md §11 tenant baseline) ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_customers_tenant         ON core.customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_org     ON core.customers(tenant_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_status  ON core.customers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_created ON core.customers(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_user           ON core.customers(user_id);
-- Reception searches customers by name constantly; trigram makes that an index
-- scan rather than a sequential one on every keystroke.
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
    ON core.customers USING gin (display_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vehicles_tenant          ON core.vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_org      ON core.vehicles(tenant_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_status   ON core.vehicles(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_created  ON core.vehicles(tenant_id, created_at DESC);
-- The join the vehicle list and the customer detail page both make.
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_customer ON core.vehicles(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_make            ON core.vehicles(make_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_model           ON core.vehicles(model_id);
-- `01 (1).txt` §7: the global search bar searches "vehicles, VINs, customers".
CREATE INDEX IF NOT EXISTS idx_vehicles_registration_trgm
    ON core.vehicles USING gin (registration_number gin_trgm_ops);

-- ── row-level security ──────────────────────────────────────────────────────
--
-- FORCE, not merely ENABLE. Without FORCE the table OWNER bypasses the policy,
-- and the owner is the role migrations run as — so the policies would be present
-- and inert. That exact defect is live in the Solar app today (33 tables ENABLEd
-- and never FORCEd); it is not repeated here.

ALTER TABLE core.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.customers FORCE  ROW LEVEL SECURITY;
ALTER TABLE core.vehicles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.vehicles  FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON core.customers;
CREATE POLICY tenant_isolation ON core.customers
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON core.vehicles;
CREATE POLICY tenant_isolation ON core.vehicles
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- core.vehicle_makes and core.vehicle_models carry no RLS on purpose — see the
-- note at their definition. They hold no tenant data; withholding them would
-- mean a vehicle row whose make the reader cannot resolve.

-- ── grants ──────────────────────────────────────────────────────────────────
-- The application connects as autoworkshop_app (NOSUPERUSER, NOBYPASSRLS).
-- Migration 002's ALTER DEFAULT PRIVILEGES covers the `identity` and `audit`
-- schemas only, so a new schema must grant explicitly — otherwise every query
-- here fails with "permission denied for schema core" at runtime, having passed
-- every test that runs as the owner.

GRANT USAGE ON SCHEMA core TO autoworkshop_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON core.customers TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.vehicles  TO autoworkshop_app;

-- The taxonomy is extendable but not editable: INSERT without UPDATE or DELETE.
-- One tenant adding a missing make is a normal Tuesday; one tenant RENAMING
-- "Toyota" for everybody is not, and no application code path needs it.
GRANT SELECT, INSERT ON core.vehicle_makes  TO autoworkshop_app;
GRANT SELECT, INSERT ON core.vehicle_models TO autoworkshop_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA core
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO autoworkshop_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA core
    GRANT USAGE, SELECT ON SEQUENCES TO autoworkshop_app;

-- ── seed: the makes common in the launch market ─────────────────────────────
-- Reference data, not test data: it ships with the product. Deliberately short
-- and honestly incomplete — the point of the INSERT grant above is that the
-- list does not have to be exhaustive to be usable.
INSERT INTO core.vehicle_makes (name)
SELECT m FROM (VALUES
    ('Toyota'), ('Nissan'), ('Honda'), ('Mitsubishi'), ('Suzuki'), ('Mazda'),
    ('Hyundai'), ('Kia'), ('Ford'), ('Chevrolet'), ('Volkswagen'), ('Audi'),
    ('BMW'), ('Mercedes-Benz'), ('Peugeot'), ('Renault'), ('Land Rover'),
    ('Jeep'), ('Isuzu'), ('Tata'), ('Chery'), ('Great Wall'), ('Volvo'),
    ('Scania'), ('MAN'), ('Iveco'), ('Other')
) AS s(m)
WHERE NOT EXISTS (
    SELECT 1 FROM core.vehicle_makes existing WHERE lower(existing.name) = lower(s.m)
);

COMMIT;
