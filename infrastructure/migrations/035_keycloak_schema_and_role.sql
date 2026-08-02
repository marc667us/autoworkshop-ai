-- ============================================================================
-- Migration 035 — a schema and a role for Keycloak
--
-- WHY THIS EXISTS
--
-- Keycloak needs a database. The zero-cost rule (CLAUDE.md §1) means it
-- cohabits `autoworkshop` rather than getting an instance of its own, which is
-- Solar's arrangement too — but cohabiting is only acceptable with a real
-- boundary, and this migration is that boundary.
--
-- 🔴 A SEPARATE SCHEMA AND A SEPARATE ROLE, NOT THE APPLICATION'S.
--
-- Keycloak owns its tables completely: it creates them, migrates them between
-- versions, and reads user credentials out of them. Letting it connect as
-- `autoworkshop_app` would mean:
--
--   * the identity provider could read and write every business table, so a
--     Keycloak compromise would be a total data compromise rather than an
--     authentication one; and
--   * `autoworkshop_app` could read Keycloak's credential tables — which
--     inverts the whole point of putting authentication behind an IdP.
--
-- `keycloak_app` therefore gets its own schema and NOTHING outside it. It is
-- NOSUPERUSER and NOBYPASSRLS for the same reason 002 gives: a superuser
-- silently bypasses every RLS policy on this database, FORCE included.
--
-- ⚠️ NO PASSWORD IS SET HERE. The role is created with none, and the deploy
-- workflow issues `ALTER ROLE ... PASSWORD` from a GitHub secret. A password in
-- a migration is a credential in git history — and unlike a leaked key it
-- cannot be rotated away, because the file is the record.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS keycloak;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keycloak_app') THEN
        -- NOLOGIN until a password is set: a LOGIN role with no password is
        -- refused by password auth anyway, but this makes the intent explicit
        -- rather than relying on that.
        CREATE ROLE keycloak_app
            NOLOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOBYPASSRLS;
    ELSE
        ALTER ROLE keycloak_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END $$;

GRANT CONNECT ON DATABASE autoworkshop TO keycloak_app;

-- Keycloak creates and alters its own tables, so it needs CREATE on its schema.
-- That authority stops at the schema boundary.
GRANT USAGE, CREATE ON SCHEMA keycloak TO keycloak_app;

-- ⚠️ AND EXPLICITLY NOTHING ELSE. `public` carries the migration ledger, and
-- the business data lives in identity/core/repair/catalogue/audit. Revoking is
-- not redundant: Postgres grants CREATE and USAGE on `public` to PUBLIC by
-- default in older versions, and a role that can create objects in `public`
-- can shadow a table name that unqualified SQL then resolves to.
REVOKE ALL ON SCHEMA public FROM keycloak_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM keycloak_app;

DO $$
DECLARE
    s text;
BEGIN
    FOREACH s IN ARRAY ARRAY['identity', 'core', 'repair', 'catalogue', 'audit']
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = s) THEN
            EXECUTE format('REVOKE ALL ON SCHEMA %I FROM keycloak_app', s);
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM keycloak_app', s);
        END IF;
    END LOOP;
END $$;

-- The application role has no business inside Keycloak's schema either. The
-- boundary is refused in BOTH directions, because "the app can read the
-- credential store" is the more damaging half.
REVOKE ALL ON SCHEMA keycloak FROM autoworkshop_app;

COMMIT;
