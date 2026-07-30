-- ============================================================================
-- Migration 019 — repair execution and time recording (Phase 5, slice 7)
--
-- `1.txt` §386 puts "Repair evidence" in Domain 5. `07.txt` §31-§33 is the
-- REPAIR EXECUTION FLOW and TECHNICIAN TIME RECORDING.
--
-- Transcribed, not paraphrased:
--   §32-§33 — the technician receives notification the repair is AUTHORIZED, and
--     confirms: customer approval · parts availability · tool availability · bay
--     availability · safety requirements
--   §3-§4  — "The technician selects 'Start Repair.'" · "The system records the
--     start time."
--   §6-§10 — records task completion · parts used · measurements · repair
--     evidence · unexpected findings
--   §13    — "The technician completes the AUTHORIZED repair."
--   §33    — Start Work · Pause Work · Resume Work · Complete Task · Record
--     Non-Productive Time · Waiting for Parts · Waiting for Approval · Tool Delay
--     · Additional Diagnosis. "Time records shall be linked to: Job · Task ·
--     Technician · Service bay · Repair stage."
--   §33    — "The system shall NOT DEPEND ENTIRELY ON MANUAL TIME RECORDS for
--     determining technical quality."
--
-- ── THE AUTHORISATION IS A FOREIGN KEY, NOT A CHECKBOX ─────────────────────
--
-- `07.txt` §7 says "repair work shall not start until the required approval is
-- received", and §32 has the technician CONFIRM the customer approval. Those are
-- two different things and this migration keeps them apart:
--
--   · `proposal_id` NOT NULL is the AUTHORISATION. A trigger refuses any
--     execution whose proposal is not `approved` by the customer. That is the
--     rule, and it cannot be ticked past.
--   · `customer_approval_confirmed` is the technician SAYING they checked. It is
--     a human acknowledgement, recorded because §32 asks for it — not the control.
--
-- Modelling only the checkbox would make "work started without approval" a data
-- entry mistake instead of an impossibility. Modelling only the key would lose
-- §32's acknowledgement. Both, deliberately.
--
-- ── §33's WARNING IS DESIGNED FOR, NOT JUST QUOTED ─────────────────────────
--
-- "The system shall not depend entirely on manual time records for determining
-- technical quality." So time entries here are EVIDENCE OF EFFORT and nothing
-- else: no trigger compares them to the plan's estimate, no status is derived
-- from them, and nothing downstream blocks on them. A technician who forgets to
-- press Pause produces a wrong duration, not a wrong repair — and slice 9's
-- quality control reads the test results and the evidence, never the clock.
--
-- ── WHAT IS DEFERRED, NAMED (CLAUDE.md §4) ────────────────────────────────
--
--   · §11-§12's VARIATION REQUEST is slice 7b. It is not a hole today: a
--     variation is additional chargeable work, and that is already expressible as
--     a new quotation (016) plus a new proposal version (017), which is exactly
--     the "reviewed internally, sent to the customer, approved or rejected,
--     recorded in the approval history" §14 asks for. What 7b adds is the LINK
--     from the unexpected finding to that chain, so the two can be reported
--     together.
--   · §9's evidence is recorded with a description and an external reference.
--     MinIO is running but no upload path exists, so storing a file is a lie this
--     migration does not tell — `storage_key` is present and unused, ready for it.
--   · §8's measurements are recorded as evidence of kind `measurement`. A typed
--     measurement schema needs the Phase 9 library to say what is being measured
--     and in what unit; free text now beats a fake structure.
-- ============================================================================

BEGIN;

-- ── the execution header ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repair.repair_executions (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    job_card_id      uuid NOT NULL,
    -- ⚠️ THE AUTHORISATION. See the header note: NOT NULL, and a trigger below
    -- refuses a proposal the customer has not approved.
    proposal_id      uuid NOT NULL,
    attempt_no       integer NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),

    status           TEXT NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress', 'completed', 'abandoned')),

    -- §32's five confirmations. Booleans with an accompanying note, because "the
    -- part is here" and "the part is here but the bracket is on order" are
    -- different states and only the second is worth reading later.
    customer_approval_confirmed boolean NOT NULL DEFAULT false,
    parts_available_confirmed   boolean NOT NULL DEFAULT false,
    tools_available_confirmed   boolean NOT NULL DEFAULT false,
    bay_available_confirmed     boolean NOT NULL DEFAULT false,
    safety_confirmed            boolean NOT NULL DEFAULT false,
    readiness_note   TEXT,

    -- §33's "service bay", at the level of the job. Individual time entries may
    -- name a different one when work moves.
    service_bay      TEXT,

    started_by       uuid,
    started_at       timestamptz NOT NULL DEFAULT now(),
    completed_by     uuid,
    completed_at     timestamptz,
    completion_note  TEXT,
    -- §10 — "the technician records unexpected findings". At the level of the
    -- whole execution; anything CHARGEABLE becomes a variation (slice 7b) and
    -- must not simply be done.
    unexpected_findings TEXT,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT execution_completed_attributed CHECK (
        status <> 'completed'
        OR (completed_at IS NOT NULL AND completed_by IS NOT NULL)
    ),
    -- An abandoned repair must say why. A job that stopped and nobody recorded a
    -- reason for is the one a customer asks about six weeks later.
    CONSTRAINT execution_abandoned_has_reason CHECK (
        status <> 'abandoned'
        OR (completion_note IS NOT NULL AND length(btrim(completion_note)) > 0)
    ),

    CONSTRAINT uq_execution_attempt UNIQUE (job_card_id, attempt_no),

    CONSTRAINT fk_execution_card_scope
        FOREIGN KEY (job_card_id, tenant_id, organization_id)
        REFERENCES repair.job_cards (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_execution_proposal_scope
        FOREIGN KEY (proposal_id, tenant_id, organization_id)
        REFERENCES repair.repair_proposals (id, tenant_id, organization_id)
        -- RESTRICT: a proposal cannot be deleted (017 revoked DELETE), and if that
        -- changed, removing the authorisation for work already done would erase
        -- the answer to "who agreed to this".
        ON DELETE RESTRICT
);

ALTER TABLE repair.repair_executions
    DROP CONSTRAINT IF EXISTS uq_repair_executions_id_tenant_org;
ALTER TABLE repair.repair_executions
    ADD CONSTRAINT uq_repair_executions_id_tenant_org UNIQUE (id, tenant_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_executions_card
    ON repair.repair_executions (job_card_id, attempt_no DESC);
CREATE INDEX IF NOT EXISTS idx_executions_tenant
    ON repair.repair_executions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_executions_open
    ON repair.repair_executions (organization_id, started_at DESC)
    WHERE status = 'in_progress';

-- ── the tasks being carried out ─────────────────────────────────────────────
--
-- One row per APPROVED PLAN TASK, created when the repair starts. Not a copy of
-- the task — a reference to it plus the state of doing it. The title, the skill,
-- the bay and the estimate all stay on `repair_plan_tasks`, which is immutable, so
-- there is nothing here to drift from it.

CREATE TABLE IF NOT EXISTS repair.execution_tasks (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    execution_id     uuid NOT NULL,
    -- The plan task this carries out. NOT NULL: §5 says the technician follows the
    -- APPROVED repair procedure, so work that corresponds to no approved task is
    -- not execution — it is a variation, and slice 7b is where it goes.
    repair_plan_task_id uuid NOT NULL,
    position         integer NOT NULL,

    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'skipped')),

    -- A blocked or skipped task must say why — those are the two states somebody
    -- else has to act on, and a bare status tells them nothing.
    status_note      TEXT,

    started_at       timestamptz,
    completed_by     uuid,
    completed_at     timestamptz,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT exec_task_completed_attributed CHECK (
        status <> 'completed'
        OR (completed_at IS NOT NULL AND completed_by IS NOT NULL)
    ),
    CONSTRAINT exec_task_stopped_has_reason CHECK (
        status NOT IN ('blocked', 'skipped')
        OR (status_note IS NOT NULL AND length(btrim(status_note)) > 0)
    ),

    -- One execution row per plan task: doing the same approved task twice is not
    -- two tasks, it is rework, and rework belongs to the QC slice.
    CONSTRAINT uq_execution_task UNIQUE (execution_id, repair_plan_task_id),

    CONSTRAINT fk_exec_task_execution_scope
        FOREIGN KEY (execution_id, tenant_id, organization_id)
        REFERENCES repair.repair_executions (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_exec_task_plan_task_scope
        FOREIGN KEY (repair_plan_task_id, tenant_id, organization_id)
        REFERENCES repair.repair_plan_tasks (id, tenant_id, organization_id)
        ON DELETE RESTRICT
);

ALTER TABLE repair.execution_tasks
    DROP CONSTRAINT IF EXISTS uq_execution_tasks_id_tenant_org;
ALTER TABLE repair.execution_tasks
    ADD CONSTRAINT uq_execution_tasks_id_tenant_org UNIQUE (id, tenant_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_exec_tasks_execution
    ON repair.execution_tasks (execution_id, position);
CREATE INDEX IF NOT EXISTS idx_exec_tasks_tenant
    ON repair.execution_tasks (tenant_id);
-- Slice 9's question: was the confirmed fault actually repaired? It walks
-- plan task -> finding, so this index is the other half of 014's.
CREATE INDEX IF NOT EXISTS idx_exec_tasks_plan_task
    ON repair.execution_tasks (repair_plan_task_id);

-- ── §33: time recording ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repair.execution_time_entries (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    execution_id     uuid NOT NULL,
    -- §33 links time to a TASK where there is one. Nullable: waiting for parts is
    -- real time spent on the job that belongs to no single task, and forcing one
    -- would attribute a delay to whichever task happened to be open.
    execution_task_id uuid,

    -- §33's own list. `productive` is Start/Resume Work; the rest are its named
    -- non-productive categories. TEXT + CHECK rather than an enum type, so adding
    -- a category is not a type migration.
    entry_kind       TEXT NOT NULL CHECK (entry_kind IN (
        'productive',
        'waiting_for_parts',
        'waiting_for_approval',
        'tool_delay',
        'additional_diagnosis',
        'other_non_productive')),

    -- §33 — "linked to: job · task · TECHNICIAN · service bay · repair stage".
    -- The technician is stored rather than inferred from who pressed the button:
    -- a supervisor may correct a colleague's timesheet, and the entry belongs to
    -- the person who did the work.
    technician_id    uuid NOT NULL,
    service_bay      TEXT,
    -- The job card's stage when the entry was opened. A COPY on purpose, and the
    -- one place in this slice where copying is right: the stage moves on, and
    -- "what stage was this time booked against" cannot be answered later from a
    -- value that has since changed.
    repair_stage     TEXT,

    started_at       timestamptz NOT NULL DEFAULT now(),
    -- NULL means RUNNING. §33's Pause/Resume is closing one entry and opening
    -- another, not a field on a single row — that way a paused interval and a
    -- worked interval are the same shape and both are auditable.
    ended_at         timestamptz,
    note             TEXT,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- Time cannot run backwards. Cheap to state, and it catches a clock skew or a
    -- hand-edited correction before it becomes a negative duration on an invoice.
    CONSTRAINT time_entry_ends_after_start CHECK (
        ended_at IS NULL OR ended_at >= started_at
    ),
    -- A non-productive entry must say why: "waiting for parts" with no note cannot
    -- be chased, and chasing it is the only reason to record it.
    CONSTRAINT time_entry_non_productive_has_note CHECK (
        entry_kind = 'productive'
        OR (note IS NOT NULL AND length(btrim(note)) > 0)
    ),

    CONSTRAINT fk_time_execution_scope
        FOREIGN KEY (execution_id, tenant_id, organization_id)
        REFERENCES repair.repair_executions (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    -- MATCH SIMPLE: a NULL task means the time belongs to the job as a whole.
    CONSTRAINT fk_time_task_scope
        FOREIGN KEY (execution_task_id, tenant_id, organization_id)
        REFERENCES repair.execution_tasks (id, tenant_id, organization_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_time_entries_execution
    ON repair.execution_time_entries (execution_id, started_at);
CREATE INDEX IF NOT EXISTS idx_time_entries_tenant
    ON repair.execution_time_entries (tenant_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_technician
    ON repair.execution_time_entries (technician_id, started_at DESC);
-- ⚠️ THE INDEX THAT MAKES "IS ANYONE STILL CLOCKED ON" ANSWERABLE. A running
-- entry is one with no end, and finding them is what stops a technician going home
-- with the clock running.
CREATE INDEX IF NOT EXISTS idx_time_entries_running
    ON repair.execution_time_entries (execution_id)
    WHERE ended_at IS NULL;

-- ⚠️ ONE RUNNING ENTRY PER TECHNICIAN PER EXECUTION, ENFORCED BY THE DATABASE.
-- A partial unique index rather than a trigger: it is declarative, it is atomic
-- under concurrency, and two people pressing Start on the same phone twice is
-- exactly the race a service-layer check loses. Somebody may legitimately have a
-- running entry on a DIFFERENT job (a quick job while waiting on this one), so the
-- key is (execution, technician) and not the technician alone.
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_running_entry_per_technician
    ON repair.execution_time_entries (execution_id, technician_id)
    WHERE ended_at IS NULL;

-- ── §7: parts actually used ─────────────────────────────────────────────────
--
-- SEPARATE from the plan's required parts, and that separation is the point. The
-- plan says what was expected; this says what was fitted. They differ — a part
-- arrives damaged, two clips are needed instead of one — and a system that
-- overwrites the first with the second cannot answer why the invoice differs from
-- the quotation.

CREATE TABLE IF NOT EXISTS repair.execution_parts_used (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    execution_id     uuid NOT NULL,
    execution_task_id uuid,
    -- The planned resource this fulfils, where it fulfils one. NULL means a part
    -- the plan did not foresee — which is a fact worth surfacing, not an error.
    repair_plan_resource_id uuid,
    position         integer NOT NULL,

    description      TEXT NOT NULL CHECK (length(btrim(description)) > 0),
    part_number      TEXT,
    quantity         numeric(12,3) NOT NULL CHECK (quantity > 0),
    unit             TEXT,
    note             TEXT,

    recorded_by      uuid,
    recorded_at      timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_parts_execution_scope
        FOREIGN KEY (execution_id, tenant_id, organization_id)
        REFERENCES repair.repair_executions (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_parts_task_scope
        FOREIGN KEY (execution_task_id, tenant_id, organization_id)
        REFERENCES repair.execution_tasks (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_parts_resource_scope
        FOREIGN KEY (repair_plan_resource_id, tenant_id, organization_id)
        REFERENCES repair.repair_plan_resources (id, tenant_id, organization_id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_parts_used_execution
    ON repair.execution_parts_used (execution_id, position);
CREATE INDEX IF NOT EXISTS idx_parts_used_tenant
    ON repair.execution_parts_used (tenant_id);
-- What the invoice is reconciled against: fitted versus planned.
CREATE INDEX IF NOT EXISTS idx_parts_used_resource
    ON repair.execution_parts_used (repair_plan_resource_id)
    WHERE repair_plan_resource_id IS NOT NULL;

-- ── §8-§9: measurements and evidence ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repair.execution_evidence (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    execution_id     uuid NOT NULL,
    execution_task_id uuid,
    position         integer NOT NULL,

    -- §8's measurements are a KIND of evidence rather than a separate table: both
    -- are "something observed during the repair, recorded so somebody else can
    -- check it". A typed measurement schema needs the Phase 9 library to say what
    -- is being measured and in what unit.
    evidence_kind    TEXT NOT NULL CHECK (evidence_kind IN (
        'measurement', 'photo', 'video', 'document', 'observation')),

    description      TEXT NOT NULL CHECK (length(btrim(description)) > 0),
    -- For a measurement: the reading and its unit, as recorded.
    recorded_value   TEXT,
    -- ⚠️ PRESENT AND DELIBERATELY UNUSED. MinIO is running but no upload path
    -- exists, so a column that claimed to hold a file would be a lie. It lands now
    -- because adding it later means backfilling every row that should have had one.
    storage_key      TEXT,
    -- Where the file lives until then — a shared drive, a phone, a ticket.
    external_reference TEXT,

    recorded_by      uuid,
    recorded_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_evidence_execution_scope
        FOREIGN KEY (execution_id, tenant_id, organization_id)
        REFERENCES repair.repair_executions (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_evidence_task_scope
        FOREIGN KEY (execution_task_id, tenant_id, organization_id)
        REFERENCES repair.execution_tasks (id, tenant_id, organization_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_evidence_execution
    ON repair.execution_evidence (execution_id, position);
CREATE INDEX IF NOT EXISTS idx_evidence_tenant
    ON repair.execution_evidence (tenant_id);

-- ── the repair must be AUTHORISED ───────────────────────────────────────────
--
-- §7: "Repair work shall not start until the required approval is received." The
-- rule a foreign key cannot express — the key proves a proposal exists, not that
-- the customer said yes to it.
CREATE OR REPLACE FUNCTION repair.assert_execution_is_authorised()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_status text;
BEGIN
    SELECT status INTO v_status
      FROM repair.repair_proposals
     WHERE id = NEW.proposal_id AND tenant_id = NEW.tenant_id;

    IF v_status IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION
            'repair work cannot start: proposal % is % rather than approved by the customer',
            NEW.proposal_id, COALESCE(v_status, 'missing')
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_execution_authorised ON repair.repair_executions;
CREATE TRIGGER trg_execution_authorised
    BEFORE INSERT ON repair.repair_executions
    FOR EACH ROW
    EXECUTE FUNCTION repair.assert_execution_is_authorised();

-- ── a completed execution freezes ───────────────────────────────────────────
--
-- Narrower than its siblings, and deliberately: an execution is a WORKING record
-- that a technician adds to over hours or days, so it must stay writable while it
-- is open. What freezes is the finished article — the record slice 8's testing and
-- slice 9's quality control read.

CREATE OR REPLACE FUNCTION repair.reject_settled_execution_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status IN ('completed', 'abandoned') THEN
        RAISE EXCEPTION
            'repair execution % is %; its record cannot be changed', OLD.id, OLD.status
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- 015's lesson, applied in the migration that creates the table: the identity
    -- columns are write-once, so an execution cannot be re-pointed at a different
    -- authorisation after the work is under way.
    IF NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
       OR NEW.job_card_id IS DISTINCT FROM OLD.job_card_id
       OR NEW.attempt_no IS DISTINCT FROM OLD.attempt_no
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION
            'repair execution % cannot change its identity columns', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_executions_immutable ON repair.repair_executions;
CREATE TRIGGER trg_executions_immutable
    BEFORE UPDATE ON repair.repair_executions
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_settled_execution_change();

/*
 * The children freeze with the parent. One function for all four child tables:
 * they differ only in nothing that matters here, and each names the execution the
 * same way.
 */
CREATE OR REPLACE FUNCTION repair.reject_settled_execution_child_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    blocked boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM repair.repair_executions
         WHERE status <> 'in_progress'
           AND id IN (
                 OLD.execution_id,
                 CASE WHEN TG_OP = 'DELETE' THEN OLD.execution_id ELSE NEW.execution_id END
               )
    ) INTO blocked;

    IF blocked THEN
        RAISE EXCEPTION
            'repair execution % is finished and its record cannot be changed', OLD.execution_id
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

DROP TRIGGER IF EXISTS trg_exec_tasks_immutable ON repair.execution_tasks;
CREATE TRIGGER trg_exec_tasks_immutable
    BEFORE UPDATE OR DELETE ON repair.execution_tasks
    FOR EACH ROW EXECUTE FUNCTION repair.reject_settled_execution_child_change();

DROP TRIGGER IF EXISTS trg_time_entries_immutable ON repair.execution_time_entries;
CREATE TRIGGER trg_time_entries_immutable
    BEFORE UPDATE OR DELETE ON repair.execution_time_entries
    FOR EACH ROW EXECUTE FUNCTION repair.reject_settled_execution_child_change();

DROP TRIGGER IF EXISTS trg_parts_used_immutable ON repair.execution_parts_used;
CREATE TRIGGER trg_parts_used_immutable
    BEFORE UPDATE OR DELETE ON repair.execution_parts_used
    FOR EACH ROW EXECUTE FUNCTION repair.reject_settled_execution_child_change();

DROP TRIGGER IF EXISTS trg_evidence_immutable ON repair.execution_evidence;
CREATE TRIGGER trg_evidence_immutable
    BEFORE UPDATE OR DELETE ON repair.execution_evidence
    FOR EACH ROW EXECUTE FUNCTION repair.reject_settled_execution_child_change();

-- ── row-level security ──────────────────────────────────────────────────────
-- ENABLE *and* FORCE on every table. Enable alone exempts the table owner, which
-- is the role the app connects as — isolation present and inert.

ALTER TABLE repair.repair_executions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.repair_executions       FORCE  ROW LEVEL SECURITY;
ALTER TABLE repair.execution_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.execution_tasks         FORCE  ROW LEVEL SECURITY;
ALTER TABLE repair.execution_time_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.execution_time_entries  FORCE  ROW LEVEL SECURITY;
ALTER TABLE repair.execution_parts_used    ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.execution_parts_used    FORCE  ROW LEVEL SECURITY;
ALTER TABLE repair.execution_evidence      ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.execution_evidence      FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.repair_executions;
CREATE POLICY tenant_isolation ON repair.repair_executions
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON repair.execution_tasks;
CREATE POLICY tenant_isolation ON repair.execution_tasks
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON repair.execution_time_entries;
CREATE POLICY tenant_isolation ON repair.execution_time_entries
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON repair.execution_parts_used;
CREATE POLICY tenant_isolation ON repair.execution_parts_used
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON repair.execution_evidence;
CREATE POLICY tenant_isolation ON repair.execution_evidence
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- DELETE on the children, granted here rather than in a fix-up later — 013's
-- lesson, now the default. A technician who books time against the wrong task, or
-- records a part they did not fit, must be able to remove it while the job is
-- open; the triggers above are what withdraw that once it is finished.
--
-- The HEADER keeps its revoke: a repair that was started is a fact about the
-- workshop's day, and an attempt number that silently disappears is how attempt 3
-- comes to follow attempt 1.
GRANT SELECT, INSERT, UPDATE         ON repair.repair_executions      TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON repair.execution_tasks        TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON repair.execution_time_entries TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON repair.execution_parts_used   TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON repair.execution_evidence     TO autoworkshop_app;
REVOKE DELETE ON repair.repair_executions FROM autoworkshop_app;

COMMIT;
