-- 045 — settings and workshop admin: the configuration a workshop actually owns
--
-- ══════════════════════════════════════════════════════════════════════════
-- SLICE 6 of docs/00-project/COMPLETION_PLAN.md
-- ══════════════════════════════════════════════════════════════════════════
--
-- Slices 1-5 built what a workshop DOES. This one builds what a workshop IS:
-- when it opens, what it sells, who may approve what, what its documents say,
-- which notifications it wants, and which of its own external accounts it has
-- connected. Until now every one of those was a hardcoded default, which means
-- every workshop on the platform was the same workshop.
--
-- ── 🔴 THE RLS HERE IS ORGANISATION-SCOPED, NOT TENANT-SCOPED ──────────────
--
-- Every earlier slice wrote `tenant_id = identity.current_tenant_id()` and
-- nothing more. On 2026-08-06 that was measured and found insufficient: a
-- tenant in this database HOLDS MORE THAN ONE ORGANISATION, so a tenant-wide
-- predicate let one workshop reach another workshop's rows in the same tenancy
-- given only an id. That was patched in the media service by hand.
--
-- Settings are the worst possible table family to repeat it on — approval
-- limits and integrations are exactly what an attacker inside the tenancy would
-- want to rewrite. So these policies carry BOTH predicates, and
-- `identity.current_organization_id()` is real: `tenant-context.ts` sets
-- `app.organization_ids` on every tenant-scoped connection.
--
-- ⚠️ THE CONSEQUENCE IS DELIBERATE: a connection with a tenant but NO
-- organisation sees zero settings rows. That is the fail-closed direction.
--
-- ── ⚠️ PUBLIC READ IS OPT-IN AND NARROW ────────────────────────────────────
--
-- The slice's acceptance check is "change opening hours; they appear on the
-- public landing's workshop profile". The public landing is UNAUTHENTICATED —
-- no tenant, no organisation — so an org-scoped policy alone would make that
-- check impossible to pass. The pattern already proven in this database is
-- `catalogue.mechanic_directory`: org-scoped policies PLUS a narrow
-- `public_read` gated on a publication flag. Copied rather than reinvented.
--
-- Only opening hours and service categories are publishable. Approval limits,
-- templates, notification preferences, workflow rules and integrations have no
-- public policy at all — a workshop's internal money limits are nobody's
-- business.

BEGIN;

-- ── when the workshop is open ───────────────────────────────────────────────
--
-- One row per weekday, not a free-text string. `identity.branches` already
-- carries an `operating_hours text` column, which cannot answer "are you open
-- now?" without a human reading it. That column stays for the branch's own
-- prose; this table is the machine-readable truth.

CREATE TABLE IF NOT EXISTS core.opening_hours (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
    -- Nullable: a workshop with one site has no branches, and forcing it to
    -- invent one to record its opening hours is a worse model.
    branch_id        uuid REFERENCES identity.branches(id) ON DELETE CASCADE,

    -- ISO-8601: 1 = Monday … 7 = Sunday. Postgres' own `extract(isodow)` uses
    -- this, so a query can compare without a translation table. 0-6 would have
    -- needed one, and the translation is where the off-by-one lives.
    weekday          smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),

    is_closed        boolean NOT NULL DEFAULT false,
    opens_at         time,
    closes_at        time,

    is_published     boolean NOT NULL DEFAULT false,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- A day is either closed, or it has BOTH ends. "Opens at 08:00" with no
    -- closing time renders as an open-ended promise on the public profile.
    CONSTRAINT ck_hours_complete CHECK (
        (is_closed AND opens_at IS NULL AND closes_at IS NULL)
        OR (NOT is_closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL)
    ),
    -- Closing before opening is not a night shift, it is a typo. A workshop
    -- that genuinely runs past midnight records it as two rows.
    CONSTRAINT ck_hours_ordered CHECK (
        is_closed OR closes_at > opens_at
    ),
    -- One row per day per site. 🔴 `NULLS NOT DISTINCT` IS LOAD-BEARING: a plain
    -- UNIQUE treats every NULL as distinct, so a single-site workshop — the
    -- common case, where `branch_id` is NULL — could store Monday twice and the
    -- public profile would render two contradictory answers. Postgres 16 here;
    -- the clause needs 15+.
    CONSTRAINT uq_hours_day UNIQUE NULLS NOT DISTINCT (organization_id, branch_id, weekday)
);

CREATE INDEX IF NOT EXISTS idx_hours_tenant ON core.opening_hours (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hours_org    ON core.opening_hours (organization_id, weekday);

-- ── what the workshop sells ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core.service_categories (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    name             TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    description      TEXT,

    -- What the workshop expects the job to take, used to seed a repair plan.
    -- NULL means "we have not said", which is different from zero.
    default_duration_minutes integer CHECK (default_duration_minutes IS NULL
                                            OR default_duration_minutes > 0),

    -- numeric(14,2) and a 3-letter currency, matching every other money column
    -- in this database. A second representation is how two screens come to
    -- disagree about the same number.
    indicative_price numeric(14,2) CHECK (indicative_price IS NULL OR indicative_price >= 0),
    currency         TEXT NOT NULL DEFAULT 'GHS' CHECK (currency ~ '^[A-Z]{3}$'),

    is_active        boolean NOT NULL DEFAULT true,
    is_published     boolean NOT NULL DEFAULT false,
    display_order    integer NOT NULL DEFAULT 0,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_service_category_name UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_svccat_tenant ON core.service_categories (tenant_id);
CREATE INDEX IF NOT EXISTS idx_svccat_org    ON core.service_categories (organization_id, is_active);

-- ── who may approve how much ────────────────────────────────────────────────
--
-- ⚠️ THIS TABLE STATES POLICY; IT DOES NOT ENFORCE IT. Enforcement lives in the
-- approval path in `repair`, which reads these rows. Saying so here matters:
-- the failure mode for a limits table is somebody reading its existence as
-- proof that limits are applied, which is the "comment claiming a guard that
-- does not exist" defect recorded four times in this repository.

CREATE TABLE IF NOT EXISTS core.approval_limits (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- The role NAME as `identity.memberships` spells it. Not a FK: roles are a
    -- vocabulary in this codebase, not a table, and inventing one here would
    -- create a second place where a role can be defined.
    role_name        TEXT NOT NULL CHECK (length(btrim(role_name)) > 0),

    -- What this role may approve without escalating. 0 is meaningful: "may
    -- approve nothing", which is not the same as having no row.
    max_amount       numeric(14,2) NOT NULL CHECK (max_amount >= 0),
    currency         TEXT NOT NULL DEFAULT 'GHS' CHECK (currency ~ '^[A-Z]{3}$'),

    -- What kind of decision the limit governs, so a workshop can trust a
    -- supervisor with parts but not with a refund.
    scope            TEXT NOT NULL DEFAULT 'repair_approval'
                     CHECK (scope IN ('repair_approval', 'quotation', 'purchase_order',
                                      'refund', 'credit_note', 'warranty_claim')),

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_approval_limit UNIQUE (organization_id, role_name, scope)
);

CREATE INDEX IF NOT EXISTS idx_limits_tenant ON core.approval_limits (tenant_id);
CREATE INDEX IF NOT EXISTS idx_limits_org    ON core.approval_limits (organization_id, scope);

-- ── what the workshop's documents and messages say ──────────────────────────

CREATE TABLE IF NOT EXISTS core.document_templates (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    template_key     TEXT NOT NULL CHECK (template_key ~ '^[a-z][a-z0-9_]{2,60}$'),
    -- A closed vocabulary, because a template whose channel is free text cannot
    -- be routed. `document` covers invoice/quotation footers and terms.
    channel          TEXT NOT NULL CHECK (channel IN ('document', 'email', 'sms', 'in_app')),

    name             TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    subject          TEXT,
    -- TEXT, never VARCHAR(n). Solar's truncation incident came from narrow
    -- VARCHARs meeting generated content (CLAUDE.md, schema rules).
    body             TEXT NOT NULL CHECK (length(btrim(body)) > 0),

    is_active        boolean NOT NULL DEFAULT true,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    -- An email with no subject line is a template that cannot be sent. Caught
    -- here rather than at send time, where the failure is invisible.
    CONSTRAINT ck_email_has_subject CHECK (channel <> 'email' OR subject IS NOT NULL),
    CONSTRAINT uq_template_key UNIQUE (organization_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_tmpl_tenant ON core.document_templates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tmpl_org    ON core.document_templates (organization_id, channel);

-- ── which notifications the workshop wants ──────────────────────────────────

CREATE TABLE IF NOT EXISTS core.notification_preferences (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- NULL = the organisation's default for everyone. A row naming a user
    -- overrides it for that user only.
    user_id          uuid REFERENCES identity.users(id) ON DELETE CASCADE,

    event_key        TEXT NOT NULL CHECK (event_key ~ '^[a-z][a-z0-9_.]{2,80}$'),
    channel          TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'in_app', 'push')),
    is_enabled       boolean NOT NULL DEFAULT true,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_notification_pref UNIQUE (organization_id, user_id, event_key, channel)
);

CREATE INDEX IF NOT EXISTS idx_notifpref_tenant ON core.notification_preferences (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifpref_org    ON core.notification_preferences (organization_id, event_key);

-- ── the workshop's own automation rules ─────────────────────────────────────
--
-- ⚠️ SAME CAVEAT AS approval_limits: this table RECORDS rules. The stage machine
-- in `repair` is what applies them. A rule row is not a running rule.

CREATE TABLE IF NOT EXISTS core.workflow_rules (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    name             TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    trigger_event    TEXT NOT NULL CHECK (trigger_event ~ '^[a-z][a-z0-9_.]{2,80}$'),
    action_kind      TEXT NOT NULL CHECK (action_kind IN ('notify', 'assign', 'require_approval',
                                                          'block_transition', 'set_priority')),
    -- Structured, so a rule can be read by code. jsonb rather than columns
    -- because the parameters differ per action_kind and a wide sparse table
    -- would be mostly NULL.
    action_config    jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Lower runs first. Two rules on the same event with the same order is a
    -- workshop's own business; ties break on created_at.
    execution_order  integer NOT NULL DEFAULT 100,
    is_active        boolean NOT NULL DEFAULT true,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_action_config_object CHECK (jsonb_typeof(action_config) = 'object'),
    CONSTRAINT uq_workflow_rule_name UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_wfrule_tenant ON core.workflow_rules (tenant_id);
CREATE INDEX IF NOT EXISTS idx_wfrule_org    ON core.workflow_rules (organization_id, trigger_event, execution_order);

-- ── the workshop's own external accounts (D7 / ADR-015) ─────────────────────
--
-- 🔴 BRING-YOUR-OWN-CONNECTION, AND THEREFORE THE MOST DANGEROUS TABLE HERE.
--
-- D7 says a tenant connects its OWN SMS gateway, payment merchant, SMTP or OBD
-- device, and that the app works fully with none configured. That means this
-- table exists to hold other people's account details — and the obvious
-- implementation, a `config jsonb` the UI writes whatever into, is a plaintext
-- credential store with extra steps.
--
-- So `config` is declared NON-SECRET and that is ENFORCED, not asked for: the
-- trigger below REFUSES any key whose name looks like a credential. Secrets go
-- to the platform secret store and only their reference is recorded here.
--
-- ⚠️ The guard is proven by INJECTION in verify/045, not asserted. A guard whose
-- failure has never been demonstrated is the defect class that has cost this
-- repository the most.

CREATE TABLE IF NOT EXISTS core.integrations (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    provider_kind    TEXT NOT NULL CHECK (provider_kind IN ('sms', 'email', 'payment',
                                                            'accounting', 'obd', 'storage')),
    provider_name    TEXT NOT NULL CHECK (length(btrim(provider_name)) > 0),

    status           TEXT NOT NULL DEFAULT 'disconnected'
                     CHECK (status IN ('disconnected', 'configured', 'connected', 'failed')),

    -- NON-SECRET settings only: sender id, region, account label, endpoint.
    config           jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- The NAME of the secret in the platform store. Never the secret.
    secret_ref       TEXT,

    last_checked_at  timestamptz,
    last_error       TEXT,

    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_integration_config_object CHECK (jsonb_typeof(config) = 'object'),
    CONSTRAINT uq_integration UNIQUE (organization_id, provider_kind, provider_name)
);

CREATE INDEX IF NOT EXISTS idx_integration_tenant ON core.integrations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_org    ON core.integrations (organization_id, provider_kind);

-- ── the credential guard ────────────────────────────────────────────────────
--
-- 🔴 FIRES ON INSERT *AND* UPDATE. Recorded twice in this repository (QC 030,
-- variations 032): a rule enforced on UPDATE alone is defeated by a direct
-- INSERT that states the end state, and a rule enforced on INSERT alone is
-- defeated by inserting empty and updating. Ask every trigger which statements
-- it fires on — that is the question that was not asked those two times.

CREATE OR REPLACE FUNCTION core.reject_secret_in_config()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    k text;
BEGIN
    FOREACH k IN ARRAY ARRAY(SELECT jsonb_object_keys(NEW.config)) LOOP
        IF k ~* '(secret|password|passwd|token|api_?key|private_?key|credential|auth)' THEN
            RAISE EXCEPTION
                'core.integrations.config may not carry credentials (key %). '
                'Store the secret in the platform secret store and record its '
                'name in secret_ref.', k
                USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_integration_no_secrets ON core.integrations;
CREATE TRIGGER trg_integration_no_secrets
    BEFORE INSERT OR UPDATE ON core.integrations
    FOR EACH ROW EXECUTE FUNCTION core.reject_secret_in_config();

-- ── row-level security ──────────────────────────────────────────────────────
--
-- Per-command policies, never a single `FOR ALL` with only USING. Postgres
-- reuses a USING clause as the WITH CHECK for INSERT, and that reuse is what
-- broke Solar's enterprise onboarding when FORCE was applied there.

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'core.opening_hours', 'core.service_categories', 'core.approval_limits',
        'core.document_templates', 'core.notification_preferences',
        'core.workflow_rules', 'core.integrations'
    ] LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', t);

        -- BOTH predicates. See the header: tenant alone is not isolation here,
        -- because a tenant in this database holds more than one organisation.
        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_select', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR SELECT USING '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id()))',
            'org_select', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR INSERT WITH CHECK '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id()))',
            'org_insert', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_update', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR UPDATE USING '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id())) '
            'WITH CHECK '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id()))',
            'org_update', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'org_delete', t);
        EXECUTE format(
            'CREATE POLICY %I ON %s FOR DELETE USING '
            '(identity.is_platform_admin() OR (tenant_id = identity.current_tenant_id() '
            'AND organization_id = identity.current_organization_id()))',
            'org_delete', t);
    END LOOP;
END $$;

-- The two publishable tables, and only those two. Copied from
-- `catalogue.mechanic_directory.public_read`, which is the proven precedent in
-- this database for "readable with no tenant context at all".
DROP POLICY IF EXISTS public_read ON core.opening_hours;
CREATE POLICY public_read ON core.opening_hours FOR SELECT USING (is_published);

DROP POLICY IF EXISTS public_read ON core.service_categories;
CREATE POLICY public_read ON core.service_categories FOR SELECT USING (is_published AND is_active);

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- ⚠️ THE REVOKES ARE NOT REDUNDANT — 006's ALTER DEFAULT PRIVILEGES grants
-- UPDATE and DELETE on every new table in these schemas, so a table that should
-- not be deletable is deletable unless this says otherwise.

GRANT SELECT, INSERT, UPDATE, DELETE ON core.opening_hours            TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE         ON core.service_categories       TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.approval_limits          TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE         ON core.document_templates       TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.notification_preferences TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE         ON core.workflow_rules           TO autoworkshop_app;
GRANT SELECT, INSERT, UPDATE         ON core.integrations             TO autoworkshop_app;

-- Deactivated, never deleted: a service category that has priced past jobs, a
-- template that produced past invoices, a rule that explains a past transition
-- and an integration that took a past payment must all remain readable. They
-- carry `is_active`; DELETE is withheld so the soft delete cannot be bypassed.
REVOKE DELETE ON core.service_categories, core.document_templates,
                 core.workflow_rules, core.integrations FROM autoworkshop_app;

-- No `INSERT INTO schema_migrations` here. `infrastructure/migrations/run.sh`
-- writes the ledger row WITH A CHECKSUM after the file applies; a row written
-- from inside the migration would carry no checksum and defeat the drift
-- detection the ledger exists for.

COMMIT;
