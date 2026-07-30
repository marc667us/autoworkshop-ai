-- ============================================================================
-- Migration 013 — a finding entered in error can be removed while the diagnosis
-- is still open (Phase 5, slice 3b)
--
-- 012 revoked DELETE on both diagnosis tables, reasoning that "a mistaken
-- diagnosis is superseded by a new attempt, never erased". That is right for a
-- SUBMITTED diagnosis and wrong for an open one, and the difference matters:
--
--   · A submitted diagnosis is a claim a supervisor reviews. Editing or deleting
--     any part of it afterwards would change what was approved. 012's trigger
--     already refuses that and continues to.
--   · An OPEN diagnosis has claimed nothing yet. A technician who adds a finding
--     against the wrong system, or adds the same one twice, had no way to undo it:
--     `update` can correct a typo but cannot remove a row, `excluded` means "a
--     fault I RULED OUT" and recording an entry error as one would put a false
--     statement in the record, and `start` refuses a second attempt while one is
--     open — so there was no path out at all.
--
-- ⚠️ THAT IS THE EXACT SHAPE SLICE 3A PAID FOR — a rule that refuses something,
-- names an alternative, and leaves the alternative unreachable. Recorded in
-- `NEXT_SESSION_START_HERE.md` as the trap of the session, then re-created one
-- slice later by the migration that was written the same day. Hence this file
-- rather than a comment explaining why technicians must live with it.
--
-- ── WHY THIS IS ONE GRANT AND NOTHING ELSE ─────────────────────────────────
--
-- The narrowing is ALREADY BUILT. `repair.reject_settled_finding_change()` fires
-- `BEFORE UPDATE OR DELETE`, raises when the parent diagnosis is anything other
-- than `in_progress`, and returns `OLD` on the delete path precisely so a real
-- refusal is loud rather than a silently skipped row. Every part of the rule
-- exists except permission to reach it — 012 wrote the trigger's DELETE branch
-- and then revoked the privilege that would ever exercise it.
--
-- So: grant DELETE on the CHILD table only. The header keeps its revoke — a
-- diagnosis that was started is a fact about the workshop's day, and an attempt
-- number that silently disappears is how attempt 3 comes to follow attempt 1.
-- ============================================================================

BEGIN;

GRANT DELETE ON repair.diagnostic_findings TO autoworkshop_app;

-- Restated, not merely inherited. A future migration that re-grants broadly
-- should still find the header's refusal spelled out here.
REVOKE DELETE ON repair.diagnoses FROM autoworkshop_app;

COMMIT;
