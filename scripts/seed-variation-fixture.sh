#!/usr/bin/env bash
#
# Seeds ONE repair still IN PROGRESS, so `verify-variation-screen.mjs` has
# something to raise a variation against.
#
# 🔴 WHY THIS EXISTS. Every execution in the dev database is `completed`, and the
# API correctly refuses a variation against a finished repair — §3764 places
# step 11 BETWEEN "records unexpected findings" and "completes the authorized
# repair". So the verify run reported 9/9 while never raising a variation,
# never reading one back, and never exercising the review: the whole point of
# the slice was untested and the run looked clean.
#
# That is the same shape as the quality-control fixture
# (`seed-qc-fixture.sh`) and the same shape as three defects this repository has
# already paid for: a check that passes because it measured nothing.
#
# Idempotent: reuses the in-progress execution if one already exists.
#
#   bash scripts/seed-variation-fixture.sh
#
# DEV ONLY. Writes to the local Docker Postgres as the superuser.
set -euo pipefail

CONTAINER="${AW_PG_CONTAINER:-aw-postgres}"

docker exec -i "$CONTAINER" psql -U autoworkshop -d autoworkshop -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

SELECT set_config('app.current_role', 'admin', true);

DO $$
DECLARE
  existing UUID;
  src      RECORD;
  new_exec UUID;
  next_no  INTEGER;
BEGIN
  SELECT id INTO existing FROM repair.repair_executions WHERE status = 'in_progress' LIMIT 1;
  IF existing IS NOT NULL THEN
    RAISE NOTICE 'already have an in-progress execution: %', existing;
    RETURN;
  END IF;

  -- Copy the shape of a real one rather than inventing a row, so the fixture
  -- cannot drift from what the application actually produces.
  SELECT * INTO src FROM repair.repair_executions ORDER BY id LIMIT 1;
  IF src IS NULL THEN
    RAISE EXCEPTION 'no repair execution to copy — run the earlier slices first';
  END IF;

  SELECT COALESCE(max(attempt_no), 0) + 1 INTO next_no
    FROM repair.repair_executions WHERE job_card_id = src.job_card_id;

  INSERT INTO repair.repair_executions
    (tenant_id, organization_id, job_card_id, proposal_id, attempt_no, status,
     customer_approval_confirmed, parts_available_confirmed, tools_available_confirmed,
     bay_available_confirmed, safety_confirmed, started_by, started_at, created_by, updated_by)
  VALUES (src.tenant_id, src.organization_id, src.job_card_id, src.proposal_id, next_no,
          'in_progress', true, true, true, true, true,
          src.started_by, now(), src.created_by, src.created_by)
  RETURNING id INTO new_exec;

  RAISE NOTICE 'seeded IN-PROGRESS execution % (attempt %) on job card %',
    new_exec, next_no, src.job_card_id;
END;
$$;

COMMIT;

-- Read back. An INSERT inside a heredoc that never COMMITs is discarded silently
-- at EOF and reports success; this repository has shipped that once.
SELECT count(*) AS repairs_in_progress
  FROM repair.repair_executions WHERE status = 'in_progress';
SQL
