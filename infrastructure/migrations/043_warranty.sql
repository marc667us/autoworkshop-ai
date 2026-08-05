-- 043 — warranty: policies, claims, claim events
--
-- ══════════════════════════════════════════════════════════════════════════
-- SLICE 5 of docs/00-project/COMPLETION_PLAN.md — what happens when it fails again
-- ══════════════════════════════════════════════════════════════════════════
--
-- Sequenced after slice 3 because a warranty claim with no invoice to claim
-- against is a form with nowhere to write: the whole question a claim answers is
-- "was this the work we already charged for, and is it still covered?"
--
-- ── ⚠️ A POLICY IS ATTACHED TO A JOB, NOT SOLD AS A PRODUCT ────────────────
--
-- This is not an insurance module. A workshop warrants ITS OWN WORK — "twelve
-- months or twenty thousand kilometres on this repair" — so a policy is created
-- from a completed job card and inherits its vehicle. Modelling it as a product
-- somebody buys would need a price, a term sheet and a seller, none of which
-- exist here.
--
-- ── ⚠️ COVER EXPIRES ON EITHER DISTANCE OR TIME, WHICHEVER COMES FIRST ─────
--
-- Both limits are optional and at least one is required, enforced by a CHECK. A
-- policy with neither would cover a car forever, which no workshop means and
-- nobody would notice until a claim arrived on a ten-year-old repair.
--
-- ── 🔴 DECISIONS ARE APPEND-ONLY (CLAUDE.md) ───────────────────────────────
--
-- "Approvals, payments, warranty decisions and audit events are append-only."
-- So a claim's OUTCOME is not a column that gets overwritten — every assessment,
-- approval and rejection is a row in `warranty.claim_events`, and the claim's
-- status is the latest one. A workshop that could rewrite a rejection into an
-- approval has a warranty record that means nothing.
--
-- The claim row itself carries a mutable `status` for querying, kept in step by
-- a trigger that only ever moves it forward from the events. That is a cache of
-- the history, never a substitute for it.

BEGIN;

CREATE SCHEMA IF NOT EXISTS warranty;
GRANT USAGE ON SCHEMA warranty TO autoworkshop_app;

-- ── policies ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warranty.policies (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- The work being warranted. No FK, for the same reason `finance.invoices`
    -- has none on this column: a job card is scoped by tenant + organisation and
    -- a composite key would add nothing RLS does not already enforce.
    job_card_id      uuid NOT NULL,
    vehicle_id       uuid REFERENCES core.vehicles(id) ON DELETE SET NULL,
    invoice_id       uuid,

    policy_number    TEXT NOT NULL CHECK (length(btrim(policy_number)) > 0),

    -- What is covered, in the workshop's own words. TEXT, never VARCHAR(n).
    cover_summary    TEXT NOT NULL CHECK (length(btrim(cover_summary)) > 0),

    starts_on        date NOT NULL DEFAULT CURRENT_DATE,
    -- Either limit may be null; at least one must not be. See the header.
    expires_on       date,
    expires_at_odometer integer CHECK (expires_at_odometer IS NULL OR expires_at_odometer > 0),

    status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'expired', 'voided')),
    void_reason      TEXT,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_policy_number UNIQUE (organization_id, policy_number),
    -- A policy with no limit at all would cover the vehicle forever.
    CONSTRAINT chk_policy_has_a_limit
        CHECK (expires_on IS NOT NULL OR expires_at_odometer IS NOT NULL),
    CONSTRAINT chk_policy_dates CHECK (expires_on IS NULL OR expires_on >= starts_on),
    CONSTRAINT chk_policy_void_reason
        CHECK (status <> 'voided' OR void_reason IS NOT NULL),
    -- One live warranty per job. A second would leave two different answers to
    -- "is this covered", and nobody could say which one the customer was given.
    CONSTRAINT uq_policy_job UNIQUE (job_card_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_tenant ON warranty.policies (tenant_id);
CREATE INDEX IF NOT EXISTS idx_policy_tenant_status
    ON warranty.policies (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_policy_tenant_created
    ON warranty.policies (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_vehicle
    ON warranty.policies (tenant_id, vehicle_id);

ALTER TABLE warranty.policies DROP CONSTRAINT IF EXISTS uq_policy_id_tenant;
ALTER TABLE warranty.policies ADD CONSTRAINT uq_policy_id_tenant UNIQUE (id, tenant_id);

-- ── claims ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warranty.claims (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    policy_id        uuid NOT NULL,
    claim_number     TEXT NOT NULL CHECK (length(btrim(claim_number)) > 0),

    -- The customer's own account of what went wrong again, in their words —
    -- the same rule the job card's complaint follows.
    reported_fault   TEXT NOT NULL CHECK (length(btrim(reported_fault)) > 0),
    reported_at      timestamptz NOT NULL DEFAULT now(),
    odometer_reading integer CHECK (odometer_reading IS NULL OR odometer_reading >= 0),

    -- ⚠️ A CACHE OF THE EVENT HISTORY, not a substitute for it. Moved only by
    -- the trigger below, from the latest row in `warranty.claim_events`.
    status           TEXT NOT NULL DEFAULT 'submitted'
                     CHECK (status IN ('submitted', 'assessing', 'approved',
                                       'rejected', 'withdrawn', 'completed')),

    -- The remedial job, once one is opened. Nullable: a claim may be rejected
    -- before any work is done.
    remedial_job_card_id uuid,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_claim_number UNIQUE (organization_id, claim_number),
    CONSTRAINT fk_claim_policy_scope
        FOREIGN KEY (policy_id, tenant_id) REFERENCES warranty.policies (id, tenant_id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_claim_tenant ON warranty.claims (tenant_id);
CREATE INDEX IF NOT EXISTS idx_claim_tenant_status
    ON warranty.claims (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_claim_tenant_created
    ON warranty.claims (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_policy ON warranty.claims (policy_id);

ALTER TABLE warranty.claims DROP CONSTRAINT IF EXISTS uq_claim_id_tenant;
ALTER TABLE warranty.claims ADD CONSTRAINT uq_claim_id_tenant UNIQUE (id, tenant_id);

-- ── claim events — THE RECORD OF EVERY DECISION ─────────────────────────────

CREATE TABLE IF NOT EXISTS warranty.claim_events (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    claim_id         uuid NOT NULL,
    event_kind       TEXT NOT NULL CHECK (event_kind IN (
        'submitted', 'assessing', 'approved', 'rejected', 'withdrawn', 'completed', 'note')),

    -- ⚠️ REQUIRED ON A REJECTION, enforced below. A rejection with no reason is
    -- the thing a customer asks about and nobody can answer.
    reason           TEXT,
    note             TEXT,

    decided_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    decided_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_event_claim_scope
        FOREIGN KEY (claim_id, tenant_id) REFERENCES warranty.claims (id, tenant_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_event_rejection_reason
        CHECK (event_kind <> 'rejected' OR (reason IS NOT NULL AND length(btrim(reason)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_claim_event_claim
    ON warranty.claim_events (claim_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_event_tenant
    ON warranty.claim_events (tenant_id);

-- ── the claim's status follows its events ───────────────────────────────────

CREATE OR REPLACE FUNCTION warranty.apply_claim_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- A note records something without deciding anything.
    IF NEW.event_kind = 'note' THEN RETURN NEW; END IF;

    UPDATE warranty.claims
       SET status = NEW.event_kind, updated_at = now()
     WHERE id = NEW.claim_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_event_applies ON warranty.claim_events;
CREATE TRIGGER trg_claim_event_applies
    AFTER INSERT ON warranty.claim_events
    FOR EACH ROW
    EXECUTE FUNCTION warranty.apply_claim_event();

-- ⚠️ EVENTS ARE APPEND-ONLY, ON UPDATE **AND** DELETE. "A rule enforced on
-- UPDATE and nowhere else" has been the defect twice in this repository. A
-- warranty decision that can be edited or removed is not a decision.
CREATE OR REPLACE FUNCTION warranty.reject_event_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'warranty.claim_events is append-only: a decision that can be rewritten is not a '
        'decision. Record a further event instead.'
        USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_event_immutable ON warranty.claim_events;
CREATE TRIGGER trg_claim_event_immutable
    BEFORE UPDATE OR DELETE ON warranty.claim_events
    FOR EACH ROW EXECUTE FUNCTION warranty.reject_event_rewrite();

-- ── row-level security ──────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'warranty.policies', 'warranty.claims', 'warranty.claim_events'
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
-- ⚠️ THE REVOKES ARE NOT REDUNDANT — 006's ALTER DEFAULT PRIVILEGES grants
-- UPDATE/DELETE on every new table in these schemas.
--
-- `claim_events` gets INSERT and SELECT only: the trigger is a second line of
-- defence, not the only one.

GRANT SELECT, INSERT, UPDATE ON warranty.policies     TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON warranty.claims       TO autoworkshop_app;
GRANT SELECT, INSERT         ON warranty.claim_events TO autoworkshop_app;

REVOKE DELETE ON warranty.policies FROM autoworkshop_app;
REVOKE DELETE ON warranty.claims   FROM autoworkshop_app;
REVOKE DELETE, UPDATE ON warranty.claim_events FROM autoworkshop_app;

COMMIT;
