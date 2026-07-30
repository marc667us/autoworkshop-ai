-- ============================================================================
-- Migration 020 — post-repair testing (Phase 5, slice 8)
--
-- `1.txt` §388 puts "Testing results" in Domain 5. `07.txt` §34-§36 is REPAIR TEST
-- RESULTS, the POST-REPAIR DIAGNOSTIC SCAN and the ROAD TEST FLOW.
--
-- Transcribed, not paraphrased:
--   §34 — eighteen test categories, and FOURTEEN fields per test: test name ·
--     test procedure · test equipment · equipment identifier · CALIBRATION
--     STATUS · expected result · actual result · unit of measurement · pass or
--     fail · technician · date and time · supporting evidence · comments
--   §35 — the post-repair scan records: pre-repair fault codes · codes cleared ·
--     codes remaining · NEW codes · live-data checks · system readiness ·
--     warning-light status
--   §35 — "THE REPAIR SHALL NOT BE MARKED TECHNICALLY COMPLETE WHERE AN
--     UNRESOLVED CRITICAL FAULT REMAINS WITHOUT DOCUMENTED APPROVAL."
--   §36 — the road test records: driver · start mileage · test route or type ·
--     weather · road condition · initial symptom; then symptom resolved /
--     improved / remains / new symptom observed; then end mileage
--
-- ── §35's SENTENCE IS THE STRUCTURAL RULE OF THIS SLICE ────────────────────
--
-- "Without documented approval" is the operative phrase. It does not say a
-- remaining critical fault forbids completion — it says completing WITHOUT A
-- DOCUMENT does. So this migration models the document rather than the
-- prohibition:
--
--   · `critical_faults_remain` is what the technician found.
--   · `override_approved_by` / `override_reason` are the documented approval.
--   · A CHECK constraint makes a submitted session with remaining critical
--     faults and no named approver IMPOSSIBLE.
--
-- Modelling it as a plain refusal would have been easier and wrong: a car whose
-- ABS light is still on can legitimately be released to a customer who has been
-- told and has agreed, and a system that forbids it teaches the workshop to
-- record the fault as resolved. The rule that survives contact with a workshop is
-- the one that lets the exception happen and makes it leave a trace.
--
-- ── WHY THE SCAN AND THE ROAD TEST ARE COLUMNS, NOT TABLES ─────────────────
--
-- Both are ZERO-OR-ONE per test session: §35's scan is the scan, and §36 says
-- "where a road test is required". Two tables in a one-to-one relationship buy
-- nothing but a join and a chance for a session to have two of something the
-- specification describes as one.
--
-- The eighteen CATEGORIES are a different matter — a session has many results, so
-- those are rows.
--
-- ── WHAT IS DEFERRED, NAMED (CLAUDE.md §4) ────────────────────────────────
--
--   · §34's "supporting evidence" points at `repair.execution_evidence` (019)
--     rather than growing a second evidence table. A test that needs a photograph
--     records it there and cites it here.
--   · Fault codes are TEXT, not references to a DTC library. `07.txt` §17's fault
--     library is Phase 9; a foreign key to a table that does not exist cannot be
--     written, and free text now is what seeds it later.
--   · The QUALITY-CONTROL flow (§37 onward) is slice 9. This slice ends where the
--     technician submits; the independent inspection is somebody else's, and
--     `2.txt` §563 requires it to be.
-- ============================================================================

BEGIN;

-- ── the test session ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repair.repair_test_sessions (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    job_card_id      uuid NOT NULL,
    -- ⚠️ THE REPAIR BEING TESTED. §34 opens "AFTER COMPLETING THE REPAIR", so a
    -- test session has no meaning without one — and a trigger below refuses an
    -- execution that is not `completed`. Testing a repair still under way would
    -- produce a result about a car in a different condition from the one released.
    execution_id     uuid NOT NULL,
    attempt_no       integer NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),

    status           TEXT NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress', 'submitted')),

    -- ── §35: the post-repair diagnostic scan ─────────────────────────────
    --
    -- Zero-or-one per session; `scan_performed` says which. Every field is TEXT
    -- because a fault code is a code, a live-data check is a sentence, and the
    -- Phase 9 library that would give either a structure does not exist yet.
    scan_performed   boolean NOT NULL DEFAULT false,
    pre_repair_fault_codes TEXT,
    codes_cleared    TEXT,
    codes_remaining  TEXT,
    -- §35 names NEW codes separately from remaining ones, and the distinction is
    -- the point: a code that was there before and still is may be the fault not
    -- fixed, but a code that was NOT there before is something the repair caused.
    new_codes        TEXT,
    live_data_checks TEXT,
    system_readiness TEXT,
    warning_light_status TEXT,

    -- ⚠️ §35's RULE, MADE STRUCTURAL. See the header note.
    critical_faults_remain boolean NOT NULL DEFAULT false,
    override_approved_by   uuid,
    override_approved_at   timestamptz,
    override_reason        TEXT,

    -- ── §36: the road test ───────────────────────────────────────────────
    road_test_performed boolean NOT NULL DEFAULT false,
    road_test_driver    TEXT,
    -- Mileage as integers: an odometer does not have fractions, and the pair is
    -- what proves the car actually moved.
    road_test_start_mileage integer CHECK (road_test_start_mileage IS NULL OR road_test_start_mileage >= 0),
    road_test_end_mileage   integer CHECK (road_test_end_mileage IS NULL OR road_test_end_mileage >= 0),
    road_test_route     TEXT,
    road_test_weather   TEXT,
    road_test_road_condition TEXT,
    road_test_initial_symptom TEXT,
    -- §36's four outcomes, as a fixed vocabulary. "Improved" is the one that would
    -- be lost in a boolean, and it is the honest answer more often than either
    -- extreme — a noise that is quieter is neither fixed nor unfixed.
    road_test_outcome   TEXT CHECK (road_test_outcome IN (
        'symptom_resolved', 'symptom_improved', 'symptom_remains', 'new_symptom_observed')),
    road_test_notes     TEXT,

    submitted_by     uuid,
    submitted_at     timestamptz,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT test_session_submitted_attributed CHECK (
        status = 'in_progress'
        OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL)
    ),

    -- ⚠️ §35, ENFORCED BY THE DATABASE. A SUBMITTED session that still has a
    -- critical fault must name who approved proceeding and why. Nothing in the
    -- application can submit past this, and neither can a later caller.
    CONSTRAINT test_session_critical_fault_needs_approval CHECK (
        status = 'in_progress'
        OR critical_faults_remain = false
        OR (override_approved_by IS NOT NULL
            AND override_approved_at IS NOT NULL
            AND override_reason IS NOT NULL
            AND length(btrim(override_reason)) > 0)
    ),

    -- A road test that was performed must say who drove it and how far. Without
    -- the mileage pair there is no evidence the car left the workshop.
    CONSTRAINT test_session_road_test_attributed CHECK (
        road_test_performed = false
        OR status = 'in_progress'
        OR (road_test_driver IS NOT NULL
            AND length(btrim(road_test_driver)) > 0
            AND road_test_start_mileage IS NOT NULL
            AND road_test_end_mileage IS NOT NULL
            AND road_test_outcome IS NOT NULL)
    ),
    -- A car cannot arrive back with fewer miles on it.
    CONSTRAINT test_session_mileage_increases CHECK (
        road_test_start_mileage IS NULL
        OR road_test_end_mileage IS NULL
        OR road_test_end_mileage >= road_test_start_mileage
    ),

    CONSTRAINT uq_test_session_attempt UNIQUE (execution_id, attempt_no),

    CONSTRAINT fk_test_session_card_scope
        FOREIGN KEY (job_card_id, tenant_id, organization_id)
        REFERENCES repair.job_cards (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_test_session_execution_scope
        FOREIGN KEY (execution_id, tenant_id, organization_id)
        REFERENCES repair.repair_executions (id, tenant_id, organization_id)
        -- RESTRICT: an execution cannot be deleted (019 revoked DELETE on the
        -- header), and if that changed, removing the repair a test result refers
        -- to would leave a pass certificate about nothing.
        ON DELETE RESTRICT
);

ALTER TABLE repair.repair_test_sessions
    DROP CONSTRAINT IF EXISTS uq_test_sessions_id_tenant_org;
ALTER TABLE repair.repair_test_sessions
    ADD CONSTRAINT uq_test_sessions_id_tenant_org UNIQUE (id, tenant_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_test_sessions_execution
    ON repair.repair_test_sessions (execution_id, attempt_no DESC);
CREATE INDEX IF NOT EXISTS idx_test_sessions_card
    ON repair.repair_test_sessions (job_card_id);
CREATE INDEX IF NOT EXISTS idx_test_sessions_tenant
    ON repair.repair_test_sessions (tenant_id);
-- Slice 9's queue: submitted and awaiting an independent inspection.
CREATE INDEX IF NOT EXISTS idx_test_sessions_submitted
    ON repair.repair_test_sessions (organization_id, submitted_at DESC)
    WHERE status = 'submitted';
-- ⚠️ WHAT A SAFETY AUDIT ASKS FOR: every release where a critical fault was
-- knowingly left, and who approved it.
CREATE INDEX IF NOT EXISTS idx_test_sessions_overrides
    ON repair.repair_test_sessions (organization_id, override_approved_at DESC)
    WHERE critical_faults_remain = true;

-- ── §34: one row per test ───────────────────────────────────────────────────

-- ⚠️ DECLARED BEFORE THE TABLE THAT CITES IT — THIRD MIGRATION RUNNING.
-- A foreign key can only reference a unique constraint that ALREADY EXISTS, and
-- writing a migration top-down puts the ALTER after the CREATE every time. 014
-- and 016 each cost a failed apply learning this; so did this one. If a later
-- migration adds a FK to a table whose composite key does not exist yet, the key
-- goes HERE, above the referencing table, not at the bottom with the indexes.
--
-- 019 gave the evidence table no (id, tenant_id, organization_id) key because
-- nothing referenced it. §34's "supporting evidence" does.
ALTER TABLE repair.execution_evidence
    DROP CONSTRAINT IF EXISTS uq_execution_evidence_id_tenant_org;
ALTER TABLE repair.execution_evidence
    ADD CONSTRAINT uq_execution_evidence_id_tenant_org UNIQUE (id, tenant_id, organization_id);

CREATE TABLE IF NOT EXISTS repair.repair_test_results (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    session_id       uuid NOT NULL,
    position         integer NOT NULL,

    -- §34's eighteen categories, transcribed in the specification's order. TEXT +
    -- CHECK rather than an enum type: adding a category should not require a type
    -- migration, the same judgement 012 and 014 made.
    test_category    TEXT NOT NULL CHECK (test_category IN (
        'visual_inspection', 'diagnostic_scan', 'electrical', 'battery',
        'charging_system', 'starting_system', 'pressure', 'compression',
        'leak', 'temperature', 'brake', 'steering', 'suspension',
        'wheel_alignment', 'tyre', 'air_conditioning', 'road_test', 'emission')),

    -- §34's fourteen fields. `test_name` is separate from the category because a
    -- category is what KIND of test it was and the name is which test — "brake"
    -- versus "offside front brake efficiency".
    test_name        TEXT NOT NULL CHECK (length(btrim(test_name)) > 0),
    test_procedure   TEXT,
    test_equipment   TEXT,
    equipment_identifier TEXT,
    -- ⚠️ §34 NAMES CALIBRATION STATUS EXPLICITLY, and it is the field most likely
    -- to be dropped as bureaucracy. A measurement from an uncalibrated gauge is
    -- not evidence, and the whole point of recording a test result is that
    -- somebody can later rely on it.
    calibration_status TEXT,
    expected_result  TEXT,
    actual_result    TEXT,
    unit_of_measurement TEXT,
    -- §34: "Pass or fail." Exactly those two, because that is what the
    -- specification says and a third value would need a downstream meaning nobody
    -- has defined. A test that could not be carried out is simply not recorded.
    outcome          TEXT NOT NULL CHECK (outcome IN ('pass', 'fail')),
    -- §34's "supporting evidence" — a citation into 019's evidence table rather
    -- than a second store of photographs.
    evidence_id      uuid,
    comments         TEXT,

    -- §34's "technician" and "date and time". `tested_by` is stored rather than
    -- inferred from whoever pressed the button: a supervisor may enter a
    -- colleague's result, and the test belongs to the person who performed it.
    tested_by        uuid,
    tested_at        timestamptz NOT NULL DEFAULT now(),

    recorded_by      uuid,
    recorded_at      timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- A FAILED test must say something. A bare "fail" cannot be acted on by the
    -- quality-control inspector who reads it next.
    CONSTRAINT test_result_failure_explained CHECK (
        outcome <> 'fail'
        OR (actual_result IS NOT NULL AND length(btrim(actual_result)) > 0)
        OR (comments IS NOT NULL AND length(btrim(comments)) > 0)
    ),

    CONSTRAINT uq_test_result_position UNIQUE (session_id, position) DEFERRABLE INITIALLY DEFERRED,

    CONSTRAINT fk_test_result_session_scope
        FOREIGN KEY (session_id, tenant_id, organization_id)
        REFERENCES repair.repair_test_sessions (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_test_result_evidence_scope
        FOREIGN KEY (evidence_id, tenant_id, organization_id)
        REFERENCES repair.execution_evidence (id, tenant_id, organization_id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_test_results_session
    ON repair.repair_test_results (session_id, position);
CREATE INDEX IF NOT EXISTS idx_test_results_tenant
    ON repair.repair_test_results (tenant_id);
-- ⚠️ WHAT SLICE 9 READS FIRST. A quality-control inspector opens the failures
-- before anything else, and this is the index that makes that cheap.
CREATE INDEX IF NOT EXISTS idx_test_results_failures
    ON repair.repair_test_results (session_id)
    WHERE outcome = 'fail';

-- ── §34: testing follows a COMPLETED repair ─────────────────────────────────
--
-- The rule a foreign key cannot express: the key proves an execution exists, not
-- that the work finished. A test result about a car still on the ramp describes a
-- different vehicle from the one released.
CREATE OR REPLACE FUNCTION repair.assert_testing_follows_completed_repair()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_status text;
BEGIN
    SELECT status INTO v_status
      FROM repair.repair_executions
     WHERE id = NEW.execution_id AND tenant_id = NEW.tenant_id;

    IF v_status IS DISTINCT FROM 'completed' THEN
        RAISE EXCEPTION
            'testing cannot begin: repair % is % rather than completed',
            NEW.execution_id, COALESCE(v_status, 'missing')
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_testing_follows_repair ON repair.repair_test_sessions;
CREATE TRIGGER trg_testing_follows_repair
    BEFORE INSERT ON repair.repair_test_sessions
    FOR EACH ROW
    EXECUTE FUNCTION repair.assert_testing_follows_completed_repair();

-- ── a submitted session freezes ─────────────────────────────────────────────
--
-- It is the evidence slice 9's INDEPENDENT inspection reads. Test results that
-- can move after they have been submitted are not evidence of anything, and
-- `2.txt` §563's independence means nothing if the technician can edit what the
-- inspector is looking at.

CREATE OR REPLACE FUNCTION repair.reject_settled_test_session_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'submitted' THEN
        RAISE EXCEPTION
            'test session % has been submitted for quality control and cannot be changed; record a new test session instead', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- 015's lesson, applied in the migration that creates the table.
    IF NEW.execution_id IS DISTINCT FROM OLD.execution_id
       OR NEW.job_card_id IS DISTINCT FROM OLD.job_card_id
       OR NEW.attempt_no IS DISTINCT FROM OLD.attempt_no
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION
            'test session % cannot change its identity columns', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_test_sessions_immutable ON repair.repair_test_sessions;
CREATE TRIGGER trg_test_sessions_immutable
    BEFORE UPDATE ON repair.repair_test_sessions
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_settled_test_session_change();

CREATE OR REPLACE FUNCTION repair.reject_settled_test_result_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    blocked boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM repair.repair_test_sessions
         WHERE status = 'submitted'
           AND id IN (
                 OLD.session_id,
                 CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END
               )
    ) INTO blocked;

    IF blocked THEN
        RAISE EXCEPTION
            'test session % is submitted and its results cannot be changed', OLD.session_id
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- A BEFORE DELETE TRIGGER MUST RETURN OLD. Returning NEW (NULL on a delete)
    -- SKIPS the row silently and the caller sees a successful statement that
    -- deleted nothing. Slice 3a shipped that bug.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_test_results_immutable ON repair.repair_test_results;
CREATE TRIGGER trg_test_results_immutable
    BEFORE UPDATE OR DELETE ON repair.repair_test_results
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_settled_test_result_change();

-- ── row-level security ──────────────────────────────────────────────────────
-- ENABLE *and* FORCE. Enable alone exempts the table owner, which is the role the
-- app connects as — isolation present and inert.

ALTER TABLE repair.repair_test_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.repair_test_sessions FORCE  ROW LEVEL SECURITY;
ALTER TABLE repair.repair_test_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.repair_test_results  FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.repair_test_sessions;
CREATE POLICY tenant_isolation ON repair.repair_test_sessions
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON repair.repair_test_results;
CREATE POLICY tenant_isolation ON repair.repair_test_results
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- DELETE on the RESULTS from the start — 013's lesson, now the default. A
-- technician who records a test against the wrong category must be able to remove
-- it while the session is open; the trigger withdraws that the moment it is
-- submitted. The SESSION keeps its revoke: a test session that was started is a
-- fact about the car's condition.
GRANT SELECT, INSERT, UPDATE         ON repair.repair_test_sessions TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON repair.repair_test_results  TO autoworkshop_app;
REVOKE DELETE ON repair.repair_test_sessions FROM autoworkshop_app;

COMMIT;
