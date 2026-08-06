-- 056 — slice 14: booking a tool or a bay for a job
--
-- ══════════════════════════════════════════════════════════════════════════
-- LIST B item B2. Five technician planning routes. THREE need no schema at
-- all — `parts.stock_on_hand` (a view) answers find-parts, the
-- `catalogue.part_fitments` table answers parts-compatibility, and
-- `comms.threads` already carries a `specialist_support` kind for
-- request-specialist. Only the two RESERVATION routes need anything new.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 ONE TABLE FOR BOTH, BECAUSE THEY ARE THE SAME SHAPE ────────────────
--
-- `/plan-work/tool-reservation` and `/plan-work/equipment-reservation` are two
-- menu entries and one idea: a technician needs a physical thing, for a job,
-- between two times, and nobody else may have it in that window. A torque
-- wrench and a ramp differ in what they are, not in how they are booked.
--
-- Two tables would mean two overlap rules, two release paths and two places to
-- fix the next bug in either. So: one table with a `resource_kind`
-- discriminator, and the FK is deliberately absent because the target lives in
-- a different table per kind — the trigger below is what enforces it, and it
-- checks the row really exists in the right table rather than trusting the id.
--
-- ⚠️ NOT `parts.reservations`. That reserves STOCK — a quantity of a
-- consumable that gets used up. A tool is not consumed and comes back; its
-- reservation has a START and an END, which a stock reservation has no concept
-- of. Overloading it would have put a nullable time window on every stock row
-- and taught the settle path two different meanings of "done".

BEGIN;

CREATE TABLE IF NOT EXISTS parts.resource_bookings (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- WHICH KIND of thing, and WHICH one. No FK: the target table depends on
    -- the kind. `assert_resource_exists` below is the enforcement, and it is
    -- stricter than a FK would be because it also pins the organisation.
    resource_kind    TEXT NOT NULL CHECK (resource_kind IN ('tool', 'bay')),
    resource_id      uuid NOT NULL,

    -- What it is for. A booking with no job is a tool somebody has taken and
    -- not said why, which is the thing this table exists to stop.
    job_card_id      uuid NOT NULL,

    starts_at        timestamptz NOT NULL,
    ends_at          timestamptz NOT NULL,

    status           TEXT NOT NULL DEFAULT 'booked'
                     CHECK (status IN ('booked', 'released', 'cancelled')),
    release_reason   TEXT,

    booked_by        uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- A booking that ends before it starts is a typo, not a night shift. Same
    -- reasoning as `core.opening_hours`, and the same refusal.
    CONSTRAINT ck_booking_window CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_booking_org_resource
    ON parts.resource_bookings (organization_id, resource_kind, resource_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_booking_org_job
    ON parts.resource_bookings (organization_id, job_card_id);
CREATE INDEX IF NOT EXISTS idx_booking_tenant
    ON parts.resource_bookings (tenant_id);

ALTER TABLE parts.resource_bookings DROP CONSTRAINT IF EXISTS uq_booking_id_tenant;
ALTER TABLE parts.resource_bookings ADD CONSTRAINT uq_booking_id_tenant UNIQUE (id, tenant_id);

-- ── the resource must exist, in THIS organisation ──────────────────────────

CREATE OR REPLACE FUNCTION parts.assert_resource_exists()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    found int;
BEGIN
    IF NEW.resource_kind = 'tool' THEN
        SELECT count(*) INTO found FROM parts.tools
         WHERE id = NEW.resource_id
           AND tenant_id = NEW.tenant_id
           AND organization_id = NEW.organization_id;
    ELSE
        SELECT count(*) INTO found FROM core.service_bays
         WHERE id = NEW.resource_id
           AND tenant_id = NEW.tenant_id
           AND organization_id = NEW.organization_id;
    END IF;

    IF found = 0 THEN
        RAISE EXCEPTION 'no % with id % in this workshop', NEW.resource_kind, NEW.resource_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- The job card too. A booking against another workshop's job is how a
    -- technician ends up holding a ramp for work that is not theirs.
    SELECT count(*) INTO found FROM repair.job_cards
     WHERE id = NEW.job_card_id
       AND tenant_id = NEW.tenant_id
       AND organization_id = NEW.organization_id;
    IF found = 0 THEN
        RAISE EXCEPTION 'no job card with id % in this workshop', NEW.job_card_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resource_exists ON parts.resource_bookings;
CREATE TRIGGER trg_resource_exists
    BEFORE INSERT OR UPDATE OF resource_kind, resource_id, job_card_id
    ON parts.resource_bookings
    FOR EACH ROW EXECUTE FUNCTION parts.assert_resource_exists();

-- ── 🔴 NO DOUBLE BOOKING — THE POINT OF THE WHOLE TABLE ────────────────────
--
-- A reservation screen that lets two technicians book one ramp for the same
-- hour has done nothing except add a step. This is a CONSTRAINT rather than a
-- service check because two requests arriving together both read "free" and
-- both write — the same READ COMMITTED race that made `count(*) + 1` unsafe
-- for case references in migration 047.
--
-- `EXCLUDE USING gist` is the only thing that gets this right under
-- concurrency. `WHERE status = 'booked'` so a released or cancelled booking
-- frees the slot rather than blocking it for ever.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE parts.resource_bookings DROP CONSTRAINT IF EXISTS ex_no_double_booking;
ALTER TABLE parts.resource_bookings ADD CONSTRAINT ex_no_double_booking
    EXCLUDE USING gist (
        organization_id WITH =,
        resource_kind   WITH =,
        resource_id     WITH =,
        tstzrange(starts_at, ends_at) WITH &&
    ) WHERE (status = 'booked');

-- ── row-level security: BOTH predicates, per command ───────────────────────
--
-- The organisation predicate is present from the start here — migration 054
-- had to retrofit it onto 49 tables that were written without it, and this is
-- the shape every new table gets from now on. The whole-schema isolation suite
-- checks it automatically.

ALTER TABLE parts.resource_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts.resource_bookings FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_select ON parts.resource_bookings;
CREATE POLICY org_select ON parts.resource_bookings FOR SELECT USING
  (identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id()
   AND organization_id = identity.current_organization_id()));

DROP POLICY IF EXISTS org_insert ON parts.resource_bookings;
CREATE POLICY org_insert ON parts.resource_bookings FOR INSERT WITH CHECK
  (identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id()
   AND organization_id = identity.current_organization_id()));

DROP POLICY IF EXISTS org_update ON parts.resource_bookings;
CREATE POLICY org_update ON parts.resource_bookings FOR UPDATE USING
  (identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id()
   AND organization_id = identity.current_organization_id()))
  WITH CHECK
  (identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id()
   AND organization_id = identity.current_organization_id()));

GRANT SELECT, INSERT, UPDATE ON parts.resource_bookings TO autoworkshop_app;

COMMIT;
