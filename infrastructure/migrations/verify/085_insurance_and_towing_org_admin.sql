-- verify/085 — an insurer and a towing firm can now BUILD A TEAM, and the
-- proof is a second membership inside BOTH organisation types.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 CHECK 4 IS THE WHOLE POINT. Everything before it is scaffolding.
--
-- 080's verify proved a founder membership could EXIST. That was necessary and
-- it was not sufficient: the founder held `insurance_assessor`, which is absent
-- from `CAN_GRANT_MEMBERSHIP`, so the organisation's first member was also its
-- LAST. Ten insurance screens and ten towing screens sat above a team that
-- could never be assembled.
--
-- ⚠️ WHAT THIS FILE CAN AND CANNOT ESTABLISH — stated here because the first
-- draft of this header claimed the grant AUTHORITY was proven below, and it is
-- not. Codex caught the overclaim on 2026-08-17.
--
-- PROVEN HERE (SQL): the production registration functions write the ORG-ADMIN
-- role; the schema admits a second, differently-roled membership in both
-- organisation types; no insurance or towing organisation is left without a
-- grant-capable member; and the backfill did not promote by role name.
--
-- NOT PROVEN HERE: that the API permits the grant. `CAN_GRANT_MEMBERSHIP`,
-- `GRANTABLE_ROLES` and the role↔organisation fit map are TypeScript, and
-- `role_name` is plain TEXT with no database CHECK by design — so every insert
-- below would still succeed with the new roles deleted from every allow-list.
--
-- ▶ THE OTHER HALF LIVES IN `membership-role-fit.spec.ts`, in the test named
--   "every organisation type that can be REGISTERED has a role that can GRANT",
--   which reads `CAN_GRANT_MEMBERSHIP` as text. Two literals in two files that
--   cannot be type-checked into agreement is this repository's most-recorded
--   root cause, so the halves are deliberately in different languages and
--   neither is sufficient alone.
-- ══════════════════════════════════════════════════════════════════════════

DO $verify$
DECLARE
    v_subject_i TEXT := 'verify-085-i-' || replace(gen_random_uuid()::text, '-', '');
    v_subject_t TEXT := 'verify-085-t-' || replace(gen_random_uuid()::text, '-', '');
    v_subject_s TEXT := 'verify-085-s-' || replace(gen_random_uuid()::text, '-', '');
    v_user_i    uuid;
    v_user_t    uuid;
    v_staff     uuid;
    ri          record;
    rt          record;
    n           int;
    v_role      TEXT;
    passed      int := 0;
BEGIN
    PERFORM set_config('app.current_role', 'admin', true);

    -- ── 1. three application users, created the way the product does ───────
    -- ⚠️ `identity.users` is PLATFORM-GLOBAL and has no tenant_id — recorded
    -- 2026-08-16 after a diagnostic assumed otherwise and wrote nothing.
    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), v_subject_i, v_subject_i || '@verify.local', 'Verify Insurer', 'active')
    RETURNING id INTO v_user_i;

    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), v_subject_t, v_subject_t || '@verify.local', 'Verify Towing', 'active')
    RETURNING id INTO v_user_t;

    INSERT INTO identity.users (id, keycloak_subject, email, display_name, status)
    VALUES (gen_random_uuid(), v_subject_s, v_subject_s || '@verify.local', 'Verify Staff', 'active')
    RETURNING id INTO v_staff;

    passed := passed + 1;

    -- ── 2. register both organisations through the PRODUCTION functions ────
    -- Not raw INSERTs. Ask of any green proof: could the PRODUCT have produced
    -- this fixture? Here it did.
    SELECT * INTO ri FROM identity.register_insurer(v_subject_i, 'Verify 085 Assurance', 'Head office');
    SELECT * INTO rt FROM identity.register_towing_operator(v_subject_t, 'Verify 085 Recovery', 'Main depot');
    passed := passed + 1;

    -- ── 3. the founder holds the ORG-ADMIN role, not the operational one ───
    SELECT role_name INTO v_role
      FROM identity.memberships WHERE id = ri.o_membership_id;
    IF v_role <> 'insurance_owner' THEN
        RAISE EXCEPTION 'verify/085 #3: register_insurer wrote role % — expected '
                        'insurance_owner. An insurer whose founder is an assessor '
                        'can never appoint anybody.', v_role;
    END IF;

    SELECT role_name INTO v_role
      FROM identity.memberships WHERE id = rt.o_membership_id;
    IF v_role <> 'towing_owner' THEN
        RAISE EXCEPTION 'verify/085 #3: register_towing_operator wrote role % — '
                        'expected towing_owner.', v_role;
    END IF;
    passed := passed + 1;

    -- ── 4. a second membership can EXIST in each organisation ─────────────
    --
    -- ⚠️ WHAT THIS DOES AND DOES NOT PROVE — corrected 2026-08-17 after Codex
    -- pointed out that the first version of this comment claimed far more than
    -- the SQL establishes.
    --
    -- It DOES prove the data shape: the schema, the constraints and the
    -- organisation-scoped keys admit a second, differently-roled membership in
    -- an organisation the PRODUCT created, for both organisation types.
    --
    -- It does NOT prove the grant is permitted. `CAN_GRANT_MEMBERSHIP`,
    -- `GRANTABLE_ROLES` and the role↔organisation fit map are all TypeScript,
    -- and `role_name` is plain TEXT with no database CHECK by design. This
    -- insert would still succeed if `insurance_owner` were deleted from every
    -- allow-list in the API — so a green run here is necessary and NOT
    -- sufficient.
    --
    -- ▶ The authority half is asserted in `membership-role-fit.spec.ts`
    --   ("every organisation type that can be REGISTERED has a role that can
    --   GRANT"), which reads `CAN_GRANT_MEMBERSHIP` as text. The two halves
    --   together are the proof; neither alone is.
    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (gen_random_uuid(), ri.o_tenant_id, ri.o_organization_id, ri.o_branch_id,
            v_staff, 'insurance_assessor', 'active', v_user_i);

    SELECT count(*) INTO n
      FROM identity.memberships
     WHERE organization_id = ri.o_organization_id AND status = 'active';
    IF n <> 2 THEN
        RAISE EXCEPTION 'verify/085 #4a: the insurer has % active member(s) after '
                        'a second was added — expected 2.', n;
    END IF;

    -- 🔴 TOWING TOO. The first version of this file asserted only the insurance
    -- side while its header claimed both organisation types could build a team
    -- — a header that described a test that was not there.
    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (gen_random_uuid(), rt.o_tenant_id, rt.o_organization_id, rt.o_branch_id,
            v_staff, 'towing_operator', 'active', v_user_t);

    SELECT count(*) INTO n
      FROM identity.memberships
     WHERE organization_id = rt.o_organization_id AND status = 'active';
    IF n <> 2 THEN
        RAISE EXCEPTION 'verify/085 #4b: the towing firm has % active member(s) '
                        'after a second was added — expected 2.', n;
    END IF;
    passed := passed + 1;

    -- ── 5. every insurance/towing organisation has a grantor ───────────────
    -- The same invariant migration 085 asserts at apply time, re-asserted here
    -- against whatever the database actually contains — including rows the
    -- backfill touched, which the migration's own check ran before this file
    -- ever existed.
    SELECT count(*) INTO n
      FROM identity.organizations o
     WHERE o.org_type IN ('insurance_company', 'towing_company')
       AND o.status = 'active'
       AND NOT EXISTS (
             SELECT 1 FROM identity.memberships m
              WHERE m.organization_id = o.id
                AND m.tenant_id = o.tenant_id
                AND m.status = 'active'
                AND m.role_name IN ('insurance_owner', 'towing_owner')
           );
    IF n > 0 THEN
        RAISE EXCEPTION 'verify/085 #5: % insurance/towing organisation(s) have '
                        'no member who can grant a membership.', n;
    END IF;
    passed := passed + 1;

    -- ── 6. no OPERATIONAL role was promoted by mistake ────────────────────
    --
    -- ⚠️ THIS CHECK USED TO ASSERT "no organisation has more than one org
    -- admin", and it was WRONG IN TWO WAYS — Codex found both.
    --
    -- It was misplaced: at the moment 085 runs, a second admin could only have
    -- come from the backfill, so the claim is establishable THERE and it now
    -- lives there. And it was not repeatable: `insurance_owner` is grantable,
    -- so an owner may legitimately appoint a second owner during a handover,
    -- after which this file would have failed against a perfectly correct
    -- database — a verify that goes red as the product is used normally.
    --
    -- 🔴 AND THE NARROWED VERSION WAS STILL NOT REPEATABLE. The Supervisor
    -- caught that too: "every member is an org admin" describes a legitimate
    -- two-person insurer — a founder plus a co-owner appointed during a
    -- handover, before any assessor is hired. `insurance_owner` is in
    -- `GRANTABLE_ROLES` and `ROLES_BY_ORG_TYPE.insurance_company` admits it, so
    -- the product explicitly permits that state, and the check would have
    -- reported "privilege escalation" about a database with nothing wrong.
    --
    -- I narrowed the condition twice and both times it still asserted something
    -- only knowable AT APPLY TIME. So it does not belong in a repeatable verify
    -- at all, and the whole-database form now lives solely in migration 085,
    -- which runs once, before any grant is possible.
    --
    -- What IS durable is a statement about THIS FILE'S OWN FIXTURES, whose
    -- history is fully known: two organisations were registered a few
    -- statements ago and one operational member was added to each, so each must
    -- hold exactly one org admin. That catches a backfill promoting by role
    -- name without making a claim about rows this file did not create.
    SELECT count(*) INTO n
      FROM identity.memberships
     WHERE organization_id IN (ri.o_organization_id, rt.o_organization_id)
       AND status = 'active'
       AND role_name IN ('insurance_owner', 'towing_owner');
    IF n <> 2 THEN
        RAISE EXCEPTION 'verify/085 #6: this file''s two fixture organisations '
                        'hold % org admin(s) between them — expected exactly 2 '
                        '(one each). More than that is the signature of a '
                        'backfill promoting by role name rather than by founder.', n;
    END IF;
    passed := passed + 1;

    -- ── CLEANUP ───────────────────────────────────────────────────────────
    -- Explicit DELETEs in dependency order, matching verify/080 rather than an
    -- exception-rollback: a verify that leaves fixtures behind pollutes the
    -- directory counts every later assertion reads, and check 5 above is
    -- exactly such a count.
    --
    -- ⚠️ Notifications first, then the registration row, then the organisation
    -- — 069 scopes the registration to the org. Memberships include the SECOND
    -- one check 4 created, which is why this deletes by tenant rather than by
    -- the founder's membership id.
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
    DELETE FROM identity.users         WHERE id IN (v_user_i, v_user_t, v_staff);

    RAISE NOTICE 'verify/085: % checks passed. Check 4 is the evidence — a '
                 'SECOND membership inside an insurer founded by the product, '
                 'which was impossible before 085.', passed;
END
$verify$;
