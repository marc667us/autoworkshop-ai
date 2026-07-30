-- ============================================================================
-- Migration 012 — diagnosis records (Phase 5, slice 3b)
--
-- `1.txt` §370-§376 puts "Diagnostic observations", "Fault codes",
-- "Measurements" and "Technician notes" in Domain 5. Slice 3a gave
-- `initial_inspection` content; `diagnosis_in_progress` is still a stage a card
-- can reach and record nothing at.
--
-- Transcribed, not paraphrased:
--   `07.txt` §3026-§3046 — what the technician shall be able to record:
--     fault code · fault description · affected system · observed symptom ·
--     test performed · expected result · actual result · interpretation ·
--     confirmed fault · additional inspection required
--   `02.txt` §1290 — "identify CONFIRMED, SUSPECTED and EXCLUDED faults"
--   `02.txt` §1294 — "the system shall preserve the distinction between AI
--     SUGGESTIONS and TECHNICIAN-CONFIRMED findings"
--   `02.txt` §1292 — "submit diagnosis for supervisor review where required"
--
-- ── §1294 IS A SCHEMA RULE HERE, NOT A UI RULE ─────────────────────────────
--
-- There is no AI in this build — Phase 8 brings it. The `source` column and the
-- constraint below land NOW anyway, because "preserve the distinction" is not
-- something that can be added later without rewriting history: once findings
-- exist with no source, no migration can say which of them a machine proposed.
--
-- The distinction is made structural rather than advisory. A finding is
-- `confirmed` ONLY if a human is named against it (`confirmed_by`). So an AI
-- suggestion cannot BECOME a confirmed fault by an UPDATE that flips a status —
-- somebody has to sign it, and the row records who. That is the difference
-- between a system that preserves the distinction and one that merely displays
-- it.
--
-- ── §563's INDEPENDENCE, APPLIED TO REVIEW ─────────────────────────────────
--
-- §1292's supervisor review is implemented, not deferred, because a diagnosis
-- nobody signs off is exactly where an unreviewed machine suggestion would leak
-- into a customer quotation. The reviewer may not be the person who submitted it
-- — enforced in the service, and the row keeps both names so the claim is
-- auditable rather than assumed.
--
-- Shape copied wholesale from slice 3a (010): header + child rows written in one
-- transaction, attempts rather than edits, immutable once submitted, composite
-- foreign keys carrying the tenant predicate a plain key cannot.
-- ============================================================================

BEGIN;

-- ── the diagnosis header ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repair.diagnoses (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    job_card_id      uuid NOT NULL,
    attempt_no       integer NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),

    -- `submitted` is the technician's statement; `approved`/`rejected` are the
    -- supervisor's answer to it (§1292). A rejected diagnosis is NOT reopened —
    -- like a submitted inspection it stays as the record of what was claimed, and
    -- the next look is a new attempt. Reopening would erase the disagreement,
    -- which is the one thing a review exists to record.
    status           TEXT NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress', 'submitted', 'approved', 'rejected')),

    -- §3042's interpretation at the level of the whole diagnosis, and §376's
    -- technician notes. TEXT, never VARCHAR(n).
    summary          TEXT,

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

    -- A submitted diagnosis names who submitted it and when — the lesson
    -- migration 011 paid for on inspections, applied up front here rather than
    -- discovered by review a second time.
    CONSTRAINT diagnosis_submitted_attributed CHECK (
        status = 'in_progress'
        OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL)
    ),
    -- ...and a reviewed one names its reviewer. A rejection with nobody behind it
    -- is not a review.
    CONSTRAINT diagnosis_reviewed_attributed CHECK (
        status IN ('in_progress', 'submitted')
        OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
    ),
    -- A rejection must say why. An approval need not — "it is correct" adds
    -- nothing — but a technician told only "rejected" cannot act on it.
    CONSTRAINT diagnosis_rejection_has_reason CHECK (
        status <> 'rejected'
        OR (review_note IS NOT NULL AND length(btrim(review_note)) > 0)
    ),

    CONSTRAINT uq_diagnosis_attempt UNIQUE (job_card_id, attempt_no),

    -- A FOREIGN KEY CANNOT CARRY A TENANT PREDICATE, so this one is composite and
    -- does. Relies on 009's unique key on the parent.
    CONSTRAINT fk_diagnosis_card_scope
        FOREIGN KEY (job_card_id, tenant_id, organization_id)
        REFERENCES repair.job_cards (id, tenant_id, organization_id)
        ON DELETE CASCADE
);

ALTER TABLE repair.diagnoses
    DROP CONSTRAINT IF EXISTS uq_diagnoses_id_tenant_org;
ALTER TABLE repair.diagnoses
    ADD CONSTRAINT uq_diagnoses_id_tenant_org UNIQUE (id, tenant_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_diagnoses_card
    ON repair.diagnoses (job_card_id, attempt_no DESC);
CREATE INDEX IF NOT EXISTS idx_diagnoses_tenant
    ON repair.diagnoses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_tenant_created
    ON repair.diagnoses (tenant_id, created_at DESC);
-- The supervisor's review queue (§1292) — submitted and not yet answered.
CREATE INDEX IF NOT EXISTS idx_diagnoses_awaiting_review
    ON repair.diagnoses (organization_id, submitted_at DESC)
    WHERE status = 'submitted';

-- ── the findings ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repair.diagnostic_findings (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    diagnosis_id     uuid NOT NULL,
    position         integer NOT NULL,

    -- §3028. NULLABLE on purpose: plenty of real faults have no diagnostic
    -- trouble code — a wheel bearing does not set a DTC. Requiring one would
    -- push technicians into inventing codes, which is worse than an empty column.
    fault_code       TEXT,
    -- §3030. The one field that must be present: a finding with no description is
    -- not a finding.
    fault_description TEXT NOT NULL CHECK (length(btrim(fault_description)) > 0),

    -- §3032. Constrained to `08.txt` §9's Fault Condition Library categories, so
    -- findings can later be indexed against that library rather than matched on
    -- free text. TEXT + CHECK rather than an enum type: adding a category should
    -- not require a type migration.
    affected_system  TEXT NOT NULL CHECK (affected_system IN (
        'electrical', 'sensor_actuator', 'network_module',
        'mechanical', 'fluid_thermal', 'other')),

    observed_symptom TEXT,                 -- §3034
    test_performed   TEXT,                 -- §3036
    expected_result  TEXT,                 -- §3038
    actual_result    TEXT,                 -- §3040
    interpretation   TEXT,                 -- §3042

    -- §1290 — confirmed, suspected, excluded. NOT NULL: a finding with no
    -- standing is the ambiguity this column exists to remove, and `suspected` is
    -- the honest default for a diagnosis in progress.
    finding_status   TEXT NOT NULL DEFAULT 'suspected'
                     CHECK (finding_status IN ('confirmed', 'suspected', 'excluded')),

    -- §1294. `technician` today; `ai_suggestion` is what Phase 8 will write.
    source           TEXT NOT NULL DEFAULT 'technician'
                     CHECK (source IN ('technician', 'ai_suggestion')),

    -- §3044's "confirmed fault", expressed as attribution rather than a second
    -- boolean beside `finding_status` — two columns meaning the same thing is two
    -- places for them to disagree.
    confirmed_by     uuid,
    confirmed_at     timestamptz,
    -- ⚠️ THE §1294 RULE, MADE STRUCTURAL. A finding is `confirmed` only if a human
    -- is named against it. So an AI suggestion cannot become a confirmed fault by
    -- flipping a status — and a confirmed fault can always answer "who says so".
    CONSTRAINT finding_confirmed_is_attributed CHECK (
        finding_status <> 'confirmed'
        OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
    ),

    -- §3046
    additional_inspection_required boolean NOT NULL DEFAULT false,

    recorded_by      uuid,
    recorded_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_finding_diagnosis_scope
        FOREIGN KEY (diagnosis_id, tenant_id, organization_id)
        REFERENCES repair.diagnoses (id, tenant_id, organization_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_findings_diagnosis
    ON repair.diagnostic_findings (diagnosis_id, position);
CREATE INDEX IF NOT EXISTS idx_findings_tenant
    ON repair.diagnostic_findings (tenant_id);
-- What the repair plan and the quotation are built from: the confirmed faults.
CREATE INDEX IF NOT EXISTS idx_findings_confirmed
    ON repair.diagnostic_findings (diagnosis_id)
    WHERE finding_status = 'confirmed';
-- Fault-code lookup across a tenant's history — the seed of `07.txt` §17's
-- knowledge base, and cheap to add now.
CREATE INDEX IF NOT EXISTS idx_findings_fault_code
    ON repair.diagnostic_findings (tenant_id, fault_code)
    WHERE fault_code IS NOT NULL;

-- ── immutability once submitted ─────────────────────────────────────────────
--
-- Same reasoning and same shape as 010. A submitted diagnosis is the claim a
-- supervisor reviewed; editing it afterwards would change what was approved.
--
-- ⚠️ The header trigger must ALLOW the review transition — `submitted` →
-- `approved`/`rejected` is a write BY DESIGN, and a blanket "no changes once
-- submitted" would make §1292's review impossible. So the header rule is
-- narrower than the inspection one: no changes once REVIEWED, and from
-- `submitted` only the review columns may move.

CREATE OR REPLACE FUNCTION repair.reject_settled_diagnosis_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status IN ('approved', 'rejected') THEN
        RAISE EXCEPTION
            'diagnosis % is already reviewed and cannot be changed; record a new attempt instead', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- From `submitted`, only the review may proceed. Blocking a change of the
    -- findings' parent status back to in_progress is what stops a submitted
    -- diagnosis being quietly reopened, edited, and re-submitted as though it had
    -- never been seen.
    IF OLD.status = 'submitted' AND NEW.status = 'in_progress' THEN
        RAISE EXCEPTION
            'diagnosis % cannot return to in_progress; record a new attempt instead', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_diagnoses_immutable ON repair.diagnoses;
CREATE TRIGGER trg_diagnoses_immutable
    BEFORE UPDATE ON repair.diagnoses
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_settled_diagnosis_change();

CREATE OR REPLACE FUNCTION repair.reject_settled_finding_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    blocked boolean;
BEGIN
    -- Findings freeze at SUBMISSION, not at review: the supervisor reviews what
    -- was submitted, so the evidence must not move underneath them.
    --
    -- Both row versions are checked so a re-parenting UPDATE cannot escape by
    -- pointing the row at another diagnosis. On DELETE, `NEW` is unset —
    -- referencing a field of it raises, hence the TG_OP guard.
    SELECT EXISTS (
        SELECT 1 FROM repair.diagnoses
         WHERE status <> 'in_progress'
           AND id IN (
                 OLD.diagnosis_id,
                 CASE WHEN TG_OP = 'DELETE' THEN OLD.diagnosis_id ELSE NEW.diagnosis_id END
               )
    ) INTO blocked;

    IF blocked THEN
        RAISE EXCEPTION
            'diagnosis % is submitted and its findings cannot be changed', OLD.diagnosis_id
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- ⚠️ A BEFORE DELETE TRIGGER MUST RETURN `OLD`. Returning NEW (NULL on a
    -- delete) does not refuse the delete loudly — it SKIPS the row silently and
    -- the caller sees a successful statement that deleted nothing. Spelled out
    -- because slice 3a shipped this bug and caught it only by attempting a real
    -- DELETE.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_findings_immutable ON repair.diagnostic_findings;
CREATE TRIGGER trg_findings_immutable
    BEFORE UPDATE OR DELETE ON repair.diagnostic_findings
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_settled_finding_change();

-- ── row-level security ──────────────────────────────────────────────────────
-- ENABLE *and* FORCE. Enable alone exempts the table owner, which is the role the
-- app connects as — isolation present and inert.

ALTER TABLE repair.diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.diagnoses FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.diagnoses;
CREATE POLICY tenant_isolation ON repair.diagnoses
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

ALTER TABLE repair.diagnostic_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.diagnostic_findings FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.diagnostic_findings;
CREATE POLICY tenant_isolation ON repair.diagnostic_findings
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- ── grants ──────────────────────────────────────────────────────────────────
-- UPDATE granted because a diagnosis is worked on over a shift and then reviewed;
-- the triggers above are what stop the write once it is settled. DELETE withheld
-- on both — a mistaken diagnosis is superseded by a new attempt, never erased.
GRANT SELECT, INSERT, UPDATE ON repair.diagnoses           TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE ON repair.diagnostic_findings TO autoworkshop_app;
REVOKE DELETE ON repair.diagnoses           FROM autoworkshop_app;
REVOKE DELETE ON repair.diagnostic_findings FROM autoworkshop_app;

COMMIT;
