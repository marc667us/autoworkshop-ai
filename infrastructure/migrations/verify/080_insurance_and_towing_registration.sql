-- verify/080 — an insurance assessor and a towing operator can now exist, and
-- the proof is a membership row written by the PRODUCT.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 CHECK 4 IS THE WHOLE POINT, exactly as it is in verify/075: an
-- `insurance_assessor` and a `towing_operator` membership written by a
-- PRODUCTION CODE PATH, not by `seed-dev-identity.sh`'s raw SQL.
--
-- Ask of any green proof: **could the PRODUCT have produced this fixture?**
-- Here it did — `identity.register_insurer` and
-- `identity.register_towing_operator` are called, and nothing else. Every
-- previous test of insurance-web's 28 routes would have passed against a
-- membership the product could never have made.
--
-- 🔴 CHECK 7 IS NEW AND HAS NO EQUIVALENT IN verify/075. It reads the ALERT
-- TEXT an administrator actually receives. 075 fixed a silent `ELSE` in the
-- first of two identical CASE expressions and left the second, so without 080
-- an insurer would have been told "approving it is what publishes it to the
-- mechanic directory" — a listing it will never appear in. A defect in a
-- notification body is invisible to every schema assertion ever written, so
-- the assertion has to read the body.
--
-- ⚠️ THE PRIVILEGE REHEARSAL IS A SEPARATE CONCERN. Locally the definer's
-- owner is a superuser and the bootstrap door would open even if 037's
-- policies refused everything. This file proves the BEHAVIOUR; check 1b/1c/1d
-- prove the ownership and grant shape that Render's NOBYPASSRLS role depends
-- on.
-- ══════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
    v_subject_i TEXT := 'verify-080-i-' || replace(gen_random_uuid()::text, '-', '');
    v_subject_t TEXT := 'verify-080-t-' || replace(gen_random_uuid()::text, '-', '');
    v_user_i    uuid;
    v_user_t    uuid;
    v_admin     uuid;
    v_admin_org uuid;
    ri          record;
    rt          record;
    n           int;
    refused     boolean;
    v_title     TEXT;
    v_body      TEXT;
    passed      int := 0;
    v_fn        TEXT;
BEGIN
    -- ── 1. Both doors exist and are the right kind of door ────────────────
    FOREACH v_fn IN ARRAY ARRAY[
        'identity.register_insurer(text,text,text)',
        'identity.register_towing_operator(text,text,text)'
    ]
    LOOP
        SELECT count(*) INTO n
          FROM pg_proc p
         WHERE p.oid = v_fn::regprocedure
           AND p.prosecdef;                          -- SECURITY DEFINER
        IF n <> 1 THEN
            RAISE EXCEPTION 'verify/080 #1: % is missing or is not SECURITY '
                            'DEFINER — the bootstrap door cannot open for it', v_fn;
        END IF;

        -- Owned by the same role as register_workshop, or
        -- in_registration_bootstrap() refuses it at runtime while every
        -- migration reports success.
        IF (SELECT r2.rolname FROM pg_proc p JOIN pg_roles r2 ON r2.oid = p.proowner
             WHERE p.oid = v_fn::regprocedure)
           IS DISTINCT FROM
           (SELECT r2.rolname FROM pg_proc p JOIN pg_roles r2 ON r2.oid = p.proowner
             WHERE p.oid = 'identity.register_workshop(text,text,text)'::regprocedure)
        THEN
            RAISE EXCEPTION 'verify/080 #1b: % and register_workshop have different '
                            'owners — the bootstrap door is pinned to the latter', v_fn;
        END IF;

        IF has_function_privilege('public', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'verify/080 #1c: PUBLIC can execute %', v_fn;
        END IF;
        IF NOT has_function_privilege('autoworkshop_app', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'verify/080 #1d: the application role CANNOT execute % '
                            '— the door is shut to the only caller', v_fn;
        END IF;

        -- 🔴 THE LOCK, READ FROM THE INSTALLED DEFINITION. 076 exists because
        -- 075's lock was intended and absent, and an intention is not a lock.
        IF pg_get_functiondef(v_fn::regprocedure) NOT LIKE '%pg_advisory_xact_lock%' THEN
            RAISE EXCEPTION 'verify/080 #1e: % does not take the per-identity '
                            'advisory lock — two simultaneous submits can each '
                            'create a tenant for one person', v_fn;
        END IF;
    END LOOP;
    passed := passed + 1;

    -- ── 2. The queue accepts the fourth and fifth kind ────────────────────
    SELECT count(*) INTO n FROM pg_constraint
     WHERE conrelid = 'identity.organization_registrations'::regclass
       AND conname = 'organization_registrations_kind_check'
       AND pg_get_constraintdef(oid) LIKE '%insurance%'
       AND pg_get_constraintdef(oid) LIKE '%towing%';
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/080 #2: organization_registrations still refuses '
                        'kind = insurance or towing, so both functions would fail '
                        'on their LAST statement — at runtime, on a real registrant';
    END IF;
    -- And it did not LOSE the three it already had. A DROP/ADD of a CHECK is
    -- how a constraint quietly narrows.
    SELECT count(*) INTO n FROM pg_constraint
     WHERE conrelid = 'identity.organization_registrations'::regclass
       AND conname = 'organization_registrations_kind_check'
       AND pg_get_constraintdef(oid) LIKE '%workshop%'
       AND pg_get_constraintdef(oid) LIKE '%supplier%'
       AND pg_get_constraintdef(oid) LIKE '%fleet%';
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/080 #2b: widening the kind CHECK dropped one of '
                        'workshop/supplier/fleet — existing registrations would break';
    END IF;
    passed := passed + 1;

    -- ── 3. Two people with no organisation ────────────────────────────────
    v_user_i := gen_random_uuid();
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (v_user_i, v_subject_i, v_subject_i || '@example.test', 'Verify 080 I', 'active');

    v_user_t := gen_random_uuid();
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (v_user_t, v_subject_t, v_subject_t || '@example.test', 'Verify 080 T', 'active');

    -- ── 4. 🔴 THE PRODUCT CREATES BOTH ORGANISATIONS ──────────────────────
    SELECT * INTO ri FROM identity.register_insurer(
        v_subject_i, 'Verify 080 Assurance', 'Accra office');
    SELECT * INTO rt FROM identity.register_towing_operator(
        v_subject_t, 'Verify 080 Recovery', 'Tema depot');

    IF ri.o_tenant_id IS NULL OR ri.o_organization_id IS NULL
       OR ri.o_branch_id IS NULL OR ri.o_membership_id IS NULL THEN
        RAISE EXCEPTION 'verify/080 #4: register_insurer returned nulls';
    END IF;
    IF rt.o_tenant_id IS NULL OR rt.o_organization_id IS NULL
       OR rt.o_branch_id IS NULL OR rt.o_membership_id IS NULL THEN
        RAISE EXCEPTION 'verify/080 #4: register_towing_operator returned nulls';
    END IF;

    -- 🔴 SEPARATE TENANTS, WHICH IS THE ENTIRE ARCHITECTURAL POINT. Before 080
    -- the only way to make an insurer was inside somebody else's tenant, which
    -- would have put the assessor's records under the workshop's RLS scope —
    -- backwards, since they are on opposite sides of a claim.
    -- COMBINED_PLAN_v2 §4: a tenant is "the legal/commercial isolation boundary".
    IF ri.o_tenant_id = rt.o_tenant_id THEN
        RAISE EXCEPTION 'verify/080 #4a: the insurer and the towing firm share a '
                        'tenant — they are separate legal entities';
    END IF;

    SELECT count(*) INTO n FROM identity.organizations
     WHERE id = ri.o_organization_id AND org_type = 'insurance_company' AND status = 'active';
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/080 #4b: the organisation is not an active '
                        'insurance_company';
    END IF;
    SELECT count(*) INTO n FROM identity.organizations
     WHERE id = rt.o_organization_id AND org_type = 'towing_company' AND status = 'active';
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/080 #4b: the organisation is not an active '
                        'towing_company';
    END IF;

    -- 🔴 AND THE MEMBERSHIPS ARE THE ROLES THE NAVIGATION TREES EXPECT. A
    -- merely plausible name resolves to no tree and no permissions, and the
    -- registrant lands somewhere they can see nothing — failing CLOSED and
    -- silently, which is how `quality_controller` survived for months.
    -- ⚠️ 085 SUPERSEDED THE ROLE LITERAL THESE CHECKS ORIGINALLY NAMED.
    --
    -- 080 wrote `insurance_assessor` / `towing_operator`. Migration 085
    -- `CREATE OR REPLACE`s both functions to write `insurance_owner` /
    -- `towing_owner`, because the operational roles cannot grant a membership
    -- and an organisation founded on one could never appoint a second member.
    --
    -- 🔴 THIS FILE WOULD OTHERWISE BE A GUARANTEED RED RUN. `rehearse-migration.yml`
    -- executes `verify/<migration>.sql` on request, so dispatching it with
    -- `migration=080` — a supported, documented operation — would fail against a
    -- perfectly correct database and name a role the product deliberately
    -- stopped writing. Found by the Supervisor, 2026-08-17.
    --
    -- What 080 actually proved, and what still holds, is that the FUNCTION
    -- writes an active founder membership at all: before 080 no production code
    -- path could create one. That claim is preserved; only the role vocabulary
    -- is widened to include its 085 successor. The 085-specific assertion —
    -- that the role is precisely the org admin — lives in `verify/085`.
    SELECT count(*) INTO n FROM identity.memberships
     WHERE id = ri.o_membership_id AND user_id = v_user_i
       AND organization_id = ri.o_organization_id
       AND role_name IN ('insurance_assessor', 'insurance_owner')
       AND status = 'active';
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/080 #4c: no active insurance founder membership '
                        'was written — the role still cannot exist in production';
    END IF;

    SELECT count(*) INTO n FROM identity.memberships
     WHERE id = rt.o_membership_id AND user_id = v_user_t
       AND organization_id = rt.o_organization_id
       AND role_name IN ('towing_operator', 'towing_owner')
       AND status = 'active';
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/080 #4d: no active towing founder membership was '
                        'written — the role still cannot exist in production';
    END IF;
    passed := passed + 1;

    -- ── 5. Both join the SAME verification gate ───────────────────────────
    SELECT count(*) INTO n FROM identity.organization_registrations
     WHERE organization_id = ri.o_organization_id
       AND kind = 'insurance' AND status = 'pending' AND submitted_by = v_user_i;
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/080 #5: the insurer was created but never queued '
                        'for verification — nobody will ever be asked to approve it';
    END IF;
    SELECT count(*) INTO n FROM identity.organization_registrations
     WHERE organization_id = rt.o_organization_id
       AND kind = 'towing' AND status = 'pending' AND submitted_by = v_user_t;
    IF n <> 1 THEN
        RAISE EXCEPTION 'verify/080 #5b: the towing firm was never queued for '
                        'verification';
    END IF;
    passed := passed + 1;

    -- ── 6. One organisation per person, and the refusal names a way out ───
    refused := false;
    BEGIN
        PERFORM identity.register_insurer(v_subject_i, 'Second Assurance', 'Office 2');
    EXCEPTION WHEN others THEN
        refused := true;
        IF SQLERRM NOT LIKE '%already belongs to an organisation%' THEN
            RAISE EXCEPTION 'verify/080 #6: refused for the wrong reason: %', SQLERRM;
        END IF;
        -- Every refusal must name a reachable alternative.
        IF SQLERRM NOT LIKE '%different account%' AND SQLERRM NOT LIKE '%administrator%' THEN
            RAISE EXCEPTION 'verify/080 #6b: the refusal names no way forward: %', SQLERRM;
        END IF;
    END;
    IF NOT refused THEN
        RAISE EXCEPTION 'verify/080 #6: one account registered two insurers';
    END IF;
    passed := passed + 1;

    -- ── 7. 🔴 WHAT THE ADMINISTRATOR IS ACTUALLY TOLD ─────────────────────
    --
    -- The check with no equivalent in verify/075, and the reason it is here is
    -- that 075's own fix was incomplete: it removed the silent `ELSE` from the
    -- CASE that names the KIND and left the one that names WHERE APPROVAL
    -- PUBLISHES. Without 080 an insurer's alert read "approving it is what
    -- publishes it to the mechanic directory".
    --
    -- Read from `comms.notifications`, which is what the trigger wrote — not
    -- re-derived from the CASE, which would be a copy of the thing under test.
    -- ⚠️ `subject`, NOT `title`. Measured from `\d comms.notifications` after
    -- guessing wrong: the column is `subject`, and a guessed column name is a
    -- check that cannot run.
    SELECT subject, body INTO v_title, v_body
      FROM comms.notifications
     WHERE resource_type = 'organization_registration'
       AND resource_id = (SELECT id FROM identity.organization_registrations
                           WHERE organization_id = ri.o_organization_id)
     LIMIT 1;

    IF v_title IS NULL THEN
        -- Not a failure: the trigger only writes when a platform administrator
        -- exists, and a bare database has none. Say so rather than passing
        -- silently, because a check that cannot run must not look like one that
        -- ran — this repository's most-repeated lesson.
        RAISE NOTICE 'verify/080 #7 SKIPPED: no active platform_administrator, so '
                     'no alert row was written. Re-run against a database that has '
                     'one to exercise the notification text.';
    ELSE
        IF v_title NOT LIKE '%insurance company%' THEN
            RAISE EXCEPTION 'verify/080 #7: the alert calls an insurer "%" — it '
                            'should name the insurance company. Title: %',
                            v_title, v_title;
        END IF;
        IF v_body LIKE '%mechanic directory%' THEN
            RAISE EXCEPTION 'verify/080 #7b: the insurer alert still promises the '
                            'MECHANIC DIRECTORY, a listing an insurance company '
                            'will never appear in. The silent ELSE is back. Body: %',
                            v_body;
        END IF;
        passed := passed + 1;
    END IF;

    -- ── CLEANUP ───────────────────────────────────────────────────────────
    -- Notifications first, then the registration row, then the organisation:
    -- 069 scopes the registration to the org.
    DELETE FROM comms.notifications
     WHERE resource_type = 'organization_registration'
       AND resource_id IN (SELECT id FROM identity.organization_registrations
                            WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id));
    DELETE FROM identity.organization_registrations
     WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
    DELETE FROM identity.memberships   WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
    DELETE FROM identity.branches      WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
    DELETE FROM identity.organizations WHERE tenant_id IN (ri.o_tenant_id, rt.o_tenant_id);
    DELETE FROM identity.tenants       WHERE id IN (ri.o_tenant_id, rt.o_tenant_id);
    DELETE FROM identity.users         WHERE id IN (v_user_i, v_user_t);

    RAISE NOTICE 'verify/080: % checks passed. Checks 4c and 4d are the evidence '
                 '— an ACTIVE insurance and towing FOUNDER membership written by '
                 'the PRODUCT, not by a seed script. (085 changed WHICH role that '
                 'is; verify/085 asserts the exact name.)', passed;
END
$verify$;
