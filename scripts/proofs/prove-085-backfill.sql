-- Adversarial proof of migration 085's backfill, run in a transaction and
-- ROLLED BACK. Two organisations are built by hand in the pre-085 shape:
--
--   ORG A (the normal case) — founder created their own membership and is the
--          earliest member; a later assessor was added by the founder.
--          EXPECT: the founder is promoted, the later assessor is NOT.
--
--   ORG B (Codex's failing case) — the earliest membership was created by
--          SOMEBODY ELSE; a LATER membership has created_by = user_id.
--          EXPECT: nobody is promoted. The first version of the backfill
--          promoted the later self-created row, which is privilege escalation.
BEGIN;
SELECT set_config('app.current_role', 'admin', true);

DO $prove$
DECLARE
    t_a uuid := gen_random_uuid();  o_a uuid := gen_random_uuid();  b_a uuid := gen_random_uuid();
    t_b uuid := gen_random_uuid();  o_b uuid := gen_random_uuid();  b_b uuid := gen_random_uuid();
    u_founder uuid; u_late uuid; u_admin uuid; u_selfmade uuid;
    m_a_founder uuid := gen_random_uuid();  m_a_late uuid := gen_random_uuid();
    m_b_first   uuid := gen_random_uuid();  m_b_self uuid := gen_random_uuid();
    r TEXT;
BEGIN
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), 'prove085-f-'||gen_random_uuid(), 'f'||gen_random_uuid()||'@p.local', 'Founder', 'active') RETURNING id INTO u_founder;
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), 'prove085-l-'||gen_random_uuid(), 'l'||gen_random_uuid()||'@p.local', 'Later', 'active') RETURNING id INTO u_late;
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), 'prove085-a-'||gen_random_uuid(), 'a'||gen_random_uuid()||'@p.local', 'Admin', 'active') RETURNING id INTO u_admin;
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), 'prove085-s-'||gen_random_uuid(), 's'||gen_random_uuid()||'@p.local', 'SelfMade', 'active') RETURNING id INTO u_selfmade;

    -- ORG A
    INSERT INTO identity.tenants (id, name, slug, status, created_by) VALUES (t_a, 'Prove A', 'prove-a-'||substr(replace(t_a::text,'-',''),1,8), 'active', u_founder);
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by) VALUES (o_a, t_a, 'Prove A', 'insurance_company', 'active', u_founder);
    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by) VALUES (b_a, t_a, o_a, 'HQ', 'active', u_founder);
    INSERT INTO identity.memberships (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by, created_at)
    VALUES (m_a_founder, t_a, o_a, b_a, u_founder, 'insurance_assessor', 'active', u_founder, now() - interval '2 day');
    INSERT INTO identity.memberships (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by, created_at)
    VALUES (m_a_late, t_a, o_a, b_a, u_late, 'insurance_assessor', 'active', u_founder, now() - interval '1 day');

    -- ORG B — first member created by someone else
    INSERT INTO identity.tenants (id, name, slug, status, created_by) VALUES (t_b, 'Prove B', 'prove-b-'||substr(replace(t_b::text,'-',''),1,8), 'active', u_admin);
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by) VALUES (o_b, t_b, 'Prove B', 'insurance_company', 'active', u_admin);
    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by) VALUES (b_b, t_b, o_b, 'HQ', 'active', u_admin);
    INSERT INTO identity.memberships (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by, created_at)
    VALUES (m_b_first, t_b, o_b, b_b, u_late, 'insurance_assessor', 'active', u_admin, now() - interval '2 day');
    INSERT INTO identity.memberships (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by, created_at)
    VALUES (m_b_self, t_b, o_b, b_b, u_selfmade, 'insurance_assessor', 'active', u_selfmade, now() - interval '1 day');

    -- ══ THE BACKFILL, copied verbatim from migration 085 ══
    WITH ranked AS (
        SELECT m.id, m.created_by, m.user_id, m.role_name, o.org_type,
               row_number() OVER (PARTITION BY m.organization_id ORDER BY m.created_at ASC, m.id ASC) AS rn
          FROM identity.memberships m
          JOIN identity.organizations o ON o.id = m.organization_id AND o.tenant_id = m.tenant_id
         WHERE o.org_type IN ('insurance_company', 'towing_company')
    ),
    founders AS (
        SELECT id, org_type FROM ranked WHERE rn = 1 AND created_by = user_id
    )
    UPDATE identity.memberships m
       SET role_name = CASE f.org_type WHEN 'insurance_company' THEN 'insurance_owner' ELSE 'towing_owner' END,
           updated_at = now()
      FROM founders f
     WHERE m.id = f.id AND m.role_name IN ('insurance_assessor', 'towing_operator');

    -- ══ ASSERTIONS ══
    SELECT role_name INTO r FROM identity.memberships WHERE id = m_a_founder;
    IF r <> 'insurance_owner' THEN RAISE EXCEPTION 'FAIL A1: founder is %, expected insurance_owner', r; END IF;

    SELECT role_name INTO r FROM identity.memberships WHERE id = m_a_late;
    IF r <> 'insurance_assessor' THEN RAISE EXCEPTION 'FAIL A2: the LATER assessor was promoted to % — privilege escalation', r; END IF;

    SELECT role_name INTO r FROM identity.memberships WHERE id = m_b_first;
    IF r <> 'insurance_assessor' THEN RAISE EXCEPTION 'FAIL B1: admin-created first member became %', r; END IF;

    SELECT role_name INTO r FROM identity.memberships WHERE id = m_b_self;
    IF r <> 'insurance_assessor' THEN
        RAISE EXCEPTION 'FAIL B2 — THE CODEX CASE: the later SELF-CREATED row was promoted to %. '
                        'This is exactly what the first version of the backfill did.', r;
    END IF;

    RAISE NOTICE 'PROVEN: A-founder promoted; A-later NOT; B-first NOT; B-selfmade NOT (the Codex case is refused).';
END;
$prove$;

ROLLBACK;
