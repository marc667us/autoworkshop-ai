-- 069 — a self-registered workshop or supplier waits for a human to verify it
--
-- ══════════════════════════════════════════════════════════════════════════
-- Owner, 2026-08-09: *"when [a new] workshop or supplier [registers] the admin
-- is alerted to verify and approve and update the registries."*
--
-- 068 let a stranger create a supplier tenant from a button on the landing
-- page, and 036/037 have let a stranger create a WORKSHOP tenant that way since
-- June. Nothing checked that either business exists. This migration adds the
-- queue that a platform administrator works through.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 THE DECISION THIS ENCODES: WHAT DOES "NOT YET APPROVED" MEAN? ──────
--
-- It would be easy to read "verify and approve" as "the account does not work
-- until an admin says so", and that reading was rejected. It produces a person
-- who signs up, is told to wait, and has nothing to look at — and, worse, an
-- admin asked to verify a business from a name and an email alone, because the
-- registrant could not fill anything in.
--
-- So the line is drawn at PUBLICATION, not at access:
--
--   · A new workshop or supplier can sign in immediately and work inside their
--     OWN organisation — set up their profile, add locations, load a catalogue.
--     RLS already confines them to their own tenant, so this grants them
--     nothing they could take from anybody else.
--   · They are NOT in the PUBLIC REGISTRIES until an admin approves. A
--     workshop is invisible in `catalogue.mechanic_directory`; a supplier is
--     invisible in `catalogue.suppliers`. No stranger sees an unverified
--     business, and no customer can enrol at one — 061's enrolment is gated on
--     `mechanic_directory.is_published`, so that constraint is already load-
--     bearing and this reuses it rather than inventing a second switch.
--
-- ⚠️ THE REGISTRIES ALREADY DEFAULT TO INVISIBLE, which is why this is a small
-- change and not a rewrite. `catalogue.suppliers.is_published` and
-- `is_verified` are both `NOT NULL DEFAULT FALSE`, and 021's own comment says
-- why: "a row created without thinking about it is invisible".
-- `mechanic_directory.is_published` is the same. Approval FLIPS those flags;
-- nothing had to be added to hold "unapproved", because unapproved is the
-- state the registries already start in.
--
-- ── ⚠️ WHY A TABLE AND NOT A COLUMN ON `identity.organizations` ───────────
--
-- A `verification_status` column would hold only the CURRENT state. What an
-- admin needs when a rejected business appeals — and what a regulator would ask
-- for — is WHO decided, WHEN, and WHY. A rejection with no author is not a
-- decision, it is an outcome. So this is a row per registration carrying the
-- decision and its author, in the same spirit as `agents.proposals`.
--
-- ⚠️ ONE ROW PER ORGANISATION (unique), not an append-only log. A re-decision
-- overwrites, and the audit trail (`audit.events`) holds the sequence — the
-- same division of labour `crm.leads.status` uses. An append-only table here
-- would need its own "which row is current?" query in every reader, and
-- getting that wrong shows a stale verdict, which is worse than the history
-- living one table over.

BEGIN;

CREATE TABLE IF NOT EXISTS identity.organization_registrations (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE CASCADE,
    -- 🔴 UNIQUE. One organisation, one registration. Without this a retried
    -- sign-up would queue the same business twice and two admins would verify
    -- it independently, reaching two verdicts.
    organization_id  uuid NOT NULL UNIQUE REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- Which queue this belongs in, and which registry approval publishes to.
    -- A literal written by the registration function, never a parameter.
    kind             TEXT NOT NULL CHECK (kind IN ('workshop', 'supplier')),

    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),

    -- The person who registered. Kept even though the membership records it,
    -- because a membership can be revoked and the question "who submitted
    -- this?" outlives the answer "who works there now?".
    submitted_by     uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    submitted_at     timestamptz NOT NULL DEFAULT now(),

    -- 🔴 NULL UNTIL A HUMAN DECIDES, and that is the whole point of the table.
    -- An approval with no `decided_by` is an approval nobody made.
    decided_by       uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    decided_at       timestamptz,
    -- Why. Required in the service for a rejection: "no" with no reason cannot
    -- be acted on by the business receiving it, and they will simply register
    -- again. TEXT, never VARCHAR(n).
    decision_note    TEXT,

    -- A decided row must carry its decider, and a pending row must not.
    -- Enforced here rather than in the service, because a rule that lives only
    -- in application code is one direct UPDATE away from being untrue.
    CONSTRAINT ck_decision_is_attributed CHECK (
        (status = 'pending'  AND decided_by IS NULL AND decided_at IS NULL)
     OR (status <> 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_org_registrations_status
    ON identity.organization_registrations (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_registrations_tenant
    ON identity.organization_registrations (tenant_id);

ALTER TABLE identity.organization_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.organization_registrations FORCE  ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON identity.organization_registrations TO autoworkshop_app;

-- ── SELECT ─────────────────────────────────────────────────────────────────
-- A platform admin sees every queue. A registrant sees their OWN row and
-- nothing else, so the screens can tell them "waiting for verification"
-- honestly instead of leaving them wondering why they are not on the map.
--
-- ⚠️ NO `<> 'customer'` CLAUSE IS NEEDED and its absence is deliberate: the
-- organisation arm already restricts a reader to their own organisation, and a
-- customer enrolled at a workshop seeing that the workshop is approved tells
-- them nothing they cannot see from the public directory. Stated because the
-- 059/062/066/067 sequence has made "no role clause" look like an oversight by
-- default, and here it is a decision.
DROP POLICY IF EXISTS org_registration_select ON identity.organization_registrations;
CREATE POLICY org_registration_select ON identity.organization_registrations FOR SELECT USING (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id())
);

-- ── INSERT: ONLY THROUGH A REGISTRATION FUNCTION ───────────────────────────
-- 🔴 `identity.in_registration_bootstrap()`, NOT the raw `app.bootstrap`
-- setting. `set_config` is NOT a privileged operation — any application
-- connection can set that flag — so a policy reading it directly is a door with
-- the key taped to it. That is the hole 038 exists to close and the one the
-- first draft of 061 reopened. The owner-identity half cannot be forged from an
-- application connection.
--
-- There is deliberately NO admin INSERT arm. An administrator who wants to
-- onboard a business uses the existing organisation and membership services;
-- this queue is for SELF-registration, and a hand-written row here would
-- describe a sign-up that never happened.
DROP POLICY IF EXISTS org_registration_insert ON identity.organization_registrations;
CREATE POLICY org_registration_insert ON identity.organization_registrations FOR INSERT WITH CHECK (
  identity.in_registration_bootstrap()
);

-- ── UPDATE: THE DECISION, AND ONLY A PLATFORM ADMIN MAKES IT ───────────────
-- 🔴 THE REGISTRANT MUST NOT BE ABLE TO APPROVE THEMSELVES. That is the entire
-- security content of this table, so the policy is admin-only on BOTH sides —
-- `USING` decides which rows are visible to update, `WITH CHECK` decides what
-- they may become, and Postgres does NOT reuse one for the other on UPDATE.
-- Omitting the second would let a row be updated INTO a shape the first would
-- never have selected.
DROP POLICY IF EXISTS org_registration_update ON identity.organization_registrations;
CREATE POLICY org_registration_update ON identity.organization_registrations FOR UPDATE
  USING (identity.is_platform_admin())
  WITH CHECK (identity.is_platform_admin());

COMMENT ON TABLE identity.organization_registrations IS
'The verification queue for SELF-registered workshops and parts suppliers. A '
'registrant may work inside their own organisation immediately; they do not '
'appear in the public registries (catalogue.mechanic_directory, '
'catalogue.suppliers) until a platform administrator approves. Only a platform '
'administrator may decide, enforced by the UPDATE policy on both USING and '
'WITH CHECK.';

-- ═══════════════════════════════════════════════════════════════════════════
-- BOTH REGISTRATION FUNCTIONS NOW QUEUE THEMSELVES.
--
-- ⚠️ `CREATE OR REPLACE`, AND 037 / 068 ARE NOT EDITED. `run.sh` checksums
-- every applied migration precisely so live schema cannot drift from history;
-- editing an applied file makes it disagree with its recorded checksum and
-- blocks every later migration. The bodies below are 037's and 068's, unchanged
-- except for the one INSERT each — reproduced in full because that is what
-- `CREATE OR REPLACE` requires, not because anything else changed.
--
-- 🔴 THE RETURN SIGNATURES ARE IDENTICAL TO THE ORIGINALS. `CREATE OR REPLACE
-- FUNCTION` cannot change a return type; attempting it fails with "cannot
-- change return type of existing function", which is the good outcome. What it
-- CAN do silently is change behaviour, so the diff against 037 and 068 is
-- exactly one statement in each.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION identity.register_workshop(
    p_subject       TEXT,
    p_workshop_name TEXT,
    p_branch_name   TEXT
)
RETURNS TABLE (
    tenant_id       uuid,
    organization_id uuid,
    branch_id       uuid,
    membership_id   uuid
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
    IF p_workshop_name IS NULL OR btrim(p_workshop_name) = '' THEN
        RAISE EXCEPTION 'a workshop needs a name';
    END IF;

    SELECT id INTO v_user
      FROM identity.users
     WHERE keycloak_subject = p_subject
       AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no active application user for this identity';
    END IF;

    PERFORM set_config('app.bootstrap',      'on',          true);
    PERFORM set_config('app.bootstrap_user', v_user::text,  true);

    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        RAISE EXCEPTION 'this account already belongs to an organisation';
    END IF;

    v_slug := regexp_replace(lower(btrim(p_workshop_name)), '[^a-z0-9]+', '-', 'g');
    v_slug := btrim(v_slug, '-');
    IF v_slug = '' THEN
        v_slug := 'workshop';
    END IF;
    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    v_tenant := gen_random_uuid();
    v_org    := gen_random_uuid();
    v_branch := gen_random_uuid();
    v_member := gen_random_uuid();

    INSERT INTO identity.tenants (id, name, slug, status, created_by)
    VALUES (v_tenant, btrim(p_workshop_name), v_slug, 'active', v_user);

    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
    VALUES (v_org, v_tenant, btrim(p_workshop_name), 'individual_workshop', 'active', v_user);

    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
    VALUES (v_branch, v_tenant, v_org,
            COALESCE(NULLIF(btrim(p_branch_name), ''), 'Main branch'),
            'active', v_user);

    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'workshop_owner', 'active', v_user);

    -- ── THE ONLY CHANGE FROM 037 ───────────────────────────────────────────
    -- Queued for verification, inside the SAME transaction that creates the
    -- workshop. A registration written afterwards on a separate connection
    -- could survive a rolled-back sign-up and describe a workshop that does not
    -- exist — or be lost, leaving a workshop nobody is ever asked to verify.
    INSERT INTO identity.organization_registrations
        (tenant_id, organization_id, kind, status, submitted_by)
    VALUES (v_tenant, v_org, 'workshop', 'pending', v_user);

    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

CREATE OR REPLACE FUNCTION identity.register_supplier(
    p_subject        TEXT,
    p_supplier_name  TEXT,
    p_location_name  TEXT
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
    IF p_supplier_name IS NULL OR btrim(p_supplier_name) = '' THEN
        RAISE EXCEPTION 'a supplier needs a name';
    END IF;

    SELECT id INTO v_user
      FROM identity.users
     WHERE keycloak_subject = p_subject
       AND status = 'active';

    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no active application user for this identity';
    END IF;

    PERFORM set_config('app.bootstrap',      'on',         true);
    PERFORM set_config('app.bootstrap_user', v_user::text, true);

    IF EXISTS (SELECT 1 FROM identity.memberships
                WHERE user_id = v_user AND status = 'active') THEN
        PERFORM set_config('app.bootstrap',      '', true);
        PERFORM set_config('app.bootstrap_user', '', true);
        RAISE EXCEPTION 'this account already belongs to an organisation. Sign in with a different account to register a supplier, or ask a platform administrator to add you to an existing supplier.';
    END IF;

    v_slug := regexp_replace(lower(btrim(p_supplier_name)), '[^a-z0-9]+', '-', 'g');
    v_slug := btrim(v_slug, '-');
    IF v_slug = '' THEN
        v_slug := 'supplier';
    END IF;
    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    v_tenant := gen_random_uuid();
    v_org    := gen_random_uuid();
    v_branch := gen_random_uuid();
    v_member := gen_random_uuid();

    INSERT INTO identity.tenants (id, name, slug, status, created_by)
    VALUES (v_tenant, btrim(p_supplier_name), v_slug, 'active', v_user);

    INSERT INTO identity.organizations (id, tenant_id, name, org_type, status, created_by)
    VALUES (v_org, v_tenant, btrim(p_supplier_name), 'parts_supplier', 'active', v_user);

    INSERT INTO identity.branches (id, tenant_id, organization_id, name, status, created_by)
    VALUES (v_branch, v_tenant, v_org,
            COALESCE(NULLIF(btrim(p_location_name), ''), 'Main location'),
            'active', v_user);

    INSERT INTO identity.memberships
        (id, tenant_id, organization_id, branch_id, user_id, role_name, status, created_by)
    VALUES (v_member, v_tenant, v_org, v_branch, v_user, 'supplier_owner', 'active', v_user);

    -- ── THE ONLY CHANGE FROM 068 ───────────────────────────────────────────
    INSERT INTO identity.organization_registrations
        (tenant_id, organization_id, kind, status, submitted_by)
    VALUES (v_tenant, v_org, 'supplier', 'pending', v_user);

    PERFORM set_config('app.bootstrap',      '', true);
    PERFORM set_config('app.bootstrap_user', '', true);

    RETURN QUERY SELECT v_tenant, v_org, v_branch, v_member;
END;
$$;

-- ── PROVE THE REPLACEMENTS ARE STILL WHAT THE DOOR EXPECTS ─────────────────
--
-- 🔴 `CREATE OR REPLACE` PRESERVES THE OWNER, so `in_registration_bootstrap()`
-- — which pins the door to the owner of `register_workshop(text,text,text)` —
-- still admits both. Verified rather than assumed, because if it were ever
-- false, both functions would fail at RUNTIME on a real sign-up while this
-- migration reported success.
DO $$
DECLARE
    v_workshop_owner text;
    v_supplier_owner text;
BEGIN
    SELECT r.rolname INTO v_workshop_owner
      FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
     WHERE p.oid = 'identity.register_workshop(text,text,text)'::regprocedure;
    SELECT r.rolname INTO v_supplier_owner
      FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
     WHERE p.oid = 'identity.register_supplier(text,text,text)'::regprocedure;

    IF v_workshop_owner IS DISTINCT FROM v_supplier_owner THEN
        RAISE EXCEPTION
            'register_supplier is owned by % but register_workshop by %; the '
            'bootstrap door would refuse one of them at runtime. Nothing applied.',
            v_supplier_owner, v_workshop_owner;
    END IF;

    IF NOT (SELECT bool_and(p.prosecdef) FROM pg_proc p
             WHERE p.oid IN ('identity.register_workshop(text,text,text)'::regprocedure,
                             'identity.register_supplier(text,text,text)'::regprocedure)) THEN
        RAISE EXCEPTION 'a registration function lost SECURITY DEFINER. Nothing applied.';
    END IF;
END $$;

COMMIT;
