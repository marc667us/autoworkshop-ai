-- ============================================================================
-- Migration 017 — repair proposals: versioning and electronic approval
-- (Phase 5, slice 6 — the Solution Studio)
--
-- `1.txt` §396-§424 is DOMAIN 6, "Solution simulation, quotation and customer
-- agreement". `07.txt` §7 is the CUSTOMER APPROVAL FLOW.
--
-- Transcribed, not paraphrased:
--   `1.txt` §424 — "APPROVED PROPOSALS SHALL BE IMMUTABLE. A MATERIAL CHANGE
--     SHALL CREATE A NEW VERSION REQUIRING NEW APPROVAL."
--   `1.txt` §410-§422 — the customer shall be shown: what was reported · what
--     was inspected · what was confirmed · WHAT REMAINS SUSPECTED · what work is
--     proposed · what parts are proposed · what the work should achieve · what it
--     will cost · how long it should take · what warranty applies · WHAT
--     UNCERTAINTIES REMAIN
--   `1.txt` §398-§402 — minimum, recommended and comprehensive repair options
--   `07.txt` §7 — the customer may Approve Full · Approve Selected Items ·
--     Reject · Request Modification · Request Explanation · Request Alternative
--     Parts · Request Voice/Video Consultation. "Repair work shall not start
--     until the required approval is received."
--
-- ── ONE TABLE, BECAUSE EVERYTHING ELSE ALREADY EXISTS AND IS FROZEN ────────
--
-- Ten of the twelve things §410-§422 says the customer must be shown are ALREADY
-- recorded, and every one of them is already immutable at the point a proposal is
-- issued:
--
--   what was reported      → job_cards.complaint
--   what was inspected     → inspections (frozen on submission, 010)
--   what was confirmed     → diagnostic_findings where status = confirmed (012)
--   WHAT REMAINS SUSPECTED → the same table where status = suspected
--   what work is proposed  → repair_plan_tasks of the approved plan (014)
--   what parts are proposed→ repair_plan_resources / quotation_lines (014, 016)
--   what it will cost      → the approved quotation's totals (016)
--   how long it should take→ sum of the plan's estimated labour hours
--   what warranty applies  → quotations.warranty_terms
--
-- Copying any of it onto this table would create a second version of a fact that
-- can already never change, and a second thing to keep in step. So the proposal
-- stores only what is genuinely NEW: the narrative a customer needs (§418's
-- expected result, §422's risks and uncertainties), the VERSION, and the DECISION.
--
-- ⚠️ THE ONE EXCEPTION IS DELIBERATE. `quotation_id` is NOT NULL and frozen, so
-- "what it will cost" resolves to the exact document that was shown. Reading "the
-- current quotation" instead would let an approved proposal silently re-price.
--
-- ── §398-§402's THREE OPTIONS ARE ALREADY MODELLED ─────────────────────────
--
-- Slice 5 gave every quotation line an `is_optional` flag, with optional lines
-- excluded from the total. That IS the tiering:
--   · MINIMUM / RECOMMENDED — the chargeable lines, `quotations.subtotal`
--   · COMPREHENSIVE         — plus the optional lines, `optionalTotal`
-- So `approved_option` records WHICH of those the customer agreed to, and §7's
-- "Approve Selected Items" is `comprehensive` vs `recommended` rather than a
-- second pricing model nobody could reconcile with the first.
--
-- ── WHAT THIS SLICE DOES NOT BUILD, NAMED (CLAUDE.md §4) ───────────────────
--
--   · The 3D repair simulation (spec 08 §14 steps 9-18, `1.txt` §404-§408's
--     before-and-after presentation and repair-stage animation) is Phase 10 plus
--     the new Phase 12. It consumes confirmed diagnostic data and the Phase 9
--     library; building it now means building against fixtures.
--   · Audio explanation and recorded video presentation (§420) need media
--     storage; MinIO is running but no upload path exists yet.
--   · §7's voice and video consultation requests are recorded as a DECISION
--     REASON with a channel, not as a call. The signalling stack is its own work.
--   · The customer's own self-service screen is `customer-web`. This slice gives
--     the workshop the record and lets reception capture a decision taken by
--     phone or in person — which §7 requires anyway, since it offers voice and
--     video channels. A portal decision writes the SAME row through the same
--     service.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS repair.repair_proposals (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    job_card_id      uuid NOT NULL,
    -- The approved quotation this proposal presents. NOT NULL and frozen — see the
    -- header note: it is what makes "what it will cost" answerable forever.
    quotation_id     uuid NOT NULL,

    -- §424's VERSION. Not `attempt_no` like its siblings, because the specification
    -- uses the word "version" and means something slightly different: an attempt is
    -- another try at the same question, a version is a REVISED OFFER after the
    -- customer has seen the last one.
    version_no       integer NOT NULL DEFAULT 1 CHECK (version_no >= 1),

    -- `draft`   — being written, not yet shown to anybody
    -- `issued`  — presented to the customer; §7's decision is now awaited
    -- `approved` / `declined` / `changes_requested` — §7's outcomes
    -- `superseded` — a later version replaced this one (§424's material change)
    status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'issued', 'approved', 'declined',
                                       'changes_requested', 'superseded')),

    -- §418 — "what the work should achieve".
    expected_result  TEXT,
    -- §422 — "what uncertainties remain". A SEPARATE column from the risks, because
    -- they are different statements: a risk is what might go wrong with the work, an
    -- uncertainty is what the workshop does not yet know. Collapsing them lets the
    -- second quietly disappear, and §422 names it explicitly.
    risk_and_limitations TEXT,
    uncertainties    TEXT,
    -- Anything else the customer is told. Free text by design.
    presentation_note TEXT,

    issued_by        uuid,
    issued_at        timestamptz,

    -- ── §7's DECISION, and the electronic approval record ────────────────
    --
    -- ⚠️ `decided_by_name` IS TEXT, NOT A USER ID, AND THAT IS THE POINT. The
    -- person approving is the CUSTOMER, who in this build has no account of their
    -- own on the workshop side — and §7 offers voice and video channels, so the
    -- decision frequently arrives by telephone. A foreign key to `identity.users`
    -- would force reception to record their own id as the approver, which is
    -- exactly the attribution error an approval record exists to prevent.
    -- `recorded_by` below is the staff member who CAPTURED it; the two are
    -- different facts and both are kept.
    decision         TEXT CHECK (decision IN ('approved', 'declined', 'changes_requested')),
    -- Which of §398-§402's tiers was agreed. NULL unless approved.
    approved_option  TEXT CHECK (approved_option IN ('recommended', 'comprehensive')),
    decided_at       timestamptz,
    decided_by_name  TEXT,
    -- How the decision reached the workshop. §7 lists the channels; recording it is
    -- what makes a disputed approval investigable.
    decision_channel TEXT CHECK (decision_channel IN (
        'in_person', 'telephone', 'email', 'sms', 'customer_portal')),
    decision_note    TEXT,
    -- The staff member who captured a decision taken off-system. NULL when the
    -- customer approved through the portal themselves.
    recorded_by      uuid,

    -- §424 — the version that replaced this one.
    superseded_by    uuid,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- An issued proposal names who issued it and when.
    CONSTRAINT proposal_issued_attributed CHECK (
        status = 'draft' OR (issued_at IS NOT NULL AND issued_by IS NOT NULL)
    ),
    -- ⚠️ A DECIDED PROPOSAL MUST NAME THE PERSON, THE TIME AND THE CHANNEL. An
    -- approval with nobody behind it is not an approval — and this is the record a
    -- workshop relies on when a customer says "I never agreed to that".
    CONSTRAINT proposal_decision_attributed CHECK (
        status IN ('draft', 'issued', 'superseded')
        OR (decision IS NOT NULL
            AND decided_at IS NOT NULL
            AND decision_channel IS NOT NULL
            AND decided_by_name IS NOT NULL
            AND length(btrim(decided_by_name)) > 0)
    ),
    -- The status and the decision cannot disagree. Two columns saying one thing is
    -- two places for them to drift, so the constraint pins them together.
    CONSTRAINT proposal_status_matches_decision CHECK (
        (status = 'approved'          AND decision = 'approved')
        OR (status = 'declined'          AND decision = 'declined')
        OR (status = 'changes_requested' AND decision = 'changes_requested')
        OR (status IN ('draft', 'issued', 'superseded') AND decision IS NULL)
    ),
    -- An option is agreed only when something was approved.
    CONSTRAINT proposal_option_only_when_approved CHECK (
        approved_option IS NULL OR status = 'approved'
    ),
    -- A declined proposal or one sent back must say why: §7's "request
    -- modification" and "request explanation" ARE that sentence, and without it the
    -- workshop has nothing to act on.
    CONSTRAINT proposal_negative_has_reason CHECK (
        status NOT IN ('declined', 'changes_requested')
        OR (decision_note IS NOT NULL AND length(btrim(decision_note)) > 0)
    ),

    CONSTRAINT uq_proposal_version UNIQUE (job_card_id, version_no),

    CONSTRAINT fk_proposal_card_scope
        FOREIGN KEY (job_card_id, tenant_id, organization_id)
        REFERENCES repair.job_cards (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_proposal_quotation_scope
        FOREIGN KEY (quotation_id, tenant_id, organization_id)
        REFERENCES repair.quotations (id, tenant_id, organization_id)
        -- RESTRICT: a quotation cannot be deleted anyway (016 revoked DELETE), and
        -- if that changed, taking the proposal with it would erase the record of
        -- what a customer agreed to.
        ON DELETE RESTRICT
);

ALTER TABLE repair.repair_proposals
    DROP CONSTRAINT IF EXISTS uq_repair_proposals_id_tenant_org;
ALTER TABLE repair.repair_proposals
    ADD CONSTRAINT uq_repair_proposals_id_tenant_org UNIQUE (id, tenant_id, organization_id);

-- Declared after the unique key it cites — a self-referencing FK is still a FK.
ALTER TABLE repair.repair_proposals
    DROP CONSTRAINT IF EXISTS fk_proposal_superseded_by;
ALTER TABLE repair.repair_proposals
    ADD CONSTRAINT fk_proposal_superseded_by
        FOREIGN KEY (superseded_by, tenant_id, organization_id)
        REFERENCES repair.repair_proposals (id, tenant_id, organization_id)
        ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_proposals_card
    ON repair.repair_proposals (job_card_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_tenant
    ON repair.repair_proposals (tenant_id);
CREATE INDEX IF NOT EXISTS idx_proposals_quotation
    ON repair.repair_proposals (quotation_id);
-- The "waiting on the customer" queue — §7's whole point, and what the workshop
-- dashboard's `workshop.proposals.pendingApproval` counter reads.
CREATE INDEX IF NOT EXISTS idx_proposals_awaiting_customer
    ON repair.repair_proposals (organization_id, issued_at DESC)
    WHERE status = 'issued';

-- ── §424: an approved proposal is IMMUTABLE ─────────────────────────────────
--
-- The strongest immutability rule in this codebase so far, and the specification
-- states it in as many words. Its siblings freeze at SUBMISSION because an
-- internal reviewer must see a stable record; this freezes at DECISION because a
-- CUSTOMER acted on it, and changing what they agreed to after the fact is the
-- thing §424 exists to forbid.
--
-- ⚠️ ONE FIELD REMAINS WRITABLE ON A DECIDED PROPOSAL: `superseded_by`. §424 says
-- a material change creates a NEW VERSION, and the old row has to be able to point
-- at it — otherwise recording the supersession would require breaking the very
-- immutability that makes versioning necessary. Everything else is refused.

CREATE OR REPLACE FUNCTION repair.reject_decided_proposal_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status IN ('approved', 'declined', 'changes_requested', 'superseded') THEN
        -- The narrow, deliberate exception. Compared field by field rather than by
        -- trusting the caller to touch only this one.
        IF NEW.status IS DISTINCT FROM OLD.status
           AND NOT (OLD.status <> 'superseded' AND NEW.status = 'superseded') THEN
            RAISE EXCEPTION
                'proposal % has been decided and cannot be changed; §424 requires a new VERSION for a material change', OLD.id
                USING ERRCODE = 'restrict_violation';
        END IF;

        IF NEW.quotation_id      IS DISTINCT FROM OLD.quotation_id
           OR NEW.job_card_id    IS DISTINCT FROM OLD.job_card_id
           OR NEW.version_no     IS DISTINCT FROM OLD.version_no
           OR NEW.decision       IS DISTINCT FROM OLD.decision
           OR NEW.approved_option IS DISTINCT FROM OLD.approved_option
           OR NEW.decided_at     IS DISTINCT FROM OLD.decided_at
           OR NEW.decided_by_name IS DISTINCT FROM OLD.decided_by_name
           OR NEW.decision_channel IS DISTINCT FROM OLD.decision_channel
           OR NEW.decision_note  IS DISTINCT FROM OLD.decision_note
           OR NEW.expected_result IS DISTINCT FROM OLD.expected_result
           OR NEW.risk_and_limitations IS DISTINCT FROM OLD.risk_and_limitations
           OR NEW.uncertainties  IS DISTINCT FROM OLD.uncertainties
           OR NEW.presentation_note IS DISTINCT FROM OLD.presentation_note THEN
            RAISE EXCEPTION
                'proposal % has been decided; what the customer agreed to cannot be edited (§424)', OLD.id
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
    END IF;

    -- An ISSUED proposal is in front of the customer. Its content freezes there too
    -- — a proposal that changes while somebody is reading it is a different offer
    -- from the one they will say yes to.
    IF OLD.status = 'issued' THEN
        IF NEW.expected_result IS DISTINCT FROM OLD.expected_result
           OR NEW.risk_and_limitations IS DISTINCT FROM OLD.risk_and_limitations
           OR NEW.uncertainties IS DISTINCT FROM OLD.uncertainties
           OR NEW.presentation_note IS DISTINCT FROM OLD.presentation_note
           OR NEW.quotation_id IS DISTINCT FROM OLD.quotation_id THEN
            RAISE EXCEPTION
                'proposal % has been issued to the customer and its content cannot be changed; issue a new version', OLD.id
                USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.status = 'draft' THEN
            RAISE EXCEPTION
                'proposal % cannot return to draft once issued', OLD.id
                USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;

    -- The identity columns are write-once at every status — 015's lesson, applied
    -- in the migration that creates the table rather than in a fix-up the next day.
    IF NEW.job_card_id IS DISTINCT FROM OLD.job_card_id
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION
            'proposal % cannot change its identity columns', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposals_immutable ON repair.repair_proposals;
CREATE TRIGGER trg_proposals_immutable
    BEFORE UPDATE ON repair.repair_proposals
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_decided_proposal_change();

-- ── a proposal may only present an APPROVED quotation ───────────────────────
--
-- The rule a foreign key cannot express. Presenting a DRAFT price to a customer is
-- showing them a figure the workshop has not agreed internally (§5), and presenting
-- a REJECTED one is showing a price a manager refused. Enforced in the service too;
-- this is the layer that holds for any future caller.
CREATE OR REPLACE FUNCTION repair.assert_proposal_quotation_approved()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_status text;
BEGIN
    SELECT status INTO v_status
      FROM repair.quotations
     WHERE id = NEW.quotation_id AND tenant_id = NEW.tenant_id;

    IF v_status IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION
            'proposal % cannot present quotation %: it is % rather than approved',
            NEW.id, NEW.quotation_id, COALESCE(v_status, 'missing')
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposal_quotation_approved ON repair.repair_proposals;
CREATE TRIGGER trg_proposal_quotation_approved
    BEFORE INSERT ON repair.repair_proposals
    FOR EACH ROW
    EXECUTE FUNCTION repair.assert_proposal_quotation_approved();

-- ── row-level security ──────────────────────────────────────────────────────
-- ENABLE *and* FORCE. Enable alone exempts the table owner, which is the role the
-- app connects as — isolation present and inert.

ALTER TABLE repair.repair_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.repair_proposals FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON repair.repair_proposals;
CREATE POLICY tenant_isolation ON repair.repair_proposals
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- DELETE withheld entirely, and unlike its siblings there is no child table to
-- grant it on. A proposal is an OFFER MADE TO A CUSTOMER; even an unissued draft is
-- a fact about what the workshop was about to say. §424's answer to a wrong
-- proposal is a new version, not an erasure — and a version number that silently
-- disappears is how version 3 comes to follow version 1.
GRANT SELECT, INSERT, UPDATE ON repair.repair_proposals TO autoworkshop_app;
REVOKE DELETE ON repair.repair_proposals FROM autoworkshop_app;

COMMIT;
