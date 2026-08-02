-- Proof by effect for migration 032 (repair variations).
--
-- `07.txt` §3766 step 12 is the rule the slice exists for:
--   "The technician PAUSES CHARGEABLE ADDITIONAL WORK UNTIL APPROVAL IS
--    RECEIVED."
--
-- Checked from BOTH sides throughout: the unapproved path is refused AND the
-- approved path is accepted. A refusal nobody can get past is a broken feature,
-- not a working rule, and this repository has shipped that confusion before.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/032_repair_variations.sql
--
-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.

BEGIN;

SELECT set_config('app.current_role', 'admin', true);

CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;

DO $$
DECLARE
  ex UUID; card UUID; ten UUID; org UUID; who UUID; reviewer UUID;
BEGIN
  SELECT e.id, e.job_card_id, e.tenant_id, e.organization_id,
         COALESCE(e.completed_by, e.started_by)
    INTO ex, card, ten, org, who
    FROM repair.repair_executions e
   WHERE COALESCE(e.completed_by, e.started_by) IS NOT NULL
   ORDER BY e.id LIMIT 1;
  IF ex IS NULL THEN
    RAISE EXCEPTION 'SETUP FAILED: no repair execution to attach a variation to.';
  END IF;
  -- ⚠️ A SECOND, DISTINCT USER TO REVIEW. The first version of this script did
  -- the internal review as the SAME technician who raised the variation — the
  -- exact self-review §3792 forbids — and reported a pass, because 032 enforced
  -- the rule only in the service. Migration 033 moved it into the database and
  -- this script promptly failed, which is how the gap was found.
  SELECT u.id INTO reviewer FROM identity.users u WHERE u.id <> who ORDER BY u.id LIMIT 1;
  IF reviewer IS NULL THEN
    RAISE EXCEPTION 'SETUP FAILED: need a second user to review independently.';
  END IF;
  INSERT INTO _fx (k, v) VALUES ('ex', ex), ('card', card), ('ten', ten), ('org', org),
                                ('who', who), ('reviewer', reviewer);
  RAISE NOTICE 'setup OK: execution % on card %', ex, card;
END;
$$;

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  n INTEGER; vid UUID;
  ex   UUID := (SELECT v FROM _fx WHERE k='ex');
  card UUID := (SELECT v FROM _fx WHERE k='card');
  ten  UUID := (SELECT v FROM _fx WHERE k='ten');
  org  UUID := (SELECT v FROM _fx WHERE k='org');
  who  UUID := (SELECT v FROM _fx WHERE k='who');
  reviewer UUID := (SELECT v FROM _fx WHERE k='reviewer');
BEGIN
  PERFORM set_config('app.tenant_id', ten::text, true);
  PERFORM set_config('app.organization_ids', org::text, true);
  PERFORM set_config('app.current_role', 'technician', true);

  INSERT INTO repair.repair_variations
    (tenant_id, organization_id, job_card_id, execution_id, variation_no,
     original_complaint, original_approved_work, new_finding, additional_work,
     additional_cost, currency, created_by)
  VALUES (ten, org, card, ex, 9001,
          'Knocking from the front nearside over bumps.',
          'Replace nearside lower arm bush.',
          'Offside drop link is also badly worn and the anti-roll bar is loose.',
          'Replace offside drop link.',
          420.00, 'GHS', who)
  RETURNING id INTO vid;
  RAISE NOTICE 'check 1 OK: a chargeable variation can be raised';

  -- ── 2. 🔴 THE RULE. Work cannot be authorised before approval. ───────────
  BEGIN
    UPDATE repair.repair_variations
       SET work_authorized_at = now(), work_authorized_by = who
     WHERE id = vid;
    RAISE EXCEPTION 'check 2 FAILED: chargeable work was authorised on a DRAFT variation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 2 OK: work cannot be authorised while the variation is a draft';
  END;

  -- ── 3. THE LIFECYCLE CANNOT SKIP INTERNAL REVIEW ─────────────────────────
  -- §3792 orders it: reviewed internally, THEN sent to the customer.
  BEGIN
    UPDATE repair.repair_variations SET status = 'sent_to_customer' WHERE id = vid;
    RAISE EXCEPTION 'check 3 FAILED: a draft was sent to the customer without internal review';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 3 OK: cannot send to the customer without internal review';
  END;

  -- 4. Nor jump straight to approved.
  BEGIN
    UPDATE repair.repair_variations
       SET status='approved', decision='approved', decided_at=now(),
           decided_by_name='Mr Mensah', decision_channel='phone', recorded_by=who
     WHERE id = vid;
    RAISE EXCEPTION 'check 4 FAILED: a draft was approved directly';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 4 OK: a draft cannot be approved directly';
  END;

  -- ── 5. CONTROL. The proper sequence IS accepted. ─────────────────────────
  -- The review is performed by a SUPERVISOR who did not raise it. 033 enforces
  -- both halves in the database; doing it as the raiser here is what the first
  -- version got wrong.
  PERFORM set_config('app.current_role', 'workshop_supervisor', true);
  UPDATE repair.repair_variations
     SET status='internally_reviewed', internally_reviewed_by=reviewer, internally_reviewed_at=now()
   WHERE id = vid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'check 5 FAILED: internal review was refused'; END IF;
  UPDATE repair.repair_variations SET status='sent_to_customer', sent_at=now() WHERE id = vid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'check 5 FAILED: sending to the customer was refused'; END IF;
  RAISE NOTICE 'check 5 OK: draft -> internally_reviewed -> sent_to_customer is accepted';

  -- ── 6. CONSENT NEEDS A NAME AND A CHANNEL ────────────────────────────────
  -- A chargeable approval with nobody's name against it is not consent.
  BEGIN
    UPDATE repair.repair_variations
       SET status='approved', decision='approved', decided_at=now()
     WHERE id = vid;
    RAISE EXCEPTION 'check 6 FAILED: a chargeable variation was approved with no name or channel';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 6 OK: chargeable approval requires who approved it and how';
  END;

  -- ── 7. CONTROL. A properly attributed approval is accepted. ──────────────
  UPDATE repair.repair_variations
     SET status='approved', decision='approved', decided_at=now(),
         decided_by_name='Mr Mensah', decision_channel='phone',
         decision_note='Approved on the phone, agreed to collect Friday.', recorded_by=who
   WHERE id = vid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 7 FAILED: an attributed approval was refused — check 6 was vacuous';
  END IF;
  RAISE NOTICE 'check 7 OK: an approval naming the customer and channel IS accepted';

  -- ── 8. AND ONLY NOW MAY THE WORK BE AUTHORISED ───────────────────────────
  UPDATE repair.repair_variations
     SET work_authorized_at = now(), work_authorized_by = who
   WHERE id = vid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 8 FAILED: work could not be authorised even after approval';
  END IF;
  RAISE NOTICE 'check 8 OK: work IS authorised once the customer has approved';

  -- ── 9. AN APPROVED VARIATION'S SCOPE AND COST ARE FIXED ──────────────────
  -- What the customer approved is what the customer approved.
  BEGIN
    UPDATE repair.repair_variations SET additional_cost = 900.00 WHERE id = vid;
    RAISE EXCEPTION 'check 9 FAILED: the cost was raised AFTER the customer approved it';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 9 OK: an approved variation cost cannot be changed';
  END;

  BEGIN
    UPDATE repair.repair_variations SET additional_work = 'and the gearbox' WHERE id = vid;
    RAISE EXCEPTION 'check 10 FAILED: the scope was widened after approval';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 10 OK: an approved variation scope cannot be widened';
  END;

  -- ── 11. A REJECTION MUST SAY WHY ─────────────────────────────────────────
  DECLARE v2 UUID;
  BEGIN
    INSERT INTO repair.repair_variations
      (tenant_id, organization_id, job_card_id, execution_id, variation_no,
       original_complaint, original_approved_work, new_finding, additional_work,
       additional_cost, created_by)
    VALUES (ten, org, card, ex, 9002, 'c', 'w', 'f', 'a', 300.00, who)
    RETURNING id INTO v2;
    PERFORM set_config('app.current_role', 'workshop_supervisor', true);
    UPDATE repair.repair_variations
       SET status='internally_reviewed', internally_reviewed_by=reviewer, internally_reviewed_at=now()
     WHERE id=v2;
    UPDATE repair.repair_variations SET status='sent_to_customer' WHERE id=v2;
    BEGIN
      UPDATE repair.repair_variations
         SET status='rejected', decision='rejected', decided_at=now()
       WHERE id = v2;
      RAISE EXCEPTION 'check 11 FAILED: a rejection was recorded with no reason';
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'check 11 OK: a rejection must give a reason';
    END;
    -- CONTROL: with a reason it is accepted.
    UPDATE repair.repair_variations
       SET status='rejected', decision='rejected', decided_at=now(),
           decision_note='Customer will source the part elsewhere.'
     WHERE id = v2;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'check 12 FAILED: a reasoned rejection was refused — check 11 was vacuous';
    END IF;
    RAISE NOTICE 'check 12 OK: a reasoned rejection IS accepted';
  END;

  -- ── 13. A FREE-OF-CHARGE VARIATION NEEDS NO SIGNATURE ────────────────────
  -- Demanding one would push staff to record £0 variations as nothing at all,
  -- which loses the record entirely — worse than the paperwork it saves.
  DECLARE v3 UUID;
  BEGIN
    INSERT INTO repair.repair_variations
      (tenant_id, organization_id, job_card_id, execution_id, variation_no,
       original_complaint, original_approved_work, new_finding, additional_work,
       additional_cost, created_by)
    VALUES (ten, org, card, ex, 9003, 'c', 'w', 'loose clip', 're-seat it', 0, who)
    RETURNING id INTO v3;
    PERFORM set_config('app.current_role', 'workshop_supervisor', true);
    UPDATE repair.repair_variations
       SET status='internally_reviewed', internally_reviewed_by=reviewer, internally_reviewed_at=now()
     WHERE id=v3;
    UPDATE repair.repair_variations SET status='sent_to_customer' WHERE id=v3;
    UPDATE repair.repair_variations
       SET status='approved', decision='approved', decided_at=now()
     WHERE id = v3;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'check 13 FAILED: a free-of-charge variation demanded a signature';
    END IF;
    RAISE NOTICE 'check 13 OK: a no-charge variation is approved without a signature';
  END;

  -- ── 14. NO DELETE ────────────────────────────────────────────────────────
  -- A REJECTED variation records why a job stopped. 006's ALTER DEFAULT
  -- PRIVILEGES grants DELETE on new tables, so 032's REVOKE is load-bearing.
  BEGIN
    DELETE FROM repair.repair_variations WHERE id = vid;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'check 14 FAILED: a variation was DELETED (% rows)', n; END IF;
    RAISE NOTICE 'check 14 OK: delete affected no rows';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 14 OK: DELETE is not granted at all';
  END;

  -- ── 15. RLS ENABLED **AND FORCED** ───────────────────────────────────────
  SELECT count(*) INTO n FROM pg_class
   WHERE oid = 'repair.repair_variations'::regclass AND relrowsecurity AND relforcerowsecurity;
  IF n <> 1 THEN RAISE EXCEPTION 'check 15 FAILED: RLS is not both ENABLED and FORCED'; END IF;
  RAISE NOTICE 'check 15 OK: RLS is ENABLED and FORCED';

  RAISE NOTICE '--- 032 verify: all checks passed ---';
END;
$$;

ROLLBACK;
