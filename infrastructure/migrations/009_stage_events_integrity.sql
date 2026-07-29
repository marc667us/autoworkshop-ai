-- ============================================================================
-- Migration 009 — make the stage history structurally unable to lie
--
-- Both changes come from the Codex review of Phase 5 slice 2. A SEPARATE
-- migration rather than an edit to 008 because 008 is already applied and its
-- checksum is in `public.schema_migrations`; editing it would trip the drift
-- guard and block every later migration — the failure the 2026-07-28 session
-- spent hours on.
--
-- ── 1. THE COMPOSITE FOREIGN KEY (Codex HIGH, accepted, severity adjusted) ──
--
-- The resume rule reads the newest non-hold event for a card and treats its
-- `to_stage` as where the card may go back to. 008 gave the table
-- `tenant_id`, `organization_id` AND `job_card_id`, but the foreign key
-- referenced `repair.job_cards(id)` ALONE — so nothing in the schema required an
-- event's tenant and organization to be the ones the parent card belongs to.
--
-- Adjudication: NOT reachable today. `JobCardService` is the only writer and it
-- always inserts `ctx.tenantId`/`ctx.organizationId` alongside a card id it has
-- just verified belongs to that organisation. So this is defence in depth, not a
-- live hole — which is why it lands as a constraint rather than a hotfix.
--
-- It is still worth having, and precisely because of this repo's own rule: A
-- FOREIGN KEY CANNOT CARRY A TENANT PREDICATE. The answer to that is not to
-- shrug — it is to make the key composite so it carries one. With this in place
-- a row whose organisation disagrees with its card cannot be inserted at all,
-- by any future writer, including one that forgets.
--
-- ── 2. STAGE VALUES CONSTRAINED (Codex MEDIUM, accepted) ───────────────────
--
-- `from_stage`/`to_stage` were plain TEXT. `permittedTargetsFrom` looks the
-- resume stage up in `STAGE_TRANSITIONS` and spreads the result; a stage value
-- outside the list makes that `...undefined`, which throws — a 500 on the
-- staging board caused by one bad history row. The CHECK makes the row
-- impossible; a guard in `permittedTargetsFrom` makes the crash impossible.
-- Both, because the constraint protects new data and the guard protects against
-- anything already written.
--
-- The stage list is transcribed from 006's CHECK, and `job-card-stages.spec.ts`
-- asserts the TypeScript copy still matches 006 — so all three stay in step.
-- ============================================================================

BEGIN;

-- ── 1. composite foreign key ──────────────────────────────────────────────

-- A composite FK needs a unique index on exactly the referenced columns.
-- Redundant with the primary key on `id` by definition — `id` alone is already
-- unique, so adding `tenant_id, organization_id` cannot make it less so — but
-- PostgreSQL requires the matching constraint to exist before it will accept
-- the reference.
ALTER TABLE repair.job_cards
    DROP CONSTRAINT IF EXISTS uq_job_cards_id_tenant_org;
ALTER TABLE repair.job_cards
    ADD CONSTRAINT uq_job_cards_id_tenant_org UNIQUE (id, tenant_id, organization_id);

-- Any row already violating this would abort the migration, which is the
-- correct outcome: it would mean the invariant was already broken and a human
-- needs to look. Verified as 5 rows / 0 violations before this shipped.
ALTER TABLE repair.job_card_stage_events
    DROP CONSTRAINT IF EXISTS fk_stage_events_card_scope;
ALTER TABLE repair.job_card_stage_events
    ADD CONSTRAINT fk_stage_events_card_scope
    FOREIGN KEY (job_card_id, tenant_id, organization_id)
    REFERENCES repair.job_cards (id, tenant_id, organization_id)
    ON DELETE CASCADE;

-- ── 2. only real stages may be recorded ───────────────────────────────────

-- `from_stage` stays NULLABLE: the opening event legitimately has no origin.
ALTER TABLE repair.job_card_stage_events
    DROP CONSTRAINT IF EXISTS stage_events_from_stage_valid;
ALTER TABLE repair.job_card_stage_events
    ADD CONSTRAINT stage_events_from_stage_valid CHECK (
      from_stage IS NULL OR from_stage IN (
        'complaint_received', 'appointment_confirmed', 'vehicle_received',
        'initial_inspection', 'diagnosis_in_progress',
        'further_information_required', 'solution_preparation',
        'quotation_preparation', 'awaiting_customer_approval',
        'awaiting_deposit', 'awaiting_parts', 'authorized_to_start',
        'repair_in_progress', 'specialist_consultation', 'testing',
        'quality_control', 'ready_for_collection', 'completed',
        'warranty_follow_up', 'on_hold'));

ALTER TABLE repair.job_card_stage_events
    DROP CONSTRAINT IF EXISTS stage_events_to_stage_valid;
ALTER TABLE repair.job_card_stage_events
    ADD CONSTRAINT stage_events_to_stage_valid CHECK (
      to_stage IN (
        'complaint_received', 'appointment_confirmed', 'vehicle_received',
        'initial_inspection', 'diagnosis_in_progress',
        'further_information_required', 'solution_preparation',
        'quotation_preparation', 'awaiting_customer_approval',
        'awaiting_deposit', 'awaiting_parts', 'authorized_to_start',
        'repair_in_progress', 'specialist_consultation', 'testing',
        'quality_control', 'ready_for_collection', 'completed',
        'warranty_follow_up', 'on_hold'));

COMMIT;
