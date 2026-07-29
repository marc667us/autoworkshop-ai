-- ============================================================================
-- Migration 007 — when a job card last changed stage
--
-- The Repair Staging Board (`02.txt` §29) is a board of columns, and the
-- question a manager actually asks looking at it is not "which column is this
-- in" — the position answers that — but "HOW LONG has it been sitting there".
-- A card stuck in `awaiting_parts` for three weeks looks identical to one that
-- arrived this morning.
--
-- `updated_at` cannot answer it: any edit touches that column, so correcting a
-- typo in a complaint would reset the age of the stage and hide the stall. This
-- is a different fact and gets its own column.
--
-- Backfilled from `opened_at` rather than `now()`: every existing card is still
-- at its opening stage, so that IS when it entered it. Using `now()` would
-- silently declare every card freshly moved and, on the first board render,
-- report a workshop with no stalled jobs — which is exactly the reassuring lie
-- this column exists to prevent.
-- ============================================================================

BEGIN;

ALTER TABLE repair.job_cards
    ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz;

UPDATE repair.job_cards
   SET stage_changed_at = opened_at
 WHERE stage_changed_at IS NULL;

ALTER TABLE repair.job_cards
    ALTER COLUMN stage_changed_at SET DEFAULT now();
ALTER TABLE repair.job_cards
    ALTER COLUMN stage_changed_at SET NOT NULL;

-- The board groups by stage and orders by how long each card has waited.
CREATE INDEX IF NOT EXISTS idx_job_cards_board
    ON repair.job_cards (organization_id, stage, stage_changed_at);

COMMIT;
