-- Proof by effect for migration 033 (variation hardening).
--
-- 032 shipped the variation flow with 15 passing checks. Codex found FOUR ways
-- round it, and the first is the SAME defect 030 shipped and 031 fixed — the
-- rule enforced on UPDATE and nowhere else. Twice in one day.
--
-- ⚠️ AND `verify/032` DEMONSTRATED THE BYPASS WITHOUT NOTICING. It performs the
-- internal review as the `technician` who raised the variation, which is exactly
-- what §3792 forbids — so it exercised the hole and reported a pass. A check
-- that walks through the gap it is meant to guard is worse than no check, and it
-- is why every assertion below names the role and the identity it acts as.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/033_variation_hardening.sql
--
-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.

BEGIN;

SELECT set_config('app.current_role', 'admin', true);

CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;

DO $$
DECLARE
  ex UUID; card UUID; ten UUID; org UUID; raiser UUID; reviewer UUID;
BEGIN
  SELECT e.id, e.job_card_id, e.tenant_id, e.organization_id,
         COALESCE(e.completed_by, e.started_by)
    INTO ex, card, ten, org, raiser
    FROM repair.repair_executions e
   WHERE COALESCE(e.completed_by, e.started_by) IS NOT NULL
   ORDER BY e.id LIMIT 1;
  IF ex IS NULL THEN RAISE EXCEPTION 'SETUP FAILED: no repair execution.'; END IF;

  -- A DIFFERENT person to review. Without two distinct users the independence
  -- check cannot be expressed and would pass while testing nothing.
  SELECT u.id INTO reviewer FROM identity.users u WHERE u.id <> raiser ORDER BY u.id LIMIT 1;
  IF reviewer IS NULL THEN RAISE EXCEPTION 'SETUP FAILED: need a second user.'; END IF;

  INSERT INTO _fx (k, v) VALUES
    ('ex', ex), ('card', card), ('ten', ten), ('org', org),
    ('raiser', raiser), ('reviewer', reviewer);
  RAISE NOTICE 'setup OK: raiser % · reviewer %', raiser, reviewer;
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
  raiser   UUID := (SELECT v FROM _fx WHERE k='raiser');
  reviewer UUID := (SELECT v FROM _fx WHERE k='reviewer');
BEGIN
  PERFORM set_config('app.tenant_id', ten::text, true);
  PERFORM set_config('app.organization_ids', org::text, true);
  PERFORM set_config('app.current_role', 'technician', true);

  -- ── 1. 🔴 THE CRITICAL HOLE: a pre-approved INSERT ───────────────────────
  -- 032 fired only on UPDATE, so this created a variation already approved and
  -- already authorised, having never been reviewed or sent to anybody.
  BEGIN
    INSERT INTO repair.repair_variations
      (tenant_id, organization_id, job_card_id, execution_id, variation_no,
       original_complaint, original_approved_work, new_finding, additional_work,
       additional_cost, created_by, status, decision, decided_at,
       decided_by_name, decision_channel, recorded_by, work_authorized_at, work_authorized_by)
    VALUES (ten, org, card, ex, 9101, 'c', 'w', 'f', 'a', 5000.00, raiser,
            'approved', 'approved', now(), 'Nobody', 'phone', raiser, now(), raiser);
    RAISE EXCEPTION 'check 1 FAILED: a variation was CREATED already approved and authorised';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 1 OK: a variation cannot be created already approved';
  END;

  -- 2. Nor created already carrying an authorisation on a draft.
  BEGIN
    INSERT INTO repair.repair_variations
      (tenant_id, organization_id, job_card_id, execution_id, variation_no,
       original_complaint, original_approved_work, new_finding, additional_work,
       additional_cost, created_by, work_authorized_at, work_authorized_by)
    VALUES (ten, org, card, ex, 9102, 'c', 'w', 'f', 'a', 5000.00, raiser, now(), raiser);
    RAISE EXCEPTION 'check 2 FAILED: a draft was created already authorised';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 2 OK: a new variation cannot arrive already authorised';
  END;

  -- ── 3. CONTROL. An honest draft IS accepted. ─────────────────────────────
  INSERT INTO repair.repair_variations
    (tenant_id, organization_id, job_card_id, execution_id, variation_no,
     original_complaint, original_approved_work, new_finding, additional_work,
     additional_cost, currency, created_by)
  VALUES (ten, org, card, ex, 9103, 'Knocking over bumps.', 'Replace bush.',
          'Drop link worn.', 'Replace drop link.', 420.00, 'GHS', raiser)
  RETURNING id INTO vid;
  RAISE NOTICE 'check 3 OK: an honest draft is still accepted';

  -- ── 4. 🔴 A TECHNICIAN CANNOT REVIEW — enforced in the DATABASE now ──────
  -- `verify/032` did exactly this and called it a pass.
  BEGIN
    UPDATE repair.repair_variations
       SET status='internally_reviewed', internally_reviewed_by=reviewer, internally_reviewed_at=now()
     WHERE id = vid;
    RAISE EXCEPTION 'check 4 FAILED: a TECHNICIAN performed the internal review';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 4 OK: a technician cannot review a variation';
  END;

  -- ── 5. 🔴 THE RAISER CANNOT REVIEW THEIR OWN, whatever their role ────────
  PERFORM set_config('app.current_role', 'workshop_supervisor', true);
  BEGIN
    UPDATE repair.repair_variations
       SET status='internally_reviewed', internally_reviewed_by=raiser, internally_reviewed_at=now()
     WHERE id = vid;
    RAISE EXCEPTION 'check 5 FAILED: the raiser reviewed their own variation';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 5 OK: the raiser cannot review their own variation';
  END;

  -- 6. Nor may a review be recorded with nobody's name on it.
  BEGIN
    UPDATE repair.repair_variations
       SET status='internally_reviewed', internally_reviewed_at=now()
     WHERE id = vid;
    RAISE EXCEPTION 'check 6 FAILED: an internal review was recorded anonymously';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 6 OK: an internal review must record who carried it out';
  END;

  -- ── 7. CONTROL. A supervisor who did NOT raise it CAN review. ────────────
  -- Without this, checks 4-6 would also pass against a review nobody can do.
  UPDATE repair.repair_variations
     SET status='internally_reviewed', internally_reviewed_by=reviewer, internally_reviewed_at=now()
   WHERE id = vid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 7 FAILED: an INDEPENDENT supervisor could not review either';
  END IF;
  RAISE NOTICE 'check 7 OK: an independent supervisor CAN review';

  UPDATE repair.repair_variations SET status='sent_to_customer', sent_at=now() WHERE id = vid;

  -- ── 8. 🔴 CONTENT FREEZES WHEN SENT, not when decided ────────────────────
  -- 032 froze only from `approved`, so the cost could be raised between sending
  -- and approval: the customer approves one number, the row holds another.
  BEGIN
    UPDATE repair.repair_variations SET additional_cost = 9000.00 WHERE id = vid;
    RAISE EXCEPTION 'check 8 FAILED: the cost was raised AFTER the customer was asked';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 8 OK: cost cannot change once the variation has been sent';
  END;

  -- ── 9. THE APPROVAL HISTORY EXISTS AND IS APPEND-ONLY ────────────────────
  INSERT INTO repair.variation_decisions
    (tenant_id, organization_id, variation_id, decision, quoted_cost, quoted_currency,
     quoted_work, decided_by_name, decision_channel, recorded_by)
  VALUES (ten, org, vid, 'modified', 420.00, 'GHS', 'Replace drop link.',
          'Mr Mensah', 'phone', reviewer);
  RAISE NOTICE 'check 9 OK: a decision can be recorded in the approval history';

  BEGIN
    UPDATE repair.variation_decisions SET decision='approved' WHERE variation_id = vid;
    RAISE EXCEPTION 'check 10 FAILED: a recorded decision was REWRITTEN';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 10 OK: the approval history cannot be updated';
  END;

  BEGIN
    DELETE FROM repair.variation_decisions WHERE variation_id = vid;
    RAISE EXCEPTION 'check 11 FAILED: a recorded decision was DELETED';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 11 OK: the approval history cannot be deleted';
  END;

  -- ── 12. THE EVIDENCE OF CONSENT CANNOT BE REWRITTEN ──────────────────────
  UPDATE repair.repair_variations
     SET status='approved', decision='approved', decided_at=now(),
         decided_by_name='Mr Mensah', decision_channel='phone', recorded_by=reviewer,
         work_authorized_at=now(), work_authorized_by=reviewer
   WHERE id = vid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'check 12 FAILED: a proper approval was refused'; END IF;

  BEGIN
    UPDATE repair.repair_variations SET decided_by_name = 'Somebody Else' WHERE id = vid;
    RAISE EXCEPTION 'check 12 FAILED: the name of who approved it was rewritten';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 12 OK: who approved it and how cannot be rewritten';
  END;

  BEGIN
    UPDATE repair.repair_variations SET work_authorized_at = NULL WHERE id = vid;
    RAISE EXCEPTION 'check 13 FAILED: the authorisation was silently withdrawn';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check 13 OK: the authorisation record cannot be rewritten';
  END;

  -- ── 14. RLS on the new history table ─────────────────────────────────────
  SELECT count(*) INTO n FROM pg_class
   WHERE oid = 'repair.variation_decisions'::regclass AND relrowsecurity AND relforcerowsecurity;
  IF n <> 1 THEN RAISE EXCEPTION 'check 14 FAILED: history RLS not ENABLED and FORCED'; END IF;
  RAISE NOTICE 'check 14 OK: the approval history has RLS ENABLED and FORCED';

  RAISE NOTICE '--- 033 verify: all checks passed ---';
END;
$$;

ROLLBACK;
