-- ============================================================================
-- Migration 014 — repair plans (Phase 5, slice 4)
--
-- `1.txt` §378-§384 puts "Repair tasks", "Required tools", "Required parts" and
-- "Labor allocation" in Domain 5, immediately after the diagnostic content
-- slice 3b landed. `07.txt` §22-§26 is the REPAIR PLANNING FLOW.
--
-- Transcribed, not paraphrased:
--   `07.txt` §22-§26 — "The technician completes the diagnosis. The technician
--     selects 'Plan Repair.' The application LOADS CONFIRMED FAULTS. The
--     technician selects the repair procedure."
--   `07.txt` §27-§28 — "adds required repair tasks" · "defines the task sequence"
--   `07.txt` §29 — the technician identifies: required technicians · required
--     skills · service bay · tools · diagnostic equipment · lifting equipment ·
--     safety equipment · parts · consumables
--   `07.txt` §29.8-§29.10 — "records estimated labor" · "identifies required
--     post-repair tests" · "submits the plan for supervisor review"
--   `07.txt` §30-§31 (INTERNAL TECHNICAL REVIEW) — the supervisor reviews the
--     confirmed fault, repair procedure, parts, labor, safety and testing plan,
--     then approves; "after approval, the repair plan is passed to quotation
--     preparation"
--   `07.txt` pt2 §50 — "Workshop Supervisor: technical review, REPAIR-PLAN
--     APPROVAL, testing and quality oversight."
--
-- ── THE LINK TO THE FINDING IS THE POINT OF THIS MIGRATION ─────────────────
--
-- §25 says the application loads CONFIRMED faults. A plan that merely names its
-- tasks in free text can be READ next to a diagnosis but cannot be QUERIED
-- against one, so slice 9's quality control could never ask the only question it
-- exists to ask: was the confirmed fault actually repaired? That link cannot be
-- reconstructed by a later migration — nobody will re-read a thousand plans and
-- say which task addressed which fault — so `task.finding_id` lands NOW, with a
-- trigger that keeps it honest.
--
-- The trigger enforces what a foreign key cannot: that the finding belongs to
-- THIS PLAN'S OWN diagnosis, and that it is CONFIRMED. A plan line pointing at a
-- `suspected` fault is a customer charged for a guess (`02.txt` §1290 draws that
-- distinction precisely so it can be relied on downstream), and a plan line
-- pointing at another job's finding is a cross-record claim a plain FK would
-- happily accept.
--
-- ── WHAT IS ONE TABLE HERE AND WHY ─────────────────────────────────────────
--
-- §29 lists nine resource kinds. They are NOT nine tables: at this slice every
-- one of them carries exactly the same columns — a name, an optional reference,
-- a quantity, a unit, a note — and nine tables with identical shapes is nine
-- places for a later column to be added to eight of them. `resource_kind` is
-- TEXT + CHECK rather than an enum type, the same judgement 012 made about
-- `affected_system`: adding a kind should not require a type migration.
--
-- ⚠️ WHAT THIS SLICE DOES NOT BUILD, NAMED RATHER THAN QUIETLY DROPPED
-- (CLAUDE.md §4 — "do not quietly re-defer features"):
--   · The Plan Work tool's CONFLICT DETECTION (§12: technician unavailable,
--     service bay unavailable, required tool unavailable, part not available)
--     needs a technician roster with availability, a service-bay table and an
--     inventory — none of which exist in any migration yet. A "conflict check"
--     written against absent data would answer "no conflicts" always, which is
--     worse than no check: it is a green light nobody earned.
--   · `service_bay` and `required_skill` are therefore TEXT the technician
--     writes, not references. When the bay and skill registries land they become
--     FKs, and the text already recorded is what seeds them.
--   · Find Parts (§24) and Parts Compatibility (§25-§27) are their own screens
--     and their own slices; `resource.reference` is the column their part
--     numbers will land in.
--   · Inspection hold points and task dependencies (§12) are deliberately absent.
--     `position` gives §28's SEQUENCE; a dependency GRAPH is a different feature
--     and belongs with execution (slice 7), where something actually walks it.
--
-- Everything else is slice 3b's shape unchanged: header plus child rows written
-- in one transaction, attempts rather than edits, immutable on submission in the
-- service AND by trigger, composite foreign keys carrying the tenant predicate a
-- plain key cannot, DELETE granted on the CHILDREN only.
-- ============================================================================

BEGIN;

-- ── the diagnostic finding must be addressable by a composite key ───────────
--
-- 012 gave `diagnoses` a (id, tenant_id, organization_id) unique key but not the
-- findings, because nothing referenced a finding then. A plan task does, and it
-- must reference one WITH the tenant predicate — a plain `REFERENCES
-- diagnostic_findings(id)` would let a row in one tenant name a finding in
-- another and the database would accept it.
ALTER TABLE repair.diagnostic_findings
    DROP CONSTRAINT IF EXISTS uq_findings_id_tenant_org;
ALTER TABLE repair.diagnostic_findings
    ADD CONSTRAINT uq_findings_id_tenant_org UNIQUE (id, tenant_id, organization_id);

-- ── the repair plan header ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repair.repair_plans (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    job_card_id      uuid NOT NULL,

    -- ⚠️ THE DIAGNOSIS THIS PLAN WAS BUILT FROM, NOT NULL AND NOT NULLABLE LATER.
    -- §22-§25 has planning begin from a completed diagnosis and its confirmed
    -- faults. Recording WHICH diagnosis is what makes the plan auditable: a plan
    -- whose source is unknown cannot be checked against the faults it claims to
    -- address, and "the newest approved one at the time" is not recoverable after
    -- a second attempt exists.
    diagnosis_id     uuid NOT NULL,

    attempt_no       integer NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),

    -- The same four states as a diagnosis, and for the same reason: §30-§31 puts
    -- a supervisor between the plan and the quotation priced from it. A rejected
    -- plan is NOT reopened — it stays as the record of what was proposed, and the
    -- next proposal is a new attempt.
    status           TEXT NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress', 'submitted', 'approved', 'rejected')),

    -- §26 — "The technician selects the repair procedure." Free TEXT at this
    -- slice: the Repair Procedures Library is Phase 9, and until it exists a
    -- reference to a library entry would point at nothing. When it lands, this
    -- column is what identifies which plans named which procedure.
    repair_procedure   TEXT,
    -- §29's safety requirements, at the level of the whole plan.
    safety_precautions TEXT,
    -- §29.9 — "identifies required post-repair tests". Recorded with the PLAN,
    -- because slice 8's testing must be able to ask what was supposed to be
    -- tested; a test plan invented after the repair proves nothing.
    post_repair_tests  TEXT,
    -- The technician's notes on the plan as a whole. TEXT, never VARCHAR(n).
    notes            TEXT,

    started_by       uuid,
    started_at       timestamptz NOT NULL DEFAULT now(),

    submitted_by     uuid,
    submitted_at     timestamptz,

    reviewed_by      uuid,
    reviewed_at      timestamptz,
    review_note      TEXT,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- A submitted plan names who submitted it and when — 011's lesson, applied up
    -- front for the third slice running rather than discovered by review again.
    CONSTRAINT plan_submitted_attributed CHECK (
        status = 'in_progress'
        OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL)
    ),
    CONSTRAINT plan_reviewed_attributed CHECK (
        status IN ('in_progress', 'submitted')
        OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
    ),
    -- A rejection must say why. §31 gives the supervisor "Request Additional
    -- Test", "Modify Plan" and "Return to Technician" — every one of those is a
    -- sentence the technician has to be able to read and act on.
    CONSTRAINT plan_rejection_has_reason CHECK (
        status <> 'rejected'
        OR (review_note IS NOT NULL AND length(btrim(review_note)) > 0)
    ),

    CONSTRAINT uq_repair_plan_attempt UNIQUE (job_card_id, attempt_no),

    -- Composite, carrying the tenant predicate a plain key cannot.
    CONSTRAINT fk_plan_card_scope
        FOREIGN KEY (job_card_id, tenant_id, organization_id)
        REFERENCES repair.job_cards (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_plan_diagnosis_scope
        FOREIGN KEY (diagnosis_id, tenant_id, organization_id)
        REFERENCES repair.diagnoses (id, tenant_id, organization_id)
        -- RESTRICT, not CASCADE: a diagnosis cannot be deleted anyway (012 revoked
        -- DELETE on it), and if that ever changed, taking the plan with it would
        -- silently remove the record of work that was proposed and possibly done.
        ON DELETE RESTRICT
);

ALTER TABLE repair.repair_plans
    DROP CONSTRAINT IF EXISTS uq_repair_plans_id_tenant_org;
ALTER TABLE repair.repair_plans
    ADD CONSTRAINT uq_repair_plans_id_tenant_org UNIQUE (id, tenant_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_repair_plans_card
    ON repair.repair_plans (job_card_id, attempt_no DESC);
CREATE INDEX IF NOT EXISTS idx_repair_plans_tenant
    ON repair.repair_plans (tenant_id);
CREATE INDEX IF NOT EXISTS idx_repair_plans_tenant_created
    ON repair.repair_plans (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_plans_diagnosis
    ON repair.repair_plans (diagnosis_id);
-- §30's internal technical review queue — submitted and not yet answered.
CREATE INDEX IF NOT EXISTS idx_repair_plans_awaiting_review
    ON repair.repair_plans (organization_id, submitted_at DESC)
    WHERE status = 'submitted';

-- ── the repair tasks ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repair.repair_plan_tasks (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    plan_id          uuid NOT NULL,
    -- §28 — "the technician defines the task sequence". The ORDER is the plan's
    -- content, not a display preference: bleeding the brakes before refitting the
    -- caliper is a different plan from the reverse.
    position         integer NOT NULL,

    -- ⚠️ §25's CONFIRMED FAULT, as a real reference. NULLABLE on purpose, and the
    -- nullability is a decision rather than laxity: plenty of legitimate plan
    -- tasks address no single fault — refill the coolant, road test, refit the
    -- undertray. Requiring a fault for those would push technicians into
    -- attaching them to an unrelated finding, which corrupts exactly the link
    -- slice 9 needs to trust.
    --
    -- What IS enforced (by trigger below, because no FK can express it): if a
    -- finding is named, it belongs to THIS PLAN'S diagnosis and it is CONFIRMED.
    finding_id       uuid,

    -- §27's task. The one field that must be present: a task with no description
    -- is not a task.
    title            TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    description      TEXT,

    -- §29's "required skills" and "service bay". TEXT, not references — see the
    -- header comment: neither registry exists yet, and a FK to an absent table is
    -- not a thing that can be written.
    required_skill   TEXT,
    service_bay      TEXT,

    -- §29's "required technicians", as an assignment rather than a count. NOT a
    -- foreign key to identity.users: the plan may name somebody who later leaves,
    -- and a RESTRICT would block the leaver while a CASCADE would silently strip
    -- the assignment out of a settled plan. The service resolves the name for
    -- display and tolerates an unresolvable id, the same way 012's LEFT JOINs do.
    assigned_technician_id uuid,

    -- §29.8 — "records estimated labor". NUMERIC, never a float: this is what the
    -- quotation multiplies by a labour rate, and binary floating point is how a
    -- customer is charged 4.999999 hours.
    --
    -- NULLABLE while the plan is open (a task can be listed before it is
    -- estimated) and REQUIRED AT SUBMISSION by the service — the quotation slice
    -- prices from these numbers, and a plan submitted with an unestimated task is
    -- a quotation with a hole in it.
    estimated_labour_hours numeric(6,2)
                     CHECK (estimated_labour_hours IS NULL OR estimated_labour_hours > 0),

    recorded_by      uuid,
    recorded_at      timestamptz NOT NULL DEFAULT now(),
    -- ⚠️ SEPARATE FROM `recorded_by`, and this closes a gap 012 left open on the
    -- findings: there, `recorded_by` was re-stamped on every edit, so the ORIGINAL
    -- hand survived only in the audit trail. Two columns, so both questions have an
    -- answer on the row itself: who first wrote this, and who last touched it.
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_plan_task_position UNIQUE (plan_id, position) DEFERRABLE INITIALLY DEFERRED,

    CONSTRAINT fk_task_plan_scope
        FOREIGN KEY (plan_id, tenant_id, organization_id)
        REFERENCES repair.repair_plans (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    -- Composite again. With MATCH SIMPLE (the default) a NULL `finding_id` skips
    -- the constraint entirely, which is what "a task need not address a fault"
    -- means; when one IS named, all three columns must match a real row.
    CONSTRAINT fk_task_finding_scope
        FOREIGN KEY (finding_id, tenant_id, organization_id)
        REFERENCES repair.diagnostic_findings (id, tenant_id, organization_id)
        -- RESTRICT: 013 permits a finding to be deleted while its diagnosis is
        -- OPEN. A plan can only exist against an APPROVED diagnosis, whose findings
        -- are already frozen by 012's trigger, so this can never actually fire —
        -- it is here so that if that ever changes, the failure is a refused delete
        -- rather than a plan task silently losing the fault it addressed.
        ON DELETE RESTRICT
);

-- Declared HERE, immediately after the table, because `repair_plan_resources`
-- below carries a composite FK to it — and a foreign key can only reference a
-- unique constraint that already exists. Adding it after that table is written is
-- an ERROR, not a re-ordering preference; it cost one failed apply.
ALTER TABLE repair.repair_plan_tasks
    DROP CONSTRAINT IF EXISTS uq_plan_tasks_id_tenant_org;
ALTER TABLE repair.repair_plan_tasks
    ADD CONSTRAINT uq_plan_tasks_id_tenant_org UNIQUE (id, tenant_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_plan_tasks_plan
    ON repair.repair_plan_tasks (plan_id, position);
CREATE INDEX IF NOT EXISTS idx_plan_tasks_tenant
    ON repair.repair_plan_tasks (tenant_id);
-- ⚠️ THE INDEX SLICE 9 EXISTS TO USE: every task addressing a given fault. The
-- quality-control question — "was the confirmed fault actually repaired" — is a
-- lookup on this column, and adding it later means adding it to a large table.
CREATE INDEX IF NOT EXISTS idx_plan_tasks_finding
    ON repair.repair_plan_tasks (finding_id)
    WHERE finding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plan_tasks_technician
    ON repair.repair_plan_tasks (assigned_technician_id)
    WHERE assigned_technician_id IS NOT NULL;

-- ── the resources: parts, consumables, tools, equipment ─────────────────────

CREATE TABLE IF NOT EXISTS repair.repair_plan_resources (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    plan_id          uuid NOT NULL,
    -- Optional: §29 lets the technician identify resources for the job as a whole
    -- (a lifting platform) or for one task (the caliper piston). Both are real, so
    -- neither is forced.
    task_id          uuid,
    position         integer NOT NULL,

    -- §29's nine kinds, collapsed to six columns' worth of vocabulary. `part` and
    -- `consumable` are kept distinct because the quotation treats them
    -- differently (§9 of the quotation flow lists "Parts" and "Consumables"
    -- separately); the four equipment kinds are kept distinct because §12's
    -- conflict check will need to ask about them separately when the registries
    -- exist.
    resource_kind    TEXT NOT NULL CHECK (resource_kind IN (
        'part', 'consumable', 'tool',
        'diagnostic_equipment', 'lifting_equipment', 'safety_equipment')),

    name             TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    -- A part number, an asset tag, a manufacturer reference. §24's Find Parts
    -- will write part numbers here.
    reference        TEXT,
    -- NUMERIC for the same reason the labour hours are: this is multiplied by a
    -- price. 0.5 litres of coolant is a real quantity, so it is not an integer.
    quantity         numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    -- "each", "litre", "metre", "set". Free text: a unit registry is inventory's
    -- job, not the plan's.
    unit             TEXT,
    note             TEXT,

    recorded_by      uuid,
    recorded_at      timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_plan_resource_position UNIQUE (plan_id, position) DEFERRABLE INITIALLY DEFERRED,

    CONSTRAINT fk_resource_plan_scope
        FOREIGN KEY (plan_id, tenant_id, organization_id)
        REFERENCES repair.repair_plans (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    -- MATCH SIMPLE again: a NULL `task_id` means "for the plan as a whole".
    -- CASCADE, because a resource attached to a task that is removed has nothing
    -- left to be attached to — and the alternative (orphaning it onto the plan)
    -- would silently change what the row means.
    CONSTRAINT fk_resource_task_scope
        FOREIGN KEY (task_id, tenant_id, organization_id)
        REFERENCES repair.repair_plan_tasks (id, tenant_id, organization_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plan_resources_plan
    ON repair.repair_plan_resources (plan_id, position);
CREATE INDEX IF NOT EXISTS idx_plan_resources_tenant
    ON repair.repair_plan_resources (tenant_id);
CREATE INDEX IF NOT EXISTS idx_plan_resources_task
    ON repair.repair_plan_resources (task_id)
    WHERE task_id IS NOT NULL;
-- What the storekeeper's parts list and §24's reservation flow will read.
CREATE INDEX IF NOT EXISTS idx_plan_resources_parts
    ON repair.repair_plan_resources (plan_id)
    WHERE resource_kind IN ('part', 'consumable');

-- ── a task may only address a CONFIRMED finding of ITS OWN plan's diagnosis ──
--
-- ⚠️ THE RULE A FOREIGN KEY CANNOT EXPRESS, so it is a trigger rather than a
-- comment asking callers to be careful. Two distinct failures are refused:
--
--   1. A finding belonging to ANOTHER job's diagnosis. The composite FK checks
--      the tenant and organisation, which is not the same question — two cars in
--      the same workshop are in the same organisation.
--   2. A `suspected` or `excluded` finding. `02.txt` §1290 draws that distinction
--      so downstream work can rely on it, and §25 says planning loads CONFIRMED
--      faults. A plan task against a suspected fault becomes a quotation line,
--      which is a customer charged for a guess.
--
-- Both are enforced in the service too. This is the layer that holds when a
-- future caller — an MCP tool, a later slice, a backfill script — writes the row
-- without going through it.
CREATE OR REPLACE FUNCTION repair.assert_task_finding_is_confirmed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    ok boolean;
BEGIN
    IF NEW.finding_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM repair.diagnostic_findings f
          JOIN repair.repair_plans p
            ON p.diagnosis_id = f.diagnosis_id
           AND p.tenant_id    = f.tenant_id
         WHERE f.id        = NEW.finding_id
           AND f.tenant_id = NEW.tenant_id
           AND p.id        = NEW.plan_id
           AND f.finding_status = 'confirmed'
    ) INTO ok;

    IF NOT ok THEN
        RAISE EXCEPTION
            'finding % cannot be addressed by a task on plan %: it must be a CONFIRMED finding of that plan''s own diagnosis',
            NEW.finding_id, NEW.plan_id
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_task_finding_confirmed ON repair.repair_plan_tasks;
CREATE TRIGGER trg_plan_task_finding_confirmed
    BEFORE INSERT OR UPDATE ON repair.repair_plan_tasks
    FOR EACH ROW
    EXECUTE FUNCTION repair.assert_task_finding_is_confirmed();

-- ── immutability once submitted ─────────────────────────────────────────────
--
-- Same reasoning and same shape as 012. A submitted plan is the proposal a
-- supervisor reviews and a quotation is priced from; editing it afterwards would
-- change what was approved and what the customer was charged for.
--
-- ⚠️ The header trigger must ALLOW the review transition — `submitted` →
-- `approved`/`rejected` is a write BY DESIGN, and a blanket "no changes once
-- submitted" would make §30-§31's review impossible.

CREATE OR REPLACE FUNCTION repair.reject_settled_plan_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status IN ('approved', 'rejected') THEN
        RAISE EXCEPTION
            'repair plan % is already reviewed and cannot be changed; record a new attempt instead', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD.status = 'submitted' AND NEW.status = 'in_progress' THEN
        RAISE EXCEPTION
            'repair plan % cannot return to in_progress; record a new attempt instead', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_repair_plans_immutable ON repair.repair_plans;
CREATE TRIGGER trg_repair_plans_immutable
    BEFORE UPDATE ON repair.repair_plans
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_settled_plan_change();

/*
 * The children freeze at SUBMISSION, not at review: the supervisor reviews what
 * was submitted, so the plan must not move underneath them.
 *
 * ONE function for both child tables. They differ only in which column names the
 * plan, and both call it `plan_id` — so a single function serves both triggers
 * and there is no second copy to drift.
 *
 * Both row versions are checked so a re-parenting UPDATE cannot escape by
 * pointing the row at another plan. On DELETE, NEW is unset — referencing a field
 * of it raises, hence the TG_OP guard.
 */
CREATE OR REPLACE FUNCTION repair.reject_settled_plan_child_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    blocked boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM repair.repair_plans
         WHERE status <> 'in_progress'
           AND id IN (
                 OLD.plan_id,
                 CASE WHEN TG_OP = 'DELETE' THEN OLD.plan_id ELSE NEW.plan_id END
               )
    ) INTO blocked;

    IF blocked THEN
        RAISE EXCEPTION
            'repair plan % is submitted and its contents cannot be changed', OLD.plan_id
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- A BEFORE DELETE TRIGGER MUST RETURN OLD. Returning NEW (NULL on a delete)
    -- does not refuse the delete loudly — it SKIPS the row silently and the caller
    -- sees a successful statement that deleted nothing. Slice 3a shipped that bug.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_tasks_immutable ON repair.repair_plan_tasks;
CREATE TRIGGER trg_plan_tasks_immutable
    BEFORE UPDATE OR DELETE ON repair.repair_plan_tasks
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_settled_plan_child_change();

DROP TRIGGER IF EXISTS trg_plan_resources_immutable ON repair.repair_plan_resources;
CREATE TRIGGER trg_plan_resources_immutable
    BEFORE UPDATE OR DELETE ON repair.repair_plan_resources
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_settled_plan_child_change();

-- ── row-level security ──────────────────────────────────────────────────────
-- ENABLE *and* FORCE on every table. Enable alone exempts the table owner, which
-- is the role the app connects as — isolation present and inert.

ALTER TABLE repair.repair_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.repair_plans FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.repair_plans;
CREATE POLICY tenant_isolation ON repair.repair_plans
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

ALTER TABLE repair.repair_plan_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.repair_plan_tasks FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.repair_plan_tasks;
CREATE POLICY tenant_isolation ON repair.repair_plan_tasks
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

ALTER TABLE repair.repair_plan_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.repair_plan_resources FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.repair_plan_resources;
CREATE POLICY tenant_isolation ON repair.repair_plan_resources
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- ⚠️ DELETE ON THE CHILDREN, GRANTED HERE RATHER THAN IN A LATER FIX-UP.
-- 012 revoked DELETE on the diagnosis findings and 013 had to give it back one
-- day later, because a technician who added a task in error had no way out: an
-- update can correct a typo but cannot remove a row, and a second attempt cannot
-- be started while one is open. The narrowing is the TRIGGER above — it refuses
-- every delete once the plan is submitted — and the grant is merely permission
-- to reach it. Writing the trigger and withholding the privilege is the
-- unreachable-alternative trap, three slices running.
--
-- The HEADER keeps its revoke: a plan that was started is a fact about the
-- workshop's day, and an attempt number that silently disappears is how attempt 3
-- comes to follow attempt 1.
GRANT SELECT, INSERT, UPDATE         ON repair.repair_plans           TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON repair.repair_plan_tasks      TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON repair.repair_plan_resources  TO autoworkshop_app;
REVOKE DELETE ON repair.repair_plans FROM autoworkshop_app;

COMMIT;
