-- 058 — the customer's Request for Service, addressed to a workshop they CHOOSE
--
-- ══════════════════════════════════════════════════════════════════════════
-- The owner's value chain, 2026-08-06, step 4-7: the customer searches the
-- public mechanic directory, "clicks on link of his prefered and click on
-- request for service a page opens and he file a his complain his car details
-- and his problems and submit, he does this after loging in. when his reques
-- submitted his form is received at the reception".
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── 🔴 WHY THIS IS NOT A JOB CARD ─────────────────────────────────────────
--
-- `POST /job-cards` already exists and a customer may already call it. It was
-- the obvious place to put this and it is the wrong one, for two reasons that
-- only appear once the owner's flow is followed literally:
--
--   1. A JOB CARD BELONGS TO A WORKSHOP THAT HAS ACCEPTED THE WORK. It carries
--      a stage, a technician, a bay. Creating one from a stranger's web form
--      would put unaccepted work on the workshop's staging board, and the
--      workshop would have no way to decline it that was not a lie about the
--      repair lifecycle.
--   2. A JOB CARD NEEDS A REGISTERED VEHICLE (`vehicleId` is required). The
--      owner's flow has the customer typing "his car details" as free text at a
--      workshop that has never heard of them, and an AI agent at RECEPTION
--      registering the customer and the vehicle from that form afterwards. The
--      vehicle does not exist yet at submission time. That is the whole point
--      of the step.
--
-- So this is the INTAKE record that precedes a job card. Reception converts it;
-- `converted_job_card_id` is the audit trail of that decision.
--
-- ── 🔴 THE ORGANISATION IS THE TARGET, NOT THE AUTHOR'S ───────────────────
--
-- Every other table in this schema reads `organization_id =
-- identity.current_organization_id()` — the row belongs to the org you are
-- acting in. THIS TABLE IS THE EXCEPTION, deliberately: the customer picks a
-- workshop from a PUBLIC directory and is, by construction, usually not a
-- member of it. A request that could only be addressed to your own organisation
-- would make the entire public mechanic search decorative.
--
-- ⚠️ THAT IS EXACTLY WHY THE POLICIES BELOW ARE WRITTEN OUT IN FULL rather than
-- copied from 056. Copying the org-equality policy here would have produced a
-- table that looks correct in review and refuses every insert the feature
-- exists to make. Read them before changing them.

BEGIN;

CREATE TABLE IF NOT EXISTS reception.service_requests (
    id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             uuid NOT NULL REFERENCES identity.tenants(id) ON DELETE RESTRICT,

    -- 🔴 THE WORKSHOP THE CUSTOMER CHOSE. Not the customer's own organisation.
    organization_id       uuid NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,

    -- WHO ASKED. Never taken from the form — the API sets it from the validated
    -- token subject. A client-supplied author would let anyone file a request in
    -- somebody else's name, and the workshop would ring the wrong person.
    requested_by          uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,

    -- The car, AS TYPED. Free text and nullable ids, because at this moment the
    -- vehicle may not be a record anywhere. Reception's agent turns these into a
    -- real vehicle row; until then they are what the customer told us.
    vehicle_id            uuid REFERENCES core.vehicles(id) ON DELETE SET NULL,
    vehicle_description   TEXT NOT NULL,
    registration_number   TEXT,

    -- The problem, in the customer's own words. This is the complaint that
    -- becomes the job card's complaint, so it is NOT trimmed to a summary here.
    complaint             TEXT NOT NULL,
    preferred_contact     TEXT,

    -- ⚠️ `new` IS THE ONLY STATE A CUSTOMER CAN CREATE. Everything else is a
    -- reception decision, and `declined` is a real outcome rather than a
    -- deletion — a workshop that turns work away should leave a trace, both for
    -- the customer's own history and so "we never heard from you" is checkable.
    status                TEXT NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new', 'accepted', 'declined', 'converted')),
    decline_reason        TEXT,

    -- Set when reception turns this into real work. The audit trail of the
    -- conversion, and what stops the same request being worked twice.
    converted_job_card_id uuid,

    created_at            timestamptz NOT NULL DEFAULT now(),
    decided_by            uuid REFERENCES identity.users(id) ON DELETE SET NULL,
    decided_at            timestamptz,

    -- A decision without a decider, or a decider without a time, is a row that
    -- cannot be audited. Refuse the half-state rather than discover it later.
    CONSTRAINT ck_service_request_decided
      CHECK ((decided_by IS NULL) = (decided_at IS NULL)),

    -- `converted` is the ONLY status that may carry a job card, and it must.
    CONSTRAINT ck_service_request_converted
      CHECK ((status = 'converted') = (converted_job_card_id IS NOT NULL)),

    -- A decline must say why. "Declined" with no reason is the message the
    -- customer receives, and it is not an answer.
    CONSTRAINT ck_service_request_declined
      CHECK (status <> 'declined' OR decline_reason IS NOT NULL)
);

-- Reception's inbox: the workshop's own new requests, newest first.
CREATE INDEX IF NOT EXISTS idx_service_request_org_status
    ON reception.service_requests (organization_id, status, created_at DESC);
-- The customer's own list, across every workshop they have asked.
CREATE INDEX IF NOT EXISTS idx_service_request_requester
    ON reception.service_requests (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_request_tenant
    ON reception.service_requests (tenant_id);

ALTER TABLE reception.service_requests ENABLE ROW LEVEL SECURITY;
-- FORCE, because the app connects as the table owner on Render and an
-- un-FORCEd policy is inert for the owner — the defect that made every
-- enterprise policy in the Solar schema decorative for weeks.
ALTER TABLE reception.service_requests FORCE ROW LEVEL SECURITY;

-- ── SELECT: the workshop it was sent to, OR the customer who sent it ───────
--
-- Two audiences, one row, and neither may see the other's. A customer must
-- never read another customer's request even at the same workshop, which is why
-- the author branch is `requested_by = current_user_id()` and NOT merely
-- "belongs to my organisation" — a customer IS a member of the workshop's org,
-- so an org-only predicate would show them the workshop's entire inbox. That is
-- the exact shape of the 45-screen leak, one layer down.
DROP POLICY IF EXISTS service_request_select ON reception.service_requests;
CREATE POLICY service_request_select ON reception.service_requests FOR SELECT USING (
  identity.is_platform_admin()
  OR requested_by = identity.current_user_id()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      AND identity.current_role_name() <> 'customer')
);

-- ── INSERT: anyone signed in, for THEMSELVES, at any workshop ──────────────
--
-- `requested_by` is pinned to the caller. The organisation is deliberately NOT
-- constrained to the caller's own — see the header. `tenant_id` still is,
-- because the workshop and the request must sit in one tenant for every
-- downstream join to hold.
DROP POLICY IF EXISTS service_request_insert ON reception.service_requests;
CREATE POLICY service_request_insert ON reception.service_requests FOR INSERT WITH CHECK (
  identity.is_platform_admin()
  OR (requested_by = identity.current_user_id()
      AND tenant_id = identity.current_tenant_id()
      AND status = 'new')
);

-- ── UPDATE: the receiving workshop's STAFF only ────────────────────────────
--
-- A customer may not accept their own request, and `<> 'customer'` is what says
-- so. Without it a customer holding a membership in the workshop's org could
-- mark their own request `converted`.
DROP POLICY IF EXISTS service_request_update ON reception.service_requests;
CREATE POLICY service_request_update ON reception.service_requests FOR UPDATE USING (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      AND identity.current_role_name() <> 'customer')
) WITH CHECK (
  identity.is_platform_admin()
  OR (tenant_id = identity.current_tenant_id()
      AND organization_id = identity.current_organization_id()
      AND identity.current_role_name() <> 'customer')
);

-- No DELETE grant, and no DELETE policy. An intake record is append-only in
-- practice: `declined` is how a request goes away, so the customer can still
-- see what happened to it.
GRANT SELECT, INSERT, UPDATE ON reception.service_requests TO autoworkshop_app;

COMMIT;
