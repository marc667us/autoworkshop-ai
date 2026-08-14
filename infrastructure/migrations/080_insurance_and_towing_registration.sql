-- 080 — an insurance assessor and a towing operator could not exist either
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 THE FOURTH AND FIFTH TIME THE ROLE QUESTION HAS FOUND A ROLE THAT COULD
-- NOT EXIST. Asked before building any screen, exactly as 075 asked it of
-- `fleet_administrator`, 068 of `supplier_owner` and 061 of `customer`:
-- **which production code path WRITES this membership?**
--
--     insurance_assessor  → none
--     towing_operator     → none
--
-- Measured, not assumed. Every `INSERT INTO identity.memberships` across the
-- 79 migrations in this directory writes exactly four role literals —
-- `workshop_owner`, `supplier_owner`, `fleet_administrator`, `customer`.
--
-- ⚠️ AND `MembershipService.grant()` IS NOT THE ESCAPE HATCH IT LOOKS LIKE.
-- Both roles ARE in its `GRANTABLE_ROLES` allow-list, which is why a 2026-08-13
-- handover recorded `insurance_assessor` as "grantable, only the door is
-- missing". That reading is wrong, and the reason is worth stating because it
-- is the same circularity 075 found in `CAN_CREATE_ORG`:
--
--   · `grant()` requires an `organizationId` in the CALLER'S OWN tenant.
--   · The only way to create an organisation is `POST /organizations`, which
--     is behind `TenantGuard` and `CAN_CREATE_ORG` — so the creator must
--     already hold a membership somewhere, and the new organisation lands
--     inside THAT tenant.
--   · Therefore an insurer could only ever be created INSIDE a workshop's or a
--     supplier's tenant, by that tenant's owner.
--
-- `COMBINED_PLAN_v2` §4 defines a tenant as "the legal/commercial isolation
-- boundary". An insurance company is a different legal entity from the
-- workshop whose repairs it assesses — it is on the other side of the claim.
-- Filing it inside the workshop's tenant would put the assessor's records
-- under the workshop's RLS scope, which is precisely backwards.
--
-- So there was no path to an INDEPENDENT insurer or towing firm at all, and
-- both packs were deployed with their navigation transcribed: insurance is
-- 0 of 28 screens, towing has 10. Deploying them made the shell reachable, not
-- the features.
--
-- ── WHAT THIS MIGRATION IS, AND IS NOT ────────────────────────────────────
--
-- It is the two missing doors, `identity.register_insurer` and
-- `identity.register_towing_operator`, each a near-copy of `register_fleet`
-- with two literals changed. It is NOT the insurance or towing domain schema —
-- claims, assessments, dispatch and recovery records are separate work. The
-- door comes first because until it exists none of that is reachable.
--
-- ⚠️ ONE MIGRATION FOR BOTH, DELIBERATELY. They widen the SAME CHECK
-- constraint and rewrite the SAME alert function. Split in two, the second
-- would have to reproduce the first's edits to a function it did not change —
-- which is how a `CREATE OR REPLACE` silently reverts somebody else's fix.
--
-- ── ⚠️ THE LITERALS ARE THE WHOLE MIGRATION ───────────────────────────────
--
-- `'insurance_company'` and `'towing_company'` are two of the ten values
-- `organizations_org_type_check` admits (`organization.schemas.ts:18-29`
-- mirrors that list and a spec asserts they agree). `'insurance_assessor'` and
-- `'towing_operator'` are spelled exactly as `permission-matrix.ts:107,109`,
-- `GRANTABLE_ROLES` and the two navigation trees expect. A merely plausible
-- name — `insurer`, `insurance_admin`, `tow_operator` — resolves to no tree
-- and no permissions, and the registrant lands in an organisation they can see
-- nothing in, failing CLOSED and silently. Both are LITERALS here, never
-- parameters, and verify/080 asserts them by name.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── 1. The verification queue learns a fourth and fifth kind ──────────────
--
-- Both join the SAME admin gate as a workshop, a supplier and a fleet: the
-- organisation works immediately and is invisible in any public registry until
-- a platform administrator approves it. Adding the row without widening this
-- CHECK would make both functions fail on their LAST statement — at runtime,
-- on a real registrant, long after this migration reported success. That is
-- exactly how 075 found it.
ALTER TABLE identity.organization_registrations
    DROP CONSTRAINT organization_registrations_kind_check;
ALTER TABLE identity.organization_registrations
    ADD CONSTRAINT organization_registrations_kind_check
    CHECK (kind IN ('workshop', 'supplier', 'fleet', 'insurance', 'towing'));

-- ── 2. The doors ──────────────────────────────────────────────────────────

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

    -- 🔴 THE PER-IDENTITY ADVISORY LOCK, TAKEN FROM THE START RATHER THAN IN A
    -- FOLLOW-UP MIGRATION. 071 and 072 added it to `register_workshop` and
    -- `register_supplier`; 075 shipped `register_fleet` WITHOUT it and 076 had
    -- to go back for it, because two simultaneous submits could each find no
    -- membership and create a tenant apiece — and a fleet submit could race a
    -- workshop one, which held a lock the fleet function never joined.
    --
    -- The KEY IS THE IDENTITY, NOT THE KIND, which is the entire point: it
    -- serialises one person's registrations across ALL five doors. `_xact_`, so
    -- it is released when the transaction ends including on the exception paths
    -- below — no code path can leak it and block that account for ever.
    PERFORM pg_advisory_xact_lock(hashtextextended('identity.register:' || v_user::text, 0));

    -- ── the door opens here, and only here ─────────────────────────────────
    -- Transaction-local, so a pooled connection cannot carry the flag into the
    -- next request even on an abort. Cleared explicitly as well, because the
    -- SUCCESS path leaves the caller's transaction open.
    PERFORM set_config('app.bootstrap',      'on',         true);
    PERFORM set_config('app.bootstrap_user', v_user::text, true);

    -- One organisation per person. AFTER the flag is set AND after the lock:
    -- under FORCE RLS with no tenant context this read returns zero rows for
    -- everybody, so placing it earlier would make it a check that cannot fire —
    -- the bug 037 fixed in `register_workshop`.
    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        -- ⚠️ THE MESSAGE NAMES A REACHABLE ALTERNATIVE. A rule with no way past
        -- it is a wall, and the person in front of it files a bug rather than
        -- acting.
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

    -- 🔴 LITERAL 2 of 2: the role, spelled as every consumer expects.
    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'insurance_assessor', 'active', v_user);

    -- Queued INSIDE the same transaction that creates the insurer. Written
    -- afterwards on a separate connection it could survive a rolled-back
    -- sign-up and describe a company that does not exist — or be lost, leaving
    -- an insurer nobody is ever asked to verify.
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
'insurance_company organisation, one office and an insurance_assessor '
'membership for the CALLER, resolved from the token subject, and queues the '
'company for admin verification. The role and the org type are literals, never '
'parameters. Refuses an account that already belongs to an organisation. '
'Before this function existed NO production code path could create an '
'insurance_assessor membership or an independent insurance_company at all.';

-- 🔴 EXECUTE GRANTED TO THE APPLICATION ROLE AND REVOKED FROM PUBLIC. A
-- SECURITY DEFINER function reachable by PUBLIC is reachable by every role in
-- the database, including any future read-only or reporting role.
REVOKE ALL ON FUNCTION identity.register_insurer(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.register_insurer(TEXT, TEXT, TEXT) TO autoworkshop_app;


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

    -- Same per-identity lock as the other four doors. See the note in
    -- `register_insurer` above for why the key is the identity and not the kind.
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

    -- 🔴 LITERAL 2 of 2: `towing_operator`, as `permission-matrix.ts:109` and
    -- the `02.txt` §52 navigation tree spell it.
    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'towing_operator', 'active', v_user);

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
'towing_company organisation, one depot and a towing_operator membership for '
'the CALLER, resolved from the token subject, and queues the company for admin '
'verification. The role and the org type are literals, never parameters. '
'Refuses an account that already belongs to an organisation. Before this '
'function existed NO production code path could create a towing_operator '
'membership or an independent towing_company at all.';

REVOKE ALL ON FUNCTION identity.register_towing_operator(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.register_towing_operator(TEXT, TEXT, TEXT) TO autoworkshop_app;


-- ── 3. PROVE THE BOOTSTRAP DOOR ACTUALLY OPENS FOR BOTH ───────────────────
--
-- 🔴 THE ONE FAILURE `CREATE FUNCTION` WOULD NOT REPORT.
-- `in_registration_bootstrap()` admits a caller only when `current_user` equals
-- the owner of `register_workshop`. A SECURITY DEFINER function runs as its OWN
-- owner, so if this file were applied by a different role than 037 was, every
-- INSERT above would be refused by 037's policies — at runtime, on a real
-- registrant's first sign-up, long after this migration reported success.
--
-- 🔴 AND THE LOCK IS ASSERTED HERE TOO, not merely written above. 076 exists
-- because 075's lock was intended and absent; a guard that reads the INSTALLED
-- definition cannot be fooled by an edit that looked right.
DO $guard$
DECLARE
    v_workshop_owner text;
    v_owner          text;
    v_fn             text;
    v_missing        text := '';
BEGIN
    SELECT r.rolname INTO v_workshop_owner
      FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
     WHERE p.oid = 'identity.register_workshop(text,text,text)'::regprocedure;

    FOREACH v_fn IN ARRAY ARRAY[
        'identity.register_insurer(text,text,text)',
        'identity.register_towing_operator(text,text,text)'
    ]
    LOOP
        SELECT r.rolname INTO v_owner
          FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
         WHERE p.oid = v_fn::regprocedure;

        IF v_owner IS DISTINCT FROM v_workshop_owner THEN
            RAISE EXCEPTION
                '% is owned by % but register_workshop by %. '
                'in_registration_bootstrap() pins the bootstrap door to the latter, '
                'so every INSERT in % would be refused by 037''s policies at '
                'runtime. Nothing has been applied.',
                v_fn, v_owner, v_workshop_owner, v_fn;
        END IF;

        -- Created as INVOKER it would run as `autoworkshop_app`, the bootstrap
        -- door would never open, and the first sign-up would fail on the
        -- tenants INSERT.
        IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_fn::regprocedure) THEN
            RAISE EXCEPTION
                '% is not SECURITY DEFINER — the bootstrap door cannot open for '
                'it. Nothing has been applied.', v_fn;
        END IF;

        IF pg_get_functiondef(v_fn::regprocedure) NOT LIKE '%pg_advisory_xact_lock%' THEN
            v_missing := v_missing || ' ' || v_fn;
        END IF;
    END LOOP;

    IF v_missing <> '' THEN
        RAISE EXCEPTION
            'these registration functions do not take the per-identity advisory '
            'lock and can each create a duplicate tenant for one person:%. '
            'Nothing has been applied.', v_missing;
    END IF;
END
$guard$;


-- ── 4. THE ADMIN ALERT LEARNS THE FOURTH AND FIFTH KIND ───────────────────
--
-- 🔴 AND IT CLOSES A SILENT `ELSE` THAT 075 LEFT BEHIND IN THE SECOND OF TWO
-- IDENTICAL CASE EXPRESSIONS.
--
-- 075 found that widening `kind` made every fleet registration announce itself
-- as **"Verify a new workshop"**, because `v_kind`'s CASE ended in
-- `ELSE 'workshop'`. It fixed that one. The SECOND CASE — the one that names
-- where approval publishes the organisation — still ends in
-- `ELSE 'mechanic directory'`, which is correct for a workshop only by
-- accident, because workshop is the value that currently falls through.
--
-- So without this, an insurer would have been told, verbatim, that "approving
-- it is what publishes it to the mechanic directory". Neither an insurance
-- company nor a towing firm appears in the mechanic directory at all; approval
-- is what lets them trade. That is the "give a value a NEW meaning, then
-- re-check EVERY path that already produces it" lesson, and finding it in the
-- second copy of a construct whose first copy was already fixed is exactly why
-- the rule is written as *every* path.
--
-- Both CASEs now name an unrecognised kind rather than impersonating a default.
--
-- ⚠️ THE BODY IS THE INSTALLED 070/071/075 FUNCTION, REPRODUCED IN FULL because
-- `CREATE OR REPLACE FUNCTION` has no partial form. It was read from
-- `pg_get_functiondef` on a database at migration 079 rather than reassembled
-- from the three migrations that wrote it, so no earlier fix is dropped. The
-- only edits are the two CASE expressions, both commented inline.

CREATE OR REPLACE FUNCTION identity.alert_admins_of_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'identity', 'comms', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_admin   RECORD;
    v_org     TEXT;
    v_kind    TEXT;
    v_written integer := 0;
BEGIN
    IF NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    -- 🔴 THE NAME IS UNREADABLE WITHOUT OPENING A DOOR (075's finding). The
    -- three policies on `identity.organizations` are `tenant_isolation` (needs
    -- a tenant context, and registration has none), a bootstrap policy that is
    -- INSERT-only, and `enrolment_bootstrap_select`, which admits exactly the
    -- organisation named by `app.bootstrap_org`. Cleared immediately: the
    -- caller's transaction continues after this trigger returns and must not
    -- keep a read exemption it never asked for.
    PERFORM set_config('app.bootstrap_org', NEW.organization_id::text, true);

    SELECT o.name INTO v_org
      FROM identity.organizations o
     WHERE o.id = NEW.organization_id;

    PERFORM set_config('app.bootstrap_org', '', true);

    v_kind := CASE NEW.kind
                WHEN 'supplier'  THEN 'parts supplier'
                WHEN 'fleet'     THEN 'fleet operator'
                WHEN 'workshop'  THEN 'workshop'
                WHEN 'insurance' THEN 'insurance company'
                WHEN 'towing'    THEN 'towing company'
                -- 🔴 NO SILENT `ELSE`. This read `ELSE 'workshop'`, so 075
                -- widening `kind` made every fleet announce itself as a
                -- workshop. An unknown kind now names itself rather than
                -- impersonating the default.
                ELSE NEW.kind
              END;

    -- ── the admin-lookup door opens ────────────────────────────────────────
    PERFORM set_config('app.admin_lookup', 'on', true);

    FOR v_admin IN
        SELECT DISTINCT m.user_id
          FROM identity.memberships m
         WHERE m.role_name = 'platform_administrator'
           AND m.status = 'active'
    LOOP
        v_written := v_written + comms.notify_user(
            NEW.tenant_id,
            NEW.organization_id,
            v_admin.user_id,
            'organization.registered',
            format('Verify a new %s: %s', v_kind, COALESCE(v_org, 'unnamed')),
            format(
                '%s registered as a %s and is waiting to be verified. '
                'It is NOT listed publicly yet — approving it is what publishes it '
                'to the %s. Open Registrations to check the business and decide.',
                COALESCE(v_org, 'An organisation'),
                v_kind,
                CASE NEW.kind
                  WHEN 'supplier' THEN 'parts marketplace'
                  -- A fleet is not published to a public registry at all;
                  -- approval is what lets it trade, so the sentence must not
                  -- promise a directory listing it will never appear in.
                  WHEN 'fleet'    THEN 'platform as a verified fleet operator'
                  -- Neither of these appears in the mechanic directory. Before
                  -- 080 they would have, because of the `ELSE` below.
                  WHEN 'insurance' THEN 'platform as a verified insurance company'
                  WHEN 'towing'    THEN 'platform as a verified towing provider'
                  -- 🔴 WAS `ELSE 'mechanic directory'`, WHICH WAS CORRECT ONLY
                  -- BY ACCIDENT — workshop is the one kind that fell through.
                  -- Named explicitly so the next kind added here fails loudly
                  -- in review instead of quietly promising the wrong listing.
                  WHEN 'workshop'  THEN 'mechanic directory'
                  ELSE format('platform (unrecognised registration kind "%s")', NEW.kind)
                END
            ),
            'organization_registration',
            NEW.id,
            format('organization.registered:%s', v_admin.user_id)
        );
    END LOOP;

    PERFORM set_config('app.admin_lookup', '', true);

    IF v_written = 0 THEN
        RAISE NOTICE
            'registration % queued but NO platform administrator was alerted '
            '(none active). It is in the queue and will be found by anyone who '
            'opens it.', NEW.id;
    END IF;

    RETURN NEW;
END;
$function$;

COMMIT;
