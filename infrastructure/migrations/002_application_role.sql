-- ============================================================================
-- Migration 002 — the non-superuser application role
--
-- WHY THIS EXISTS
--
-- Migration 001 enabled ENABLE + FORCE ROW LEVEL SECURITY on every tenant-owned
-- table. That is necessary but NOT sufficient: **a superuser bypasses RLS
-- entirely, even with FORCE**. The bootstrap role created by POSTGRES_USER is a
-- superuser, so an application connecting as that role would have row-level
-- security silently switched off — every policy present, none of them applied.
--
-- This was caught by running tests/tenant-isolation/rls_proof.sql against a
-- live database: tenant A could see 2 organizations when it should have seen 1.
-- The policies were correct; the connecting role was wrong.
--
-- RULE: the application connects as `autoworkshop_app`, NEVER as the bootstrap
-- superuser. The isolation proof runs as `autoworkshop_app` for the same
-- reason — a proof run as a superuser proves nothing.
-- ============================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autoworkshop_app') THEN
        -- NOSUPERUSER / NOBYPASSRLS are the entire point of this role.
        CREATE ROLE autoworkshop_app
            LOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOBYPASSRLS
            PASSWORD 'change_me_locally';
    ELSE
        -- Enforce the properties even if the role predates this migration.
        ALTER ROLE autoworkshop_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END $$;

GRANT CONNECT ON DATABASE autoworkshop TO autoworkshop_app;

GRANT USAGE ON SCHEMA identity TO autoworkshop_app;
GRANT USAGE ON SCHEMA audit    TO autoworkshop_app;
GRANT USAGE ON SCHEMA public   TO autoworkshop_app;

-- Least privilege: DML only. No DDL — schema change belongs to migrations,
-- which run as the owner, not to the running application.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO autoworkshop_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA identity TO autoworkshop_app;

-- audit.events is append-only: INSERT and SELECT only. The DO INSTEAD NOTHING
-- rules from 001 are belt; withholding UPDATE/DELETE here is braces.
GRANT SELECT, INSERT ON audit.events TO autoworkshop_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO autoworkshop_app;

GRANT SELECT ON public.schema_migrations TO autoworkshop_app;

-- Future tables in these schemas inherit the same grants, so a later migration
-- cannot accidentally create a table the application cannot reach — or one it
-- can reach with more privilege than intended.
ALTER DEFAULT PRIVILEGES IN SCHEMA identity
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO autoworkshop_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA identity
    GRANT USAGE, SELECT ON SEQUENCES TO autoworkshop_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit
    GRANT SELECT, INSERT ON TABLES TO autoworkshop_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit
    GRANT USAGE, SELECT ON SEQUENCES TO autoworkshop_app;

COMMIT;
