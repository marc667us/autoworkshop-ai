-- Proof by effect for migration 031 (quality-control hardening).
--
-- 030 shipped the §563 independence rule with 13 passing checks. Codex then
-- found FOUR ways round it, all the same shape: **the rule was enforced at the
-- door and nowhere else.** This file closes the verification gap as well as the
-- code one — including the three gaps Codex found in `verify/030` itself:
--
--   · the worker fixture only exercised `repair_executions`, never the
--     `execution_tasks` / `execution_time_entries` / `execution_parts_used`
--     branches of the independence predicate;
--   · `UPDATE job_card_id` was never tested, though the trigger names it;
--   · "NO DELETE, EVER" tested only a direct DELETE, never a cascade.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/031_quality_control_hardening.sql
--
-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.

BEGIN;

SELECT set_config('app.current_role', 'admin', true);

CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;

DO $$
DECLARE
  sess UUID; card UUID; ten UUID; org UUID;
  other_sess UUID; other_card UUID;
  worker UUID; outsider UUID; exec_id UUID;
BEGIN
  SELECT s.id, s.job_card_id, s.tenant_id, s.organization_id, s.execution_id
    INTO sess, card, ten, org, exec_id
    FROM repair.repair_test_sessions s WHERE s.status = 'submitted' ORDER BY s.id LIMIT 1;
  IF sess IS NULL THEN
    RAISE EXCEPTION 'SETUP FAILED: no submitted test session exists.';
  END IF;

  SELECT COALESCE(e.completed_by, e.started_by) INTO worker
    FROM repair.repair_executions e
   WHERE e.job_card_id = card AND COALESCE(e.completed_by, e.started_by) IS NOT NULL LIMIT 1;
  SELECT u.id INTO outsider FROM identity.users u
   WHERE NOT repair.user_worked_on_job_card(card, u.id) ORDER BY u.id LIMIT 1;
  IF worker IS NULL OR outsider IS NULL THEN
    RAISE EXCEPTION 'SETUP FAILED: need both a worker and an independent user.';
  END IF;

  -- A SECOND submitted session on a DIFFERENT job card. Required by check 1:
  -- without two cards the mismatch attack cannot even be expressed, and the
  -- check would pass while testing nothing.
  SELECT s.id, s.job_card_id INTO other_sess, other_card
    FROM repair.repair_test_sessions s
   WHERE s.status = 'submitted' AND s.job_card_id <> card AND s.tenant_id = ten
   ORDER BY s.id LIMIT 1;

  IF other_card IS NULL THEN
    -- Seeded rather than skipped. A check that did not run is not a check that
    -- passed, and this is the highest-severity finding of the four.
    SELECT j.id INTO other_card FROM repair.job_cards j
     WHERE j.tenant_id = ten AND j.organization_id = org AND j.id <> card LIMIT 1;
    IF other_card IS NULL THEN
      RAISE EXCEPTION 'SETUP FAILED: only one job card in this organisation.';
    END IF;
  END IF;

  -- An in-progress session, seeded so check 4 tests the REAL attack (repointing
  -- at an unsubmitted session) rather than degrading to a no-op.
  DECLARE
    open_sess UUID;
    next_attempt INTEGER;
  BEGIN
    SELECT COALESCE(max(attempt_no), 0) + 1 INTO next_attempt
      FROM repair.repair_test_sessions WHERE execution_id = exec_id;
    INSERT INTO repair.repair_test_sessions
      (tenant_id, organization_id, job_card_id, execution_id, attempt_no, status)
    VALUES (ten, org, card, exec_id, next_attempt, 'in_progress')
    RETURNING id INTO open_sess;
    INSERT INTO _fx (k, v) VALUES ('open_sess', open_sess);
  END;

  INSERT INTO _fx (k, v) VALUES
    ('sess', sess), ('card', card), ('ten', ten), ('org', org),
    ('worker', worker), ('outsider', outsider), ('other_card', other_card), ('exec', exec_id);
  RAISE NOTICE 'setup OK: card % · other card % · worker % · independent %',
    card, other_card, worker, outsider;
END;
$$;

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  n INTEGER; qc UUID;
  sess UUID := (SELECT v FROM _fx WHERE k='sess');
  card UUID := (SELECT v FROM _fx WHERE k='card');
  ten  UUID := (SELECT v FROM _fx WHERE k='ten');
  org  UUID := (SELECT v FROM _fx WHERE k='org');
  worker   UUID := (SELECT v FROM _fx WHERE k='worker');
  outsider UUID := (SELECT v FROM _fx WHERE k='outsider');
  other_card UUID := (SELECT v FROM _fx WHERE k='other_card');
BEGIN
  PERFORM set_config('app.tenant_id', ten::text, true);
  PERFORM set_config('app.organization_ids', org::text, true);
  PERFORM set_config('app.current_role', 'quality_control_inspector', true);

  -- ── 1. 🔴 THE SESSION MUST BELONG TO THE CARD ────────────────────────────
  -- The attack: carry the real session but name a DIFFERENT job card, so the
  -- independence trigger checks the inspector against a car they never touched.
  BEGIN
    INSERT INTO repair.quality_inspections
      (tenant_id, organization_id, job_card_id, test_session_id, inspector_id)
    VALUES (ten, org, other_card, sess, worker);
    RAISE EXCEPTION 'check 1 FAILED: a session was paired with a different job card';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'check 1 OK: the session must belong to the job card being inspected';
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'check 1 OK: refused by the composite foreign key';
  END;

  -- ── 2. CONTROL. The matching pair is still accepted. ─────────────────────
  INSERT INTO repair.quality_inspections
    (tenant_id, organization_id, job_card_id, test_session_id, inspector_id)
  VALUES (ten, org, card, sess, outsider)
  RETURNING id INTO qc;
  IF qc IS NULL THEN
    RAISE EXCEPTION 'check 2 FAILED: a correct inspection was refused — check 1 was vacuous';
  END IF;
  RAISE NOTICE 'check 2 OK: a matching card and session are accepted';

  -- ── 3. THE JOB CARD CANNOT BE MOVED AFTERWARDS ───────────────────────────
  -- `verify/030` never tested this, though 030's trigger named the column.
  BEGIN
    UPDATE repair.quality_inspections SET job_card_id = other_card WHERE id = qc;
    RAISE EXCEPTION 'check 3 FAILED: job_card_id was moved to another card after opening';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'check 3 OK: job_card_id cannot be repointed';
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'check 3 OK: refused by the independence trigger';
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'check 3 OK: refused by the composite foreign key';
  END;

  -- ── 4. NOR THE TEST SESSION ──────────────────────────────────────────────
  -- 030 fired `trg_qc_after_testing` on INSERT only, so a valid row could be
  -- repointed at an unsubmitted session and nothing re-checked it.
  DECLARE
    open_sess UUID;
    exec_id UUID := (SELECT v FROM _fx WHERE k='exec');
  BEGIN
    open_sess := (SELECT v FROM _fx WHERE k='open_sess');
    IF open_sess IS NULL THEN
      RAISE EXCEPTION 'check 4 FAILED TO RUN: the in-progress session fixture is missing';
    ELSE
      BEGIN
        UPDATE repair.quality_inspections SET test_session_id = open_sess WHERE id = qc;
        RAISE EXCEPTION 'check 4 FAILED: repointed at a test session that is not submitted';
      EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'check 4 OK: cannot repoint at an unsubmitted session';
      END;
    END IF;
  END;

  -- ── 5. 🔴 THE PREDICATE IS NOT A PUBLIC ORACLE ───────────────────────────
  -- SECURITY DEFINER means it reads rows RLS would hide. EXECUTE must not be
  -- held by PUBLIC, or anyone can ask "did user X work on job Y" for any pair.
  SELECT count(*) INTO n
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'repair' AND p.proname = 'user_worked_on_job_card'
     AND has_function_privilege('public', p.oid, 'EXECUTE');
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 5 FAILED: PUBLIC can execute the independence predicate';
  END IF;
  RAISE NOTICE 'check 5 OK: PUBLIC cannot execute the independence predicate';

  -- 6. CONTROL. The application role still can, or the trigger's own helper
  --    would be unusable and check 5 would be passing on a broken function.
  IF NOT has_function_privilege('autoworkshop_app',
        'repair.user_worked_on_job_card(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'check 6 FAILED: the app role lost EXECUTE — the revoke was too wide';
  END IF;
  RAISE NOTICE 'check 6 OK: the application role retains EXECUTE';

  -- ── 7. 🔴 A DECIDED INSPECTION SURVIVES ITS PARENTS ──────────────────────
  -- DELETE is revoked on the table, but a CASCADE is not a DELETE by the app —
  -- so 030's `ON DELETE CASCADE` erased inspections whenever a job card went.
  PERFORM set_config('app.current_role', 'workshop_owner', true);
  BEGIN
    DELETE FROM repair.job_cards WHERE id = card;
    RAISE EXCEPTION 'check 7 FAILED: deleting the job card cascaded away its inspection';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'check 7 OK: the job card cannot be deleted while an inspection exists';
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'check 7 OK: DELETE on job_cards is not granted here';
  END;

  -- ── 8. THE FOREIGN KEYS REALLY ARE RESTRICT ──────────────────────────────
  -- Behaviour can pass for the wrong reason; the shape is asserted directly.
  --
  -- ⚠️ THE TWO PARENT KEYS BY NAME, NOT A COUNT. The first version of this check
  -- counted every RESTRICT foreign key on the table and expected 2 — it found 4,
  -- because `tenant_id -> identity.tenants` and `inspector_id -> identity.users`
  -- are RESTRICT as well. That was a wrong ASSERTION, not a wrong migration, and
  -- a count is the wrong instrument: it would also have passed if one of the two
  -- keys that matter had been CASCADE and some unrelated third key added.
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'repair.quality_inspections'::regclass
     AND contype = 'f' AND confdeltype = 'r'
     AND conname IN ('fk_qc_job_card_scope', 'fk_qc_session_scope');
  IF n <> 2 THEN
    RAISE EXCEPTION
      'check 8 FAILED: the job-card and test-session foreign keys are not both ON DELETE RESTRICT (% of 2)', n;
  END IF;
  RAISE NOTICE 'check 8 OK: both parent foreign keys are ON DELETE RESTRICT';

  -- ── 9. A PASS CARRIES NO DEFECT DESCRIPTION ──────────────────────────────
  PERFORM set_config('app.current_role', 'quality_control_inspector', true);
  BEGIN
    UPDATE repair.quality_inspections
       SET status='passed', complaint_addressed=true, new_defect_found=false,
           new_defect_description='left over from a failed attempt', decided_at=now()
     WHERE id = qc;
    RAISE EXCEPTION 'check 9 FAILED: a PASS kept a new-defect description';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 9 OK: a pass cannot carry a defect description';
  END;

  -- 10. CONTROL. A clean pass is still accepted.
  UPDATE repair.quality_inspections
     SET status='passed', complaint_addressed=true, new_defect_found=false, decided_at=now()
   WHERE id = qc;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 10 FAILED: a clean pass was refused — check 9 was vacuous';
  END IF;
  RAISE NOTICE 'check 10 OK: a clean pass is still accepted';

  -- ── 11-13. EVERY BRANCH OF THE INDEPENDENCE PREDICATE ────────────────────
  --
  -- 🔴 CODEX'S SHARPEST VERIFY FINDING. `verify/030` proved the predicate using
  -- a worker drawn from `repair_executions` alone — so three of its four UNION
  -- arms (`execution_tasks`, `execution_time_entries`, `execution_parts_used`)
  -- were never exercised at all. Any one of them could have been silently wrong:
  -- a mistyped column, a join to the wrong execution, and somebody who booked
  -- six hours to a repair would have been free to sign it off.
  --
  -- Each arm is proved by attributing work to a KNOWN-INDEPENDENT user and
  -- watching the predicate flip, then rolling that back so the next arm starts
  -- from false again. The flip is the evidence: a check that only asserted
  -- "true" could pass on a predicate that returns true for everyone.
  DECLARE
    exec_id UUID := (SELECT v FROM _fx WHERE k='exec');
    plan_task UUID;
  BEGIN
    IF repair.user_worked_on_job_card(card, outsider) THEN
      RAISE EXCEPTION 'checks 11-13 cannot run: the control user already counts as a worker';
    END IF;

    -- ⚠️ EACH ARM RUNS IN ITS OWN SUB-BLOCK, NOT A SAVEPOINT. PL/pgSQL has no
    -- `ROLLBACK TO SAVEPOINT` — an explicit savepoint is a syntax error here.
    -- A `BEGIN ... EXCEPTION` block IS a subtransaction, so raising a sentinel
    -- at the end of one undoes its inserts and leaves the outer transaction
    -- intact. That is what lets check 14 observe the predicate return to false.

    -- 11. execution_time_entries
    BEGIN
      INSERT INTO repair.execution_time_entries
        (tenant_id, organization_id, execution_id, entry_kind, technician_id)
      VALUES (ten, org, exec_id, 'productive', outsider);
      IF NOT repair.user_worked_on_job_card(card, outsider) THEN
        RAISE EXCEPTION 'check 11 FAILED: booking labour time does not count as having worked';
      END IF;
      RAISE NOTICE 'check 11 OK: the execution_time_entries branch matches';
      RAISE EXCEPTION 'UNDO_BRANCH';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'UNDO_BRANCH' THEN RAISE; END IF;
    END;

    -- 12. execution_parts_used
    BEGIN
      INSERT INTO repair.execution_parts_used
        (tenant_id, organization_id, execution_id, position, description, quantity, recorded_by)
      VALUES (ten, org, exec_id, 9911, 'verify-031 probe', 1, outsider);
      IF NOT repair.user_worked_on_job_card(card, outsider) THEN
        RAISE EXCEPTION 'check 12 FAILED: fitting parts does not count as having worked';
      END IF;
      RAISE NOTICE 'check 12 OK: the execution_parts_used branch matches';
      RAISE EXCEPTION 'UNDO_BRANCH';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'UNDO_BRANCH' THEN RAISE; END IF;
    END;

    -- 13. execution_tasks
    SELECT id INTO plan_task FROM repair.repair_plan_tasks WHERE tenant_id = ten LIMIT 1;
    IF plan_task IS NULL THEN
      RAISE EXCEPTION 'check 13 FAILED TO RUN: no repair plan task to attach an execution task to';
    END IF;
    BEGIN
      INSERT INTO repair.execution_tasks
        (tenant_id, organization_id, execution_id, repair_plan_task_id, position, completed_by)
      VALUES (ten, org, exec_id, plan_task, 9911, outsider);
      IF NOT repair.user_worked_on_job_card(card, outsider) THEN
        RAISE EXCEPTION 'check 13 FAILED: completing a task does not count as having worked';
      END IF;
      RAISE NOTICE 'check 13 OK: the execution_tasks branch matches';
      RAISE EXCEPTION 'UNDO_BRANCH';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'UNDO_BRANCH' THEN RAISE; END IF;
    END;

    -- 14. CONTROL. Every arm rolled back, so the user is independent again —
    --     which proves checks 11-13 measured the INSERTS and not some
    --     unrelated permanent condition.
    IF repair.user_worked_on_job_card(card, outsider) THEN
      RAISE EXCEPTION 'check 14 FAILED: the control user still counts as a worker after rollback';
    END IF;
    RAISE NOTICE 'check 14 OK: the predicate returns to false — 11-13 measured the inserts';
  END;

  RAISE NOTICE '--- 031 verify: all checks passed ---';
END;
$$;

ROLLBACK;
