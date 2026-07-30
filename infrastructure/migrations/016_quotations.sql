-- ============================================================================
-- Migration 016 — quotations (Phase 5, slice 5)
--
-- `1.txt` §340 is the `quotation_preparation` stage; `07.txt` §9-§16 is the
-- QUOTATION PREPARATION FLOW:
--
--   §10 — "The approved repair plan is sent to quotation preparation."
--   §11 — the Service Advisor or authorized manager reviews: repair tasks ·
--         labor hours · parts · consumables · external services · taxes ·
--         discounts
--   §3  — "The system GENERATES A DRAFT quotation."
--   §4  — the quotation displays: customer · vehicle · complaint · diagnosis
--         summary · recommended repair · alternative options · parts · labor ·
--         other charges · expected completion conditions · warranty · validity
--         period
--   §5  — "submitted for internal approval where required"
--   §6  — "The approved quotation is sent to the customer."
--
-- ⚠️ THIS MIGRATION INTRODUCES MONEY TO THE PLATFORM. Nothing before it stores a
-- price, a rate or a currency — checked, not assumed. Every decision below is
-- therefore a precedent, and the ones that cannot be undone later are marked.
--
-- ── 1. MONEY IS `numeric`, NEVER float, AND NEVER AN INTEGER OF MINOR UNITS ──
--
-- `numeric(14,2)` throughout. Not `double precision`, for the obvious reason.
-- Not integer-minor-units either, which is the other common choice: it needs
-- every read and write to agree on the exponent, and the first place that
-- forgets produces an invoice off by a factor of 100. Postgres `numeric` is
-- exact decimal arithmetic, which is the thing being modelled.
--
-- 14 digits with 2 decimals holds 999,999,999,999.99 — far past any plausible
-- repair, and deliberately generous because widening a money column on a large
-- live table later is an outage.
--
-- ── 2. THE CURRENCY AND THE LABOUR RATE ARE SNAPSHOT ONTO THE QUOTATION ─────
--
-- ⚠️ THE DECISION NO LATER MIGRATION CAN REPAIR. A quotation is a DOCUMENT sent
-- to a customer, and what it said when it was sent is what the workshop is held
-- to. If the currency and the labour rate were only READ from the organisation's
-- settings, then the day a workshop raises its hourly rate every historical
-- quotation would silently re-price itself — including ones a customer has
-- already approved. Nobody would see it happen, and the original figures would be
-- unrecoverable because the old rate is simply gone.
--
-- So `quotations.currency` and `quotations.labour_rate` are COPIES taken at the
-- moment the quotation is drafted, and `quotation_lines.unit_price` is a copy
-- too. The settings table below is where the DEFAULTS come from; it is never
-- consulted again once a quotation exists.
--
-- The diagnosis summary (§4) is deliberately NOT snapshot: an approved diagnosis
-- is already immutable by 012's trigger, so reading it live gives the same answer
-- forever, and a second copy would be a second thing to keep in step.
--
-- ── 3. THE LINE TOTAL IS COMPUTED BY THE DATABASE ───────────────────────────
--
-- `line_total` is `GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED`.
-- Both properties matter:
--   · GENERATED — the application cannot write a total that disagrees with its
--     own quantity and price. That disagreement is the classic invoice defect,
--     and no amount of service-layer care prevents a second caller introducing
--     it.
--   · STORED, with the rounding fixed HERE — the half-up point is decided once,
--     at the moment of pricing, rather than by whatever rounding the reader
--     happens to apply. A quotation whose lines re-round differently in a later
--     release is a quotation that changes after it was sent.
--
-- Header totals are NOT stored. They are sums of immutable lines, so a stored
-- copy would be a second statement of the same fact with nothing to gain — the
-- same judgement 014 made about the plan's labour total.
-- ============================================================================

BEGIN;

-- ── the workshop's commercial settings ──────────────────────────────────────
--
-- One row per organisation. Separate from `identity.organizations` on purpose:
-- that table is WHO a workshop is, and this is WHAT IT CHARGES. Mixing them would
-- put a commercial rate behind identity's RLS and make every pricing change an
-- identity write.
--
-- ⚠️ NO ROW IS REQUIRED. The service falls back to the defaults declared here, so
-- a workshop that has configured nothing can still quote — CLAUDE.md's
-- bring-your-own-connection rule (ADR-015) applied to pricing: a tenant that
-- configures nothing still gets a working app.

-- ⚠️ DECLARED BEFORE THE TABLE THAT REFERENCES IT. A foreign key can only cite a
-- unique constraint that ALREADY EXISTS; adding it afterwards is an ERROR, not a
-- style preference. 014 cost one failed apply learning this, and writing the
-- migration top-down re-created it here — hence the note rather than a silent fix.
ALTER TABLE identity.organizations
    DROP CONSTRAINT IF EXISTS uq_organizations_id_tenant;
ALTER TABLE identity.organizations
    ADD CONSTRAINT uq_organizations_id_tenant UNIQUE (id, tenant_id);

CREATE TABLE IF NOT EXISTS repair.organization_pricing (
    organization_id  uuid PRIMARY KEY REFERENCES identity.organizations(id) ON DELETE CASCADE,
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,

    -- ISO 4217. TEXT + CHECK rather than a lookup table: the list is stable, and a
    -- foreign key to a currency table nobody maintains is a join that buys nothing.
    -- Upper-case enforced so 'ghs' and 'GHS' cannot both exist and fail to match.
    currency         TEXT NOT NULL DEFAULT 'GHS'
                     CHECK (currency ~ '^[A-Z]{3}$'),

    -- §11's "labor hours" become money at this rate. numeric(14,2) like every
    -- other money column — a rate is a price, and giving it a different width is
    -- how a rounding difference gets introduced at the multiplication.
    default_labour_rate numeric(14,2) NOT NULL DEFAULT 0
                     CHECK (default_labour_rate >= 0),

    -- §11's taxes. A PERCENTAGE, not an amount: the amount belongs to the
    -- quotation it was computed for. Ghana's VAT + levies run to 21.9%, so the
    -- scale allows fractions of a percent.
    tax_name         TEXT NOT NULL DEFAULT 'VAT',
    tax_rate_percent numeric(6,3) NOT NULL DEFAULT 0
                     CHECK (tax_rate_percent >= 0 AND tax_rate_percent <= 100),

    -- §4's "validity period", as the default number of days a new quotation is
    -- valid for. The quotation stores the resulting DATE, not this number.
    default_validity_days integer NOT NULL DEFAULT 14
                     CHECK (default_validity_days > 0 AND default_validity_days <= 365),
    -- §4's warranty, as the workshop's standard wording.
    default_warranty_terms TEXT,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_pricing_org_scope
        FOREIGN KEY (organization_id, tenant_id)
        REFERENCES identity.organizations (id, tenant_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_org_pricing_tenant
    ON repair.organization_pricing (tenant_id);

-- ── the quotation header ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repair.quotations (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    job_card_id      uuid NOT NULL,
    -- ⚠️ THE APPROVED PLAN THIS WAS PRICED FROM (§10). NOT NULL for the reason
    -- 014's `diagnosis_id` is: a quotation whose source is unknown cannot be
    -- checked against the work it charges for, and "the newest approved plan at
    -- the time" is not recoverable once a second attempt exists.
    repair_plan_id   uuid NOT NULL,

    attempt_no       integer NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),

    -- §5's internal approval. The same four states as a diagnosis and a plan,
    -- and for the same reason: a draft, a claim, and the answer to it. `sent` is
    -- NOT here — issuing to the customer is slice 6's Solution Studio, and adding
    -- a state nothing can reach would be a lie about what this build does.
    status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),

    -- ── the snapshot (see the header note) ──────────────────────────────────
    currency         TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    labour_rate      numeric(14,2) NOT NULL CHECK (labour_rate >= 0),
    tax_name         TEXT NOT NULL DEFAULT 'VAT',
    tax_rate_percent numeric(6,3) NOT NULL DEFAULT 0
                     CHECK (tax_rate_percent >= 0 AND tax_rate_percent <= 100),

    -- §11's discounts. An AMOUNT, not a percentage: a service advisor discounts
    -- "GHS 200 off", and storing a percentage would force a rounding decision the
    -- advisor did not make. Constrained non-negative — a negative discount is a
    -- surcharge, and a surcharge is an `other_charge` line where the customer can
    -- see what it is for.
    discount_amount  numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    discount_reason  TEXT,

    -- §4's "validity period", "warranty" and "expected completion conditions".
    valid_until      date,
    warranty_terms   TEXT,
    completion_conditions TEXT,
    -- §4's "recommended repair" and "alternative options where applicable".
    recommended_repair TEXT,
    alternative_options TEXT,

    prepared_by      uuid,
    prepared_at      timestamptz NOT NULL DEFAULT now(),
    submitted_by     uuid,
    submitted_at     timestamptz,
    reviewed_by      uuid,
    reviewed_at      timestamptz,
    review_note      TEXT,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT quotation_submitted_attributed CHECK (
        status = 'draft'
        OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL)
    ),
    CONSTRAINT quotation_reviewed_attributed CHECK (
        status IN ('draft', 'submitted')
        OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
    ),
    CONSTRAINT quotation_rejection_has_reason CHECK (
        status <> 'rejected'
        OR (review_note IS NOT NULL AND length(btrim(review_note)) > 0)
    ),

    CONSTRAINT uq_quotation_attempt UNIQUE (job_card_id, attempt_no),

    CONSTRAINT fk_quotation_card_scope
        FOREIGN KEY (job_card_id, tenant_id, organization_id)
        REFERENCES repair.job_cards (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_quotation_plan_scope
        FOREIGN KEY (repair_plan_id, tenant_id, organization_id)
        REFERENCES repair.repair_plans (id, tenant_id, organization_id)
        -- RESTRICT, not CASCADE: a plan cannot be deleted anyway (014 revoked
        -- DELETE on the header), and if that ever changed, taking the quotation
        -- with it would remove the record of what a customer was charged.
        ON DELETE RESTRICT
);

ALTER TABLE repair.quotations
    DROP CONSTRAINT IF EXISTS uq_quotations_id_tenant_org;
ALTER TABLE repair.quotations
    ADD CONSTRAINT uq_quotations_id_tenant_org UNIQUE (id, tenant_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_quotations_card
    ON repair.quotations (job_card_id, attempt_no DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_tenant
    ON repair.quotations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotations_plan
    ON repair.quotations (repair_plan_id);
-- §5's internal approval queue — submitted and not yet answered.
CREATE INDEX IF NOT EXISTS idx_quotations_awaiting_review
    ON repair.quotations (organization_id, submitted_at DESC)
    WHERE status = 'submitted';

-- ── the priced lines ────────────────────────────────────────────────────────

-- Same rule as above, same reason. 014 declared this pair for the plan TASKS but
-- not for the RESOURCES, because nothing referenced them then. A quotation line
-- does.
ALTER TABLE repair.repair_plan_resources
    DROP CONSTRAINT IF EXISTS uq_plan_resources_id_tenant_org;
ALTER TABLE repair.repair_plan_resources
    ADD CONSTRAINT uq_plan_resources_id_tenant_org UNIQUE (id, tenant_id, organization_id);

CREATE TABLE IF NOT EXISTS repair.quotation_lines (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    quotation_id     uuid NOT NULL,
    position         integer NOT NULL,

    -- §11's own categories. `labour` is priced from the plan's estimated hours;
    -- `part` and `consumable` come from the plan's resources; `external_service`
    -- is §11's "external services"; `other_charge` is §4's "other charges" and is
    -- also where a surcharge goes, so it is always visible as its own line.
    line_kind        TEXT NOT NULL CHECK (line_kind IN (
        'labour', 'part', 'consumable', 'external_service', 'other_charge')),

    -- ⚠️ WHAT THIS LINE WAS DERIVED FROM, so a customer charge can always answer
    -- "which task is this?" — the same reasoning as 014's `finding_id`. Nullable,
    -- because §11's external services and other charges have no plan row behind
    -- them, and because a line may legitimately be added by hand.
    repair_plan_task_id     uuid,
    repair_plan_resource_id uuid,

    -- What the CUSTOMER reads. Snapshot from the plan rather than joined at read
    -- time: the plan is immutable once approved, but this text is the wording the
    -- customer was shown, and it may be edited to be intelligible to them.
    description      TEXT NOT NULL CHECK (length(btrim(description)) > 0),

    -- Hours for labour, units for parts. Same width as the plan's quantity.
    quantity         numeric(12,3) NOT NULL CHECK (quantity > 0),
    unit             TEXT,
    unit_price       numeric(14,2) NOT NULL CHECK (unit_price >= 0),

    -- ⚠️ COMPUTED BY THE DATABASE, and the rounding is fixed here. See the header
    -- note: an application-written total is free to disagree with its own inputs,
    -- and a total re-rounded by a later reader is a quotation that changes after
    -- it was sent.
    line_total       numeric(14,2)
                     GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,

    -- Whether this line is part of the headline price or an option the customer
    -- may decline (§4's "alternative options where applicable"). Optional lines
    -- are EXCLUDED from the totals, which is why this is a column and not a note.
    is_optional      boolean NOT NULL DEFAULT false,

    recorded_by      uuid,
    recorded_at      timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_quotation_line_position UNIQUE (quotation_id, position) DEFERRABLE INITIALLY DEFERRED,

    CONSTRAINT fk_line_quotation_scope
        FOREIGN KEY (quotation_id, tenant_id, organization_id)
        REFERENCES repair.quotations (id, tenant_id, organization_id)
        ON DELETE CASCADE,
    -- MATCH SIMPLE: a NULL source id skips the constraint, which is what "this
    -- line has no plan row behind it" means.
    CONSTRAINT fk_line_task_scope
        FOREIGN KEY (repair_plan_task_id, tenant_id, organization_id)
        REFERENCES repair.repair_plan_tasks (id, tenant_id, organization_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_line_resource_scope
        FOREIGN KEY (repair_plan_resource_id, tenant_id, organization_id)
        REFERENCES repair.repair_plan_resources (id, tenant_id, organization_id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_quotation_lines_quotation
    ON repair.quotation_lines (quotation_id, position);
CREATE INDEX IF NOT EXISTS idx_quotation_lines_tenant
    ON repair.quotation_lines (tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotation_lines_task
    ON repair.quotation_lines (repair_plan_task_id)
    WHERE repair_plan_task_id IS NOT NULL;

-- ── immutability once submitted ─────────────────────────────────────────────
--
-- Same reasoning and same shape as 012, 014 and 015. A submitted quotation is the
-- price a manager approves and a customer is later shown; editing it afterwards
-- would change what was approved and what was charged.

CREATE OR REPLACE FUNCTION repair.reject_settled_quotation_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status IN ('approved', 'rejected') THEN
        RAISE EXCEPTION
            'quotation % is already reviewed and cannot be changed; prepare a new quotation instead', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD.status = 'submitted' AND NEW.status = 'draft' THEN
        RAISE EXCEPTION
            'quotation % cannot return to draft; prepare a new quotation instead', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- ⚠️ 015's LESSON, APPLIED IN THE MIGRATION THAT CREATES THE TABLE RATHER THAN
    -- IN A FIX-UP THE NEXT DAY. 014 granted UPDATE on the whole row and refused
    -- writes only once the record was settled, which left `diagnosis_id`
    -- re-pointable on an open plan — every guard bypassed without writing a child
    -- row. The same hole here would let a DRAFT quotation be re-pointed at another
    -- plan while its lines still referenced the first, or have its CURRENCY
    -- changed after it was priced, which silently re-denominates every amount.
    IF NEW.repair_plan_id IS DISTINCT FROM OLD.repair_plan_id THEN
        RAISE EXCEPTION
            'quotation % cannot be re-pointed at a different repair plan; its lines reference plan %', OLD.id, OLD.repair_plan_id
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.currency IS DISTINCT FROM OLD.currency THEN
        RAISE EXCEPTION
            'quotation % cannot change currency after it was priced; every amount on it is denominated in %', OLD.id, OLD.currency
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.job_card_id IS DISTINCT FROM OLD.job_card_id
       OR NEW.attempt_no IS DISTINCT FROM OLD.attempt_no
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION
            'quotation % cannot change its identity columns', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotations_immutable ON repair.quotations;
CREATE TRIGGER trg_quotations_immutable
    BEFORE UPDATE ON repair.quotations
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_settled_quotation_change();

CREATE OR REPLACE FUNCTION repair.reject_settled_quotation_line_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    blocked boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM repair.quotations
         WHERE status <> 'draft'
           AND id IN (
                 OLD.quotation_id,
                 CASE WHEN TG_OP = 'DELETE' THEN OLD.quotation_id ELSE NEW.quotation_id END
               )
    ) INTO blocked;

    IF blocked THEN
        RAISE EXCEPTION
            'quotation % is submitted and its lines cannot be changed', OLD.quotation_id
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- A BEFORE DELETE TRIGGER MUST RETURN OLD. Returning NEW (NULL on a delete)
    -- skips the row SILENTLY and the caller sees a successful statement that
    -- deleted nothing. Slice 3a shipped that bug.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotation_lines_immutable ON repair.quotation_lines;
CREATE TRIGGER trg_quotation_lines_immutable
    BEFORE UPDATE OR DELETE ON repair.quotation_lines
    FOR EACH ROW
    EXECUTE FUNCTION repair.reject_settled_quotation_line_change();

-- ── a line may only cite a task or resource of ITS OWN quotation's plan ─────
--
-- The rule a foreign key cannot express, and the direct descendant of 014's
-- finding trigger. The composite FKs check the tenant and organisation, which is
-- not the same question: two cars in the same workshop share both. A line citing
-- another job's task is a customer charged for work planned for somebody else.
CREATE OR REPLACE FUNCTION repair.assert_line_cites_own_plan()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_plan uuid;
    ok     boolean;
BEGIN
    IF NEW.repair_plan_task_id IS NULL AND NEW.repair_plan_resource_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT repair_plan_id INTO v_plan
      FROM repair.quotations
     WHERE id = NEW.quotation_id AND tenant_id = NEW.tenant_id;

    IF NEW.repair_plan_task_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM repair.repair_plan_tasks t
             WHERE t.id = NEW.repair_plan_task_id
               AND t.plan_id = v_plan
               AND t.tenant_id = NEW.tenant_id
        ) INTO ok;
        IF NOT ok THEN
            RAISE EXCEPTION
                'quotation line cites task %, which is not on plan %', NEW.repair_plan_task_id, v_plan
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    IF NEW.repair_plan_resource_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM repair.repair_plan_resources r
             WHERE r.id = NEW.repair_plan_resource_id
               AND r.plan_id = v_plan
               AND r.tenant_id = NEW.tenant_id
        ) INTO ok;
        IF NOT ok THEN
            RAISE EXCEPTION
                'quotation line cites resource %, which is not on plan %', NEW.repair_plan_resource_id, v_plan
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotation_line_cites_own_plan ON repair.quotation_lines;
CREATE TRIGGER trg_quotation_line_cites_own_plan
    BEFORE INSERT OR UPDATE ON repair.quotation_lines
    FOR EACH ROW
    EXECUTE FUNCTION repair.assert_line_cites_own_plan();

-- ── row-level security ──────────────────────────────────────────────────────
-- ENABLE *and* FORCE on every table. Enable alone exempts the table owner, which
-- is the role the app connects as — isolation present and inert.

ALTER TABLE repair.organization_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.organization_pricing FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON repair.organization_pricing;
CREATE POLICY tenant_isolation ON repair.organization_pricing
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

ALTER TABLE repair.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.quotations FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON repair.quotations;
CREATE POLICY tenant_isolation ON repair.quotations
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

ALTER TABLE repair.quotation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair.quotation_lines FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON repair.quotation_lines;
CREATE POLICY tenant_isolation ON repair.quotation_lines
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- DELETE on the LINE table from the start — 013's lesson, now applied by default
-- rather than rediscovered. A service advisor who adds a line in error must be
-- able to remove it: `update` cannot remove a duplicate, and a second attempt
-- cannot be started while one is open. The trigger above is the narrowing; the
-- grant is permission to reach it.
--
-- The HEADER keeps its revoke: a quotation that was prepared is a fact about what
-- the workshop offered, and an attempt number that silently disappears is how
-- attempt 3 comes to follow attempt 1.
GRANT SELECT, INSERT, UPDATE         ON repair.quotations           TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON repair.quotation_lines      TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE         ON repair.organization_pricing TO autoworkshop_app;
REVOKE DELETE ON repair.quotations           FROM autoworkshop_app;
REVOKE DELETE ON repair.organization_pricing FROM autoworkshop_app;

COMMIT;
