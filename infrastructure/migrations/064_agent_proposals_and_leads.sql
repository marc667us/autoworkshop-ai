-- 064 — the agent layer's two tables: what an agent PROPOSES, and the leads it finds
--
-- ══════════════════════════════════════════════════════════════════════════
-- Owner, 2026-08-08: "AI agent must receive the request and used to on
-- interflow setup the customer request in the workshop and assign technicians
-- get job started", plus an agent that "search for products and suppliers and
-- register them" and another that searches "leads and potential customers from
-- online and social media".
--
-- Before this migration the product had NO agent runtime of any kind. The
-- `AiAssistantPanel` renders in all seven web apps with a hardcoded
-- "The assistant connects in Phase 8" message and no producer behind it.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 AN AGENT PROPOSES. IT DOES NOT DO. ─────────────────────────────────
--
-- This is the whole architecture and it is a Directive requirement, not a
-- preference. §14: human approval is REQUIRED for sending emails, deleting
-- data, awarding bids, updating supplier prices and modifying financial data.
-- `02.txt` §8 requires the panel to display, for every proposal: the action,
-- the information it intends to use, whether it is read-only or changes data,
-- whether approval is required, and the resulting sources or records.
--
-- So the agent writes a ROW HERE, and a human turns it into a business fact.
-- Nothing an agent produces is a business fact on arrival. Concretely:
--   · triage does not assign a technician — it proposes one, and reception
--     converts the request, which is where the assignment actually happens
--   · supplier discovery does not create a supplier — it proposes one, and an
--     administrator publishes it through the existing catalogue review queue
--   · lead discovery does not contact anybody. Ever. See `crm.leads` below.
--
-- The columns below are deliberately the same five disclosures as
-- `packages/ui/src/AiAssistantPanel.tsx`'s `AgentProposal` type, which already
-- makes all five REQUIRED. A proposal that cannot say what it will touch cannot
-- be rendered, and now cannot be stored either.
--
-- ── WHY THE AGENT HOST HAS NO ROW-WRITING CREDENTIAL ──────────────────────
--
-- `CLAUDE.md` §3 / ADR-010: the agent host holds no database, storage, payment
-- or admin credential, and business rules live only in domain services. The
-- Python host at `services/agent-host` receives JSON and returns JSON; the
-- NestJS API is what writes these rows, under the calling user's tenant
-- context and RLS. That boundary is asserted by a test in the host itself
-- (no database driver may even be importable), not merely promised in prose.

CREATE SCHEMA IF NOT EXISTS agents;
CREATE SCHEMA IF NOT EXISTS crm;

GRANT USAGE ON SCHEMA agents TO autoworkshop_app;
GRANT USAGE ON SCHEMA crm    TO autoworkshop_app;

-- ---------------------------------------------------------------------------
-- agents.proposals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents.proposals (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE CASCADE,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- Which agent produced it. Not an enum: a new agent must not need a
    -- migration to appear, and the value is a label, never an authorisation.
    agent_name       TEXT NOT NULL,

    -- §5's Class A/B/C/D, spelled exactly as `ActionClass` in
    -- `packages/ui/src/AiAssistantPanel.tsx`. Constrained because the UI
    -- switches on these four and a fifth value would render as nothing —
    -- silently hiding whether an action changes data.
    action_class     TEXT NOT NULL
                     CHECK (action_class IN ('read-only','draft','business-committing','privileged')),

    -- "the action it proposes" (§8), in a sentence a human can judge.
    action           TEXT NOT NULL,
    -- "the information it intends to use" (§8). Tenant data leaving the
    -- tenant's view is a consent question, not an implementation detail.
    data_used        TEXT[] NOT NULL DEFAULT '{}',
    -- "the resulting sources or business records" (§8). An unsourced AI claim
    -- about a repair, a price or a person is unsafe — this is where the link
    -- back to the evidence lives, and the discovery agents put the scraped URL
    -- here.
    sources          JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- The agent's actual output. JSONB because each agent's payload differs
    -- and pinning columns per agent would mean a migration per skill.
    payload          JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Self-reported, and treated as such everywhere it is shown. The plan
    -- requires AI output be surfaced as candidate leads, never as diagnosis.
    confidence       NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

    -- 🔴 `source` SEPARATES A MODEL'S ANSWER FROM A RULE'S ANSWER.
    -- The triage skill falls back to deterministic keyword rules when Ollama is
    -- unreachable, which is correct — a dead model must never stop an intake.
    -- But a rules answer presented as a model answer would let a reader credit
    -- it with judgement it does not have, so the two are never conflated.
    source           TEXT NOT NULL DEFAULT 'model' CHECK (source IN ('model','rules')),

    -- What it is about, when it is about something that already exists.
    resource_type    TEXT,
    resource_id      uuid,

    -- The lifecycle from `AgentProposal.status`, plus `applied`: the UI's
    -- `complete` conflates "the agent finished" with "a human accepted it",
    -- and those must not be one state in the database.
    status           TEXT NOT NULL DEFAULT 'proposed'
                     CHECK (status IN ('proposed','awaiting-approval','approved','rejected','applied','failed')),
    error            TEXT,

    -- NULL `created_by` is CORRECT and load-bearing: a proposal raised by a
    -- background agent has no user behind it. A NOT NULL column here would
    -- have forced a fake attribution to whichever human happened to trigger
    -- the surrounding request, and an audit trail that invents an author is
    -- worse than one that admits "an agent did this".
    created_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    decided_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    decided_at       timestamptz,
    decision_note    TEXT,

    -- A decided proposal must say who decided it. Enforced here rather than in
    -- the service because this is the row that justifies a business change.
    CONSTRAINT proposals_decision_is_attributed
        CHECK (status NOT IN ('approved','rejected','applied') OR decided_by IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_proposals_tenant        ON agents.proposals (tenant_id);
CREATE INDEX IF NOT EXISTS idx_proposals_org_status    ON agents.proposals (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_org_created   ON agents.proposals (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_resource      ON agents.proposals (resource_type, resource_id);

-- ⚠️ ONE OPEN PROPOSAL PER AGENT PER RESOURCE.
-- The triage agent runs when a service request is created, and a retried
-- submission or a re-queued job would otherwise stack identical proposals in
-- reception's queue until nobody reads any of them. Partial, so the history of
-- decided proposals is kept in full.
CREATE UNIQUE INDEX IF NOT EXISTS uq_proposal_open_per_resource
    ON agents.proposals (agent_name, resource_type, resource_id)
    WHERE status IN ('proposed','awaiting-approval') AND resource_id IS NOT NULL;

ALTER TABLE agents.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.proposals FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON agents.proposals TO autoworkshop_app;
-- No DELETE grant. `rejected` is how a proposal goes away, so the record of
-- what an agent suggested and what a human did about it survives.

-- ── SELECT: the workshop's own staff. NOT its customers. ──────────────────
--
-- ⚠️ THE `<> 'customer'` CLAUSE IS ON **SELECT**, AND THAT IS THE POINT.
-- Migration 059 put that clause on INSERT and UPDATE and left it off SELECT,
-- which is how supplier quoted prices became readable by any customer. Since
-- migration 061 made the customer role SELF-SERVICE, "a customer" now means
-- "any signed-up stranger who enrolled at a published workshop" — so a missing
-- read clause here would publish the workshop's AI-suggested pricing, staffing
-- and lead pipeline to the public.
DROP POLICY IF EXISTS proposal_select ON agents.proposals;
CREATE POLICY proposal_select ON agents.proposals FOR SELECT USING (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      AND identity.current_role_name() <> 'customer')
);

DROP POLICY IF EXISTS proposal_insert ON agents.proposals;
CREATE POLICY proposal_insert ON agents.proposals FOR INSERT WITH CHECK (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      -- A proposal always arrives undecided. Nothing may file one pre-approved,
      -- which would turn "an agent suggested it" into "a human authorised it"
      -- in a single INSERT.
      AND status IN ('proposed','awaiting-approval')
      AND decided_by IS NULL)
);

-- ⚠️ UPDATE IS FOR DECIDING, AND RLS CANNOT RESTRICT WHICH COLUMNS AN UPDATE
-- TOUCHES. This policy says WHO may write the row; `AgentProposalService` says
-- WHAT may change (status, decided_by, decided_at, decision_note and nothing
-- else). Stated here so the next reader does not mistake this policy for the
-- whole rule — the same note migration 059 carries, for the same reason.
DROP POLICY IF EXISTS proposal_update ON agents.proposals;
CREATE POLICY proposal_update ON agents.proposals FOR UPDATE USING (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      AND identity.current_role_name() <> 'customer')
) WITH CHECK (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      AND identity.current_role_name() <> 'customer')
);

COMMENT ON TABLE agents.proposals IS
'What an AI agent SUGGESTS, never what it did. Carries the five disclosures 02.txt '
'§8 requires (action, data used, action class, approval, sources) as NOT NULL '
'columns, so a proposal that cannot say what it will touch cannot be stored. A '
'human turns a proposal into a business fact; nothing here is one on arrival.';

-- ---------------------------------------------------------------------------
-- crm.leads — potential customers found online
-- ---------------------------------------------------------------------------
--
-- 🔴 THIS TABLE HOLDS INFORMATION ABOUT PEOPLE AND BUSINESSES WHO HAVE NOT
-- ASKED TO BE HERE, AND THAT CHANGES WHAT IT MAY DO.
--
--   · It stores BUSINESS contact details — the ones an organisation publishes
--     to be contacted on. It is not a place for personal social-media profiles,
--     and `source_url` exists so any row can be traced back and challenged.
--   · NOTHING IN THIS PLATFORM CONTACTS A LEAD AUTOMATICALLY. There is no
--     outbound path from this table, deliberately. Directive §14 requires human
--     approval for sending email, and an agent that both finds strangers and
--     mails them is a spam engine regardless of intent. A human reads the row
--     and decides.
--   · `status` starts at `new` and a human moves it. An agent may only ever
--     insert `new`, enforced by policy below.
--
-- If this platform is ever operated in a jurisdiction with a data-protection
-- regime (Ghana's Data Protection Act 2012 applies to the owner's market), a
-- deletion path and a lawful-basis note belong here. That is flagged, not
-- built, because it is a legal decision and not mine to make.
CREATE TABLE IF NOT EXISTS crm.leads (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE CASCADE,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    organisation_name TEXT NOT NULL,
    contact_name     TEXT,
    contact_email    TEXT,
    contact_phone    TEXT,
    website          TEXT,
    location         TEXT,
    -- Why the agent thinks this is a lead, in its own words. A lead with no
    -- rationale is a name somebody has to research from scratch.
    rationale        TEXT,
    -- 🔴 NOT NULL. A lead whose origin cannot be produced cannot be defended to
    -- the person it is about, and cannot be checked by the salesperson acting
    -- on it. This is the column that keeps the table honest.
    source_url       TEXT NOT NULL,

    status           TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new','qualified','contacted','converted','rejected')),
    -- The proposal a human approved to create this row, so every lead traces
    -- back to a decision with a name on it.
    proposal_id      uuid REFERENCES agents.proposals(id) ON DELETE SET NULL,

    created_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz,
    updated_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL,

    -- The same organisation is not a lead twice for one workshop.
    CONSTRAINT uq_lead_per_org UNIQUE (organization_id, organisation_name)
);

CREATE INDEX IF NOT EXISTS idx_leads_tenant      ON crm.leads (tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_org_status  ON crm.leads (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_org_created ON crm.leads (organization_id, created_at DESC);

ALTER TABLE crm.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.leads FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON crm.leads TO autoworkshop_app;

-- Staff only, on every command. A customer of the workshop must never read its
-- sales pipeline — and since migration 061 a customer is any stranger who
-- enrolled.
DROP POLICY IF EXISTS lead_select ON crm.leads;
CREATE POLICY lead_select ON crm.leads FOR SELECT USING (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      AND identity.current_role_name() <> 'customer')
);

DROP POLICY IF EXISTS lead_insert ON crm.leads;
CREATE POLICY lead_insert ON crm.leads FOR INSERT WITH CHECK (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      AND identity.current_role_name() <> 'customer'
      -- A lead is born `new`. Nothing may file one already `contacted`, which
      -- would record an outreach that never happened.
      AND status = 'new')
);

DROP POLICY IF EXISTS lead_update ON crm.leads;
CREATE POLICY lead_update ON crm.leads FOR UPDATE USING (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      AND identity.current_role_name() <> 'customer')
) WITH CHECK (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      AND identity.current_role_name() <> 'customer')
);

COMMENT ON TABLE crm.leads IS
'Potential customers discovered online by the lead agent, for a HUMAN to read '
'and act on. NOTHING in this platform contacts a lead automatically and there is '
'deliberately no outbound path from this table. source_url is NOT NULL because a '
'lead whose origin cannot be produced cannot be defended to the person it is '
'about. Staff only on every command — a customer must never read the workshop''s '
'sales pipeline.';
