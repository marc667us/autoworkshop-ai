-- ============================================================================
-- Migration 011 — a submitted inspection must say WHO submitted it
--
-- From the Codex review of Phase 5 slice 3a (P2, accepted).
--
-- A SEPARATE migration rather than an edit to 010, because 010 is already
-- applied and its checksum is in `public.schema_migrations`. Editing it would
-- trip the drift guard and block every later migration — the same rule migration
-- 009 was created under, and the failure a previous session spent hours on.
--
-- ── THE GAP ────────────────────────────────────────────────────────────────
--
-- 010's `submitted_has_when` requires `submitted_at` for a submitted row but NOT
-- `submitted_by`:
--
--     (status = 'submitted' AND submitted_at IS NOT NULL)
--
-- `InspectionService.submit` always writes both, so this is not reachable through
-- the API today. It still matters, for the reason the table's own header gives:
-- who submitted an inspection is PART OF THE RECORD, not metadata about it. An
-- inspection is the document a charge is later justified by, and one that says a
-- vehicle was inspected without saying by whom is exactly the row somebody would
-- want to exist. The app role holds UPDATE on this table, so the only thing
-- standing between that row and the database is application code — and this
-- repo's rule is that app code is the first line of defence and the constraint is
-- the last. Both, or neither counts.
--
-- Deliberately NOT extended to `started_by`: an inspection can legitimately
-- outlive the user record that opened it (the read path LEFT JOINs
-- `identity.users` for exactly that reason), and a NOT NULL there would turn a
-- withdrawn staff member into a constraint violation on unrelated writes.
-- `submitted_by` is safe because it is written once, at submission, and never
-- rewritten.
-- ============================================================================

BEGIN;

-- Any pre-existing row that violates this would abort the migration, which is
-- the correct outcome: it would mean an unattributed inspection already exists
-- and a human needs to look at it. Verified before shipping — the one submitted
-- row on the local database carries both columns.
DO $$
DECLARE
    offenders integer;
BEGIN
    SELECT count(*) INTO offenders
      FROM repair.inspections
     WHERE status = 'submitted' AND submitted_by IS NULL;

    IF offenders > 0 THEN
        RAISE EXCEPTION
            '% submitted inspection(s) have no submitted_by. Attribute or withdraw them before applying.',
            offenders;
    END IF;
END
$$;

ALTER TABLE repair.inspections
    DROP CONSTRAINT IF EXISTS submitted_has_when;

ALTER TABLE repair.inspections
    ADD CONSTRAINT submitted_has_when CHECK (
        (status = 'in_progress' AND submitted_at IS NULL AND submitted_by IS NULL)
        -- BOTH, now: the timestamp and the person.
        OR (status = 'submitted' AND submitted_at IS NOT NULL AND submitted_by IS NOT NULL)
    );

COMMIT;
