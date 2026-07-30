-- ============================================================================
-- Proof by EFFECT for migration 013 — run as `autoworkshop_app`, the role the
-- application actually connects as.
--
-- Reading the grant out of `information_schema` would prove only that a GRANT
-- statement ran. What matters is whether a DELETE succeeds while the diagnosis is
-- open and is REFUSED once it is submitted, under RLS, as the app's own role. The
-- whole thing runs in a transaction and rolls back, so it writes nothing.
--
-- ⚠️ CONTROL TEST INCLUDED ON PURPOSE. A test that only checks the delete SUCCEEDS
-- would pass identically if the trigger had been dropped — which is the failure
-- 012's own comment warns about (a BEFORE DELETE trigger returning NEW SKIPS the
-- row silently and the caller sees success). So this asserts both directions, and
-- checks the ROW COUNT rather than the absence of an error.
--
--   docker exec -i aw-postgres psql -v ON_ERROR_STOP=1 -U autoworkshop \
--     -d autoworkshop -f - < infrastructure/migrations/verify/013_finding_removal.sql
-- ============================================================================

BEGIN;

-- ⚠️ THE LOOKUP HAPPENS BEFORE `SET ROLE`, AND IT HAS TO.
--
-- `repair.job_cards` is RLS-FORCEd, so a SELECT with no `app.tenant_id` set
-- returns nothing — and the first version of this script read that as "no job
-- card exists" and told the operator to re-seed a database that was already
-- seeded. The migration user is a superuser and bypasses RLS, so the ids are
-- discovered here and carried across the role change in a temp table. Setting the
-- tenant context first is impossible: the tenant id is what the lookup is for.
CREATE TEMP TABLE t_target ON COMMIT DROP AS
SELECT j.id AS card_id, j.tenant_id, j.organization_id
  FROM repair.job_cards j
 LIMIT 1;

GRANT SELECT ON t_target TO autoworkshop_app;

SET ROLE autoworkshop_app;

DO $$
DECLARE
    v_tenant  uuid;
    v_org     uuid;
    v_card    uuid;
    v_diag    uuid;
    v_find_a  uuid;
    v_find_b  uuid;
    v_deleted integer;
    v_refused boolean := false;
BEGIN
    -- Any real job card, so the composite tenant-carrying FKs are satisfied by
    -- data rather than by ids invented here.
    SELECT card_id, tenant_id, organization_id
      INTO v_card, v_tenant, v_org
      FROM t_target;
    IF v_card IS NULL THEN
        RAISE EXCEPTION 'no job card to test against — run scripts/seed-dev-core.sh first';
    END IF;

    -- The RLS context the application sets per request. Without it every statement
    -- below is invisible to its own policy and the test would "pass" by touching
    -- nothing.
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
    PERFORM set_config('app.current_role', 'technician', true);

    INSERT INTO repair.diagnoses (tenant_id, organization_id, job_card_id, attempt_no)
    VALUES (v_tenant, v_org, v_card, 9001)
    RETURNING id INTO v_diag;

    INSERT INTO repair.diagnostic_findings
        (tenant_id, organization_id, diagnosis_id, position,
         fault_description, affected_system)
    VALUES (v_tenant, v_org, v_diag, 1, 'entered in error', 'other')
    RETURNING id INTO v_find_a;

    INSERT INTO repair.diagnostic_findings
        (tenant_id, organization_id, diagnosis_id, position,
         fault_description, affected_system)
    VALUES (v_tenant, v_org, v_diag, 2, 'a real finding', 'electrical')
    RETURNING id INTO v_find_b;

    -- ── 1. while in_progress the delete must REMOVE A ROW ──────────────────
    DELETE FROM repair.diagnostic_findings WHERE id = v_find_a;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted <> 1 THEN
        RAISE EXCEPTION 'FAIL: open diagnosis — expected DELETE 1, got DELETE %', v_deleted;
    END IF;
    RAISE NOTICE 'PASS 1/3: a finding on an open diagnosis was removed (DELETE %)', v_deleted;

    -- ── 2. once submitted the delete must be REFUSED, loudly ───────────────
    UPDATE repair.diagnoses
       SET status = 'submitted', submitted_by = gen_random_uuid(), submitted_at = now()
     WHERE id = v_diag;

    BEGIN
        DELETE FROM repair.diagnostic_findings WHERE id = v_find_b;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        -- Reaching here at all is a failure, but WHICH failure matters: 0 rows means
        -- the trigger returned NEW and skipped the row silently, which is the bug
        -- 012 fixed and the reason this branch reports the count.
        RAISE EXCEPTION
            'FAIL: submitted diagnosis — DELETE was not refused (DELETE %)', v_deleted;
    EXCEPTION WHEN restrict_violation THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'FAIL: submitted diagnosis — no restrict_violation raised';
    END IF;
    RAISE NOTICE 'PASS 2/3: a finding on a submitted diagnosis cannot be removed';

    -- ── 3. the HEADER keeps its revoke ─────────────────────────────────────
    v_refused := false;
    BEGIN
        DELETE FROM repair.diagnoses WHERE id = v_diag;
        RAISE EXCEPTION 'FAIL: the diagnosis header was deletable';
    EXCEPTION WHEN insufficient_privilege THEN
        v_refused := true;
    END;
    IF NOT v_refused THEN
        RAISE EXCEPTION 'FAIL: no insufficient_privilege on the header delete';
    END IF;
    RAISE NOTICE 'PASS 3/3: the diagnosis header is still not deletable';

    RAISE NOTICE '=== 3/3 passed — rolling back, nothing written ===';
END;
$$;

ROLLBACK;
