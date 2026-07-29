-- ============================================================================
-- Migration 010 — initial inspection records (Phase 5, slice 3a)
--
-- `1.txt` §368 puts "Inspections" among the things Domain 5 must manage, and
-- §332 makes `initial_inspection` a lifecycle stage. Slice 2 gave the stage;
-- nothing recorded what was found there. A card could pass through initial
-- inspection and the system would hold no statement of the vehicle's condition —
-- which is the record every later stage reasons from (`2.txt` §557: "the
-- inspection findings should generate a diagnostic report and preliminary
-- quotation").
--
-- `07.txt` §2920-§2978 is the flow being implemented, and it is transcribed
-- rather than summarised:
--   §2926  "the application loads the relevant inspection checklist"
--   §2928  the 19 checkpoints, in the order the specification lists them
--   §2968  "the technician records: Pass. Fail. Requires testing. Not applicable."
--   §2978  "the technician adds notes, photographs, videos and measurements."
--
-- ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────
--
-- §2978's photographs and videos need object storage. MinIO runs in the compose
-- stack but nothing is wired to it, and a column that can hold a file reference
-- no code can produce would be a promise the product does not keep — the same
-- judgement T-0042 made about §537's voice notes. Evidence arrives with file
-- storage, in its own slice; the screen says so rather than showing a disabled
-- camera button.
--
-- ── WHY THE ITEMS ARE CREATED UP FRONT, NOT ON FIRST ANSWER ─────────────────
--
-- Starting an inspection writes all 19 rows with a NULL result. That makes the
-- record a statement of what was ASKED as well as what was answered: if the
-- checklist template later gains or loses a checkpoint, an inspection submitted
-- today still shows the 19 questions it actually posed. Storing only answers
-- would let a template edit silently rewrite the meaning of every historical
-- inspection — the record would say a brake check passed when no brake check was
-- ever on the sheet.
--
-- It also makes "is this inspection complete" a query rather than a comparison
-- against a moving template: any item with a NULL result is unanswered, and
-- `not_applicable` is one of the four answers precisely so that skipping a
-- checkpoint is an explicit, attributable statement.
--
-- ── ATTEMPTS, NOT EDITS ────────────────────────────────────────────────────
--
-- A submitted inspection is immutable, and a re-inspection is a NEW row with the
-- next `attempt_no`. `07.txt` §3046 has a diagnosis that may call for
-- "additional inspection required", and the lifecycle allows
-- `further_information_required → initial_inspection`, so second looks are
-- normal and expected. Recording one by overwriting the first would destroy the
-- evidence that the vehicle's condition CHANGED between them, which is the whole
-- content of a re-inspection.
--
-- Immutability is enforced by a TRIGGER as well as in the service, because the
-- grant-level trick used for `job_card_stage_events` cannot express it: this
-- table must accept UPDATEs while the inspection is in progress and refuse them
-- afterwards, which is a per-row rule no GRANT can carry.
-- ============================================================================

BEGIN;

-- ── the inspection header ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repair.inspections (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    job_card_id      uuid NOT NULL,

    -- `1.txt` §322's lifecycle is per-visit and so is an inspection. The second
    -- look at the same visit is attempt 2, not an edit of attempt 1.
    attempt_no       integer NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),

    status           TEXT NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress', 'submitted')),

    -- §2932 checks mileage. It is ALSO a checklist item (pass/fail — does the
    -- odometer agree with the record), and the reading itself is a number the
    -- rest of the system uses: service intervals, warranty limits, and the
    -- `mileage_at_intake` reception copied by hand at the door. Both, because
    -- they answer different questions.
    mileage_reading  integer CHECK (mileage_reading IS NULL
                                    OR (mileage_reading >= 0 AND mileage_reading <= 100000000)),

    -- §2978's notes. TEXT, never VARCHAR(n) — CLAUDE.md's schema rules, and the
    -- Solar truncation incident this repo inherited them from.
    summary          TEXT,

    started_by       uuid,
    started_at       timestamptz NOT NULL DEFAULT now(),

    -- §1292 (`02.txt`): "submit diagnosis for supervisor review where required".
    -- The submission of an inspection is the moment it becomes a finding of
    -- record, so who and when are part of the record, not metadata.
    submitted_by     uuid,
    submitted_at     timestamptz,
    CONSTRAINT submitted_has_when CHECK (
        (status = 'in_progress' AND submitted_at IS NULL AND submitted_by IS NULL)
        OR (status = 'submitted' AND submitted_at IS NOT NULL)
    ),

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- One attempt number per card. Two technicians starting a second inspection
    -- at the same moment would otherwise both compute 2, and the record would
    -- hold two different "attempt 2"s with no way to tell which the customer was
    -- shown. The unique constraint makes the loser retry instead.
    CONSTRAINT uq_inspection_attempt UNIQUE (job_card_id, attempt_no),

    -- A FOREIGN KEY CANNOT CARRY A TENANT PREDICATE — so this one is composite
    -- and does. Migration 009 added the unique key on the parent that makes this
    -- reference possible; without the composite form, nothing in the schema
    -- would require an inspection's tenant and organisation to be the ones its
    -- job card belongs to.
    CONSTRAINT fk_inspection_card_scope
        FOREIGN KEY (job_card_id, tenant_id, organization_id)
        REFERENCES repair.job_cards (id, tenant_id, organization_id)
        ON DELETE CASCADE
);

-- The composite parent key the items table needs to reference in turn.
ALTER TABLE repair.inspections
    DROP CONSTRAINT IF EXISTS uq_inspections_id_tenant_org;
ALTER TABLE repair.inspections
    ADD CONSTRAINT uq_inspections_id_tenant_org UNIQUE (id, tenant_id, organization_id);

-- "The inspections for this card, newest attempt first" is how both the screen
-- and the service read this table.
CREATE INDEX IF NOT EXISTS idx_inspections_card
    ON repair.inspections (job_card_id, attempt_no DESC);

-- CLAUDE.md §11 tenant baseline.
CREATE INDEX IF NOT EXISTS idx_inspections_tenant
    ON repair.inspections (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inspections_tenant_created
    ON repair.inspections (tenant_id, created_at DESC);
-- The manager's Inspection Queue (§47) is "this organisation's unfinished
-- inspections", which is a partial index rather than a scan of every inspection
-- the workshop has ever completed.
CREATE INDEX IF NOT EXISTS idx_inspections_open
    ON repair.inspections (organization_id, started_at DESC)
    WHERE status = 'in_progress';

-- ── the checklist items ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repair.inspection_items (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    inspection_id    uuid NOT NULL,

    -- The checkpoint this row asked about. TEXT rather than an enum type: the
    -- checklist is described by §2926 as "the RELEVANT inspection checklist", and
    -- `2.txt` §555 calls the checklists CONFIGURABLE. A Postgres enum would make
    -- adding a checkpoint a migration; the value is validated against the
    -- transcribed list in `inspection-checklist.ts` on the way in.
    checkpoint_code  TEXT NOT NULL,

    -- The display order AS ASKED, stored rather than derived. If the template is
    -- reordered or a checkpoint retired, a historical inspection still renders in
    -- the order the technician worked through it.
    position         integer NOT NULL,

    -- NULL until answered. §2968's four answers and no others — and `pass` is
    -- not the default, because a checklist that starts out all-passed is a
    -- record of nothing that reads as a clean bill of health.
    result           TEXT CHECK (result IS NULL OR result IN
                        ('pass', 'fail', 'requires_testing', 'not_applicable')),

    note             TEXT,

    recorded_by      uuid,
    recorded_at      timestamptz,
    -- A result and its attribution travel together: a row cannot claim an answer
    -- with nobody behind it, which is what §2968's "the technician records" means
    -- when the record is later disputed.
    CONSTRAINT result_has_recorder CHECK (
        (result IS NULL AND recorded_at IS NULL AND recorded_by IS NULL)
        OR (result IS NOT NULL AND recorded_at IS NOT NULL AND recorded_by IS NOT NULL)
    ),

    -- One row per checkpoint per inspection. Without this a checkpoint could be
    -- answered twice, and "the brakes" would have two contradictory results with
    -- no rule for which one the quotation is built from.
    CONSTRAINT uq_inspection_item UNIQUE (inspection_id, checkpoint_code),

    CONSTRAINT fk_inspection_item_scope
        FOREIGN KEY (inspection_id, tenant_id, organization_id)
        REFERENCES repair.inspections (id, tenant_id, organization_id)
        ON DELETE CASCADE
);

-- The checklist is always read whole, in order.
CREATE INDEX IF NOT EXISTS idx_inspection_items_sheet
    ON repair.inspection_items (inspection_id, position);

CREATE INDEX IF NOT EXISTS idx_inspection_items_tenant
    ON repair.inspection_items (tenant_id);

-- `2.txt` §557 has the findings driving the diagnostic report and the
-- preliminary quotation, and what drives them is the failures. A partial index
-- keeps "what did this inspection actually find" cheap.
CREATE INDEX IF NOT EXISTS idx_inspection_items_faults
    ON repair.inspection_items (inspection_id)
    WHERE result IN ('fail', 'requires_testing');

-- ── a submitted inspection is immutable ─────────────────────────────────────
--
-- Not expressible as a GRANT: the table must accept UPDATEs while the
-- inspection is in progress and refuse them once it is submitted. Not
-- expressible as a CHECK either — a CHECK cannot see the previous value of the
-- row, nor the parent's status.
--
-- ⚠️ THIS IS THE SLICE-2 LESSON APPLIED. There, `GRANT SELECT, INSERT` LOOKED
-- append-only while the table stayed fully mutable, because a default privilege
-- had already granted UPDATE. The rule is proven by EFFECT after applying —
-- a real UPDATE against a submitted inspection must be refused — never by
-- reading this file back.

CREATE OR REPLACE FUNCTION repair.reject_submitted_inspection_change()
RETURNS trigger
LANGUAGE plpgsql
-- No SECURITY DEFINER: this function decides nothing about who you are, it only
-- refuses a write. Running it as the caller keeps it out of the privilege
-- surface entirely.
AS $$
BEGIN
    IF OLD.status = 'submitted' THEN
        RAISE EXCEPTION
            'inspection % is submitted and cannot be changed; record a new attempt instead', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inspections_immutable ON repair.inspections;
CREATE TRIGGER trg_inspections_immutable
    BEFORE UPDATE ON repair.inspections
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_submitted_inspection_change();

CREATE OR REPLACE FUNCTION repair.reject_submitted_inspection_item_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    blocked boolean;
BEGIN
    -- Both row versions are considered, so a re-parenting UPDATE cannot escape
    -- the check by pointing the row at a different inspection: if EITHER the
    -- inspection it belongs to or the one it is being moved to is submitted, the
    -- write is refused.
    --
    -- On DELETE, `NEW` is unset — referencing a field of it would raise. The
    -- CASE guards on TG_OP rather than on NEW being null, because in plpgsql
    -- `NEW.inspection_id` on a DELETE trigger is an error, not a NULL.
    SELECT EXISTS (
        SELECT 1 FROM repair.inspections
         WHERE status = 'submitted'
           AND id IN (
                 OLD.inspection_id,
                 CASE WHEN TG_OP = 'DELETE' THEN OLD.inspection_id ELSE NEW.inspection_id END
               )
    ) INTO blocked;

    IF blocked THEN
        RAISE EXCEPTION
            'inspection % is submitted and its checklist cannot be changed', OLD.inspection_id
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- ⚠️ A BEFORE DELETE TRIGGER MUST RETURN `OLD` TO ALLOW THE DELETE. Returning
    -- NEW — which is NULL on a delete — does not refuse it loudly; it SKIPS the
    -- row silently, and the caller sees a successful statement that deleted
    -- nothing. That is the "mechanism reads correct while being inert" failure
    -- this repo keeps paying for, so it is spelled out rather than assumed.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inspection_items_immutable ON repair.inspection_items;
CREATE TRIGGER trg_inspection_items_immutable
    BEFORE UPDATE OR DELETE ON repair.inspection_items
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_submitted_inspection_item_change();

-- ── row-level security ──────────────────────────────────────────────────────
-- ENABLE *and* FORCE. Enable alone exempts the table owner, which is the role
-- the app connects as — the isolation would be present and inert, the mistake
-- migration 002 paid for and A6 in the Solar register still records.

ALTER TABLE repair.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.inspections FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.inspections;
CREATE POLICY tenant_isolation ON repair.inspections
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

ALTER TABLE repair.inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.inspection_items FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.inspection_items;
CREATE POLICY tenant_isolation ON repair.inspection_items
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- ── grants ──────────────────────────────────────────────────────────────────
-- UPDATE is granted here, unlike `job_card_stage_events`: an in-progress
-- inspection is worked on over a shift. The trigger above is what stops the
-- write once it is submitted. DELETE is not granted on either table — a
-- mistaken inspection is superseded by the next attempt, never erased.
GRANT SELECT, INSERT, UPDATE ON repair.inspections      TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON repair.inspection_items TO autoworkshop_app;
REVOKE DELETE ON repair.inspections      FROM autoworkshop_app;
REVOKE DELETE ON repair.inspection_items FROM autoworkshop_app;

COMMIT;
