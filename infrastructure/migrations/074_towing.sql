-- 074 — the towing workspace gets a database
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY. `packages/navigation` has advertised a full ten-entry Towing and
-- Roadside Support menu (`autoworkshop 02.txt` §52) since the trees were
-- transcribed. `apps/towing-web` has a layout, a landing page and a catch-all.
-- Measured 2026-08-09: **0 of 10 menu entries have a screen**, and there is no
-- `towing` schema and no towing route in the API at all.
--
-- The owner's words: *"still so many functionalities show not built yet"*. The
-- coverage audit printed 100% because it only measured workshop-web and
-- customer-web. Corrected, the product is 255 of 380 distinct screens; towing
-- is the smallest of the five unbuilt apps and therefore the first one that
-- can be finished rather than started.
--
-- ── THE SHAPE, FROM §52's OWN TEN ENTRIES ─────────────────────────────────
--
--   new-requests          → towing.requests        (a call for help arrives)
--   dispatch-board        → requests + free drivers and trucks
--   drivers               → towing.drivers
--   recovery-vehicles     → towing.recovery_vehicles
--   active-recoveries     → towing.recoveries      (dispatched … towing)
--   completed-recoveries  → towing.recoveries      (completed | cancelled)
--   incidents             → towing.incidents
--   invoices              → towing.invoices
--   settings              → towing.settings        (one row per organisation)
--   dashboard             → counts over the above
--
-- ── 🔴 ORGANISATION-SCOPED FROM THE FIRST LINE ────────────────────────────
--
-- Migration 073 spent an entire session retrofitting `(x, tenant_id,
-- organization_id)` onto eighteen references that had been written without it,
-- because REFERENTIAL INTEGRITY CHECKS BYPASS ROW LEVEL SECURITY: a
-- single-column key accepts another organisation's row and no policy is ever
-- consulted. Every cross-table reference below is composite from the start.
-- Nothing here should ever need a 073 of its own.
--
-- `core.customers` and `core.vehicles` gain the composite key they were
-- missing so a roadside request can name a KNOWN customer without opening the
-- same hole. That is two more parents brought into the rule, not a new one.
--
-- ── ⚠️ A ROADSIDE CALLER IS USUALLY NOT A REGISTERED CUSTOMER ─────────────
--
-- Someone broken down on the N1 at midnight is a phone number and a location,
-- not an account. So `towing.requests` carries its own contact and location
-- TEXT, and `customer_id` / `vehicle_id` are NULLABLE links used only when the
-- caller turns out to be on the books. Requiring a customer record before a
-- recovery can be logged would make the fastest path through this workspace
-- the one that skips it.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS towing;
GRANT USAGE ON SCHEMA towing TO autoworkshop_app;

-- Two existing parents join the composite-key rule (see header).
CREATE UNIQUE INDEX uq_customers_id_tenant_org
    ON core.customers (id, tenant_id, organization_id);
CREATE UNIQUE INDEX uq_vehicles_id_tenant_org
    ON core.vehicles (id, tenant_id, organization_id);

-- ---------------------------------------------------------------------------
-- towing.recovery_vehicles — the trucks
-- ---------------------------------------------------------------------------
CREATE TABLE towing.recovery_vehicles (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- TEXT, never VARCHAR(n) — the schema rule this repo learned from Solar.
    registration     TEXT NOT NULL CHECK (length(btrim(registration)) > 0),
    label            TEXT NOT NULL CHECK (length(btrim(label)) > 0),
    vehicle_type     TEXT NOT NULL DEFAULT 'flatbed'
                     CHECK (vehicle_type IN ('flatbed','wheel_lift','heavy_wrecker','service_van')),
    -- Kilograms. INTEGER, not a float: a capacity is a whole number and a
    -- rounding error here is a truck sent to a job it cannot lift.
    capacity_kg      integer CHECK (capacity_kg IS NULL OR capacity_kg > 0),
    status           TEXT NOT NULL DEFAULT 'available'
                     CHECK (status IN ('available','on_job','maintenance','retired')),
    notes            TEXT,

    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_recovery_vehicle_registration
        UNIQUE (organization_id, registration)
);
CREATE UNIQUE INDEX uq_recovery_vehicles_id_tenant_org
    ON towing.recovery_vehicles (id, tenant_id, organization_id);
CREATE INDEX idx_recovery_vehicles_org_status
    ON towing.recovery_vehicles (organization_id, status);

-- ---------------------------------------------------------------------------
-- towing.drivers — who drives them
-- ---------------------------------------------------------------------------
CREATE TABLE towing.drivers (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- ⚠️ A LIVE POINTER, so ON DELETE SET NULL — the same call
    -- `repair.job_cards.assigned_technician_id` makes, and the opposite of the
    -- one `repair_plan_tasks` makes. A driver who leaves should stop being
    -- linked to an account; a COMPLETED recovery still records who drove it,
    -- and that is held on `towing.recoveries`, not here.
    --
    -- Single-column deliberately: `identity.users` is platform-level and has no
    -- tenant of its own. Whether this person may work here is a MEMBERSHIP
    -- question, which no foreign key can express.
    user_id          uuid REFERENCES identity.users(id) ON DELETE SET NULL,

    full_name        TEXT NOT NULL CHECK (length(btrim(full_name)) > 0),
    phone            TEXT NOT NULL CHECK (length(btrim(phone)) > 0),
    licence_number   TEXT,
    licence_expires  date,
    status           TEXT NOT NULL DEFAULT 'available'
                     CHECK (status IN ('available','on_job','off_duty','inactive')),

    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_drivers_id_tenant_org
    ON towing.drivers (id, tenant_id, organization_id);
CREATE INDEX idx_drivers_org_status ON towing.drivers (organization_id, status);

-- ---------------------------------------------------------------------------
-- towing.requests — a call for help
-- ---------------------------------------------------------------------------
CREATE TABLE towing.requests (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    reference        TEXT NOT NULL CHECK (length(btrim(reference)) > 0),

    -- The caller, as they actually reach us: a name and a number.
    contact_name     TEXT NOT NULL CHECK (length(btrim(contact_name)) > 0),
    contact_phone    TEXT NOT NULL CHECK (length(btrim(contact_phone)) > 0),

    -- Optional links, used when the caller is already on the books. See header.
    customer_id      uuid,
    vehicle_id       uuid,
    vehicle_description TEXT NOT NULL CHECK (length(btrim(vehicle_description)) > 0),

    pickup_location  TEXT NOT NULL CHECK (length(btrim(pickup_location)) > 0),
    dropoff_location TEXT,
    fault_summary    TEXT NOT NULL CHECK (length(btrim(fault_summary)) > 0),

    priority         TEXT NOT NULL DEFAULT 'normal'
                     CHECK (priority IN ('low','normal','high','emergency')),
    status           TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new','triaged','dispatched','cancelled')),
    cancel_reason    TEXT,

    received_at      timestamptz NOT NULL DEFAULT now(),
    created_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_request_reference UNIQUE (organization_id, reference),

    -- A cancellation must say why. "Cancelled" with no reason is the message
    -- the next person cannot act on — the same rule 058 applies to declines.
    CONSTRAINT ck_request_cancelled
        CHECK ((status = 'cancelled') = (cancel_reason IS NOT NULL)),

    CONSTRAINT fk_request_customer_scope
        FOREIGN KEY (customer_id, tenant_id, organization_id)
        REFERENCES core.customers (id, tenant_id, organization_id)
        ON DELETE SET NULL (customer_id),
    CONSTRAINT fk_request_vehicle_scope
        FOREIGN KEY (vehicle_id, tenant_id, organization_id)
        REFERENCES core.vehicles (id, tenant_id, organization_id)
        ON DELETE SET NULL (vehicle_id)
);
CREATE UNIQUE INDEX uq_requests_id_tenant_org
    ON towing.requests (id, tenant_id, organization_id);
CREATE INDEX idx_requests_org_status   ON towing.requests (organization_id, status);
CREATE INDEX idx_requests_org_received ON towing.requests (organization_id, received_at DESC);
CREATE INDEX idx_requests_customer     ON towing.requests (customer_id);
CREATE INDEX idx_requests_vehicle      ON towing.requests (vehicle_id);

-- ---------------------------------------------------------------------------
-- towing.recoveries — a request that has been dispatched
-- ---------------------------------------------------------------------------
CREATE TABLE towing.recoveries (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    request_id       uuid NOT NULL,
    driver_id        uuid NOT NULL,
    vehicle_id       uuid NOT NULL,

    status           TEXT NOT NULL DEFAULT 'dispatched'
                     CHECK (status IN ('dispatched','en_route','on_scene','towing','completed','cancelled')),

    dispatched_at    timestamptz NOT NULL DEFAULT now(),
    completed_at     timestamptz,
    -- Kilometres travelled, priced by `towing.settings.rate_per_km`. NUMERIC,
    -- never a float: this multiplies into money.
    distance_km      numeric(10,2) CHECK (distance_km IS NULL OR distance_km >= 0),
    cancel_reason    TEXT,
    notes            TEXT,

    created_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- ONE recovery per request. Dispatching the same call twice is how two
    -- trucks arrive at one breakdown.
    CONSTRAINT uq_recovery_request UNIQUE (request_id),

    -- A settled recovery must say when it settled, and a cancellation why.
    CONSTRAINT ck_recovery_completed
        CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
    CONSTRAINT ck_recovery_cancelled
        CHECK ((status = 'cancelled') = (cancel_reason IS NOT NULL)),

    CONSTRAINT fk_recovery_request_scope
        FOREIGN KEY (request_id, tenant_id, organization_id)
        REFERENCES towing.requests (id, tenant_id, organization_id)
        ON DELETE NO ACTION,
    CONSTRAINT fk_recovery_driver_scope
        FOREIGN KEY (driver_id, tenant_id, organization_id)
        REFERENCES towing.drivers (id, tenant_id, organization_id)
        ON DELETE NO ACTION,
    CONSTRAINT fk_recovery_vehicle_scope
        FOREIGN KEY (vehicle_id, tenant_id, organization_id)
        REFERENCES towing.recovery_vehicles (id, tenant_id, organization_id)
        ON DELETE NO ACTION
);
CREATE UNIQUE INDEX uq_recoveries_id_tenant_org
    ON towing.recoveries (id, tenant_id, organization_id);
CREATE INDEX idx_recoveries_org_status     ON towing.recoveries (organization_id, status);
CREATE INDEX idx_recoveries_org_dispatched ON towing.recoveries (organization_id, dispatched_at DESC);
CREATE INDEX idx_recoveries_driver         ON towing.recoveries (driver_id);
CREATE INDEX idx_recoveries_vehicle        ON towing.recoveries (vehicle_id);

-- ---------------------------------------------------------------------------
-- towing.incidents — something went wrong on a recovery
-- ---------------------------------------------------------------------------
CREATE TABLE towing.incidents (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    recovery_id      uuid NOT NULL,
    kind             TEXT NOT NULL
                     CHECK (kind IN ('vehicle_damage','injury','equipment_failure','delay','dispute','other')),
    severity         TEXT NOT NULL DEFAULT 'low'
                     CHECK (severity IN ('low','medium','high')),
    summary          TEXT NOT NULL CHECK (length(btrim(summary)) > 0),
    status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','investigating','resolved')),
    resolution       TEXT,

    reported_at      timestamptz NOT NULL DEFAULT now(),
    reported_by      uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_incident_resolved
        CHECK ((status = 'resolved') = (resolution IS NOT NULL)),

    -- CASCADE: an incident is a fact ABOUT one recovery and has no meaning
    -- without it.
    CONSTRAINT fk_incident_recovery_scope
        FOREIGN KEY (recovery_id, tenant_id, organization_id)
        REFERENCES towing.recoveries (id, tenant_id, organization_id)
        ON DELETE CASCADE
);
CREATE INDEX idx_incidents_org_status ON towing.incidents (organization_id, status);
CREATE INDEX idx_incidents_recovery   ON towing.incidents (recovery_id);

-- ---------------------------------------------------------------------------
-- towing.invoices — billing a completed recovery
--
-- ⚠️ NOT `finance.invoices`. That table requires `job_card_id NOT NULL` — it
-- invoices WORKSHOP work — and a roadside recovery has no job card. Forcing a
-- phantom job card to reuse the table would corrupt the workshop's own
-- reporting, so towing bills separately and the two reconcile at the ledger,
-- not in the schema.
-- ---------------------------------------------------------------------------
CREATE TABLE towing.invoices (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    recovery_id      uuid NOT NULL,
    invoice_number   TEXT NOT NULL CHECK (length(btrim(invoice_number)) > 0),
    currency         TEXT NOT NULL DEFAULT 'GHS',
    callout_fee      numeric(14,2) NOT NULL DEFAULT 0 CHECK (callout_fee >= 0),
    distance_charge  numeric(14,2) NOT NULL DEFAULT 0 CHECK (distance_charge >= 0),
    other_charges    numeric(14,2) NOT NULL DEFAULT 0 CHECK (other_charges >= 0),
    -- Stored, not computed on read: the total a customer was shown must not
    -- change because a rate changed afterwards.
    total            numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','issued','paid','void')),
    void_reason      TEXT,

    issued_at        timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_towing_invoice_number UNIQUE (organization_id, invoice_number),
    CONSTRAINT uq_towing_invoice_recovery UNIQUE (recovery_id),
    CONSTRAINT ck_towing_invoice_void
        CHECK ((status = 'void') = (void_reason IS NOT NULL)),
    CONSTRAINT ck_towing_invoice_issued
        CHECK (status = 'draft' OR issued_at IS NOT NULL),

    CONSTRAINT fk_towing_invoice_recovery_scope
        FOREIGN KEY (recovery_id, tenant_id, organization_id)
        REFERENCES towing.recoveries (id, tenant_id, organization_id)
        ON DELETE NO ACTION
);
CREATE INDEX idx_towing_invoices_org_status ON towing.invoices (organization_id, status);
CREATE INDEX idx_towing_invoices_recovery   ON towing.invoices (recovery_id);

-- ---------------------------------------------------------------------------
-- towing.settings — one row per organisation
-- ---------------------------------------------------------------------------
CREATE TABLE towing.settings (
    organization_id  uuid PRIMARY KEY REFERENCES identity.organizations(id) ON DELETE CASCADE,
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,

    currency         TEXT NOT NULL DEFAULT 'GHS',
    callout_fee      numeric(14,2) NOT NULL DEFAULT 0 CHECK (callout_fee >= 0),
    rate_per_km      numeric(14,2) NOT NULL DEFAULT 0 CHECK (rate_per_km >= 0),
    service_radius_km integer CHECK (service_radius_km IS NULL OR service_radius_km > 0),
    operates_24h     boolean NOT NULL DEFAULT false,
    dispatch_notes   TEXT,

    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- RLS — every table, ENABLE **and** FORCE
--
-- 🔴 ENABLE WITHOUT FORCE IS INERT FOR THE TABLE OWNER, and the application
-- connects as the owner on Render. Solar shipped 33 tables that way and every
-- policy on them did nothing. Both lines, every table, no exceptions.
--
-- The predicate is the one migration 064 settled on and 067 extended: tenant
-- AND organisation, and NOT the `customer` role. Since 061 "a customer" means
-- any stranger who enrolled at a published workshop, so a missing customer
-- clause here would hand the public a workshop's driver roster, its incident
-- log and its billing.
-- ---------------------------------------------------------------------------
DO $rls$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['recovery_vehicles','drivers','requests','recoveries','incidents','invoices','settings']
    LOOP
        EXECUTE format('ALTER TABLE towing.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE towing.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON towing.%I TO autoworkshop_app', t);

        EXECUTE format($p$
            CREATE POLICY towing_%1$s_select ON towing.%1$I FOR SELECT USING (
              identity.is_platform_admin()
              OR (tenant_id = identity.current_tenant_id()
                  AND organization_id = identity.current_organization_id()
                  AND identity.current_role_name() <> 'customer')
            )$p$, t);

        EXECUTE format($p$
            CREATE POLICY towing_%1$s_insert ON towing.%1$I FOR INSERT WITH CHECK (
              identity.is_platform_admin()
              OR (tenant_id = identity.current_tenant_id()
                  AND organization_id = identity.current_organization_id()
                  AND identity.current_role_name() <> 'customer')
            )$p$, t);

        -- ⚠️ RLS says WHO may write the row; the service says WHICH COLUMNS may
        -- change. A policy cannot restrict an UPDATE to particular columns —
        -- the same note 059 and 064 carry, for the same reason.
        EXECUTE format($p$
            CREATE POLICY towing_%1$s_update ON towing.%1$I FOR UPDATE USING (
              identity.is_platform_admin()
              OR (tenant_id = identity.current_tenant_id()
                  AND organization_id = identity.current_organization_id()
                  AND identity.current_role_name() <> 'customer')
            ) WITH CHECK (
              identity.is_platform_admin()
              OR (tenant_id = identity.current_tenant_id()
                  AND organization_id = identity.current_organization_id()
                  AND identity.current_role_name() <> 'customer')
            )$p$, t);
    END LOOP;
END
$rls$;

COMMENT ON SCHEMA towing IS
'Towing and Roadside Support (02.txt §52). Separate from repair: a roadside '
'caller has no job card and usually no customer record, so requiring either '
'would make the fastest path through this workspace the one that skips it.';

COMMIT;
