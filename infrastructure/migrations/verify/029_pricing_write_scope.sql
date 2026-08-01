-- Proof by effect for migration 029 (pricing write scope).
--
-- 029 fixed TWO defects in one policy, and this script must prove BOTH, because
-- either fix alone still leaves the labour rate writable by the wrong person:
--
--   1. `repair.organization_pricing` had ONE `FOR ALL` policy testing only the
--      tenant, so EVERY role could rewrite it. Measured before the migration:
--      "CONFIRMED: a TECHNICIAN rewrote the labour rate (1 rows, now 1.00)".
--   2. The predicate was keyed on TENANT while the table is keyed on
--      ORGANIZATION, so one workshop could rewrite another workshop's prices
--      whenever both sat under the same tenant.
--
-- Every negative check is paired with a positive CONTROL. This repo has now
-- twice shipped a check that passed because it was measuring nothing — an
-- assertion that "the technician wrote 0 rows" proves the fix only when the
-- owner writing the SAME row proves 1.
--
--   docker exec -i aw-postgres psql -U autoworkshop -d autoworkshop \
--     -v ON_ERROR_STOP=1 -f - < infrastructure/migrations/verify/029_pricing_write_scope.sql
--
-- Seeds as superuser, asserts as `autoworkshop_app`, ROLLS BACK.

BEGIN;

SELECT set_config('app.current_role', 'admin', true);

CREATE TEMP TABLE _fx (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
GRANT SELECT ON _fx TO autoworkshop_app;

-- ⚠️ THE TWO ORGANIZATIONS MUST SHARE A TENANT or check 6 is vacuous: it would
-- pass through tenant isolation that migration 016 already provided, and prove
-- nothing about the organization scoping 029 added. Selected explicitly rather
-- than assumed, and asserted below.
INSERT INTO _fx (k, v)
SELECT 'org_1', a.id
  FROM identity.organizations a
  JOIN identity.organizations b
    ON b.tenant_id = a.tenant_id AND b.id <> a.id
 ORDER BY a.id
 LIMIT 1;

INSERT INTO _fx (k, v)
SELECT 'org_2', b.id
  FROM identity.organizations b
  JOIN identity.organizations a ON a.id = (SELECT v FROM _fx WHERE k = 'org_1')
 WHERE b.tenant_id = a.tenant_id AND b.id <> a.id
 ORDER BY b.id
 LIMIT 1;

DO $$
DECLARE
  t1 UUID;
  t2 UUID;
BEGIN
  IF (SELECT count(*) FROM _fx WHERE k IN ('org_1','org_2')) <> 2 THEN
    RAISE EXCEPTION
      'SETUP FAILED: need two organizations sharing one tenant. Seed with scripts/seed-dev-core.sh';
  END IF;
  SELECT tenant_id INTO t1 FROM identity.organizations WHERE id = (SELECT v FROM _fx WHERE k='org_1');
  SELECT tenant_id INTO t2 FROM identity.organizations WHERE id = (SELECT v FROM _fx WHERE k='org_2');
  IF t1 IS DISTINCT FROM t2 THEN
    RAISE EXCEPTION 'SETUP FAILED: the two organizations are in different tenants, check 6 would be vacuous';
  END IF;
  RAISE NOTICE 'setup OK: two organizations share tenant %', t1;
END;
$$;

-- A known starting rate for org_1, so every later assertion reads a value it can
-- attribute rather than whatever the seed happened to leave.
--
-- ⚠️ org_2 IS DELIBERATELY LEFT WITHOUT A PRICING ROW. The `owner_write` policy
-- is `FOR INSERT WITH CHECK`, and it can only be exercised by an INSERT that
-- actually reaches it. Seeding both rows made the INSERT a no-op that the
-- primary key refused before any policy was consulted — a check that passed
-- while measuring nothing. org_2's row is created BY the test, at check 5.
DELETE FROM repair.organization_pricing WHERE organization_id = (SELECT v FROM _fx WHERE k='org_2');

INSERT INTO repair.organization_pricing (organization_id, tenant_id, default_labour_rate)
SELECT f.v, o.tenant_id, 120.00
  FROM _fx f JOIN identity.organizations o ON o.id = f.v
 WHERE f.k = 'org_1'
ON CONFLICT (organization_id) DO UPDATE SET default_labour_rate = 120.00;

SET LOCAL ROLE autoworkshop_app;

DO $$
DECLARE
  n   INTEGER;
  rate NUMERIC;
  org1 UUID := (SELECT v FROM _fx WHERE k='org_1');
  org2 UUID := (SELECT v FROM _fx WHERE k='org_2');
  tid  UUID;
BEGIN
  SELECT tenant_id INTO tid FROM repair.organization_pricing WHERE organization_id = org1;

  PERFORM set_config('app.tenant_id', tid::text, true);
  PERFORM set_config('app.organization_ids', org1::text, true);

  -- ── 1. THE ORIGINAL DEFECT ────────────────────────────────────────────────
  -- Before 029 this UPDATE reported 1 row and the rate became 1.00.
  PERFORM set_config('app.current_role', 'technician', true);
  UPDATE repair.organization_pricing SET default_labour_rate = 1.00
   WHERE organization_id = org1;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 1 FAILED: a TECHNICIAN rewrote the labour rate (% rows)', n;
  END IF;
  RAISE NOTICE 'check 1 OK: a technician cannot rewrite the labour rate';

  -- 2. Nor may a MANAGER. `07.txt` pt2 §50 gives the manager "daily operational
  --    control" with no financial authority — a separate check because the
  --    manager is the role most likely to be quietly re-admitted later.
  PERFORM set_config('app.current_role', 'workshop_manager', true);
  UPDATE repair.organization_pricing SET default_labour_rate = 2.00
   WHERE organization_id = org1;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 2 FAILED: a MANAGER rewrote the labour rate (% rows)', n;
  END IF;
  RAISE NOTICE 'check 2 OK: a manager cannot rewrite the labour rate';

  -- ── 3. CONTROL ────────────────────────────────────────────────────────────
  -- The owner CAN. Without this, checks 1 and 2 would also pass against a table
  -- nobody can write at all, which would be a broken feature reported as a fix.
  PERFORM set_config('app.current_role', 'workshop_owner', true);
  UPDATE repair.organization_pricing SET default_labour_rate = 95.50
   WHERE organization_id = org1;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 3 FAILED: the OWNER could not write either (% rows) — checks 1-2 were vacuous', n;
  END IF;
  RAISE NOTICE 'check 3 OK: the owner CAN set the labour rate';

  -- ── 4. READS STAY TENANT-WIDE, DELIBERATELY ───────────────────────────────
  -- `quotation.service.ts` reads this table as whichever role is preparing the
  -- quotation. Narrowing the READ to the owner would break quotation
  -- preparation for reception, managers and technicians — a worse outcome than
  -- the defect being fixed. 029 split SELECT from write precisely to avoid it.
  PERFORM set_config('app.current_role', 'technician', true);
  SELECT default_labour_rate INTO rate FROM repair.organization_pricing
   WHERE organization_id = org1;
  IF rate IS NULL THEN
    RAISE EXCEPTION 'check 4 FAILED: a technician cannot READ the rate — quotation preparation is broken';
  END IF;
  IF rate <> 95.50 THEN
    RAISE EXCEPTION 'check 4 FAILED: the technician read % but the owner set 95.50', rate;
  END IF;
  RAISE NOTICE 'check 4 OK: a technician still READS the rate (%), so quotations still build', rate;

  -- ── 5. THE INSERT POLICY, GENUINELY EXERCISED ─────────────────────────────
  -- org_2 has NO pricing row, so this INSERT reaches `owner_write`'s WITH CHECK
  -- instead of being refused by the primary key first. The role is the OWNER and
  -- the tenant matches; only the ORGANIZATION predicate can refuse it.
  PERFORM set_config('app.current_role', 'workshop_owner', true);
  BEGIN
    INSERT INTO repair.organization_pricing (organization_id, tenant_id, default_labour_rate)
    VALUES (org2, tid, 5.00);
    RAISE EXCEPTION 'check 5 FAILED: workshop 1 owner CREATED pricing for workshop 2';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 5 OK: WITH CHECK refused creating pricing for another workshop';
  END;

  -- 6. CONTROL for 5. Same role, same statement, organization context switched:
  --    it must now succeed, or check 5 passed because INSERT is broken outright.
  PERFORM set_config('app.organization_ids', org2::text, true);
  INSERT INTO repair.organization_pricing (organization_id, tenant_id, default_labour_rate)
  VALUES (org2, tid, 120.00);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 6 FAILED: the owner could not create their OWN pricing either (% rows)', n;
  END IF;
  RAISE NOTICE 'check 6 OK: the owner CAN create pricing for their own workshop';

  -- 7. And a technician in org_1 reads the sibling workshop's rate — unchanged
  --    from 016. Stated as a check so a later narrowing of the read predicate is
  --    caught here rather than by a broken quotation.
  PERFORM set_config('app.organization_ids', org1::text, true);
  PERFORM set_config('app.current_role', 'technician', true);
  SELECT default_labour_rate INTO rate FROM repair.organization_pricing
   WHERE organization_id = org2;
  IF rate IS NULL THEN
    RAISE EXCEPTION 'check 7 FAILED: the tenant-wide READ was narrowed';
  END IF;
  RAISE NOTICE 'check 7 OK: reads remain tenant-wide';

  -- ── 8. THE WRONG-KEY DEFECT ───────────────────────────────────────────────
  -- 🔴 The heart of it. `app.organization_ids` is org_1 and the role is the
  -- OWNER — every condition the old TENANT-keyed policy tested is satisfied.
  -- Only the organization predicate 029 added can refuse this.
  PERFORM set_config('app.current_role', 'workshop_owner', true);
  UPDATE repair.organization_pricing SET default_labour_rate = 3.00
   WHERE organization_id = org2;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION
      'check 8 FAILED: workshop 1 owner rewrote workshop 2 prices in the same tenant (% rows)', n;
  END IF;
  SELECT default_labour_rate INTO rate FROM repair.organization_pricing WHERE organization_id = org2;
  IF rate <> 120.00 THEN
    RAISE EXCEPTION 'check 8 FAILED: workshop 2 rate changed to %', rate;
  END IF;
  RAISE NOTICE 'check 8 OK: an owner cannot reach a sibling workshop prices';

  -- 9. CONTROL for 8. Switch the organization context and the SAME role writes
  --    the SAME row. This is what proves check 8 measured the ORGANIZATION and
  --    not some unrelated failure of the whole statement.
  PERFORM set_config('app.organization_ids', org2::text, true);
  UPDATE repair.organization_pricing SET default_labour_rate = 77.25
   WHERE organization_id = org2;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 9 FAILED: owner of workshop 2 could not write it either (% rows)', n;
  END IF;
  RAISE NOTICE 'check 9 OK: the same role DOES write once the organization matches';

  -- ── 10. THE ROW-RELOCATION ATTACK ─────────────────────────────────────────
  -- `USING` and `WITH CHECK` are separate predicates, which is why 029 spells
  -- both out. An owner UPDATEs their OWN row's key to point at the sibling
  -- workshop: `USING` admits the row (it IS theirs), so only `WITH CHECK` can
  -- refuse the new value. A policy carrying `USING` alone would allow this.
  PERFORM set_config('app.organization_ids', org1::text, true);
  BEGIN
    UPDATE repair.organization_pricing SET organization_id = org2
     WHERE organization_id = org1;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
      RAISE EXCEPTION 'check 10 FAILED: an owner relocated their pricing row onto another workshop (% rows)', n;
    END IF;
    RAISE NOTICE 'check 10 OK: the relocation affected no rows';
  EXCEPTION
    WHEN unique_violation THEN
      -- ⚠️ The primary key refused it BEFORE the policy was consulted. That is a
      -- real refusal, but it is not evidence about WITH CHECK — named
      -- explicitly rather than counted as a pass for the policy.
      RAISE NOTICE 'check 10 INCONCLUSIVE: the primary key refused it before WITH CHECK was reached';
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'check 10 OK: WITH CHECK refused the relocation';
  END;

  -- ── 11. NO DELETE, BY DESIGN ──────────────────────────────────────────────
  -- 016 withheld the DELETE grant and 029 adds no DELETE policy. Pricing is
  -- SUPERSEDED by an edit, never removed: a missing row silently returns the
  -- column defaults, and the default labour rate is ZERO. A quotation already
  -- issued must stay explicable.
  PERFORM set_config('app.organization_ids', org1::text, true);
  BEGIN
    DELETE FROM repair.organization_pricing WHERE organization_id = org1;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN
      RAISE EXCEPTION 'check 11 FAILED: the owner DELETED a pricing row (% rows)', n;
    END IF;
    RAISE NOTICE 'check 11 OK: delete affected no rows';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check 11 OK: DELETE is not granted at all';
  END;

  -- ── 12. THE POLICY SHAPE ITSELF ───────────────────────────────────────────
  -- Behaviour can pass while the table is left in a state the next migration
  -- misreads. Assert there is no surviving `FOR ALL` policy — that was the
  -- original defect's shape, and re-adding one would silently re-widen writes
  -- without failing any check above.
  SELECT count(*) INTO n FROM pg_policy
   WHERE polrelid = 'repair.organization_pricing'::regclass AND polcmd = '*';
  IF n <> 0 THEN
    RAISE EXCEPTION 'check 12 FAILED: % FOR ALL policy survives on organization_pricing', n;
  END IF;
  RAISE NOTICE 'check 12 OK: no FOR ALL policy remains';

  -- 13. RLS must be ENABLED **and FORCED**. Solar shipped 33 tables ENABLEd and
  --     never FORCEd, which left every policy inert for the owning role. The
  --     application connects as `autoworkshop_app` (NOSUPERUSER) so this table
  --     is not owner-exempt today, but a future ALTER TABLE ... OWNER TO would
  --     make every check above silently vacuous.
  SELECT count(*) INTO n FROM pg_class
   WHERE oid = 'repair.organization_pricing'::regclass AND relrowsecurity AND relforcerowsecurity;
  IF n <> 1 THEN
    RAISE EXCEPTION 'check 13 FAILED: RLS is not both ENABLED and FORCED on organization_pricing';
  END IF;
  RAISE NOTICE 'check 13 OK: RLS is ENABLED and FORCED';

  RAISE NOTICE '--- 029 verify: all checks passed ---';
END;
$$;

ROLLBACK;
