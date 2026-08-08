-- 061 — a person who signs up can become a CUSTOMER of a workshop
--
-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 THE DEFECT THIS CLOSES: THE CUSTOMER ROLE COULD NOT EXIST ON PRODUCTION.
--
-- Measured 2026-08-08, not argued. Two facts, and their intersection is the
-- whole bug:
--
--   1. `identity.memberships` is written by exactly TWO code paths in the
--      entire product — `identity.register_workshop` (036/037), which grants
--      `workshop_owner`, and `MembershipService.grant()`, which requires an
--      administrator who is ALREADY inside an organisation. Neither can produce
--      a `customer`.
--   2. Every customer-facing route — `POST /service-requests`, `/vehicles`,
--      `/job-cards` — sits behind `TenantGuard`, which calls
--      `resolveTenantContext` and throws `user holds no active membership`
--      when there is none.
--
-- So on live, a real Keycloak sign-up produced an account that could browse the
-- marketplace and NOTHING else: sign in succeeds, `/registration/status` says
-- `hasWorkshop: false`, `/vehicles` 401s and is swallowed into an empty garage,
-- and the Request for Service form POSTs into a 401. The owner reported this as
-- "can't sign in / wrong page after login", which is exactly what it looks
-- like from outside.
--
-- 🔴 THE REASON IT SURVIVED EVERY TEST: `scripts/seed-dev-identity.sh` INSERTs
-- a `customer` membership with raw SQL (line 193). Locally the role therefore
-- always existed, so the end-to-end proof of 2026-08-07 — a real Keycloak
-- customer sending a real service request — passed against a membership that no
-- production code path can create. A fixture the product cannot produce proves
-- the product works only for the fixture.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── ⚠️ THIS IS THE SECOND FUNCTION THAT GRANTS A MEMBERSHIP TO ITS OWN CALLER
--
-- `register_workshop`'s own comment (037) says it is "the ONLY function that
-- grants a membership to its own caller, and safe only because the tenant did
-- not exist a moment earlier... Adding a person to an EXISTING organisation is
-- MembershipService.grant(), which requires an admin."
--
-- This function breaks that sentence deliberately, so the reasoning has to be
-- stated rather than assumed. It adds a caller to an organisation that ALREADY
-- EXISTS and belongs to somebody else. Five constraints are what make that
-- safe, and every one of them is load-bearing:
--
--   1. THE ROLE IS NOT A PARAMETER. It is the literal `'customer'`, written
--      once, below. There is no argument a caller could set to `technician`,
--      `workshop_owner` or `platform_administrator`. A `p_role` parameter here
--      would be privilege escalation as a REST call.
--
--   2. THE WORKSHOP MUST HAVE PUBLISHED ITSELF. The organisation must have a
--      `catalogue.mechanic_directory` row with `is_published = TRUE`. That row
--      is the workshop's own opt-in to being found by strangers (021 §"an
--      explicit ACT"; 024 keeps publication with an administrator). Publishing
--      a garage to the public directory IS the consent to receive customers —
--      it is the same consent the Request for Service funnel already relies on.
--      An unpublished or private workshop cannot be joined by anyone.
--
--   3. IT CANNOT TOUCH AN ACCOUNT THAT ALREADY HAS A ROLE THERE. If the caller
--      already holds ANY active membership in that organisation, the function
--      either returns the existing customer membership unchanged (idempotent)
--      or refuses. It can never stack `customer` onto a technician, and it can
--      never be used to alter a staff account.
--
--   4. IT GRANTS ONLY TO ITSELF. The RLS door it opens is migration 037's
--      EXISTING `registration_bootstrap_insert` policy on
--      `identity.memberships`, whose WITH CHECK already requires BOTH
--      `created_by` AND `user_id` to equal `app.bootstrap_user`. There is no
--      shape of this call that writes a row for another person.
--
--      ⚠️ BE EXACT ABOUT WHAT "ITSELF" MEANS HERE. `p_subject` IS a function
--      parameter — an earlier draft of this header said the caller is "resolved
--      from the Keycloak SUBJECT, never from a parameter", which is a sentence
--      that reads as a guarantee and is not one (Codex, 2026-08-08). The
--      accurate statement is:
--
--        · The API never takes it from a request BODY. It comes from
--          `KeycloakJwtService.verify()` — a signature-validated token — in
--          `RegistrationController`, and the body schema is `.strict()` with a
--          single `organizationId` field, so there is no key to smuggle it in.
--        · At the SQL boundary a caller holding the `autoworkshop_app`
--          credential could pass any subject and enrol that user as a customer
--          of a published workshop. That is TRUE, it is the identical shape as
--          `identity.register_workshop(p_subject, ...)`, and it is bounded by
--          the same reasoning: anyone able to execute arbitrary SQL as the
--          application role already owns the database, and the worst this
--          particular door adds to that position is a customer membership.
--
--      Stated in full because a comment that promises more than the code
--      delivers stops the next reader from checking — the failure this
--      repository has now recorded four times.
--
--   5. WHAT A CUSTOMER CAN SEE IS SCOPED ELSEWHERE, AND MUST STAY THAT WAY.
--      This function makes `customer` reachable by anyone; it does not decide
--      what the role can read. That is `permission-matrix.ts` plus the
--      per-table RLS. 🔴 IF A CUSTOMER MEMBERSHIP EVER GRANTS ORG-WIDE READS,
--      THIS FUNCTION TURNS THAT INTO "ANY STRANGER CAN READ ANY PUBLISHED
--      WORKSHOP". The isolation rehearsal in `rehearse/061_customer_enrolment.sql`
--      exists to keep that honest, and `verify/061` asserts it.
--
-- ── WHY A DATABASE FUNCTION AND NOT SERVICE CODE ──────────────────────────
--
-- Same reason as 037: on Render the application connects as a NON-superuser and
-- `FORCE ROW LEVEL SECURITY` applies to table owners too, so a plain INSERT
-- from a caller with no tenant context is rejected by policy. Locally the owner
-- IS a superuser and bypasses RLS entirely — which is precisely why 036 passed
-- 9/9 against a defect that existed only in production. Anything membership-
-- shaped is rehearsed under production's privilege shape before it is believed.
--
-- ── ⚠️ THE MEMBERSHIP IS HALF THE JOB. `core.customers` IS THE OTHER HALF ──
--
-- A membership makes the API answer; it does not give the person any RECORDS.
-- Every customer-scoped read in this product is the predicate
-- `AND ($n::uuid IS NULL OR c.user_id = $n::uuid)` (job-card.service.ts:182 and
-- ~40 more), which resolves through `core.customers.user_id`. And measured
-- 2026-08-08: **no application code has ever written `core.customers.user_id`**
-- — `CustomerService.create` does not include the column, and the only writes
-- anywhere are test fixtures. So a membership alone produces an account that
-- can reach the workshop's shared surfaces and NONE of its own records.
--
-- That row is created by `CustomerEnrolmentService` AFTER this function
-- returns, through the ordinary `withTenant` path using the context this
-- function just proved. Deliberately NOT done in here: `core.customers` carries
-- migration 054's RESTRICTIVE `org_restrict` policy, which ANDs with everything
-- and demands `organization_id = identity.current_organization_id()`. Satisfying
-- that inside this function would mean setting the real tenant GUCs and running
-- the insert through a THIRD bootstrap door. Doing it afterwards needs no door
-- at all — the caller genuinely holds the membership by then, so full RLS
-- applies with nothing relaxed.
--
-- 🔴 AND IT DOES NOT CLAIM AN EXISTING WALK-IN RECORD BY EMAIL. Migration 004
-- imagines a walk-in whose row "gains a `user_id` and their garage lights up
-- with the history already there". That merge is right, and it is NOT safe to
-- do automatically today: `verifyEmail` is OFF on the live realm (turned off
-- 2026-08-07 because Keycloak had no SMTP), so an email address is not proof of
-- ownership — anyone could sign up as a stranger's address and inherit their
-- repair history. Enrolment therefore creates a FRESH customer record and
-- leaves merging to staff. Revisit when R1's MX record lands and verification
-- is back on.
--
-- ── IDEMPOTENCE IS NOT A NICETY HERE ──────────────────────────────────────
--
-- The intended caller is a funnel: a visitor presses "Request service" at a
-- workshop, is sent to Keycloak, comes back, and the web app enrols them before
-- rendering the form. That runs on every visit, and a double-submitted form
-- runs it twice at once. `ON CONFLICT DO NOTHING` on the existing unique
-- (organization_id, user_id, role_name) makes the race harmless; the second
-- caller reads the winner's row rather than failing.

-- ── 1. the bootstrap door, widened by exactly two SELECTs ───────────────────
--
-- 037 opened `app.bootstrap` + `app.bootstrap_user` and pinned every policy to
-- that user. This function additionally needs to READ the organisation it is
-- joining — for its `tenant_id` and a branch — and `identity.organizations` and
-- `identity.branches` are both `rls=true forced=true` (verified against the
-- live-shaped local database), so with no tenant context they return zero rows.
--
-- A third setting, `app.bootstrap_org`, keeps that read as narrow as the rest:
-- ONE organisation, named before the door opens, readable only while the flag
-- is on. A policy of the form `bootstrap = 'on'` alone would have made every
-- organisation in the platform readable inside any bootstrap transaction.
--
-- ⚠️ SELECT ONLY. Neither policy admits INSERT, UPDATE or DELETE, so no
-- bootstrap path can modify somebody else's organisation or branch.

-- 🔴 `identity.in_registration_bootstrap()`, NEVER THE RAW SETTING.
--
-- Migration 038 exists because 037's policies tested
-- `current_setting('app.bootstrap', true) = 'on'` directly, and `set_config` is
-- NOT privileged: migration 002 grants `autoworkshop_app` INSERT on every table
-- in `identity`, so the application role could open the door for itself and
-- write with no function in the call path. Measured, not theorised. 038 added
-- the predicate the app role cannot satisfy — the effective user must be the
-- OWNER of the registration function, which only SECURITY DEFINER produces.
--
-- Writing the raw `current_setting` here would silently reopen exactly that
-- hole for two more tables. The first draft of this migration did.

DROP POLICY IF EXISTS enrolment_bootstrap_select ON identity.organizations;
CREATE POLICY enrolment_bootstrap_select ON identity.organizations
    FOR SELECT
    USING (
        identity.in_registration_bootstrap()
        AND id::text = current_setting('app.bootstrap_org', true)
    );

DROP POLICY IF EXISTS enrolment_bootstrap_select ON identity.branches;
CREATE POLICY enrolment_bootstrap_select ON identity.branches
    FOR SELECT
    USING (
        identity.in_registration_bootstrap()
        AND organization_id::text = current_setting('app.bootstrap_org', true)
    );

COMMENT ON POLICY enrolment_bootstrap_select ON identity.organizations IS
'Lets identity.enrol_as_customer read the ONE organisation a caller is joining, '
'and only while app.bootstrap=on. SELECT only. Without it the function runs with '
'no tenant context under FORCE RLS and cannot see the organisation it was asked '
'about — the 036 failure mode, which is invisible locally because the local owner '
'is a superuser.';

COMMENT ON POLICY enrolment_bootstrap_select ON identity.branches IS
'The branch half of enrolment_bootstrap_select on identity.organizations. Scoped '
'to the same single organisation named in app.bootstrap_org. SELECT only.';

-- ── 2. the function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION identity.enrol_as_customer(
    p_subject         TEXT,
    p_organization_id uuid
)
-- ⚠️ THE `o_` PREFIX IS LOAD-BEARING, NOT A STYLE CHOICE.
-- A `RETURNS TABLE` column is an ordinary plpgsql variable inside the body, so
-- naming one `organization_id` makes every unqualified `organization_id` in the
-- function ambiguous — including the `ON CONFLICT (organization_id, user_id,
-- role_name)` target, which cannot be table-qualified. The first version of
-- this function failed in rehearsal with `column reference "organization_id" is
-- ambiguous`, and it failed at RUNTIME, not at CREATE time: plpgsql resolves
-- identifiers when the statement first executes, so `CREATE FUNCTION` reported
-- success on a function that could never run.
RETURNS TABLE (
    o_tenant_id       uuid,
    o_organization_id uuid,
    o_branch_id       uuid,
    o_membership_id   uuid,
    -- TRUE only when this call created the row. The service turns it into the
    -- audit entry, so a funnel that runs on every page view does not write an
    -- audit row on every page view.
    o_created         boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, pg_catalog, pg_temp
AS $$
DECLARE
    v_user      uuid;
    v_tenant    uuid;
    v_branch    uuid;
    v_member    uuid;
    v_existing  RECORD;
    v_published boolean;
BEGIN
    IF p_organization_id IS NULL THEN
        RAISE EXCEPTION 'a workshop must be chosen';
    END IF;

    -- The caller, from the validated token SUBJECT. Never a parameter — a user
    -- id argument is what would let one account enrol another.
    -- `identity.users` is not tenant-scoped (rls=false), so this needs no door.
    SELECT id INTO v_user
      FROM identity.users
     WHERE keycloak_subject = p_subject
       AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no active application user for this identity';
    END IF;

    -- ── the door opens ─────────────────────────────────────────────────────
    -- All three are transaction-local (`is_local => true`), so a pooled
    -- connection cannot carry them into the next request even on an abort.
    PERFORM set_config('app.bootstrap',      'on',                      true);
    PERFORM set_config('app.bootstrap_user', v_user::text,              true);
    PERFORM set_config('app.bootstrap_org',  p_organization_id::text,   true);

    -- ⚠️ CONSTRAINT 2 — the workshop must have invited the public in.
    -- `catalogue.mechanic_directory`'s `public_read` policy is `USING
    -- (is_published)`, so this read needs no bypass and cannot see an
    -- unpublished listing even by accident.
    SELECT TRUE INTO v_published
      FROM catalogue.mechanic_directory
     WHERE mechanic_directory.organization_id = p_organization_id
       AND is_published;

    IF v_published IS NULL THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        PERFORM set_config('app.bootstrap_org',  '', true);
        -- Worded for the person reading it. "Not published" is our vocabulary,
        -- not theirs, and §70 forbids leaving a user unsure what happened.
        RAISE EXCEPTION 'that workshop is not accepting customers online';
    END IF;

    -- ⚠️ CONSTRAINT 3 — never touch an account that already has a role here.
    -- Readable because 037's `registration_bootstrap_select` on
    -- `identity.memberships` admits `user_id = app.bootstrap_user`.
    SELECT m.id, m.role_name, m.tenant_id, m.branch_id
      INTO v_existing
      FROM identity.memberships m
     WHERE m.user_id = v_user
       AND m.organization_id = p_organization_id
       AND m.status = 'active'
     LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        PERFORM set_config('app.bootstrap_org',  '', true);

        IF v_existing.role_name = 'customer' THEN
            -- Already a customer here. The funnel calls this on every visit;
            -- returning the existing row is the whole point of idempotence.
            RETURN QUERY SELECT v_existing.tenant_id, p_organization_id,
                                v_existing.branch_id, v_existing.id, FALSE;
            RETURN;
        END IF;

        -- Staff. Refused rather than stacked: a technician who is also a
        -- `customer` at their own workshop resolves through
        -- `resolveTenantContext`'s role precedence every login, and the role
        -- switcher would offer them a role the product never meant them to
        -- hold. They can already raise work through the workshop's own screens.
        RAISE EXCEPTION 'this account already has a role at that workshop';
    END IF;

    -- The organisation's tenant. Visible only through the narrow policy above.
    SELECT o.tenant_id INTO v_tenant
      FROM identity.organizations o
     WHERE o.id = p_organization_id
       AND o.status = 'active';

    IF v_tenant IS NULL THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        PERFORM set_config('app.bootstrap_org',  '', true);
        -- Reachable when a published listing outlives its organisation. Not a
        -- 500: the customer chose a workshop that is no longer there.
        RAISE EXCEPTION 'that workshop is not accepting customers online';
    END IF;

    -- A branch, if the workshop has one. `resolveTenantContext` copes with NULL
    -- and a customer does not belong to a bay, so this is a convenience for the
    -- screens, not a requirement. Oldest first so the choice is STABLE across
    -- calls rather than falling out of row order.
    SELECT b.id INTO v_branch
      FROM identity.branches b
     WHERE b.organization_id = p_organization_id
       AND b.status = 'active'
     ORDER BY b.created_at, b.id
     LIMIT 1;

    v_member := gen_random_uuid();

    -- ⚠️ THE ROLE IS A LITERAL. See constraint 1 in the header.
    -- `created_by = v_user` is not decoration: 037's bootstrap policy WITH
    -- CHECK requires created_by AND user_id to BOTH equal app.bootstrap_user,
    -- so a row attributed to anyone else is rejected by the database.
    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, p_organization_id, v_branch, v_user, 'customer', 'active', v_user)
    ON CONFLICT (organization_id, user_id, role_name) DO NOTHING
    RETURNING id INTO v_member;

    IF v_member IS NULL THEN
        -- Lost the race against a concurrent identical call — a
        -- double-submitted form. The winner's row is the answer.
        SELECT m.id, m.tenant_id, m.branch_id
          INTO v_existing
          FROM identity.memberships m
         WHERE m.user_id = v_user
           AND m.organization_id = p_organization_id
           AND m.role_name = 'customer';

        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        PERFORM set_config('app.bootstrap_org',  '', true);

        RETURN QUERY SELECT v_existing.tenant_id, p_organization_id,
                            v_existing.branch_id, v_existing.id, FALSE;
        RETURN;
    END IF;

    -- ── and the door closes ────────────────────────────────────────────────
    -- The caller's transaction continues after this returns; leaving the flags
    -- set would hand the rest of it a bypass nobody asked for.
    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);
    PERFORM set_config('app.bootstrap_org',  '', true);

    RETURN QUERY SELECT v_tenant, p_organization_id, v_branch, v_member, TRUE;
END;
$$;

COMMENT ON FUNCTION identity.enrol_as_customer(TEXT, uuid) IS
'Self-service customer enrolment: grants the CALLER a customer membership at a '
'workshop that has published itself in the mechanic directory. The second '
'function in the platform that grants a membership to its own caller, and safe '
'only under five constraints stated in migration 061: the role is a literal and '
'not a parameter; the workshop must have opted in by publishing; an account that '
'already holds any role there is returned unchanged or refused, never modified; '
'the RLS door pins both created_by and user_id to the caller; and what the '
'customer role can READ is scoped by permission-matrix.ts and per-table RLS, '
'which this function makes reachable by strangers and therefore depends on. '
'Idempotent — the funnel calls it on every visit.';

-- ⚠️ EXECUTE IS NOT PUBLIC. Same as 036/037: the application role only.
REVOKE ALL ON FUNCTION identity.enrol_as_customer(TEXT, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.enrol_as_customer(TEXT, uuid) TO autoworkshop_app;
