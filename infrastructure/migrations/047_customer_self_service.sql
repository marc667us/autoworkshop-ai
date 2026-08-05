-- 047 — customer self-service: documents, maintenance schedules, drivers, cases
--
-- ══════════════════════════════════════════════════════════════════════════
-- SLICE 9 of docs/00-project/COMPLETION_PLAN.md
-- ══════════════════════════════════════════════════════════════════════════
--
-- 🔴 THE ONLY SLICE THIS SESSION THAT MOVES customer-web, which has been the
-- weakest tree in the product for three sessions — 14 of 38, 31%. Every other
-- slice moved workshop-web only, so the gap was widening rather than closing.
--
-- ── ⚠️ A CUSTOMER OWNS THESE ROWS; THE WORKSHOP HOLDS THEM ─────────────────
--
-- `core.vehicles` is scoped to `organization_id` — a vehicle belongs to the
-- workshop's records, not to a global garage. These tables inherit that: a
-- customer's documents live inside the workshop they gave them to. Two
-- workshops seeing the same customer therefore each hold their own set, which
-- is the honest model — a document handed to one garage was not handed to the
-- other.
--
-- The alternative, a customer-global store, would mean workshop A reading a
-- document uploaded to workshop B, which nobody consented to.
--
-- ── ⚠️ ORGANISATION-SCOPED RLS PLUS A CUSTOMER PREDICATE IN THE SERVICE ────
--
-- RLS keeps workshop A out of workshop B's rows. It CANNOT keep customer X out
-- of customer Y's rows, because both are in the same organisation. So the
-- service carries the customer predicate on every read, exactly as
-- `CommsService` carries the participation predicate — and for the same reason:
-- a policy that cannot express the rule must not be relied on to enforce it.

BEGIN;

-- ── documents a customer holds against a vehicle ────────────────────────────
--
-- ⚠️ THE FILE ITSELF LIVES IN `media`, as everything else does. This table is
-- the CLASSIFICATION — what kind of document it is and when it expires — and
-- points at an asset. A second file store would have been the duplicate
-- mechanism Directive §3 exists to stop, and slice 7 made the same refusal
-- about shared files.

CREATE TABLE IF NOT EXISTS core.vehicle_documents (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    vehicle_id       uuid NOT NULL REFERENCES core.vehicles(id) ON DELETE CASCADE,
    -- Denormalised from the vehicle so the customer predicate is one join
    -- shorter on the hottest read. Kept honest by a trigger below rather than
    -- by hope.
    customer_id      uuid NOT NULL REFERENCES core.customers(id) ON DELETE CASCADE,

    document_kind    TEXT NOT NULL CHECK (document_kind IN (
                        'insurance', 'roadworthiness', 'registration', 'warranty',
                        'service_book', 'purchase_receipt', 'other')),
    title            TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    reference        TEXT,

    -- NULL means "does not expire", which is different from "expired". A
    -- reminder must never fire on a document that has no expiry.
    expires_on       date,

    -- The uploaded file, if there is one. Nullable: a customer may record that
    -- an insurance policy exists and its expiry without having the PDF to hand,
    -- and refusing that would make the expiry reminder useless.
    asset_id         uuid REFERENCES media.assets(id) ON DELETE SET NULL,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehdoc_tenant   ON core.vehicle_documents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehdoc_vehicle  ON core.vehicle_documents (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehdoc_customer ON core.vehicle_documents (organization_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_vehdoc_expiry   ON core.vehicle_documents (organization_id, expires_on)
    WHERE expires_on IS NOT NULL;

-- ── the service plan for a vehicle ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core.maintenance_schedules (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    vehicle_id       uuid NOT NULL REFERENCES core.vehicles(id) ON DELETE CASCADE,
    customer_id      uuid NOT NULL REFERENCES core.customers(id) ON DELETE CASCADE,

    item             TEXT NOT NULL CHECK (length(btrim(item)) > 0),

    -- 🔴 EITHER OR BOTH, NEVER NEITHER. A service is due at a mileage, or on a
    -- date, or whichever comes first — a row with neither is a reminder that can
    -- never fire, which is worse than no row because it looks like cover.
    due_at_km        integer CHECK (due_at_km IS NULL OR due_at_km > 0),
    due_on           date,

    last_done_km     integer CHECK (last_done_km IS NULL OR last_done_km >= 0),
    last_done_on     date,

    notes            TEXT,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_schedule_has_a_trigger CHECK (due_at_km IS NOT NULL OR due_on IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_sched_tenant   ON core.maintenance_schedules (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sched_vehicle  ON core.maintenance_schedules (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_sched_customer ON core.maintenance_schedules (organization_id, customer_id);

-- ── who else may bring the car in ───────────────────────────────────────────
--
-- ⚠️ A DRIVER IS NOT A USER. The person who drops the car off may have no
-- account and never will. So this is a NAMED PERSON with contact details, not a
-- reference to `identity.users` — modelling it as a user would have made
-- "my wife brings it in on Tuesdays" impossible to record.

CREATE TABLE IF NOT EXISTS core.authorized_drivers (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    customer_id      uuid NOT NULL REFERENCES core.customers(id) ON DELETE CASCADE,
    -- Nullable: an authorisation may cover every vehicle the customer owns.
    vehicle_id       uuid REFERENCES core.vehicles(id) ON DELETE CASCADE,

    full_name        TEXT NOT NULL CHECK (length(btrim(full_name)) > 0),
    phone            TEXT,
    relationship     TEXT,

    -- ⚠️ WHAT THEY MAY DO, and it is NOT the same as what the account holder
    -- may do. Someone trusted to collect a car is not thereby trusted to
    -- approve a bill.
    may_drop_off     boolean NOT NULL DEFAULT true,
    may_collect      boolean NOT NULL DEFAULT true,
    may_approve_work boolean NOT NULL DEFAULT false,

    -- Withdrawn rather than deleted: a collection that happened under an old
    -- authorisation must remain explicable.
    is_active        boolean NOT NULL DEFAULT true,
    withdrawn_at     timestamptz,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_withdrawn_is_inactive CHECK (
        (is_active AND withdrawn_at IS NULL) OR (NOT is_active AND withdrawn_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_driver_tenant   ON core.authorized_drivers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_driver_customer ON core.authorized_drivers (organization_id, customer_id);

-- ── support cases ───────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS support;
GRANT USAGE ON SCHEMA support TO autoworkshop_app;

CREATE TABLE IF NOT EXISTS support.cases (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    customer_id      uuid NOT NULL REFERENCES core.customers(id) ON DELETE CASCADE,
    -- What it is about, when it is about something specific.
    job_card_id      uuid REFERENCES repair.job_cards(id) ON DELETE SET NULL,
    vehicle_id       uuid REFERENCES core.vehicles(id) ON DELETE SET NULL,

    reference        TEXT NOT NULL,
    subject          TEXT NOT NULL CHECK (length(btrim(subject)) > 0),
    description      TEXT NOT NULL CHECK (length(btrim(description)) > 0),

    category         TEXT NOT NULL CHECK (category IN (
                        'billing', 'quality', 'delay', 'warranty', 'account', 'other')),
    priority         TEXT NOT NULL DEFAULT 'normal'
                     CHECK (priority IN ('low', 'normal', 'high')),
    status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),

    -- 🔴 A RESOLUTION MUST BE EXPLAINED. A case that goes to resolved with no
    -- word about what was done is a case the customer cannot tell was handled.
    resolution       TEXT,
    resolved_at      timestamptz,

    -- The conversation, when one was started. Slice 7's threads, not a second
    -- messaging mechanism.
    thread_id        uuid REFERENCES comms.threads(id) ON DELETE SET NULL,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_case_reference UNIQUE (organization_id, reference),
    CONSTRAINT ck_resolved_is_explained CHECK (
        status NOT IN ('resolved', 'closed')
        OR (resolution IS NOT NULL AND length(btrim(resolution)) > 0 AND resolved_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_case_tenant   ON support.cases (tenant_id);
CREATE INDEX IF NOT EXISTS idx_case_customer ON support.cases (organization_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_open     ON support.cases (organization_id, status)
    WHERE status IN ('open', 'in_progress');

-- ── case reference allocation ───────────────────────────────────────────────
--
-- 🔴 `SELECT count(*) + 1` WOULD RACE, and the first draft of the service did
-- exactly that with a comment claiming the database made it safe. It does not:
-- under READ COMMITTED two concurrent cases count the same rows, produce the
-- same reference, and the UNIQUE constraint rejects one — a customer's
-- complaint disappearing behind a 500 at precisely the moment two people
-- complain at once.
--
-- This is the SAME allocator migration 006 already uses for job numbers, copied
-- rather than reinvented. `INSERT ... ON CONFLICT DO UPDATE` is atomic: two
-- callers serialise on the row and receive different numbers.
CREATE TABLE IF NOT EXISTS support.case_number_counters (
    organization_id uuid PRIMARY KEY REFERENCES identity.organizations(id) ON DELETE CASCADE,
    next_value      bigint NOT NULL DEFAULT 1
);

CREATE OR REPLACE FUNCTION support.next_case_reference(p_organization_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_next bigint;
BEGIN
    INSERT INTO support.case_number_counters (organization_id, next_value)
         VALUES (p_organization_id, 2)
    ON CONFLICT (organization_id)
      DO UPDATE SET next_value = support.case_number_counters.next_value + 1
      RETURNING next_value - 1 INTO v_next;

    -- Zero-padded so references sort lexically the way people expect.
    RETURN 'CASE-' || lpad(v_next::text, 5, '0');
END;
$$;

-- Holds no tenant data — one integer per organisation — and the application
-- must be able to advance it, so it carries no RLS of its own. Same treatment
-- as `repair.job_number_counters` (migration 006).
GRANT SELECT, INSERT, UPDATE ON support.case_number_counters TO autoworkshop_app;

-- ── the denormalised customer_id must not be able to lie ────────────────────
--
-- 🔴 A DENORMALISED COLUMN IS A SECOND PLACE THE TRUTH CAN LIVE, and the second
-- place is the one that goes stale. `customer_id` is carried on documents and
-- schedules so the customer predicate is one join shorter; this trigger is what
-- stops it disagreeing with the vehicle it belongs to.
--
-- ⚠️ FIRES ON INSERT *AND* UPDATE. A rule enforced on one statement is defeated
-- by the other — recorded twice in this repository (QC 030, variations 032).

CREATE OR REPLACE FUNCTION core.assert_document_customer_matches_vehicle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    owner_id uuid;
BEGIN
    SELECT customer_id INTO owner_id FROM core.vehicles WHERE id = NEW.vehicle_id;
    IF owner_id IS NULL THEN
        RAISE EXCEPTION 'vehicle % has no customer, so a record cannot be attributed to one',
            NEW.vehicle_id USING ERRCODE = 'check_violation';
    END IF;
    IF owner_id <> NEW.customer_id THEN
        RAISE EXCEPTION
            'this record names customer % but the vehicle belongs to customer % — '
            'a record cannot be filed against somebody else''s vehicle',
            NEW.customer_id, owner_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehdoc_customer_matches ON core.vehicle_documents;
CREATE TRIGGER trg_vehdoc_customer_matches
    BEFORE INSERT OR UPDATE ON core.vehicle_documents
    FOR EACH ROW EXECUTE FUNCTION core.assert_document_customer_matches_vehicle();

DROP TRIGGER IF EXISTS trg_sched_customer_matches ON core.maintenance_schedules;
CREATE TRIGGER trg_sched_customer_matches
    BEFORE INSERT OR UPDATE ON core.maintenance_schedules
    FOR EACH ROW EXECUTE FUNCTION core.assert_document_customer_matches_vehicle();

-- ── row-level security ──────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'core.vehicle_documents', 'core.maintenance_schedules',
        'core.authorized_drivers', 'support.cases'
    ] LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_select', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR SELECT USING '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id()))',
            'org_select', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id()))',
            'org_insert', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_update', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR UPDATE USING '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id())) '
            'WITH CHECK '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id()))',
            'org_update', t);
    END LOOP;
END $$;

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- ⚠️ THE REVOKES ARE NOT REDUNDANT — 006's ALTER DEFAULT PRIVILEGES grants
-- UPDATE and DELETE on every new table in these schemas.

GRANT SELECT, INSERT, UPDATE, DELETE ON core.vehicle_documents     TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.maintenance_schedules TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE         ON core.authorized_drivers    TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE         ON support.cases              TO autoworkshop_app;

-- An authorisation is WITHDRAWN, never deleted: a collection that happened
-- under it must remain explicable. A case is closed, never deleted, for the
-- same reason — it is the record of a complaint.
REVOKE DELETE ON core.authorized_drivers FROM autoworkshop_app;
REVOKE DELETE ON support.cases           FROM autoworkshop_app;

COMMIT;
