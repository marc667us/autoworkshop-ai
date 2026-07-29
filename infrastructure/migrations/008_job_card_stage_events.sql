-- ============================================================================
-- Migration 008 — job card stage history (Phase 5, slice 2)
--
-- `1.txt` §394: "The repair staging board shall enforce transition rules. A
-- technician must not manually bypass required approval, payment, parts or
-- quality-control states WITHOUT AN AUTHORIZED, LOGGED OVERRIDE."
--
-- That sentence asks for three things, and this table is the third:
--   1. transition rules            → `job-card-stages.ts` (the adjacency map)
--   2. authorization for overrides → `CAN_OVERRIDE_STAGE`
--   3. a LOG of them               → here.
--
-- ── WHY NOT `audit.events` ─────────────────────────────────────────────────
--
-- The audit trail already records that a stage changed, and it stays. But it
-- cannot serve this purpose, for two reasons:
--
--   · It is a cross-cutting security log, read by whoever reviews access. The
--     stage history is DOMAIN data — the board reads it to answer "what was
--     this card doing before it went on hold", and a domain query that has to
--     mine the security log for business facts couples the two forever.
--   · `audit.events` is tenant-scoped but not job-scoped, so "the previous
--     stage of THIS card" would be a scan-and-filter over every event the
--     tenant ever produced.
--
-- `on_hold` is the concrete case. `02.txt` §29 makes it a board column, but a
-- card does not "progress" to on-hold and then onward — it PAUSES and must
-- return to what it was doing. Without a history, the only options are to let a
-- held card resume into any stage at all (which is the bypass §394 forbids) or
-- to store a `stage_before_hold` column that duplicates a fact this table
-- already holds. The history is the honest source.
--
-- ── APPEND-ONLY, AND WHY THAT NEEDS AN EXPLICIT REVOKE HERE ────────────────
--
-- CLAUDE.md: "Approvals, payments, warranty decisions and audit events are
-- append-only." An override record that can be edited afterwards is worth
-- nothing — the one row anybody would want to rewrite is the one recording that
-- they skipped quality control.
--
-- ⚠️ Migration 006 ran `ALTER DEFAULT PRIVILEGES IN SCHEMA repair GRANT SELECT,
-- INSERT, UPDATE, DELETE ON TABLES TO autoworkshop_app`. So a new table in this
-- schema arrives ALREADY UPDATE-able and DELETE-able, and granting only
-- SELECT+INSERT (the pattern migration 002 used for `audit.events`) would NOT
-- make it append-only — the default privilege has already been applied by the
-- time the GRANT runs. The REVOKE below is the line that actually does it, and
-- removing it would leave the table looking append-only while being fully
-- mutable. Verified after applying with `has_table_privilege`.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS repair.job_card_stage_events (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- CASCADE: the history of a job card that no longer exists is not a record
    -- anyone can act on. The job card itself is protected by RESTRICT on its
    -- customer and vehicle, so deleting one is already a deliberate act.
    job_card_id      uuid NOT NULL REFERENCES repair.job_cards(id) ON DELETE CASCADE,

    -- NULL on the opening event: a card that has just been created came from
    -- nowhere, and writing 'complaint_received' → 'complaint_received' would
    -- invent a transition that never happened.
    from_stage       TEXT,
    to_stage         TEXT NOT NULL,

    -- `1.txt` §394's "authorized, logged override" — the flag and the reason
    -- travel together, so a row can never claim an override without saying why.
    is_override      boolean NOT NULL DEFAULT false,
    override_reason  TEXT,
    CONSTRAINT override_has_reason CHECK (
        (is_override = false AND override_reason IS NULL)
        OR (is_override = true AND override_reason IS NOT NULL AND length(btrim(override_reason)) > 0)
    ),

    -- Free text from a human. TEXT, never VARCHAR(n) — the Solar truncation
    -- incident came from exactly this column shape.
    note             TEXT,

    changed_by       uuid,
    changed_at       timestamptz NOT NULL DEFAULT now()
);

-- The board's "what was this card doing before the hold" question, and the
-- job-card timeline, are both "this card, newest first".
CREATE INDEX IF NOT EXISTS idx_stage_events_card
    ON repair.job_card_stage_events (job_card_id, changed_at DESC);

-- CLAUDE.md §11 tenant baseline.
CREATE INDEX IF NOT EXISTS idx_stage_events_tenant
    ON repair.job_card_stage_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_stage_events_tenant_created
    ON repair.job_card_stage_events (tenant_id, changed_at DESC);

-- Overrides are the rows a supervisor reviews. A partial index keeps that
-- review cheap without carrying the 99% of ordinary transitions.
CREATE INDEX IF NOT EXISTS idx_stage_events_overrides
    ON repair.job_card_stage_events (organization_id, changed_at DESC)
    WHERE is_override;

-- ── row-level security ──────────────────────────────────────────────────────
-- FORCE as well as ENABLE: without it the table owner bypasses the policy and
-- isolation is present but inert — the lesson migration 002 paid for.
ALTER TABLE repair.job_card_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.job_card_stage_events FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.job_card_stage_events;
CREATE POLICY tenant_isolation ON repair.job_card_stage_events
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- ── grants — append-only ────────────────────────────────────────────────────
GRANT SELECT, INSERT ON repair.job_card_stage_events TO autoworkshop_app;
-- THE LINE THAT MAKES IT APPEND-ONLY. See the header: migration 006's default
-- privileges already granted UPDATE and DELETE on anything created here.
REVOKE UPDATE, DELETE ON repair.job_card_stage_events FROM autoworkshop_app;

-- ── backfill: the opening event for every existing card ─────────────────────
--
-- Without this, cards opened before this migration have no history at all, and
-- a held one could never be resumed — the resume target is read from here. Uses
-- `opened_at`, not `now()`, for the same reason migration 007 did: `now()` would
-- declare every existing card freshly moved and report a workshop with no
-- stalled jobs on the first board render.
INSERT INTO repair.job_card_stage_events
       (tenant_id, organization_id, job_card_id, from_stage, to_stage, changed_by, changed_at)
SELECT j.tenant_id, j.organization_id, j.id, NULL, j.stage, j.created_by, j.opened_at
  FROM repair.job_cards j
 WHERE NOT EXISTS (
       SELECT 1 FROM repair.job_card_stage_events e WHERE e.job_card_id = j.id
 );

COMMIT;
