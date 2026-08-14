-- 081 — a sales pipeline that can be created, and campaigns to run it through
--
-- ══════════════════════════════════════════════════════════════════════════
-- Owner asked for "insurance sales pipe line and marketing of insurance
-- campaign" as a UAT case on 2026-08-14. It could not be populated, because
-- none of it existed:
--
--   · `crm.leads` had `@Get()` and `@Patch(':id')` and NO POST. Nothing in the
--     product creates a lead; they arrive only from the discovery agent.
--   · There was no campaign entity at all — no table, no module, no route,
--     no screen.
--   · `crm.leads.status` is a five-value CHECK on one table. That is a lead
--     STATUS, not a pipeline: it cannot express a value, an expected close,
--     an owner, or a reason for loss.
--
-- ── 🔴 WHAT THIS MIGRATION DELIBERATELY DOES NOT DECIDE ───────────────────
--
-- The owner was asked which product this is and the answer did not
-- distinguish the two, so this builds ONLY what is identical under both and
-- stops before the part that diverges:
--
--   A. an INSURER selling policies to vehicle owners on the platform, or
--   B. the PLATFORM selling insurance to its own users.
--
-- They differ in exactly one place: WHERE THE AUDIENCE COMES FROM. (A) needs
-- an insurer to read customers and vehicles belonging to WORKSHOP tenants,
-- which is a cross-tenant grant this plan has never made and which
-- `COMBINED_PLAN_v2` §4 makes the isolation boundary. (B) needs no such
-- thing.
--
-- So everything below is TENANT-SCOPED: an organisation runs campaigns over
-- ITS OWN records. That is correct under (A) and under (B), and it forecloses
-- neither. **Nothing here reads across a tenant boundary, and adding that is a
-- separate migration and a separate decision.** Written down because the next
-- reader will otherwise assume the audience question was settled.
--
-- ── The shape ─────────────────────────────────────────────────────────────
--
-- `campaigns` — a named marketing effort with a window and a channel.
-- `campaign_members` — which leads are in it, and what happened to each.
--
-- Leads keep their existing five-value status; a campaign does NOT duplicate
-- it. The member row records the campaign-specific facts (when it was sent,
-- whether it was answered) so the same lead can be in two campaigns without
-- either overwriting the other's history — which a status column on `leads`
-- could not represent, and which is the actual reason a join table exists.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── 1. Campaigns ──────────────────────────────────────────────────────────

CREATE TABLE crm.campaigns (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- CLAUDE.md §6: every organisation-owned record carries these.
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id),
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id),

    -- TEXT, never VARCHAR(n) — the Solar truncation lesson, and a campaign
    -- name is exactly the free text that meets it.
    name             TEXT NOT NULL,
    objective        TEXT,

    -- What this campaign sells. Free text rather than an enum: an insurer's
    -- "comprehensive renewal" and a workshop's "winter service offer" are the
    -- same shape, and guessing the taxonomy now would be the speculative
    -- structure this repository keeps warning about.
    offering         TEXT,

    channel          TEXT NOT NULL DEFAULT 'email'
                     CHECK (channel IN ('email','sms','phone','in_app','in_person','other')),

    status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','active','paused','completed','cancelled')),

    starts_on        date,
    ends_on          date,

    created_by       uuid REFERENCES identity.users(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid REFERENCES identity.users(id),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CHECK (length(btrim(name)) > 0),
    -- A window that ends before it starts is a data-entry error, not a state.
    CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
    -- Cancelling is a decision and decisions carry reasons, exactly as
    -- `purchase_orders.cancelled_reason` and `invoices.void_reason` do.
    cancelled_reason TEXT,
    CHECK (status <> 'cancelled' OR cancelled_reason IS NOT NULL)
);

-- One campaign name per organisation, so "Q4 renewals" cannot silently exist
-- twice and split its own reporting.
CREATE UNIQUE INDEX uq_campaign_name_per_org
    ON crm.campaigns (organization_id, lower(btrim(name)));

-- CLAUDE.md §11 baseline for a tenant-owned table.
CREATE INDEX idx_campaigns_tenant           ON crm.campaigns (tenant_id);
CREATE INDEX idx_campaigns_tenant_status    ON crm.campaigns (tenant_id, status);
CREATE INDEX idx_campaigns_tenant_created   ON crm.campaigns (tenant_id, created_at DESC);

-- ── 2. Who is in a campaign, and what happened to them ────────────────────

CREATE TABLE crm.campaign_members (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id),
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id),

    campaign_id      uuid NOT NULL REFERENCES crm.campaigns(id) ON DELETE CASCADE,
    lead_id          uuid NOT NULL REFERENCES crm.leads(id) ON DELETE CASCADE,

    -- The campaign-specific outcome. Deliberately NOT the lead's status: a
    -- lead can be in two campaigns and be answered by one, and a single status
    -- column on `leads` cannot say that.
    outcome          TEXT NOT NULL DEFAULT 'pending'
                     CHECK (outcome IN ('pending','sent','answered','declined','converted','bounced')),

    -- Value is optional and unpriced until somebody quotes: a pipeline that
    -- demands a number before there is one gets filled with invented ones.
    expected_value   numeric(14,2) CHECK (expected_value IS NULL OR expected_value >= 0),
    currency         TEXT CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),

    sent_at          timestamptz,
    responded_at     timestamptz,
    note             TEXT,

    created_by       uuid REFERENCES identity.users(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid REFERENCES identity.users(id),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- 🔴 A RESPONSE BEFORE IT WAS SENT IS NOT A STATE. The same shape as
    -- `invoices` pinning `(status='draft') = (issued_at IS NULL)`.
    CHECK (responded_at IS NULL OR sent_at IS NOT NULL),
    CHECK (outcome NOT IN ('sent','answered','declined','converted','bounced')
           OR sent_at IS NOT NULL)
);

-- The same lead cannot be added to one campaign twice.
CREATE UNIQUE INDEX uq_campaign_member ON crm.campaign_members (campaign_id, lead_id);

CREATE INDEX idx_campaign_members_tenant   ON crm.campaign_members (tenant_id);
CREATE INDEX idx_campaign_members_campaign ON crm.campaign_members (campaign_id, outcome);
CREATE INDEX idx_campaign_members_lead     ON crm.campaign_members (lead_id);

-- ── 3. 🔴 A CAMPAIGN AND ITS MEMBER MUST BELONG TO THE SAME ORGANISATION ──
--
-- A foreign key cannot carry that predicate: `campaign_id` references
-- `crm.campaigns(id)` by id alone, and RLS `WITH CHECK` validates the
-- tenant of the row being INSERTED, not the tenant of the rows it points at.
-- So `tenant_id = A` with `campaign_id = <a campaign in B>` satisfies both.
--
-- 073 and 079 closed exactly this class for eighteen other relationships by
-- making the key organisation-scoped. Same fix, applied from the start rather
-- than in a follow-up migration.
ALTER TABLE crm.campaigns
    ADD CONSTRAINT uq_campaign_org_scoped UNIQUE (id, organization_id);
ALTER TABLE crm.leads
    ADD CONSTRAINT uq_lead_org_scoped UNIQUE (id, organization_id);

ALTER TABLE crm.campaign_members
    ADD CONSTRAINT fk_member_campaign_same_org
    FOREIGN KEY (campaign_id, organization_id)
    REFERENCES crm.campaigns (id, organization_id) ON DELETE CASCADE;
ALTER TABLE crm.campaign_members
    ADD CONSTRAINT fk_member_lead_same_org
    FOREIGN KEY (lead_id, organization_id)
    REFERENCES crm.leads (id, organization_id) ON DELETE CASCADE;

-- ── 4. Row level security ─────────────────────────────────────────────────
--
-- ENABLE **and FORCE**. `ENABLE` alone exempts the table OWNER, and the
-- application connects as the owner on Render — which made every enterprise
-- policy in the Solar app inert for months. FORCE is the half that matters.

ALTER TABLE crm.campaigns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.campaigns         FORCE  ROW LEVEL SECURITY;
ALTER TABLE crm.campaign_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.campaign_members  FORCE  ROW LEVEL SECURITY;

-- Organisation-scoped as well as tenant-scoped: one tenant may hold several
-- organisations, so tenant alone leaves isolation to the application layer.
-- `organisation-isolation.integration.spec.ts` enforces this.
CREATE POLICY campaigns_tenant_isolation ON crm.campaigns
    FOR ALL
    USING (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()))
    WITH CHECK (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()));

-- Organisation-scoped as well as tenant-scoped: one tenant may hold several
-- organisations, so tenant alone leaves isolation to the application layer.
-- `organisation-isolation.integration.spec.ts` enforces this.
CREATE POLICY campaign_members_tenant_isolation ON crm.campaign_members
    FOR ALL
    USING (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()))
    WITH CHECK (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.campaigns        TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.campaign_members TO autoworkshop_app;

COMMENT ON TABLE crm.campaigns IS
'A marketing campaign run by ONE organisation over its OWN leads. Tenant-scoped '
'deliberately: whether an insurer may market to another tenant''s customers is '
'an unmade decision, and nothing here reads across a tenant boundary.';

COMMENT ON TABLE crm.campaign_members IS
'Which leads are in a campaign and what happened to each. Separate from '
'crm.leads.status because one lead may sit in several campaigns with different '
'outcomes, which a single status column cannot represent.';

COMMIT;
