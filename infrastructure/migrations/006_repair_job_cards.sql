-- ============================================================================
-- Migration 006 — job cards (Phase 5, Release 0.4)
--
-- The record the whole repair domain hangs off. `1.txt` §322: "This domain
-- shall control the complete repair lifecycle." An inspection, a diagnosis, a
-- quotation, a parts requisition, an invoice and a warranty all point at a job
-- card, so it lands before any of them.
--
-- ── STAGES ARE TRANSCRIBED, NOT INVENTED ───────────────────────────────────
--
-- `1.txt` §322-§360 lists the job stages, in order, and `02.txt` §29 adds
-- `On Hold` as a staging-board column. Both are reproduced below exactly. The
-- CHECK constraint is the authority: a stage outside this list is a defect, and
-- the database says so rather than the value quietly reaching a board column
-- that does not exist.
--
-- ── WHY A `repair` SCHEMA ──────────────────────────────────────────────────
--
-- `core` holds the SUBJECT records — who the customer is, which vehicle. A job
-- card is an EVENT about them, owned by the workshop, with its own lifecycle.
-- Keeping them apart means Phase 6's parts and Phase 7's invoices reference
-- `repair`, `repair` references `core`, and nothing references backwards.
--
-- ── THE OWNER'S SCHEMA RULE ────────────────────────────────────────────────
--
-- Real foreign keys: `customer_id`, `vehicle_id`, `assigned_technician_id` are
-- references, not names copied in. And the qualifier that keeps being earned —
-- a foreign key cannot carry a tenant predicate — so this table also gets
-- `tenant_id`, `organization_id`, ENABLE **and FORCE** RLS, explicit predicates
-- in every query, and the tenant index baseline.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS repair;

-- ── job number allocation ───────────────────────────────────────────────────
--
-- A counter PER ORGANIZATION, not a global sequence.
--
-- A single platform-wide sequence would be simpler and would leak: job number
-- `JC-004821` tells the workshop that read it roughly how much business every
-- other tenant on the platform has done. That is a small disclosure, but it is
-- free to avoid and impossible to retract once numbers are printed on customer
-- paperwork.
--
-- Allocation takes the row lock via `INSERT ... ON CONFLICT DO UPDATE`, which is
-- atomic: two concurrent intakes in the same organisation serialise on that row
-- and receive different numbers. A `SELECT max(job_number)+1` would race and
-- issue duplicates under exactly the load a busy reception desk creates.
CREATE TABLE IF NOT EXISTS repair.job_number_counters (
    organization_id uuid PRIMARY KEY REFERENCES identity.organizations(id) ON DELETE CASCADE,
    next_value      bigint NOT NULL DEFAULT 1
);

CREATE OR REPLACE FUNCTION repair.next_job_number(p_organization_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_next bigint;
BEGIN
    INSERT INTO repair.job_number_counters (organization_id, next_value)
         VALUES (p_organization_id, 2)
    ON CONFLICT (organization_id)
      DO UPDATE SET next_value = repair.job_number_counters.next_value + 1
      RETURNING next_value - 1 INTO v_next;

    -- Zero-padded so job numbers sort lexically the way humans expect them to,
    -- on paperwork and in a spreadsheet export.
    RETURN 'JC-' || lpad(v_next::text, 6, '0');
END;
$$;

-- ── job cards ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repair.job_cards (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
    -- The branch doing the work. Nullable: a single-site workshop has no
    -- meaningful branch, and forcing one would invent an organisational layer.
    branch_id        uuid REFERENCES identity.branches(id) ON DELETE SET NULL,

    -- `02.txt` §29: "Each job card shall show: Job number."
    job_number       TEXT NOT NULL,

    -- `3.txt` §1139 — the vehicle, the customer, the complaint.
    -- RESTRICT on both: deleting a customer or vehicle must not silently take
    -- the repair record with it. The delete fails and a human decides.
    customer_id      uuid NOT NULL REFERENCES core.customers(id) ON DELETE RESTRICT,
    vehicle_id       uuid NOT NULL REFERENCES core.vehicles(id)  ON DELETE RESTRICT,
    complaint        TEXT NOT NULL,

    -- `1.txt` §322-§360, in the order the specification lists them, plus
    -- `on_hold` from `02.txt` §29's board.
    stage            TEXT NOT NULL DEFAULT 'complaint_received'
                     CHECK (stage IN (
                       'complaint_received', 'appointment_confirmed', 'vehicle_received',
                       'initial_inspection', 'diagnosis_in_progress',
                       'further_information_required', 'solution_preparation',
                       'quotation_preparation', 'awaiting_customer_approval',
                       'awaiting_deposit', 'awaiting_parts', 'authorized_to_start',
                       'repair_in_progress', 'specialist_consultation', 'testing',
                       'quality_control', 'ready_for_collection', 'completed',
                       'warranty_follow_up', 'on_hold')),

    priority         TEXT NOT NULL DEFAULT 'normal'
                     CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    -- `3.txt` §1139 "assigned technician". A REFERENCE to the platform user,
    -- and the column the technician's own job list is scoped by — so this is
    -- an authorization input, not a label.
    assigned_technician_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,

    expected_completion_on date,
    -- The odometer AT INTAKE. Deliberately copied rather than joined: the
    -- vehicle's current mileage changes, and a job card must record what was on
    -- the clock when the vehicle came in. This is not denormalisation of a
    -- shared fact, it is a different fact that happens to share a unit.
    mileage_at_intake      integer CHECK (mileage_at_intake IS NULL OR mileage_at_intake >= 0),

    opened_at        timestamptz NOT NULL DEFAULT now(),
    closed_at        timestamptz,

    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz,
    updated_by       uuid
);

-- Per ORGANIZATION, matching the read scope. Migration 005 moved vehicle
-- uniqueness to organization scope precisely because a constraint scoped wider
-- than the read is observable through the error it raises — a cross-organisation
-- existence oracle. The same reasoning applies here from the start.
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_cards_org_number
    ON repair.job_cards (organization_id, job_number);

-- ── indexes (CLAUDE.md §11 tenant baseline) ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_job_cards_tenant          ON repair.job_cards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_tenant_org      ON repair.job_cards(tenant_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_tenant_stage    ON repair.job_cards(tenant_id, stage);
CREATE INDEX IF NOT EXISTS idx_job_cards_tenant_created  ON repair.job_cards(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_cards_vehicle         ON repair.job_cards(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_customer        ON repair.job_cards(customer_id);
-- The technician's own list is the hottest query in the workshop: every
-- technician loads it on every shift.
CREATE INDEX IF NOT EXISTS idx_job_cards_technician
    ON repair.job_cards(organization_id, assigned_technician_id);

-- ── row-level security ──────────────────────────────────────────────────────
-- FORCE, not merely ENABLE: without it the table OWNER — the role migrations
-- run as — bypasses the policy entirely, leaving it present and inert.
ALTER TABLE repair.job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.job_cards FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.job_cards;
CREATE POLICY tenant_isolation ON repair.job_cards
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- `repair.job_number_counters` holds no tenant data — one integer per
-- organisation — but it IS keyed by organisation, so it is scoped too rather
-- than left as the one readable-by-anyone table in the schema.
ALTER TABLE repair.job_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.job_number_counters FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON repair.job_number_counters;
CREATE POLICY org_isolation ON repair.job_number_counters
    USING (identity.is_platform_admin()
           OR organization_id IN (SELECT id FROM identity.organizations))
    WITH CHECK (identity.is_platform_admin()
           OR organization_id IN (SELECT id FROM identity.organizations));

-- ── grants ──────────────────────────────────────────────────────────────────
-- A new schema needs explicit grants: migration 002's ALTER DEFAULT PRIVILEGES
-- covers `identity` and `audit` only, so without these every query fails at
-- runtime with "permission denied for schema repair" having passed every test
-- that runs as the owner.
GRANT USAGE ON SCHEMA repair TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON repair.job_cards TO autoworkshop_app;
-- The counter is read and written by the allocator, never deleted.
GRANT SELECT, INSERT, UPDATE ON repair.job_number_counters TO autoworkshop_app;
GRANT EXECUTE ON FUNCTION repair.next_job_number(uuid) TO autoworkshop_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA repair
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO autoworkshop_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA repair
    GRANT USAGE, SELECT ON SEQUENCES TO autoworkshop_app;

COMMIT;
