-- ============================================================================
-- Tenant isolation proof.
--
-- This is the single most important test in the platform. Cross-tenant exposure
-- is a Severity-1 incident (docs/04-security/TENANT_ISOLATION.md), so the
-- isolation claim is PROVEN against a real database rather than asserted in a
-- document.
--
-- It runs as a non-superuser. Superusers bypass RLS entirely, so a "passing"
-- run as postgres would prove nothing at all.
--
-- Exit code 0 = isolation holds. Any raised exception = isolation is broken.
-- ============================================================================

\set ON_ERROR_STOP on

-- ── arrange: two tenants, each with an organization and a branch ────────────
-- NOTE: `current_role` is a RESERVED KEYWORD in PostgreSQL, so
--   SET LOCAL app.current_role = '...'
-- is a syntax error. set_config() is the only working form. This is the
-- same reason Solar's RLS seeding needed set_config().
-- `true` = transaction-local. psql runs each statement in its OWN implicit
-- transaction, so a transaction-local setting would evaporate before the very
-- next INSERT. Seeding therefore uses `false` (session-scoped).
--
-- The application does the opposite on purpose: it sets context with `true`
-- INSIDE the same transaction as the query, so a pooled connection cannot carry
-- one tenant's context into the next request. See tenantSessionStatements().
SELECT set_config('app.current_role', 'admin', false);  -- session-scoped, seeding only

INSERT INTO identity.tenants (id, name, slug)
VALUES ('11111111-1111-1111-1111-111111111111', 'Tenant A', 'tenant-a'),
       ('22222222-2222-2222-2222-222222222222', 'Tenant B', 'tenant-b')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO identity.organizations (id, tenant_id, name, org_type)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Alpha Motors', 'individual_workshop'),
       ('bbbbbbbb-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', 'Beta Auto',    'individual_workshop')
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.branches (id, tenant_id, organization_id, name)
VALUES ('aaaaaaaa-0000-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 'Alpha Accra'),
       ('bbbbbbbb-0000-0000-0000-000000000002',
        '22222222-2222-2222-2222-222222222222',
        'bbbbbbbb-0000-0000-0000-000000000001', 'Beta Kumasi')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
    visible_orgs      int;
    visible_branches  int;
    leaked            int;
BEGIN
    -- ── act: become tenant A, with a non-admin role ─────────────────────────
    PERFORM set_config('app.current_role', 'workshop_owner', true);
    PERFORM set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);

    -- ── assert 1: tenant A sees exactly its own organization ────────────────
    SELECT count(*) INTO visible_orgs FROM identity.organizations;
    IF visible_orgs <> 1 THEN
        RAISE EXCEPTION 'ISOLATION BROKEN: tenant A sees % organizations, expected 1', visible_orgs;
    END IF;

    -- ── assert 2: tenant A cannot see tenant B by direct id ─────────────────
    SELECT count(*) INTO leaked
    FROM identity.organizations
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
    IF leaked <> 0 THEN
        RAISE EXCEPTION 'ISOLATION BROKEN: tenant A read tenant B organization by id';
    END IF;

    -- ── assert 3: branches are isolated too ─────────────────────────────────
    SELECT count(*) INTO visible_branches FROM identity.branches;
    IF visible_branches <> 1 THEN
        RAISE EXCEPTION 'ISOLATION BROKEN: tenant A sees % branches, expected 1', visible_branches;
    END IF;

    -- ── assert 4: tenant A cannot WRITE into tenant B ───────────────────────
    -- WITH CHECK must reject this. If it succeeds, one tenant can plant rows
    -- inside another — worse than a read leak.
    BEGIN
        INSERT INTO identity.organizations (tenant_id, name, org_type)
        VALUES ('22222222-2222-2222-2222-222222222222', 'Injected', 'individual_workshop');
        RAISE EXCEPTION 'ISOLATION BROKEN: tenant A wrote a row into tenant B';
    EXCEPTION
        WHEN insufficient_privilege OR check_violation THEN
            NULL;  -- expected: the WITH CHECK clause refused it
    END;

    -- ── assert 5: the other direction, to rule out a one-way policy bug ─────
    PERFORM set_config('app.tenant_id', '22222222-2222-2222-2222-222222222222', true);
    SELECT count(*) INTO leaked
    FROM identity.organizations
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
    IF leaked <> 0 THEN
        RAISE EXCEPTION 'ISOLATION BROKEN: tenant B read tenant A organization';
    END IF;

    -- ── assert 6: no tenant context = no rows, never all rows ───────────────
    -- Fail closed. A missing context must not silently mean "unrestricted".
    PERFORM set_config('app.tenant_id', '', true);
    SELECT count(*) INTO visible_orgs FROM identity.organizations;
    IF visible_orgs <> 0 THEN
        RAISE EXCEPTION 'FAIL-OPEN: no tenant context exposed % organizations', visible_orgs;
    END IF;

    RAISE NOTICE 'TENANT ISOLATION: all 6 assertions passed';
END $$;

-- ── audit log must be append-only ───────────────────────────────────────────
DO $$
DECLARE
    before_count int;
    after_count  int;
BEGIN
    INSERT INTO audit.events (action, actor_kind, result)
    VALUES ('rls.proof', 'system', 'success');

    SELECT count(*) INTO before_count FROM audit.events WHERE action = 'rls.proof';

    UPDATE audit.events SET action = 'tampered' WHERE action = 'rls.proof';
    DELETE FROM audit.events WHERE action = 'rls.proof';

    SELECT count(*) INTO after_count FROM audit.events WHERE action = 'rls.proof';

    IF after_count <> before_count THEN
        RAISE EXCEPTION 'AUDIT MUTABLE: % rows before, % after update+delete', before_count, after_count;
    END IF;

    RAISE NOTICE 'AUDIT APPEND-ONLY: update and delete were both refused';
END $$;
