-- Proof by effect for migration 030 (independent quality control).
--
-- `2.txt` §563: "Following repair, an INDEPENDENT quality-control inspection
-- should verify that the ORIGINAL COMPLAINT HAS BEEN ADDRESSED and that NO NEW
-- DEFECT WAS INTRODUCED."
--
-- The independence rule is the whole slice, so it is checked from BOTH sides:
-- somebody who did the work is refused, and somebody who did not is ACCEPTED.
-- Every negative check here is paired with a positive control, because this
-- repository has twice shipped a check that passed by measuring nothing.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/030_quality_control.sql
--
-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.

BEGIN;

SELECT set_config('app.current_role', 'admin', true);

CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;

-- A job card that has a SUBMITTED test session, which is the only state QC may
-- follow. Selected from real data rather than invented, so the fixture cannot
-- drift from what the application actually produces.
INSERT INTO _fx (k, v)
SELECT 'session', s.id FROM repair.repair_test_sessions s
 WHERE s.status = 'submitted' ORDER BY s.id LIMIT 1;

DO $$
DECLARE
  sess UUID := (SELECT v FROM _fx WHERE k = 'session');
  card UUID;
  ten  UUID;
  org  UUID;
  worker UUID;
  outsider UUID;
BEGIN
  IF sess IS NULL THEN
    RAISE EXCEPTION
      'SETUP FAILED: no SUBMITTED test session exists. Run the testing slice first, or seed one.';
  END IF;

  SELECT s.job_card_id, s.tenant_id, s.organization_id INTO card, ten, org
    FROM repair.repair_test_sessions s WHERE s.id = sess;

  -- 🔴 SOMEBODY WHO ACTUALLY DID THE WORK. Read from the execution rather than
  -- assumed, because the independence predicate is exactly "is this person in
  -- one of those tables" — inventing a uuid would test nothing.
  SELECT COALESCE(e.completed_by, e.started_by) INTO worker
    FROM repair.repair_executions e
   WHERE e.job_card_id = card AND COALESCE(e.completed_by, e.started_by) IS NOT NULL
   LIMIT 1;

  IF worker IS NULL THEN
    RAISE EXCEPTION
      'SETUP FAILED: no execution on job card % records who did the work, so the '
      'independence check would be vacuous.', card;
  END IF;

  -- Somebody who did NOT. Required, or check 2 could not distinguish "refused
  -- because they worked on it" from "refused for any reason at all".
  SELECT u.id INTO outsider FROM identity.users u
   WHERE NOT repair.user_worked_on_job_card(card, u.id)
   ORDER BY u.id LIMIT 1;

  IF outsider IS NULL THEN
    RAISE EXCEPTION 'SETUP FAILED: every user worked on this card; no independent inspector exists.';
  END IF;

  INSERT INTO _fx (k, v) VALUES
    ('card', card), ('tenant', ten), ('org', org),
    ('worker', worker), ('outsider', outsider);

  -- ⚠️ AN IN-PROGRESS SESSION IS SEEDED RATHER THAN HOPED FOR. Check 12 (QC
  -- cannot precede submitted testing) previously SKIPPED when the database
  -- happened to hold no open session — and a check that did not run is not a
  -- check that passed. Created here so it always runs.
  DECLARE
    exec_id UUID;
    next_attempt INTEGER;
    open_sess UUID;
  BEGIN
    SELECT s.execution_id INTO exec_id FROM repair.repair_test_sessions s WHERE s.id = sess;
    SELECT COALESCE(max(attempt_no), 0) + 1 INTO next_attempt
      FROM repair.repair_test_sessions WHERE execution_id = exec_id;
    INSERT INTO repair.repair_test_sessions
      (tenant_id, organization_id, job_card_id, execution_id, attempt_no, status)
    VALUES (ten, org, card, exec_id, next_attempt, 'in_progress')
    RETURNING id INTO open_sess;
    INSERT INTO _fx (k, v) VALUES ('open_session', open_sess);
    RAISE NOTICE 'setup OK: seeded in-progress session % for check 12', open_sess;
  END;

  RAISE NOTICE 'setup OK: card % · worker % · independent %', card, worker, outsider;
END;
$$;

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  n    INTEGER;
  qc   UUID;
  sess UUID := (SELECT v FROM _fx WHERE k='session');
  card UUID := (SELECT v FROM _fx WHERE k='card');
  ten  UUID := (SELECT v FROM _fx WHERE k='tenant');
  org  UUID := (SELECT v FROM _fx WHERE k='org');
  worker   UUID := (SELECT v FROM _fx WHERE k='worker');
  outsider UUID := (SELECT v FROM _fx WHERE k='outsider');
BEGIN
  PERFORM set_config('app.tenant_id', ten::text, true);
  PERFORM set_config('app.organization_ids', org::text, true);
  PERFORM set_config('app.current_role', 'quality_control_inspector', true);

  -- ── 1. THE PREDICATE ITSELF ───────────────────────────────────────────────
  IF NOT repair.user_worked_on_job_card(card, worker) THEN
    RAISE EXCEPTION 'check 1 FAILED: the worker is not recognised as having worked on the card';
  END IF;
  RAISE NOTICE 'check 1 OK: the predicate identifies somebody who did the work';

  IF repair.user_worked_on_job_card(card, outsider) THEN
    RAISE EXCEPTION 'check 2 FAILED: an independent user is reported as having worked on the card';
  END IF;
  RAISE NOTICE 'check 2 OK: and does NOT flag somebody who did not';

  -- ── 3. 🔴 THE RULE. Somebody who did the work cannot inspect it. ──────────
  BEGIN
    INSERT INTO repair.quality_inspections
      (tenant_id, organization_id, job_card_id, test_session_id, inspector_id)
    VALUES (ten, org, card, sess, worker);
    RAISE EXCEPTION 'check 3 FAILED: the technician who did the work OPENED a QC inspection';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 3 OK: self-inspection refused by the trigger';
  END;

  -- ── 4. CONTROL. Somebody independent CAN. ────────────────────────────────
  -- Without this, check 3 would also pass against a table nobody can write at
  -- all — a broken feature reported as a working rule.
  INSERT INTO repair.quality_inspections
    (tenant_id, organization_id, job_card_id, test_session_id, inspector_id)
  VALUES (ten, org, card, sess, outsider)
  RETURNING id INTO qc;
  IF qc IS NULL THEN
    RAISE EXCEPTION 'check 4 FAILED: an INDEPENDENT inspector could not open one either';
  END IF;
  RAISE NOTICE 'check 4 OK: an independent inspector CAN open an inspection';

  -- ── 5. THE INSPECTOR CANNOT BE MOVED ONTO A WORKER AFTERWARDS ────────────
  -- The trigger fires on UPDATE too. Enforced at the door and nowhere else is
  -- the shape of rule this repository keeps finding.
  BEGIN
    UPDATE repair.quality_inspections SET inspector_id = worker WHERE id = qc;
    RAISE EXCEPTION 'check 5 FAILED: inspector_id was reassigned to somebody who did the work';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 5 OK: the inspector cannot be swapped to a worker after the fact';
  END;

  -- ── 6. A PASS REQUIRES BOTH §563 ANSWERS ─────────────────────────────────
  -- "Passed" while the complaint was NOT addressed is the contradiction the
  -- CHECK exists to make unreachable.
  BEGIN
    UPDATE repair.quality_inspections
       SET status='passed', complaint_addressed=false, new_defect_found=false, decided_at=now()
     WHERE id = qc;
    RAISE EXCEPTION 'check 6 FAILED: passed with the complaint NOT addressed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 6 OK: cannot pass while the complaint is unaddressed';
  END;

  BEGIN
    UPDATE repair.quality_inspections
       SET status='passed', complaint_addressed=true, new_defect_found=true,
           new_defect_description='x', decided_at=now()
     WHERE id = qc;
    RAISE EXCEPTION 'check 7 FAILED: passed with a NEW DEFECT recorded';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 7 OK: cannot pass with a new defect found';
  END;

  -- ── 8. A NEW DEFECT MUST BE DESCRIBED ────────────────────────────────────
  BEGIN
    UPDATE repair.quality_inspections
       SET status='failed', complaint_addressed=true, new_defect_found=true,
           new_defect_description=NULL, decided_at=now()
     WHERE id = qc;
    RAISE EXCEPTION 'check 8 FAILED: a new defect was recorded with no description';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 8 OK: a new defect must be described';
  END;

  -- ── 9. CONTROL. A legitimate PASS is accepted. ───────────────────────────
  UPDATE repair.quality_inspections
     SET status='passed', complaint_addressed=true, new_defect_found=false, decided_at=now()
   WHERE id = qc;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 9 FAILED: a valid pass was refused (% rows) — checks 6-8 were vacuous', n;
  END IF;
  RAISE NOTICE 'check 9 OK: a valid pass IS accepted';

  -- ── 10. A DECIDED INSPECTION IS THE RECORD ───────────────────────────────
  BEGIN
    UPDATE repair.quality_inspections SET notes = 'changed my mind' WHERE id = qc;
    RAISE EXCEPTION 'check 10 FAILED: a decided inspection was edited';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 10 OK: a decided inspection cannot be changed';
  END;

  -- ── 11. NO DELETE, EVER ──────────────────────────────────────────────────
  -- A FAILED inspection is the reason a car went back. 006's ALTER DEFAULT
  -- PRIVILEGES grants DELETE on new tables in this schema, so the REVOKE in 030
  -- is load-bearing rather than decorative — 008 learned that the hard way.
  BEGIN
    DELETE FROM repair.quality_inspections WHERE id = qc;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
      RAISE EXCEPTION 'check 11 FAILED: an inspection was DELETED (% rows)', n;
    END IF;
    RAISE NOTICE 'check 11 OK: delete affected no rows';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 11 OK: DELETE is not granted at all';
  END;

  -- ── 12. QC FOLLOWS TESTING ───────────────────────────────────────────────
  DECLARE
    open_sess UUID;
  BEGIN
    open_sess := (SELECT v FROM _fx WHERE k = 'open_session');
    IF open_sess IS NULL THEN
      -- Should be unreachable: the setup block seeds one. Kept as a loud
      -- failure rather than a skip, because a check that did not run is not a
      -- check that passed.
      RAISE EXCEPTION 'check 12 FAILED TO RUN: the in-progress session fixture is missing';
    ELSE
      BEGIN
        INSERT INTO repair.quality_inspections
          (tenant_id, organization_id, job_card_id, test_session_id, inspector_id)
        SELECT ten, org, s.job_card_id, open_sess, outsider
          FROM repair.repair_test_sessions s WHERE s.id = open_sess;
        RAISE EXCEPTION 'check 12 FAILED: QC opened against a test session still in progress';
      EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'check 12 OK: QC cannot precede a submitted test session';
      END;
    END IF;
  END;

  -- ── 13. RLS IS ENABLED **AND FORCED** ────────────────────────────────────
  SELECT count(*) INTO n FROM pg_class
   WHERE oid = 'repair.quality_inspections'::regclass
     AND relrowsecurity AND relforcerowsecurity;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 13 FAILED: RLS is not both ENABLED and FORCED';
  END IF;
  RAISE NOTICE 'check 13 OK: RLS is ENABLED and FORCED';

  RAISE NOTICE '--- 030 verify: all checks passed ---';
END;
$$;

ROLLBACK;
