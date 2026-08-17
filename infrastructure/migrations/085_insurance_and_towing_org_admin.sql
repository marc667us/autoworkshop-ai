-- 085 — insurance and towing get an ORG ADMIN, the way supplier and fleet have one.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS: TWO OF THE SIX SELF-SERVICE ORGANISATION TYPES COULD NEVER
-- APPOINT ANYBODY.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Measured on 2026-08-16 and re-measured on 2026-08-17 before writing this:
--
--     CAN_GRANT_MEMBERSHIP  (apps/api/src/identity/membership.service.ts:35)
--       = { platform_administrator, workshop_owner,
--           supplier_owner, fleet_administrator }
--
-- `insurance_assessor` is not in it. `towing_operator` is not in it. That set
-- is the ONLY gate on granting, `membership.service.ts:345` is the ONLY
-- `INSERT INTO identity.memberships` in the entire API, and migration 080
-- writes just the founder's own membership. Three independent measurements,
-- one conclusion: **an insurance company or a towing firm could create exactly
-- one member — the founder — and never a second one, for ever.**
--
-- Ten insurance screens and ten towing screens exist above a team that cannot
-- be built. This is the same defect class as the five roles that had no
-- production writer (`customer`, `supplier_owner`, `fleet_administrator`,
-- `insurance_assessor`/`towing_operator`, `platform_administrator`) — and it
-- was found by asking that same question of a role BEFORE building it, which
-- is what stopped `claims_approver` from becoming the sixth.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE SHAPE, AND THE TWO ALTERNATIVES THAT WERE REJECTED
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Chosen: a distinct org-admin role per organisation type — `insurance_owner`
-- and `towing_owner` — exactly mirroring `supplier_owner` and
-- `fleet_administrator`, which already work this way. The founder becomes the
-- org admin; the operational role stays operational.
--
-- REJECTED 1 — add `insurance_assessor` to `CAN_GRANT_MEMBERSHIP`. Cheapest,
-- one line, and wrong: it hands the person who ASSESSES claims the authority
-- to appoint the person who APPROVES them. The separation of duty that the
-- insurance-governance slice exists to create would not exist in practice.
--
-- REJECTED 2 — platform-administrator-only appointment. Honest, but it makes
-- every appointment a support ticket. That is an operating procedure, not a
-- product, and this repository has already rejected the identical argument
-- once: it is why the admin insurance-verification SCREEN was built rather
-- than leaving verification to hand-called API endpoints.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY A NEW NUMBER RATHER THAN AN EDIT TO 080
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 080 is applied and checksummed. Editing an applied migration was an error
-- made on 2026-08-14 and the rule it produced has no exception: a fix goes in
-- the next number. `CREATE OR REPLACE FUNCTION` is the supported way to change
-- a function's body without touching the migration that first created it.
--
-- ⚠️ `CREATE OR REPLACE FUNCTION` HAS NO PARTIAL FORM — 080 says so itself, at
-- its own line 436. Each function below is REPRODUCED IN FULL from 080 with
-- exactly one literal changed, because there is no way to replace only the
-- INSERT. The bodies were read from 080 rather than remembered.

-- ── 1. the insurer's founder is the insurer's ADMIN ─────────────────────────

CREATE OR REPLACE FUNCTION identity.register_insurer(
    p_subject       TEXT,
    p_insurer_name  TEXT,
    p_location_name TEXT
)
-- ⚠️ THE `o_` PREFIX IS LOAD-BEARING — 061's note, inherited. A `RETURNS TABLE`
-- column is an ordinary plpgsql variable inside the body, so a column named
-- `organization_id` makes every unqualified reference ambiguous, and plpgsql
-- resolves identifiers when the statement FIRST EXECUTES. The failure is at
-- runtime; `CREATE FUNCTION` reports success either way.
RETURNS TABLE (
    o_tenant_id       uuid,
    o_organization_id uuid,
    o_branch_id       uuid,
    o_membership_id   uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, pg_catalog, pg_temp
AS $$
DECLARE
    v_user   uuid;
    v_tenant uuid;
    v_org    uuid;
    v_branch uuid;
    v_member uuid;
    v_slug   TEXT;
BEGIN
    IF p_insurer_name IS NULL OR btrim(p_insurer_name) = '' THEN
        RAISE EXCEPTION 'an insurance company needs a name';
    END IF;

    SELECT id INTO v_user
      FROM identity.users
     WHERE keycloak_subject = p_subject
       AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no active application user for this identity';
    END IF;

    -- The per-identity advisory lock, unchanged from 080. The KEY IS THE
    -- IDENTITY, NOT THE KIND: it serialises one person's registrations across
    -- ALL five doors. `_xact_`, so it is released when the transaction ends
    -- including on the exception paths below.
    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));

    -- ── the door opens here, and only here ─────────────────────────────────
    PERFORM set_config('app.bootstrap',      'on',         true);
    PERFORM set_config('app.bootstrap_user', v_user::text, true);

    -- One organisation per person. AFTER the flag is set AND after the lock:
    -- under FORCE RLS with no tenant context this read returns zero rows for
    -- everybody, so placing it earlier would make it a check that cannot fire.
    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register an insurance company, or ask a platform administrator to add you to an existing one.';
    END IF;

    v_slug := regexp_replace(lower(btrim(p_insurer_name)), '[^a-z0-9]+', '-', 'g');
    v_slug := btrim(v_slug, '-');
    IF v_slug = '' THEN
        v_slug := 'insurer';
    END IF;
    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    v_tenant := gen_random_uuid();
    v_org    := gen_random_uuid();
    v_branch := gen_random_uuid();
    v_member := gen_random_uuid();

    INSERT INTO identity.tenants (id, name, slug, status, created_by)
    VALUES (v_tenant, btrim(p_insurer_name), v_slug, 'active', v_user);

    -- 🔴 LITERAL 1 of 2: `insurance_company`, one of the ten values
    -- `organizations_org_type_check` admits. Not `insurer`, which is plausible
    -- and absent; `register_workshop` died on exactly that mistake.
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
    VALUES (v_org, v_tenant, btrim(p_insurer_name), 'insurance_company', 'active', v_user);

    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
    VALUES (v_branch, v_tenant, v_org,
            COALESCE(NULLIF(btrim(p_location_name), ''), 'Head office'),
            'active', v_user);

    -- 🔴 LITERAL 2 of 2, AND THE ONE LINE 085 CHANGES: `insurance_owner`, not
    -- `insurance_assessor`.
    --
    -- The founder registers the COMPANY, so the founder is its administrator.
    -- Writing the operational role here is what left insurers unable to appoint
    -- anyone: `insurance_assessor` is not in `CAN_GRANT_MEMBERSHIP`, so the only
    -- member an insurer had was also the only member it could ever have.
    --
    -- ⚠️ The spelling must match `permission-matrix.ts` and `membership.service.ts`
    -- exactly. Two literals in two files that cannot be type-checked into
    -- agreement is this repository's most-recorded root cause, which is why
    -- `verify/085` asserts the role written here against those allow-lists.
    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'insurance_owner', 'active', v_user);

    -- Queued INSIDE the same transaction that creates the insurer.
    INSERT INTO identity.organization_registrations
        (tenant_id, organization_id, kind, status, submitted_by)
    VALUES (v_tenant, v_org, 'insurance', 'pending', v_user);

    -- ── and the door closes ────────────────────────────────────────────────
    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

COMMENT ON FUNCTION identity.register_insurer(TEXT, TEXT, TEXT) IS
'Self-service registration for an insurance company: creates a tenant, an '
'insurance_company organisation, one office and an INSURANCE_OWNER membership '
'for the CALLER, resolved from the token subject, and queues the company for '
'admin verification. The role and the org type are literals, never parameters. '
'085 changed the founder role from insurance_assessor to insurance_owner: the '
'assessor role cannot grant memberships, so an insurer founded before 085 '
'could never appoint a second member. insurance_owner is the org admin, '
'mirroring supplier_owner and fleet_administrator. NOTE: it may grant any role '
'the insurance_company organisation admits — which includes insurance_owner '
'itself, because there is no grantor-to-target hierarchy in this codebase. An '
'earlier draft of this comment said it grants "insurance_assessor (and later '
'claims_approver)", which described an intention rather than the rule.';

-- ── 2. the towing firm's founder is the towing firm's ADMIN ────────────────

CREATE OR REPLACE FUNCTION identity.register_towing_operator(
    p_subject       TEXT,
    p_company_name  TEXT,
    p_location_name TEXT
)
RETURNS TABLE (
    o_tenant_id       uuid,
    o_organization_id uuid,
    o_branch_id       uuid,
    o_membership_id   uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, pg_catalog, pg_temp
AS $$
DECLARE
    v_user   uuid;
    v_tenant uuid;
    v_org    uuid;
    v_branch uuid;
    v_member uuid;
    v_slug   TEXT;
BEGIN
    IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
        RAISE EXCEPTION 'a towing company needs a name';
    END IF;

    SELECT id INTO v_user
      FROM identity.users
     WHERE keycloak_subject = p_subject
       AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no active application user for this identity';
    END IF;

    -- Same per-identity lock as the other four doors. See `register_insurer`.
    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));

    PERFORM set_config('app.bootstrap',      'on',         true);
    PERFORM set_config('app.bootstrap_user', v_user::text, true);

    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a towing company, or ask a platform administrator to add you to an existing one.';
    END IF;

    v_slug := regexp_replace(lower(btrim(p_company_name)), '[^a-z0-9]+', '-', 'g');
    v_slug := btrim(v_slug, '-');
    IF v_slug = '' THEN
        v_slug := 'towing';
    END IF;
    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    v_tenant := gen_random_uuid();
    v_org    := gen_random_uuid();
    v_branch := gen_random_uuid();
    v_member := gen_random_uuid();

    INSERT INTO identity.tenants (id, name, slug, status, created_by)
    VALUES (v_tenant, btrim(p_company_name), v_slug, 'active', v_user);

    -- 🔴 LITERAL 1 of 2: `towing_company`.
    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
    VALUES (v_org, v_tenant, btrim(p_company_name), 'towing_company', 'active', v_user);

    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
    VALUES (v_branch, v_tenant, v_org,
            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main depot'),
            'active', v_user);

    -- 🔴 LITERAL 2 of 2, AND THE ONE LINE 085 CHANGES: `towing_owner`.
    -- Same reasoning as `register_insurer` above — the founder is the admin.
    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'towing_owner', 'active', v_user);

    INSERT INTO identity.organization_registrations
        (tenant_id, organization_id, kind, status, submitted_by)
    VALUES (v_tenant, v_org, 'towing', 'pending', v_user);

    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

COMMENT ON FUNCTION identity.register_towing_operator(TEXT, TEXT, TEXT) IS
'Self-service registration for a towing company: creates a tenant, a '
'towing_company organisation, one depot and a TOWING_OWNER membership for the '
'CALLER, resolved from the token subject, and queues the company for admin '
'verification. 085 changed the founder role from towing_operator to '
'towing_owner for the same reason as register_insurer: the operator role '
'cannot grant memberships, so a towing firm founded before 085 could never '
'appoint a driver or a second operator.';

-- ── 3. the founders who already exist ──────────────────────────────────────
--
-- 🔴 A MIGRATION THAT ONLY FIXES THE FUTURE LEAVES EVERY EXISTING INSURER AND
-- TOWING FIRM PERMANENTLY UNABLE TO BUILD A TEAM. The whole defect is about
-- organisations that exist; skipping the backfill would fix the door and leave
-- everyone already inside it stuck.
--
-- WHO IS A FOUNDER, defined so the rule is auditable rather than guessed:
-- the registration functions above insert the founder with
-- `created_by = user_id` (they created their own membership — nobody else
-- could have, since the organisation did not exist a moment earlier), and it
-- is the organisation's EARLIEST membership. Both conditions are required:
--
--   · `created_by = user_id` alone would also match a hypothetical
--     self-granted row, and
--   · "earliest" alone would match an organisation whose first member was
--     added by someone else.
--
-- ⚠️ DELIBERATELY NOT `UPDATE ... WHERE role_name = 'insurance_assessor'`.
-- That would promote EVERY assessor in the organisation to administrator —
-- turning a fix for a missing write path into a privilege escalation for
-- every existing member. Exactly one membership per organisation changes.
-- 🔴 TWO DEFECTS CODEX FOUND IN THE FIRST VERSION OF THIS BLOCK, 2026-08-17.
-- Both are recorded because each was invisible on this workstation and only
-- one of them would have been visible in production.
--
-- 1. IT RAN WITHOUT AN ADMIN CONTEXT, SO ON RENDER IT WOULD HAVE UPDATED
--    NOTHING. `identity.memberships` and `identity.organizations` are under
--    FORCE ROW LEVEL SECURITY. Locally the migration owner is a SUPERUSER and
--    bypasses RLS, so the backfill worked and every check passed. On Render the
--    owner is NOT a superuser: the CTE would have seen zero rows, promoted
--    nobody, and the guard below — which DOES set the admin context — would
--    then have found every existing insurer stranded and ABORTED THE MIGRATION.
--    A green local apply over a change that cannot work in production is this
--    repository's most expensive recorded trap, and it caught this file.
--
-- 2. THE FOUNDER RULE PICKED THE EARLIEST *SELF-CREATED* ROW, NOT THE EARLIEST
--    ROW. Filtering on `created_by = user_id` BEFORE ordering means that if an
--    organisation's first membership was created by somebody else, a later
--    self-created assessor became "the founder" and was promoted to
--    administrator. That is privilege escalation, produced by a predicate
--    written in the wrong order. Ranking now happens over ALL of the
--    organisation's memberships, and the winner must ALSO satisfy the founder
--    predicate — if it does not, nobody is promoted and the guard reports it.
DO $backfill$
DECLARE
    v_promoted INT;
BEGIN
    -- BEFORE the write, not after. See defect 1 above.
    PERFORM set_config('app.current_role', 'admin', true);

    WITH ranked AS (
        -- Every membership of every insurance/towing organisation, ranked by
        -- age. Deliberately NOT filtered by role or creator — the filter is
        -- what broke this, and rank must be computed over the real population.
        SELECT m.id,
               m.created_by,
               m.user_id,
               m.role_name,
               o.org_type,
               row_number() OVER (PARTITION BY m.organization_id
                                      ORDER BY m.created_at ASC, m.id ASC) AS rn
          FROM identity.memberships m
          JOIN identity.organizations o
            ON o.id = m.organization_id
           AND o.tenant_id = m.tenant_id
         WHERE o.org_type IN ('insurance_company', 'towing_company')
           -- 🔴 `status = 'active'` IS PRODUCTION-BLOCKING IF OMITTED, and it was
           -- omitted until the Supervisor pass on 2026-08-17.
           --
           -- Without it `ranked` includes REVOKED and SUSPENDED rows, so an
           -- organisation whose founder has left is ranked on a dead membership:
           -- that row gets promoted, while the guard below requires an ACTIVE
           -- org admin — so the guard RAISES, the whole migration rolls back,
           -- and `apply-migrations` goes red with a message blaming the founder
           -- predicate rather than the status. Every migration after 085 is then
           -- blocked behind it.
           --
           -- The two halves must ask the SAME question. They did not.
           AND m.status = 'active'
    ),
    founders AS (
        SELECT id, org_type
          FROM ranked
         WHERE rn = 1                       -- the organisation's FIRST member
           AND created_by = user_id         -- who created their own membership
    )
    UPDATE identity.memberships m
       SET role_name = CASE f.org_type
                         WHEN 'insurance_company' THEN 'insurance_owner'
                         ELSE 'towing_owner'
                       END,
           updated_at = now()
      FROM founders f
     WHERE m.id = f.id
       -- Idempotent: a row already carrying the org-admin role is left alone,
       -- so re-running this migration promotes nothing a second time.
       AND m.role_name IN ('insurance_assessor', 'towing_operator');

    GET DIAGNOSTICS v_promoted = ROW_COUNT;
    RAISE NOTICE '085: promoted % founder membership(s) to the org-admin role', v_promoted;
END;
$backfill$;

-- ── 4. prove the backfill did what it claims, in the same transaction ───────
--
-- 🔴 AN ORPHAN CHECK THAT RUNS AFTER COMMIT IS A REPORT, NOT A GUARD. This
-- RAISEs inside the migration's own transaction, so a failure rolls the whole
-- thing back rather than leaving a half-migrated role vocabulary.
--
-- ⚠️ AND IT MUST BE ABLE TO SEE THE ROWS. This migration runs as the owner
-- credential; under FORCE RLS a check with no tenant context reads zero rows
-- and "passes" vacuously — the failure mode recorded on 2026-08-16, where a
-- diagnostic reported `(0 rows)` because its `set_config` was transaction-local
-- and had already been discarded. `app.current_role` is set LOCAL here, which
-- is correct precisely because this IS one transaction.
DO $$
DECLARE
    v_stranded INT;
BEGIN
    PERFORM set_config('app.current_role', 'admin', true);

    -- An insurance or towing organisation with NO member who can grant is the
    -- exact condition this migration exists to remove. If any remain, the
    -- backfill's founder rule did not match reality and we must not ship.
    SELECT count(*) INTO v_stranded
      FROM identity.organizations o
     WHERE o.org_type IN ('insurance_company', 'towing_company')
       AND o.status = 'active'
       AND NOT EXISTS (
             SELECT 1
               FROM identity.memberships m
              WHERE m.organization_id = o.id
                AND m.tenant_id = o.tenant_id
                AND m.status = 'active'
                AND m.role_name IN ('insurance_owner', 'towing_owner')
           );

    IF v_stranded > 0 THEN
        RAISE EXCEPTION
          '085 would leave % insurance/towing organisation(s) with no member '
          'who can grant a membership. The founder rule (earliest membership '
          'AND created_by = user_id) did not match those organisations. '
          'Inspect them before re-running — do NOT relax the rule to '
          'role_name alone, which would promote every assessor.', v_stranded;
    END IF;

    -- 🔴 AND THE OPPOSITE FAILURE: PROMOTING TOO MANY.
    --
    -- This assertion belongs HERE and not in `verify/085`, which is where it
    -- was first written. At this instant nobody has been able to GRANT anything
    -- yet, so "more than one org admin" can only have come from this
    -- migration's own backfill — the claim is establishable. Ten minutes later
    -- it is not: `insurance_owner` is grantable, so an owner may legitimately
    -- appoint a second owner during a handover, and the same query would then
    -- fail against a perfectly correct database. Codex caught that the check
    -- was both misplaced and non-repeatable.
    SELECT count(*) INTO v_stranded
      FROM (
        SELECT o.id
          FROM identity.organizations o
          JOIN identity.memberships m
            ON m.organization_id = o.id AND m.tenant_id = o.tenant_id
         WHERE o.org_type IN ('insurance_company', 'towing_company')
           AND m.status = 'active'
           AND m.role_name IN ('insurance_owner', 'towing_owner')
         GROUP BY o.id
        HAVING count(*) > 1
      ) AS over_promoted;

    IF v_stranded > 0 THEN
        RAISE EXCEPTION
          '085 produced % organisation(s) with MORE THAN ONE org admin. The '
          'backfill promoted more than the founder — that is privilege '
          'escalation, not a migration.', v_stranded;
    END IF;
END;
$$;
