-- 087 — slice 19: the fleet data layer, and the cross-tenant contract it needs
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE DESIGN IS ADR-023. READ IT BEFORE CHANGING ANYTHING BELOW.
-- `docs/02-architecture/adr/ADR-023-FLEET-CROSS-TENANT-SERVICE-CONTRACT.md`
--
-- Measured before writing a line: no `fleet` schema, no `fleet` API module,
-- **1 of 29 fleet screens working (3%)**, and 075/076 built the registration
-- door and nothing else. A fleet can register, sign in, and reach one dashboard.
--
-- 🔴 THE HARD PART IS THAT A FLEET IS ITS OWN TENANT.
-- `076_fleet_registration_race.sql:140` gives every fleet its own tenant and a
-- `fleet_operator` organisation. A fleet asking an INDEPENDENT workshop to
-- service a van is therefore a CROSS-TENANT act, and this platform's whole
-- isolation model — `(x, tenant_id, organization_id)` keys, RLS on
-- `current_tenant_id()` — exists to make that impossible.
--
-- Get it wrong in either direction and you get a defect this repository has
-- already recorded four times in one day: model the request in the workshop's
-- tenant and the FLEET cannot see its own request; model it in the fleet's
-- tenant and the WORKSHOP cannot see the work it has been asked to do.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS fleet;
GRANT USAGE ON SCHEMA fleet TO autoworkshop_app;

COMMENT ON SCHEMA fleet IS
'The fleet operator workspace. Vehicle IDENTITY is NOT here — it lives in '
'core.vehicles (ADR-023 decision 1). What is here is what a fleet owns that a '
'workshop does not: its drivers, and its side of the service contract.';

-- ══════════════════════════════════════════════════════════════════════════
-- 1. THE KEY THAT MAKES A VEHICLE REFERENCE SAFE — ALREADY EXISTS.
--
-- The contract table below needs `core.vehicles (id, tenant_id,
-- organization_id)` to be unique, because referential integrity BYPASSES RLS
-- even under FORCE — recorded here as "RLS answers reachability for READS, not
-- REFERENCES". A plain `REFERENCES core.vehicles(id)` would let a request name
-- a vehicle belonging to a DIFFERENT organisation and the database would
-- accept it.
--
-- 🔴 THIS MIGRATION ORIGINALLY CREATED THAT KEY AND WAS WRONG TO. `074_towing`
-- already did, at its line 62, as a UNIQUE INDEX:
--
--     CREATE UNIQUE INDEX uq_vehicles_id_tenant_org
--       ON core.vehicles (id, tenant_id, organization_id)
--
-- The first draft asserted it was absent, having checked `pg_constraint` for
-- `contype IN ('u','p')` — which cannot see a bare unique INDEX. The apply
-- failed with "relation already exists" and the measurement was the thing that
-- was wrong, not the schema. A unique index is a valid FK target, so the
-- constraint below simply uses it.
--
-- ▶ AND IT IS CORROBORATION, NOT A COINCIDENCE. Towing needed the identical key
--   for the identical reason: towing REQUESTS reference `core.vehicles` while
--   `towing.recovery_vehicles` holds the operator's own tow trucks. That split
--   is exactly ADR-023 decision 1, arrived at independently one slice earlier.
-- ══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════
-- 2. DRIVERS — ordinary, tenant-scoped, no cross-tenant anything
--
-- Deliberately boring, and listed first so the interesting table below is not
-- read as the house pattern. A driver belongs to one fleet and is never
-- disclosed to a workshop: `fleet.service_requests` has no driver column, and
-- adding one would widen the disclosure boundary ADR-023 §3 draws.
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE fleet.drivers (
    id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        uuid NOT NULL REFERENCES identity.tenants(id),
    organization_id  uuid NOT NULL REFERENCES identity.organizations(id),

    -- TEXT throughout, never VARCHAR(n) — the Solar truncation lesson.
    full_name        TEXT NOT NULL,
    licence_number   TEXT,
    licence_expires_on date,
    phone            TEXT,
    email            TEXT,

    -- Linked to a platform user ONLY if the driver actually has an account.
    -- NULLABLE BY DESIGN: most drivers will never sign in, and a NOT NULL here
    -- would require creating an identity for every one of them.
    -- ⚠️ ONE COLUMN, NOT THREE. `identity.users` is PLATFORM-GLOBAL and has no
    -- tenant_id — recorded 2026-08-16 after a diagnostic assumed otherwise.
    user_id          uuid REFERENCES identity.users(id),

    status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'suspended', 'left')),

    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid REFERENCES identity.users(id),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid REFERENCES identity.users(id),

    CHECK (length(btrim(full_name)) > 0),
    CHECK (licence_number IS NULL OR length(btrim(licence_number)) > 0),
    -- The two-column FK that keeps a driver inside a real organisation of the
    -- named tenant. ADR-023 19c tier 2: "the organisation itself = 2 columns".
    CONSTRAINT fk_driver_org FOREIGN KEY (organization_id, tenant_id)
        REFERENCES identity.organizations (id, tenant_id)
);

CREATE INDEX idx_fleet_drivers_org ON fleet.drivers (organization_id, status);
-- ⚠️ `btrim` AND A BLANK GUARD. `upper(licence_number)` alone treats 'ABC123',
-- ' ABC123' and 'ABC123 ' as three different licences, and accepts '' as a
-- licence number. Codex, 2026-08-19.
CREATE UNIQUE INDEX uq_fleet_driver_licence_per_org
    ON fleet.drivers (organization_id, upper(btrim(licence_number)))
    WHERE licence_number IS NOT NULL AND btrim(licence_number) <> '';

-- ══════════════════════════════════════════════════════════════════════════
-- 3. 🔴 THE CONTRACT. THE ONLY TABLE IN THIS SCHEMA TWO ORGANISATIONS SEE.
--
-- ADR-023 decisions 2, 3 and 4 are all here. The short version:
--
--   · the FLEET side is keyed normally (tenant + organisation);
--   · the WORKSHOP is referenced through its PUBLIC DIRECTORY ROW, never
--     through `identity.organizations`;
--   · everything the workshop needs to READ is SNAPSHOTTED onto the row, so no
--     query ever joins from the workshop's session into the fleet's tenant.
--
-- ⚠️ WHY THE DIRECTORY AND NOT THE ORGANISATION. `catalogue.orders` already
-- does exactly this for buyer↔supplier (`supplier_id -> catalogue.suppliers`),
-- and `catalogue.mechanic_directory` is the workshop's equivalent: platform-
-- level, not tenant-scoped, `is_published` gated, one row per organisation
-- (`uq_directory_org`). Referencing it means a fleet can only address a
-- workshop that CHOSE to be listed — discoverability and addressability become
-- the same decision, made by the workshop, instead of a fleet naming any
-- organisation id it can obtain.
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE fleet.service_requests (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Human reference both parties quote. Generated by the service, not the
    -- database, so the format can change without a migration — the reason
    -- `catalogue.orders.order_number` gives.
    reference               TEXT NOT NULL UNIQUE,

    -- ── the fleet side ────────────────────────────────────────────────────
    fleet_tenant_id         uuid NOT NULL REFERENCES identity.tenants(id),
    fleet_organization_id   uuid NOT NULL REFERENCES identity.organizations(id),
    vehicle_id              uuid NOT NULL,

    -- ── the workshop side ─────────────────────────────────────────────────
    -- 🔴 ONE COLUMN, TO THE DIRECTORY. Not to identity.organizations.
    workshop_directory_id   uuid NOT NULL REFERENCES catalogue.mechanic_directory(id),

    -- 🔴 DENORMALISED FROM THE DIRECTORY, AND TRIGGER-MAINTAINED — NOT written
    -- by the service. This is the column the workshop-side RLS predicate reads,
    -- so if it were ever wrong the boundary itself would be wrong. 084's rule,
    -- applied to the most security-sensitive value in the slice: "a
    -- denormalised value the service is trusted to populate is one that will
    -- one day be missing or stale, and the failure is invisible".
    workshop_organization_id uuid NOT NULL,

    -- ── SNAPSHOTS: what crosses the tenant boundary ───────────────────────
    -- These exist so the workshop can read the request WITHOUT joining into the
    -- fleet's tenant. A join would return zero rows under FORCE RLS — 084's
    -- lesson, "a join silently re-imposes the strictest policy in the chain,
    -- and does it by returning fewer rows rather than by failing".
    --
    -- They are also correct on their own terms: a fleet re-registering a van
    -- must not rewrite the history of what a workshop was asked to work on.
    fleet_name              TEXT NOT NULL,
    workshop_name           TEXT NOT NULL,
    vehicle_registration    TEXT NOT NULL,
    vehicle_description     TEXT,

    -- ── what was asked ────────────────────────────────────────────────────
    request_type            TEXT NOT NULL
                            CHECK (request_type IN ('service','repair','inspection',
                                                    'diagnostic','tyres','bodywork','other')),
    summary                 TEXT NOT NULL,
    detail                  TEXT,
    -- The fleet's own view of urgency. Not an SLA — nothing here promises a
    -- response time, and a field that implies one the platform cannot enforce
    -- is a progress bar that lies.
    priority                TEXT NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('low','normal','high','vehicle_off_road')),
    preferred_date          date,
    odometer_km             integer CHECK (odometer_km IS NULL OR odometer_km >= 0),

    -- ── lifecycle ─────────────────────────────────────────────────────────
    -- 🔴 EVERY STATE HAS AN ACTOR WHO CAN OBSERVE IT. There is no
    -- `awaiting_parts`, no `quality_check`, no `ready_for_collection`: those are
    -- workshop-internal states that already live on the job card, in the
    -- workshop's own tenant. `catalogue.orders` states the rule — "a state we
    -- cannot set is a state that gets stuck".
    status                  TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','submitted','accepted','declined',
                                              'in_progress','completed','cancelled')),
    -- Free text from the workshop when it declines. The fleet's only way to
    -- learn why, so it is not optional in practice even though it is nullable.
    decline_reason          TEXT,

    submitted_at            timestamptz,
    responded_at            timestamptz,
    completed_at            timestamptz,

    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid REFERENCES identity.users(id),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    updated_by              uuid REFERENCES identity.users(id),

    CHECK (length(btrim(summary)) > 0),
    CHECK (length(btrim(vehicle_registration)) > 0),
    -- A declined request must say why. A refusal that does not explain itself is
    -- this repository's most expensive recorded defect class.
    CHECK (status <> 'declined' OR (decline_reason IS NOT NULL
                                    AND length(btrim(decline_reason)) > 0)),

    -- The fleet organisation must be real and in the named tenant (tier 2).
    CONSTRAINT fk_request_fleet_org FOREIGN KEY (fleet_organization_id, fleet_tenant_id)
        REFERENCES identity.organizations (id, tenant_id),

    -- 🔴 THE VEHICLE MUST BELONG TO THE REQUESTING FLEET (tier 1, 3 columns).
    -- Referential integrity bypasses RLS even under FORCE, so without all three
    -- columns a fleet could name another organisation's vehicle id and the
    -- database would accept it.
    CONSTRAINT fk_request_vehicle_same_org
        FOREIGN KEY (vehicle_id, fleet_tenant_id, fleet_organization_id)
        REFERENCES core.vehicles (id, tenant_id, organization_id)
);

CREATE INDEX idx_fleet_requests_fleet
    ON fleet.service_requests (fleet_organization_id, status, created_at DESC);
-- The workshop's inbox. A separate index because the two parties query this
-- table by completely different columns — that is what a shared contract means.
CREATE INDEX idx_fleet_requests_workshop
    ON fleet.service_requests (workshop_organization_id, status, created_at DESC);
CREATE INDEX idx_fleet_requests_vehicle ON fleet.service_requests (vehicle_id);

COMMENT ON TABLE fleet.service_requests IS
'The fleet<->workshop service contract (ADR-023). The ONLY table two '
'organisations both read. The workshop is referenced through its public '
'directory row, never through identity.organizations, and everything the '
'workshop needs is snapshotted so no query crosses the tenant boundary.';

-- ── the trigger that keeps the boundary column honest ─────────────────────
--
-- SECURITY DEFINER because it reads `catalogue.mechanic_directory`, and the
-- INSERTING session is a FLEET — which has no reason to hold read access to
-- the whole directory beyond the published rows it can already browse.
--
-- ⚠️ `search_path` PINNED. A definer function without one is the classic
-- privilege-escalation shape; every definer function in this database pins it.
CREATE OR REPLACE FUNCTION fleet.set_workshop_from_directory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, catalogue, pg_catalog, pg_temp
AS $fn$
DECLARE
    v_org  uuid;
    v_name TEXT;
    v_pub  boolean;
BEGIN
    SELECT d.organization_id, d.trading_name, d.is_published
      INTO v_org, v_name, v_pub
      FROM catalogue.mechanic_directory d
     WHERE d.id = NEW.workshop_directory_id;

    -- 🔴 ONE ANSWER FOR "NOT THERE" AND "NOT PUBLISHED", AND THE REASON IS
    -- PRODUCTION BEHAVIOUR, NOT TIDINESS.
    --
    -- This function is SECURITY DEFINER, so it runs as the table owner — and on
    -- Render that owner is NOT a superuser, so FORCE RLS binds it.
    -- `catalogue.mechanic_directory`'s only broadly-applicable policy is
    -- `public_read USING (is_published)`, which means an UNPUBLISHED row is
    -- invisible to this lookup on production while being perfectly visible
    -- locally, where the owner is a superuser.
    --
    -- The first version raised `foreign_key_violation` for "no row" and
    -- `check_violation` for "not published". Locally that produced the second;
    -- on Render the same input would have produced the FIRST, and `verify/087`
    -- accepted only `check_violation` — a check that would have passed here and
    -- behaved differently in production. Codex caught it, 2026-08-19.
    --
    -- Collapsing them is also better information hygiene: a fleet has no
    -- business learning that an unpublished workshop exists.
    IF v_org IS NULL OR NOT coalesce(v_pub, false) THEN
        RAISE EXCEPTION 'that workshop is not currently accepting requests through the directory; choose another from the published list'
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.workshop_organization_id := v_org;
    NEW.workshop_name            := v_name;

    -- 🔴 A FLEET MUST NOT BE ABLE TO ADDRESS ITSELF. Without this a fleet that
    -- also held a directory row could raise requests into its own inbox, and
    -- both RLS predicates would match the same row — which is not a leak but is
    -- a nonsense state that the lifecycle has no way out of.
    IF NEW.workshop_organization_id = NEW.fleet_organization_id THEN
        RAISE EXCEPTION 'a fleet cannot raise a service request with itself'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$fn$;

--:warning: `UPDATE OF` LISTS BOTH COLUMNS. Naming only `workshop_directory_id`
-- meant an UPDATE touching `workshop_organization_id` alone never fired this
-- trigger, so the column the RLS predicate reads was "trigger-maintained" only
-- for the paths somebody remembered. Not exploitable by `autoworkshop_app`,
-- whose column grant excludes both — but any future grant would silently
-- desynchronise the boundary from the directory. Codex, 2026-08-19.
CREATE TRIGGER trg_set_workshop_from_directory
    BEFORE INSERT OR UPDATE OF workshop_directory_id, workshop_organization_id
    ON fleet.service_requests
    FOR EACH ROW EXECUTE FUNCTION fleet.set_workshop_from_directory();

-- ══════════════════════════════════════════════════════════════════════════
-- 🔴 THE LIFECYCLE, ENFORCED BY THE DATABASE — AND WHY THE FIRST DRAFT'S
-- "ENFORCED IN THE SERVICE LAYER" WAS NOT GOOD ENOUGH.
--
-- Codex, 2026-08-19, on the first version of this migration:
--
--   · "Either party can perform the other party's lifecycle and content
--      updates." Both sides connect as `autoworkshop_app`, so the column GRANT
--      is the UNION of what either may change. RLS cannot tell them apart. A
--      fleet could set `status = 'accepted'` and fabricate `responded_at`; a
--      workshop could rewrite the fleet's `summary`, `priority` and `odometer`.
--   · "The claimed lifecycle is only an enum, not a lifecycle." `CHECK (status
--      IN (...))` permits `completed -> draft`, `cancelled -> accepted`, and an
--      INSERT straight to `completed`. ADR-023 described a lifecycle the schema
--      did not implement — a comment asserting a rule that does not exist,
--      which this repository treats as a defect in its own right.
--
-- Both were correct. "Service-layer validation is not a reliable database
-- security boundary, especially for the only cross-tenant shared table."
--
-- ── WHY A TRIGGER RATHER THAN DEFINER FUNCTIONS ──────────────────────────
--
-- Codex proposed party-specific SECURITY DEFINER write functions with direct
-- UPDATE revoked. That works, and it is heavier than it needs to be here:
-- the missing ingredient is not privilege, it is IDENTITY — and the database
-- already has it. `identity.current_organization_id()` says which party is
-- acting and the row names both, so a trigger can decide, for every UPDATE,
-- WHO is calling and WHETHER THIS MOVE IS THEIRS TO MAKE — without a second
-- API surface for the service layer to drift from.
--
-- ⚠️ NOT SECURITY DEFINER, DELIBERATELY. It reads only the row and the session
-- context, never another table, so it needs no privilege beyond the caller's.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fleet.enforce_request_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_actor TEXT;
    v_ok    boolean := false;
BEGIN
    -- Which party is this? The platform administrator is a third actor and is
    -- deliberately unconstrained: support has to be able to correct a stuck
    -- contract, and that is what the audit log is for.
    IF identity.is_platform_admin() THEN
        v_actor := 'platform';
    ELSIF identity.current_organization_id() = NEW.fleet_organization_id THEN
        v_actor := 'fleet';
    ELSIF identity.current_organization_id() = NEW.workshop_organization_id THEN
        v_actor := 'workshop';
    ELSE
        -- Unreachable through RLS, which admits only these three. Belt and
        -- braces, because this trigger is what stands between the two tenants
        -- and must not assume the policy above it is intact.
        RAISE EXCEPTION 'only the fleet or the workshop named on a service request may change it'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- 🔴 A REQUEST IS BORN AT THE BEGINNING. Without this, an INSERT with
        -- status = completed fabricates a finished job no workshop ever saw.
        IF NEW.status NOT IN ('draft', 'submitted') THEN
            RAISE EXCEPTION 'a new service request starts as draft or submitted, not %', NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
        IF v_actor NOT IN ('fleet', 'platform') THEN
            RAISE EXCEPTION 'only the fleet may raise a service request'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN NEW;
    END IF;

    IF v_actor = 'platform' THEN
        RETURN NEW;
    END IF;

    -- ── the parties, the vehicle and the reference never change ───────────
    -- These identify the contract. A row whose counterparty can be edited is
    -- not a contract — and `workshop_organization_id` is what the workshop-side
    -- RLS predicate reads, so moving it would move the boundary itself.
    IF NEW.fleet_tenant_id          IS DISTINCT FROM OLD.fleet_tenant_id
    OR NEW.fleet_organization_id    IS DISTINCT FROM OLD.fleet_organization_id
    OR NEW.workshop_directory_id    IS DISTINCT FROM OLD.workshop_directory_id
    OR NEW.workshop_organization_id IS DISTINCT FROM OLD.workshop_organization_id
    OR NEW.vehicle_id               IS DISTINCT FROM OLD.vehicle_id
    OR NEW.reference                IS DISTINCT FROM OLD.reference THEN
        RAISE EXCEPTION 'the parties, the vehicle and the reference of a service request are immutable'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── the snapshots never change ────────────────────────────────────────
    -- They record what was advertised and asked AT THE TIME. The reason
    -- catalogue.orders gives for supplier_name: a rename must not silently
    -- rewrite a placed order.
    IF NEW.fleet_name           IS DISTINCT FROM OLD.fleet_name
    OR NEW.workshop_name        IS DISTINCT FROM OLD.workshop_name
    OR NEW.vehicle_registration IS DISTINCT FROM OLD.vehicle_registration THEN
        RAISE EXCEPTION 'the snapshots on a service request are immutable'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── what was ASKED belongs to the fleet, and only until it is answered ─
    IF NEW.summary        IS DISTINCT FROM OLD.summary
    OR NEW.detail         IS DISTINCT FROM OLD.detail
    OR NEW.priority       IS DISTINCT FROM OLD.priority
    OR NEW.preferred_date IS DISTINCT FROM OLD.preferred_date
    OR NEW.odometer_km    IS DISTINCT FROM OLD.odometer_km
    OR NEW.request_type   IS DISTINCT FROM OLD.request_type THEN
        IF v_actor <> 'fleet' THEN
            RAISE EXCEPTION 'a workshop may respond to a request but may not rewrite what was asked'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF OLD.status NOT IN ('draft', 'submitted') THEN
            RAISE EXCEPTION 'this request has already been answered; raise a new one rather than changing it'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- ── the status transitions, per party ─────────────────────────────────
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF v_actor = 'fleet' THEN
            -- The fleet submits, and may withdraw until work starts. It can
            -- never accept, decline or complete on the workshop's behalf.
            v_ok := (OLD.status = 'draft'     AND NEW.status IN ('submitted','cancelled'))
                 OR (OLD.status = 'submitted' AND NEW.status = 'cancelled')
                 OR (OLD.status = 'accepted'  AND NEW.status = 'cancelled');
        ELSE
            -- The workshop answers. It can never submit or cancel for the fleet.
            v_ok := (OLD.status = 'submitted'   AND NEW.status IN ('accepted','declined'))
                 OR (OLD.status = 'accepted'    AND NEW.status = 'in_progress')
                 OR (OLD.status = 'in_progress' AND NEW.status = 'completed');
        END IF;

        IF NOT v_ok THEN
            RAISE EXCEPTION 'the % cannot move a service request from % to %',
                            v_actor, OLD.status, NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- ── timestamps are the database's, not the caller's ───────────────────
    -- 🔴 OTHERWISE EITHER PARTY FABRICATES THE HISTORY. Codex listed exactly
    -- this. They are derived from the transition that just happened, so a
    -- caller-supplied value is ignored rather than validated.
    NEW.submitted_at := CASE WHEN OLD.status = 'draft' AND NEW.status = 'submitted'
                             THEN now() ELSE OLD.submitted_at END;
    NEW.responded_at := CASE WHEN OLD.status = 'submitted'
                              AND NEW.status IN ('accepted','declined')
                             THEN now() ELSE OLD.responded_at END;
    NEW.completed_at := CASE WHEN NEW.status = 'completed' AND OLD.status <> 'completed'
                             THEN now() ELSE OLD.completed_at END;

    -- A decline reason belongs to the decline. Clearing it would leave a
    -- declined request with no explanation, which the table CHECK forbids.
    IF NEW.status <> 'declined' AND OLD.status = 'declined' THEN
        NEW.decline_reason := OLD.decline_reason;
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_enforce_request_lifecycle
    BEFORE INSERT OR UPDATE ON fleet.service_requests
    FOR EACH ROW EXECUTE FUNCTION fleet.enforce_request_lifecycle();

CREATE OR REPLACE FUNCTION fleet.touch_row()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_touch_service_request
    BEFORE UPDATE ON fleet.service_requests
    FOR EACH ROW EXECUTE FUNCTION fleet.touch_row();
CREATE TRIGGER trg_touch_driver
    BEFORE UPDATE ON fleet.drivers
    FOR EACH ROW EXECUTE FUNCTION fleet.touch_row();

-- ══════════════════════════════════════════════════════════════════════════
-- 4. ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE fleet.drivers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet.drivers          FORCE  ROW LEVEL SECURITY;
ALTER TABLE fleet.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet.service_requests FORCE  ROW LEVEL SECURITY;

-- Drivers: the ordinary house pattern, organisation-scoped because a tenant can
-- hold more than one organisation (082's finding).
CREATE POLICY drivers_tenant_isolation ON fleet.drivers
    FOR ALL
    USING (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()))
    WITH CHECK (identity.is_platform_admin()
           OR (tenant_id = identity.current_tenant_id()
               AND organization_id = identity.current_organization_id()));

-- ── the contract: TWO parties, TWO predicates ─────────────────────────────
--
-- 🔴 THIS IS THE MOST SECURITY-SENSITIVE PAIR OF POLICIES IN THE SLICE, and
-- the workshop one deliberately does NOT match the house pattern.
--
-- The fleet is scoped by tenant AND organisation, as everything else is. The
-- workshop is scoped by ORGANISATION ALONE, with no tenant match — because the
-- two tenants genuinely differ and requiring a match would mean the workshop
-- could never see the request at all. That exception is the whole point of
-- ADR-023 and is why `verify/087` exercises it from three directions.
CREATE POLICY requests_fleet_side ON fleet.service_requests
    FOR ALL
    USING (fleet_tenant_id = identity.current_tenant_id()
           AND fleet_organization_id = identity.current_organization_id())
    WITH CHECK (fleet_tenant_id = identity.current_tenant_id()
           AND fleet_organization_id = identity.current_organization_id());

-- ⚠️ SELECT AND UPDATE ONLY — NEVER INSERT. A workshop must not be able to
-- manufacture a request addressed to itself from a fleet that never asked. The
-- fleet-side policy above is the only route in, and the GRANTs below narrow the
-- UPDATE to the columns a workshop may actually change.
CREATE POLICY requests_workshop_read ON fleet.service_requests
    FOR SELECT
    USING (workshop_organization_id = identity.current_organization_id());

CREATE POLICY requests_workshop_respond ON fleet.service_requests
    FOR UPDATE
    USING (workshop_organization_id = identity.current_organization_id())
    -- The same predicate on the NEW row, so a workshop cannot hand a request to
    -- a different organisation. A USING-only policy permits exactly that.
    WITH CHECK (workshop_organization_id = identity.current_organization_id());

CREATE POLICY requests_admin ON fleet.service_requests
    FOR ALL
    USING (identity.is_platform_admin())
    WITH CHECK (identity.is_platform_admin());

-- ══════════════════════════════════════════════════════════════════════════
-- 5. GRANTS — the other half of the control
--
-- 🔴 THE LESSON OF MIGRATION 086, APPLIED BEFORE IT COSTS ANYTHING THIS TIME.
-- An RLS policy constrains the columns it NAMES and is indifferent to the rest
-- of the row. On 086 a table-wide UPDATE grant let an insurer rewrite the
-- shopper's own e-mail and the quoted premium, past a policy that looked
-- correct. Reproduced against the database, then narrowed.
--
-- Here the same question is asked first: what does the GRANT permit that the
-- policy does not mention? The workshop's policy says WHICH ROWS it may update;
-- only the column grant says WHICH FIELDS. Without it a workshop could rewrite
-- the summary, the registration, the priority — the fleet's own words.
-- ══════════════════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE ON fleet.drivers TO autoworkshop_app;

GRANT SELECT, INSERT ON fleet.service_requests TO autoworkshop_app;
-- The union of what EITHER party may change. Which of them may change which is
-- enforced in the service layer and asserted in `fleet.integration.spec.ts` —
-- column privileges cannot be granted per-policy, and that limit is stated here
-- rather than left for a reader to discover.
GRANT UPDATE (status, decline_reason, responded_at, completed_at,
              summary, detail, priority, preferred_date, odometer_km,
              updated_at, updated_by)
    ON fleet.service_requests TO autoworkshop_app;

COMMIT;
