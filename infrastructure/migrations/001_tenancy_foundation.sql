-- ============================================================================
-- Migration 001 — tenancy foundation
--
-- Establishes the isolation model every later migration depends on:
--   tenant -> organization -> branch -> membership
-- plus the RLS helper functions and the standard policy shape.
--
-- Rules enforced here (docs/05-database/DATABASE_MIGRATIONS.md):
--   * TEXT, never VARCHAR(n), on free-text columns
--   * every tenant-owned table gets ENABLE + FORCE ROW LEVEL SECURITY
--   * FORCE matters — without it the table owner silently bypasses the policy
--   * audit columns on every tenant-owned table
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE SCHEMA IF NOT EXISTS identity;

-- ── session context helpers ─────────────────────────────────────────────────
-- The application sets these per transaction after validating Keycloak claims
-- and membership. They are NEVER derived from client input (`1.txt` §9).

CREATE OR REPLACE FUNCTION identity.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION identity.current_user_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION identity.current_role_name()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.current_role', true), ''), 'none');
$$;

-- Platform administration is the ONLY cross-tenant scope, and it is always
-- audited. Everything else is confined to one resolved tenant.
CREATE OR REPLACE FUNCTION identity.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT identity.current_role_name() IN ('admin', 'platform_administrator');
$$;

-- ── tenants ─────────────────────────────────────────────────────────────────
-- A tenant is the legal/commercial isolation boundary.

CREATE TABLE IF NOT EXISTS identity.tenants (
    id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'suspended', 'closed')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_at   timestamptz,
    updated_by   uuid
);

-- ── organizations ───────────────────────────────────────────────────────────
-- Organization types from `1.txt` Domain 1.

CREATE TABLE IF NOT EXISTS identity.organizations (
    id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    name         TEXT NOT NULL,
    org_type     TEXT NOT NULL
                 CHECK (org_type IN (
                   'vehicle_owner', 'individual_workshop', 'multi_branch_workshop',
                   'mobile_technician', 'parts_supplier', 'fleet_operator',
                   'insurance_company', 'towing_company', 'training_institution',
                   'platform_operator')),
    status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'suspended', 'closed')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid,
    updated_at   timestamptz,
    updated_by   uuid
);

CREATE INDEX IF NOT EXISTS idx_organizations_tenant ON identity.organizations(tenant_id);

-- ── branches ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS identity.branches (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    location        TEXT,
    operating_hours TEXT,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'closed')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_at      timestamptz,
    updated_by      uuid
);

CREATE INDEX IF NOT EXISTS idx_branches_tenant ON identity.branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branches_org    ON identity.branches(organization_id);

-- ── users ───────────────────────────────────────────────────────────────────
-- Authentication lives in Keycloak (ADR-005). This table holds the application
-- profile and links to the Keycloak subject. No password material is ever
-- stored here.

CREATE TABLE IF NOT EXISTS identity.users (
    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    keycloak_subject  TEXT NOT NULL UNIQUE,
    email             TEXT NOT NULL,
    display_name      TEXT NOT NULL,
    phone             TEXT,
    preferred_locale  TEXT NOT NULL DEFAULT 'en',
    status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'suspended', 'closed')),
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_at        timestamptz,
    updated_by        uuid
);

CREATE INDEX IF NOT EXISTS idx_users_email ON identity.users(lower(email));

-- ── memberships ─────────────────────────────────────────────────────────────
-- A user gains access ONLY through a membership. A user may belong to several
-- tenants, but every request resolves exactly one active tenant context.

CREATE TABLE IF NOT EXISTS identity.memberships (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,
    organization_id uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
    branch_id       uuid REFERENCES identity.branches(id) ON DELETE SET NULL,
    user_id         uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    role_name       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'revoked')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_at      timestamptz,
    updated_by      uuid,
    UNIQUE (organization_id, user_id, role_name)
);

CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON identity.memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user   ON identity.memberships(user_id);

-- ── row-level security ──────────────────────────────────────────────────────
-- ENABLE alone is not enough: without FORCE, the table owner bypasses the
-- policy entirely — which would silently defeat isolation in exactly the
-- environment where it matters most.

ALTER TABLE identity.tenants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.tenants       FORCE  ROW LEVEL SECURITY;
ALTER TABLE identity.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.organizations FORCE  ROW LEVEL SECURITY;
ALTER TABLE identity.branches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.branches      FORCE  ROW LEVEL SECURITY;
ALTER TABLE identity.memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.memberships   FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON identity.tenants;
CREATE POLICY tenant_isolation ON identity.tenants
    USING (identity.is_platform_admin() OR id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR id = identity.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON identity.organizations;
CREATE POLICY tenant_isolation ON identity.organizations
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON identity.branches;
CREATE POLICY tenant_isolation ON identity.branches
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON identity.memberships;
CREATE POLICY tenant_isolation ON identity.memberships
    USING (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id())
    WITH CHECK (identity.is_platform_admin() OR tenant_id = identity.current_tenant_id());

-- identity.users is deliberately NOT tenant-scoped: one human may hold
-- memberships in several tenants. Visibility of a user is granted through
-- membership joins, which ARE tenant-scoped.

-- ── audit log (append-only) ─────────────────────────────────────────────────
-- `1.txt` §55: audit records are tamper-resistant and separate from ordinary
-- application logs. Enforced with rules rather than convention.

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.events (
    id               bigserial PRIMARY KEY,
    occurred_at      timestamptz NOT NULL DEFAULT now(),
    tenant_id        uuid,
    organization_id  uuid,
    actor_user_id    uuid,
    actor_agent_id   TEXT,
    actor_kind       TEXT NOT NULL DEFAULT 'user'
                     CHECK (actor_kind IN ('user', 'agent', 'system')),
    action           TEXT NOT NULL,
    resource_type    TEXT,
    resource_id      TEXT,
    correlation_id   TEXT,
    approval_status  TEXT,
    result           TEXT NOT NULL DEFAULT 'success'
                     CHECK (result IN ('success', 'denied', 'error')),
    detail           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit.events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit.events(correlation_id);

-- Append-only. An audit trail that can be edited is not an audit trail.
CREATE OR REPLACE RULE audit_events_no_update AS
    ON UPDATE TO audit.events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_events_no_delete AS
    ON DELETE TO audit.events DO INSTEAD NOTHING;

COMMIT;
