#!/usr/bin/env bash
#
# Seeds ONE repair awaiting quality control, so `verify-quality-control.mjs` has
# something to inspect.
#
# 🔴 WHY THIS EXISTS. The verify script CONSUMES its fixture: its last section
# passes an inspection, and a passed repair leaves the queue by design. So the
# second run of the day found an empty queue and reported two failures that were
# not defects — the harness measuring the residue of its own previous run, which
# is a shape this repository has paid for before.
#
# The alternative would have been to make the verify script not complete an
# inspection. That is worse: completing one is the only thing that proves the
# verdict reaches the database, and "read the value back" is the whole reason
# that section exists.
#
# Idempotent: it adds one new attempt each time it runs, so running it twice
# leaves two repairs queued rather than corrupting one.
#
#   bash scripts/seed-qc-fixture.sh
#
# DEV ONLY. Writes to the local Docker Postgres as the superuser.
set -euo pipefail

CONTAINER="${AW_PG_CONTAINER:-aw-postgres}"

docker exec -i "$CONTAINER" psql -U autoworkshop -d autoworkshop -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

-- Superuser context so the seed is not itself subject to the policies under test.
SELECT set_config('app.current_role', 'admin', true);

DO $$
DECLARE
  exec_id UUID;
  card    UUID;
  ten     UUID;
  org     UUID;
  did_work UUID;
  next_no INTEGER;
  new_sess UUID;
BEGIN
  -- A completed repair to hang the session on. Chosen from real data rather
  -- than invented, so the fixture cannot drift from what the app produces.
  SELECT e.id, e.job_card_id, e.tenant_id, e.organization_id,
         COALESCE(e.completed_by, e.started_by)
    INTO exec_id, card, ten, org, did_work
    FROM repair.repair_executions e
   WHERE COALESCE(e.completed_by, e.started_by) IS NOT NULL
   ORDER BY e.id
   LIMIT 1;

  IF exec_id IS NULL THEN
    RAISE EXCEPTION
      'no repair execution to seed against — run the earlier slices first (bash scripts/seed-dev-core.sh)';
  END IF;

  SELECT COALESCE(max(attempt_no), 0) + 1 INTO next_no
    FROM repair.repair_test_sessions WHERE execution_id = exec_id;

  -- SUBMITTED, because quality control follows testing — `trg_qc_after_testing`
  -- refuses an inspection against anything else.
  --
  -- ⚠️ `submitted_by` IS REQUIRED, not optional. `test_session_submitted_attributed`
  -- refuses a submitted session with nobody's name on it, which is correct: a
  -- submission is somebody handing the car on. Attributed to whoever did the
  -- repair, which is also what makes the fixture useful — that person is then
  -- the one the independence rule must refuse.
  INSERT INTO repair.repair_test_sessions
    (tenant_id, organization_id, job_card_id, execution_id, attempt_no, status,
     submitted_at, submitted_by)
  VALUES (ten, org, card, exec_id, next_no, 'submitted', now(), did_work)
  RETURNING id INTO new_sess;

  RAISE NOTICE 'seeded submitted test session % (attempt %) on job card %',
    new_sess, next_no, card;
END;
$$;

COMMIT;

-- Read back, because an INSERT inside a heredoc that never COMMITs is discarded
-- silently at EOF and reports success. This repository has shipped that once.
SELECT count(*) AS repairs_awaiting_quality_control
  FROM repair.repair_test_sessions s
 WHERE s.status = 'submitted'
   AND NOT EXISTS (
     SELECT 1 FROM repair.quality_inspections p
      WHERE p.test_session_id = s.id AND p.status = 'passed');
SQL
