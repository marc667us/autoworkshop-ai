-- 041 — reception: appointments, walk-ins, service bays, feedback
--
-- ══════════════════════════════════════════════════════════════════════════
-- SLICE 2 of docs/00-project/COMPLETION_PLAN.md — THE FRONT OF THE WORKFLOW
-- ══════════════════════════════════════════════════════════════════════════
--
-- Slice 0 gave the workshop a way to OPEN a job card (`POST /job-cards` had no
-- workshop-side caller at all until 2026-08-05). This is what happens BEFORE
-- that: the customer who rings up to book, the one who walks in without an
-- appointment, and the bay their car has to physically go into.
--
-- ── ⚠️ AN APPOINTMENT IS NOT A JOB CARD, AND MUST NOT BECOME ONE EARLY ─────
--
-- The tempting shape is to make a booking create a job card with a future date.
-- It is wrong: a job card is a record that a vehicle IS HERE and work is owed
-- on it, and every queue, board and dashboard count in this product is built on
-- that meaning. Bookings that are cancelled or never turned up for would then
-- inflate every one of those counts, and "1 active job card" — the number the
-- owner's dashboard finally shows real data for — would stop meaning anything.
--
-- So an appointment is its own row, and `converted_job_card_id` records the
-- moment it became real work. The same reasoning applies to a walk-in.
--
-- ── ⚠️ WHY `core.service_bays` AND NOT `reception.service_bays` ────────────
--
-- A bay is a physical property of the workshop, like its opening hours — slice
-- 6 territory. It lands here because an appointment cannot be scheduled against
-- nothing, and building the booking screen first and the bay second would mean
-- shipping a dropdown with no options. `core` is where the workshop's own
-- configuration already lives (`core.organization_profile`).
--
-- ── ⚠️ NO OVERLAP CONSTRAINT ON BAY BOOKINGS, DELIBERATELY ─────────────────
--
-- An exclusion constraint over a tstzrange would refuse two appointments in one
-- bay at the same time, and looks obviously correct. It is not what a workshop
-- wants: reception routinely books two short jobs into one bay knowing one will
-- run over, and a database that REFUSES the booking leaves them writing it on
-- paper — which is the failure this product exists to remove.
--
-- The clash is therefore SURFACED, not forbidden: the screen shows what else is
-- in that bay at that time and lets a person decide. A rule whose escape hatch
-- is unreachable is a wall, not a rule, and that is the most expensive defect
-- class recorded in this repository.

BEGIN;

CREATE SCHEMA IF NOT EXISTS reception;
GRANT USAGE ON SCHEMA reception TO autoworkshop_app;

-- ── service bays ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core.service_bays (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    name             TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    bay_type         TEXT NOT NULL DEFAULT 'general'
                     CHECK (bay_type IN ('general', 'lift', 'alignment', 'diagnostic',
                                         'bodywork', 'paint', 'wash', 'inspection')),
    notes            TEXT,

    -- ⚠️ RETIRED, NEVER DELETED. A bay that closes still appears on every past
    -- appointment; removing the row would orphan history that a person may need
    -- to answer a question about a job from last year.
    is_active        boolean NOT NULL DEFAULT true,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_bay_name UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_bays_tenant ON core.service_bays (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bays_tenant_active
    ON core.service_bays (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_bays_tenant_created
    ON core.service_bays (tenant_id, created_at DESC);

-- ── appointments ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reception.appointments (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    customer_id      uuid NOT NULL REFERENCES core.customers(id) ON DELETE RESTRICT,
    -- NULLABLE, and that is the real world: a customer books a service before
    -- the workshop has their vehicle on file. Requiring it would mean reception
    -- could not take a booking over the telephone from a new customer, which is
    -- most of them.
    vehicle_id       uuid REFERENCES core.vehicles(id) ON DELETE SET NULL,

    service_summary  TEXT NOT NULL CHECK (length(btrim(service_summary)) > 0),
    scheduled_for    timestamptz NOT NULL,
    -- Minutes. An estimate reception makes, not a promise.
    duration_minutes integer NOT NULL DEFAULT 60
                     CHECK (duration_minutes > 0 AND duration_minutes <= 60 * 24),

    bay_id           uuid REFERENCES core.service_bays(id) ON DELETE SET NULL,
    assigned_to      uuid REFERENCES identity.users(id) ON DELETE SET NULL,

    status           TEXT NOT NULL DEFAULT 'booked'
                     CHECK (status IN ('booked', 'confirmed', 'arrived',
                                       'no_show', 'cancelled', 'converted')),

    -- The moment a booking became actual work. See the header for why this is a
    -- reference rather than the appointment simply BEING a job card.
    converted_job_card_id uuid,
    cancellation_reason   TEXT,

    contact_phone    TEXT,
    notes            TEXT,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- A converted appointment must name the card, and an unconverted one must
    -- not. Without this the two facts can disagree and no reader can tell which
    -- to believe — the same shape as media.assets' confirmed_at check.
    CONSTRAINT chk_appt_converted
        CHECK ((status = 'converted') = (converted_job_card_id IS NOT NULL)),
    CONSTRAINT chk_appt_cancelled_has_reason
        CHECK (status <> 'cancelled' OR cancellation_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_appt_tenant ON reception.appointments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_appt_tenant_status
    ON reception.appointments (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_appt_tenant_created
    ON reception.appointments (tenant_id, created_at DESC);
-- The one the calendar actually runs: "what is booked in this window".
CREATE INDEX IF NOT EXISTS idx_appt_schedule
    ON reception.appointments (tenant_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_appt_bay
    ON reception.appointments (tenant_id, bay_id, scheduled_for);

-- ── walk-ins ────────────────────────────────────────────────────────────────
--
-- ⚠️ A WALK-IN IS NOT AN APPOINTMENT WITH scheduled_for = now(). It carries
-- FREE TEXT for the person and the vehicle, because the whole point is that
-- neither is on file yet — someone is standing at the counter and reception has
-- thirty seconds. Forcing a customer record first is how a queue forms.

CREATE TABLE IF NOT EXISTS reception.walk_ins (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    contact_name     TEXT NOT NULL CHECK (length(btrim(contact_name)) > 0),
    contact_phone    TEXT,
    vehicle_description TEXT NOT NULL CHECK (length(btrim(vehicle_description)) > 0),
    registration_number TEXT,
    complaint        TEXT NOT NULL CHECK (length(btrim(complaint)) > 0),

    -- Filled in later, if this person turns out to already be on file or is
    -- registered on the spot. Not required to record the walk-in.
    customer_id      uuid REFERENCES core.customers(id) ON DELETE SET NULL,
    vehicle_id       uuid REFERENCES core.vehicles(id) ON DELETE SET NULL,

    status           TEXT NOT NULL DEFAULT 'waiting'
                     CHECK (status IN ('waiting', 'in_progress', 'converted',
                                       'turned_away', 'left')),
    converted_job_card_id uuid,
    outcome_note     TEXT,

    received_by      uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    received_at      timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_walkin_converted
        CHECK ((status = 'converted') = (converted_job_card_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_walkin_tenant ON reception.walk_ins (tenant_id);
CREATE INDEX IF NOT EXISTS idx_walkin_tenant_status
    ON reception.walk_ins (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_walkin_tenant_created
    ON reception.walk_ins (tenant_id, received_at DESC);

-- ── vehicle intakes ─────────────────────────────────────────────────────────
--
-- The record of a vehicle physically arriving. `media.links.owner_type` already
-- names `vehicle_intake` (migration 040), and `MediaService` currently answers
-- "attaching files to a vehicle intake is not built yet" when it is asked —
-- this is the table that makes that answer stop being true.

CREATE TABLE IF NOT EXISTS reception.vehicle_intakes (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    vehicle_id       uuid NOT NULL REFERENCES core.vehicles(id) ON DELETE RESTRICT,
    job_card_id      uuid,
    appointment_id   uuid REFERENCES reception.appointments(id) ON DELETE SET NULL,

    -- The facts that get argued about at collection.
    odometer_reading integer CHECK (odometer_reading IS NULL OR odometer_reading >= 0),
    fuel_level       TEXT CHECK (fuel_level IS NULL OR fuel_level IN
                                 ('empty', 'quarter', 'half', 'three_quarters', 'full')),
    existing_damage  TEXT,
    items_left_in_vehicle TEXT,
    keys_handed_over integer NOT NULL DEFAULT 1 CHECK (keys_handed_over >= 0),

    received_by      uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    received_at      timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_tenant ON reception.vehicle_intakes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_intake_tenant_created
    ON reception.vehicle_intakes (tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_job_card
    ON reception.vehicle_intakes (tenant_id, job_card_id);

-- ── customer feedback ───────────────────────────────────────────────────────
--
-- ⚠️ APPEND-ONLY, and this one is not a default being followed. Feedback is the
-- customer's own words about the workshop. A workshop that can edit a one-star
-- review has a review system that means nothing, and one that can delete it has
-- a marketing page. The UPDATE grant is revoked below and a trigger refuses
-- rewrites, because a grant alone is not enough (006's ALTER DEFAULT PRIVILEGES
-- hands out UPDATE/DELETE on every new table in the schema — 008 learned that
-- expensively).

CREATE TABLE IF NOT EXISTS reception.customer_feedback (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    job_card_id      uuid,
    customer_id      uuid REFERENCES core.customers(id) ON DELETE SET NULL,

    rating           integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment          TEXT,
    -- Where it came from, so a workshop cannot quietly present staff-entered
    -- praise as a customer's own.
    source           TEXT NOT NULL DEFAULT 'staff_recorded'
                     CHECK (source IN ('customer_portal', 'staff_recorded', 'telephone')),

    -- The workshop's reply. A SEPARATE, LATER fact — never an edit of the
    -- customer's words.
    response         TEXT,
    responded_by     uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    responded_at     timestamptz,

    recorded_by      uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_feedback_response
        CHECK ((response IS NULL) = (responded_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_feedback_tenant ON reception.customer_feedback (tenant_id);
CREATE INDEX IF NOT EXISTS idx_feedback_tenant_created
    ON reception.customer_feedback (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_rating
    ON reception.customer_feedback (tenant_id, rating);

CREATE OR REPLACE FUNCTION reception.reject_feedback_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'reception.customer_feedback is append-only: a workshop that can '
            'delete a review has a marketing page, not a feedback record'
            USING ERRCODE = 'check_violation';
    END IF;

    -- The customer's own words, and who they are about, are fixed. Only the
    -- workshop's REPLY may be added, and only once.
    IF NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.comment IS DISTINCT FROM OLD.comment
       OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.job_card_id IS DISTINCT FROM OLD.job_card_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION
            'reception.customer_feedback (%) is the customer''s own record and '
            'cannot be edited. Add a response instead.', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.response IS NOT NULL AND NEW.response IS DISTINCT FROM OLD.response THEN
        RAISE EXCEPTION
            'the response to feedback % has already been published', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- ⚠️ FIRES ON UPDATE **AND** DELETE. "A rule enforced on UPDATE and nowhere
-- else" has been the defect twice in this repository (QC 030, variations 032):
-- a direct INSERT or DELETE walked straight past a guard that read correct.
DROP TRIGGER IF EXISTS trg_feedback_rewrite ON reception.customer_feedback;
CREATE TRIGGER trg_feedback_rewrite
    BEFORE UPDATE OR DELETE ON reception.customer_feedback
    FOR EACH ROW
    EXECUTE FUNCTION reception.reject_feedback_rewrite();

-- ── row-level security ──────────────────────────────────────────────────────
--
-- ENABLE *and* FORCE on every table, policies PER COMMAND. Enable alone exempts
-- the table owner, which is the role the app connects as. And FORCE is not
-- theatre: migration 039 exists because the production owner is not a superuser
-- while the local one is, so a policy that looks inert locally binds live.

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'core.service_bays',
        'reception.appointments',
        'reception.walk_ins',
        'reception.vehicle_intakes',
        'reception.customer_feedback'
    ] LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_select', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR SELECT USING '
            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
            'tenant_select', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
            'tenant_insert', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'tenant_update', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR UPDATE USING '
            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id()) '
            'WITH CHECK '
            '(identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())',
            'tenant_update', t);
    END LOOP;
END $$;

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- ⚠️ THE REVOKES ARE NOT REDUNDANT. Migration 006's ALTER DEFAULT PRIVILEGES
-- already grants UPDATE/DELETE on new tables in these schemas, so a table that
-- merely omits DELETE from its GRANT still HAS it.
--
-- NO DELETE ANYWHERE. A cancelled appointment is `status = 'cancelled'` with a
-- reason, which is a fact worth keeping — a workshop asking "why did this
-- customer stop coming" needs it. A deleted row answers nothing.

GRANT SELECT, INSERT, UPDATE ON core.service_bays            TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON reception.appointments       TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON reception.walk_ins           TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON reception.vehicle_intakes    TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON reception.customer_feedback  TO autoworkshop_app;

REVOKE DELETE ON core.service_bays            FROM autoworkshop_app;
REVOKE DELETE ON reception.appointments       FROM autoworkshop_app;
REVOKE DELETE ON reception.walk_ins           FROM autoworkshop_app;
REVOKE DELETE ON reception.vehicle_intakes    FROM autoworkshop_app;
REVOKE DELETE, UPDATE ON reception.customer_feedback FROM autoworkshop_app;
-- Feedback needs UPDATE for the workshop's response and nothing else; the
-- trigger above is what limits it to that. Re-granted after the blanket revoke
-- so the intent reads in one place.
GRANT UPDATE ON reception.customer_feedback TO autoworkshop_app;

COMMIT;
