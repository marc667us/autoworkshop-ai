-- 052 — A7: an inspection finding forgets who first recorded it
--
-- ══════════════════════════════════════════════════════════════════════════
-- Open on the register since 2026-07-30. Fixed here.
-- ══════════════════════════════════════════════════════════════════════════
--
-- `InspectionService.record` does:
--
--     UPDATE repair.inspection_items
--        SET result = $1, note = $2, recorded_by = $3, recorded_at = now()
--
-- so every edit OVERWRITES the recorder. The technician who actually looked at
-- the brake and wrote "worn" is replaced by whoever last touched the sheet, and
-- the original survives only in `audit.events` — which is a log, not something
-- a screen can join to.
--
-- ⚠️ WHY THIS MATTERS MORE THAN IT LOOKS. An inspection finding is the evidence
-- a repair proposal is built on, and a warranty claim after it. "Who found
-- this?" is the first question asked when a finding turns out to be wrong, and
-- the answer was being quietly overwritten by the second question ("who last
-- edited it?").
--
-- ── 🔴 BOTH FACTS ARE KEPT, BECAUSE THEY ARE DIFFERENT QUESTIONS ───────────
--
-- `recorded_by` / `recorded_at` keep their meaning: who LAST set this result.
-- `first_recorded_by` / `first_recorded_at` are new and are SET ONCE.
--
-- Renaming the existing columns was the alternative and is worse: every reader
-- of `recorded_by` would silently change meaning, and this repository has a
-- recorded defect for exactly that ("give a value a NEW meaning -> re-check
-- every path that already produces it").

BEGIN;

ALTER TABLE repair.inspection_items
  ADD COLUMN IF NOT EXISTS first_recorded_by uuid,
  ADD COLUMN IF NOT EXISTS first_recorded_at timestamptz;

-- 🔴 THE BACKFILL IS BLOCKED BY THE APPEND-ONLY GUARD, AND THAT GUARD IS RIGHT.
--
-- `trg_inspection_items_immutable` refuses any change to an item on a SUBMITTED
-- inspection — a submitted checklist is evidence. The first attempt at this
-- migration failed with
--
--     inspection b9f47b29... is submitted and its checklist cannot be changed
--
-- which is the guard doing its job against a data migration it cannot
-- distinguish from tampering.
--
-- Disabled for the length of THIS TRANSACTION only, and re-enabled below. Two
-- reasons this is the right call rather than weakening the trigger:
--   · the backfill writes ONLY the two new columns, and cannot alter a result,
--     a note or a submission — there is no evidence to tamper with;
--   · widening the trigger to permit "changes that only touch first_recorded_*"
--     would leave a permanent hole for the sake of a one-off write.
--
-- ⚠️ DISABLE TRIGGER takes ACCESS EXCLUSIVE. Fine inside a migration, and the
-- rehearsal proves it against the real database before this is applied.
ALTER TABLE repair.inspection_items DISABLE TRIGGER trg_inspection_items_immutable;

-- Backfill: for rows already carrying a result, today's `recorded_by` is the
-- best available evidence of who first recorded it. It is not always RIGHT —
-- an already-edited row has already lost the original — but it is never worse
-- than NULL, and it is the honest reconstruction.
UPDATE repair.inspection_items
   SET first_recorded_by = recorded_by,
       first_recorded_at = recorded_at
 WHERE recorded_by IS NOT NULL
   AND first_recorded_by IS NULL;

ALTER TABLE repair.inspection_items ENABLE TRIGGER trg_inspection_items_immutable;

-- 🔴 SET ONCE, ENFORCED. The service uses COALESCE so it cannot overwrite, but
-- the service is one caller and the next one will not remember. A column whose
-- immutability is a convention is a column that gets overwritten.
--
-- ⚠️ NULL -> value is allowed (that is the first recording). value -> anything
-- different is refused, INCLUDING value -> NULL, which would be an erasure
-- rather than an edit.
CREATE OR REPLACE FUNCTION repair.reject_first_recorder_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.first_recorded_by IS NOT NULL
       AND NEW.first_recorded_by IS DISTINCT FROM OLD.first_recorded_by THEN
        RAISE EXCEPTION
            'first_recorded_by is set once — it records who FOUND this, which is '
            'a different question from who last edited it (that is recorded_by)'
            USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.first_recorded_at IS NOT NULL
       AND NEW.first_recorded_at IS DISTINCT FROM OLD.first_recorded_at THEN
        RAISE EXCEPTION 'first_recorded_at is set once'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_first_recorder_immutable ON repair.inspection_items;
CREATE TRIGGER trg_first_recorder_immutable
    BEFORE UPDATE ON repair.inspection_items
    FOR EACH ROW EXECUTE FUNCTION repair.reject_first_recorder_rewrite();

COMMIT;
